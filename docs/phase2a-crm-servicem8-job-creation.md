# Phase 2A: CRM → ServiceM8 Job Creation

最小闭环：从 CRM opportunity 一键创建 ServiceM8 job，结果写回 CRM，并做审计与 stage 联动。

---

## 1. 技术方案

- **入口**: `POST /api/opportunities/:id/create-servicem8-job`，body 可选 `description`、`address_override`、`create_reason`。
- **流程**: 读取 opportunity（含 account/contact）→ 幂等检查（已有 `service_m8_job_id` 则直接返回）→ 解析/确保 account 对应 ServiceM8 company（`ensureServiceM8LinkForAccount`）→ 组装地址与 description → 调用 ServiceM8 `createJob` → 在 CRM 插入 `jobs`、更新 `opportunities.service_m8_job_id`、写 `automation_audit_log` → 通过 `advanceOpportunityStage(oppId, 'job_created')` 推进 stage（尊重 `stage_locked`）。
- **Contact**: 当前仅用 CRM contact 拼 description 与 jobs.contact_id；不在 ServiceM8 侧创建/匹配 contact（可选后续扩展）。

---

## 2. API 设计

**POST /api/opportunities/:id/create-servicem8-job**

- **Path**: `:id` = opportunity UUID。
- **Body** (JSON, 均可选):
  - `description`: string，覆盖默认 job description。
  - `address_override`: string，覆盖默认 job 地址。
  - `create_reason`: string，写入 description/notes 并进 audit payload。
- **Success**:
  - 201: 新创建，body `{ ok: true, job_id, job_uuid, job_number }`。
  - 200: 已存在（幂等），body `{ ok: true, already_created: true, job_id, job_uuid, job_number }`。
- **Error**:
  - 404: opportunity 不存在，`{ error, code: 'opportunity_not_found' }`。
  - 400: 无 account / account 无法映射等，`{ error, code: 'validation' | 'account_not_mapped' }`。
  - 502: ServiceM8 API 或网络错误，`{ error, code: 'servicem8_api_error' | 'network' }`。

---

## 3. Migration / Schema 变更

**023_jobs_crm_creation_source.sql**

- `jobs.source_opportunity_id` UUID REFERENCES opportunities(id) ON DELETE SET NULL。
- `jobs.created_via` VARCHAR(50)，取值 `'crm'` | `'servicem8-sync'` | null。
- 索引: `idx_jobs_source_opportunity_id` WHERE source_opportunity_id IS NOT NULL。

执行: `psql $DATABASE_URL -f apps/crm/database/023_jobs_crm_creation_source.sql`

---

## 4. Service 层代码

- **packages/integrations/servicem8/index.js**  
  - 新增 `createJob(companyUuid, opts)`，POST job.json，返回 `{ uuid, job_number }`。
- **apps/crm/lib/servicem8/job-description-builder.js**  
  - `buildDefaultJobDescription(ctx, overrideDescription)`：从 opportunity/account/contact/notes 拼默认 description，可被 body.description 覆盖。
- **apps/crm/services/servicem8-create-job.js**  
  - `createServiceM8JobFromCRM(params, options)`：校验 → 加载 opportunity 上下文 → 幂等判断 → 解析 company → 调 ServiceM8 → 写 jobs + 更新 opportunity + audit → `advanceOpportunityStage(..., 'job_created')`。  
  - 导出 `ERROR_CODES`、`loadOpportunityContext`。

---

## 5. Route / Function 代码

- **apps/crm/api/routes/opportunities.js**  
  - 新增 `POST /:id/create-servicem8-job`：从 body 取 `description`、`address_override`、`create_reason`，调 `createServiceM8JobFromCRM`，按 `result.ok` / `error_code` 返回 201 / 200 / 404 / 400 / 502。

---

## 6. Idempotency 方案

- **约定**: 一个 opportunity 只对应一个“由本接口创建的” ServiceM8 job；以 `opportunities.service_m8_job_id` 为唯一来源。
- **逻辑**: 若 `opportunity.service_m8_job_id` 已有值，则不再调 ServiceM8，直接查本地 `jobs` 取 `job_id`/`job_number`，返回 200 与 `already_created: true`。
- **重试/超时**: 若 ServiceM8 已创建成功但 CRM 写库失败，返回错误且带 `job_uuid`，便于人工补链；不会因重复点击而重复创建 job（因再次请求会先读 opportunity，若已写回则走幂等分支）。

---

## 7. 错误处理说明

| 场景 | code | HTTP | 说明 |
|------|------|------|------|
| opportunity 不存在 | opportunity_not_found | 404 | 路径 id 无效或已删。 |
| opportunity 无 account | validation | 400 | 需先关联 account。 |
| account 无法映射到 ServiceM8 company | account_not_mapped | 400 | ensureServiceM8LinkForAccount 失败或未返回 companyUuid。 |
| ServiceM8 API 失败 | servicem8_api_error | 502 | 返回 API 错误信息。 |
| 网络/超时 | network | 502 | 便于与 API 业务错误区分。 |
| 已创建（幂等） | — | 200 | ok: true, already_created: true。 |

所有错误 response 均包含 `error`（可展示）和可选 `code`，便于前端或监控区分。

---

## 8. 测试方式

- **列表可测 opportunity**  
  `npm run test:servicem8-create-job -- --list-opportunities`（或 `node scripts/test-servicem8-create-job.js --list-opportunities`）。
- **单次创建（dry-run）**  
  `node scripts/test-servicem8-create-job.js --opportunity-id <uuid> --dry-run`。
- **单次创建（真实）**  
  `node scripts/test-servicem8-create-job.js --opportunity-id <uuid>`（需有效 SERVICEM8_API_KEY 与 DB）。
- **API**  
  `curl -X POST http://localhost:3000/api/opportunities/<uuid>/create-servicem8-job -H "Content-Type: application/json" -d '{}'`  
  重复同一次请求应得到 200 + `already_created: true`。
- **建议覆盖**: (1) 正常创建成功；(2) 同 opportunity 重复请求不重复建单；(3) 无 account 或未映射返回 400；(4) ServiceM8 不可用返回 502；(5) 创建成功后 stage 经 engine 推进；(6) stage_locked 时创建 job 成功但 stage 不变。

---

## 9. 文件改动清单

| 文件 | 变更 |
|------|------|
| packages/integrations/servicem8/index.js | 新增 createJob(companyUuid, opts)。 |
| apps/crm/database/023_jobs_crm_creation_source.sql | 新增 jobs.source_opportunity_id、created_via 及索引。 |
| apps/crm/lib/servicem8/job-description-builder.js | 新增，默认 description 构建。 |
| apps/crm/services/servicem8-create-job.js | 新增，createServiceM8JobFromCRM + loadOpportunityContext + audit。 |
| apps/crm/api/routes/opportunities.js | 新增 POST /:id/create-servicem8-job。 |
| apps/crm/scripts/test-servicem8-create-job.js | 新增，命令行测试。 |
| apps/crm/package.json | 新增 script test:servicem8-create-job。 |
| docs/phase2a-crm-servicem8-job-creation.md | 本文档。 |

---

## 10. 后续 Phase 2B 可扩展点

- **CRM 创建 Quote**: 在 ServiceM8 创建 quote 并写回 CRM quotes 表，与 opportunity 关联。
- **Contact 映射**: 在 ServiceM8 创建/匹配 company contact，并写回 contact 或 external_links。
- **Job 更新/取消**: 从 CRM 触发 ServiceM8 job 状态更新或取消。
- **多 job 策略**: 若业务允许一 opportunity 多 job，可引入 idempotency_key（如 opportunity_id + 请求 id）或显式“添加另一 job”入口。
- **UI**: 在 opportunity 详情页增加“创建 ServiceM8 Job”按钮，并展示已有 job 链接与错误信息。
