import React, { useRef, useState } from 'react';
import { Tag, Button, Form, Select, Input, message } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { ProTable, ActionType, ProColumns } from '@ant-design/pro-components';
import request from '@/utils/request';
import ResizableModal from '../../components/ResizableModal';

interface FeedbackItem {
  id: number;
  user_id: string | null;
  type: string;
  title: string;
  description: string;
  status: string;
  context: Record<string, any>;
  ip_address: string | null;
  user_agent: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

const TYPE_COLORS: Record<string, string> = {
  bug: 'red',
  suggestion: 'blue',
  other: 'default',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'orange',
  reviewing: 'blue',
  resolved: 'green',
  closed: 'default',
};

const Feedback: React.FC = () => {
  const actionRef = useRef<ActionType>();
  
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailItem, setDetailItem] = useState<FeedbackItem | null>(null);
  const [form] = Form.useForm();
  const [updating, setUpdating] = useState(false);

  const handleOpenDetail = (item: FeedbackItem) => {
    setDetailItem(item);
    form.setFieldsValue({
      status: item.status,
      admin_note: item.admin_note,
    });
    setDetailVisible(true);
  };

  const handleUpdate = async () => {
    if (!detailItem) return;
    try {
      const values = await form.validateFields();
      setUpdating(true);
      await request.put(`/admin/feedback/${detailItem.id}`, values);
      message.success('Updated successfully');
      setDetailVisible(false);
      actionRef.current?.reload();
    } catch {
      /* handled */
    } finally {
      setUpdating(false);
    }
  };

  const columns: ProColumns<FeedbackItem>[] = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 60,
      search: false,
      sorter: (a, b) => a.id - b.id,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      valueType: 'select',
      valueEnum: {
        bug: { text: 'Bug', status: 'Error' },
        suggestion: { text: 'Suggestion', status: 'Processing' },
        other: { text: 'Other', status: 'Default' },
      },
      width: 100,
      sorter: (a, b) => a.type.localeCompare(b.type),
      render: (_, record) => (
        <Tag color={TYPE_COLORS[record.type]}>{record.type.toUpperCase()}</Tag>
      ),
    },
    {
      title: 'Title',
      dataIndex: 'title',
      ellipsis: true,
      search: false,
      sorter: (a, b) => a.title.localeCompare(b.title),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      valueType: 'select',
      valueEnum: {
        pending: { text: 'Pending', status: 'Warning' },
        reviewing: { text: 'Reviewing', status: 'Processing' },
        resolved: { text: 'Resolved', status: 'Success' },
        closed: { text: 'Closed', status: 'Default' },
      },
      width: 100,
      sorter: (a, b) => a.status.localeCompare(b.status),
      render: (_, record) => (
        <Tag color={STATUS_COLORS[record.status]}>{record.status.toUpperCase()}</Tag>
      ),
    },
    {
      title: 'User ID',
      dataIndex: 'user_id',
      copyable: true,
      search: false,
      width: 150,
      sorter: (a, b) => (a.user_id || '').localeCompare(b.user_id || ''),
      render: (v) => v || '-',
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      valueType: 'dateTime',
      search: false,
      width: 160,
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    },
    {
      title: 'Action',
      valueType: 'option',
      width: 80,
      render: (_, record) => [
        <Button key="view" size="small" icon={<EyeOutlined />} onClick={() => handleOpenDetail(record)}>
          View
        </Button>
      ],
    },
  ];

  return (
    <>
      <ProTable<FeedbackItem>
        headerTitle="Feedback Management"
        actionRef={actionRef}
        rowKey="id"
        search={{
          labelWidth: 'auto',
        }}
        request={async (params) => {
          const { current, pageSize, type, status } = params;
          const res: any = await request.get('/admin/feedback', {
            params: {
              page: current,
              size: pageSize,
              type,
              status,
            },
          });
          return {
            data: res.items,
            success: true,
            total: res.total,
          };
        }}
        columns={columns}
        pagination={{
          pageSize: 20,
        }}
      />
      
      <ResizableModal
        title="Feedback Detail"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        onOk={handleUpdate}
        confirmLoading={updating}
        width={600}
      >
        {detailItem && (
          <Form form={form} layout="vertical">
            <div style={{ marginBottom: 16 }}>
               <p><strong>Title:</strong> {detailItem.title}</p>
               <p><strong>Description:</strong></p>
               <div style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, maxHeight: 200, overflowY: 'auto' }}>
                 {detailItem.description}
               </div>
               {detailItem.context && Object.keys(detailItem.context).length > 0 && (
                 <>
                   <p style={{ marginTop: 8 }}><strong>Context:</strong></p>
                   <pre style={{ fontSize: 12 }}>{JSON.stringify(detailItem.context, null, 2)}</pre>
                 </>
               )}
            </div>
            
            <Form.Item name="status" label="Status" rules={[{ required: true }]}>
              <Select>
                <Select.Option value="pending">Pending</Select.Option>
                <Select.Option value="reviewing">Reviewing</Select.Option>
                <Select.Option value="resolved">Resolved</Select.Option>
                <Select.Option value="closed">Closed</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="admin_note" label="Admin Note">
              <Input.TextArea rows={3} placeholder="Internal note..." />
            </Form.Item>
          </Form>
        )}
      </ResizableModal>
    </>
  );
};

export default Feedback;
