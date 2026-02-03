#!/usr/bin/env python3
"""
删除指定的记忆立方体（软删除：将 is_active 设为 False）。

用法:
  cd backend
  .venv/bin/python scripts/delete_cube.py [cube_id]

若不传 cube_id，则删除日志中常见的那条无效路径的 cube：0fb2bd46-1311-4923-9367-f530cc8fe8e0
"""
import os
import sys
from pathlib import Path

# 确保 backend 为当前目录，并加载 .env
backend_dir = Path(__file__).resolve().parent.parent
os.chdir(backend_dir)
if (backend_dir / ".env").exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(backend_dir / ".env")
    except ImportError:
        pass

sys.path.insert(0, str(backend_dir / "src"))

# 使用与 Product API 相同的 user_manager
from memos.mem_user.persistent_factory import PersistentUserManagerFactory


def main():
    cube_id = (sys.argv[1] if len(sys.argv) > 1 else "0fb2bd46-1311-4923-9367-f530cc8fe8e0").strip()
    if not cube_id:
        print("用法: python scripts/delete_cube.py [cube_id]")
        sys.exit(1)

    # 与 product_router 一致：默认 sqlite（db_path=None 即 .memos/memos_users.db）
    if os.getenv("MOS_USER_MANAGER_BACKEND", "sqlite").lower() == "mysql":
        from memos.api.config import APIConfig
        from memos.configs.mem_user import UserManagerConfigFactory
        um_config = UserManagerConfigFactory(
            backend="mysql",
            config=APIConfig.get_mysql_config(),
        )
        user_manager = PersistentUserManagerFactory.from_config(um_config)
    else:
        user_manager = PersistentUserManagerFactory.create_sqlite(db_path=None, user_id="root")
    ok = user_manager.delete_cube(cube_id)
    if ok:
        print(f"✅ 记忆立方体已删除（软删除）: {cube_id}")
    else:
        print(f"❌ 未找到该立方体或删除失败: {cube_id}")
        sys.exit(1)


if __name__ == "__main__":
    main()
