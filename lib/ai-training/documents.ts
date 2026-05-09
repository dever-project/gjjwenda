import type { AiTrainingDocument } from '@/lib/appTypes';
import { createId } from '@/lib/ai-training/defaults';
import * as XLSX from 'xlsx';

export type AiTrainingFileType = 'docx' | 'txt' | 'md';

export const MAX_AI_TRAINING_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_AI_TRAINING_TEXT_LENGTH = 80_000;

export function getAiTrainingFileType(fileName: string): AiTrainingFileType | null {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith('.docx')) return 'docx';
  if (lowerName.endsWith('.txt')) return 'txt';
  if (lowerName.endsWith('.md')) return 'md';

  return null;
}

export function truncateScenarioDocuments(documents: AiTrainingDocument[]) {
  let usedLength = 0;

  return documents.map((document) => {
    const remainingLength = Math.max(0, MAX_AI_TRAINING_TEXT_LENGTH - usedLength);
    const content = document.content.slice(0, remainingLength);
    usedLength += content.length;

    return {
      ...document,
      content,
    };
  });
}

export function extractDocxText(buffer: ArrayBuffer) {
  const cfb = XLSX.CFB.read(new Uint8Array(buffer), { type: 'array' });
  const documentFile =
    XLSX.CFB.find(cfb, '/word/document.xml') ||
    XLSX.CFB.find(cfb, 'document.xml');

  if (!documentFile?.content) {
    throw new Error('DOCX 中未找到 word/document.xml');
  }

  const xml = new TextDecoder('utf-8').decode(documentFile.content);
  const xmlDoc = new DOMParser().parseFromString(xml, 'application/xml');
  if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('DOCX XML 解析失败');
  }

  const paragraphs = xmlDoc.getElementsByTagName('w:p').length > 0
    ? Array.from(xmlDoc.getElementsByTagName('w:p'))
    : Array.from(xmlDoc.getElementsByTagNameNS('*', 'p'));

  return paragraphs
    .map((paragraph) => {
      const parts: string[] = [];
      paragraph.querySelectorAll('*').forEach((node) => {
        if (node.localName === 't' || node.localName === 'delText') {
          parts.push(node.textContent ?? '');
        } else if (node.localName === 'tab') {
          parts.push('\t');
        } else if (node.localName === 'br') {
          parts.push('\n');
        }
      });

      return parts.join('').trim();
    })
    .filter(Boolean)
    .join('\n');
}

export async function readAiTrainingDocument(file: File): Promise<AiTrainingDocument> {
  if (file.size > MAX_AI_TRAINING_FILE_SIZE_BYTES) {
    throw new Error('文件不能超过 5MB');
  }

  const fileType = getAiTrainingFileType(file.name);
  if (!fileType) {
    throw new Error('仅支持 DOCX、TXT、MD 文件');
  }

  const content = fileType === 'docx'
    ? extractDocxText(await file.arrayBuffer())
    : await file.text();
  const trimmedContent = content.trim();

  if (!trimmedContent) {
    throw new Error('未从文件中解析到文本');
  }

  return {
    id: createId('aitdoc'),
    title: file.name,
    content: trimmedContent,
  };
}
