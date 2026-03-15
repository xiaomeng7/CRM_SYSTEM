# Opportunity Stage Automation Engine

Pipeline stage 根据系统事件自动推进，不覆盖人工终态，支持 manual override，所有变更写入 `automation_audit_log`。

## Stage 定义（统一常量）

| 显示名 | DB 值 (stage) |
|--------|----------------|
| New Lead | new_inquiry |
| Attempting Contact | attempting_contact |
| Qualified | qualified |
| Inspection Booked | site_visit_booked |
| Inspection Completed | inspection_done |
| Report Sent | report_sent |
| Quoted | quote_sent |
| Negotiation | decision_pending |
| Won | won |
| Lost | lost |

常量与事件映射见 `lib/stage-constants.js`（`OPPORTUNITY_STAGES`、`EVENT_TO_STAGE`）。

## 事件 → Stage 规则

| 事件 | 目标 Stage |
|------|------------|
| job_created | Inspection Booked (site_visit_booked) |
| inspection_completed | Inspection Completed (inspection_done) |
| report_sent | Report Sent (report_sent) |
| quote_sent | Quoted (quote_sent) |
| quote_accepted | Won |
| quote_declined | Lost |

## Manual Override 保护

- 当 `opportunity.stage` 为 **Won** 或 **Lost** 时，自动化不再修改。
- 当 `opportunity.stage_locked === true` 时，自动化不再修改。
- 人工可通过 `PATCH /api/opportunities/:id/stage` 传 `stage_locked: true` 锁定，传 `stage_locked: false` 解锁。

## 统一入口

```js
const { advanceOpportunityStage } = require('./services/opportunityStageAutomation');

await advanceOpportunityStage(opportunityId, 'quote_sent', { db, dryRun?, created_by?, lost_reason? });
// => { applied: true|false, reason?, previous_stage?, new_stage? }
```

## 已接入

- **job_created**：ServiceM8 sync 在创建 opportunity 后调用 `advanceOpportunityStage(id, 'job_created')`。
- **quote_sent / quote_accepted / quote_declined**：quote-sync（含 webhook）通过 `advanceOpportunityStage` 更新 stage。

## 待接入

- **inspection_completed**：在“检查完成”的 webhook 或 sync 中调用 `advanceOpportunityStage(oppId, 'inspection_completed')`。
- **report_sent**：在“报告已发”的 webhook 或 sync 中调用 `advanceOpportunityStage(oppId, 'report_sent')`。

## 审计

- `automation_audit_log`：`event_type = opportunity_stage_advance`，`action_type = stage_advance`，`old_value` / `new_value` / `trigger_event` / `executed_at` 记录每次推进（含 idempotent 时同值记录）。

## 测试

```bash
node scripts/test-stage-automation.js <opportunityId> quote_sent
node scripts/test-stage-automation.js <opportunityId> job_created --dry-run
```
