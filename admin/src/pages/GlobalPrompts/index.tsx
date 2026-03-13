import React, { useRef, useState } from 'react';
import {
  Button, Form, Select, Input, Space, Tag, Switch, Tooltip, Badge, message, Popconfirm
} from 'antd';
import {
  PlusOutlined, EyeOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, StopOutlined
} from '@ant-design/icons';
import { ProTable, ActionType, ProColumns } from '@ant-design/pro-components';
import request from '@/utils/request';
import ResizableModal from '@/components/ResizableModal';

// ─── types ───────────────────────────────────────────────────────────────────

interface PromptTemplate {
  id: number;
  name: string;
  description?: string;
  template_type: string;
  prompt_content: string;
  version: string;
  is_default: boolean;
  is_active: boolean;
  component_id?: string;
  component_type?: string;
  prompt_category?: string;
  work_template_id?: number;
  usage_count: number;
  created_at?: string;
  updated_at?: string;
}

// ─── constants ────────────────────────────────────────────────────────────────

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
  { label: '组件校验', value: 'component_validate' },
  { label: '组件分析', value: 'component_analysis' },
  { label: '其他', value: 'other' },
];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  TEMPLATE_TYPES.map(({ value, label }) => [value, label])
);

const TYPE_COLOR: Record<string, string> = {
  chapter_analysis: 'blue',
  book_analysis: 'purple',
  continue_chapter: 'cyan',
  character_extraction: 'orange',
  character_generation: 'orange',
  chapter_generation: 'geekblue',
  chapter_summary: 'teal',
  outline_generation: 'gold',
  detailed_outline_generation: 'gold',
  component_generate: 'green',
  component_validate: 'lime',
  component_analysis: 'magenta',
};

const CATEGORY_COLOR: Record<string, string> = {
  generate: 'green',
  validate: 'blue',
  analysis: 'purple',
};

// ─── component ────────────────────────────────────────────────────────────────

const GlobalPrompts: React.FC = () => {
  const actionRef = useRef<ActionType>();
  
  // ── edit / create modal ──────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PromptTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // ── content preview modal ────────────────────────────────────────────────
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');

  // ─── handlers ───────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ is_active: true, is_default: false, version: '1.0' });
    setModalOpen(true);
  };

  const openEdit = (record: PromptTemplate) => {
    setEditing(record);
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      template_type: record.template_type,
      prompt_content: record.prompt_content,
      version: record.version,
      is_default: record.is_default,
      is_active: record.is_active,
      component_id: record.component_id,
      prompt_category: record.prompt_category,
    });
    setModalOpen(true);
  };

  const openPreview = (record: PromptTemplate) => {
    setPreviewTitle(record.name);
    setPreviewContent(record.prompt_content);
    setPreviewOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editing) {
        await request.put(`/admin/prompt-templates/${editing.id}`, values);
        message.success('更新成功');
      } else {
        await request.post('/admin/prompt-templates', values);
        message.success('创建成功');
      }
      setModalOpen(false);
      actionRef.current?.reload();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return; // validation error
      // message.error(editing ? '更新失败' : '创建失败'); // Handled by interceptor usually
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/admin/prompt-templates/${id}`);
      message.success('已删除');
      actionRef.current?.reload();
    } catch {
      // message.error('删除失败');
    }
  };

  const handleToggleActive = async (record: PromptTemplate) => {
    try {
      await request.put(`/admin/prompt-templates/${record.id}`, { is_active: !record.is_active });
      message.success(record.is_active ? '已停用' : '已启用');
      actionRef.current?.reload();
    } catch {
      // message.error('操作失败');
    }
  };

  const handleToggleDefault = async (record: PromptTemplate) => {
    try {
      await request.put(`/admin/prompt-templates/${record.id}`, { is_default: !record.is_default });
      message.success(record.is_default ? '已取消默认' : '已设为默认');
      actionRef.current?.reload();
    } catch {
      // message.error('操作失败');
    }
  };

  // ─── columns ────────────────────────────────────────────────────────────

  const columns: ProColumns<PromptTemplate>[] = [
    { 
      title: 'ID', 
      dataIndex: 'id', 
      width: 60,
      search: false,
      sorter: (a, b) => a.id - b.id,
    },
    {
      title: '名称',
      dataIndex: 'name',
      ellipsis: true,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (_, record) => (
        <a style={{ fontWeight: 500 }} onClick={() => openPreview(record)}>
          {record.name}
        </a>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      search: false,
      hideInTable: true,
    },
    {
      title: '类型',
      dataIndex: 'template_type',
      width: 120,
      valueType: 'select',
      fieldProps: {
        options: TEMPLATE_TYPES,
      },
      sorter: (a, b) => a.template_type.localeCompare(b.template_type),
      render: (_, record) => (
        <Tag color={TYPE_COLOR[record.template_type] ?? 'default'}>
          {TYPE_LABEL[record.template_type] ?? record.template_type}
        </Tag>
      ),
    },
    {
      title: '分类',
      dataIndex: 'prompt_category',
      width: 90,
      search: false,
      sorter: (a, b) => (a.prompt_category || '').localeCompare(b.prompt_category || ''),
      render: (_, record) => record.prompt_category ? <Tag color={CATEGORY_COLOR[record.prompt_category] ?? 'default'}>{record.prompt_category}</Tag> : '-',
    },
    {
      title: '组件',
      dataIndex: 'component_id',
      width: 100,
      search: false,
      render: (v) => v ? <Tag>{v}</Tag> : '-',
    },
    {
      title: '版本',
      dataIndex: 'version',
      width: 70,
      search: false,
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      search: false,
      sorter: (a, b) => (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1),
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title={record.is_active ? '点击停用' : '点击启用'}>
            <Badge
              status={record.is_active ? 'success' : 'default'}
              text={
                <a
                  style={{ color: record.is_active ? '#52c41a' : '#bfbfbf' }}
                  onClick={() => handleToggleActive(record)}
                >
                  {record.is_active ? '启用' : '停用'}
                </a>
              }
            />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: '默认',
      key: 'is_default',
      width: 80,
      search: false,
      render: (_, record) => (
        <Tooltip title={record.is_default ? '取消默认' : '设为默认'}>
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            icon={record.is_default ? <CheckCircleOutlined style={{ color: '#1677ff' }} /> : <StopOutlined style={{ color: '#bfbfbf' }} />}
            onClick={() => handleToggleDefault(record)}
          />
        </Tooltip>
      ),
    },
    {
      title: '使用次数',
      dataIndex: 'usage_count',
      width: 80,
      search: false,
      sorter: (a, b) => a.usage_count - b.usage_count,
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      width: 150,
      search: false,
      valueType: 'dateTime',
      sorter: (a, b) => new Date(a.updated_at || '').getTime() - new Date(b.updated_at || '').getTime(),
    },
    {
      title: '操作',
      valueType: 'option',
      width: 110,
      render: (_, record) => [
        <Tooltip key="preview" title="预览内容">
          <Button icon={<EyeOutlined />} size="small" onClick={() => openPreview(record)} />
        </Tooltip>,
        <Tooltip key="edit" title="编辑">
          <Button icon={<EditOutlined />} size="small" type="primary" onClick={() => openEdit(record)} />
        </Tooltip>,
        <Popconfirm
          key="delete"
          title="确认删除此 Prompt？"
          onConfirm={() => handleDelete(record.id)}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Tooltip title="删除">
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Tooltip>
        </Popconfirm>,
      ],
    },
  ];

  return (
    <>
      <ProTable<PromptTemplate>
        headerTitle="全局 Prompt 管理"
        actionRef={actionRef}
        rowKey="id"
        search={{
          labelWidth: 'auto',
        }}
        toolBarRender={() => [
          <Button key="create" type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建 Prompt
          </Button>,
        ]}
        request={async (params) => {
          const { current, pageSize, name, template_type } = params;
          const res: any = await request.get('/admin/prompt-templates', {
            params: {
              page: current,
              size: pageSize,
              keyword: name, // Map 'name' search field to 'keyword' param
              template_type,
              global_only: true,
            },
          });
          return {
            data: res.items ?? [],
            success: true,
            total: res.total ?? 0,
          };
        }}
        columns={columns}
        pagination={{
          pageSize: 20,
        }}
        scroll={{ x: 1200 }}
      />

      {/* ── Create / Edit Modal ─────────────────────────────────────────── */}
      <ResizableModal
        title={editing ? `编辑 Prompt · ${editing.name}` : '新建全局 Prompt'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText={editing ? '保存' : '创建'}
        cancelText="取消"
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：章节人物提取" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="用途说明（可选）" />
          </Form.Item>

          <Space style={{ display: 'flex' }} align="start">
            <Form.Item
              name="template_type"
              label="类型"
              rules={[{ required: true, message: '请选择类型' }]}
              style={{ width: 200 }}
            >
              <Select options={TEMPLATE_TYPES} placeholder="选择类型" />
            </Form.Item>

            <Form.Item name="prompt_category" label="分类" style={{ width: 140 }}>
              <Select
                allowClear
                placeholder="可选"
                options={[
                  { label: 'generate', value: 'generate' },
                  { label: 'validate', value: 'validate' },
                  { label: 'analysis', value: 'analysis' },
                ]}
              />
            </Form.Item>

            <Form.Item name="component_id" label="组件 ID" style={{ width: 160 }}>
              <Input placeholder="如：summary（可选）" />
            </Form.Item>

            <Form.Item name="version" label="版本" style={{ width: 80 }}>
              <Input placeholder="1.0" />
            </Form.Item>
          </Space>

          <Form.Item
            name="prompt_content"
            label="Prompt 内容"
            rules={[{ required: true, message: '请输入 Prompt 内容' }]}
          >
            <Input.TextArea
              rows={14}
              placeholder="输入 Prompt 内容，支持 @work.metadata.xxx / @chapter.content 等变量"
              style={{ fontFamily: 'monospace', fontSize: 13 }}
            />
          </Form.Item>

          <Space size="large">
            <Form.Item name="is_active" label="启用" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch />
            </Form.Item>
            <Form.Item name="is_default" label="默认" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </ResizableModal>

      {/* ── Content Preview Modal ───────────────────────────────────────── */}
      <ResizableModal
        title={previewTitle}
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={<Button onClick={() => setPreviewOpen(false)}>关闭</Button>}
        width={760}
        initialHeight={600}
      >
        <pre
          style={{
            background: '#f5f5f5',
            padding: 16,
            borderRadius: 6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: 13,
            lineHeight: 1.6,
            margin: 0,
            height: '100%',
            overflow: 'auto',
          }}
        >
          {previewContent}
        </pre>
      </ResizableModal>
    </>
  );
};

export default GlobalPrompts;
