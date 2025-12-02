"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Spin } from "antd";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") {
      // 正在加载，等待
      return;
    }

    if (session) {
      // 已登录，跳转到仪表板
      router.replace("/dashboard");
    } else {
      // 未登录，跳转到登录页
      router.replace("/auth/signin");
    }
  }, [session, status, router]);

  // 显示加载状态
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        background: "#f0f2f5",
      }}
    >
      <Spin size="large" />
    </div>
  );
}
