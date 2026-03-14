# CRM Data Cleaning Layer

本文描述在 ServiceM8 Sync 与 Landing Page Ingestion 进入 CRM 之前的**数据清洗层 (cleaning layer)**，目标是保证写入数据库的数据尽量标准化、可分析。

---

## 1. Cleaning Modules

代码位置：

- `apps/crm/lib/crm/cleaning/`
  - `normalizePhone.js`
  - `normalizeEmail.js`
  - `normalizeName.js`
  - `normalizeSuburb.js`
  - `detectSuspiciousContact.js`
  - `cleanContact.js`
  - `cleanAccount.js`
  - `index.js`（聚合导出）

同步和入口：

- ServiceM8 sync（`apps/crm/services/servicem8-sync.js`）：
  - companies → `cleanAccount`
  - contacts → `cleanContact`
- Landing page ingestion（`apps/crm/services/public-leads.js`）：
  - web 表单 → `cleanContact` + `cleanAccount`

---

## 2. Normalization Rules

### 2.1 Phone — `normalizePhone(phone: string | null): string | null`

规则：

1. **保留数字**：去掉空格、括号、加号等非数字字符。
2. **处理 +61 移动号**：
   - 对 `+61 4XXXXXXXX` / `614XXXXXXXXX`，统一转换为 `04XXXXXXXX`。
3. **长度校验**：
   - 仅接受 **9–10 位数字**，否则返回 `null`。
4. 返回归一化后的纯数字字符串，例如：
   - `0412 345 678` → `0412345678`
   - `+61412345678` → `0412345678`

### 2.2 Email — `normalizeEmail(email: string | null): string | null`

规则：

1. `trim` + `toLowerCase`；
2. 长度 \< 5 或不包含 `@` → 视为非法，返回 `null`；
3. 否则返回归一化后的 email。

示例：

- `TEST@GMAIL.COM` → `test@gmail.com`
- ` " user@example.com " ` → `user@example.com`

### 2.3 Name — `normalizeName(name: string | null): string | null`

规则：

1. `trim`；
2. 多个空白合并为一个空格；
3. 全空时返回 `null`。

示例：

- `"  Meng   Zhang "` → `"Meng Zhang"`

### 2.4 Suburb — `normalizeSuburb(suburb: string | null): string | null`

规则：

1. `trim`；
2. 转为小写；
3. 按空格拆分，对每个单词首字母大写，重新拼接。

示例：

- `"mawson lakes"` → `"Mawson Lakes"`
- `"MAWSON LAKES"` → `"Mawson Lakes"`

---

## 3. Suspicious Contact Detection

函数：`detectSuspiciousContact(name, phone, email)`

内部会先调用：

- `normalizeName`
- `normalizePhone`
- `normalizeEmail`

判定规则：

1. `phone` 和 `email` 均为 `null`（或归一后为空）；
2. `name` 中（小写）包含任一关键字：
   - `job`, `card`, `paypal`, `transfer`, `payment`, `help`, `guide`, `test`

满足以上条件则返回 `true`，否则 `false`。

用途：

- 在 `cleanContact` 中用于识别像 `Help Guide Job`、`Card Payment`、`PAYPAL ...` 之类的**非真人联系人**。

---

## 4. Contact & Account Cleaning

### 4.1 `cleanContact(input)`

输入：

- `{ name, phone, email }`

处理流程：

1. `name` → `normalizeName`
2. `phone` → `normalizePhone`
3. `email` → `normalizeEmail`
4. 调用 `detectSuspiciousContact(name, phone, email)`：
   - 若返回 `true` → 返回 `{ skip: true }`（上层逻辑应跳过写库）
   - 否则返回：
     ```js
     { skip: false, name, phone, email }
     ```

当前使用：

- **ServiceM8 contacts sync**：
  - 在写入前调用 `cleanContact`；
  - 若 `skip=true`，计入 `stats.skipped` 并 `continue`；
  - 新建 contacts 时带上 `created_by='servicem8-sync'`。
- **Landing page ingestion**：
  - 对 web 表单中 `name/phone/email` 做统一清洗，再写入 `accounts/contacts/leads`。

### 4.2 `cleanAccount(input)`

输入：

- `{ name, suburb, address_line, postcode }`

处理流程：

1. `name` → `normalizeName`
2. `suburb` → `normalizeSuburb`
3. `address_line` / `postcode`：
   - 若为字符串，`trim` 后非空则保留，否则 `null`。

返回：

```js
{
  name,
  suburb,
  address_line,
  postcode,
}
```

当前使用：

- **ServiceM8 companies sync**：写入 `accounts` 前先 `cleanAccount`。
- **Landing page ingestion**：对 `accounts` 的 `name/suburb` 做统一清洗。

---

## 5. Ingestion Integration

### 5.1 ServiceM8 Sync

- 文件：`apps/crm/services/servicem8-sync.js`

接入点：

1. **Companies → Accounts**
   - 在每条 company 映射为 account 之后，调用：
     ```js
     const cleaned = cleanAccount({ name, suburb, address_line, postcode });
     ```
   - 用清洗后的字段写入/更新 `accounts`；
   - 新建记录时统一设置：
     - `created_by = 'servicem8-sync'`
     - `last_synced_at = NOW()`

2. **Contacts → Contacts**
   - 在映射出 `{ contact_name, phone, email }` 后调用：
     ```js
     const cleaned = cleanContact({ name: contact_name, phone, email });
     if (cleaned.skip) { stats.skipped++; continue; }
     ```
   - 用清洗后的字段写入/更新 `contacts`；
   - 新建记录时统一设置：
     - `created_by = 'servicem8-sync'`
     - `last_synced_at = NOW()`

### 5.2 Landing Page Ingestion

- 文件：`apps/crm/services/public-leads.js`
- 函数：`createFromPublic(body)`

处理流程（不改变业务逻辑，只做清洗）：

1. 从表单 body 读取 `name/phone/email/suburb`；
2. 调用：
   ```js
   const cleanedContact = cleanContact({ name, phone, email });
   const cleanedAccount = cleanAccount({ name, suburb });
   ```
3. 使用 `cleanedContact` / `cleanedAccount` 中的值创建：
   - `accounts`（`created_by='landing-page'`）
   - `contacts`（`created_by='landing-page'`）
   - `leads` / `activities`

> 说明：目前保留了 createFromPublic 中 “缺少 name/phone/email/suburb 报错” 的原有逻辑，仅在写库前对字段做标准化。

---

## 6. Source Marking (`created_by`)

为便于后续做数据审计和分来源分析，新建记录时统一设置：

- ServiceM8 Sync：
  - `accounts.created_by = 'servicem8-sync'`
  - `contacts.created_by = 'servicem8-sync'`
- Landing Page：
  - `accounts.created_by = 'landing-page'`
  - `contacts.created_by = 'landing-page'`
  - `leads.created_by = 'landing-page'`
  - `activities.created_by = 'landing-page'`
- Manual / CRM UI：
  - 推荐使用 `created_by = 'crm-ui'`（可根据现有代码逐步统一）。

---

## 7. Tests

- 文件：`tests/cleaning.test.js`
- 测试覆盖：
  - `normalizePhone('0412 345 678') → '0412345678'`
  - `normalizePhone('+61412345678') → '0412345678'`
  - `normalizeEmail('TEST@GMAIL.COM') → 'test@gmail.com'`
  - `normalizeName('  Meng   Zhang ') → 'Meng Zhang'`
  - `normalizeSuburb('mawson lakes') → 'Mawson Lakes'`
  - `detectSuspiciousContact('Help Guide Job', null, null) → true`
  - `cleanContact({ name: 'Help Guide Job', phone: null, email: null }).skip → true`

运行方式（临时）：

```bash
node tests/cleaning.test.js
```

---

## 8. Summary

通过在 ServiceM8 sync 和 landing-page lead ingestion 前增加 `cleanContact` / `cleanAccount` 等清洗函数，当前 CRM 的新入库数据将：

- 拥有一致的 phone/email/suburb/name 格式；
- 在入口处自动拦截明显的垃圾联系人（如 `Help Guide Job` 等）；
- 带有清晰的来源标记 `created_by`，利于后续审计与分群；
- 更适合未来做：老客户激活、大客户识别、upgrade & energy 潜客识别和客户价值评分。

整个 cleaning layer 只影响“写入前的数据标准化”，不改变业务流程和 UI 展示逻辑，是一层相对安全的防线。 

