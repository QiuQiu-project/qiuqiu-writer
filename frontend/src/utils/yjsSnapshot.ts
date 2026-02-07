/**
 * Yjs 原生快照：用 Y.encodeStateAsUpdate 存单章节内容，支持 Git 式版本历史与恢复
 * 使用 y-prosemirror 的 prosemirrorJSONToYXmlFragment / yXmlFragmentToProsemirrorJSON
 */

import * as Y from 'yjs';
import {
  prosemirrorJSONToYXmlFragment,
  yXmlFragmentToProsemirrorJSON,
} from 'y-prosemirror';
import type { Editor } from '@tiptap/react';

const FRAGMENT_NAME = 'prosemirror';

/**
 * 从当前编辑器内容创建 Yjs 快照（单章节）
 * 返回 base64 字符串，可传给后端存储
 */
export function createYjsSnapshotFromEditor(editor: Editor): string {
  const schema = editor.schema;
  const state = editor.getJSON();
  const tempDoc = new Y.Doc();
  const fragment = tempDoc.getXmlFragment(FRAGMENT_NAME);
  prosemirrorJSONToYXmlFragment(schema, state, fragment);
  const update = Y.encodeStateAsUpdate(tempDoc);
  tempDoc.destroy();
  const bytes = new Uint8Array(update);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * 从快照 base64 解析出 ProseMirror JSON（用于预览/对比，不写回编辑器）
 */
export function getContentJSONFromYjsSnapshotBase64(snapshotBase64: string): Record<string, unknown> {
  const str = atob(snapshotBase64);
  const binary = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) binary[i] = str.charCodeAt(i);
  const tempDoc = new Y.Doc();
  Y.applyUpdate(tempDoc, binary);
  const fragment = tempDoc.getXmlFragment(FRAGMENT_NAME);
  const json = yXmlFragmentToProsemirrorJSON(fragment);
  tempDoc.destroy();
  return json as Record<string, unknown>;
}

/**
 * 从 ProseMirror JSON 递归提取纯文本（用于对比预览）。
 * 顶层 doc 的块之间用 \\n\\n 分隔，与 TipTap editor.getText() 默认一致，
 * 保证「当前」与「历史版本」用同一规则提取，未改内容不会误判为整段删除+新增。
 */
export function getTextFromProsemirrorJSON(node: Record<string, unknown> | unknown): string {
  if (node === null || node === undefined) return '';
  const n = node as Record<string, unknown>;
  if (typeof n.text === 'string') return n.text;
  const content = n.content;
  if (Array.isArray(content)) {
    const blockSeparator = n.type === 'doc' ? '\n\n' : '';
    return content.map((c) => getTextFromProsemirrorJSON(c)).join(blockSeparator);
  }
  return '';
}

/**
 * 将后端返回的 Yjs 快照（base64）恢复到编辑器
 */
export function restoreYjsSnapshotToEditor(
  editor: Editor,
  snapshotBase64: string
): void {
  const str = atob(snapshotBase64);
  const binary = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) binary[i] = str.charCodeAt(i);
  const tempDoc = new Y.Doc();
  Y.applyUpdate(tempDoc, binary);
  const fragment = tempDoc.getXmlFragment(FRAGMENT_NAME);
  const json = yXmlFragmentToProsemirrorJSON(fragment);
  tempDoc.destroy();
  editor.commands.setContent(json, false);
}
