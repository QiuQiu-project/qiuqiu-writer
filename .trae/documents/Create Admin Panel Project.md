# Create Independent Administrator Backend Interface (Admin Panel)

Based on your request, I will create a new, independent React project for the administrator backend in a separate `admin` folder. This ensures separation of concerns from the main user frontend.

## 1. Project Initialization
- **Location**: Create a new directory `admin` in the project root.
- **Tech Stack**: 
  - **Framework**: Vite + React + TypeScript (consistent with your frontend).
  - **UI Library**: **Ant Design (antd)** - An enterprise-class UI design language and React UI library, perfect for admin dashboards.
  - **Routing**: React Router DOM (v6).
  - **HTTP Client**: Axios.

## 2. Directory Structure
```
admin/
  ├── src/
  │   ├── api/           # API integration (reusing backend endpoints)
  │   ├── assets/        # Static assets
  │   ├── components/    # Shared components (Layouts, Guards)
  │   ├── pages/         # Page views
  │   │   ├── Login/     # Admin Login
  │   │   ├── Dashboard/ # Overview
  │   │   ├── Users/     # User Management
  │   │   └── Works/     # Works Management
  │   ├── utils/         # Helpers (request.ts, auth.ts)
  │   ├── App.tsx        # Main Router
  │   └── main.tsx       # Entry point
  ├── package.json
  ├── vite.config.ts     # Configuration (Proxy to backend)
  └── tsconfig.json
```

## 3. Key Features Implementation
### A. Authentication & Security
- **Login Page**: A professional login form using Ant Design.
- **Auth Guard**: Protect admin routes; redirect unauthenticated users to Login.
- **Token Management**: Store JWT in localStorage (compatible with your existing backend).

### B. Core Layout
- **Admin Layout**: A standard admin layout with a collapsible Sidebar (Left) and Header (Top).
- **Navigation**:
  - Dashboard
  - User Management
  - Work Management
  - System Settings

### C. Backend Integration
- **Proxy Setup**: Configure Vite proxy to forward `/api` requests to your existing backend (e.g., `http://localhost:8000`), ensuring seamless API calls without CORS issues during development.
- **API Client**: Create a unified Axios instance with interceptors to automatically attach the `Bearer` token.

## 4. Next Steps
Once you confirm, I will:
1.  Initialize the `admin` project structure.
2.  Install necessary dependencies (`antd`, `axios`, `react-router-dom`, etc.).
3.  Implement the Login page and connect it to your existing `/api/v1/auth/login`.
4.  Build the Main Layout and a basic Dashboard page.

Does this plan meet your requirements?