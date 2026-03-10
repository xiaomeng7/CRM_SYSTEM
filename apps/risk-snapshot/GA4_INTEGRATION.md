# GA4 集成说明

## ✅ 已完成的修改

### 1. GA4 脚本集成
- 在 `<head>` 中添加了 GA4 gtag 脚本
- 使用占位符 `GA_MEASUREMENT_ID`，方便后续替换

### 2. 埋点函数
- 创建了安全的 `track(eventName, params)` 函数
- 如果 gtag 不存在（如广告拦截器）会静默忽略，不报错

### 3. 事件埋点位置

#### 页面打开
- **位置**: `DOMContentLoaded` 事件
- **事件**: `page_open`
- **参数**: `{ page: 'risk_snapshot' }`

#### Step 1 开始按钮
- **位置**: 点击 "Start (60 seconds) →" 按钮
- **事件**: `snapshot_start`

#### Eligibility 完成
- **位置**: `renderEligibilityEnd()` 函数
- **事件**: `eligibility_complete`
- **参数**: `{ eligible: 'yes' | 'no' }`
- **去重**: 使用 `state._tracked['eligibility_complete']` 确保只触发一次

#### Snapshot 完成
- **位置**: `renderFinal()` 函数
- **事件**: `snapshot_complete`
- **参数**: `{ uncertainty: 'yes' | 'no' }`
- **去重**: 使用 `state._tracked['snapshot_complete']` 确保只触发一次

#### 进入联系表单
- **位置**: 点击 "Book an independent assessment" 按钮
- **事件**: `lead_form_view`
- **去重**: 使用 `state._tracked['lead_form_view']` 确保只触发一次

#### Lead 提交
- **位置**: 表单提交验证通过后，进入 stage=5 前
- **事件**: `lead_submit`
- **参数**: `{ method: 'email_confirm' }`

#### Quick Call Modal
- **位置**: `openCallModal()` 函数
- **事件**: `quick_call_open`

### 4. 事件去重机制
- 在 `state` 对象中添加了 `_tracked: {}` 字段
- 所有需要去重的事件都通过 `state._tracked[eventKey]` 控制
- `restart()` 函数会重置 `state._tracked = {}`

## 🔧 配置步骤

### 替换 GA4 Measurement ID

需要在 **3 个地方** 替换 `GA_MEASUREMENT_ID` 为你的真实 GA4 ID（例如：`G-XXXXXXX`）：

1. **第 9 行** - gtag 脚本 URL：
   ```html
   <script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
   ```
   改为：
   ```html
   <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX"></script>
   ```

2. **第 13 行** - gtag config：
   ```javascript
   gtag('config', 'GA_MEASUREMENT_ID');
   ```
   改为：
   ```javascript
   gtag('config', 'G-XXXXXXX');
   ```

3. **第 328 行** - JavaScript 常量：
   ```javascript
   const GA_MEASUREMENT_ID = "GA_MEASUREMENT_ID";
   ```
   改为：
   ```javascript
   const GA_MEASUREMENT_ID = "G-XXXXXXX";
   ```

## 📊 事件列表

| 事件名称 | 触发时机 | 参数 | 去重 |
|---------|---------|------|------|
| `page_open` | 页面加载完成 | `{ page: 'risk_snapshot' }` | ❌ |
| `snapshot_start` | 点击开始按钮 | - | ❌ |
| `eligibility_complete` | 资格检查完成 | `{ eligible: 'yes'\|'no' }` | ✅ |
| `snapshot_complete` | 快照完成 | `{ uncertainty: 'yes'\|'no' }` | ✅ |
| `lead_form_view` | 进入联系表单 | - | ✅ |
| `lead_submit` | 提交表单 | `{ method: 'email_confirm' }` | ❌ |
| `quick_call_open` | 打开快速通话模态框 | - | ❌ |

## 🧪 测试建议

1. **使用 GA4 DebugView**：
   - 在浏览器中安装 Google Analytics Debugger 扩展
   - 访问网站并执行操作
   - 在 GA4 控制台的 DebugView 中查看实时事件

2. **检查控制台**：
   - 打开浏览器开发者工具（F12）
   - 查看 Console 是否有错误
   - 查看 Network 标签，确认 gtag 请求是否发送

3. **测试场景**：
   - 完整流程：开始 → 完成资格检查 → 完成快照 → 提交表单
   - 快速通话：打开模态框
   - 重启流程：确保事件去重正常工作

## ⚠️ 注意事项

1. **广告拦截器**：如果用户安装了广告拦截器，`track()` 函数会静默失败，不会影响网站功能
2. **事件去重**：`eligibility_complete`、`snapshot_complete`、`lead_form_view` 使用去重机制，避免重复上报
3. **不影响现有功能**：所有修改都是添加性的，不会改变现有的 UI 或交互逻辑
4. **状态管理**：只在 `state` 中添加了 `_tracked` 字段，不影响其他状态字段

## 📝 代码修改位置总结

- **第 6-16 行**: 添加 GA4 gtag 脚本
- **第 328 行**: 添加 GA_MEASUREMENT_ID 常量
- **第 400-405 行**: 在 state 中添加 `_tracked` 字段
- **第 407-420 行**: 添加 `track()` 函数
- **第 441-450 行**: 在 `openCallModal()` 中添加埋点
- **第 658-664 行**: 在 `renderEligibilityEnd()` 中添加埋点
- **第 710-717 行**: 在 `renderFinal()` 中添加埋点
- **第 778-783 行**: 在 "Book" 按钮点击时添加埋点
- **第 929-931 行**: 在表单提交时添加埋点
- **第 1074-1076 行**: 在 "Start" 按钮点击时添加埋点
- **第 1045-1053 行**: 在 `restart()` 中重置 `_tracked`
- **第 1176-1180 行**: 在 `DOMContentLoaded` 中添加页面打开埋点
