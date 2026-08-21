# Dify 知识库演示包

自包含演示包，数据（data.json）与图片（server/media/）已内置。

## 运行

```bash
npm install --omit=dev   # 安装运行时依赖（express/cors/multer）
npm start                # 启动，监听 http://localhost:3001
```

浏览器访问 http://localhost:3001 即可。

## 说明
- 单端口服务：前端页面 + /api 接口 + /media 图片均由 3001 端口提供
- 演示数据：server/data.json（知识库/分区/数据表/文档/图片元数据）
- 图片文件：server/media/*.png
- 上传的图片会写入 server/media/ 并记录到 data.json
- 数据为本地 JSON 存储，重启不丢失；删除 server/data.json 可恢复初始演示数据

## 重置演示数据
```bash
# 删除数据文件后重启，会自动重建初始演示数据
rm server/data.json   # Windows: del server\data.json
npm start
```
