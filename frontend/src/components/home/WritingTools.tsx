import { FileText, ChevronRight } from 'lucide-react';
import './WritingTools.css';

const tools = [
  {
    id: 'novel',
    icon: FileText,
    title: '小说',
    description: '长短篇AI一键生文,5000+专业工作流,百万作者选择',
  },
];

export default function WritingTools() {
  return (
    <div className="writing-tools">
      <div className="tools-grid">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <div key={tool.id} className="tool-card">
              <div className="tool-icon">
                <Icon size={24} />
              </div>
              <div className="tool-content">
                <h4 className="tool-title">{tool.title}</h4>
                <p className="tool-description">{tool.description}</p>
              </div>
              <ChevronRight size={20} className="tool-arrow" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

