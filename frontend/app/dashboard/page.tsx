"use client";

import { useState } from "react";
import {
  Layout,
  Menu,
  Avatar,
  Dropdown,
  Button,
  Typography,
  Space,
  Select,
} from "antd";
import type { MenuProps } from "antd";
import {
  QuestionCircleOutlined,
  LogoutOutlined,
  UserOutlined,
  CheckSquareOutlined,
  HistoryOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { signOut, useSession } from "next-auth/react";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export default function Dashboard() {
  const [selectedMenu, setSelectedMenu] = useState("tasks");
  const { data: session } = useSession();
  const [currentProject, setCurrentProject] = useState("默认项目");

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/" });
  };

  // 项目选项
  const projectOptions = [
    { value: "默认项目", label: "默认项目" },
    { value: "项目一", label: "项目一" },
    { value: "项目二", label: "项目二" },
    { value: "项目三", label: "项目三" },
  ];

  // 用户下拉菜单
  const userMenuItems: MenuProps["items"] = [
    {
      key: "logout",
      label: "退出登录",
      icon: <LogoutOutlined />,
      onClick: handleSignOut,
    },
  ];

  // 侧边栏菜单项
  const sideMenuItems: MenuProps["items"] = [
    {
      key: "tasks",
      icon: <CheckSquareOutlined />,
      label: "任务清单",
    },
    {
      key: "history",
      icon: <HistoryOutlined />,
      label: "执行记录",
    },
    {
      type: "divider",
    },
    {
      key: "project-management",
      icon: <SettingOutlined />,
      label: "项目管理",
    },
  ];

  const user = session?.user as any;
  const userName = user?.name || user?.username || "用户";
  const userEmail = user?.email;

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {/* 顶部导航栏 */}
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          background: "#fff",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          height: 64,
          lineHeight: "64px",
        }}
      >
        {/* 左侧：Logo 和项目切换 */}
        <Space size="large">
          <div
            style={{
              fontSize: "20px",
              fontWeight: "bold",
              color: "#1890ff",
            }}
          >
            QuickDeck
          </div>
          <Select
            value={currentProject}
            onChange={setCurrentProject}
            options={projectOptions}
            style={{ minWidth: 120 }}
            bordered={false}
          />
        </Space>

        {/* 右侧：帮助和用户信息 */}
        <Space size="middle">
          {/* 帮助入口 */}
          <Button
            type="text"
            icon={<QuestionCircleOutlined />}
            style={{
              width: 40,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "16px",
            }}
            title="帮助"
          />

          {/* 用户信息 */}
          <Dropdown menu={{ items: userMenuItems }} trigger={["click"]}>
            <Space
              style={{
                cursor: "pointer",
                padding: "4px 8px",
                borderRadius: "4px",
              }}
              className="user-info"
            >
              <Avatar icon={<UserOutlined />} />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <Text strong>{userName}</Text>
                {userEmail && (
                  <Text type="secondary" style={{ fontSize: "12px" }}>
                    {userEmail}
                  </Text>
                )}
              </div>
            </Space>
          </Dropdown>

          {/* 移动端退出登录按钮 */}
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={handleSignOut}
            className="mobile-only"
            style={{
              width: 40,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "16px",
            }}
            title="退出登录"
          />
        </Space>
      </Header>

      <Layout>
        {/* 侧边栏 */}
        <Sider
          width={200}
          style={{
            background: "#fff",
            overflow: "auto",
            height: "calc(100vh - 64px)",
          }}
        >
          <Menu
            mode="inline"
            selectedKeys={[selectedMenu]}
            items={sideMenuItems}
            style={{ height: "100%", borderRight: 0 }}
            onClick={({ key }) => setSelectedMenu(key)}
          />
        </Sider>

        {/* 内容区域 */}
        <Layout style={{ minHeight: "calc(100vh - 64px)" }}>
          <Content
            style={{
              margin: "16px",
              padding: 16,
              minHeight: 280,
              background: "#fff",
            }}
          >
            {selectedMenu === "tasks" && (
              <div>
                <Typography.Title level={3}>任务清单</Typography.Title>
                <Typography.Paragraph>
                  这里是任务清单的内容区域
                </Typography.Paragraph>
              </div>
            )}
            {selectedMenu === "history" && (
              <div>
                <Typography.Title level={3}>执行记录</Typography.Title>
                <Typography.Paragraph>
                  这里是执行记录的内容区域
                </Typography.Paragraph>
              </div>
            )}
            {selectedMenu === "project-management" && (
              <div>
                <Typography.Title level={3}>项目管理</Typography.Title>
                <Typography.Paragraph>
                  这里是项目管理的内容区域
                </Typography.Paragraph>
              </div>
            )}
          </Content>
        </Layout>
      </Layout>

      <style jsx global>{`
        @media (max-width: 768px) {
          .desktop-only {
            display: none !important;
          }
          .user-info .ant-typography {
            display: none;
          }
        }
        @media (min-width: 769px) {
          .mobile-only {
            display: none !important;
          }
        }
      `}</style>
    </Layout>
  );
}

