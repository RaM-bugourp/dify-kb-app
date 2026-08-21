// 打包脚本：产出可直接分发到其他设备演示的自包含目录
// 用法：node scripts/package.mjs
// 产物：release/dify-kb-demo/
//   目标设备上：cd release/dify-kb-demo && npm install --omit=dev && npm start
//   然后浏览器访问 http://localhost:3001
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'release', 'dify-kb-demo')

console.log('== 打包演示包 ==')

// 1. 确保已构建
if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
  console.error('未找到 dist/，请先运行 npm run build')
  process.exit(1)
}

// 2. 清空并重建输出目录
rmSync(join(ROOT, 'release'), { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

// 3. 复制前端构建产物
cpSync(join(ROOT, 'dist'), join(OUT, 'dist'), { recursive: true })
console.log('  ✓ dist/')

// 4. 复制后端（含演示数据 data.json 和图片 media/）
cpSync(join(ROOT, 'server'), join(OUT, 'server'), { recursive: true })
console.log('  ✓ server/ (含 data.json + media/)')

// 5. 生成精简 package.json（仅运行时依赖）
const pkg = {
  name: 'dify-kb-demo',
  private: true,
  version: '0.2.0',
  type: 'module',
  scripts: { start: 'node server/index.js' },
  dependencies: {
    cors: '^2.8.5',
    express: '^4.19.2',
    mammoth: '^1.12.1',
    unpdf: '^1.8.1',
  },
}
writeFileSync(join(OUT, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
console.log('  ✓ package.json (精简，仅运行时依赖)')

// 6. 生成 README
const readme = `# Dify 知识库演示包

自包含演示包，数据（data.json）与图片（server/media/）已内置。

## 运行

\`\`\`bash
npm install --omit=dev   # 安装运行时依赖（express/cors/mammoth/unpdf）
npm start                # 启动，监听 http://localhost:3001
\`\`\`

浏览器访问 http://localhost:3001 即可。

## 说明
- 单端口服务：前端页面 + /api 接口 + /media 图片均由 3001 端口提供
- 演示数据：server/data.json（知识库/分区/数据表/文档/图片元数据）
- 图片文件：server/media/*.png
- 上传的图片会写入 server/media/ 并记录到 data.json
- 数据为本地 JSON 存储，重启不丢失；删除 server/data.json 可恢复初始演示数据

## 重置演示数据
\`\`\`bash
# 删除数据文件后重启，会自动重建初始演示数据
rm server/data.json   # Windows: del server\\data.json
npm start
\`\`\`
`
writeFileSync(join(OUT, 'README.txt'), readme)
console.log('  ✓ README.txt')

console.log('\n打包完成 ->', OUT)
console.log('分发：拷贝整个 dify-kb-demo 目录到目标设备即可')
