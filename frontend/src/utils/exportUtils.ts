/**
 * 导出工具函数
 * 支持导出作品为 Text、Word、PDF 格式
 */

import { chaptersApi, type Chapter } from './chaptersApi';
import { type Work } from './worksApi';

/**
 * 从 HTML 内容中提取纯文本
 */
function htmlToText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

/**
 * 分页获取所有章节（后端限制 size 最大为 100）
 */
async function getAllChapters(workId: string): Promise<Chapter[]> {
  const allChapters: Chapter[] = [];
  let page = 1;
  const pageSize = 100; // 后端限制最大为 100
  let hasMore = true;
  
  while (hasMore) {
    
    const chaptersResponse = await chaptersApi.listChapters({
      work_id: workId,
      page: page,
      size: pageSize,
      sort_by: 'chapter_number',
      sort_order: 'asc',
    });
    
    
    allChapters.push(...chaptersResponse.chapters);
    
    // 检查是否还有更多章节
    hasMore = chaptersResponse.chapters.length === pageSize && allChapters.length < chaptersResponse.total;
    page++;
    
    // 安全限制：最多获取 1000 个章节
    if (allChapters.length >= 1000) {
      console.warn('⚠️ 章节数量超过 1000，停止获取');
      break;
    }
  }
  
  
  return allChapters;
}

/**
 * 导出为 Text 格式
 */
export async function exportAsText(work: Work): Promise<void> {
  try {
    
    
    // 获取所有章节（分页获取，因为后端限制 size 最大为 100）
    let chapters: Chapter[];
    try {
      
      chapters = await getAllChapters(work.id);
    } catch (listErr) {
      console.error('❌ [导出Text] 获取章节列表失败:', listErr);
      console.error('❌ [导出Text] 错误类型:', typeof listErr);
      console.error('❌ [导出Text] 错误详情:', listErr);
      
      // 更好地提取错误信息
      let errorMsg = '未知错误';
      if (listErr instanceof Error) {
        errorMsg = listErr.message || listErr.toString();
      } else if (typeof listErr === 'object' && listErr !== null) {
        // 尝试提取常见的错误字段
        if ('detail' in listErr && typeof listErr.detail === 'string') {
          errorMsg = listErr.detail;
        } else if ('message' in listErr && typeof listErr.message === 'string') {
          errorMsg = listErr.message;
        } else if ('error' in listErr && typeof listErr.error === 'string') {
          errorMsg = listErr.error;
        } else {
          // 尝试序列化，如果失败则使用 toString
          try {
            const serialized = JSON.stringify(listErr, null, 2);
            errorMsg = serialized.length > 200 ? serialized.substring(0, 200) + '...' : serialized;
          } catch {
            errorMsg = String(listErr);
          }
        }
      } else {
        errorMsg = String(listErr);
      }
      
      console.error('❌ [导出Text] 提取的错误信息:', errorMsg);
      throw new Error(`获取章节列表失败: ${errorMsg}`);
    }

    if (chapters.length === 0) {
      console.warn('⚠️ [导出Text] 作品没有章节，将导出空文件');
    }

    // 构建文本内容
    let content = `${work.title}\n`;
    if (work.description) {
      content += `\n${work.description}\n`;
    }
    content += `\n${'='.repeat(50)}\n\n`;

    // 获取每个章节的内容
    for (const chapter of chapters) {
      try {
        let chapterContent = '';
        
        // 尝试从 ShareDB 获取最新内容
        try {
          const docResponse = await chaptersApi.getChapterDocument(chapter.id);
          
          
          // 统一格式：content 必须是字符串
          if (docResponse && docResponse.content) {
            if (typeof docResponse.content === 'string') {
              chapterContent = docResponse.content;
            } else {
              console.warn(`⚠️ [导出Text] 章节 ${chapter.id} ShareDB 响应中 content 格式错误，应为字符串:`, typeof docResponse.content);
              chapterContent = '';
            }
          } else {
            console.warn(`⚠️ [导出Text] 章节 ${chapter.id} ShareDB 响应中没有 content`);
          }
        } catch (docErr) {
          console.warn(`⚠️ [导出Text] 从 ShareDB 获取章节 ${chapter.id} 内容失败:`, docErr);
          if (docErr instanceof Error) {
            console.warn(`⚠️ [导出Text] 错误信息:`, docErr.message);
          } else if (typeof docErr === 'object' && docErr !== null) {
            console.warn(`⚠️ [导出Text] 错误对象:`, JSON.stringify(docErr));
          }
        }

        // 如果没有内容，尝试从章节详情获取
        if (!chapterContent || chapterContent.trim() === '') {
          try {
            const chapterDetail = await chaptersApi.getChapter(chapter.id);
            chapterContent = chapterDetail.content || '';
          } catch (detailErr) {
            console.warn(`从章节详情获取章节 ${chapter.id} 内容失败:`, detailErr);
          }
        }

        // 将 HTML 转换为纯文本
        const textContent = chapterContent ? htmlToText(chapterContent) : '[章节内容为空]';

        content += `第 ${chapter.chapter_number} 章 ${chapter.title}\n`;
        content += `${'-'.repeat(50)}\n\n`;
        content += `${textContent}\n\n\n`;
      } catch (err) {
        console.error(`获取章节 ${chapter.id} 内容失败:`, err);
        content += `第 ${chapter.chapter_number} 章 ${chapter.title}\n`;
        content += `${'-'.repeat(50)}\n\n`;
        content += `[内容获取失败: ${err instanceof Error ? err.message : String(err)}]\n\n\n`;
      }
    }

    // 创建并下载文件
    const fileName = `${work.title.replace(/[<>:"/\\|?*]/g, '_')}.txt`;
    
    
    if (content.length === 0) {
      console.warn('⚠️ [导出Text] 内容为空，但继续创建文件');
    }
    
    try {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      
      
      const url = URL.createObjectURL(blob);
      
      
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      link.style.position = 'absolute';
      link.style.left = '-9999px';
      
      
      document.body.appendChild(link);
      
      
      
      link.click();
      
      
      // 等待一小段时间确保下载开始
      await new Promise(resolve => setTimeout(resolve, 200));
      
      
      document.body.removeChild(link);
      
      
      URL.revokeObjectURL(url);
      
      
      
    } catch (downloadError) {
      console.error('❌ [导出Text] 下载过程出错:', downloadError);
      let downloadErrorMsg = '未知错误';
      if (downloadError instanceof Error) {
        downloadErrorMsg = downloadError.message || downloadError.toString();
      } else if (typeof downloadError === 'object' && downloadError !== null) {
        if ('message' in downloadError && typeof downloadError.message === 'string') {
          downloadErrorMsg = downloadError.message;
        } else {
          try {
            downloadErrorMsg = JSON.stringify(downloadError);
          } catch {
            downloadErrorMsg = String(downloadError);
          }
        }
      } else {
        downloadErrorMsg = String(downloadError);
      }
      throw new Error(`文件下载失败: ${downloadErrorMsg}`);
    }
  } catch (error) {
    console.error('❌ [导出Text] 导出失败:', error);
    console.error('❌ [导出Text] 错误类型:', typeof error);
    console.error('❌ [导出Text] 错误详情:', error);
    
    // 更好地处理错误信息
    let errorMessage = '未知错误';
    if (error instanceof Error) {
      errorMessage = error.message || error.toString();
    } else if (typeof error === 'object' && error !== null) {
      // 如果是对象，尝试提取有用的信息
      if ('message' in error && typeof error.message === 'string') {
        errorMessage = error.message;
      } else if ('detail' in error && typeof error.detail === 'string') {
        errorMessage = error.detail;
      } else {
        try {
          errorMessage = JSON.stringify(error);
        } catch {
          errorMessage = String(error);
        }
      }
    } else {
      errorMessage = String(error);
    }
    
    console.error('❌ [导出Text] 错误堆栈:', error instanceof Error ? error.stack : '无堆栈信息');
    throw new Error(`导出 Text 失败: ${errorMessage}`);
  }
}

/**
 * 导出为 Word 格式
 */
export async function exportAsWord(work: Work): Promise<void> {
  try {
    
    
    // 获取所有章节（分页获取）
    
    const chapters = await getAllChapters(work.id);
    
    if (chapters.length === 0) {
      console.warn('⚠️ [导出Word] 作品没有章节，将导出空文件');
    }

    // 构建 HTML 内容
    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${work.title}</title>
        <style>
          body {
            font-family: "Microsoft YaHei", "SimSun", serif;
            line-height: 1.8;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          h1 {
            text-align: center;
            font-size: 24px;
            margin-bottom: 10px;
          }
          .description {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
          }
          h2 {
            font-size: 20px;
            margin-top: 30px;
            margin-bottom: 15px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 5px;
          }
          .chapter-content {
            margin-bottom: 40px;
            text-indent: 2em;
          }
        </style>
      </head>
      <body>
        <h1>${work.title}</h1>
    `;

    if (work.description) {
      htmlContent += `<div class="description">${work.description}</div>`;
    }

    // 获取每个章节的内容
    for (const chapter of chapters) {
      try {
        let chapterContent = '';
        
        // 尝试从 ShareDB 获取最新内容
        try {
          const docResponse = await chaptersApi.getChapterDocument(chapter.id);
          if (docResponse.content) {
            // 统一格式：content 必须是字符串
            if (typeof docResponse.content === 'string') {
              chapterContent = docResponse.content;
            } else {
              console.warn(`⚠️ [导出] 章节 ${chapter.id} ShareDB 响应中 content 格式错误，应为字符串:`, typeof docResponse.content);
              chapterContent = '';
            }
          }
        } catch (docErr) {
          console.warn(`从 ShareDB 获取章节 ${chapter.id} 内容失败:`, docErr);
        }

        // 如果没有内容，尝试从章节详情获取
        if (!chapterContent || chapterContent.trim() === '') {
          try {
            const chapterDetail = await chaptersApi.getChapter(chapter.id);
            chapterContent = chapterDetail.content || '';
          } catch (detailErr) {
            console.warn(`从章节详情获取章节 ${chapter.id} 内容失败:`, detailErr);
          }
        }

        htmlContent += `
          <h2>第 ${chapter.chapter_number} 章 ${chapter.title}</h2>
          <div class="chapter-content">${chapterContent || '[章节内容为空]'}</div>
        `;
      } catch (err) {
        console.error(`获取章节 ${chapter.id} 内容失败:`, err);
        htmlContent += `
          <h2>第 ${chapter.chapter_number} 章 ${chapter.title}</h2>
          <div class="chapter-content">[内容获取失败: ${err instanceof Error ? err.message : String(err)}]</div>
        `;
      }
    }

    htmlContent += `
      </body>
      </html>
    `;

    // 创建并下载文件
    const fileName = `${work.title.replace(/[<>:"/\\|?*]/g, '_')}.doc`;
    
    
    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    
    
    link.click();
    
    // 等待一小段时间确保下载开始
    await new Promise(resolve => setTimeout(resolve, 100));
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error('❌ [导出Word] 导出失败:', error);
    throw new Error(`导出 Word 失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

/**
 * 导出为 PDF 格式
 * 使用浏览器打印功能生成 PDF
 */
export async function exportAsPdf(work: Work): Promise<void> {
  try {
    // 获取所有章节（分页获取）
    
    const chapters = await getAllChapters(work.id);
    
    if (chapters.length === 0) {
      console.warn('⚠️ [导出PDF] 作品没有章节，将导出空文件');
    }

    // 创建打印窗口
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      throw new Error('无法打开打印窗口，请检查浏览器弹窗设置');
    }

    // 构建 HTML 内容
    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${work.title}</title>
        <style>
          @media print {
            body {
              margin: 0;
              padding: 20px;
            }
            .page-break {
              page-break-before: always;
            }
          }
          body {
            font-family: "Microsoft YaHei", "SimSun", serif;
            line-height: 1.8;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            font-size: 14px;
          }
          h1 {
            text-align: center;
            font-size: 24px;
            margin-bottom: 10px;
          }
          .description {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
          }
          h2 {
            font-size: 20px;
            margin-top: 30px;
            margin-bottom: 15px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 5px;
            page-break-after: avoid;
          }
          .chapter-content {
            margin-bottom: 40px;
            text-indent: 2em;
          }
          .chapter-content p {
            margin: 0.8em 0;
          }
        </style>
      </head>
      <body>
        <h1>${work.title}</h1>
    `;

    if (work.description) {
      htmlContent += `<div class="description">${work.description}</div>`;
    }

    // 获取每个章节的内容
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      try {
        let chapterContent = '';
        
        // 尝试从 ShareDB 获取最新内容
        try {
          const docResponse = await chaptersApi.getChapterDocument(chapter.id);
          if (docResponse.content) {
            // 统一格式：content 必须是字符串
            if (typeof docResponse.content === 'string') {
              chapterContent = docResponse.content;
            } else {
              console.warn(`⚠️ [导出] 章节 ${chapter.id} ShareDB 响应中 content 格式错误，应为字符串:`, typeof docResponse.content);
              chapterContent = '';
            }
          }
        } catch (docErr) {
          console.warn(`从 ShareDB 获取章节 ${chapter.id} 内容失败:`, docErr);
        }

        // 如果没有内容，尝试从章节详情获取
        if (!chapterContent || chapterContent.trim() === '') {
          try {
            const chapterDetail = await chaptersApi.getChapter(chapter.id);
            chapterContent = chapterDetail.content || '';
          } catch (detailErr) {
            console.warn(`从章节详情获取章节 ${chapter.id} 内容失败:`, detailErr);
          }
        }

        // 添加分页（除了第一章）
        if (i > 0) {
          htmlContent += '<div class="page-break"></div>';
        }

        htmlContent += `
          <h2>第 ${chapter.chapter_number} 章 ${chapter.title}</h2>
          <div class="chapter-content">${chapterContent || '[章节内容为空]'}</div>
        `;
      } catch (err) {
        console.error(`获取章节 ${chapter.id} 内容失败:`, err);
        if (i > 0) {
          htmlContent += '<div class="page-break"></div>';
        }
        htmlContent += `
          <h2>第 ${chapter.chapter_number} 章 ${chapter.title}</h2>
          <div class="chapter-content">[内容获取失败: ${err instanceof Error ? err.message : String(err)}]</div>
        `;
      }
    }

    htmlContent += `
      </body>
      </html>
    `;

    // 写入内容并打印
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    // 等待内容加载完成后打印
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        // 打印后关闭窗口（可选）
        // printWindow.close();
      }, 500);
    };
  } catch (error) {
    console.error('导出 PDF 失败:', error);
    throw new Error('导出失败，请稍后重试');
  }
}
