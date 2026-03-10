# ServiceM8 + Snapshot 集成

提交快照/预约后，可通过「Create ServiceM8 Job」在 ServiceM8 中创建客户与工单。

## 1. 环境变量（仅存于 env，勿提交密钥）

在 Netlify：**Site configuration → Environment variables** 中配置：

| 变量 | 说明 | 必填 |
|------|------|------|
| `SERVICEM8_API_KEY` | ServiceM8 Private Application API Key（发请求时放在 `X-API-Key` header） | 创建工单时**是** |
| `SERVICEM8_BASE_URL` | API 根地址，默认 `https://api.servicem8.com/api_1.0` | 否 |
| `SERVICEM8_JOB_STATUS` | 创建工单时的**必填** Job Status，需与账号内状态一致，默认 `Quote` | 可选 |
| `SERVICEM8_JOB_DESCRIPTION` | 工单描述（简短），默认 `Whole house electric health check`；详细内容（来源、摘要等）在工单 Notes 中 | 可选 |
| `SERVICEM8_COMPANY_CONTACT_TYPE` | Company Contact 分类，默认 `Job Contact`（也可 `Billing Contact` / `Property Manager`） | 可选 |
| `SERVICEM8_JOB_CONTACT_TYPE` | Job Contact 分类，默认 `Job Contact`（也可 `Billing Contact` / `Property Manager`） | 可选 |
| `SNAPSHOT_SIGNING_SECRET` | 用于对 lead token 加密（AES-GCM）及 `lead_id + timestamp` 做 HMAC 签名；与 send-booking 共用 | **是**（若要用该链接） |
| `SERVICEM8_LINK_MAX_AGE_SECONDS` | 链接有效期秒数，默认 `604800`（7天） | 可选 |
| `SITE_URL` | 站点根 URL（如 `https://yoursite.netlify.app`），用于在**邮件正文**里生成「Create ServiceM8 Job」可点击链接 | 若要在邮件里看到链接则**必填** |
| `INSPECTION_BASE_URL` | Inspection 站点根 URL（如 `https://inspection.example.com`），用于回推 `job_uuid + job_number` | 可选（不配则跳过回推） |
| `INTERNAL_API_KEY` | 调用 Inspection 内部端点 `/api/internal/service-job-link` 的 API Key（通过 `x-internal-api-key` 传递） | 若启用回推则**必填** |

- 密钥只放在环境变量中，不要写进代码或仓库。
- `SNAPSHOT_SIGNING_SECRET` 需与 `send-booking` 中生成签名时使用的值一致（同一次部署内由 Netlify 注入）。

## 2. 流程简述

1. 用户完成快照并提交（lead 表单或 quickcall）。
2. `send-booking` 发邮件并在响应中返回 `servicem8: { lead_id, timestamp, sig }`（需配置 `SNAPSHOT_SIGNING_SECRET`）。
   - `lead_id` 为加密 token（`v1.<iv>.<ciphertext>.<tag>`），不再暴露明文客户信息。
3. `send-booking` 在邮件正文中生成「Create ServiceM8 Job」可点击链接：  
   `/.netlify/functions/createServiceM8Job?lead_id=...&timestamp=...&sig=...`
4. 收件人从邮件点击后 `createServiceM8Job`：校验签名 + 有效期（默认 7 天）→ 解密 lead token → 按 email/phone 查找或创建 Company → 创建 Job 与 Note。
5. 若配置了 `INSPECTION_BASE_URL` + `INTERNAL_API_KEY`，会把 `job_uuid + job_number` 回推给 Inspection 的 `/api/internal/service-job-link`（失败仅记 warning，不阻断主流程）。

## 3. 本地测试脚本

```bash
# 1. 在项目根目录建 .env（勿提交），例如：
#    SNAPSHOT_SIGNING_SECRET=your-secret
#    NETLIFY_DEV_URL=http://localhost:8888

# 2. 启动本地 Netlify
npx netlify dev

# 3. 另开终端执行
npx ts-node scripts/test-servicem8-create-job.ts
# （可选）只验证回推 Inspection：
npx ts-node scripts/test-inspection-link-push.ts
```

脚本会使用 mock 的 lead  payload 调用 `createServiceM8Job`（POST），并打印返回的 `company_uuid` / `job_uuid` 或错误信息。

## 5. 字段说明（若后台仍看不到）

- **Company**：创建/更新时传 `name`、`email`、`phone`、`address` / `address_1`。若你处地址字段名不同，需对照 [ServiceM8 Company API](https://developer.servicem8.com/reference/createclients) 调整。
- **Job**：`job_description` 为简短描述；详细内容同时写入 `notes` 与 `job_notes`（按你账号接受的字段保留其一即可）。
- **Contact**：先创建 Company Contact（`companycontact`），再创建 Job Contact（`jobcontact`）并关联 `company_contact_uuid`；若 Job Contact 仅支持直接填 name/email/phone 或 mobile，代码中也有 fallback。

## 4. 日志（不记录敏感信息）

- 会记录：request id、lead_id 前缀、created/reused company_uuid、created job_uuid。
- 不会记录：`SERVICEM8_API_KEY`、完整 lead_id 或签名。
