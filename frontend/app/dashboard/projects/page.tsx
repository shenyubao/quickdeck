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
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { projectApi, type Project } from "@/lib/api";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [form] = Form.useForm();

  // 加载项目列表
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
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
      message.error(error instanceof Error ? error.message : "加载项目列表失败");
    } finally {
      setLoading(false);
    }
  };

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
        const date = new Date(text);
        return date.toLocaleString("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
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
        forceRender
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
    </div>
  );
}

