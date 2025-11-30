"use client";

import { useState, useEffect } from "react";
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
  Tabs,
  Select,
  Switch,
  InputNumber,
  Divider,
  Row,
  Col,
  Modal,
} from "antd";
import {
  ArrowLeftOutlined,
  PlusOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import { jobApi, type Project } from "@/lib/api";
import PythonCodeEditor from "./PythonCodeEditor";

const { Title } = Typography;
const { TabPane } = Tabs;

interface JobFormProps {
  jobId?: number | null;
  currentProject: Project | null;
  onCancel?: () => void;
}

export default function JobForm({ jobId, currentProject, onCancel }: JobFormProps) {
  const router = useRouter();
  const isEditMode = !!jobId;
  
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [loadingJob, setLoadingJob] = useState(false);
  const [testModalVisible, setTestModalVisible] = useState(false);
  const [testingScript, setTestingScript] = useState(false);
  const [testResult, setTestResult] = useState<{ output?: string; error?: string } | null>(null);
  const [currentTestStepIndex, setCurrentTestStepIndex] = useState<number | null>(null);
  const [testArgsForm] = Form.useForm();

  // 如果是编辑模式，加载任务详情
  useEffect(() => {
    const loadJobDetail = async () => {
      if (!isEditMode || !jobId) return;
      
      try {
        setLoadingJob(true);
        const jobDetail = await jobApi.getDetailById(jobId);
        
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
        await jobApi.update(jobId, {
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

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.push("/dashboard");
    }
  };

  // 处理试运行
  const handleTestScript = async (stepIndex: number) => {
    try {
      const steps = form.getFieldValue("steps") || [];
      const step = steps[stepIndex];
      
      if (!step) {
        message.error("步骤不存在");
        return;
      }

      if (step.step_type !== "python_script") {
        message.error("只能测试 Python 脚本");
        return;
      }

      // 获取脚本内容
      let script = "";
      if (step.extension) {
        if (typeof step.extension === "string") {
          try {
            const ext = JSON.parse(step.extension);
            script = ext.script || "";
          } catch {
            script = step.extension;
          }
        } else if (typeof step.extension === "object") {
          script = step.extension.script || "";
        }
      }

      if (!script.trim()) {
        message.error("脚本内容不能为空");
        return;
      }

      setCurrentTestStepIndex(stepIndex);
      setTestResult(null);
      testArgsForm.resetFields();
      setTestModalVisible(true);
    } catch (error) {
      message.error("获取脚本失败");
    }
  };

  // 执行试运行
  const handleRunTest = async () => {
    try {
      const steps = form.getFieldValue("steps") || [];
      const stepIndex = currentTestStepIndex;
      
      if (stepIndex === null) {
        return;
      }

      const step = steps[stepIndex];
      if (!step) {
        return;
      }

      // 获取脚本内容
      let script = "";
      if (step.extension) {
        if (typeof step.extension === "string") {
          try {
            const ext = JSON.parse(step.extension);
            script = ext.script || "";
          } catch {
            script = step.extension;
          }
        } else if (typeof step.extension === "object") {
          script = step.extension.script || "";
        }
      }

      // 获取测试参数
      const testArgs = testArgsForm.getFieldsValue();
      // 移除空值
      const args: Record<string, any> = {};
      Object.keys(testArgs).forEach((key) => {
        if (testArgs[key] !== undefined && testArgs[key] !== null && testArgs[key] !== "") {
          args[key] = testArgs[key];
        }
      });

      setTestingScript(true);
      setTestResult(null);

      const result = await jobApi.testScript(script, Object.keys(args).length > 0 ? args : undefined);
      
      setTestResult(result);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "测试失败");
      setTestResult({ error: error instanceof Error ? error.message : "测试失败" });
    } finally {
      setTestingScript(false);
    }
  };

  return (
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
              onClick={handleCancel}
            >
              返回
            </Button>
            <Title level={3} style={{ margin: 0 }}>
              {isEditMode ? "编辑任务" : "新建任务"}
            </Title>
          </Space>
        </div>

        {/* 表单 */}
        <Spin spinning={loadingJob}>
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
                </div>
              </TabPane>

              {/* Tab 3: 步骤 */}
              <TabPane tab="步骤" key="steps">
                <div style={{ maxWidth: 800, padding: "20px 0" }}>
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
                                  <Select
                                    placeholder="请选择步骤类型"
                                    onChange={(value) => {
                                      // 当选择 Python 脚本时，初始化 extension
                                      if (value === "python_script") {
                                        const currentExtension = form.getFieldValue(["steps", name, "extension"]);
                                        // 如果 extension 为空或者是其他格式，初始化为包含空 script 的 JSON
                                        if (!currentExtension || (typeof currentExtension === "string" && !currentExtension.includes("script"))) {
                                          form.setFieldValue(
                                            ["steps", name, "extension"],
                                            JSON.stringify({ script: "" }, null, 2)
                                          );
                                        }
                                      }
                                    }}
                                  >
                                    <Select.Option value="command">命令</Select.Option>
                                    <Select.Option value="shell_script">Shell脚本</Select.Option>
                                    <Select.Option value="python_script">Python脚本</Select.Option>
                                  </Select>
                                </Form.Item>
                              </Col>
                              <Col span={24}>
                                <Form.Item
                                  noStyle
                                  shouldUpdate={(prevValues, currentValues) => {
                                    const prevStepType = prevValues.steps?.[name]?.step_type;
                                    const currentStepType = currentValues.steps?.[name]?.step_type;
                                    return prevStepType !== currentStepType;
                                  }}
                                >
                                  {({ getFieldValue }) => {
                                    const stepType = getFieldValue(["steps", name, "step_type"]);
                                    const isPythonScript = stepType === "python_script";
                                    
                                    if (isPythonScript) {
                                      // Python 脚本：显示代码编辑器
                                      return (
                                        <Form.Item
                                          {...restField}
                                          name={[name, "extension"]}
                                          label="Python 代码"
                                          labelCol={{ span: 3 }}
                                          wrapperCol={{ span: 21 }}
                                          rules={[
                                            { required: true, message: "请输入 Python 代码" },
                                            {
                                              validator: (_, value) => {
                                                if (!value) {
                                                  return Promise.resolve();
                                                }
                                                // 如果是字符串，尝试解析为 JSON
                                                if (typeof value === "string") {
                                                  try {
                                                    const parsed = JSON.parse(value);
                                                    if (!parsed.script || typeof parsed.script !== "string") {
                                                      return Promise.reject(new Error("扩展配置必须包含 script 字段"));
                                                    }
                                                  } catch {
                                                    // 如果不是 JSON，可能是直接的脚本内容，需要转换为对象
                                                    return Promise.resolve();
                                                  }
                                                } else if (typeof value === "object") {
                                                  if (!value.script || typeof value.script !== "string") {
                                                    return Promise.reject(new Error("扩展配置必须包含 script 字段"));
                                                  }
                                                }
                                                return Promise.resolve();
                                              },
                                            },
                                          ]}
                                          style={{ marginBottom: "8px" }}
                                        >
                                          <div>
                                            <div style={{ marginBottom: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                              <span style={{ fontSize: "12px", color: "#666" }}>
                                                输入 Python 代码，代码将自动保存为 JSON 格式
                                              </span>
                                              <Button
                                                type="primary"
                                                size="small"
                                                icon={<PlayCircleOutlined />}
                                                onClick={() => handleTestScript(name)}
                                              >
                                                试运行
                                              </Button>
                                            </div>
                                            {/* 参数引用提示和示例 */}
                                            <div
                                              style={{
                                                marginBottom: "12px",
                                                padding: "12px",
                                                backgroundColor: "#f0f7ff",
                                                border: "1px solid #91caff",
                                                borderRadius: "4px",
                                                fontSize: "12px",
                                              }}
                                            >
                                              <div style={{ marginBottom: "8px", fontWeight: "bold", color: "#1890ff" }}>
                                                💡 参数引用说明：
                                              </div>
                                              <div style={{ marginBottom: "8px", color: "#666" }}>
                                                在代码中通过 <code style={{ backgroundColor: "#fff", padding: "2px 4px", borderRadius: "2px" }}>args</code> 字典访问输入参数。
                                                例如：如果参数名为 <code style={{ backgroundColor: "#fff", padding: "2px 4px", borderRadius: "2px" }}>name</code>，则使用 <code style={{ backgroundColor: "#fff", padding: "2px 4px", borderRadius: "2px" }}>args.get("name")</code> 或 <code style={{ backgroundColor: "#fff", padding: "2px 4px", borderRadius: "2px" }}>args["name"]</code>
                                              </div>
                                              <details style={{ cursor: "pointer" }}>
                                                <summary style={{ color: "#1890ff", marginBottom: "4px" }}>查看示例代码</summary>
                                                <pre
                                                  style={{
                                                    marginTop: "8px",
                                                    padding: "8px",
                                                    backgroundColor: "#fff",
                                                    borderRadius: "4px",
                                                    fontSize: "11px",
                                                    overflow: "auto",
                                                    whiteSpace: "pre-wrap",
                                                    wordBreak: "break-word",
                                                  }}
                                                >
{`# 示例：获取参数并处理
name = args.get("name", "默认值")
age = args.get("age", 0)

# 处理逻辑
print(f"姓名: {name}, 年龄: {age}")

# 返回结果（可选）
result = {"status": "success", "message": f"处理完成: {name}"}`}
                                                </pre>
                                              </details>
                                            </div>
                                            <Form.Item
                                              noStyle
                                              shouldUpdate={(prevValues, currentValues) => {
                                                const prevExt = prevValues.steps?.[name]?.extension;
                                                const currentExt = currentValues.steps?.[name]?.extension;
                                                return JSON.stringify(prevExt) !== JSON.stringify(currentExt);
                                              }}
                                            >
                                              {({ getFieldValue }) => {
                                                const extension = getFieldValue(["steps", name, "extension"]);
                                                let scriptContent = "";
                                                
                                                if (extension) {
                                                  if (typeof extension === "string") {
                                                    try {
                                                      const parsed = JSON.parse(extension);
                                                      scriptContent = parsed.script || "";
                                                    } catch {
                                                      scriptContent = extension;
                                                    }
                                                  } else if (typeof extension === "object") {
                                                    scriptContent = extension.script || "";
                                                  }
                                                }
                                                
                                                return (
                                                  <PythonCodeEditor
                                                    value={scriptContent}
                                                    onChange={(code) => {
                                                      // 更新表单值，保存为 JSON 格式
                                                      form.setFieldValue(
                                                        ["steps", name, "extension"],
                                                        JSON.stringify({ script: code }, null, 2)
                                                      );
                                                    }}
                                                  />
                                                );
                                              }}
                                            </Form.Item>
                                          </div>
                                        </Form.Item>
                                      );
                                    } else {
                                      // 其他类型：显示扩展配置
                                      return (
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
                                      );
                                    }
                                  }}
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

              {/* Tab 4: 节点 */}
              <TabPane tab="运行节点" key="node">
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

              {/* Tab 5: 定时任务 */}
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

              {/* Tab 6: 通知 */}
              <TabPane tab="消息通知" key="notifications">
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

              {/* Tab 7: 其他 */}
              <TabPane tab="其他配置" key="others">
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
                <Button onClick={handleCancel} size="large">
                  取消
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Spin>
      </Space>

      {/* 试运行弹框 */}
      <Modal
        title="试运行 Python 脚本"
        open={testModalVisible}
        onCancel={() => {
          setTestModalVisible(false);
          setTestResult(null);
          testArgsForm.resetFields();
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setTestModalVisible(false);
              setTestResult(null);
              testArgsForm.resetFields();
            }}
          >
            关闭
          </Button>,
          <Button
            key="run"
            type="primary"
            loading={testingScript}
            onClick={handleRunTest}
          >
            运行
          </Button>,
        ]}
        width={800}
      >
        <Form form={testArgsForm} layout="vertical">
          <Form.Item
            label="测试参数（可选）"
            extra="输入 JSON 格式的参数，例如: {&quot;name&quot;: &quot;张三&quot;, &quot;age&quot;: 25}"
          >
            <Input.TextArea
              placeholder='{"name": "张三", "age": 25}'
              rows={4}
              onChange={(e) => {
                const value = e.target.value.trim();
                if (value) {
                  try {
                    const parsed = JSON.parse(value);
                    // 将解析后的对象设置为表单字段
                    Object.keys(parsed).forEach((key) => {
                      testArgsForm.setFieldValue(key, parsed[key]);
                    });
                  } catch {
                    // 如果不是有效的 JSON，忽略
                  }
                }
              }}
            />
          </Form.Item>
        </Form>

        {testResult && (
          <div style={{ marginTop: "16px" }}>
            <Typography.Title level={5}>运行结果</Typography.Title>
            {testResult.error ? (
              <div
                style={{
                  padding: "12px",
                  backgroundColor: "#fff2f0",
                  border: "1px solid #ffccc7",
                  borderRadius: "4px",
                  color: "#cf1322",
                }}
              >
                <Typography.Text strong>错误：</Typography.Text>
                <pre style={{ marginTop: "8px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {testResult.error}
                </pre>
              </div>
            ) : (
              <div
                style={{
                  padding: "12px",
                  backgroundColor: "#f6ffed",
                  border: "1px solid #b7eb8f",
                  borderRadius: "4px",
                }}
              >
                <Typography.Text strong>输出：</Typography.Text>
                <pre style={{ marginTop: "8px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {testResult.output || "(无输出)"}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
}

