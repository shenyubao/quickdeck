"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  Form,
  Input,
  Button,
  Space,
  Typography,
  message,
  Spin,
} from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { jobApi, projectApi, type Project } from "@/lib/api";

const { Title } = Typography;

export default function NewJobPage() {
  const router = useRouter();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // 获取当前项目
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
        setLoading(true);
        const data = await projectApi.getAll();
        setProjects(data);
      } catch (error) {
        console.error("加载项目列表失败:", error);
      } finally {
        setLoading(false);
      }
    };
    loadProjects();
  }, []);

  // 如果没有项目，提示用户先创建项目
  if (!loading && projects.length === 0) {
    return (
      <Card>
        <div style={{ textAlign: "center", padding: "50px 0" }}>
          <Title level={4}>请先创建项目</Title>
          <p>在创建任务之前，您需要先创建一个项目。</p>
          <Button
            type="primary"
            onClick={() => router.push("/dashboard/projects")}
          >
            前往项目管理
          </Button>
        </div>
      </Card>
    );
  }

  // 如果没有当前项目，提示选择项目
  if (!loading && !currentProject && projects.length > 0) {
    return (
      <Card>
        <div style={{ textAlign: "center", padding: "50px 0" }}>
          <Title level={4}>请先选择项目</Title>
          <p>请在顶部导航栏选择一个项目，然后再创建任务。</p>
          <Button onClick={() => router.push("/dashboard")}>
            返回任务清单
          </Button>
        </div>
      </Card>
    );
  }

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (!currentProject) {
        message.error("请先选择项目");
        return;
      }

      setSubmitting(true);
      await jobApi.create({
        ...values,
        project_id: currentProject.id,
      });
      message.success("任务创建成功");
      router.push("/dashboard");
    } catch (error) {
      if (error instanceof Error && error.message.includes("验证")) {
        return;
      }
      message.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Card>
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          {/* 头部 */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Space>
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => router.push("/dashboard")}
              >
                返回
              </Button>
              <Title level={3} style={{ margin: 0 }}>
                新建任务
              </Title>
            </Space>
          </div>

          {/* 表单 */}
          <Spin spinning={loading}>
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              style={{ maxWidth: 600 }}
            >
              <Form.Item
                name="name"
                label="任务名称"
                rules={[
                  { required: true, message: "请输入任务名称" },
                  { max: 100, message: "任务名称不能超过100个字符" },
                ]}
              >
                <Input placeholder="请输入任务名称" />
              </Form.Item>

              <Form.Item
                name="path"
                label="任务路径"
                rules={[
                  { required: true, message: "请输入任务路径" },
                  {
                    pattern: /^[^\/].*[^\/]$|^[^\/]$/,
                    message: "路径格式不正确，不能以 / 开头或结尾",
                  },
                ]}
                extra="例如: 数据接入/炼丹炉 (使用 / 分隔层级)"
              >
                <Input placeholder="例如: 数据接入/炼丹炉" />
              </Form.Item>

              <Form.Item
                name="description"
                label="任务描述"
                rules={[{ max: 500, message: "描述不能超过500个字符" }]}
                extra="可选，用于描述任务的用途或负责人信息"
              >
                <Input.TextArea
                  placeholder="请输入任务描述（可选）"
                  rows={4}
                  showCount
                  maxLength={500}
                />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={submitting}
                  >
                    创建任务
                  </Button>
                  <Button onClick={() => router.push("/dashboard")}>
                    取消
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Spin>
        </Space>
      </Card>
    </div>
  );
}

