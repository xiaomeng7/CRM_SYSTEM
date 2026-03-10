# Netlify 部署指南

## 方法一：通过 Netlify 网站部署（最简单）

### 步骤 1: 准备文件
确保所有文件都在 `risk-snapshot-netlify` 文件夹中：
- `risk-snapshot.html`
- `index.html`
- `netlify.toml`（可选，已包含在项目中）

### 步骤 2: 登录 Netlify
1. 访问 https://app.netlify.com
2. 使用 GitHub 账号登录（推荐）或创建新账号

### 步骤 3: 部署网站

**选项 A：拖拽部署（最快）**
1. 在 Netlify 控制台，找到 "Sites" 页面
2. 将整个 `risk-snapshot-netlify` 文件夹拖拽到页面上的部署区域
3. 等待几秒钟，Netlify 会自动部署
4. 部署完成后，你会得到一个随机域名（如：`random-name-123.netlify.app`）

**选项 B：连接 GitHub 仓库（推荐，支持自动部署）**
1. 点击 "Add new site" → "Import an existing project"
2. 选择 "Deploy with GitHub"
3. 授权 Netlify 访问你的 GitHub 账号
4. 选择仓库：`xiaomeng7/risk-snapshot-netlify`
5. 配置部署设置：
   - **Build command**: 留空（这是静态网站）
   - **Publish directory**: `.`（根目录）
6. 点击 "Deploy site"

### 步骤 4: 自定义域名（可选）
1. 在站点设置中，点击 "Domain settings"
2. 点击 "Add custom domain"
3. 输入你的域名（如：`risk-snapshot.yourdomain.com`）
4. 按照提示配置 DNS 记录

## 方法二：使用 Netlify CLI（命令行）

### 安装 Netlify CLI
```bash
# 使用 npm 安装
npm install -g netlify-cli

# 或使用 Homebrew (macOS)
brew install netlify-cli
```

### 部署步骤
```bash
# 1. 进入项目目录
cd /Users/mengzhang/Downloads/risk-snapshot-netlify

# 2. 登录 Netlify
netlify login

# 3. 初始化站点（首次部署）
netlify init

# 4. 部署网站
netlify deploy

# 5. 发布到生产环境
netlify deploy --prod
```

## 部署后的操作

### 查看部署状态
- 访问 Netlify 控制台：https://app.netlify.com
- 点击你的站点查看部署历史

### 自动部署
如果你使用 GitHub 连接方式：
- 每次推送到 `main` 分支，Netlify 会自动重新部署
- 你可以在 Netlify 控制台查看部署日志

### 环境变量（如果需要）
如果将来需要添加环境变量：
1. 进入站点设置 → "Environment variables"
2. 添加变量（如 API keys 等）

## 常见问题

### Q: 部署后网站显示空白？
A: 检查 `netlify.toml` 中的 `publish` 目录是否正确设置为 `.`

### Q: 如何回滚到之前的版本？
A: 在 Netlify 控制台的 "Deploys" 页面，找到之前的部署，点击 "Publish deploy"

### Q: 如何设置自定义 404 页面？
A: 创建 `404.html` 文件，Netlify 会自动使用它

### Q: 如何启用 HTTPS？
A: Netlify 默认启用 HTTPS，无需额外配置

## 部署检查清单

- [ ] 所有文件已提交到 Git
- [ ] `netlify.toml` 配置文件已添加
- [ ] 在 Netlify 创建站点
- [ ] 部署成功
- [ ] 网站可以正常访问
- [ ] （可选）设置自定义域名

## 快速链接

- Netlify 控制台：https://app.netlify.com
- 你的 GitHub 仓库：https://github.com/xiaomeng7/risk-snapshot-netlify
- Netlify 文档：https://docs.netlify.com
