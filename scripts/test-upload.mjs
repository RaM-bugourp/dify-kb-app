// 临时上传测试脚本
import { readFileSync } from 'fs'

const buf = readFileSync(new URL('../server/media/arch-blue.png', import.meta.url))

const fd = new FormData()
fd.append('file', new Blob([buf], { type: 'image/png' }), 'upload-test.png')
fd.append('datasetId', 'ds_tech')
fd.append('folderId', 'f_arch')
fd.append('name', '上传测试图')

const res = await fetch('http://localhost:3001/api/images', { method: 'POST', body: fd })
const json = await res.json()
console.log('status =', res.status)
console.log(JSON.stringify(json, null, 2))
