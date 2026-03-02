import React, { useState, useEffect } from 'react';
import { Table, Card, Tag, Select, Button, Space, Modal, Descriptions, Input, message } from 'antd';
import { ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';
import dayjs from 'dayjs';

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

const TYPE_LABELS: Record<string, string> = {
  bug: 'Bug',
  suggestion: '建议',
  other: '其他',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'orange',
  reviewing: 'blue',
  resolved: 'green',
  closed: 'default',
};

const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  reviewing: '处理中',
  resolved: '已解决',
  closed: '已关闭',
};

const Feedback: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FeedbackItem[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const [detailVisible, setDetailVisible] = useState(false);
  const [detailItem, setDetailItem] = useState<FeedbackItem | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [updating, setUpdating] = useState(false);

  const fetchData = async (page = 1, size = 20) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const res = await axios.get('/api/v1/admin/feedback', {
        params: {
          page,
          size,
          type: typeFilter || undefined,
          status: statusFilter || undefined,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(res.data.items);
      setPagination((prev) => ({ ...prev, current: page, total: res.data.total }));
    } catch {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(1, pagination.pageSize);
  }, [typeFilter, statusFilter]);

  const handleOpenDetail = (item: FeedbackItem) => {
    setDetailItem(item);
    setNewStatus(item.status);
    setAdminNote(item.admin_note || '');
    setDetailVisible(true);
  };

  const handleUpdateStatus = async () => {
    if (!detailItem) return;
    setUpdating(true);
    try {
      const token = localStorage.getItem('admin_token');
      await axios.put(
        `/api/v1/admin/feedback/${detailItem.id}`,
        { status: newStatus, admin_note: adminNote },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      message.success('已更新');
      setDetailVisible(false);
      fetchData(pagination.current, pagination.pageSize);
    } catch {
      message.error('更新失败');
    } finally {
      setUpdating(false);
    }
  };

  const columns: ColumnsType<FeedbackItem> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 60,
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 90,
      render: (type) => <Tag color={TYPE_COLORS[type] || 'default'}>{TYPE_LABELS[type] || type}</Tag>,
    },
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s) => <Tag color={STATUS_COLORS[s] || 'default'}>{STATUS_LABELS[s] || s}</Tag>,
    },
    {
      title: '用户 ID',
      dataIndex: 'user_id',
      width: 130,
      render: (id) => (id ? <Tag>{id.substring(0, 8)}…</Tag> : <span style={{ color: '#aaa' }}>匿名</span>),
    },
    {
      title: '提交时间',
      dataIndex: 'created_at',
      width: 170,
      render: (d) => dayjs(d).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      width: 80,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => handleOpenDetail(record)}
        >
          详情
        </Button>
      ),
    },
  ];

  return (
    <Card
      title="问题反馈"
      extra={
        <Space>
          <Select
            allowClear
            placeholder="类型筛选"
            style={{ width: 110 }}
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: 'bug', label: 'Bug' },
              { value: 'suggestion', label: '建议' },
              { value: 'other', label: '其他' },
            ]}
          />
          <Select
            allowClear
            placeholder="状态筛选"
            style={{ width: 110 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'pending', label: '待处理' },
              { value: 'reviewing', label: '处理中' },
              { value: 'resolved', label: '已解决' },
              { value: 'closed', label: '已关闭' },
            ]}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchData(1, pagination.pageSize)}
          >
            刷新
          </Button>
        </Space>
      }
    >
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        columns={columns}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          onChange: (page, size) => fetchData(page, size),
          showTotal: (total) => `共 ${total} 条`,
        }}
        size="middle"
      />

      <Modal
        title="反馈详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setDetailVisible(false)}>
            关闭
          </Button>,
          <Button key="save" type="primary" loading={updating} onClick={handleUpdateStatus}>
            保存
          </Button>,
        ]}
        width={640}
      >
        {detailItem && (
          <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
            <Descriptions.Item label="ID">{detailItem.id}</Descriptions.Item>
            <Descriptions.Item label="类型">
              <Tag color={TYPE_COLORS[detailItem.type]}>{TYPE_LABELS[detailItem.type] || detailItem.type}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="标题">{detailItem.title}</Descriptions.Item>
            <Descriptions.Item label="描述">
              <div style={{ whiteSpace: 'pre-wrap' }}>{detailItem.description}</div>
            </Descriptions.Item>
            <Descriptions.Item label="用户 ID">{detailItem.user_id || '匿名'}</Descriptions.Item>
            <Descriptions.Item label="上下文">
              {detailItem.context
                ? Object.entries(detailItem.context)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' | ')
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="IP">{detailItem.ip_address || '-'}</Descriptions.Item>
            <Descriptions.Item label="提交时间">{dayjs(detailItem.created_at).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
          </Descriptions>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>状态</div>
            <Select
              value={newStatus}
              onChange={setNewStatus}
              style={{ width: '100%' }}
              options={[
                { value: 'pending', label: '待处理' },
                { value: 'reviewing', label: '处理中' },
                { value: 'resolved', label: '已解决' },
                { value: 'closed', label: '已关闭' },
              ]}
            />
          </div>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>管理员备注</div>
            <Input.TextArea
              rows={3}
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder="可选：添加处理备注"
            />
          </div>
        </div>
      </Modal>
    </Card>
  );
};

export default Feedback;
