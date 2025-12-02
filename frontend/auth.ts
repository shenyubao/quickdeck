import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

// 服务端 API URL：在 Docker 容器内使用内部网络名称，否则使用 localhost
// 服务端代码在容器内运行，可以使用 Docker 内部网络名称
const getServerApiUrl = () => {
  // 优先使用服务端专用的环境变量
  if (process.env.API_URL) {
    return process.env.API_URL;
  }
  
  const publicUrl = process.env.NEXT_PUBLIC_API_URL;
  
  // 如果 NEXT_PUBLIC_API_URL 为空（通过 nginx 代理），服务端使用 Docker 内部网络
  if (!publicUrl || publicUrl.trim() === "") {
    return "http://backend:8000";
  }
  
  // 如果在 Docker 环境中（有 NEXT_PUBLIC_API_URL 且包含 localhost），使用 backend
  if (publicUrl.includes("localhost")) {
    // 服务端在 Docker 容器内，使用内部网络名称
    return publicUrl.replace("localhost", "backend");
  }
  
  return publicUrl || "http://localhost:8000";
};

const API_URL = getServerApiUrl();
const AUTH_SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;

if (!AUTH_SECRET) {
  console.warn("警告: AUTH_SECRET 或 NEXTAUTH_SECRET 环境变量未设置，这可能导致 JWT 解密错误");
}

export const authConfig = {
  secret: AUTH_SECRET,
  trustHost: true, // 允许反向代理（nginx）
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "用户名", type: "text" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.username || !credentials?.password) {
            return null;
          }

          const response = await fetch(`${API_URL}/api/auth/login`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              username: credentials.username,
              password: credentials.password,
            }),
          });

          if (!response.ok) {
            // 401 错误是正常的用户名/密码错误，不需要输出日志
            if (response.status === 401) {
              return null;
            }
            // 其他错误才输出日志
            const errorText = await response.text();
            console.error("登录 API 响应错误:", {
              status: response.status,
              statusText: response.statusText,
              body: errorText,
            });
            return null;
          }

          const tokenData = await response.json();

          if (!tokenData?.access_token) {
            console.error("响应中缺少 access_token:", tokenData);
            return null;
          }

          // 获取用户信息
          const userResponse = await fetch(`${API_URL}/api/auth/me`, {
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
            },
          });

          if (!userResponse.ok) {
            const errorText = await userResponse.text();
            console.error("获取用户信息失败:", {
              status: userResponse.status,
              statusText: userResponse.statusText,
              body: errorText,
            });
            return null;
          }

          const user = await userResponse.json();

          if (!user?.id || !user?.username) {
            console.error("用户信息不完整:", user);
            return null;
          }

          return {
            id: user.id.toString(),
            username: user.username,
            email: user.email || null,
            name: user.nickname || user.username,
            isAdmin: user.is_admin || false,
            accessToken: tokenData.access_token,
          };
        } catch (error) {
          // 网络错误或其他异常错误才输出日志
          console.error("登录错误:", error);
          if (error instanceof Error) {
            console.error("错误详情:", {
              message: error.message,
              stack: error.stack,
            });
          }
          return null;
        }
      },
    }),
  ],
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = (user as any).accessToken;
        token.username = (user as any).username;
        token.isAdmin = (user as any).isAdmin;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        (session as any).accessToken = token.accessToken;
        (session as any).username = token.username as string;
        (session as any).isAdmin = token.isAdmin as boolean;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
      const isOnAuthPage = nextUrl.pathname.startsWith("/auth");
      const isOnRoot = nextUrl.pathname === "/";
      
      // 获取正确的 base URL，优先使用 NEXTAUTH_URL
      const getBaseUrl = () => {
        const nextAuthUrl = process.env.NEXTAUTH_URL;
        if (nextAuthUrl) {
          return nextAuthUrl;
        }
        // 如果 NEXTAUTH_URL 未设置，使用 nextUrl 的 origin
        // 注意：在生产环境中应该始终设置 NEXTAUTH_URL
        return nextUrl.origin;
      };
      
      // 访问仪表板需要登录
      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false; // 重定向到登录页
      }
      
      // 访问根路径：已登录跳转到仪表板，未登录跳转到登录页
      if (isOnRoot) {
        const baseUrl = getBaseUrl();
        if (isLoggedIn) {
          return Response.redirect(new URL("/dashboard", baseUrl));
        } else {
          return Response.redirect(new URL("/auth/signin", baseUrl));
        }
      }
      
      // 其他页面（如登录页）允许访问
      return true;
    },
  },
  logger: {
    error(error: Error) {
      // 不输出 CredentialsSignin 错误的详细日志
      if (error.message?.includes("CredentialsSignin") || error.name === "CredentialsSignin") {
        return;
      }
      // 其他错误正常输出
      console.error(error);
    },
  },
} satisfies NextAuthConfig;

export const { auth, handlers, signIn, signOut } = NextAuth(authConfig);

