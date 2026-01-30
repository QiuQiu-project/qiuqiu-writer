
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
  // const lastLoadedTemplateTimeRef = useRef<number>(0);
  // const isInternalUpdateRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 加载默认模板
  const loadDefaultTemplate = useCallback(async (templates: WorkTemplate[] = []): Promise<TemplateConfig | null> => {
    try {
      let defaultTemplate: WorkTemplate | undefined;
      
      // 优先查找模板ID为8的小说标准模板，如果没有则查找第一个系统模板
      if (templates.length > 0) {
        defaultTemplate = templates.find(t => t.id === 8) || templates.find(t => t.is_system) || templates[0];
      } else {
        // 如果没有传入 templates，尝试从 API 获取
        const fetchedTemplates = await templatesApi.listTemplates({
          work_type: 'novel',
          include_fields: true
        });
        defaultTemplate = fetchedTemplates.find(t => t.id === 8) || fetchedTemplates.find(t => t.is_system) || fetchedTemplates[0];
      }

      if (defaultTemplate) {
        let modules: ModuleConfig[] = [];
        if (defaultTemplate.template_config) {
          if (Array.isArray(defaultTemplate.template_config)) {
            modules = defaultTemplate.template_config as ModuleConfig[];
          } else if (typeof defaultTemplate.template_config === 'object' && (defaultTemplate.template_config as any).modules && Array.isArray((defaultTemplate.template_config as any).modules)) {
            modules = (defaultTemplate.template_config as any).modules as ModuleConfig[];
          }
        }
        
        if (modules.length > 0) {
          return {
            id: `db-${defaultTemplate.id}`,
            templateId: `db-${defaultTemplate.id}`, // Explicitly set templateId
            name: defaultTemplate.name,
            description: defaultTemplate.description || '',
            modules: modules
          };
        }
      }
    } catch (error) {
      console.warn('加载默认模板失败:', error);
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
           // 检查是否有来自数据库的模板ID
           if (templateConfig.templateId?.startsWith('db-')) {
             // 尝试从 userTemplates 查找对应的结构
             const dbId = parseInt(templateConfig.templateId.replace('db-', ''));
             const dbTemplate = userTemplates.find(t => t.id === dbId);
             
             if (dbTemplate) {
                // 使用数据库模板的结构
                let dbModules: ModuleConfig[] = [];
                if (dbTemplate.template_config) {
                  if (Array.isArray(dbTemplate.template_config)) {
                    dbModules = dbTemplate.template_config as ModuleConfig[];
                  } else if ((dbTemplate.template_config as any).modules) {
                    dbModules = (dbTemplate.template_config as any).modules;
                  }
                }
                
                if (dbModules.length > 0) {
                  baseTemplate = {
                    id: `db-${dbTemplate.id}`,
                    templateId: `db-${dbTemplate.id}`, // Explicitly set templateId
                    name: dbTemplate.name,
                    description: dbTemplate.description || '',
                    modules: await loadPromptsForComponents(dbModules)
                  };
                }
             }
           }

           // 如果没有找到 db template，或者 templateId 不是 db- 开头，使用 metadata 中的 modules
           if (!baseTemplate && templateConfig.modules && Array.isArray(templateConfig.modules)) {
             baseTemplate = {
               id: templateConfig.templateId || '',
               templateId: templateConfig.templateId || '', // Explicitly set templateId
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
            baseTemplate = {
              id: cached.templateId,
              templateId: cached.templateId, // Explicitly set templateId
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
         setTemplate({
            id: '',
            name: '无模板',
            description: '无法加载模板',
            modules: []
          });
      }

    } catch (err) {
      console.error('加载作品信息失败:', err);
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
  }, [workId]);

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
          templateId: template.id,
          modules: template.modules
        },
        component_data: componentData,
        ...componentData
      };

      console.log('正在手动保存作品信息到后端:', workId);
      await worksApi.updateWork(parseInt(workId), {
        metadata: metadataToSave
      });
      console.log('手动保存成功');
    } catch (err) {
      console.error('保存作品信息失败:', err);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [workId, template]);

  // 监听模板变化并自动保存到缓存和后端
  useEffect(() => {
    if (workId && template) {
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
          // 提取组件数据
          const componentData = extractComponentDataFromTemplate(template.modules);
          
          // 构建要保存的 metadata
          const metadataToSave = {
            template_config: {
              templateId: template.id,
              modules: template.modules // 这里保存完整的 modules 结构，包含 config 等
            },
            component_data: componentData,
            // 也可以把一些关键字段提出来放在顶层，方便索引
            ...componentData
          };

          console.log('正在保存作品信息到后端:', workId);
          await worksApi.updateWork(parseInt(workId), {
            metadata: metadataToSave
          });
          console.log('作品信息保存成功');
        } catch (err) {
          console.error('保存作品信息失败:', err);
        }
      }, 2000);
    }

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
