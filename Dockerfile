# 1. 构建阶段 (Builder)
FROM node:20-alpine AS builder

# 切换阿里云 Alpine 镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

WORKDIR /app

# NEXT_PUBLIC_* 变量必须在构建时注入，它们会被内联到客户端 JS 中
# 运行时通过 docker-compose environment 注入的 NEXT_PUBLIC_* 对客户端无效
ARG NEXT_PUBLIC_MODEL_NAME=gemini-2.5-flash
ARG NEXT_PUBLIC_API_BASE_URL=https://api.devdove.site/v1
ENV NEXT_PUBLIC_MODEL_NAME=$NEXT_PUBLIC_MODEL_NAME
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

# 复制 package.json 和 lock 文件
COPY package*.json ./
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

# 设置为生产环境
ENV NODE_ENV=production
# 允许外部访问
ENV HOST=0.0.0.0

# 从 builder 阶段复制构建好的 standalone 文件和静态资源
COPY --from=builder /app/public ./public

# https://nextjs.org/docs/pages/api-reference/next-config-js/output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

# 启动 standalone 服务器
CMD ["node", "server.js"]
