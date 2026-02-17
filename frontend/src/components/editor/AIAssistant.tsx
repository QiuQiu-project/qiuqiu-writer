import { Send, Copy, Check, Loader2, Trash2, BookOpen, User, FileText } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import { streamChatMessage } from '../../utils/chatApi';
import type { ChatMessage, ContinueChapterResult } from '../../utils/chatApi';
import { formatOutlineSummary } from '../../utils/outlineFormat';
import { authApi } from '../../utils/authApi';
import { getAvatarInitial } from '../../utils/avatarUtils';
import { chaptersApi, type Chapter } from '../../utils/chaptersApi';
import { worksApi } from '../../utils/worksApi';
import MarkdownIt from 'markdown-it';
import './AIAssistant.css';

interface ChapterAnalysisCommandResult {
  chapterId: number;
  chapterNumber?: number;
  title?: string;
  outline?: string;
  detailedOutline?: string;
  success: boolean;
  error?: string;
}

interface WorkAnalysisCommandResult {
  success: boolean;
  message: string;
  analyzedCount?: number;
  errors?: string[];
}

interface AIAssistantProps {
  workId?: number | string | null;
  onAnalyzeChapterCommand?: (
    chapters: Array<{ id: number; chapter_number?: number; title?: string }>
  ) => Promise<ChapterAnalysisCommandResult[]>;
  onAnalyzeWorkCommand?: () => Promise<WorkAnalysisCommandResult | undefined>;
  /** 根据当前章节的大纲和细纲生成章节内容（对应章节设置中的「根据大纲和细纲生成」按钮），可用 /gen_chapter 触发 */
  onGenerateChapterFromOutline?: () => Promise<void>;
  /** 用户选择续写推荐方案后，用该方案的大纲和细纲创建新章节（打开章节设置弹窗并预填） */
  onUseContinueRecommendation?: (payload: {
    title: string;
    outline: Record<string, unknown> | string;
    detailed_outline: Record<string, unknown> | string;
    next_chapter_number: number;
  }) => void;
  /** 从编辑器选中发起对话时，只传章节引用（不显示选中正文，只显示徽章 @chapter:x 第n-m字） */
  initialSelectionRef?: { chapterId: string; startChar: number; endChar: number } | null;
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
});

interface MessageWithTime extends ChatMessage {
  timestamp?: Date;
  mentions?: Mention[];
  /** 续写章节命令返回的 3 个推荐方案，用于渲染卡片并选择创建章节 */
  continueChapterResult?: ContinueChapterResult;
}

interface Mention {
  type: 'chapter' | 'character';
  id: number | string; // 章节使用number，角色使用string（名称）
  name: string;
}

interface MentionOption {
  type: 'chapter' | 'character' | 'command';
  id: number | string; // 角色可能使用name作为id
  name: string;
  subtitle?: string;
  isCommand?: boolean; // 是否为指令选项
  commandKind?: 'mention' | 'slash';
}

interface CharacterFromMetadata {
  name: string;
  display_name?: string;
  description?: string;
  [key: string]: unknown;
}

export default function AIAssistant({
  workId,
  // onAnalyzeChapterCommand,
  // onAnalyzeWorkCommand,
  onGenerateChapterFromOutline,
  onUseContinueRecommendation,
  initialSelectionRef,
}: AIAssistantProps) {
  const [message, setMessage] = useState('');
  const [charCount, setCharCount] = useState(0);
  const [messages, setMessages] = useState<MessageWithTime[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // @ 提及相关状态
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [mentionOptions, setMentionOptions] = useState<MentionOption[]>([]);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [characters, setCharacters] = useState<CharacterFromMetadata[]>([]);
  const mentionMenuRef = useRef<HTMLDivElement>(null);

  const user = authApi.getUserInfo();
  const userInitial = getAvatarInitial(user?.username, user?.display_name);

  // 检查登录状态
  useEffect(() => {
    setIsAuthenticated(authApi.isAuthenticated());
  }, []);

  // 加载章节和作品信息（包含角色）
  useEffect(() => {
    if (!workId || !isAuthenticated) return;

    const loadData = async () => {
      try {
        const workIdStr = String(workId);
        
        // 加载章节列表
        const chaptersResponse = await chaptersApi.listChapters({
          work_id: workIdStr,
          page: 1,
          size: 100,
          sort_by: 'chapter_number',
          sort_order: 'asc',
        });
        setChapters(chaptersResponse.chapters);

        // 加载作品详情（包含metadata中的角色信息）
        const workData = await worksApi.getWork(workIdStr);
        
        // 从作品metadata的component_data中提取角色信息
        const componentData = workData.metadata?.component_data || {characters: []};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const charactersFromComponentData = (componentData as any).characters || [];
        setCharacters(charactersFromComponentData);
      } catch (err) {
        console.error('加载章节/作品信息失败:', err);
      }
    };

    loadData();
  }, [workId, isAuthenticated]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  // 从编辑器选中发起对话：只预填引用文案 @chapter:x 第n-m字（输入框内会以样式持久显示）
  useEffect(() => {
    if (!initialSelectionRef) return;
    const refStr = `@chapter:${initialSelectionRef.chapterId} 第${initialSelectionRef.startChar}-${initialSelectionRef.endChar}字`;
    setMessage(refStr);
    setCharCount(refStr.length);
    const t = setTimeout(() => textareaRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [initialSelectionRef]);


  // 点击外部关闭提及菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        mentionMenuRef.current &&
        !mentionMenuRef.current.contains(event.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(event.target as Node)
      ) {
        setShowMentionMenu(false);
      }
    };

    if (showMentionMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showMentionMenu]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setMessage(value);
    setCharCount(value.length);
    
    // Slash 命令补全
    const commandOptions: MentionOption[] = [
      { type: 'command', id: 'gen_chapter', name: '/gen_chapter', subtitle: '根据大纲和细纲生成章节内容', isCommand: true, commandKind: 'slash' },
      { type: 'command', id: 'analysis-chapter', name: '/analysis-chapter', subtitle: '分析指定章节', isCommand: true, commandKind: 'slash' },
      { type: 'command', id: 'analysis-chapter-info', name: '/analysis-chapter-info', subtitle: '分析章节组件信息', isCommand: true, commandKind: 'slash' },
      { type: 'command', id: 'continue-chapter', name: '/continue-chapter', subtitle: '续写章节：可跟章节号与对下一章的语言描述，生成3个推荐大纲细纲', isCommand: true, commandKind: 'slash' },
      { type: 'command', id: 'verification-chapter-info', name: '/verification-chapter-info', subtitle: '校验章节信息', isCommand: true, commandKind: 'slash' },
    ];
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastSlashIndex = textBeforeCursor.lastIndexOf('/');
    if (lastSlashIndex !== -1) {
      const textAfterSlash = textBeforeCursor.substring(lastSlashIndex + 1);
      const hasSpace = textAfterSlash.includes(' ') || textAfterSlash.includes('\n');
      if (!hasSpace) {
        const query = textAfterSlash.toLowerCase();
        const filtered = commandOptions.filter((cmd) =>
          cmd.name.toLowerCase().includes(`/${query}`)
        );
        if (filtered.length > 0) {
          setMentionOptions(filtered);
          setSelectedMentionIndex(0);

          const textarea = textareaRef.current;
          if (textarea) {
            const rect = textarea.getBoundingClientRect();
            const lineHeight = 20;
            const lines = textBeforeCursor.split('\n').length;
            const menuHeight = 200;
            const menuWidth = 320;
            let top = rect.top + lines * lineHeight + 30;
            let left = rect.left + 10;
            if (top + menuHeight > window.innerHeight) {
              top = rect.top + lines * lineHeight - menuHeight - 10;
            }
            if (left + menuWidth > window.innerWidth) {
              left = window.innerWidth - menuWidth - 10;
            }
            setMentionPosition({ top, left });
          }
          setShowMentionMenu(true);
          return;
        }
      }
    }

    // 检测 @ 提及
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      // 检查 @ 后面是否已经有完整的提及格式
      const hasCompleteMention = /^(章节|角色):/.test(textAfterAt);
      
      // 检查是否已经有完整的提及格式（@chapter:123 或 @character:角色名称）
      const hasCompleteMentionId = /^(chapter:\d+|character:[^@\s]+)/.test(textAfterAt);
      
      // 「command + 空格」视为刚选择指令，继续显示列表，不关闭（如 @chapter 后跟空格）
      const isCommandWordWithTrailingSpace = /^(chapter|chap|章节|zj|character|cha|角色|js)\s+$/.test(textAfterAt);
      
      if ((textAfterAt.includes('\n') ||
          hasCompleteMention ||
          hasCompleteMentionId) ||
          (textAfterAt.includes(' ') && !isCommandWordWithTrailingSpace)) {
        setShowMentionMenu(false);
      } else {
        const query = textAfterAt.toLowerCase();
        
        // 检测是否是角色关键词（character、cha、角色等）
        // 支持前缀匹配：cha 匹配 character，chap 匹配 chapter
        const characterKeywords = ['character', 'cha', '角色', 'juese', 'js'];
        const chapterKeywords = ['chapter', 'chap', '章节', 'zhangjie', 'zj'];
        
        // 构建提及选项
        const options: MentionOption[] = [];
        
        // 检查是否已经输入了完整的指令（chapter 或 character）
        const hasChapterCommand = /^chapter\s*$|^chap\s*$|^章节\s*$|^zj\s*$/i.test(query);
        const hasCharacterCommand = /^character\s*$|^cha\s*$|^角色\s*$|^js\s*$/i.test(query);
        const hasPartialChapterCommand = /^(chapter|chap|章节|zj)/i.test(query) && !hasChapterCommand;
        const hasPartialCharacterCommand = /^(character|cha|角色|js)/i.test(query) && !hasCharacterCommand;
        
        // 如果查询为空，先显示指令选项
        if (!query) {
          options.push({
            type: 'command',
            id: 'chapter',
            name: 'chapter',
            subtitle: '选择章节',
            isCommand: true,
          });
          options.push({
            type: 'command',
            id: 'character',
            name: 'character',
            subtitle: '选择角色',
            isCommand: true,
          });
        }
        // 如果输入了完整的指令，显示对应的内容列表
        else if (hasChapterCommand || hasPartialChapterCommand) {
          // 显示章节列表
          const remainingQuery = query.replace(/^(chapter|chap|章节|zj)\s*/i, '').trim();
          chapters
            .filter(ch => {
              if (!remainingQuery) return true;
              return ch.title.toLowerCase().includes(remainingQuery) || 
                     ch.chapter_number.toString().includes(remainingQuery);
            })
            .forEach(ch => {
              options.push({
                type: 'chapter',
                id: ch.id,
                name: ch.title,
                subtitle: `第${ch.chapter_number}章`,
              });
            });
        }
        else if (hasCharacterCommand || hasPartialCharacterCommand) {
          // 显示角色列表
          const remainingQuery = query.replace(/^(character|cha|角色|js)\s*/i, '').trim();
          characters
            .filter(char => {
              if (!remainingQuery) return true;
              const name = char.name || '';
              const displayName = char.display_name || '';
              return name.toLowerCase().includes(remainingQuery) || 
                     displayName.toLowerCase().includes(remainingQuery);
            })
            .forEach((char, index) => {
              // 构建角色详细信息作为副标题
              const subtitleParts: string[] = [];
              if (char.type) subtitleParts.push(String(char.type));
              if (char.gender) subtitleParts.push(String(char.gender));
              if (char.description) {
                subtitleParts.push(char.description.substring(0, 30));
              }
              const subtitle = subtitleParts.length > 0 ? subtitleParts.join(' · ') : undefined;
              
              options.push({
                type: 'character',
                id: char.name || `character_${index}`,
                name: char.display_name || char.name || '未命名角色',
                subtitle: subtitle,
              });
            });
        }
        // 如果输入的是部分指令关键词，显示匹配的指令选项
        else {
          // 检查是否匹配指令关键词的前缀
          if (chapterKeywords.some(k => k.toLowerCase().startsWith(query))) {
            options.push({
              type: 'command',
              id: 'chapter',
              name: 'chapter',
              subtitle: '选择章节',
              isCommand: true,
            });
          }
          if (characterKeywords.some(k => k.toLowerCase().startsWith(query))) {
            options.push({
              type: 'command',
              id: 'character',
              name: 'character',
              subtitle: '选择角色',
              isCommand: true,
            });
          }
        }
        
        setMentionOptions(options);
        setSelectedMentionIndex(0);
        
        if (options.length > 0) {
          // 计算菜单位置
          const textarea = textareaRef.current;
          if (textarea) {
            const rect = textarea.getBoundingClientRect();
            const lineHeight = 20;
            const lines = textBeforeCursor.split('\n').length;
            const menuHeight = 300; // 预估菜单高度
            const menuWidth = 320; // 预估菜单宽度
            
            // 计算位置，确保不超出屏幕
            let top = rect.top + (lines * lineHeight) + 30;
            let left = rect.left + 10;
            
            // 如果菜单会超出底部，显示在上方
            if (top + menuHeight > window.innerHeight) {
              top = rect.top + (lines * lineHeight) - menuHeight - 10;
            }
            
            // 如果菜单会超出右侧，调整位置
            if (left + menuWidth > window.innerWidth) {
              left = window.innerWidth - menuWidth - 10;
            }
            
            setMentionPosition({ top, left });
          }
          setShowMentionMenu(true);
        } else {
          setShowMentionMenu(false);
        }
      }
    } else {
      setShowMentionMenu(false);
    }
    
    // 自动调整高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionMenu && mentionOptions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex(prev => 
          prev < mentionOptions.length - 1 ? prev + 1 : prev
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex(prev => prev > 0 ? prev - 1 : 0);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectMention(mentionOptions[selectedMentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionMenu(false);
        return;
      }
    }
    
    // 即使菜单没有显示，如果输入了 @ 并且有匹配项，Tab 键也能自动补全
    if (e.key === 'Tab' && !showMentionMenu && textareaRef.current) {
      const textarea = textareaRef.current;
      const cursorPos = textarea.selectionStart;
      const textBeforeCursor = message.substring(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');
      
      if (lastAtIndex !== -1) {
        const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
        // 检查是否有部分输入且没有空格或换行
        if (textAfterAt && !textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
          const query = textAfterAt.toLowerCase();
          
          // 快速查找匹配项
          const characterKeywords = ['character', 'cha', '角色', 'juese', 'js'];
          const chapterKeywords = ['chapter', 'chap', '章节', 'zhangjie', 'zj'];
          
          const isCharacterKeyword = characterKeywords.some(keyword => 
            keyword.toLowerCase().startsWith(query) || query.startsWith(keyword.toLowerCase())
          );
          const isChapterKeyword = chapterKeywords.some(keyword => 
            keyword.toLowerCase().startsWith(query) || query.startsWith(keyword.toLowerCase())
          );
          
          // 查找匹配的选项
          let matchedOption: MentionOption | null = null;
          
          if (isCharacterKeyword || !isChapterKeyword) {
            // 优先查找角色
            const matchedChar = characters.find(char => {
              if (isCharacterKeyword) return true;
              const name = char.name || '';
              const displayName = char.display_name || '';
              return name.toLowerCase().startsWith(query) || 
                     displayName.toLowerCase().startsWith(query);
            });
            if (matchedChar) {
              matchedOption = {
                type: 'character',
                id: matchedChar.name || '',
                name: matchedChar.display_name || matchedChar.name || '未命名角色',
              };
            }
          }
          
          if (!matchedOption && (isChapterKeyword || !isCharacterKeyword)) {
            // 查找章节
            const matchedChapter = chapters.find(ch => {
              if (isChapterKeyword) return true;
              return ch.title.toLowerCase().startsWith(query) || 
                     ch.chapter_number.toString().startsWith(query);
            });
            if (matchedChapter) {
              matchedOption = {
                type: 'chapter',
                id: matchedChapter.id,
                name: matchedChapter.title,
                subtitle: `第${matchedChapter.chapter_number}章`,
              };
            }
          }
          
          if (matchedOption) {
            e.preventDefault();
            handleSelectMention(matchedOption);
            return;
          }
        }
      }
    }
    
    // Shift+Enter 或 Ctrl+Enter / Cmd+Enter 发送消息
    if (e.key === 'Enter') {
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        e.preventDefault();
        handleSend();
      }
      // 普通 Enter 键保持默认行为（换行）
    }
  };

  const handleSelectMention = (option: MentionOption) => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = message.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    const lastSlashIndex = textBeforeCursor.lastIndexOf('/');
    const targetIndex = option.commandKind === 'slash' ? lastSlashIndex : lastAtIndex;
    
    if (targetIndex !== -1) {
      // 如果选择的是指令，则插入指令名称并继续显示对应的内容列表
      if (option.isCommand) {
        const commandText =
          option.commandKind === 'slash' ? `/${option.id} ` : `@${option.name} `;
        const newMessage = 
          message.substring(0, targetIndex) + 
          commandText + 
          message.substring(cursorPos);
        
        setMessage(newMessage);
        
        // 设置光标位置并手动触发输入处理以显示内容列表
        setTimeout(() => {
          const newCursorPos = targetIndex + commandText.length;
          textarea.setSelectionRange(newCursorPos, newCursorPos);
          textarea.focus();
          
          // 手动触发输入处理逻辑
          const syntheticEvent = {
            target: textarea,
            currentTarget: textarea,
          } as React.ChangeEvent<HTMLTextAreaElement>;
          handleInputChange(syntheticEvent);
        }, 0);
      } else {
        // 如果选择的是内容，则插入完整的提及格式
        const mentionText = option.type === 'chapter' 
          ? `@chapter:${option.id}`
          : `@character:${option.name}`; // 角色使用名称作为标识
        
        const newMessage = 
          message.substring(0, targetIndex) + 
          mentionText + ' ' + 
          message.substring(cursorPos);
        
        setMessage(newMessage);
        setShowMentionMenu(false);
        
        // 设置光标位置
        setTimeout(() => {
          const newCursorPos = targetIndex + mentionText.length + 1;
          textarea.setSelectionRange(newCursorPos, newCursorPos);
          textarea.focus();
        }, 0);
      }
    }
  };

  const handleCopy = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  const handleClearMessages = () => {
    if (window.confirm('确定要清空所有对话记录吗？')) {
      setMessages([]);
    }
  };

  // 渲染带提及的消息（解析ID格式并显示友好名称）
  const renderMessageWithMentions = (text: string, mentions?: Mention[]) => {
    if (!mentions || mentions.length === 0) {
      // 即使没有mentions，也尝试渲染ID格式的提及
      return renderMentionsFromText(text);
    }

    const parts: (string | React.ReactElement)[] = [];
    let lastIndex = 0;
    // 匹配 @chapter:123 或 @character:角色名称 格式
    const regex = /(@chapter:\d+|@character:[^@\s]+)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // 添加提及前的文本
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      // 添加提及标签
      const mentionText = match[0];
      const idMatch = mentionText.match(/(chapter|character):(.+)/);
      
      if (idMatch) {
        const type = idMatch[1] === 'chapter' ? 'chapter' : 'character';
        const identifier = idMatch[2];
        
        let mention: Mention | undefined;
        if (type === 'chapter') {
          const id = parseInt(identifier, 10);
          mention = mentions.find(m => m.type === type && m.id === id);
        } else {
          // 角色使用名称匹配
          mention = mentions.find(m => m.type === type && (m.id === identifier || m.name === identifier));
        }

        if (mention) {
          // 获取角色详细信息用于提示
          let tooltip = '';
          if (mention.type === 'character') {
            const character = characters.find(char => 
              char.name === identifier || char.display_name === identifier
            );
            if (character) {
              const parts = [];
              if (character.description) parts.push(`简介：${character.description}`);
              if (character.gender) parts.push(`性别：${character.gender}`);
              if (character.type) parts.push(`类型：${character.type}`);
              tooltip = parts.join('\n') || '角色信息';
            } else {
              tooltip = '角色信息';
            }
          } else {
            const chapter = chapters.find(ch => ch.id === parseInt(identifier, 10));
            tooltip = chapter ? `章节：${chapter.title}` : '章节信息';
          }
          
          parts.push(
            <span 
              key={match.index}
              className={`mention-tag mention-${mention.type}`}
              title={tooltip}
            >
              {mention.type === 'chapter' ? '📖' : '👤'} {mention.name}
            </span>
          );
        } else {
          parts.push(mentionText);
        }
      } else {
        parts.push(mentionText);
      }

      lastIndex = match.index + match[0].length;
    }

    // 添加剩余文本
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return <>{parts}</>;
  };

  // 从文本中解析并渲染提及（用于没有mentions的情况）
  const renderMentionsFromText = (text: string) => {
    const parts: (string | React.ReactElement)[] = [];
    let lastIndex = 0;
    // 匹配 @chapter:123 或 @character:角色名称
    const regex = /(@chapter:\d+|@character:[^@\s]+)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      const mentionText = match[0];
      const idMatch = mentionText.match(/(chapter|character):(.+)/);
      
      if (idMatch) {
        const type = idMatch[1] === 'chapter' ? 'chapter' : 'character';
        const identifier = idMatch[2];
        
        let name = '';
        if (type === 'chapter') {
          const id = parseInt(identifier, 10);
          const chapter = chapters.find(ch => ch.id === id);
          name = chapter ? chapter.title : `章节#${id}`;
        } else {
          // 角色使用名称作为标识
          const character = characters.find(char => 
            char.name === identifier || char.display_name === identifier
          );
          name = character ? (character.display_name || character.name) : identifier;
        }

        // 获取详细信息用于提示
        let tooltip = '';
        if (type === 'character') {
          const character = characters.find(char => 
            char.name === identifier || char.display_name === identifier
          );
          if (character) {
            const parts = [];
            if (character.description) parts.push(`简介：${character.description}`);
            if (character.gender) parts.push(`性别：${character.gender}`);
            if (character.type) parts.push(`类型：${character.type}`);
            tooltip = parts.join('\n') || '角色信息';
          } else {
            tooltip = '角色信息';
          }
        } else {
          tooltip = name;
        }

        parts.push(
          <span 
            key={match.index}
            className={`mention-tag mention-${type}`}
            title={tooltip}
          >
            {type === 'chapter' ? '📖' : '👤'} {name}
          </span>
        );
      } else {
        parts.push(mentionText);
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return <>{parts}</>;
  };

  // 解析消息中的提及（使用ID格式）
  const parseMentions = (text: string): Mention[] => {
    const mentions: Mention[] = [];
    // 匹配 @chapter:123 或 @character:name 格式
    const chapterRegex = /@chapter:(\d+)/g;
    const characterRegex = /@character:([^@\s]+)/g;
    
    let match;
    while ((match = chapterRegex.exec(text)) !== null) {
      const id = parseInt(match[1], 10);
      const chapter = chapters.find(ch => ch.id === id);
      if (chapter) {
        mentions.push({ type: 'chapter', id: chapter.id, name: chapter.title });
      }
    }
    
    while ((match = characterRegex.exec(text)) !== null) {
      const characterName = match[1];
      const character = characters.find(char => 
        char.name === characterName || char.display_name === characterName
      );
      if (character) {
        mentions.push({ 
          type: 'character', 
          id: character.name || characterName, 
          name: character.display_name || character.name || characterName 
        });
      }
    }
    
    return mentions;
  };

  const handleSend = async () => {
    const content = message.trim();
    if (!content || isSending) return;

    // 检查登录状态和作品ID
    if (!isAuthenticated) {
      console.warn('[AIAssistant] 未登录，无法使用聊天功能');
      return;
    }

    if (!workId) {
      console.warn('[AIAssistant] 未选择作品，无法使用聊天功能');
      return;
    }
    setShowMentionMenu(false);
    
    // 解析提及
    const mentions = parseMentions(content);
    
    // 先把用户消息加入本地对话
    const userMsg: MessageWithTime = { 
      role: 'user', 
      content,
      timestamp: new Date(),
      mentions: mentions.length > 0 ? mentions : undefined,
    };
    setMessages(prev => [...prev, userMsg]);
    setMessage('');
    setCharCount(0);

    // 斜杠命令：根据大纲和细纲生成章节内容（/gen_chapter）
    const isGenChapter = /^\/gen_chapter\s*$/i.test(content.trim());
    if (isGenChapter && onGenerateChapterFromOutline) {
      try {
        setIsSending(true);
        await onGenerateChapterFromOutline();
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: '已根据当前章节的大纲和细纲生成内容并填入编辑器。', timestamp: new Date() },
        ]);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : '生成失败';
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `生成失败：${errMsg}`, timestamp: new Date() },
        ]);
      } finally {
        setIsSending(false);
      }
      return;
    }

    try {
      setIsSending(true);
      let assistantBuffer = '';

      // 调试日志
      console.log('[AIAssistant] 发送消息，workId:', workId, 'isAuthenticated:', isAuthenticated);

      await streamChatMessage(
        content,
        [...messages, userMsg],
        (event) => {
          console.log('[AIAssistant] 收到事件:', event.type, event.data);
          
          if (event.type === 'continue_chapter_result' && event.data) {
            console.log('[AIAssistant] 处理 continue_chapter_result:', event.data);
            const result = event.data as ContinueChapterResult;
            setMessages(prev => {
              const next = [...prev];
              const last = next[next.length - 1];
              const newMsg: MessageWithTime = {
                role: 'assistant',
                content: `已生成第 ${result.next_chapter_number} 章的 3 个续写方案，请选择其一创建章节。`,
                timestamp: new Date(),
                continueChapterResult: result,
              };
              if (last?.role === 'assistant') {
                next[next.length - 1] = newMsg;
              } else {
                next.push(newMsg);
              }
              return next;
            });
            return;
          }
          if (event.type === 'text' && typeof event.data === 'string') {
            assistantBuffer += event.data;
            setMessages(prev => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (!last || last.role !== 'assistant') {
                next.push({ 
                  role: 'assistant', 
                  content: assistantBuffer,
                  timestamp: new Date()
                });
              } else {
                next[next.length - 1] = { 
                  ...last, 
                  content: assistantBuffer,
                  timestamp: last.timestamp || new Date()
                };
              }
              return next;
            });
          } else if (event.type === 'error') {
            const msg = typeof event.data === 'string' ? event.data : '对话出错';
            console.error('[AIAssistant] 对话错误:', msg);
            // 显示错误给用户
            setMessages(prev => {
              const next = [...prev];
              const last = next[next.length - 1];
              const errorMsg: MessageWithTime = {
                role: 'assistant',
                content: `错误: ${msg}`,
                timestamp: new Date(),
              };
              if (last?.role === 'assistant') {
                next[next.length - 1] = errorMsg;
              } else {
                next.push(errorMsg);
              }
              return next;
            });
            setIsSending(false);
          } else if (event.type === 'end') {
            console.log('[AIAssistant] 收到 end 事件');
            setIsSending(false);
          }
        },
        workId  // 传递 workId 参数
      );

      // 如果服务端没有显式发送 end 事件，也在结束时确保状态复位
      setIsSending(false);
    } catch (e) {
      // 只记录到控制台，不显示给用户
      console.error('[AIAssistant] 对话发送失败:', e);
    } finally {
      // 避免重复调用，但确保异常情况下也能复位
      setIsSending(false);
    }
  };

  return (
    <aside className="ai-assistant">
      <div className="assistant-header">

      </div>

      <div className="chat-content">
          <div className="chat-header">
            <div className="planet-avatar">
              <span className="planet-icon">
                <img src="/favicon.png" width={50} height={50} alt="球球" />
              </span>
            </div>
            <div className="planet-greeting">
              <p className="greeting-text">
                嗨!我是球球。今天想写什么故事?
              </p>
              <p className="disclaimer">内容由AI生成,仅供参考</p>
            </div>
            {messages.length > 0 && (
              <button
                className="chat-clear-btn"
                onClick={handleClearMessages}
                title="清空对话"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>

          {/* 对话消息列表 */}
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                <div className="chat-empty-icon">💬</div>
                <p>还没有对话，先问问星球今天写什么吧～</p>
              </div>
            )}
            {messages.map((msg, idx) => {
              const messageTime = msg.timestamp || new Date();
              return (
                <div
                  key={idx}
                  className={`chat-message chat-message-${msg.role === 'user' ? 'user' : 'assistant'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="chat-message-avatar">
                        <span className="planet-icon-small">
                          <img src="/favicon.png" width={50} height={50} alt="球球" />
                        </span>
                    </div>
                  )}
                  <div className="chat-message-content">
                    <div className={`chat-message-bubble ${msg.role === 'user' ? 'user-bubble' : 'assistant-bubble'}`}>
                      {msg.role === 'assistant' ? (
                        (msg as MessageWithTime).continueChapterResult ? (
                          <div className="continue-chapter-cards">
                            <p className="continue-chapter-hint">{msg.content}</p>
                            <div className="continue-chapter-card-list">
                              {(msg as MessageWithTime).continueChapterResult!.recommendations.map((rec, recIdx) => (
                                <div key={recIdx} className="continue-chapter-card">
                                  <div className="continue-chapter-card-title">{rec.title}</div>
                                  <div className="continue-chapter-card-outline">
                                    {formatOutlineSummary(rec.outline)}
                                  </div>
                                  <div className="continue-chapter-card-detail">
                                    {formatOutlineSummary(rec.detailed_outline, 80)}
                                  </div>
                                  <button
                                    type="button"
                                    className="continue-chapter-card-action"
                                    onClick={() => onUseContinueRecommendation?.({
                                      title: rec.title,
                                      outline: rec.outline,
                                      detailed_outline: rec.detailed_outline,
                                      next_chapter_number: (msg as MessageWithTime).continueChapterResult!.next_chapter_number,
                                    })}
                                  >
                                    使用此方案创建章节
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div 
                            className="markdown-content"
                            dangerouslySetInnerHTML={{ __html: md.render(msg.content) }}
                          />
                        )
                      ) : (
                        <div className="text-content">
                          {renderMessageWithMentions(msg.content, msg.mentions)}
                        </div>
                      )}
                    </div>
                    <div className="chat-message-footer">
                      <span className="chat-message-time">{formatTime(messageTime)}</span>
                      <button
                        className="chat-message-copy"
                        onClick={() => handleCopy(msg.content, idx)}
                        title="复制消息"
                      >
                        {copiedIndex === idx ? (
                          <Check size={14} />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    </div>
                  </div>
                  {msg.role === 'user' && (
                    <div className="chat-message-avatar user-avatar">
                      <span className="user-avatar-initial" aria-hidden>{userInitial}</span>
                    </div>
                  )}
                </div>
              );
            })}
            {isSending && (
              <div className="chat-message chat-message-assistant">
                <div className="chat-message-avatar">
                  <span className="planet-icon-small">
                    <img src="/favicon.png" width={50} height={50} alt="球球" />
                  </span>
                </div>
                <div className="chat-message-content">
                  <div className="chat-message-bubble assistant-bubble chat-message-loading">
                    <Loader2 className="loading-spinner" size={16} />
                    <span>正在思考中…</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-area">
            <div className="input-actions">
              <button 
                className="input-action-btn"
                onClick={() => {
                  if (textareaRef.current) {
                    const textarea = textareaRef.current;
                    const cursorPos = textarea.selectionStart;
                    const newMessage = 
                      message.substring(0, cursorPos) + 
                      '@' + 
                      message.substring(cursorPos);
                    setMessage(newMessage);
                    setTimeout(() => {
                      textarea.setSelectionRange(cursorPos + 1, cursorPos + 1);
                      textarea.focus();
                    }, 0);
                  }
                }}
                title="插入 @ 引用章节或角色"
              >
                <FileText size={14} />
                <span>@引用</span>
              </button>
            </div>
            {!isAuthenticated ? (
              <div className="chat-login-prompt">
                <p>请先登录后再使用球球AI功能</p>
              </div>
            ) : !workId ? (
              <div className="chat-login-prompt">
                <p>请先选择作品后再使用球球AI功能</p>
              </div>
            ) : (
              <>
                <div className="chat-input-wrapper">
                  <textarea
                    ref={textareaRef}
                    className="chat-input"
                    placeholder="输入你的问题..."
                    value={message}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    rows={3}
                    disabled={!isAuthenticated || !workId || isSending}
                  />
                  {showMentionMenu && mentionOptions.length > 0 && (
                    <div
                      ref={mentionMenuRef}
                      className="mention-menu"
                      style={{
                        top: `${mentionPosition.top}px`,
                        left: `${mentionPosition.left}px`,
                      }}
                    >
                      <div className="mention-menu-header">
                        <span>选择要引用的内容</span>
                      </div>
                      {mentionOptions.length > 0 ? (
                        <>
                          <div className="mention-menu-list">
                            {mentionOptions.map((option, idx) => (
                              <div
                                key={`${option.type}-${option.id}`}
                                className={`mention-option ${idx === selectedMentionIndex ? 'selected' : ''}`}
                                onClick={() => handleSelectMention(option)}
                                onMouseEnter={() => setSelectedMentionIndex(idx)}
                              >
                                <div className="mention-option-icon">
                                  {option.isCommand ? (
                                    <span style={{ fontSize: '16px' }}>⚡</span>
                                  ) : option.type === 'chapter' ? (
                                    <BookOpen size={16} />
                                  ) : (
                                    <User size={16} />
                                  )}
                                </div>
                                <div className="mention-option-content">
                                  <div className="mention-option-name">{option.name}</div>
                                  {option.subtitle && (
                                    <div className="mention-option-subtitle">{option.subtitle}</div>
                                  )}
                                </div>
                                <div className="mention-option-type">
                                  {option.isCommand ? '指令' : option.type === 'chapter' ? '章节' : '角色'}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="mention-menu-footer">
                            <span>↑↓ 选择</span>
                            <kbd>Tab</kbd>
                            <span>/</span>
                            <kbd>Enter</kbd>
                            <span>补全</span>
                            <kbd>Esc</kbd>
                            <span>取消</span>
                          </div>
                        </>
                      ) : (
                        <div className="mention-menu-empty">
                          <span>没有找到匹配的内容</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="input-footer">
                  <span className="char-count">{charCount}/50000</span>
                  <button
                    className="send-button"
                    onClick={handleSend}
                    disabled={isSending || !message.trim() || !isAuthenticated || !workId}
                  >
                    {isSending ? (
                      <>
                        <Loader2 className="send-spinner" size={16} />
                        <span>发送中...</span>
                      </>
                    ) : (
                      <>
                        <Send size={16} />
                        <span>发送</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
    </aside>
  );
}

