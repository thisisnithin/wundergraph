---
title: Webhooks
pageTitle: WunderGraph - Webhooks
description:
---

The [`webhooks`](https://docs.wundergraph.com/docs/features/type-script-webhooks-to-integrate-third-party-applications) property allows you to configure your custom [webhooks](https://docs.wundergraph.com/docs/features/type-script-webhooks-to-integrate-third-party-applications). Currently, only the `verifier` option is supported.
The `verifier` define how the webhook is verified. Verification is handled by the gateway. Before a webhook can be configured you need to create one. See [webhooks feature](/docs/features/type-script-webhooks-to-integrate-third-party-applications) for more information.

```typescript
// wundergraph.server.ts
import {
  configureWunderGraphServer,
  CreateWebhookVerifier,
  EnvironmentVariable,
  GithubWebhookVerifier,
  WebhookVerifierKind,
} from '@wundergraph/sdk'
import type { HooksConfig } from './generated/wundergraph.hooks'
import type { WebhooksConfig } from './generated/wundergraph.webhooks'
import type { InternalClient } from './generated/wundergraph.internal.client'

export default configureWunderGraphServer<
  HooksConfig,
  InternalClient,
  WebhooksConfig
>(() => ({
  webhooks: {
    // Enable this if you configure this endpoint on Github.
    // Don't forget to set the environment variable before starting your WunderNode
    github: {
      verifier: GithubWebhookVerifier(new EnvironmentVariable('GITHUB_SECRET')),
    },
    // or generic
    github: {
      verifier: CreateWebhookVerifier({
        kind: WebhookVerifierKind.HMAC_SHA256,
        signatureHeaderPrefix: '',
        secret: new EnvironmentVariable('YOUR_SECRET'),
        signatureHeader: '',
      }),
    },
  },
}))
```
