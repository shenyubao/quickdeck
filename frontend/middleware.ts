import { auth } from "@/auth";

export default auth((req) => {
  // 中间件逻辑
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

