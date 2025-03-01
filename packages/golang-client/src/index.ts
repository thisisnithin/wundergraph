import { Template, TemplateOutputFile } from '@wundergraph/sdk';
import { visitJSONSchema } from '@wundergraph/sdk/internal';
import { ResolvedWunderGraphConfig } from '@wundergraph/sdk';
import { hasInput } from '@wundergraph/sdk/dist/codegen/templates/typescript/react';
import { JSONSchema7 as JSONSchema, JSONSchema7 } from 'json-schema';
import { BaseTypeScriptDataModel } from '@wundergraph/sdk';
import execa from 'execa';
import _ from 'lodash';
import Handlebars from 'handlebars';
import { clientTemplate } from './client-template';
import { OperationType } from '@wundergraph/protobuf';

const golangHeader = (packageName: string) =>
	`// Code generated by wunderctl. DO NOT EDIT.\npackage ${packageName}\n\n`;

export interface GolangClientTemplateConfig {
	packageName: string;
}

const defaultTemplateConfig: GolangClientTemplateConfig = {
	packageName: 'client',
};

const gofmt = (code: string) => {
	try {
		// check if gofmt is installed
		const formatter = execa.sync('gofmt', {
			input: code,
			encoding: 'utf8',
		});
		if (formatter.exitCode === 0) {
			return formatter.stdout;
		}
	} catch (e: any) {
		// we silently ignore the error on purpose
		// It's not a must to prettify the code
		console.error('gofmt is not installed. If you want to prettify the generated code, please install gofmt');
	}
	return code;
};

export class GolangInputModels implements Template {
	constructor(config: GolangClientTemplateConfig = Object.assign({}, defaultTemplateConfig)) {
		this.config = config;
	}

	private readonly config: GolangClientTemplateConfig;

	async generate(config: ResolvedWunderGraphConfig): Promise<TemplateOutputFile[]> {
		const content = config.application.Operations.filter(hasInput)
			.map((op) => JSONSchemaToGolangStruct(op.VariablesSchema, op.Name + 'Input', false))
			.join('\n\n');
		return Promise.resolve([
			{
				path: 'models.go',
				content: gofmt(content),
				header: golangHeader(this.config.packageName),
			},
		]);
	}

	dependencies(): Template[] {
		return [new GolangModelsBase()];
	}
}

export class GolangResponseModels implements Template {
	constructor(config: GolangClientTemplateConfig = Object.assign({}, defaultTemplateConfig)) {
		this.config = config;
	}

	private readonly config: GolangClientTemplateConfig;

	generate(config: ResolvedWunderGraphConfig): Promise<TemplateOutputFile[]> {
		const content = config.application.Operations.map((op) => {
			const dataName = '#/definitions/' + op.Name + 'ResponseData';
			const responseSchema = JSON.parse(JSON.stringify(op.ResponseSchema)) as JSONSchema7;
			if (responseSchema.properties) {
				responseSchema.properties['data'] = {
					$ref: dataName,
				};
			}
			return JSONSchemaToGolangStruct(responseSchema, op.Name + 'Response', true);
		}).join('\n\n');
		return Promise.resolve([
			{
				path: 'models.go',
				content: gofmt(content),
				header: golangHeader(this.config.packageName),
			},
		]);
	}

	dependencies(): Template[] {
		return [new GolangModelsBase(), new GolangResponseDataModels(this.config), new GolangBaseDataModel(this.config)];
	}
}

export class GolangResponseDataModels implements Template {
	constructor(config: GolangClientTemplateConfig = Object.assign({}, defaultTemplateConfig)) {
		this.config = config;
	}

	private readonly config: GolangClientTemplateConfig;

	generate(config: ResolvedWunderGraphConfig): Promise<TemplateOutputFile[]> {
		const content = config.application.Operations.filter(
			(op) => op.ResponseSchema.properties !== undefined && op.ResponseSchema.properties['data'] !== undefined
		)
			.map((op) =>
				JSONSchemaToGolangStruct(op.ResponseSchema.properties!['data'] as JSONSchema7, op.Name + 'ResponseData', false)
			)
			.join('\n\n');
		return Promise.resolve([
			{
				path: 'models.go',
				content: gofmt(content),
				header: golangHeader(this.config.packageName),
			},
		]);
	}

	dependencies(): Template[] {
		return [new BaseTypeScriptDataModel()];
	}
}

export class GolangBaseDataModel implements Template {
	constructor(config: GolangClientTemplateConfig = Object.assign({}, defaultTemplateConfig)) {
		this.config = config;
	}

	private readonly config: GolangClientTemplateConfig;

	generate(config: ResolvedWunderGraphConfig): Promise<TemplateOutputFile[]> {
		const definitions: Map<string, JSONSchema7> = new Map();

		config.application.Operations.forEach((op) => {
			if (!op.VariablesSchema.definitions) {
				return;
			}
			Object.keys(op.VariablesSchema.definitions).forEach((definitionName) => {
				if (definitions.has(definitionName)) {
					return;
				}
				const definition = op.VariablesSchema.definitions![definitionName];
				if (typeof definition !== 'object') {
					return;
				}
				definitions.set(definitionName, definition);
			});
		});

		const content = Array.from(definitions.entries())
			.map(([definitionName, definition]) => JSONSchemaToGolangStruct(definition, definitionName, false))
			.join('\n\n');

		return Promise.resolve([
			{
				path: 'models.go',
				content: gofmt(content),
				header: golangHeader(this.config.packageName),
			},
		]);
	}
}

const golangModelsBase = `
type GraphQLError struct {
	Message string
	Path    []interface{}
}`;

export class GolangModelsBase implements Template {
	async generate(config: ResolvedWunderGraphConfig): Promise<TemplateOutputFile[]> {
		return Promise.resolve([
			{
				path: 'models.go',
				content: gofmt(golangModelsBase),
			},
		]);
	}
}

export class GolangClient implements Template {
	constructor(config: GolangClientTemplateConfig = Object.assign({}, defaultTemplateConfig)) {
		this.config = config;
	}

	private readonly config: GolangClientTemplateConfig;

	async generate(config: ResolvedWunderGraphConfig): Promise<TemplateOutputFile[]> {
		const tmpl = Handlebars.compile(clientTemplate);
		const content = tmpl({
			queries: config.application.Operations.filter((op) => op.OperationType === OperationType.QUERY).map((op) => ({
				name: op.Name,
				hasInput: hasInput(op),
			})),
			mutations: config.application.Operations.filter((op) => op.OperationType === OperationType.MUTATION).map(
				(op) => ({ name: op.Name, hasInput: hasInput(op) })
			),
			subscriptions: config.application.Operations.filter((op) => op.OperationType === OperationType.SUBSCRIPTION).map(
				(op) => ({ name: op.Name, hasInput: hasInput(op) })
			),
		});

		return Promise.resolve([
			{
				path: 'client.go',
				content: gofmt(content),
				header: golangHeader(this.config.packageName),
			},
		]);
	}
}

const JSONSchemaToGolangStruct = (schema: JSONSchema, structName: string, withErrors: boolean): string => {
	let out = '';
	const capitalize = (name: string) => _.capitalize(name.substring(0, 1)) + name.substring(1);
	const addJsonTag = (fieldName: string, isArray: boolean) => {
		if (isArray) {
			return;
		}
		out += ` \`json:"${fieldName},omitempty"\`\n`;
	};
	visitJSONSchema(schema, {
		root: {
			enter: () => {
				out += `type ${capitalize(structName)} struct {\n`;
			},
			leave: () => {
				if (withErrors) {
					out += `\terrors []GraphQLError \`json:"errors"\``;
				}
				out += '\n}\n';
			},
		},
		number: (name, isRequired, isArray) => {
			out += `\t${capitalize(name)} ${isArray ? '[]' : ''}${isRequired ? '' : '*'}float64`;
			addJsonTag(name, isArray);
		},
		array: {
			enter: (name, isRequired, isArray) => {
				out += `\t${capitalize(name)}`;
			},
			leave: (name, isRequired, isArray) => {
				if (name) {
					out += ` \`json:"${name},omitempty"\` `;
				}
			},
		},
		string: (name, isRequired, isArray, enumValues) => {
			out += `\t${capitalize(name)} ${isArray ? '[]' : ''}${isRequired ? '' : '*'}string `;
			addJsonTag(name, isArray);
		},
		object: {
			enter: (name, isRequired, isArray) => {
				out += `\t${capitalize(name)} ${isArray ? '[]' : ''}${isRequired ? '' : '*'}struct {\n`;
			},
			leave: (name, isRequired, isArray) => {
				if (isArray) {
					out += ' } ';
					return;
				}
				out += `\t}`;
				addJsonTag(name, isArray);
			},
		},
		boolean: (name, isRequired, isArray) => {
			out += `\t${capitalize(name)} ${isArray ? '[]' : ''}${isRequired ? '' : '*'}bool`;
			addJsonTag(name, isArray);
		},
		any: (name, isRequired, isArray) => {
			out += `\t${capitalize(name)} ${isArray ? '[]' : ''}${isRequired ? '' : '*'}interface{} `;
			addJsonTag(name, isArray);
		},
		customType: (name, typeName, isRequired, isArray) => {
			out += `\t${capitalize(name)} ${isArray ? '[]' : ''} ${isRequired ? '' : '*'}${capitalize(typeName)}`;
			addJsonTag(name, isArray);
		},
	});
	return out;
};

export const golangClient = {
	all: (config: GolangClientTemplateConfig = defaultTemplateConfig) => [
		new GolangInputModels(config),
		new GolangResponseModels(config),
		new GolangClient(config),
	],
};
