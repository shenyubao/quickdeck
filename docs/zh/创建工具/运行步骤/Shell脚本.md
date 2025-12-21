# Shell 脚本

Shell 脚本步骤用于执行完整的 Shell 脚本。

## 配置方式

1. 选择步骤类型：**Shell 脚本**
2. 在"脚本内容"文本框中输入 Shell 脚本代码
3. 脚本必须以 `#!/bin/bash` 开头（可选，系统会自动添加）

## 参数引用

在脚本中可以使用 `{{ 参数名 }}` 引用输入参数，例如：

```bash
#!/bin/bash
name="{{ name }}"
echo "Hello, $name!"
```

## 示例

### 示例 1：简单脚本

```bash
#!/bin/bash
echo "开始执行脚本"
date
echo "脚本执行完成"
```

### 示例 2：使用参数

假设有输入参数 `file_path`（文本类型）：

```bash
#!/bin/bash
file_path="{{ file_path }}"
if [ -f "$file_path" ]; then
    echo "文件存在: $file_path"
    cat "$file_path"
else
    echo "文件不存在: $file_path"
    exit 1
fi
```

### 示例 3：循环处理

```bash
#!/bin/bash
for i in {1..5}; do
    echo "循环 $i"
    sleep 1
done
```

### 示例 4：文件批量处理

```bash
#!/bin/bash
directory="{{ directory }}"
pattern="{{ pattern }}"

if [ ! -d "$directory" ]; then
    echo "目录不存在: $directory"
    exit 1
fi

count=0
for file in "$directory"/*$pattern*; do
    if [ -f "$file" ]; then
        echo "处理文件: $file"
        # 处理文件逻辑
        ((count++))
    fi
done

echo "共处理 $count 个文件"
```

### 示例 5：错误处理

```bash
#!/bin/bash
set -e  # 遇到错误立即退出

file_path="{{ file_path }}"

# 检查文件是否存在
if [ ! -f "$file_path" ]; then
    echo "错误: 文件不存在: $file_path"
    exit 1
fi

# 执行操作
echo "处理文件: $file_path"
# ... 处理逻辑 ...

echo "处理完成"
```

## 注意事项

- 脚本会在 `/bin/bash` 中执行
- 脚本中的相对路径是相对于执行环境的
- 注意脚本的换行符（建议使用 Unix 格式）
- 脚本执行失败会返回非零退出码
- 使用 `set -e` 可以让脚本在遇到错误时立即退出
- 使用 `set -u` 可以让脚本在遇到未定义变量时立即退出

## 相关文档

- [运行步骤概述](./README.md) - 了解运行步骤的基本概念
- [Bash 命令](./Bash命令.md) - 如果只需要执行简单命令

---

祝您使用愉快！

