import subprocess
from typing import Dict, Any, Tuple
from app.executors import StepExecutor


class CommandExecutor(StepExecutor):
    """命令执行器"""
    
    def execute(
        self,
        args: Dict[str, Any],
        context: Dict[str, Any],
        result: Dict[str, Any]
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        执行命令
        
        extension 配置示例:
        {
            "command": "echo hello"
        }
        """
        extension = context.get("step_extension", {})
        command = extension.get("command", "")
        
        if not command:
            raise ValueError("命令不能为空")
        
        # 执行命令
        try:
            process = subprocess.run(
                command,
                shell=True,
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
            
            # 如果命令执行失败，抛出异常
            if process.returncode != 0:
                raise RuntimeError(f"命令执行失败，返回码: {process.returncode}\n{error}")
            
        except subprocess.TimeoutExpired:
            raise TimeoutError(f"命令执行超时: {command}")
        except Exception as e:
            raise RuntimeError(f"命令执行出错: {str(e)}")
        
        return context, result

