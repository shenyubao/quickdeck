import subprocess
import tempfile
import os
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
            "script": "print('Hello World')"
        }
        
        args 使用示例:
        - args 是用户输入参数的字典，传递给 execute 方法
        - 例如用户输入: {"name": "张三", "age": 25, "city": "北京"}
        - 在脚本中使用 args 的方式:
          
          方式1: 通过环境变量传递（推荐）
          ```python
          import os
          import json
          
          # 从环境变量获取 args JSON 字符串
          args_json = os.environ.get('SCRIPT_ARGS', '{}')
          args = json.loads(args_json)
          
          name = args.get('name', '')
          age = args.get('age', 0)
          city = args.get('city', '')
          print(f"姓名: {name}, 年龄: {age}, 城市: {city}")
          ```
          
          方式2: 在脚本中直接使用 JSON 字符串（适用于固定参数）
          ```python
          import json
          
          # 在脚本中定义 args（实际使用时会被动态替换）
          args = {"name": "张三", "age": 25, "city": "北京"}
          
          # 或者从 JSON 字符串解析
          args_str = '{"name": "张三", "age": 25, "city": "北京"}'
          args = json.loads(args_str)
          
          print(f"姓名: {args['name']}, 年龄: {args['age']}")
          ```
          
          方式3: 通过修改脚本内容注入 args（需要在执行前处理）
          ```python
          # 脚本内容会在执行前被处理，args 会被注入
          # 例如: args = {"name": "张三", "age": 25}
          name = args.get('name', '')
          age = args.get('age', 0)
          print(f"姓名: {name}, 年龄: {age}")
          ```
        """
        extension = context.get("step_extension", {})
        script = extension.get("script", "")
        
        if not script:
            raise ValueError("脚本内容不能为空")
        
        # 创建临时脚本文件
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(script)
            script_path = f.name
        
        try:
            # 执行脚本
            process = subprocess.run(
                ["python3", script_path],
                capture_output=True,
                text=True,
                timeout=context.get("timeout", 300)
            )
            
            # 将输出追加到 result.text
            output = process.stdout
            error = process.stderr
            
            if output:
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

