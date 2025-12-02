from typing import Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session
from app.models import Job, Workflow, JobExecution, ExecutionTypeEnum, ExecutionStatusEnum, Credential
from app.executors.factory import ExecutorFactory
from app.main import logger
import os
import shutil
import json


class JobExecuteService:
    """工具执行服务"""
    
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
        执行工具
        
        Args:
            job: 工具对象
            workflow: 工作流对象
            args: 用户输入参数
            user_id: 用户ID
            db: 数据库会话（用于记录执行记录）
            execution_type: 执行方式（手动/定时工具）
            
        Returns:
            包含 output, result, error 的字典
        """
        # 处理文件参数：将文件对象转换为本地文件路径
        temp_files = []  # 记录临时文件，执行完成后清理
        processed_args = args.copy() if args else {}
        
        if args:
            # 识别文件类型的参数
            file_options = {opt.name: opt for opt in workflow.options if opt.option_type == "file"}
            
            for key, value in args.items():
                if key in file_options:
                    # 这是文件类型的参数
                    logger.info(f"处理文件参数 {key}，类型: {type(value).__name__}, 值: {value}")
                    
                    if isinstance(value, str):
                        # 如果已经是字符串路径，直接使用（可能是前端上传后返回的路径）
                        if os.path.exists(value):
                            processed_args[key] = value
                            logger.info(f"文件参数 {key} 使用已有路径: {value}")
                        else:
                            raise ValueError(f"文件参数 '{key}' 的路径不存在: {value}")
                    elif isinstance(value, dict):
                        # 如果是文件对象，尝试保存到临时文件
                        try:
                            file_path = JobExecuteService._save_file_to_temp(value, key)
                            if file_path:
                                processed_args[key] = file_path
                                temp_files.append(file_path)
                                logger.info(f"文件参数 {key} 已保存到临时路径: {file_path}")
                            else:
                                # 无法处理文件，抛出明确错误
                                error_msg = f"无法处理文件参数 '{key}'：文件上传失败或文件对象格式不正确"
                                logger.error(error_msg)
                                raise ValueError(error_msg)
                        except ValueError:
                            # 重新抛出 ValueError（文件处理失败）
                            raise
                        except Exception as e:
                            logger.error(f"处理文件参数 {key} 时出错: {str(e)}", exc_info=True)
                            raise ValueError(f"处理文件参数 '{key}' 时出错: {str(e)}")
                    else:
                        raise ValueError(f"文件参数 '{key}' 必须是字符串路径或文件对象，但得到了 {type(value).__name__}")
        
        # 加载凭证信息（如果参数中包含凭证ID）
        credentials_map = {}
        if processed_args:
            # 获取所有凭证ID（从args中查找）
            credential_ids = []
            for key, value in processed_args.items():
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
                
                # 执行步骤（使用处理后的参数，文件路径已替换）
                context, result = executor.execute(
                    args=processed_args or {},
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
            logger.error(f"工具执行失败: job_id={job.id}, error={error_message}", exc_info=True)
            
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
        finally:
            # 清理临时文件
            for temp_file in temp_files:
                try:
                    if os.path.exists(temp_file):
                        if os.path.isdir(temp_file):
                            shutil.rmtree(temp_file)
                        else:
                            os.unlink(temp_file)
                        logger.info(f"已清理临时文件: {temp_file}")
                except Exception as e:
                    logger.warning(f"清理临时文件失败: {temp_file}, error: {str(e)}")
    
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
    
    @staticmethod
    def _save_file_to_temp(file_obj: Dict[str, Any], param_name: str) -> Optional[str]:
        """
        从上传的文件对象中提取文件路径
        
        Args:
            file_obj: 文件对象（Ant Design Upload 格式，应包含 response.path）
            param_name: 参数名称（用于日志）
            
        Returns:
            文件路径
        """
        try:
            # 方案1: 从 fileList 数组中提取（Upload 组件的标准格式）
            file_list = file_obj.get("fileList")
            if file_list and isinstance(file_list, list) and len(file_list) > 0:
                first_file = file_list[0]
                if isinstance(first_file, dict):
                    # 从上传响应中获取路径
                    response = first_file.get("response")
                    if isinstance(response, dict):
                        file_path = response.get("path")
                        if file_path and os.path.exists(file_path):
                            logger.info(f"从 fileList[0].response.path 获取文件路径: {file_path}")
                            return file_path
            
            # 方案2: 从 file 字段中提取
            file_field = file_obj.get("file")
            if isinstance(file_field, dict):
                response = file_field.get("response")
                if isinstance(response, dict):
                    file_path = response.get("path")
                    if file_path and os.path.exists(file_path):
                        logger.info(f"从 file.response.path 获取文件路径: {file_path}")
                        return file_path
            
            # 方案3: 直接从 response 字段提取
            response = file_obj.get("response")
            if isinstance(response, dict):
                file_path = response.get("path")
                if file_path and os.path.exists(file_path):
                    logger.info(f"从 response.path 获取文件路径: {file_path}")
                    return file_path
            
            # 如果以上方案都失败，抛出错误
            file_name = file_obj.get("name", "未知文件")
            logger.error(f"无法从文件对象中提取文件路径。文件对象: {json.dumps(file_obj, indent=2, ensure_ascii=False)}")
            
            raise ValueError(
                f"无法处理文件 '{file_name}'。"
                f"请确保文件已通过 Upload 组件成功上传到服务器（action='/api/upload'）。"
                f"如果问题仍然存在，请检查上传接口是否正常工作。"
            )
            
        except ValueError:
            raise
        except Exception as e:
            logger.error(f"处理文件参数时出错: {str(e)}", exc_info=True)
            raise ValueError(f"处理文件时出错: {str(e)}")

