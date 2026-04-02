import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Col, Row, Select, Space, Statistic, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ProTable, ActionType, ProColumns } from '@ant-design/pro-components';
import { BarChartOutlined } from '@ant-design/icons';
import request from '@/utils/request';

interface RatingOverview {
  total_ratings: number;
  average_rating: number | null;
  experiment_ratings: number;
  non_experiment_ratings: number;
  commented_ratings: number;
}

interface TemplateStat {
  prompt_template_id: number;
  prompt_template_name: string;
  prompt_template_version: string;
  prompt_template_type: string;
  rating_count: number;
  rating_avg: number | null;
  experiment_rating_count: number;
  non_experiment_rating_count: number;
  last_rated_at?: string | null;
}

interface ExperimentStat {
  experiment_id: number;
  experiment_name: string;
  experiment_status: string;
  template_type: string;
  rating_count: number;
  rating_avg: number | null;
}

interface RatingRecord {
  id: number;
  user_id?: string | null;
  session_id?: string | null;
  prompt_template_id?: number | null;
  prompt_template_name?: string | null;
  prompt_template_version?: string | null;
  prompt_template_type?: string | null;
  experiment_id?: number | null;
  experiment_name?: string | null;
  variant_id?: number | null;
  variant_label?: string | null;
  rating: number;
  comment?: string | null;
  context?: Record<string, unknown>;
  created_at?: string | null;
}

interface RatingSummary {
  overview: RatingOverview;
  distribution: Record<string, number>;
  template_stats: TemplateStat[];
  experiment_stats: ExperimentStat[];
  recent_comments: RatingRecord[];
}

const TEMPLATE_TYPES = [
  { label: '全部类型', value: '' },
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
  TEMPLATE_TYPES.filter(item => item.value).map(({ value, label }) => [value, label]),
);

const EXPERIMENT_STATUS_LABEL: Record<string, { color: string; text: string }> = {
  draft: { color: 'default', text: '草稿' },
  running: { color: 'processing', text: '运行中' },
  paused: { color: 'warning', text: '已暂停' },
  completed: { color: 'success', text: '已完成' },
};

const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN') : '-';

const PromptRatingsPage: React.FC = () => {
  const [templateType, setTemplateType] = useState<string>();
  const [summary, setSummary] = useState<RatingSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const actionRef = useRef<ActionType>();

  const loadSummary = async (nextTemplateType?: string) => {
    setSummaryLoading(true);
    try {
      const res: any = await request.get('/admin/prompt-ratings/summary', {
        params: {
          template_type: nextTemplateType || undefined,
        },
      });
      setSummary(res);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    loadSummary(templateType);
  }, [templateType]);

  const distributionData = useMemo(
    () => [5, 4, 3, 2, 1].map(score => ({
      score,
      count: summary?.distribution?.[String(score)] || 0,
    })),
    [summary],
  );

  const templateColumns: ColumnsType<TemplateStat> = [
    {
      title: 'Prompt',
      dataIndex: 'prompt_template_name',
      width: 240,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <span>{row.prompt_template_name || `模板 #${row.prompt_template_id}`}</span>
          <span style={{ color: '#999', fontSize: 12 }}>ID: {row.prompt_template_id} · v{row.prompt_template_version || '-'}</span>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'prompt_template_type',
      width: 140,
      render: (value: string) => TYPE_LABEL[value] || value || '-',
    },
    {
      title: '评分数',
      dataIndex: 'rating_count',
      width: 90,
      sorter: (a, b) => a.rating_count - b.rating_count,
    },
    {
      title: '均分',
      dataIndex: 'rating_avg',
      width: 90,
      render: (value: number | null) => value == null ? '-' : value.toFixed(2),
      sorter: (a, b) => (a.rating_avg || 0) - (b.rating_avg || 0),
    },
    {
      title: '实验内',
      dataIndex: 'experiment_rating_count',
      width: 90,
      sorter: (a, b) => a.experiment_rating_count - b.experiment_rating_count,
    },
    {
      title: '非实验',
      dataIndex: 'non_experiment_rating_count',
      width: 90,
      sorter: (a, b) => a.non_experiment_rating_count - b.non_experiment_rating_count,
    },
    {
      title: '最近评分',
      dataIndex: 'last_rated_at',
      width: 170,
      render: (value: string | null) => formatDateTime(value),
      sorter: (a, b) => new Date(a.last_rated_at || 0).getTime() - new Date(b.last_rated_at || 0).getTime(),
    },
  ];

  const experimentColumns: ColumnsType<ExperimentStat> = [
    {
      title: '实验名称',
      dataIndex: 'experiment_name',
      width: 220,
    },
    {
      title: '类型',
      dataIndex: 'template_type',
      width: 130,
      render: (value: string) => TYPE_LABEL[value] || value || '-',
    },
    {
      title: '状态',
      dataIndex: 'experiment_status',
      width: 100,
      render: (value: string) => {
        const config = EXPERIMENT_STATUS_LABEL[value] || { color: 'default', text: value };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '评分数',
      dataIndex: 'rating_count',
      width: 90,
      sorter: (a, b) => a.rating_count - b.rating_count,
    },
    {
      title: '均分',
      dataIndex: 'rating_avg',
      width: 90,
      render: (value: number | null) => value == null ? '-' : value.toFixed(2),
      sorter: (a, b) => (a.rating_avg || 0) - (b.rating_avg || 0),
    },
  ];

  const commentColumns: ColumnsType<RatingRecord> = [
    {
      title: '评分',
      dataIndex: 'rating',
      width: 70,
      render: (value: number) => `${value}★`,
    },
    {
      title: 'Prompt',
      dataIndex: 'prompt_template_name',
      width: 220,
      render: (_, row) => row.prompt_template_name || `模板 #${row.prompt_template_id || '-'}`,
    },
    {
      title: '实验/变体',
      width: 220,
      render: (_, row) => row.experiment_name ? `${row.experiment_name}${row.variant_label ? ` / ${row.variant_label}` : ''}` : '非实验评分',
    },
    {
      title: '评论',
      dataIndex: 'comment',
      ellipsis: true,
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 170,
      render: (value: string | null) => formatDateTime(value),
    },
  ];

  const ratingColumns: ProColumns<RatingRecord>[] = [
    {
      title: '评分时间',
      dataIndex: 'created_at',
      valueType: 'dateTime',
      width: 160,
      search: false,
      render: (_, row) => formatDateTime(row.created_at),
      sorter: (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
    },
    {
      title: 'Prompt',
      dataIndex: 'prompt_template_name',
      width: 220,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <span>{row.prompt_template_name || `模板 #${row.prompt_template_id || '-'}`}</span>
          <span style={{ color: '#999', fontSize: 12 }}>
            {TYPE_LABEL[row.prompt_template_type || ''] || row.prompt_template_type || '-'}
            {row.prompt_template_version ? ` · v${row.prompt_template_version}` : ''}
          </span>
        </Space>
      ),
    },
    {
      title: '实验',
      dataIndex: 'experiment_name',
      width: 180,
      render: (_, row) => row.experiment_name || <Tag>非实验</Tag>,
    },
    {
      title: '变体',
      dataIndex: 'variant_label',
      width: 120,
      render: (_, row) => row.variant_label || '-',
      search: false,
    },
    {
      title: '评分',
      dataIndex: 'rating',
      width: 80,
      render: (_, row) => `${row.rating}★`,
      search: false,
      sorter: (a, b) => a.rating - b.rating,
    },
    {
      title: '评论',
      dataIndex: 'comment',
      ellipsis: true,
      search: false,
    },
    {
      title: '用户',
      dataIndex: 'user_id',
      width: 180,
      render: (_, row) => row.user_id || row.session_id || '-',
      search: false,
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }} wrap>
          <Space size="middle">
            <BarChartOutlined />
            <span style={{ fontSize: 16, fontWeight: 600 }}>Prompt 评分统计</span>
          </Space>
          <Select
            style={{ width: 220 }}
            value={templateType}
            allowClear
            placeholder="筛选 Prompt 类型"
            options={TEMPLATE_TYPES}
            onChange={(value) => {
              setTemplateType(value || undefined);
              actionRef.current?.reload();
            }}
          />
        </Space>
      </Card>

      <Row gutter={16}>
        <Col span={6}>
          <Card loading={summaryLoading}>
            <Statistic title="总评分数" value={summary?.overview.total_ratings || 0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={summaryLoading}>
            <Statistic title="平均评分" value={summary?.overview.average_rating ?? '-'} precision={2} suffix="/ 5" />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={summaryLoading}>
            <Statistic title="实验内评分" value={summary?.overview.experiment_ratings || 0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={summaryLoading}>
            <Statistic title="非实验评分" value={summary?.overview.non_experiment_ratings || 0} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={8}>
          <Card title="星级分布" loading={summaryLoading}>
            <Table
              rowKey="score"
              size="small"
              pagination={false}
              dataSource={distributionData}
              columns={[
                { title: '星级', dataIndex: 'score', width: 80, render: (value: number) => `${value}★` },
                { title: '人数', dataIndex: 'count' },
              ]}
            />
          </Card>
        </Col>
        <Col span={16}>
          <Card title="最近评论" loading={summaryLoading}>
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={summary?.recent_comments || []}
              columns={commentColumns}
              locale={{ emptyText: '暂无带评论的评分' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="按 Prompt 模板统计" loading={summaryLoading}>
        <Table
          rowKey="prompt_template_id"
          dataSource={summary?.template_stats || []}
          columns={templateColumns}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1000 }}
        />
      </Card>

      <Card title="按实验统计" loading={summaryLoading}>
        <Table
          rowKey="experiment_id"
          dataSource={summary?.experiment_stats || []}
          columns={experimentColumns}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: '暂无实验评分数据' }}
        />
      </Card>

      <ProTable<RatingRecord>
        headerTitle="评分明细"
        actionRef={actionRef}
        rowKey="id"
        columns={ratingColumns}
        search={false}
        request={async (params) => {
          const res: any = await request.get('/admin/prompt-ratings', {
            params: {
              page: params.current || 1,
              size: params.pageSize || 20,
              template_type: templateType,
            },
          });
          return {
            data: res.items || [],
            total: res.total || 0,
            success: true,
          };
        }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        scroll={{ x: 1100 }}
      />
    </Space>
  );
};

export default PromptRatingsPage;
