"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
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
  DatePicker,
  InputNumber,
  Upload,
  Tabs,
  Select,
} from "antd";
import type { TreeDataNode, MenuProps } from "antd";
import {
  MoreOutlined,
  EditOutlined,
  CopyOutlined,
  DeleteOutlined,
  PlusOutlined,
  CaretRightOutlined,
  CaretDownOutlined,
} from "@ant-design/icons";
import { jobApi, projectApi, credentialApi, type Job, type Project, type JobDetail, type OptionResponse, type Credential } from "@/lib/api";

const { Content, Sider } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

interface TreeNode extends TreeDataNode {
  key: string;
  title: React.ReactNode;
  isLeaf?: boolean;
  job?: Job;
  children?: TreeNode[];
}

export default function Dashboard() {
  const router = useRouter();
  const { data: session } = useSession();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [jobsInSelectedPath, setJobsInSelectedPath] = useState<Job[]>([]);
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [jobResultHtml, setJobResultHtml] = useState<string>("");
  const [jobResult, setJobResult] = useState<{ text?: string; dataset?: any } | null>(null);
  const [jobLogs, setJobLogs] = useState<string>("");
  const [expandedKeys, setExpandedKeysState] = useState<React.Key[]>([]);
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [runForm] = Form.useForm();
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [credentialsMap, setCredentialsMap] = useState<Record<string, Credential[]>>({});

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

  // 获取所有节点（包括子节点）
  const getAllNodes = useCallback((node: TreeNode): TreeNode[] => {
    const nodes: TreeNode[] = [node];
    if (node.children) {
      node.children.forEach((child) => {
        nodes.push(...getAllNodes(child));
      });
    }
    return nodes;
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
      // 当 localStorage 中的项目变化时，重新加载工具
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

  // 加载工具列表
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
      message.error(error instanceof Error ? error.message : "加载工具列表失败");
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

      // 添加工具节点
      const jobNode: TreeNode = {
        key: `job-${job.id}`,
        title: (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CaretRightOutlined style={{ color: "#52c41a", fontSize: 12 }} />
            <span>{job.name}</span>
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
  const handleSelect = async (selectedKeys: React.Key[], info: any) => {
    const node = info.node as TreeNode;
    if (node.job) {
      // 点击工具节点
      setSelectedJob(node.job);
      setSelectedPath(null);
      setJobsInSelectedPath([]);
      // 获取工具详情（包含 workflow）
      try {
        setLoadingDetail(true);
        const detail = await jobApi.getDetailById(node.job.id);
        setJobDetail(detail);
        // 初始化表单默认值
        if (detail.workflow?.options) {
          const initialValues: Record<string, any> = {};
          detail.workflow.options.forEach((option) => {
            if (option.default_value !== null && option.default_value !== undefined && option.default_value !== "") {
              initialValues[option.name] = option.default_value;
            }
          });
          runForm.setFieldsValue(initialValues);
          
          // 加载凭证列表（如果有凭证类型的参数）
          if (currentProject) {
            const credentialTypes = new Set<string>();
            detail.workflow.options.forEach((option) => {
              if (option.option_type === "credential" && option.credential_type) {
                credentialTypes.add(option.credential_type);
              }
            });
            
            // 加载所有需要的凭证类型
            const loadCredentials = async () => {
              const newCredentialsMap: Record<string, Credential[]> = {};
              for (const type of credentialTypes) {
                try {
                  const creds = await credentialApi.getAll({
                    project_id: currentProject.id,
                    credential_type: type,
                  });
                  newCredentialsMap[type] = creds;
                } catch (error) {
                  console.error(`加载${type}凭证失败:`, error);
                  newCredentialsMap[type] = [];
                }
              }
              setCredentialsMap(newCredentialsMap);
            };
            if (credentialTypes.size > 0) {
              loadCredentials();
            }
          }
        }
      } catch (error) {
        message.error(error instanceof Error ? error.message : "获取工具详情失败");
        setJobDetail(null);
      } finally {
        setLoadingDetail(false);
      }
    } else {
      // 点击路径节点 - 显示路径信息和该路径下的所有工具
      setSelectedJob(null);
      setJobDetail(null);
      runForm.resetFields();
      
      // 收集该路径下的所有工具
      const pathKey = node.key as string;
      const pathPrefix = pathKey.replace("path-", "");
      setSelectedPath(pathPrefix);
      
      // 获取该路径及其子路径下的所有工具
      const jobsInPath = jobs.filter((job) => {
        const jobPath = job.path.startsWith("/") ? job.path.slice(1) : job.path;
        // 匹配路径前缀，包括直接在该路径下的工具
        return jobPath === pathPrefix || jobPath.startsWith(pathPrefix + "/");
      });
      setJobsInSelectedPath(jobsInPath);
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

  // 删除工具
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

  // 工具操作菜单
  const jobMenuItems: MenuProps["items"] = selectedJob
    ? [
        {
          key: "edit",
          label: "编辑此工具...",
          icon: <EditOutlined />,
          onClick: () => {
            router.push(`/dashboard/jobs?id=${selectedJob.id}`);
          },
        },
        {
          key: "duplicate",
          label: "复制此工具...",
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
              message.success("工具复制成功");
              loadJobs();
            } catch (error) {
              message.error(error instanceof Error ? error.message : "复制失败");
            }
          },
        },
        {
          type: "divider",
        },
        {
          key: "delete",
          label: "删除此工具",
          icon: <DeleteOutlined />,
          danger: true,
          onClick: () => {
            Modal.confirm({
              title: "确定要删除这个工具吗？",
              content: "删除后无法恢复",
              okText: "确定",
              cancelText: "取消",
              onOk: handleDeleteJob,
            });
          },
        },
      ]
    : [];

  // 保存工具
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

  // 运行工具
  const handleRunJob = async () => {
    if (!selectedJob || !jobDetail) return;
    
    try {
      const values = await runForm.validateFields();
      
      // 处理参数格式
      const args: Record<string, any> = {};
      Object.keys(values).forEach((key) => {
        const value = values[key];
        if (value !== undefined && value !== null && value !== "") {
          // 如果是日期对象，转换为字符串
          if (value && typeof value === "object" && "format" in value) {
            args[key] = value.format("YYYY-MM-DD");
          } else if (Array.isArray(value) && value.length === 0) {
            // 跳过空数组
            return;
          } else {
            // Form.Item 已经处理了多值输入的转换，这里直接使用
            args[key] = value;
          }
        }
      });

      setRunning(true);
      setRunError(null);
      setJobResultHtml("");
      setJobResult(null);
      setJobLogs("");

      // 调用运行工具的 API
      const result = await jobApi.run(selectedJob.id, Object.keys(args).length > 0 ? args : undefined);
      
      // 显示结果
      if (result.error) {
        setRunError(result.error);
        setJobResultHtml("");
        setJobResult(null);
        setJobLogs("");
      } else {
        setRunError(null);
        // 后端返回的是 HTML 格式的 output
        setJobResultHtml(result.output || "");
        // 保存 result 对象（包含 text、dataset 和 logs）
        if (result.result) {
          setJobResult(result.result);
          // 使用 logs 字段作为执行日志
          setJobLogs(result.result.logs || "");
        } else {
          setJobResult(null);
          setJobLogs("");
        }
      }
      
      message.success("工具运行完成");
    } catch (error) {
      if (error instanceof Error && error.message.includes("验证")) {
        return;
      }
      const errorMessage = error instanceof Error ? error.message : "运行失败";
      message.error(errorMessage);
      setRunError(errorMessage);
      setJobResultHtml("");
    } finally {
      setRunning(false);
    }
  };

  // 自定义上传函数
  const handleUpload = async (options: any) => {
    const { onSuccess, onError, file, onProgress } = options;
    const formData = new FormData();
    formData.append('file', file);

    try {
      const accessToken = (session as any)?.accessToken;
      if (!accessToken) {
        throw new Error('未找到认证令牌');
      }

      const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/backend/g, 'localhost');
      
      const response = await fetch(`${apiUrl}/api/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`上传失败: ${response.statusText}`);
      }

      const result = await response.json();
      onSuccess(result, file);
    } catch (error) {
      console.error('文件上传错误:', error);
      onError(error);
    }
  };

  // 根据参数类型渲染输入组件
  const renderOptionInput = (option: OptionResponse) => {
    const { option_type, credential_type } = option;
    
    switch (option_type) {
      case "date":
        return <DatePicker style={{ width: "100%" }} />;
      case "number":
        return <InputNumber style={{ width: "100%" }} />;
      case "file":
        return (
          <Upload
            customRequest={handleUpload}
            maxCount={1}
            onChange={(info) => {
              if (info.file.status === 'done') {
                message.success(`${info.file.name} 文件上传成功`);
              } else if (info.file.status === 'error') {
                message.error(`${info.file.name} 文件上传失败`);
              }
            }}
          >
            <Button>选择文件</Button>
          </Upload>
        );
      case "credential":
        // 凭证类型参数，需要根据凭证类型过滤
        const credentials = credentialsMap[credential_type || ""] || [];
        return (
          <Select
            placeholder={`请选择${getCredentialTypeName(credential_type)}`}
            style={{ width: "100%" }}
            showSearch
            optionFilterProp="label"
          >
            {credentials.map((cred) => (
              <Option key={cred.id} value={cred.id} label={cred.name}>
                {cred.name} {cred.description ? `(${cred.description})` : ""}
              </Option>
            ))}
          </Select>
        );
      case "text":
      default:
        return <Input placeholder={`请输入${option.display_name || option.name}`} />;
    }
  };

  // 获取凭证类型显示名称
  const getCredentialTypeName = (type?: string) => {
    switch (type) {
      case "mysql":
        return "MySQL凭证";
      case "oss":
        return "OSS凭证";
      case "deepseek":
        return "DeepSeek凭证";
      default:
        return "凭证";
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
        {/* 左侧工具树 */}
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
              onClick={() => router.push("/dashboard/jobs")}
            >
              新建工具
            </Button>
          </div>
          <div style={{ padding: "8px" }}>
            <Spin spinning={loading}>
              {treeData.length > 0 ? (
                <Tree
                  treeData={treeData}
                  selectedKeys={
                    selectedJob 
                      ? [`job-${selectedJob.id}`] 
                      : selectedPath 
                        ? [`path-${selectedPath}`] 
                        : []
                  }
                  expandedKeys={expandedKeys}
                  onSelect={handleSelect}
                  onExpand={setExpandedKeys}
                  blockNode
                  showIcon={false}
                  showLine={{ showLeafIcon: false }}
                />
              ) : (
                <Empty
                  description="暂无工具"
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
          {selectedPath ? (
            <div>
              <Title level={5} style={{ margin: 0, marginBottom: 16 }}>
                路径: {selectedPath}
              </Title>
              <div style={{ marginBottom: 16 }}>
                <Text type="secondary">
                  该路径下共有 {jobsInSelectedPath.length} 个工具
                </Text>
              </div>
              {jobsInSelectedPath.length > 0 ? (
                <div>
                  <Title level={5} style={{ marginBottom: 16 }}>
                    工具列表
                  </Title>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {jobsInSelectedPath.map((job) => (
                      <div
                        key={job.id}
                        style={{
                          padding: 12,
                          border: "1px solid #f0f0f0",
                          borderRadius: 4,
                          cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "#1890ff";
                          e.currentTarget.style.backgroundColor = "#f0f8ff";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "#f0f0f0";
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                        onClick={() => {
                          // 触发工具节点的选择
                          const jobNode = treeData
                            .flatMap((node) => getAllNodes(node))
                            .find((n) => n.key === `job-${job.id}`);
                          if (jobNode) {
                            handleSelect([jobNode.key], { node: jobNode });
                          }
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <Text strong>{job.name}</Text>
                            {job.description && (
                              <div style={{ marginTop: 4 }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {job.description}
                                </Text>
                              </div>
                            )}
                          </div>
                          <Button
                            type="link"
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/dashboard/jobs?id=${job.id}`);
                            }}
                          >
                            编辑
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <Empty
                  description="该路径下暂无工具"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  style={{ marginTop: 50 }}
                />
              )}
            </div>
          ) : selectedJob ? (
            <Spin spinning={loadingDetail}>
              <div>
                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
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
                      <Button icon={<MoreOutlined />}>更多</Button>
                    </Dropdown>
                  </div>
                  {/* 显示负责人信息 */}
                  {jobDetail?.owner && (
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: "14px" }}>
                        负责人: {jobDetail.owner.nickname || jobDetail.owner.username}
                      </Text>
                    </div>
                  )}
                </div>
                {selectedJob.description && (
                  <div style={{ marginBottom: 16 }}>
                    <Text type="secondary">描述: </Text>
                    <Text>{selectedJob.description}</Text>
                  </div>
                )}
                
                {/* 参数列表 */}
                <div style={{ marginTop: 24 }}>
                  {jobDetail?.workflow?.options && jobDetail.workflow.options.length > 0 ? (
                    <>
                      <Title level={5} style={{ marginBottom: 16 }}>
                        运行参数
                      </Title>
                    </>
                  ) : (
                    <Text type="secondary">该工具没有配置参数</Text>
                  )}
                  <Form
                    form={runForm}
                    layout="vertical"
                    style={{ maxWidth: 600 }}
                  >
                    {jobDetail?.workflow?.options && jobDetail.workflow.options.length > 0 && jobDetail.workflow.options.map((option) => (
                      <Form.Item
                        key={option.id}
                        name={option.name}
                        label={
                          <div>
                            <Text strong>{option.display_name || option.name}</Text>
                            {option.required && (
                              <Text type="danger" style={{ marginLeft: 4 }}>
                                *
                              </Text>
                            )}
                          </div>
                        }
                        tooltip={option.description}
                        rules={[
                          {
                            required: option.required,
                            message: `请输入${option.display_name || option.name}`,
                          },
                        ]}
                      >
                        {renderOptionInput(option)}
                      </Form.Item>
                    ))}
                  </Form>
                  <div style={{ marginTop: 16, textAlign: "right" }}>
                    <Button
                      type="primary"
                      icon={<CaretRightOutlined />}
                      onClick={handleRunJob}
                      loading={running}
                      disabled={running}
                    >
                      {running ? "运行中..." : "运行"}
                    </Button>
                  </div>
                </div>
              </div>
            </Spin>
          ) : (
            <div style={{ textAlign: "center", padding: "50px 0" }}>
              <Empty
                description="请选择一个工具查看详情"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </div>
          )}

          {/* 工具结果区域 */}
          {selectedJob && (
            <div style={{ marginTop: 32, borderTop: "1px solid #f0f0f0", paddingTop: 16 }}>
              <Title level={5} style={{ margin: 0, marginBottom: 16 }}>
                工具结果
              </Title>
              {running ? (
                <div style={{ textAlign: "center", padding: "50px 0" }}>
                  <Spin size="large" />
                  <div style={{ marginTop: 16, color: "#666" }}>工具正在运行中...</div>
                </div>
              ) : runError ? (
                <div
                  style={{
                    padding: 16,
                    background: "#fff2f0",
                    borderRadius: 4,
                    border: "1px solid #ffccc7",
                    color: "#cf1322",
                  }}
                >
                  <Text strong>执行失败：</Text>
                  <pre style={{ marginTop: 8, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {runError}
                  </pre>
                </div>
              ) : jobResultHtml || jobResult ? (
                <Tabs
                  defaultActiveKey="result"
                  items={[
                    {
                      key: "result",
                      label: "运行结果",
                      children: jobResult?.text ? (
                        <div
                          style={{
                            padding: 16,
                            background: "#fafafa",
                            borderRadius: 4,
                            border: "1px solid #f0f0f0",
                            maxHeight: "600px",
                            overflow: "auto",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            fontFamily: "monospace",
                          }}
                        >
                          {jobResult.text}
                        </div>
                      ) : jobResultHtml ? (
                        <div
                          dangerouslySetInnerHTML={{ __html: jobResultHtml }}
                          style={{
                            padding: 16,
                            background: "#fafafa",
                            borderRadius: 4,
                            border: "1px solid #f0f0f0",
                            maxHeight: "600px",
                            overflow: "auto",
                          }}
                        />
                      ) : (
                        <Empty
                          description="暂无运行结果"
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          style={{ marginTop: 50 }}
                        />
                      ),
                    },
                    {
                      key: "dataset",
                      label: "数据详情",
                      children: jobResult?.dataset !== null && jobResult?.dataset !== undefined ? (
                        <div
                          style={{
                            padding: 16,
                            background: "#fafafa",
                            borderRadius: 4,
                            border: "1px solid #f0f0f0",
                            maxHeight: "600px",
                            overflow: "auto",
                          }}
                        >
                          {Array.isArray(jobResult.dataset) && jobResult.dataset.length > 0 && typeof jobResult.dataset[0] === "object" ? (
                            // 如果是对象数组，渲染为表格
                            <table
                              style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                background: "#fff",
                              }}
                            >
                              <thead>
                                <tr style={{ background: "#f5f5f5" }}>
                                  {Object.keys(jobResult.dataset[0]).map((key) => (
                                    <th
                                      key={key}
                                      style={{
                                        padding: "8px 12px",
                                        textAlign: "left",
                                        border: "1px solid #e8e8e8",
                                        fontWeight: 600,
                                      }}
                                    >
                                      {key}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {jobResult.dataset.map((row: any, index: number) => (
                                  <tr key={index}>
                                    {Object.keys(jobResult.dataset[0]).map((key) => (
                                      <td
                                        key={key}
                                        style={{
                                          padding: "8px 12px",
                                          border: "1px solid #e8e8e8",
                                        }}
                                      >
                                        {typeof row[key] === "object"
                                          ? JSON.stringify(row[key])
                                          : String(row[key] ?? "")}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            // 其他情况，显示为 JSON
                            <pre
                              style={{
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                fontFamily: "monospace",
                                margin: 0,
                                background: "#fff",
                                padding: 12,
                                borderRadius: 4,
                              }}
                            >
                              {JSON.stringify(jobResult.dataset, null, 2)}
                            </pre>
                          )}
                        </div>
                      ) : (
                        <Empty
                          description="暂无数据详情"
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          style={{ marginTop: 50 }}
                        />
                      ),
                    },
                    {
                      key: "logs",
                      label: "执行日志",
                      children: jobLogs ? (
                        <div
                          style={{
                            padding: 16,
                            background: "#fafafa",
                            borderRadius: 4,
                            border: "1px solid #f0f0f0",
                            maxHeight: "600px",
                            overflow: "auto",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            fontFamily: "monospace",
                            fontSize: "12px",
                          }}
                        >
                          {jobLogs}
                        </div>
                      ) : (
                        <Empty
                          description="暂无执行日志"
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          style={{ marginTop: 50 }}
                        />
                      ),
                    },
                  ]}
                />
              ) : (
                <Empty
                  description="暂无执行结果"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  style={{ marginTop: 50 }}
                />
              )}
            </div>
          )}
        </Content>
      </Layout>

      {/* 工具编辑/创建模态框 */}
      <Modal
        title={editingJob ? "编辑工具" : "新建工具"}
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
            label="工具名称"
            rules={[{ required: true, message: "请输入工具名称" }]}
          >
            <Input placeholder="请输入工具名称" />
          </Form.Item>
          <Form.Item
            name="path"
            label="工具路径"
            rules={[{ required: true, message: "请输入工具路径" }]}
          >
            <Input placeholder="例如: 数据接入/炼丹炉" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea
              placeholder="请输入工具描述"
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
