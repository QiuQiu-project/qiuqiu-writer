/**
 * 操作跟踪器
 * 捕获用户的编辑操作（插入、删除、替换），用于操作级同步
 * 实现 Operational Transformation (OT) 的基础功能
 */

export interface TextOperation {
  type: 'insert' | 'delete' | 'replace' | 'retain';
  position: number;
  length?: number;  // 用于 delete 和 replace
  text?: string;    // 用于 insert 和 replace
  version?: number; // 操作基于的版本号
  timestamp?: number;
  userId?: number;
}

export interface OperationBatch {
  operations: TextOperation[];
  baseVersion: number;
  documentId: string;
  timestamp: number;
}

class OperationTracker {
  private operations: TextOperation[] = [];
  private lastContent: string = '';
  private baseVersion: number = 0;
  private documentId: string = '';
  private isTracking: boolean = false;

  /**
   * 开始跟踪操作
   */
  startTracking(documentId: string, initialContent: string, baseVersion: number = 0): void {
    this.documentId = documentId;
    this.lastContent = initialContent;
    this.baseVersion = baseVersion;
    this.operations = [];
    this.isTracking = true;
    
  }

  /**
   * 停止跟踪操作
   */
  stopTracking(): void {
    this.isTracking = false;
    this.operations = [];
    
  }

  /**
   * 计算内容变化并生成操作
   */
  trackChange(oldContent: string, newContent: string): TextOperation[] {
    if (!this.isTracking) {
      return [];
    }

    const ops = this.computeOperations(oldContent, newContent);
    this.operations.push(...ops);
    this.lastContent = newContent;
    
    
    return ops;
  }

  /**
   * 计算两个内容之间的操作差异
   * 使用简单的 diff 算法
   */
  private computeOperations(oldContent: string, newContent: string): TextOperation[] {
    const operations: TextOperation[] = [];
    
    // 如果内容相同，返回空操作
    if (oldContent === newContent) {
      return operations;
    }

    // 使用最长公共子序列 (LCS) 算法计算差异
    const diff = this.computeDiff(oldContent, newContent);
    
    let oldPos = 0;
    let newPos = 0;

    for (const change of diff) {
      if (change.type === 'equal') {
        // 相同部分，保留
        operations.push({
          type: 'retain',
          position: oldPos,
          length: change.length
        });
        oldPos += change.length;
        newPos += change.length;
      } else if (change.type === 'delete') {
        // 删除操作
        operations.push({
          type: 'delete',
          position: oldPos,
          length: change.length
        });
        oldPos += change.length;
      } else if (change.type === 'insert') {
        // 插入操作
        operations.push({
          type: 'insert',
          position: newPos,
          text: change.text
        });
        newPos += change.text.length;
      } else if (change.type === 'replace') {
        // 替换操作
        operations.push({
          type: 'replace',
          position: oldPos,
          length: change.length,
          text: change.text
        });
        oldPos += change.length;
        newPos += change.text.length;
      }
    }

    return operations;
  }

  /**
   * 简单的 diff 算法
   * 使用 Myers 算法的简化版本
   */
  private computeDiff(oldText: string, newText: string): Array<{
    type: 'equal' | 'delete' | 'insert' | 'replace';
    length?: number;
    text?: string;
  }> {
    const changes: Array<{
      type: 'equal' | 'delete' | 'insert' | 'replace';
      length?: number;
      text?: string;
    }> = [];

    let i = 0;
    let j = 0;

    while (i < oldText.length || j < newText.length) {
      if (i < oldText.length && j < newText.length && oldText[i] === newText[j]) {
        // 相同字符，继续
        let equalLength = 0;
        while (
          i + equalLength < oldText.length &&
          j + equalLength < newText.length &&
          oldText[i + equalLength] === newText[j + equalLength]
        ) {
          equalLength++;
        }
        changes.push({ type: 'equal', length: equalLength });
        i += equalLength;
        j += equalLength;
      } else {
        // 查找下一个匹配点
        let deleteLength = 0;
        let insertLength = 0;
        let foundMatch = false;

        // 尝试删除
        for (let d = 1; d <= Math.min(100, oldText.length - i); d++) {
          const nextMatch = newText.indexOf(oldText.substring(i, i + d), j);
          if (nextMatch !== -1 && nextMatch - j <= 10) {
            deleteLength = d;
            insertLength = nextMatch - j;
            foundMatch = true;
            break;
          }
        }

        if (foundMatch) {
          if (deleteLength > 0 && insertLength > 0) {
            // 替换
            changes.push({
              type: 'replace',
              length: deleteLength,
              text: newText.substring(j, j + insertLength)
            });
            i += deleteLength;
            j += insertLength;
          } else if (deleteLength > 0) {
            // 删除
            changes.push({ type: 'delete', length: deleteLength });
            i += deleteLength;
          } else if (insertLength > 0) {
            // 插入
            changes.push({
              type: 'insert',
              text: newText.substring(j, j + insertLength)
            });
            j += insertLength;
          }
        } else {
          // 没有找到匹配，简单处理：删除旧字符，插入新字符
          if (i < oldText.length && j < newText.length) {
            changes.push({
              type: 'replace',
              length: 1,
              text: newText[j]
            });
            i++;
            j++;
          } else if (i < oldText.length) {
            changes.push({ type: 'delete', length: 1 });
            i++;
          } else if (j < newText.length) {
            changes.push({ type: 'insert', text: newText[j] });
            j++;
          }
        }
      }
    }

    return changes;
  }

  /**
   * 获取待发送的操作批次
   */
  getPendingOperations(): OperationBatch | null {
    if (this.operations.length === 0) {
      return null;
    }

    const batch: OperationBatch = {
      operations: [...this.operations],
      baseVersion: this.baseVersion,
      documentId: this.documentId,
      timestamp: Date.now()
    };

    // 清空操作列表（已准备发送）
    this.operations = [];

    return batch;
  }

  /**
   * 应用操作到内容
   */
  static applyOperation(content: string, operation: TextOperation): string {
    switch (operation.type) {
      case 'insert':
        if (operation.position === undefined || operation.text === undefined) {
          return content;
        }
        const insertPos = Math.min(operation.position, content.length);
        return content.slice(0, insertPos) + operation.text + content.slice(insertPos);

      case 'delete':
        if (operation.position === undefined || operation.length === undefined) {
          return content;
        }
        const deleteStart = Math.min(operation.position, content.length);
        const deleteEnd = Math.min(deleteStart + operation.length, content.length);
        return content.slice(0, deleteStart) + content.slice(deleteEnd);

      case 'replace':
        if (operation.position === undefined || operation.length === undefined || operation.text === undefined) {
          return content;
        }
        const replaceStart = Math.min(operation.position, content.length);
        const replaceEnd = Math.min(replaceStart + operation.length, content.length);
        return content.slice(0, replaceStart) + operation.text + content.slice(replaceEnd);

      case 'retain':
        // retain 操作不改变内容
        return content;

      default:
        return content;
    }
  }

  /**
   * 应用多个操作到内容
   */
  static applyOperations(content: string, operations: TextOperation[]): string {
    let result = content;
    for (const op of operations) {
      result = OperationTracker.applyOperation(result, op);
    }
    return result;
  }

  /**
   * 转换操作位置（用于处理并发操作）
   * 这是一个简化的 OT 转换函数
   */
  static transformOperation(
    op1: TextOperation,
    op2: TextOperation,
    priority: 'op1' | 'op2' = 'op1'
  ): TextOperation {
    // 简化实现：如果操作位置不重叠，直接返回
    // 如果重叠，根据优先级决定
    
    if (op1.type === 'retain' || op2.type === 'retain') {
      return op1;
    }

    const op1End = op1.position + (op1.length || op1.text?.length || 0);
    const op2End = op2.position + (op2.length || op2.text?.length || 0);

    // 如果操作不重叠，直接返回
    if (op1End <= op2.position || op2End <= op1.position) {
      return op1;
    }

    // 操作重叠，根据优先级调整位置
    if (priority === 'op1') {
      // op1 优先，op2 需要调整位置
      if (op2.type === 'insert' && op1.type === 'delete') {
        // op1 删除，op2 插入：op2 位置需要前移
        return {
          ...op2,
          position: Math.max(0, op2.position - op1.length!)
        };
      }
    }

    // 简化处理：返回原始操作
    return op1;
  }
}

// 导出单例
export const operationTracker = new OperationTracker();

