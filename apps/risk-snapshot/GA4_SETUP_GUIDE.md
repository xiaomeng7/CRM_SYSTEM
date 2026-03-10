# GA4 完整设置指南 - 从零开始

## 📋 目录
1. [创建 GA4 账号](#1-创建-ga4-账号)
2. [获取 Measurement ID](#2-获取-measurement-id)
3. [配置网站代码](#3-配置网站代码)
4. [验证安装](#4-验证安装)
5. [设置每日报告](#5-设置每日报告)
6. [查看数据](#6-查看数据)
7. [常见问题](#7-常见问题)

---

## 1. 创建 GA4 账号

### 步骤 1.1: 访问 Google Analytics
1. 打开浏览器，访问：https://analytics.google.com/
2. 使用你的 Google 账号登录（如果没有，先注册一个）

### 步骤 1.2: 创建账号
1. 点击左下角的 **"管理"**（Admin）图标（齿轮图标）
2. 在左侧栏，点击 **"创建账号"**（Create Account）
3. 填写账号信息：
   - **账号名称**：例如 "我的网站分析" 或 "Business Analytics"
   - **账号数据共享设置**：可以全部勾选（有助于改进 Google 服务）
   - 点击 **"下一步"**

### 步骤 1.3: 创建属性（Property）
1. **属性名称**：输入 "Risk Snapshot Website" 或你的网站名称
2. **报告时区**：选择你所在的时区（例如：Australia/Adelaide）
3. **货币**：选择你的货币（例如：AUD）
4. 点击 **"下一步"**

### 步骤 1.4: 填写业务信息
1. **行业类别**：选择最接近的（例如：商业和专业服务）
2. **业务规模**：选择你的业务规模
3. **计划如何使用 Google Analytics**：可以多选
4. 点击 **"创建"**

### 步骤 1.5: 接受服务条款
- 阅读并接受 Google Analytics 服务条款
- 点击 **"我接受"**

---

## 2. 获取 Measurement ID

### 步骤 2.1: 创建数据流（Data Stream）
1. 在设置页面，你会看到 **"数据流"**（Data Streams）选项
2. 点击 **"添加数据流"** → **"网站"**（Web）

### 步骤 2.2: 配置数据流
1. **网站网址**：输入你的网站地址
   - 例如：`https://your-site.netlify.app` 或 `https://xiaomeng7.github.io/risk-snapshot-netlify`
2. **数据流名称**：例如 "Risk Snapshot Main"
3. 点击 **"创建数据流"**

### 步骤 2.3: 获取 Measurement ID
1. 创建成功后，你会看到一个页面显示你的 **Measurement ID**
2. 格式类似：`G-XXXXXXXXXX`（G 开头，后面是数字和字母）
3. **重要**：复制这个 ID，稍后会用到

---

## 3. 配置网站代码

### 步骤 3.1: 打开项目文件
1. 打开 `risk-snapshot.html` 文件

### 步骤 3.2: 替换 Measurement ID（3 个地方）

#### 位置 1: 第 9 行 - gtag 脚本 URL
找到：
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
```

替换为（将 `G-XXXXXXXXXX` 替换为你的真实 ID）：
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
```

#### 位置 2: 第 13 行 - gtag config
找到：
```javascript
gtag('config', 'GA_MEASUREMENT_ID');
```

替换为：
```javascript
gtag('config', 'G-XXXXXXXXXX');
```

#### 位置 3: 第 328 行 - JavaScript 常量
找到：
```javascript
const GA_MEASUREMENT_ID = "GA_MEASUREMENT_ID";
```

替换为：
```javascript
const GA_MEASUREMENT_ID = "G-XXXXXXXXXX";
```

### 步骤 3.3: 保存并部署
1. 保存文件
2. 提交到 Git：
   ```bash
   git add risk-snapshot.html
   git commit -m "Configure GA4 Measurement ID"
   git push origin main
   ```
3. 如果使用 Netlify，会自动重新部署；如果使用 GitHub Pages，等待几分钟

---

## 4. 验证安装

### 方法 1: 使用 GA4 DebugView（推荐）

#### 步骤 4.1: 安装浏览器扩展
1. **Chrome**: 安装 "Google Analytics Debugger" 扩展
   - 访问：https://chrome.google.com/webstore/detail/google-analytics-debugger/jnkmfdileelhofjcijamephohjechhna
   - 点击 "添加到 Chrome"

2. **Firefox**: 安装 "Google Analytics Debugger" 扩展
   - 访问：https://addons.mozilla.org/en-US/firefox/addon/google-analytics-debugger/

#### 步骤 4.2: 启用调试模式
1. 打开你的网站
2. 点击浏览器工具栏中的 "Google Analytics Debugger" 图标（确保是启用状态）
3. 刷新页面

#### 步骤 4.3: 查看实时数据
1. 在 GA4 控制台，点击左侧菜单 **"配置"**（Configure）→ **"DebugView"**
2. 你应该能看到实时事件流，包括：
   - `page_open`
   - `snapshot_start`（如果点击了开始按钮）
   - 等等

### 方法 2: 使用 GA4 实时报告
1. 在 GA4 控制台，点击左侧 **"报告"**（Reports）→ **"实时"**（Realtime）
2. 打开你的网站并操作
3. 在实时报告中应该能看到访客数量增加

### 方法 3: 检查浏览器控制台
1. 打开网站，按 F12 打开开发者工具
2. 切换到 **"Network"**（网络）标签
3. 筛选 "gtag" 或 "collect"
4. 你应该能看到发送到 Google Analytics 的请求

---

## 5. 设置每日报告

### 方法 1: GA4 自动邮件报告（推荐）

#### 步骤 5.1: 创建报告
1. 在 GA4 控制台，点击左侧 **"报告"**（Reports）
2. 选择任意报告（例如："概览" 或 "实时"）
3. 点击报告右上角的 **"分享"**（Share）图标
4. 选择 **"通过电子邮件发送"**（Email）

#### 步骤 5.2: 配置邮件报告
1. **收件人**：输入你的邮箱地址
2. **频率**：选择 **"每天"**（Daily）
3. **时间**：选择你希望收到报告的时间（例如：每天上午 9:00）
4. **报告类型**：选择 "概览"（Overview）或自定义报告
5. 点击 **"发送"** 或 **"保存"**

### 方法 2: 使用 Google Analytics Intelligence（智能洞察）

#### 步骤 5.2: 设置智能洞察
1. 在 GA4 控制台，点击左侧 **"报告"** → **"概览"**（Overview）
2. 向下滚动，找到 **"智能洞察"**（Insights）部分
3. 点击 **"查看所有智能洞察"**
4. 可以设置邮件通知，当有重要变化时自动发送

### 方法 3: 使用 Google Data Studio（高级）

如果你想要更详细的每日报告，可以使用 Google Data Studio：
1. 访问：https://datastudio.google.com/
2. 创建新报告
3. 连接 GA4 数据源
4. 设计报告模板
5. 设置定时发送

### 方法 4: 使用第三方工具

- **Supermetrics**: 可以自动发送 GA4 报告到邮箱
- **Google Sheets + Apps Script**: 可以编写脚本自动获取数据并发送邮件

---

## 6. 查看数据

### 6.1 主要报告位置

#### 实时报告（Realtime）
- **位置**：报告 → 实时
- **用途**：查看当前正在访问网站的用户
- **更新频率**：实时（延迟几秒）

#### 概览报告（Overview）
- **位置**：报告 → 概览
- **用途**：查看整体数据概览
- **包含**：用户数、会话数、事件数等

#### 事件报告（Events）
- **位置**：报告 → 参与度 → 事件
- **用途**：查看所有埋点事件
- **包含**：`page_open`, `snapshot_start`, `eligibility_complete` 等

### 6.2 查看漏斗数据

#### 方法 1: 使用探索（Exploration）
1. 点击左侧 **"探索"**（Explore）
2. 选择 **"漏斗探索"**（Funnel Exploration）
3. 添加步骤：
   - 步骤 1: `page_open`
   - 步骤 2: `snapshot_start`
   - 步骤 3: `eligibility_complete`
   - 步骤 4: `snapshot_complete`
   - 步骤 5: `lead_form_view`
   - 步骤 6: `lead_submit`
4. 点击 **"运行"** 查看漏斗转化率

#### 方法 2: 使用事件报告
1. 报告 → 参与度 → 事件
2. 搜索特定事件名称（例如：`eligibility_complete`）
3. 点击事件名称查看详细信息
4. 可以查看事件参数（例如：`eligible: yes/no`）

### 6.3 关键指标说明

| 指标 | 说明 |
|------|------|
| **用户数** | 访问网站的唯一用户数量 |
| **会话数** | 用户访问会话的总数 |
| **事件数** | 所有埋点事件触发的总次数 |
| **转化率** | 完成目标事件的用户百分比 |
| **平均会话时长** | 用户平均在网站上停留的时间 |

---

## 7. 常见问题

### Q1: 为什么看不到数据？
**A**: 可能的原因：
1. **刚安装**：数据可能需要几分钟到几小时才会显示
2. **ID 未替换**：检查是否已将所有 `GA_MEASUREMENT_ID` 替换为真实 ID
3. **广告拦截器**：某些广告拦截器会阻止 GA4
4. **未部署**：确保代码已部署到网站

**解决方法**：
- 使用 DebugView 验证事件是否发送
- 检查浏览器控制台是否有错误
- 等待 24-48 小时让数据积累

### Q2: 如何知道埋点是否正常工作？
**A**: 
1. 使用 DebugView（最准确）
2. 查看实时报告
3. 检查 Network 标签中的 gtag 请求

### Q3: 数据多久更新一次？
**A**:
- **实时报告**：延迟几秒到几分钟
- **标准报告**：通常延迟 24-48 小时
- **历史数据**：可以查看过去的数据

### Q4: 可以追踪哪些信息？
**A**: GA4 可以追踪：
- 页面访问
- 用户行为（点击、滚动等）
- 自定义事件（我们设置的埋点）
- 用户地理位置（国家、城市）
- 设备类型（桌面、手机、平板）
- 浏览器类型
- 等等

**注意**：GA4 默认不追踪个人身份信息（PII），符合隐私法规。

### Q5: 如何查看特定时间段的数据？
**A**:
1. 在任何报告页面，点击右上角的日期范围选择器
2. 选择预设范围（今天、昨天、最近 7 天等）
3. 或自定义日期范围

### Q6: 如何导出数据？
**A**:
1. 在报告页面，点击右上角的 **"导出"**（Export）图标
2. 选择格式：PDF、Google Sheets、CSV
3. 可以导出单个报告或整个数据集

### Q7: 如何设置目标转化？
**A**:
1. 管理 → 事件 → 标记为转化事件
2. 选择重要事件（例如：`lead_submit`）
3. 标记为转化后，可以在报告中查看转化率

---

## 8. 推荐的每日报告内容

建议每日报告包含以下指标：

### 基础指标
- ✅ 今日用户数
- ✅ 今日会话数
- ✅ 今日页面浏览量

### 漏斗指标
- ✅ `page_open` 事件数
- ✅ `snapshot_start` 事件数
- ✅ `eligibility_complete` 事件数（区分 yes/no）
- ✅ `snapshot_complete` 事件数（区分 yes/no）
- ✅ `lead_form_view` 事件数
- ✅ `lead_submit` 事件数

### 转化率
- ✅ 开始率：`snapshot_start` / `page_open`
- ✅ 完成率：`snapshot_complete` / `snapshot_start`
- ✅ 提交率：`lead_submit` / `lead_form_view`

---

## 9. 下一步学习资源

- **GA4 官方文档**：https://support.google.com/analytics/answer/10089681
- **GA4 学习中心**：https://analytics.google.com/analytics/academy/
- **GA4 YouTube 频道**：搜索 "Google Analytics 4" 官方频道

---

## 📞 需要帮助？

如果遇到问题：
1. 检查本文档的"常见问题"部分
2. 查看 GA4 帮助中心：https://support.google.com/analytics
3. 使用 GA4 社区论坛：https://support.google.com/analytics/community

---

**最后更新**：2026-01-27
