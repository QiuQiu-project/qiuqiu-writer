import React, { useState, useEffect } from 'react';
import {
  Card, Row, Col, Statistic, Table, Tag, Typography, Space, Button,
  Modal, Form, Select, InputNumber, Input, message, Progress,
  Switch, Popconfirm,
} from 'antd';
import {
  UserOutlined, ThunderboltOutlined, EditOutlined, SaveOutlined,
  SearchOutlined, PlusOutlined, DeleteOutlined,
} from '@ant-design/icons';
import request from '@/utils/request';

const { Title, Text } = Typography;
const { Option } = Select;

// ── Types ──────────────────────────────────────────────────────────────────────
interface PlanPricePoint {
  original: number;
  current: number;
}

interface PlanPricing {
  monthly: PlanPricePoint;
  quarterly: PlanPricePoint;
  yearly: PlanPricePoint;
}

interface PlanConfig {
  key: string;
  label: string;
  tokens: number;
  desc: string;
  highlight: boolean;
  badge: string | null;
  pricing: PlanPricing;
}

const DEFAULT_PRICING: PlanPricing = {
  monthly:   { original: 0, current: 0 },
  quarterly: { original: 0, current: 0 },
  yearly:    { original: 0, current: 0 },
};

const BILLING_CYCLES: Array<{ key: keyof PlanPricing; label: string }> = [
  { key: 'monthly',   label: '月付' },
  { key: 'quarterly', label: '季付' },
  { key: 'yearly',    label: '年付' },
];

function tokensToWanZi(tokens: number): string {
  const chars = Math.floor(tokens / 1.5);
  if (chars >= 10000) return `${(chars / 10000).toFixed(1)}万字`;
  return `${chars}字`;
}

// ── Plan Config Row Editor ─────────────────────────────────────────────────────
interface PlanConfigRowProps {
  value: PlanConfig;
  onChange: (v: PlanConfig) => void;
  onDelete: () => void;
}

function PlanConfigRow({ value, onChange, onDelete }: PlanConfigRowProps) {
  const set = <K extends keyof PlanConfig>(k: K, v: PlanConfig[K]) =>
    onChange({ ...value, [k]: v });

  const setPrice = (cycle: keyof PlanPricing, field: keyof PlanPricePoint, v: number) =>
    onChange({
      ...value,
      pricing: {
        ...value.pricing,
        [cycle]: { ...value.pricing[cycle], [field]: v },
      },
    });

  const cellStyle: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'top' };
  const numStyle: React.CSSProperties = { width: 80 };

  return (
    <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
      {/* 标识符 */}
      <td style={{ ...cellStyle, minWidth: 110 }}>
        <Input size="small" value={value.key} onChange={(e) => set('key', e.target.value.trim())} placeholder="唯一标识符" />
      </td>
      {/* 名称 */}
      <td style={{ ...cellStyle, minWidth: 90 }}>
        <Input size="small" value={value.label} onChange={(e) => set('label', e.target.value)} placeholder="显示名称" />
      </td>
      {/* Token 额度 */}
      <td style={{ ...cellStyle, minWidth: 160 }}>
        <InputNumber
          size="small" min={0} max={100_000_000} step={100_000}
          style={{ width: '100%' }} value={value.tokens}
          formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          parser={(v) => Number(v?.replace(/,/g, '') ?? 0)}
          onChange={(v) => set('tokens', v ?? 0)}
          addonAfter={<span style={{ fontSize: 11, color: '#999' }}>{tokensToWanZi(value.tokens)}</span>}
        />
      </td>
      {/* 描述 */}
      <td style={{ ...cellStyle, minWidth: 140 }}>
        <Input size="small" value={value.desc} onChange={(e) => set('desc', e.target.value)} placeholder="套餐描述" />
      </td>
      {/* 高亮 */}
      <td style={{ ...cellStyle, textAlign: 'center', minWidth: 52 }}>
        <Switch size="small" checked={value.highlight} onChange={(v) => set('highlight', v)} />
      </td>
      {/* 徽章 */}
      <td style={{ ...cellStyle, minWidth: 90 }}>
        <Input size="small" value={value.badge ?? ''} onChange={(e) => set('badge', e.target.value || null)} placeholder="如：推荐" />
      </td>
      {/* 月付 原价/现价 */}
      {BILLING_CYCLES.map(({ key }) => (
        <React.Fragment key={key}>
          <td style={{ ...cellStyle, minWidth: 80 }}>
            <InputNumber
              size="small" min={0} step={1} style={numStyle}
              value={value.pricing[key].original}
              onChange={(v) => setPrice(key, 'original', v ?? 0)}
              prefix="¥"
            />
          </td>
          <td style={{ ...cellStyle, minWidth: 80 }}>
            <InputNumber
              size="small" min={0} step={1} style={numStyle}
              value={value.pricing[key].current}
              onChange={(v) => setPrice(key, 'current', v ?? 0)}
              prefix="¥"
            />
          </td>
        </React.Fragment>
      ))}
      {/* 删除 */}
      <td style={{ ...cellStyle, textAlign: 'center' }}>
        <Popconfirm title="确认删除此套餐？" onConfirm={onDelete} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      </td>
    </tr>
  );
}

// ── Plans Page ─────────────────────────────────────────────────────────────────
const Plans: React.FC = () => {
  // ── Plan configs ─────────────────────────────────────────────────────────
  const [planConfigs, setPlanConfigs] = useState<PlanConfig[]>([]);
  const [configLoading, setConfigLoading] = useState(false);
  const [editingConfigs, setEditingConfigs] = useState<PlanConfig[] | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const isEditing = editingConfigs !== null;

  const fetchPlanConfigs = async () => {
    setConfigLoading(true);
    try {
      const res = await request.get<PlanConfig[]>('/admin/plans/config');
      setPlanConfigs(res as unknown as PlanConfig[]);
    } finally {
      setConfigLoading(false);
    }
  };

  const handleStartEdit = () => setEditingConfigs(planConfigs.map((p) => ({
    ...p,
    pricing: p.pricing ?? { ...DEFAULT_PRICING },
  })));
  const handleCancelEdit = () => setEditingConfigs(null);

  const handleSaveConfig = async () => {
    if (!editingConfigs) return;
    const keys = editingConfigs.map((p) => p.key.trim()).filter(Boolean);
    if (new Set(keys).size !== keys.length || keys.some((k) => !k)) {
      message.error('套餐标识符不能为空或重复');
      return;
    }
    setSavingConfig(true);
    try {
      const body = { plans: editingConfigs.map((p) => ({ ...p, key: p.key.trim() })) };
      const res = await request.put<PlanConfig[]>('/admin/plans/config', body);
      setPlanConfigs(res as unknown as PlanConfig[]);
      setEditingConfigs(null);
      message.success('套餐配置已保存');
      fetchUsers(pagination.current, pagination.pageSize, keyword, filterPlan);
    } catch {
      /* handled by interceptor */
    } finally {
      setSavingConfig(false);
    }
  };

  const handleAddPlan = () => {
    setEditingConfigs((prev) => [
      ...(prev ?? []),
      { key: '', label: '', tokens: 0, desc: '', highlight: false, badge: null, pricing: { ...DEFAULT_PRICING } },
    ]);
  };

  const handleUpdateRow = (idx: number, val: PlanConfig) =>
    setEditingConfigs((prev) => { if (!prev) return prev; const next = [...prev]; next[idx] = val; return next; });

  const handleDeleteRow = (idx: number) =>
    setEditingConfigs((prev) => prev ? prev.filter((_, i) => i !== idx) : prev);

  // ── User list ─────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [keyword, setKeyword] = useState('');
  const [filterPlan, setFilterPlan] = useState<string | undefined>(undefined);

  const [isPlanModalVisible, setIsPlanModalVisible] = useState(false);
  const [planUser, setPlanUser] = useState<any>(null);
  const [planForm] = Form.useForm();
  const [planLoading, setPlanLoading] = useState(false);

  const planStats = React.useMemo(() => {
    const counts: Record<string, number> = {};
    users.forEach((u) => { const p = u.plan || 'free'; counts[p] = (counts[p] || 0) + 1; });
    return counts;
  }, [users]);

  const fetchUsers = async (page = 1, size = 20, search = '', plan?: string) => {
    setLoading(true);
    try {
      const res: any = await request.get('/admin/users', { params: { page, size, keyword: search } });
      let items = res.items || [];
      if (plan) items = items.filter((u: any) => (u.plan || 'free') === plan);
      setUsers(items);
      setPagination({ current: res.page, pageSize: res.size, total: plan ? items.length : res.total });
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchPlanConfigs(); fetchUsers(); }, []);

  const handleSearch = () => fetchUsers(1, pagination.pageSize, keyword, filterPlan);
  const handleTableChange = (pag: any) => fetchUsers(pag.current, pag.pageSize, keyword, filterPlan);

  const planLabelMap = React.useMemo(
    () => Object.fromEntries(planConfigs.map((p) => [p.key, p.label])), [planConfigs]);
  const planTokenMap = React.useMemo(
    () => Object.fromEntries(planConfigs.map((p) => [p.key, p.tokens])), [planConfigs]);

  const handleOpenPlan = (record: any) => {
    setPlanUser(record);
    planForm.setFieldsValue({ plan: record.plan || 'free', override_remaining: null, plan_expires_at: null });
    setIsPlanModalVisible(true);
  };

  const handleSetPlan = async () => {
    setPlanLoading(true);
    try {
      const values = await planForm.validateFields();
      const body: any = { plan: values.plan };
      if (values.override_remaining != null) body.override_remaining = values.override_remaining;
      if (values.plan_expires_at) body.plan_expires_at = values.plan_expires_at;
      await request.put(`/admin/users/${planUser.id}/plan`, body);
      message.success(`套餐已更新为 ${planLabelMap[values.plan] ?? values.plan}`);
      setIsPlanModalVisible(false);
      fetchUsers(pagination.current, pagination.pageSize, keyword, filterPlan);
    } catch { /* handled */ } finally { setPlanLoading(false); }
  };

  const columns = [
    { title: '用户名', dataIndex: 'username', key: 'username', width: 130 },
    { title: '邮箱', dataIndex: 'email', key: 'email', ellipsis: true },
    {
      title: '套餐', dataIndex: 'plan', key: 'plan', width: 90,
      render: (plan: string) => <Tag>{planLabelMap[plan] || plan}</Tag>,
    },
    {
      title: 'Token 余量', key: 'token', width: 200,
      render: (_: any, record: any) => {
        const total = planTokenMap[record.plan] ?? 100_000;
        const remaining = record.token_remaining ?? 0;
        const pct = total > 0 ? Math.round((remaining / total) * 100) : 0;
        const strokeColor = pct < 10 ? '#ff4d4f' : pct < 30 ? '#faad14' : '#52c41a';
        return (
          <div>
            <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span>{tokensToWanZi(remaining)}</span>
              <span style={{ color: '#999' }}>/ {tokensToWanZi(total)}</span>
            </div>
            <Progress percent={pct} showInfo={false} strokeColor={strokeColor} size="small" />
          </div>
        );
      },
    },
    { title: '重置时间', dataIndex: 'token_reset_at', key: 'token_reset_at', width: 130, render: (v: string) => v ? new Date(v).toLocaleDateString('zh-CN') : '-' },
    { title: '套餐到期', dataIndex: 'plan_expires_at', key: 'plan_expires_at', width: 130, render: (v: string) => v ? new Date(v).toLocaleDateString('zh-CN') : '永久' },
    {
      title: '操作', key: 'action', width: 90,
      render: (_: any, record: any) => (
        <Button size="small" icon={<ThunderboltOutlined />} onClick={() => handleOpenPlan(record)}>设置套餐</Button>
      ),
    },
  ];

  // ── Price summary for read mode cards ────────────────────────────────────
  function PriceTag({ plan }: { plan: PlanConfig }) {
    const m = plan.pricing?.monthly;
    if (!m || (m.original === 0 && m.current === 0)) return <Text type="secondary" style={{ fontSize: 12 }}>免费</Text>;
    return (
      <Text style={{ fontSize: 12 }}>
        月付 <Text strong>¥{m.current}</Text>
        {m.original > m.current && <Text type="secondary" style={{ textDecoration: 'line-through', marginLeft: 4, fontSize: 11 }}>¥{m.original}</Text>}
      </Text>
    );
  }

  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>套餐管理</Title>

      {/* ── Plan config editor ── */}
      <Card
        title="套餐配置"
        loading={configLoading}
        style={{ marginBottom: 24 }}
        extra={
          isEditing ? (
            <Space>
              <Button onClick={handleCancelEdit}>取消</Button>
              <Button type="primary" icon={<SaveOutlined />} loading={savingConfig} onClick={handleSaveConfig}>保存配置</Button>
            </Space>
          ) : (
            <Button icon={<EditOutlined />} onClick={handleStartEdit}>编辑</Button>
          )
        }
      >
        {isEditing ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  {[
                    '标识符', '名称', '月额度', '描述', '高亮', '徽章',
                    '月付原价', '月付现价',
                    '季付原价', '季付现价',
                    '年付原价', '年付现价',
                    '',
                  ].map((h, i) => (
                    <th key={i} style={{ padding: '8px', fontWeight: 500, textAlign: 'left', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {editingConfigs!.map((row, idx) => (
                  <PlanConfigRow key={idx} value={row} onChange={(v) => handleUpdateRow(idx, v)} onDelete={() => handleDeleteRow(idx)} />
                ))}
              </tbody>
            </table>
            <Button type="dashed" icon={<PlusOutlined />} style={{ marginTop: 12 }} onClick={handleAddPlan}>
              添加套餐
            </Button>
          </div>
        ) : (
          <Row gutter={16}>
            {planConfigs.map((plan) => (
              <Col span={Math.max(6, Math.floor(24 / Math.max(planConfigs.length, 1)))} key={plan.key} style={{ minWidth: 200, marginBottom: 8 }}>
                <Card bordered size="small" style={{ borderTop: `3px solid ${plan.highlight ? '#1677ff' : '#d9d9d9'}` }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
                    {plan.label}
                    {plan.badge && <Tag color="blue" style={{ marginLeft: 6, fontSize: 11 }}>{plan.badge}</Tag>}
                  </div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>{plan.desc}</div>
                  <Space direction="vertical" size={2}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      月配额：<Text strong>{tokensToWanZi(plan.tokens)}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>{' '}（{plan.tokens.toLocaleString()} tokens）</Text>
                    </Text>
                    <PriceTag plan={plan} />
                    <Statistic prefix={<UserOutlined />} value={planStats[plan.key] ?? 0} suffix="人" valueStyle={{ fontSize: 16 }} />
                    <Text type="secondary" style={{ fontSize: 11 }}>key: {plan.key}</Text>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Card>

      {/* ── User list ── */}
      <Card
        title="用户列表"
        extra={
          <Space>
            <Select placeholder="按套餐筛选" allowClear style={{ width: 140 }} value={filterPlan}
              onChange={(v) => { setFilterPlan(v); fetchUsers(1, pagination.pageSize, keyword, v); }}>
              {planConfigs.map((p) => <Option key={p.key} value={p.key}>{p.label}</Option>)}
            </Select>
            <Input placeholder="搜索用户名/邮箱" value={keyword} onChange={(e) => setKeyword(e.target.value)} onPressEnter={handleSearch} style={{ width: 180 }} />
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>搜索</Button>
          </Space>
        }
      >
        <Table columns={columns} dataSource={users} rowKey="id" pagination={pagination} loading={loading} onChange={handleTableChange} scroll={{ x: 900 }} />
      </Card>

      {/* ── Set plan modal ── */}
      <Modal
        title={`设置套餐：${planUser?.username}`}
        open={isPlanModalVisible} onOk={handleSetPlan} confirmLoading={planLoading}
        onCancel={() => setIsPlanModalVisible(false)} okText="确认设置" cancelText="取消" width={460}
      >
        <Form form={planForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="plan" label="套餐" rules={[{ required: true, message: '请选择套餐' }]}>
            <Select>
              {planConfigs.map((p) => (
                <Option key={p.key} value={p.key}>{p.label}（{tokensToWanZi(p.tokens)}/月）</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="override_remaining" label="自定义 Token 余量（留空则重置为套餐满额）">
            <InputNumber min={0} max={100_000_000} style={{ width: '100%' }} placeholder="留空 = 套餐满额" />
          </Form.Item>
          <Form.Item name="plan_expires_at" label="套餐到期时间（ISO 格式，留空为永久）">
            <Input placeholder="例：2026-12-31T00:00:00Z" />
          </Form.Item>
        </Form>
        {planUser && (
          <div style={{ background: '#f5f5f5', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#666' }}>
            当前：<strong>{planLabelMap[planUser.plan] || planUser.plan}</strong>，
            余量 <strong>{tokensToWanZi(planUser.token_remaining ?? 0)}</strong>
            （{(planUser.token_remaining ?? 0).toLocaleString()} tokens）
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Plans;
