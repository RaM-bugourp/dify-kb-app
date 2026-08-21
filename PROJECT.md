# Dify 知识库管理应用（dify-kb-app）

> 云 Dify 桌面端知识库管理后台 —— 结构化数据 + 文档 + 图片统一管理，预留 RAG 检索接入。

---

## 1. 项目概览

| 项 | 值 |
|---|---|
| 项目名 | `dify-kb-app` |
| 版本 | `0.2.0` |
| 类型 | 全栈单仓库（前端 + 后端同仓） |
| 运行方式 | 单端口 3001 同时托管前端页面 + `/api` 接口 + `/media` 图片 |
| 模块规范 | ESM（`"type": "module"`） |
| 当前状态 | 原型可运行，mock 数据 + JSON 持久化，MySQL 预留待接入 |

**一句话定位**：一个模仿「云 Dify 知识库」交互的桌面端后台，左侧是「知识库 → 分区文件夹」树，右侧展示当前分区的**结构化数据表**（术语对照、功能清单、接口清单等，形如 MySQL 表）、**文档**和**图片**，单元格点击即编辑。

---

## 2. 技术栈

### 前端
- **React 18** + **TypeScript**（`tsc -b` 编译）
- **Vite 5**（`@vitejs/plugin-react`）
- `react-router-dom`（已引入，当前主要单页 `App.tsx` 驱动）

### 后端
- **Node.js** + **Express 4**（ESM 写法）
- **cors**（跨域）
- **multer**（已安装，但图片上传最终改用**手写字节解析**，见 §8）

### 存储
- **JSON 文件持久化**：`server/data.json`（`server/store.js` 统一读写）
- **图片原图**：`server/media/` 目录
- **MySQL**：预留切换点，`store.js` 所有数据访问函数签名稳定，未来替换内部实现即可

---

## 3. 目录结构

```
dify-kb-app/
├── package.json              # 脚本 + 依赖
├── vite.config.ts            # 前端代理 /api → localhost:3001
├── tsconfig.json             # TS 编译配置
├── index.html                # 前端入口 HTML
├── src/                      # 前端源码
│   ├── main.tsx              # React 挂载入口
│   ├── App.tsx               # 主应用（两栏布局 + 状态管理 + 增删改查）
│   ├── api.ts                # 前端 API 客户端（fetch 封装，相对路径 /api）
│   ├── types.ts              # TS 类型定义（Dataset/Folder/DataTable/ImageItem...）
│   ├── styles.css            # 全局样式（两栏布局 + 卡片网格 + 表格）
│   ├── vite-env.d.ts         # Vite 类型声明
│   └── components/
│       ├── Sidebar.tsx       # 左侧分区树（知识库 → 文件夹，展开/折叠/新建/选中）
│       ├── TableView.tsx     # 结构化表格渲染（动态 columns+rows，单元格编辑）
│       ├── ui.tsx            # 通用 UI（Modal 模态框、Confirm 确认框）
│       └── icons.tsx         # 内联 SVG 图标
├── server/                   # 后端源码
│   ├── index.js              # Express 路由 + 手写 multipart 图片上传 + 静态托管
│   ├── store.js              # 数据访问层（JSON 持久化，预留 MySQL 切换）
│   ├── dify-bridge.js        # Dify RAG 桥接层（mock，签名对齐 Dify 官方）
│   ├── data.json             # 持久化数据（种子演示数据）
│   └── media/                # 图片原图存储
├── scripts/
│   ├── gen-media.mjs         # 生成示例 PNG 图片
│   └── package.mjs           # 打包脚本（产出自包含演示目录）
├── docs/
│   ├── architecture.mmd      # 架构图源码（Mermaid 深色主题）
│   └── architecture.svg      # 渲染后的架构图
└── release/                  # 打包产物（自包含演示目录）
```

---

## 4. 架构设计

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│                    浏览器（前端 SPA）                 │
│        React + Vite，两栏布局，相对路径 /api 请求     │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP（同端口 3001）
┌──────────────────────▼──────────────────────────────┐
│              Node.js + Express 后端（server/）        │
│                                                      │
│   index.js  ──路由层──►  store.js  ──► server/data.json │
│   （REST API）          （数据访问）     （JSON 持久化）  │
│        │                 │                           │
│        │                 └──► server/media/（图片原图） │
│        │                                             │
│        └──► dify-bridge.js ──► Dify（RAG 语义检索，预留）│
│                 （mock 桥接层）                        │
└──────────────────────────────────────────────────────┘
```

### 4.2 分层职责

| 层 | 文件 | 职责 |
|---|---|---|
| 路由层 | `server/index.js` | 定义 REST 接口、参数解析、错误处理（`wrap`）、静态托管 |
| 数据层 | `server/store.js` | 所有数据读写，统一 `persist()` 写回 `data.json`，函数签名稳定 |
| 桥接层 | `server/dify-bridge.js` | 分区 ↔ Dify 知识库映射 + RAG 检索（当前 mock，签名对齐 Dify 官方） |

### 4.3 混合架构决策（重要）

- **结构化数据**（术语对照、功能清单等表格）+ **图片原图** → 由本后台 `store.js` 管理（未来落 MySQL）
- **文档向量化 + 语义检索** → 交给 Dify（RAG），本后台通过 `dify-bridge.js` 对接
- **Dify 存不了图片原图**，只能 OCR / 多模态 embedding / vision 描述转文本入库

### 4.4 RAG 接入三阶段路线

1. **现在**：`dify-bridge.js` 接口层（mock 实现，签名对齐 Dify 官方 REST API）
2. **下一步**：接 Dify 真实 API（路径 A，`USE_MOCK=false` 即切换）
3. **终态**：自建向量检索（路径 C：Qdrant + bge embedding）

---

## 5. 数据模型（server/data.json 结构）

```jsonc
{
  "datasets": [],      // 知识库
  "folders": [],       // 分区文件夹（可嵌套 parentId）
  "tables": [],        // 结构化数据表
  "documents": [],     // 文档元数据
  "images": [],        // 图片元数据
  "difyMappings": []   // 分区 ↔ Dify 知识库映射
}
```

### 核心实体字段

**Dataset（知识库）**
```ts
{ id: string, name: string, description: string, updatedAt: number }
```

**Folder（分区，支持子分区）**
```ts
{ id: string, datasetId: string, parentId: string | null, name: string }
```

**DataTable（结构化表格）**
```ts
{
  id: string, datasetId: string, folderId: string | null,
  name: string, description: string,
  columns: Array<{ key: string, label: string, type: 'text' | 'number' }>,
  rows: Array<{ id: string, [key: string]: string | number }>
}
```

**ImageItem（图片）**
```ts
{
  id: string, datasetId: string, folderId: string | null,
  name: string, file: string,       // file 是 media/ 下的磁盘文件名（如 "img_xxx.png"）
  mime: string, size: number, width: number, height: number, updatedAt: number
}
```

**DifyMapping（分区 ↔ Dify 知识库映射）**
```ts
{
  folderId: string, difyDatasetId: string, datasetName: string,
  status: 'ready', syncedAt: number
}
```

---

## 6. API 接口

> 前端统一走相对路径 `/api/...`，`vite.config.ts` 代理到 `localhost:3001`；生产模式同端口直连。

### 树与资源
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/tree` | 获取知识库 + 分区树 |
| GET | `/api/datasets/:datasetId/resources?folderId=` | 获取某分区的资源（tables/documents/images） |
| GET | `/api/health` | 健康检查 |

### 知识库
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/datasets` | 创建知识库 |
| PATCH | `/api/datasets/:id` | 更新知识库 |
| DELETE | `/api/datasets/:id` | 删除知识库（连带清理分区与映射） |

### 分区
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/folders` | 创建分区（支持 parentId 嵌套） |
| PATCH | `/api/folders/:id` | 更新分区 |
| DELETE | `/api/folders/:id` | 删除分区（递归删除后代分区） |

### 数据表
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/tables` | 创建数据表 |
| GET | `/api/tables/:id` | 获取数据表 |
| PATCH | `/api/tables/:id` | 更新数据表 |
| DELETE | `/api/tables/:id` | 删除数据表 |
| POST | `/api/tables/:id/rows` | 添加行 |
| PATCH | `/api/tables/:id/rows/:rowId` | 更新行 |
| DELETE | `/api/tables/:id/rows/:rowId` | 删除行 |
| POST | `/api/tables/:id/columns` | 添加列 |
| PATCH | `/api/tables/:id/columns/:key` | 更新列 |

### 图片
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/images` | 上传图片（multipart，手写字节解析，见 §8） |
| DELETE | `/api/images/:id` | 删除图片（连带删除磁盘文件） |
| GET | `/media/:file` | 静态访问图片原图 |

### Dify RAG 桥接
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/dify/status` | 桥接层状态 |
| GET | `/api/dify/mappings` | 列出所有映射 |
| POST | `/api/dify/folders/:folderId/dataset` | 为分区创建/确保 Dify 知识库 |
| POST | `/api/dify/documents` | 文档入库（folderId + name + text） |
| POST | `/api/dify/retrieval` | 语义检索（folderId + query + topK） |

---

## 7. 命令与运行

```bash
# 开发模式（前端 5173 + 后端 3001，HMR）
npm run dev:all

# 仅后端
npm run dev:server

# 仅前端
npm run dev

# 生产模式（单端口 3001 托管前端 + API + 图片，需先 build）
npm run build && npm start

# 生成示例图片
npm run gen:media

# 打包自包含演示目录到 release/
npm run package
```

**打包演示**（给其他设备演示用）：
```bash
npm run build && npm run package
cd release/dify-kb-demo && npm install --omit=dev && npm start
# 访问 http://localhost:3001
```

---

## 8. 关键实现细节与踩坑记录

### 8.1 图片中文文件名乱码（已修复，重要）

**问题**：上传中文文件名图片后，`name` 字段变成乱码（如 `æµè¯ä¸æå¾ç.png`）。

**根因**：Node 的 HTTP 解析层 + multer/busboy 都会把 multipart header 里的非 ASCII 字节先按 **latin1** 解码成字符串，再处理，导致 UTF-8 字节被**二次编码**（每个原始字节 `0xHH` 变成 `0xc3 0xHH` 或 `0xc2 0xHH`）。

**修复方案**：绕开所有高级 multipart 库，**手写纯字节 multipart 解析器**（`server/index.js` 的 `uploadImage`/`processUpload`）：
1. 把 `req` 完整 body 拼成 buffer
2. 按字节 `Buffer.indexOf` 找 `Content-Disposition` 行
3. 定位 `filename="` 字节位置，`subarray` 取出字节后 `.toString('utf8')` 解码

**关键**：全程用字节操作，不让中间环节把 header 当 latin1 字符串处理。

### 8.2 `wrap` 错误处理支持 async

`server/index.js` 的 `wrap` 函数必须支持 Promise（`async` 路由），否则 async 返回的 Promise 会被错误地 `res.json`。

### 8.3 前端 `http` 函数 FormData 排除 Content-Type

上传图片时 `api.ts` 的 `http` 函数必须**不加** `Content-Type`（让浏览器自动带 boundary），否则 FormData 序列化会出错。

### 8.4 Mermaid 深色架构图渲染

- `docs/architecture.mmd` 需带 **UTF-8 BOM**，否则 mmdc 渲染中文乱码
- mmdc 在 Windows 上需用 `mmdc.cmd`（PowerShell 禁止 `.ps1`），且用 `-p puppeteer-config.json` 指定 Edge 浏览器（缺 chrome-headless-shell）
- puppeteer config 字段是 `executablePath`（不是 `path`）

---

## 9. 种子演示数据

| 类型 | 内容 |
|---|---|
| 知识库 | 2 个（`产品知识库`、`技术文档库`） |
| 分区 | 5 个（术语与规范、产品文档、API 文档、架构设计、微服务「架构设计子分区」） |
| 数据表 | 3 个（术语对照表 zh/en/abbr/note、产品功能清单 module/feature/status/owner、接口清单 method/path/desc） |
| 文档 | 4 个（pdf/md，status completed/indexing） |
| 图片 | 若干示例 PNG（arch-blue / flow-green / ui-purple / photo-coral 等） |
| Dify 映射 | f_arch（架构设计）、f_terms（术语与规范） |

---

## 10. 后续增强方向（未实施）

- [ ] MySQL 落地（替换 `store.js` 内部为 `mysql2` 连接池，签名不变）
- [ ] 接 Dify 真实 RAG API（`USE_MOCK=false`）
- [ ] 图片右键重命名 / 移动分区 / 拖拽上传 / 按分区批量导出
- [ ] OpenAPI 文档（`openapi.json`）
- [ ] 文档真实解析与分段（chunk → embedding → 向量检索）

---

## 11. 相关归档文档

> 历史总结/计划/踩坑文档统一归档在 `docs/history/`，根目录不再散落总结文档。

- `docs/history/Dify桥接层与架构图_20260819.md` — RAG 桥接层设计 + 架构图渲染
- `docs/history/Dify知识库v03_图片与打包_20260819.md` — 图片展示 + 本地打包演示
- `docs/history/DONE_全链路打通_20260821.md` — 阶段 1~4 全链路打通结论
- `docs/history/PLAN_优化与PPT链路接入_20260821.md` — v0.2 优化与对外 API 开放计划

---

*文档生成时间：2026-08-19。项目路径：`C:\Users\Rick\Desktop\dify-kb-app`。*
