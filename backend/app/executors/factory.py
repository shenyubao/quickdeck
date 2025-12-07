from typing import Dict, Any
from app.executors import StepExecutor
from app.executors.command import CommandExecutor
from app.executors.shell_script import ShellScriptExecutor
from app.executors.python_script import PythonScriptExecutor
from app.models import StepTypeEnum


class ExecutorFactory:
    """执行器工厂"""
    
    _executors: Dict[str, StepExecutor] = {
        StepTypeEnum.COMMAND.value: CommandExecutor(),
        StepTypeEnum.SHELL_SCRIPT.value: ShellScriptExecutor(),
        StepTypeEnum.PYTHON_SCRIPT.value: PythonScriptExecutor(),
    }
    
    @classmethod
    def get_executor(cls, step_type: str) -> StepExecutor:
        """根据步骤类型获取执行器"""
        # 将 step_type 转换为小写，确保兼容性（数据库可能存储为大写）
        step_type_lower = step_type.lower() if step_type else step_type
        executor = cls._executors.get(step_type_lower)
        if not executor:
            raise ValueError(f"不支持的步骤类型: {step_type}")
        return executor

