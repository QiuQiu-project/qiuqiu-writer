I will implement Server Monitoring functionality in the Admin Panel to monitor system resources (CPU, Memory, Disk, etc.).

**1. Backend Implementation (`backend/src/memos/api/routers/admin_router.py`)**
   - Use `psutil` library to gather system metrics.
   - Create a new endpoint `GET /api/v1/admin/system-monitor` in `admin_router.py`.
   - Define a Pydantic schema `SystemMonitorResponse` in `admin.py`.
   - Metrics to collect:
     - CPU Usage (per core and total).
     - Memory Usage (Total, Available, Used, Percent).
     - Disk Usage (Total, Used, Free, Percent).
     - Uptime (Boot time).
     - Platform Info (OS, Release).

**2. Frontend Implementation (`admin/src/pages/Dashboard/index.tsx` or new page)**
   - I will integrate this into the **Dashboard** page as it's the perfect place for high-level monitoring.
   - Use `antd` components like `Progress` (for percentages), `Card`, `Statistic`, and `Row/Col` for layout.
   - Fetch data from the new endpoint periodically (e.g., every 5 seconds).

**3. Verification**
   - Verify the endpoint returns correct JSON data.
   - Verify the frontend displays the charts/stats correctly.

**Plan Execution Order:**
1.  **Dependencies**: Check if `psutil` is installed (it usually is, but I'll check). If not, I'll need to install it.
2.  **Backend**: Add Schema -> Add Endpoint.
3.  **Frontend**: Update Dashboard page.
