# Contact / Account 详情页

## 1. Contact Detail 页面

路径：`/contact-detail.html?id=<contact_id>`

显示内容：

- Contact 基本信息：name、phone、email、status、do_not_contact
- Account 基本信息：account_name、suburb、postcode
- 最近 activities（最近 10 条）
- 最近 tasks（open / pending）
- 最近 inbound_sms（replies）
- 关联 leads

API：`GET /api/contacts/:id/detail`

## 2. Account Detail 页面

路径：`/account-detail.html?id=<account_id>`

显示内容：

- Account 基本信息：name、address_line、suburb、postcode
- 关联 contacts
- 历史 jobs（最近若干条）
- segmentation 摘要（jobs_count、last_job_date、priority_score 等，如方便）
- 最近 activities（可选）

API：`GET /api/accounts/:id/detail` 或 `GET /api/accounts/:id` 加额外接口

## 3. 各页面接入

| 页面 | Details 入口 | 跳转目标 |
|------|--------------|----------|
| reactivation-dashboard | 今日优先客户「详情」 | contact_id 有则 → contact-detail；否则 → account-detail |
| reply-inbox | 打开客户档案 | contact-detail |
| contacts | Details 按钮 | contact-detail |
| leads | 如有合适位置 | contact-detail / account-detail |
