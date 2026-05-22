# Railway：Cashflow + Bank + Recurring 上线清单

每次 `main` 推送后，Railway 会执行 **releaseCommand**（`db:bank-cashflow-migrations`），自动跑 063–065（可重复执行）。

## 1. 自动 Migration（release）

`railway.toml`：

```toml
releaseCommand = "pnpm --filter @bht/crm run db:bank-cashflow-migrations"
```

包含：

| 文件 | 内容 |
|------|------|
| 063 | `financial_snapshots`, `ai_operation_runs`, cashflow settings |
| 064 | `bank_import_batches`, `bank_transactions`, categories |
| 065 | `recurring_patterns` |

在 Railway **Deployments** → 选中最新部署 → **View Logs**，确认 release 阶段出现 `063–065 bank/cashflow migrations done`。

## 2. 手动 Migration（release 失败时）

在本地已 `railway login` 且 link 到项目后：

```bash
cd crm-system
railway run pnpm --filter @bht/crm run db:bank-cashflow-migrations
```

或使用公网 `DATABASE_URL`：

```bash
cd crm-system/apps/crm
DATABASE_URL='postgresql://...' DATABASE_SSL=true pnpm run db:bank-cashflow-migrations
```

## 3. 生成 Cashflow Snapshot（CEO Daily 需要）

CEO Daily 的 Cashflow Intelligence 读 `financial_snapshots`。部署后至少跑一次：

```bash
railway run pnpm --filter @bht/crm run job:cashflow-intel
```

或 HTTP（需 `SYNC_SECRET` / `ADMIN_SECRET`）：

```bash
curl -X POST "https://你的域名.up.railway.app/api/cashflow-intel/run" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": false}'
```

建议 Railway Cron（悉尼早晨，UTC 需换算）：

- Command: `pnpm --filter @bht/crm run job:cashflow-intel`
- Schedule: `0 20 * * *`（约阿德莱德次日清晨，按你时区调整）

## 4. 上线验收 URL

| 页面 / API | 说明 |
|------------|------|
| `/ceo-daily.html` | Freshness、Week expenses 来源、Outstanding 点击列表 |
| `/bank-import.html` | CSV 上传 |
| `/bank-review.html` | 分类确认 |
| `GET /api/cashflow-intel/latest` | 应有 `snapshot`，`expenses.effective_total` 与 summary 一致 |
| `GET /api/cashflow/outstanding-details` | Outstanding 明细 |
| `GET /api/bank/recurring` | 需 secret；有 confirmed 银行数据后有 patterns |

## 5. 环境变量（必须）

| 变量 | 用途 |
|------|------|
| `DATABASE_URL` | Postgres |
| `DATABASE_SSL` | `true` |
| `SYNC_SECRET` 或 `ADMIN_SECRET` | Bank API、cashflow run、import 页面 |

## 6. Recurring 说明

无需单独 job：`collectCashflowFacts` / `job:cashflow-intel` 运行时会调用 `detectRecurringPatterns`（有 confirmed 银行数据时）。
