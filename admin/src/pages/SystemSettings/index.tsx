import React, { useState, useEffect } from 'react';
import { Table, Button, Input, Card, Modal, Form, Switch, message, Tag } from 'antd';
import { EditOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';

interface SystemSetting {
  id: number;
  key: string;
  value: any;
  description: string;
  category: string;
  is_public: boolean;
  updated_at: string;
}

const SystemSettings: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SystemSetting[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<SystemSetting | null>(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const res = await axios.get('/api/v1/admin/system-settings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data);
    } catch (error) {
      message.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleEdit = (record: SystemSetting) => {
    setEditingItem(record);
    form.setFieldsValue({
      ...record,
      value: typeof record.value === 'object' ? JSON.stringify(record.value, null, 2) : record.value,
    });
    setIsModalVisible(true);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const token = localStorage.getItem('admin_token');
      
      // Try to parse JSON if it looks like one
      let finalValue = values.value;
      try {
        if (typeof values.value === 'string' && (values.value.startsWith('{') || values.value.startsWith('['))) {
          finalValue = JSON.parse(values.value);
        }
      } catch (e) {
        // Ignore, treat as string
      }

      await axios.put(`/api/v1/admin/system-settings/${editingItem!.id}`, {
        ...values,
        value: finalValue
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      message.success('Setting updated successfully');
      setIsModalVisible(false);
      fetchData();
    } catch (error) {
      message.error('Failed to save setting');
    }
  };

  const columns: ColumnsType<SystemSetting> = [
    {
      title: 'Key',
      dataIndex: 'key',
      width: 200,
      render: (text) => <span style={{ fontWeight: 'bold' }}>{text}</span>,
    },
    {
      title: 'Value',
      dataIndex: 'value',
      render: (val) => (
        <pre style={{ margin: 0, maxHeight: 100, overflow: 'auto', fontSize: 12 }}>
          {typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val)}
        </pre>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      width: 150,
      render: (cat) => cat ? <Tag color="blue">{cat}</Tag> : '-',
    },
    {
      title: 'Public',
      dataIndex: 'is_public',
      width: 100,
      render: (pub) => <Tag color={pub ? 'green' : 'default'}>{pub ? 'Yes' : 'No'}</Tag>,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      width: 200,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Button 
          type="primary" 
          icon={<EditOutlined />} 
          size="small" 
          onClick={() => handleEdit(record)}
        >
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Card 
        title="System Settings" 
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
        }
      >
        <Table 
          columns={columns} 
          dataSource={data} 
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>

      <Modal
        title={`Edit Setting: ${editingItem?.key}`}
        open={isModalVisible}
        onOk={handleOk}
        onCancel={() => setIsModalVisible(false)}
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item
            name="value"
            label="Value"
            rules={[{ required: true, message: 'Please enter value' }]}
          >
            <Input.TextArea rows={6} />
          </Form.Item>
          
          <Form.Item
            name="description"
            label="Description"
          >
            <Input.TextArea rows={2} />
          </Form.Item>

          <Form.Item
            name="is_public"
            label="Public Access"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SystemSettings;
