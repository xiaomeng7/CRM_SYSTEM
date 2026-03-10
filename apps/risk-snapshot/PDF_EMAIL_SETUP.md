# 邮件发送配置（Resend）

- **PDF 发送**：结果页「发送到邮箱」通过 `send-pdf` 把《投资房电气风险自查指南》发到用户邮箱。
- **预约提交**：「预约 15 分钟免费解读」/「Book 15-min call」提交后由 `send-booking` 直接发邮件到公司邮箱，不打开客户邮件客户端。

## 1. 获取 Resend API Key

1. 打开 [https://resend.com](https://resend.com)，用邮箱或 Google 注册并登录。
2. 进入 **API Keys**：
   - 左侧菜单点 **API Keys**，或直接打开 [https://resend.com/api-keys](https://resend.com/api-keys)。
3. 创建 Key：
   - 点 **Create API Key**。
   - 填一个名称（如 `Netlify Risk Snapshot`）。
   - 权限选 **Sending access**（只发信即可）。
   - 点 **Add**，**复制显示的 Key**（形如 `re_123abc...`，只显示一次，务必保存）。

## 1.1 必须验证域名才能发信给任意收件人

**若出现 403：`You can only send testing emails to your own email address`**

- Resend 未验证域名时，**只能发到你的 Resend 账号邮箱**（如 meng.z@bhtechnology.com.au），不能发到用户填写的邮箱或 info@…。
- 要发信给任意收件人（用户邮箱、公司 info@），必须：
  1. 在 Resend 中 **验证发信域名**：打开 [resend.com/domains](https://resend.com/domains)，添加并验证你的域名（如 `bhtechnology.com.au`），按页面提示添加 DNS 记录。
  2. 验证通过后，在 Netlify 环境变量中设置 **`PDF_FROM_EMAIL`** 为**该域名下的邮箱**（如 `noreply@bhtechnology.com.au`），不要用默认的 `onboarding@resend.dev`。
- 发件人改为已验证域名的邮箱后，即可向任意收件人发送 PDF 和预约通知。

## 2. 在 Netlify 里设置 RESEND_API_KEY

1. 登录 [Netlify](https://app.netlify.com)，进入你的站点（如 risk-snapshot）。
2. 打开 **Site configuration**（或 **Site settings**）→ **Environment variables**。
3. 点 **Add a variable** / **Add environment variable**：
   - **Key**：`RESEND_API_KEY`（必须一字不差）。
   - **Value**：粘贴刚才复制的 Resend API Key（如 `re_xxxx...`）。
   - **Scopes**：勾选 **All scopes** 或至少 **Production**（以及需要测试时的 **Deploy previews**）。
4. 保存后，**重新部署一次站点**（Deploys → Trigger deploy → Deploy site），环境变量才会在 Function 里生效。

| 变量名 | 说明 | 必填 |
|--------|------|------|
| `RESEND_API_KEY` | Resend API Key（如 `re_xxxx`） | **是** |
| `PDF_FROM_EMAIL` | 发件邮箱；**发信给任意收件人时必须用已验证域名的邮箱**（如 `noreply@bhtechnology.com.au`），否则只能用 Resend 账号邮箱收信 | 发任意收件人时**必填** |
| `PDF_FROM_NAME` | 发件人名称（默认 Better Home Technology） | 否 |
| `BOOKING_TO_EMAIL` | 预约邮件收件地址（默认 info@bhtechnology.com.au） | 否 |

未设置 `RESEND_API_KEY` 时，PDF「发送到邮箱」和「提交预约」会报错，用户仍可使用「直接下载 PDF」和表单重试。

## 3. 邮件内容

- **英文**：感谢完成快照、附上 checklist、欢迎回复或联系 info@bhtechnology.com.au。
- **中文**：感谢完成快照、附上《投资房电气风险自查指南》、欢迎回复或联系 info@bhtechnology.com.au。

邮件正文在 `netlify/functions/send-pdf.js` 中的 `BODY_EN` / `BODY_ZH`，可按需修改。

## 4. PDF 文件

- 英文：`investment property check guide.pdf`（根目录）
- 中文：`investment property check guide CN.pdf`（根目录）

部署后可通过  
`https://你的站点.netlify.app/investment%20property%20check%20guide.pdf`  
等链接直接访问，Function 会从站点自身拉取 PDF 并作为附件发送。
