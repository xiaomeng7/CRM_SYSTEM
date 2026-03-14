# Reactivation Queue / Campaign 页面

## 1. 页面用途

SMS Campaign 页面是客户激活系统的**执行层**，用于完成：

1. 生成短信队列
2. 查看 batch 列表
3. 预览和编辑短信内容
4. 人工确认后批量发送

与 dashboard（总览层）和 Reply Inbox（回复处理层）配合，形成完整的激活流程。

## 2. 左中右三栏

| 栏位 | 模块 | 功能 |
|------|------|------|
| 左 | Generate Queue | 输入 limit、min_priority_score，点击生成预览队列 |
| 中 | Batch List | 显示历史 batch 列表，按 batch_id 分组，展示 preview/sent/failed 数量 |
| 右 | Batch Preview | 选中 batch 后显示详情表格、Message Detail 面板、发送按钮 |

## 3. 表格与 Message 摘要

- 表格中 **Message** 列只显示前约 70 个字符，超出部分显示 `...`，避免长短信撑坏布局
- 鼠标 **hover** 在 Message 列可看到完整内容（通过 `title` 属性）
- 每行有 **View / Edit** 按钮，点击行或按钮可在右侧详情区查看全文

## 4. 如何查看全文

1. 在 Batch Preview 表格中点击任意行，或点击该行的 "View / Edit"
2. 右侧 **Message Detail** 面板会显示该条短信的完整内容
3. 包含：contact_name、account_name、phone、priority_score、status，以及完整 message（textarea）

## 5. 如何选择模板

1. 在 Message Detail 面板中，使用 **Message Template** 下拉框
2. 提供 5 个选项：Default Reactivation、Friendly Check-in、Short Follow-up、Builder / Business、Investor / Rental
3. 切换模板后，点击 **Reset to Template** 可将 textarea 内容替换为当前模板生成的内容（`{first_name}` 会替换为 contact 的 first name，若无则用 "there"）

## 6. 如何编辑单条短信

1. 选中一条 queue item（preview 或 queued 状态）
2. 在 textarea 中直接修改内容
3. 点击 **Save This Message** 保存到数据库
4. 成功后表格中的 message 摘要会同步更新

## 7. sent 状态为什么不可编辑

- 已发送（status = sent）的短信不允许再编辑
- textarea 会变为只读，模板选择器与 Reset / Save 按钮会隐藏
- 防止误改已发送内容，保证审计一致性

## 8. 批量应用模板

- 点击 **Apply Template to Entire Batch** 按钮
- 在弹窗中选择模板并确认
- 会对当前 batch 中所有 status 为 preview 或 queued 的项批量更新 message
- 只处理未发送项，已 sent 的不会被修改

## 9. 生成队列如何工作

1. 用户输入 limit（默认 20）、min_priority_score（默认 40）
2. 点击 "Generate Preview Queue"
3. 前端调用 `POST /api/reactivation/queue/generate`，body: `{ limit, min_priority_score }`
4. 后端从 `crm_account_reactivation_contacts` 选出候选，排除近期联系、已在队列的 contact，生成 preview 队列
5. 返回 `{ generated, batch_id, items }`
6. 前端刷新 batch 列表，自动选中新 batch，右侧展示预览

## 10. 如何预览 batch

1. 中间栏从 `GET /api/reactivation/queue?limit=300` 拉取最近队列项
2. 前端按 `batch_id` 分组，生成 batch 列表
3. 点击某 batch 后，调用 `GET /api/reactivation/queue?batch_id=xxx` 获取该 batch 详情
4. 右侧显示表格和 Message Detail 面板

## 11. 为什么发送前必须输入 SEND

- **防误触**：避免误点导致批量发送
- **二次确认**：用户必须主动输入 "SEND"，表示明确同意发送
- **可追溯**：人工确认流程清晰，符合安全原则

## 12. 发送成功后会发生什么

1. 弹窗关闭
2. 右侧显示 send result：`attempted / sent / failed`
3. 自动刷新 batch 列表
4. 自动刷新当前 batch 预览（status 更新为 sent/failed）

## 13. API

| 方法 | 路径 | 说明 |
|------|------|------|
| PATCH | `/api/reactivation/queue/:id/message` | 更新单条 queue item 的 message，body: `{ message }` |
| POST | `/api/reactivation/queue/apply-template` | 批量应用模板，body: `{ batch_id, template_key }` |

## 14. 未来可扩展

- **Batch history**：按时间筛选、导出
- **Retry**：对 failed 项单独重试
- **Filters**：按 suburb、jobs_count 等筛选候选
- **Dashboard 统计**：将 queue 中 preview/sent 数量接入 dashboard 卡片
