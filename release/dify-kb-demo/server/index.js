import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { existsSync, mkdirSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as store from './store.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(cors())
app.use(express.json({ limit: '5mb' }))

// 确保 media 目录存在
mkdirSync(store.MEDIA_DIR, { recursive: true })

// 静态托管图片目录（无需鉴权，演示用）
app.use('/media', express.static(store.MEDIA_DIR, { maxAge: '1d' }))

const wrap = (fn) => (req, res) => {
  try {
    const result = fn(req, res)
    if (result !== undefined && !res.headersSent) res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}

// ---- 健康检查 ----
app.get('/api/health', (req, res) => res.json({ ok: true }))

// ---- 树结构 ----
app.get('/api/tree', wrap(() => store.getTree()))

// ---- 知识库 ----
app.post('/api/datasets', wrap((req) => store.createDataset(req.body)))
app.patch('/api/datasets/:id', wrap((req) => store.updateDataset(req.params.id, req.body)))
app.delete('/api/datasets/:id', wrap((req) => store.deleteDataset(req.params.id)))

// ---- 分区 ----
app.post('/api/folders', wrap((req) => store.createFolder(req.body)))
app.patch('/api/folders/:id', wrap((req) => store.updateFolder(req.params.id, req.body)))
app.delete('/api/folders/:id', wrap((req) => store.deleteFolder(req.params.id)))

// ---- 资源列表 ----
app.get('/api/datasets/:datasetId/resources', wrap((req) =>
  store.listResources(req.params.datasetId, req.query.folderId ?? null),
))

// ---- 数据表 ----
app.post('/api/tables', wrap((req) => store.createTable(req.body)))
app.get('/api/tables/:id', wrap((req) => store.getTable(req.params.id)))
app.patch('/api/tables/:id', wrap((req) => store.updateTable(req.params.id, req.body)))
app.delete('/api/tables/:id', wrap((req) => store.deleteTable(req.params.id)))

app.post('/api/tables/:id/rows', wrap((req) => store.addRow(req.params.id, req.body)))
app.patch('/api/tables/:id/rows/:rowId', wrap((req) => store.updateRow(req.params.id, req.params.rowId, req.body)))
app.delete('/api/tables/:id/rows/:rowId', wrap((req) => store.deleteRow(req.params.id, req.params.rowId)))

app.post('/api/tables/:id/columns', wrap((req) => store.addColumn(req.params.id, req.body)))
app.patch('/api/tables/:id/columns/:key', wrap((req) => store.updateColumn(req.params.id, req.params.key, req.body)))

// ---- 图片 ----
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'])
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, store.MEDIA_DIR),
    filename: (req, file, cb) => {
      const ext = (file.originalname.match(/\.[a-zA-Z0-9]+$/) || ['.png'])[0].toLowerCase()
      cb(null, `${store.genId('img')}${ext}`)
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true)
    else cb(new Error('仅支持 jpg/png/gif/webp/bmp 图片'))
  },
})

app.post('/api/images', upload.single('file'), wrap((req) => {
  if (!req.file) throw new Error('未接收到文件')
  const { datasetId, folderId, name } = req.body
  if (!datasetId) throw new Error('缺少 datasetId')
  const meta = store.addImage({
    datasetId,
    folderId: folderId ?? null,
    name: name || req.file.originalname,
    file: req.file.filename,
    mime: req.file.mimetype,
    size: req.file.size,
    width: 0,
    height: 0,
  })
  return meta
}))

app.delete('/api/images/:id', wrap((req) => {
  const img = store.deleteImage(req.params.id)
  if (img) {
    const p = join(store.MEDIA_DIR, img.file)
    if (existsSync(p)) unlinkSync(p)
  }
  return { ok: true }
}))

// ---- 生产模式：单端口托管前端构建产物（打包演示用）----
const DIST = join(__dirname, '..', 'dist')
if (existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get(/^(?!\/api\b|\/media\b).*/, (req, res) => {
    res.sendFile(join(DIST, 'index.html'))
  })
}

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`)
})
