"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Typography,
  Table,
  Space,
  Button,
  Card,
  Modal,
  Form,
  Input,
  message,
  Popconfirm,
  Tag,
  Empty,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { credentialApi, projectApi, type Credential, type Project, type CredentialCreate, type CredentialUpdate } from "@/lib/api";
import { Select } from "antd";

const { Title } = Typography;
const { Option } = Select;
const { TextArea } = Input;

export default function CredentialsPage() {
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null);
  const [form] = Form.useForm();

  // 获取当前项目（从 localStorage 获取项目名称，然后从项目列表中找到对应的项目）
  const currentProject = useMemo(() => {
    if (typeof window === "undefined") return null;
    const projectName = localStorage.getItem("currentProject");
    if (!projectName) return null;
    return projects.find((p) => p.name === projectName) || null;
  }, [projects]);

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

  // 加载凭证列表
  const loadCredentials = useCallback(async () => {
    if (!currentProject) return;
    
    try {
      setLoading(true);
      const data = await credentialApi.getAll({ project_id: currentProject.id });
      setCredentials(data);
    } catch (error: any) {
      console.error("加载凭证列表失败:", error);
      message.error(error.message || "加载凭证列表失败");
    } finally {
      setLoading(false);
    }
  }, [currentProject]);

  // 当当前项目变化时，重新加载凭证列表
  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  // 监听项目切换事件
  useEffect(() => {
    const handleProjectChange = () => {
      loadCredentials();
    };
    window.addEventListener("projectChanged", handleProjectChange);
    return () => {
      window.removeEventListener("projectChanged", handleProjectChange);
    };
  }, [loadCredentials]);

  // 打开创建/编辑模态框
  const handleOpenModal = (credential?: Credential) => {
    if (credential) {
      setEditingCredential(credential);
      form.setFieldsValue({
        credential_type: credential.credential_type,
        name: credential.name,
        description: credential.description,
        config: JSON.stringify(credential.config, null, 2),
      });
    } else {
      setEditingCredential(null);
      form.resetFields();
    }
    setModalVisible(true);
  };

  // 关闭模态框
  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingCredential(null);
    form.resetFields();
  };

  // 提交表单
  const handleSubmit = async () => {
    if (!currentProject) {
      message.error("请先在顶部导航中选择项目");
      return;
    }

    try {
      const values = await form.validateFields();
      let config: Record<string, any>;
      try {
        config = JSON.parse(values.config);
      } catch (e) {
        message.error("配置信息必须是有效的JSON格式");
        return;
      }

      if (editingCredential) {
        // 更新凭证
        const updateData: CredentialUpdate = {
          credential_type: values.credential_type,
          name: values.name,
          description: values.description,
          config,
        };
        await credentialApi.update(editingCredential.id, updateData);
        message.success("凭证更新成功");
      } else {
        // 创建凭证
        const createData: CredentialCreate = {
          credential_type: values.credential_type,
          name: values.name,
          description: values.description,
          config,
        };
        await credentialApi.create(currentProject.id, createData);
        message.success("凭证创建成功");
      }
      
      handleCloseModal();
      loadCredentials();
    } catch (error: any) {
      if (error.errorFields) {
        // 表单验证错误
        return;
      }
      message.error(error.message || "操作失败");
    }
  };

  // 删除凭证
  const handleDelete = async (id: number) => {
    try {
      await credentialApi.delete(id);
      message.success("凭证删除成功");
      loadCredentials();
    } catch (error: any) {
      message.error(error.message || "删除失败");
    }
  };

  // 获取凭证类型标签颜色
  const getCredentialTypeColor = (type: string) => {
    switch (type) {
      case "mysql":
        return "blue";
      case "oss":
        return "green";
      case "deepseek":
        return "purple";
      default:
        return "default";
    }
  };

  // 获取凭证类型显示名称
  const getCredentialTypeName = (type: string) => {
    switch (type) {
      case "mysql":
        return "MySQL凭证";
      case "oss":
        return "OSS凭证";
      case "deepseek":
        return "DeepSeek凭证";
      default:
        return type;
    }
  };

  // 表格列定义
  const columns = [
    {
      title: "凭证名称",
      dataIndex: "name",
      key: "name",
      width: 200,
    },
    {
      title: "凭证类型",
      dataIndex: "credential_type",
      key: "credential_type",
      width: 150,
      render: (type: string) => (
        <Tag color={getCredentialTypeColor(type)}>
          {getCredentialTypeName(type)}
        </Tag>
      ),
    },
    {
      title: "描述",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
      render: (text: string) => text || <span style={{ color: "#999" }}>无描述</span>,
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 180,
      render: (text: string) => {
        const date = new Date(text);
        return date.toLocaleString("zh-CN");
      },
    },
    {
      title: "操作",
      key: "action",
      width: 150,
      render: (_: any, record: Credential) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个凭证吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3}>凭证管理</Title>
      </div>

      <Card>
        {/* 操作区域 */}
        <Space style={{ marginBottom: 16, flexWrap: "wrap" }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => handleOpenModal()}
            disabled={!currentProject}
          >
            新建凭证
          </Button>

          <Button
            icon={<ReloadOutlined />}
            onClick={loadCredentials}
            disabled={!currentProject}
          >
            刷新
          </Button>
        </Space>

        {/* 表格 */}
        {currentProject ? (
          <Table
            columns={columns}
            dataSource={credentials}
            rowKey="id"
            loading={loading}
            locale={{
              emptyText: <Empty description="暂无凭证" />,
            }}
          />
        ) : (
          <Empty description="请先在顶部导航中选择项目" />
        )}
      </Card>

      {/* 创建/编辑模态框 */}
      <Modal
        title={editingCredential ? "编辑凭证" : "新建凭证"}
        open={modalVisible}
        onCancel={handleCloseModal}
        onOk={handleSubmit}
        width={700}
        okText="确定"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            credential_type: "mysql",
          }}
        >
          <Form.Item
            name="credential_type"
            label="凭证类型"
            rules={[{ required: true, message: "请选择凭证类型" }]}
          >
            <Select>
              <Option value="mysql">MySQL凭证</Option>
              <Option value="oss">OSS凭证</Option>
              <Option value="deepseek">DeepSeek凭证</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="name"
            label="凭证名称"
            rules={[{ required: true, message: "请输入凭证名称" }]}
          >
            <Input placeholder="请输入凭证名称" />
          </Form.Item>

          <Form.Item
            name="description"
            label="描述"
          >
            <TextArea rows={3} placeholder="请输入凭证描述（可选）" />
          </Form.Item>

          <Form.Item
            name="config"
            label="配置信息（JSON格式）"
            rules={[
              { required: true, message: "请输入配置信息" },
              {
                validator: (_, value) => {
                  if (!value) return Promise.resolve();
                  try {
                    JSON.parse(value);
                    return Promise.resolve();
                  } catch (e) {
                    return Promise.reject(new Error("配置信息必须是有效的JSON格式"));
                  }
                },
              },
            ]}
            extra={
              <div style={{ marginTop: 8 }}>
                <div style={{ marginBottom: 4 }}>配置示例：</div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  MySQL: {`{"host": "localhost", "port": 3306, "user": "root", "password": "password", "database": "dbname"}`}
                </div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  OSS: {`{"endpoint": "oss-cn-hangzhou.aliyuncs.com", "access_key_id": "xxx", "access_key_secret": "xxx", "bucket": "bucket-name"}`}
                </div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  DeepSeek: {`{"api_key": "sk-xxx"}`}
                </div>
              </div>
            }
          >
            <TextArea
              rows={8}
              placeholder='请输入JSON格式的配置信息，例如：{"host": "localhost", "port": 3306}'
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

