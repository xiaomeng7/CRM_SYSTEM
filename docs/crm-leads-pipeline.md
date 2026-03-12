# CRM Leads Pipeline

Leads 咨询销售 pipeline：阶段定义、状态流转、以及从 Contact 创建 Lead 的规则。

## Pipeline 阶段（leads.status）

| 状态 | 说明 |
|------|------|
| **new** | 新线索，未联系 |
| **contacted** | 已联系 |
| **qualified** | 已确认意向/合格 |
| **booked** | 已预约 |
| **completed** | 已完成（未转 Opportunity 的完结） |
| **converted** | 已转为 Opportunity（终态，不可再改状态） |

- 前 5 个为可编辑的 pipeline 阶段，用户在 Leads 页面通过下拉框直接修改。
- **converted** 仅由「Convert」操作设置，不能通过 PATCH status 写入。

## 状态流转

- **正常流转**：new → contacted → qualified → booked → completed（顺序不强制，可任意选其一）。
- **转商机**：任意非 converted 状态均可点击「Convert」→ 变为 converted，并创建一条 Opportunity。
- **限制**：status 一旦为 converted，不可再通过 PATCH 修改；只能通过 Convert 变为 converted。

## API

### PATCH /api/leads/:id/status

更新 Lead 状态（仅限 pipeline 阶段）。

**Request body**

```json
{
  "status": "contacted"
}
```

**允许的 status**：`new`、`contacted`、`qualified`、`booked`、`completed`。

**说明**：不允许把 status 设为 `converted`；已 converted 的 lead 会返回 400。

### POST /api/leads

创建 Lead。从 Contacts 页「Create Lead」调用时使用下面参数。

**Request body（Contact 转 Lead 示例）**

```json
{
  "source": "contact_reactivation",
  "contact_id": "uuid-of-contact",
  "account_id": "uuid-of-account-or-null"
}
```

- **source**：来源，如 `contact_reactivation`。
- **contact_id**：当前 contact 的 UUID。
- **account_id**：当前 contact 关联的 account（linked_account_id），可为 null。

**行为**：创建时 `status` 固定为 `new`。

## Contacts → Lead 转换逻辑

1. 在 **Contacts** 页面，每条 contact 有「Create Lead」按钮。
2. 点击后调用 **POST /api/leads**，传：
   - `source = "contact_reactivation"`
   - `contact_id = 当前 contact.id`
   - `account_id = 当前 contact.linked_account_id`（无则 null）
3. 后端创建一条 lead：`status = "new"`，并关联该 contact 与 account。
4. 用户可在 **Leads** 页面看到新 lead，并通过状态下拉框推进 pipeline（new → contacted → qualified → booked → completed）或点击「Convert」转为 Opportunity。

## UI 简要

- **Leads 页**：Status 列为下拉框（new / contacted / qualified / booked / completed）；已 converted 的只显示 “converted” 徽章，无下拉、无 Convert 按钮。
- **Contacts 页**：每行操作区有「Create Lead」，点击即按上述逻辑创建 lead。
