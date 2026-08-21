// 文档解析服务（阶段 1.3 / V0-2）
// 把 PDF / md / txt / docx 解析成纯文本，供入库与检索使用。
//
// 选型：
//   - PDF  → unpdf（无浏览器依赖，中文提取质量较好）
//   - docx → mammoth（转为 HTML 后剥标签，保留段落结构）
//   - md/txt → 直接读取
//
// 解析结果按 docId 缓存到 server/.cache/ 目录，避免重复解析。

import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname, extname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = join(__dirname, '.cache')
const FILES_DIR = join(__dirname, 'files')

export const SUPPORTED_DOC_EXTS = ['.pdf', '.md', '.markdown', '.txt', '.docx']

export function isSupportedDocument(filename) {
  const ext = extname(filename || '').toLowerCase()
  return SUPPORTED_DOC_EXTS.includes(ext)
}

async function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) await mkdir(CACHE_DIR, { recursive: true })
}

function cachePath(docId) {
  return join(CACHE_DIR, `${docId}.txt`)
}

// 从磁盘文件名读取文件内容 Buffer
export function filePath(file) {
  return join(FILES_DIR, file)
}

// 解析磁盘上的文件（file 为 files/ 下的文件名）
export async function parseFile(file, docId) {
  const cached = cachePath(docId)
  if (existsSync(cached)) {
    const { readFileSync } = await import('fs')
    return readFileSync(cached, 'utf-8')
  }

  const buf = await readFile(filePath(file))
  const ext = extname(file).toLowerCase()
  let text = ''

  if (ext === '.pdf') {
    text = await parsePdf(buf)
  } else if (ext === '.docx') {
    text = await parseDocx(buf)
  } else {
    // md / txt
    text = buf.toString('utf-8')
  }

  text = normalizeText(text)

  await ensureCacheDir()
  await writeFile(cached, text, 'utf-8')
  return text
}

async function parsePdf(buf) {
  const { extractText } = await import('unpdf')
  const result = await extractText(buf)
  // unpdf 返回 { totalPages, text } 或 { text }
  const pages = result?.totalPages ?? 0
  const raw = Array.isArray(result?.text) ? result.text.join('\n') : (result?.text ?? '')
  // unpdf 有时返回字符串数组
  const text = Array.isArray(raw) ? raw.join('\n') : String(raw)
  return `${text}${pages ? `\n\n[共 ${pages} 页]` : ''}`
}

async function parseDocx(buf) {
  const mammoth = await import('mammoth')
  const { value } = await mammoth.extractRawText({ buffer: buf })
  return value
}

function normalizeText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// 供调试直接调用
export async function parseBuffer(buf, filename) {
  const ext = extname(filename).toLowerCase()
  if (ext === '.pdf') return normalizeText(await parsePdf(buf))
  if (ext === '.docx') return normalizeText(await parseDocx(buf))
  return normalizeText(buf.toString('utf-8'))
}
