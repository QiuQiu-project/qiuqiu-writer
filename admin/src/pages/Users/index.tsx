import React, { useRef, useState } from 'react';
import {
  Button, Tag, Space, Modal, message, Form, Select,
  Input, InputNumber, Tooltip, Progress
} from 'antd';
import { ProTable, ActionType, ProColumns } from '@ant-design/pro-components';
import {
  ExclamationCircleOutlined, EditOutlined,
  ThunderboltOutlined,
  SearchOutlined
} from '@ant-design/icons';
import request from '@/utils/request';
import ResizableModal from '@/components/ResizableModal';

const { confirm } = Modal;
const { Option } = Select;

const PLAN_LABELS: Record<string, string> = {
  free: '免费版',
  pro: '专业版',
  creator: '创作者版',
};
const PLAN_TOTALS: Record<string, number> = {
  free: 100_000,
  pro: 1_500_000,
  creator: 5_000_000,
};
const PLAN_COLORS: Record<string, string> = {
  free: 'default',
  pro: 'blue',
  creator: 'purple',
};

function tokensToWanZi(tokens: number): string {
  const chars = Math.floor(tokens / 1.5);
  if (chars >= 10000) return `${(chars / 10000).toFixed(1)}万字`;
  return `${chars}字`;
}

const Users: React.FC = () => {
  const actionRef = useRef<ActionType>();
  
  // Edit user modal
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editForm] = Form.useForm();

  // Set plan modal
  const [isPlanModalVisible, setIsPlanModalVisible] = useState(false);
  const [planUser, setPlanUser] = useState<any>(null);
  const [planForm] = Form.useForm();
  const [planLoading, setPlanLoading] = useState(false);

  // ── Edit user ─────────────────────────────────────────────────────────────
  const handleEdit = (record: any) => {
    setEditingUser(record);
    editForm.setFieldsValue({
      email: record.email,
      display_name: record.display_name,
      phone: record.phone,
      avatar_url: record.avatar_url,
    });
    setIsEditModalVisible(true);
  };

  const handleUpdate = async () => {
    try {
      const values = await editForm.validateFields();
      await request.put(`/admin/users/${editingUser.id}`, values);
      message.success('用户信息已更新');
      setIsEditModalVisible(false);
      actionRef.current?.reload();
    } catch {
      message.error('更新失败');
    }
  };

  // ── Ban / Activate ─────────────────────────────────────────────────────────
  const handleStatusChange = (record: any, newStatus: string) => {
    confirm({
      title: `确认${newStatus === 'active' ? '激活' : '封禁'}用户 ${record.username}？`,
      icon: <ExclamationCircleOutlined />,
      onOk: async () => {
        try {
          await request.put(`/admin/users/${record.id}/status`, { status: newStatus });
          message.success('状态已更新');
          actionRef.current?.reload();
        } catch {
          /* handled by interceptor */
        }
      },
    });
  };

  // ── Set plan ───────────────────────────────────────────────────────────────
  const handleOpenPlan = (record: any) => {
    setPlanUser(record);
    planForm.setFieldsValue({
      plan: record.plan || 'free',
      override_remaining: null,
      plan_expires_at: null,
    });
    setIsPlanModalVisible(true);
  };

  const handleSetPlan = async () => {
    setPlanLoading(true);
    try {
      const values = await planForm.validateFields();
      const body: any = { plan: values.plan };
      if (values.override_remaining != null) {
        body.override_remaining = values.override_remaining;
      }
      if (values.plan_expires_at) {
        body.plan_expires_at = values.plan_expires_at;
      }
      await request.put(`/admin/users/${planUser.id}/plan`, body);
      message.success(`套餐已更新为 ${PLAN_LABELS[values.plan]}`);
      setIsPlanModalVisible(false);
      actionRef.current?.reload();
    } catch {
      /* handled by interceptor */
    } finally {
      setPlanLoading(false);
    }
  };

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns: ProColumns<any>[] = [
    {
      title: '搜索',
      dataIndex: 'keyword',
      hideInTable: true,
      tooltip: '搜索用户名/邮箱',
      fieldProps: {
        prefix: <SearchOutlined />,
        placeholder: '输入用户名/邮箱搜索',
      },
    },
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 100,
      ellipsis: true,
      search: false,
      sorter: (a, b) => a.id.localeCompare(b.id),
      render: (_, entity) => (
        <Tooltip title={entity.id}>
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{entity.id.slice(0, 8)}…</span>
        </Tooltip>
      ),
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 120,
      search: false,
      copyable: true,
      sorter: (a, b) => a.username.localeCompare(b.username),
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      ellipsis: true,
      search: false,
      copyable: true,
      sorter: (a, b) => a.email.localeCompare(b.email),
    },
    {
      title: '昵称',
      dataIndex: 'display_name',
      key: 'display_name',
      width: 120,
      search: false,
      sorter: (a, b) => (a.display_name || '').localeCompare(b.display_name || ''),
      render: (v: any) => v || '-',
    },
    {
      title: '套餐',
      dataIndex: 'plan',
      key: 'plan',
      width: 100,
      search: false,
      sorter: (a, b) => (a.plan || '').localeCompare(b.plan || ''),
      render: (_, record) => (
        <Tag color={PLAN_COLORS[record.plan] || 'default'}>{PLAN_LABELS[record.plan] || record.plan}</Tag>
      ),
    },
    {
      title: 'Token 余量',
      key: 'token',
      width: 180,
      search: false,
      sorter: (a, b) => (a.token_remaining || 0) - (b.token_remaining || 0),
      render: (_, record) => {
        const total = PLAN_TOTALS[record.plan] ?? record.token_remaining ?? 0;
        const remaining = record.token_remaining ?? 0;
        const pct = total > 0 ? Math.round((remaining / total) * 100) : 0;
        const color = pct < 10 ? '#ff4d4f' : pct < 30 ? '#faad14' : '#52c41a';
        return (
          <div style={{ minWidth: 150 }}>
            <div style={{ fontSize: 12, marginBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
              <span>{tokensToWanZi(remaining)}</span>
              <span style={{ color: '#999' }}>/ {tokensToWanZi(total)}</span>
            </div>
            <Progress percent={pct} showInfo={false} strokeColor={color} size="small" />
          </div>
        );
      },
    },
    {
      title: '套餐到期',
      dataIndex: 'plan_expires_at',
      key: 'plan_expires_at',
      width: 130,
      search: false,
      sorter: (a, b) => new Date(a.plan_expires_at || 0).getTime() - new Date(b.plan_expires_at || 0).getTime(),
      render: (_, record) => record.plan_expires_at ? new Date(record.plan_expires_at).toLocaleDateString('zh-CN') : '永久',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      search: false,
      valueEnum: {
        active: { text: '正常', status: 'Success' },
        banned: { text: '封禁', status: 'Error' },
        inactive: { text: '停用', status: 'Warning' },
      },
      sorter: (a, b) => a.status.localeCompare(b.status),
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      search: false,
      valueType: 'dateTime',
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      search: false,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="primary" ghost size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Button
            size="small"
            icon={<ThunderboltOutlined />}
            onClick={() => handleOpenPlan(record)}
          >
            套餐
          </Button>
          {record.status !== 'banned' ? (
            <Button danger size="small" onClick={() => handleStatusChange(record, 'banned')}>封禁</Button>
          ) : (
            <Button type="primary" size="small" onClick={() => handleStatusChange(record, 'active')}>激活</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <ProTable<any>
        headerTitle="用户管理"
        actionRef={actionRef}
        rowKey="id"
        search={{
          labelWidth: 'auto',
          defaultCollapsed: false,
        }}
        request={async (params) => {
          const { current, pageSize, keyword } = params;
          const res: any = await request.get('/admin/users', {
            params: {
              page: current,
              size: pageSize,
              keyword: keyword,
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
          showSizeChanger: true,
        }}
        scroll={{ x: 1300 }}
      />

      {/* Edit user info modal */}
      <ResizableModal
        title={`编辑用户：${editingUser?.username}`}
        open={isEditModalVisible}
        onOk={handleUpdate}
        onCancel={() => setIsEditModalVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="email" label="邮箱" rules={[{ type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="display_name" label="昵称">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input />
          </Form.Item>
          <Form.Item name="avatar_url" label="头像 URL">
            <Input />
          </Form.Item>
        </Form>
      </ResizableModal>

      {/* Set plan modal */}
      <ResizableModal
        title={`设置套餐：${planUser?.username}`}
        open={isPlanModalVisible}
        onOk={handleSetPlan}
        confirmLoading={planLoading}
        onCancel={() => setIsPlanModalVisible(false)}
        okText="确认设置"
        cancelText="取消"
        width={460}
      >
        <Form form={planForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="plan"
            label="套餐"
            rules={[{ required: true, message: '请选择套餐' }]}
          >
            <Select>
              {Object.entries(PLAN_LABELS).map(([key, label]) => (
                <Option key={key} value={key}>
                  {label}（{tokensToWanZi(PLAN_TOTALS[key])}/月）
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="override_remaining"
            label="自定义 Token 余量（留空则重置为套餐满额）"
          >
            <InputNumber
              min={0}
              max={100_000_000}
              style={{ width: '100%' }}
              placeholder="留空 = 套餐满额"
            />
          </Form.Item>
          <Form.Item
            name="plan_expires_at"
            label="套餐到期时间（ISO 格式，留空为永久）"
          >
            <Input placeholder="例：2026-12-31T00:00:00Z" />
          </Form.Item>
        </Form>
        {planUser && (
          <div style={{ background: '#f5f5f5', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#666' }}>
            当前：<strong>{PLAN_LABELS[planUser.plan] || planUser.plan}</strong>，
            余量 <strong>{tokensToWanZi(planUser.token_remaining)}</strong>
            （{planUser.token_remaining?.toLocaleString()} tokens）
          </div>
        )}
      </ResizableModal>
    </>
  );
};

export default Users;
