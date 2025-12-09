"""
用户服务模块
"""

from typing import Optional, Dict, Any, List
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, text
from sqlalchemy.orm import selectinload

from memos.api.core.database import engine
from memos.api.core.security import get_password_hash, verify_password
from memos.api.core.redis import get_redis
from memos.api.models.user import User, UserProfile
from memos.api.models.system import AuditLog


class UserService:
    """用户服务类"""

    def __init__(self):
        self.redis = None

    async def get_redis(self):
        """获取Redis客户端"""
        if not self.redis:
            self.redis = await get_redis()
        return self.redis

    async def create_user(
        self,
        username: str,
        email: str,
        password: str,
        display_name: Optional[str] = None,
        **kwargs
    ) -> Optional[Dict[str, Any]]:
        """
        创建新用户

        Args:
            username: 用户名
            email: 邮箱
            password: 密码
            display_name: 显示名称
            **kwargs: 其他用户信息

        Returns:
            用户信息字典，创建失败返回None
        """
        async with AsyncSession(engine) as session:
            try:
                # 检查用户名和邮箱是否已存在
                existing_user = await self._get_existing_user(session, username, email)
                if existing_user:
                    return None

                # 创建用户
                user = User(
                    username=username,
                    email=email,
                    password_hash=get_password_hash(password),
                    display_name=display_name,
                    status="active"
                )

                session.add(user)
                await session.flush()  # 获取用户ID

                # 创建用户详细资料
                profile = UserProfile(
                    user_id=user.id,
                    display_name=display_name,
                    real_name=kwargs.get("real_name"),
                    gender=kwargs.get("gender"),
                    birthday=kwargs.get("birthday"),
                    location=kwargs.get("location"),
                    website=kwargs.get("website"),
                    social_links=kwargs.get("social_links", [])
                )

                session.add(profile)
                await session.commit()

                # 记录审计日志
                await self._create_audit_log(session, user.id, "create", "user", user.id, {"username": username})

                # 刷新对象以获取关联数据
                await session.refresh(user)
                await session.refresh(profile)

                # 直接返回用户数据，避免创建新会话
                user_data = user.to_dict()
                if profile:
                    user_data["profile"] = profile.to_dict()

                return user_data

            except Exception as e:
                await session.rollback()
                print(f"❌ 创建用户失败: {e}")
                import traceback
                traceback.print_exc()
                return None

    async def authenticate_user(self, username_or_email: str, password: str) -> Optional[Dict[str, Any]]:
        """
        用户认证

        Args:
            username_or_email: 用户名或邮箱
            password: 密码

        Returns:
            用户信息字典，认证失败返回None
        """
        async with AsyncSession(engine) as session:
            try:
                # 查找用户
                stmt = select(User).options(
                    selectinload(User.profile)
                ).filter(
                    (User.username == username_or_email) |
                    (User.email == username_or_email)
                )
                result = await session.execute(stmt)
                user = result.scalar_one_or_none()

                if not user:
                    return None

                # 验证密码
                if not verify_password(password, user.password_hash):
                    return None

                # 更新最后登录时间
                user.last_login_at = datetime.utcnow()
                await session.commit()

                # 记录审计日志
                await self._create_audit_log(session, user.id, "login", "user", user.id)

                return user.to_dict()

            except Exception as e:
                await session.rollback()
                print(f"❌ 用户认证失败: {e}")
                return None

    async def get_user_by_id(self, user_id: int, include_profile: bool = True) -> Optional[Dict[str, Any]]:
        """
        根据ID获取用户信息

        Args:
            user_id: 用户ID
            include_profile: 是否包含详细资料

        Returns:
            用户信息字典，用户不存在返回None
        """
        async with AsyncSession(engine) as session:
            try:
                if include_profile:
                    stmt = select(User).options(
                        selectinload(User.profile)
                    ).filter(User.id == user_id)
                else:
                    stmt = select(User).filter(User.id == user_id)

                result = await session.execute(stmt)
                user = result.scalar_one_or_none()

                if not user:
                    return None

                # 检查缓存
                redis = await self.get_redis()
                cache_key = f"user:{user_id}"
                cached_data = await redis.get(cache_key)

                if cached_data:
                    return cached_data

                # 转换为字典
                user_data = user.to_dict()
                if user.profile:
                    user_data["profile"] = user.profile.to_dict()

                # 缓存用户信息
                await redis.set(cache_key, user_data, ttl=3600)  # 1小时

                return user_data

            except Exception as e:
                print(f"❌ 获取用户信息失败: {e}")
                return None

    async def get_user_by_username(self, username: str, include_profile: bool = True) -> Optional[Dict[str, Any]]:
        """
        根据用户名获取用户信息

        Args:
            username: 用户名
            include_profile: 是否包含详细资料

        Returns:
            用户信息字典，用户不存在返回None
        """
        async with AsyncSession(engine) as session:
            try:
                if include_profile:
                    stmt = select(User).options(
                        selectinload(User.profile)
                    ).filter(User.username == username)
                else:
                    stmt = select(User).filter(User.username == username)

                result = await session.execute(stmt)
                user = result.scalar_one_or_none()

                if not user:
                    return None

                user_data = user.to_dict()
                if user.profile:
                    user_data["profile"] = user.profile.to_dict()

                return user_data

            except Exception as e:
                print(f"❌ 获取用户信息失败: {e}")
                return None

    async def get_user_by_email(self, email: str, include_profile: bool = True) -> Optional[Dict[str, Any]]:
        """
        根据邮箱获取用户信息

        Args:
            email: 邮箱
            include_profile: 是否包含详细资料

        Returns:
            用户信息字典，用户不存在返回None
        """
        async with AsyncSession(engine) as session:
            try:
                if include_profile:
                    stmt = select(User).options(
                        selectinload(User.profile)
                    ).filter(User.email == email)
                else:
                    stmt = select(User).filter(User.email == email)

                result = await session.execute(stmt)
                user = result.scalar_one_or_none()

                if not user:
                    return None

                user_data = user.to_dict()
                if user.profile:
                    user_data["profile"] = user.profile.to_dict()

                return user_data

            except Exception as e:
                print(f"❌ 获取用户信息失败: {e}")
                return None

    async def update_user(
        self,
        user_id: int,
        update_data: Dict[str, Any],
        update_profile: bool = True
    ) -> Optional[Dict[str, Any]]:
        """
        更新用户信息

        Args:
            user_id: 用户ID
            update_data: 更新数据
            update_profile: 是否更新资料

        Returns:
            更新后的用户信息字典，更新失败返回None
        """
        async with AsyncSession(engine) as session:
            try:
                # 获取用户
                stmt = select(User).options(
                    selectinload(User.profile)
                ).filter(User.id == user_id)
                result = await session.execute(stmt)
                user = result.scalar_one_or_none()

                if not user:
                    return None

                # 分离用户资料更新数据
                profile_data = {}
                user_data = {}

                profile_fields = {
                    "display_name", "real_name", "gender", "birthday",
                    "location", "website", "social_links", "writing_stats", "preferences"
                }

                for key, value in update_data.items():
                    if key in profile_fields and update_profile:
                        profile_data[key] = value
                    elif key not in profile_fields:
                        user_data[key] = value

                # 更新用户基本信息
                if user_data:
                    for key, value in user_data.items():
                        if hasattr(user, key):
                            setattr(user, key, value)

                # 更新用户资料
                if profile_data and update_profile:
                    if user.profile:
                        for key, value in profile_data.items():
                            if hasattr(user.profile, key):
                                setattr(user.profile, key, value)
                    else:
                        profile = UserProfile(user_id=user_id, **profile_data)
                        session.add(profile)

                await session.commit()

                # 清除缓存
                redis = await self.get_redis()
                await redis.delete(f"user:{user_id}")

                # 记录审计日志
                await self._create_audit_log(session, user_id, "update", "user", user_id, update_data)

                return await self.get_user_by_id(user_id)

            except Exception as e:
                await session.rollback()
                print(f"❌ 更新用户信息失败: {e}")
                return None

    async def update_user_password(self, user_id: int, new_password: str) -> bool:
        """
        更新用户密码

        Args:
            user_id: 用户ID
            new_password: 新密码

        Returns:
            更新是否成功
        """
        async with AsyncSession(engine) as session:
            try:
                # 获取用户
                stmt = select(User).filter(User.id == user_id)
                result = await session.execute(stmt)
                user = result.scalar_one_or_none()

                if not user:
                    return False

                # 更新密码
                user.password_hash = get_password_hash(new_password)
                await session.commit()

                # 清除缓存
                redis = await self.get_redis()
                await redis.delete(f"user:{user_id}")

                # 记录审计日志
                await self._create_audit_log(session, user_id, "update", "user", user_id, {"action": "password_change"})

                return True

            except Exception as e:
                await session.rollback()
                print(f"❌ 更新用户密码失败: {e}")
                return False

    async def delete_user(self, user_id: int) -> bool:
        """
        删除用户

        Args:
            user_id: 用户ID

        Returns:
            删除是否成功
        """
        async with AsyncSession(engine) as session:
            try:
                # 获取用户
                stmt = select(User).filter(User.id == user_id)
                result = await session.execute(stmt)
                user = result.scalar_one_or_none()

                if not user:
                    return False

                # 删除用户（级联删除相关数据）
                await session.delete(user)
                await session.commit()

                # 清除缓存
                redis = await self.get_redis()
                await redis.delete(f"user:{user_id}")

                print(f"✅ 用户 {user_id} 删除成功")
                return True

            except Exception as e:
                await session.rollback()
                print(f"❌ 删除用户失败: {e}")
                return False

    async def list_users(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None,
        status: Optional[str] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc"
    ) -> Dict[str, Any]:
        """
        获取用户列表

        Args:
            page: 页码
            page_size: 每页数量
            search: 搜索关键词
            status: 用户状态
            sort_by: 排序字段
            sort_order: 排序方向

        Returns:
            用户列表信息
        """
        async with AsyncSession(engine) as session:
            try:
                # 构建查询
                query = select(User)

                # 搜索条件
                filters = []
                if search:
                    search_filter = or_(
                        User.username.ilike(f"%{search}%"),
                        User.email.ilike(f"%{search}%"),
                        User.display_name.ilike(f"%{search}%")
                    )
                    filters.append(search_filter)

                if status:
                    filters.append(User.status == status)

                if filters:
                    query = query.filter(and_(*filters))

                # 排序
                sort_column = getattr(User, sort_by, User.created_at)
                if sort_order.lower() == "desc":
                    query = query.order_by(sort_column.desc())
                else:
                    query = query.order_by(sort_column.asc())

                # 计算总数
                count_query = select(func.count(User.id)).select_from(query.subquery())
                total_result = await session.execute(count_query)
                total_count = total_result.scalar()

                # 分页
                offset = (page - 1) * page_size
                query = query.offset(offset).limit(page_size)

                result = await session.execute(query)
                users = result.scalars().all()

                users_data = [user.to_dict() for user in users]

                return {
                    "users": users_data,
                    "pagination": {
                        "page": page,
                        "page_size": page_size,
                        "total": total_count,
                        "pages": (total_count + page_size - 1) // page_size,
                        "has_next": page * page_size < total_count,
                        "has_prev": page > 1,
                    }
                }

            except Exception as e:
                print(f"❌ 获取用户列表失败: {e}")
                return {"users": [], "pagination": {"page": 0, "totalCount": 0}}

    async def check_username_availability(self, username: str) -> bool:
        """
        检查用户名是否可用

        Args:
            username: 用户名

        Returns:
            用户名是否可用
        """
        async with AsyncSession(engine) as session:
            try:
                stmt = select(User.id).filter(User.username == username)
                result = await session.execute(stmt)
                user_id = result.scalar_one_or_none()
                return user_id is None

            except Exception as e:
                print(f"❌ 检查用户名可用性失败: {e}")
                return False

    async def check_email_availability(self, email: str) -> bool:
        """
        检查邮箱是否可用

        Args:
            email: 邮箱

        Returns:
            邮箱是否可用
        """
        async with AsyncSession(engine) as session:
            try:
                stmt = select(User.id).filter(User.email == email)
                result = await session.execute(stmt)
                user_id = result.scalar_one_or_none()
                return user_id is None

            except Exception as e:
                print(f"❌ 检查邮箱可用性失败: {e}")
                return False

    async def update_last_login(self, user_id: int) -> bool:
        """
        更新用户最后登录时间

        Args:
            user_id: 用户ID

        Returns:
            更新是否成功
        """
        async with AsyncSession(engine) as session:
            try:
                stmt = select(User).filter(User.id == user_id)
                result = await session.execute(stmt)
                user = result.scalar_one_or_none()

                if not user:
                    return False

                user.last_login_at = datetime.utcnow()
                await session.commit()

                # 清除缓存
                redis = await self.get_redis()
                await redis.delete(f"user:{user_id}")

                return True

            except Exception as e:
                await session.rollback()
                print(f"❌ 更新最后登录时间失败: {e}")
                return False

    async def create_audit_log(
        self,
        user_id: int,
        action: str,
        target_type: Optional[str] = None,
        target_id: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> bool:
        """
        创建审计日志（公共方法）

        Args:
            user_id: 用户ID
            action: 操作类型
            target_type: 目标类型
            target_id: 目标ID
            details: 详细信息
            ip_address: IP地址
            user_agent: 用户代理

        Returns:
            创建是否成功
        """
        async with AsyncSession(engine) as session:
            try:
                await self._create_audit_log(
                    session, user_id, action, target_type, target_id,
                    details, ip_address, user_agent
                )
                await session.commit()
                return True
            except Exception as e:
                await session.rollback()
                print(f"❌ 创建审计日志失败: {e}")
                return False

    async def _get_existing_user(
        self,
        session: AsyncSession,
        username: str,
        email: str
    ) -> Optional[User]:
        """
        检查用户是否已存在

        Args:
            session: 数据库会话
            username: 用户名
            email: 邮箱

        Returns:
            存在的用户对象，不存在返回None
        """
        stmt = select(User).filter(
            (User.username == username) | (User.email == email)
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def _create_audit_log(
        self,
        session: AsyncSession,
        user_id: int,
        action: str,
        target_type: Optional[str],
        target_id: Optional[int],
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ):
        """
        创建审计日志

        Args:
            session: 数据库会话
            user_id: 用户ID
            action: 操作类型
            target_type: 目标类型
            target_id: 目标ID
            details: 详细信息
            ip_address: IP地址
            user_agent: 用户代理
        """
        try:
            log = AuditLog(
                user_id=user_id,
                action=action,
                target_type=target_type,
                target_id=target_id,
                details=details or {},
                ip_address=ip_address,
                user_agent=user_agent
            )
            session.add(log)
            # 不提交，让调用方处理事务
        except Exception as e:
            print(f"❌ 创建审计日志失败: {e}")