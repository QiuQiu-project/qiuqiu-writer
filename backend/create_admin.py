import asyncio
import sys
from pathlib import Path

# Add src to python path
backend_dir = Path(__file__).parent
src_dir = backend_dir / "src"
sys.path.insert(0, str(src_dir))

from memos.api.core.database import init_db, close_db, get_async_session
from memos.api.services.admin_service import AdminService
from memos.api.schemas.admin import AdminCreateRequest

async def create_admin_user():
    print("=" * 50)
    print("Create Admin User (Independent Table)")
    print("=" * 50)
    
    username = input("Username (default: admin): ").strip() or "admin"
    email = input("Email (default: admin@example.com): ").strip() or "admin@example.com"
    password = input("Password (default: admin123): ").strip() or "admin123"
    display_name = input("Display Name (default: Administrator): ").strip() or "Administrator"
    
    # Initialize DB (create tables if not exist)
    await init_db()
    
    # Create session manually since we are outside of FastAPI dependency injection
    async for session in get_async_session():
        admin_service = AdminService(session)
        
        try:
            # Check if user exists
            existing_user = await admin_service.get_admin_by_username(username)
            if existing_user:
                print(f"❌ Admin '{username}' already exists.")
                return

            req = AdminCreateRequest(
                username=username,
                email=email,
                password=password,
                display_name=display_name
            )
            
            user = await admin_service.create_admin(req)
            
            if user:
                print(f"✅ Admin created successfully!")
                print(f"ID: {user.id}")
                print(f"Username: {username}")
                print(f"Table: admin_users")
            else:
                print("❌ Failed to create admin.")
                
        except Exception as e:
            print(f"❌ Error: {e}")
        finally:
            # Session will be closed by the context manager
            break
            
    await close_db()

if __name__ == "__main__":
    try:
        asyncio.run(create_admin_user())
    except KeyboardInterrupt:
        print("\nCancelled.")
