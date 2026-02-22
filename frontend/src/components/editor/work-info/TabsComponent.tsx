import { useState, useEffect } from 'react';
import { Settings, Sparkles } from 'lucide-react';
import type { ComponentConfig } from './types';
import GuideTip from '../../common/GuideTip';

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
  targetGuideId?: string; // The ID of the component that needs a guide tip
}

export function TabsComponent({ 
  tabs, 
  moduleId, 
  tabsComponentId, 
  renderComponent, 
  // onUpdateTabs, 
  onEditComponentInTab, 
  onGenerateComponent, 
  generatingComponents = {}, 
  isEditMode = false, 
  activeTabId, 
  onActiveTabChange,
  targetGuideId
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
              const showGenerateBtn = ['text', 'textarea', 'list', 'character-card', 'rank-system', 'keyvalue'].includes(subComp.type);
              return (
                <div key={subComp.id} className="comp-wrapper">
                  <div className="comp-header">
                    {subComp.id === targetGuideId ? (
                      <GuideTip
                        id={`guide-fill-${subComp.id}`}
                        forceVisible={true}
                        content={
                          <div>
                            <h4>请填写{subComp.label}</h4>
                            <p>为了完善作品设定，请填写这一项内容。</p>
                          </div>
                        }
                        placement="right"
                      >
                        <label className="comp-label">{subComp.label}</label>
                      </GuideTip>
                    ) : (
                      <label className="comp-label">{subComp.label}</label>
                    )}
                    <div className="comp-header-actions">
                      {showGenerateBtn && onGenerateComponent && (
                        <button 
                          className="icon-btn" 
                          onClick={() => onGenerateComponent(subComp, moduleId, tabsComponentId, activeTabData.id)}
                          disabled={generatingComponents[subComp.id]}
                          title="AI生成内容"
                          style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#3b82f6' }}
                        >
                          {generatingComponents[subComp.id] ? (
                            <span className="loading-spinner small" style={{ width: '16px', height: '16px', border: '2px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', display: 'block', animation: 'spin 1s linear infinite' }}></span>
                          ) : (
                            <Sparkles size={16} />
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
