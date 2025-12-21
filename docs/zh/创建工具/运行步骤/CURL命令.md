# CURL 命令

CURL 命令步骤用于执行 HTTP 请求。

## 配置方式

1. 选择步骤类型：**CURL 命令**
2. 在"CURL 命令"输入框中输入 CURL 命令
3. 可以使用参数占位符引用输入参数

## 参数引用

CURL 命令支持使用 Jinja2 模板语法引用参数：

- 普通参数：`{{ 参数名 }}`
- JSON 参数：`{{ json.字段名 }}`
- 使用过滤器：`{{ json | tojson }}`

## 示例

### 示例 1：GET 请求

```
curl -X GET https://api.example.com/users/{{ user_id }}
```

### 示例 2：POST 请求（JSON）

```
curl -X POST https://api.example.com/users \
  -H 'Content-Type: application/json' \
  -d '{"name": "{{ name }}", "age": {{ age }}}'
```

### 示例 3：使用 JSON Schema 参数

假设有一个 JSON Schema 类型的参数 `json`：

```
curl -X POST https://api.example.com/data \
  -H 'Content-Type: application/json' \
  -d '{{ json | tojson }}'
```

### 示例 4：带认证的请求

```
curl -X GET https://api.example.com/protected \
  -H 'Authorization: Bearer {{ token }}' \
  -H 'Content-Type: application/json'
```

### 示例 5：文件上传

```
curl -X POST https://api.example.com/upload \
  -F "file=@{{ file_path }}" \
  -F "description={{ description }}"
```

### 示例 6：带查询参数

```
curl -X GET "https://api.example.com/search?q={{ query }}&limit={{ limit }}&offset={{ offset }}"
```

### 示例 7：PUT 请求

```
curl -X PUT https://api.example.com/users/{{ user_id }} \
  -H 'Content-Type: application/json' \
  -d '{"name": "{{ name }}", "email": "{{ email }}"}'
```

### 示例 8：DELETE 请求

```
curl -X DELETE https://api.example.com/users/{{ user_id }} \
  -H 'Authorization: Bearer {{ token }}'
```

## 高级用法

### 使用条件判断

CURL 命令支持 Jinja2 的条件语法：

```
curl -X POST https://api.example.com/data \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "{{ name }}",
    {% if age %}
    "age": {{ age }},
    {% endif %}
    "status": "{{ status }}"
  }'
```

### 使用循环

```
{% for item in json.items %}
curl -X POST https://api.example.com/items \
  -H 'Content-Type: application/json' \
  -d '{"id": {{ item.id }}, "name": "{{ item.name }}"}'
{% endfor %}
```

## 注意事项

- CURL 命令会在临时 Shell 脚本中执行
- 支持所有 CURL 的标准参数和选项
- JSON 参数会自动转换为 JSON 字符串
- 响应内容会自动格式化（如果是 JSON）
- 注意 URL 编码，特殊字符需要使用引号包裹
- 使用 `-v` 参数可以查看详细的请求信息（调试用）
- 使用 `-s` 参数可以静默模式（不显示进度）

## 相关文档

- [运行步骤概述](./README.md) - 了解运行步骤的基本概念
- [Python 脚本](./Python脚本.md) - 如果需要更复杂的 HTTP 请求处理

---

祝您使用愉快！

