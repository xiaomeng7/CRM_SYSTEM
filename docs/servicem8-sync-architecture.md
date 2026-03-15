# ServiceM8 同步架构

本文档说明 CRM 与 ServiceM8 的同步架构：数据分工、定时同步、防重复与监控。

---

## 1. CRM 与 ServiceM8 的 Source of Truth 分工

- **CRM** 是**客户主数据源**：leads、accounts、contacts 的创建与生命周期以 CRM 为准。
- **ServiceM8** 是**现场作业系统**：工单、发票、材料等作业数据以 ServiceM8 为准。
- **同步方向**：
  - **ServiceM8 → CRM**：定时将客户、联系人、工单、发票、材料等拉回 CRM，用于分析、报表与统一视图。单向、幂等。
  - **CRM → ServiceM8**：当 lead/account 需要进入 ServiceM8 做工时，先通过 `ensureServiceM8LinkForAccount` 确保不重复创建 company，再在 ServiceM8 侧创建/关联工单等。

---

## 2. 定时同步如何工作

- **入口**：`syncAllFromServiceM8(options)`，顺序执行：
  1. companies → accounts + external_links  
  2. contacts → contacts  
  3. jobs → jobs  
  4. invoices → invoices  
  5. job_materials → job_materials  

- **选项**：
  - `mode: 'full' | 'incremental'`：全量拉取或按 `since` 日期过滤（OData `$filter=last_modified_date gt 'YYYY-MM-DD'`，具体字段以 ServiceM8 API 为准）。
  - `dryRun: true`：不写库，只统计。
  - `since`：增量时可选传入日期；不传则取最近一次成功全量同步的 `finished_at` 作为 since。
  - `skipLock: true`：跳过并发锁（仅测试或单进程时使用）。

- **幂等**：同一 ServiceM8 记录多次同步只会 UPDATE 已有行，不会重复 INSERT（按 external_links / servicem8_*_uuid 去重）。

- **Cron 入口**：在 cron 中调用同一脚本即可，例如：
  - 全量：`node apps/crm/scripts/sync-servicem8-all-history.js`
  - 增量（若脚本支持）：传 `MODE=incremental` 或由代码根据上次 sync_runs 自动选 since。

---

## 3. sync_runs 如何记录

- **表**：`sync_runs`（见 migration 004）。
- **字段**：id, sync_type, mode, started_at, finished_at, fetched_count, created_count, updated_count, skipped_count, error_count, dry_run, status, details。
- **行为**：
  - 每次执行 `syncAllFromServiceM8`（且非 dryRun）时，开始时 INSERT 一条 status=’running’，结束时 UPDATE finished_at、各 count、status=’completed’|’completed_with_errors’|’failed’。
  - details 存完整各实体统计（JSON），便于排查。
- **用途**：监控最近一次同步是否成功、耗时、错误数；增量同步时取上次 finished_at 作为 since。

---

## 4. last_synced_at 的作用

- **列**：accounts.last_synced_at, contacts.last_synced_at, jobs.last_synced_at, invoices.last_synced_at（migration 004 增加）。
- **更新时机**：每次从 ServiceM8 拉取并 INSERT/UPDATE 该行时，将 `last_synced_at = NOW()`。
- **用途**：为将来按“本表最后同步时间”做增量或重试提供依据；也可用于 UI 展示“最近同步时间”。

---

## 5. CRM lead 进入 ServiceM8 时如何避免重复

- **规则**：在 CRM 侧要把某个 account 推到 ServiceM8 之前，必须先调用 **ensureServiceM8LinkForAccount(accountId)**（或带 dryRun/ db 的 options）。
- **逻辑**：
  1. **已有 link**：若 external_links 中已有该 account 的 servicem8 company 映射，直接返回 company uuid，**不再创建** ServiceM8 company。
  2. **无 link**：拉取 ServiceM8 全部 companies，在内存中按 **name + suburb** 做保守匹配；若匹配到，写入 external_links 并返回该 company uuid，**不创建**新 company。
  3. **仍无**：在 ServiceM8 调用 **createCompany** 创建新 company，将返回的 uuid 写入 external_links，再返回。
- **结果**：同一 CRM account 只会对应一个 ServiceM8 company，不会因“先 lead 后进 ServiceM8”而重复建客户。

---

## 6. external_links 的核心作用

- **表**：`external_links`（system, external_entity_type, external_id, entity_type, entity_id）。
- **ServiceM8 公司映射**：system=’servicem8’, external_entity_type=’company’, external_id=ServiceM8 company uuid → entity_type=’account’, entity_id=CRM account id。
- **作用**：
  - **ServiceM8 → CRM 同步**：用 company uuid 查 external_links 得到 account_id，保证同一公司只对应一个 account。
  - **CRM → ServiceM8 去重**：用 account_id 反查 external_id 得到是否已存在 ServiceM8 company，避免重复创建。
- **结论**：external_links 是两边去重的**第一依据**，所有“是否已关联/是否已存在”都先查此表。

---

## 7. 同步锁（防并发）

- **实现**：PostgreSQL **advisory lock**（单一大整数 key，常量 SYNC_ADVISORY_LOCK_ID）。
- **行为**：`syncAllFromServiceM8` 开始时 `pg_try_advisory_lock`，若拿不到则直接返回（不执行同步）；结束时 `pg_advisory_unlock`。锁与当前 DB 连接绑定，连接释放即锁释放。
- **效果**：同一时间只允许一个全量/增量同步在执行，避免并发写导致数据错乱。

---

## 8. 自动同步（已实现）

### 8.1 方式一：进程内定时（推荐，零配置）

设置环境变量：
- `AUTO_SYNC_SERVICEM8=true` — 启用定时同步
- `AUTO_SYNC_INTERVAL_HOURS=2` — 间隔小时数（默认 2）

API 启动后，会在 1 分钟后首次执行，之后按间隔循环。无需外部 cron。

### 8.2 方式二：HTTP 触发（供外部 cron 调用）

```http
POST /api/admin/actions/sync-servicem8
Content-Type: application/json
X-Sync-Secret: <SYNC_SECRET>   # 若配置了 SYNC_SECRET 或 ADMIN_SECRET
```

可选 body：`{ "mode": "full" }` 或 `{ "mode": "incremental" }`，默认 full。

**鉴权**：若设置了 `SYNC_SECRET` 或 `ADMIN_SECRET`，请求需在 header `X-Sync-Secret` 或 query `sync_secret` 中提供该值。

**外部 cron 示例**（cron-job.org、GitHub Actions 等）：
```bash
curl -X POST "https://your-crm.up.railway.app/api/admin/actions/sync-servicem8" \
  -H "X-Sync-Secret: $SYNC_SECRET"
```

### 8.3 方式三：手动执行

- **Admin Console**：点击「Sync ServiceM8」按钮
- **CLI**：`pnpm sync:servicem8:all`

### 8.4 环境变量

| 变量 | 说明 |
|------|------|
| AUTO_SYNC_SERVICEM8 | `true` 或 `1` 启用进程内定时同步 |
| AUTO_SYNC_INTERVAL_HOURS | 定时间隔（小时），默认 2 |
| SYNC_SECRET 或 ADMIN_SECRET | 可选，API 触发时鉴权 |

---

## 9. 相关文件与入口

| 用途           | 文件/入口 |
|----------------|-----------|
| 全量同步脚本   | apps/crm/scripts/sync-servicem8-all-history.js，pnpm sync:servicem8:all |
| HTTP 触发      | POST /api/admin/actions/sync-servicem8 |
| 进程内定时     | api/index.js（AUTO_SYNC_SERVICEM8=true 时） |
| 同步服务       | apps/crm/services/servicem8-sync.js（syncAllFromServiceM8, ensureServiceM8LinkForAccount 等） |
| sync_runs 表   | apps/crm/database/004_sync_runs_and_last_synced.sql |
| 执行 004       | node apps/crm/scripts/run-sync-runs-migration.js |
