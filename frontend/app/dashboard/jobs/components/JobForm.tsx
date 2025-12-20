"use client";

import React, { useState, useEffect, useMemo } from "react";
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
  DatePicker,
  Upload,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import { jobApi, credentialApi, uploadApi, type Project, type Credential } from "@/lib/api";
import PythonCodeEditor from "./PythonCodeEditor";
import JsonSchemaForm, { type JsonSchemaFormRef } from "./JsonSchemaForm";

const { Title } = Typography;

// 获取凭证类型显示名称
const getCredentialTypeName = (type?: string) => {
  switch (type) {
    case "mysql":
      return "MySQL凭证";
    case "oss":
      return "OSS凭证";
    case "deepseek":
      return "DeepSeek凭证";
    default:
      return "凭证";
  }
};

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
  const [currentTestOptions, setCurrentTestOptions] = useState<any[]>([]);
  const [testArgsForm] = Form.useForm();
  const [credentialsMap, setCredentialsMap] = useState<Record<string, Credential[]>>({});
  // 保存加载的原始数据，用于在提交时补充未访问 tab 的字段
  const [loadedFormData, setLoadedFormData] = useState<any>(null);
  // 存储 JSON Schema 表单的值
  const [jsonSchemaValues, setJsonSchemaValues] = useState<Record<string, any>>({});
  // 存储 JSON Schema 表单的 ref
  const jsonSchemaFormRefs = React.useRef<Record<string, JsonSchemaFormRef | null>>({});

  // 如果是编辑模式，加载工具详情
  useEffect(() => {
    const loadJobDetail = async () => {
      if (!isEditMode || !jobId) return;
      
      try {
        setLoadingJob(true);
        const jobDetailData = await jobApi.getDetailById(jobId);
        
        // 填充表单数据
        const formValues: any = {
          name: jobDetailData.name,
          path: jobDetailData.path,
          description: jobDetailData.description || "",
        };
        
        if (jobDetailData.workflow) {
          const wf = jobDetailData.workflow;
          formValues.timeout = wf.timeout;
          formValues.retry = wf.retry;
          formValues.node_type = wf.node_type;
          formValues.schedule_enabled = wf.schedule_enabled;
          formValues.schedule_crontab = wf.schedule_crontab;
          formValues.schedule_timezone = wf.schedule_timezone;
          
          // 转换选项
          formValues.options = wf.options.map((opt) => ({
            option_type: opt.option_type,
            // 如果是 json_schema 类型，参数名称默认为 "json"
            name: opt.option_type === "json_schema" ? "json" : opt.name,
            display_name: opt.display_name,
            description: opt.description,
            default_value: opt.default_value,
            required: opt.required,
            credential_type: opt.credential_type,
            json_schema: opt.json_schema,
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
        
        // 保存原始数据，用于在提交时补充未访问 tab 的字段
        setLoadedFormData(formValues);
        form.setFieldsValue(formValues);
      } catch (error) {
        console.error("加载工具详情失败:", error);
        message.error("加载工具详情失败");
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

      // 获取所有表单字段值（包括未访问的 tab 中的字段）
      // 这样可以确保即使没有打开某个 tab，也能获取到已加载的数据
      const allFormValues = form.getFieldsValue();
      
      // 合并验证后的值、所有表单值和加载的原始数据
      // 优先级：验证后的值 > 表单中的值 > 加载的原始数据（仅编辑模式）> 默认值
      // 在编辑模式下，如果用户没有访问某个 tab，使用加载的原始数据来补充
      const baseData = isEditMode && loadedFormData ? loadedFormData : {};
      const mergedValues = {
        ...baseData,
        ...allFormValues,
        ...values,
        // 对于数组字段，如果验证结果中没有该字段（undefined），则依次使用表单中的值、加载的原始数据（仅编辑模式）
        // 这样可以避免未访问的 tab 导致字段丢失
        options: values.options ?? allFormValues.options ?? (isEditMode ? loadedFormData?.options : undefined) ?? [],
        steps: values.steps ?? allFormValues.steps ?? (isEditMode ? loadedFormData?.steps : undefined) ?? [],
        notifications: values.notifications ?? allFormValues.notifications ?? (isEditMode ? loadedFormData?.notifications : undefined) ?? [],
      };

      // 处理步骤的扩展配置（解析 JSON 字符串）
      const processedSteps = (mergedValues.steps || []).map((step: any) => {
        let extension = step.extension;
        if (typeof extension === "string") {
          try {
            extension = JSON.parse(extension);
          } catch (e) {
            // 如果是 Python 脚本类型，且无法解析为 JSON，则视为纯代码内容
            if (step.step_type === "python_script") {
              extension = { script: extension };
            } else if (step.step_type === "curl") {
              extension = { curl: extension };
            } else {
              message.error(`步骤 ${step.order} 的扩展配置 JSON 格式错误`);
              throw new Error("扩展配置格式错误");
            }
          }
        }
        // 对于 Python 脚本，确保 extension 是对象且包含 script 字段
        if (step.step_type === "python_script") {
          if (typeof extension === "object" && extension !== null) {
            if (!extension.script || typeof extension.script !== "string") {
              message.error(`步骤 ${step.order} 的 Python 脚本内容不能为空`);
              throw new Error("Python 脚本内容不能为空");
            }
          } else {
            message.error(`步骤 ${step.order} 的扩展配置格式错误`);
            throw new Error("扩展配置格式错误");
          }
        }
        // 对于 CURL 命令，确保 extension 是对象且包含 curl 字段
        if (step.step_type === "curl") {
          if (typeof extension === "object" && extension !== null) {
            if (!extension.curl || typeof extension.curl !== "string") {
              message.error(`步骤 ${step.order} 的 CURL 命令内容不能为空`);
              throw new Error("CURL 命令内容不能为空");
            }
          } else {
            message.error(`步骤 ${step.order} 的扩展配置格式错误`);
            throw new Error("扩展配置格式错误");
          }
        }
        return {
          ...step,
          extension,
        };
      });

      // 处理通知的扩展配置（解析 JSON 字符串）
      const processedNotifications = (mergedValues.notifications || []).map((notification: any) => {
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
        name: mergedValues.name || "默认工作流",
        timeout: mergedValues.timeout,
        retry: mergedValues.retry ?? 0,
        node_type: mergedValues.node_type || "local",
        schedule_enabled: mergedValues.schedule_enabled || false,
        schedule_crontab: mergedValues.schedule_crontab,
        schedule_timezone: mergedValues.schedule_timezone || "UTC",
        options: mergedValues.options || [],
        steps: processedSteps,
        notifications: processedNotifications,
      };

      if (isEditMode && jobId) {
        // 更新工具
        await jobApi.update(jobId, {
          name: mergedValues.name,
          path: mergedValues.path,
          description: mergedValues.description,
          workflow: workflowData,
        });
        message.success("工具更新成功");
      } else {
        // 创建工具
        await jobApi.create({
          name: mergedValues.name,
          path: mergedValues.path,
          description: mergedValues.description,
          project_id: currentProject.id,
          workflow: workflowData,
        });
        message.success("工具创建成功");
      }
      router.push("/dashboard");
    } catch (error) {
      if (error instanceof Error && error.message.includes("验证")) {
        return;
      }
      // 检查是否是 413 错误（数据太大）
      if (error instanceof Error && (error.message.includes("413") || error.message.includes("数据太大") || error.message.includes("Body exceeded"))) {
        message.error("数据太大，超过了 100MB 的限制。请减少数据量后重试。");
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

      // 获取输入参数配置
      const options = form.getFieldValue("options") || [];
      
      setCurrentTestStepIndex(stepIndex);
      setCurrentTestOptions(options);
      setTestResult(null);
      
      // 加载凭证列表（如果有凭证类型的参数）
      if (currentProject) {
        const credentialTypes = new Set<string>();
        options.forEach((opt: any) => {
          if (opt.option_type === "credential" && opt.credential_type) {
            credentialTypes.add(opt.credential_type);
          }
        });
        
        // 加载所有需要的凭证类型
        const loadCredentials = async () => {
          const newCredentialsMap: Record<string, Credential[]> = {};
          for (const type of credentialTypes) {
            try {
              const creds = await credentialApi.getAll({
                project_id: currentProject.id,
                credential_type: type,
              });
              newCredentialsMap[type] = creds;
            } catch (error) {
              console.error(`加载${type}凭证失败:`, error);
              newCredentialsMap[type] = [];
            }
          }
          setCredentialsMap(newCredentialsMap);
        };
        loadCredentials();
      }
      
      // 设置默认值
      const initialValues: Record<string, any> = {};
      options.forEach((opt: any) => {
        if (opt.default_value !== undefined && opt.default_value !== null && opt.default_value !== "") {
          initialValues[opt.name] = opt.default_value;
        }
      });
      
      testArgsForm.resetFields();
      testArgsForm.setFieldsValue(initialValues);
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

      // 验证普通表单
      await testArgsForm.validateFields();
      
      // 验证所有 JSON Schema 表单
      const jsonSchemaValidations = Object.keys(jsonSchemaFormRefs.current).map(async (key) => {
        const ref = jsonSchemaFormRefs.current[key];
        if (ref) {
          await ref.validate();
        }
      });
      
      await Promise.all(jsonSchemaValidations);

      // 获取测试参数
      const testArgs = testArgsForm.getFieldsValue();
      // 移除空值并处理日期格式
      const args: Record<string, any> = {};
      Object.keys(testArgs).forEach((key) => {
        const value = testArgs[key];
        if (value !== undefined && value !== null && value !== "") {
          // 如果是日期对象，转换为字符串
          if (value && typeof value === "object" && "format" in value) {
            args[key] = value.format("YYYY-MM-DD");
          } else if (Array.isArray(value) && value.length === 0) {
            // 跳过空数组
            return;
          } else {
            args[key] = value;
          }
        }
      });

      // 合并 JSON Schema 表单的值
      Object.keys(jsonSchemaValues).forEach((key) => {
        if (jsonSchemaValues[key] !== undefined && jsonSchemaValues[key] !== null) {
          args[key] = jsonSchemaValues[key];
        }
      });

      setTestingScript(true);
      setTestResult(null);

      const result = await jobApi.testScript(script, Object.keys(args).length > 0 ? args : undefined);
      
      setTestResult(result);
    } catch (error) {
      // 验证失败时不显示错误消息，由表单自己显示
      if (error instanceof Error && !error.message.includes("验证")) {
        message.error(error.message);
        setTestResult({ error: error.message });
      }
    } finally {
      setTestingScript(false);
    }
  };

  // 生成 Tabs items
  const tabItems = useMemo(() => {
    return [
      {
        key: "basic",
        label: "基础信息",
        children: (
                <div style={{ maxWidth: 800, padding: "20px 0" }}>
                  <Form.Item
                    name="name"
                    label="工具名称"
                    rules={[
                      { required: true, message: "请输入工具名称" },
                      { max: 100, message: "工具名称不能超过100个字符" },
                    ]}
                  >
                    <Input placeholder="请输入工具名称" />
                  </Form.Item>

                  <Form.Item
                    name="path"
                    label="工具路径"
                    rules={[
                      { required: true, message: "请输入工具路径" },
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
                    label="工具描述"
                    rules={[{ max: 500, message: "描述不能超过500个字符" }]}
                    extra="可选，用于描述工具的用途或负责人信息"
                  >
                    <Input.TextArea
                      placeholder="请输入工具描述（可选）"
                      rows={4}
                      showCount
                      maxLength={500}
                    />
                  </Form.Item>
                </div>
        ),
      },
      {
        key: "inputs",
        label: "输入参数",
        children: (
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
                            <Select 
                              placeholder="请选择参数类型"
                              onChange={(value) => {
                                // 当选择 json_schema 时，自动设置参数名称为 "json"
                                if (value === "json_schema") {
                                  form.setFieldValue(["options", name, "name"], "json");
                                }
                              }}
                            >
                              <Select.Option value="text">文本</Select.Option>
                              <Select.Option value="date">日期</Select.Option>
                              <Select.Option value="number">数字</Select.Option>
                              <Select.Option value="file">文件</Select.Option>
                              <Select.Option value="credential">授权凭证</Select.Option>
                              <Select.Option value="json_schema">Json Schema</Select.Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            noStyle
                            shouldUpdate={(prevValues, curValues) => {
                              const prevOptionType = prevValues.options?.[name]?.option_type;
                              const curOptionType = curValues.options?.[name]?.option_type;
                              return prevOptionType !== curOptionType;
                            }}
                          >
                            {({ getFieldValue }) => {
                              const optionType = getFieldValue(["options", name, "option_type"]);
                              if (optionType === "credential") {
                                return (
                                  <Form.Item
                                    {...restField}
                                    name={[name, "credential_type"]}
                                    label="凭证类型"
                                    labelCol={{ span: 6 }}
                                    wrapperCol={{ span: 18 }}
                                    rules={[
                                      { required: true, message: "请选择凭证类型" },
                                    ]}
                                    style={{ marginBottom: "8px" }}
                                  >
                                    <Select placeholder="请选择凭证类型">
                                      <Select.Option value="mysql">MySQL凭证</Select.Option>
                                      <Select.Option value="oss">OSS凭证</Select.Option>
                                      <Select.Option value="deepseek">DeepSeek凭证</Select.Option>
                                    </Select>
                                  </Form.Item>
                                );
                              }
                              return null;
                            }}
                          </Form.Item>
                        </Col>
                        <Col span={24}>
                          <Form.Item
                            noStyle
                            shouldUpdate={(prevValues, curValues) => {
                              const prevOptionType = prevValues.options?.[name]?.option_type;
                              const curOptionType = curValues.options?.[name]?.option_type;
                              return prevOptionType !== curOptionType;
                            }}
                          >
                            {({ getFieldValue }) => {
                              const optionType = getFieldValue(["options", name, "option_type"]);
                              if (optionType === "json_schema") {
                                return (
                                  <Form.Item
                                    {...restField}
                                    name={[name, "json_schema"]}
                                    label="Json Schema"
                                    labelCol={{ span: 3 }}
                                    wrapperCol={{ span: 21 }}
                                    rules={[
                                      { required: true, message: "请输入 Json Schema 描述" },
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
                                    style={{ marginBottom: "8px" }}
                                  >
                                    <Input.TextArea
                                      placeholder='请输入 Json Schema 描述，例如: {"type": "object", "properties": {"name": {"type": "string"}}}'
                                      rows={6}
                                    />
                                  </Form.Item>
                                );
                              }
                              return null;
                            }}
                          </Form.Item>
                        </Col>
                        <Form.Item
                          noStyle
                          shouldUpdate={(prevValues, curValues) => {
                            const prevOptionType = prevValues.options?.[name]?.option_type;
                            const curOptionType = curValues.options?.[name]?.option_type;
                            return prevOptionType !== curOptionType;
                          }}
                        >
                          {({ getFieldValue }) => {
                            const optionType = getFieldValue(["options", name, "option_type"]);
                            const isJsonSchema = optionType === "json_schema";
                            
                            // 如果是 json_schema 类型，隐藏这些字段，但保留隐藏的参数名称字段用于验证
                            if (isJsonSchema) {
                              return (
                                <Form.Item
                                  {...restField}
                                  name={[name, "name"]}
                                  hidden
                                  initialValue="json"
                                  rules={[
                                    { required: true, message: "请输入参数名称" },
                                  ]}
                                >
                                  <Input />
                                </Form.Item>
                              );
                            }
                            
                            return (
                              <>
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
                                    name={[name, "display_name"]}
                                    label="参数显示名"
                                    labelCol={{ span: 6 }}
                                    wrapperCol={{ span: 18 }}
                                    style={{ marginBottom: "8px" }}
                                  >
                                    <Input placeholder="请输入参数显示名（可选）" />
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
                              </>
                            );
                          }}
                        </Form.Item>
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
        ),
      },
      {
        key: "steps",
        label: "运行步骤",
        children: (
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
                                // 当选择 CURL 时，初始化 extension
                                if (value === "curl") {
                                  const currentExtension = form.getFieldValue(["steps", name, "extension"]);
                                  // 如果 extension 为空或者是其他格式，初始化为包含空 curl 的 JSON
                                  if (!currentExtension || (typeof currentExtension === "string" && !currentExtension.includes("curl"))) {
                                    form.setFieldValue(
                                      ["steps", name, "extension"],
                                      JSON.stringify({ curl: "" }, null, 2)
                                    );
                                  }
                                }
                              }}
                            >
                              <Select.Option value="command">Bash命令</Select.Option>
                              <Select.Option value="shell_script">Shell脚本</Select.Option>
                              <Select.Option value="python_script">Python脚本</Select.Option>
                              <Select.Option value="curl">CURL命令</Select.Option>
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
                              const isCurl = stepType === "curl";
                              
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
                                              // 检查 script 内容是否为空
                                              if (!parsed.script.trim()) {
                                                return Promise.reject(new Error("Python 代码不能为空"));
                                              }
                                            } catch {
                                              // 如果不是 JSON，可能是直接的脚本内容
                                              // 检查是否为空字符串
                                              if (!value.trim()) {
                                                return Promise.reject(new Error("Python 代码不能为空"));
                                              }
                                              // 允许纯代码字符串通过验证（会在提交时转换为 JSON）
                                              return Promise.resolve();
                                            }
                                          } else if (typeof value === "object") {
                                            if (!value.script || typeof value.script !== "string") {
                                              return Promise.reject(new Error("扩展配置必须包含 script 字段"));
                                            }
                                            if (!value.script.trim()) {
                                              return Promise.reject(new Error("Python 代码不能为空"));
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
                                          💡 代码使用说明：
                                        </div>
                                        <div style={{ marginBottom: "8px", color: "#666" }}>
                                          - 入参获取：通过 <code style={{ backgroundColor: "#fff", padding: "2px 4px", borderRadius: "2px" }}>args</code> 字典访问输入参数。
                                          例如：参数名为 <code style={{ backgroundColor: "#fff", padding: "2px 4px", borderRadius: "2px" }}>name</code>，使用 <code style={{ backgroundColor: "#fff", padding: "2px 4px", borderRadius: "2px" }}>args.get("name")</code>
                                        </div>
                                        <div style={{ marginBottom: "8px", color: "#666" }}>
                                          - 凭证获取：通过 <code style={{ backgroundColor: "#fff", padding: "2px 4px", borderRadius: "2px" }}>credential</code> 获取。
                                          例如：凭证ID为 <code style={{ backgroundColor: "#fff", padding: "2px 4px", borderRadius: "2px" }}>21</code>，使用 <code style={{ backgroundColor: "#fff", padding: "2px 4px", borderRadius: "2px" }}>credential.get_config(21)</code> 获取配置
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
{`# 示例1：获取普通参数并处理
name = args.get("name", "默认值")
age = args.get("age", 0)

# 处理逻辑
print(f"姓名: {name}, 年龄: {age}")

# 返回结果
result_text = f"处理完成: {name}"
dataset = [{"name": name, "age": age}]
return (result_text, dataset)

# 示例2：访问凭证参数（MySQL）
def execute(args: dict) -> tuple:
    # 获取凭证ID（从参数中）
    mysql_cred_id = args.get("mysql_credential")
    
    if mysql_cred_id:
        # 使用凭证工具类获取配置
        mysql_config = credential.get_config(mysql_cred_id)
        if mysql_config:
            host = mysql_config.get("host")
            port = mysql_config.get("port")
            user = mysql_config.get("user")
            password = mysql_config.get("password")
            database = mysql_config.get("database")
            # 使用凭证信息连接数据库...
            print(f"连接到数据库: {host}:{port}/{database}")
    
    return ("执行完成", None)

# 示例3：访问凭证参数（OSS）
def execute(args: dict) -> tuple:
    oss_cred_id = args.get("oss_credential")
    if oss_cred_id:
        oss_config = credential.get_config(oss_cred_id)
        if oss_config:
            endpoint = oss_config.get("endpoint")
            access_key_id = oss_config.get("access_key_id")
            access_key_secret = oss_config.get("access_key_secret")
            bucket = oss_config.get("bucket")
            # 使用OSS凭证...
    
    return ("执行完成", None)

# 示例4：访问凭证参数（DeepSeek）
def execute(args: dict) -> tuple:
    deepseek_cred_id = args.get("deepseek_credential")
    if deepseek_cred_id:
        deepseek_config = credential.get_config(deepseek_cred_id)
        if deepseek_config:
            api_key = deepseek_config.get("api_key")
            # 使用API密钥...
    
    return ("执行完成", None)

# 示例5：通用凭证访问方法
def execute(args: dict) -> tuple:
    cred_id = args.get("my_credential")
    if cred_id:
        # 获取完整凭证信息（可选）
        cred_info = credential.get(cred_id)
        if cred_info:
            cred_type = cred_info.get("credential_type")
            cred_name = cred_info.get("name")
            print(f"凭证类型: {cred_type}, 名称: {cred_name}")
        
        # 获取凭证配置（推荐方式）
        cred_config = credential.get_config(cred_id)
        if cred_config:
            # 根据凭证类型使用不同的配置字段
            print(f"配置: {cred_config}")
    
    return ("执行完成", None)`}
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
                              } else if (isCurl) {
                                // CURL：显示 CURL 命令输入框
                                return (
                                  <Form.Item
                                    {...restField}
                                    name={[name, "extension"]}
                                    label="CURL 命令"
                                    labelCol={{ span: 3 }}
                                    wrapperCol={{ span: 21 }}
                                    rules={[
                                      { required: true, message: "请输入 CURL 命令" },
                                      {
                                        validator: (_, value) => {
                                          if (!value) {
                                            return Promise.resolve();
                                          }
                                          // 如果是字符串，尝试解析为 JSON
                                          if (typeof value === "string") {
                                            try {
                                              const parsed = JSON.parse(value);
                                              if (!parsed.curl || typeof parsed.curl !== "string") {
                                                return Promise.reject(new Error("扩展配置必须包含 curl 字段"));
                                              }
                                              // 检查 curl 内容是否为空
                                              if (!parsed.curl.trim()) {
                                                return Promise.reject(new Error("CURL 命令不能为空"));
                                              }
                                            } catch {
                                              // 如果不是 JSON，可能是直接的命令内容
                                              // 检查是否为空字符串
                                              if (!value.trim()) {
                                                return Promise.reject(new Error("CURL 命令不能为空"));
                                              }
                                              // 允许纯命令字符串通过验证（会在提交时转换为 JSON）
                                              return Promise.resolve();
                                            }
                                          } else if (typeof value === "object") {
                                            if (!value.curl || typeof value.curl !== "string") {
                                              return Promise.reject(new Error("扩展配置必须包含 curl 字段"));
                                            }
                                            if (!value.curl.trim()) {
                                              return Promise.reject(new Error("CURL 命令不能为空"));
                                            }
                                          }
                                          return Promise.resolve();
                                        },
                                      },
                                    ]}
                                    style={{ marginBottom: "8px" }}
                                  >
                                    <div>
                                      <div style={{ marginBottom: "8px" }}>
                                        <span style={{ fontSize: "12px", color: "#666" }}>
                                          输入 CURL 命令，系统将使用 Jinja2 模板引擎渲染参数
                                        </span>
                                      </div>
                                      {/* CURL 参数引用提示和示例 */}
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
                                          💡 CURL 使用说明：
                                        </div>
                                        <div style={{ marginBottom: "8px", color: "#666" }}>
                                          - 普通参数引用：使用 <code style={{ backgroundColor: "#fff", padding: "2px 4px", borderRadius: "2px" }}>{`{{ param_name }}`}</code>
                                        </div>
                                        <div style={{ marginBottom: "8px", color: "#666" }}>
                                          - JSON 参数引用：使用 <code style={{ backgroundColor: "#fff", padding: "2px 4px", borderRadius: "2px" }}>{`{{ json.field_name }}`}</code>
                                        </div>
                                        <details style={{ cursor: "pointer" }}>
                                          <summary style={{ color: "#1890ff", marginBottom: "4px" }}>查看示例</summary>
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
{`# 示例1：GET 请求，使用普通参数
curl -X GET "https://api.example.com/users?name={{ name }}&age={{ age }}"

# 示例2：POST 请求，JSON 格式，使用普通参数
curl -X POST "https://api.example.com/users" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "{{ name }}", "age": {{ age }}, "email": "{{ email }}"}'

# 示例3：使用 JSON Schema 参数（假设参数名为 json）
curl -X POST "https://api.example.com/data" \\
  -H "Content-Type: application/json" \\
  -d '{"user": "{{ json.username }}", "items": {{ json.items | tojson }}}'

# 示例4：带认证的请求
curl -X GET "https://api.example.com/protected" \\
  -H "Authorization: Bearer {{ api_token }}"

# 示例5：文件上传
curl -X POST "https://api.example.com/upload" \\
  -F "file=@{{ file_path }}" \\
  -F "description={{ description }}"

# 注意事项：
# 1. 字符串参数需要用引号包裹：{{ name }}
# 2. 数字参数不需要引号：{{ age }}
# 3. JSON 对象可以使用 tojson 过滤器：{{ json.data | tojson }}
# 4. 多行命令使用反斜杠 \\ 连接`}
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
                                          let curlContent = "";
                                          
                                          if (extension) {
                                            if (typeof extension === "string") {
                                              try {
                                                const parsed = JSON.parse(extension);
                                                curlContent = parsed.curl || "";
                                              } catch {
                                                curlContent = extension;
                                              }
                                            } else if (typeof extension === "object") {
                                              curlContent = extension.curl || "";
                                            }
                                          }
                                          
                                          return (
                                            <Input.TextArea
                                              value={curlContent}
                                              onChange={(e) => {
                                                // 更新表单值，保存为 JSON 格式
                                                form.setFieldValue(
                                                  ["steps", name, "extension"],
                                                  JSON.stringify({ curl: e.target.value }, null, 2)
                                                );
                                              }}
                                              placeholder={'例如: curl -X POST "https://api.example.com/data" -H "Content-Type: application/json" -d \'{"name": "{{ name }}"}\''}
                                              rows={6}
                                              style={{ fontFamily: "monospace" }}
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
        ),
      },
      {
        key: "node",
        label: "运行节点",
        children: (
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
        ),
      },
      {
        key: "schedule",
        label: "定时工具",
        children: (
          <div style={{ maxWidth: 800, padding: "20px 0" }}>
            <Form.Item
              name="schedule_enabled"
              label="是否定时工具"
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
                      label="定时工具规则 (Crontab)"
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
        ),
      },
      {
        key: "notifications",
        label: "消息通知",
        children: (
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
                              <Select.Option value="on_start">工具开始</Select.Option>
                              <Select.Option value="on_success">工具成功</Select.Option>
                              <Select.Option value="on_failure">工具失败</Select.Option>
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
                            labelCol={{ span: 12 }}
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
        ),
      },
      {
        key: "others",
        label: "其他配置",
        children: (
          <div style={{ maxWidth: 800, padding: "20px 0" }}>
            <Form.Item
              name="timeout"
              label="超时时间（分钟）"
              extra="工具执行超时时间，超过此时间将自动终止"
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
              extra="工具失败后自动重试的次数"
            >
              <InputNumber
                min={0}
                placeholder="请输入重试次数"
                style={{ width: "100%" }}
              />
            </Form.Item>
          </div>
        ),
      },
    ];
  }, [form, handleTestScript]);

  return (
    <Card>
      <Space orientation="vertical" size="large" style={{ width: "100%" }}>
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
            <Tabs defaultActiveKey="basic" type="card" items={tabItems} />

            <Divider />

            <Form.Item>
              <Space>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={submitting}
                  size="large"
                >
                  {isEditMode ? "保存修改" : "创建工具"}
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
          setJsonSchemaValues({});
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setTestModalVisible(false);
              setTestResult(null);
              testArgsForm.resetFields();
              setJsonSchemaValues({});
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
          {currentTestOptions.length > 0 ? (
            <>
              <div style={{ marginBottom: "16px", color: "#666", fontSize: "12px" }}>
                根据配置的输入参数填写测试值：
              </div>
              {currentTestOptions.map((option: any) => {
                const label = option.display_name || option.name;
                const isRequired = option.required;
                const optionType = option.option_type || "text";
                
                // 如果是 json_schema 类型，使用 JsonSchemaForm 组件
                if (optionType === "json_schema") {
                  let jsonSchema = null;
                  try {
                    jsonSchema = typeof option.json_schema === "string"
                      ? JSON.parse(option.json_schema)
                      : option.json_schema;
                  } catch (e) {
                    console.error("JSON Schema 解析失败:", e);
                  }
                  
                  if (!jsonSchema) {
                    return (
                      <Form.Item
                        key={option.name}
                        label={label}
                        extra={option.description}
                      >
                        <div style={{ color: "red" }}>JSON Schema 无效</div>
                      </Form.Item>
                    );
                  }
                  
                  return (
                    <div key={option.name} style={{ marginBottom: "16px" }}>
                      <div style={{ marginBottom: "8px", fontWeight: 500 }}>
                        {label}
                        {isRequired && <span style={{ color: "red", marginLeft: "4px" }}>*</span>}
                      </div>
                      {option.description && (
                        <div style={{ marginBottom: "8px", color: "#666", fontSize: "12px" }}>
                          {option.description}
                        </div>
                      )}
                      <JsonSchemaForm
                        ref={(ref) => {
                          if (ref) {
                            jsonSchemaFormRefs.current[option.name] = ref;
                          }
                        }}
                        schema={jsonSchema}
                        value={jsonSchemaValues[option.name]}
                        onChange={(value) => {
                          setJsonSchemaValues((prev) => ({
                            ...prev,
                            [option.name]: value,
                          }));
                        }}
                      />
                    </div>
                  );
                }
                
                // 根据 option_type 渲染不同的输入组件
                let inputComponent;
                
                switch (optionType) {
                  case "date":
                    inputComponent = (
                      <DatePicker
                        style={{ width: "100%" }}
                        placeholder="请选择日期"
                        format="YYYY-MM-DD"
                      />
                    );
                    break;
                  case "number":
                    inputComponent = (
                      <InputNumber
                        style={{ width: "100%" }}
                        placeholder="请输入数字"
                      />
                    );
                    break;
                  case "file":
                    inputComponent = (
                      <Upload
                        customRequest={async ({ file, onSuccess, onError }) => {
                          try {
                            // 调用上传接口
                            const result = await uploadApi.upload(file as File);
                            // 将文件路径保存到表单值中
                            form.setFieldValue(option.name, result.path);
                            // 调用 onSuccess，传递结果对象
                            if (onSuccess) {
                              onSuccess(result, new XMLHttpRequest());
                            }
                          } catch (error) {
                            console.error("文件上传失败:", error);
                            message.error(`文件上传失败: ${error instanceof Error ? error.message : "未知错误"}`);
                            if (onError) {
                              onError(error as Error);
                            }
                          }
                        }}
                        maxCount={1}
                        onRemove={() => {
                          // 移除文件时，清空表单值
                          form.setFieldValue(option.name, undefined);
                        }}
                        // 显示已上传的文件名
                        fileList={form.getFieldValue(option.name) ? [
                          {
                            uid: "-1",
                            name: form.getFieldValue(option.name)?.split("/").pop() || "已上传文件",
                            status: "done",
                          }
                        ] : []}
                      >
                        <Button>选择文件</Button>
                      </Upload>
                    );
                    break;
                  case "credential":
                    // 凭证类型参数，需要根据凭证类型过滤
                    const credentialType = option.credential_type;
                    const credentials = credentialsMap[credentialType || ""] || [];
                    inputComponent = (
                      <Select
                        placeholder={`请选择${getCredentialTypeName(credentialType)}`}
                        showSearch
                        optionFilterProp="label"
                      >
                        {credentials.map((cred) => (
                          <Select.Option key={cred.id} value={cred.id} label={cred.name}>
                            {cred.name} {cred.description ? `(${cred.description})` : ""}
                          </Select.Option>
                        ))}
                      </Select>
                    );
                    break;
                  default:
                    inputComponent = (
                      <Input
                        placeholder={`请输入${label}`}
                      />
                    );
                }
                
                return (
                  <Form.Item
                    key={option.name}
                    name={option.name}
                    label={
                      <span>
                        {label}
                        {isRequired && <span style={{ color: "red", marginLeft: "4px" }}>*</span>}
                      </span>
                    }
                    rules={isRequired ? [{ required: true, message: `请输入${label}` }] : []}
                    extra={option.description ? option.description : undefined}
                  >
                    {inputComponent}
                  </Form.Item>
                );
              })}
            </>
          ) : (
            <div style={{ padding: "20px", textAlign: "center", color: "#999" }}>
              当前工具未配置输入参数，脚本将使用空参数运行
            </div>
          )}
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

