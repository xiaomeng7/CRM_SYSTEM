## Twilio 短信回复闭环（MVP）

本文件说明 CRM 中老客户激活短信的最小可用“发得出去 + 收得回来”闭环实现方式。

### 1. Outbound SMS 如何发送

- **触发入口**：Contacts 页面上的 `Send Reactivation SMS` 按钮。
- **API 路由**：`POST /api/contacts/:id/reactivate`（见 `apps/crm/api/routes/contacts.js`）。
- **发送逻辑**：
  - 通过 `contacts.getById(id)` 读取联系人，要求 `contact.phone` 存在。
  - 调用 `@bht/integrations` 中的 `sendSMS(contact.phone, message)` 发送短信。
  - 在 `activities` 表中写入一条记录：
    - `contact_id`：当前联系人
    - `lead_id` / `opportunity_id`：`NULL`
    - `activity_type`：`'sms'`（用于 outbound，保持兼容）
    - `summary`：`'reactivation message sent'`
    - `created_by`：`'crm'`

> 说明：目前 outbound 仍然用 `activity_type = 'sms'`，而 inbound 使用更细分的 `inbound_sms` / `inbound_sms_unmatched`，在分析时可以通过 `created_by` 和 `activity_type` 组合区分。

### 2. Reactivation SMS 文案（标识发送者）

当前 reactivation 短信模板如下（在 `POST /api/contacts/:id/reactivate` 中）：

- **核心特性**：
  - 开头明确身份：`Hi <name>, this is Meng from Better Home Technology.`
  - 说明是旧客户回访：`We worked together before and I'm checking in to see how everything is going.`
  - 明确提示可以直接回复：`you can reply to this message and I will get back to you.`

这样可以让客户清楚知道是谁发的，并且知道可以直接回复同一短信通道。

### 3. Inbound SMS Webhook 如何工作

- **Webhook 路由**：`POST /api/webhooks/twilio/inbound-sms`
  - 定义位置：`apps/crm/api/routes/webhooks.js`
  - 挂载方式：在 `apps/crm/api/index.js` 中通过 `app.use('/api/webhooks', webhooksRouter)`。
- **请求格式**：
  - 使用 `express.urlencoded({ extended: false })` 解析 `application/x-www-form-urlencoded`（Twilio 默认格式）。
- **读取字段**（兼容大小写差异）：
  - `From` / `from`：客户手机号
  - `To` / `to`：接收号码（当前仅用于调试）
  - `Body` / `body`：短信正文
  - `MessageSid` / `SmsMessageSid`：Twilio 消息 ID（可选）
- **校验规则**：
  - 如缺少 `From` 或 `Body`，返回 `400 { ok: false, error: 'Missing required fields: From, Body' }`。

### 4. 如何按手机号匹配 contact

1. 从 webhook 请求体中读取 `From`。
2. 调用清洗层中的 `normalizePhone(from)`（`apps/crm/lib/crm/cleaning`）进行归一化：
   - 去掉空格、括号、连字符等非数字字符。
   - 保留核心数字格式，用于与 `contacts.phone` 对齐。
3. 使用归一化后的手机号执行精确匹配：
   - 查询语句（简化）：
     - `SELECT id, name, account_id FROM contacts WHERE phone = $1 LIMIT 1`
   - **不做模糊匹配**，只做一次精确匹配。
4. 匹配结果：
   - 若找到，得到：
     - `contact_id`
     - `contact.name`
     - `account_id`（如存在）
   - 若未找到：
     - 标记为“unmatched inbound sms”（见下一节），不会抛错中断 webhook。

### 5. inbound activity 如何记录

#### 5.1 匹配到 contact 的情况

- 在 `activities` 表中插入一条新记录：
  - `contact_id`：匹配到的联系人 ID
  - `lead_id` / `opportunity_id`：`NULL`
  - `activity_type`：`'inbound_sms'`
  - `summary`：客户回复正文（在代码中做了长度限制，超长会截断到 500 字左右）
  - `created_by`：`'twilio-webhook'`

这条记录代表“某个已知联系人通过短信回复了我们”。

#### 5.2 未匹配到 contact 的情况

- 在服务器日志中输出 warning：
  - 包含原始 `From` 号码以及归一化结果，方便后续排查。
- 在 `activities` 表中插入一条“未匹配”记录：
  - `contact_id`：`NULL`
  - `lead_id` / `opportunity_id`：`NULL`
  - `activity_type`：`'inbound_sms_unmatched'`
  - `summary`：客户回复正文（截断）
  - `created_by`：`'twilio-webhook'`

> 说明：通过 `activity_type = 'inbound_sms_unmatched'` 可以后续统一查看未识别手机号，必要时手动创建或合并联系人。

### 6. follow-up task 如何自动创建

当 webhook 成功匹配到某个 contact 时：

1. **先写入 inbound activity**（见上节）。
2. 然后检查最近是否已经为该 contact 创建过跟进任务：
   - 查询 `tasks` 表：
     - 条件：
       - `contact_id = 当前联系人`
       - `created_by = 'twilio-webhook'`
       - `created_at >= NOW() - INTERVAL '24 hours'`
   - 若找到记录，则认为“过去 24 小时内已经因为短信回复创建过跟进任务”，**本次不再重复创建**。
3. 若未找到重复任务，则自动创建一条新的 task：
   - `title`：
     - `Follow up SMS reply from <contact name>`（如无名字则退化为 `customer`）
   - `contact_id`：当前联系人 ID
   - `account_id`：如 schema 支持、且有值，则一并使用；当前实现仅依赖 `contact_id`。
   - `status`：`'open'`
   - `due_at`：`NOW()`（尽快处理）
   - `created_by`：`'twilio-webhook'`

> 设计理由：每条 inbound reply 至少触发一次人工跟进；但在 24 小时内重复回复（例如“谢谢”“好的”等）不会爆炸式创建任务。

### 7. 为什么当前先创建 task，而不是自动创建 lead

- inbound 回复可能是：
  - “谢谢”
  - “STOP”
  - “打错了”
  - 简单确认或寒暄
- 如果每条 inbound 回复都自动创建 lead：
  - 会导致 Leads 列表迅速膨胀；
  - 大量无效或低价值意图被当作“新商机”，增加维护成本。
- 当前策略：
  - **统一先创建 follow-up task**，在 Tasks 页面由人工判断：
    - 是否需要新建 lead；
    - 是否需要合并到现有机会；
    - 是否做进一步沟通。
- 未来可以在此基础上再挂接更智能的规则或 AI 分类（例如只对部分关键词自动创建 lead），但不在本次 MVP 范围内。

### 8. 现在如果客户回复了，你应该去哪里看

- **首选视图：Tasks 页面**
  - inbound 短信会在匹配 contact 后自动创建一条任务：
    - 标题格式：`Follow up SMS reply from <contact name>`
    - 状态：`open`
    - 来源：`created_by = 'twilio-webhook'`
  - 你可以在 Tasks 列表中按：
    - `created_by = 'twilio-webhook'`
    - `status = 'open'`
    - 最近创建时间
  - 来快速筛选出“哪些客户刚刚回复了，需要跟进”。

- **辅助视图：Activities（如有页面）**
  - 可通过 `activity_type = 'inbound_sms'` 查看所有已匹配回复。
  - 通过 `activity_type = 'inbound_sms_unmatched'` 查看未匹配手机号，必要时手动创建或修复联系人。

### 9. 未来如何扩展成完整 Inbox / Reply Queue

当前设计已经为未来的“短信收件箱 / 回复队列”预留了数据基础：

- **基础数据来源**：
  - `activities` 中的：
    - `activity_type IN ('inbound_sms', 'inbound_sms_unmatched')`
  - `tasks` 中：
    - `created_by = 'twilio-webhook'`
    - `status` 为 `open` / `pending`

未来可以扩展的方向（本次暂未实现，仅作为路线）：

- **Inbox 视图**：
  - 新建一个 UI 页面，将 `inbound_sms` activities 按时间倒序展示；
  - 按联系人聚合，显示最近一条回复和上下文。
- **Reply Queue**：
  - 针对 `created_by = 'twilio-webhook'` 且 `status = 'open'` 的 tasks，做一个专门的“需要回电 /回信”队列视图。
- **更智能的去重与分组**：
  - 将多条 inbound 回复聚合到同一个“会话”或 thread 中；
  - 对 STOP / 退订类关键词进行特殊处理。

> 总结：当前版本已经完成“发 + 收 + 自动建 task + 简单去重”的完整闭环，业务只需要在 Tasks 页面处理由 `twilio-webhook` 创建的待办，即可跟进所有短信回复。未来如需更丰富的短信 Inbox 体验，可以在此基础上增量演进。

