# AGENTS.md

## 项目

Windows 本地摄影图库与排版工具。原图不搬迁，相册和作品只保存引用。

技术栈：Electron、React、TypeScript、electron-vite、SQLite、Konva、sharp、
exifr、chokidar、fontkit，测试使用 Vitest。

## 目录

```text
src/main/       Electron 主进程、SQLite、扫描、文件操作、字体、缩略图、导出
src/preload/    IPC 桥，向渲染进程暴露 window.albumApi
src/shared/     跨进程 API、类型和模板
src/renderer/   React 页面、Konva 编辑器、主题和交互
tests/          Vitest 单元与集成测试
docs/           设计和历史规格
out/            构建产物，不编辑、不提交
dist/           安装包产物，不编辑、不提交
release/        本地发布产物，不编辑、不提交
```

## 架构边界

- `src/main` 独占数据库、文件系统、扫描、删除、字体导入和导出。
- `src/renderer` 不直接访问 Node 或磁盘，只调用 `window.albumApi`。
- 跨进程接口必须同步更新 `src/shared`、`src/preload`、`src/main/ipc.ts` 和实现。
- 新增数据库结构必须通过 migration，不能依赖手工修改本地数据库。

## 核心规则

- 原图不得自动移动、重命名或删除；删除原图必须明确操作并进入系统回收站。
- 相同 SHA-256 内容合并为一个照片资产，多个相册和作品共享引用。
- 扫描保持增量：路径、文件大小和修改时间未变化时不得重新读取或哈希。
- 不提交 `out/`、`dist/`、`release/`、缓存和 `.tmp-*` 临时目录。

## 开发与提交

- 修改前先运行 `git status -sb`，不得覆盖未确认的现有改动。
- 每次改动完成后，都必须创建一个对应的 Git commit，以便后续追踪和回滚。
- 一个独立功能或修复对应一个 commit，不混入无关修改。
- commit message 使用 `feat: / fix: / docs: / test: / refactor: / chore:` 前缀。
- 只暂存明确的源码、测试和文档路径，不使用 `git add .`。
- 验证通过后提交，并自动推送到当前远程分支。
- 推送失败时保留本地 commit，并报告 commit hash、目标分支和未推送状态。
- 禁止未经明确要求执行 `git reset --hard`、`git clean -fd`、强制推送或改写已发布历史。
- 正式发布时才修改 `package.json` 版本号；安装包名称必须与版本一致。
- 是否创建 Git tag 由用户明确决定。

## 验证

- 每次改动后，都必须编写或更新相关测试，并在交付给用户前确保验证全部通过。
- 类型检查：`npm run typecheck`
- 自动化测试：`npm test`
- 生产构建：`npm run build`
- 安装包：`npm run package`

根据改动范围执行必要命令；每次交付至少说明验证结果和未覆盖风险。
