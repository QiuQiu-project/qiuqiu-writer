import React, { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import type { ComponentConfig } from './types';

export interface TabsComponentProps {
  tabs: { id: string; label: string; components: ComponentConfig[] }[];
  moduleId: string;
  tabsComponentId: string;  // tabs组件的ID
  renderComponent: (comp: ComponentConfig, moduleId: string, tabsComponentId?: string, tabId?: string) => React.ReactNode;
  onUpdateTabs?: (tabs: { id: string; label: string; components: ComponentConfig[] }[]) => void;
  onEditComponentInTab?: (comp: ComponentConfig, tabId: string) => void;
  onGenerateComponent?: (comp: ComponentConfig, moduleId: string, tabsComponentId?: string, tabId?: string) => void;
  generatingComponents?: Record<string, boolean>;
  isEditMode?: boolean;  // 是否处于编辑模式
  activeTabId?: string;
  onActiveTabChange?: (tabId: string) => void;
}

export function TabsComponent({ 
  tabs, 
  moduleId, 
  tabsComponentId, 
  renderComponent, 
  onUpdateTabs, 
  onEditComponentInTab, 
  onGenerateComponent, 
  generatingComponents = {}, 
  isEditMode = false, 
  activeTabId, 
  onActiveTabChange 
}: TabsComponentProps) {
  const [internalActiveTab, setInternalActiveTab] = useState(tabs[0]?.id || '');
  
  const activeTab = activeTabId !== undefined ? activeTabId : internalActiveTab;
  
  const handleTabChange = (tabId: string) => {
    if (onActiveTabChange) {
      onActiveTabChange(tabId);
    } else {
      setInternalActiveTab(tabId);
    }
  };

  useEffect(() => {
    if (tabs.length > 0) {
      // Ensure we have a valid active tab
      const isValid = tabs.some(t => t.id === activeTab);
      if (!isValid && tabs[0]) {
        handleTabChange(tabs[0].id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs]);

  if (tabs.length === 0) {
    return <div className="comp-empty">暂无标签页</div>;
  }

  const activeTabData = tabs.find(t => t.id === activeTab) || tabs[0];

  return (
    <div className="comp-tabs">
      <div className="tabs-header">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTabData?.id === tab.id ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="tabs-content">
        {activeTabData && (
          <>
            {activeTabData.components.map(subComp => {
              const showGenerateBtn = ['text', 'textarea', 'list', 'character-card', 'rank-system'].includes(subComp.type);
              return (
                <div key={subComp.id} className="comp-wrapper">
                  <div className="comp-header">
                    <label className="comp-label">{subComp.label}</label>
                    <div className="comp-header-actions">
                      {showGenerateBtn && onGenerateComponent && (
                        <button 
                          className="comp-generate-btn" 
                          onClick={() => onGenerateComponent(subComp, moduleId, tabsComponentId, activeTabData.id)}
                          disabled={generatingComponents[subComp.id]}
                          title="AI生成内容"
                        >
                          {generatingComponents[subComp.id] ? (
                            <span className="loading-spinner small"></span>
                          ) : (
                            <span className="sparkle-icon">✨</span>
                          )}
                        </button>
                      )}
                      {isEditMode && onEditComponentInTab && (
                        <button 
                          className="comp-edit-btn"
                          onClick={() => onEditComponentInTab(subComp, activeTabData.id)}
                          title="编辑组件"
                        >
                          <Settings size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="comp-content">
                    {renderComponent(subComp, moduleId, tabsComponentId, activeTabData.id)}
                  </div>
                </div>
              );
            })}
            {activeTabData.components.length === 0 && (
              <div className="comp-empty">此标签页暂无组件</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
