"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  Select,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import { projectApi, userApi, type Project, type User } from "@/lib/api";

export default function ProjectsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = (session as any)?.isAdmin || false;
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [form] = Form.useForm();
  
  // 用户绑定相关状态
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [projectUsers, setProjectUsers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userForm] = Form.useForm();
  
  // 使用 ref 防止重复请求
  const isLoadingRef = useRef(false);

  // 权限检查：非管理员重定向到首页
  useEffect(() => {
    if (session && !isAdmin) {
      message.warning("您没有权限访问此页面");
      router.push("/dashboard");
    }
  }, [session, isAdmin, router]);

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
    } catch (error) {
      // 401 错误会触发自动跳转到登录页，不需要显示错误消息
      if (error instanceof Error && error.message.includes("认证失败")) {
        // 不显示错误消息，因为会自动跳转
        return;
      }
      message.error(error instanceof Error ? error.message : "加载项目列表失败了");
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      loadProjects();
    }
  }, [isAdmin, loadProjects]);

  // 项目管理相关函数
  const handleAddProject = () => {
    setEditingProject(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    form.setFieldsValue({
      name: project.name,
      description: project.description || "",
    });
    setIsModalOpen(true);
  };

  const handleDeleteProject = async (projectId: number) => {
    try {
      await projectApi.delete(projectId);
      message.success("删除成功");
      await loadProjects();
      // 通知 layout 刷新项目列表
      window.dispatchEvent(new CustomEvent("projectListUpdated"));
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
      if (editingProject) {
        // 编辑项目
        await projectApi.update(editingProject.id, {
          name: values.name,
          description: values.description || undefined,
        });
        message.success("修改成功");
      } else {
        // 新增项目
        await projectApi.create({
          name: values.name,
          description: values.description || undefined,
        });
        message.success("新增成功");
      }
      setIsModalOpen(false);
      form.resetFields();
      await loadProjects();
      // 通知 layout 刷新项目列表
      window.dispatchEvent(new CustomEvent("projectListUpdated"));
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
    setEditingProject(null);
  };

  // 用户绑定相关函数
  const handleBindUsers = async (project: Project) => {
    setCurrentProject(project);
    setIsUserModalOpen(true);
    setUserLoading(true);
    try {
      // 加载项目的关联用户和所有用户
      const [users, all] = await Promise.all([
        projectApi.getUsers(project.id),
        userApi.getAll(),
      ]);
      setProjectUsers(users);
      setAllUsers(all);
      
      // 设置已选中的用户（排除项目所有者）
      const selectedUserIds = users
        .filter(u => u.id !== project.owner_id)
        .map(u => u.id);
      userForm.setFieldsValue({ user_ids: selectedUserIds });
    } catch (error) {
      if (error instanceof Error && error.message.includes("认证失败")) {
        return;
      }
      message.error(error instanceof Error ? error.message : "加载用户列表失败");
    } finally {
      setUserLoading(false);
    }
  };

  const handleUserModalOk = async () => {
    if (!currentProject) return;
    
    try {
      const values = await userForm.validateFields();
      const selectedUserIds: number[] = values.user_ids || [];
      
      // 获取当前关联的用户ID（排除项目所有者）
      const currentUserIds = projectUsers
        .filter(u => u.id !== currentProject.owner_id)
        .map(u => u.id);
      
      // 找出需要添加和删除的用户
      const toAdd = selectedUserIds.filter(id => !currentUserIds.includes(id));
      const toRemove = currentUserIds.filter(id => !selectedUserIds.includes(id));
      
      // 执行添加和删除操作
      if (toAdd.length > 0) {
        await projectApi.addUsers(currentProject.id, toAdd);
      }
      
      for (const userId of toRemove) {
        await projectApi.removeUser(currentProject.id, userId);
      }
      
      message.success("用户绑定更新成功");
      setIsUserModalOpen(false);
      userForm.resetFields();
      setCurrentProject(null);
      
      // 重新加载项目用户列表（如果需要显示）
      if (toAdd.length > 0 || toRemove.length > 0) {
        const updatedUsers = await projectApi.getUsers(currentProject.id);
        setProjectUsers(updatedUsers);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("验证")) {
        return;
      }
      if (error instanceof Error && error.message.includes("认证失败")) {
        return;
      }
      message.error(error instanceof Error ? error.message : "操作失败");
    }
  };

  const handleUserModalCancel = () => {
    setIsUserModalOpen(false);
    userForm.resetFields();
    setCurrentProject(null);
    setProjectUsers([]);
  };

  // 表格列定义
  const projectColumns: ColumnsType<Project> = [
    {
      title: "项目名称",
      dataIndex: "name",
      key: "name",
      width: 200,
    },
    {
      title: "描述",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
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
          // 使用固定的格式，避免服务端和客户端时区差异
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
      width: 120,
      fixed: "right",
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            icon={<UserAddOutlined />}
            onClick={() => handleBindUsers(record)}
            size="small"
          >
            用户绑定
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEditProject(record)}
            size="small"
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个项目吗？"
            description="删除后无法恢复"
            onConfirm={() => handleDeleteProject(record.id)}
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

  // 如果非管理员，不渲染内容（等待重定向）
  if (!isAdmin) {
    return null;
  }

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
          项目管理
        </Typography.Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAddProject}
        >
          新增项目
        </Button>
      </div>
      <Spin spinning={loading}>
        <Table
          columns={projectColumns}
          dataSource={projects}
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
        title={editingProject ? "编辑项目" : "新增项目"}
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        okText="确定"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            name: "",
            description: "",
          }}
        >
          <Form.Item
            name="name"
            label="项目名称"
            rules={[
              { required: true, message: "请输入项目名称" },
              { max: 50, message: "项目名称不能超过50个字符" },
            ]}
          >
            <Input placeholder="请输入项目名称" />
          </Form.Item>
          <Form.Item
            name="description"
            label="项目描述"
            rules={[{ max: 200, message: "描述不能超过200个字符" }]}
          >
            <Input.TextArea
              placeholder="请输入项目描述"
              rows={4}
              showCount
              maxLength={200}
            />
          </Form.Item>
        </Form>
      </Modal>
      
      {/* 用户绑定Modal */}
      <Modal
        title="用户绑定"
        open={isUserModalOpen}
        onOk={handleUserModalOk}
        onCancel={handleUserModalCancel}
        okText="确定"
        cancelText="取消"
        width={600}
      >
        <Spin spinning={userLoading}>
          {currentProject && (
            <div style={{ marginBottom: 16 }}>
              <Typography.Text strong>项目：</Typography.Text>
              <Typography.Text>{currentProject.name}</Typography.Text>
            </div>
          )}
          <Form
            form={userForm}
            layout="vertical"
            initialValues={{ user_ids: [] }}
          >
            <Form.Item
              name="user_ids"
              label="选择关联用户"
              tooltip="关联的用户将拥有此项目的访问权限"
            >
              <Select
                mode="multiple"
                placeholder="请选择用户"
                showSearch
                filterOption={(input, option) =>
                  (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
                }
                options={allUsers
                  .filter(u => u.id !== currentProject?.owner_id) // 排除项目所有者
                  .map(u => ({
                    label: `${u.username}${u.nickname ? ` (${u.nickname})` : ""}`,
                    value: u.id,
                  }))}
              />
            </Form.Item>
          </Form>
          {projectUsers.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>
                当前关联用户：
              </Typography.Text>
              <Space wrap>
                {projectUsers.map((user) => (
                  <Tag key={user.id} color={user.id === currentProject?.owner_id ? "blue" : "default"}>
                    {user.username}
                    {user.id === currentProject?.owner_id && " (所有者)"}
                  </Tag>
                ))}
              </Space>
            </div>
          )}
        </Spin>
      </Modal>
    </div>
  );
}

