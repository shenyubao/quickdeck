"use client";

import { useState } from "react";
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
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";

interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([
    {
      id: "1",
      name: "默认项目",
      description: "系统默认项目",
      createdAt: "2024-01-01",
    },
    {
      id: "2",
      name: "项目一",
      description: "第一个项目",
      createdAt: "2024-01-02",
    },
    {
      id: "3",
      name: "项目二",
      description: "第二个项目",
      createdAt: "2024-01-03",
    },
  ]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [form] = Form.useForm();

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

  const handleDeleteProject = (projectId: string) => {
    setProjects(projects.filter((p) => p.id !== projectId));
    message.success("删除成功");
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingProject) {
        // 编辑项目
        setProjects(
          projects.map((p) =>
            p.id === editingProject.id
              ? { ...p, name: values.name, description: values.description }
              : p
          )
        );
        message.success("修改成功");
      } else {
        // 新增项目
        const newProject: Project = {
          id: Date.now().toString(),
          name: values.name,
          description: values.description,
          createdAt: new Date().toISOString().split("T")[0],
        };
        setProjects([...projects, newProject]);
        message.success("新增成功");
      }
      setIsModalOpen(false);
      form.resetFields();
    } catch (error) {
      console.error("表单验证失败:", error);
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
      dataIndex: "createdAt",
      key: "createdAt",
      width: 150,
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

