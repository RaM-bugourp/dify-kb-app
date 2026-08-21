// 前端数据类型定义

export interface Dataset {
  id: string
  name: string
  description: string
  updatedAt: number
}

export interface Folder {
  id: string
  datasetId: string
  parentId: string | null
  name: string
}

export interface TreeNode extends Folder {
  children: TreeNode[]
}

export interface TreeData {
  datasets: Dataset[]
  folders: Folder[]
}

export interface Column {
  key: string
  label: string
  type: 'text' | 'number'
}

export interface Row {
  id: string
  [key: string]: string | number
}

export interface DataTable {
  id: string
  datasetId: string
  folderId: string | null
  name: string
  description: string
  createdAt: number
  updatedAt: number
  columns: Column[]
  rows: Row[]
}

export interface DocItem {
  id: string
  datasetId: string
  folderId: string | null
  name: string
  type: string
  size: number
  updatedAt: number
  status: string
  file?: string | null
  mime?: string
  parsedText?: string
  difyDocId?: string | null
  error?: string
}

export interface ImageItem {
  id: string
  datasetId: string
  folderId: string | null
  name: string
  file: string
  mime: string
  size: number
  width: number
  height: number
  updatedAt: number
}

export interface Resources {
  tables: DataTable[]
  documents: DocItem[]
  images: ImageItem[]
}
