import React, { useRef, useState } from 'react';
import {
  Button, Modal, Form, Input, InputNumber, Switch, message, Space, Tag, Tooltip, Divider, Select
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, RobotOutlined,
  KeyOutlined, LinkOutlined, CopyOutlined,
} from '@ant-design/icons';
import { ProTable, ActionType, ProColumns } from '@ant-design/pro-components';
import request from '@/utils/request';
import ResizableModal from '@/components/ResizableModal';

/**
 * LLM 模型配置项（存储在 system_settings 表，key='llm_models'，value=数组）
 *
 * api_key 存储在 DB，前端读取时用 has_custom_key 替代（不回传明文 key）
 */
interface LLMModel {
  id: string;
  name: string;
  model_id: string;
  model_type?: 'text' | 'image' | 'video' | 'audio';
  api_base_url?: string;
  api_key?: string;
  description?: string;
  enabled: boolean;
  temperature?: number;
  max_tokens?: number;
  /** 图片模型专用：默认生成尺寸，如 1024*1024 */
  default_image_size?: string;
  /** 图片模型专用：支持的尺寸列表（供前端展示选择） */
  image_sizes?: string[];
  /** 非文本模型：每次生成消耗的 credits 数 */
  credits_per_generation?: number;
}

interface SystemSetting {
  id: number;
  key: string;
  value: LLMModel[];
}

const API_KEY = 'llm_models';
const PLACEHOLDER_KEY = '__UNCHANGED__';  // 编辑时占位符，表示不修改 key

const LLMConfigs: React.FC = () => {
  const actionRef = useRef<ActionType>();
  const [models, setModels] = useState<LLMModel[]>([]);
  const [settingId, setSettingId] = useState<number | null>(null);
  
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LLMModel | null>(null);
  const [copyingFrom, setCopyingFrom] = useState<LLMModel | null>(null);
  const [form] = Form.useForm();
  const watchedModelType = Form.useWatch('model_type', form);

  // Helper to save models array to backend
  const saveModels = async (newModels: LLMModel[]) => {
    try {
      if (settingId !== null) {
        await request.put(`/admin/system-settings/${settingId}`, { value: newModels });
      } else {
        const res: any = await request.post('/admin/system-settings', {
          key: API_KEY,
          value: newModels,
          description: '协作 AI 可用模型列表',
          category: 'ai',
          is_public: true
        });
        setSettingId(res.id);
      }
      setModels(newModels);
      message.success('保存成功');
      actionRef.current?.reload(); // Refresh table
    } catch {
      // message.error('保存失败'); // handled by interceptor
    }
  };

  const handleAdd = () => {
    setEditing(null);
    setCopyingFrom(null);
    form.resetFields();
    form.setFieldsValue({ enabled: true, temperature: 0.7, max_tokens: 8000, model_type: 'text' });
    setModalOpen(true);
  };

  const handleEdit = (record: LLMModel) => {
    setEditing(record);
    setCopyingFrom(null);
    form.setFieldsValue({
      ...record,
      model_type: record.model_type || 'text',
      api_key: record.api_key ? PLACEHOLDER_KEY : '',
      default_image_size: record.default_image_size || '',
      image_sizes: record.image_sizes || [],
      credits_per_generation: record.credits_per_generation ?? 1,
    });
    setModalOpen(true);
  };

  const handleCopy = (record: LLMModel) => {
    setEditing(null);
    setCopyingFrom(record);
    form.resetFields();
    form.setFieldsValue({
      ...record,
      name: `${record.name} (副本)`,
      model_type: record.model_type || 'text',
      api_key: record.api_key ? PLACEHOLDER_KEY : '',
      default_image_size: record.default_image_size || '',
      image_sizes: record.image_sizes || [],
      credits_per_generation: record.credits_per_generation ?? 1,
    });
    setModalOpen(true);
  };

  const handleDelete = (record: LLMModel) => {
    Modal.confirm({
      title: `删除模型「${record.name}」？`,
      onOk: () => saveModels(models.filter(m => m.id !== record.id)),
    });
  };

  const handleToggle = (record: LLMModel, enabled: boolean) => {
    saveModels(models.map(m => m.id === record.id ? { ...m, enabled } : m));
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();

      // 处理 api_key：占位符 = 保留原值
      let finalApiKey = values.api_key?.trim() || undefined;
      if (finalApiKey === PLACEHOLDER_KEY) {
        if (editing) {
          finalApiKey = editing.api_key;
        } else if (copyingFrom) {
          finalApiKey = copyingFrom.api_key;
        }
      }
      if (!finalApiKey) finalApiKey = undefined;

      const isNonText = values.model_type !== 'text';
      const merged: LLMModel = {
        id: editing?.id ?? crypto.randomUUID(),
        name: values.name,
        model_id: values.model_id,
        model_type: values.model_type || 'text',
        api_base_url: values.api_base_url?.trim() || undefined,
        api_key: finalApiKey,
        description: values.description || '',
        enabled: values.enabled ?? true,
        temperature: values.temperature ?? undefined,
        max_tokens: values.max_tokens ?? undefined,
        default_image_size: values.model_type === 'image' ? (values.default_image_size?.trim() || undefined) : undefined,
        image_sizes: values.model_type === 'image' ? (values.image_sizes?.length ? values.image_sizes : undefined) : undefined,
        credits_per_generation: isNonText ? (values.credits_per_generation ?? 1) : undefined,
      };

      if (editing) {
        await saveModels(models.map(m => m.id === editing.id ? merged : m));
      } else {
        await saveModels([...models, merged]);
      }
      setModalOpen(false);
    } catch (error) {
      // form validation failed
    }
  };

  const columns: ProColumns<LLMModel>[] = [
    {
      title: '显示名称',
      dataIndex: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (_, record) => (
        <Space>
          <RobotOutlined style={{ color: '#1677ff' }} />
          <strong>{record.name}</strong>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'model_type',
      width: 100,
      render: (_, record) => {
        const typeMap: Record<string, { label: string; color: string }> = {
          text: { label: '文本生成', color: 'blue' },
          image: { label: '图片生成', color: 'green' },
          video: { label: '视频生成', color: 'orange' },
          audio: { label: '语音生成', color: 'purple' },
        };
        const typeInfo = typeMap[record.model_type || 'text'];
        return <Tag color={typeInfo?.color || 'default'}>{typeInfo?.label || '未知'}</Tag>;
      },
    },
    {
      title: '连接配置',
      key: 'connection',
      search: false,
      render: (_, record) => (
        <Space size={4}>
          {record.api_base_url ? (
            <Tooltip title={`自定义 URL: ${record.api_base_url}`}>
              <Tag icon={<LinkOutlined />} color="geekblue">自定义 URL</Tag>
            </Tooltip>
          ) : (
            <Tag>默认 URL</Tag>
          )}
          {record.api_key ? (
            <Tooltip title="已配置自定义 API Key">
              <Tag icon={<KeyOutlined />} color="purple">自定义 Key</Tag>
            </Tooltip>
          ) : (
            <Tag>默认 Key</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '模型 ID',
      dataIndex: 'model_id',
      copyable: true,
      sorter: (a, b) => a.model_id.localeCompare(b.model_id),
      render: (_, record) => <Tag style={{ fontFamily: 'monospace' }}>{record.model_id}</Tag>,
    },
    {
      title: '参数',
      key: 'params',
      search: false,
      render: (_, record) => (
        <Space size={4}>
          {record.temperature != null && <Tag>temp={record.temperature}</Tag>}
          {record.max_tokens != null && <Tag>{record.max_tokens} tokens</Tag>}
          {record.model_type !== 'text' && record.credits_per_generation != null && (
            <Tag color="purple">{record.credits_per_generation} credits/次</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      ellipsis: true,
      search: false,
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 100,
      sorter: (a, b) => (a.enabled === b.enabled ? 0 : a.enabled ? -1 : 1),
      render: (_, record) => (
        <Switch checked={record.enabled} onChange={v => handleToggle(record, v)} size="small" />
      ),
    },
    {
      title: '操作',
      valueType: 'option',
      width: 150,
      render: (_, record) => [
        <Tooltip key="edit" title="编辑">
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
        </Tooltip>,
        <Tooltip key="copy" title="复制">
          <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopy(record)} />
        </Tooltip>,
        <Tooltip key="delete" title="删除">
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} />
        </Tooltip>,
      ],
    },
  ];

  return (
    <>
      <ProTable<LLMModel>
        headerTitle="AI 模型配置"
        tooltip="配置协作 AI 面板中用户可选择的模型。可为每个模型指定独立的 API Base URL 和 Key。"
        actionRef={actionRef}
        rowKey="id"
        search={false}
        toolBarRender={() => [
          <Button key="add" type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加模型
          </Button>,
        ]}
        request={async () => {
          try {
            const res: any = await request.get('/admin/system-settings');
            const row = (res || []).find((s: SystemSetting) => s.key === API_KEY);
            let currentModels: LLMModel[] = [];
            
            if (row) {
              setSettingId(row.id);
              currentModels = Array.isArray(row.value) ? row.value : [];
            } else {
              setSettingId(null);
            }
            
            setModels(currentModels);
            return {
              data: currentModels,
              success: true,
              total: currentModels.length,
            };
          } catch (e) {
            return { data: [], success: false };
          }
        }}
        columns={columns}
        pagination={false}
      />

      <ResizableModal
        title={editing ? '编辑模型' : '添加模型'}
        open={modalOpen}
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={520}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="显示名称" rules={[{ required: true, message: '请输入' }]}>
            <Input placeholder="如：DeepSeek Chat（请勿在此包含 Key/URL 等敏感信息）" />
          </Form.Item>
          <Form.Item name="model_type" label="模型类型" rules={[{ required: true, message: '请选择模型类型' }]}>
            <Select placeholder="选择模型类型">
              <Select.Option value="text">文本生成</Select.Option>
              <Select.Option value="image">图片生成</Select.Option>
              <Select.Option value="video">视频生成</Select.Option>
              <Select.Option value="audio">语音生成</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="model_id"
            label="模型 ID"
            rules={[{ required: true, message: '请输入' }]}
            extra="传给 API 的 model 字段，如 deepseek-chat、deepseek-reasoner、gpt-4o"
          >
            <Input placeholder="deepseek-chat" style={{ fontFamily: 'monospace' }} />
          </Form.Item>

          <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>连接配置（留空使用服务器全局配置）</Divider>

          <Form.Item
            name="api_base_url"
            label="API Base URL"
            extra="OpenAI 兼容接口地址，如 https://api.deepseek.com/v1"
          >
            <Input placeholder="https://api.deepseek.com/v1" style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Form.Item
            name="api_key"
            label="API Key"
            extra={editing?.api_key ? '已设置 API Key，输入新值可替换，清空则删除' : '留空则使用服务器全局 OPENAI_API_KEY'}
          >
            <Input.Password
              placeholder={editing?.api_key ? '••••••••（已设置，留空保持不变）' : '留空使用全局配置'}
              autoComplete="new-password"
            />
          </Form.Item>

          <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>生成参数（留空使用默认值）</Divider>

          <Space style={{ width: '100%' }} size={16}>
            <Form.Item name="temperature" label="Temperature" style={{ marginBottom: 0, flex: 1 }}>
              <InputNumber min={0} max={2} step={0.1} placeholder="0.7" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="max_tokens" label="Max Tokens" style={{ marginBottom: 0, flex: 1 }}>
              <InputNumber min={256} max={128000} step={1000} placeholder="8000" style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          {watchedModelType !== 'text' && (
            <Form.Item
              name="credits_per_generation"
              label="Credits/次"
              extra="用户每次调用该模型消耗的 credits 数量"
              style={{ marginTop: 16 }}
              rules={[{ required: true, message: '请输入 credits 数量' }]}
            >
              <InputNumber min={1} max={1000} precision={0} placeholder="1" style={{ width: '100%' }} />
            </Form.Item>
          )}

          {watchedModelType === 'image' && (
            <>
              <Divider orientation="left" plain style={{ fontSize: 12, color: '#888' }}>图片生成配置</Divider>
              <Form.Item
                name="default_image_size"
                label="默认生成尺寸"
                extra="调用图片生成时使用的尺寸，格式如 1024*1024 或 2048*2048（注意用 * 而非 x）"
              >
                <Input placeholder="1024*1024" style={{ fontFamily: 'monospace' }} />
              </Form.Item>
              <Form.Item
                name="image_sizes"
                label="可用尺寸列表"
                extra="供前端选择的尺寸选项，输入后按 Enter 添加"
              >
                <Select
                  mode="tags"
                  placeholder="输入尺寸后按 Enter，如 1024*1024"
                  style={{ fontFamily: 'monospace' }}
                  options={[
                    { value: '512*512', label: '512×512' },
                    { value: '768*768', label: '768×768' },
                    { value: '1024*1024', label: '1024×1024' },
                    { value: '1280*720', label: '1280×720（16:9）' },
                    { value: '720*1280', label: '720×1280（9:16）' },
                    { value: '1280*1024', label: '1280×1024' },
                    { value: '1024*1280', label: '1024×1280' },
                    { value: '768*1152', label: '768×1152（2:3）' },
                    { value: '1152*768', label: '1152×768（3:2）' },
                    { value: '2048*2048', label: '2048×2048' },
                  ]}
                />
              </Form.Item>
            </>
          )}

          <Divider />

          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="简要描述此模型的特点" />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </ResizableModal>
    </>
  );
};

export default LLMConfigs;
