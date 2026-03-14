# Reactivation Queue / Campaign 页面

## 1. 页面用途

SMS Campaign 页面是客户激活系统的**执行层**，用于完成：

1. 生成短信队列
2. 查看 batch 列表
3. 预览某个 batch 的短信内容
4. 人工确认后批量发送

与 dashboard（总览层）和 Reply Inbox（回复处理层）配合，形成完整的激活流程。

## 2. 左中右三栏

| 栏位 | 模块 | 功能 |
|------|------|------|
| 左 | Generate Queue | 输入 limit、min_priority_score，点击生成预览队列 |
| 中 | Batch List | 显示历史 batch 列表，按 batch_id 分组，展示 preview/sent/failed 数量 |
| 右 | Batch Preview | 选中 batch 后显示详情表格和发送按钮 |

## 3. 生成队列如何工作

1. 用户输入 limit（默认 20）、min_priority_score（默认 40）
2. 点击 "Generate Preview Queue"
3. 前端调用 `POST /api/reactivation/queue/generate`，body: `{ limit, min_priority_score }`
4. 后端从 `crm_account_reactivation_contacts` 选出候选，排除近期联系、已在队列的 contact，生成 preview 队列
5. 返回 `{ generated, batch_id, items }`
6. 前端刷新 batch 列表，自动选中新 batch，右侧展示预览

## 4. 如何预览 batch

1. 中间栏从 `GET /api/reactivation/queue?limit=300` 拉取最近队列项
2. 前端按 `batch_id` 分组，生成 batch 列表
3. 点击某 batch 后，调用 `GET /api/reactivation/queue?batch_id=xxx` 获取该 batch 详情
4. 右侧显示表格：contact_name, account_name, phone, priority_score, status, message

## 5. 为什么发送前必须输入 SEND

- **防误触**：避免误点导致批量发送
- **二次确认**：用户必须主动输入 "SEND"，表示明确同意发送
- **可追溯**：人工确认流程清晰，符合安全原则

## 6. 发送成功后会发生什么

1. 弹窗关闭
2. 右侧显示 send result：`attempted / sent / failed`
3. 自动刷新 batch 列表
4. 自动刷新当前 batch 预览（status 更新为 sent/failed）

## 7. 未来可扩展

- **Batch history**：按时间筛选、导出
- **Retry**：对 failed 项单独重试
- **Filters**：按 suburb、jobs_count 等筛选候选
- **Dashboard 统计**：将 queue 中 preview/sent 数量接入 dashboard 卡片
