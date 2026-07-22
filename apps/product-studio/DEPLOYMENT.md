# Better Home Sales Studio deployment

Sales Studio is a separate private Railway service. It must not replace or share
the current CRM service configuration.

## First deployment boundary

- Deploy branch: `feat/product-studio-deploy-readiness`
- Railway config path: `/apps/product-studio/railway.toml`
- Database target: `neon_dev`
- Custom domain: not yet assigned
- ServiceM8 execution: disabled
- Authentication: one administrator using a signed, HttpOnly session cookie

## Required Railway variables

Copy the variable names from `.env.example` into the Sales Studio service. Store
all values as Railway secrets. Do not reuse the CRM root `DATABASE_URL`.

For the preview environment, configure:

- `PRODUCT_OS_DATABASE_ENV=neon_dev`
- `PRODUCT_OS_DEV_DATABASE_URL`
- `PRODUCT_OS_DEV_HOST_FINGERPRINT`
- `SALES_STUDIO_AUTH_MODE=database_users` (recommended) or
  `single_admin_password` (legacy single-user mode)
- `SALES_STUDIO_ADMIN_EMAIL`
- `SALES_STUDIO_ADMIN_PASSWORD`
- `SALES_STUDIO_SESSION_SECRET` (at least 32 random characters)
- `BETTER_HOME_HANDOFF_PROXY_ENABLED=false`

## Release gate

Railway uses `/api/live` as its process liveness check so temporary database or
catalog delays do not reject an otherwise healthy deployment. The application
is ready for sales use only when `/api/health` returns HTTP 200. Missing
database identity or authentication configuration returns HTTP 503 and Railway
must keep the previous healthy deployment.

Do not attach `sales.bhtechnology.com.au`, enable ServiceM8 execution, or select
the production Product OS database until the private Railway preview has been
reviewed and explicitly approved.
