"use client";

import { Card, Form, Input, Button, Typography, Space, message } from "antd";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

const { Title } = Typography;

export default function SignIn() {
  const router = useRouter();

  const onFinish = async (values: { username: string; password: string }) => {
    try {
      const result = await signIn("credentials", {
        username: values.username,
        password: values.password,
        redirect: false,
      });

      if (result?.error) {
        message.error("用户名或密码错误");
      } else {
        message.success("登录成功");
        router.push("/dashboard");
        router.refresh();
      }
    } catch (error) {
      message.error("登录失败，请稍后重试");
    }
  };

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
      <Card style={{ width: 400 }}>
        <Space orientation="vertical" size="large" style={{ width: "100%" }}>
          <Title level={2} style={{ textAlign: "center" }}>
            登录
          </Title>
          <Form
            name="signin"
            onFinish={onFinish}
            layout="vertical"
            requiredMark={false}
          >
            <Form.Item
              label="用户名"
              name="username"
              rules={[{ required: true, message: "请输入用户名" }]}
            >
              <Input placeholder="请输入用户名" />
            </Form.Item>
            <Form.Item
              label="密码"
              name="password"
              rules={[{ required: true, message: "请输入密码" }]}
            >
              <Input.Password placeholder="请输入密码" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" block>
                登录
              </Button>
            </Form.Item>
          </Form>
        </Space>
      </Card>
    </div>
  );
}

