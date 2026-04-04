# Google Offline Conversions — Operations Guide

Pipeline: **Google Ads click → Lead (gclid) → CRM → `google_offline_conversion_events` → uploader → Google Ads**.

验收与验证步骤请参考：[google-offline-conversions-acceptance.md](./google-offline-conversions-acceptance.md)。

## 部署（必须）

**上线后必须执行迁移 049**，否则无法使用 `processing` 认领，上传器会降级为旧版 `SELECT`，高并发下可能重复上传 Google：

```bash
cd apps/crm && npm run db:google-offline-processing-migration
```

`db:google-offline-conversions-migration`、`db:google-offline-retry-migration`、`db:google-offline-processing-migration` 三个脚本均**先**执行 `require('./lib/load-env')`（与 CRM 入口一致，可加载 monorepo **根目录** `.env`）；请在 **`apps/crm` 为当前工作目录** 下执行（`pnpm --filter @bht/crm run …` 时通常已满足）。SQL 路径使用 `process.cwd()/database/...`，避免 `node -e` 下 `__dirname` 不一致。

## 去重（Deduplication）— 不新增约束

- **数据库**：迁移 **046** 已创建部分唯一索引 `uq_google_offline_conversion_dedupe_key ON (dedupe_key) WHERE dedupe_key IS NOT NULL`。
- **应用**：`enqueueOpportunityWonConversionEvent` / `enqueueInvoicePaidConversionEvent` 使用  
  `ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO UPDATE …`  
  并发下同一业务键只保留一行，**本轮不新增重复 UNIQUE 约束**。

## Event types (never mix in one conversion action)

| `event_type` | Use in Google Ads | Value |
|--------------|-------------------|--------|
| `opportunity_won` | Pipeline / lead quality | `value_estimate` or 0 |
| `invoice_paid` | Revenue | Invoice amount |

Env (per type, then fallback):

- `GOOGLE_ADS_OFFLINE_CONVERSION_ACTION_OPPORTUNITY_WON`
- `GOOGLE_ADS_OFFLINE_CONVERSION_ACTION_INVOICE_PAID`
- `GOOGLE_ADS_OFFLINE_CONVERSION_ACTION` (legacy fallback)

## Database

- **046** — queue table + partial **unique** index on `dedupe_key` (`WHERE dedupe_key IS NOT NULL`) + `ON CONFLICT` on enqueue → no duplicate business keys under concurrency.
- **048** — `next_retry_at`, scheduler index.
- **049** — `processing` 状态、`last_retry_at`；历史 `permanent_failed` → `failed` 且 `retry_count = GREATEST(retry_count, 5)`、`next_retry_at = NULL`；严格 CHECK（仅 `pending|processing|sent|failed|skipped`）。

## Status lifecycle (strict)

| Status | Meaning |
|--------|---------|
| `pending` | Eligible for upload |
| `processing` | Claimed by a worker (`FOR UPDATE SKIP LOCKED`) |
| `sent` | Google accepted (or simulate mode) |
| `failed` | Error; may retry until `retry_count` cap |
| `skipped` | Business rule / validation (not retried) |

Terminal failures use **`failed`** with `retry_count = max` (no `permanent_failed` after 049).

Stale **`processing`** (>30 minutes since `last_attempt_at`) is reset to **`pending`** at the start of each upload run.

## Retries (v2)

- **Max attempts:** 5 upload tries per row (`MAX_AUTO_UPLOAD_ATTEMPTS`).
- **Backoff:** exponential from 1 minute, doubling each time, capped at 6 hours.
- **`last_retry_at`:** set when scheduling the next attempt (`failed` + `next_retry_at`).
- **Non-retryable** errors: row set to `failed` with `retry_count = max` immediately.

## Uploader

- **Dry run:** `GOOGLE_OFFLINE_UPLOAD_DRY_RUN=1` or `npm run google-offline-conversions:upload:dry` — no API calls, no `processing` claim.
- **Simulate (bonus):** `GOOGLE_OFFLINE_UPLOAD_SIMULATE=1` — marks rows **sent** with a stub response, **no Google HTTP**; skips `assertGoogleAdsEnv`. For pipeline tests only.

## Admin API

All optional auth: `SYNC_SECRET` / `ADMIN_SECRET` as `x-sync-secret` or `?sync_secret=`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/google-offline-conversions/summary` | Counts + rates + skipped breakdown + latency + gclid % |
| GET | `/api/admin/google-offline-conversions/summary?event_type=opportunity_won` | Scoped summary |
| GET | `/api/admin/google-offline-conversions/:opportunityId/timeline` | One deal: CRM + domain events + audit + invoices + queue |
| GET | `/api/admin/google-offline-conversions` | List queue rows |
| POST | `/api/admin/google-offline-conversions/upload` | Run uploader |

### Summary fields (Phase 2)

- **`conversion_rates_by_event_type`**: `total`, `sent`, `skipped`, `failed`, `pending`, `processing`, **`sent_rate_pct`** (sent / all rows in filter).
- **`skipped_reason_breakdown`**: `event_type`, `skip_reason_bucket`，其中 **`invalid_stage`** 聚合 `opportunity_not_won` 与 `invoice_not_paid`（仅对已写入且 `status=skipped` 的行统计；入队前直接 return 的不会出现在库中）。
- **`avg_seconds_to_send_by_event_type`**: mean `sent_at - created_at` for `status = sent`.
- **`gclid_nonempty_by_event_type`**: `rows_total`, `rows_with_gclid`, **`pct_with_gclid`**.

## Timeline API

`GET /api/admin/google-offline-conversions/{uuid}/timeline`

- **`timeline`**：按时间排序的合并视图（`opportunity_created`、`domain_event`、`automation_audit`、`invoice_row`、`offline_conversion_event`）。
- **`raw`**：调试用原始列表，不删减字段：
  - `opportunity`（`SELECT *` 完整行）
  - `domain_events`
  - `automation_audit_log`
  - `invoices`
  - `offline_conversion_events`（按 `opportunity_id` 与 invoice→opportunity 关联去重合并后的全量队列行）

为兼容旧调用方，仍保留顶层 **`opportunity`**（摘要）、**`invoices`**、**`offline_conversion_events`**。

## Monitoring

- **`sync_runs`** rows with `sync_type = google_offline_conversion_upload` — each run’s JSON **`summary`** includes **`by_event_type`**, **`failed_exhausted`** (and legacy alias **`permanent_failed`**).
- Watch **`processing`** count in summary; sustained non-zero may mean stuck workers (stale recovery runs on next upload).

## 风险说明

1. **未执行 migration 049**  
   无法使用 `processing` + `SKIP LOCKED` 认领；代码会降级为旧版 `SELECT`，**高并发下可能对同一行重复调用 Google 上传**。日志会出现：`需要执行 migration 049（npm run db:google-offline-processing-migration）`。

2. **`sent_rate_pct`（`conversion_rates_by_event_type`）**  
   分母为该 `event_type` 在过滤条件下的**所有行**（含 `pending` / `processing` / `failed` / `skipped`），**不是**仅「曾参与上传」的行。

3. **`invalid_stage` 分桶**  
   只统计**已落库**且 `status=skipped` 的记录；`opportunity_not_won`、`invoice_not_paid` 等在入队逻辑里**早退未 INSERT** 的情况不会出现在该统计中。

## 回滚方案

- **代码回滚**：将 `apps/crm/services/googleOfflineConversions.js`、`admin.js` 等恢复至迁移前版本；若数据库**已执行 049**，旧代码的 CHECK 可能仍包含 `permanent_failed` 而与新数据不一致，**优先用数据库备份恢复**到迁移前快照更稳妥。
- **仅撤销 049（不推荐手工）**：需恢复 `chk_google_offline_status`、删除 `last_retry_at`、`processing` 行改回 `pending` 等，易出错；生产环境建议 **Neon/RDS 时间点恢复** 或迁移前快照。
- **未执行 049**：可直接回滚代码，无 schema 依赖。

## Related

- Intake / env overview: [lead-intake-flow.md](./lead-intake-flow.md)（landing → lead → gclid；文内亦引用本文）。
