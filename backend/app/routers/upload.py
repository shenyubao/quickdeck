from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import Optional
import tempfile
import os
import logging
from app.database import get_db
from app.routers.auth import get_current_user
from app.models import User

logger = logging.getLogger("app.routers.upload")

router = APIRouter(prefix="/api/upload", tags=["upload"])
security = HTTPBearer()


@router.post("")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    上传文件到临时目录
    
    Returns:
        {
            "path": "/tmp/quickdeck_xxx_file.zip",
            "name": "original_filename.zip",
            "size": 12345
        }
    """
    try:
        # 创建临时文件
        suffix = os.path.splitext(file.filename or "")[1] or ""
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, prefix="quickdeck_upload_") as temp_file:
            # 读取文件内容并写入临时文件
            content = await file.read()
            temp_file.write(content)
            temp_path = temp_file.name
        
        logger.info(f"文件上传成功: {file.filename} -> {temp_path}, 大小: {len(content)} 字节")
        
        return {
            "path": temp_path,
            "name": file.filename or "unknown",
            "size": len(content)
        }
    except Exception as e:
        logger.error(f"文件上传失败: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"文件上传失败: {str(e)}"
        )

