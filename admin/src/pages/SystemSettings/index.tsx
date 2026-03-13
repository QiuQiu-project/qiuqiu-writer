import React, { useRef, useState } from 'react';
import { Button, Tag, message, Form, Input, Switch } from 'antd';
import { ProTable, ActionType, ProColumns } from '@ant-design/pro-components';
import { EditOutlined } from '@ant-design/icons';
import request from '@/utils/request';
import ResizableModal from '@/components/ResizableModal';

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
  const actionRef = useRef<ActionType>();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<SystemSetting | null>(null);
  const [form] = Form.useForm();

  const handleEdit = (record: SystemSetting) => {
    setEditingItem(record);
    form.setFieldsValue({
      ...record,
      value: typeof record.value === 'object' ? JSON.stringify(record.value, null, 2) : record.value,
    });
    setModalVisible(true);
  };

  const handleUpdate = async () => {
    try {
      const values = await form.validateFields();
      
      // Try to parse JSON if it looks like one
      let finalValue = values.value;
      try {
        if (typeof values.value === 'string' && (values.value.trim().startsWith('{') || values.value.trim().startsWith('['))) {
          finalValue = JSON.parse(values.value);
        }
      } catch (e) {
        // Ignore, treat as string
      }

      await request.put(`/admin/system-settings/${editingItem!.id}`, {
        ...values,
        value: finalValue
      });
      
      message.success('Setting updated successfully');
      setModalVisible(false);
      actionRef.current?.reload();
    } catch (error) {
      // handled by interceptor
    }
  };

  const columns: ProColumns<SystemSetting>[] = [
    {
      title: 'Key',
      dataIndex: 'key',
      copyable: true,
      width: 200,
      sorter: (a, b) => a.key.localeCompare(b.key),
      render: (text) => <span style={{ fontWeight: 'bold' }}>{text}</span>,
    },
    {
      title: 'Value',
      dataIndex: 'value',
      search: false,
      render: (val) => (
        <pre style={{ margin: 0, maxHeight: 100, overflow: 'auto', fontSize: 12 }}>
          {typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val)}
        </pre>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      width: 120,
      sorter: (a, b) => (a.category || '').localeCompare(b.category || ''),
      render: (cat) => cat ? <Tag color="blue">{cat}</Tag> : '-',
    },
    {
      title: 'Public',
      dataIndex: 'is_public',
      width: 100,
      valueEnum: {
        true: { text: 'Yes', status: 'Success' },
        false: { text: 'No', status: 'Default' },
      },
      sorter: (a, b) => (a.is_public === b.is_public ? 0 : a.is_public ? -1 : 1),
      render: (pub) => <Tag color={pub ? 'green' : 'default'}>{pub ? 'Yes' : 'No'}</Tag>,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      search: false,
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
    <>
      <ProTable<SystemSetting>
        headerTitle="System Settings"
        actionRef={actionRef}
        rowKey="id"
        search={{
          labelWidth: 'auto',
        }}
        request={async (params) => {
          const res: any = await request.get('/admin/system-settings');
          let data = Array.isArray(res) ? res : [];
          
          if (params.key) {
            data = data.filter((item: SystemSetting) => item.key.toLowerCase().includes((params.key as string).toLowerCase()));
          }
          if (params.category) {
             data = data.filter((item: SystemSetting) => item.category?.toLowerCase().includes((params.category as string).toLowerCase()));
          }

          return {
            data,
            success: true,
            total: data.length,
          };
        }}
        columns={columns}
        pagination={{
          pageSize: 20,
        }}
      />
      
      <ResizableModal
        title={`Edit Setting: ${editingItem?.key}`}
        open={modalVisible}
        onOk={handleUpdate}
        onCancel={() => setModalVisible(false)}
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
      </ResizableModal>
    </>
  );
};

export default SystemSettings;
