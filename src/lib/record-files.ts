import { calculateEntry, entryToDraft, validateEntry, type SavedEntry } from '../features/pension-calculator/domain/entries';

export const RECORD_FILENAME = 'tool-hub-pension-records.json';
export interface RecordFolder {
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{
    getFile(): Promise<{ text(): Promise<string> }>;
    createWritable(): Promise<{ write(text: string): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>;
  }>;
}
declare global {
  interface Window {
    showDirectoryPicker?: (options: { mode: 'readwrite'; id: string }) => Promise<RecordFolder>;
  }
}
export interface RecordFile { revision: string | null; records: SavedEntry[] }

export function decodeRecordFile(text: string): RecordFile {
  const parsed = JSON.parse(text);
  if (parsed?.format !== 'tool-hub:pension-records' || parsed.version !== 1 || typeof parsed.revision !== 'string' || !Array.isArray(parsed.records)) throw new Error('记录文件格式不正确，请选择其他文件夹。原文件未修改。');
  const ids = new Set<string>();
  const records: SavedEntry[] = parsed.records.map((row: SavedEntry) => {
    if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id) || ![2, 3].includes(row.ruleVersion)
      || typeof row.createdAt !== 'string' || typeof row.updatedAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt)) || !Number.isFinite(Date.parse(row.updatedAt))
      || !row.result?.input || !['age', 'year'].includes(row.result.input.timeBasis)) throw new Error('记录文件包含无效方案，原文件未修改。');
    ids.add(row.id);
    const valid = validateEntry(entryToDraft(row.result.input), row.result.input.timeBasis);
    if (!valid.ok) throw new Error('记录文件包含无效参数，原文件未修改。');
    return { id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt, ruleVersion: row.ruleVersion, result: calculateEntry(valid.value, row.ruleVersion) };
  });
  // Keep the exact file contents as the comparison token, including manual edits.
  return { revision: text, records };
}

export async function readRecordFile(folder: RecordFolder): Promise<RecordFile> {
  try {
    const file = await folder.getFileHandle(RECORD_FILENAME);
    const text = await (await file.getFile()).text();
    return text.trim() ? decodeRecordFile(text) : { revision: text, records: [] };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return { revision: null, records: [] };
    throw error;
  }
}

export async function writeRecordFile(folder: RecordFolder, records: SavedEntry[], expectedRevision: string | null): Promise<RecordFile> {
  const current = await readRecordFile(folder);
  if (current.revision !== expectedRevision) throw new Error('记录文件已被其他页面修改，请点击“重新读取”后再试。当前录入内容已保留。');
  const revision = crypto.randomUUID();
  const text = JSON.stringify({ format: 'tool-hub:pension-records', version: 1, revision, records }, null, 2);
  const handle = await folder.getFileHandle(RECORD_FILENAME, { create: true });
  const writer = await handle.createWritable();
  try { await writer.write(text); await writer.close(); }
  catch (error) { try { await writer.abort(); } catch { /* Preserve the original write error. */ } throw error; }
  return { revision: text, records };
}
