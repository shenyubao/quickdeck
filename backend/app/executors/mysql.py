import json
from typing import Dict, Any, Tuple, Optional
from urllib.parse import quote_plus
from jinja2 import Template
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from app.executors import StepExecutor


class MysqlExecutor(StepExecutor):
    """MySQL 执行器"""
    
    @staticmethod
    def _get_mysql_connection(credential_config: Dict[str, Any]) -> Engine:
        """
        根据凭证配置创建 MySQL 连接
        
        Args:
            credential_config: 凭证配置字典，应包含 host, port, user, password, database
            
        Returns:
            SQLAlchemy Engine 对象
        """
        host = credential_config.get("host")
        port = credential_config.get("port", 3306)
        user = credential_config.get("user")
        password = credential_config.get("password")
        database = credential_config.get("database")
        
        if not all([host, user, password, database]):
            raise ValueError("MySQL 凭证配置不完整，需要 host, user, password, database")
        
        # 构建 MySQL 连接 URL
        # 格式: mysql+pymysql://user:password@host:port/database
        # 使用 quote_plus 对用户名和密码进行 URL 编码，以处理特殊字符（如 @、: 等）
        encoded_user = quote_plus(str(user))
        encoded_password = quote_plus(str(password))
        encoded_host = quote_plus(str(host))
        encoded_database = quote_plus(str(database))
        database_url = f"mysql+pymysql://{encoded_user}:{encoded_password}@{encoded_host}:{port}/{encoded_database}"
        
        # 创建引擎（不连接池，每次执行时创建新连接）
        engine = create_engine(
            database_url,
            pool_pre_ping=True,  # 连接前检查连接是否有效
            echo=False  # 不打印 SQL 语句
        )
        
        return engine
    
    @staticmethod
    def _format_result_as_json(rows: list, columns: list) -> str:
        """
        将查询结果格式化为 JSON 字符串
        
        Args:
            rows: 查询结果行列表
            columns: 列名列表
            
        Returns:
            格式化的 JSON 字符串
        """
        if not rows:
            return json.dumps([], indent=2, ensure_ascii=False)
        
        # 将每行转换为字典
        result = []
        for row in rows:
            row_dict = {}
            # SQLAlchemy 2.0 返回 Row 对象，支持字典式访问
            if hasattr(row, '_mapping'):
                # SQLAlchemy 2.0 Row 对象
                row_dict = dict(row._mapping)
            elif hasattr(row, 'keys'):
                # 字典式访问
                row_dict = {col: row[col] for col in columns}
            elif isinstance(row, (list, tuple)):
                # 列表/元组式访问
                row_dict = {col: row[i] for i, col in enumerate(columns)}
            else:
                # 其他情况，尝试直接转换
                row_dict = dict(row) if hasattr(row, '__iter__') else {}
            
            # 处理特殊类型（如 datetime, decimal 等）
            for key, value in row_dict.items():
                if hasattr(value, 'isoformat'):  # datetime 类型
                    row_dict[key] = value.isoformat()
                elif hasattr(value, '__float__') and not isinstance(value, (int, float)):
                    try:
                        row_dict[key] = float(value)
                    except (ValueError, TypeError):
                        pass
            
            result.append(row_dict)
        
        return json.dumps(result, indent=2, ensure_ascii=False)
    
    def execute(
        self,
        args: Dict[str, Any],
        context: Dict[str, Any],
        result: Dict[str, Any]
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        执行 MySQL 语句
        
        extension 配置示例:
        {
            "sql": "SELECT * FROM users WHERE name = '{{ name }}' AND age > {{ age }}",
            "credential_id": 1
        }
        
        使用 jinja2 渲染参数，支持:
        - 普通参数: {{ param_name }}
        - JSON 参数: {{ json.field_name }}
        """
        extension = context.get("step_extension", {})
        sql_template = extension.get("sql", "")
        credential_id = extension.get("credential_id")
        
        if not sql_template:
            raise ValueError("SQL 语句不能为空")
        
        if not credential_id:
            raise ValueError("MySQL 凭证ID不能为空")
        
        # 从上下文获取凭证信息
        credentials_map = context.get("credentials_map", {})
        credential = credentials_map.get(int(credential_id))
        
        if not credential:
            raise ValueError(f"未找到凭证ID为 {credential_id} 的凭证")
        
        if credential.credential_type != "mysql":
            raise ValueError(f"凭证ID {credential_id} 不是 MySQL 类型凭证")
        
        credential_config = credential.config
        if not credential_config:
            raise ValueError(f"凭证ID {credential_id} 的配置信息为空")
        
        # 使用 jinja2 渲染 SQL 语句
        try:
            template = Template(sql_template)
            sql = template.render(**args)
        except Exception as e:
            raise ValueError(f"渲染 SQL 语句失败: {str(e)}")
        
        # 将渲染后的 SQL 语句输出到执行日志
        current_logs = result.get("logs", "")
        log_header = "\n[MySQL SQL 语句]\n" + "=" * 80 + "\n"
        log_footer = "\n" + "=" * 80 + "\n"
        rendered_sql_log = f"{log_header}{sql}{log_footer}"
        result["logs"] = f"{current_logs}{rendered_sql_log}" if current_logs else rendered_sql_log.strip()
        
        # 创建 MySQL 连接
        engine = None
        try:
            engine = self._get_mysql_connection(credential_config)
            
            # 执行 SQL 语句
            with engine.connect() as conn:
                # 使用 text() 包装 SQL 语句以支持参数化查询
                sql_statement = text(sql)
                
                # 判断 SQL 类型（简单判断，不完美但够用）
                sql_upper = sql.strip().upper()
                is_query = sql_upper.startswith("SELECT") or sql_upper.startswith("SHOW") or sql_upper.startswith("DESCRIBE") or sql_upper.startswith("DESC")
                
                if is_query:
                    # 查询语句：返回结果集
                    result_set = conn.execute(sql_statement)
                    rows = result_set.fetchall()
                    # 获取列名（SQLAlchemy 2.0 兼容方式）
                    if rows:
                        # 从第一行获取列名
                        columns = list(rows[0]._mapping.keys()) if hasattr(rows[0], '_mapping') else list(rows[0].keys())
                    else:
                        # 如果没有行，尝试从 result_set 获取列名
                        columns = list(result_set.keys()) if hasattr(result_set, 'keys') else []
                    
                    # 格式化结果为 JSON
                    formatted_result = self._format_result_as_json(rows, columns)
                    
                    # 运行结果（text）：格式化的查询结果
                    current_text = result.get("text", "")
                    result["text"] = f"{current_text}\n{formatted_result}".strip() if current_text else formatted_result
                    
                    # 执行日志（logs）：记录查询结果行数
                    current_logs = result.get("logs", "")
                    result["logs"] = f"{current_logs}\n[查询结果]\n共查询到 {len(rows)} 条记录" if current_logs else f"[查询结果]\n共查询到 {len(rows)} 条记录"
                    
                    # 将结果也保存到 dataset 字段（用于表格显示）
                    dataset = []
                    for row in rows:
                        row_dict = {}
                        # SQLAlchemy 2.0 返回 Row 对象，支持字典式访问
                        if hasattr(row, '_mapping'):
                            # SQLAlchemy 2.0 Row 对象
                            row_dict = dict(row._mapping)
                        elif hasattr(row, 'keys'):
                            # 字典式访问
                            row_dict = {col: row[col] for col in columns}
                        elif isinstance(row, (list, tuple)):
                            # 列表/元组式访问
                            row_dict = {col: row[i] for i, col in enumerate(columns)}
                        else:
                            # 其他情况，尝试直接转换
                            row_dict = dict(row) if hasattr(row, '__iter__') else {}
                        
                        # 处理特殊类型
                        for key, value in row_dict.items():
                            if hasattr(value, 'isoformat'):
                                row_dict[key] = value.isoformat()
                            elif hasattr(value, '__float__') and not isinstance(value, (int, float)):
                                try:
                                    row_dict[key] = float(value)
                                except (ValueError, TypeError):
                                    pass
                        
                        dataset.append(row_dict)
                    result["dataset"] = dataset
                    
                else:
                    # 非查询语句（INSERT/UPDATE/DELETE等）：返回影响行数
                    result_set = conn.execute(sql_statement)
                    affected_rows = result_set.rowcount
                    
                    # 提交事务
                    conn.commit()
                    
                    # 运行结果（text）：影响行数
                    result_message = f"执行成功，影响 {affected_rows} 行"
                    current_text = result.get("text", "")
                    result["text"] = f"{current_text}\n{result_message}".strip() if current_text else result_message
                    
                    # 执行日志（logs）：记录影响行数
                    current_logs = result.get("logs", "")
                    result["logs"] = f"{current_logs}\n[执行结果]\n{result_message}" if current_logs else f"[执行结果]\n{result_message}"
        
        except Exception as e:
            error_message = f"MySQL 语句执行失败: {str(e)}"
            # 记录错误到执行日志
            current_logs = result.get("logs", "")
            result["logs"] = f"{current_logs}\n[错误信息]\n{error_message}" if current_logs else f"[错误信息]\n{error_message}"
            raise RuntimeError(error_message)
        finally:
            # 关闭连接
            if engine:
                engine.dispose()
        
        return context, result

