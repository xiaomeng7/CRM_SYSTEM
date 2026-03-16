# CRM 数据库 Migration 执行清单

部署或新建环境时，在 **002 基础域模型** 和 **003–016** 等已有迁移之后，按顺序执行以下 migration，避免漏跑导致功能报错（如 invoice overdue 依赖 021）。

**执行方式**：从项目根目录或 `apps/crm` 下，使用 `DATABASE_URL` 指向目标库。

---

## 自动化 / Quote / Opportunity 相关（建议顺序）

| 顺序 | 文件 | 说明 | 可选执行脚本 |
|------|------|------|----------------|
| 1 | `017_quotes_and_automation_audit.sql` | quotes 表、automation_audit_log | 手动执行 SQL 或封装脚本 |
| 2 | `018_contacts_phone_digits.sql` | contacts.phone_digits（Twilio 匹配） | 同上 |
| 3 | `019_quotes_followup_dates.sql` | followup_due_at、followup_state | 同上 |
| 4 | `020_opportunity_stage_automation.sql` | automation_audit_log 扩展（action_type, trigger_event 等） | 同上 |
| 5 | `021_invoice_overdue_automation.sql` | invoices.overdue_level、contacts.payment_risk | `node scripts/run-invoice-overdue-migration.js` |
| 5b | `027_invoices_servicem8_job_uuid.sql` | invoices.servicem8_job_uuid（job-derived 发票幂等） | `node scripts/run-invoices-job-uuid-migration.js` |
| 6 | `022_customer_scores.sql` | customer scoring 相关表/列 | 同上 |
| 7 | `023_jobs_crm_creation_source.sql` | jobs.source_opportunity_id、created_via | 同上 |
| 8 | `024_quotes_created_via.sql` | quotes.created_via | 同上 |
| 9 | `025_quote_accepted_automation.sql` | opportunities.probability、tasks.task_type | `node scripts/run-quote-accepted-automation-migration.js` |
| 10 | `026_automation_settings.sql` | Admin 自动化开关（如 invoice_overdue_enabled） | `node scripts/run-automation-settings-migration.js` |

---

## 部署检查项

- [ ] 002_domain_model.sql 已执行（opportunities, tasks, contacts, accounts, jobs, invoices 等）
- [ ] 003_servicem8_history.sql（jobs/invoices 等 ServiceM8 历史表）
- [ ] 004_sync_runs_and_last_synced.sql（同步审计）
- [ ] 016_opportunities_service_m8_fields.sql（service_m8_job_id, inspection_date）
- [ ] **021_invoice_overdue_automation.sql**（invoice overdue 自动化必需）
- [ ] **025_quote_accepted_automation.sql**（quote accepted 自动化、task_type 必需）
- [ ] **026_automation_settings.sql**（Admin 自动化控制开关，可选）

若未执行 021，`test-invoice-overdue.js` 与 `AUTO_INVOICE_OVERDUE_DAILY` 会报错：`column i.overdue_level does not exist`。

---

## 快速执行（当前仓库已有脚本）

```bash
cd apps/crm

# 021：invoice overdue
pnpm run db:invoice-overdue-migration
# 或: node scripts/run-invoice-overdue-migration.js

# 025：quote accepted automation
pnpm run db:quote-accepted-automation-migration
# 或: node scripts/run-quote-accepted-automation-migration.js

# 026：automation settings（Admin 开关）
pnpm run db:automation-settings-migration
# 或: node scripts/run-automation-settings-migration.js

# 027：invoices 支持从 job 派生（servicem8_job_uuid）
pnpm run db:invoices-job-uuid-migration
# 或: node scripts/run-invoices-job-uuid-migration.js
```

其余 017–020、022–024 若无单独脚本，可直接用 `psql` 或任意 SQL 客户端按文件名顺序执行 `apps/crm/database/*.sql`。
