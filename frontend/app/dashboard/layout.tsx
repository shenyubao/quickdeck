"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Layout,
  Menu,
  Avatar,
  Dropdown,
  Button,
  Space,
  Select,
  Typography,
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

interface DashboardLayoutProps {
  children: React.ReactNode;
  projects?: Array<{ id: string; name: string; description?: string; createdAt: string }>;
  currentProject?: string;
  onProjectChange?: (projectName: string) => void;
}

export default function DashboardLayout({
  children,
  projects = [],
  currentProject: externalCurrentProject,
  onProjectChange,
}: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [currentProject, setCurrentProject] = useState(
    externalCurrentProject || "默认项目"
  );

  // 根据路径确定选中的菜单项
  const getSelectedKey = () => {
    if (pathname?.includes("/projects")) return "project-management";
    if (pathname?.includes("/history")) return "history";
    return "tasks";
  };

  const [selectedMenu, setSelectedMenu] = useState(getSelectedKey());

  useEffect(() => {
    setSelectedMenu(getSelectedKey());
  }, [pathname]);

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/" });
  };

  // 项目选项
  const projectOptions = projects.length > 0
    ? projects.map((project) => ({
        value: project.name,
        label: project.name,
      }))
    : [
        { value: "默认项目", label: "默认项目" },
        { value: "项目一", label: "项目一" },
        { value: "项目二", label: "项目二" },
      ];

  const handleProjectChange = (value: string) => {
    setCurrentProject(value);
    onProjectChange?.(value);
  };

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

  const handleMenuClick = ({ key }: { key: string }) => {
    setSelectedMenu(key);
    if (key === "tasks") {
      router.push("/dashboard");
    } else if (key === "history") {
      router.push("/dashboard/history");
    } else if (key === "project-management") {
      router.push("/dashboard/projects");
    }
  };

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
            onChange={handleProjectChange}
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
            onClick={handleMenuClick}
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
            {children}
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

