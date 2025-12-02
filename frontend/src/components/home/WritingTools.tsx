import { FileText, Video, Film, PenTool, ChevronRight } from 'lucide-react';
import './WritingTools.css';

const tools = [
  {
    id: 'novel',
    icon: FileText,
    title: '小说写作',
    description: '长短篇AI一键生文,5000+专业工作流,百万作者选择',
  },
  {
    id: 'script',
    icon: Video,
    title: '剧本写作',
    description: '短剧漫剧专业创作,支持小说到剧本一键转换,提升400%创作效率',
  },
  {
    id: 'comic',
    icon: Film,
    title: '漫剧视频',
    description: '首家全链路漫剧工具,小说、剧本到视频一条龙生产',
  },
  {
    id: 'general',
    icon: PenTool,
    title: '通用写作',
    description: '学术、办公、营销助手,上百个写作场景,支持自定义配置',
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

