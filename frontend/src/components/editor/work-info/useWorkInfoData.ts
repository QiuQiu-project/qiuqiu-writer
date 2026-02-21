
import { useState, useEffect, useRef, useCallback } from 'react';
import type { WorkData, TemplateConfig, ModuleConfig, ComponentConfig } from './types';
import { 
  extractComponentDataFromTemplate, 
  writeComponentDataToTemplate, 
  loadFromCache, 
  saveToCache 
} from './utils';
import { templatesApi } from '../../../utils/templatesApi';
import type { WorkTemplate } from '../../../utils/templatesApi';
import { worksApi } from '../../../utils/worksApi';

// 简单的加载 prompt 模拟（原文件中该函数已不再请求 API）
const loadPromptsForComponents = async (modules: ModuleConfig[]): Promise<ModuleConfig[]> => {
  return modules;
};

/** 传给后端的 templateId：去掉 db- 前缀，只传纯 id（如 "8"） */
const templateIdForBackend = (id: string): string =>
  id.startsWith('db-') ? id.slice(3) : id;

export const useWorkInfoData = (
  workId: string | null,
  workData: WorkData | null,
  userTemplates: WorkTemplate[]
) => {
  const [template, setTemplate] = useState<TemplateConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const initializedRef = useRef(false);
  /** 为 true 时跳过下一次「template 变化」触发的自动保存，避免进入作品时用当前模板覆盖后端 metadata */
  const skipNextBackendSaveRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 加载默认模板（兜底：作品无 template_config 时优先用用户第一个，没有则由后端确保并返回用户默认小说模板）
  const loadDefaultTemplate = useCallback(async (templates: WorkTemplate[] = []): Promise<TemplateConfig | null> => {
    try {
      let defaultTemplate: WorkTemplate | undefined;

      const pickUserFirst = (list: WorkTemplate[]) =>
        list.find(t => !t.is_system) || list[0];

      if (templates.length > 0) {
        defaultTemplate = pickUserFirst(templates);
      } else {
        const fetchedTemplates = await templatesApi.listTemplates({
          work_type: 'novel',
          include_fields: true
        });
        defaultTemplate = pickUserFirst(fetchedTemplates);
      }

      if (!defaultTemplate) {
        defaultTemplate = await templatesApi.ensureDefaultNovelTemplate();
      }

      if (defaultTemplate) {
        let modules: ModuleConfig[] = [];
        if (defaultTemplate.template_config) {
          if (Array.isArray(defaultTemplate.template_config)) {
            modules = defaultTemplate.template_config as ModuleConfig[];
          } else if (typeof defaultTemplate.template_config === 'object' && (defaultTemplate.template_config as any).modules && Array.isArray((defaultTemplate.template_config as any).modules)) { // eslint-disable-line @typescript-eslint/no-explicit-any
            modules = (defaultTemplate.template_config as any).modules as ModuleConfig[]; // eslint-disable-line @typescript-eslint/no-explicit-any
          }
        }
        if (modules.length > 0) {
          return {
            id: defaultTemplate.id.toString(),
            templateId: defaultTemplate.id.toString(),
            name: defaultTemplate.name,
            description: defaultTemplate.description || '',
            modules: modules
          };
        }
      }
    } catch {
      // ignore
    }
    return null;
  }, []);

  // 核心数据加载逻辑
  const loadData = useCallback(async () => {
    if (!workId) return;

    // 防止重复加载
    if (initializedRef.current && !workData) return;

    try {
      setIsLoading(true);
      
      // 1. 尝试从 workData (metadata) 加载
      const metadata = workData?.metadata;
      let baseTemplate: TemplateConfig | null = null;
      let componentData: Record<string, unknown> = {};

      if (metadata) {
        // 提取组件数据
        if (metadata.component_data) {
          componentData = { ...metadata.component_data };
        }

        // 提取模板配置
        const templateConfig = metadata.template_config;
        if (templateConfig) {
            // 检查是否有来自数据库的模板ID（兼容旧数据 "db-8" 与纯 id "8"）
            if (templateConfig.templateId) {
             const rawIdStr = String(templateConfig.templateId).replace(/^db-/, '');
             const dbId = parseInt(rawIdStr, 10);
             const dbTemplate = userTemplates.find(t => t.id === dbId);
             
             if (dbTemplate) {
                // 使用数据库模板的结构
                let dbModules: ModuleConfig[] = [];
                if (dbTemplate.template_config) {
                  if (Array.isArray(dbTemplate.template_config)) {
                    dbModules = dbTemplate.template_config as ModuleConfig[];
                  } else if ((dbTemplate.template_config as any).modules) { // eslint-disable-line @typescript-eslint/no-explicit-any
                    dbModules = (dbTemplate.template_config as any).modules; // eslint-disable-line @typescript-eslint/no-explicit-any
                  }
                }
                
                if (dbModules.length > 0) {
                  baseTemplate = {
                    id: dbTemplate.id.toString(),
                    templateId: dbTemplate.id.toString(), // Explicitly set templateId
                    name: dbTemplate.name,
                    description: dbTemplate.description || '',
                    modules: await loadPromptsForComponents(dbModules)
                  };
                }
             }
           }

           // 如果没有找到 db template，使用 metadata 中的 modules
           if (!baseTemplate && templateConfig.modules && Array.isArray(templateConfig.modules)) {
             baseTemplate = {
               id: templateConfig.templateId?.toString() || '',
               templateId: templateConfig.templateId?.toString() || '', // Explicitly set templateId
               name: '作品模板',
               description: '',
               modules: await loadPromptsForComponents(templateConfig.modules)
             };
           }
        }
      }

      // 2. 如果 metadata 中没有模板，尝试从缓存加载
      if (!baseTemplate) {
        const cached = loadFromCache(workId);
        if (cached) {
          // 如果缓存中有 db template id，尝试恢复结构
          if (cached.templateId.startsWith('db-')) {
             const dbId = parseInt(cached.templateId.replace('db-', ''));
             const dbTemplate = userTemplates.find(t => t.id === dbId);
             if (dbTemplate) {
               // ... 类似于上面的逻辑，恢复结构
               // 这里简化处理，如果缓存里有 modules，直接用
             }
          }
          
          if (cached.modules && cached.modules.length > 0) {
            const normalizedId = templateIdForBackend(cached.templateId);
            baseTemplate = {
              id: normalizedId,
              templateId: normalizedId,
              name: '缓存模板',
              description: '',
              modules: cached.modules,
              lastModified: cached.lastModified
            };
            // 从缓存中提取数据作为 componentData 的补充（如果 metadata 里没有）
            const cachedData = extractComponentDataFromTemplate(cached.modules);
            componentData = { ...cachedData, ...componentData };
          }
        }
      }

      // 3. 如果还是没有，加载默认模板
      if (!baseTemplate) {
        baseTemplate = await loadDefaultTemplate(userTemplates);
      }

      // 4. 最终组装
      if (baseTemplate) {
        // 合并数据
        const finalModules = writeComponentDataToTemplate(baseTemplate.modules, componentData);
        
        const finalTemplate: TemplateConfig = {
          ...baseTemplate,
          modules: finalModules
        };

        skipNextBackendSaveRef.current = true;
        setTemplate(finalTemplate);
        initializedRef.current = true;
        
        // 更新缓存
        saveToCache({
          templateId: finalTemplate.id,
          modules: finalModules,
          lastModified: Date.now()
        }, workId, finalTemplate.id);
      } else {
        // 兜底：空模板
        skipNextBackendSaveRef.current = true;
        setTemplate({
            id: '',
            name: '无模板',
            description: '无法加载模板',
            modules: []
          });
      }

    } catch (err) {
      
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  }, [workId, workData, userTemplates, loadDefaultTemplate]);

  // 监听依赖变化，触发加载
  // 注意：这里需要精细控制，避免 workData 频繁变化导致重置
  useEffect(() => {
    if (!workId) return;
    
    // 如果已经初始化过，且 workData 没有显著变化（比如只是其他的 metadata 变了），不要重新加载整个 template
    // 这里我们做一个简单的策略：如果 template 为空，或者 workData 中有明确的 template_config 且跟当前不一样，才重载
    // 为了解决“数据消失”的问题，我们主要依赖初始化加载一次。后续的数据更新应该通过 syncManager 或具体的事件处理
    
    if (!initializedRef.current || (workData?.metadata?.template_config && !template)) {
       loadData();
    }
  }, [workId, workData, userTemplates, loadData, template]);

  // 更新组件值
  const updateComponentValue = useCallback((componentId: string, value: unknown, moduleId?: string) => {
    setTemplate(prev => {
      if (!prev) return null;
      
      const updateModules = (modules: ModuleConfig[]): ModuleConfig[] => {
        return modules.map(mod => {
          // 如果提供了 moduleId 且不匹配，跳过（优化性能）
          if (moduleId && mod.id !== moduleId) return mod;

          const updateComponents = (comps: ComponentConfig[]): ComponentConfig[] => {
            return comps.map(comp => {
              if (comp.id === componentId) {
                return { ...comp, value };
              }
              if (comp.type === 'tabs' && comp.config.tabs) {
                 return {
                   ...comp,
                   config: {
                     ...comp.config,
                     tabs: comp.config.tabs.map(tab => ({
                       ...tab,
                       components: updateComponents(tab.components || [])
                     }))
                   }
                 };
              }
              return comp;
            });
          };

          return {
            ...mod,
            components: updateComponents(mod.components)
          };
        });
      };

      const newModules = updateModules(prev.modules);
      return { ...prev, modules: newModules, lastModified: Date.now() };
    });
  }, []);

  // 手动保存数据
  const saveData = useCallback(async () => {
    if (!workId || !template) return;
    
    setIsSaving(true);
    try {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      saveToCache({
        templateId: template.id,
        modules: template.modules,
        lastModified: Date.now()
      }, workId, template.id);

      const componentData = extractComponentDataFromTemplate(template.modules);
      
      const metadataToSave = {
        template_config: {
          templateId: templateIdForBackend(template.id),
        },
        component_data: componentData,
        ...componentData
      };

      
      await worksApi.updateWork(workId, {
        metadata: metadataToSave
      });
      
    } finally {
        setIsSaving(false);
      }
  }, [workId, template]);

  // 监听模板变化并自动保存到缓存和后端（仅在实际用户编辑后保存，进入作品时由 loadData 设置的 template 不触发后端保存）
  useEffect(() => {
    if (!workId || !template) return;

    if (skipNextBackendSaveRef.current) {
      skipNextBackendSaveRef.current = false;
      return;
    }

    // 1. 保存到本地缓存 (立即执行)
    saveToCache({
      templateId: template.id,
      modules: template.modules,
      lastModified: Date.now()
    }, workId, template.id);

    // 2. 延迟保存到后端 (Debounce 2秒)
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const componentData = extractComponentDataFromTemplate(template.modules);
        const metadataToSave = {
          template_config: {
            templateId: templateIdForBackend(template.id),
          },
          component_data: componentData,
          ...componentData
        };

        
        await worksApi.updateWork(workId, {
          metadata: metadataToSave
        });
        
      } catch {
        // ignore
      }
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [template, workId]);

  return {
    template,
    setTemplate, // 暴露给外部以便进行结构修改（如添加模块）
    isLoading,
    error,
    updateComponentValue,
    loadDefaultTemplate,
    saveData,
    isSaving
  };
};
