# Phase 2B: CRM → ServiceM8 Quote Creation

从 CRM opportunity 一键创建 ServiceM8 Quote，与现有 opportunity / job 绑定，写回 CRM 并推进 stage。

---

## 1. Service 代码

- **packages/integrations/servicem8/index.js**  
  - 新增 `createQuote(jobUuid, opts)`：POST jobquote.json（或 quote.json），body 含 `job_uuid`、`total`/`amount`、`note`，返回 `{ uuid }`。
- **apps/crm/lib/servicem8/quote-description-builder.js**  
  - `buildQuoteDescription(ctx)`：模板  
    `Quote for: {{account_name}}\n\nRequested work: {{opportunity_summary}}\n\nSite address: {{site_address}}`。
- **apps/crm/services/servicem8-create-quote.js**  
  - `createServiceM8QuoteFromCRM(params, options)`：校验 opportunity → 幂等（已有非 declined quote 则返回现有）→ 校验 job_uuid → 拼 description → 调 ServiceM8 createQuote → 插入 quotes（含 followup_due_at = sent_at + 7d）、写 audit → `advanceOpportunityStage(oppId, 'quote_sent')`。  
  - 导出 `loadOpportunityForQuote`、`getActiveQuoteForOpportunity`、`ERROR_CODES`。

---

## 2. Route Handler

- **POST /api/opportunities/:id/create-quote**  
  - Body: `{ amount_estimate?, description? }`  
  - 调用 `createServiceM8QuoteFromCRM`，按 result 返回 201 / 200（幂等）/ 404 / 400 / 502，body 含 `quote_id`、`servicem8_quote_uuid`、`amount` 或 `error` + `code`。

---

## 3. Schema 修改

- **024_quotes_created_via.sql**  
  - `quotes.created_via` VARCHAR(50)，取值 `'crm'` | `'servicem8_sync'` | null。  
  - 索引 `idx_quotes_created_via` WHERE created_via IS NOT NULL。

执行: `psql $DATABASE_URL -f apps/crm/database/024_quotes_created_via.sql`

---

## 4. Idempotency 方案

- **规则**: 一个 opportunity 只允许一个 active quote（status != 'declined'）。
- **实现**: 先查 `getActiveQuoteForOpportunity(opportunityId)`；若存在则直接返回 `{ ok: true, already_created: true, quote_id, servicem8_quote_uuid, amount, status }`，不调 ServiceM8。
- **重复点击**: 第二次起返回 200 + 已有 quote 信息，不重复创建。

---

## 5. Audit Log

- **event_type**: `crm_create_servicem8_quote`  
- **entity_type**: `opportunity`  
- **entity_id**: opportunity_id  
- **source**: `crm-create-quote`  
- **payload**: `{ opportunity_id, quote_id, servicem8_quote_uuid, amount, result: 'created' }`  
- 写入表: `automation_audit_log`。

---

## 6. 错误处理

| 场景 | code | HTTP |
|------|------|------|
| Opportunity 不存在 | opportunity_not_found | 404 |
| 无 linked job | job_uuid_missing | 400 |
| ServiceM8 API 失败 | servicem8_api_error | 502 |
| 网络/超时 | network | 502 |
| 参数缺失 | validation | 400 |

已存在 active quote 时返回 200 + 现有 quote（幂等），不视为错误。

---

## 7. 测试

- 列出可测 opportunity（有 job、无 active quote）：  
  `node scripts/test-servicem8-create-quote.js --list-opportunities`
- 单次创建（dry-run）：  
  `node scripts/test-servicem8-create-quote.js --opportunity-id <uuid> --dry-run`
- 单次创建（真实）：  
  `node scripts/test-servicem8-create-quote.js --opportunity-id <uuid>`
- API：  
  `curl -X POST http://localhost:3000/api/opportunities/<uuid>/create-quote -H "Content-Type: application/json" -d '{"amount_estimate": 1000, "description": "Electrical work"}'`

建议覆盖：1) 正常创建；2) 重复点击返回已有 quote；3) 无 job 返回 400；4) API 失败返回 502；5) 创建成功后 stage 推进到 Quoted。

---

## 8. 文件修改列表

| 文件 | 变更 |
|------|------|
| packages/integrations/servicem8/index.js | 新增 createQuote(jobUuid, opts) |
| apps/crm/database/024_quotes_created_via.sql | 新增 created_via 列与索引 |
| apps/crm/lib/servicem8/quote-description-builder.js | 新增 |
| apps/crm/services/servicem8-create-quote.js | 新增 |
| apps/crm/api/routes/opportunities.js | 新增 POST /:id/create-quote |
| apps/crm/scripts/test-servicem8-create-quote.js | 新增 |
| apps/crm/package.json | 新增 test:servicem8-create-quote |
| docs/phase2b-crm-servicem8-quote-creation.md | 本文档 |

---

## 9. Opportunity 联动

- 创建 quote 成功后调用 `advanceOpportunityStage(opportunityId, 'quote_sent')`，目标 stage = **Quoted**（quote_sent）。
- 不直接 SQL 修改 stage，遵守 stage_locked 与终态。
