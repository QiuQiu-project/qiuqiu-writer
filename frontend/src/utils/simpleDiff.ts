/**
 * 行级 diff：使用 jsdiff（基于 Myers 1986 算法），用于历史版本与当前内容对比
 * @see https://www.npmjs.com/package/diff
 */

import { diffLines as jsDiffLines, type Change } from 'diff';

export type DiffLine = { type: 'same' | 'add' | 'remove'; text: string };

/**
 * 将 jsdiff 的 diffLines 结果展开为逐行 DiffLine[]，便于 UI 按行渲染。
 * diffLines(oldStr, newStr) 以行为 token，返回的 value 可能包含多行（含末尾 \n）。
 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const changes: Change[] = jsDiffLines(oldText, newText);
  const result: DiffLine[] = [];
  for (const part of changes) {
    const type = part.added ? 'add' : part.removed ? 'remove' : 'same';
    const value = part.value ?? '';
    const lines = value.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const isLast = i === lines.length - 1;
      const line = lines[i];
      if (isLast && line === '' && !value.endsWith('\n')) continue;
      result.push({ type, text: line });
    }
  }
  return result;
}
