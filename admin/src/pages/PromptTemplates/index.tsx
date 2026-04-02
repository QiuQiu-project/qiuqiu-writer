import React, { useRef, useState } from 'react';
import { Button, Input, Tag, Form, Select, message, Popconfirm, Switch } from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined } from '@ant-design/icons';
import { ProTable, ActionType, ProColumns } from '@ant-design/pro-components';
import { useNavigate } from 'react-router-dom';
import request from '@/utils/request';
import ResizableModal from '../../components/ResizableModal';

interface WorkTemplate {
  id: number;
  name: string;
  description?: string;
  work_type: string;
  is_system?: boolean;
  is_public?: boolean;
  creator_id?: string;
  category?: string;
  usage_count?: number;
  created_at?: string;
  updated_at?: string;
}

const PromptTemplates: React.FC = () => {
  const navigate = useNavigate();
  const actionRef = useRef<ActionType>();
  
  // Create modal
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await request.post('/admin/work-templates', values);
      message.success('Created successfully');
      setModalOpen(false);
      form.resetFields();
      actionRef.current?.reload();
    } catch {
      message.error('Create failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/admin/work-templates/${id}`);
      message.success('Deleted successfully');
      actionRef.current?.reload();
    } catch {
      message.error('Delete failed');
    }
  };

  const columns: ProColumns<WorkTemplate>[] = [
    {
      title: 'Search',
      dataIndex: 'search',
      hideInTable: true,
      tooltip: 'Search by name',
      fieldProps: {
        prefix: <SearchOutlined />,
        placeholder: 'Enter template name',
      },
    },
    { title: 'ID', dataIndex: 'id', width: 70, search: false, sorter: (a, b) => a.id - b.id },
    {
      title: 'Template Name',
      dataIndex: 'name',
      search: false,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (_, record) => (
        <a onClick={() => navigate(`/prompt-templates/${record.id}`)} style={{ fontWeight: 500 }}>
          {record.name}
        </a>
      ),
    },
    {
      title: 'Work Type',
      dataIndex: 'work_type',
      search: false,
      width: 100,
      sorter: (a, b) => a.work_type.localeCompare(b.work_type),
      render: (v) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: 'Category',
      dataIndex: 'category',
      search: false,
      width: 100,
      sorter: (a, b) => (a.category || '').localeCompare(b.category || ''),
      render: (v) => v ? <Tag>{v}</Tag> : '-',
    },
    {
      title: 'System',
      dataIndex: 'is_system',
      search: false,
      width: 80,
      sorter: (a, b) => (a.is_system === b.is_system ? 0 : a.is_system ? -1 : 1),
      render: (v) => (v ? <Tag color="gold">Sys</Tag> : <Tag>User</Tag>),
    },
    {
      title: 'Public',
      dataIndex: 'is_public',
      search: false,
      width: 80,
      sorter: (a, b) => (a.is_public === b.is_public ? 0 : a.is_public ? -1 : 1),
      render: (v) => (v ? <Tag color="green">Pub</Tag> : <Tag>Priv</Tag>),
    },
    {
      title: 'Usage',
      dataIndex: 'usage_count',
      search: false,
      width: 80,
      align: 'center',
      sorter: (a, b) => (a.usage_count || 0) - (b.usage_count || 0),
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      valueType: 'dateTime',
      width: 160,
      search: false,
      sorter: (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
    },
    {
      title: 'Action',
      key: 'action',
      width: 120,
      search: false,
      render: (_, record) => (
        <Popconfirm title="Confirm delete?" onConfirm={() => handleDelete(record.id)} okButtonProps={{ danger: true }}>
          <Button type="text" danger icon={<DeleteOutlined />} size="small">
            Delete
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <>
      <ProTable<WorkTemplate>
        headerTitle="Work Templates"
        actionRef={actionRef}
        rowKey="id"
        search={{
          labelWidth: 'auto',
        }}
        toolBarRender={() => [
          <Button key="create" type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            New Template
          </Button>,
        ]}
        request={async (params) => {
          const { search } = params;
          const res = await request.get<WorkTemplate[]>('/admin/work-templates', {
            params: { search },
          });
          // Since backend returns array directly and no pagination info
          return {
            data: Array.isArray(res) ? res : [],
            success: true,
          };
        }}
        columns={columns}
        pagination={{
          pageSize: 20,
        }}
      />

      <ResizableModal
        title="Create New Template"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleCreate}
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="work_type" label="Work Type" rules={[{ required: true }]} initialValue="novel">
            <Select>
              <Select.Option value="novel">Novel</Select.Option>
              <Select.Option value="script">Script</Select.Option>
              <Select.Option value="article">Article</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="category" label="Category">
            <Input placeholder="e.g. Fantasy, Sci-Fi" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="is_public" label="Public" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
          <Form.Item name="is_system" label="System Template" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
        </Form>
      </ResizableModal>
    </>
  );
};

export default PromptTemplates;
