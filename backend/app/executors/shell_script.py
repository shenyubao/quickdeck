import subprocess
import tempfile
import os
from typing import Dict, Any, Tuple
from app.executors import StepExecutor


class ShellScriptExecutor(StepExecutor):
    """Shell 脚本执行器"""
    
    def execute(
        self,
        args: Dict[str, Any],
        context: Dict[str, Any],
        result: Dict[str, Any]
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        执行 Shell 脚本
        
        extension 配置示例:
        {
            "script": "#!/bin/bash\necho 'Hello World'"
        }
        """
        extension = context.get("step_extension", {})
        script = extension.get("script", "")
        
        if not script:
            raise ValueError("脚本内容不能为空")
        
        # 创建临时脚本文件
        with tempfile.NamedTemporaryFile(mode='w', suffix='.sh', delete=False) as f:
            f.write(script)
            script_path = f.name
        
        try:
            # 添加执行权限
            os.chmod(script_path, 0o755)
            
            # 执行脚本
            process = subprocess.run(
                ["/bin/bash", script_path],
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

