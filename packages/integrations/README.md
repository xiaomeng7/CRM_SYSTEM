# @bht/integrations

External service adapters for BHT Revenue OS. **Transport and API wrappers only** — no CRM or business logic.

## Contents

- **servicem8-client.js** — ServiceM8 REST API client (companies, jobs).
- **sms-client.js** — Twilio SMS send and phone normalization.

## Usage

Used by `apps/crm` only. Do not import from `apps/web`.

```js
const { ServiceM8Client, sendSMS, normalizePhone } = require('@bht/integrations');
```

## Boundaries

- Add new adapters (e.g. email, other APIs) here.
- Keep logic to: auth, request/response, errors. No domain rules or workflow logic.
