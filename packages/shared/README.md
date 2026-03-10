# @bht/shared

Shared types, utilities, constants, and schemas for BHT Revenue OS. **Domain-agnostic only** — no CRM or ServiceM8 logic.

## Contents

Currently a placeholder. Add when needed:

- Shared constants (e.g. channel names, status enums).
- Validation schemas (e.g. for API payloads).
- Small pure utilities used by both `apps/web` and `apps/crm`.

## Boundaries

- Do not depend on `@bht/integrations` or database.
- Do not add business rules; keep this package generic.
