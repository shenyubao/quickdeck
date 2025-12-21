# Python 脚本

Python 脚本步骤用于执行 Python 代码，支持复杂的业务逻辑。

## 配置方式

1. 选择步骤类型：**Python 脚本**
2. 在代码编辑器中输入 Python 代码
3. 必须实现 `execute` 函数

## 函数签名

Python 脚本必须实现一个 `execute` 函数，函数签名如下：

```python
def execute(args: dict) -> tuple:
    """
    执行函数
    
    Args:
        args: 输入参数字典，包含所有输入参数的值
    
    Returns:
        tuple: (result_text: str, dataset: list)
        - result_text: 结果文本（字符串）
        - dataset: 数据集（列表，可选），用于返回结构化数据
    """
    # 您的代码
    return (result_text, dataset)
```

## 返回值

`execute` 函数必须返回一个元组：

- **第一个元素**（必填）：结果文本（字符串类型）
- **第二个元素**（可选）：数据集（列表类型），用于返回结构化数据

如果不需要返回数据集，可以返回 `None` 或空列表：

```python
return (result_text, None)  # 或
return (result_text, [])
```

## 参数获取

从 `args` 字典中获取输入参数：

```python
def execute(args: dict) -> tuple:
    name = args.get("name")  # 获取参数 "name"
    age = args.get("age", 0)  # 获取参数 "age"，如果不存在则使用默认值 0
    # ...
```

## 使用凭证

Python 脚本支持使用凭证工具类来获取凭证信息。

### 获取凭证配置

```python
def execute(args: dict) -> tuple:
    # 获取凭证ID（从参数中）
    mysql_cred_id = args.get("mysql_credential")
    
    # 使用凭证工具类获取凭证配置
    mysql_config = credential.get_config(mysql_cred_id)
    if mysql_config:
        host = mysql_config.get("host")
        port = mysql_config.get("port")
        user = mysql_config.get("user")
        password = mysql_config.get("password")
        database = mysql_config.get("database")
        # 使用凭证信息连接数据库...
    
    return ("执行完成", None)
```

### 使用 OSS 客户端（语法糖）

```python
def execute(args: dict) -> tuple:
    # 获取 OSS 凭证ID（从参数中）
    oss_cred_id = args.get("oss_credential")
    
    # 使用语法糖直接获取 OSS 客户端对象
    bucket = credential.get_oss_client(oss_cred_id)
    
    # 直接使用 bucket 对象进行 OSS 操作
    import oss2
    objects = []
    for obj in oss2.ObjectIterator(bucket, prefix='', max_keys=10):
        objects.append({"key": obj.key, "size": obj.size})
    
    return (f"成功列出 {len(objects)} 个文件", objects)
```

## 示例

### 示例 1：简单计算

```python
def execute(args: dict) -> tuple:
    a = int(args.get("a", 0))
    b = int(args.get("b", 0))
    result = a + b
    return (f"{a} + {b} = {result}", [{"a": a, "b": b, "sum": result}])
```

### 示例 2：数据处理

```python
def execute(args: dict) -> tuple:
    data = args.get("data", "")
    lines = data.split("\n")
    result = []
    for i, line in enumerate(lines, 1):
        result.append({"line": i, "content": line.strip()})
    return (f"处理了 {len(result)} 行数据", result)
```

### 示例 3：使用 MySQL 凭证

```python
def execute(args: dict) -> tuple:
    import pymysql
    
    # 获取 MySQL 凭证
    mysql_cred_id = args.get("mysql_credential")
    mysql_config = credential.get_config(mysql_cred_id)
    
    if not mysql_config:
        return ("错误：未找到 MySQL 凭证", None)
    
    # 连接数据库
    conn = pymysql.connect(
        host=mysql_config.get("host"),
        port=mysql_config.get("port", 3306),
        user=mysql_config.get("user"),
        password=mysql_config.get("password"),
        database=mysql_config.get("database")
    )
    
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM users")
            count = cursor.fetchone()[0]
        return (f"用户总数: {count}", [{"count": count}])
    finally:
        conn.close()
```

### 示例 4：使用 OSS 凭证

```python
def execute(args: dict) -> tuple:
    import oss2
    
    # 获取 OSS 凭证
    oss_cred_id = args.get("oss_credential")
    bucket = credential.get_oss_client(oss_cred_id)
    
    # 列出对象
    objects = []
    for obj in oss2.ObjectIterator(bucket, prefix='', max_keys=100):
        objects.append({
            "key": obj.key,
            "size": obj.size,
            "last_modified": obj.last_modified.isoformat() if obj.last_modified else None
        })
    
    return (f"成功列出 {len(objects)} 个对象", objects)
```

### 示例 5：复杂数据处理

```python
def execute(args: dict) -> tuple:
    import json
    
    # 获取 JSON 参数
    json_data = args.get("json", {})
    user_id = json_data.get("user_id")
    filters = json_data.get("filters", {})
    
    # 处理数据
    result = []
    # ... 数据处理逻辑 ...
    
    return (f"处理完成，共 {len(result)} 条记录", result)
```

## 注意事项

- 必须实现 `execute` 函数
- 返回值必须是元组 `(result_text, dataset)`
- `dataset` 必须是列表类型或 `None`
- 可以使用标准 Python 库和已安装的第三方库
- 脚本中的 `print` 输出会记录到执行日志中
- 异常会被捕获并记录到日志中
- 确保使用的第三方库已安装在系统中

## 相关文档

- [运行步骤概述](./README.md) - 了解运行步骤的基本概念
- [MySQL 语句](./MySQL语句.md) - 如果需要执行数据库操作

---

祝您使用愉快！

