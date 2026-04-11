import React, { useState, useEffect, useRef } from 'react';
import {
  Card, Tabs, Button, Space, Tag, message, Typography,
} from 'antd';
import { EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { EditableProTable, ProColumns, EditableFormInstance } from '@ant-design/pro-components';
import request from '@/utils/request';

const { Title, Text } = Typography;

interface MediaModelConfig {
  model_id: string;
  label: string;
  description: string;
  credits_per_generation: number;
  enabled: boolean;
}

const DEFAULT_MODEL: Partial<MediaModelConfig> = {
  model_id: '',
  label: '',
  description: '',
  credits_per_generation: 1,
  enabled: true,
};

const MODEL_COLUMNS: ProColumns<MediaModelConfig>[] = [
  {
    title: 'Model ID',
    dataIndex: 'model_id',
    width: 160,
    formItemProps: { rules: [{ required: true, message: '必填' }] },
    tooltip: '唯一标识符，如 flux-1-pro',
  },
  {
    title: '显示名称',
    dataIndex: 'label',
    width: 140,
    formItemProps: { rules: [{ required: true, message: '必填' }] },
  },
  {
    title: '描述',
    dataIndex: 'description',
    width: 220,
  },
  {
    title: 'Credits/次',
    dataIndex: 'credits_per_generation',
    valueType: 'digit',
    width: 110,
    fieldProps: { precision: 0, min: 1 },
    formItemProps: { rules: [{ required: true }] },
    render: (_, record) => (
      <Text strong style={{ color: '#7c3aed' }}>
        {record.credits_per_generation}
      </Text>
    ),
  },
  {
    title: '启用',
    dataIndex: 'enabled',
    valueType: 'switch',
    width: 70,
    render: (_, record) => (
      <Tag color={record.enabled ? 'green' : 'default'}>
        {record.enabled ? '启用' : '停用'}
      </Tag>
    ),
  },
  {
    title: '操作',
    valueType: 'option',
    width: 70,
    render: () => null,
  },
];

function ModelSection({
  type,
  title,
  accentColor,
}: {
  type: 'image' | 'video';
  title: string;
  accentColor: string;
}) {
  const [data, setData] = useState<MediaModelConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editableKeys, setEditableKeys] = useState<React.Key[]>([]);
  const [draft, setDraft] = useState<MediaModelConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const editableFormRef = useRef<EditableFormInstance<MediaModelConfig>>();

  const endpoint = `/admin/media/${type}-models`;

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await request.get<MediaModelConfig[]>(endpoint);
      const list = res as unknown as MediaModelConfig[];
      setData(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [type]);

  const handleEdit = () => {
    const copy = JSON.parse(JSON.stringify(data));
    setDraft(copy);
    setEditableKeys(copy.map((m: MediaModelConfig) => m.model_id));
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setDraft([]);
    setEditableKeys([]);
  };

  const handleSave = async () => {
    const latestDraft = draft.map((m) => {
      const rowData = editableFormRef.current?.getRowData?.(m.model_id);
      return rowData ? { ...m, ...rowData } : m;
    });
    const ids = latestDraft.map((m) => m.model_id.trim()).filter(Boolean);
    if (new Set(ids).size !== ids.length || ids.some((id) => !id)) {
      message.error('Model ID 不能为空或重复');
      return;
    }
    setSaving(true);
    try {
      const body = { models: latestDraft.map((m) => ({ ...m, model_id: m.model_id.trim() })) };
      await request.put(endpoint, body);
      await fetch();
      setIsEditing(false);
      setEditableKeys([]);
      message.success('保存成功');
    } catch {
      /* handled by interceptor */
    } finally {
      setSaving(false);
    }
  };

  const columns: ProColumns<MediaModelConfig>[] = MODEL_COLUMNS.map((col) => {
    if (col.title === '操作') {
      return {
        ...col,
        render: (_, record) =>
          isEditing ? (
            <a
              style={{ color: '#ff4d4f' }}
              onClick={() => setDraft(draft.filter((m) => m.model_id !== record.model_id))}
            >
              删除
            </a>
          ) : null,
      };
    }
    return col;
  });

  return (
    <Card
      title={
        <span>
          {title}
          <Tag color={accentColor} style={{ marginLeft: 8, fontSize: 11 }}>
            {data.filter((m) => m.enabled).length} 个启用
          </Tag>
        </span>
      }
      loading={loading}
      style={{ marginBottom: 24 }}
      extra={
        isEditing ? (
          <Space>
            <Button icon={<CloseOutlined />} onClick={handleCancel}>取消</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
              保存
            </Button>
          </Space>
        ) : (
          <Button icon={<EditOutlined />} onClick={handleEdit}>编辑</Button>
        )
      }
    >
      {isEditing ? (
        <EditableProTable<MediaModelConfig>
          rowKey="model_id"
          editableFormRef={editableFormRef}
          maxLength={20}
          scroll={{ x: 800 }}
          recordCreatorProps={{
            position: 'bottom',
            record: () => ({ ...DEFAULT_MODEL, model_id: `model-${Date.now()}` } as MediaModelConfig),
          }}
          columns={columns}
          value={draft}
          onChange={(val) => setDraft([...val])}
          editable={{
            type: 'multiple',
            editableKeys,
            onChange: setEditableKeys,
            actionRender: (_, __, dom) => [dom.delete],
          }}
        />
      ) : (
        <EditableProTable<MediaModelConfig>
          rowKey="model_id"
          columns={columns}
          value={data}
          editable={{ editableKeys: [] }}
          recordCreatorProps={false}
          scroll={{ x: 800 }}
        />
      )}
    </Card>
  );
}

const MediaModels: React.FC = () => {
  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>媒体模型定价</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
        配置图像和视频生成模型的 Credits 消耗量。用户每次调用对应模型将扣减相应 Credits。
      </Text>

      <Tabs
        items={[
          {
            key: 'image',
            label: '🖼️ 图像模型',
            children: (
              <ModelSection type="image" title="图像生成模型" accentColor="purple" />
            ),
          },
          {
            key: 'video',
            label: '🎬 视频模型',
            children: (
              <ModelSection type="video" title="视频生成模型" accentColor="blue" />
            ),
          },
        ]}
      />
    </div>
  );
};

export default MediaModels;
