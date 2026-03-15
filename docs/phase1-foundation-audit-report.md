# Phase 1 Foundation Audit Report

**CRM + ServiceM8 自动化系统 — Phase 1 基础审计**

- **审计日期**: 2025-03
- **目标**: 确认系统基础结构已就绪，可进入 Phase 2（CRM → ServiceM8 创建 Job / Quote）
- **范围**: 仅审计与分析，无代码修改

---

## 1. Phase 1 Readiness Score

**评分: 72 / 100**

| 维度 | 得分 | 说明 |
|------|------|------|
| Event System | 10/20 | 有 domain_events 与 automation_audit_log，但无统一 event bus；sync/webhook 未统一转化为 event |
| Opportunity Stage Engine | 16/20 | advanceOpportunityStage 与 stage_locked 已实现；存在 1 处直接 UPDATE stage（tasks 完成时） |
| Quote Lifecycle | 14/15 | 表结构完整，sync + webhook + follow-up 均有；followup_state 与 due 逻辑健全 |
| Contact Identity Resolution | 12/15 | phone_digits/phone_raw 存在，Twilio 匹配逻辑清晰；部分 contact 可能未 backfill digits |
| Automation Engine | 10/15 | 多套自动化并存（legacy engine + 独立脚本），无统一 rule engine；audit_log 存在 |
| Data Integrity | 8/10 | 主要外部 UUID 已存，company→account 用 external_links；contacts 无 servicem8_contact_uuid |
| Sync Architecture | 15/15 | 定时/手动/webhook 齐全，syncCompanies/Contacts/Jobs/Invoices + syncQuotes，idempotent |
| Task System | 7/10 | 表有 contact_id/opportunity_id/due_at/assigned_to/status/created_by；缺 related_type/related_id、task_type |

---

## 2. Module Status

| Module | Status | Notes |
|--------|--------|-------|
| **1. Event System** | ⚠️ Partial | 存在 `domain_events`（仅 lead/opportunity 类型）与 `automation_audit_log`（quote/invoice/stage/scoring 等）。无统一 event_type 枚举（如 job_created, quote_sent, invoice_overdue, sms_received）；sync 与 webhook 未先入 event 再分发，而是直接调 service。无统一 dispatcher。 |
| **2. Opportunity Stage Engine** | ✅ Good | `advanceOpportunityStage()` 在 `opportunityStageAutomation.js`，尊重 `stage_locked` 与 Won/Lost。Stage 枚举集中在 `lib/stage-constants.js`（new_inquiry, site_visit_booked, inspection_done, quote_sent, decision_pending, won, lost）。API `PATCH /opportunities/:id/stage` 经 `opportunities.updateStage()`。**风险**: `api/routes/tasks.js` 在 task 完成 outcome=not_interested 时直接 `UPDATE opportunities SET stage = 'lost'`，未检查 stage_locked、未走 advanceOpportunityStage。 |
| **3. Quote Lifecycle** | ✅ Good | `quotes` 表含 id, servicem8_quote_uuid, opportunity_id, account_id, contact_id, job_id, amount, status, sent_at, accepted_at, declined_at, followup_state, followup_due_at, followup_sent_at（019）。Quote sync 在 `quote-sync.js`（upsert 按 servicem8_quote_uuid），幂等。Webhook `POST /api/webhooks/servicem8/quote` 调用 `processQuoteEvent`。Quote follow-up 在 `quote-followup.js`，按 sent_at + 7d 扫描，写 task + audit。 |
| **4. Contact Identity Resolution** | ✅ Good | `contacts` 有 phone, phone_raw, phone_digits（018）。Twilio inbound 在 `webhooks.js` 中 `matchContactByInboundPhone(from)`：先归一化 digits，再按 phone_digits 或 legacy phone（regexp_replace）匹配，支持 0/61 双格式。`normalizePhoneDigits` 在 `lib/crm/cleaning/normalizePhone.js`。**风险**: 若未跑 backfill-contact-phone-digits，部分 contact 的 phone_digits 为空，仅靠 legacy phone 匹配，多号/格式不一致时可能错配或未匹配。 |
| **5. Automation Engine** | ⚠️ Partial | **Legacy**: `automation/automation-engine.js` 用 customers + triggers + communications，由 `run-automations.js` 每日跑。**现代**: quote-followup、invoice-overdue、customer-scoring、reactivation 各自独立脚本/服务，写 `automation_audit_log`。无统一“自动化入口”或 rule engine；调度分散（cron 脚本 + API 内 setInterval）。audit_log 有 event_type, entity_type, entity_id, source, payload，及 020 的 action_type, trigger_event, executed_at。 |
| **6. Data Integrity** | ✅ Good | jobs: `servicem8_job_uuid` UNIQUE；invoices: `servicem8_invoice_uuid` UNIQUE；quotes: `servicem8_quote_uuid` UNIQUE；job_materials: `servicem8_job_material_uuid` UNIQUE。Company→Account 用 `external_links`(system=servicem8, external_entity_type=company, external_id)。Sync 按 UUID 做 upsert，幂等。**缺失**: contacts 表无 servicem8_contact_uuid；contact 与 ServiceM8 的对应靠 account + 姓名/电话推断。 |
| **7. Sync Architecture** | ✅ Good | `AUTO_SYNC_SERVICEM8`、`AUTO_SYNC_INTERVAL_HOURS` 在 api/index.js。`syncAllFromServiceM8` 顺序: syncCompaniesFromServiceM8 → syncContactsFromServiceM8 → syncJobsFromServiceM8 → syncInvoicesFromServiceM8 → syncJobMaterialsFromServiceM8 → syncQuotesFromServiceM8。有 sync_runs 表、advisory lock、增量 since。手动: POST /api/admin/actions/sync-servicem8。Quote 有独立 sync + webhook。 |
| **8. Task System** | ⚠️ Partial | `tasks` 表: contact_id, lead_id, opportunity_id, inspection_id, title, due_at, status, assigned_to, created_by。**无** related_type/related_id 多态，**无** task_type 字段；类型靠 created_by（如 'invoice-overdue', 'quote-followup', 'twilio-webhook'）或 title 推断。支持 follow-up、automation、manual 创建。 |

---

## 3. Technical Risks

| 风险 | 严重程度 | 说明 |
|------|----------|------|
| Stage 更新分散 | 中 | tasks 完成且 outcome=not_interested 时直接 UPDATE opportunities SET stage='lost'，绕过 stage_locked 与 advanceOpportunityStage，可能与 manual override 冲突。 |
| 无统一 Event Bus | 中 | 各模块直接调 service，难以统一扩展“当 quote_sent / job_created / invoice_overdue 时”的后续动作；Phase 2 若需“创建 Job 后发 event”需在各处手写或引入 bus。 |
| Phone 匹配依赖 backfill | 中 | 未跑 backfill-contact-phone-digits 时，仅靠 phone 的 regexp 匹配；多号码、61/0 混用、空格格式差异可能造成漏匹配或误匹配。 |
| Automation 无统一入口 | 中 | 多套自动化（legacy engine、quote-followup、invoice-overdue、customer-scoring、reactivation）分散，无统一 rule 配置或优先级，运维与扩展成本高。 |
| Contacts 无 ServiceM8 contact UUID | 低 | CRM→ServiceM8 创建/更新 contact 时无法按 UUID 精确对应，需依赖 account + 姓名/电话匹配，存在歧义可能。 |
| Task 无 task_type / related_type | 低 | 报表或“仅查 follow-up 类任务”需按 created_by 或 title 过滤，易漏或与业务命名耦合。 |
| domain_events 与 automation_audit_log 双轨 | 低 | 领域事件（lead/opportunity）写 domain_events，自动化/审计写 automation_audit_log，消费方需知两处。 |

---

## 4. Required Fixes Before Phase 2

| Priority | Description | Estimated Effort |
|----------|-------------|------------------|
| **P0** | Task 完成“not_interested”时改为调用 `advanceOpportunityStage(oppId, 'quote_declined', …)` 或 `opportunities.updateStage()`，并尊重 `stage_locked`，避免直接 UPDATE stage。 | 0.5d |
| **P1** | 为 Phase 2 明确“CRM 创建 Job”的入口：是 API 直接调 ServiceM8，还是先写 CRM 再通过 event/sync 触发；若采用 event，需定义 job_created（或 equivalent）并至少写入 automation_audit_log 或 domain_events，便于后续扩展。 | 1d（设计+小改） |
| **P1** | 确保生产环境已跑 `backfill-contact-phone-digits`，并在 sync/import 路径中对新 contact 写入 phone_digits，保证 Twilio 入站匹配稳定。 | 0.5d |
| **P2** | 在 tasks 表增加 `task_type`（如 'follow_up' | 'automation' | 'manual'）或通过 created_by 约定枚举，便于 dashboard 与报表过滤。 | 0.5d |
| **P2** | 文档化“stage 唯一写入路径”：UI/API 仅通过 opportunities.updateStage；系统事件仅通过 advanceOpportunityStage；并移除或改写 tasks 中的直接 UPDATE stage。 | 0.25d |

---

## 5. Phase 2 Readiness

**结论: 可以开始开发「CRM → ServiceM8 Job Creation」，但需先完成 P0 并明确 Phase 2 架构（P1）。**

- **已具备**: ServiceM8 sync（含 jobs/invoices/quotes）、external_links（company↔account）、opportunity 与 job 的关联（service_m8_job_id）、quote 全生命周期、联系人匹配与 audit 能力。
- **建议**: Phase 2 实现“从 CRM 创建 ServiceM8 Job”时，要么 (A) 在 API 层直接调 ServiceM8 API 并写 CRM opportunity/job 关联 + 可选 event 日志，要么 (B) 引入轻量 event（如写 automation_audit_log event_type=job_created），再由单一 job-creation 服务消费并调 ServiceM8，便于后续扩展与审计。

---

## 6. Recommended Architecture Improvements

| 改进项 | 说明 |
|--------|------|
| **Event Bus（轻量）** | 定义统一 event_type 集合（job_created, quote_sent, quote_accepted, quote_declined, invoice_overdue, sms_received 等），sync 与 webhook 在关键节点写入 `automation_audit_log` 或统一 event 表，由少量 consumer 订阅，避免各业务线直接互相调用。 |
| **Automation Rule Engine** | 将 quote-followup、invoice-overdue、reactivation、customer-scoring 等抽象为“规则+条件+动作”，配置化（如 DB 或 config），由单一 scheduler 按规则扫描并执行，便于开关、优先级与审计。 |
| **API Service Layer** | 将“创建/更新 Opportunity、创建 Task、推进 Stage”封装为内部 service API，供 routes 与 automation 共用，减少重复逻辑与直接 SQL。 |
| **Contact 外部 ID** | 若 ServiceM8 提供 contact/technician UUID，建议在 contacts 或 external_links 中存 servicem8_contact_uuid，便于双向同步与 Phase 2 创建 Job 时指定联系人。 |
| **Task 模型增强** | 增加 task_type 或 related_type/related_id，便于“按类型列出任务”和与 Phase 2 的 Job/Quote 任务区分。 |

---

## 附录：关键文件索引

- Event / Audit: `lib/domain-events.js`, `database/017_quotes_and_automation_audit.sql`, `database/020_opportunity_stage_automation.sql`
- Stage: `lib/stage-constants.js`, `services/opportunityStageAutomation.js`, `services/opportunities.js`
- Quote: `services/quote-sync.js`, `services/quote-followup.js`, `api/routes/webhooks.js` (servicem8/quote)
- Contact identity: `database/018_contacts_phone_digits.sql`, `api/routes/webhooks.js` (matchContactByInboundPhone), `lib/crm/cleaning/normalizePhone.js`
- Sync: `services/servicem8-sync.js` (syncAllFromServiceM8 及 5+1 步), `api/index.js` (AUTO_SYNC_*)
- Automation: `automation/automation-engine.js`, `scripts/run-invoice-overdue.js`, `scripts/run-customer-scoring.js`, `scripts/run-quote-followup.js`
- Tasks: `database/002_domain_model.sql` (tasks 表), `api/routes/tasks.js`
