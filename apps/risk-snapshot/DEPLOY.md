# 部署到 GitHub 指南

## 步骤 1: 在 GitHub 创建仓库

1. 访问 https://github.com/new
2. 仓库名称：`risk-snapshot-netlify`
3. 选择 Public 或 Private
4. **不要**勾选任何初始化选项（README、.gitignore、license）
5. 点击 "Create repository"

## 步骤 2: 推送代码到 GitHub

创建仓库后，GitHub 会显示推送命令。运行以下命令：

```bash
cd /Users/mengzhang/Downloads/risk-snapshot-netlify

# 添加远程仓库（将 YOUR_USERNAME 替换为你的 GitHub 用户名）
git remote add origin https://github.com/YOUR_USERNAME/risk-snapshot-netlify.git

# 推送代码
git branch -M main
git push -u origin main
```

## 步骤 3: 启用 GitHub Pages（重要！）

**如果遇到 404 错误，请按照以下步骤启用 GitHub Pages：**

1. 访问你的仓库设置页面：
   ```
   https://github.com/xiaomeng7/risk-snapshot-netlify/settings/pages
   ```

2. 在 "Source" 部分：
   - 选择 "Deploy from a branch"
   - Branch 选择：`main`
   - Folder 选择：`/ (root)`
   - 点击 "Save" 按钮

3. 等待几分钟（通常 1-3 分钟），GitHub 会构建你的网站

4. 构建完成后，你会看到绿色的成功提示，显示你的网站地址

5. 网站将在以下地址可用：
   - 主页面：`https://xiaomeng7.github.io/risk-snapshot-netlify/`
   - 或直接访问：`https://xiaomeng7.github.io/risk-snapshot-netlify/risk-snapshot.html`

**注意：**
- 如果仓库是 Private，需要升级到 GitHub Pro 才能使用 GitHub Pages
- 首次启用后可能需要等待几分钟才能访问
- 如果仍然显示 404，请检查仓库设置中的 Pages 是否显示 "Your site is live at..."

## 或者使用 Netlify 部署

1. 访问 https://app.netlify.com
2. 拖拽 `risk-snapshot-netlify` 文件夹到 Netlify
3. 网站会自动部署并获得一个 URL
