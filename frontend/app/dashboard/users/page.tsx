"use client";

import { useState, useEffect } from "react";
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
  Switch,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { userApi, type User, type UserCreate, type UserUpdate } from "@/lib/api";

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form] = Form.useForm();

  // 加载用户列表
  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await userApi.getAll();
      setUsers(data);
    } catch (error) {
      // 401 错误会触发自动跳转到登录页，不需要显示错误消息
      if (error instanceof Error && error.message.includes("认证失败")) {
        return;
      }
      message.error(error instanceof Error ? error.message : "加载用户列表失败");
    } finally {
      setLoading(false);
    }
  };

  // 用户管理相关函数
  const handleAddUser = () => {
    setEditingUser(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    form.setFieldsValue({
      username: user.username,
      email: user.email || "",
      nickname: user.nickname || "",
      is_active: user.is_active,
      is_admin: user.is_admin,
      password: "", // 密码字段留空
    });
    setIsModalOpen(true);
  };

  const handleDeleteUser = async (userId: number) => {
    try {
      await userApi.delete(userId);
      message.success("删除成功");
      await loadUsers();
    } catch (error) {
      // 401 错误会触发自动跳转到登录页，不需要显示错误消息
      if (error instanceof Error && error.message.includes("认证失败")) {
        return;
      }
      message.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingUser) {
        // 编辑用户
        const updateData: UserUpdate = {
          username: values.username,
          email: values.email || undefined,
          nickname: values.nickname || undefined,
          is_active: values.is_active,
          is_admin: values.is_admin,
        };
        // 只有提供了新密码时才更新密码
        if (values.password && values.password.trim()) {
          updateData.password = values.password;
        }
        await userApi.update(editingUser.id, updateData);
        message.success("修改成功");
      } else {
        // 新增用户
        const createData: UserCreate = {
          username: values.username,
          email: values.email || undefined,
          nickname: values.nickname || undefined,
          password: values.password,
        };
        await userApi.create(createData);
        message.success("新增成功");
      }
      setIsModalOpen(false);
      form.resetFields();
      await loadUsers();
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
    setEditingUser(null);
  };

  // 表格列定义
  const userColumns: ColumnsType<User> = [
    {
      title: "用户名",
      dataIndex: "username",
      key: "username",
      width: 150,
    },
    {
      title: "邮箱",
      dataIndex: "email",
      key: "email",
      width: 200,
      render: (text: string) => text || "-",
    },
    {
      title: "昵称",
      dataIndex: "nickname",
      key: "nickname",
      width: 150,
      render: (text: string) => text || "-",
    },
    {
      title: "状态",
      dataIndex: "is_active",
      key: "is_active",
      width: 100,
      render: (isActive: boolean) => (
        <Tag color={isActive ? "green" : "red"}>
          {isActive ? "启用" : "禁用"}
        </Tag>
      ),
    },
    {
      title: "角色",
      dataIndex: "is_admin",
      key: "is_admin",
      width: 100,
      render: (isAdmin: boolean) => (
        <Tag color={isAdmin ? "blue" : "default"}>
          {isAdmin ? "管理员" : "普通用户"}
        </Tag>
      ),
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 180,
      render: (text: string) => {
        if (!text) return "-";
        try {
          const date = new Date(text);
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const day = String(date.getDate()).padStart(2, "0");
          const hours = String(date.getHours()).padStart(2, "0");
          const minutes = String(date.getMinutes()).padStart(2, "0");
          return `${year}-${month}-${day} ${hours}:${minutes}`;
        } catch {
          return "-";
        }
      },
    },
    {
      title: "操作",
      key: "action",
      width: 150,
      fixed: "right",
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEditUser(record)}
            size="small"
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个用户吗？"
            description="删除后无法恢复"
            onConfirm={() => handleDeleteUser(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />} size="small">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <Typography.Title level={3} style={{ margin: 0 }}>
          用户管理
        </Typography.Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAddUser}
        >
          新增用户
        </Button>
      </div>
      <Spin spinning={loading}>
        <Table
          columns={userColumns}
          dataSource={users}
          rowKey="id"
          scroll={{ x: "max-content" }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
        />
      </Spin>
      <Modal
        title={editingUser ? "编辑用户" : "新增用户"}
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        okText="确定"
        cancelText="取消"
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            username: "",
            email: "",
            nickname: "",
            password: "",
            is_active: true,
            is_admin: false,
          }}
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: "请输入用户名" },
              { max: 50, message: "用户名不能超过50个字符" },
            ]}
          >
            <Input placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { type: "email", message: "请输入有效的邮箱地址" },
            ]}
          >
            <Input placeholder="请输入邮箱（可选）" />
          </Form.Item>
          <Form.Item
            name="nickname"
            label="昵称"
            rules={[{ max: 50, message: "昵称不能超过50个字符" }]}
          >
            <Input placeholder="请输入昵称（可选）" />
          </Form.Item>
          <Form.Item
            name="password"
            label={editingUser ? "新密码（留空则不修改）" : "密码"}
            rules={
              editingUser
                ? []
                : [{ required: true, message: "请输入密码" }]
            }
          >
            <Input.Password placeholder={editingUser ? "留空则不修改密码" : "请输入密码"} />
          </Form.Item>
          <Form.Item
            name="is_active"
            label="状态"
            valuePropName="checked"
          >
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
          <Form.Item
            name="is_admin"
            label="角色"
            valuePropName="checked"
          >
            <Switch checkedChildren="管理员" unCheckedChildren="普通用户" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

