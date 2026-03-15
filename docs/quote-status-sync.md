# Quote 状态同步

ServiceM8 quote 数据同步到 CRM，驱动 opportunities / tasks / forecast。

## 数据流

```
ServiceM8 Quote (jobquote/quote API or webhook)
    → quotes 表
    → opportunities.stage (quote_sent | won | lost)
    → tasks (quote_sent 时创建 follow-up)
    → automation_audit_log (quote_accepted / quote_declined)
```

## 阶段映射

| Quote 状态 | Opportunity Stage |
|------------|-------------------|
| quote_sent / sent | quote_sent |
| quote_accepted / accepted | won |
| quote_declined / declined | lost |

## API

- **Pull 同步**：随 `POST /api/admin/actions/sync-servicem8` 一并执行，或单独 `POST /api/admin/actions/sync-quotes`
- **Webhook**：`POST /api/webhooks/servicem8/quote`
  - Body: `{ event?, quote_uuid?, job_uuid, status, decline_reason? }`
  - 需要 `X-Sync-Secret` 或 `sync_secret` 校验

## 幂等与覆盖规则

- 已人工设为 Won/Lost 的 opportunity 不会被同步覆盖
- 7 天内同一 opportunity 不重复创建 follow-up task
- 重复事件不重复触发副作用
