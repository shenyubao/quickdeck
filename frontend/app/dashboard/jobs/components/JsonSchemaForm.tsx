"use client";

import React, { useMemo, useImperativeHandle, forwardRef } from "react";
import {
  Form,
  Input,
  InputNumber,
  Switch,
  DatePicker,
  Button,
  Space,
  Card,
  Typography,
} from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

const { Text } = Typography;

interface JsonSchemaFormProps {
  schema: any; // JSON Schema 对象
  value?: any; // 当前值
  onChange?: (value: any) => void; // 值改变回调
  disabled?: boolean; // 是否禁用
}

export interface JsonSchemaFormRef {
  validate: () => Promise<any>;
  resetFields: () => void;
}

/**
 * JSON Schema 表单组件
 * 根据 JSON Schema 动态渲染表单控件
 */
const JsonSchemaFormInner = forwardRef<JsonSchemaFormRef, JsonSchemaFormProps>(({
  schema,
  value = {},
  onChange,
  disabled = false,
}, ref) => {
  const [form] = Form.useForm();
  const isInternalChangeRef = React.useRef(false);
  const lastExternalValueRef = React.useRef<any>(null);
  const renderCountRef = React.useRef(0);
  const componentIdRef = React.useRef(`JsonSchemaForm-${Math.random().toString(36).substr(2, 9)}`);

  // 组件渲染计数（仅用于调试）
  renderCountRef.current++;
  
  // 日志：记录每次渲染
  console.log(`[${componentIdRef.current}] 渲染次数: ${renderCountRef.current}`, {
    schemaType: schema?.type,
    schemaPropertiesKeys: schema?.properties ? Object.keys(schema.properties) : [],
    valueKeys: value ? Object.keys(value) : [],
    valueStr: JSON.stringify(value),
    disabled,
    hasOnChange: !!onChange,
  });
  
  // 监听组件挂载和卸载
  React.useEffect(() => {
    console.log(`[${componentIdRef.current}] ✅ 组件已挂载`);
    return () => {
      console.log(`[${componentIdRef.current}] ❌ 组件已卸载`);
    };
  }, []);

  // 暴露验证方法给父组件
  useImperativeHandle(ref, () => ({
    validate: async () => {
      try {
        const values = await form.validateFields();
        return values;
      } catch (errorInfo: any) {
        // 验证失败时抛出异常，由父组件处理
        throw errorInfo;
      }
    },
    resetFields: () => {
      form.resetFields();
    },
  }));

  // 递归处理日期字段，将字符串转换为 dayjs 对象
  const parseDateFields = (value: any, fieldSchema: any, path: string = 'root'): any => {
    if (!value || !fieldSchema) return value;

    // 处理对象类型
    if (fieldSchema.type === "object" && fieldSchema.properties) {
      const result = { ...value };
      Object.keys(fieldSchema.properties).forEach((key) => {
        if (result[key] !== undefined && result[key] !== null) {
          result[key] = parseDateFields(result[key], fieldSchema.properties[key], `${path}.${key}`);
        }
      });
      return result;
    }

    // 处理数组类型
    if (fieldSchema.type === "array" && fieldSchema.items) {
      if (Array.isArray(value)) {
        return value.map((item, index) => parseDateFields(item, fieldSchema.items, `${path}[${index}]`));
      }
      return value;
    }

    // 处理日期字符串
    if (fieldSchema.type === "string" && fieldSchema.format === "date") {
      if (value && typeof value === "string") {
        return dayjs(value);
      }
      return value;
    }

    return value;
  };

  // 初始化表单值
  React.useEffect(() => {
    console.log(`[${componentIdRef.current}] useEffect[初始化表单值] 触发`, {
      isInternalChange: isInternalChangeRef.current,
      valueStr: JSON.stringify(value),
      lastExternalValue: lastExternalValueRef.current,
    });
    
    // 如果是内部变化导致的更新，忽略
    if (isInternalChangeRef.current) {
      console.log(`[${componentIdRef.current}] ⏭️  跳过：内部变化`);
      isInternalChangeRef.current = false;
      return;
    }

    // 检查值是否真的变化了（深度比较）
    const valueStr = JSON.stringify(value);
    if (valueStr === lastExternalValueRef.current) {
      console.log(`[${componentIdRef.current}] ⏭️  跳过：值未变化`);
      return;
    }
    
    console.log(`[${componentIdRef.current}] 🔄 更新表单值`, {
      oldValue: lastExternalValueRef.current,
      newValue: valueStr,
    });
    
    lastExternalValueRef.current = valueStr;

    if (value && typeof value === "object" && Object.keys(value).length > 0) {
      // 只处理日期字段转换，不进行额外的循环处理
      const processedValue = parseDateFields(value, schema);
      // 使用 setFieldsValue 而不是直接设置，确保不会触发 onChange
      form.setFieldsValue(processedValue);
    } else {
      // 如果 value 为空，重置表单
      form.resetFields();
    }
  }, [value, schema, form]);

  // 递归处理日期字段，将 dayjs 对象转换为字符串
  const processDateFields = (value: any, fieldSchema: any, path: string = 'root'): any => {
    if (!value || !fieldSchema) return value;

    // 处理对象类型
    if (fieldSchema.type === "object" && fieldSchema.properties) {
      const result = { ...value };
      Object.keys(fieldSchema.properties).forEach((key) => {
        if (result[key] !== undefined && result[key] !== null) {
          result[key] = processDateFields(result[key], fieldSchema.properties[key], `${path}.${key}`);
        }
      });
      return result;
    }

    // 处理数组类型
    if (fieldSchema.type === "array" && fieldSchema.items) {
      if (Array.isArray(value)) {
        return value.map((item, index) => processDateFields(item, fieldSchema.items, `${path}[${index}]`));
      }
      return value;
    }

    // 处理日期字符串
    if (fieldSchema.type === "string" && fieldSchema.format === "date") {
      if (value && typeof value === "object" && value.format) {
        // dayjs 对象
        return value.format("YYYY-MM-DD");
      }
      return value;
    }

    return value;
  };

  // 表单值变化处理
  const handleValuesChange = (changedValues: any, allValues: any) => {
    console.log(`[${componentIdRef.current}] 📝 表单值变化`, {
      changedValues,
      allValues,
      hasOnChange: !!onChange,
    });
    
    if (onChange) {
      // 标记为内部变化
      isInternalChangeRef.current = true;
      
      // 只处理日期字段转换，不进行额外的循环处理
      const processedValues = processDateFields(allValues, schema);
      
      // 更新最后的外部值引用
      const processedStr = JSON.stringify(processedValues);
      console.log(`[${componentIdRef.current}] 🚀 调用 onChange`, {
        processedValues,
        processedStr,
      });
      lastExternalValueRef.current = processedStr;
      
      onChange(processedValues);
    }
  };

  // 解析 $ref 引用
  const resolveRef = (ref: string, rootSchema: any): any => {
    if (!ref || !ref.startsWith("#/")) return null;
    const path = ref.substring(2).split("/"); // 去掉 "#/" 并分割路径
    let result = rootSchema;
    for (const key of path) {
      result = result?.[key];
    }
    return result;
  };

  // 渲染单个字段
  const renderField = (
    fieldName: string,
    fieldSchema: any,
    isRequired: boolean,
    parentPath: string = ""
  ) => {
    const fullPath = parentPath ? `${parentPath}.${fieldName}` : fieldName;
    const label = fieldSchema.title || fieldSchema.description || fieldName;
    const type = fieldSchema.type;

    // 解析 $ref
    let actualSchema = fieldSchema;
    if (fieldSchema.$ref) {
      actualSchema = resolveRef(fieldSchema.$ref, schema);
      if (!actualSchema) {
        return (
          <Form.Item key={`${fullPath}-ref-error`} label={label}>
            <Text type="danger">无法解析引用: {fieldSchema.$ref}</Text>
          </Form.Item>
        );
      }
    }

    // 根据类型渲染不同的控件
    switch (actualSchema.type) {
      case "string":
        return renderStringField(fullPath, actualSchema, label, isRequired);
      case "number":
      case "integer":
        return renderNumberField(fullPath, actualSchema, label, isRequired);
      case "boolean":
        return renderBooleanField(fullPath, actualSchema, label, isRequired);
      case "array":
        return renderArrayField(fullPath, actualSchema, label, isRequired);
      case "object":
        return renderObjectField(fullPath, actualSchema, label, isRequired);
      default:
        return (
          <Form.Item key={`${fullPath}-unsupported`} label={label}>
            <Input placeholder={`不支持的类型: ${actualSchema.type}`} disabled />
          </Form.Item>
        );
    }
  };

  // 渲染字符串字段
  const renderStringField = (
    path: string,
    fieldSchema: any,
    label: string,
    isRequired: boolean
  ) => {
    const rules: any[] = [];
    if (isRequired) {
      rules.push({ required: true, message: `请输入${label}` });
    }
    if (fieldSchema.pattern) {
      rules.push({
        pattern: new RegExp(fieldSchema.pattern),
        message: `格式不正确，应符合: ${fieldSchema.pattern}`,
      });
    }

    // 日期类型
    if (fieldSchema.format === "date") {
      return (
        <Form.Item
          key={`${path}-string-date`}
          name={path.split(".")}
          label={label}
          rules={rules}
        >
          <DatePicker
            style={{ width: "100%" }}
            placeholder={`请选择${label}`}
            format="YYYY-MM-DD"
            disabled={disabled}
          />
        </Form.Item>
      );
    }

    // 普通字符串
    return (
      <Form.Item
        key={`${path}-string`}
        name={path.split(".")}
        label={label}
        rules={rules}
      >
        <Input
          placeholder={`请输入${label}`}
          disabled={disabled}
        />
      </Form.Item>
    );
  };

  // 渲染数字字段
  const renderNumberField = (
    path: string,
    fieldSchema: any,
    label: string,
    isRequired: boolean
  ) => {
    const rules: any[] = [];
    if (isRequired) {
      rules.push({ required: true, message: `请输入${label}` });
    }

    return (
      <Form.Item
        key={`${path}-${fieldSchema.type}`}
        name={path.split(".")}
        label={label}
        rules={rules}
      >
        <InputNumber
          style={{ width: "100%" }}
          placeholder={`请输入${label}`}
          min={fieldSchema.minimum}
          max={fieldSchema.maximum}
          step={fieldSchema.type === "integer" ? 1 : 0.01}
          disabled={disabled}
        />
      </Form.Item>
    );
  };

  // 渲染布尔字段
  const renderBooleanField = (
    path: string,
    fieldSchema: any,
    label: string,
    isRequired: boolean
  ) => {
    return (
      <Form.Item
        key={`${path}-boolean`}
        name={path.split(".")}
        label={label}
        valuePropName="checked"
      >
        <Switch disabled={disabled} />
      </Form.Item>
    );
  };

  // 渲染数组字段
  const renderArrayField = (
    path: string,
    fieldSchema: any,
    label: string,
    isRequired: boolean
  ) => {
    const itemSchema = fieldSchema.items;
    if (!itemSchema) {
      return (
        <Form.Item key={`${path}-array-error-no-items`} label={label}>
          <Text type="danger">数组项缺少 items 定义</Text>
        </Form.Item>
      );
    }

    // 解析 $ref
    let actualItemSchema = itemSchema;
    if (itemSchema.$ref) {
      actualItemSchema = resolveRef(itemSchema.$ref, schema);
      if (!actualItemSchema) {
        return (
          <Form.Item key={`${path}-array-error-ref`} label={label}>
            <Text type="danger">无法解析引用: {itemSchema.$ref}</Text>
          </Form.Item>
        );
      }
    }

    // Form.List 的验证规则
    // 注意：Form.List 的 rules 是应用在整个列表上的，不是单个项
    // 如果 required=true，空数组也会触发验证失败
    // 根据 JSON Schema 的语义，required 只是表示字段必须存在，空数组是合法的
    const rules: any[] = [];
    // 如果需要强制至少一个元素，可以添加自定义验证
    // if (isRequired) {
    //   rules.push({
    //     validator: async (_, value) => {
    //       if (!value || value.length === 0) {
    //         return Promise.reject(new Error(`请添加${label}`));
    //       }
    //       return Promise.resolve();
    //     },
    //   });
    // }

    return (
      <Form.Item
        key={`${path}-array`}
        label={label}
        required={isRequired}
      >
        <Form.List name={path.split(".")}>
          {(fields, { add, remove }) => (
            <div>
              {fields.map((field, index) => (
                <Card
                  key={field.key}
                  size="small"
                  style={{ marginBottom: 8 }}
                  extra={
                    !disabled && (
                      <Button
                        type="link"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => remove(field.name)}
                      >
                        删除
                      </Button>
                    )
                  }
                >
                  {actualItemSchema.type === "object" &&
                  actualItemSchema.properties ? (
                    Object.keys(actualItemSchema.properties).map((key) => {
                      const propSchema = actualItemSchema.properties[key];
                      const itemRequired =
                        actualItemSchema.required?.includes(key) || false;
                      
                      // 构建验证规则
                      const rules: any[] = [];
                      const fieldLabel = propSchema.title || propSchema.description || key;
                      
                      if (itemRequired) {
                        rules.push({ 
                          required: true, 
                          message: `请输入${fieldLabel}` 
                        });
                      }
                      
                      // 添加 pattern 验证
                      if (propSchema.pattern) {
                        rules.push({
                          pattern: new RegExp(propSchema.pattern),
                          message: propSchema.description 
                            ? `${propSchema.description}格式不正确` 
                            : `${fieldLabel}格式不正确`,
                        });
                      }
                      
                      // 添加数值范围验证
                      if (propSchema.type === "number" || propSchema.type === "integer") {
                        if (propSchema.minimum !== undefined) {
                          rules.push({
                            type: "number",
                            min: propSchema.minimum,
                            message: `${fieldLabel}不能小于${propSchema.minimum}`,
                          });
                        }
                        if (propSchema.maximum !== undefined) {
                          rules.push({
                            type: "number",
                            max: propSchema.maximum,
                            message: `${fieldLabel}不能大于${propSchema.maximum}`,
                          });
                        }
                      }
                      
                      return (
                        <Form.Item
                          key={`${field.key}-${key}`}
                          name={[field.name, key]}
                          label={fieldLabel}
                          rules={rules}
                          validateTrigger={["onChange", "onBlur"]}
                        >
                          {propSchema.format === "date" ? (
                            <DatePicker
                              style={{ width: "100%" }}
                              placeholder={`请选择${propSchema.title || propSchema.description || key}`}
                              format="YYYY-MM-DD"
                              disabled={disabled}
                            />
                          ) : propSchema.type === "number" || propSchema.type === "integer" ? (
                            <InputNumber
                              style={{ width: "100%" }}
                              placeholder={`请输入${propSchema.title || propSchema.description || key}`}
                              min={propSchema.minimum}
                              max={propSchema.maximum}
                              step={propSchema.type === "integer" ? 1 : 0.01}
                              disabled={disabled}
                            />
                          ) : propSchema.type === "boolean" ? (
                            <Switch disabled={disabled} />
                          ) : (
                            <Input
                              placeholder={`请输入${propSchema.title || propSchema.description || key}`}
                              disabled={disabled}
                            />
                          )}
                        </Form.Item>
                      );
                    })
                  ) : (
                    <Form.Item
                      name={[field.name]}
                      rules={[
                        {
                          required: actualItemSchema.required || false,
                          message: "此项为必填项",
                        },
                      ]}
                      noStyle
                    >
                      {actualItemSchema.type === "string" ? (
                        <Input placeholder="请输入值" disabled={disabled} />
                      ) : actualItemSchema.type === "number" ||
                        actualItemSchema.type === "integer" ? (
                        <InputNumber
                          style={{ width: "100%" }}
                          placeholder="请输入数字"
                          disabled={disabled}
                        />
                      ) : (
                        <Input placeholder="不支持的类型" disabled />
                      )}
                    </Form.Item>
                  )}
                </Card>
              ))}
              {!disabled && (
                <Button
                  type="dashed"
                  onClick={() => add()}
                  block
                  icon={<PlusOutlined />}
                >
                  添加{label}项
                </Button>
              )}
            </div>
          )}
        </Form.List>
      </Form.Item>
    );
  };

  // 渲染对象字段（嵌套对象）
  const renderObjectField = (
    path: string,
    fieldSchema: any,
    label: string,
    isRequired: boolean
  ) => {
    if (!fieldSchema.properties) {
      return (
        <Form.Item key={`${path}-object-error`} label={label}>
          <Text type="danger">对象缺少 properties 定义</Text>
        </Form.Item>
      );
    }

    return (
      <Card
        key={`${path}-object`}
        title={label}
        size="small"
        style={{ marginBottom: 16 }}
      >
        {Object.keys(fieldSchema.properties).map((key) => {
          const propSchema = fieldSchema.properties[key];
          const propRequired = fieldSchema.required?.includes(key) || false;
          return renderField(key, propSchema, propRequired, path);
        })}
      </Card>
    );
  };

  // 渲染表单
  const renderForm = () => {
    if (!schema || !schema.properties) {
      return <Text type="danger">无效的 JSON Schema</Text>;
    }

    const required = schema.required || [];
    return Object.keys(schema.properties).map((key) => {
      const fieldSchema = schema.properties[key];
      const isRequired = required.includes(key);
      return renderField(key, fieldSchema, isRequired);
    });
  };

  return (
    <Form
      form={form}
      component={false}
      layout="vertical"
      onValuesChange={handleValuesChange}
      disabled={disabled}
      validateTrigger={["onChange", "onBlur"]}
    >
      {renderForm()}
    </Form>
  );
});

JsonSchemaFormInner.displayName = "JsonSchemaFormInner";

// 使用 React.memo 包裹组件，避免不必要的重新渲染
const JsonSchemaForm = React.memo(JsonSchemaFormInner, (prevProps, nextProps) => {
  // 自定义比较函数：只有真正变化时才重新渲染
  const schemaEqual = JSON.stringify(prevProps.schema) === JSON.stringify(nextProps.schema);
  const valueEqual = JSON.stringify(prevProps.value) === JSON.stringify(nextProps.value);
  const disabledEqual = prevProps.disabled === nextProps.disabled;
  const onChangeEqual = prevProps.onChange === nextProps.onChange;
  
  const shouldSkipRender = schemaEqual && valueEqual && disabledEqual && onChangeEqual;
  
  console.log('[JsonSchemaForm] React.memo 比较结果', {
    shouldSkipRender,
    schemaEqual,
    valueEqual,
    disabledEqual,
    onChangeEqual,
  });
  
  return shouldSkipRender;
});

export default JsonSchemaForm;


