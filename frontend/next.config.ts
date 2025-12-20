import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
  // 开发环境下，将 /api/* 路由到后端服务
  // 使用 fallback 模式，确保 Next.js 自己的路由（如 /api/auth/*）优先处理
  // 生产环境下由 nginx 处理路由，所以这里只在开发环境启用
  async rewrites() {
    // 只在开发环境（非生产环境）启用
    if (process.env.NODE_ENV === "production") {
      return { fallback: [] };
    }
    
    return {
      fallback: [
        {
          source: "/api/:path*",
          destination: "http://localhost:8000/api/:path*",
        },
      ],
    };
  },
};

export default nextConfig;
