# BHT Revenue OS — Internal CRM UI structure

Simple internal CRM for founder-operator use: speed and clarity over enterprise complexity.

## Tech

- **Served from:** `apps/crm` (Express). Static files in `apps/crm/public/`.
- **Stack:** Plain HTML + one CSS file (`css/admin.css`) + one shared script (`js/app.js`). No front-end framework.
- **Routes:** All pages are static files; nav active state is set in JS from `location.pathname`.

## Layout

- **Sidebar:** Fixed width; nav links to Dashboard, Leads, Opportunities, Contacts, Tasks.
- **Main:** Header bar + content area. Content uses cards and tables for consistency.

## Pages and routes

| Route | File | Purpose |
|-------|------|--------|
| `/` | `index.html` | Dashboard |
| `/leads.html` | `leads.html` | Lead list and actions |
| `/lead-detail.html` | `lead-detail.html` | Lead detail + timeline placeholder |
| `/opportunities.html` | `opportunities.html` | Opportunity list and actions |
| `/contacts.html` | `contacts.html` | Contact (customer) list and actions |
| `/tasks.html` | `tasks.html` | Tasks by overdue / today / upcoming |

---

## 1. Dashboard (`/`)

- **Purpose:** At-a-glance summary for daily ops.
- **Content:**
  - **Summary cards:** New leads (e.g. last 7d), Due tasks today, Open opportunities (count), Recent contacts imported.
  - **Table:** Recent activity (placeholder for leads, tasks, communications).
- **Actions:** None on this page; entry point to other sections.

---

## 2. Leads (`/leads.html`)

- **Purpose:** Manage leads; quick status and conversion.
- **Columns:** Name, Phone, Suburb, Source, Service type, Status, Created at, Recent activity.
- **Actions (per row):**
  - Update status
  - View details (→ lead detail page)
  - Convert to opportunity
  - Create task
- **Detail page:** `lead-detail.html` — key fields + **timeline** section (placeholder for future communications/events/tasks).

---

## 3. Opportunities (`/opportunities.html`)

- **Purpose:** Pipeline view by stage.
- **Columns:** Contact/Account, Stage, Service type, Updated at.
- **Actions (per row):**
  - Update stage
  - View linked entities (lead, inspection, report, etc.)

---

## 4. Contacts (`/contacts.html`)

- **Purpose:** Searchable list of imported customers (from API).
- **Columns:** Name, Phone, Email, Suburb, Tags, Linked account.
- **Search:** Input to filter list (client-side or future API).
- **Actions (per row):**
  - View details
  - Mark reactivation status

---

## 5. Tasks (`/tasks.html`)

- **Purpose:** Day-to-day task focus.
- **Sections:** Overdue | Today | Upcoming (each as a table or list).
- **Columns (per section):** Title, Due, Linked to (lead/opportunity).
- **Actions (per row):**
  - Mark complete
  - Reassign
  - Open linked lead/opportunity

---

## Detail pages and timeline

- **Lead detail** (`lead-detail.html`) includes a **timeline** block. Intended for:
  - Future: communications (calls, emails), events, and tasks linked to that lead.
- Other detail pages (contact, opportunity) can reuse the same timeline pattern when built.

---

## Components and conventions

- **Cards:** Summary metrics and compact detail blocks.
- **Tables:** List views; header row, hover state, action buttons in last column.
- **Buttons:** `.btn`, `.btn-sm`, `.btn-primary` for hierarchy.
- **Timeline:** `.timeline` + `.timeline-list`; left border and list items (time + description).

---

## Future growth

- **API wiring:** Replace placeholder rows with `fetch` to existing `apps/crm` APIs (`/api/leads`, `/api/opportunities`, `/api/customers`, `/api/jobs`).
- **Detail pages:** Add contact-detail and opportunity-detail with same layout + timeline.
- **Modals or inline forms:** For “update status”, “update stage”, “create task” without leaving the list.
- **Filters:** e.g. by status, stage, suburb, date range on list pages.
