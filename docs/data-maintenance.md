# Data Maintenance 页面

## 1. 页面路径与导航

- 页面：`/data-maintenance.html`
- 导航名称：Data Maintenance
- 所有 sidebar 页面均已添加此入口

## 2. 页面结构（三栏）

| 区域 | 说明 |
|------|------|
| **A. Data Quality Checks** | 只读检查，点击后调用 report API，在下方展示结果 |
| **B. Data Cleaning Tools** | 执行动作，需在弹窗中输入 CONFIRM 才执行 |
| **C. Execution Reports** | 显示最近执行动作的摘要（title、executed_at、affected、summary） |

## 3. 只读 Report（Data Quality Checks）

| 类型 | API | 说明 |
|------|-----|------|
| Duplicate Phones | `GET /api/data-maintenance/report?type=duplicate-phones` | 重复手机号及出现次数 |
| Duplicate Emails | `GET /api/data-maintenance/report?type=duplicate-emails` | 重复邮箱（normalized）及次数 |
| Missing Suburb | `GET /api/data-maintenance/report?type=missing-suburb` | 有 address_line 但 suburb 缺失的 accounts |
| Contacts Without Phone | `GET /api/data-maintenance/report?type=contacts-without-phone` | 无电话的联系人 |
| Suspicious Contacts | `GET /api/data-maintenance/report?type=suspicious-contacts` | 无 phone/email 且 name 含 Job/Card/PAYPAL 等噪音 |
| Do Not Contact | `GET /api/data-maintenance/report?type=do-not-contact` | 已标记勿联系的联系人 |

## 4. 执行动作（Data Cleaning Tools）

均需在弹窗中输入 `CONFIRM` 才执行。

| 动作 | 说明 |
|------|------|
| Normalize Phone Numbers | 去除 phone 中非数字字符 |
| Normalize Email Addresses | trim + lowercase |
| Fill Missing Suburb From Jobs | 从 jobs.suburb 回填 accounts.suburb |
| Rebuild Segmentation Views | 重新执行 005/006/007/012 迁移，刷新 segmentation views |

## 5. 确认机制

- 点击任一执行动作 → 弹出 modal
- 输入框必须输入 `CONFIRM`（全大写）
- 「确认执行」按钮在输入正确前 disabled
- 失败时显示错误信息

## 6. 暂不执行的動作

- **Archive Suspicious Contacts**：有数据风险，当前仅提供 report 预览，不接执行
