import asyncio
import sys
from pathlib import Path
from sqlalchemy import text

# Add src to python path
backend_dir = Path(__file__).parent
src_dir = backend_dir / "src"
sys.path.insert(0, str(src_dir))

from memos.api.core.database import get_async_session

async def check_admin():
    print("Checking admin user...")
    async for session in get_async_session():
        try:
            # Check if table exists
            result = await session.execute(text("SELECT to_regclass('public.admin_users')"))
            table_exists = result.scalar()
            print(f"Table 'admin_users' exists: {table_exists}")
            
            if table_exists:
                # Check users
                result = await session.execute(text("SELECT * FROM admin_users"))
                users = result.fetchall()
                print(f"Found {len(users)} admin users:")
                for user in users:
                    print(f" - {user.username} (email: {user.email})")
            else:
                print("⚠️ Table 'admin_users' does not exist! You need to restart the backend to trigger init_db().")
                
        except Exception as e:
            print(f"Error: {e}")
        finally:
            break

if __name__ == "__main__":
    asyncio.run(check_admin())
