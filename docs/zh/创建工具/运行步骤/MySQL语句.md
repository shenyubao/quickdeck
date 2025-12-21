# MySQL 语句

MySQL 语句步骤用于执行 MySQL 数据库操作。

## 配置方式

1. 选择步骤类型：**MySQL 语句**
2. 选择 MySQL 凭证（必须在项目中预先配置）
3. 在"SQL 语句"输入框中输入 SQL 语句
4. 可以使用参数占位符引用输入参数

## 参数引用

SQL 语句支持使用 Jinja2 模板语法引用参数：

- 普通参数：`{{ 参数名 }}`
- JSON 参数：`{{ json.字段名 }}`
- 使用条件判断：`{% if condition %}...{% endif %}`

## 查询语句

对于 `SELECT`、`SHOW`、`DESCRIBE` 等查询语句：

- 返回格式化的 JSON 结果
- 结果会同时显示在"运行结果"和"数据集"中
- 数据集用于表格展示
- 支持分页查询

## 非查询语句

对于 `INSERT`、`UPDATE`、`DELETE` 等非查询语句：

- 返回影响的行数
- 自动提交事务
- 支持批量操作

## 示例

### 示例 1：查询用户

```
SQL 语句：SELECT * FROM users WHERE username = '{{ username }}'
MySQL 凭证：选择已配置的 MySQL 凭证
```

### 示例 2：插入数据

```
SQL 语句：INSERT INTO users (username, email) VALUES ('{{ username }}', '{{ email }}')
MySQL 凭证：选择已配置的 MySQL 凭证
```

### 示例 3：更新数据

```
SQL 语句：UPDATE users SET email = '{{ email }}' WHERE id = {{ user_id }}
MySQL 凭证：选择已配置的 MySQL 凭证
```

### 示例 4：删除数据

```
SQL 语句：DELETE FROM users WHERE id = {{ user_id }}
MySQL 凭证：选择已配置的 MySQL 凭证
```

### 示例 5：使用 JSON 参数

假设有一个 JSON Schema 类型的参数 `json`：

```
SQL 语句：SELECT * FROM users WHERE id = {{ json.user_id }} AND status = '{{ json.status }}'
MySQL 凭证：选择已配置的 MySQL 凭证
```

### 示例 6：复杂查询

```
SQL 语句：
SELECT 
    u.id,
    u.username,
    COUNT(o.id) as order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at > '{{ start_date }}'
GROUP BY u.id, u.username
ORDER BY order_count DESC
LIMIT {{ limit }}
```

### 示例 7：条件查询

```
SQL 语句：
SELECT * FROM users 
WHERE 1=1
{% if username %}
  AND username = '{{ username }}'
{% endif %}
{% if email %}
  AND email = '{{ email }}'
{% endif %}
{% if status %}
  AND status = '{{ status }}'
{% endif %}
LIMIT {{ limit }}
```

### 示例 8：批量插入

```
SQL 语句：
INSERT INTO users (username, email, created_at) VALUES
{% for user in json.users %}
  ('{{ user.username }}', '{{ user.email }}', NOW()){% if not loop.last %},{% endif %}
{% endfor %}
```

### 示例 9：统计查询

```
SQL 语句：
SELECT 
    DATE(created_at) as date,
    COUNT(*) as count
FROM users
WHERE created_at >= '{{ start_date }}'
  AND created_at <= '{{ end_date }}'
GROUP BY DATE(created_at)
ORDER BY date
```

### 示例 10：子查询

```
SQL 语句：
SELECT 
    u.*,
    (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) as order_count
FROM users u
WHERE u.id = {{ user_id }}
```

## 安全注意事项

### SQL 注入防护

虽然系统使用 Jinja2 模板渲染，但仍需注意 SQL 注入风险：

1. **参数验证**：在 SQL 语句中使用参数前，确保参数值经过验证
2. **使用引号**：字符串参数必须使用引号包裹：`'{{ username }}'`
3. **数字类型**：数字参数不需要引号：`{{ user_id }}`
4. **避免拼接**：避免直接拼接用户输入到 SQL 语句中

### 正确的做法

```sql
-- ✅ 正确：使用引号包裹字符串
SELECT * FROM users WHERE username = '{{ username }}'

-- ✅ 正确：数字不需要引号
SELECT * FROM users WHERE id = {{ user_id }}

-- ❌ 错误：字符串没有引号
SELECT * FROM users WHERE username = {{ username }}

-- ❌ 错误：直接拼接
SELECT * FROM users WHERE username = '{{ username }}' OR '1'='1'
```

## 性能优化

1. **使用索引**：确保查询字段有适当的索引
2. **限制结果集**：使用 `LIMIT` 限制返回的行数
3. **避免全表扫描**：使用 `WHERE` 条件过滤数据
4. **合理使用 JOIN**：避免不必要的 JOIN 操作

## 注意事项

- 必须预先在项目中配置 MySQL 凭证
- SQL 语句会使用 Jinja2 模板渲染，注意 SQL 注入风险
- 查询结果会自动格式化为 JSON
- 非查询语句会自动提交事务
- 建议使用参数化查询避免 SQL 注入
- 注意 SQL 语句的大小写（MySQL 通常不区分，但建议保持一致）
- 使用 `EXPLAIN` 可以分析查询性能

## 相关文档

- [运行步骤概述](./README.md) - 了解运行步骤的基本概念
- [Python 脚本](./Python脚本.md) - 如果需要更复杂的数据库操作逻辑

---

祝您使用愉快！

