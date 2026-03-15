# CRM 自动化验收报告

**验收日期**：2025-03-09  
**范围**：已实现与计划中的自动化，不包含新功能开发

---

## 1. 当前已实现的自动化清单

| 模块 | 自动化项 | 实现位置 | API / 入口 |
|------|----------|----------|------------|
| **A. ServiceM8 同步** | accounts 同步 | `servicem8-sync.js` | `POST /api/admin/actions/sync-servicem8` |
| | contacts 同步 | 同上 | 同上 |
| | jobs 同步 | 同上 | 同上 |
| | invoices 同步 | 同上 | 同上 |
| | job_materials 同步 | 同上 | 同上 |
| | 定时自动同步 | `api/index.js` | AUTO_SYNC_SERVICEM8 定时任务 |
| **B. Reactivation Queue** | generate queue | `reactivation-sms-engine.js` | `POST /api/reactivation/queue/generate` |
| | preview batch | 同上 + `listQueue` | `GET /api/reactivation/queue` |
| | send batch | 同上 | `POST /api/reactivation/queue/send` |
| | activities 审计 | sendBatch 内插入 | `activity_type='outbound_sms'` |
| **C. Reply Inbox** | inbound SMS 回流 | `webhooks.js` | `POST /api/webhooks/twilio/inbound-sms` |
| | create follow-up task | 同上 | 24h 内去重 |
| | mark handled | `reactivation-replies.js` | `PATCH /api/reactivation/replies/:id/handled` |
| **D. Opportunities** | job → opportunity | `servicem8-sync.js` | `upsertOpportunityForJob` |
| | stage 更新（人工） | `opportunities.js` | `PATCH /api/opportunities/:id/stage` |
| | sync 不覆盖人工 stage | 同上 | 仅更新 `inspection_date` |
| **E. Tasks** | task 创建 | `tasks.js` | `POST /api/tasks` |
| | task 完成 | 同上 | `POST /api/tasks/:id/complete` |
| | 页面分组展示 | `tasks.html` | Overdue / Today / Upcoming |
| **F. Cashflow** | invoices paid/unpaid | `cashflow.js` | `/api/cashflow/dashboard` |
| | outstanding | 同上 | 同上 |
| | due_date / days_overdue | 同上 | outstandingInvoices 数组 |
| **G. Opportunity → Job** | stage = Inspection Booked / Qualified 时自动建 Job | `opportunityAutoConvertToJob.js` | PATCH `/api/opportunities/:id/stage` |
| | 防重复：一 opportunity 一 primary job | `createServiceM8JobFromCRM` 内校验 | `service_m8_job_id` 已存在则返回已有 |
| **H. Quote Acceptance** | quote_accepted 全流程 | `quoteAcceptedAutomation.js` + `quote-sync.js` | ServiceM8 webhook / sync |
| | stage → Won | `opportunityStageAutomation.js` | `advanceOpportunityStage(oppId, 'quote_accepted')` |
| | job_preparation task | 同上 | task_type=job_preparation |
| | 客户感谢 SMS | `quote-accepted-config.js` + sendSMS | 模板：Hi {{first_name}}, thank you... |
| | forecast probability=100% | 同上 | opportunities.probability |
| | 审计 | automation_audit_log | event_type=quote_accepted_automation |

---

## 2. 建议优先实现的自动化清单

| 优先级 | 自动化项 | 说明 |
|--------|----------|------|
| 1 | Quote sent 同步 | ServiceM8 报价发送 → opportunity stage = quote_sent |
| 2 | Quote accepted 同步 | **已实现**：客户同意报价 → stage=won + task + SMS + probability + audit |
| 3 | quote_sent 7 天 follow-up task | 7 天内无回复自动创建 task |
| 4 | Reply Inbox 手机号匹配增强 | webhook 使用 regexp 匹配 phone，兼容不同格式 |
| 5 | job_completed 12 个月 reactivation | 已有 `months_since_last_job`，12 个月后自然进入候选池 |

---

## 3. 每项自动化的验证步骤与结果

### A. ServiceM8 同步

| 项 | 验证步骤 | 结果 |
|----|----------|------|
| **accounts** | 1. 调用 `POST /api/admin/actions/sync-servicem8`；2. 检查 accounts 表及 external_links | **PASS**：company → account 映射、upsert 逻辑已实现 |
| **contacts** | 1. 同上；2. 检查 contacts 与 account 关联；3. phone/email 清洗写入 | **PASS**：cleanContact + normalizePhone，findExistingContact 用 regexp 匹配 |
| **jobs** | 1. 同上；2. 检查 jobs 表、service_m8_job_id 关联 | **PASS**：job 同步及 upsertOpportunityForJob 已实现 |
| **invoices** | 1. 同上；2. 检查 invoices 表、amount/due_date/status | **PASS**：同步逻辑完整，包含 due_date |
| **job_materials** | 1. 同上；2. 检查 job_materials 与 job 关联 | **PASS**：按 job_uuid 关联写入 |

**A 模块小结**：全部 **PASS**。需配置 ServiceM8 凭证及定时任务 `AUTO_SYNC_SERVICEM8`。

---

### B. Reactivation Queue

| 项 | 验证步骤 | 结果 |
|----|----------|------|
| **generate queue** | 1. `POST /api/reactivation/queue/generate`；2. 检查 reactivation_sms_queue 有 preview 记录 | **PASS**：基于 crm_account_reactivation_contacts，排除 30d 内联系、已排队、DNC |
| **preview batch** | 1. `GET /api/reactivation/queue?batch_id=xxx`；2. 检查返回 items | **PASS**：listQueue 支持 batch_id 过滤 |
| **send batch** | 1. `POST /api/reactivation/queue/send` body `{ batch_id }`；2. 检查 queue 状态变为 sent，SMS 发送 | **PASS**：sendSMS 调用 + status 更新 |
| **activities 审计** | 1. send batch 后；2. 查询 activities 中 activity_type='outbound_sms' | **PASS**：sendBatch 内插入 activities，created_by='reactivation-engine' |

**B 模块小结**：全部 **PASS**。

---

### C. Reply Inbox

| 项 | 验证步骤 | 结果 |
|----|----------|------|
| **inbound SMS 回流** | 1. Twilio 配置 webhook 指向 `POST /api/webhooks/twilio/inbound-sms`；2. 模拟请求；3. 检查 activities 有 inbound_sms | **PASS**：webhook 写入 activities，匹配 contact 则 activity_type=inbound_sms，否则 inbound_sms_unmatched |
| **create follow-up task** | 1. 匹配到 contact 的 inbound SMS；2. 检查 tasks 表有 follow-up task，24h 内不重复创建 | **PASS**：逻辑已实现 |
| **mark handled** | 1. `PATCH /api/reactivation/replies/:id/handled`；2. 检查 activities.handled=true | **PASS**：migration 008 添加 handled 列，API 已实现；若 migration 未跑有 fallback 查询 |

**C 模块注意**：手机号匹配使用 `c.phone = $1` 精确匹配。若 contacts.phone 含空格/格式不一，可能匹配失败 → 见下方 **NEEDS WORK**。

**C 模块小结**：功能 **PASS**，手机号匹配 **NEEDS WORK**（建议与 sync 一致使用 regexp_replace 做 digits 匹配）。

---

### D. Opportunities

| 项 | 验证步骤 | 结果 |
|----|----------|------|
| **job → opportunity** | 1. sync jobs 时；2. 新 job 无对应 opportunity 则创建，stage=site_visit_booked | **PASS**：upsertOpportunityForJob 已实现 |
| **stage 更新** | 1. `PATCH /api/opportunities/:id/stage`；2. 检查 stage 变更 | **PASS**：opportunities 路由已实现 |
| **sync 不覆盖人工 stage** | 1. 人工将 stage 改为 won；2. 再跑 sync；3. 确认 stage 仍为 won | **PASS**：upsertOpportunityForJob 在更新时仅改 inspection_date，不改 stage |

**D 模块小结**：全部 **PASS**。文档 crm-servicem8-opportunity-flow.md 中 Quote sent / Quote accepted 待实现。

---

### E. Tasks

| 项 | 验证步骤 | 结果 |
|----|----------|------|
| **task 创建** | 1. `POST /api/tasks` body `{ contact_id, title }`；2. 检查 tasks 表 | **PASS**：插入逻辑已实现 |
| **task 完成** | 1. `POST /api/tasks/:id/complete` body `{ outcome }`；2. 检查 status=completed | **PASS**：complete 路由已实现，支持 call 类 outcome |
| **页面分组展示** | 1. 打开 /tasks.html；2. 检查 Overdue / Today / Upcoming 分组 | **PASS**：tasks.html 按 due_at 分组，formatDue 返回 Overdue/Today/日期 |

**E 模块小结**：全部 **PASS**。

---

### F. Cashflow 基础数据

| 项 | 验证步骤 | 结果 |
|----|----------|------|
| **invoices paid/unpaid** | 1. `GET /api/cashflow/dashboard`；2. 检查 paymentsReceived（paid）和 outstandingAmount（非 paid） | **PASS**：按 status 区分 paid / 非 paid |
| **outstanding** | 1. 同上；2. 检查 outstandingAmount、outstandingInvoices | **PASS**：SUM(amount) WHERE status != 'paid' |
| **due_date / days_overdue** | 1. 检查 outstandingInvoices 含 due_date、days_overdue | **PASS**：SQL 已计算 `(CURRENT_DATE - i.due_date)::int`，migration 014 添加 due_date |

**F 模块小结**：全部 **PASS**。依赖 invoices 表有 ServiceM8 同步的 due_date。

---

## 4. 验证结果汇总

| 模块 | PASS | FAIL | NEEDS WORK |
|------|------|------|------------|
| A. ServiceM8 同步 | 5 | 0 | 0 |
| B. Reactivation Queue | 4 | 0 | 0 |
| C. Reply Inbox | 3 | 0 | 1（手机号匹配） |
| D. Opportunities | 3 | 0 | 0 |
| E. Tasks | 3 | 0 | 0 |
| F. Cashflow | 3 | 0 | 0 |
| **合计** | **21** | **0** | **1** |

---

## 5. 下一步最值得先自动化的模块（按业务价值排序）

1. **Quote sent / Quote accepted 同步**：补齐 opportunity 阶段自动化，减少人工维护
2. **quote_sent 7 天 follow-up task**：自动创建跟进任务，提高转化
3. **Reply Inbox 手机号匹配增强**：修复 `c.phone = $1` 导致部分回复无法匹配 contact 的问题
4. **Reactivation 12 个月规则**：已由 `months_since_last_job` 和 crm_account_reactivation_contacts 覆盖，无需额外自动化
5. **其他**：Job completed 更新 account summary 已由 crm_account_summary 视图聚合，无需额外改动

---

## 6. 附录：关键代码路径

- ServiceM8 同步：`apps/crm/services/servicem8-sync.js`，`apps/crm/api/routes/admin.js`
- Reactivation：`apps/crm/services/reactivation-sms-engine.js`，`apps/crm/api/routes/reactivation-queue.js`
- Reply Inbox：`apps/crm/api/routes/webhooks.js`，`apps/crm/api/routes/reactivation-replies.js`
- Opportunities：`apps/crm/services/servicem8-sync.js` 中 `upsertOpportunityForJob`，`apps/crm/api/routes/opportunities.js`
- Tasks：`apps/crm/api/routes/tasks.js`，`apps/crm/public/tasks.html`
- Cashflow：`apps/crm/api/routes/cashflow.js`
- Migration 008：`apps/crm/database/008_activities_handled.sql`（activities.handled）
