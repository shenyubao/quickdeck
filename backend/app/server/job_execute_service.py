from typing import Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session
from app.models import Job, Workflow, JobExecution, ExecutionTypeEnum, ExecutionStatusEnum, Credential
from app.executors.factory import ExecutorFactory
from app.main import logger


class JobExecuteService:
    """任务执行服务"""
    
    @staticmethod
    def execute_job(
        job: Job,
        workflow: Workflow,
        args: Dict[str, Any],
        user_id: int,
        db: Optional[Session] = None,
        execution_type: ExecutionTypeEnum = ExecutionTypeEnum.MANUAL
    ) -> Dict[str, Any]:
        """
        执行任务
        
        Args:
            job: 任务对象
            workflow: 工作流对象
            args: 用户输入参数
            user_id: 用户ID
            db: 数据库会话（用于记录执行记录）
            execution_type: 执行方式（手动/定时任务）
            
        Returns:
            包含 output, result, error 的字典
        """
        # 加载凭证信息（如果参数中包含凭证ID）
        credentials_map = {}
        if args:
            # 获取所有凭证ID（从args中查找）
            credential_ids = []
            for key, value in args.items():
                if isinstance(value, (int, str)) and str(value).isdigit():
                    # 检查是否是凭证ID（需要根据工作流的选项来判断）
                    for option in workflow.options:
                        if option.name == key and option.option_type == "credential":
                            credential_ids.append(int(value))
            
            # 批量加载凭证
            if credential_ids:
                credentials = db.query(Credential).filter(
                    Credential.id.in_(credential_ids),
                    Credential.project_id == job.project_id
                ).all() if db else []
                credentials_map = {cred.id: cred for cred in credentials}
        
        # 初始化上下文和结果
        context = {
            "job_id": job.id,
            "job_name": job.name,
            "user_id": user_id,
            "timeout": workflow.timeout,
            "retry": workflow.retry,
            "project_id": job.project_id,
            "credentials_map": credentials_map,  # 凭证映射
        }
        
        result = {
            "text": "",
            "dataset": None,
            "logs": "",
        }
        
        # 按顺序执行步骤
        steps = sorted(workflow.steps, key=lambda s: s.order)
        
        try:
            for step in steps:
                # 更新上下文中的步骤信息
                context["step_extension"] = step.extension or {}
                context["step_type"] = step.step_type.value
                
                # 获取执行器
                executor = ExecutorFactory.get_executor(step.step_type.value)
                
                # 执行步骤
                context, result = executor.execute(
                    args=args or {},
                    context=context,
                    result=result
                )
            
            # 自动判断输出类型：如果 dataset 存在且不为空，使用表格格式，否则使用文本格式
            dataset = result.get("dataset")
            if dataset is not None and dataset != "":
                # 从 dataset 生成表格 HTML
                html = JobExecuteService._generate_table_html(dataset)
            else:
                # 从 text 生成 HTML
                text = result.get("text", "")
                html = JobExecuteService._generate_text_html(text)
            
            # 记录执行记录（成功）
            if db:
                output_text = result.get("text", "")
                # 确保使用枚举的值（字符串）而不是枚举对象
                execution = JobExecution(
                    job_id=job.id,
                    user_id=user_id,
                    execution_type=execution_type.value,
                    status=ExecutionStatusEnum.SUCCESS.value,
                    args=args or {},
                    output_text=output_text,
                    error_message=None
                )
                db.add(execution)
                db.commit()
            
            return {
                "output": html,
                "result": result,
            }
            
        except Exception as e:
            error_message = str(e)
            logger.error(f"任务执行失败: job_id={job.id}, error={error_message}", exc_info=True)
            
            html = JobExecuteService._generate_error_html(error_message)
            
            # 记录执行记录（失败）
            if db:
                output_text = result.get("text", "")
                # 确保使用枚举的值（字符串）而不是枚举对象
                execution = JobExecution(
                    job_id=job.id,
                    user_id=user_id,
                    execution_type=execution_type.value,
                    status=ExecutionStatusEnum.FAILURE.value,
                    args=args or {},
                    output_text=output_text,
                    error_message=error_message
                )
                db.add(execution)
                db.commit()
            
            return {
                "output": html,
                "error": error_message,
                "result": result,
            }
    
    @staticmethod
    def _generate_text_html(text: str) -> str:
        """从文本生成 HTML"""
        # 转义 HTML 特殊字符
        import html
        escaped_text = html.escape(text)
        # 将换行符转换为 <br>
        html_text = escaped_text.replace("\n", "<br>")
        return f"<div>{html_text}</div>"
    
    @staticmethod
    def _generate_table_html(dataset: Any) -> str:
        """从数据集生成表格 HTML"""
        import html
        import json
        
        if not dataset:
            return "<div>无数据</div>"
        
        # 如果 dataset 是字符串，尝试解析为 JSON
        if isinstance(dataset, str):
            try:
                dataset = json.loads(dataset)
            except:
                return f"<div>{html.escape(dataset)}</div>"
        
        # 如果是列表
        if isinstance(dataset, list):
            if not dataset:
                return "<div>无数据</div>"
            
            # 获取表头（从第一个对象获取键）
            if isinstance(dataset[0], dict):
                headers = list(dataset[0].keys())
            else:
                # 如果是简单列表，使用索引作为表头
                headers = ["值"]
                dataset = [{"值": item} for item in dataset]
            
            # 生成表格 HTML
            html_parts = ["<table border='1' style='border-collapse: collapse; width: 100%;'>"]
            
            # 表头
            html_parts.append("<thead><tr>")
            for header in headers:
                html_parts.append(f"<th style='padding: 8px; text-align: left;'>{html.escape(str(header))}</th>")
            html_parts.append("</tr></thead>")
            
            # 表体
            html_parts.append("<tbody>")
            for row in dataset:
                html_parts.append("<tr>")
                if isinstance(row, dict):
                    for header in headers:
                        value = row.get(header, "")
                        html_parts.append(f"<td style='padding: 8px;'>{html.escape(str(value))}</td>")
                else:
                    html_parts.append(f"<td style='padding: 8px;'>{html.escape(str(row))}</td>")
                html_parts.append("</tr>")
            html_parts.append("</tbody>")
            
            html_parts.append("</table>")
            return "".join(html_parts)
        
        # 如果是字典，转换为表格
        if isinstance(dataset, dict):
            html_parts = ["<table border='1' style='border-collapse: collapse; width: 100%;'>"]
            html_parts.append("<thead><tr><th style='padding: 8px; text-align: left;'>键</th><th style='padding: 8px; text-align: left;'>值</th></tr></thead>")
            html_parts.append("<tbody>")
            for key, value in dataset.items():
                html_parts.append("<tr>")
                html_parts.append(f"<td style='padding: 8px;'>{html.escape(str(key))}</td>")
                html_parts.append(f"<td style='padding: 8px;'>{html.escape(str(value))}</td>")
                html_parts.append("</tr>")
            html_parts.append("</tbody>")
            html_parts.append("</table>")
            return "".join(html_parts)
        
        # 其他类型，直接显示
        return f"<div>{html.escape(str(dataset))}</div>"
    
    @staticmethod
    def _generate_error_html(error_message: str) -> str:
        """生成错误 HTML"""
        import html
        escaped_message = html.escape(error_message)
        html_message = escaped_message.replace("\n", "<br>")
        return f"<div style='color: red;'>{html_message}</div>"

