# GA4 每日报告设置详细步骤

## 🎯 目标
设置每天自动收到包含关键指标的邮件报告。

---

## 方法一：GA4 内置邮件报告（最简单）

### 步骤 1: 创建概览报告

1. **登录 GA4**
   - 访问：https://analytics.google.com/
   - 选择你的属性（Risk Snapshot Website）

2. **进入报告页面**
   - 点击左侧菜单 **"报告"**（Reports）
   - 点击 **"概览"**（Overview）

3. **设置报告时间范围**
   - 点击右上角的日期选择器
   - 选择 **"昨天"**（Yesterday）或 **"最近 7 天"**（Last 7 days）
   - 这样报告会显示最近的数据

### 步骤 2: 配置邮件发送

1. **点击分享按钮**
   - 在报告页面右上角，找到 **"分享"**（Share）图标（通常是三个点或分享图标）
   - 点击它

2. **选择邮件发送**
   - 在弹出的菜单中，选择 **"通过电子邮件发送"**（Email）或 **"计划发送"**（Schedule email）

3. **填写邮件信息**
   ```
   收件人：你的邮箱地址（例如：your-email@gmail.com）
   主题：Risk Snapshot 每日报告 - [日期]
   频率：每天（Daily）
   时间：选择你希望收到邮件的时间（例如：每天上午 9:00）
   格式：HTML（推荐）或 PDF
   ```

4. **保存设置**
   - 点击 **"发送"** 或 **"保存"**
   - 系统会提示你已设置成功

### 步骤 3: 验证设置

1. **检查邮箱**
   - 等待到设定的时间
   - 检查收件箱（包括垃圾邮件文件夹）
   - 你应该会收到第一封报告邮件

2. **调整设置（如需要）**
   - 如果没收到，回到 GA4
   - 管理 → 资源设置 → 查看邮件报告设置
   - 确认邮箱地址正确

---

## 方法二：创建自定义报告（推荐，更详细）

### 步骤 1: 创建探索报告

1. **进入探索功能**
   - 点击左侧菜单 **"探索"**（Explore）
   - 点击 **"+"** 创建新的探索

2. **选择报告类型**
   - 选择 **"自由格式"**（Free Form）

3. **配置维度（行）**
   - 在左侧面板，找到 **"维度"**（Dimensions）
   - 添加：
     - `事件名称`（Event name）
     - `日期`（Date）

4. **配置指标（值）**
   - 找到 **"指标"**（Metrics）
   - 添加：
     - `事件计数`（Event count）
     - `用户数`（Users）

5. **添加筛选器**
   - 点击 **"添加筛选条件"**（Add filter）
   - 选择 `事件名称`
   - 包含以下事件：
     - `page_open`
     - `snapshot_start`
     - `eligibility_complete`
     - `snapshot_complete`
     - `lead_form_view`
     - `lead_submit`
     - `quick_call_open`

6. **保存报告**
   - 点击右上角 **"保存"**
   - 命名为："每日漏斗报告"

### 步骤 2: 设置邮件发送

1. **在探索报告中**
   - 点击右上角的 **"分享"** 图标
   - 选择 **"通过电子邮件发送"**

2. **配置邮件**
   ```
   收件人：你的邮箱
   频率：每天
   时间：每天上午 9:00
   包含：完整报告
   ```

---

## 方法三：使用 Google Sheets + Apps Script（高级，可自定义）

### 步骤 1: 创建 Google Sheet

1. **新建 Google Sheet**
   - 访问：https://sheets.google.com/
   - 创建新表格
   - 命名为："GA4 每日报告"

2. **设置表头**
   ```
   A1: 日期
   B1: page_open
   C1: snapshot_start
   D1: eligibility_complete_yes
   E1: eligibility_complete_no
   F1: snapshot_complete_yes
   G1: snapshot_complete_no
   H1: lead_form_view
   I1: lead_submit
   J1: quick_call_open
   K1: 转化率_开始
   L1: 转化率_完成
   M1: 转化率_提交
   ```

### 步骤 2: 连接 GA4 数据

1. **安装 GA4 插件**
   - 在 Google Sheet 中，点击 **"扩展程序"**（Extensions）
   - 选择 **"获取加载项"**（Get add-ons）
   - 搜索 "Google Analytics" 或 "GA4"
   - 安装官方插件

2. **配置数据连接**
   - 扩展程序 → Google Analytics → 创建新报告
   - 选择你的 GA4 属性
   - 配置要提取的数据

### 步骤 3: 设置自动更新和邮件

1. **使用 Apps Script**
   - 扩展程序 → Apps Script
   - 编写脚本自动获取数据并发送邮件
   - 设置定时触发器（每天执行）

**示例脚本**（简化版）：
```javascript
function sendDailyReport() {
  // 获取 GA4 数据
  // 格式化报告
  // 发送邮件
  MailApp.sendEmail({
    to: 'your-email@gmail.com',
    subject: 'GA4 每日报告 - ' + new Date().toLocaleDateString(),
    body: '报告内容...',
    htmlBody: '<h1>每日报告</h1><p>数据...</p>'
  });
}
```

---

## 方法四：使用第三方工具（最简单，但可能需要付费）

### 推荐工具

1. **Supermetrics**
   - 网址：https://supermetrics.com/
   - 功能：自动从 GA4 提取数据并发送邮件
   - 价格：有免费试用，付费版功能更强大

2. **Data Studio + 邮件通知**
   - 创建 Data Studio 报告
   - 设置邮件分享
   - 每天自动发送

---

## 📊 推荐的报告内容模板

### 每日报告应包含：

```
📈 Risk Snapshot 每日报告 - [日期]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 基础指标
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 今日用户数：XXX
• 今日会话数：XXX
• 今日页面浏览量：XXX

🎯 漏斗事件
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 页面打开 (page_open)：XXX
• 开始快照 (snapshot_start)：XXX
• 资格检查完成 (eligibility_complete)：
  - 符合条件 (yes)：XXX
  - 不符合条件 (no)：XXX
• 快照完成 (snapshot_complete)：
  - 有不确定性 (yes)：XXX
  - 低不确定性 (no)：XXX
• 查看联系表单 (lead_form_view)：XXX
• 提交表单 (lead_submit)：XXX
• 打开快速通话 (quick_call_open)：XXX

📉 转化率
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 开始率：XX% (snapshot_start / page_open)
• 完成率：XX% (snapshot_complete / snapshot_start)
• 提交率：XX% (lead_submit / lead_form_view)

💡 洞察
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 今日有 X 位用户完成了完整流程
• 转化率较昨日 [上升/下降] X%
• 建议关注：XXX

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
查看完整报告：https://analytics.google.com/
```

---

## ✅ 检查清单

设置完成后，确认：

- [ ] GA4 Measurement ID 已正确配置
- [ ] 网站已部署并可以访问
- [ ] DebugView 显示事件正常发送
- [ ] 邮件报告已设置
- [ ] 收到第一封测试邮件
- [ ] 报告内容符合预期

---

## 🔧 故障排除

### 问题：收不到邮件

**解决方法**：
1. 检查垃圾邮件文件夹
2. 确认邮箱地址正确
3. 检查 GA4 中的邮件设置
4. 等待 24 小时，有时需要时间生效

### 问题：报告数据不准确

**解决方法**：
1. 确认埋点代码已正确部署
2. 使用 DebugView 验证事件
3. 检查事件名称拼写是否正确
4. 等待数据积累（新安装可能需要 24-48 小时）

### 问题：想要更详细的报告

**解决方法**：
1. 使用探索功能创建自定义报告
2. 使用 Google Data Studio
3. 考虑使用第三方工具（如 Supermetrics）

---

## 📞 需要帮助？

- GA4 帮助中心：https://support.google.com/analytics
- GA4 社区论坛：https://support.google.com/analytics/community

---

**提示**：建议先使用方法一（最简单），熟悉后再尝试其他方法。
