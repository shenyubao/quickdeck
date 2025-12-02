from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from app.config import settings

# bcrypt 密码长度限制（字节）
BCRYPT_MAX_PASSWORD_LENGTH = 72


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    验证密码
    
    Args:
        plain_password: 原始密码字符串
        hashed_password: 哈希后的密码字符串（bcrypt 格式）
        
    Returns:
        如果密码匹配返回 True，否则返回 False
        
    Note:
        使用与 get_password_hash 相同的截断逻辑，确保验证一致性。
    """
    # 使用相同的截断逻辑，确保验证时的一致性
    plain_password = _truncate_password_to_bcrypt_limit(plain_password)
    try:
        # 将密码编码为字节
        password_bytes = plain_password.encode('utf-8')
        # 将哈希值编码为字节（如果还不是字节）
        if isinstance(hashed_password, str):
            hashed_password_bytes = hashed_password.encode('utf-8')
        else:
            hashed_password_bytes = hashed_password
        # 使用 bcrypt 验证密码
        return bcrypt.checkpw(password_bytes, hashed_password_bytes)
    except Exception:
        return False


def _truncate_password_to_bcrypt_limit(password: str) -> str:
    """
    将密码截断到 bcrypt 的72字节限制，同时保持 UTF-8 字符完整性
    
    Args:
        password: 原始密码字符串
        
    Returns:
        截断后的密码字符串（如果原始密码超过72字节）
    """
    password_bytes = password.encode('utf-8')
    if len(password_bytes) <= BCRYPT_MAX_PASSWORD_LENGTH:
        return password
    
    # 截断到72字节
    truncated_bytes = password_bytes[:BCRYPT_MAX_PASSWORD_LENGTH]
    
    # 移除可能不完整的 UTF-8 字符的尾部字节
    # UTF-8 编码规则：
    # - 单字节字符：0xxxxxxx (ASCII)
    # - 多字节字符起始：11xxxxxx
    # - 多字节字符后续：10xxxxxx
    # 如果最后一个字节是后续字节（10xxxxxx），说明字符被截断了
    while truncated_bytes and (truncated_bytes[-1] & 0xC0) == 0x80:
        truncated_bytes = truncated_bytes[:-1]
    
    return truncated_bytes.decode('utf-8', errors='replace')


def get_password_hash(password: str) -> str:
    """
    生成密码哈希
    
    Args:
        password: 原始密码字符串
        
    Returns:
        哈希后的密码字符串（bcrypt 格式）
        
    Note:
        bcrypt 限制密码不能超过72字节。此函数会自动处理超过限制的密码，
        确保 UTF-8 字符完整性。
    """
    # 预处理密码以确保不超过 bcrypt 的限制
    password = _truncate_password_to_bcrypt_limit(password)
    # 将密码编码为字节
    password_bytes = password.encode('utf-8')
    # 生成盐值并哈希密码
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    # 返回字符串格式的哈希值
    return hashed.decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建访问令牌"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """解码访问令牌"""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload
    except JWTError:
        return None

