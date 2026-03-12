# CRM Contacts 页面

Contacts 页面用于查看和激活老客户，数据来自 domain model 的 `contacts` 和 `accounts` 表。

## 数据来源

- **主表**：`contacts`（domain model）
- **关联表**：`accounts`（LEFT JOIN）
- 数据通过 `import-servicem8-customers` 脚本从 ServiceM8 导入到 contacts / accounts

## API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/contacts` | 列表，支持 `?q=` 搜索 |
| GET | `/api/contacts/:id` | 单条详情（UUID） |
| POST | `/api/contacts/:id/reactivate` | 发送激活短信 |

### GET /api/contacts

**参数**：

- `q`：关键词搜索（name, phone, email, suburb）
- `limit`：条数，默认 100
- `offset`：分页偏移，默认 0

**返回字段**（示意）：

- `id`：contact UUID
- `name`：联系人姓名
- `phone`：电话
- `email`：邮箱
- `suburb`：来自 `accounts.suburb`
- `linked_account_id`：关联 account 的 UUID
- `linked_account_name`：关联 account 名称
- `tags`：占位，当前返回 `[]`
- `reactivation_status`：占位，当前返回 `null`

### 查询实现

- 从 `contacts` 表为主
- `LEFT JOIN accounts ON contacts.account_id = accounts.id`
- `suburb` 取自 `accounts.suburb`，无 account 时 suburb 为 null

### 搜索支持

搜索参数 `q` 会在以下字段做 `ILIKE` 模糊匹配：

- `contacts.name`
- `contacts.phone`
- `contacts.email`
- `accounts.suburb`

## 前端

- 页面：`/contacts.html`
- 加载时调用 `GET /api/contacts`
- 搜索：输入关键词后点击 Search 或按 Enter，请求 `GET /api/contacts?q=...`
- 状态：loading / 无数据 / 错误均有展示

## 字段说明

| 字段 | 来源 | 说明 |
|------|------|------|
| id, name, phone, email | contacts | 真实字段 |
| suburb | accounts.suburb | 真实（来自关联 account） |
| linked_account_id, linked_account_name | accounts | 真实 |
| tags | 占位 | 当前返回 `[]`，无数据库字段 |
| reactivation_status | 占位 | 当前返回 `null`，无数据库字段 |
