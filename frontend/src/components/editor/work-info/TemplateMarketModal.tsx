import { useState, useEffect, useCallback } from 'react';
import DraggableResizableModal from '../../common/DraggableResizableModal';
import { X, Search, Save, Globe, User, Edit2, Trash2, MoreHorizontal, Download } from 'lucide-react';
import { templatesApi } from '../../../utils/templatesApi';
import type { WorkTemplate, TemplateConfig } from '../../../utils/templatesApi';
import { authApi } from '../../../utils/authApi';
import type { UserInfo } from '../../../utils/authApi';
import MessageModal from '../../common/MessageModal';
import type { MessageType } from '../../common/MessageModal';
import { parseError } from '../../../utils/errorUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface TemplateMarketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: WorkTemplate) => void;
  currentTemplateConfig?: TemplateConfig;
}

export default function TemplateMarketModal({
  isOpen,
  onClose,
  onSelectTemplate,
  currentTemplateConfig
}: TemplateMarketModalProps) {
  const [activeTab, setActiveTab] = useState<'market' | 'mine'>('market');
  const [templates, setTemplates] = useState<WorkTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveForm, setSaveForm] = useState({
    name: '',
    description: '',
    is_public: false
  });
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const [messageState, setMessageState] = useState<{
    isOpen: boolean;
    type: MessageType;
    message: string;
    title?: string;
    onConfirm?: () => void;
    toast?: boolean;
    autoCloseMs?: number;
  }>({
    isOpen: false,
    type: 'info',
    message: '',
  });

  const showMessage = (message: string, type: MessageType = 'info', title?: string, onConfirm?: () => void) => {
    setMessageState({ isOpen: true, type, message, title, onConfirm });
  };

  const showToast = (message: string, type: MessageType = 'success', autoCloseMs = 2000) => {
    setMessageState({ isOpen: true, type, message, toast: true, autoCloseMs });
  };

  const closeMessage = () => {
    setMessageState(prev => ({ ...prev, isOpen: false }));
  };

  // 点击外部关闭下拉菜单
  useEffect(() => {
    if (openMenuId === null) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.card-menu-wrap')) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuId]);

  useEffect(() => {
    const loadUserInfo = () => {
      try {
        const info = authApi.getUserInfo();
        setUserInfo(info);
      } catch {
        // ignore
      }
    };
    loadUserInfo();
  }, []);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const isPublic = activeTab === 'market';
      const data = await templatesApi.listTemplates({
        is_public: isPublic ? true : undefined,
        search: searchQuery || undefined,
      });

      let filteredData = data;
      if (activeTab === 'mine' && userInfo) {
        filteredData = data.filter(t => t.creator_id !== undefined && String(t.creator_id) === String(userInfo.id));
      }

      setTemplates(filteredData);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchQuery, userInfo]);

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen, fetchTemplates]);

  const [targetTemplateConfig, setTargetTemplateConfig] = useState<TemplateConfig | undefined>(undefined);
  const [sourceTemplateId, setSourceTemplateId] = useState<number | undefined>(undefined);
  const [editingTemplate, setEditingTemplate] = useState<WorkTemplate | null>(null);

  const textareaClassName =
    'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

  const handleSaveTemplate = async () => {
    if (editingTemplate) {
      if (!saveForm.name) return;
      try {
        await templatesApi.updateTemplate(editingTemplate.id, {
          name: saveForm.name,
          description: saveForm.description,
          is_public: saveForm.is_public
        });
        showToast('模板更新成功！');
        setShowSaveForm(false);
        setEditingTemplate(null);
        setSaveForm({ name: '', description: '', is_public: false });
        fetchTemplates();
      } catch (e) {
        showMessage(parseError(e), 'error', '更新失败');
      }
      return;
    }

    const configToSave = targetTemplateConfig || currentTemplateConfig;
    if (!configToSave || !saveForm.name) return;

    try {
      await templatesApi.createTemplate({
        name: saveForm.name,
        description: saveForm.description,
        work_type: 'novel',
        template_config: configToSave,
        is_public: saveForm.is_public,
        source_template_id: sourceTemplateId
      });

      showToast('模板保存成功！');
      setShowSaveForm(false);
      setSaveForm({ name: '', description: '', is_public: false });
      setTargetTemplateConfig(undefined);
      setSourceTemplateId(undefined);
      if (activeTab === 'mine') {
        fetchTemplates();
      }
    } catch (e) {
      showMessage(parseError(e), 'error', '保存失败');
    }
  };

  const openSaveForm = (config?: TemplateConfig, fromTemplateId?: number) => {
    setTargetTemplateConfig(config);
    setSourceTemplateId(fromTemplateId);
    setEditingTemplate(null);
    setSaveForm({ name: '', description: '', is_public: false });
    setShowSaveForm(true);
  };

  const openEditForm = (template: WorkTemplate) => {
    setEditingTemplate(template);
    setTargetTemplateConfig(undefined);
    setSaveForm({
      name: template.name,
      description: template.description || '',
      is_public: template.is_public || false
    });
    setShowSaveForm(true);
  };

  const handleDeleteTemplate = async (templateId: number) => {
    showMessage('确定要删除这个模板吗？此操作无法撤销。', 'warning', '确认删除', async () => {
      try {
        await templatesApi.deleteTemplate(templateId);
        showToast('模板删除成功');
        fetchTemplates();
      } catch (e) {
        showMessage(parseError(e), 'error', '删除失败');
      }
    });
  };

  const handleSaveAs = (tpl: WorkTemplate) => {
    let config: TemplateConfig | undefined;
    if (tpl.template_config) {
      if (Array.isArray(tpl.template_config)) {
        config = { modules: tpl.template_config };
      } else if (typeof tpl.template_config === 'object') {
        config = tpl.template_config as TemplateConfig;
      }
    }
    if (config) {
      openSaveForm(config, tpl.id);
    } else {
      showMessage('无法读取该模板配置', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <DraggableResizableModal
      isOpen={isOpen}
      onClose={onClose}
      initialWidth={960}
      initialHeight={600}
      className="overflow-hidden rounded-2xl border border-border bg-background shadow-[0_24px_48px_rgba(0,0,0,0.15),0_8px_24px_rgba(0,0,0,0.08)]"
      handleClassName=".template-market-header"
    >
        <div className="template-market-header flex items-center justify-between border-b border-border px-6 py-5">
          <h3 className="text-lg font-bold tracking-tight text-foreground">模板市场</h3>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>

        <div className="flex items-center gap-3 border-b border-border px-6 py-3.5 max-md:flex-col max-md:items-stretch max-md:px-4">
          <div className="flex shrink-0 gap-1 rounded-xl bg-muted p-1 max-md:overflow-x-auto">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'rounded-lg px-3.5',
                activeTab === 'market' && 'bg-background text-primary shadow-sm hover:bg-background'
              )}
              onClick={() => setActiveTab('market')}
            >
              <Globe size={16} /> 公共市场
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'rounded-lg px-3.5',
                activeTab === 'mine' && 'bg-background text-primary shadow-sm hover:bg-background'
              )}
              onClick={() => setActiveTab('mine')}
            >
              <User size={16} /> 我的模板
            </Button>
          </div>

          <div className="relative min-w-0 flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索模板..."
              value={searchQuery}
              className="h-10 bg-muted/40 pl-9"
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <Button
            variant="outline"
            className="shrink-0 border-primary/30 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
            onClick={() => openSaveForm(undefined)}
            title="创建一个全新的模板（基于当前编辑的内容）"
          >
            <Save size={16} /> 创建新模板
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto bg-muted/40 p-6 max-md:p-4">
          {loading ? (
            <div className="px-5 py-15 text-center text-sm text-muted-foreground">加载中...</div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 max-md:grid-cols-1">
              {templates.map(tpl => {
                const isCurrent = currentTemplateConfig?.templateId === tpl.id.toString();
                const canEditDelete = userInfo?.is_superuser ||
                  (!tpl.is_public && (activeTab === 'mine' || tpl.creator_id === userInfo?.id));

                return (
                  <div
                    key={tpl.id}
                    className={cn(
                      'relative flex flex-col rounded-xl border bg-background p-5 transition-all',
                      isCurrent
                        ? 'border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]'
                        : 'border-border hover:-translate-y-0.5 hover:border-border/80 hover:shadow-lg'
                    )}
                  >
                    {isCurrent && (
                      <div className="absolute -top-px right-4 rounded-b-lg bg-primary px-2.5 py-[3px] text-[11px] font-semibold tracking-[0.3px] text-primary-foreground">
                        当前使用
                      </div>
                    )}

                    <div className="mb-2.5 flex items-start justify-between gap-2">
                      <h4 className="flex-1 text-[15px] font-semibold leading-6 text-foreground">{tpl.name}</h4>
                      {tpl.is_public && (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          公开
                        </span>
                      )}
                    </div>

                    <p className="mb-4 flex-1 overflow-hidden text-[13px] leading-[1.65] text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
                      {tpl.description || '暂无描述'}
                    </p>

                    <div className="mt-auto flex items-center justify-end gap-2 border-t border-border pt-3.5">
                      {!tpl.is_public && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                          onClick={() => onSelectTemplate(tpl)}
                        >
                          <Download size={13} /> 使用
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSaveAs(tpl)}
                        title="基于此模板创建新模板"
                      >
                        <Save size={13} /> 另存为
                      </Button>

                      {canEditDelete && (
                        <div className="relative">
                          <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(openMenuId === tpl.id ? null : tpl.id);
                            }}
                            title="更多操作"
                          >
                            <MoreHorizontal size={15} />
                          </Button>

                          {openMenuId === tpl.id && (
                            <div className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[130px] rounded-xl border border-border bg-background p-1 shadow-lg">
                              <button
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                onClick={() => { openEditForm(tpl); setOpenMenuId(null); }}
                              >
                                <Edit2 size={13} /> 编辑
                              </button>
                              <button
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                                onClick={() => { handleDeleteTemplate(tpl.id); setOpenMenuId(null); }}
                              >
                                <Trash2 size={13} /> 删除
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {templates.length === 0 && (
                <div className="col-span-full px-5 py-15 text-center text-sm text-muted-foreground">未找到相关模板</div>
              )}
            </div>
          )}
        </div>

      {showSaveForm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/35 backdrop-blur-[2px] max-md:items-end">
            <div className="w-[440px] max-w-[90%] rounded-2xl border border-border bg-background p-7 shadow-2xl max-md:w-full max-md:max-w-full max-md:rounded-b-none max-md:px-5 max-md:py-6">
              <h3 className="mb-5 text-[17px] font-bold text-foreground">{editingTemplate ? '编辑模板' : '保存为新模板'}</h3>
              <div className="mb-4 flex flex-col gap-1.5">
                <label className="text-sm font-medium text-muted-foreground">模板名称</label>
                <Input
                  value={saveForm.name}
                  onChange={e => setSaveForm({ ...saveForm, name: e.target.value })}
                  placeholder="请输入模板名称"
                  className="h-10"
                />
              </div>
              <div className="mb-4 flex flex-col gap-1.5">
                <label className="text-sm font-medium text-muted-foreground">描述</label>
                <textarea
                  value={saveForm.description}
                  onChange={e => setSaveForm({ ...saveForm, description: e.target.value })}
                  placeholder="请输入模板描述"
                  rows={3}
                  className={textareaClassName}
                />
              </div>
              <div className="mb-4 flex min-h-6 items-center gap-2">
                {userInfo?.is_superuser && (
                  <>
                    <input
                      type="checkbox"
                      id="is_public"
                      checked={saveForm.is_public}
                      onChange={e => setSaveForm({ ...saveForm, is_public: e.target.checked })}
                      className="size-4 accent-primary"
                    />
                    <label htmlFor="is_public" className="m-0 text-sm text-muted-foreground">设为公开模板</label>
                  </>
                )}
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowSaveForm(false)}>取消</Button>
                <Button onClick={handleSaveTemplate}>
                  {editingTemplate ? '确认更新' : '确认保存'}
                </Button>
              </div>
            </div>
          </div>
        )}

        <MessageModal
          isOpen={messageState.isOpen}
          onClose={closeMessage}
          title={messageState.title}
          message={messageState.message}
          type={messageState.type}
          toast={messageState.toast}
          autoCloseMs={messageState.autoCloseMs}
          onConfirm={() => {
            closeMessage();
            if (messageState.onConfirm) messageState.onConfirm();
          }}
        />
    </DraggableResizableModal>
  );
}
