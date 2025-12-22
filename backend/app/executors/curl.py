import subprocess
import tempfile
import os
import json
import re
from typing import Dict, Any, Tuple
from jinja2 import Template
from app.executors import StepExecutor


class CurlExecutor(StepExecutor):
    """CURL 执行器"""
    
    @staticmethod
    def _fix_data_raw_json(curl_command: str) -> str:
        """
        修复 CURL 命令中 --data-raw 参数里的 JSON 引号问题
        确保 JSON 使用双引号而不是单引号
        
        Args:
            curl_command: 原始 CURL 命令
            
        Returns:
            修复后的 CURL 命令
        """
        # 匹配 --data-raw 参数，支持单引号或双引号包裹，支持多行
        pattern = r"--data-raw\s+['\"](.*?)['\"]"
        
        def replace_json(match):
            json_str = match.group(1)
            quote_char = match.group(0)[match.group(0).index("'") if "'" in match.group(0) else match.group(0).index('"')]
            
            # 先尝试直接解析（可能已经是正确的 JSON）
            try:
                json.loads(json_str)
                return match.group(0)  # 已经是有效的 JSON，不需要修改
            except json.JSONDecodeError:
                pass
            
            # 尝试修复单引号 JSON
            try:
                # 将单引号键名转换为双引号：'key': -> "key":
                fixed_json = re.sub(r"'([^']+)'(\s*:)", r'"\1"\2', json_str)
                # 将字符串值从单引号转换为双引号：: 'value' -> : "value"
                fixed_json = re.sub(r":\s*'([^']*)'", r': "\1"', fixed_json)
                
                # 验证修复后的 JSON 是否有效
                json.loads(fixed_json)
                # 返回修复后的完整参数
                return f"--data-raw {quote_char}{fixed_json}{quote_char}"
            except (json.JSONDecodeError, ValueError, Exception):
                # 如果修复失败，返回原值
                return match.group(0)
        
        # 替换所有匹配的 --data-raw 参数（使用 DOTALL 以支持多行）
        fixed_command = re.sub(pattern, replace_json, curl_command, flags=re.DOTALL)
        return fixed_command
    
    @staticmethod
    def _format_json_if_valid(text: str) -> str:
        """
        如果文本是有效的 JSON，则格式化为可读格式
        
        Args:
            text: 待检查的文本
            
        Returns:
            如果是 JSON，返回格式化后的文本；否则返回原文本
        """
        if not text or not text.strip():
            return text
        
        # 去除首尾空白
        stripped_text = text.strip()
        
        # 尝试解析为 JSON
        try:
            json_obj = json.loads(stripped_text)
            # 格式化 JSON（缩进2个空格，确保中文不被转义）
            formatted_json = json.dumps(json_obj, indent=2, ensure_ascii=False)
            return formatted_json
        except (json.JSONDecodeError, ValueError):
            # 不是有效的 JSON，返回原文本
            return text
    
    def execute(
        self,
        args: Dict[str, Any],
        context: Dict[str, Any],
        result: Dict[str, Any]
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        执行 CURL 命令
        
        extension 配置示例:
        {
            "curl": "curl -X POST https://api.example.com/data -H 'Content-Type: application/json' -d '{\"name\": \"{{ name }}\", \"age\": {{ age }}}'"
        }
        
        使用 jinja2 渲染参数，支持:
        - 普通参数: {{ param_name }}
        - JSON 参数: {{ json.field_name }}
        """
        extension = context.get("step_extension", {})
        curl_template = extension.get("curl", "")
        
        if not curl_template:
            raise ValueError("CURL 命令不能为空")
        
        # 使用 jinja2 渲染 CURL 命令
        try:
            template = Template(curl_template)
            curl_command = template.render(**args)
        except Exception as e:
            raise ValueError(f"渲染 CURL 命令失败: {str(e)}")
        
        # 修复 --data-raw 参数中的 JSON 引号问题
        curl_command = self._fix_data_raw_json(curl_command)
        
        # 将渲染后的 CURL 命令输出到执行日志（logs 字段）
        current_logs = result.get("logs", "")
        log_header = "\n[CURL 命令]\n" + "=" * 80 + "\n"
        log_footer = "\n" + "=" * 80 + "\n"
        rendered_command_log = f"{log_header}{curl_command}{log_footer}"
        result["logs"] = f"{current_logs}{rendered_command_log}" if current_logs else rendered_command_log.strip()
        
        # 创建临时脚本文件来执行 curl 命令
        with tempfile.NamedTemporaryFile(mode='w', suffix='.sh', delete=False) as f:
            f.write("#!/bin/bash\n")
            f.write(curl_command)
            script_path = f.name
        
        try:
            # 添加执行权限
            os.chmod(script_path, 0o755)
            
            # 执行命令
            process = subprocess.run(
                ["/bin/bash", script_path],
                capture_output=True,
                text=True,
                timeout=context.get("timeout", 300)
            )
            
            # 处理输出：运行结果只包含接口返回的纯内容，执行日志包含完整信息
            output = process.stdout
            error = process.stderr
            
            # 运行结果（text）：只包含接口返回的纯内容，不添加任何标签
            # 如果是 JSON 格式，则格式化显示
            if output:
                # 格式化 JSON（如果是有效的 JSON）
                formatted_output = self._format_json_if_valid(output)
                current_text = result.get("text", "")
                result["text"] = f"{current_text}\n{formatted_output}".strip() if current_text else formatted_output
            
            # 执行日志（logs）：包含完整的执行过程信息
            if output:
                current_logs = result.get("logs", "")
                result["logs"] = f"{current_logs}\n[执行输出]\n{output}" if current_logs else f"[执行输出]\n{output}"
            
            if error:
                # 错误信息只记录到执行日志，不添加到运行结果
                current_logs = result.get("logs", "")
                result["logs"] = f"{current_logs}\n[标准输出]\n{error}" if current_logs else f"[标准输出]\n{error}"
            
            # 如果命令执行失败，抛出异常
            if process.returncode != 0:
                raise RuntimeError(f"CURL 命令执行失败，返回码: {process.returncode}\n{error}")
            
        except subprocess.TimeoutExpired:
            raise TimeoutError(f"CURL 命令执行超时")
        except Exception as e:
            raise RuntimeError(f"CURL 命令执行出错: {str(e)}")
        finally:
            # 清理临时文件
            if os.path.exists(script_path):
                os.unlink(script_path)
        
        return context, result

