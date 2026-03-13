import React, { useState, useEffect } from 'react';
import {
  Table, Button, Input, Space, Tag, Form, Select,
  message, Popconfirm, Card, Descriptions, Badge, Breadcrumb, Spin,
  Tabs, Collapse, Typography,
} from 'antd';
import { ArrowLeftOutlined, PlusOutlined, EditOutlined, DeleteOutlined, CodeOutlined, SettingOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import TemplateConfigEditor, { type TemplateConfig } from './TemplateConfigEditor';
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
  template_config?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

interface PromptTemplate {
  id: number;
  name: string;
  description?: string;
  template_type: string;
  prompt_content: string;
  version: string;
  is_default: boolean;
  is_active: boolean;
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  usage_count: number;
  component_id?: string;
  component_type?: string;
  prompt_category?: string;
  work_template_id?: number;
  created_at: string;
  updated_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  generate: 'blue',
  validate: 'orange',
  analysis: 'purple',
};

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
});

// Recursively extract all leaf components from a component list
interface FlatComponent {
  moduleId: string;
  moduleName: string;
  id: string;
  type: string;
  label?: string;
  dataKey?: string;
  generatePromptId?: number;
  validatePromptId?: number;
  analysisPromptId?: number;
  path: string; // breadcrumb path inside the module
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenComponents(components: any[], moduleId: string, moduleName: string, pathPrefix = ''): FlatComponent[] {
  const result: FlatComponent[] = [];
  for (const comp of components ?? []) {
    const path = pathPrefix ? `${pathPrefix} > ${comp.label || comp.id}` : (comp.label || comp.id);
    if (comp.type === 'tabs' && Array.isArray(comp.config?.tabs)) {
      for (const tab of comp.config.tabs) {
        const tabPath = `${path} > [${tab.label}]`;
        result.push(...flattenComponents(tab.components ?? [], moduleId, moduleName, tabPath));
      }
    } else {
      result.push({
        moduleId,
        moduleName,
        id: comp.id,
        type: comp.type,
        label: comp.label,
        dataKey: comp.dataKey,
        generatePromptId: comp.generatePromptId,
        validatePromptId: comp.validatePromptId,
        analysisPromptId: comp.analysisPromptId,
        path,
      });
    }
  }
  return result;
}

const WorkTemplateDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const templateId = Number(id);

  const [workTemplate, setWorkTemplate] = useState<WorkTemplate | null>(null);
  const [wtLoading, setWtLoading] = useState(true);

  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [ptLoading, setPtLoading] = useState(false);

  // Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewingPrompt, setViewingPrompt] = useState<PromptTemplate | null>(null);
  const [form] = Form.useForm();

  // Structure editor
  const [editorOpen, setEditorOpen] = useState(false);

  // ── Fetch work template detail ────────────────────────────────────────────
  const fetchWorkTemplate = async () => {
    setWtLoading(true);
    try {
      const res = await axios.get(`/api/v1/admin/work-templates/${templateId}`, {
        headers: authHeaders(),
      });
      setWorkTemplate(res.data);
    } catch {
      message.error('加载模板信息失败');
    } finally {
      setWtLoading(false);
    }
  };

  // ── Fetch prompt templates ────────────────────────────────────────────────
  const fetchPrompts = async () => {
    setPtLoading(true);
    try {
      const res = await axios.get('/api/v1/prompt-templates/', {
        params: { work_template_id: templateId },
        headers: authHeaders(),
      });
      setPrompts(Array.isArray(res.data) ? res.data : []);
    } catch {
      message.error('加载 Prompt 模板失败');
    } finally {
      setPtLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkTemplate();
    fetchPrompts();
  }, [templateId]);

  const handleSaveConfig = async (config: TemplateConfig) => {
    await axios.put(`/api/v1/admin/work-templates/${templateId}`, { template_config: config }, { headers: authHeaders() });
    // Refresh the displayed template info
    await fetchWorkTemplate();
  };

  // ── Prompt template CRUD ──────────────────────────────────────────────────
  const handleAdd = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({
      version: '1.0',
      is_active: true,
      is_default: false,
      prompt_category: 'generate',
      variables: '{}',
      metadata: '{}',
    });
    setModalOpen(true);
  };

  const handleEdit = (record: PromptTemplate) => {
    setEditingId(record.id);
    form.setFieldsValue({
      ...record,
      variables: JSON.stringify(record.variables ?? {}, null, 2),
      metadata: JSON.stringify(record.metadata ?? {}, null, 2),
    });
    setModalOpen(true);
  };

  const handleDelete = async (promptId: number) => {
    try {
      await axios.delete(`/api/v1/admin/prompt-templates/${promptId}`, { headers: authHeaders() });
      message.success('已删除');
      fetchPrompts();
    } catch {
      message.error('删除失败');
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      try {
        if (values.variables) values.variables = JSON.parse(values.variables);
        if (values.metadata) values.metadata = JSON.parse(values.metadata);
      } catch {
        message.error('Variables 或 Metadata JSON 格式有误');
        return;
      }

      values.work_template_id = templateId;
      setSaving(true);

      if (editingId) {
        await axios.put(`/api/v1/admin/prompt-templates/${editingId}`, values, { headers: authHeaders() });
        message.success('更新成功');
      } else {
        await axios.post('/api/v1/admin/prompt-templates', values, { headers: authHeaders() });
        message.success('创建成功');
      }
      setModalOpen(false);
      fetchPrompts();
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns: ColumnsType<PromptTemplate> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 60,
      sorter: (a, b) => a.id - b.id,
    },
    {
      title: '名称',
      dataIndex: 'name',
      width: 200,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name, record) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => setViewingPrompt(record)}>
          {name}
        </Button>
      ),
    },
    {
      title: '组件 ID',
      dataIndex: 'component_id',
      width: 130,
      sorter: (a, b) => (a.component_id || '').localeCompare(b.component_id || ''),
      render: (v) => v ? <Tag color="geekblue">{v}</Tag> : '-',
    },
    {
      title: '类别',
      dataIndex: 'prompt_category',
      width: 100,
      sorter: (a, b) => (a.prompt_category || '').localeCompare(b.prompt_category || ''),
      render: (v) => v ? <Tag color={CATEGORY_COLORS[v] ?? 'default'}>{v}</Tag> : '-',
    },
    {
      title: '版本',
      dataIndex: 'version',
      width: 70,
      sorter: (a, b) => a.version.localeCompare(b.version),
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      width: 70,
      sorter: (a, b) => (a.is_active === b.is_active ? 0 : a.is_active ? 1 : -1),
      render: (v) => <Badge status={v ? 'success' : 'error'} text={v ? '启用' : '禁用'} />,
    },
    {
      title: '描述',
      dataIndex: 'description',
      ellipsis: true,
      sorter: (a, b) => (a.description || '').localeCompare(b.description || ''),
      render: (v) => v || '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Space>
          <Button
            type="primary"
            icon={<EditOutlined />}
            size="small"
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="确认删除此 Prompt 模板？"
            onConfirm={() => handleDelete(record.id)}
            okText="确认"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (wtLoading) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;
  }

  if (!workTemplate) {
    return <div>模板不存在</div>;
  }

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          {
            title: (
              <Button
                type="link"
                icon={<ArrowLeftOutlined />}
                style={{ padding: 0 }}
                onClick={() => navigate('/prompt-templates')}
              >
                作品模板
              </Button>
            ),
          },
          { title: workTemplate.name },
        ]}
      />

      {/* Work template info */}
      <Card style={{ marginBottom: 16 }}>
        <Descriptions
          title={<span style={{ fontSize: 16, fontWeight: 600 }}>{workTemplate.name}</span>}
          column={3}
          size="small"
          extra={
            <Space>
              {workTemplate.is_system && <Tag color="blue">系统模板</Tag>}
              {workTemplate.is_public ? <Tag color="green">公开</Tag> : <Tag>私有</Tag>}
            </Space>
          }
        >
          <Descriptions.Item label="ID">{workTemplate.id}</Descriptions.Item>
          <Descriptions.Item label="作品类型">
            <Tag>{workTemplate.work_type}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="分类">{workTemplate.category || '-'}</Descriptions.Item>
          <Descriptions.Item label="使用次数">{workTemplate.usage_count ?? 0}</Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {workTemplate.created_at ? workTemplate.created_at.slice(0, 19).replace('T', ' ') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="更新时间">
            {workTemplate.updated_at ? workTemplate.updated_at.slice(0, 19).replace('T', ' ') : '-'}
          </Descriptions.Item>
          {workTemplate.description && (
            <Descriptions.Item label="描述" span={3}>
              {workTemplate.description}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Component config */}
      {workTemplate.template_config && (() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const modules: any[] = (workTemplate.template_config as any).modules ?? [];
        const allComponents: FlatComponent[] = modules.flatMap((m) =>
          flattenComponents(m.components ?? [], m.id, m.name)
        );

        const compColumns: ColumnsType<FlatComponent> = [
          {
            title: '组件 ID',
            dataIndex: 'id',
            width: 140,
            sorter: (a, b) => a.id.localeCompare(b.id),
            render: (v) => <Tag color="geekblue">{v}</Tag>,
          },
          {
            title: '类型',
            dataIndex: 'type',
            width: 120,
            sorter: (a, b) => a.type.localeCompare(b.type),
            render: (v) => <Tag>{v}</Tag>,
          },
          {
            title: '标签',
            dataIndex: 'label',
            width: 130,
            sorter: (a, b) => (a.label || '').localeCompare(b.label || ''),
          },
          {
            title: 'dataKey',
            dataIndex: 'dataKey',
            width: 130,
            sorter: (a, b) => (a.dataKey || '').localeCompare(b.dataKey || ''),
            render: (v) => v ? <Typography.Text code>{v}</Typography.Text> : '-',
          },
          {
            title: '模块',
            dataIndex: 'moduleName',
            width: 110,
            sorter: (a, b) => a.moduleName.localeCompare(b.moduleName),
            render: (v, r) => <Tag color="cyan" style={{ fontSize: 11 }}>{v || r.moduleId}</Tag>,
          },
          {
            title: '路径',
            dataIndex: 'path',
            ellipsis: true,
            sorter: (a, b) => a.path.localeCompare(b.path),
            render: (v) => <Typography.Text type="secondary" style={{ fontSize: 11 }}>{v}</Typography.Text>,
          },
          {
            title: 'Prompt IDs',
            key: 'promptIds',
            width: 180,
            render: (_, r) => (
              <Space size={2} wrap>
                {r.generatePromptId && <Tag color="blue" style={{ fontSize: 11 }}>gen:{r.generatePromptId}</Tag>}
                {r.validatePromptId && <Tag color="orange" style={{ fontSize: 11 }}>val:{r.validatePromptId}</Tag>}
                {r.analysisPromptId && <Tag color="purple" style={{ fontSize: 11 }}>ana:{r.analysisPromptId}</Tag>}
                {!r.generatePromptId && !r.validatePromptId && !r.analysisPromptId && '-'}
              </Space>
            ),
          },
        ];

        const collapseItems = modules.map((m) => ({
          key: m.id,
          label: (
            <Space>
              <Tag color={m.color ? undefined : 'default'} style={m.color ? { background: m.color + '20', borderColor: m.color, color: m.color } : {}}>
                {m.id}
              </Tag>
              <span style={{ fontWeight: 500 }}>{m.name}</span>
              <Tag>{flattenComponents(m.components ?? [], m.id, m.name).length} 组件</Tag>
            </Space>
          ),
          children: (
            <Table
              size="small"
              rowKey="id"
              dataSource={flattenComponents(m.components ?? [], m.id, m.name)}
              columns={compColumns}
              pagination={false}
              scroll={{ x: 900 }}
            />
          ),
        }));

        return (
          <Card
            title="组件配置"
            style={{ marginBottom: 16 }}
            extra={
              <Button icon={<SettingOutlined />} onClick={() => setEditorOpen(true)}>
                配置结构
              </Button>
            }
          >
            <Tabs
              items={[
                {
                  key: 'structured',
                  label: '结构视图',
                  children: (
                    <>
                      <div style={{ marginBottom: 8, color: '#888', fontSize: 12 }}>
                        共 {modules.length} 个模块，{allComponents.length} 个组件
                      </div>
                      <Collapse items={collapseItems} size="small" />
                    </>
                  ),
                },
                {
                  key: 'flat',
                  label: '全部组件',
                  children: (
                    <Table
                      size="small"
                      rowKey={(r) => `${r.moduleId}-${r.id}-${r.path}`}
                      dataSource={allComponents}
                      columns={compColumns}
                      pagination={{ pageSize: 30 }}
                      scroll={{ x: 900 }}
                    />
                  ),
                },
                {
                  key: 'json',
                  label: <><CodeOutlined /> JSON</>,
                  children: (
                    <pre style={{
                      background: '#1e1e1e',
                      color: '#d4d4d4',
                      borderRadius: 6,
                      padding: '14px 16px',
                      fontSize: 12,
                      lineHeight: 1.6,
                      overflow: 'auto',
                      maxHeight: 500,
                      margin: 0,
                    }}>
                      {JSON.stringify(workTemplate.template_config, null, 2)}
                    </pre>
                  ),
                },
              ]}
            />
          </Card>
        );
      })()}

      {/* Prompt templates */}
      <Card
        title={`Prompt 模板（${prompts.length}）`}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增 Prompt
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={prompts}
          rowKey="id"
          loading={ptLoading}
          pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
          size="small"
        />
      </Card>

      {/* Edit / create modal */}
      <ResizableModal
        title={editingId ? '编辑 Prompt 模板' : '新建 Prompt 模板'}
        open={modalOpen}
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        width={860}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Space style={{ display: 'flex', flexWrap: 'wrap' }} align="start">
            <Form.Item name="template_type" label="模板类型" rules={[{ required: true }]} style={{ width: 180 }}>
              <Input placeholder="如 novel_standard" />
            </Form.Item>

            <Form.Item name="prompt_category" label="Prompt 类别" style={{ width: 130 }}>
              <Select options={[
                { label: 'generate', value: 'generate' },
                { label: 'validate', value: 'validate' },
                { label: 'analysis', value: 'analysis' },
              ]} />
            </Form.Item>

            <Form.Item name="component_id" label="组件 ID" style={{ width: 150 }}>
              <Input placeholder="如 char-cards" />
            </Form.Item>

            <Form.Item name="component_type" label="组件类型" style={{ width: 150 }}>
              <Input placeholder="如 character-card" />
            </Form.Item>

            <Form.Item name="version" label="版本" style={{ width: 80 }}>
              <Input />
            </Form.Item>

            <Form.Item name="is_active" label="状态" style={{ width: 100 }}>
              <Select options={[
                { label: '启用', value: true },
                { label: '禁用', value: false },
              ]} />
            </Form.Item>

            <Form.Item name="is_default" label="默认" style={{ width: 80 }}>
              <Select options={[
                { label: '是', value: true },
                { label: '否', value: false },
              ]} />
            </Form.Item>
          </Space>

          <Form.Item name="prompt_content" label="Prompt 内容" rules={[{ required: true }]}>
            <Input.TextArea
              rows={14}
              showCount
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </Form.Item>

          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="variables" label="Variables (JSON)" style={{ flex: 1 }}>
              <Input.TextArea rows={3} style={{ fontFamily: 'monospace', fontSize: 12 }} />
            </Form.Item>
            <Form.Item name="metadata" label="Metadata (JSON)" style={{ flex: 1 }}>
              <Input.TextArea rows={3} style={{ fontFamily: 'monospace', fontSize: 12 }} />
            </Form.Item>
          </Space>
        </Form>
      </ResizableModal>

      {/* View prompt content modal */}
      <ResizableModal
        title={viewingPrompt?.name}
        open={!!viewingPrompt}
        onCancel={() => setViewingPrompt(null)}
        footer={[
          <Button key="edit" type="primary" onClick={() => { handleEdit(viewingPrompt!); setViewingPrompt(null); }}>
            编辑
          </Button>,
          <Button key="close" onClick={() => setViewingPrompt(null)}>关闭</Button>,
        ]}
        width={800}
      >
        {viewingPrompt && (
          <div>
            <Descriptions size="small" column={3} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="组件 ID">
                {viewingPrompt.component_id ? <Tag color="geekblue">{viewingPrompt.component_id}</Tag> : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="类别">
                {viewingPrompt.prompt_category
                  ? <Tag color={CATEGORY_COLORS[viewingPrompt.prompt_category] ?? 'default'}>{viewingPrompt.prompt_category}</Tag>
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="版本">{viewingPrompt.version}</Descriptions.Item>
              {viewingPrompt.description && (
                <Descriptions.Item label="描述" span={3}>{viewingPrompt.description}</Descriptions.Item>
              )}
            </Descriptions>
            <div style={{
              background: '#f5f5f5',
              borderRadius: 6,
              padding: '12px 16px',
              fontFamily: 'monospace',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              maxHeight: 500,
              overflow: 'auto',
              border: '1px solid #e8e8e8',
            }}>
              {viewingPrompt.prompt_content}
            </div>
          </div>
        )}
      </ResizableModal>
      {/* Structure editor drawer */}
      <TemplateConfigEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        initialConfig={(workTemplate.template_config as unknown as TemplateConfig | null) ?? null}
        onSave={handleSaveConfig}
      />
    </div>
  );
};

export default WorkTemplateDetail;
