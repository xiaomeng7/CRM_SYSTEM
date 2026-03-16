# Invoice Overdue Automation

自动管理应收账款提醒与任务：当 invoice 未付且超过 `due_date` 时，按逾期天数触发不同级别的提醒（任务、短信、客户 payment_risk、审计日志）。

## 催款管理：数据来源与判断规则

**Admin「催款管理」列表的数据来源**：与自动催款逻辑一致，来自 `invoices` 表 + `jobs` 表 + 当前日期。

| 项目 | 说明 |
|------|------|
| **数据来源** | `invoices` 表（未付、金额>0、满足“到期”条件），关联 job（若有则要求 job 已完工）、该 account 下第一个有手机的 contact。 |
| **该不该催款** | 同时满足：① `status != 'paid'`（未付，due amount 不为 0）；② `amount > 0`；③ **job 已完工**（有 `job_id` 时：`jobs.completed_at IS NOT NULL` 或 `jobs.status` 含 complete）；④ **开票/到期已超过可催款线**：要么 `due_date < 今天`，要么 `due_date` 为空且 **开票日距今 ≥3 天**（`invoice_date + 3 <= 今天`）；⑤ 按「逾期天数 + 当前 overdue_level」算出**本次要触发的级别**（见下表），有级别才会出现在列表并发送。 |
| **从什么时候开始算** | 有 `due_date` 时：`days_overdue = 今天 - due_date`；无 `due_date` 时：以「开票日+3天」为基准，`days_overdue = 今天 - invoice_date - 3`（不小于 0）。 |

**何时会出现在催款列表 / 触发提醒**（递进，同一发票同一级别只触发一次）：

| 当前 overdue_level | 逾期天数条件 | 本次触发级别 | 说明 |
|--------------------|--------------|--------------|------|
| none | ≥3 天 | 3_days | 第一次提醒 |
| 3_days | ≥7 天 | 7_days | 第二次提醒 |
| 7_days | ≥14 天 | 14_days | 第三次（升级） |

- 若逾期不足 3 天，或已经触发过当前阶段（例如已是 7_days 但还没到 14 天），则 `getLevelToTrigger` 返回 null，**不会**出现在催款管理列表里。
- 数据与 Admin「催款管理」调用的接口 `GET /api/admin/overdue-preview` 一致：先 `scanOverdueInvoices()`，再对每条用 `getLevelToTrigger()` 过滤，只展示「本次要发」的那一批。

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

## 常见问题

**Q: 控制台报错 `WebSocket connection to 'ws://localhost:8081/' failed`（refresh.js）**  
A: 不是本 CRM 代码触发的。通常来自：
- **浏览器插件**：如 Live Reload、Browser Sync、某些「自动刷新」扩展会连 8081 做热更新。可在浏览器扩展里暂时关掉相关插件，或忽略该报错（不影响 CRM 功能）。
- **本地其它开发工具**：若同时开了别的项目（如 Vite/Netlify Dev）在 8081，关掉或换端口即可。

**Q: 催款列表是空的，但确实有未付发票？**  
A: 检查：① 该发票 `due_date` 是否已过期（`due_date < 今天`）；② 是否已过「本次触发」所需天数（至少逾期 3 天且 overdue_level 为 none，或 7 天且为 3_days，或 14 天且为 7_days）。未到对应天数不会出现在列表。

**Q: 为什么 `invoices` 表里是空的？**  
A: CRM 的 **invoices 表只由 ServiceM8 同步写入**，没有其它录入途径。常见原因：  
1. **还没跑过 ServiceM8 全量同步**：在 Admin Console 点「Sync ServiceM8」，或设置 `AUTO_SYNC_SERVICEM8=true` 让定时同步跑完（顺序：companies → contacts → jobs → **invoices** → job_materials → quotes）。  
2. **ServiceM8 里本身没有发票**：若对方系统没有开过发票或 API 不返回，拉取条数就是 0。  
3. **API 未配置或失败**：未设置 `SERVICEM8_API_KEY` 或 key 错误时，`getInvoices()` 会报错，同步会跳过 invoices，结果为 0。  
建议：先跑一次手动同步，看日志里 `Invoices: fetched N` 的 N 是否大于 0；若为 0，检查 ServiceM8 后台是否有发票、以及 API 权限是否包含发票读取。

## 相关文件

- Migration：`apps/crm/database/021_invoice_overdue_automation.sql`
- 配置与短信模板：`apps/crm/lib/invoice-overdue-config.js`
- 核心逻辑：`apps/crm/services/invoiceOverdueAutomation.js`
- 每日脚本：`apps/crm/scripts/run-invoice-overdue.js`
- 测试脚本：`apps/crm/scripts/test-invoice-overdue.js`
