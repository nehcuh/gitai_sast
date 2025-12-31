import { Finding } from '../core/types';

/**
 * 漏洞键（用于去重）
 */
interface FindingKey {
  rule_id: string;
  file: string;
  line: number;
  column: number;
}

/**
 * 去重器 - 去除重复的扫描结果
 */
export class Deduplicator {
  /**
   * 去重漏洞列表
   */
  static deduplicateFindings(
    findings: Finding[]
  ): Finding[] {
    const seen = new Set<string>();
    const unique: Finding[] = [];

    for (const finding of findings) {
      const key = this.getFindingKey(finding);

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(finding);
      }
    }

    return unique;
  }

  /**
   * 合并漏洞列表（去重）
   */
  static mergeFindings(
    ...findingsLists: Finding[][]
  ): Finding[] {
    const allFindings = findingsLists.flat();
    return this.deduplicateFindings(allFindings);
  }

  /**
   * 计算差异（新增的漏洞）
   */
  static diffFindings(
    oldFindings: Finding[],
    newFindings: Finding[]
  ): {
    added: Finding[];
    removed: Finding[];
    unchanged: Finding[];
  } {
    const oldKeys = new Set(
      oldFindings.map(f => this.getFindingKey(f))
    );
    const newKeys = new Set(
      newFindings.map(f => this.getFindingKey(f))
    );

    const added: Finding[] = [];
    const removed: Finding[] = [];
    const unchanged: Finding[] = [];

    // 检查新增
    for (const finding of newFindings) {
      const key = this.getFindingKey(finding);
      if (!oldKeys.has(key)) {
        added.push(finding);
      } else {
        unchanged.push(finding);
      }
    }

    // 检查移除
    for (const finding of oldFindings) {
      const key = this.getFindingKey(finding);
      if (!newKeys.has(key)) {
        removed.push(finding);
      }
    }

    return { added, removed, unchanged };
  }

  /**
   * 获取漏洞键
   */
  private static getFindingKey(finding: Finding): string {
    return `${finding.rule_id}:${finding.location.file}:${finding.location.line}:${finding.location.column}`;
  }
}
