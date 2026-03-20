# 1. 构建阶段 (Builder)
FROM node:20-alpine AS builder

# 切换阿里云 Alpine 镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# [Next.js 16 关键修复] 固定 Server Action 加密密钥
ENV NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=c369fc8774771746261298495394f4c2

WORKDIR /app

# 复制 package.json 和 lock 文件
COPY package*.json ./
# 安装依赖
# 使用淘宝/阿里云 NPM 镜像加速
RUN npm config set registry https://registry.npmmirror.com && \
    npm install

# 复制所有源代码
COPY . .

# 构建 Next.js 项目
RUN npm run build

# 2. 运行阶段 (Runner)
FROM node:20-alpine AS runner

# 切换阿里云 Alpine 镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

WORKDIR /app

# [Next.js 16 关键修复] 运行环境也必须持有相同的加密密钥
ENV NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=c369fc8774771746261298495394f4c2

# 设置为生产环境
ENV NODE_ENV production
# 允许外部访问
ENV HOST 0.0.0.0

# 从 builder 阶段复制构建好的 standalone 文件和静态资源
COPY --from=builder /app/public ./public

# 自动创建 .next/standalone 目录
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

# 启动 standalone 服务器
CMD ["node", "server.js"]
