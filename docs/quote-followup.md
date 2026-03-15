# Quote 7 天自动 Follow-up

当报价已发送且 7 天内未 accepted/declined 时，自动创建 follow-up task 并可选发送短信。

## 规则

- **纳入监控**：quote 状态为 sent 时记录 `sent_at`，并设置 `followup_state = scheduled`、`followup_due_at = sent_at + 7 days`。
- **触发条件**：`sent_at + 7 天 <= 当前时间`，且 `accepted_at`、`declined_at` 为空，且 `followup_state` 不为 `sent`/`skipped`。
- **动作**：创建 task（`created_by = quote-followup`）、可选发送 SMS、更新 `followup_state = sent`、`followup_sent_at = NOW()`、opportunity 的 `next_action_at`，并写入 `automation_audit_log`。
- **幂等**：同一 opportunity 已存在 `quote-followup` 创建的任务则不再创建，仅更新 quote 状态与审计。

## 调度

- 脚本：`node scripts/run-quote-followup.js`
- 建议 cron：每日一次，例如 `0 9 * * *`。
- 参数：`--dry-run` 仅扫描不执行；`--no-sms` 不发短信只建 task。

## 配置

- 模板与天数：`apps/crm/lib/quote-followup-config.js`（`QUOTE_FOLLOWUP_DAYS`、`SMS_TEMPLATE`）。

## 测试

```bash
npm run test:quote-followup list    # 列出当前 due 的 quotes
npm run test:quote-followup run-dry # 干跑
npm run test:quote-followup scenarios # 检查 SQL 场景
npm run quote-followup:dry          # 与 run-quote-followup --dry-run 等价
```

## 审计

- `automation_audit_log`：`event_type = quote_followup_executed`，`payload` 含 `quote_id`、`opportunity_id`、`task_created`、`sms_sent`、`executed_at`、`result`。
