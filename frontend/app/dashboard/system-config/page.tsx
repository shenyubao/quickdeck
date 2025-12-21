"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Table,
  Modal,
  Form,
  Input,
  Popconfirm,
  Button,
  Space,
  Typography,
  message,
  Spin,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  EditOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import {
  systemConfigApi,
  type SystemConfig,
  type SystemConfigCreate,
  type SystemConfigUpdate,
} from "@/lib/api";

const { Title } = Typography;
const { TextArea } = Input;

export default function SystemConfigPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = (session as any)?.isAdmin || false;
  const [configs, setConfigs] = useState<SystemConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SystemConfig | null>(null);
  const [form] = Form.useForm();

  // 权限检查：非管理员重定向到首页
  useEffect(() => {
    if (session && !isAdmin) {
      message.warning("您没有权限访问此页面");
      router.push("/dashboard");
    }
  }, [session, isAdmin, router]);

  // 加载系统配置列表
  useEffect(() => {
    if (isAdmin) {
      loadConfigs();
    }
  }, [isAdmin]);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const data = await systemConfigApi.getAll();
      setConfigs(data);
    } catch (error) {
      // 401 错误会触发自动跳转到登录页，不需要显示错误消息
      if (error instanceof Error && error.message.includes("认证失败")) {
        return;
      }
      message.error(
        error instanceof Error ? error.message : "加载系统配置列表失败"
      );
    } finally {
      setLoading(false);
    }
  };

  // 系统配置相关函数
  const handleEditConfig = (config: SystemConfig) => {
    setEditingConfig(config);
    form.setFieldsValue({
      name: config.name,
      description: config.description || "",
      value: config.value || "",
    });
    setIsModalOpen(true);
  };

  const handleResetConfig = async (configId: number) => {
    try {
      const config = await systemConfigApi.reset(configId);
      message.success("还原成功");
      
      // 如果还原的是 site_name，更新 localStorage 并触发事件
      if (config.name === "site_name" && config.value) {
        if (typeof window !== "undefined") {
          localStorage.setItem("siteName", config.value);
          // 触发自定义事件通知其他组件
          window.dispatchEvent(new CustomEvent("siteNameUpdated", {
            detail: { siteName: config.value }
          }));
        }
      }
      
      await loadConfigs();
    } catch (error) {
      // 401 错误会触发自动跳转到登录页，不需要显示错误消息
      if (error instanceof Error && error.message.includes("认证失败")) {
        return;
      }
      message.error(error instanceof Error ? error.message : "还原失败");
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      // 编辑配置，只更新配置值
      const updateData: SystemConfigUpdate = {
        value: values.value || undefined,
      };
      await systemConfigApi.update(editingConfig!.id, updateData);
      message.success("修改成功");
      
      // 如果修改的是 site_name，更新 localStorage 并触发事件
      if (editingConfig!.name === "site_name" && values.value) {
        if (typeof window !== "undefined") {
          localStorage.setItem("siteName", values.value);
          // 触发自定义事件通知其他组件
          window.dispatchEvent(new CustomEvent("siteNameUpdated", {
            detail: { siteName: values.value }
          }));
        }
      }
      
      setIsModalOpen(false);
      form.resetFields();
      await loadConfigs();
    } catch (error) {
      if (error instanceof Error && error.message.includes("验证")) {
        // 表单验证错误，不显示消息
        return;
      }
      // 401 错误会触发自动跳转到登录页，不需要显示错误消息
      if (error instanceof Error && error.message.includes("认证失败")) {
        return;
      }
      message.error(error instanceof Error ? error.message : "操作失败");
    }
  };

  const handleModalCancel = () => {
    setIsModalOpen(false);
    form.resetFields();
    setEditingConfig(null);
  };

  // 表格列定义
  const columns: ColumnsType<SystemConfig> = [
    {
      title: "配置名",
      dataIndex: "name",
      key: "name",
      width: 250,
      render: (text: string, record: SystemConfig) => (
        <div>
          <div style={{ fontWeight: 500 }}>{text}</div>
          {record.description && (
            <div style={{ fontSize: "12px", color: "#8c8c8c" }}>
              {record.description}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "配置值",
      dataIndex: "value",
      key: "value",
      ellipsis: true,
      render: (text: string) => text || "-",
    },
    {
      title: "默认值",
      dataIndex: "default_value",
      key: "default_value",
      width: 200,
      ellipsis: true,
      render: (text: string) => text || "-",
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      key: "updated_at",
      width: 180,
      render: (text: string) =>
        text ? new Date(text).toLocaleString("zh-CN") : "-",
    },
    {
      title: "操作",
      key: "action",
      width: 150,
      fixed: "right",
      render: (_, record: SystemConfig) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEditConfig(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要还原到默认值吗？"
            onConfirm={() => handleResetConfig(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" icon={<UndoOutlined />}>
              还原
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 如果非管理员，不渲染任何内容
  if (!isAdmin) {
    return null;
  }

  return (
    <div style={{ padding: "24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <Title level={2} style={{ margin: 0 }}>
          系统配置管理
        </Title>
      </div>

      <Spin spinning={loading}>
        <Table
          columns={columns}
          dataSource={configs}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showTotal: (total) => `共 ${total} 条`,
            showSizeChanger: true,
            showQuickJumper: true,
          }}
          scroll={{ x: 1000 }}
        />
      </Spin>

      <Modal
        title="编辑系统配置"
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        width={500}
        okText="确定"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          autoComplete="off"
        >
          <Form.Item
            label="配置名称"
            name="name"
          >
            <Input disabled />
          </Form.Item>

          <Form.Item label="描述" name="description">
            <Input disabled />
          </Form.Item>

          <Form.Item label="配置值" name="value">
            <TextArea
              rows={4}
              placeholder="请输入配置值"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

