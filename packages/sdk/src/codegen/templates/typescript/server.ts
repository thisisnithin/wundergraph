import { doNotEditHeader, Template, TemplateOutputFile } from '../../index';
import { ResolvedWunderGraphConfig } from '../../../configure';
import Handlebars from 'handlebars';
import { formatTypeScript, TypeScriptInputModels, TypeScriptResponseModels } from './index';
import { template } from './server.template';
import { WunderGraphHooksPlugin } from './hooks';
import { WunderGraphInternalApiClient } from './internal.client';

export class WunderGraphServer implements Template {
	generate(config: ResolvedWunderGraphConfig): Promise<TemplateOutputFile[]> {
		const tmpl = Handlebars.compile(template);
		const content = tmpl({
			roleDefinitions: config.authentication.roles.map((role) => '"' + role + '"').join(' | '),
		});
		return Promise.resolve([
			{
				path: 'wundergraph.server.ts',
				content: formatTypeScript(content),
				header: doNotEditHeader,
			},
		]);
	}

	dependencies(): Template[] {
		return [new WunderGraphHooksPlugin(), new WunderGraphInternalApiClient()];
	}
}
