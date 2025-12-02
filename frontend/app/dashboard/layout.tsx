"use client";

import { useState, useEffect, useCallback } from "react";
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
  Empty,
  message,
} from "antd";
import type { MenuProps } from "antd";
import {
  QuestionCircleOutlined,
  LogoutOutlined,
  UserOutlined,
  CheckSquareOutlined,
  HistoryOutlined,
  SettingOutlined,
  PlusOutlined,
  KeyOutlined,
} from "@ant-design/icons";
import { signOut, useSession } from "next-auth/react";
import { projectApi, type Project } from "@/lib/api";

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
  projects: externalProjects = [],
  currentProject: externalCurrentProject,
  onProjectChange,
}: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentProject, setCurrentProject] = useState<string | null>(
    externalCurrentProject || null
  );

  // 加载项目列表
  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      const data = await projectApi.getAll();
      setProjects(data);
      
      // 如果没有当前选中的项目，且项目列表不为空，自动选择第一个项目
      if (!currentProject && data.length > 0) {
        const firstProject = data[0].name;
        setCurrentProject(firstProject);
        onProjectChange?.(firstProject);
        // 保存到 localStorage
        if (typeof window !== "undefined") {
          localStorage.setItem("currentProject", firstProject);
        }
      }
    } catch (error) {
      // 401 错误会触发自动跳转到登录页，不需要显示错误消息
      if (error instanceof Error && error.message.includes("认证失败")) {
        return;
      }
      // 其他错误不显示消息，避免干扰用户体验
      console.error("加载项目列表失败:", error);
    } finally {
      setLoading(false);
    }
  }, [currentProject, onProjectChange]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // 监听项目列表更新事件
  useEffect(() => {
    const handleProjectListUpdate = () => {
      loadProjects();
    };

    // 监听自定义事件
    window.addEventListener("projectListUpdated", handleProjectListUpdate);

    return () => {
      window.removeEventListener("projectListUpdated", handleProjectListUpdate);
    };
  }, [loadProjects]);

  // 根据路径确定选中的菜单项
  const getSelectedKey = () => {
    if (pathname?.includes("/projects")) return "project-management";
    if (pathname?.includes("/history")) return "history";
    if (pathname?.includes("/credentials")) return "credentials";
    return "tasks";
  };

  const [selectedMenu, setSelectedMenu] = useState(getSelectedKey());

  useEffect(() => {
    const key = getSelectedKey();
    // 如果没有项目，且选中的是任务相关的菜单，自动切换到项目管理
    if (projects.length === 0 && (key === "tasks" || key === "history" || key === "credentials")) {
      setSelectedMenu("project-management");
      // 如果不在项目管理页面，则跳转过去
      if (!pathname?.includes("/projects")) {
        router.push("/dashboard/projects");
      }
    } else {
      setSelectedMenu(key);
    }
  }, [pathname, projects.length]);

  // 当离开项目管理页面时，刷新项目列表（以便获取最新创建的项目）
  useEffect(() => {
    if (!pathname?.includes("/projects")) {
      // 延迟刷新，避免频繁请求
      const timer = setTimeout(() => {
        loadProjects();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [pathname, loadProjects]);

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/" });
  };

  // 项目选项 - 增强显示
  const projectOptions = projects.map((project) => ({
    value: project.name,
    label: (
      <div style={{ fontSize: "16px", fontWeight: 500 }}>
        {project.name}
      </div>
    ),
  }));

  const handleProjectChange = (value: string) => {
    setCurrentProject(value);
    onProjectChange?.(value);
    // 保存到 localStorage，供子页面使用
    if (typeof window !== "undefined") {
      localStorage.setItem("currentProject", value);
      // 触发自定义事件，通知子页面项目已切换
      window.dispatchEvent(new CustomEvent("projectChanged"));
    }
  };

  const handleCreateProject = () => {
    router.push("/dashboard/projects");
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

  // 侧边栏菜单项 - 根据是否有项目动态显示
  const sideMenuItems: MenuProps["items"] = [
    // 只有当有项目时才显示任务相关的菜单
    ...(projects.length > 0
      ? [
          {
            key: "tasks",
            icon: <CheckSquareOutlined />,
            label: "任务列表",
          },
          {
            key: "history",
            icon: <HistoryOutlined />,
            label: "执行记录",
          },
          {
            key: "credentials",
            icon: <KeyOutlined />,
            label: "凭证管理",
          },
          {
            type: "divider" as const,
          },
        ]
      : []),
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
    } else if (key === "credentials") {
      router.push("/dashboard/credentials");
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
        <Space size="large" align="center">
          <div
            style={{
              fontSize: "20px",
              fontWeight: "bold",
              color: "#1890ff",
              lineHeight: "20px",
              display: "flex",
              alignItems: "center",
            }}
          >
            QuickDeck
          </div>
          {projects.length > 0 ? (
            <Space size="small" align="center" style={{ height: "100%" }}>
              <Select
                value={currentProject}
                onChange={handleProjectChange}
                options={projectOptions}
                style={{
                  minWidth: 150,
                }}
                variant="borderless"
                loading={loading}
                placeholder="选择项目"
                styles={{
                  popup: {
                    root: {
                      minWidth: 200,
                    },
                  },
                }}
                className="project-selector"
              />
            </Space>
          ) : !loading ? (
            <Space size="small" align="center">
              <Typography.Text
                type="secondary"
                style={{
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "#8c8c8c",
                }}
              >
              </Typography.Text>
              <Button
                type="link"
                size="small"
                icon={<PlusOutlined />}
                onClick={handleCreateProject}
                style={{
                  padding: 0,
                  height: "auto",
                  fontSize: "14px",
                }}
              >
                创建项目
              </Button>
            </Space>
          ) : null}
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
        /* 强化项目选择器的显示 - 让项目名更突出 */
        .project-selector {
          display: flex !important;
          align-items: center !important;
        }
        .project-selector .ant-select-selector {
          font-size: 16px !important;
          font-weight: 600 !important;
          color: #1890ff !important;
          display: flex !important;
          align-items: center !important;
          height: auto !important;
        }
        .project-selector .ant-select-selection-item {
          font-size: 16px !important;
          font-weight: 600 !important;
          color: #1890ff !important;
          line-height: 20px !important;
          display: flex !important;
          align-items: center !important;
        }
        .project-selector:hover .ant-select-selector {
          color: #40a9ff !important;
        }
      `}</style>
    </Layout>
  );
}

