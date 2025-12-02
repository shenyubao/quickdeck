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
  const credentialType = Form.useWatch("credential_type", form);

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
      const config = credential.config || {};
      const formValues: any = {
        credential_type: credential.credential_type,
        name: credential.name,
        description: credential.description,
      };
      
      // 根据凭证类型填充对应的字段
      if (credential.credential_type === "mysql") {
        formValues.host = config.host || "";
        formValues.port = config.port || "";
        formValues.user = config.user || "";
        formValues.password = config.password || "";
        formValues.database = config.database || "";
      } else if (credential.credential_type === "oss") {
        formValues.endpoint = config.endpoint || "";
        formValues.access_key_id = config.access_key_id || "";
        formValues.access_key_secret = config.access_key_secret || "";
        formValues.bucket = config.bucket || "";
      } else if (credential.credential_type === "deepseek") {
        formValues.api_key = config.api_key || "";
      }
      
      form.setFieldsValue(formValues);
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

  // 处理凭证类型变更
  const handleCredentialTypeChange = (type: string) => {
    // 清空所有配置字段
    const allConfigFields = [
      "host", "port", "user", "password", "database",
      "endpoint", "access_key_id", "access_key_secret", "bucket",
      "api_key"
    ];
    const fieldsToReset: Record<string, undefined> = {};
    allConfigFields.forEach(field => {
      fieldsToReset[field] = undefined;
    });
    form.setFieldsValue(fieldsToReset);
  };

  // 提交表单
  const handleSubmit = async () => {
    if (!currentProject) {
      message.error("请先在顶部导航中选择项目");
      return;
    }

    try {
      const values = await form.validateFields();
      let config: Record<string, any> = {};
      
      // 根据凭证类型组合配置对象
      if (values.credential_type === "mysql") {
        config = {
          host: values.host,
          port: parseInt(values.port) || 3306,
          user: values.user,
          password: values.password,
          database: values.database,
        };
      } else if (values.credential_type === "oss") {
        config = {
          endpoint: values.endpoint,
          access_key_id: values.access_key_id,
          access_key_secret: values.access_key_secret,
          bucket: values.bucket,
        };
      } else if (values.credential_type === "deepseek") {
        config = {
          api_key: values.api_key,
        };
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
      fixed: "right",
      render: (_: any, record: Credential) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
            size="small"
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
              size="small"
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
            scroll={{ x: "max-content" }}
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
            <Select onChange={handleCredentialTypeChange}>
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

          {/* MySQL 凭证配置字段 */}
          {credentialType === "mysql" && (
            <>
              <Form.Item
                name="host"
                label="主机地址"
                rules={[{ required: true, message: "请输入主机地址" }]}
              >
                <Input placeholder="例如: localhost 或 192.168.1.100" />
              </Form.Item>
              <Form.Item
                name="port"
                label="端口"
                rules={[{ required: true, message: "请输入端口" }]}
                initialValue="3306"
              >
                <Input type="number" placeholder="例如: 3306" />
              </Form.Item>
              <Form.Item
                name="user"
                label="用户名"
                rules={[{ required: true, message: "请输入用户名" }]}
              >
                <Input placeholder="请输入数据库用户名" />
              </Form.Item>
              <Form.Item
                name="password"
                label="密码"
                rules={[{ required: true, message: "请输入密码" }]}
              >
                <Input.Password placeholder="请输入数据库密码" />
              </Form.Item>
              <Form.Item
                name="database"
                label="数据库名"
                rules={[{ required: true, message: "请输入数据库名" }]}
              >
                <Input placeholder="请输入数据库名称" />
              </Form.Item>
            </>
          )}

          {/* OSS 凭证配置字段 */}
          {credentialType === "oss" && (
            <>
              <Form.Item
                name="endpoint"
                label="Endpoint"
                rules={[{ required: true, message: "请输入 Endpoint" }]}
              >
                <Input placeholder="例如: oss-cn-hangzhou.aliyuncs.com" />
              </Form.Item>
              <Form.Item
                name="access_key_id"
                label="Access Key ID"
                rules={[{ required: true, message: "请输入 Access Key ID" }]}
              >
                <Input placeholder="请输入 Access Key ID" />
              </Form.Item>
              <Form.Item
                name="access_key_secret"
                label="Access Key Secret"
                rules={[{ required: true, message: "请输入 Access Key Secret" }]}
              >
                <Input.Password placeholder="请输入 Access Key Secret" />
              </Form.Item>
              <Form.Item
                name="bucket"
                label="Bucket 名称"
                rules={[{ required: true, message: "请输入 Bucket 名称" }]}
              >
                <Input placeholder="请输入 Bucket 名称" />
              </Form.Item>
            </>
          )}

          {/* DeepSeek 凭证配置字段 */}
          {credentialType === "deepseek" && (
            <>
              <Form.Item
                name="api_key"
                label="API Key"
                rules={[{ required: true, message: "请输入 API Key" }]}
              >
                <Input.Password placeholder="请输入 DeepSeek API Key (例如: sk-xxx)" />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
}

