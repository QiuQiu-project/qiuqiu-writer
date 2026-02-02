import React, { useState, useEffect } from 'react';
import { Table, Card, Input, Button, Tag, Space, Modal, message } from 'antd';
import { SearchOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import request from '@/utils/request';

const { confirm } = Modal;

const Works: React.FC = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [keyword, setKeyword] = useState('');

  const fetchWorks = async (page = 1, size = 20, search = '') => {
    setLoading(true);
    try {
      const res: any = await request.get('/admin/works', {
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
    fetchWorks();
  }, []);

  const handleTableChange = (pag: any) => {
    fetchWorks(pag.current, pag.pageSize, keyword);
  };

  const handleSearch = () => {
    fetchWorks(1, pagination.pageSize, keyword);
  };

  const handleStatusChange = (record: any, newStatus: string) => {
    confirm({
      title: `Are you sure you want to change status to ${newStatus}?`,
      icon: <ExclamationCircleOutlined />,
      onOk: async () => {
        try {
          await request.put(`/admin/works/${record.id}/status`, { status: newStatus });
          message.success('Status updated successfully');
          fetchWorks(pagination.current, pagination.pageSize, keyword);
        } catch (error) {
          console.error(error);
        }
      },
    });
  };

  const columns = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: 'Type',
      dataIndex: 'work_type',
      key: 'work_type',
      render: (type: string) => <Tag color="blue">{type}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        let color = 'default';
        if (status === 'published') color = 'green';
        if (status === 'draft') color = 'orange';
        if (status === 'hidden') color = 'red';
        return <Tag color={color}>{status.toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Public',
      dataIndex: 'is_public',
      key: 'is_public',
      render: (isPublic: boolean) => (isPublic ? 'Yes' : 'No'),
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
          {record.status !== 'hidden' ? (
             <Button danger size="small" onClick={() => handleStatusChange(record, 'hidden')}>
               Hide
             </Button>
          ) : (
            <Button type="primary" size="small" onClick={() => handleStatusChange(record, 'published')}>
              Publish
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card title="Works Management" extra={
      <Space>
        <Input 
          placeholder="Search title/desc" 
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

export default Works;
