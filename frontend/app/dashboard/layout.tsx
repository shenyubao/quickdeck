"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  Drawer,
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
  TeamOutlined,
  MenuOutlined,
} from "@ant-design/icons";
import { signOut, useSession } from "next-auth/react";
import { projectApi, systemConfigApi, type Project } from "@/lib/api";

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
  // 当前项目 - 使用固定初始值避免 hydration 错误
  const [currentProject, setCurrentProject] = useState<string | null>(externalCurrentProject || null);
  
  // 在客户端 mounted 后从 localStorage 读取当前项目
  useEffect(() => {
    const cachedProject = localStorage.getItem("currentProject");
    if (cachedProject) {
      setCurrentProject(cachedProject);
    }
  }, []);
  
  // 站点名称 - 使用固定初始值避免 hydration 错误
  const [siteName, setSiteName] = useState<string>("QuickDeck");
  
  // 在客户端 mounted 后从 localStorage 读取站点名称
  useEffect(() => {
    const cachedSiteName = localStorage.getItem("siteName");
    if (cachedSiteName) {
      setSiteName(cachedSiteName);
    }
  }, []);
  
  // 使用 ref 防止重复请求
  const isLoadingRef = useRef(false);
  const isLoadingSiteNameRef = useRef(false);
  const onProjectChangeRef = useRef(onProjectChange);
  
  // 同步 onProjectChange ref
  useEffect(() => {
    onProjectChangeRef.current = onProjectChange;
  }, [onProjectChange]);

  // 加载项目列表
  const loadProjects = useCallback(async () => {
    // 防止重复请求
    if (isLoadingRef.current) {
      return;
    }
    
    isLoadingRef.current = true;
    
    try {
      setLoading(true);
      const data = await projectApi.getAll();
      setProjects(data);
      
      // 验证并设置当前项目
      setCurrentProject((prev) => {
        // 如果之前有选中的项目，验证它是否还在有权限的项目列表中
        if (prev) {
          const projectExists = data.some((p) => p.name === prev);
          if (!projectExists) {
            // 如果项目不在列表中，清除选择
            if (typeof window !== "undefined") {
              localStorage.removeItem("currentProject");
            }
            onProjectChangeRef.current?.(undefined as any);
            return null;
          }
          // 项目存在，保持选择
          return prev;
        }
        
        // 如果没有当前选中的项目，且项目列表不为空，自动选择第一个项目
        if (data.length > 0) {
          const firstProject = data[0].name;
          onProjectChangeRef.current?.(firstProject);
          // 保存到 localStorage
          if (typeof window !== "undefined") {
            localStorage.setItem("currentProject", firstProject);
          }
          return firstProject;
        }
        
        return null;
      });
    } catch (error) {
      // 401 错误会触发自动跳转到登录页，不需要显示错误消息
      if (error instanceof Error && error.message.includes("认证失败")) {
        return;
      }
      // 其他错误不显示消息，避免干扰用户体验
      console.error("加载项目列表失败:", error);
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, []); // 移除 session 依赖

  // 使用 session 的 user.id 作为依赖，而不是整个 session 对象
  // 这样可以避免 session 对象引用变化导致的重复触发
  const userId = session?.user?.id;
  
  useEffect(() => {
    // 只有在用户已登录时才加载项目列表
    if (userId) {
      loadProjects();
    }
  }, [userId, loadProjects]); // 只依赖 userId，避免 session 对象引用变化

  // 加载站点名称配置
  const loadSiteName = useCallback(async () => {
    // 防止重复请求
    if (isLoadingSiteNameRef.current) {
      return;
    }
    
    isLoadingSiteNameRef.current = true;
    
    try {
      const configs = await systemConfigApi.getAll();
      const siteNameConfig = configs.find((config) => config.name === "site_name");
      if (siteNameConfig?.value) {
        setSiteName(siteNameConfig.value);
        // 缓存到 localStorage
        if (typeof window !== "undefined") {
          localStorage.setItem("siteName", siteNameConfig.value);
        }
      }
    } catch (error) {
      // 静默失败，使用默认值或缓存值
      console.error("加载站点名称失败:", error);
    } finally {
      isLoadingSiteNameRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (userId) {
      loadSiteName();
    }
  }, [userId, loadSiteName]); // 只依赖 userId，避免 session 对象引用变化

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

  // 监听站点名称更新事件
  useEffect(() => {
    const handleSiteNameUpdate = (event: CustomEvent) => {
      const newSiteName = event.detail?.siteName;
      if (newSiteName) {
        setSiteName(newSiteName);
      }
    };

    window.addEventListener("siteNameUpdated", handleSiteNameUpdate as EventListener);

    return () => {
      window.removeEventListener("siteNameUpdated", handleSiteNameUpdate as EventListener);
    };
  }, []);

  // 根据路径确定选中的菜单项
  const getSelectedKey = () => {
    if (pathname?.includes("/projects")) return "project-management";
    if (pathname?.includes("/users")) return "user-management";
    if (pathname?.includes("/system-config")) return "system-config";
    if (pathname?.includes("/history")) return "history";
    if (pathname?.includes("/credentials")) return "credentials";
    return "tasks";
  };

  const [selectedMenu, setSelectedMenu] = useState(getSelectedKey());
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // 检测是否为移动设备
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 提取 isAdmin 状态，避免每次都从 session 读取
  const isAdmin = (session as any)?.isAdmin || false;
  
  useEffect(() => {
    // 只有在用户已登录时才执行重定向逻辑
    if (!userId) {
      return;
    }
    
    const key = getSelectedKey();
    
    // 只对普通用户：如果没有项目，且选中的是工具相关的菜单，显示空状态
    // 管理员无需重定向，可以直接访问所有页面
    if (!isAdmin && projects.length === 0 && (key === "tasks" || key === "history" || key === "credentials")) {
      // 非管理员用户没有项目时，显示空状态即可，不跳转
      setSelectedMenu(key);
    } else {
      setSelectedMenu(key);
    }
  }, [pathname, projects.length, userId, isAdmin, router]); // 使用 userId 和 isAdmin 替代 session

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

  // 获取用户信息
  const user = session?.user as any;

  // 侧边栏菜单项 - 根据是否有项目和管理员权限动态显示
  const sideMenuItems: MenuProps["items"] = [
    // 管理员始终显示工具菜单，普通用户只有当有项目时才显示
    ...(isAdmin || projects.length > 0
      ? [
          {
            key: "tasks",
            icon: <CheckSquareOutlined />,
            label: "工具列表",
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
    // 只有管理员才能看到项目管理、用户管理和系统配置
    ...(isAdmin
      ? [
          {
            key: "project-management",
            icon: <SettingOutlined />,
            label: "项目管理",
          },
          {
            key: "user-management",
            icon: <TeamOutlined />,
            label: "用户管理",
          },
          {
            key: "system-config",
            icon: <SettingOutlined />,
            label: "系统配置",
          },
        ]
      : []),
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    setSelectedMenu(key);
    setDrawerVisible(false); // 点击菜单后关闭抽屉
    if (key === "tasks") {
      router.push("/dashboard");
    } else if (key === "history") {
      router.push("/dashboard/history");
    } else if (key === "credentials") {
      router.push("/dashboard/credentials");
    } else if (key === "project-management") {
      router.push("/dashboard/projects");
    } else if (key === "user-management") {
      router.push("/dashboard/users");
    } else if (key === "system-config") {
      router.push("/dashboard/system-config");
    }
  };

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
          padding: isMobile ? "0 12px" : "0 24px",
          background: "#fff",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          height: 64,
          lineHeight: "64px",
        }}
      >
        {/* 左侧：Logo 和项目切换 */}
        <Space size={isMobile ? "small" : "large"} align="center">
          {/* 移动端汉堡菜单 */}
          {isMobile && (
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setDrawerVisible(true)}
              style={{
                width: 40,
                height: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
              }}
            />
          )}
          <div
            style={{
              fontSize: isMobile ? "16px" : "20px",
              fontWeight: "bold",
              color: "#1890ff",
              lineHeight: "20px",
              display: "flex",
              alignItems: "center",
              whiteSpace: "nowrap",
            }}
          >
            {siteName}
          </div>
          {!isMobile && projects.length > 0 ? (
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
          ) : !isMobile && !loading ? (
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
        <Space size={isMobile ? "small" : "middle"}>
          {/* 帮助入口 */}
          {!isMobile && (
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
          )}

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
              {!isMobile && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <Text strong>{userName}</Text>
                  {userEmail && (
                    <Text type="secondary" style={{ fontSize: "12px" }}>
                      {userEmail}
                    </Text>
                  )}
                </div>
              )}
            </Space>
          </Dropdown>
        </Space>
      </Header>

      <Layout>
        {/* 桌面端侧边栏 */}
        {!isMobile && (
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
        )}

        {/* 移动端抽屉式侧边栏 */}
        <Drawer
          title={
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ fontSize: "18px", fontWeight: "bold", color: "#1890ff" }}>
                {siteName}
              </div>
              {projects.length > 0 && (
                <Select
                  value={currentProject}
                  onChange={handleProjectChange}
                  options={projectOptions}
                  style={{ width: "100%" }}
                  loading={loading}
                  placeholder="选择项目"
                  className="project-selector"
                />
              )}
            </div>
          }
          placement="left"
          onClose={() => setDrawerVisible(false)}
          open={drawerVisible}
          width={280}
          closable={false}
          styles={{
            body: { padding: 0 }
          }}
        >
          <Menu
            mode="inline"
            selectedKeys={[selectedMenu]}
            items={sideMenuItems}
            style={{ border: 0 }}
            onClick={handleMenuClick}
          />
        </Drawer>

        {/* 内容区域 */}
        <Layout style={{ minHeight: "calc(100vh - 64px)" }}>
          <Content
            style={{
              margin: isMobile ? "8px" : "16px",
              padding: isMobile ? 12 : 16,
              minHeight: 280,
              background: "#fff",
            }}
          >
            {children}
          </Content>
        </Layout>
      </Layout>

      <style jsx global>{`
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

        /* 移动端优化 */
        @media (max-width: 768px) {
          /* 确保移动端内容不溢出 */
          body {
            overflow-x: hidden;
          }
          
          /* 表格横向滚动 */
          .ant-table-wrapper {
            overflow-x: auto;
          }
          
          /* 表单优化 */
          .ant-form-item {
            margin-bottom: 16px;
          }
          
          /* 按钮组优化 */
          .ant-space {
            flex-wrap: wrap;
          }
          
          /* 卡片间距优化 */
          .ant-card {
            margin-bottom: 12px;
          }
          
          /* 抽屉标题区域优化 */
          .ant-drawer-header {
            padding: 16px;
          }
          
          .ant-drawer-body {
            padding: 0;
          }

          /* 模态框优化 */
          .ant-modal {
            max-width: calc(100vw - 32px) !important;
            margin: 16px auto;
          }

          /* 下拉菜单优化 */
          .ant-select-dropdown {
            max-width: calc(100vw - 32px);
          }
        }

        /* 平板设备优化 */
        @media (min-width: 769px) and (max-width: 1024px) {
          .ant-layout-sider {
            width: 180px !important;
            min-width: 180px !important;
          }
        }
      `}</style>
    </Layout>
  );
}

