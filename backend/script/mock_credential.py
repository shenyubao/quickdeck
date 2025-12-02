"""
Mock 凭证工具类，用于本地调试 Python 脚本

使用方法:
    from script.mock_credential import MockCredential
    
    # 创建 mock credential 对象
    credential = MockCredential()
    
    # 在脚本中使用
    config = credential.get_config(1)
    bucket = credential.get_oss_client(1)
"""


class MockCredential:
    """Mock 凭证工具类，用于本地调试"""
    
    def __init__(self, credentials_data=None):
        """
        初始化 Mock 凭证工具类
        
        Args:
            credentials_data: 自定义凭证数据字典，格式:
                {
                    "1": {
                        "id": 1,
                        "credential_type": "oss",
                        "name": "测试OSS凭证",
                        "config": {...}
                    },
                    ...
                }
                如果不提供，使用默认的测试数据
        """
        if credentials_data is None:
            # 默认 Mock 凭证数据
            self._credentials = {
                "1": {
                    "id": 1,
                    "credential_type": "oss",
                    "name": "测试OSS凭证",
                    "config": {
                        "endpoint": "https://oss-cn-hangzhou.aliyuncs.com",
                        "access_key_id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",  # 修改为真实 Access Key ID
                        "access_key_secret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",  # 修改为真实 Access Key Secret
                        "bucket": "cube-oss-rpa-prod"  # 修改为真实 Bucket 名称
                    }
                }
            }
        else:
            self._credentials = credentials_data
    
    def get(self, credential_id):
        """
        根据凭证ID获取凭证信息
        
        Args:
            credential_id: 凭证ID（整数或字符串）
        
        Returns:
            凭证信息字典，包含 id, credential_type, name, config
            如果凭证不存在，返回 None
        """
        key = str(credential_id)
        return self._credentials.get(key)
    
    def get_config(self, credential_id):
        """
        根据凭证ID获取凭证配置信息
        
        Args:
            credential_id: 凭证ID（整数或字符串）
        
        Returns:
            凭证配置信息字典，如果凭证不存在，返回 None
        """
        cred = self.get(credential_id)
        return cred.get('config') if cred else None
    
    def get_oss_client(self, credential_id):
        """
        根据凭证ID获取 OSS 客户端对象（语法糖）
        
        Args:
            credential_id: OSS 凭证ID（整数或字符串）
        
        Returns:
            oss2.Bucket 对象，可以直接用于 OSS 操作
            如果凭证不存在或配置不完整，抛出异常
        
        使用示例:
            bucket = credential.get_oss_client(oss_cred_id)
            for obj in oss2.ObjectIterator(bucket):
                print(obj.key)
        """
        cred = self.get(credential_id)
        if not cred:
            raise ValueError(f'未找到凭证ID为 {credential_id} 的凭证')
        
        if cred.get('credential_type') != 'oss':
            raise ValueError(f'凭证ID {credential_id} 不是 OSS 类型凭证')
        
        config = cred.get('config')
        if not config:
            raise ValueError(f'凭证ID {credential_id} 的配置信息为空')
        
        endpoint = config.get('endpoint')
        access_key_id = config.get('access_key_id')
        access_key_secret = config.get('access_key_secret')
        bucket_name = config.get('bucket')
        
        if not all([endpoint, access_key_id, access_key_secret, bucket_name]):
            raise ValueError(f'OSS 凭证配置不完整，缺少必需的字段: endpoint, access_key_id, access_key_secret, bucket')
        
        try:
            import oss2
            auth = oss2.Auth(access_key_id, access_key_secret)
            bucket = oss2.Bucket(auth, endpoint, bucket_name)
            return bucket
        except ImportError:
            raise ImportError('未安装 oss2 库，请先安装: pip install oss2')


def run_mock_test(execute_func, test_args, test_name="Mock 测试"):
    """
    通用的 Mock 测试函数，用于本地调试
    
    注意: 调用此函数前，需要在调用模块中设置全局变量 credential:
        global credential
        credential = MockCredential()
    
    Args:
        execute_func: execute 函数
        test_args: 测试参数字典
        test_name: 测试名称
    
    Returns:
        (result_text, dataset) 元组，如果出错返回 (None, None)
    """
    
    print("=" * 60)
    print(f"开始 {test_name}")
    print("=" * 60)
    print(f"测试参数: {test_args}")
    print()
    
    try:
        # 调用 execute 函数
        result_text, dataset = execute_func(test_args)
        
        print()
        print("=" * 60)
        print("执行结果:")
        print("=" * 60)
        print(f"结果文本: {result_text}")
        print()
        
        if dataset:
            print(f"数据集 (共 {len(dataset)} 条):")
            for i, obj in enumerate(dataset, 1):
                print(f"  [{i}] {obj}")
        else:
            print("数据集: None")
        
        print()
        print("=" * 60)
        print("测试完成")
        print("=" * 60)
        
        return result_text, dataset
        
    except Exception as e:
        print()
        print("=" * 60)
        print("测试出错:")
        print("=" * 60)
        import traceback
        print(traceback.format_exc())
        return None, None

