import { ChevronRight } from 'lucide-react';
import './CaseSharing.css';

const cases = [
  { title: '从抵触AI,到用蛙蛙写稿赚医药费', date: '2025-07-17 00:00' },
  { title: '35岁被裁,我靠蛙蛙写小说还房贷', date: '2025-06-15 00:00' },
];

export default function CaseSharing() {
  return (
    <div className="case-sharing">
      <div className="card-header">
        <h3 className="card-title">案例分享</h3>
        <a href="#" className="more-link">
          查看更多 <ChevronRight size={14} />
        </a>
      </div>
      <div className="cases-list">
        {cases.map((item, index) => (
          <div key={index} className="case-item">
            <p className="case-title">{item.title}</p>
            <span className="case-date">{item.date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

