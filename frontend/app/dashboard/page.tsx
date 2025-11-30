"use client";

import { Card, Typography, Space, Button } from "antd";
import { signOut } from "next-auth/react";

const { Title, Paragraph } = Typography;

export default function Dashboard() {
  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/" });
  };

  return (
    <div style={{ padding: "50px", minHeight: "100vh", background: "#f0f2f5" }}>
      <Card style={{ maxWidth: 800, margin: "0 auto" }}>
        <Space orientation="vertical" size="large" style={{ width: "100%" }}>
          <Title level={2}>仪表板</Title>
          <Paragraph>欢迎来到 QuickDeck 仪表板！</Paragraph>
          <Button onClick={handleSignOut}>退出登录</Button>
        </Space>
      </Card>
    </div>
  );
}

