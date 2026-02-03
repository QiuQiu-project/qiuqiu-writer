import React, { useState, useEffect } from 'react';
import { Table, Card, Tag, Input, Space, Button, DatePicker } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';
import dayjs from 'dayjs';

interface AuditLog {
  id: number;
  user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  details: any;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

const AuditLogs: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [filters, setFilters] = useState({
    user_id: '',
    action: '',
  });

  const fetchData = async (page = 1, size = 20) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const res = await axios.get('/api/v1/admin/audit-logs', {
        params: { 
          page, 
          size,
          user_id: filters.user_id || undefined,
          action: filters.action || undefined,
        },
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data.items);
      setPagination({ ...pagination, current: page, total: res.data.total });
    } catch (error) {
      // message.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [pagination.current]);

  const handleSearch = () => {
    setPagination({ ...pagination, current: 1 });
    fetchData(1, pagination.pageSize);
  };

  const columns: ColumnsType<AuditLog> = [
    {
      title: 'Time',
      dataIndex: 'created_at',
      width: 180,
      render: (date) => dayjs(date).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: 'User ID',
      dataIndex: 'user_id',
      width: 150,
      render: (id) => id ? <Tag>{id.substring(0, 8)}...</Tag> : '-',
    },
    {
      title: 'Action',
      dataIndex: 'action',
      width: 120,
      render: (action) => {
        let color = 'blue';
        if (action === 'delete') color = 'red';
        if (action === 'create') color = 'green';
        if (action === 'login') color = 'cyan';
        return <Tag color={color}>{action.toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Target',
      key: 'target',
      width: 200,
      render: (_, record) => (
        record.target_type ? (
          <Space size="small">
            <Tag color="purple">{record.target_type}</Tag>
            <span>{record.target_id}</span>
          </Space>
        ) : '-'
      ),
    },
    {
      title: 'Details',
      dataIndex: 'details',
      render: (details) => (
        <pre style={{ margin: 0, maxHeight: 60, overflow: 'auto', fontSize: 11, color: '#666' }}>
          {JSON.stringify(details, null, 0)}
        </pre>
      ),
    },
    {
      title: 'IP Address',
      dataIndex: 'ip_address',
      width: 120,
    },
  ];

  return (
    <Card 
      title="Audit Logs" 
      extra={
        <Space>
          <Input 
            placeholder="User ID" 
            value={filters.user_id}
            onChange={e => setFilters({...filters, user_id: e.target.value})}
            style={{ width: 150 }}
          />
          <Input 
            placeholder="Action (e.g. login)" 
            value={filters.action}
            onChange={e => setFilters({...filters, action: e.target.value})}
            style={{ width: 150 }}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>Search</Button>
          <Button icon={<ReloadOutlined />} onClick={() => fetchData(pagination.current)}>Refresh</Button>
        </Space>
      }
    >
      <Table 
        columns={columns} 
        dataSource={data} 
        rowKey="id"
        loading={loading}
        pagination={{
          ...pagination,
          onChange: (page, size) => fetchData(page, size),
          showSizeChanger: true,
        }}
      />
    </Card>
  );
};

export default AuditLogs;
