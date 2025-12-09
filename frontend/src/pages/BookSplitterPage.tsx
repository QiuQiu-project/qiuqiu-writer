import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, FileText, Settings, Download, Loader2, Play, AlertCircle } from 'lucide-react';
import './BookSplitterPage.css';

interface ChapterGroup {
  name: string;
  content: string;
}

interface AnalysisResult {
  fileName: string;
  content: string;
  isComplete: boolean;
  hasError: boolean;
  timestamp: number;
}

export default function BookSplitterPage() {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [chapterGroupSize, setChapterGroupSize] = useState<number>(50);
  const [splitStatus, setSplitStatus] = useState<'idle' | 'splitting' | 'completed' | 'error'>('idle');
  const [chapterGroups, setChapterGroups] = useState<ChapterGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'analyzing' | 'completed' | 'error'>('idle');
  const [analysisResults, setAnalysisResults] = useState<Record<string, AnalysisResult>>({});
  const [currentAnalyzingFile, setCurrentAnalyzingFile] = useState<string>('');
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // 处理文件选择
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setChapterGroups([]);
      setSelectedGroups([]);
      setAnalysisResults({});
      setSplitStatus('idle');
      setAnalysisStatus('idle');
      setErrorMessage('');
    }
  };

  // 读取文本文件
  const readTextFile = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        resolve(content);
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file, 'UTF-8');
    });
  };

  // 章节拆分逻辑（来自 SmartReads）
  const splitTextToChapters = async (content: string, groupSize: number): Promise<ChapterGroup[]> => {
    // 匹配章节标题的正则表达式
    const chapterPattern = /^第[零一二三四五六七八九十百千0-9]+[章回节]/gm;
    
    const chapters: { title: string; content: string }[] = [];
    let lastIndex = 0;
    let match;

    // 找到所有章节标题
    while ((match = chapterPattern.exec(content)) !== null) {
      if (lastIndex !== 0) {
        const previousTitle = chapters[chapters.length - 1]?.title || '开头';
        const chapterContent = content.substring(lastIndex, match.index);
        if (chapters.length > 0) {
          chapters[chapters.length - 1].content = chapterContent;
        }
      }
      chapters.push({
        title: match[0],
        content: ''
      });
      lastIndex = match.index;
    }

    // 处理最后一章
    if (chapters.length > 0 && lastIndex !== 0) {
      chapters[chapters.length - 1].content = content.substring(lastIndex);
    }

    // 如果没有找到章节，将整个文本作为一章
    if (chapters.length === 0) {
      chapters.push({
        title: '全文',
        content: content
      });
    }

    // 按组大小分组
    const groups: ChapterGroup[] = [];
    for (let i = 0; i < chapters.length; i += groupSize) {
      const groupChapters = chapters.slice(i, i + groupSize);
      const groupContent = groupChapters
        .map(ch => `${ch.title}\n${ch.content}`)
        .join('\n\n');
      
      const startChapter = i + 1;
      const endChapter = Math.min(i + groupSize, chapters.length);
      const groupName = `第${startChapter}-${endChapter}章`;
      
      groups.push({
        name: groupName,
        content: groupContent
      });
    }

    return groups;
  };

  // 执行章节拆分
  const handleSplitChapters = async () => {
    if (!selectedFile) {
      setErrorMessage('请先选择小说文件');
      return;
    }

    try {
      setSplitStatus('splitting');
      setErrorMessage('');
      
      const content = await readTextFile(selectedFile);
      const groups = await splitTextToChapters(content, chapterGroupSize);
      
      setChapterGroups(groups);
      setSplitStatus('completed');
      
      // 默认选择前3组
      setSelectedGroups(groups.slice(0, Math.min(3, groups.length)).map(g => g.name));
    } catch (error) {
      console.error('拆分失败:', error);
      setErrorMessage(error instanceof Error ? error.message : '拆分失败');
      setSplitStatus('error');
    }
  };

  // 切换组选择
  const toggleGroupSelection = (groupName: string) => {
    setSelectedGroups(prev => 
      prev.includes(groupName)
        ? prev.filter(name => name !== groupName)
        : [...prev, groupName]
    );
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedGroups.length === chapterGroups.length) {
      setSelectedGroups([]);
    } else {
      setSelectedGroups(chapterGroups.map(g => g.name));
    }
  };

  // 开始分析
  const handleStartAnalysis = async () => {
    if (selectedGroups.length === 0) {
      setErrorMessage('请至少选择一个章节组进行分析');
      return;
    }

    try {
      setAnalysisStatus('analyzing');
      setErrorMessage('');
      setAnalysisProgress(0);
      
      const selectedGroupsData = chapterGroups.filter(g => selectedGroups.includes(g.name));
      
      // TODO: 这里将来会从 memos 后端获取模型服务
      // 目前预留接口，使用模拟分析
      for (let i = 0; i < selectedGroupsData.length; i++) {
        const group = selectedGroupsData[i];
        setCurrentAnalyzingFile(group.name);
        
        // 预留：调用 memos 后端 API
        // const result = await analyzeChapterGroup(group.name, group.content);
        
        // 模拟分析过程
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const mockResult: AnalysisResult = {
          fileName: group.name,
          content: `# ${group.name} 分析结果\n\n**注意：后端接口尚未实现**\n\n这里将显示从 memos 后端获取的 AI 分析结果。\n\n分析内容将包括：\n- 章节号\n- 章节标题\n- 核心剧情梗概\n- 核心功能/目的\n- 画面感/镜头序列\n- 关键情节点\n- 章节氛围/情绪\n- 结尾钩子`,
          isComplete: true,
          hasError: false,
          timestamp: Date.now()
        };
        
        setAnalysisResults(prev => ({
          ...prev,
          [group.name]: mockResult
        }));
        
        setAnalysisProgress(((i + 1) / selectedGroupsData.length) * 100);
      }
      
      setAnalysisStatus('completed');
      setCurrentAnalyzingFile('');
    } catch (error) {
      console.error('分析失败:', error);
      setErrorMessage(error instanceof Error ? error.message : '分析失败');
      setAnalysisStatus('error');
    }
  };

  // 下载分析结果
  const handleDownloadResults = () => {
    const allResults = Object.values(analysisResults)
      .map(result => result.content)
      .join('\n\n---\n\n');
    
    const blob = new Blob([allResults], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedFile?.name || '分析结果'}_analysis.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="book-splitter-page">
      {/* 头部导航 */}
      <div className="book-splitter-header">
        <button className="back-button" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
          返回
        </button>
        <h1>拆书分析工具</h1>
        <div className="header-actions">
          <button className="icon-button" title="设置">
            <Settings size={20} />
          </button>
        </div>
      </div>

      <div className="book-splitter-content">
        {/* 左侧：文件上传和拆分 */}
        <div className="split-panel">
          <div className="panel-section">
            <h2>1. 选择小说文件</h2>
            <div className="file-upload-area">
              <input
                type="file"
                accept=".txt"
                onChange={handleFileSelect}
                id="file-input"
                style={{ display: 'none' }}
              />
              <label htmlFor="file-input" className="upload-button">
                <Upload size={20} />
                选择 TXT 文件
              </label>
              {selectedFile && (
                <div className="file-info">
                  <FileText size={16} />
                  <span>{selectedFile.name}</span>
                </div>
              )}
            </div>
          </div>

          <div className="panel-section">
            <h2>2. 章节拆分设置</h2>
            <div className="split-settings">
              <label>
                每组章节数：
                <select 
                  value={chapterGroupSize} 
                  onChange={(e) => setChapterGroupSize(Number(e.target.value))}
                  disabled={splitStatus === 'splitting'}
                >
                  <option value={10}>10章/组</option>
                  <option value={20}>20章/组</option>
                  <option value={50}>50章/组</option>
                  <option value={100}>100章/组</option>
                  <option value={200}>200章/组</option>
                </select>
              </label>
              <button
                className="primary-button"
                onClick={handleSplitChapters}
                disabled={!selectedFile || splitStatus === 'splitting'}
              >
                {splitStatus === 'splitting' ? (
                  <>
                    <Loader2 size={16} className="spinner" />
                    拆分中...
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    执行拆分
                  </>
                )}
              </button>
            </div>
          </div>

          {chapterGroups.length > 0 && (
            <div className="panel-section">
              <h2>3. 选择要分析的章节组</h2>
              <div className="groups-header">
                <span>共 {chapterGroups.length} 组</span>
                <button className="text-button" onClick={toggleSelectAll}>
                  {selectedGroups.length === chapterGroups.length ? '取消全选' : '全选'}
                </button>
              </div>
              <div className="chapter-groups-list">
                {chapterGroups.map((group) => (
                  <div
                    key={group.name}
                    className={`group-item ${selectedGroups.includes(group.name) ? 'selected' : ''}`}
                    onClick={() => toggleGroupSelection(group.name)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedGroups.includes(group.name)}
                      onChange={() => {}}
                    />
                    <div className="group-info">
                      <div className="group-name">{group.name}</div>
                      <div className="group-size">{Math.round(group.content.length / 1000)}K 字符</div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="primary-button analyze-button"
                onClick={handleStartAnalysis}
                disabled={selectedGroups.length === 0 || analysisStatus === 'analyzing'}
              >
                {analysisStatus === 'analyzing' ? (
                  <>
                    <Loader2 size={16} className="spinner" />
                    分析中... ({Math.round(analysisProgress)}%)
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    开始 AI 分析
                  </>
                )}
              </button>
            </div>
          )}

          {errorMessage && (
            <div className="error-message">
              <AlertCircle size={16} />
              {errorMessage}
            </div>
          )}
        </div>

        {/* 右侧：分析结果 */}
        <div className="results-panel">
          <div className="results-header">
            <h2>分析结果</h2>
            {Object.keys(analysisResults).length > 0 && (
              <button className="icon-button" onClick={handleDownloadResults} title="下载结果">
                <Download size={20} />
              </button>
            )}
          </div>

          {analysisStatus === 'analyzing' && (
            <div className="analyzing-status">
              <Loader2 size={32} className="spinner" />
              <p>正在分析：{currentAnalyzingFile}</p>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${analysisProgress}%` }} />
              </div>
            </div>
          )}

          <div className="results-content">
            {Object.entries(analysisResults).map(([fileName, result]) => (
              <div key={fileName} className="result-item">
                <div className="result-header">
                  <h3>{fileName}</h3>
                  <span className="timestamp">
                    {new Date(result.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="result-content">
                  <pre>{result.content}</pre>
                </div>
              </div>
            ))}
            
            {Object.keys(analysisResults).length === 0 && analysisStatus === 'idle' && (
              <div className="empty-results">
                <FileText size={48} />
                <p>上传小说文件并执行拆分后，即可开始 AI 分析</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

