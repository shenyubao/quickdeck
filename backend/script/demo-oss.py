# 示例：OSS 列出根路径文件
# 入参: {"oss_credential": 1}  # oss_credential 是凭证ID
# 出参: {"result": "列出文件成功", "dataset": [{"key": "file1.txt", "size": 1024, ...}, ...]}
# 
# 凭证配置说明:
#   oss_config = credential.get_config(oss_credential_id)
#   - endpoint: OSS 端点，例如 "oss-cn-hangzhou.aliyuncs.com"
#   - access_key_id: Access Key ID
#   - access_key_secret: Access Key Secret
#   - bucket: Bucket 名称

def execute(args: dict) -> tuple:
    # 获取 OSS 凭证ID（从参数中）
    oss_cred_id = args.get("oss_credential")
    
    try:
        # 使用语法糖直接获取 OSS 客户端对象
        bucket = credential.get_oss_client(oss_cred_id)
    
        # 列出根路径下的所有文件（最多10个）
        print("正在列出根路径文件...")
        
        import oss2
        objects = []
        for obj in oss2.ObjectIterator(bucket, prefix='', delimiter='', max_keys=10):
            objects.append({
                "key": obj.key,
                "size": obj.size,
                "etag": obj.etag,
                "storage_class": obj.storage_class
            })
            print(f"  找到文件: {obj.key} ({obj.size} bytes)")
        
        # 构建结果文本
        if len(objects) == 0:
            result_text = f"根路径下没有文件"
        else:
            result_text = f"成功列出 {len(objects)} 个文件"
        
        # 返回结果和数据集
        return (result_text, objects)
        
    except (ValueError, ImportError) as e:
        return (f"错误: {str(e)}", None)
    except Exception as e:
        error_msg = f"列出 OSS 文件时出错: {str(e)}"
        print(error_msg)
        import traceback
        print(traceback.format_exc())
        return (error_msg, None)


# ==================== Mock 函数用于调试 ====================
# 运行方式: python script/demo-oss.py

import sys
import os

# 添加父目录到路径，以便导入 mock_credential
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from script.mock_credential import MockCredential, run_mock_test


def mock_test():
    """Mock 测试函数，用于本地调试"""
    global credential
    
    # 创建 mock credential 对象并设置为全局变量
    credential = MockCredential()
    
    # 测试参数
    test_args = {
        "oss_credential": 1  # 使用 mock 凭证ID
    }
    
    # 使用公共的 mock 测试函数
    return run_mock_test(execute, test_args, "Mock 测试 OSS 列出根路径文件")


# 如果直接运行此脚本，执行 mock 测试
if __name__ == "__main__":
    mock_test()