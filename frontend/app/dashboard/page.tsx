"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
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
import { jobApi, projectApi, credentialApi, uploadApi, type Job, type Project, type JobDetail, type OptionResponse, type Credential } from "@/lib/api";
import JsonSchemaForm, { type JsonSchemaFormRef } from "./jobs/components/JsonSchemaForm";
import OptionFieldsForm from "./jobs/components/OptionFieldsForm";

const { Content, Sider } = Layout;
const { Title, Text} = Typography;
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
  // ⚠️ 移除 jsonSchemaValues 状态 - 让 JsonSchemaForm 自己管理状态
  // 只在运行时通过 ref 获取值
  const jsonSchemaFormRefs = React.useRef<Record<string, JsonSchemaFormRef | null>>({});

  // 创建稳定的 ref 回调
  const handleJsonSchemaRef = React.useCallback((name: string, ref: JsonSchemaFormRef | null) => {
    if (ref) {
      jsonSchemaFormRefs.current[name] = ref;
    }
  }, []);
  
  
  // 移动端相关状态
  const [isMobile, setIsMobile] = useState(false);
  const [mobileTab, setMobileTab] = useState<'list' | 'detail'>('list');

  // 检测是否为移动设备
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
      if (error instanceof Error) {
        // 如果是认证失败，直接返回（会触发自动登出）
        if (error.message.includes("认证失败")) {
          return;
        }
        // 如果是权限不足（403），清除当前项目选择，让用户重新选择
        if (error.message.includes("权限") || error.message.includes("无权限")) {
          message.warning("您没有访问此项目的权限，已清除项目选择");
          // 清除 localStorage 中的项目选择
          if (typeof window !== "undefined") {
            localStorage.removeItem("currentProject");
            // 触发项目变化事件，让 layout 重新加载项目列表
            window.dispatchEvent(new CustomEvent("projectChanged"));
          }
          return;
        }
        message.error(error.message);
      } else {
        message.error("加载工具列表失败");
      }
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
            isLeaf: false, // 路径节点不是叶子节点
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
        title: job.name,
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
      // ⚠️ 已移除 setJsonSchemaValues({}) - 不再需要
      
      // 移动端切换到详情页
      if (isMobile) {
        setMobileTab('detail');
      }
      
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
      // 点击路径节点 - 切换展开/收起状态
      const nodeKey = node.key;
      setExpandedKeys((prev) => {
        if (prev.includes(nodeKey)) {
          // 如果当前已展开，则收起（移除该key及其所有子节点的key）
          const keysToRemove = getAllKeys(node.children || []);
          return prev.filter((key) => key !== nodeKey && !keysToRemove.includes(key));
        } else {
          // 如果当前已收起，则展开（添加该key）
          return [...prev, nodeKey];
        }
      });
      // 清空选中状态，不在右侧显示内容
      setSelectedJob(null);
      setJobDetail(null);
      runForm.resetFields();
      // ⚠️ 已移除 setJsonSchemaValues({}) - 不再需要
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
      // 验证普通表单
      const values = await runForm.validateFields();
      
      // 验证并获取所有 JSON Schema 表单的值
      const jsonSchemaValidations = Object.keys(jsonSchemaFormRefs.current).map(async (key) => {
        const ref = jsonSchemaFormRefs.current[key];
        if (ref) {
          const jsonValues = await ref.validate();
          return { key, values: jsonValues };
        }
        return { key, values: {} };
      });
      
      const jsonSchemaResults = await Promise.all(jsonSchemaValidations);
      
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

      // 合并 JSON Schema 表单的值
      jsonSchemaResults.forEach(({ key, values: jsonValues }) => {
        if (jsonValues !== undefined && jsonValues !== null) {
          args[key] = jsonValues;
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
      // 验证失败时不需要显示额外的错误消息，由表单自己显示
      if (error instanceof Error && !error.message.includes("验证")) {
        const errorMessage = error.message;
        message.error(errorMessage);
        setRunError(errorMessage);
        setJobResultHtml("");
      }
    } finally {
      setRunning(false);
    }
  };

  // 自定义上传函数
  const handleUpload = async (options: any) => {
    const { onSuccess, onError, file, onProgress } = options;

    try {
      const result = await uploadApi.upload(file);
      onSuccess(result, file);
    } catch (error) {
      console.error('文件上传错误:', error);
      onError(error);
    }
  };

  // 获取凭证类型显示名称
  const getCredentialTypeName = React.useCallback((type?: string) => {
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
  }, []);


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

  // 左侧工具树组件
  const JobTreeSider = () => (
    <Sider
      width={isMobile ? '100%' : siderWidth}
      style={{
        background: "#fff",
        borderRight: isMobile ? "none" : "1px solid #f0f0f0",
        overflow: "auto",
        height: isMobile ? "auto" : undefined,
      }}
    >
      <div
        style={{
          padding: isMobile ? "12px" : "16px",
          borderBottom: "1px solid #f0f0f0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <Space size="small">
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
  );

  // 右侧详情内容组件
  const JobDetailContent = () => (
    <Content
      style={{
        background: "#fff",
        padding: isMobile ? "16px 12px" : "24px",
        overflow: "auto",
      }}
    >
      {selectedJob ? (
        <Spin spinning={loadingDetail}>
          <div>
            {/* 移动端返回按钮 */}
            {isMobile && (
              <Button
                type="link"
                onClick={() => setMobileTab('list')}
                style={{ marginBottom: 12, padding: 0 }}
              >
                ← 返回工具列表
              </Button>
            )}
            
            <div style={{ marginBottom: isMobile ? 12 : 16 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <Title level={5} style={{ margin: 0, fontSize: isMobile ? '16px' : '18px' }}>
                  {selectedJob.name}
                </Title>
                <Dropdown
                  menu={{ items: jobMenuItems }}
                  trigger={["click"]}
                  placement="bottomRight"
                >
                  <Button icon={<MoreOutlined />} size={isMobile ? 'small' : 'middle'}>
                    更多
                  </Button>
                </Dropdown>
              </div>
              {/* 显示负责人信息 */}
              {jobDetail?.owner && (
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: isMobile ? "12px" : "14px" }}>
                    负责人: {jobDetail.owner.nickname || jobDetail.owner.username}
                  </Text>
                </div>
              )}
            </div>
            {selectedJob.description && (
              <div style={{ marginBottom: isMobile ? 12 : 16 }}>
                <Text type="secondary" style={{ fontSize: isMobile ? "13px" : "14px" }}>描述: </Text>
                <Text style={{ fontSize: isMobile ? "13px" : "14px" }}>{selectedJob.description}</Text>
              </div>
            )}
            
            {/* 参数列表 */}
            <div style={{ marginTop: isMobile ? 16 : 24 }}>
              {jobDetail?.workflow?.options && jobDetail.workflow.options.length > 0 ? (
                <>
                  <Title level={5} style={{ marginBottom: isMobile ? 12 : 16, fontSize: isMobile ? '15px' : '16px' }}>
                    运行参数
                  </Title>
                  
                  {/* JSON Schema 类型的字段 */}
                  {jobDetail.workflow.options
                    .filter(opt => opt.option_type === "json_schema")
                    .map((option) => {
                      const jsonSchema = typeof option.json_schema === "string" 
                        ? JSON.parse(option.json_schema) 
                        : option.json_schema;
                      
                      return (
                        <div key={option.id} style={{ marginBottom: isMobile ? "20px" : "24px" }}>
                          <div style={{ marginBottom: "8px" }}>
                            <Text strong style={{ fontSize: isMobile ? "13px" : "14px" }}>
                              {option.display_name || option.name}
                            </Text>
                            {option.required && (
                              <Text type="danger" style={{ marginLeft: 4 }}>*</Text>
                            )}
                          </div>
                          {option.description && (
                            <div style={{ marginBottom: "8px", color: "#666", fontSize: isMobile ? "11px" : "12px" }}>
                              {option.description}
                            </div>
                          )}
                          {jsonSchema ? (
                            <JsonSchemaForm
                              key={`json-schema-${option.id}`}
                              ref={(ref) => handleJsonSchemaRef(option.name, ref)}
                              schema={jsonSchema}
                            />
                          ) : (
                            <div style={{ color: "red" }}>JSON Schema 无效</div>
                          )}
                        </div>
                      );
                    })}
                  
                  {/* 其他类型的字段 */}
                  <Form
                    form={runForm}
                    layout="vertical"
                    style={{ maxWidth: isMobile ? '100%' : 600 }}
                  >
                    <OptionFieldsForm
                      options={jobDetail.workflow.options}
                      form={runForm}
                      credentialsMap={credentialsMap}
                      getCredentialTypeName={getCredentialTypeName}
                      isMobile={isMobile}
                    />
                  </Form>
                </>
              ) : (
                <Text type="secondary" style={{ fontSize: isMobile ? "13px" : "14px" }}>
                  该工具没有配置参数
                </Text>
              )}
              <div style={{ marginTop: isMobile ? 12 : 16, textAlign: isMobile ? "center" : "right" }}>
                <Button
                  type="primary"
                  icon={<CaretRightOutlined />}
                  onClick={handleRunJob}
                  loading={running}
                  disabled={running}
                  size={isMobile ? 'middle' : 'middle'}
                  block={isMobile}
                >
                  {running ? "运行中..." : "运行"}
                </Button>
              </div>
            </div>
          </div>
        </Spin>
      ) : (
        <div style={{ textAlign: "center", padding: isMobile ? "30px 0" : "50px 0" }}>
          <Empty
            description="请选择一个工具查看详情"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </div>
      )}

      {/* 工具结果区域 */}
      {selectedJob && (
        <div style={{ marginTop: isMobile ? 24 : 32, borderTop: "1px solid #f0f0f0", paddingTop: isMobile ? 12 : 16 }}>
          <Title level={5} style={{ margin: 0, marginBottom: isMobile ? 12 : 16, fontSize: isMobile ? '15px' : '16px' }}>
            工具结果
          </Title>
          {running ? (
            <div style={{ textAlign: "center", padding: isMobile ? "30px 0" : "50px 0" }}>
              <Spin size="large" />
              <div style={{ marginTop: 16, color: "#666", fontSize: isMobile ? "13px" : "14px" }}>工具正在运行中...</div>
            </div>
          ) : runError ? (
            <div
              style={{
                padding: isMobile ? 12 : 16,
                background: "#fff2f0",
                borderRadius: 4,
                border: "1px solid #ffccc7",
                color: "#cf1322",
                fontSize: isMobile ? "12px" : "14px",
              }}
            >
              <Text strong>执行失败：</Text>
              <pre style={{ marginTop: 8, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: isMobile ? "11px" : "13px" }}>
                {runError}
              </pre>
            </div>
          ) : jobResultHtml || jobResult ? (
            <Tabs
              defaultActiveKey="result"
              size={isMobile ? 'small' : 'middle'}
              items={[
                {
                  key: "result",
                  label: "运行结果",
                  children: jobResult?.text ? (
                    <div
                      style={{
                        padding: isMobile ? 12 : 16,
                        background: "#fafafa",
                        borderRadius: 4,
                        border: "1px solid #f0f0f0",
                        maxHeight: isMobile ? "400px" : "600px",
                        overflow: "auto",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontFamily: "monospace",
                        fontSize: isMobile ? "11px" : "13px",
                      }}
                    >
                      {jobResult.text}
                    </div>
                  ) : jobResultHtml ? (
                    <div
                      dangerouslySetInnerHTML={{ __html: jobResultHtml }}
                      style={{
                        padding: isMobile ? 12 : 16,
                        background: "#fafafa",
                        borderRadius: 4,
                        border: "1px solid #f0f0f0",
                        maxHeight: isMobile ? "400px" : "600px",
                        overflow: "auto",
                        fontSize: isMobile ? "12px" : "14px",
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
                  key: "logs",
                  label: "执行日志",
                  children: jobLogs ? (
                    <div
                      style={{
                        padding: isMobile ? 12 : 16,
                        background: "#fafafa",
                        borderRadius: 4,
                        border: "1px solid #f0f0f0",
                        maxHeight: isMobile ? "400px" : "600px",
                        overflow: "auto",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontFamily: "monospace",
                        fontSize: isMobile ? "10px" : "12px",
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
                {
                  key: "dataset",
                  label: "数据详情",
                  children: jobResult?.dataset !== null && jobResult?.dataset !== undefined ? (
                    <div
                      style={{
                        padding: isMobile ? 12 : 16,
                        background: "#fafafa",
                        borderRadius: 4,
                        border: "1px solid #f0f0f0",
                        maxHeight: isMobile ? "400px" : "600px",
                        overflow: "auto",
                      }}
                    >
                      {Array.isArray(jobResult.dataset) && jobResult.dataset.length > 0 && typeof jobResult.dataset[0] === "object" ? (
                        // 如果是对象数组，渲染为表格
                        <div style={{ overflowX: "auto" }}>
                          <table
                            style={{
                              width: "100%",
                              borderCollapse: "collapse",
                              background: "#fff",
                              fontSize: isMobile ? "11px" : "13px",
                            }}
                          >
                            <thead>
                              <tr style={{ background: "#f5f5f5" }}>
                                {Object.keys(jobResult.dataset[0]).map((key) => (
                                  <th
                                    key={key}
                                    style={{
                                      padding: isMobile ? "6px 8px" : "8px 12px",
                                      textAlign: "left",
                                      border: "1px solid #e8e8e8",
                                      fontWeight: 600,
                                      whiteSpace: "nowrap",
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
                                        padding: isMobile ? "6px 8px" : "8px 12px",
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
                        </div>
                      ) : (
                        // 其他情况，显示为 JSON
                        <pre
                          style={{
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            fontFamily: "monospace",
                            margin: 0,
                            background: "#fff",
                            padding: isMobile ? 8 : 12,
                            borderRadius: 4,
                            fontSize: isMobile ? "10px" : "12px",
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
  );

  // 移动端布局：使用 Tabs 切换列表和详情
  if (isMobile) {
    return (
      <div style={{ height: "100%", background: "#f0f2f5" }}>
        {mobileTab === 'list' ? (
          <div style={{ height: "100%", background: "#fff" }}>
            <JobTreeSider />
          </div>
        ) : (
          <div style={{ height: "100%", overflow: "auto" }}>
            <JobDetailContent />
          </div>
        )}
        
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
          width="100%"
          style={{ top: 0, paddingBottom: 0, maxWidth: "100vw" }}
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
      </div>
    );
  }

  // 桌面端布局：左右分栏
  return (
    <Layout style={{ height: "100%", background: "#f0f2f5" }}>
      <Layout style={{ height: "100%" }}>
        {/* 左侧工具树 */}
        <div style={{ position: "relative", display: "flex" }}>
          <JobTreeSider />
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
        <JobDetailContent />
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
