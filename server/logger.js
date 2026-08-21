// 统一日志模块
//
// 规范：
//   - 格式：[ISO时间] [级别] [模块] 消息
//   - 级别：debug < info < warn < error（LOG_LEVEL 控制最低输出级别）
//   - 输出：控制台 + 文件（server/logs/app.log），文件写入失败不影响主流程
//   - 路径规范：日志目录统一为 server/logs/，通过 join 拼接

import { mkdirSync, appendFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const LOG_DIR = join(__dirname, 'logs')
const LOG_FILE = join(LOG_DIR, 'app.log')

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }
const minLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info

function ts() {
  return new Date().toISOString()
}

function format(level, module, args) {
  const msg = args
    .map((a) => {
      if (a instanceof Error) return a.stack || a.message
      if (typeof a === 'object' && a !== null) {
        try { return JSON.stringify(a) } catch { return String(a) }
      }
      return String(a)
    })
    .join(' ')
  return `[${ts()}] [${level.toUpperCase()}] [${module}] ${msg}`
}

function write(level, module, ...args) {
  if ((LEVELS[level] ?? LEVELS.info) < minLevel) return
  const line = format(level, module, args)
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  sink(line)
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true })
    appendFileSync(LOG_FILE, line + '\n', 'utf-8')
  } catch {
    /* 日志文件不可写时静默，避免影响业务 */
  }
}

export const logger = {
  debug: (module, ...args) => write('debug', module, ...args),
  info: (module, ...args) => write('info', module, ...args),
  warn: (module, ...args) => write('warn', module, ...args),
  error: (module, ...args) => write('error', module, ...args),
}
