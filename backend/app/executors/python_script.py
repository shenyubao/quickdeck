import subprocess
import tempfile
import os
import json
from typing import Dict, Any, Tuple
from app.executors import StepExecutor
from app.main import logger


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
            "script": "def execute(args: dict) -> tuple:\n    a = args.get('a')\n    b = args.get('b')\n    return (str(int(a) + int(b)), [{'sum': int(a) + int(b)}])"
        }
        
        脚本编写规范:
        - 用户只需要实现一个 execute 函数
        - 必须返回元组: (result: str, dataset: list)
        - result: 字符串类型的结果文本
        - dataset: JSON 数组（list），可选，用于返回结构化数据
        
        使用示例:
        ```python
        def execute(args: dict) -> tuple:
            a = args.get("a")
            b = args.get("b")
            result_text = str(int(a) + int(b))
            dataset = [{"a": a, "b": b, "sum": int(a) + int(b)}]
            return (result_text, dataset)
        ```
        
        只返回 result，dataset 为 None:
        ```python
        def execute(args: dict) -> tuple:
            a = args.get("a")
            b = args.get("b")
            result_text = str(int(a) + int(b))
            return (result_text, None)  # 或 return (result_text, [])
        ```
        """
        extension = context.get("step_extension", {})
        script = extension.get("script", "")
        
        if not script:
            raise ValueError("脚本内容不能为空")
        
        # 初始化 result 对象（从当前 result 复制，保持已有数据）
        initial_result = result.copy()
        
        # 构建完整的脚本代码
        # 1. 导入必要的模块
        # 2. 注入 args 和 initial_result
        # 3. 执行用户脚本（定义 execute 函数）
        # 4. 调用 execute 函数并处理返回值
        initial_result_json = json.dumps(initial_result, ensure_ascii=False)
        args_json = json.dumps(args, ensure_ascii=False)
        
        script_parts = [
            "import json",
            "import sys",
            "",
            "# 注入的参数和初始结果",
            f"args = json.loads({repr(args_json)})",
            f"initial_result = json.loads({repr(initial_result_json)})",
            "",
            "# 用户定义的 execute 函数",
            script,
            "",
            "# 调用 execute 函数并处理返回值",
            "try:",
            "    execute_result = execute(args)",
            "    ",
            "    # 验证返回值必须是元组",
            "    if not isinstance(execute_result, tuple):",
            "        raise TypeError(f'execute 函数必须返回元组 (result: str, dataset: list)，但返回了 {type(execute_result).__name__}')",
            "    ",
            "    # 处理元组返回值 (result: str, dataset: list) 或 (result: str,)",
            "    if len(execute_result) == 0:",
            "        result_text = ''",
            "        result_dataset = None",
            "    elif len(execute_result) == 1:",
            "        result_text = str(execute_result[0])",
            "        result_dataset = None",
            "    else:",
            "        result_text = str(execute_result[0])",
            "        result_dataset = execute_result[1] if execute_result[1] is not None else None",
            "    ",
            "    # 确保 dataset 是列表或 None",
            "    if result_dataset is not None and not isinstance(result_dataset, list):",
            "        raise TypeError(f'dataset 必须是列表类型，但得到了 {type(result_dataset).__name__}')",
            "    ",
            "    # 构建结果字典",
            "    result_dict = {",
            "        'text': result_text,",
            "        'dataset': result_dataset",
            "    }",
            "    ",
            "    # 合并到初始 result",
            "    result = {**initial_result, **result_dict}",
            "    ",
            "    # 输出 result 对象（使用特殊标记）",
            "    print('__RESULT_START__')",
            "    print(json.dumps(result, ensure_ascii=False))",
            "    print('__RESULT_END__')",
            "except Exception as e:",
            "    import traceback",
            "    error_msg = f'执行 execute 函数时出错: {str(e)}\\n{traceback.format_exc()}'",
            "    result = {**initial_result, 'text': error_msg, 'dataset': None}",
            "    print('__RESULT_START__')",
            "    print(json.dumps(result, ensure_ascii=False))",
            "    print('__RESULT_END__')",
            "    sys.exit(1)",
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
                            # 更新 result 对象
                            result.update(script_result)
                            # 如果 result['text'] 为空字符串或不存在，但有普通输出，将普通输出作为 text
                            if (not result.get("text") or result.get("text") == "") and normal_output:
                                result["text"] = normal_output
                        except json.JSONDecodeError as e:
                            raise RuntimeError(f"无法解析脚本返回的 result JSON: {str(e)}\n原始输出: {output}\n结果部分: {result_part}")
                    else:
                        # 如果只有普通输出，将其作为 text
                        if normal_output:
                            result["text"] = normal_output
                    
                    # 将普通输出追加到 result.text（如果 text 已有内容）
                    if normal_output and result.get("text") and normal_output not in result.get("text", ""):
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
            logger.error(f"脚本执行超时: script_path={script_path}")
            raise TimeoutError(f"脚本执行超时")
        except Exception as e:
            logger.error(f"脚本执行出错: script_path={script_path}, error={str(e)}", exc_info=True)
            raise RuntimeError(f"脚本执行出错: {str(e)}")
        finally:
            # 清理临时文件
            if os.path.exists(script_path):
                os.unlink(script_path)
        
        return context, result

