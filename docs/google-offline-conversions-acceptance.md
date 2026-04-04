# Google Offline Conversions — 验收清单（Phase 1 / 2）

## 适用范围

本文件用于验收 **Google Offline Conversion** 在仓库当前实现下的 **Phase 1（可靠性 / 幂等 / 重试 / processing）** 与 **Phase 2（可观测性：Summary、Timeline、simulate 等）** 是否达到设计预期。

- 验收对象为：`google_offline_conversion_events` 队列、上传器、`/api/admin/google-offline-conversions/*` 相关接口及 **049** 迁移。
- 本文**不替代**运维主文档；配置与架构说明见 [google-offline-conversions.md](./google-offline-conversions.md)。

API 基址下文用占位符 `https://<CRM_HOST>/api`，密钥用 `YOUR_SECRET`；若未配置 `SYNC_SECRET` / `ADMIN_SECRET`，可省略鉴权相关参数。

## 自动验收运行方式

仓库提供 **V1 自动验收脚本**（不调用真实 Google Ads API；上传步骤使用 `GOOGLE_OFFLINE_UPLOAD_SIMULATE=1` 逻辑）：

```bash
cd apps/crm
npm run google-offline-conversions:acceptance
# 或（进程级预先带上 simulate，与脚本内设置双保险）
npm run google-offline-conversions:acceptance:simulate
```

**依赖：**

- `DATABASE_URL`（与 CRM 相同库；需已执行 **049** 迁移）。迁移请 `cd apps/crm` 后执行 `npm run db:google-offline-*`：脚本已统一先加载 `lib/load-env`，与本地 / CI 行为一致。
- **Node.js 18+**（使用全局 `fetch`）。
- **CRM HTTP 服务已启动**（Summary / Timeline 用 HTTP 调用；默认 `CRM_BASE_URL=http://localhost:3000/api`）。
- 若 API 配置了密钥：设置 `SYNC_SECRET` 或 `ADMIN_SECRET`（脚本通过 `x-sync-secret` 传递）。

**测试数据：**

- 所有自动插入的行 `dedupe_key` 均以 `acceptance_test:` 开头；`source_payload_json` 含 `"acceptance_test":true`。
- 脚本结束时尽量 **DELETE** 上述行；若中途异常，可手工清理：  
  `DELETE FROM google_offline_conversion_events WHERE dedupe_key LIKE 'acceptance_test:%';`

**输出：**

- 每项 `[PASS]` / `[FAIL]` / `[SKIP]`；末尾 `total` / `passed` / `failed` / `skipped`。
- 任一 **FAIL** 时进程退出码 **1**。

**半自动说明：**

- **Timeline**：库中无任何 `opportunities` 时为 `[SKIP]`，不算失败。
- **Simulate 上传**：测试行 `created_at` 设为极早以便优先被 `ORDER BY created_at ASC` 认领；若队列中存在更早的 `pending` 行，可能导致本项 **FAIL**（需清空或暂时处理更旧队列）。

脚本路径：`apps/crm/scripts/run-google-offline-conversion-acceptance.js`；辅助：`apps/crm/scripts/lib/googleOfflineAcceptanceHelpers.js`。

---

## 1. 数据库验收

### 1.1 如何确认 049 migration 已成功执行

在已指向生产/验收库的客户端执行：

```sql
-- 1) 存在 last_retry_at 列
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'google_offline_conversion_events'
  AND column_name = 'last_retry_at';

-- 2) CHECK 约束允许 processing，且不再包含 permanent_failed
SELECT pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'google_offline_conversion_events'::regclass
  AND conname = 'chk_google_offline_status';

-- 预期 def 中含：pending, processing, sent, failed, skipped（无 permanent_failed）

-- 3) 不应再存在 permanent_failed 状态行（迁移后）
SELECT status, COUNT(*) FROM google_offline_conversion_events GROUP BY status;
-- 结果中不应出现 permanent_failed

-- 4) 049 新增/调整的索引（可选）
SELECT indexname FROM pg_indexes
WHERE tablename = 'google_offline_conversion_events'
  AND indexname IN (
    'idx_google_offline_conversion_retry_schedule',
    'idx_google_offline_conversion_processing_stale'
  );
```

### 1.2 如何确认 processing / last_retry_at / failed 终态逻辑

```sql
-- processing：仅在上传认领期间应短暂存在；长时间大量堆积需排查
SELECT COUNT(*) AS processing_cnt
FROM google_offline_conversion_events
WHERE status = 'processing';

-- last_retry_at：应在「失败且已排期重试」的行上出现（与 next_retry_at 同时更新由应用写入）
SELECT id, event_type, status, retry_count, next_retry_at, last_retry_at, error_message, updated_at
FROM google_offline_conversion_events
WHERE status = 'failed'
  AND next_retry_at IS NOT NULL
ORDER BY updated_at DESC
LIMIT 20;

-- 终态失败：不再被自动拉取（retry_count >= 5 且通常 next_retry_at IS NULL）
SELECT id, event_type, retry_count, next_retry_at, error_message
FROM google_offline_conversion_events
WHERE status = 'failed'
  AND retry_count >= 5
  AND next_retry_at IS NULL
LIMIT 20;
```

### 1.3 与 uploader 选数条件一致的「可重试失败」检查

```sql
SELECT COUNT(*) AS eligible_failed_retry
FROM google_offline_conversion_events
WHERE platform = 'google'
  AND status = 'failed'
  AND retry_count < 5
  AND (next_retry_at IS NULL OR next_retry_at <= NOW());
```

---

## 2. 并发验收

### 2.1 如何验证 `FOR UPDATE SKIP LOCKED` 认领生效

**思路**：049 已执行时，非 dry-run 上传会把待处理行先打成 **`processing`** 再上传；两 worker 同时跑时，同一 `id` 不应被两个进程同时处理成功（不应出现双份 `sent` 或同一行并行两次 Google 调用）。

**SQL 辅助（上传过程中快速连跑几次）**：

```sql
SELECT id, status, last_attempt_at, updated_at
FROM google_offline_conversion_events
WHERE status = 'processing'
ORDER BY updated_at DESC;
```

### 2.2 如何模拟两个 worker 同时跑 upload

**前提**：库中至少有 **2 条及以上** `pending`（或已到点的 `failed` 可重试）行。

```bash
# 终端 A
cd apps/crm && GOOGLE_OFFLINE_UPLOAD_LIMIT=10 node scripts/run-google-offline-conversion-upload.js

# 终端 B（几乎同时执行）
cd apps/crm && GOOGLE_OFFLINE_UPLOAD_LIMIT=10 node scripts/run-google-offline-conversion-upload.js
```

若使用 simulate（避免真调 Google）：

```bash
# A / B 均带
export GOOGLE_OFFLINE_UPLOAD_SIMULATE=1
```

### 2.3 预期结果

| 预期 | 说明 |
|------|------|
| 认领互斥 | 同一时刻 **`processing` 行数 ≤ 并发进程数 × limit**（每条最多被一个 worker 认领）。 |
| 无重复 sent | 不应出现**同一 `id` 两次变为 `sent`**（dedupe + 认领下应极难）。 |
| 未跑 049 | 降级为纯 SELECT，**可能**重复上传；验收时应对比「已迁移 / 未迁移」行为。 |

---

## 3. 重试验收

### 3.1 如何人为制造上传失败

任选其一（与代码一致）：

1. **关掉 Google 凭证 / 填错 customer id**：使 OAuth 或 HTTP 返回可重试错误（如 5xx、401/403 在实现中视为 retryable）。
2. **临时把 `GOOGLE_ADS_CUSTOMER_ID` 设为无效**，保留 simulate=0，跑真实 upload。
3. **非可重试**：例如触发 `partialFailureError` 类失败（实现里 `retryable: false`），应直接 `retry_count = 5` 且 `next_retry_at IS NULL`。

### 3.2 观察 retry_count / next_retry_at / last_retry_at

选一条测试用 `id`：

```sql
SELECT id, status, retry_count, next_retry_at, last_retry_at, last_attempt_at, error_message, updated_at
FROM google_offline_conversion_events
WHERE id = '<ROW_UUID>';
```

每失败一次可重试时：应看到 **`retry_count` 递增**、**`next_retry_at` 为未来时间**、**`last_retry_at` 更新为最近一次排期时间**。

### 3.3 如何确认指数退避

代码：`delay = min(6h, 60s * 2^(retry_count_after_fail - 1))`，即约 **1m → 2m → 4m → 8m → …（封顶 6h）**。

验收时记录连续两次失败的 `next_retry_at` 差值（或从 `error_message` / `updated_at` 推算），与上式对比，允许数秒级误差。

### 3.4 如何确认第 5 次后终止重试

同一行从 `retry_count = 0` 开始连续**可重试**失败：第 5 次失败后应满足：

```sql
SELECT id, status, retry_count, next_retry_at
FROM google_offline_conversion_events
WHERE id = '<ROW_UUID>';
-- 预期：status = 'failed', retry_count >= 5, next_retry_at IS NULL
```

且该行不再出现在「可认领」集合中（见 §1.3 的 SQL，把条件换成 `id = ...` 应返回 0）。

---

## 4. Simulate 模式验收

### 4.1 如何确认未调用 Google Ads API

- **做法 A**：本机无有效 Google Ads 环境变量，仅设 `GOOGLE_OFFLINE_UPLOAD_SIMULATE=1` 跑 upload —— 应仍能处理队列（代码会**跳过** `assertGoogleAdsEnv`）。若 simulate 未生效，会因缺 env 直接报错。
- **做法 B**：使用网络抓包 / 企业代理日志，确认无请求到 `googleads.googleapis.com`（可选）。

```bash
cd apps/crm
export GOOGLE_OFFLINE_UPLOAD_SIMULATE=1
# 故意 unset 或错误 GOOGLE_ADS_*，仍应能跑通上传逻辑
node scripts/run-google-offline-conversion-upload.js
```

### 4.2 如何检查 stub JSON 是否写入

```sql
SELECT id, status, sent_at, response_payload_json
FROM google_offline_conversion_events
WHERE id = '<ROW_UUID>';
```

**预期**：`status = 'sent'`，`response_payload_json` 中含类似 `simulated: true`、`GOOGLE_OFFLINE_UPLOAD_SIMULATE=1` 的说明（与 `uploadOneEvent` 返回结构一致）。

---

## 5. Summary API 验收

### 5.1 调用示例（curl）

```bash
export CRM=https://<CRM_HOST>/api
export SEC=YOUR_SECRET

curl -sS "$CRM/admin/google-offline-conversions/summary?sync_secret=$SEC" | jq .

curl -sS "$CRM/admin/google-offline-conversions/summary?date_from=2026-01-01&date_to=2026-04-30&sync_secret=$SEC" | jq .

curl -sS "$CRM/admin/google-offline-conversions/summary?event_type=invoice_paid&sync_secret=$SEC" | jq .
```

也可使用 header：

```bash
curl -sS -H "x-sync-secret: $SEC" "$CRM/admin/google-offline-conversions/summary" | jq .
```

### 5.2 各字段如何验证

| 字段 | 验证方式 |
|------|----------|
| **conversion_rates_by_event_type** | 对某一 `event_type`，手工算 `sent / total` 是否等于返回的 `sent_rate_pct`（分母含 pending/processing/failed/skipped）。可与 `by_event_type_and_status` 交叉核对。 |
| **skipped_reason_breakdown** | 构造或查找 `status=skipped` 行，核对 `error_message` 与分桶：`missing_gclid`、`missing_conversion_action`、`invalid_stage`、`other`。 |
| **avg_seconds_to_send_by_event_type** | 仅 `sent` 且 `sent_at` 非空；SQL 抽样 `AVG(EXTRACT(EPOCH FROM (sent_at-created_at)))` 与 API 对比。 |
| **gclid_nonempty_by_event_type** | 对每类型数 `gclid` 非空行数 / 总行数，与 `pct_with_gclid`、`rows_with_gclid` 一致。 |

**对照 SQL（与 API 同日期窗时可比）**：

```sql
-- sent_rate_pct（按 event_type，与 summary 同逻辑）
SELECT event_type,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status = 'sent') AS sent,
       ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'sent') / NULLIF(COUNT(*),0), 2) AS sent_rate_pct
FROM google_offline_conversion_events
WHERE created_at >= '2026-01-01'::date
  AND created_at < '2026-05-01'::date
GROUP BY event_type;
```

---

## 6. Timeline API 验收

### 6.1 示例

```bash
export CRM=https://<CRM_HOST>/api
export SEC=YOUR_SECRET
export OPP=<opportunity_uuid>

curl -sS "$CRM/admin/google-offline-conversions/$OPP/timeline?sync_secret=$SEC" | jq .
```

### 6.2 timeline 与 raw 应包含什么

- **timeline**：有序列表；元素含 `kind`、`at`、`detail`。常见 `kind`：`opportunity_created`、`domain_event`、`automation_audit`、`invoice_row`、`offline_conversion_event`。
- **raw**：调试全量
  - `opportunity`：库表完整行
  - `domain_events`、`automation_audit_log`、`invoices`、`offline_conversion_events`（去重合并后）

顶层仍可有摘要 `opportunity`、`invoices`、`offline_conversion_events`（与实现一致）。

### 6.3 如何验证 invoice 关联

1. 取该商机下 `invoices.id`。
2. 在 `raw.offline_conversion_events` 中查找 `invoice_id IN (...)` 的行。
3. 在库里核对：

```sql
SELECT g.id, g.event_type, g.opportunity_id, g.invoice_id, i.opportunity_id
FROM google_offline_conversion_events g
LEFT JOIN invoices i ON i.id = g.invoice_id
WHERE i.opportunity_id = '<OPP_UUID>' OR g.opportunity_id = '<OPP_UUID>'
ORDER BY g.created_at;
```

Timeline 中 `offline_conversion_event` 应覆盖「直接挂 opportunity」与「仅挂 invoice 但 invoice 属于该商机」的队列行（与合并逻辑一致）。

---

## 7. 回归风险检查

### 7.1 invoice_paid 是否可能被本轮改动影响

- **入队**：`enqueueInvoicePaidConversionEvent` 未改业务规则；仍用原 `dedupe_key`、`pickTrustedGclid`、`getConversionActionConfig('invoice_paid')`。
- **上传**：共用认领、重试、simulate、summary/timeline；若队列里 `invoice_paid` 行行为异常，多与**全局上传路径**有关，而非单独改写 invoice 入队。

### 7.2 必须重点回归的点

1. **ServiceM8 / 发票同步后仍正常入队** `invoice_paid`（`skipped`/`pending` 是否符合预期）。
2. **`GOOGLE_ADS_OFFLINE_CONVERSION_ACTION_INVOICE_PAID` 与全局 fallback** 仍生效。
3. **真实 upload（非 simulate）** 对 `invoice_paid` 仍可达 `sent`（在环境正确时）。
4. **049 未执行环境**：日志出现中文降级提示，且接受「可能并发重复上传」风险（与验收环境区分）。

---

## 8. 最终上线前检查表（Checklist）

- [ ] **Migration**：已在目标库执行 `npm run db:google-offline-processing-migration`，且 §1 SQL 全部符合预期。
- [ ] **Env**：生产配置 `GOOGLE_ADS_*`、每类 `GOOGLE_ADS_OFFLINE_CONVERSION_ACTION_*`；**勿**在生产长期开启 `GOOGLE_OFFLINE_UPLOAD_SIMULATE`。
- [ ] **Dry-run**：`GOOGLE_OFFLINE_UPLOAD_DRY_RUN=1` 或 `npm run google-offline-conversions:upload:dry`，确认无 Google 写库副作用、响应含 `dry_run: true`。
- [ ] **Simulate（预发）**：`GOOGLE_OFFLINE_UPLOAD_SIMULATE=1` 跑一轮，确认 §4。
- [ ] **真实 upload**：关闭 simulate/dry-run，小 `LIMIT` 试跑，确认 `sent` 与 Google 后台/日志一致。
- [ ] **Summary**：`curl` 带日期窗与 `event_type`，核对 §5 四类指标与 SQL 抽样。
- [ ] **Timeline**：选真实 `opportunity_id`，核对 `timeline` 顺序与 `raw` 完整性、invoice 关联 SQL。
- [ ] **并发（可选但推荐）**：双进程 upload + §2 SQL，确认 049 环境下无异常重复。
- [ ] **重试（可选）**：§3 单条失败链路与第 5 次终止。
- [ ] **监控**：`GET .../google-offline-conversions/runs` 查看 `summary.failed_exhausted` / `permanent_failed` 别名及 `by_event_type`。
- [ ] **invoice_paid 回归**：至少一条真实付费同步路径端到端验证。

---

## 验收结论模板

执行人完成上述检查后，填写以下字段并归档（可贴到工单 / PR / 内部 wiki）。

| 项目 | 填写 |
|------|------|
| **验收时间** | YYYY-MM-DD（或含时段） |
| **验收环境** | 例：Staging / Production / 本地 + DB 连接说明 |
| **执行人** | 姓名或账号 |
| **是否通过** | 通过 / 不通过 / 有条件通过 |
| **问题清单** | 条列：现象、复现步骤、严重级别、是否阻塞上线、跟进人 |

**问题清单（可复制）**

1. 
2. 
3. 

**备注（可选）**

- 

---

*主文档：[google-offline-conversions.md](./google-offline-conversions.md)*
