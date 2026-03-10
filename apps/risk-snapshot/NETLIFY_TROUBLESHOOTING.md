# Netlify 连接 GitHub 仓库问题排查

## 问题：在 Netlify 中看不到 `risk-snapshot-netlify` 仓库

### 解决方案 1：重新授权 GitHub（最常见）

1. **撤销现有授权**
   - 访问：https://github.com/settings/applications
   - 找到 "Netlify" 应用
   - 点击 "Revoke" 撤销授权

2. **重新连接**
   - 回到 Netlify：https://app.netlify.com
   - 点击 "Add new site" → "Import an existing project"
   - 选择 "Deploy with GitHub"
   - 重新授权，确保勾选所有必要的权限

3. **刷新页面**
   - 授权后，刷新 Netlify 页面
   - 仓库列表应该会更新

### 解决方案 2：使用搜索功能

在 Netlify 的仓库选择页面：
1. 使用搜索框搜索：`risk-snapshot-netlify`
2. 或搜索：`xiaomeng7`
3. 如果仓库很多，可以按字母排序查找

### 解决方案 3：检查仓库可见性

确认仓库是公开的：
1. 访问：https://github.com/xiaomeng7/risk-snapshot-netlify/settings
2. 滚动到底部，查看 "Danger Zone"
3. 如果仓库是私有的，需要：
   - 要么改为公开（Settings → Change visibility → Make public）
   - 要么确保 Netlify 有访问私有仓库的权限

### 解决方案 4：使用手动输入仓库 URL

如果搜索不到，可以尝试：
1. 在 Netlify 仓库选择页面
2. 查找 "Import manually" 或类似选项
3. 输入仓库 URL：`xiaomeng7/risk-snapshot-netlify`

### 解决方案 5：使用拖拽部署（最简单）

如果连接 GitHub 有问题，可以直接拖拽：
1. 访问：https://app.netlify.com
2. 将整个 `risk-snapshot-netlify` 文件夹拖拽到页面
3. 网站会立即部署
4. 之后可以在站点设置中连接 GitHub 以实现自动部署

### 解决方案 6：检查 Netlify 权限设置

1. 访问 GitHub 设置：https://github.com/settings/applications
2. 找到 Netlify 应用
3. 点击 "Configure" 或查看权限
4. 确保以下权限已授予：
   - ✅ Repository access（仓库访问）
   - ✅ 至少选择了 "All repositories" 或包含 `risk-snapshot-netlify`

### 解决方案 7：使用 Netlify CLI（命令行）

如果网页端有问题，可以使用命令行：

```bash
# 1. 安装 Netlify CLI
npm install -g netlify-cli

# 2. 登录
netlify login

# 3. 初始化（会提示选择或创建站点）
cd /Users/mengzhang/Downloads/risk-snapshot-netlify
netlify init

# 4. 按照提示操作：
#    - 选择 "Create & configure a new site"
#    - 输入站点名称（或使用默认）
#    - 选择团队（如果有）
#    - Build command: 直接回车（留空）
#    - Publish directory: 输入 . （点号，表示根目录）

# 5. 部署
netlify deploy --prod
```

## 推荐操作顺序

1. ✅ **先尝试拖拽部署**（最快，30秒完成）
2. ✅ 部署成功后，在站点设置中连接 GitHub
3. ✅ 如果还是看不到，尝试解决方案 1（重新授权）

## 验证仓库信息

- 仓库 URL：https://github.com/xiaomeng7/risk-snapshot-netlify
- 仓库名称：`risk-snapshot-netlify`
- 完整路径：`xiaomeng7/risk-snapshot-netlify`
- 分支：`main`

## 需要帮助？

如果以上方法都不行，可以：
1. 检查 Netlify 状态页面：https://www.netlifystatus.com/
2. 联系 Netlify 支持：https://www.netlify.com/support/
3. 查看 Netlify 社区：https://answers.netlify.com/
