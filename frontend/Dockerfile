FROM node:20-alpine

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制应用代码
COPY . .

# 构建生产版本
RUN npm run build

# 暴露端口
EXPOSE 3000

# 启动生产服务器
CMD ["npm", "start"]

