import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, FileText, Settings, Download, Loader2, Play, AlertCircle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { createWorkFromFile, testAPIConnection } from '../utils/bookAnalysisApi';
import './BookSplitterPage.css';

interface Chapter {
  id: string;
  title: string;
  content: string;
  number: number;
}

interface AnalysisResult {
  fileName: string;
  content: string;
  isComplete: boolean;
  hasError: boolean;
  timestamp: number;
  metadata?: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    duration?: number;
    estimated_tokens?: number;
    start_time?: string;
    end_time?: string;
  };
}

export default function BookSplitterPage() {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [splitStatus, setSplitStatus] = useState<'idle' | 'splitting' | 'completed' | 'error'>('idle');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'analyzing' | 'completed' | 'error'>('idle');
  const [analysisResults, setAnalysisResults] = useState<Record<string, AnalysisResult>>({});
  const [currentAnalyzingChapter, setCurrentAnalyzingChapter] = useState<string>('');
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [apiStatus, setApiStatus] = useState<'unknown' | 'checking' | 'connected' | 'error'>('unknown');
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [workId, setWorkId] = useState<number | null>(null);
  const [workTitle, setWorkTitle] = useState<string>('');

  // 检查AI服务连接
  useEffect(() => {
    const checkAPIConnection = async () => {
      setApiStatus('checking');
      try {
        const result = await testAPIConnection();
        setApiStatus(result.success ? 'connected' : 'error');
        if (!result.success) {
          console.warn('AI服务连接失败:', result.message);
        } else {
          console.log('✅ AI服务连接成功:', result.message);
        }
      } catch (error) {
        console.error('AI服务连接检查失败:', error);
        setApiStatus('error');
      }
    };
    checkAPIConnection();
  }, []);

  // 处理文件选择
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setChapters([]);
      setSelectedChapters([]);
      setAnalysisResults({});
      setSplitStatus('idle');
      setAnalysisStatus('idle');
      setErrorMessage('');
      setWorkId(null);
      setWorkTitle('');
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

  // 章节拆分逻辑（来自 SmartReads - 按单章处理）
  const splitTextToChapters = async (content: string): Promise<Chapter[]> => {
    // 参考 SmartReads 的 useFileHandler.js 中的 splitTextToChapters
    // 只把出现在"行首"的章节标题识别为有效标题
    // 支持多种章节标题格式
    const headingPattern = /(^\s*(?:第\s*[0-9一二三四五六七八九十百千零]+\s*[章回节卷篇]|(?:Chapter|CHAPTER)\s*\d+|序章|楔子|尾声|后记|番外)[^\n]*\n)/gm;
    
    const parts = content.split(headingPattern);
    const chapters: Chapter[] = [];

    if (parts.length > 1) {
      // 第一个 part 是前言（在第一个章节标题之前的内容）
      // 从 parts[1] 开始，奇数索引是标题，偶数索引是内容
      for (let i = 1; i < parts.length; i += 2) {
        const rawTitleLine = parts[i] || '';
        const nextContent = (i + 1 < parts.length ? parts[i + 1] : '').trim();

        // 标题行去掉换行与首尾空白
        const title = rawTitleLine.replace(/\n/g, '').trim();

        // 过滤无效/过短内容，避免广告或孤立标题
        if (nextContent && nextContent.length > 50) {
          // 提取章节号（如果有）
          const chapterNumberMatch = title.match(/第\s*([0-9一二三四五六七八九十百千零]+)\s*[章回节卷篇]|(?:Chapter|CHAPTER)\s*(\d+)/);
          let chapterNumber = Math.floor(i / 2) + 1; // 默认按顺序编号
          
          if (chapterNumberMatch) {
            const cnNumber = chapterNumberMatch[1];
            const arNumber = chapterNumberMatch[2];
            if (arNumber) {
              chapterNumber = parseInt(arNumber);
            } else if (cnNumber) {
              // 转换中文数字为阿拉伯数字
              chapterNumber = convertChineseNumberToArabic(cnNumber);
            }
          }

          chapters.push({
            id: `chapter-${chapters.length + 1}`,
            title: title,
            content: `${title}\n\n${nextContent}`,
            number: chapterNumber
          });
        }
      }
    }

    // 如果没有识别到章节，将整个文本作为一章
    if (chapters.length === 0) {
      chapters.push({
        id: 'chapter-1',
        title: '全文',
        content: content,
        number: 1
      });
    }

    return chapters;
  };

  // 辅助函数：转换中文数字为阿拉伯数字
  const convertChineseNumberToArabic = (cnNum: string): number => {
    const cnNums: Record<string, number> = {
      '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, 
      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
      '百': 100, '千': 1000
    };

    let result = 0;
    let temp = 0;
    let unit = 1;

    for (let i = cnNum.length - 1; i >= 0; i--) {
      const char = cnNum[i];
      const num = cnNums[char];
      
      if (num === undefined) continue;
      
      if (num >= 10) {
        unit = num;
        if (temp === 0) temp = 1;
      } else {
        temp = num;
      }
      
      result += temp * unit;
      if (num < 10) {
        temp = 0;
        unit = 1;
      }
    }

    return result || 1;
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
      const parsedChapters = await splitTextToChapters(content);
      
      setChapters(parsedChapters);
      setSplitStatus('completed');
      
      console.log(`✅ 章节拆分完成，共 ${parsedChapters.length} 章`);
      
      // 默认选择前5章
      setSelectedChapters(parsedChapters.slice(0, Math.min(5, parsedChapters.length)).map(ch => ch.id));
    } catch (error) {
      console.error('拆分失败:', error);
      setErrorMessage(error instanceof Error ? error.message : '拆分失败');
      setSplitStatus('error');
    }
  };

  // 切换章节选择
  const toggleChapterSelection = (chapterId: string) => {
    setSelectedChapters(prev => 
      prev.includes(chapterId)
        ? prev.filter(id => id !== chapterId)
        : [...prev, chapterId]
    );
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedChapters.length === chapters.length) {
      setSelectedChapters([]);
    } else {
      setSelectedChapters(chapters.map(ch => ch.id));
    }
  };

  // 开始创建作品和章节（不进行AI分析）
  const handleStartAnalysis = async () => {
    if (selectedChapters.length === 0) {
      setErrorMessage('请至少选择一章进行创建');
      return;
    }

    try {
      setAnalysisStatus('analyzing');
      setErrorMessage('');
      setAnalysisProgress(0);
      
      const selectedChaptersData = chapters.filter(ch => selectedChapters.includes(ch.id));
      
      console.log(`📚 开始创建作品和章节 ${selectedChaptersData.length} 章`);
      
      // 准备章节数据
      const chaptersData = selectedChaptersData.map(ch => ({
        chapter_number: ch.number,
        title: ch.title,
        content: ch.content,
        volume_number: 1
      }));
      
      // 调用创建接口（一次性创建所有章节，不进行AI分析）
      const fileName = selectedFile?.name || 'unknown.txt';
      const result = await createWorkFromFile(fileName, chaptersData);
      
      // 更新作品信息
      if (result.work_id) {
        setWorkId(String(result.work_id));
        setWorkTitle(result.work_title);
      }
      
      // 更新分析结果（显示创建成功的信息）
      selectedChaptersData.forEach((chapter, index) => {
        const createdChapter = result.created_chapters.find(
          c => c.chapter_number === chapter.number
        );
        
        setAnalysisResults(prev => ({
          ...prev,
          [chapter.id]: {
            fileName: chapter.title,
            content: createdChapter 
              ? `✅ 章节创建成功\n\n章节ID: ${createdChapter.chapter_id}\n章节号: ${createdChapter.chapter_number}\n标题: ${createdChapter.title}`
              : '⚠️ 章节已存在，跳过创建',
            isComplete: true,
            hasError: false,
            timestamp: Date.now(),
            metadata: {
              work_id: result.work_id,
              chapter_id: createdChapter?.chapter_id,
              work_created: result.work_created,
            }
          }
        }));
      });
      
      setAnalysisProgress(100);
      setAnalysisStatus('completed');
      setCurrentAnalyzingChapter('');
      
      console.log('🎉 所有章节创建完成！', {
        work_id: result.work_id,
        work_title: result.work_title,
        chapters_created: result.chapters_created,
        chapters_skipped: result.chapters_skipped
      });
      
    } catch (error) {
      console.error('创建失败:', error);
      setErrorMessage(error instanceof Error ? error.message : '创建失败');
      setAnalysisStatus('error');
    }
  };

  // 切换章节展开/折叠
  const toggleChapterExpand = (chapterId: string) => {
    setExpandedChapters(prev => {
      const newSet = new Set(prev);
      if (newSet.has(chapterId)) {
        newSet.delete(chapterId);
      } else {
        newSet.add(chapterId);
      }
      return newSet;
    });
  };

  // 展开所有章节
  const expandAll = () => {
    setExpandedChapters(new Set(Object.keys(analysisResults)));
  };

  // 折叠所有章节
  const collapseAll = () => {
    setExpandedChapters(new Set());
  };

  // 调试：在控制台输出完整内容
  const debugContent = (chapterId: string) => {
    const result = analysisResults[chapterId];
    if (result) {
      console.log(`🔍 [调试] ${result.fileName} 完整内容:`);
      console.log(`   长度: ${result.content.length} 字符`);
      console.log(`   内容:\n${result.content}`);
      console.log(`   元数据:`, result.metadata);
    }
  };

  // 下载分析结果
  const handleDownloadResults = () => {
    const allResults = Object.values(analysisResults)
      .map(result => {
        console.log(`📥 导出章节: ${result.fileName}, 长度: ${result.content.length} 字符`);
        return result.content;
      })
      .join('\n\n---\n\n');
    
    console.log(`📦 导出总长度: ${allResults.length} 字符`);
    
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
        <div>
        <h1>拆书分析工具</h1>
          {workId && workTitle && (
            <div className="work-info" style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
              作品: {workTitle} (ID: {workId})
            </div>
          )}
        </div>
        <div className="header-actions">
          {apiStatus === 'connected' && (
            <div className="api-status connected" title="AI服务已连接">
              <CheckCircle size={16} />
              <span>AI已连接</span>
            </div>
          )}
          {apiStatus === 'error' && (
            <div className="api-status error" title="AI服务连接失败">
              <AlertCircle size={16} />
              <span>AI未连接</span>
            </div>
          )}
          {apiStatus === 'checking' && (
            <div className="api-status checking" title="正在检查连接">
              <Loader2 size={16} className="spinner" />
              <span>检查中...</span>
            </div>
          )}
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
            <h2>2. 识别章节</h2>
            <div className="split-settings">
              <p className="hint-text">系统会自动识别章节标题（支持"第X章"、"Chapter X"等格式）</p>
              <button
                className="primary-button"
                onClick={handleSplitChapters}
                disabled={!selectedFile || splitStatus === 'splitting'}
              >
                {splitStatus === 'splitting' ? (
                  <>
                    <Loader2 size={16} className="spinner" />
                    识别中...
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    识别章节
                  </>
                )}
              </button>
            </div>
          </div>

          {chapters.length > 0 && (
            <div className="panel-section">
              <h2>3. 选择要分析的章节</h2>
              <div className="groups-header">
                <span>共 {chapters.length} 章</span>
                <button className="text-button" onClick={toggleSelectAll}>
                  {selectedChapters.length === chapters.length ? '取消全选' : '全选'}
                </button>
              </div>
              <div className="chapter-groups-list">
                {chapters.map((chapter) => (
                  <div
                    key={chapter.id}
                    className={`group-item ${selectedChapters.includes(chapter.id) ? 'selected' : ''}`}
                    onClick={() => toggleChapterSelection(chapter.id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedChapters.includes(chapter.id)}
                      onChange={() => {}}
                    />
                    <div className="group-info">
                      <div className="group-name">
                        <span className="chapter-number">#{chapter.number}</span>
                        {chapter.title}
                      </div>
                      <div className="group-size">{Math.round(chapter.content.length / 1000)}K 字符</div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="primary-button analyze-button"
                onClick={handleStartAnalysis}
                disabled={selectedChapters.length === 0 || analysisStatus === 'analyzing'}
              >
                {analysisStatus === 'analyzing' ? (
                  <>
                    <Loader2 size={16} className="spinner" />
                    分析中... ({Math.round(analysisProgress)}%)
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    开始 AI 分析（{selectedChapters.length} 章）
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
            <h2>分析结果 ({Object.keys(analysisResults).length})</h2>
            <div className="header-actions-group">
              {Object.keys(analysisResults).length > 0 && (
                <>
                  <button 
                    className="text-button" 
                    onClick={expandAll}
                    title="展开所有"
                  >
                    展开全部
                  </button>
                  <button 
                    className="text-button" 
                    onClick={collapseAll}
                    title="折叠所有"
                  >
                    折叠全部
                  </button>
                  <button className="icon-button" onClick={handleDownloadResults} title="下载结果">
                    <Download size={20} />
                  </button>
                </>
              )}
            </div>
          </div>

          {analysisStatus === 'analyzing' && (
            <div className="analyzing-status">
              <Loader2 size={32} className="spinner" />
              <p>正在分析：{currentAnalyzingChapter}</p>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${analysisProgress}%` }} />
              </div>
              <p className="progress-text">{Math.round(analysisProgress)}% 完成</p>
            </div>
          )}

          <div className="results-content">
            {Object.entries(analysisResults).map(([chapterId, result]) => {
              // 根据 chapterId 查找对应的章节信息
              const chapter = chapters.find(ch => ch.id === chapterId);
              const isExpanded = expandedChapters.has(chapterId);
              
              return (
                <div key={chapterId} className={`result-item ${isExpanded ? 'expanded' : 'collapsed'}`}>
                  <div 
                    className="result-header clickable"
                    onClick={() => toggleChapterExpand(chapterId)}
                  >
                    <div className="result-title">
                      <button className="expand-button" title={isExpanded ? '折叠' : '展开'}>
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                      {chapter && (
                        <span className="chapter-badge">#{chapter.number}</span>
                      )}
                      <h3>{result.fileName}</h3>
                      {result.hasError && (
                        <span className="error-badge">失败</span>
                      )}
                      {!result.hasError && result.isComplete && (
                        <span className="success-badge">完成</span>
                      )}
                      {!result.isComplete && (
                        <span className="analyzing-badge">分析中...</span>
                      )}
                    </div>
                    <div className="result-header-right">
                      {result.metadata?.duration && (
                        <span className="duration-badge">{result.metadata.duration}秒</span>
                      )}
                      <span className="content-length-badge" title={`内容长度: ${result.content.length} 字符`}>
                        {Math.round(result.content.length / 1000)}K
                      </span>
                      <span className="timestamp">
                        {new Date(result.timestamp).toLocaleTimeString()}
                      </span>
                      {result.isComplete && (
                        <button
                          className="debug-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            debugContent(chapterId);
                          }}
                          title="在控制台查看完整内容"
                        >
                          🔍
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="result-body">
                      {result.metadata && Object.keys(result.metadata).length > 0 && (
                        <div className="metadata-info">
                          <div className="metadata-grid">
                            {result.metadata.model && (
                              <div className="metadata-item">
                                <span className="metadata-label">🤖 模型</span>
                                <span className="metadata-value">{result.metadata.model}</span>
                              </div>
                            )}
                            {result.metadata.temperature !== undefined && (
                              <div className="metadata-item">
                                <span className="metadata-label">🌡️ 温度</span>
                                <span className="metadata-value">{result.metadata.temperature}</span>
                              </div>
                            )}
                            {result.metadata.duration !== undefined && (
                              <div className="metadata-item">
                                <span className="metadata-label">⏱️ 耗时</span>
                                <span className="metadata-value">{result.metadata.duration}秒</span>
                              </div>
                            )}
                            {result.metadata.estimated_tokens !== undefined && (
                              <div className="metadata-item">
                                <span className="metadata-label">📊 Tokens</span>
                                <span className="metadata-value">{result.metadata.estimated_tokens}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="result-content">
                        {result.hasError ? (
                          <div className="error-content">
                            <pre>{result.content}</pre>
                          </div>
                        ) : (
                          <div className="markdown-content">
                            <pre>{result.content}</pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            
            {Object.keys(analysisResults).length === 0 && analysisStatus === 'idle' && (
              <div className="empty-results">
                <FileText size={48} />
                <p>上传小说文件并识别章节后，即可开始 AI 分析</p>
                <p className="hint">📝 采用 SmartReads 的处理逻辑，按单章进行分析</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

