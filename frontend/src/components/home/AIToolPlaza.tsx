import { ChevronRight } from 'lucide-react';
import './AIToolPlaza.css';

const tags = [
  '#长篇', '#短篇', '#老福特', '#剧本', '#拆书', '#审稿',
  '#黄金开篇', '#脑洞', '#书名', '#金手指', '#世界观', '#去AI味'
];

export default function AIToolPlaza() {
  return (
    <div className="ai-tool-plaza">
      <div className="plaza-header">
        <h3 className="plaza-title">AI工具广场</h3>
        <a href="#" className="view-more">
          查看更多 <ChevronRight size={16} />
        </a>
      </div>
      <div className="plaza-tags">
        {tags.map((tag) => (
          <button key={tag} className="plaza-tag">
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}

