import { useState, useRef } from 'react';
import { X, Upload, FileText, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { createWorkFromFile } from '../utils/bookAnalysisApi';
import { convertTextToHtml } from '../utils/editorHelpers';
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
  volumeNumber?: number;
  originalVolumeNumber?: number;
  originalChapterNumber?: number;
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
    // 支持识别：第X章、第X卷第Y章、第X回、Chapter X 等格式
    const headingPattern = /(^\s*(?:第\s*[0-9一二三四五六七八九十百千零]+\s*[卷]\s*第\s*[0-9一二三四五六七八九十百千零]+\s*[章回节]|第\s*[0-9一二三四五六七八九十百千零]+\s*[章回节卷篇]|(?:Chapter|CHAPTER)\s*\d+|序章|楔子|尾声|后记|番外)[^\n]*\n)/gm;
    const parts = content.split(headingPattern);
    const chapters: Chapter[] = [];
    let currentVolumeNumber = 1;
    let chapterCountInVolumes: Record<number, number> = {}; // 记录每卷的章节数

    for (let i = 1; i < parts.length; i += 2) {
      if (parts[i] && parts[i + 1]) {
        const heading = parts[i].trim();
        const content = parts[i + 1].trim();
        
        if (content) {
          let volumeNumber = 1;
          let chapterNumber = 0;
          let originalVolumeNumber: number | undefined;
          let originalChapterNumber: number | undefined;

          // 优先匹配：第X卷第Y章 格式
          const volumeChapterMatch = heading.match(/第\s*([0-9一二三四五六七八九十百千零]+)\s*卷\s*第\s*([0-9一二三四五六七八九十百千零]+)\s*[章回节]/);
          if (volumeChapterMatch) {
            // 解析卷号
            const volNumStr = volumeChapterMatch[1];
            if (/[一二三四五六七八九十百千零]/.test(volNumStr)) {
              volumeNumber = convertChineseNumberToArabic(volNumStr);
            } else {
              volumeNumber = parseInt(volNumStr, 10);
            }
            
            // 解析章节号
            const chNumStr = volumeChapterMatch[2];
            if (/[一二三四五六七八九十百千零]/.test(chNumStr)) {
              chapterNumber = convertChineseNumberToArabic(chNumStr);
            } else {
              chapterNumber = parseInt(chNumStr, 10);
            }
            
            originalVolumeNumber = volumeNumber;
            originalChapterNumber = chapterNumber;
            currentVolumeNumber = volumeNumber;
          } else {
            // 匹配：第X卷（单独出现，表示卷的开始）
            const volumeMatch = heading.match(/第\s*([0-9一二三四五六七八九十百千零]+)\s*卷/);
            if (volumeMatch) {
              const volNumStr = volumeMatch[1];
              if (/[一二三四五六七八九十百千零]/.test(volNumStr)) {
                volumeNumber = convertChineseNumberToArabic(volNumStr);
              } else {
                volumeNumber = parseInt(volNumStr, 10);
              }
              currentVolumeNumber = volumeNumber;
              chapterNumber = 1; // 新卷的第一章
            } else {
              // 匹配普通章节：第X章
              const chapterMatch = heading.match(/第\s*([0-9一二三四五六七八九十百千零]+)\s*[章回节卷篇]|(?:Chapter|CHAPTER)\s*(\d+)/);
              if (chapterMatch) {
                const cnNum = chapterMatch[1];
                const enNum = chapterMatch[2];
                if (enNum) {
                  chapterNumber = parseInt(enNum, 10);
                } else if (cnNum) {
            if (/[一二三四五六七八九十百千零]/.test(cnNum)) {
              chapterNumber = convertChineseNumberToArabic(cnNum);
            } else {
              chapterNumber = parseInt(cnNum, 10);
            }
                }
                volumeNumber = currentVolumeNumber;
                // 保存原始章节号，用于后续排序和修正
                originalChapterNumber = chapterNumber;
          } else {
                // 特殊章节（序章、楔子等）
                volumeNumber = currentVolumeNumber;
                chapterNumber = 0; // 特殊章节编号为0
              }
            }
          }

          chapters.push({
            id: `chapter-${volumeNumber}-${chapterNumber}`,
            title: heading,
            content: content,
            number: chapterNumber,
            volumeNumber: volumeNumber,
            originalVolumeNumber: originalVolumeNumber,
            originalChapterNumber: originalChapterNumber
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
        number: 1,
        volumeNumber: 1
      });
    }

    // 按照出现顺序排序（保持原有顺序，不重新排序）
    // 这样可以在处理章节号回退时正确识别

    // 修正章节号为递增顺序
    // 使用简单的顺序递增逻辑，严格按照出现顺序递增
    // 处理章节号回退的情况（比如第29章后又出现第一章，应该识别为第30章）
    let globalChapterNumber = 1;
    let currentVolume = 1; // 当前卷号
    let lastChapterNumber = 0; // 记录上一章的原始章节号
    let lastGlobalChapterNumber = 0; // 记录上一章的全局章节号
    let volumeStartNumbers: Record<number, number> = { 1: 1 }; // 记录每卷的起始章节号
    
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      const origVolNum = chapter.originalVolumeNumber || chapter.volumeNumber || 1;
      let volNum = origVolNum;
      const origChNum = chapter.originalChapterNumber || chapter.number || 0;
      
      // 如果是特殊章节（序章、楔子等），保持编号为0
      if (origChNum === 0 || chapter.title.match(/序章|楔子|尾声|后记|番外/)) {
        chapter.number = 0;
        continue;
      }
      
      // 如果章节有明确的卷号信息，且大于当前卷号，更新当前卷号
      if (origVolNum > currentVolume) {
        currentVolume = origVolNum;
        volNum = origVolNum;
        if (!volumeStartNumbers[volNum]) {
          volumeStartNumbers[volNum] = globalChapterNumber;
        }
      } else {
        // 使用当前卷号
        volNum = currentVolume;
      }
      
      // 检查章节号是否回退（比如从29章回到1章）
      // 只有在没有明确卷号信息时才进行回退检测
      if (!chapter.originalVolumeNumber && origChNum < lastChapterNumber && lastChapterNumber > 0) {
        // 章节号回退了，应该识别为新卷
        currentVolume = currentVolume + 1;
        volNum = currentVolume;
        if (!volumeStartNumbers[volNum]) {
          volumeStartNumbers[volNum] = globalChapterNumber;
        }
      }
      
      // 严格按照出现顺序递增，避免跳过章节号
      // 新卷的第一章应该比上一卷最后一章大1
      if (volNum > (chapter.originalVolumeNumber || 1) && lastGlobalChapterNumber > 0) {
        // 明确的新卷，从上一章+1开始
        globalChapterNumber = lastGlobalChapterNumber + 1;
      } else if (origChNum === lastChapterNumber && lastChapterNumber > 0) {
        // 章节号相同（重复），直接递增
        globalChapterNumber = lastGlobalChapterNumber + 1;
      } else if (origChNum < lastChapterNumber && lastChapterNumber > 0 && !chapter.originalVolumeNumber) {
        // 章节号回退了，直接递增（已经在上面更新了卷号）
        globalChapterNumber = lastGlobalChapterNumber + 1;
      } else if (origChNum > lastChapterNumber && lastChapterNumber > 0) {
        // 正常递增，但需要确保不跳过
        // 如果原始章节号的增量大于1，说明可能跳过了中间章节，直接递增
        const increment = origChNum - lastChapterNumber;
        if (increment === 1) {
          // 正常递增1，使用上一章+1
          globalChapterNumber = lastGlobalChapterNumber + 1;
        } else {
          // 跳过了中间章节，直接递增1，避免跳过
          globalChapterNumber = lastGlobalChapterNumber + 1;
        }
      } else {
        // 第一章或其他情况，直接使用当前值
        if (lastGlobalChapterNumber > 0) {
          globalChapterNumber = lastGlobalChapterNumber + 1;
        } else {
          globalChapterNumber = 1;
        }
      }
      
      // 更新章节号为全局递增编号
      chapter.number = globalChapterNumber;
      chapter.volumeNumber = volNum;
      
      // 更新记录
      lastChapterNumber = origChNum;
      lastGlobalChapterNumber = globalChapterNumber;
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

      setProgress(`正在创建作品和 ${chapters.length} 个章节...`);
      setStatus('creating');

      // 准备章节数据
      // 关键修复：将txt文本转换为HTML格式，统一前后端格式
      const chaptersData = chapters.map(ch => ({
        chapter_number: ch.number, // 使用修正后的递增章节号
        title: ch.title,
        // 将纯文本转换为HTML格式（换行符转换为段落）
        content: convertTextToHtml(ch.content),
        volume_number: ch.volumeNumber || 1 // 使用解析出的卷号
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

