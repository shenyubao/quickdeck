import subprocess
import tempfile
import os
import json
from typing import Dict, Any, Tuple
from app.executors import StepExecutor


class PythonScriptExecutor(StepExecutor):
    """Python 脚本执行器"""
    
    def execute(
        self,
        args: Dict[str, Any],
        context: Dict[str, Any],
        result: Dict[str, Any]
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        执行 Python 脚本
        
        extension 配置示例:
        {
            "script": "result = {}\nresult['text'] = 'Hello World'\nprint('执行完成')"
        }
        
        脚本编写规范:
        - 脚本必须显式设置 result = {} 对象（虽然会在执行前自动注入，但建议显式声明）
        - 脚本可以通过 result['key'] = value 的方式设置结果
        - 脚本中的 print() 输出会追加到 result['text'] 中
        - 脚本执行完成后，result 对象会被序列化并返回
        
        使用示例:
        ```python
        # result 和 args 会在执行前自动注入
        result = {}  # 显式声明（可选，但推荐）
        
        # 使用 args 获取输入参数
        name = args.get('name', '')
        age = args.get('age', 0)
        
        # 设置结果
        result['text'] = f'姓名: {name}, 年龄: {age}'
        result['data'] = {'processed': True}
        
        # print 输出也会追加到 result['text']
        print('处理完成')
        ```
        """
        extension = context.get("step_extension", {})
        script = extension.get("script", "")
        
        if not script:
            raise ValueError("脚本内容不能为空")
        
        # 初始化 result 对象（从当前 result 复制，保持已有数据）
        initial_result = result.copy()
        
        # 构建完整的脚本代码
        # 1. 注入 args 和 result
        # 2. 执行用户脚本
        # 3. 在脚本末尾输出 result 的 JSON（使用特殊标记）
        script_parts = [
            "import json",
            "import sys",
            "",
            f"# 注入的变量",
            f"args = {repr(args)}",
            f"result = {repr(initial_result)}",
            "",
            "# 用户脚本开始",
            script,
            "",
            "# 输出 result 对象（使用特殊标记）",
            "print('__RESULT_START__')",
            "print(json.dumps(result, ensure_ascii=False))",
            "print('__RESULT_END__')",
        ]
        
        final_script = "\n".join(script_parts)
        
        # 创建临时脚本文件
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, encoding='utf-8') as f:
            f.write(final_script)
            script_path = f.name
        
        try:
            # 执行脚本
            process = subprocess.run(
                ["python3", script_path],
                capture_output=True,
                text=True,
                timeout=context.get("timeout", 300)
            )
            
            output = process.stdout
            error = process.stderr
            
            # 解析输出，分离普通输出和 result JSON
            if output:
                # 查找 result JSON 标记
                result_start_marker = "__RESULT_START__"
                result_end_marker = "__RESULT_END__"
                
                if result_start_marker in output and result_end_marker in output:
                    # 分离普通输出和 result JSON
                    parts = output.split(result_start_marker)
                    normal_output = parts[0].strip()
                    
                    if len(parts) > 1:
                        result_part = parts[1].split(result_end_marker)[0].strip()
                        try:
                            # 解析 result JSON 并更新 result 对象
                            script_result = json.loads(result_part)
                            result.update(script_result)
                        except json.JSONDecodeError as e:
                            raise RuntimeError(f"无法解析脚本返回的 result JSON: {str(e)}")
                    
                    # 将普通输出追加到 result.text
                    if normal_output:
                        current_text = result.get("text", "")
                        result["text"] = f"{current_text}\n{normal_output}".strip() if current_text else normal_output
                else:
                    # 没有找到 result 标记，将全部输出追加到 result.text
                    current_text = result.get("text", "")
                    result["text"] = f"{current_text}\n{output}".strip() if current_text else output
            
            if error:
                current_text = result.get("text", "")
                result["text"] = f"{current_text}\n[错误]\n{error}".strip() if current_text else f"[错误]\n{error}"
            
            # 如果脚本执行失败，抛出异常
            if process.returncode != 0:
                raise RuntimeError(f"脚本执行失败，返回码: {process.returncode}\n{error}")
            
        except subprocess.TimeoutExpired:
            raise TimeoutError(f"脚本执行超时")
        except Exception as e:
            raise RuntimeError(f"脚本执行出错: {str(e)}")
        finally:
            # 清理临时文件
            if os.path.exists(script_path):
                os.unlink(script_path)
        
        return context, result

