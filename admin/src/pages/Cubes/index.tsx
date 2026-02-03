import React, { useState, useEffect } from 'react';
import { Table, Card, Tag, Button, Popconfirm, message } from 'antd';
import request from '@/utils/request';

const Cubes: React.FC = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  const fetchCubes = async (page = 1, size = 20) => {
    setLoading(true);
    try {
      const res: any = await request.get('/admin/cubes', {
        params: { page, size },
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

  const handleDelete = async (cubeId: string) => {
    try {
      await request.delete(`/admin/cubes/${cubeId}`);
      message.success('Cube deleted successfully');
      fetchCubes(pagination.current, pagination.pageSize);
    } catch (error) {
      console.error(error);
      message.error('Failed to delete cube');
    }
  };

  useEffect(() => {
    fetchCubes();
  }, []);

  const handleTableChange = (pag: any) => {
    fetchCubes(pag.current, pag.pageSize);
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'cube_name',
      key: 'cube_name',
    },
    {
      title: 'Cube ID',
      dataIndex: 'cube_id',
      key: 'cube_id',
      ellipsis: true,
    },
    {
      title: 'Owner ID',
      dataIndex: 'owner_id',
      key: 'owner_id',
      ellipsis: true,
    },
    {
      title: 'Path',
      dataIndex: 'cube_path',
      key: 'cube_path',
      ellipsis: true,
    },
    {
      title: 'Active',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'red'}>{active ? 'Active' : 'Inactive'}</Tag>
      ),
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: 'Updated At',
      dataIndex: 'updated_at',
      key: 'updated_at',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: any) => (
        <Popconfirm
          title="Delete the cube"
          description="Are you sure to delete this cube?"
          onConfirm={() => handleDelete(record.cube_id)}
          okText="Yes"
          cancelText="No"
        >
          <Button danger size="small">Delete</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Card title="Cube Management">
      <Table
        columns={columns}
        dataSource={data}
        rowKey="cube_id"
        pagination={pagination}
        loading={loading}
        onChange={handleTableChange}
      />
    </Card>
  );
};

export default Cubes;
