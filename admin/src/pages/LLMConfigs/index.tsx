import React, { useRef, useState } from 'react';
import {
  Button, Modal, Form, Input, InputNumber, Switch, message, Space, Tag, Tooltip, Divider,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, RobotOutlined,
  KeyOutlined, LinkOutlined,
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
  api_base_url?: string;   // 自定义 API Base URL，空则使用全局配置
  api_key?: string;        // 自定义 API Key，空则使用全局配置
  description?: string;
  enabled: boolean;
  temperature?: number;    // 0.0~2.0，默认 0.7
  max_tokens?: number;     // 默认 8000
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
  const [form] = Form.useForm();

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
    form.resetFields();
    form.setFieldsValue({ enabled: true, temperature: 0.7, max_tokens: 8000 });
    setModalOpen(true);
  };

  const handleEdit = (record: LLMModel) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      // api_key 用占位符代替，避免回传明文
      api_key: record.api_key ? PLACEHOLDER_KEY : '',
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
      if (finalApiKey === PLACEHOLDER_KEY && editing) {
        finalApiKey = editing.api_key;
      }
      if (!finalApiKey) finalApiKey = undefined;

      const merged: LLMModel = {
        id: editing?.id ?? crypto.randomUUID(),
        name: values.name,
        model_id: values.model_id,
        api_base_url: values.api_base_url?.trim() || undefined,
        api_key: finalApiKey,
        description: values.description || '',
        enabled: values.enabled ?? true,
        temperature: values.temperature ?? undefined,
        max_tokens: values.max_tokens ?? undefined,
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
      width: 120,
      render: (_, record) => [
        <Tooltip key="edit" title="编辑">
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
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
