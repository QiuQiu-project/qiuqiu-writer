import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Progress, Spin, message } from 'antd';
import { UserOutlined, BookOutlined, ReadOutlined, DashboardOutlined, CloudServerOutlined, HddOutlined } from '@ant-design/icons';
import axios from 'axios';

interface SystemMonitor {
  cpu_percent: number;
  cpu_cores: number;
  memory: {
    total: number;
    available: number;
    percent: number;
    used: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percent: number;
  };
  uptime: number;
  platform: string;
  python_version: string;
}

const Dashboard: React.FC = () => {
  const [monitorData, setMonitorData] = useState<SystemMonitor | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchMonitorData = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await axios.get('/api/v1/admin/system-monitor', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMonitorData(res.data);
    } catch (error) {
      console.error('Failed to fetch monitor data', error);
    }
  };

  useEffect(() => {
    fetchMonitorData();
    const interval = setInterval(fetchMonitorData, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>Dashboard</h2>
      
      {/* Overview Stats (Placeholder for now, can be connected to real API later) */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card bordered={false}>
            <Statistic
              title="Total Users"
              value={1128}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false}>
            <Statistic
              title="Total Works"
              value={93}
              prefix={<BookOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false}>
            <Statistic
              title="Total Chapters"
              value={2345}
              prefix={<ReadOutlined />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
      </Row>

      {/* System Monitor */}
      <h3 style={{ marginBottom: 16 }}>System Monitor</h3>
      {monitorData ? (
        <Row gutter={16}>
          <Col span={8}>
            <Card title={<span><DashboardOutlined /> CPU Usage</span>} bordered={false}>
              <div style={{ textAlign: 'center' }}>
                <Progress type="dashboard" percent={monitorData.cpu_percent} status={monitorData.cpu_percent > 80 ? 'exception' : 'normal'} />
                <div style={{ marginTop: 10 }}>Cores: {monitorData.cpu_cores}</div>
                <div style={{ color: '#888' }}>{monitorData.platform}</div>
              </div>
            </Card>
          </Col>
          <Col span={8}>
            <Card title={<span><CloudServerOutlined /> Memory Usage</span>} bordered={false}>
              <div style={{ textAlign: 'center' }}>
                <Progress type="dashboard" percent={monitorData.memory.percent} status={monitorData.memory.percent > 80 ? 'exception' : 'normal'} />
                <div style={{ marginTop: 10 }}>
                  Used: {formatBytes(monitorData.memory.used)} / {formatBytes(monitorData.memory.total)}
                </div>
                <div style={{ color: '#888' }}>Python: {monitorData.python_version}</div>
              </div>
            </Card>
          </Col>
          <Col span={8}>
            <Card title={<span><HddOutlined /> Disk Usage</span>} bordered={false}>
              <div style={{ textAlign: 'center' }}>
                <Progress type="dashboard" percent={monitorData.disk.percent} status={monitorData.disk.percent > 90 ? 'exception' : 'normal'} />
                <div style={{ marginTop: 10 }}>
                  Free: {formatBytes(monitorData.disk.free)} / {formatBytes(monitorData.disk.total)}
                </div>
                <div style={{ color: '#888' }}>Uptime: {formatUptime(monitorData.uptime)}</div>
              </div>
            </Card>
          </Col>
        </Row>
      ) : (
        <Card loading={true} />
      )}
      
      <Card title="Recent Activity" style={{ marginTop: 24 }}>
        <p>User "pang" logged in.</p>
        <p>New work "My Novel" created.</p>
        <p>System update completed.</p>
      </Card>
    </div>
  );
};

export default Dashboard;
