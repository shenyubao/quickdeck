"use client";

import { Button, Card, Typography, Space } from "antd";
import Link from "next/link";

const { Title, Paragraph } = Typography;

export default function Home() {
  return (
    <div style={{ padding: "50px", minHeight: "100vh", background: "#f0f2f5" }}>
      <Card style={{ maxWidth: 800, margin: "0 auto" }}>
        <Space orientation="vertical" size="large" style={{ width: "100%" }}>
          <Title level={1}>欢迎使用 QuickDeck</Title>
          <Paragraph>
            这是一个使用 Next.js、Ant Design v6 和 FastAPI 构建的现代化应用。
          </Paragraph>
          <Space>
            <Link href="/dashboard">
              <Button type="primary" size="large">
                进入仪表板
              </Button>
            </Link>
            <Link href="/auth/signin">
              <Button size="large">登录</Button>
            </Link>
          </Space>
        </Space>
      </Card>
    </div>
  );
}
