# Invoice Sync Root Cause Audit + Data Model Refactor

**角色**: Principal Backend Engineer + Data Architect  
**日期**: 2025-03-09  
**范围**: 为何本地 invoices 表无数据；数据架构与最小可行修复

---

## 第一部分：Root Cause Audit Report

### A. 当前 invoices sync 实现

| 项目 | 说明 |
|------|------|
| **入口** | `syncAllFromServiceM8()` 中第 4 步调用 `syncInvoicesFromServiceM8(options)`，顺序在 companies / contacts / jobs 之后、job_materials / quotes 之前。 |
| **API 调用** | `ServiceM8Client.getInvoices(filter)` → `GET https://api.servicem8.com/api_1.0/invoice.json`，可选 `?$filter=...`（incremental 时按 since）。 |
| **数据来源设计** | 设计为「独立 invoice 实体」：假定 ServiceM8 提供 `invoice.json` 列表，每条约有 uuid、company_uuid、job_uuid、invoice_number、total/amount、date、due_date、status。 |
| **映射** | company_uuid → account_id（经 external_links）；job_uuid → job_id（经 jobs 表）；uuid → servicem8_invoice_uuid。无 uuid 则 skip；无 account_id 仍会 INSERT（account_id 可空）。 |
| **幂等** | 按 `servicem8_invoice_uuid` 查存在则 UPDATE，否则 INSERT。 |

### B. 可能原因排查结果

| # | 可能原因 | 结论 |
|---|----------|------|
| 1 | 调用了错误的 ServiceM8 endpoint | 当前调用为 `invoice.json`。公开文档与社区反馈显示，部分场景下发票信息在 **job** 上（如 `total_invoice_amount`），或通过 job 子资源获取，**独立 invoice 列表 endpoint 可能不存在或未授权**。 |
| 2 | ServiceM8 没有独立 invoice 列表 | **很可能**。文档提到 “Invoices are accessed through the /job/{jobUuid}.json” 与 “total_invoice_amount” 在 job 上，说明发票数据可能以 job 为中心。 |
| 3 | invoice 数据在 jobs 里，代码未提取 | **很可能**。当前 `syncJobsFromServiceM8` 只取 description、address、status、job_number、job_date、completed_at，**未取** total_invoice_amount、invoice_number、date_invoiced 等。 |
| 4 | 过滤条件过严 | incremental 时用 `buildSinceFilter(since)`；full 时 filter 为空。不会因过滤导致全部被滤掉。 |
| 5 | upsert key / mapping 错误 | 若 API 返回的 key 为 `UUID` 或 `invoice_uuid` 而非 `uuid`，`inv.uuid \|\| inv.UUID` 可拿到；若整包结构不是数组（如 `{ data: [] }`），`toArray(raw)` 会处理。若 **invoice.json 返回 404 或非 200**，则 getInvoices 抛错，被 catch 后直接 return stats，**invoices_fetched 保持 0**，不会写入任何行。 |
| 6 | migration/schema 导致 insert 静默失败 | schema 与 INSERT 列一致（含 004 的 last_synced_at、014 的 due_date、021 的 overdue_level 等）。**无证据**表明 INSERT 因缺列而静默失败；更可能是 **从未执行到 INSERT**（上游 API 失败或返回空）。 |
| 7 | sync 顺序 | jobs 在 invoices 之前执行，jobUuidToId 已就绪。顺序正确。 |
| 8 | invoices 表设计不适配 | 表有 account_id、job_id、servicem8_invoice_uuid、amount、invoice_date、due_date、status，与“每 job 一条财务快照”兼容。当前缺的是 **数据来源**，不是表结构本身。 |
| 9 | API 返回字段名与代码不一致 | 若 endpoint 存在但字段名不同，可能 amount/date 等为 null，但 **uuid 缺失时我们会 skip 整行**；若 endpoint 根本无数据或 404，则不会插入。 |
| 10 | dry-run / feature flag | 全量 sync 由 Admin 或定时触发，无 dry-run 时 dryRun=false；**无** env 条件禁止写入 invoices。 |

### C. Root Cause 结论

| 项 | 内容 |
|----|------|
| **Root cause** | **ServiceM8 的 `invoice.json` 很可能不存在、未授权或返回空**；且当前实现 **未从 job 对象中提取发票相关字段**（如 total_invoice_amount），导致无任何 fallback 数据写入 invoices 表。 |
| **Evidence** | (1) 代码仅依赖 `getInvoices()` 单一路径；(2) 公开/社区信息显示发票与 job 关联、且 job 上有 `total_invoice_amount`；(3) getInvoices 失败时 catch 后 return，invoices_fetched=0，不写入；(4) syncJobs 未读取任何 invoice 相关字段。 |
| **Impact** | invoices 表长期为空 → cashflow dashboard、outstanding、overdue automation、payment 汇总均无真实发票数据。 |
| **Fix plan** | (1) **保留** invoice.json 路径（若未来可用）；(2) **新增 job-derived 路径**：在 sync 中从已拉取的 jobs 列表（或单 job 详情）提取 total_invoice_amount、invoice_number、date_invoiced、status 等，按 **servicem8_job_uuid** 幂等 upsert 到 invoices（一 job 一条“财务快照”）；(3) 增加 **diagnostic 脚本** 打印 getInvoices/getJobs 的响应形态，便于环境侧确认。 |

---

## 第二部分：推荐数据架构

### 实体关系（当前 + 建议）

| 关系 | 说明 |
|------|------|
| **one job → zero or one invoice (snapshot)** | 以 job 为财务主关联；invoice 可作为 job 的财务快照（金额、状态、日期），用 servicem8_job_uuid 唯一标识一条。 |
| **one job → many quotes** | 已存在；quotes 表通过 job_id / servicem8_quote_uuid 关联。 |
| **one opportunity → one primary job** | 已存在；opportunities.service_m8_job_id。 |
| **invoices** | 支持双来源：**invoice.json**（若有）用 servicem8_invoice_uuid；**job-derived** 用 servicem8_job_uuid，无独立 invoice uuid 时可为 null。 |

### 字段建议（invoices 表）

| 字段 | 用途 | 来源 |
|------|------|------|
| id | 主键 | 本地 |
| servicem8_invoice_uuid | 独立 invoice 时的唯一键（可为 null） | invoice.json |
| servicem8_job_uuid | Job-derived 时的唯一键；与 job 一一对应 | job.uuid |
| job_id | 关联 jobs.id | 解析得到 |
| account_id | 关联 accounts | company_uuid / job |
| invoice_number | 发票号 | API / job |
| invoice_date | 开票日 | API / job |
| due_date | 到期日 | API / job |
| amount | 总金额（total_invoice_amount） | API / job |
| status | Paid / Unpaid 等 | API / job |
| amount_paid / amount_outstanding | 可选，便于 cashflow | 若 API 提供则存，否则可先不建 |
| created_at, updated_at, last_synced_at | 审计与增量 | 现有 |

本次最小修复：**增加 servicem8_job_uuid，并实现 job-derived upsert**；amount_paid/amount_outstanding 若 API 无则暂不增加，避免过度设计。

---

## 第三部分：最小可行修复（实施摘要）

1. **Migration 027**：为 invoices 增加 `servicem8_job_uuid VARCHAR(36)`，并建 `UNIQUE(servicem8_job_uuid)`（仅对非 null）；保证与现有 servicem8_invoice_uuid 双键兼容。  
2. **syncInvoicesFromServiceM8**：保持现有 getInvoices 逻辑；在 **同一函数内** 或 **syncJobs 之后** 增加“从 jobs 列表补写 invoice”的逻辑：对每个已同步的 job，若其对象含 total_invoice_amount / invoice_total / invoice_number / date_invoiced 等，则按 servicem8_job_uuid upsert 一条 invoice（job_id、account_id、amount、invoice_date、due_date、status 等能取则取）。  
3. **invoice.json 路径**：若某环境确有 invoice.json，现有逻辑继续生效；若返回空或 404，依赖 job-derived 路径仍可让 invoices 表有数据。  
4. **Cashflow / overdue**：不改变现有 SQL 依赖的列（amount、due_date、status、account_id、job_id），仅新增数据来源与 servicem8_job_uuid，故 **无需改 cashflow 或 overdue 逻辑**。  
5. **诊断脚本**：新增 `scripts/diagnose-invoice-sync.js`，调用 getInvoices() 与 getJobs()，打印响应类型、条数及首条 key，便于确认 API 行为。

---

## 第四部分：测试与验证

- **诊断脚本**：在目标环境运行一次，确认 invoice.json 是否返回、job 是否带财务字段。  
- **同步后**：执行一次全量 sync，检查 invoices 表是否有新行（job-derived）；cashflow 与 overdue 列表是否出现数据。  
- **幂等**：再次全量 sync，invoices 行数不翻倍，仅更新已有行（按 servicem8_job_uuid 或 servicem8_invoice_uuid）。

---

## 第五部分：后续建议（Payment）

- 若 ServiceM8 提供 payment 或 payment_history 类接口，可后续增加 payments 表（job_id / invoice_id、amount、paid_at），用于更细的 payment tracking 与 amount_paid/amount_outstanding 派生。  
- 本次不实现 payment 表，保持“让 invoices 先落库、cashflow/overdue 可用”为目标。

---

## 第六部分：实施完成（2025-03）

### 诊断结果（真实环境）

- **GET invoice.json**：400 `"invoice is not an authorised object type"` → 确认无法使用独立 invoice 接口。
- **GET job.json**：返回数组，首条 job 含 `total_invoice_amount` → job-derived 路径有效。

### 已实现

| 项 | 说明 |
|----|------|
| Migration 027 | `027_invoices_servicem8_job_uuid.sql`：invoices 增加 `servicem8_job_uuid` 及 UNIQUE 索引；执行脚本 `node scripts/run-invoices-job-uuid-migration.js`。 |
| Job-derived 写入 | `syncJobsFromServiceM8` 内对每个 job 调用 `upsertInvoiceFromJob()`：从 job 取 total_invoice_amount / invoice_total / invoice_number / date_invoiced / due_date / status，按 servicem8_job_uuid 幂等 upsert。仅当存在 amount 或 invoice_number 时写入。 |
| Invoice.json 路径 | 保留；INSERT/UPDATE 时写入 servicem8_job_uuid；若已存在同 servicem8_job_uuid 行则更新该行并设置 servicem8_invoice_uuid，避免重复。 |
| 诊断脚本 | `scripts/diagnose-invoice-sync.js`：打印 getInvoices/getJobs 响应形态与 job 上 invoice 相关字段。 |
| 验证脚本 | `scripts/test-invoice-sync.js`：dry-run 仅打 stats；`--run` 执行全量 sync 并查询 invoices 表。 |
| Cashflow / Overdue | 未改；仍用 amount、due_date、status、account_id、job_id，invoices 有数据即可。 |

### 文件改动清单

| 文件 | 变更 |
|------|------|
| `apps/crm/database/027_invoices_servicem8_job_uuid.sql` | 新增：invoices.servicem8_job_uuid + 唯一索引。 |
| `apps/crm/scripts/run-invoices-job-uuid-migration.js` | 新增：执行 027。 |
| `apps/crm/scripts/diagnose-invoice-sync.js` | 新增：API 诊断。 |
| `apps/crm/scripts/test-invoice-sync.js` | 新增：sync 与 invoices 表验证。 |
| `apps/crm/services/servicem8-sync.js` | 新增 upsertInvoiceFromJob；syncJobs 内每 job 后调用；syncInvoices 写入 servicem8_job_uuid、按 job_uuid 合并行；syncAll 汇总 invoices_from_job_*。 |
| `apps/crm/package.json` | 新增脚本 `db:invoices-job-uuid-migration`。 |
| `docs/crm-migrations-checklist.md` | 增加 027 条目与执行说明。 |
| `docs/invoice-sync-root-cause-audit.md` | 本实施完成节。 |
