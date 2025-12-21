from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import SystemConfig
from app.schemas import SystemConfigCreate, SystemConfigResponse, SystemConfigUpdate
from app.routers.users import require_admin

router = APIRouter(prefix="/api/system-config", tags=["system-config"])


@router.get("", response_model=List[SystemConfigResponse])
async def get_system_configs(
    current_user = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """获取所有系统配置（仅管理员）"""
    configs = db.query(SystemConfig).order_by(SystemConfig.name).all()
    return configs


@router.get("/{config_id}", response_model=SystemConfigResponse)
async def get_system_config(
    config_id: int,
    current_user = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """获取单个系统配置（仅管理员）"""
    config = db.query(SystemConfig).filter(SystemConfig.id == config_id).first()
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="系统配置不存在"
        )
    
    return config


@router.post("", response_model=SystemConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_system_config(
    config_data: SystemConfigCreate,
    current_user = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """创建系统配置（仅管理员）"""
    # 检查配置名称是否已存在
    existing_config = db.query(SystemConfig).filter(
        SystemConfig.name == config_data.name
    ).first()
    
    if existing_config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="配置名称已存在"
        )
    
    # 创建新配置
    new_config = SystemConfig(
        name=config_data.name,
        value=config_data.value,
        description=config_data.description,
        default_value=config_data.default_value
    )
    
    db.add(new_config)
    db.commit()
    db.refresh(new_config)
    
    return new_config


@router.put("/{config_id}", response_model=SystemConfigResponse)
async def update_system_config(
    config_id: int,
    config_data: SystemConfigUpdate,
    current_user = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """更新系统配置（仅管理员）"""
    config = db.query(SystemConfig).filter(SystemConfig.id == config_id).first()
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="系统配置不存在"
        )
    
    # 更新字段
    if config_data.value is not None:
        config.value = config_data.value
    
    if config_data.description is not None:
        config.description = config_data.description
    
    if config_data.default_value is not None:
        config.default_value = config_data.default_value
    
    db.commit()
    db.refresh(config)
    
    return config


@router.post("/{config_id}/reset", response_model=SystemConfigResponse)
async def reset_system_config(
    config_id: int,
    current_user = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """还原系统配置到默认值（仅管理员）"""
    config = db.query(SystemConfig).filter(SystemConfig.id == config_id).first()
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="系统配置不存在"
        )
    
    # 将value设置为default_value
    config.value = config.default_value
    
    db.commit()
    db.refresh(config)
    
    return config


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_system_config(
    config_id: int,
    current_user = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """删除系统配置（仅管理员）"""
    config = db.query(SystemConfig).filter(SystemConfig.id == config_id).first()
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="系统配置不存在"
        )
    
    db.delete(config)
    db.commit()
    
    return None

