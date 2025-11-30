from typing import Dict, Any, Tuple
from abc import ABC, abstractmethod


class StepExecutor(ABC):
    """步骤执行器基类"""
    
    @abstractmethod
    def execute(
        self,
        args: Dict[str, Any],
        context: Dict[str, Any],
        result: Dict[str, Any]
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        执行步骤
        
        Args:
            args: 用户输入参数
            context: job 信息、授权信息等上下文
            result: 最终的输出结果，包含 text 和 dataset 字段
            
        Returns:
            Tuple[context, result]: 更新后的上下文和结果
        """
        pass

