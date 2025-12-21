"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider
      // 设置 session 刷新间隔为 0，禁用自动轮询
      // 只在用户操作时或页面加载时检查 session
      refetchInterval={0}
      // 当窗口重新获得焦点时不自动刷新 session
      refetchOnWindowFocus={false}
    >
      {children}
    </SessionProvider>
  );
}

