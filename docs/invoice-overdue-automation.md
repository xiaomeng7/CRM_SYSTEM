# Invoice Overdue Automation

自动管理应收账款提醒与任务：当 invoice 未付且超过 `due_date` 时，按逾期天数触发不同级别的提醒（任务、短信、客户 payment_risk、审计日志）。

## 业务规则

| 逾期天数 | 级别 (overdue_level) | 动作 |
|----------|----------------------|------|
| ≥3 天 | 3_days | 创建任务「Invoice payment reminder」、发送友好提醒短信 |
| ≥7 天 | 7_days | 创建任务「Second payment reminder」、标记 contact.payment_risk = medium |
| ≥14 天 | 14_days | 创建任务「Invoice overdue escalation」、标记 contact.payment_risk = high |

- 同一 invoice 同一 level 只触发一次（幂等）：通过 `invoices.overdue_level` 递进（none → 3_days → 7_days → 14_days）控制。
- 任务按 contact + `created_by` + title 去重，同一 contact 同一 level 只保留一个任务。

## 数据模型（已由 migration 021 增加）

- **invoices**：`overdue_level`（none / 3_days / 7_days / 14_days）、`last_reminder_sent_at`
- **contacts**：`payment_risk`（medium / high）
- **automation_audit_log**：记录 event_type=`invoice_overdue_automation`，action_type、trigger_event、payload

## 每日运行（定时自动跑）

### 方式一：API 进程内定时（推荐）

API 启动时若设置环境变量 `AUTO_INVOICE_OVERDUE_DAILY=true`，会在启动约 2 分钟后执行一次，之后每 24 小时执行一次，无需单独 cron。

- 在 Railway 主 Web Service 的 **Variables** 里增加：`AUTO_INVOICE_OVERDUE_DAILY=true`
- 或本地 `.env`：`AUTO_INVOICE_OVERDUE_DAILY=true`

### 方式二：Railway Cron 或外部 cron

单独建一个 Cron Service（或 crontab），每天跑一次脚本：

```bash
# 在 apps/crm 目录下
npm run invoice-overdue
# 或
node scripts/run-invoice-overdue.js
```

- **Railway Cron**：新建 Cron，Command 填 `node scripts/run-invoice-overdue.js`（需把 working directory 设为 `apps/crm` 或从 monorepo 根目录用 `pnpm --filter @bht/crm invoice-overdue`），Schedule 填 `0 4 * * *`（每天 04:00 UTC）。
- **外部 cron**：`0 4 * * * cd /path/to/apps/crm && npm run invoice-overdue`

### 手动执行

```bash
# 正式执行（写库、发短信）
npm run invoice-overdue

# 仅 dry-run（不写库、不发短信）
npm run invoice-overdue:dry
# 或
node scripts/run-invoice-overdue.js --dry-run

# 执行但不发短信
node scripts/run-invoice-overdue.js --no-sms
```

## 测试

```bash
cd apps/crm

# 仅扫描并列出逾期 invoice 及将触发的 level
npm run test:invoice-overdue

# 以 dry-run 跑完整自动化（不写库、不发短信）
node scripts/test-invoice-overdue.js --run
```

## 相关文件

- Migration：`apps/crm/database/021_invoice_overdue_automation.sql`
- 配置与短信模板：`apps/crm/lib/invoice-overdue-config.js`
- 核心逻辑：`apps/crm/services/invoiceOverdueAutomation.js`
- 每日脚本：`apps/crm/scripts/run-invoice-overdue.js`
- 测试脚本：`apps/crm/scripts/test-invoice-overdue.js`
