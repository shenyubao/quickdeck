# 示例：预测 LDL 上传
# 入参: {"file": "压缩包文件路径", "oss_credential": 1, "dst_prefix": "yuce-rpa-process/huo1818_csv/"}
# 出参: {"result": "处理结果", "dataset": [{"file": "文件名", "status": "成功/失败", ...}, ...]}
# 
# 依赖要求:
#   - pandas: pip install pandas
#   - openpyxl: pip install openpyxl (用于 .xlsx 文件)
#   - xlrd<2.0: pip install 'xlrd<2.0' (用于 .xls 文件，xlrd 2.0+ 不支持 .xls 格式)
#   - oss2: pip install oss2 (用于 OSS 上传)
# 
# 凭证配置说明:
#   oss_config = credential.get_config(oss_credential_id)
#   - endpoint: OSS 端点，例如 "oss-cn-hangzhou.aliyuncs.com"
#   - access_key_id: Access Key ID
#   - access_key_secret: Access Key Secret
#   - bucket: Bucket 名称
#
# 业务逻辑:
#   1. 解压缩压缩包
#   2. 遍历获取 Excel，验证是否符合规则
#      - 验证规则1: 平台列只能为"全网"；空值允许
#      - 验证规则2: 时间列应为 YYYYMM（允许为空）
#      - 验证规则3: 销售额按降序排列（按时间+二级行业+三级行业+四级行业分组内降序）
#   3. 将文件转为 CSV 文件（列分隔符：ASCII 1，行分隔符：\n + ASCII 2）
#   4. 将文件上传到 OSS 指定路径

import os
import io
import re
import zipfile
import tempfile
import shutil
from datetime import datetime
from typing import Optional, Tuple, Any
from typing import Final

# CSV 分隔符常量
COLUMN: Final[str] = '\x01'  # 列分隔符：ASCII 1
ROW: Final[str] = '\n\x02'   # 行分隔符：ASCII 2

DST_PREFIX: Final[str] = "yuce-rpa-process/huo1818_csv/品牌榜/"    # 目标前缀

def _normalize_header_name(name: Any) -> str:
    """规范化表头名：移除 BOM/空格/制表符，统一匹配用。"""
    if name is None:
        return ""
    s = str(name)
    return s.replace("\ufeff", "").replace(" ", "").replace("\t", "").strip()


def _find_col_idx(header_row: list[Any], candidates: list[str]) -> Optional[int]:
    """在 header_row 中查找任一候选名称的列索引（规范化后精确匹配）。"""
    normalized_header = [_normalize_header_name(h) for h in header_row]
    normalized_candidates = [_normalize_header_name(c) for c in candidates]
    for idx, h in enumerate(normalized_header):
        if h in normalized_candidates:
            return idx
    return None


def sanitize_cell(value: Any) -> str:
    """清理单元格内容，移除可能破坏 CSV 结构的字符。"""
    if value is None:
        return ""
    text = str(value)
    if not text:
        return ""
    # 清理自定义分隔符与常见换行符
    text = text.replace(COLUMN, " ").replace(ROW, " ")
    text = text.replace("\r", " ").replace("\n", " ").replace("\t", " ")
    return text


def read_excel_to_csv(content: bytes, filename: str = "") -> str:
    """将 Excel 二进制内容转换为自定义分隔符的 CSV 文本。
    
    Args:
        content: Excel 文件内容（支持 .xls/.xlsx）
        filename: 文件名（用于确定引擎）
        
    Returns:
        CSV 文本（使用自定义分隔符）
    """
    try:
        import pandas as pd
    except ImportError:
        raise ImportError("pandas 未安装，无法读取 Excel 文件")
    
    # 根据文件扩展名确定读取方式
    is_xls = filename and filename.lower().endswith('.xls')
    is_xlsx = filename and filename.lower().endswith('.xlsx')
    
    import warnings
    # 忽略 openpyxl 的样式警告
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", message="Workbook contains no default style", category=UserWarning)
        
        if is_xls:
            # 对于 .xls 文件，使用 xlrd 1.x 直接读取（因为 xlrd 2.0+ 不支持 .xls）
            try:
                import xlrd
                # 检查 xlrd 版本
                xlrd_version = getattr(xlrd, '__version__', '0.0.0')
                if xlrd_version.startswith('2.'):
                    # xlrd 2.0+ 不支持 .xls，需要使用其他方法
                    # 尝试使用 pyexcel-xls 或直接使用 xlrd 1.x 的逻辑
                    raise ImportError("xlrd 2.0+ 不支持 .xls 格式，请安装 xlrd<2.0 或使用其他方法")
                
                # 使用 xlrd 1.x 读取
                workbook = xlrd.open_workbook(file_contents=content)
                sheet = workbook.sheet_by_index(0)
                
                # 读取表头（第一行）
                if sheet.nrows == 0:
                    return ""
                
                header = [str(sheet.cell_value(0, col)) for col in range(sheet.ncols)]
                
                # 读取数据行
                data_rows = []
                for row_idx in range(1, sheet.nrows):
                    row_data = []
                    for col_idx in range(sheet.ncols):
                        cell_value = sheet.cell_value(row_idx, col_idx)
                        # 处理日期类型
                        if sheet.cell_type(row_idx, col_idx) == xlrd.XL_CELL_DATE:
                            try:
                                date_tuple = xlrd.xldate_as_tuple(cell_value, workbook.datemode)
                                # 转换为 YYYYMM 格式（年月，符合验证规则要求）
                                cell_value = f"{date_tuple[0]:04d}{date_tuple[1]:02d}"
                            except Exception:
                                cell_value = str(cell_value)
                        else:
                            cell_value = str(cell_value)
                        row_data.append(cell_value)
                    data_rows.append(row_data)
                
                # 构建 DataFrame
                df = pd.DataFrame(data_rows, columns=header)
                
            except ImportError as e:
                # 如果 xlrd 不可用或版本不对，尝试使用 pandas（可能会失败）
                try:
                    df = pd.read_excel(io.BytesIO(content), sheet_name=0, header=0, dtype=str, engine='xlrd')
                except Exception:
                    raise ImportError(f"无法读取 .xls 文件: {str(e)}。请安装 xlrd<2.0: pip install 'xlrd<2.0'")
        elif is_xlsx:
            # 对于 .xlsx 文件，使用 openpyxl
            df = pd.read_excel(io.BytesIO(content), sheet_name=0, header=0, dtype=str, engine='openpyxl')
        else:
            # 自动检测，先尝试 openpyxl，再尝试 xlrd
            try:
                df = pd.read_excel(io.BytesIO(content), sheet_name=0, header=0, dtype=str, engine='openpyxl')
            except Exception:
                try:
                    # 尝试使用 xlrd（可能是 .xls 文件）
                    import xlrd
                    xlrd_version = getattr(xlrd, '__version__', '0.0.0')
                    if not xlrd_version.startswith('2.'):
                        # 使用 xlrd 1.x 读取
                        workbook = xlrd.open_workbook(file_contents=content)
                        sheet = workbook.sheet_by_index(0)
                        if sheet.nrows == 0:
                            return ""
                        header = [str(sheet.cell_value(0, col)) for col in range(sheet.ncols)]
                        data_rows = []
                        for row_idx in range(1, sheet.nrows):
                            row_data = []
                            for col_idx in range(sheet.ncols):
                                cell_value = sheet.cell_value(row_idx, col_idx)
                                if sheet.cell_type(row_idx, col_idx) == xlrd.XL_CELL_DATE:
                                    try:
                                        date_tuple = xlrd.xldate_as_tuple(cell_value, workbook.datemode)
                                        cell_value = f"{date_tuple[0]:04d}{date_tuple[1]:02d}{date_tuple[2]:02d}"
                                    except Exception:
                                        cell_value = str(cell_value)
                                else:
                                    cell_value = str(cell_value)
                                row_data.append(cell_value)
                            data_rows.append(row_data)
                        df = pd.DataFrame(data_rows, columns=header)
                    else:
                        raise ImportError("xlrd 2.0+ 不支持 .xls 格式")
                except Exception:
                    # 最后尝试默认方式
                    df = pd.read_excel(io.BytesIO(content), sheet_name=0, header=0, dtype=str)
    
    if df is None or df.empty:
        return ""
    
    # 填充空值为空字符串
    df = df.fillna("")
    
    # 构建包含表头的二维数组
    header_row = [str(col) for col in df.columns.tolist()]
    data_rows: list[list[str]] = [[str(v) for v in row] for row in df.to_numpy().tolist()]
    rows = [header_row] + data_rows
    
    # 转换为自定义分隔符 CSV
    lines: list[str] = []
    for row in rows:
        cells = [sanitize_cell(v) for v in row]
        lines.append(COLUMN.join(cells))
    
    csv_text = ROW.join(lines)
    return csv_text


def validate_excel_file(excel_content: bytes, filename: str) -> Tuple[bool, str]:
    """验证 Excel 文件内容
    
    Args:
        excel_content: Excel 文件二进制内容
        filename: 文件名（用于错误提示）
        
    Returns:
        (is_valid, error_message): 校验结果和错误信息
    """
    try:
        import pandas as pd
    except ImportError:
        return False, "pandas 未安装，无法进行校验"
    
    try:
        # 根据文件扩展名确定读取方式
        is_xls = filename and filename.lower().endswith('.xls')
        is_xlsx = filename and filename.lower().endswith('.xlsx')
        
        # 读取 Excel 为 DataFrame
        import warnings
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message="Workbook contains no default style", category=UserWarning)
            
            if is_xls:
                # 对于 .xls 文件，使用 xlrd 1.x 直接读取
                try:
                    import xlrd
                    xlrd_version = getattr(xlrd, '__version__', '0.0.0')
                    if xlrd_version.startswith('2.'):
                        raise ImportError("xlrd 2.0+ 不支持 .xls 格式，请安装 xlrd<2.0")
                    
                    # 使用 xlrd 1.x 读取
                    workbook = xlrd.open_workbook(file_contents=excel_content)
                    sheet = workbook.sheet_by_index(0)
                    
                    if sheet.nrows == 0:
                        return False, "Excel 文件为空"
                    
                    # 读取表头
                    header = [str(sheet.cell_value(0, col)) for col in range(sheet.ncols)]
                    
                    # 读取数据行
                    data_rows = []
                    for row_idx in range(1, sheet.nrows):
                        row_data = []
                        for col_idx in range(sheet.ncols):
                            cell_value = sheet.cell_value(row_idx, col_idx)
                            # 处理日期类型
                            if sheet.cell_type(row_idx, col_idx) == xlrd.XL_CELL_DATE:
                                try:
                                    date_tuple = xlrd.xldate_as_tuple(cell_value, workbook.datemode)
                                    cell_value = f"{date_tuple[0]:04d}{date_tuple[1]:02d}{date_tuple[2]:02d}"
                                except Exception:
                                    cell_value = str(cell_value)
                            else:
                                cell_value = str(cell_value)
                            row_data.append(cell_value)
                        data_rows.append(row_data)
                    
                    # 构建 DataFrame
                    df = pd.DataFrame(data_rows, columns=header)
                    
                except ImportError as e:
                    return False, f"无法读取 .xls 文件: {str(e)}。请安装 xlrd<2.0: pip install 'xlrd<2.0'"
            elif is_xlsx:
                # 对于 .xlsx 文件，使用 openpyxl
                df = pd.read_excel(io.BytesIO(excel_content), sheet_name=0, header=0, dtype=str, engine='openpyxl')
            else:
                # 自动检测
                try:
                    df = pd.read_excel(io.BytesIO(excel_content), sheet_name=0, header=0, dtype=str, engine='openpyxl')
                except Exception:
                    try:
                        # 尝试使用 xlrd 1.x（可能是 .xls 文件）
                        import xlrd
                        xlrd_version = getattr(xlrd, '__version__', '0.0.0')
                        if not xlrd_version.startswith('2.'):
                            workbook = xlrd.open_workbook(file_contents=excel_content)
                            sheet = workbook.sheet_by_index(0)
                            if sheet.nrows == 0:
                                return False, "Excel 文件为空"
                            header = [str(sheet.cell_value(0, col)) for col in range(sheet.ncols)]
                            data_rows = []
                            for row_idx in range(1, sheet.nrows):
                                row_data = []
                                for col_idx in range(sheet.ncols):
                                    cell_value = sheet.cell_value(row_idx, col_idx)
                                    if sheet.cell_type(row_idx, col_idx) == xlrd.XL_CELL_DATE:
                                        try:
                                            date_tuple = xlrd.xldate_as_tuple(cell_value, workbook.datemode)
                                            cell_value = f"{date_tuple[0]:04d}{date_tuple[1]:02d}{date_tuple[2]:02d}"
                                        except Exception:
                                            cell_value = str(cell_value)
                                    else:
                                        cell_value = str(cell_value)
                                    row_data.append(cell_value)
                                data_rows.append(row_data)
                            df = pd.DataFrame(data_rows, columns=header)
                        else:
                            df = pd.read_excel(io.BytesIO(excel_content), sheet_name=0, header=0, dtype=str)
                    except Exception:
                        df = pd.read_excel(io.BytesIO(excel_content), sheet_name=0, header=0, dtype=str)
        
        if df is None or df.empty:
            return False, "Excel 文件为空"
        
        if len(df) == 0:
            return False, "数据无有效行（至少需要表头+数据行）"
        
        # 第一行为表头
        header = [str(c) for c in df.columns.tolist()]
        
        # 通过标准化名称进行稳健匹配
        platform_col_idx = _find_col_idx(header, ["平台"])
        sales_col_idx = _find_col_idx(header, ["销售额"])
        time_col_idx = _find_col_idx(header, ["时间"])
        industry2_col_idx = _find_col_idx(header, ["二级行业"])
        industry3_col_idx = _find_col_idx(header, ["三级行业"])
        industry4_col_idx = _find_col_idx(header, ["四级行业"])
        
        # 数据行
        df = df.fillna("")
        
        # 校验规则1: 平台列只能为"全网"；空值允许
        if platform_col_idx is not None and len(df.columns) > platform_col_idx:
            platform_col = df.iloc[:, platform_col_idx].astype(str).str.strip()
            invalid_platforms = platform_col[(platform_col != "") & (platform_col != "全网")]
            if not invalid_platforms.empty:
                invalid_values = invalid_platforms.unique().tolist()
                return False, f"平台不正确，发现非'全网'值: {invalid_values}"
        
        # 校验规则2: 时间列应为 YYYYMM（允许为空）
        if time_col_idx is not None and len(df.columns) > time_col_idx:
            time_series_raw = df.iloc[:, time_col_idx].astype(str).str.strip()
            # 标准化：非空值先尝试转数值 -> 整数 -> 字符串
            non_empty_mask = time_series_raw != ""
            numeric_series = pd.to_numeric(time_series_raw.where(non_empty_mask, None), errors='coerce')
            time_series_norm = time_series_raw.copy()
            ok_mask = non_empty_mask & numeric_series.notna()
            time_series_norm.loc[ok_mask] = numeric_series.loc[ok_mask].astype(int).astype(str)
            
            # 合法：空字符串；严格6位数字（YYYYMM）
            pattern_ym_strict = re.compile(r"^\d{6}$")
            def _is_valid_time(v: str) -> bool:
                if v == "":
                    return True
                return bool(pattern_ym_strict.match(v))
            
            invalid_times = time_series_norm[~time_series_norm.apply(_is_valid_time)]
            if not invalid_times.empty:
                sample = invalid_times.unique().tolist()[:5]
                return False, f"时间列格式不正确，需为YYYYMM或为空，示例问题值: {sample}"
        
        # 校验规则3: 销售额按降序排列（按时间+二级行业+三级行业+四级行业分组内降序）
        if sales_col_idx is not None and len(df.columns) > sales_col_idx:
            try:
                df = df.reset_index(drop=True)
                # 允许空值：转换失败为 NaN，后续排序校验忽略 NaN
                df[sales_col_idx] = pd.to_numeric(df.iloc[:, sales_col_idx], errors='coerce')
                
                # 检查是否存在分组列
                has_time_col = time_col_idx is not None and len(df.columns) > time_col_idx
                has_industry2_col = industry2_col_idx is not None and len(df.columns) > industry2_col_idx
                has_industry3_col = industry3_col_idx is not None and len(df.columns) > industry3_col_idx
                has_industry4_col = industry4_col_idx is not None and len(df.columns) > industry4_col_idx
                
                if has_time_col or has_industry2_col or has_industry3_col or has_industry4_col:
                    # 规则：在原始顺序下，对同一"时间+二级行业+三级行业+四级行业"的连续片段进行降序校验
                    failed_groups = []
                    last_value = None
                    current_composite_group = None
                    
                    for _, row in df.iterrows():
                        # 构建组合分组键：时间+二级行业+三级行业+四级行业
                        time_val = str(row.iloc[time_col_idx]).strip() if has_time_col else ""
                        ind2_val = str(row.iloc[industry2_col_idx]).strip() if has_industry2_col else ""
                        ind3_val = str(row.iloc[industry3_col_idx]).strip() if has_industry3_col else ""
                        ind4_val = str(row.iloc[industry4_col_idx]).strip() if has_industry4_col else ""
                        
                        # 处理空值：将 'nan' 字符串转换为空字符串
                        if time_val.lower() == 'nan':
                            time_val = ""
                        if ind2_val.lower() == 'nan':
                            ind2_val = ""
                        if ind3_val.lower() == 'nan':
                            ind3_val = ""
                        if ind4_val.lower() == 'nan':
                            ind4_val = ""
                        
                        composite_group = f"{time_val}|{ind2_val}|{ind3_val}|{ind4_val}"
                        
                        # 忽略完全为空的组（所有分组字段都为空）
                        if time_val == "" and ind2_val == "" and ind3_val == "" and ind4_val == "":
                            continue
                        
                        val = row.iloc[sales_col_idx]
                        # 跳过空销售额
                        if pd.isna(val):
                            continue
                        val_f = float(val)
                        
                        # 新片段：当组合键变化时重置基准
                        if current_composite_group != composite_group:
                            current_composite_group = composite_group
                            last_value = None
                        
                        # 在片段内进行非递增校验
                        if last_value is not None and val_f > last_value + 1e-9:
                            # 生成更友好的错误信息
                            parts = []
                            if time_val:
                                parts.append(f"时间={time_val}")
                            else:
                                parts.append("时间=(空)")
                            
                            if ind2_val:
                                parts.append(f"二级行业={ind2_val}")
                            else:
                                parts.append("二级行业=(空)")
                            
                            if ind3_val:
                                parts.append(f"三级行业={ind3_val}")
                            else:
                                parts.append("三级行业=(空)")
                            
                            if ind4_val:
                                parts.append(f"四级行业={ind4_val}")
                            else:
                                parts.append("四级行业=(空)")
                            
                            display_group = ",".join(parts)
                            
                            if display_group not in failed_groups:
                                failed_groups.append(display_group)
                                if len(failed_groups) >= 5:
                                    break
                        last_value = val_f
                    
                    if failed_groups:
                        return False, f"销售额排序不正确，应为按组降序排列，问题组: {failed_groups}"
                else:
                    # 无分组列则进行全局降序校验（忽略空值）
                    sales_series = df.iloc[:, sales_col_idx].dropna()
                    if not sales_series.is_monotonic_decreasing:
                        return False, "销售额排序不正确，应为降序排列"
            except Exception as e:
                return False, f"销售额列校验失败: {str(e)}"
        
        return True, ""
        
    except Exception as e:
        return False, f"数据校验过程出错: {str(e)}"


def upload_to_oss(bucket, object_key: str, data: bytes, content_type: str = "text/csv; charset=utf-8") -> bool:
    """上传文件到 OSS
    
    Args:
        bucket: OSS Bucket 对象（oss2.Bucket）
        object_key: OSS 对象键（路径）
        data: 文件二进制数据
        content_type: 内容类型
        
    Returns:
        上传是否成功
    """
    try:
        import oss2
        result = bucket.put_object(object_key, data, headers={'Content-Type': content_type})
        return result.status == 200
    except Exception as e:
        print(f"上传到 OSS 失败: {object_key} -> {str(e)}")
        return False


def execute(args: dict) -> tuple:
    """执行预测 LDL 上传任务
    
    Args:
        args: 参数字典，包含:
            - file: 压缩包文件路径
            - oss_credential: OSS 凭证ID
            - dst_prefix: 目标 OSS 路径前缀（可选，默认为 "yuce-rpa-process/huo1818_csv/"）
    
    Returns:
        (result_text, dataset): 处理结果和数据集
    """
    # 获取参数
    # 注意：file 参数已经由后端处理为本地文件路径（字符串）
    file_path = args.get("file")
    oss_cred_id = args.get("oss_credential")
    dst_prefix = DST_PREFIX
    
    # 参数验证
    if not file_path:
        return ("错误: 缺少必需参数 'file'", None)
    
    # 确保目标前缀以 / 结尾
    if dst_prefix and not dst_prefix.endswith('/'):
        dst_prefix += '/'
    
    try:
        # 获取 OSS 客户端
        bucket = credential.get_oss_client(oss_cred_id)
        
        # 创建临时目录用于解压
        temp_dir = tempfile.mkdtemp()
        print(f"创建临时目录: {temp_dir}")
        
        try:
            # 1. 解压缩压缩包
            print(f"正在解压缩文件: {file_path}")
            if not os.path.exists(file_path):
                return (f"错误: 文件不存在: {file_path}", None)
            
            # 解压缩时处理文件名编码问题
            with zipfile.ZipFile(file_path, 'r') as zip_ref:
                # 获取所有文件信息并处理编码
                for member_info in zip_ref.infolist():
                    member = member_info.filename
                    
                    # 跳过 macOS 的 ._ 文件（资源分叉文件）
                    if os.path.basename(member).startswith('._'):
                        continue
                    
                    # 处理文件名编码：ZIP 文件可能使用 cp437 编码存储中文文件名
                    try:
                        # 尝试从 cp437 解码为 GBK（中文 Windows 常用）
                        try:
                            decoded_name = member.encode('cp437').decode('gbk')
                            # 更新 ZipInfo 的文件名
                            member_info.filename = decoded_name
                        except (UnicodeDecodeError, UnicodeEncodeError, AttributeError):
                            # 再尝试 UTF-8
                            try:
                                decoded_name = member.encode('cp437').decode('utf-8')
                                member_info.filename = decoded_name
                            except (UnicodeDecodeError, UnicodeEncodeError, AttributeError):
                                # 如果都失败，保持原始名称
                                pass
                    except Exception:
                        # 如果编码处理出错，保持原始名称
                        pass
                    
                    # 提取文件（使用修改后的文件名）
                    try:
                        zip_ref.extract(member_info, temp_dir)
                    except Exception as e:
                        print(f"警告: 解压文件失败 {member}: {str(e)}")
                        continue
            
            print(f"解压缩完成，文件解压到: {temp_dir}")
            
            # 2. 遍历获取 Excel 文件（跳过 ._ 文件）
            excel_files = []
            for root, dirs, files in os.walk(temp_dir):
                for file in files:
                    # 跳过 macOS 的 ._ 文件
                    if file.startswith('._'):
                        continue
                    if file.lower().endswith(('.xls', '.xlsx')):
                        excel_files.append(os.path.join(root, file))
            
            if not excel_files:
                return ("错误: 压缩包中未找到 Excel 文件", None)
            
            print(f"找到 {len(excel_files)} 个 Excel 文件")
            
            # 处理结果统计
            processed_count = 0
            validated_count = 0
            uploaded_count = 0
            failed_count = 0
            results = []
            
            # 3. 处理每个 Excel 文件
            for excel_file in excel_files:
                try:
                    # 读取 Excel 文件
                    with open(excel_file, 'rb') as f:
                        excel_content = f.read()
                    
                    # 获取相对路径（用于构造 OSS 路径）
                    rel_path = os.path.relpath(excel_file, temp_dir)
                    # 将路径中的反斜杠替换为正斜杠
                    rel_path = rel_path.replace(os.sep, '/')
                    # 将扩展名改为 .csv
                    base_name = os.path.splitext(rel_path)[0]
                    csv_rel_path = base_name + '.csv'
                    
                    filename = os.path.basename(excel_file)
                    print(f"处理文件: {filename}")
                    
                    # 验证 Excel 文件
                    is_valid, error_msg = validate_excel_file(excel_content, filename)
                    if not is_valid:
                        print(f"  验证失败: {error_msg}")
                        failed_count += 1
                        results.append({
                            "file": filename,
                            "status": "验证失败",
                            "error": error_msg
                        })
                        continue
                    
                    validated_count += 1
                    print(f"  验证通过")
                    
                    # 转换为 CSV（传递文件名以确定引擎）
                    csv_content = read_excel_to_csv(excel_content, filename)
                    if not csv_content:
                        print(f"  转换失败: CSV 内容为空")
                        failed_count += 1
                        results.append({
                            "file": filename,
                            "status": "转换失败",
                            "error": "CSV 内容为空"
                        })
                        continue
                    
                    # 将 CSV 内容编码为 UTF-8 字节
                    csv_bytes = csv_content.encode('utf-8')
                    
                    # 4. 上传到 OSS
                    # 获取当前日期（格式：YYYYMMDD）
                    current_date = datetime.now().strftime('%Y%m%d')
                    # 在 DST_PREFIX 后面添加日期目录
                    oss_key = dst_prefix + current_date + '/' + csv_rel_path
                    print(f"  上传到 OSS: {oss_key}")
                    
                    success = upload_to_oss(bucket, oss_key, csv_bytes)
                    if not success:
                        print(f"  上传失败")
                        failed_count += 1
                        results.append({
                            "file": filename,
                            "status": "上传失败",
                            "error": "OSS 上传失败"
                        })
                        continue
                    
                    uploaded_count += 1
                    processed_count += 1
                    print(f"  处理成功")
                    results.append({
                        "file": filename,
                        "status": "成功",
                        "oss_path": oss_key
                    })
                    
                except Exception as e:
                    print(f"  处理文件时出错: {str(e)}")
                    import traceback
                    print(traceback.format_exc())
                    failed_count += 1
                    filename = os.path.basename(excel_file) if excel_file else "未知文件"
                    results.append({
                        "file": filename,
                        "status": "处理失败",
                        "error": str(e)
                    })
            
            # 构建结果文本
            result_text = f"处理完成: 总计 {len(excel_files)} 个文件，验证通过 {validated_count} 个，成功上传 {uploaded_count} 个，失败 {failed_count} 个"
            
            return (result_text, results)
            
        finally:
            # 清理临时目录
            if os.path.exists(temp_dir):
                print(f"清理临时目录: {temp_dir}")
                shutil.rmtree(temp_dir)
        
    except (ValueError, ImportError) as e:
        return (f"错误: {str(e)}", None)
    except Exception as e:
        error_msg = f"处理过程中出错: {str(e)}"
        print(error_msg)
        import traceback
        print(traceback.format_exc())
        return (error_msg, None)


# ==================== Mock 函数用于调试 ====================
# 运行方式: python script/yuce-ldl-upload.py

import sys

# 添加父目录到路径，以便导入 mock_credential
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from script.mock_credential import MockCredential, run_mock_test


def mock_test():
    """Mock 测试函数，用于本地调试"""
    global credential
    
    # 创建 mock credential 对象并设置为全局变量
    credential = MockCredential()
    
    # 测试参数
    # 注意: 需要提供一个真实的压缩包文件路径
    test_args = {
        "file": "/Users/shenyubao/Downloads/炼丹炉-行业数据-品牌榜_202411-202411数据_1个类目数据_1764576843949.xls.zip",  # 修改为实际的压缩包路径
        "oss_credential": 1,  # 使用 mock 凭证ID
        "dst_prefix": "yuce-rpa-process/huo1818_csv/"  # 目标 OSS 路径前缀
    }
    
    # 使用公共的 mock 测试函数
    return run_mock_test(execute, test_args, "Mock 测试预测 LDL 上传")


# 如果直接运行此脚本，执行 mock 测试
if __name__ == "__main__":
    mock_test()

