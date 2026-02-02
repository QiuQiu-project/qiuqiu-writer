import React, { useState, useEffect } from 'react';
import { Table, Button, Input, Space, Tag, Modal, Form, Select, message, Popconfirm, Card } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';

interface PromptTemplate {
  id: number;
  name: string;
  description: string;
  template_type: string;
  prompt_content: string;
  version: string;
  is_default: boolean;
  is_active: boolean;
  variables: any;
  metadata: any;
  usage_count: number;
  created_at: string;
}

const PromptTemplates: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PromptTemplate[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [keyword, setKeyword] = useState('');
  
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();

  const fetchData = async (page = 1, size = 20) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const res = await axios.get('/api/v1/admin/prompt-templates', {
        params: { page, size, keyword },
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data.items);
      setPagination({ ...pagination, current: page, total: res.data.total });
    } catch (error) {
      message.error('Failed to load prompt templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [pagination.current, keyword]);

  const handleTableChange = (newPagination: any) => {
    fetchData(newPagination.current, newPagination.pageSize);
  };

  const handleEdit = (record: PromptTemplate) => {
    setEditingId(record.id);
    form.setFieldsValue({
      ...record,
      variables: JSON.stringify(record.variables, null, 2),
      metadata: JSON.stringify(record.metadata, null, 2),
    });
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const token = localStorage.getItem('admin_token');
      await axios.delete(`/api/v1/admin/prompt-templates/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      message.success('Template deleted successfully');
      fetchData(pagination.current);
    } catch (error) {
      message.error('Failed to delete template');
    }
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const token = localStorage.getItem('admin_token');
      
      // Parse JSON fields
      try {
        if (values.variables) values.variables = JSON.parse(values.variables);
        if (values.metadata) values.metadata = JSON.parse(values.metadata);
      } catch (e) {
        message.error('Invalid JSON format in Variables or Metadata');
        return;
      }

      if (editingId) {
        await axios.put(`/api/v1/admin/prompt-templates/${editingId}`, values, {
          headers: { Authorization: `Bearer ${token}` }
        });
        message.success('Template updated successfully');
      } else {
        await axios.post('/api/v1/admin/prompt-templates', values, {
          headers: { Authorization: `Bearer ${token}` }
        });
        message.success('Template created successfully');
      }
      setIsModalVisible(false);
      fetchData(pagination.current);
    } catch (error) {
      message.error('Failed to save template');
    }
  };

  const columns: ColumnsType<PromptTemplate> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 80,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      width: 200,
    },
    {
      title: 'Type',
      dataIndex: 'template_type',
      width: 150,
      render: (type) => <Tag color="blue">{type}</Tag>,
    },
    {
      title: 'Version',
      dataIndex: 'version',
      width: 100,
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      width: 100,
      render: (active) => (
        <Tag color={active ? 'green' : 'red'}>
          {active ? 'Active' : 'Inactive'}
        </Tag>
      ),
    },
    {
      title: 'Default',
      dataIndex: 'is_default',
      width: 100,
      render: (def) => (def ? <Tag color="gold">Default</Tag> : '-'),
    },
    {
      title: 'Usage',
      dataIndex: 'usage_count',
      width: 100,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button 
            type="primary" 
            icon={<EditOutlined />} 
            size="small" 
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="Delete this template?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button 
              danger 
              icon={<DeleteOutlined />} 
              size="small" 
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card 
        title="Prompt Templates" 
        extra={
          <Space>
            <Input 
              placeholder="Search templates" 
              prefix={<SearchOutlined />} 
              onChange={(e) => setKeyword(e.target.value)}
              style={{ width: 200 }}
            />
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={() => {
                setEditingId(null);
                form.resetFields();
                form.setFieldsValue({
                  version: '1.0',
                  is_active: true,
                  is_default: false,
                  variables: '{}',
                  metadata: '{}'
                });
                setIsModalVisible(true);
              }}
            >
              Add New
            </Button>
          </Space>
        }
      >
        <Table 
          columns={columns} 
          dataSource={data} 
          rowKey="id"
          pagination={pagination}
          loading={loading}
          onChange={handleTableChange}
        />
      </Card>

      <Modal
        title={editingId ? "Edit Template" : "New Template"}
        open={isModalVisible}
        onOk={handleOk}
        onCancel={() => setIsModalVisible(false)}
        width={800}
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Please enter template name' }]}
          >
            <Input />
          </Form.Item>
          
          <Form.Item
            name="description"
            label="Description"
          >
            <Input.TextArea rows={2} />
          </Form.Item>

          <Space style={{ display: 'flex', marginBottom: 8 }} align="baseline">
            <Form.Item
              name="template_type"
              label="Type"
              rules={[{ required: true, message: 'Please enter type' }]}
              style={{ width: 200 }}
            >
              <Input placeholder="e.g. book_analysis" />
            </Form.Item>

            <Form.Item
              name="version"
              label="Version"
              style={{ width: 100 }}
            >
              <Input />
            </Form.Item>

            <Form.Item
              name="is_active"
              label="Active"
              valuePropName="checked"
            >
              <Select options={[
                { label: 'Active', value: true },
                { label: 'Inactive', value: false }
              ]} />
            </Form.Item>

            <Form.Item
              name="is_default"
              label="Default"
              valuePropName="checked"
            >
               <Select options={[
                { label: 'Yes', value: true },
                { label: 'No', value: false }
              ]} />
            </Form.Item>
          </Space>

          <Form.Item
            name="prompt_content"
            label="Prompt Content"
            rules={[{ required: true, message: 'Please enter prompt content' }]}
          >
            <Input.TextArea rows={10} showCount />
          </Form.Item>

          <Form.Item
            name="variables"
            label="Variables (JSON)"
          >
            <Input.TextArea rows={4} style={{ fontFamily: 'monospace' }} />
          </Form.Item>

          <Form.Item
            name="metadata"
            label="Metadata (JSON)"
          >
            <Input.TextArea rows={4} style={{ fontFamily: 'monospace' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PromptTemplates;
