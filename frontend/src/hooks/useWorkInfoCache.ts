import { useState, useEffect, useRef } from 'react';

export interface Character {
  id: string;
  name: string;
  avatar?: string;
  gender?: string;
  description?: string;
  type?: string;
  source?: string;
}

export interface Location {
  id: string;
  name: string;
}

export interface UseWorkInfoCacheResult {
  availableCharacters: Character[];
  hasCharacterModule: boolean;
  availableLocations: Location[];
  hasLocationModule: boolean;
}

/**
 * Hook: 从 WorkInfoManager 缓存中加载角色和地点数据
 */
export function useWorkInfoCache(
  workId: string | null
): UseWorkInfoCacheResult {
  const [availableCharacters, setAvailableCharacters] = useState<Character[]>([]);
  const [hasCharacterModule, setHasCharacterModule] = useState(false);
  const [availableLocations, setAvailableLocations] = useState<Location[]>([]);
  const [hasLocationModule, setHasLocationModule] = useState(false);

  // 使用 useRef 存储上一次的结果，避免重复计算
  const lastCharacterCacheRef = useRef<string>('');

  useEffect(() => {
    if (!workId) {
      setHasLocationModule(false);
      setAvailableLocations([]);
      setHasCharacterModule(false);
      setAvailableCharacters([]);
      return;
    }

    const loadLocationsFromCache = () => {
      try {
        // 使用 workId 特定的缓存键，确保每个作品的数据是独立的
        const CACHE_KEY = `planetwriter_workinfo_cache_${workId}`;
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const data = JSON.parse(cached);
          const modules = data.modules || [];
          
          // 查找角色设定模块
          const characterModule = modules.find((m: ModuleConfig) => m.id === 'characters');
          if (characterModule) {
            setHasCharacterModule(true);
            
            // 查找角色数据（可能在char-table或character-card组件中）
            // 只从character-card组件收集角色数据
            const findAllCharacterData = (components: ComponentConfig[]): Character[] => {
              const allCharacters: Character[] = [];
              
              for (const comp of components) {
                // 只检查character-card组件（不再检查table组件）
                if (comp.type === 'character-card' && comp.value) {
                  // 角色卡片数据格式：数组，每个对象有name字段
                  const cardChars = (Array.isArray(comp.value) ? comp.value : []).map((char: any) => ({
                    id: char.name || String(Date.now() + Math.random()),
                    name: char.name || '',
                    avatar: char.avatar || undefined,
                    gender: char.gender || undefined,
                    description: char.description || '',
                    type: char.type || undefined,
                    source: 'character-card',
                  })).filter((c: Character) => c.name);
                  allCharacters.push(...cardChars);
                }
                
                // 检查tabs组件（角色设定可能在tabs中）
                if (comp.type === 'tabs' && comp.config?.tabs) {
                  for (const tab of comp.config.tabs) {
                    if (tab.components) {
                      const found = findAllCharacterData(tab.components);
                      allCharacters.push(...found);
                    }
                  }
                }
              }
              
              return allCharacters;
            };
            
            // 收集所有角色数据
            const allCharacterData = findAllCharacterData(characterModule.components || []);
            
            // 去重：使用name作为唯一标识，保留最完整的数据
            const characterMap = new Map<string, Character>();
            for (const char of allCharacterData) {
              const existing = characterMap.get(char.name);
              if (!existing) {
                characterMap.set(char.name, char);
              } else {
                // 合并数据，保留更完整的信息
                const merged: Character = {
                  ...existing,
                  ...char,
                  // 如果新数据有更多字段，则合并
                  avatar: char.avatar || existing.avatar,
                  gender: char.gender || existing.gender,
                  description: char.description || existing.description,
                  type: char.type || existing.type,
                };
                characterMap.set(char.name, merged);
              }
            }
            
            const uniqueCharacters = Array.from(characterMap.values());
            
            // 关键修复：检查缓存是否变化，避免重复计算和更新
            const currentCacheKey = JSON.stringify({
              cache: cached,
            });
            
            // 如果缓存没有变化，跳过更新
            if (currentCacheKey === lastCharacterCacheRef.current) {
              return; // 跳过重复计算
            }
            
            // 更新缓存引用
            lastCharacterCacheRef.current = currentCacheKey;
            
            setAvailableCharacters(uniqueCharacters);
            
            console.log('📋 角色列表:', {
              total: uniqueCharacters.length,
              fromCard: uniqueCharacters.filter(c => c.source === 'character-card').length,
            });
          } else {
            setHasCharacterModule(false);
            setAvailableCharacters([]);
          }
          
          // 查找地点数据（可能在world模块的card-list组件中，或者有"地点"关键词的组件）
          const findLocationData = (components: any[]): Location[] => {
            for (const comp of components) {
              // 检查card-list组件，且label包含"地点"相关关键词
              if (comp.type === 'card-list' && comp.value) {
                const label = (comp.label || '').toLowerCase();
                if (label.includes('地点') || label.includes('location') || label.includes('场景')) {
                  // 卡片列表数据格式：数组，每个对象有name字段（或第一个字段）
                  return (comp.value as any[]).map((card) => {
                    // 尝试从name字段获取，如果没有则从第一个字段获取
                    const name = card.name || card[Object.keys(card)[0]] || '';
                    return {
                      id: name || String(Date.now() + Math.random()),
                      name: name,
                    };
                  }).filter(loc => loc.name);
                }
              }
              
              // 检查tabs组件（地点可能在tabs中）
              if (comp.type === 'tabs' && comp.config?.tabs) {
                for (const tab of comp.config.tabs) {
                  if (tab.components) {
                    const found = findLocationData(tab.components);
                    if (found.length > 0) return found;
                  }
                }
              }
            }
            return [];
          };
          
          // 查找world模块
          const worldModule = modules.find((m: any) => m.id === 'world');
          if (worldModule) {
            const locationData = findLocationData(worldModule.components || []);
            if (locationData.length > 0) {
              setHasLocationModule(true);
              setAvailableLocations(locationData);
            } else {
              setHasLocationModule(false);
              setAvailableLocations([]);
            }
          } else {
            // 如果没有world模块，尝试在所有模块中查找地点数据
            let foundLocations: Location[] = [];
            for (const module of modules) {
              const locationData = findLocationData(module.components || []);
              if (locationData.length > 0) {
                foundLocations = locationData;
                break;
              }
            }
            if (foundLocations.length > 0) {
              setHasLocationModule(true);
              setAvailableLocations(foundLocations);
            } else {
              setHasLocationModule(false);
              setAvailableLocations([]);
            }
          }
        } else {
          setHasLocationModule(false);
          setAvailableLocations([]);
          setHasCharacterModule(false);
          setAvailableCharacters([]);
        }
      } catch (err) {
        console.error('加载地点数据失败:', err);
        setHasLocationModule(false);
        setAvailableLocations([]);
        setHasCharacterModule(false);
        setAvailableCharacters([]);
      }
    };

    // 初始加载
    loadLocationsFromCache();

    // 监听localStorage变化（当WorkInfoManager更新时）
    const handleStorageChange = (e: StorageEvent) => {
      const workSpecificKey = `planetwriter_workinfo_cache_${workId}`;
      if (e.key === workSpecificKey) {
        loadLocationsFromCache();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // 定期检查缓存变化（因为同窗口内的localStorage变化不会触发storage事件）
    // 关键修复：增加检查间隔到5秒，减少频繁执行
    const interval = setInterval(loadLocationsFromCache, 5000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [workId]);

  return {
    availableCharacters,
    hasCharacterModule,
    availableLocations,
    hasLocationModule,
  };
}

