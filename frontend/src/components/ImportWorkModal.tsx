import { useState, useRef } from 'react';
import { X, Upload, FileText, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { createWorkFromFile } from '../utils/bookAnalysisApi';
import './ImportWorkModal.css';

interface ImportWorkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (workId: number, workTitle: string) => void;
}

interface Chapter {
  id: string;
  title: string;
  content: string;
  number: number;
}

export default function ImportWorkModal({ isOpen, onClose, onSuccess }: ImportWorkModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'splitting' | 'creating' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [workId, setWorkId] = useState<number | null>(null);
  const [workTitle, setWorkTitle] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

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

  // 章节拆分逻辑
  const splitTextToChapters = async (content: string): Promise<Chapter[]> => {
    const headingPattern = /(^\s*(?:第\s*[0-9一二三四五六七八九十百千零]+\s*[章回节卷篇]|(?:Chapter|CHAPTER)\s*\d+|序章|楔子|尾声|后记|番外)[^\n]*\n)/gm;
    const parts = content.split(headingPattern);
    const chapters: Chapter[] = [];
    let chapterNumber = 0;

    for (let i = 1; i < parts.length; i += 2) {
      if (parts[i] && parts[i + 1]) {
        const heading = parts[i].trim();
        const content = parts[i + 1].trim();
        
        if (content) {
          // 提取章节号
          const numberMatch = heading.match(/(\d+|[一二三四五六七八九十百千零]+)/);
          if (numberMatch) {
            const cnNum = numberMatch[1];
            if (/[一二三四五六七八九十百千零]/.test(cnNum)) {
              chapterNumber = convertChineseNumberToArabic(cnNum);
            } else {
              chapterNumber = parseInt(cnNum, 10);
            }
          } else {
            chapterNumber++;
          }

          chapters.push({
            id: `chapter-${chapterNumber}`,
            title: heading,
            content: content,
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

  // 转换中文数字为阿拉伯数字
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

  // 处理文件选择
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      // 检查文件类型
      if (!selectedFile.name.match(/\.(txt|md)$/i)) {
        setErrorMessage('请选择 .txt 或 .md 格式的文件');
        return;
      }
      setFile(selectedFile);
      setErrorMessage('');
      setStatus('idle');
    }
  };

  // 处理导入
  const handleImport = async () => {
    if (!file) {
      setErrorMessage('请先选择文件');
      return;
    }

    try {
      setStatus('uploading');
      setProgress('正在读取文件...');
      setErrorMessage('');

      // 读取文件内容
      const content = await readTextFile(file);
      setProgress('正在拆分章节...');
      setStatus('splitting');

      // 拆分章节
      const chapters = await splitTextToChapters(content);
      console.log(`✅ 拆分完成，共 ${chapters.length} 章`);

      setProgress(`正在创建作品和 ${chapters.length} 个章节...`);
      setStatus('creating');

      // 准备章节数据
      const chaptersData = chapters.map(ch => ({
        chapter_number: ch.number,
        title: ch.title,
        content: ch.content,
        volume_number: 1
      }));

      // 调用创建接口
      const result = await createWorkFromFile(file.name, chaptersData);

      setWorkId(result.work_id);
      setWorkTitle(result.work_title);
      setStatus('success');
      setProgress(`成功创建作品 "${result.work_title}"，共 ${result.chapters_created} 个章节`);

      // 延迟关闭并触发成功回调
      setTimeout(() => {
        if (onSuccess) {
          onSuccess(result.work_id, result.work_title);
        }
        handleClose();
      }, 2000);

    } catch (error) {
      console.error('导入失败:', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '导入失败，请重试');
    }
  };

  // 关闭弹窗
  const handleClose = () => {
    setFile(null);
    setStatus('idle');
    setProgress('');
    setErrorMessage('');
    setWorkId(null);
    setWorkTitle('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  return (
    <div className="import-work-modal-overlay" onClick={handleClose}>
      <div className="import-work-modal" onClick={(e) => e.stopPropagation()}>
        <div className="import-work-modal-header">
          <h2>导入作品</h2>
          <button className="close-btn" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        <div className="import-work-modal-body">
          {status === 'success' ? (
            <div className="import-success">
              <CheckCircle size={48} className="success-icon" />
              <h3>导入成功！</h3>
              <p>{progress}</p>
            </div>
          ) : (
            <>
              <div className="file-upload-area">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md"
                  onChange={handleFileSelect}
                  className="file-input"
                  id="file-input"
                  disabled={status !== 'idle'}
                />
                <label htmlFor="file-input" className={`file-label ${status !== 'idle' ? 'disabled' : ''}`}>
                  {file ? (
                    <div className="file-selected">
                      <FileText size={32} />
                      <span>{file.name}</span>
                      <span className="file-size">({(file.size / 1024).toFixed(2)} KB)</span>
                    </div>
                  ) : (
                    <div className="file-placeholder">
                      <Upload size={32} />
                      <span>点击选择文件或拖拽文件到此处</span>
                      <span className="file-hint">支持 .txt 和 .md 格式</span>
                    </div>
                  )}
                </label>
              </div>

              {(status === 'uploading' || status === 'splitting' || status === 'creating') && (
                <div className="import-progress">
                  <Loader2 size={20} className="spinner" />
                  <span>{progress}</span>
                </div>
              )}

              {status === 'error' && errorMessage && (
                <div className="import-error">
                  <AlertCircle size={20} />
                  <span>{errorMessage}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="import-work-modal-footer">
          {status === 'success' ? (
            <button className="btn-primary" onClick={handleClose}>
              关闭
            </button>
          ) : (
            <>
              <button className="btn-secondary" onClick={handleClose} disabled={status !== 'idle'}>
                取消
              </button>
              <button
                className="btn-primary"
                onClick={handleImport}
                disabled={!file || status !== 'idle'}
              >
                {status === 'idle' ? '开始导入' : '导入中...'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

