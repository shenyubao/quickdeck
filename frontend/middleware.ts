import { auth } from "@/auth";

export default auth((req) => {
  // 中间件逻辑
  // 授权逻辑已在 auth.ts 的 authorized callback 中处理
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

