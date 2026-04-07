# Git 和 GitHub 推送指南

## 第一步：在 GitHub 上创建远程仓库

1. 访问 [GitHub](https://github.com) 并登录你的账户
2. 点击右上角的 **+** 图标，选择 **New repository**
3. 填写仓库信息：
   - **Repository name**: `p2pchat`（或你喜欢的名称）
   - **Description**: P2P Chat Application（可选）
   - **Public/Private**: 选择公开或私有
   - **不要** 勾选 "Initialize this repository with a README"（因为我们已有本地仓库）
4. 点击 **Create repository**

## 第二步：配置 Git 用户信息（如果还未配置）

在 Cursor IDE 的终端中运行：

```bash
git config --global user.name "你的名字"
git config --global user.email "你的邮箱@example.com"
```

## 第三步：添加远程仓库

在 Cursor IDE 的终端中运行以下命令（将 `YOUR_USERNAME` 替换为你的 GitHub 用户名）：

```bash
git remote add origin https://github.com/YOUR_USERNAME/p2pchat.git
```

验证远程仓库是否添加成功：

```bash
git remote -v
```

你应该看到类似的输出：
```
origin  https://github.com/YOUR_USERNAME/p2pchat.git (fetch)
origin  https://github.com/YOUR_USERNAME/p2pchat.git (push)
```

## 第四步：推送到 GitHub

### 方法 1：使用 HTTPS（推荐新手）

运行以下命令：

```bash
git branch -M main
git push -u origin main
```

首次推送时，GitHub 会要求你输入凭证：
- **用户名**: 你的 GitHub 用户名
- **密码**: 你的 GitHub 个人访问令牌（Personal Access Token）

### 获取个人访问令牌（PAT）

如果你没有 PAT，需要创建一个：

1. 登录 GitHub，点击右上角头像 → **Settings**
2. 左侧菜单选择 **Developer settings** → **Personal access tokens** → **Tokens (classic)**
3. 点击 **Generate new token (classic)**
4. 填写信息：
   - **Note**: `Cursor IDE`（或其他描述）
   - **Expiration**: 选择过期时间（建议 90 天或更长）
   - **Select scopes**: 勾选 `repo`（完整控制私有仓库）
5. 点击 **Generate token**
6. **复制令牌**（页面关闭后无法再看到）

### 方法 2：使用 SSH（更安全，推荐长期使用）

#### 生成 SSH 密钥

```bash
ssh-keygen -t ed25519 -C "你的邮箱@example.com"
```

按 Enter 接受默认位置，然后输入密码（可留空）。

#### 添加 SSH 密钥到 GitHub

1. 复制公钥内容：
```bash
type C:\Users\windows\.ssh\id_ed25519.pub
```

2. 登录 GitHub，点击右上角头像 → **Settings**
3. 左侧菜单选择 **SSH and GPG keys**
4. 点击 **New SSH key**
5. 粘贴公钥内容，点击 **Add SSH key**

#### 使用 SSH 推送

```bash
git remote set-url origin git@github.com:YOUR_USERNAME/p2pchat.git
git push -u origin main
```

## 第五步：在 Cursor IDE 中推送更新

### 使用 Git 命令行

每次修改代码后，运行：

```bash
git add .
git commit -m "你的提交信息"
git push
```

### 使用 Cursor IDE 的 Git 界面

1. 点击左侧边栏的 **Source Control**（或按 `Ctrl+Shift+G`）
2. 在 **Changes** 中查看修改的文件
3. 点击文件旁的 **+** 按钮暂存文件（或点击 **+** 暂存所有）
4. 在顶部输入框输入提交信息
5. 点击 **Commit** 按钮
6. 点击 **...** 菜单，选择 **Push** 推送到 GitHub

## 常用 Git 命令

```bash
# 查看状态
git status

# 查看提交历史
git log

# 查看远程仓库
git remote -v

# 拉取最新代码
git pull

# 创建新分支
git branch feature-name
git checkout feature-name

# 或者一步完成
git checkout -b feature-name

# 切换分支
git checkout main

# 合并分支
git merge feature-name

# 删除本地分支
git branch -d feature-name
```

## 故障排除

### 问题：推送时出现 "fatal: 'origin' does not appear to be a 'git' repository"

**解决方案**：确保你在项目根目录（`d:/p2pchat`）中运行命令。

### 问题：推送时出现 "Permission denied (publickey)"

**解决方案**：
- 检查 SSH 密钥是否正确添加到 GitHub
- 运行 `ssh -T git@github.com` 测试连接

### 问题：推送时出现 "fatal: The current branch main has no upstream branch"

**解决方案**：使用 `git push -u origin main` 而不是 `git push`

## 总结

你的项目已经：
✅ 初始化为 Git 仓库
✅ 创建了初始提交
✅ 配置了 `.gitignore` 文件

现在只需要：
1. 在 GitHub 创建远程仓库
2. 添加远程地址
3. 推送代码

祝你使用愉快！
