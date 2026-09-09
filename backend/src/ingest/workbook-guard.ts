import JSZip, { type JSZipObject } from "jszip";

const MAX_XLSX_ENTRIES = 256;
const MAX_XLSX_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_SIGNATURE = 0x06054b50;

export class WorkbookRowLimitError extends Error {
  constructor(readonly limit: number) {
    super(`Workbook exceeds ${limit} data rows`);
    this.name = "WorkbookRowLimitError";
  }
}

export class WorkbookArchiveLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkbookArchiveLimitError";
  }
}

export async function assertWorkbookArchiveWithinLimits(buffer: Buffer, rowLimit: number): Promise<void> {
  assertCentralDirectoryWithinLimits(buffer);
  const archive = await JSZip.loadAsync(buffer);
  const entries = Object.values(archive.files);
  if (entries.length > MAX_XLSX_ENTRIES) {
    throw new WorkbookArchiveLimitError(`Workbook exceeds ${MAX_XLSX_ENTRIES} ZIP entries`);
  }

  let uncompressedBytes = 0;
  let worksheetRows = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    ({ uncompressedBytes, worksheetRows } = await countEntryBytes(entry, uncompressedBytes, worksheetRows, rowLimit));
  }
}

function assertCentralDirectoryWithinLimits(buffer: Buffer): void {
  const endOffset = findZipEnd(buffer);
  if (buffer.readUInt16LE(endOffset + 4) || buffer.readUInt16LE(endOffset + 6)) {
    throw new Error("Multi-disk ZIP archives are not supported");
  }
  const expectedEntries = buffer.readUInt16LE(endOffset + 10);
  const centralSize = buffer.readUInt32LE(endOffset + 12);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  if (expectedEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error("ZIP64 archives are not supported");
  }
  if (expectedEntries > MAX_XLSX_ENTRIES) {
    throw new WorkbookArchiveLimitError(`Workbook exceeds ${MAX_XLSX_ENTRIES} ZIP entries`);
  }

  const centralEnd = centralOffset + centralSize;
  if (centralEnd > endOffset) throw new Error("Invalid ZIP central directory");
  let entries = 0;
  let declaredBytes = 0;
  let offset = centralOffset;
  while (offset < centralEnd) {
    if (offset + 46 > centralEnd || buffer.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("Invalid ZIP central directory");
    }
    declaredBytes += buffer.readUInt32LE(offset + 24);
    if (declaredBytes > MAX_XLSX_UNCOMPRESSED_BYTES) {
      throw new WorkbookArchiveLimitError(`Workbook exceeds ${MAX_XLSX_UNCOMPRESSED_BYTES} uncompressed bytes`);
    }
    entries += 1;
    if (entries > MAX_XLSX_ENTRIES) {
      throw new WorkbookArchiveLimitError(`Workbook exceeds ${MAX_XLSX_ENTRIES} ZIP entries`);
    }
    offset +=
      46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
    if (offset > centralEnd) throw new Error("Invalid ZIP central directory");
  }
  if (entries !== expectedEntries) throw new Error("Invalid ZIP entry count");
}

function findZipEnd(buffer: Buffer): number {
  const firstPossibleOffset = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= firstPossibleOffset; offset -= 1) {
    if (
      buffer.readUInt32LE(offset) === ZIP_END_SIGNATURE &&
      offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length
    ) {
      return offset;
    }
  }
  throw new Error("ZIP end record not found");
}

function countEntryBytes(
  entry: JSZipObject,
  initialBytes: number,
  initialRows: number,
  rowLimit: number,
): Promise<{ uncompressedBytes: number; worksheetRows: number }> {
  return new Promise((resolve, reject) => {
    const stream = entry.nodeStream();
    let bytes = initialBytes;
    let rows = initialRows;
    let rowTagState = 0;
    let settled = false;
    stream.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_XLSX_UNCOMPRESSED_BYTES) {
        return fail(
          new WorkbookArchiveLimitError(`Workbook exceeds ${MAX_XLSX_UNCOMPRESSED_BYTES} uncompressed bytes`),
        );
      }
      if (!/^xl\/worksheets\/[^/]+\.xml$/.test(entry.name)) return;
      const counted = countRowTags(chunk.toString("utf8"), rowTagState);
      rows += counted.rows;
      rowTagState = counted.state;
      if (rows > rowLimit + MAX_XLSX_ENTRIES) return fail(new WorkbookRowLimitError(rowLimit));
    });
    stream.on("error", fail);
    stream.on("end", () => {
      if (settled) return;
      settled = true;
      resolve({ uncompressedBytes: bytes, worksheetRows: rows });
    });

    function fail(error: Error): void {
      if (settled) return;
      settled = true;
      (stream as NodeJS.ReadableStream & { destroy(): void }).destroy();
      reject(error);
    }
  });
}

function countRowTags(xml: string, initialState: number): { rows: number; state: number } {
  const prefix = "<row";
  let rows = 0;
  let state = initialState;
  for (const character of xml) {
    if (state < prefix.length) {
      state = character === prefix[state] ? state + 1 : character === "<" ? 1 : 0;
      continue;
    }
    if (character === ">" || /\s/.test(character)) rows += 1;
    state = character === "<" ? 1 : 0;
  }
  return { rows, state };
}
