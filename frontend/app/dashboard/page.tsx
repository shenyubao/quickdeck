"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Layout,
  Typography,
  Input,
  Button,
  Space,
  Tree,
  Dropdown,
  Empty,
  Spin,
  message,
  Popconfirm,
  Modal,
  Form,
} from "antd";
import type { TreeDataNode, MenuProps } from "antd";
import {
  MoreOutlined,
  EditOutlined,
  CopyOutlined,
  DeleteOutlined,
  StopOutlined,
  DownloadOutlined,
  PlusOutlined,
  CaretRightOutlined,
  CaretDownOutlined,
} from "@ant-design/icons";
import { jobApi, projectApi, type Job, type Project } from "@/lib/api";

const { Content, Sider } = Layout;
const { Title, Text } = Typography;

interface TreeNode extends TreeDataNode {
  key: string;
  title: React.ReactNode;
  isLeaf?: boolean;
  job?: Job;
  children?: TreeNode[];
}

export default function Dashboard() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [expandedKeys, setExpandedKeysState] = useState<React.Key[]>([]);
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);

  // 获取所有节点的 keys（用于展开全部）
  const getAllKeys = useCallback((nodes: TreeNode[]): React.Key[] => {
    let keys: React.Key[] = [];
    nodes.forEach((node) => {
      keys.push(node.key);
      if (node.children) {
        keys = keys.concat(getAllKeys(node.children));
      }
    });
    return keys;
  }, []);

  // 保存展开状态到 localStorage
  const saveExpandedKeys = useCallback((keys: React.Key[], projectId?: number) => {
    if (typeof window !== "undefined" && projectId) {
      localStorage.setItem(`expandedKeys_${projectId}`, JSON.stringify(keys));
    }
  }, []);

  // 从 localStorage 加载展开状态
  const loadExpandedKeys = useCallback((projectId?: number): React.Key[] => {
    if (typeof window !== "undefined" && projectId) {
      const saved = localStorage.getItem(`expandedKeys_${projectId}`);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          return [];
        }
      }
    }
    return [];
  }, []);

  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [form] = Form.useForm();
  const [siderWidth, setSiderWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);

  // 获取当前项目
  const currentProject = useMemo(() => {
    // 从 localStorage 获取当前项目名称
    if (typeof window === "undefined") return null;
    const projectName = localStorage.getItem("currentProject");
    if (!projectName) return null;
    return projects.find((p) => p.name === projectName) || null;
  }, [projects]);

  // 设置展开状态（同时保存到 localStorage）
  const setExpandedKeys = useCallback((keys: React.Key[] | ((prev: React.Key[]) => React.Key[])) => {
    setExpandedKeysState((prev) => {
      const newKeys = typeof keys === "function" ? keys(prev) : keys;
      if (currentProject) {
        saveExpandedKeys(newKeys, currentProject.id);
      }
      return newKeys;
    });
  }, [currentProject, saveExpandedKeys]);

  // 监听项目变化事件
  useEffect(() => {
    const handleStorageChange = () => {
      // 当 localStorage 中的项目变化时，重新加载任务
      if (currentProject) {
        loadJobs();
      }
    };
    window.addEventListener("storage", handleStorageChange);
    // 也监听自定义事件（当 layout 中的项目切换时）
    window.addEventListener("projectChanged", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("projectChanged", handleStorageChange);
    };
  }, [currentProject]);

  // 加载项目列表
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const data = await projectApi.getAll();
        setProjects(data);
      } catch (error) {
        console.error("加载项目列表失败:", error);
      }
    };
    loadProjects();
  }, []);

  // 加载任务列表
  useEffect(() => {
    if (currentProject) {
      loadJobs();
    } else {
      setJobs([]);
      setLoading(false);
    }
  }, [currentProject]);

  const loadJobs = async () => {
    if (!currentProject) return;
    
    try {
      setLoading(true);
      const data = await jobApi.getAll(currentProject.id);
      setJobs(data);
    } catch (error) {
      if (error instanceof Error && error.message.includes("认证失败")) {
        return;
      }
      message.error(error instanceof Error ? error.message : "加载任务列表失败");
    } finally {
      setLoading(false);
    }
  };

  // 构建树形结构
  const treeData = useMemo(() => {
    if (!jobs.length) return [];

    // 根据 path 构建层级结构
    const pathMap = new Map<string, TreeNode>();
    const rootNodes: TreeNode[] = [];

    jobs.forEach((job) => {
      const pathParts = job.path.split("/").filter((p) => p);
      
      // 构建路径节点
      let currentPath = "";
      let parentNode: TreeNode | null = null;

      pathParts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const nodeKey = `path-${currentPath}`;

        if (!pathMap.has(nodeKey)) {
          const node: TreeNode = {
            key: nodeKey,
            title: part,
            isLeaf: index === pathParts.length - 1,
            children: [],
          };

          pathMap.set(nodeKey, node);

          if (parentNode) {
            if (!parentNode.children) {
              parentNode.children = [];
            }
            parentNode.children.push(node);
          } else {
            rootNodes.push(node);
          }
        }

        const node = pathMap.get(nodeKey);
        if (node) {
          parentNode = node;
        }
      });

      // 添加任务节点
      const jobNode: TreeNode = {
        key: `job-${job.id}`,
        title: (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CaretRightOutlined style={{ color: "#52c41a", fontSize: 12 }} />
            <span>{job.name}</span>
            {job.description && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                负责人: {job.description}
              </Text>
            )}
          </div>
        ),
        isLeaf: true,
        job,
      };

      if (parentNode) {
        const node = parentNode as TreeNode;
        if (!node.children) {
          node.children = [];
        }
        node.children.push(jobNode);
      } else {
        rootNodes.push(jobNode);
      }
    });

    return rootNodes;
  }, [jobs]);

  // 处理树节点选择
  const handleSelect = (selectedKeys: React.Key[], info: any) => {
    const node = info.node as TreeNode;
    if (node.job) {
      setSelectedJob(node.job);
    } else {
      setSelectedJob(null);
    }
  };

  // 展开/折叠所有节点
  const handleExpandAll = () => {
    setExpandedKeys(getAllKeys(treeData));
  };

  const handleCollapseAll = () => {
    setExpandedKeys([]);
  };

  // 初始化展开状态：如果有保存的状态则恢复，否则默认展开全部
  useEffect(() => {
    if (treeData.length > 0 && currentProject) {
      const savedKeys = loadExpandedKeys(currentProject.id);
      const allKeys = getAllKeys(treeData);
      
      if (savedKeys.length > 0) {
        // 验证保存的 keys 是否仍然有效（过滤掉不存在的节点）
        const validKeys = savedKeys.filter((key: React.Key) => allKeys.includes(key));
        if (validKeys.length > 0) {
          // 使用 setExpandedKeys 来同时更新状态和保存到 localStorage
          setExpandedKeys(validKeys);
        } else {
          // 如果保存的 keys 都无效，则默认展开全部
          const allKeysArray = getAllKeys(treeData);
          setExpandedKeys(allKeysArray);
        }
      } else {
        // 默认展开全部
        const allKeysArray = getAllKeys(treeData);
        setExpandedKeys(allKeysArray);
      }
    }
  }, [treeData, currentProject, getAllKeys, loadExpandedKeys, setExpandedKeys]);

  // 处理拖拽调整宽度
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      // 限制最小和最大宽度
      if (newWidth >= 200 && newWidth <= 800) {
        setSiderWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  // 删除任务
  const handleDeleteJob = async () => {
    if (!selectedJob) return;
    try {
      await jobApi.delete(selectedJob.id);
      message.success("删除成功");
      setSelectedJob(null);
      loadJobs();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  // 任务操作菜单
  const jobMenuItems: MenuProps["items"] = selectedJob
    ? [
        {
          key: "edit",
          label: "编辑此任务...",
          icon: <EditOutlined />,
          onClick: () => {
            setEditingJob(selectedJob);
            form.setFieldsValue({
              name: selectedJob.name,
              path: selectedJob.path,
              description: selectedJob.description || "",
            });
            setIsJobModalOpen(true);
          },
        },
        {
          key: "duplicate",
          label: "复制此任务...",
          icon: <CopyOutlined />,
          onClick: async () => {
            if (!selectedJob || !currentProject) return;
            try {
              await jobApi.create({
                name: `${selectedJob.name} (副本)`,
                path: selectedJob.path,
                description: selectedJob.description,
                project_id: currentProject.id,
              });
              message.success("任务复制成功");
              loadJobs();
            } catch (error) {
              message.error(error instanceof Error ? error.message : "复制失败");
            }
          },
        },
        {
          key: "duplicate-to-other",
          label: "复制此任务到其他项目...",
          icon: <CopyOutlined />,
          disabled: true, // 暂时禁用
        },
        {
          type: "divider",
        },
        {
          key: "delete",
          label: "删除此任务",
          icon: <DeleteOutlined />,
          danger: true,
          onClick: () => {
            Modal.confirm({
              title: "确定要删除这个任务吗？",
              content: "删除后无法恢复",
              okText: "确定",
              cancelText: "取消",
              onOk: handleDeleteJob,
            });
          },
        },
        {
          key: "disable",
          label: "禁用执行",
          icon: <StopOutlined />,
          disabled: true, // 暂时禁用
        },
        {
          type: "divider",
        },
        {
          key: "download-xml",
          label: "下载任务定义 (XML)",
          icon: <DownloadOutlined />,
          disabled: true, // 暂时禁用
        },
        {
          key: "download-yaml",
          label: "下载任务定义 (YAML)",
          icon: <DownloadOutlined />,
          disabled: true, // 暂时禁用
        },
        {
          key: "download-json",
          label: "下载任务定义 (JSON)",
          icon: <DownloadOutlined />,
          disabled: true, // 暂时禁用
        },
      ]
    : [];

  // 保存任务
  const handleSaveJob = async () => {
    try {
      const values = await form.validateFields();
      if (!currentProject) {
        message.error("请先选择项目");
        return;
      }

      if (editingJob) {
        await jobApi.update(editingJob.id, values);
        message.success("修改成功");
      } else {
        await jobApi.create({
          ...values,
          project_id: currentProject.id,
        });
        message.success("创建成功");
      }
      setIsJobModalOpen(false);
      form.resetFields();
      setEditingJob(null);
      loadJobs();
    } catch (error) {
      if (error instanceof Error && error.message.includes("验证")) {
        return;
      }
      message.error(error instanceof Error ? error.message : "操作失败");
    }
  };


  if (!currentProject) {
    return (
      <div style={{ textAlign: "center", padding: "50px 0" }}>
        <Empty
          description="请先选择一个项目"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </div>
    );
  }

  return (
    <Layout style={{ height: "100%", background: "#f0f2f5" }}>
      <Layout style={{ height: "100%" }}>
        {/* 左侧任务树 */}
        <div style={{ position: "relative", display: "flex" }}>
          <Sider
            width={siderWidth}
            style={{
              background: "#fff",
              borderRight: "1px solid #f0f0f0",
              overflow: "auto",
            }}
          >
          <div
            style={{
              padding: "16px",
              borderBottom: "1px solid #f0f0f0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Space>
              <Button type="link" size="small" onClick={handleExpandAll}>
                展开全部
              </Button>
              <Button type="link" size="small" onClick={handleCollapseAll}>
                折叠全部
              </Button>
            </Space>
            <Button
              type="link"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => router.push("/dashboard/jobs/new")}
            >
              新建任务
            </Button>
          </div>
          <div style={{ padding: "8px" }}>
            <Spin spinning={loading}>
              {treeData.length > 0 ? (
                <Tree
                  treeData={treeData}
                  selectedKeys={selectedJob ? [`job-${selectedJob.id}`] : []}
                  expandedKeys={expandedKeys}
                  onSelect={handleSelect}
                  onExpand={setExpandedKeys}
                  blockNode
                  showIcon={false}
                  showLine={{ showLeafIcon: false }}
                />
              ) : (
                <Empty
                  description="暂无任务"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  style={{ marginTop: 50 }}
                />
              )}
            </Spin>
          </div>
          </Sider>
          {/* 可拖拽的分隔条 */}
          <div
            onMouseDown={handleMouseDown}
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: "4px",
              cursor: "col-resize",
              backgroundColor: isResizing ? "#1890ff" : "transparent",
              zIndex: 10,
              transition: isResizing ? "none" : "background-color 0.2s",
            }}
            onMouseEnter={(e) => {
              if (!isResizing) {
                e.currentTarget.style.backgroundColor = "#d9d9d9";
              }
            }}
            onMouseLeave={(e) => {
              if (!isResizing) {
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
          />
        </div>

        {/* 右侧内容区 */}
        <Content
          style={{
            background: "#fff",
            padding: "24px",
            overflow: "auto",
          }}
        >
          {selectedJob ? (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <Title level={5} style={{ margin: 0 }}>
                  {selectedJob.name}
                </Title>
                <Dropdown
                  menu={{ items: jobMenuItems }}
                  trigger={["click"]}
                  placement="bottomRight"
                >
                  <Button icon={<MoreOutlined />}>操作</Button>
                </Dropdown>
              </div>
              <div style={{ marginBottom: 16 }}>
                <Text type="secondary">路径: </Text>
                <Text>{selectedJob.path}</Text>
              </div>
              {selectedJob.description && (
                <div style={{ marginBottom: 16 }}>
                  <Text type="secondary">描述: </Text>
                  <Text>{selectedJob.description}</Text>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "50px 0" }}>
              <Empty
                description="请选择一个任务查看详情"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </div>
          )}

          {/* 活动日志区域 */}
          <div style={{ marginTop: 32, borderTop: "1px solid #f0f0f0", paddingTop: 16 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <Title level={5} style={{ margin: 0 }}>
                任务活动
              </Title>
              <Text type="secondary">0 次执行</Text>
            </div>
            <Empty
              description="没有查询结果"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ marginTop: 50 }}
            />
          </div>
        </Content>
      </Layout>

      {/* 任务编辑/创建模态框 */}
      <Modal
        title={editingJob ? "编辑任务" : "新建任务"}
        open={isJobModalOpen}
        onOk={handleSaveJob}
        onCancel={() => {
          setIsJobModalOpen(false);
          form.resetFields();
          setEditingJob(null);
        }}
        okText="确定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="任务名称"
            rules={[{ required: true, message: "请输入任务名称" }]}
          >
            <Input placeholder="请输入任务名称" />
          </Form.Item>
          <Form.Item
            name="path"
            label="任务路径"
            rules={[{ required: true, message: "请输入任务路径" }]}
          >
            <Input placeholder="例如: 数据接入/炼丹炉" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea
              placeholder="请输入任务描述"
              rows={3}
              showCount
              maxLength={200}
            />
          </Form.Item>
        </Form>
      </Modal>

    </Layout>
  );
}
