import { Send, Copy, Check, Loader2, Trash2, BookOpen, User, FileText } from 'lucide-react';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { streamChatMessage } from '../../utils/chatApi';
import type { ChatMessage, ContinueChapterResult } from '../../utils/chatApi';
import { formatOutlineSummary } from '../../utils/outlineFormat';
import { authApi } from '../../utils/authApi';
import { getAvatarInitial } from '../../utils/avatarUtils';
import { chaptersApi, type Chapter } from '../../utils/chaptersApi';
import { worksApi } from '../../utils/worksApi';
import MarkdownIt from 'markdown-it';
import { copyToClipboard } from '../../utils/clipboard';
import ChatInputContentEditable from './ChatInputContentEditable';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  readOnly?: boolean;
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
  readOnly,
}: AIAssistantProps) {
  const [message, setMessage] = useState('');
  const [charCount, setCharCount] = useState(0);
  const [messages, setMessages] = useState<MessageWithTime[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLDivElement>(null);
  const cursorOffsetRef = useRef(0);
  const cursorAfterUpdateRef = useRef<number | null>(null);

  // @ 提及相关状态
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [mentionOptions, setMentionOptions] = useState<MentionOption[]>([]);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [characters, setCharacters] = useState<CharacterFromMetadata[]>([]);
  const mentionMenuRef = useRef<HTMLDivElement>(null);
  /** 打开 @/ 菜单时保存的光标与文案，避免焦点移到菜单后 cursorOffsetRef 变为 0 导致重复 @ */
  const mentionMenuCursorRef = useRef<number | null>(null);
  const mentionMenuValueRef = useRef<string | null>(null);

  const user = authApi.getUserInfo();
  const userInitial = getAvatarInitial(user?.username, user?.display_name);
  const mentionTypeLabelClassName = 'rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground';
  const chapterMentionClassName = 'mx-0.5 inline-block rounded border border-border bg-muted px-2 py-0.5 text-[13px] font-medium text-muted-foreground';
  const characterMentionClassName = 'mx-0.5 inline-block rounded border border-primary/10 bg-primary/10 px-2 py-0.5 text-[13px] font-medium text-primary';

  // 检查登录状态
  useEffect(() => {
    setIsAuthenticated(authApi.isAuthenticated());
  }, []);

  const loadData = useCallback(async () => {
    if (!workId || !isAuthenticated) return;

    try {
      const workIdStr = String(workId);
      
      // 加载章节列表
      const chaptersResponse = await chaptersApi.listChapters({
        work_id: workIdStr,
        page: 1,
        size: 100,
        sort_by: 'chapter_number',
        sort_order: 'asc',
        skipCache: true, // 关键修复：对话框提及需要最新章节，跳过本地缓存
      });
      setChapters(chaptersResponse.chapters);

      // 加载作品详情（包含metadata中的角色信息）
      const workData = await worksApi.getWork(workIdStr);
      
      // 从作品metadata中提取角色信息
      const componentData = workData.metadata?.component_data || {characters: []};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const charactersFromComponentData = (componentData as any).characters || [];
      setCharacters(charactersFromComponentData);
    } catch {
      // ignore
    }
  }, [workId, isAuthenticated]);

  // 加载章节和作品信息（包含角色）
  useEffect(() => {
    loadData();
  }, [loadData]);

  // 当提及菜单打开时，也尝试刷新一次数据，确保能看到刚创建的章节
  useEffect(() => {
    if (showMentionMenu) {
      loadData();
    }
  }, [showMentionMenu, loadData]);

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
    const t = setTimeout(() => chatInputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [initialSelectionRef]);


  // 点击外部关闭提及菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        mentionMenuRef.current &&
        !mentionMenuRef.current.contains(event.target as Node) &&
        chatInputRef.current &&
        !chatInputRef.current.contains(event.target as Node)
      ) {
        mentionMenuValueRef.current = null;
        mentionMenuCursorRef.current = null;
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

  const runMentionMenuLogic = useCallback((value: string, cursorPos: number) => {
    const textBeforeCursor = value.substring(0, cursorPos);
    const commandOptions: MentionOption[] = [
      { type: 'command', id: 'gen_chapter', name: '/gen_chapter', subtitle: '根据大纲和细纲生成章节内容', isCommand: true, commandKind: 'slash' },
      { type: 'command', id: 'analysis-chapter', name: '/analysis-chapter', subtitle: '分析指定章节', isCommand: true, commandKind: 'slash' },
      { type: 'command', id: 'analysis-chapter-info', name: '/analysis-chapter-info', subtitle: '分析章节组件信息', isCommand: true, commandKind: 'slash' },
      { type: 'command', id: 'continue-chapter', name: '/continue-chapter', subtitle: '续写章节：可跟章节号与对下一章的语言描述，生成3个推荐大纲细纲', isCommand: true, commandKind: 'slash' },
      { type: 'command', id: 'verification-chapter-info', name: '/verification-chapter-info', subtitle: '校验章节信息', isCommand: true, commandKind: 'slash' },
    ];
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

          const inputEl = chatInputRef.current;
          if (inputEl) {
            const rect = inputEl.getBoundingClientRect();
            const lineHeight = 20;
            const lines = textBeforeCursor.split('\n').length;
            const menuHeight = 200;
            const menuWidth = 320;
            
            // Check if we are on mobile (rough check)
            const isMobile = window.innerWidth <= 768;
            
            // Use visualViewport height if available (better for mobile keyboards)
            const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
            const viewportTop = window.visualViewport ? window.visualViewport.offsetTop : 0;
            
            let top = rect.top + lines * lineHeight + 30;
            let left = rect.left + 10;
            
            if (isMobile) {
              // On mobile, force menu above the input box to avoid keyboard occlusion
              // Position relative to the input container top, minus menu height
              top = rect.top - menuHeight - 10;
              // Ensure it doesn't go off the top of the viewport
              if (top < viewportTop + 10) {
                 top = viewportTop + 10;
              }
              // Center horizontally or align left with some padding
              left = Math.max(10, rect.left);
              if (left + menuWidth > window.innerWidth) {
                left = window.innerWidth - menuWidth - 10;
              }
            } else {
              // Desktop logic
              if (top + menuHeight > viewportHeight) {
                top = rect.top + lines * lineHeight - menuHeight - 10;
              }
              if (left + menuWidth > window.innerWidth) {
                left = window.innerWidth - menuWidth - 10;
              }
            }
            
            setMentionPosition({ top, left });
          }
          mentionMenuValueRef.current = value;
          mentionMenuCursorRef.current = cursorPos;
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
        mentionMenuValueRef.current = null;
        mentionMenuCursorRef.current = null;
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
          const inputEl = chatInputRef.current;
          if (inputEl) {
            const rect = inputEl.getBoundingClientRect();
            const lineHeight = 20;
            const lines = textBeforeCursor.split('\n').length;
            const menuHeight = 300; // 预估菜单高度
            const menuWidth = 320; // 预估菜单宽度
            
            // Check if we are on mobile (rough check)
            const isMobile = window.innerWidth <= 768;
            
            // Use visualViewport height if available (better for mobile keyboards)
            const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
            const viewportTop = window.visualViewport ? window.visualViewport.offsetTop : 0;
            
            // 计算位置，确保不超出屏幕
            let top = rect.top + (lines * lineHeight) + 30;
            let left = rect.left + 10;
            
            if (isMobile) {
              // On mobile, force menu above the input box to avoid keyboard occlusion
              // Position relative to the input container top, minus menu height
              top = rect.top - menuHeight - 10;
              // Ensure it doesn't go off the top of the viewport
              if (top < viewportTop + 10) {
                 top = viewportTop + 10;
              }
              // Center horizontally or align left with some padding
              left = Math.max(10, rect.left);
              if (left + menuWidth > window.innerWidth) {
                left = window.innerWidth - menuWidth - 10;
              }
            } else {
              // 如果菜单会超出底部，显示在上方
              if (top + menuHeight > viewportHeight) {
                top = rect.top + (lines * lineHeight) - menuHeight - 10;
              }
              
              // 如果菜单会超出右侧，调整位置
              if (left + menuWidth > window.innerWidth) {
                left = window.innerWidth - menuWidth - 10;
              }
            }
            
            setMentionPosition({ top, left });
          }
          mentionMenuValueRef.current = value;
          mentionMenuCursorRef.current = cursorPos;
          setShowMentionMenu(true);
        } else {
          mentionMenuValueRef.current = null;
          mentionMenuCursorRef.current = null;
          setShowMentionMenu(false);
        }
      }
    } else {
      mentionMenuValueRef.current = null;
      mentionMenuCursorRef.current = null;
      setShowMentionMenu(false);
    }
  }, [chapters, characters]);

  // 当章节或角色数据更新且提及菜单打开时，重新运行菜单逻辑以刷新选项
  useEffect(() => {
    if (showMentionMenu) {
      runMentionMenuLogic(message, cursorOffsetRef.current);
    }
  }, [runMentionMenuLogic, showMentionMenu, message]);

  const handleCEChange = useCallback((text: string, cursorOffset: number) => {
    setMessage(text);
    setCharCount(text.length);
    cursorOffsetRef.current = cursorOffset;
    runMentionMenuLogic(text, cursorOffset);
  }, [runMentionMenuLogic]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
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
    if (e.key === 'Tab' && !showMentionMenu && chatInputRef.current) {
      const cursorPos = cursorOffsetRef.current;
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
    if (!chatInputRef.current) return;

    // 菜单打开时焦点可能在菜单上，用保存的文案/光标避免重复 @
    const msg = mentionMenuValueRef.current ?? message;
    const cursorPos = mentionMenuCursorRef.current ?? cursorOffsetRef.current;
    mentionMenuValueRef.current = null;
    mentionMenuCursorRef.current = null;

    const textBeforeCursor = msg.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    const lastSlashIndex = textBeforeCursor.lastIndexOf('/');
    const targetIndex = option.commandKind === 'slash' ? lastSlashIndex : lastAtIndex;

    if (targetIndex !== -1) {
      let replacementEndIndex = cursorPos;
      
      // Calculate where the current token ends so we replace the whole thing
      if (option.commandKind === 'slash') {
        const textAfterCursor = msg.substring(cursorPos);
        const match = textAfterCursor.match(/^[a-zA-Z0-9_-]*/);
        if (match) {
          replacementEndIndex += match[0].length;
        }
      } else {
        const textAfterCursor = msg.substring(cursorPos);
        const match = textAfterCursor.match(/^[^\s\n]*/);
        if (match) {
           replacementEndIndex += match[0].length;
        }
      }

      if (option.isCommand) {
        const commandText =
          option.commandKind === 'slash' ? `/${option.id} ` : `@${option.name} `;
        const newMessage = 
          msg.substring(0, targetIndex) + 
          commandText + 
          msg.substring(replacementEndIndex);
        const newCursorPos = targetIndex + commandText.length;
        setMessage(newMessage);
        setCharCount(newMessage.length);
        cursorAfterUpdateRef.current = newCursorPos;
        cursorOffsetRef.current = newCursorPos;
        runMentionMenuLogic(newMessage, newCursorPos);
        chatInputRef.current?.focus();
      } else {
        const mentionText = option.type === 'chapter' 
          ? `@chapter:${option.id}`
          : `@character:${option.name}`;
        const newMessage = 
          msg.substring(0, targetIndex) + 
          mentionText + ' ' + 
          msg.substring(replacementEndIndex);
        const newCursorPos = targetIndex + mentionText.length + 1;
        setMessage(newMessage);
        setCharCount(newMessage.length);
        setShowMentionMenu(false);
        cursorAfterUpdateRef.current = newCursorPos;
        chatInputRef.current?.focus();
      }
    }
  };

  const handleCopy = async (content: string, index: number) => {
    const success = await copyToClipboard(content);
    if (success) {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
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

  // 匹配章节引用（含字数时整段匹配）：@chapter:123 第5-10字 | @chapter:123 | @character:xxx
  const MENTION_REGEX = /(@chapter:\d+\s*第\d+-\d+字|@chapter:\d+|@character:[^@\s]+)/g;

  // 渲染带提及的消息（解析ID格式并显示友好名称，含字数时显示「章节名 第n-m字」）
  const renderMessageWithMentions = (text: string, mentions?: Mention[]) => {
    if (!mentions || mentions.length === 0) {
      return renderMentionsFromText(text);
    }

    const parts: (string | React.ReactElement)[] = [];
    let lastIndex = 0;
    const regex = new RegExp(MENTION_REGEX.source, 'g');
    let match;

    while ((match = regex.exec(text)) !== null) {
      // 添加提及前的文本
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      // 添加提及标签
      const mentionText = match[0];
      const chapterWithRange = mentionText.match(/@chapter:(\d+)\s*第(\d+)-(\d+)字/);
      const chapterOnly = mentionText.match(/@chapter:(\d+)/);
      const characterMatch = mentionText.match(/@character:(.+)/);

      if (chapterWithRange || chapterOnly) {
        const chapterId = parseInt((chapterWithRange || chapterOnly)![1], 10);
        const rangeLabel = chapterWithRange ? ` 第${chapterWithRange[2]}-${chapterWithRange[3]}字` : '';
        const mention = mentions.find(m => m.type === 'chapter' && m.id === chapterId);
        const chapter = chapters.find(ch => ch.id === chapterId);
        const title = chapter ? chapter.title : `章节#${chapterId}`;
        const tooltip = chapter ? `章节：${chapter.title}${rangeLabel || ''}` : '章节信息';
        if (mention) {
          parts.push(
            <span
              key={match.index}
              className={chapterMentionClassName}
              title={tooltip}
            >
              📖 {mention.name}{rangeLabel}
            </span>
          );
        } else {
          parts.push(<span key={match.index} className={chapterMentionClassName}>📖 {title}{rangeLabel}</span>);
        }
      } else if (characterMatch) {
        const identifier = characterMatch[1];
        const mention = mentions.find(m => m.type === 'character' && (m.id === identifier || m.name === identifier));
        if (mention) {
          let tooltip = '';
          const character = characters.find(char => char.name === identifier || char.display_name === identifier);
          if (character) {
            const tipParts = [];
            if (character.description) tipParts.push(`简介：${character.description}`);
            if (character.gender) tipParts.push(`性别：${character.gender}`);
            if (character.type) tipParts.push(`类型：${character.type}`);
            tooltip = tipParts.join('\n') || '角色信息';
          } else {
            tooltip = '角色信息';
          }
          parts.push(
            <span key={match.index} className={characterMentionClassName} title={tooltip}>
              👤 {mention.name}
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

  // 从文本中解析并渲染提及（用于没有mentions的情况，含字数时显示「章节名 第n-m字」）
  const renderMentionsFromText = (text: string) => {
    const parts: (string | React.ReactElement)[] = [];
    let lastIndex = 0;
    const regex = new RegExp(MENTION_REGEX.source, 'g');
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      const mentionText = match[0];
      const chapterWithRange = mentionText.match(/@chapter:(\d+)\s*第(\d+)-(\d+)字/);
      const chapterOnly = mentionText.match(/@chapter:(\d+)/);
      const characterMatch = mentionText.match(/@character:(.+)/);

      if (chapterWithRange || chapterOnly) {
        const chapterId = parseInt((chapterWithRange || chapterOnly)![1], 10);
        const rangeLabel = chapterWithRange ? ` 第${chapterWithRange[2]}-${chapterWithRange[3]}字` : '';
        const chapter = chapters.find(ch => ch.id === chapterId);
        const name = chapter ? chapter.title : `章节#${chapterId}`;
        parts.push(
          <span key={match.index} className={chapterMentionClassName} title={`${name}${rangeLabel}`}>
            📖 {name}{rangeLabel}
          </span>
        );
      } else if (characterMatch) {
        const identifier = characterMatch[1];
        const character = characters.find(char => char.name === identifier || char.display_name === identifier);
        const name = character ? (character.display_name || character.name) : identifier;
        let tooltip = '';
        if (character) {
          const tipParts = [];
          if (character.description) tipParts.push(`简介：${character.description}`);
          if (character.gender) tipParts.push(`性别：${character.gender}`);
          if (character.type) tipParts.push(`类型：${character.type}`);
          tooltip = tipParts.join('\n') || '角色信息';
        } else {
          tooltip = '角色信息';
        }
        parts.push(
          <span key={match.index} className={characterMentionClassName} title={tooltip}>
            👤 {name}
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
      
      return;
    }

    if (!workId) {
      
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
      

      await streamChatMessage(
        content,
        [...messages, userMsg],
        (event) => {
          
          
          if (event.type === 'continue_chapter_result' && event.data) {
            
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
            
            setIsSending(false);
          }
        },
        workId  // 传递 workId 参数
      );

      // 如果服务端没有显式发送 end 事件，也在结束时确保状态复位
      setIsSending(false);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : '发送失败';
      
      setMessages(prev => [
        ...prev,
        { 
          role: 'assistant', 
          content: `发送失败: ${errMsg} (请检查后端服务是否启动，或网络连接是否正常)`, 
          timestamp: new Date() 
        },
      ]);
    } finally {
      // 避免重复调用，但确保异常情况下也能复位
      setIsSending(false);
    }
  };

  return (
    <aside className="flex h-full w-full flex-col rounded-xl bg-background shadow-md">
      <div className="flex flex-1 flex-col overflow-hidden p-4">
          <div className="relative mb-6 flex gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full">
              <span className="text-[28px]">
                <img src="/logo.svg" width={50} height={50} alt="球球" />
              </span>
            </div>
            <div className="flex-1">
              <p className="mb-2 text-sm leading-6 text-foreground">
                嗨!我是球球。今天想写什么故事?
              </p>
              <p className="text-xs text-muted-foreground">内容由AI生成,仅供参考</p>
            </div>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute right-0 top-0"
                onClick={handleClearMessages}
                title="清空对话"
                disabled={readOnly}
              >
                <Trash2 size={16} />
              </Button>
            )}
          </div>

          <div className="mb-4 flex-1 overflow-y-auto pr-2 scroll-smooth">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center px-5 py-10 text-center text-muted-foreground">
                <div className="mb-3 text-5xl opacity-60">💬</div>
                <p className="m-0 text-sm">还没有对话，先问问星球今天写什么吧～</p>
              </div>
            )}
            {messages.map((msg, idx) => {
              const messageTime = msg.timestamp || new Date();
              return (
                <div
                  key={idx}
                  className={cn('group mb-5 flex gap-2.5 animate-in fade-in-0 slide-in-from-bottom-2', msg.role === 'user' && 'flex-row-reverse')}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-transparent">
                        <span className="text-lg">
                          <img src="/logo.svg" width={50} height={50} alt="球球" />
                        </span>
                    </div>
                  )}
                  <div className="flex max-w-[calc(100%-50px)] flex-1 flex-col gap-1">
                    <div
                      className={cn(
                        'rounded-2xl px-3 py-2.5 text-sm leading-6 break-words',
                        msg.role === 'user'
                          ? 'rounded-br-sm bg-primary text-primary-foreground'
                          : 'rounded-bl-sm border border-border bg-muted/40 text-foreground'
                      )}
                    >
                      {msg.role === 'assistant' ? (
                        (msg as MessageWithTime).continueChapterResult ? (
                          <div className="w-full">
                            <p className="mb-3 text-sm text-muted-foreground">{msg.content}</p>
                            <div className="flex flex-col gap-3">
                              {(msg as MessageWithTime).continueChapterResult!.recommendations.map((rec, recIdx) => (
                                <div key={recIdx} className="rounded-lg border border-border bg-background px-3.5 py-3 transition-colors hover:border-primary hover:shadow-sm">
                                  <div className="mb-2 text-[15px] font-semibold text-foreground">{rec.title}</div>
                                  <div className="mb-1.5 text-[13px] leading-6 text-muted-foreground">
                                    {formatOutlineSummary(rec.outline)}
                                  </div>
                                  <div className="mb-2.5 text-xs leading-5 text-muted-foreground">
                                    {formatOutlineSummary(rec.detailed_outline, 80)}
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                                    onClick={() => onUseContinueRecommendation?.({
                                      title: rec.title,
                                      outline: rec.outline,
                                      detailed_outline: rec.detailed_outline,
                                      next_chapter_number: (msg as MessageWithTime).continueChapterResult!.next_chapter_number,
                                    })}
                                    disabled={readOnly}
                                  >
                                    使用此方案创建章节
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div 
                            className="leading-7 [&_a]:text-primary [&_a:hover]:underline [&_blockquote]:my-2 [&_blockquote]:border-l-3 [&_blockquote]:border-primary [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_h1]:my-3 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:my-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:text-lg [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-2 [&_ol]:pl-6 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:my-2 [&_ul]:pl-6"
                            dangerouslySetInnerHTML={{ __html: md.render(msg.content) }}
                          />
                        )
                      ) : (
                        <div className="text-content">
                          {renderMessageWithMentions(msg.content, msg.mentions)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-[11px] text-muted-foreground">{formatTime(messageTime)}</span>
                      <button
                        className="flex size-5 items-center justify-center rounded bg-transparent text-muted-foreground opacity-0 transition-all hover:bg-background hover:text-primary group-hover:opacity-100"
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
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--text-tertiary)_0%,var(--text-secondary)_100%)]">
                      <span className="flex h-full w-full items-center justify-center text-sm font-semibold leading-none text-white" aria-hidden>{userInitial}</span>
                    </div>
                  )}
                </div>
              );
            })}
            {isSending && (
              <div className="flex gap-2.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-transparent">
                  <span className="text-lg">
                    <img src="/logo.svg" width={50} height={50} alt="球球" />
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                    <Loader2 className="animate-spin" size={16} />
                    <span>正在思考中…</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="mb-4">
            {!readOnly && (
            <div className="mb-2 flex gap-2">
              <button 
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary"
                onClick={() => {
                  loadData();
                  if (chatInputRef.current) {
                    const cursorPos = cursorOffsetRef.current;
                    const newMessage = 
                      message.substring(0, cursorPos) + 
                      '@' + 
                      message.substring(cursorPos);
                    setMessage(newMessage);
                    setCharCount(newMessage.length);
                    cursorAfterUpdateRef.current = cursorPos + 1;
                    chatInputRef.current?.focus();
                  }
                }}
                title="插入 @ 引用章节或角色"
              >
                <FileText size={14} />
                <span>@引用</span>
              </button>
            </div>
            )}
            {readOnly ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/40 p-5 text-center text-[13px] text-muted-foreground">
                <p>当前为只读模式，无法使用AI助手</p>
              </div>
            ) : !isAuthenticated ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/40 p-5 text-center text-[13px] text-muted-foreground">
                <p>请先登录后再使用球球AI功能</p>
              </div>
            ) : !workId ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/40 p-5 text-center text-[13px] text-muted-foreground">
                <p>请先选择作品后再使用球球AI功能</p>
              </div>
            ) : (
              <>
                <div className="relative mb-2">
                  <ChatInputContentEditable
                    inputRef={chatInputRef}
                    value={message}
                    onChange={handleCEChange}
                    onKeyDown={handleKeyDown}
                    onCursorChange={(offset) => {
                      cursorOffsetRef.current = offset;
                      runMentionMenuLogic(message, offset);
                    }}
                    placeholder="输入你的问题..."
                    disabled={!isAuthenticated || !workId || isSending}
                    cursorOffsetRef={cursorOffsetRef}
                    cursorAfterUpdateRef={cursorAfterUpdateRef}
                    className="min-h-[60px] max-h-[200px] w-full overflow-y-auto rounded-lg border-2 border-border bg-background px-2.5 py-2.5 text-sm leading-6 transition-colors focus-within:border-primary"
                  />
                  {showMentionMenu && mentionOptions.length > 0 && createPortal(
                    <div
                      ref={mentionMenuRef}
                      className="fixed z-[3000] min-w-[280px] max-w-[320px] overflow-hidden rounded-lg border border-border bg-background shadow-lg"
                      style={{
                        top: `${mentionPosition.top}px`,
                        left: `${mentionPosition.left}px`,
                      }}
                    >
                      <div className="border-b border-border bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                        <span>选择要引用的内容</span>
                      </div>
                      {mentionOptions.length > 0 ? (
                        <>
                          <div className="max-h-[240px] overflow-y-auto">
                            {mentionOptions.map((option, idx) => (
                              <div
                                key={`${option.type}-${option.id}`}
                                className={cn(
                                  'flex cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2.5 transition-colors last:border-b-0',
                                  idx === selectedMentionIndex ? 'bg-primary/10' : 'hover:bg-primary/10'
                                )}
                                onClick={() => handleSelectMention(option)}
                                onMouseEnter={() => setSelectedMentionIndex(idx)}
                              >
                                <div className="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-primary">
                                  {option.isCommand ? (
                                    <span style={{ fontSize: '16px' }}>⚡</span>
                                  ) : option.type === 'chapter' ? (
                                    <BookOpen size={16} />
                                  ) : (
                                    <User size={16} />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-medium text-foreground">{option.name}</div>
                                  {option.subtitle && (
                                    <div className="truncate text-xs text-muted-foreground">{option.subtitle}</div>
                                  )}
                                </div>
                                <div className={mentionTypeLabelClassName}>
                                  {option.isCommand ? '指令' : option.type === 'chapter' ? '章节' : '角色'}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-center gap-2 border-t border-border bg-muted px-3 py-1.5 text-[11px] text-muted-foreground">
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
                        <div className="p-5 text-center text-[13px] text-muted-foreground">
                          <span>没有找到匹配的内容</span>
                        </div>
                      )}
                    </div>,
                    document.body
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{charCount}/50000</span>
                  <button
                    className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleSend}
                    disabled={isSending || !message.trim() || !isAuthenticated || !workId}
                  >
                    {isSending ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
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
