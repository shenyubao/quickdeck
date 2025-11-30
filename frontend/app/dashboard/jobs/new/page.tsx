"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  Form,
  Input,
  Button,
  Space,
  Typography,
  message,
  Spin,
  Tabs,
  Select,
  Switch,
  InputNumber,
  Divider,
  Row,
  Col,
} from "antd";
import {
  ArrowLeftOutlined,
  PlusOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { jobApi, projectApi, type Project, type OptionCreate, type StepCreate, type NotificationCreate } from "@/lib/api";

const { Title } = Typography;
const { TabPane } = Tabs;

export default function NewJobPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("id");
  const isEditMode = !!jobId;
  
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingJob, setLoadingJob] = useState(false);

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

  // 如果是编辑模式，加载任务详情
  useEffect(() => {
    const loadJobDetail = async () => {
      if (!isEditMode || !jobId) return;
      
      try {
        setLoadingJob(true);
        const jobDetail = await jobApi.getDetailById(parseInt(jobId));
        
        // 填充表单数据
        const formValues: any = {
          name: jobDetail.name,
          path: jobDetail.path,
          description: jobDetail.description || "",
        };
        
        if (jobDetail.workflow) {
          const wf = jobDetail.workflow;
          formValues.timeout = wf.timeout;
          formValues.retry = wf.retry;
          formValues.node_type = wf.node_type;
          formValues.schedule_enabled = wf.schedule_enabled;
          formValues.schedule_crontab = wf.schedule_crontab;
          formValues.schedule_timezone = wf.schedule_timezone;
          
          // 转换选项
          formValues.options = wf.options.map((opt) => ({
            option_type: opt.option_type,
            name: opt.name,
            label: opt.label,
            description: opt.description,
            default_value: opt.default_value,
            input_type: opt.input_type,
            required: opt.required,
            multi_valued: opt.multi_valued,
          }));
          
          // 转换步骤（extension 需要转换为 JSON 字符串）
          formValues.steps = wf.steps.map((step) => ({
            order: step.order,
            step_type: step.step_type,
            extension: typeof step.extension === "object" 
              ? JSON.stringify(step.extension, null, 2)
              : step.extension,
          }));
          
          // 转换通知（extensions 需要转换为 JSON 字符串）
          formValues.notifications = (wf.notifications || []).map((notif) => ({
            trigger: notif.trigger,
            notification_type: notif.notification_type,
            extensions: typeof notif.extensions === "object"
              ? JSON.stringify(notif.extensions, null, 2)
              : notif.extensions,
          }));
        } else {
          // 如果没有工作流，设置默认值
          formValues.retry = 0;
          formValues.node_type = "local";
          formValues.schedule_enabled = false;
          formValues.schedule_timezone = "UTC";
          formValues.options = [];
          formValues.steps = [];
          formValues.notifications = [];
        }
        
        form.setFieldsValue(formValues);
      } catch (error) {
        console.error("加载任务详情失败:", error);
        message.error("加载任务详情失败");
        router.push("/dashboard");
      } finally {
        setLoadingJob(false);
      }
    };
    
    loadJobDetail();
  }, [isEditMode, jobId, form, router]);

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

      // 处理步骤的扩展配置（解析 JSON 字符串）
      const processedSteps = (values.steps || []).map((step: any) => {
        let extension = step.extension;
        if (typeof extension === "string") {
          try {
            extension = JSON.parse(extension);
          } catch (e) {
            message.error(`步骤 ${step.order} 的扩展配置 JSON 格式错误`);
            throw new Error("扩展配置格式错误");
          }
        }
        return {
          ...step,
          extension,
        };
      });

      // 处理通知的扩展配置（解析 JSON 字符串）
      const processedNotifications = (values.notifications || []).map((notification: any) => {
        let extensions = notification.extensions;
        if (typeof extensions === "string") {
          try {
            extensions = JSON.parse(extensions);
          } catch (e) {
            message.error(`通知规则 ${notification.trigger} 的扩展配置 JSON 格式错误`);
            throw new Error("扩展配置格式错误");
          }
        }
        return {
          ...notification,
          extensions,
        };
      });

      // 构建工作流数据
      const workflowData: any = {
        name: values.name || "默认工作流",
        timeout: values.timeout,
        retry: values.retry ?? 0,
        node_type: values.node_type || "local",
        schedule_enabled: values.schedule_enabled || false,
        schedule_crontab: values.schedule_crontab,
        schedule_timezone: values.schedule_timezone || "UTC",
        options: values.options || [],
        steps: processedSteps,
        notifications: processedNotifications,
      };

      if (isEditMode && jobId) {
        // 更新任务
        await jobApi.update(parseInt(jobId), {
          name: values.name,
          path: values.path,
          description: values.description,
          workflow: workflowData,
        });
        message.success("任务更新成功");
      } else {
        // 创建任务
        await jobApi.create({
          name: values.name,
          path: values.path,
          description: values.description,
          project_id: currentProject.id,
          workflow: workflowData,
        });
        message.success("任务创建成功");
      }
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
                {isEditMode ? "编辑任务" : "新建任务"}
              </Title>
            </Space>
          </div>

          {/* 表单 */}
          <Spin spinning={loading || loadingJob}>
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              initialValues={{
                retry: 0,
                node_type: "local",
                schedule_enabled: false,
                schedule_timezone: "UTC",
                options: [],
                steps: [],
                notifications: [],
              }}
            >
              <Tabs defaultActiveKey="basic" type="card">
                {/* Tab 1: 基础信息 */}
                <TabPane tab="基础信息" key="basic">
                  <div style={{ maxWidth: 800, padding: "20px 0" }}>
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
                  </div>
                </TabPane>

                {/* Tab 2: 输入参数 */}
                <TabPane tab="输入参数" key="inputs">
                  <div style={{ maxWidth: 800, padding: "20px 0" }}>
                    <Title level={5}>参数列表</Title>
                    <Form.List name="options">
                      {(fields, { add, remove }) => (
                        <>
                          {fields.map(({ key, name, ...restField }) => (
                            <div
                              key={key}
                              style={{
                                border: "1px solid #d9d9d9",
                                borderRadius: "4px",
                                padding: "12px",
                                marginBottom: "12px",
                                backgroundColor: "#fafafa",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  marginBottom: "12px",
                                }}
                              >
                                <Typography.Text strong>
                                  参数 {name + 1}
                                </Typography.Text>
                                <Button
                                  type="text"
                                  danger
                                  size="small"
                                  icon={<DeleteOutlined />}
                                  onClick={() => remove(name)}
                                >
                                  移除
                                </Button>
                              </div>
                              <Row gutter={[16, 8]}>
                                <Col span={12}>
                                  <Form.Item
                                    {...restField}
                                    name={[name, "option_type"]}
                                    label="参数类型"
                                    labelCol={{ span: 6 }}
                                    wrapperCol={{ span: 18 }}
                                    rules={[
                                      { required: true, message: "请选择参数类型" },
                                    ]}
                                    style={{ marginBottom: "8px" }}
                                  >
                                    <Select placeholder="请选择参数类型">
                                      <Select.Option value="text">文本</Select.Option>
                                      <Select.Option value="file">文件</Select.Option>
                                    </Select>
                                  </Form.Item>
                                </Col>
                                <Col span={12}>
                                  <Form.Item
                                    {...restField}
                                    name={[name, "name"]}
                                    label="参数名称"
                                    labelCol={{ span: 6 }}
                                    wrapperCol={{ span: 18 }}
                                    rules={[
                                      { required: true, message: "请输入参数名称" },
                                    ]}
                                    style={{ marginBottom: "8px" }}
                                  >
                                    <Input placeholder="请输入参数名称" />
                                  </Form.Item>
                                </Col>
                                <Col span={12}>
                                  <Form.Item
                                    {...restField}
                                    name={[name, "label"]}
                                    label="参数标签"
                                    labelCol={{ span: 6 }}
                                    wrapperCol={{ span: 18 }}
                                    style={{ marginBottom: "8px" }}
                                  >
                                    <Input placeholder="请输入参数标签（可选）" />
                                  </Form.Item>
                                </Col>
                                <Col span={12}>
                                  <Form.Item
                                    {...restField}
                                    name={[name, "input_type"]}
                                    label="输入类型"
                                    labelCol={{ span: 6 }}
                                    wrapperCol={{ span: 18 }}
                                    initialValue="plain_text"
                                    style={{ marginBottom: "8px" }}
                                  >
                                    <Select>
                                      <Select.Option value="plain_text">纯文本</Select.Option>
                                      <Select.Option value="date">日期</Select.Option>
                                      <Select.Option value="number">数字</Select.Option>
                                    </Select>
                                  </Form.Item>
                                </Col>
                                <Col span={12}>
                                  <Form.Item
                                    {...restField}
                                    name={[name, "default_value"]}
                                    label="默认值"
                                    labelCol={{ span: 6 }}
                                    wrapperCol={{ span: 18 }}
                                    style={{ marginBottom: "8px" }}
                                  >
                                    <Input placeholder="请输入默认值（可选）" />
                                  </Form.Item>
                                </Col>
                                <Col span={12}>
                                  <Form.Item
                                    {...restField}
                                    name={[name, "required"]}
                                    label="必填"
                                    labelCol={{ span: 6 }}
                                    wrapperCol={{ span: 18 }}
                                    valuePropName="checked"
                                    initialValue={false}
                                    style={{ marginBottom: "8px" }}
                                  >
                                    <Switch checkedChildren="是" unCheckedChildren="否" />
                                  </Form.Item>
                                </Col>
                                <Col span={24}>
                                  <Form.Item
                                    {...restField}
                                    name={[name, "description"]}
                                    label="参数描述"
                                    labelCol={{ span: 3 }}
                                    wrapperCol={{ span: 21 }}
                                    style={{ marginBottom: "8px" }}
                                  >
                                    <Input.TextArea
                                      placeholder="请输入参数描述（可选）"
                                      rows={2}
                                    />
                                  </Form.Item>
                                </Col>
                                <Col span={12}>
                                  <Form.Item
                                    {...restField}
                                    name={[name, "multi_valued"]}
                                    label="多值"
                                    labelCol={{ span: 6 }}
                                    wrapperCol={{ span: 18 }}
                                    valuePropName="checked"
                                    initialValue={false}
                                    style={{ marginBottom: "8px" }}
                                  >
                                    <Switch checkedChildren="是" unCheckedChildren="否" />
                                  </Form.Item>
                                </Col>
                              </Row>
                            </div>
                          ))}
                          <Button
                            type="dashed"
                            onClick={() => add()}
                            block
                            icon={<PlusOutlined />}
                          >
                            新增参数
                          </Button>
                        </>
                      )}
                    </Form.List>

                    <Divider />

                    <Title level={5}>步骤列表</Title>
                    <Form.List name="steps">
                      {(fields, { add, remove }) => (
                        <>
                          {fields.map(({ key, name, ...restField }) => (
                            <div
                              key={key}
                              style={{
                                border: "1px solid #d9d9d9",
                                borderRadius: "4px",
                                padding: "12px",
                                marginBottom: "12px",
                                backgroundColor: "#fafafa",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  marginBottom: "12px",
                                }}
                              >
                                <Typography.Text strong>
                                  步骤 {name + 1}
                                </Typography.Text>
                                <Button
                                  type="text"
                                  danger
                                  size="small"
                                  icon={<DeleteOutlined />}
                                  onClick={() => remove(name)}
                                >
                                  移除
                                </Button>
                              </div>
                              <Row gutter={[16, 8]}>
                                <Col span={8}>
                                  <Form.Item
                                    {...restField}
                                    name={[name, "order"]}
                                    label="步骤顺序"
                                    labelCol={{ span: 8 }}
                                    wrapperCol={{ span: 16 }}
                                    rules={[
                                      { required: true, message: "请输入步骤顺序" },
                                    ]}
                                    initialValue={name + 1}
                                    style={{ marginBottom: "8px" }}
                                  >
                                    <InputNumber
                                      min={1}
                                      placeholder="步骤顺序"
                                      style={{ width: "100%" }}
                                    />
                                  </Form.Item>
                                </Col>
                                <Col span={16}>
                                  <Form.Item
                                    {...restField}
                                    name={[name, "step_type"]}
                                    label="步骤类型"
                                    labelCol={{ span: 6 }}
                                    wrapperCol={{ span: 18 }}
                                    rules={[
                                      { required: true, message: "请选择步骤类型" },
                                    ]}
                                    style={{ marginBottom: "8px" }}
                                  >
                                    <Select placeholder="请选择步骤类型">
                                      <Select.Option value="command">命令</Select.Option>
                                      <Select.Option value="shell_script">Shell脚本</Select.Option>
                                      <Select.Option value="python_script">Python脚本</Select.Option>
                                    </Select>
                                  </Form.Item>
                                </Col>
                                <Col span={24}>
                                  <Form.Item
                                    {...restField}
                                    name={[name, "extension"]}
                                    label="扩展配置"
                                    labelCol={{ span: 3 }}
                                    wrapperCol={{ span: 21 }}
                                    rules={[
                                      { required: true, message: "请输入扩展配置" },
                                      {
                                        validator: (_, value) => {
                                          if (!value) {
                                            return Promise.resolve();
                                          }
                                          try {
                                            JSON.parse(value);
                                            return Promise.resolve();
                                          } catch (e) {
                                            return Promise.reject(new Error("请输入有效的 JSON 格式"));
                                          }
                                        },
                                      },
                                    ]}
                                    tooltip="请输入 JSON 格式的扩展配置"
                                    style={{ marginBottom: "8px" }}
                                  >
                                    <Input.TextArea
                                      placeholder='例如: {"command": "echo hello"}'
                                      rows={3}
                                    />
                                  </Form.Item>
                                </Col>
                              </Row>
                            </div>
                          ))}
                          <Button
                            type="dashed"
                            onClick={() => {
                              const currentSteps = form.getFieldValue("steps") || [];
                              add({
                                order: currentSteps.length + 1,
                                step_type: "command",
                                extension: "{}",
                              });
                            }}
                            block
                            icon={<PlusOutlined />}
                          >
                            新增步骤
                          </Button>
                        </>
                      )}
                    </Form.List>
                  </div>
                </TabPane>

                {/* Tab 3: 节点 */}
                <TabPane tab="节点" key="node">
                  <div style={{ maxWidth: 800, padding: "20px 0" }}>
                    <Form.Item
                      name="node_type"
                      label="节点类型"
                      rules={[
                        { required: true, message: "请选择节点类型" },
                      ]}
                    >
                      <Select placeholder="请选择节点类型">
                        <Select.Option value="local">本地节点</Select.Option>
                        <Select.Option value="remote">远程节点</Select.Option>
                      </Select>
                    </Form.Item>
                  </div>
                </TabPane>

                {/* Tab 4: 定时任务 */}
                <TabPane tab="定时任务" key="schedule">
                  <div style={{ maxWidth: 800, padding: "20px 0" }}>
                    <Form.Item
                      name="schedule_enabled"
                      label="是否定时任务"
                      valuePropName="checked"
                    >
                      <Switch checkedChildren="启用" unCheckedChildren="禁用" />
                    </Form.Item>
                    <Form.Item
                      noStyle
                      shouldUpdate={(prevValues, currentValues) =>
                        prevValues.schedule_enabled !== currentValues.schedule_enabled
                      }
                    >
                      {({ getFieldValue }) =>
                        getFieldValue("schedule_enabled") ? (
                          <>
                            <Form.Item
                              name="schedule_crontab"
                              label="定时任务规则 (Crontab)"
                              rules={[
                                { required: true, message: "请输入 Crontab 表达式" },
                              ]}
                              extra="例如: 0 0 * * * (每天午夜执行)"
                            >
                              <Input placeholder="0 0 * * *" />
                            </Form.Item>
                            <Form.Item
                              name="schedule_timezone"
                              label="时区"
                              initialValue="UTC"
                            >
                              <Select>
                                <Select.Option value="UTC">UTC</Select.Option>
                                <Select.Option value="Asia/Shanghai">Asia/Shanghai</Select.Option>
                                <Select.Option value="America/New_York">America/New_York</Select.Option>
                              </Select>
                            </Form.Item>
                          </>
                        ) : null
                      }
                    </Form.Item>
                  </div>
                </TabPane>

                {/* Tab 5: 通知 */}
                <TabPane tab="通知" key="notifications">
                  <div style={{ maxWidth: 800, padding: "20px 0" }}>
                    <Form.List name="notifications">
                      {(fields, { add, remove }) => (
                        <>
                          {fields.map(({ key, name, ...restField }) => (
                            <div
                              key={key}
                              style={{
                                border: "1px solid #d9d9d9",
                                borderRadius: "4px",
                                padding: "12px",
                                marginBottom: "12px",
                                backgroundColor: "#fafafa",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  marginBottom: "12px",
                                }}
                              >
                                <Typography.Text strong>
                                  通知规则 {name + 1}
                                </Typography.Text>
                                <Button
                                  type="text"
                                  danger
                                  size="small"
                                  icon={<DeleteOutlined />}
                                  onClick={() => remove(name)}
                                >
                                  移除
                                </Button>
                              </div>
                              <Row gutter={[16, 8]}>
                                <Col span={12}>
                                  <Form.Item
                                    {...restField}
                                    name={[name, "trigger"]}
                                    label="触发条件"
                                    labelCol={{ span: 6 }}
                                    wrapperCol={{ span: 18 }}
                                    rules={[
                                      { required: true, message: "请选择触发条件" },
                                    ]}
                                    style={{ marginBottom: "8px" }}
                                  >
                                    <Select placeholder="请选择触发条件">
                                      <Select.Option value="on_start">任务开始</Select.Option>
                                      <Select.Option value="on_success">任务成功</Select.Option>
                                      <Select.Option value="on_failure">任务失败</Select.Option>
                                      <Select.Option value="on_retryable_fail">可重试失败</Select.Option>
                                      <Select.Option value="average_duration_exceeded">平均时长超限</Select.Option>
                                    </Select>
                                  </Form.Item>
                                </Col>
                                <Col span={12}>
                                  <Form.Item
                                    {...restField}
                                    name={[name, "notification_type"]}
                                    label="通知类型"
                                    labelCol={{ span: 6 }}
                                    wrapperCol={{ span: 18 }}
                                    rules={[
                                      { required: true, message: "请选择通知类型" },
                                    ]}
                                    style={{ marginBottom: "8px" }}
                                  >
                                    <Select placeholder="请选择通知类型">
                                      <Select.Option value="webhook">Webhook</Select.Option>
                                      <Select.Option value="dingtalk_webhook">钉钉 Webhook</Select.Option>
                                    </Select>
                                  </Form.Item>
                                </Col>
                                <Col span={24}>
                                  <Form.Item
                                    {...restField}
                                    name={[name, "extensions"]}
                                    label="扩展配置"
                                    labelCol={{ span: 3 }}
                                    wrapperCol={{ span: 21 }}
                                    rules={[
                                      { required: true, message: "请输入扩展配置" },
                                      {
                                        validator: (_, value) => {
                                          if (!value) {
                                            return Promise.resolve();
                                          }
                                          try {
                                            JSON.parse(value);
                                            return Promise.resolve();
                                          } catch (e) {
                                            return Promise.reject(new Error("请输入有效的 JSON 格式"));
                                          }
                                        },
                                      },
                                    ]}
                                    tooltip="请输入 JSON 格式的扩展配置"
                                    style={{ marginBottom: "8px" }}
                                  >
                                    <Input.TextArea
                                      placeholder='例如: {"url": "https://example.com/webhook"}'
                                      rows={3}
                                    />
                                  </Form.Item>
                                </Col>
                              </Row>
                            </div>
                          ))}
                          <Button
                            type="dashed"
                            onClick={() => add()}
                            block
                            icon={<PlusOutlined />}
                          >
                            新增通知规则
                          </Button>
                        </>
                      )}
                    </Form.List>
                  </div>
                </TabPane>

                {/* Tab 6: 其他 */}
                <TabPane tab="其他" key="others">
                  <div style={{ maxWidth: 800, padding: "20px 0" }}>
                    <Form.Item
                      name="timeout"
                      label="超时时间（分钟）"
                      extra="任务执行超时时间，超过此时间将自动终止"
                    >
                      <InputNumber
                        min={1}
                        placeholder="请输入超时时间（分钟）"
                        style={{ width: "100%" }}
                      />
                    </Form.Item>
                    <Form.Item
                      name="retry"
                      label="重试次数"
                      initialValue={0}
                      extra="任务失败后自动重试的次数"
                    >
                      <InputNumber
                        min={0}
                        placeholder="请输入重试次数"
                        style={{ width: "100%" }}
                      />
                    </Form.Item>
                  </div>
                </TabPane>
              </Tabs>

              <Divider />

              <Form.Item>
                <Space>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={submitting}
                    size="large"
                  >
                    {isEditMode ? "保存修改" : "创建任务"}
                  </Button>
                  <Button onClick={() => router.push("/dashboard")} size="large">
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
