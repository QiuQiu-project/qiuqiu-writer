import React, { useState, useEffect } from 'react';
import { Table, Card, Input, Button, Tag, Space, Modal, message, Select } from 'antd';
import { SearchOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import request from '@/utils/request';

const { confirm } = Modal;

const Users: React.FC = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [keyword, setKeyword] = useState('');

  const fetchUsers = async (page = 1, size = 20, search = '') => {
    setLoading(true);
    try {
      const res: any = await request.get('/admin/users', {
        params: { page, size, keyword: search },
      });
      setData(res.items);
      setPagination({
        current: res.page,
        pageSize: res.size,
        total: res.total,
      });
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleTableChange = (pag: any) => {
    fetchUsers(pag.current, pag.pageSize, keyword);
  };

  const handleSearch = () => {
    fetchUsers(1, pagination.pageSize, keyword);
  };

  const handleStatusChange = (record: any, newStatus: string) => {
    confirm({
      title: `Are you sure you want to ${newStatus === 'active' ? 'activate' : 'ban'} this user?`,
      icon: <ExclamationCircleOutlined />,
      onOk: async () => {
        try {
          await request.put(`/admin/users/${record.id}/status`, { status: newStatus });
          message.success('Status updated successfully');
          fetchUsers(pagination.current, pagination.pageSize, keyword);
        } catch (error) {
          console.error(error);
        }
      },
    });
  };

  const columns = [
    {
      title: 'Username',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Display Name',
      dataIndex: 'display_name',
      key: 'display_name',
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={role === 'admin' ? 'purple' : 'blue'}>{role.toUpperCase()}</Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        let color = 'green';
        if (status === 'banned') color = 'red';
        if (status === 'inactive') color = 'orange';
        return <Tag color={color}>{status.toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: any) => (
        <Space size="middle">
          {record.status !== 'banned' ? (
            <Button danger size="small" onClick={() => handleStatusChange(record, 'banned')}>
              Ban
            </Button>
          ) : (
            <Button type="primary" size="small" onClick={() => handleStatusChange(record, 'active')}>
              Activate
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card title="User Management" extra={
      <Space>
        <Input 
          placeholder="Search username/email" 
          value={keyword} 
          onChange={(e) => setKeyword(e.target.value)} 
          onPressEnter={handleSearch}
          style={{ width: 200 }} 
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>Search</Button>
      </Space>
    }>
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        pagination={pagination}
        loading={loading}
        onChange={handleTableChange}
      />
    </Card>
  );
};

export default Users;
