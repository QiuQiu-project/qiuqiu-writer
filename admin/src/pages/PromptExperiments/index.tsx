import React, { useRef, useState } from 'react';
import {
  Button, Form, Select, Input, InputNumber, Space, Tag, Switch,
  message, Popconfirm, Tooltip, Divider, Progress, Descriptions, Statistic, Row, Col,
  Modal, Table, Badge,
} from 'antd';
import {
  PlusOutlined, PlayCircleOutlined, PauseCircleOutlined,
  CheckCircleOutlined, DeleteOutlined, BarChartOutlined,
  ExperimentOutlined, MinusCircleOutlined,
} from '@ant-design/icons';
import { ProTable, ActionType, ProColumns } from '@ant-design/pro-components';
import request from '@/utils/request';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Variant {
  id?: number;
  prompt_template_id: number;
  label: string;
  traffic_ratio: number;
  is_control: boolean;
  rating_count?: number;
  rating_avg?: number | null;
  rating_distribution?: Record<string, number>;
}

interface Experiment {
  id: number;
  name: string;
  description?: string;
  template_type: string;
  status: 'draft' | 'running' | 'paused' | 'completed';
  traffic_percent: number;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  variants: Variant[];
  stats?: Variant[];
}

interface PromptTemplate {
  id: number;
  name: string;
  template_type: string;
  version: string;
  is_default: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TEMPLATE_TYPES = [
  { label: '章节分析', value: 'chapter_analysis' },
  { label: '书本分析', value: 'book_analysis' },
  { label: '章节续写', value: 'continue_chapter' },
  { label: '角色提取', value: 'character_extraction' },
  { label: '角色生成', value: 'character_generation' },
  { label: '章节生成', value: 'chapter_generation' },
  { label: '章节摘要', value: 'chapter_summary' },
  { label: '大纲生成', value: 'outline_generation' },
  { label: '细纲生成', value: 'detailed_outline_generation' },
  { label: '组件生成', value: 'component_generate' },
  { label: '剧本场景抽取', value: 'drama_scene_extraction' },
  { label: '剧本角色抽取', value: 'drama_character_extraction' },
  { label: '其他', value: 'other' },
];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  TEMPLATE_TYPES.map(({ value, label }) => [value, label])
);

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  draft: { color: 'default', label: '草稿' },
  running: { color: 'processing', label: '运行中' },
  paused: { color: 'warning', label: '已暂停' },
  completed: { color: 'success', label: '已完成' },
};

// ─── Main Component ───────────────────────────────────────────────────────────

const PromptExperimentsPage: React.FC = () => {
  const actionRef = useRef<ActionType>();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<Experiment | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [allTemplates, setAllTemplates] = useState<PromptTemplate[]>([]);
  const [selectedType, setSelectedType] = useState<string | undefined>();

  // 加载该 template_type 下的所有 prompt 模板（用于选变体）
  const loadTemplates = async (templateType: string) => {
    try {
      const res: any = await request.get('/admin/prompt-templates', {
        params: { template_type: templateType, page: 1, size: 100 },
      });
      const templates = Array.isArray(res)
        ? res
        : Array.isArray(res?.items)
          ? res.items
          : [];
      setAllTemplates(templates);
    } catch {
      setAllTemplates([]);
    }
  };

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      traffic_percent: 100,
      variants: [
        { label: '对照组', traffic_ratio: 50, is_control: true },
        { label: '实验组A', traffic_ratio: 50, is_control: false },
      ],
    });
    setAllTemplates([]);
    setSelectedType(undefined);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    const values = await form.validateFields();
    // 验证流量比例之和
    const total = values.variants.reduce((s: number, v: Variant) => s + (v.traffic_ratio || 0), 0);
    if (Math.abs(total - 100) > 1) {
      message.error(`所有变体流量比例之和必须为 100%，当前为 ${total}%`);
      return;
    }
    setSubmitting(true);
    try {
      await request.post('/admin/prompt-experiments', {
        ...values,
        variants: values.variants.map((v: Variant) => ({
          ...v,
          traffic_ratio: (v.traffic_ratio as unknown as number) / 100,
        })),
      });
      message.success('实验创建成功');
      setCreateOpen(false);
      actionRef.current?.reload();
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (id: number) => {
    try {
      const res: any = await request.get(`/admin/prompt-experiments/${id}`);
      setDetailData(res);
      setDetailOpen(true);
    } catch {
      message.error('加载详情失败');
    }
  };

  const updateStatus = async (id: number, newStatus: string) => {
    try {
      await request.patch(`/admin/prompt-experiments/${id}/status`, { status: newStatus });
      message.success('状态已更新');
      actionRef.current?.reload();
      if (detailData?.id === id) {
        openDetail(id);
      }
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '操作失败');
    }
  };

  const deleteExp = async (id: number) => {
    try {
      await request.delete(`/admin/prompt-experiments/${id}`);
      message.success('已删除');
      actionRef.current?.reload();
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '删除失败');
    }
  };

  // ─── Columns ───────────────────────────────────────────────────────────────

  const columns: ProColumns<Experiment>[] = [
    {
      title: '实验名称',
      dataIndex: 'name',
      ellipsis: true,
      width: 200,
    },
    {
      title: 'Prompt 类型',
      dataIndex: 'template_type',
      width: 130,
      renderText: (v: string) => TYPE_LABEL[v] || v,
      valueType: 'select',
      valueEnum: Object.fromEntries(TEMPLATE_TYPES.map(t => [t.value, { text: t.label }])),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (_, row) => {
        const cfg = STATUS_CONFIG[row.status] || { color: 'default', label: row.status };
        return <Badge status={cfg.color as any} text={cfg.label} />;
      },
      valueType: 'select',
      valueEnum: Object.fromEntries(
        Object.entries(STATUS_CONFIG).map(([k, v]) => [k, { text: v.label }])
      ),
    },
    {
      title: '参与比例',
      dataIndex: 'traffic_percent',
      width: 100,
      search: false,
      renderText: (v: number) => `${v}%`,
    },
    {
      title: '变体数',
      search: false,
      width: 80,
      render: (_, row) => row.variants?.length ?? 0,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 160,
      search: false,
      renderText: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      valueType: 'option',
      width: 200,
      render: (_, row) => [
        <Tooltip title="查看详情 & 统计" key="view">
          <Button size="small" icon={<BarChartOutlined />} onClick={() => openDetail(row.id)} />
        </Tooltip>,
        row.status === 'draft' && (
          <Tooltip title="启动" key="run">
            <Button
              size="small" type="primary" icon={<PlayCircleOutlined />}
              onClick={() => updateStatus(row.id, 'running')}
            />
          </Tooltip>
        ),
        row.status === 'running' && (
          <Tooltip title="暂停" key="pause">
            <Button
              size="small" icon={<PauseCircleOutlined />}
              onClick={() => updateStatus(row.id, 'paused')}
            />
          </Tooltip>
        ),
        (row.status === 'running' || row.status === 'paused') && (
          <Tooltip title="结束实验" key="complete">
            <Popconfirm title="确定结束该实验？结束后不可恢复。" onConfirm={() => updateStatus(row.id, 'completed')}>
              <Button size="small" icon={<CheckCircleOutlined />} />
            </Popconfirm>
          </Tooltip>
        ),
        row.status === 'draft' && (
          <Tooltip title="删除" key="del">
            <Popconfirm title="确定删除该草稿实验？" onConfirm={() => deleteExp(row.id)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
        ),
      ].filter(Boolean),
    },
  ];

  // ─── Variant ratio sum indicator ──────────────────────────────────────────

  const VariantFields: React.FC<{ templateType?: string }> = ({ templateType }) => {
    const variants = form.getFieldValue('variants') || [];
    const total = variants.reduce((s: number, v: any) => s + (Number(v?.traffic_ratio) || 0), 0);

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: '#666' }}>流量合计：</span>
          <Progress
            percent={Math.min(total, 100)}
            size="small"
            style={{ flex: 1, maxWidth: 200 }}
            status={Math.abs(total - 100) < 1 ? 'success' : 'exception'}
          />
          <span style={{ fontSize: 13 }}>{total}% / 100%</span>
        </div>
        <Form.List name="variants">
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name }) => (
                <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline" wrap>
                  <Form.Item name={[name, 'label']} rules={[{ required: true, message: '请填写标签' }]}>
                    <Input placeholder="对照组 / 实验组A" style={{ width: 120 }} />
                  </Form.Item>
                  <Form.Item name={[name, 'prompt_template_id']} rules={[{ required: true, message: '请选择模板' }]}>
                    <Select placeholder="选择 Prompt" style={{ width: 200 }} showSearch optionFilterProp="label"
                      options={allTemplates.map(t => ({
                        value: t.id,
                        label: `${t.name} v${t.version}${t.is_default ? ' ★' : ''}`,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item name={[name, 'traffic_ratio']} rules={[{ required: true, message: '请填写比例' }]}>
                    <InputNumber min={1} max={99} addonAfter="%" style={{ width: 100 }} />
                  </Form.Item>
                  <Form.Item name={[name, 'is_control']} valuePropName="checked">
                    <Switch checkedChildren="对照" unCheckedChildren="实验" />
                  </Form.Item>
                  {fields.length > 2 && (
                    <MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f' }} />
                  )}
                </Space>
              ))}
              <Button
                type="dashed"
                onClick={() => add({ label: `实验组${String.fromCharCode(64 + fields.length)}`, traffic_ratio: 0, is_control: false })}
                icon={<PlusOutlined />}
                disabled={!templateType}
              >
                添加变体
              </Button>
            </>
          )}
        </Form.List>
      </div>
    );
  };

  // ─── Detail Stats Panel ────────────────────────────────────────────────────

  const renderStats = () => {
    if (!detailData?.stats?.length) return <div style={{ color: '#999', padding: '20px 0' }}>暂无评分数据</div>;

    return (
      <Row gutter={16}>
        {detailData.stats.map(v => (
          <Col key={v.id} span={24 / detailData.stats!.length} style={{ minWidth: 200 }}>
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16, marginBottom: 12 }}>
              {(() => {
                const ratingCount = v.rating_count ?? 0;
                return (
                  <>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                {v.label} {v.is_control && <Tag color="blue">对照组</Tag>}
              </div>
              <Statistic title="评分均值" value={v.rating_avg ?? '-'} precision={2} suffix="/ 5" />
              <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>评分数：{ratingCount}</div>
              {ratingCount > 0 && (
                <div style={{ marginTop: 8 }}>
                  {[5, 4, 3, 2, 1].map(star => {
                    const cnt = v.rating_distribution?.[String(star)] || 0;
                    const pct = Math.round((cnt / ratingCount) * 100);
                    return (
                      <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ width: 20, textAlign: 'right', fontSize: 12 }}>{star}★</span>
                        <Progress percent={pct} size="small" style={{ flex: 1 }} showInfo={false} />
                        <span style={{ width: 30, fontSize: 12, color: '#999' }}>{cnt}</span>
                      </div>
                    );
                  })}
                </div>
              )}
                  </>
                );
              })()}
            </div>
          </Col>
        ))}
      </Row>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <ProTable<Experiment>
        headerTitle={<><ExperimentOutlined /> Prompt 灰度实验</>}
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        request={async (params) => {
          const res: any = await request.get('/admin/prompt-experiments', {
            params: {
              template_type: params.template_type,
              status: params.status,
              page: params.current || 1,
              size: params.pageSize || 20,
            },
          });
          return {
            data: Array.isArray(res?.items) ? res.items : [],
            total: res?.total || 0,
            success: true,
          };
        }}
        toolBarRender={() => [
          <Button key="create" type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建实验
          </Button>,
        ]}
        pagination={{ pageSize: 20 }}
      />

      {/* 创建实验 Modal */}
      <Modal
        title={<><ExperimentOutlined /> 新建 Prompt 灰度实验</>}
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={submitting}
        width={720}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={14}>
              <Form.Item label="实验名称" name="name" rules={[{ required: true }]}>
                <Input placeholder="如：续写Prompt优化实验-v2" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item label="Prompt 类型" name="template_type" rules={[{ required: true }]}>
                <Select
                  options={TEMPLATE_TYPES}
                  placeholder="选择类型"
                  onChange={(v) => {
                    setSelectedType(v);
                    loadTemplates(v);
                  }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="实验目标、假设等（可选）" />
          </Form.Item>
          <Form.Item
            label="参与用户比例"
            name="traffic_percent"
            rules={[{ required: true }]}
            extra="设置为 100 表示所有用户都参与实验；设置 50 则只有 50% 的用户随机进入实验，其余走默认 Prompt"
          >
            <InputNumber min={1} max={100} addonAfter="%" style={{ width: 160 }} />
          </Form.Item>
          <Divider orientation="left" style={{ fontSize: 13 }}>变体配置（至少 2 个，流量比例之和必须 = 100%）</Divider>
          {!selectedType && (
            <div style={{ color: '#ff7875', marginBottom: 12, fontSize: 13 }}>
              请先选择 Prompt 类型，以便选择具体的模板版本
            </div>
          )}
          <Form.Item shouldUpdate>
            {() => <VariantFields templateType={selectedType} />}
          </Form.Item>
        </Form>
      </Modal>

      {/* 实验详情 & 统计 Modal */}
      <Modal
        title={<><BarChartOutlined /> 实验详情：{detailData?.name}</>}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={800}
      >
        {detailData && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="类型">{TYPE_LABEL[detailData.template_type] || detailData.template_type}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Badge
                  status={STATUS_CONFIG[detailData.status]?.color as any}
                  text={STATUS_CONFIG[detailData.status]?.label}
                />
              </Descriptions.Item>
              <Descriptions.Item label="参与比例">{detailData.traffic_percent}%</Descriptions.Item>
              <Descriptions.Item label="变体数">{detailData.variants?.length}</Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>{detailData.description || '-'}</Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">变体详情</Divider>
            <Table
              size="small"
              dataSource={detailData.variants}
              rowKey="id"
              pagination={false}
              columns={[
                { title: '标签', dataIndex: 'label', render: (v, row) => <>{v}{row.is_control && <Tag color="blue" style={{ marginLeft: 4 }}>对照组</Tag>}</> },
                { title: 'Template ID', dataIndex: 'prompt_template_id' },
                { title: '流量比例', dataIndex: 'traffic_ratio', render: (v) => `${Math.round(v * 100)}%` },
              ]}
            />

            <Divider orientation="left">评分统计</Divider>
            {renderStats()}

            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {detailData.status === 'draft' && (
                <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => updateStatus(detailData.id, 'running')}>启动实验</Button>
              )}
              {detailData.status === 'running' && (
                <Button icon={<PauseCircleOutlined />} onClick={() => updateStatus(detailData.id, 'paused')}>暂停</Button>
              )}
              {(detailData.status === 'running' || detailData.status === 'paused') && (
                <Popconfirm title="确定结束实验？" onConfirm={() => updateStatus(detailData.id, 'completed')}>
                  <Button icon={<CheckCircleOutlined />}>结束实验</Button>
                </Popconfirm>
              )}
            </div>
          </>
        )}
      </Modal>
    </>
  );
};

export default PromptExperimentsPage;
