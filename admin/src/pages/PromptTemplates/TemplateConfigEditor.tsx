import React, { useState, useEffect, useCallback } from 'react';
import {
  Drawer, Tabs, Button, Input, Select, Space, Tag, Tooltip,
  Form, InputNumber, Popconfirm, message,
  Typography, Divider, Alert, Spin, Descriptions,
} from 'antd';
import ResizableModal from '@/components/ResizableModal';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, UpOutlined, DownOutlined,
  AppstoreAddOutlined, SaveOutlined, CodeOutlined, CaretRightOutlined, CaretDownOutlined,
  EditFilled,
} from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('admin_token')}` });

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ComponentDef {
  id: string;
  type: string;
  label?: string;
  dataKey?: string;
  generatePromptId?: number;
  validatePromptId?: number;
  analysisPromptId?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config?: Record<string, any>;
}

export interface TabDef {
  id: string;
  label: string;
  components: ComponentDef[];
}

export interface ModuleDef {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  components: ComponentDef[];
}

export interface TemplateConfig {
  modules: ModuleDef[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  initialConfig: TemplateConfig | null;
  onSave: (config: TemplateConfig) => Promise<void>;
}

// ── Component types ───────────────────────────────────────────────────────────

const COMPONENT_TYPES = [
  { label: 'text — 单行文本', value: 'text' },
  { label: 'textarea — 多行文本', value: 'textarea' },
  { label: 'select — 单选下拉', value: 'select' },
  { label: 'multiselect — 多选标签', value: 'multiselect' },
  { label: 'tags — 标签组', value: 'tags' },
  { label: 'image — 图片上传', value: 'image' },
  { label: 'list — 有序列表', value: 'list' },
  { label: 'keyvalue — 键值对列表', value: 'keyvalue' },
  { label: 'table — 多列表格', value: 'table' },
  { label: 'card-list — 卡片列表', value: 'card-list' },
  { label: 'character-card — 角色卡片', value: 'character-card' },
  { label: 'rank-system — 等级体系', value: 'rank-system' },
  { label: 'faction — 势力/组织', value: 'faction' },
  { label: 'timeline — 时间线', value: 'timeline' },
  { label: 'relation-graph — 关系图谱', value: 'relation-graph' },
  { label: 'tabs — 选项卡容器', value: 'tabs' },
];

const CATEGORY_COLORS: Record<string, string> = {
  generate: 'blue',
  validate: 'orange',
  analysis: 'purple',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function cloneModules(modules: ModuleDef[]): ModuleDef[] {
  return JSON.parse(JSON.stringify(modules));
}
function tryParseJson(str: string): [boolean, unknown] {
  try { return [true, JSON.parse(str)]; } catch { return [false, null]; }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function configWithoutTabs(config?: Record<string, any>): Record<string, unknown> {
  if (!config) return {};
  const { tabs: _t, ...rest } = config;
  return rest;
}

// ── PromptQuickEditModal ──────────────────────────────────────────────────────

interface PromptData {
  id: number;
  name: string;
  description?: string;
  template_type: string;
  prompt_content: string;
  prompt_category?: string;
  component_id?: string;
  version: string;
}

interface PromptQuickEditProps {
  promptId: number | null;
  onClose: () => void;
}

const PromptQuickEditModal: React.FC<PromptQuickEditProps> = ({ promptId, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prompt, setPrompt] = useState<PromptData | null>(null);
  const [content, setContent] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!promptId) return;
    setLoading(true);
    setPrompt(null);
    axios.get(`/api/v1/prompt-templates/${promptId}`)
      .then((res) => {
        const d: PromptData = res.data;
        setPrompt(d);
        setContent(d.prompt_content);
        setName(d.name);
        setDescription(d.description ?? '');
      })
      .catch(() => message.error('加载 Prompt 失败'))
      .finally(() => setLoading(false));
  }, [promptId]);

  const handleSave = async () => {
    if (!prompt) return;
    setSaving(true);
    try {
      await axios.put(`/api/v1/admin/prompt-templates/${prompt.id}`, {
        name,
        description,
        prompt_content: content,
      }, { headers: authHeaders() });
      message.success('Prompt 已保存');
      onClose();
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResizableModal
      title={prompt ? `编辑 Prompt — ${prompt.name}` : '编辑 Prompt'}
      open={!!promptId}
      onCancel={onClose}
      width={860}
      destroyOnClose
      footer={[
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button key="save" type="primary" loading={saving} onClick={handleSave} disabled={!prompt}>保存</Button>,
      ]}
    >
      {loading && <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>}
      {!loading && prompt && (
        <div>
          <Descriptions size="small" column={4} style={{ marginBottom: 12 }}>
            <Descriptions.Item label="ID">{prompt.id}</Descriptions.Item>
            <Descriptions.Item label="类别">
              <Tag color={CATEGORY_COLORS[prompt.prompt_category ?? ''] ?? 'default'}>{prompt.prompt_category || '-'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="组件">
              {prompt.component_id ? <Tag color="geekblue">{prompt.component_id}</Tag> : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="版本">{prompt.version}</Descriptions.Item>
          </Descriptions>

          <Space style={{ display: 'flex', marginBottom: 8 }} align="start">
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>名称</div>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div style={{ flex: 2 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>描述</div>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="可选" />
            </div>
          </Space>

          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Prompt 内容</div>
          <Input.TextArea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={18}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
        </div>
      )}
      {!loading && !prompt && promptId && (
        <div style={{ textAlign: 'center', color: '#999', padding: 32 }}>Prompt ID {promptId} 不存在或加载失败</div>
      )}
    </ResizableModal>
  );
};

// ── PromptTags — clickable prompt ID tags ─────────────────────────────────────

interface PromptTagsProps {
  comp: ComponentDef;
  onEditPrompt: (id: number) => void;
}

const PromptTags: React.FC<PromptTagsProps> = ({ comp, onEditPrompt }) => (
  <Space size={2}>
    {comp.generatePromptId && (
      <Tooltip title={`编辑 generate prompt #${comp.generatePromptId}`}>
        <Tag
          color="blue"
          style={{ fontSize: 10, cursor: 'pointer' }}
          onClick={() => onEditPrompt(comp.generatePromptId!)}
          icon={<EditFilled style={{ fontSize: 9 }} />}
        >
          gen:{comp.generatePromptId}
        </Tag>
      </Tooltip>
    )}
    {comp.validatePromptId && (
      <Tooltip title={`编辑 validate prompt #${comp.validatePromptId}`}>
        <Tag
          color="orange"
          style={{ fontSize: 10, cursor: 'pointer' }}
          onClick={() => onEditPrompt(comp.validatePromptId!)}
          icon={<EditFilled style={{ fontSize: 9 }} />}
        >
          val:{comp.validatePromptId}
        </Tag>
      </Tooltip>
    )}
    {comp.analysisPromptId && (
      <Tooltip title={`编辑 analysis prompt #${comp.analysisPromptId}`}>
        <Tag
          color="purple"
          style={{ fontSize: 10, cursor: 'pointer' }}
          onClick={() => onEditPrompt(comp.analysisPromptId!)}
          icon={<EditFilled style={{ fontSize: 9 }} />}
        >
          ana:{comp.analysisPromptId}
        </Tag>
      </Tooltip>
    )}
  </Space>
);

// ── CompRow ───────────────────────────────────────────────────────────────────

interface CompRowProps {
  comp: ComponentDef;
  index: number;
  total: number;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  onEditPrompt: (id: number) => void;
}

const CompRow: React.FC<CompRowProps> = ({ comp, index, total, onEdit, onDelete, onMove, onEditPrompt }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 10px', border: '1px solid #f0f0f0', borderRadius: 6, marginBottom: 6, background: '#fff',
  }}>
    <Space size={6} align="center" wrap>
      <Tag color="geekblue" style={{ fontSize: 11 }}>{comp.id}</Tag>
      <Tag style={{ fontSize: 11 }}>{comp.type}</Tag>
      {comp.label && <Text style={{ fontSize: 12 }}>{comp.label}</Text>}
      {comp.dataKey && <Text type="secondary" code style={{ fontSize: 11 }}>{comp.dataKey}</Text>}
      <PromptTags comp={comp} onEditPrompt={onEditPrompt} />
    </Space>
    <Space>
      <Tooltip title="上移"><Button icon={<UpOutlined />} size="small" type="text" onClick={() => onMove(-1)} disabled={index === 0} /></Tooltip>
      <Tooltip title="下移"><Button icon={<DownOutlined />} size="small" type="text" onClick={() => onMove(1)} disabled={index === total - 1} /></Tooltip>
      <Button icon={<EditOutlined />} size="small" type="text" onClick={onEdit} />
      <Popconfirm title="删除此组件？" onConfirm={onDelete} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
        <Button danger icon={<DeleteOutlined />} size="small" type="text" />
      </Popconfirm>
    </Space>
  </div>
);

// ── TabsExpandSection ─────────────────────────────────────────────────────────

interface TabsExpandProps {
  comp: ComponentDef;
  compIndex: number;
  modTotal: number;
  onEditComp: () => void;
  onDeleteComp: () => void;
  onMoveComp: (dir: -1 | 1) => void;
  onUpdateTabs: (tabs: TabDef[]) => void;
  onAddSubComp: (tabIndex: number) => void;
  onEditSubComp: (tabIndex: number, subIndex: number) => void;
  onDeleteSubComp: (tabIndex: number, subIndex: number) => void;
  onMoveSubComp: (tabIndex: number, subIndex: number, dir: -1 | 1) => void;
  onEditPrompt: (id: number) => void;
}

const TabsExpandSection: React.FC<TabsExpandProps> = ({
  comp, compIndex, modTotal,
  onEditComp, onDeleteComp, onMoveComp, onUpdateTabs,
  onAddSubComp, onEditSubComp, onDeleteSubComp, onMoveSubComp,
  onEditPrompt,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [tabModal, setTabModal] = useState(false);
  const [editingTab, setEditingTab] = useState<{ index: number; data: Omit<TabDef, 'components'> } | null>(null);
  const [tabForm] = Form.useForm();

  const tabs: TabDef[] = comp.config?.tabs ?? [];

  const openAddTab = () => { setEditingTab(null); tabForm.resetFields(); setTabModal(true); };
  const openEditTab = (i: number) => {
    setEditingTab({ index: i, data: { id: tabs[i].id, label: tabs[i].label } });
    tabForm.setFieldsValue({ id: tabs[i].id, label: tabs[i].label });
    setTabModal(true);
  };
  const handleTabOk = async () => {
    try {
      const vals = await tabForm.validateFields();
      const next = JSON.parse(JSON.stringify(tabs)) as TabDef[];
      if (editingTab === null) next.push({ id: vals.id.trim(), label: vals.label.trim(), components: [] });
      else next[editingTab.index] = { ...next[editingTab.index], id: vals.id.trim(), label: vals.label.trim() };
      onUpdateTabs(next);
      setTabModal(false);
    } catch { /* */ }
  };
  const deleteTab = (i: number) => { const n = JSON.parse(JSON.stringify(tabs)) as TabDef[]; n.splice(i, 1); onUpdateTabs(n); };
  const moveTab = (i: number, dir: -1 | 1) => {
    const n = JSON.parse(JSON.stringify(tabs)) as TabDef[];
    const j = i + dir; if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]]; onUpdateTabs(n);
  };

  return (
    <div style={{ border: '1px solid #d9e8ff', borderRadius: 6, marginBottom: 6, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#f0f5ff' }}>
        <Space size={6} align="center" wrap>
          <Button type="text" size="small" icon={expanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
            onClick={() => setExpanded((v) => !v)} style={{ color: '#1677ff' }} />
          <Tag color="blue" style={{ fontSize: 11 }}>{comp.id}</Tag>
          <Tag color="blue" style={{ fontSize: 11 }}>tabs</Tag>
          {comp.label && <Text style={{ fontSize: 12, fontWeight: 500 }}>{comp.label}</Text>}
          <Tag style={{ fontSize: 10, background: '#e6f4ff' }}>{tabs.length} 个 Tab</Tag>
        </Space>
        <Space>
          <Tooltip title="上移"><Button icon={<UpOutlined />} size="small" type="text" onClick={() => onMoveComp(-1)} disabled={compIndex === 0} /></Tooltip>
          <Tooltip title="下移"><Button icon={<DownOutlined />} size="small" type="text" onClick={() => onMoveComp(1)} disabled={compIndex === modTotal - 1} /></Tooltip>
          <Button icon={<EditOutlined />} size="small" type="text" onClick={onEditComp} />
          <Popconfirm title="删除此 tabs 组件及其所有 Tab？" onConfirm={onDeleteComp} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
            <Button danger icon={<DeleteOutlined />} size="small" type="text" />
          </Popconfirm>
        </Space>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '8px 12px', background: '#fafcff' }}>
          {tabs.length === 0 && <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>暂无 Tab</Text>}
          {tabs.map((tab, ti) => (
            <div key={tab.id + ti} style={{ border: '1px solid #d6e8ff', borderRadius: 6, marginBottom: 8, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px', background: '#e6f0ff' }}>
                <Space size={4}>
                  <Text style={{ fontSize: 12, fontWeight: 600 }}>Tab:</Text>
                  <Tag style={{ fontSize: 11 }}>{tab.id}</Tag>
                  <Text style={{ fontSize: 12 }}>{tab.label}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>({tab.components.length} 组件)</Text>
                </Space>
                <Space>
                  <Tooltip title="Tab 上移"><Button icon={<UpOutlined />} size="small" type="text" onClick={() => moveTab(ti, -1)} disabled={ti === 0} /></Tooltip>
                  <Tooltip title="Tab 下移"><Button icon={<DownOutlined />} size="small" type="text" onClick={() => moveTab(ti, 1)} disabled={ti === tabs.length - 1} /></Tooltip>
                  <Button icon={<EditOutlined />} size="small" type="text" onClick={() => openEditTab(ti)} />
                  <Popconfirm title="删除此 Tab 及其组件？" onConfirm={() => deleteTab(ti)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                    <Button danger icon={<DeleteOutlined />} size="small" type="text" />
                  </Popconfirm>
                </Space>
              </div>
              <div style={{ padding: '8px 10px', background: '#fff' }}>
                {tab.components.map((sc, si) => (
                  <CompRow
                    key={sc.id + si}
                    comp={sc}
                    index={si}
                    total={tab.components.length}
                    onEdit={() => onEditSubComp(ti, si)}
                    onDelete={() => onDeleteSubComp(ti, si)}
                    onMove={(dir) => onMoveSubComp(ti, si, dir)}
                    onEditPrompt={onEditPrompt}
                  />
                ))}
                <Button icon={<PlusOutlined />} size="small" style={{ width: '100%' }} onClick={() => onAddSubComp(ti)}>
                  添加组件
                </Button>
              </div>
            </div>
          ))}
          <Button icon={<PlusOutlined />} size="small" type="dashed"
            style={{ width: '100%', borderColor: '#1677ff', color: '#1677ff' }} onClick={openAddTab}>
            添加 Tab
          </Button>
        </div>
      )}

      <ResizableModal title={editingTab ? '编辑 Tab' : '添加 Tab'} open={tabModal} onOk={handleTabOk}
        onCancel={() => setTabModal(false)} okText="确认" cancelText="取消" width={400} destroyOnClose>
        <Form form={tabForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="id" label="Tab ID" rules={[{ required: true }]}><Input placeholder="如 list" /></Form.Item>
          <Form.Item name="label" label="Tab 标签" rules={[{ required: true }]}><Input placeholder="如 角色列表" /></Form.Item>
        </Form>
      </ResizableModal>
    </div>
  );
};

// ── ComponentEditModal ─────────────────────────────────────────────────────────

interface CompModalProps {
  open: boolean;
  initial: ComponentDef | null;
  onOk: (c: ComponentDef) => void;
  onCancel: () => void;
  onEditPrompt: (id: number) => void;
}

const ComponentEditModal: React.FC<CompModalProps> = ({ open, initial, onOk, onCancel, onEditPrompt }) => {
  const [form] = Form.useForm();
  const [configStr, setConfigStr] = useState('{}');
  const [configError, setConfigError] = useState('');
  const genId = Form.useWatch('generatePromptId', form);
  const valId = Form.useWatch('validatePromptId', form);
  const anaId = Form.useWatch('analysisPromptId', form);

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        id: initial?.id ?? '',
        type: initial?.type ?? 'textarea',
        label: initial?.label ?? '',
        dataKey: initial?.dataKey ?? '',
        generatePromptId: initial?.generatePromptId ?? null,
        validatePromptId: initial?.validatePromptId ?? null,
        analysisPromptId: initial?.analysisPromptId ?? null,
      });
      const cfg = initial?.type === 'tabs' ? configWithoutTabs(initial?.config) : (initial?.config ?? {});
      setConfigStr(JSON.stringify(cfg, null, 2));
      setConfigError('');
    }
  }, [open, initial]);

  const handleOk = async () => {
    try {
      const vals = await form.validateFields();
      const [ok, cfg] = tryParseJson(configStr);
      if (!ok) { setConfigError('JSON 格式有误'); return; }
      const comp: ComponentDef = {
        id: vals.id.trim(), type: vals.type,
        label: vals.label || undefined, dataKey: vals.dataKey || undefined,
        generatePromptId: vals.generatePromptId || undefined,
        validatePromptId: vals.validatePromptId || undefined,
        analysisPromptId: vals.analysisPromptId || undefined,
        config: cfg as Record<string, unknown> || undefined,
      };
      onOk(comp);
    } catch { /* */ }
  };

  return (
    <ResizableModal title={initial ? '编辑组件' : '添加组件'} open={open} onOk={handleOk} onCancel={onCancel}
      okText="确认" cancelText="取消" width={660} destroyOnClose>
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        <Space style={{ display: 'flex' }} align="start">
          <Form.Item name="id" label="组件 ID" rules={[{ required: true }]} style={{ width: 180 }}>
            <Input placeholder="如 char-cards" />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true }]} style={{ width: 240 }}>
            <Select options={COMPONENT_TYPES} />
          </Form.Item>
        </Space>
        <Space style={{ display: 'flex' }} align="start">
          <Form.Item name="label" label="显示标签" style={{ width: 200 }}>
            <Input placeholder="如 角色卡片" />
          </Form.Item>
          <Form.Item name="dataKey" label="dataKey" style={{ width: 200 }}>
            <Input placeholder="如 characters" />
          </Form.Item>
        </Space>

        <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>关联 Prompt（可点击「编辑」查看/修改 Prompt 内容）</Divider>

        <Space style={{ display: 'flex' }} align="start" wrap>
          <div>
            <Form.Item name="generatePromptId" label="生成 (generate)" style={{ width: 150, marginBottom: 4 }}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
            {genId && (
              <Button size="small" type="link" icon={<EditFilled />} style={{ paddingLeft: 0 }}
                onClick={() => onEditPrompt(genId)}>编辑 Prompt #{genId}</Button>
            )}
          </div>
          <div>
            <Form.Item name="validatePromptId" label="验证 (validate)" style={{ width: 150, marginBottom: 4 }}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
            {valId && (
              <Button size="small" type="link" icon={<EditFilled />} style={{ paddingLeft: 0 }}
                onClick={() => onEditPrompt(valId)}>编辑 Prompt #{valId}</Button>
            )}
          </div>
          <div>
            <Form.Item name="analysisPromptId" label="分析 (analysis)" style={{ width: 150, marginBottom: 4 }}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
            {anaId && (
              <Button size="small" type="link" icon={<EditFilled />} style={{ paddingLeft: 0 }}
                onClick={() => onEditPrompt(anaId)}>编辑 Prompt #{anaId}</Button>
            )}
          </div>
        </Space>

        <Form.Item label="Config JSON（tabs 的 Tab 列表在可视化界面配置）">
          <Input.TextArea value={configStr} onChange={(e) => { setConfigStr(e.target.value); setConfigError(''); }}
            rows={4} style={{ fontFamily: 'monospace', fontSize: 12 }} />
          {configError && <Text type="danger" style={{ fontSize: 12 }}>{configError}</Text>}
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

// ── ModuleEditModal ────────────────────────────────────────────────────────────

interface ModModalProps {
  open: boolean;
  initial: Omit<ModuleDef, 'components'> | null;
  onOk: (m: Omit<ModuleDef, 'components'>) => void;
  onCancel: () => void;
}

const ModuleEditModal: React.FC<ModModalProps> = ({ open, initial, onOk, onCancel }) => {
  const [form] = Form.useForm();
  useEffect(() => {
    if (open) form.setFieldsValue({ id: initial?.id ?? '', name: initial?.name ?? '', icon: initial?.icon ?? '', color: initial?.color ?? '#3b82f6' });
  }, [open, initial]);
  const handleOk = async () => {
    try {
      const vals = await form.validateFields();
      onOk({ id: vals.id.trim(), name: vals.name.trim(), icon: vals.icon || undefined, color: vals.color || undefined });
    } catch { /* */ }
  };
  return (
    <ResizableModal title={initial ? '编辑模块' : '添加模块'} open={open} onOk={handleOk} onCancel={onCancel}
      okText="确认" cancelText="取消" width={480} destroyOnClose>
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        <Space style={{ display: 'flex' }} align="start">
          <Form.Item name="id" label="模块 ID" rules={[{ required: true }]} style={{ width: 180 }}>
            <Input placeholder="如 characters" />
          </Form.Item>
          <Form.Item name="name" label="模块名称" rules={[{ required: true }]} style={{ width: 180 }}>
            <Input placeholder="如 角色设定" />
          </Form.Item>
        </Space>
        <Space style={{ display: 'flex' }} align="start">
          <Form.Item name="icon" label="图标名" style={{ width: 180 }}><Input placeholder="如 Users" /></Form.Item>
          <Form.Item name="color" label="颜色" style={{ width: 180 }}><Input placeholder="#8b5cf6" /></Form.Item>
        </Space>
      </Form>
    </ResizableModal>
  );
};

// ── Editing context ───────────────────────────────────────────────────────────

type CompEditCtx =
  | { level: 'module'; modIndex: number; compIndex: number | null }
  | { level: 'tab'; modIndex: number; compIndex: number; tabIndex: number; subIndex: number | null };

// ── Main editor ───────────────────────────────────────────────────────────────

const TemplateConfigEditor: React.FC<Props> = ({ open, onClose, initialConfig, onSave }) => {
  const [modules, setModules] = useState<ModuleDef[]>([]);
  const [jsonStr, setJsonStr] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [activeTab, setActiveTab] = useState('visual');
  const [saving, setSaving] = useState(false);

  const [modModal, setModModal] = useState(false);
  const [editingMod, setEditingMod] = useState<{ index: number; data: Omit<ModuleDef, 'components'> } | null>(null);

  const [compModal, setCompModal] = useState(false);
  const [compCtx, setCompCtx] = useState<CompEditCtx>({ level: 'module', modIndex: 0, compIndex: null });
  const [compInitial, setCompInitial] = useState<ComponentDef | null>(null);

  // Prompt quick-edit
  const [promptEditId, setPromptEditId] = useState<number | null>(null);
  const openPromptEdit = useCallback((id: number) => setPromptEditId(id), []);

  useEffect(() => {
    if (!open) return;
    const cfg: TemplateConfig = initialConfig ?? { modules: [] };
    setModules(cloneModules(cfg.modules));
    setJsonStr(JSON.stringify(cfg, null, 2));
    setJsonError('');
    setActiveTab('visual');
  }, [open, initialConfig]);

  const handleTabChange = (key: string) => {
    if (key === 'json') setJsonStr(JSON.stringify({ modules }, null, 2));
    setActiveTab(key);
  };
  const syncJsonToVisual = () => {
    const [ok, parsed] = tryParseJson(jsonStr);
    if (!ok || typeof parsed !== 'object' || parsed === null) { setJsonError('JSON 格式有误'); return false; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setModules(cloneModules((parsed as any).modules ?? []));
    setJsonError(''); return true;
  };
  const handleTabChangeWithSync = (key: string) => {
    if (activeTab === 'json' && key === 'visual') { if (!syncJsonToVisual()) return; }
    handleTabChange(key);
  };

  const handleSave = async () => {
    let finalConfig: TemplateConfig;
    if (activeTab === 'json') {
      const [ok, parsed] = tryParseJson(jsonStr);
      if (!ok) { setJsonError('JSON 格式有误'); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      finalConfig = parsed as any;
    } else {
      finalConfig = { modules };
    }
    setSaving(true);
    try { await onSave(finalConfig); message.success('结构已保存'); onClose(); }
    catch { message.error('保存失败'); }
    finally { setSaving(false); }
  };

  // Module ops
  const openAddModule = () => { setEditingMod(null); setModModal(true); };
  const openEditModule = (i: number) => { setEditingMod({ index: i, data: { id: modules[i].id, name: modules[i].name, icon: modules[i].icon, color: modules[i].color } }); setModModal(true); };
  const handleModOk = (data: Omit<ModuleDef, 'components'>) => {
    setModules((prev) => { const n = cloneModules(prev); if (editingMod === null) n.push({ ...data, components: [] }); else n[editingMod.index] = { ...n[editingMod.index], ...data }; return n; });
    setModModal(false);
  };
  const deleteModule = (i: number) => setModules((prev) => { const n = cloneModules(prev); n.splice(i, 1); return n; });
  const moveModule = (i: number, dir: -1 | 1) => setModules((prev) => {
    const n = cloneModules(prev); const j = i + dir; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  // Module-level component ops
  const openAddComp = (mi: number) => { setCompCtx({ level: 'module', modIndex: mi, compIndex: null }); setCompInitial(null); setCompModal(true); };
  const openEditComp = (mi: number, ci: number) => { setCompCtx({ level: 'module', modIndex: mi, compIndex: ci }); setCompInitial(modules[mi].components[ci]); setCompModal(true); };
  const deleteComp = (mi: number, ci: number) => setModules((prev) => { const n = cloneModules(prev); n[mi].components.splice(ci, 1); return n; });
  const moveComp = (mi: number, ci: number, dir: -1 | 1) => setModules((prev) => {
    const n = cloneModules(prev); const c = n[mi].components; const j = ci + dir; if (j < 0 || j >= c.length) return n; [c[ci], c[j]] = [c[j], c[ci]]; return n;
  });

  // Tab sub-component ops
  const openAddSubComp = (mi: number, ci: number, ti: number) => { setCompCtx({ level: 'tab', modIndex: mi, compIndex: ci, tabIndex: ti, subIndex: null }); setCompInitial(null); setCompModal(true); };
  const openEditSubComp = (mi: number, ci: number, ti: number, si: number) => { setCompCtx({ level: 'tab', modIndex: mi, compIndex: ci, tabIndex: ti, subIndex: si }); setCompInitial(modules[mi].components[ci].config?.tabs?.[ti]?.components?.[si] ?? null); setCompModal(true); };
  const deleteSubComp = (mi: number, ci: number, ti: number, si: number) => setModules((prev) => { const n = cloneModules(prev); n[mi].components[ci].config!.tabs[ti].components.splice(si, 1); return n; });
  const moveSubComp = (mi: number, ci: number, ti: number, si: number, dir: -1 | 1) => setModules((prev) => {
    const n = cloneModules(prev); const c = n[mi].components[ci].config!.tabs[ti].components; const j = si + dir; if (j < 0 || j >= c.length) return n; [c[si], c[j]] = [c[j], c[si]]; return n;
  });
  const updateTabs = (mi: number, ci: number, tabs: TabDef[]) => setModules((prev) => {
    const n = cloneModules(prev); n[mi].components[ci].config = { ...(n[mi].components[ci].config ?? {}), tabs }; return n;
  });

  const handleCompOk = (comp: ComponentDef) => {
    setModules((prev) => {
      const n = cloneModules(prev);
      if (compCtx.level === 'module') {
        const mod = n[compCtx.modIndex];
        if (compCtx.compIndex === null) {
          if (comp.type === 'tabs') comp.config = { ...comp.config, tabs: [] };
          mod.components.push(comp);
        } else {
          const existing = mod.components[compCtx.compIndex];
          if (comp.type === 'tabs') comp.config = { ...comp.config, tabs: existing.config?.tabs ?? [] };
          mod.components[compCtx.compIndex] = comp;
        }
      } else {
        const tabs: TabDef[] = n[compCtx.modIndex].components[compCtx.compIndex].config?.tabs ?? [];
        const tab = tabs[compCtx.tabIndex];
        if (!tab) return n;
        if (compCtx.subIndex === null) tab.components.push(comp);
        else tab.components[compCtx.subIndex] = comp;
      }
      return n;
    });
    setCompModal(false);
  };

  const visualContent = (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>共 {modules.length} 个模块</Text>
        <Button icon={<AppstoreAddOutlined />} onClick={openAddModule}>添加模块</Button>
      </div>
      {modules.length === 0 && <div style={{ textAlign: 'center', color: '#999', padding: '32px 0' }}>暂无模块，点击「添加模块」开始配置</div>}

      {modules.map((mod, mi) => (
        <div key={mod.id + mi} style={{ border: '1px solid #e8e8e8', borderRadius: 8, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: mod.color ? `${mod.color}15` : '#fafafa', borderBottom: '1px solid #e8e8e8' }}>
            <Space align="center">
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: mod.color || '#999' }} />
              <Text strong>{mod.name}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>id: {mod.id}</Text>
              {mod.icon && <Tag style={{ fontSize: 11 }}>{mod.icon}</Tag>}
            </Space>
            <Space>
              <Tooltip title="上移"><Button icon={<UpOutlined />} size="small" onClick={() => moveModule(mi, -1)} disabled={mi === 0} /></Tooltip>
              <Tooltip title="下移"><Button icon={<DownOutlined />} size="small" onClick={() => moveModule(mi, 1)} disabled={mi === modules.length - 1} /></Tooltip>
              <Button icon={<EditOutlined />} size="small" onClick={() => openEditModule(mi)}>编辑</Button>
              <Popconfirm title="确认删除此模块及其所有组件？" onConfirm={() => deleteModule(mi)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                <Button danger icon={<DeleteOutlined />} size="small" />
              </Popconfirm>
            </Space>
          </div>

          <div style={{ padding: '10px 14px' }}>
            {mod.components.length === 0 && <Text type="secondary" style={{ fontSize: 12 }}>暂无组件</Text>}
            {mod.components.map((comp, ci) =>
              comp.type === 'tabs' ? (
                <TabsExpandSection
                  key={comp.id + ci}
                  comp={comp} compIndex={ci} modTotal={mod.components.length}
                  onEditComp={() => openEditComp(mi, ci)}
                  onDeleteComp={() => deleteComp(mi, ci)}
                  onMoveComp={(dir) => moveComp(mi, ci, dir)}
                  onUpdateTabs={(tabs) => updateTabs(mi, ci, tabs)}
                  onAddSubComp={(ti) => openAddSubComp(mi, ci, ti)}
                  onEditSubComp={(ti, si) => openEditSubComp(mi, ci, ti, si)}
                  onDeleteSubComp={(ti, si) => deleteSubComp(mi, ci, ti, si)}
                  onMoveSubComp={(ti, si, dir) => moveSubComp(mi, ci, ti, si, dir)}
                  onEditPrompt={openPromptEdit}
                />
              ) : (
                <CompRow
                  key={comp.id + ci}
                  comp={comp} index={ci} total={mod.components.length}
                  onEdit={() => openEditComp(mi, ci)}
                  onDelete={() => deleteComp(mi, ci)}
                  onMove={(dir) => moveComp(mi, ci, dir)}
                  onEditPrompt={openPromptEdit}
                />
              )
            )}
            <Button icon={<PlusOutlined />} size="small" style={{ marginTop: 4, width: '100%' }} onClick={() => openAddComp(mi)}>
              添加组件
            </Button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <Drawer title="配置模板结构" open={open} onClose={onClose} width={800}
        extra={<Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>保存结构</Button>}
        destroyOnClose>
        <Tabs activeKey={activeTab} onChange={handleTabChangeWithSync} items={[
          { key: 'visual', label: '可视化编辑', children: visualContent },
          {
            key: 'json', label: <><CodeOutlined /> JSON 编辑</>, children: (
              <div>
                <Alert type="info" showIcon style={{ marginBottom: 12 }} message="直接编辑 JSON，切换到「可视化」时自动解析同步。" />
                {jsonError && <Alert type="error" message={jsonError} style={{ marginBottom: 8 }} />}
                <Input.TextArea value={jsonStr} onChange={(e) => { setJsonStr(e.target.value); setJsonError(''); }} rows={28} style={{ fontFamily: 'monospace', fontSize: 12 }} />
              </div>
            )
          },
        ]} />
      </Drawer>

      <ModuleEditModal open={modModal} initial={editingMod?.data ?? null} onOk={handleModOk} onCancel={() => setModModal(false)} />
      <ComponentEditModal open={compModal} initial={compInitial} onOk={handleCompOk} onCancel={() => setCompModal(false)} onEditPrompt={openPromptEdit} />
      <PromptQuickEditModal promptId={promptEditId} onClose={() => setPromptEditId(null)} />
    </>
  );
};

export default TemplateConfigEditor;
