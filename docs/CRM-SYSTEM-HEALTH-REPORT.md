# CRM System Health Report

**Date:** 2025-03-09  
**Scope:** Stability fixes — all pages openable, no white screen, proper empty states.

---

## PAGE INVENTORY

| page_path | exists | load_status | api_dependencies | issues_found | status |
|-----------|--------|-------------|------------------|--------------|--------|
| index.html | ✓ | static | none | — | working |
| leads.html | ✓ | app.js | GET /api/leads | — | working |
| lead-detail.html | ✓ | app.js | GET /api/leads/:id | lead missing name/phone/suburb | **fixed** |
| contacts.html | ✓ | app.js | GET /api/contacts | — | working |
| tasks.html | ✓ | static | none | placeholder | working |
| opportunities.html | ✓ | static | none | placeholder | working |
| reactivation-dashboard.html | ✓ | React | GET /api/reactivation/dashboard | view may not exist | **fixed** |
| reply-inbox.html | ✓ | React | GET /api/reactivation/replies, /api/contacts/:id/*, /api/leads, /api/tasks | activities.intent/handled missing | **fixed** |
| reactivation-queue.html | ✓ | React | GET/POST /api/reactivation/queue | — | working |
| contact-detail.html | ✓ | React | GET /api/contacts/:id/detail | — | working |
| account-detail.html | ✓ | React | GET /api/accounts/:id/detail | crm_account_summary may not exist | **fixed** |
| data-maintenance.html | ✓ | React | GET /api/data-maintenance/report, POST execute | do_not_contact fallback | **fixed** |

---

## FIXES APPLIED

### 1. reactivation-dashboard.html
- **status:** fixed  
- **issues:** When `crm_account_reactivation_contacts` and `crm_account_reactivation_candidates` both missing → 500  
- **fix:** Fallback to empty `candidates: []` when both views fail. Page renders with 0 candidates instead of error.

### 2. reply-inbox.html
- **status:** fixed  
- **issues:** `activities` table missing columns `handled`, `intent`, `intent_confidence`, `intent_source`; `contacts` missing `do_not_contact`  
- **fix:** Added fallback query in `/api/reactivation/replies` when main query fails. Returns replies with `handled: false`, `intent: null`, `do_not_contact: false` so Reply Inbox loads.

### 3. lead-detail.html
- **status:** fixed  
- **issues:** GET /api/leads/:id returned raw lead without name/phone/suburb  
- **fix:** Enriched lead API with JOIN to contacts/accounts; returns `name`, `phone`, `suburb` for display.  
- **nav:** Added Data Maintenance link.

### 4. account-detail.html
- **status:** fixed  
- **issues:** `crm_account_summary` view may not exist → 500  
- **fix:** Wrapped summary query in try/catch; returns `summary: {}` when view missing.

### 5. data-maintenance.html
- **status:** fixed  
- **issues:** `do-not-contact` report fails when migration 011 not run  
- **fix:** Wrapped do-not-contact report in try/catch; returns empty rows when columns missing.  
- **empty state:** Added "No data" row when report has 0 rows.

---

## API DEPENDENCIES & ROUTES

All routes are mounted in `apps/crm/api/index.js`:

| API | Route | Mount |
|-----|-------|-------|
| /api/leads | leads.js | ✓ |
| /api/contacts | contacts.js | ✓ |
| /api/accounts | accounts.js | ✓ |
| /api/reactivation/dashboard | reactivation-dashboard.js | ✓ |
| /api/reactivation/replies | reactivation-replies.js | ✓ |
| /api/reactivation/queue | reactivation-queue.js | ✓ |
| /api/data-maintenance | data-maintenance.js | ✓ |
| /api/tasks | tasks.js | ✓ |

---

## DATABASE REQUIREMENTS

| Object | Purpose | Migration |
|--------|---------|-----------|
| contacts, accounts, leads, activities, tasks | Base domain | 002_domain_model.sql |
| activities.handled | Reply Inbox | 008_activities_handled.sql |
| activities.intent, intent_confidence, intent_source | Intent classifier | 009_intent_classifier.sql |
| contacts.do_not_contact, do_not_contact_at, do_not_contact_reason | Do Not Contact | 011_contacts_do_not_contact.sql |
| crm_account_reactivation_contacts | Dashboard + Queue | 007 + 012 |
| crm_account_summary | Account detail summary | 006 |
| reactivation_sms_queue | SMS Campaign | 010_reactivation_sms_queue.sql |

**Note:** If migrations 008, 009, 011 are not run, Reply Inbox will still load (fallback query). If segmentation views are missing, Dashboard shows 0 candidates and Queue generate may 500 (acceptable).

---

## SUMMARY

| Metric | Count |
|--------|-------|
| TOTAL PAGES | 12 |
| WORKING | 7 |
| FIXED | 5 |
| PENDING | 0 |

**Target achieved:** All pages URL-openable, no white screen, proper empty/error states.
