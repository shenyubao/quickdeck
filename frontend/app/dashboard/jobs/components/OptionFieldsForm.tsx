"use client";

import React from "react";
import {
  Form,
  Input,
  InputNumber,
  DatePicker,
  Upload,
  Select,
  Button,
  Typography,
} from "antd";
import type { FormInstance } from "antd";
import { message } from "antd";
import { uploadApi, type OptionResponse, type Credential } from "@/lib/api";

const { Text } = Typography;
const { Option } = Select;

interface OptionFieldsFormProps {
  options: OptionResponse[];
  form: FormInstance;
  credentialsMap: Record<string, Credential[]>;
  getCredentialTypeName: (type?: string) => string;
  isMobile?: boolean;
}

/**
 * 参数列表表单组件
 * 根据参数类型动态渲染对应的输入组件
 */
const OptionFieldsForm: React.FC<OptionFieldsFormProps> = ({
  options,
  form,
  credentialsMap,
  getCredentialTypeName,
  isMobile = false,
}) => {
  // 过滤掉 json_schema 类型的参数（由其他组件处理）
  const filteredOptions = options.filter(
    (opt) => opt.option_type !== "json_schema"
  );

  if (filteredOptions.length === 0) {
    return null;
  }

  return (
    <>
      {filteredOptions.map((option) => {
        const { option_type, credential_type } = option;
        const placeholder = `请输入${option.display_name || option.name}`;
        const label = option.display_name || option.name;

        let inputComponent: React.ReactNode;

        switch (option_type) {
          case "date":
            inputComponent = <DatePicker style={{ width: "100%" }} />;
            break;
          case "number":
            inputComponent = <InputNumber style={{ width: "100%" }} />;
            break;
          case "file":
            // 文件类型在 return 语句中单独处理，这里不需要设置 inputComponent
            inputComponent = null;
            break;
          case "credential":
            const credentials = credentialsMap[credential_type || ""] || [];
            inputComponent = (
              <Select
                placeholder={`请选择${getCredentialTypeName(credential_type)}`}
                style={{ width: "100%" }}
                showSearch
                optionFilterProp="label"
              >
                {credentials.map((cred) => (
                  <Option key={cred.id} value={cred.id} label={cred.name}>
                    {cred.name} {cred.description ? `(${cred.description})` : ""}
                  </Option>
                ))}
              </Select>
            );
            break;
          case "text":
          default:
            inputComponent = <Input placeholder={placeholder} />;
            break;
        }

        // 对于文件类型，需要在 Form.Item 内部使用 shouldUpdate 来响应表单值变化
        if (option_type === "file") {
          return (
            <Form.Item
              key={option.id}
              name={option.name}
              label={
                <div>
                  <Text strong style={{ fontSize: isMobile ? "13px" : "14px" }}>
                    {label}
                  </Text>
                  {option.required && (
                    <Text type="danger" style={{ marginLeft: 4 }}>*</Text>
                  )}
                </div>
              }
              tooltip={option.description}
              rules={[
                {
                  required: option.required,
                  message: `请输入${label}`,
                },
              ]}
            >
              <Form.Item
                noStyle
                shouldUpdate={(prevValues, currentValues) =>
                  prevValues[option.name] !== currentValues[option.name]
                }
              >
                {() => {
                  const filePath = form.getFieldValue(option.name);
                  return (
                    <Upload
                      customRequest={async (uploadOptions) => {
                        const { onSuccess, onError, file } = uploadOptions;
                        try {
                          const result = await uploadApi.upload(file as File);
                          // 将文件路径保存到表单值中
                          form.setFieldValue(option.name, result.path);
                          if (onSuccess) {
                            onSuccess(result, file);
                            message.success(
                              `${(file as File).name} 文件上传成功`
                            );
                          }
                        } catch (error) {
                          console.error("文件上传错误:", error);
                          if (onError) {
                            onError(error as Error);
                          }
                          message.error(
                            `${(file as File).name} 文件上传失败`
                          );
                        }
                      }}
                      maxCount={1}
                      onRemove={() => {
                        // 移除文件时，清空表单值
                        form.setFieldValue(option.name, undefined);
                      }}
                      // 显示已上传的文件名，根据表单值动态更新
                      fileList={
                        filePath
                          ? [
                              {
                                uid: "-1",
                                name:
                                  filePath.split("/").pop() || "已上传文件",
                                status: "done",
                              },
                            ]
                          : []
                      }
                    >
                      <Button>选择文件</Button>
                    </Upload>
                  );
                }}
              </Form.Item>
            </Form.Item>
          );
        }

        return (
          <Form.Item
            key={option.id}
            name={option.name}
            label={
              <div>
                <Text strong style={{ fontSize: isMobile ? "13px" : "14px" }}>
                  {label}
                </Text>
                {option.required && (
                  <Text type="danger" style={{ marginLeft: 4 }}>*</Text>
                )}
              </div>
            }
            tooltip={option.description}
            rules={[
              {
                required: option.required,
                message: `请输入${label}`,
              },
            ]}
          >
            {inputComponent}
          </Form.Item>
        );
      })}
    </>
  );
};

export default OptionFieldsForm;
