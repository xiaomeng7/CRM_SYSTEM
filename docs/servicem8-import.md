# ServiceM8 → CRM Customer Import

> ⚠️ **Legacy / Deprecated**  
> 本文档和对应脚本 **apps/crm/scripts/import-servicem8-customers.js** 描述的是早期的一次性导入方式。该脚本会把 `company.name` 当作联系人名创建 `contacts`，已知会产生诸如 “Help Guide Job”、“Card xx1246”、“PAYPAL ...” 等脏联系人。  
> 现在它已被标记为 *LEGACY*，仅保留作历史参考，不应再用于正式客户同步或增量导入。  
> 正式路径请参见：`docs/servicem8-auto-sync.md`、`docs/servicem8-full-history-sync.md`、`docs/servicem8-sync-architecture.md`。

This document describes the legacy import script that brings existing ServiceM8 customers into the CRM domain model (accounts, contacts, external_links).

---

## Overview

The import script:

1. Fetches all companies from the ServiceM8 API
2. For each company, creates or updates an **Account** and a **Contact**
3. Stores the ServiceM8 → CRM mapping in **external_links** for future sync

ServiceM8 remains the source of truth for existing customers; the CRM holds a copy and the link.

---

## Field Mapping

| ServiceM8 (Company) | CRM |
|---------------------|-----|
| `name` / `company_name` | `accounts.name` |
| `address_1` + `address_suburb` + `address_post_code` | `accounts.address_line`, `accounts.suburb`, `accounts.postcode` |
| `name` / `contact_name` | `contacts.name` |
| `phone` / `phone_number` | `contacts.phone` |
| `email` | `contacts.email` |

Address is built from `address_1`, `address_2`, `address_suburb`, `address_post_code` (or equivalent field names). Contact name falls back to company name when no separate contact name exists.

---

## Deduplication Logic

### Accounts

1. **External link first:** Look up `external_links` for `system='servicem8'`, `external_entity_type='company'`, `external_id=<ServiceM8 UUID>`. If found, use that `entity_id` (account).
2. **Name + address:** If no external link, search accounts by `name` + `address_line` (case-insensitive, trimmed). If found, update that account and create the external link.
3. **Create:** If not found, create a new account and external link.

### Contacts

1. **Phone match:** Search contacts by phone (digits-only comparison). If found, update the contact and link to the account.
2. **Create:** If not found, create a new contact with `account_id` set.

Phone matching normalizes both sides to digits only, so `04 1234 5678` and `0412345678` match.

---

## External Links

Each imported account gets a row in `external_links`:

| Column | Value |
|--------|-------|
| `system` | `servicem8` |
| `external_entity_type` | `company` |
| `external_id` | ServiceM8 company UUID |
| `entity_type` | `account` |
| `entity_id` | CRM account UUID |

This supports future sync (e.g. detecting when a ServiceM8 company is updated and updating the CRM account).

---

## Running the Script (LEGACY ONLY — NOT RECOMMENDED)

### Normal run (writes to database)

```bash
# From repo root (legacy)
pnpm --filter @bht/crm import:servicem8:legacy

# Or from apps/crm (legacy)
node scripts/import-servicem8-customers.js
```

### Dry run (no database writes)

```bash
DRY_RUN=true pnpm --filter @bht/crm import:servicem8:legacy
# or
DRY_RUN=1 node scripts/import-servicem8-customers.js
```

Dry run fetches from ServiceM8 and logs what would be created/updated, but does not insert or update anything in the database.

---

## Required Environment

- `SERVICEM8_API_KEY` — ServiceM8 API key
- `DATABASE_URL` — PostgreSQL connection string (Neon or Railway)
- `DATABASE_SSL` — `true` for cloud PostgreSQL

---

## Logging

The script logs:

- Total companies processed
- New accounts created
- Existing accounts updated
- New contacts created
- Existing contacts updated
- Skipped (no UUID)
- Errors

Example:

```
Fetching companies from ServiceM8...
Fetched 42 companies.

--- Import complete ---
Total processed:     42
New accounts:        35
Updated accounts:    7
New contacts:        38
Updated contacts:    4
Skipped:             0
Errors:              0
```

---

## Assumptions

- One ServiceM8 Company → one Account + one Contact (primary contact).
- ServiceM8 Company has contact details (name, phone, email) at the company level.
- Phone is the primary identifier for contact deduplication; accounts use name + address.
- The script is idempotent: re-running updates existing records and does not create duplicates when external links exist.
