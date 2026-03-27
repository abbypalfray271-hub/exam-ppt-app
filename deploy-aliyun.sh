#!/bin/bash

# 阿里云部署脚本 (从 Gitee 拉取)
# 请确保服务器已配置 Gitee 的 SSH Key 或已保存 HTTPS 凭据

# --- 配置区 ---
# 请在此处填入您的 Gitee 仓库地址
# 这里的地址需要用户替换为实际的 exam-ppt-app 仓库地址
GITEE_REPO="https://gitee.com/hunter2026/exam-ppt-app.git"
# --- --- ---

echo "🚀 开始阿里云部署流程..."

# 1. 检查是否在 Git 仓库中
if [ ! -d ".git" ]; then
    echo "📂 首次部署，正在克隆仓库..."
    git clone $GITEE_REPO .
else
    echo "🔄 正在从 Gitee 拉取最新代码..."
    # 强制重置以解决可能的冲突
    git fetch origin
    git reset --hard origin/main
    git pull origin main
fi

# 2. 检查 Docker 环境
if ! command -v docker-compose &> /dev/null; then
    echo "❌ 错误: 未找到 docker-compose，请先安装 Docker 环境。"
    exit 1
fi

# 3. 执行容器构建与启动
echo "🏗️ 正在构建镜像 (无缓存模式)..."
# 使用 --no-cache 确保代码更新彻底
sudo docker-compose build --no-cache

echo "🚢 正在启动服务..."
sudo docker-compose up -d

echo "✅ 部署完成！服务运行在 http://localhost:3004"

# --- 强制清理 Nginx 缓存 (可选，但建议在出现界面不更新时运行) ---
echo "🧹 正在尝试清理 Nginx 反向代理缓存..."
sudo rm -rf /var/cache/nginx/* /tmp/nginx* 2>/dev/null
sudo nginx -s reload 2>/dev/null || sudo systemctl reload nginx 2>/dev/null

echo "✨ 全部流程完成！请补全功能路径访问，如: https://[您的域名]/editor"
echo "💡 提示: 如果仍然是旧版，请 Ctrl+F5 强制刷新浏览器。"
