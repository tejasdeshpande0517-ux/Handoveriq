import zlib from 'node:zlib';
import type { SourceDocType } from '../../src/types/index.ts';

export interface ParsedFileOutput {
  sourceType: SourceDocType;
  extractedText: string;
  metadata: Record<string, any>;
}

const ALLOWED_EXTENSIONS = new Set(['csv', 'json', 'pdf', 'docx', 'txt']);
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

const ALLOWED_MIME_TYPES: Record<string, Set<string>> = {
  csv: new Set(['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel']),
  json: new Set(['application/json', 'text/json', 'text/plain']),
  txt: new Set(['text/plain']),
  pdf: new Set(['application/pdf']),
  docx: new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
  ]),
};

export function validateAndParseFile(
  fileName: string,
  buffer: Buffer,
  mimeType?: string
): ParsedFileOutput {
  if (!fileName || typeof fileName !== 'string') {
    throw new Error('File name is required.');
  }

  if (!buffer || buffer.length === 0) {
    throw new Error('Uploaded file is empty.');
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File size (${(buffer.length / 1024 / 1024).toFixed(2)} MB) exceeds the 15 MB maximum limit.`);
  }

  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(
      `Unsupported file extension ".${ext}". Allowed formats: CSV, JSON, PDF, DOCX, TXT.`
    );
  }

  if (mimeType && typeof mimeType === 'string' && mimeType.trim()) {
    const normalizedMime = mimeType.split(';')[0].trim().toLowerCase();
    const allowedMimes = ALLOWED_MIME_TYPES[ext];
    if (allowedMimes && !allowedMimes.has(normalizedMime)) {
      throw new Error(
        `MIME type "${normalizedMime}" does not match allowed types for .${ext} files.`
      );
    }
  }

  if ((ext === 'csv' || ext === 'json' || ext === 'txt') && buffer.includes(0)) {
    throw new Error(`Invalid binary content detected in .${ext} text file.`);
  }

  if (ext === 'pdf') {
    const header = buffer.subarray(0, 5).toString('latin1');
    if (header !== '%PDF-') {
      throw new Error('Invalid PDF file signature.');
    }
  }

  if (ext === 'docx') {
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
      throw new Error('Invalid DOCX file signature.');
    }
  }

  switch (ext) {
    case 'csv':
      return parseCsvBuffer(fileName, buffer);
    case 'json':
      return parseJsonBuffer(fileName, buffer);
    case 'txt':
      return parseTxtBuffer(fileName, buffer);
    case 'docx':
      return parseDocxBuffer(fileName, buffer);
    case 'pdf':
      return parsePdfBuffer(fileName, buffer);
    default:
      throw new Error(`Unsupported file format: ${ext}`);
  }
}

function parseCsvBuffer(fileName: string, buffer: Buffer): ParsedFileOutput {
  const raw = buffer.toString('utf-8').trim();
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    throw new Error('CSV file contains no rows.');
  }

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const dataRows = lines.slice(1).map(parseRow);

  const formattedRows = dataRows.map((row, idx) => {
    const pairs = headers
      .map((h, colIdx) => `${h || `Col${colIdx + 1}`}: ${row[colIdx] ?? ''}`)
      .join(' | ');
    return `[Row ${idx + 1}] ${pairs}`;
  });

  const extractedText =
    formattedRows.length > 0
      ? `CSV Document: ${fileName}\nColumns: ${headers.join(', ')}\n\n${formattedRows.join('\n')}`
      : `CSV Document: ${fileName}\nHeader Row: ${headers.join(', ')}`;

  return {
    sourceType: 'FILE_CSV',
    extractedText,
    metadata: {
      fileName,
      format: 'CSV',
      sizeBytes: buffer.length,
      columnCount: headers.length,
      rowCount: dataRows.length,
      headers,
    },
  };
}

function parseJsonBuffer(fileName: string, buffer: Buffer): ParsedFileOutput {
  const raw = buffer.toString('utf-8').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`Invalid JSON syntax in ${fileName}: ${err.message}`);
  }

  const lines: string[] = [`JSON Document: ${fileName}`];

  const flattenEntry = (obj: any, prefix = ''): void => {
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        flattenEntry(item, `${prefix}[Item ${index + 1}] `);
      });
    } else if (obj && typeof obj === 'object') {
      const summaryParts: string[] = [];
      for (const [k, v] of Object.entries(obj)) {
        if (v !== null && typeof v === 'object') {
          flattenEntry(v, `${prefix}${k}.`);
        } else {
          summaryParts.push(`${k}: ${String(v)}`);
        }
      }
      if (summaryParts.length > 0) {
        lines.push(`${prefix}${summaryParts.join(' | ')}`);
      }
    } else {
      lines.push(`${prefix}${String(obj)}`);
    }
  };

  flattenEntry(parsed);

  return {
    sourceType: 'FILE_JSON',
    extractedText: lines.join('\n'),
    metadata: {
      fileName,
      format: 'JSON',
      sizeBytes: buffer.length,
      topLevelType: Array.isArray(parsed) ? 'Array' : typeof parsed,
      itemCount: Array.isArray(parsed) ? parsed.length : Object.keys(parsed || {}).length,
    },
  };
}

function parseTxtBuffer(fileName: string, buffer: Buffer): ParsedFileOutput {
  const text = buffer.toString('utf-8').trim();
  if (!text) {
    throw new Error(`Text file ${fileName} contains no readable text.`);
  }
  return {
    sourceType: 'FILE_TXT',
    extractedText: text,
    metadata: {
      fileName,
      format: 'TXT',
      sizeBytes: buffer.length,
      lineCount: text.split(/\r?\n/).length,
    },
  };
}

function parseDocxBuffer(fileName: string, buffer: Buffer): ParsedFileOutput {
  // Check if ZIP magic number PK\x03\x04
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    try {
      let offset = 0;
      const extractedSegments: string[] = [];
      while (offset + 30 <= buffer.length) {
        const sig = buffer.readUInt32LE(offset);
        if (sig !== 0x04034b50) break;
        const compression = buffer.readUInt16LE(offset + 8);
        const compressedSize = buffer.readUInt32LE(offset + 18);
        const fileNameLen = buffer.readUInt16LE(offset + 26);
        const extraLen = buffer.readUInt16LE(offset + 28);
        const entryName = buffer.subarray(offset + 30, offset + 30 + fileNameLen).toString('utf-8');
        const dataStart = offset + 30 + fileNameLen + extraLen;
        const dataEnd = dataStart + compressedSize;
        if (dataEnd > buffer.length) break;

        if (entryName === 'word/document.xml' || entryName.endsWith('.xml')) {
          const rawEntry = buffer.subarray(dataStart, dataEnd);
          const xmlBuf =
            compression === 8 ? zlib.inflateRawSync(rawEntry) : rawEntry;
          const xmlStr = xmlBuf.toString('utf-8');
          const paragraphs = xmlStr
            .replace(/<\/w:p>/g, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .trim();
          if (paragraphs && entryName === 'word/document.xml') {
            extractedSegments.unshift(paragraphs);
          }
        }
        offset = dataEnd;
      }

      if (extractedSegments.length > 0) {
        const text = extractedSegments.join('\n\n').trim();
        return {
          sourceType: 'FILE_DOCX',
          extractedText: text,
          metadata: {
            fileName,
            format: 'DOCX',
            sizeBytes: buffer.length,
            characterCount: text.length,
          },
        };
      }
    } catch {
      // Fallback to text extraction below
    }
  }

  // Reject non-ZIP DOCX payloads instead of falling back to raw text parsing
  throw new Error(`Could not extract readable text from DOCX file ${fileName}.`);
}

function parsePdfBuffer(fileName: string, buffer: Buffer): ParsedFileOutput {
  const rawLatin = buffer.toString('latin1');
  const extractedParts: string[] = [];

  // 1. Decompress FlateDecode streams if present
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(rawLatin)) !== null) {
    const streamBytes = Buffer.from(match[1], 'latin1');
    try {
      const inflated = zlib.inflateSync(streamBytes).toString('latin1');
      const textTokens = inflated.match(/\(([^()\\]|\\.)*\)/g);
      if (textTokens) {
        const cleaned = textTokens
          .map((t) =>
            t
              .slice(1, -1)
              .replace(/\\n/g, '\n')
              .replace(/\\r/g, ' ')
              .replace(/\\\(/g, '(')
              .replace(/\\\)/g, ')')
          )
          .join(' ');
        if (cleaned.trim()) extractedParts.push(cleaned.trim());
      }
    } catch {
      // Uncompressed stream
    }
  }

  // 2. Extract uncompressed PDF text literals (...) inside BT/ET or Tj/TJ operators
  const literalMatches = rawLatin.match(/\(([^()\\]|\\.)+\)\s*T[jJ]/g);
  if (literalMatches) {
    for (const lit of literalMatches) {
      const inner = lit
        .replace(/\)\s*T[jJ]$/, '')
        .slice(1)
        .replace(/\\n/g, '\n')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .trim();
      if (inner) extractedParts.push(inner);
    }
  }

  // 3. If PDF contains direct readable UTF-8 segments (or plain text wrapped in .pdf)
  if (extractedParts.length === 0) {
    const utf8Clean = buffer
      .toString('utf-8')
      .replace(/%PDF-[\d.]+/g, '')
      .replace(/\b(obj|endobj|stream|endstream|xref|trailer|startxref)\b/g, ' ')
      .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (utf8Clean) {
      extractedParts.push(utf8Clean);
    }
  }

  const finalText = extractedParts.join('\n').trim();
  if (!finalText) {
    throw new Error(`Could not extract readable text from PDF file ${fileName}.`);
  }

  return {
    sourceType: 'FILE_PDF',
    extractedText: finalText,
    metadata: {
      fileName,
      format: 'PDF',
      sizeBytes: buffer.length,
      characterCount: finalText.length,
    },
  };
}

