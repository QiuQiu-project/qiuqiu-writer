import { useState, useCallback } from 'react';
import { Plus, X } from 'lucide-react';
import type { ComponentConfig, TemplateConfig } from './types';

interface DataDependenciesSelectorProps {
  value: string[];
  onChange: (deps: string[]) => void;
  template: TemplateConfig;
  currentComponentId?: string;
}

export function DataDependenciesSelector({ value, onChange, template, currentComponentId }: DataDependenciesSelectorProps) {
  // 收集所有组件的 dataKey（排除当前组件）
  const availableDataKeys = useCallback(() => {
    const keys: { key: string; label: string; componentId: string }[] = [];
    
    const collectFromComponents = (components: ComponentConfig[], moduleName: string) => {
      for (const comp of components) {
        if (comp.dataKey && comp.id !== currentComponentId) {
          keys.push({
            key: comp.dataKey,
            label: `${moduleName} - ${comp.label} (${comp.dataKey})`,
            componentId: comp.id
          });
        }
        
        // 递归处理 tabs 中的组件
        if (comp.type === 'tabs' && comp.config?.tabs) {
          for (const tab of comp.config.tabs) {
            if (tab.components) {
              collectFromComponents(tab.components, `${moduleName} > ${tab.label}`);
            }
          }
        }
      }
    };
    
    for (const module of template.modules) {
      collectFromComponents(module.components, module.name);
    }
    
    return keys;
  }, [template, currentComponentId]);
  
  const dataKeys = availableDataKeys();
  const [newDepKey, setNewDepKey] = useState('');
  
  const handleAddDep = () => {
    if (newDepKey.trim() && !value.includes(newDepKey.trim())) {
      onChange([...value, newDepKey.trim()]);
      setNewDepKey('');
    }
  };
  
  const handleRemoveDep = (key: string) => {
    onChange(value.filter(k => k !== key));
  };
  
  return (
    <div className="data-dependencies-selector">
      <div className="deps-list">
        {value.map((key) => {
          const keyInfo = dataKeys.find(k => k.key === key);
          return (
            <div key={key} className="dep-tag">
              <span className="dep-key">{key}</span>
              {keyInfo && <span className="dep-label">{keyInfo.label}</span>}
              <button
                className="dep-remove"
                onClick={() => handleRemoveDep(key)}
                title="移除依赖"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
      
      <div className="deps-add-row">
        {dataKeys.length > 0 ? (
          <select
            value={newDepKey}
            onChange={(e) => setNewDepKey(e.target.value)}
            className="deps-select"
          >
            <option value="">选择数据键...</option>
            {dataKeys
              .filter(k => !value.includes(k.key))
              .map(k => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
          </select>
        ) : (
          <input
            type="text"
            value={newDepKey}
            onChange={(e) => setNewDepKey(e.target.value)}
            placeholder="手动输入 dataKey"
            className="deps-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newDepKey.trim() && !value.includes(newDepKey.trim())) {
                handleAddDep();
              }
            }}
          />
        )}
        {dataKeys.length > 0 && (
          <span className="deps-separator">或</span>
        )}
        {dataKeys.length > 0 && (
          <input
            type="text"
            value={newDepKey}
            onChange={(e) => setNewDepKey(e.target.value)}
            placeholder="手动输入 dataKey"
            className="deps-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newDepKey.trim() && !value.includes(newDepKey.trim())) {
                handleAddDep();
              }
            }}
          />
        )}
        <button
          className="deps-add-btn"
          onClick={handleAddDep}
          disabled={!newDepKey.trim() || value.includes(newDepKey.trim())}
        >
          <Plus size={14} />
          添加
        </button>
      </div>
      
      {dataKeys.length === 0 && (
        <div className="deps-hint">暂无其他组件定义了 dataKey</div>
      )}
    </div>
  );
}
