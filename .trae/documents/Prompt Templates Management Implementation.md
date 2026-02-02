I have successfully implemented the Prompt Templates management feature in the Admin Panel.

Here is the summary of changes:

### Backend Implementation
1.  **Models**: Registered `PromptTemplate` in `backend/src/memos/api/models/__init__.py` to ensure proper visibility.
2.  **Schemas**: Added Pydantic schemas (`PromptTemplateResponse`, `Create`, `Update`, `List`) in `backend/src/memos/api/schemas/admin.py`.
3.  **Service**: Implemented CRUD operations (`get`, `create`, `update`, `delete`) in `backend/src/memos/api/services/admin_service.py`.
4.  **API Router**: Added endpoints (`GET`, `POST`, `PUT`, `DELETE`) for `/api/v1/admin/prompt-templates` in `backend/src/memos/api/routers/admin_router.py`.

### Frontend Implementation
1.  **Page**: Created `admin/src/pages/PromptTemplates/index.tsx` with a full-featured management interface:
    *   List view with columns for Name, Type, Version, Status, etc.
    *   Search/Filter functionality.
    *   Create/Edit Modal supporting JSON fields for Variables and Metadata.
2.  **Navigation**: Added "Prompt Templates" to the sidebar menu in `admin/src/layouts/MainLayout.tsx`.
3.  **Routing**: Registered the new route in `admin/src/App.tsx`.

### Verification
*   Verified that the `prompt_templates` table exists in the database (currently has 3 records).
*   Restarted the backend service (`start_ai_api.sh`) to apply the changes.

You can now access the admin panel at `http://localhost:5175/` (or your configured frontend port) and manage Prompt Templates.
