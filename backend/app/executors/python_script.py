import subprocess
import tempfile
import os
import json
import sys
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
        
        使用凭证工具类:
        ```python
        def execute(args: dict) -> tuple:
            # 获取凭证ID（从参数中）
            mysql_cred_id = args.get("mysql_credential")
            
            # 使用凭证工具类获取凭证配置
            mysql_config = credential.get_config(mysql_cred_id)
            if mysql_config:
                host = mysql_config.get("host")
                port = mysql_config.get("port")
                user = mysql_config.get("user")
                password = mysql_config.get("password")
                database = mysql_config.get("database")
                # 使用凭证信息连接数据库...
            
            return ("执行完成", None)
        ```
        
        使用 OSS 客户端语法糖:
        ```python
        def execute(args: dict) -> tuple:
            # 获取 OSS 凭证ID（从参数中）
            oss_cred_id = args.get("oss_credential")
            
            # 使用语法糖直接获取 OSS 客户端对象
            bucket = credential.get_oss_client(oss_cred_id)
            
            # 直接使用 bucket 对象进行 OSS 操作
            import oss2
            objects = []
            for obj in oss2.ObjectIterator(bucket, prefix='', max_keys=10):
                objects.append({"key": obj.key, "size": obj.size})
            
            return (f"成功列出 {len(objects)} 个文件", objects)
        ```
        """
        extension = context.get("step_extension", {})
        script = extension.get("script", "")
        
        if not script:
            raise ValueError("脚本内容不能为空")
        
        # 初始化 result 对象（从当前 result 复制，保持已有数据）
        initial_result = result.copy()
        # 确保 logs 字段存在
        if "logs" not in initial_result:
            initial_result["logs"] = ""
        
        # 获取凭证映射
        credentials_map = context.get("credentials_map", {})
        credentials_map_json = json.dumps(
            {str(k): {"id": v.id, "credential_type": v.credential_type, "name": v.name, "config": v.config} 
             for k, v in credentials_map.items()},
            ensure_ascii=False
        )
        
        # 构建完整的脚本代码
        # 1. 导入必要的模块
        # 2. 注入 args 和 initial_result
        # 3. 注入凭证获取工具类
        # 4. 执行用户脚本（定义 execute 函数）
        # 5. 调用 execute 函数并处理返回值
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
            "# 凭证获取工具类",
            "class CredentialHelper:",
            "    \"\"\"凭证获取工具类，用于在Python脚本中方便地获取凭证信息\"\"\"",
            "    ",
            f"    def __init__(self, credentials_map={repr(credentials_map_json)}):",
            "        self._credentials = json.loads(credentials_map) if isinstance(credentials_map, str) else credentials_map",
            "    ",
            "    def get(self, credential_id):",
            "        \"\"\"",
            "        根据凭证ID获取凭证信息",
            "        ",
            "        Args:",
            "            credential_id: 凭证ID（整数或字符串）",
            "        ",
            "        Returns:",
            "            凭证信息字典，包含 id, credential_type, name, config",
            "            如果凭证不存在，返回 None",
            "        \"\"\"",
            "        key = str(credential_id)",
            "        return self._credentials.get(key)",
            "    ",
            "    def get_config(self, credential_id):",
            "        \"\"\"",
            "        根据凭证ID获取凭证配置信息",
            "        ",
            "        Args:",
            "            credential_id: 凭证ID（整数或字符串）",
            "        ",
            "        Returns:",
            "            凭证配置信息字典，如果凭证不存在，返回 None",
            "        \"\"\"",
            "        cred = self.get(credential_id)",
            "        return cred.get('config') if cred else None",
            "    ",
            "    def get_oss_client(self, credential_id):",
            "        \"\"\"",
            "        根据凭证ID获取 OSS 客户端对象（语法糖）",
            "        ",
            "        Args:",
            "            credential_id: OSS 凭证ID（整数或字符串）",
            "        ",
            "        Returns:",
            "            oss2.Bucket 对象，可以直接用于 OSS 操作",
            "            如果凭证不存在或配置不完整，抛出异常",
            "        ",
            "        使用示例:",
            "            bucket = credential.get_oss_client(oss_cred_id)",
            "            for obj in oss2.ObjectIterator(bucket):",
            "                print(obj.key)",
            "        \"\"\"",
            "        cred = self.get(credential_id)",
            "        if not cred:",
            "            raise ValueError(f'未找到凭证ID为 {credential_id} 的凭证')",
            "        ",
            "        if cred.get('credential_type') != 'oss':",
            "            raise ValueError(f'凭证ID {credential_id} 不是 OSS 类型凭证')",
            "        ",
            "        config = cred.get('config')",
            "        if not config:",
            "            raise ValueError(f'凭证ID {credential_id} 的配置信息为空')",
            "        ",
            "        endpoint = config.get('endpoint')",
            "        access_key_id = config.get('access_key_id')",
            "        access_key_secret = config.get('access_key_secret')",
            "        bucket_name = config.get('bucket')",
            "        ",
            "        if not all([endpoint, access_key_id, access_key_secret, bucket_name]):",
            "            raise ValueError(f'OSS 凭证配置不完整，缺少必需的字段: endpoint, access_key_id, access_key_secret, bucket')",
            "        ",
            "        try:",
            "            import oss2",
            "            auth = oss2.Auth(access_key_id, access_key_secret)",
            "            bucket = oss2.Bucket(auth, endpoint, bucket_name)",
            "            return bucket",
            "        except ImportError:",
            "            raise ImportError('未安装 oss2 库，请先安装: pip install oss2')",
            "",
            "# 创建凭证工具类实例",
            "credential = CredentialHelper()",
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
            "    # 保留 initial_result 中的所有字段，特别是 logs",
            "    result = {**initial_result, 'text': error_msg, 'dataset': None}",
            "    # 确保 logs 字段存在（如果 initial_result 中没有，则初始化为空字符串）",
            "    if 'logs' not in result:",
            "        result['logs'] = ''",
            "    print('__RESULT_START__')",
            "    print(json.dumps(result, ensure_ascii=False))",
            "    print('__RESULT_END__')",
            "    sys.exit(1)",
        ]
        
        final_script = "\n".join(script_parts)
        
        # 创建临时脚本文件
        script_path = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, encoding='utf-8') as f:
                f.write(final_script)
                script_path = f.name
            
            # 确保 script_path 是字符串类型
            if not isinstance(script_path, str):
                raise ValueError(f"script_path 必须是字符串类型，但得到了 {type(script_path).__name__}: {script_path}")
            
            # 确保 sys.executable 是字符串类型
            if not isinstance(sys.executable, str):
                raise ValueError(f"sys.executable 必须是字符串类型，但得到了 {type(sys.executable).__name__}: {sys.executable}")
            
            # 执行脚本 - 使用当前 Python 解释器（确保使用 poetry 虚拟环境）
            process = subprocess.run(
                [sys.executable, script_path],
                capture_output=True,
                text=True,
                timeout=context.get("timeout", 300)
            )
            
            output = process.stdout
            error = process.stderr
            
            # 初始化 logs 字段（如果不存在）
            if "logs" not in result:
                result["logs"] = ""
            
            # 解析输出，分离普通输出（日志）和 result JSON
            if output:
                # 查找 result JSON 标记
                result_start_marker = "__RESULT_START__"
                result_end_marker = "__RESULT_END__"
                
                if result_start_marker in output and result_end_marker in output:
                    # 分离普通输出（日志）和 result JSON
                    parts = output.split(result_start_marker)
                    normal_output = parts[0].strip()
                    
                    # 将普通输出（print 输出）作为日志
                    if normal_output:
                        current_logs = result.get("logs", "")
                        result["logs"] = f"{current_logs}\n{normal_output}".strip() if current_logs else normal_output
                    
                    if len(parts) > 1:
                        result_part = parts[1].split(result_end_marker)[0].strip()
                        try:
                            # 解析 result JSON 并更新 result 对象
                            script_result = json.loads(result_part)
                            # 保存当前的 logs（在 update 之前）
                            current_logs = result.get("logs", "")
                            # 如果 script_result 中也有 logs，需要合并
                            script_logs = script_result.get("logs", "")
                            # 更新 result 对象
                            result.update(script_result)
                            # 合并 logs：先保留当前日志，然后添加脚本返回的日志
                            if current_logs and script_logs:
                                result["logs"] = f"{current_logs}\n{script_logs}".strip()
                            elif current_logs:
                                result["logs"] = current_logs
                            elif script_logs:
                                result["logs"] = script_logs
                            else:
                                result["logs"] = result.get("logs", "")
                        except json.JSONDecodeError as e:
                            raise RuntimeError(f"无法解析脚本返回的 result JSON: {str(e)}\n原始输出: {output}\n结果部分: {result_part}")
                else:
                    # 没有找到 result 标记，将全部输出作为日志
                    if output:
                        current_logs = result.get("logs", "")
                        result["logs"] = f"{current_logs}\n{output}".strip() if current_logs else output
            
            # 将错误信息也添加到日志中
            if error:
                current_logs = result.get("logs", "")
                result["logs"] = f"{current_logs}\n[错误]\n{error}".strip() if current_logs else f"[错误]\n{error}"
            
            # 如果脚本执行失败，抛出异常（但保留已解析的 result，包括 logs）
            if process.returncode != 0:
                # 确保错误信息也被添加到日志中（如果还没有的话）
                error_msg = f"脚本执行失败，返回码: {process.returncode}"
                if error:
                    error_msg = f"{error_msg}\n{error}"
                current_logs = result.get("logs", "")
                if error_msg not in current_logs:
                    result["logs"] = f"{current_logs}\n[执行失败] {error_msg}".strip() if current_logs else f"[执行失败] {error_msg}"
                raise RuntimeError(error_msg)
            
        except subprocess.TimeoutExpired:
            logger.error(f"脚本执行超时: script_path={script_path}")
            raise TimeoutError(f"脚本执行超时")
        except Exception as e:
            logger.error(f"脚本执行出错: script_path={script_path}, error={str(e)}", exc_info=True)
            raise RuntimeError(f"脚本执行出错: {str(e)}")
        finally:
            # 清理临时文件
            if script_path and isinstance(script_path, str):
                try:
                    if os.path.exists(script_path):
                        os.unlink(script_path)
                except Exception as cleanup_error:
                    logger.warning(f"清理临时文件失败: script_path={script_path}, error={str(cleanup_error)}")
        
        return context, result

