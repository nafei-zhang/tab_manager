# Tab Disaster Manager

智能标签页管理扩展（Manifest V3），适用于 Chrome / Edge / Firefox。

英文版本（默认）: [README.md](./README.md)

## 项目目标

当标签页数量增长后，常见问题通常是：

- 重复页面太多，清理成本高
- 标签来源分散，定位目标慢
- 频繁切任务后，很难恢复之前工作现场

Tab Disaster Manager 聚焦三件事：清理、查找、恢复。

## 主界面结构

弹窗已整理为 3 个主标签页：

1. Cleanup & Search
2. Domain Groups
3. Workspaces

这样可以在高密度功能下保持清晰结构，同时维持统一高度与滚动体验。

## 功能总览

### 1) 重复标签清理

- 支持规则化重复检测
- 可配置忽略项：
  - URL 参数（Query）
  - Hash
  - 协议（http/https）
  - `www`
- 一键清理重复项，保留最早原始标签

### 2) 域名分组（Domain Groups）

- 自动按域名聚合并支持展开/折叠
- 分组卡片显示标签数量与估算内存
- 分组内标签支持切换/关闭快捷操作
- 一键整理支持两种模式：
  - 未勾选 `Group organize`：按域名排序，保持传统整理行为
  - 勾选 `Group organize`：使用 Chrome 原生标签组按域名分组
  - 原生标签组标题使用域名

### 3) 搜索与快捷操作

- 搜索模式：普通匹配 / 模糊匹配 / 正则匹配
- 对标题与 URL 命中结果进行高亮
- 每条结果支持：
  - 切换到该标签
  - 关闭该标签

### 4) 工作区管理（Workspaces）

- 保存当前标签集合为工作区
- 支持工作区卡片展开/折叠
- 在工作区上使用 `+` 一键加入当前焦点页
- 支持逐条移除记录（仅从工作区移除，不关闭已打开页面）
- 支持工作区 JSON 导入/导出
- 恢复支持两种模式：
  - 未勾选 `Group open`：普通方式恢复标签
  - 勾选 `Group open`：恢复后自动放入 Chrome 原生标签组
  - 原生标签组标题使用工作区名称

## 界面与体验更新

- 优化 Windows Chrome 下滚动条样式
- 调整弹窗间距与布局一致性
- Domain Groups 与 Workspaces 面板支持自适应高度与内部滚动
- 重绘扩展图标（16/32/48/128）以提升识别度与精细感

## 安装与运行

### 本地开发

```bash
npm install
npm test
```

### 浏览器加载

- Chrome / Edge：
  - 打开 `chrome://extensions` 或 `edge://extensions`
  - 开启开发者模式
  - 选择“加载已解压的扩展程序”
  - 指向项目根目录
- Firefox：
  - 打开 `about:debugging#/runtime/this-firefox`
  - 临时载入附加组件
  - 选择项目内 `manifest.json`

## 项目结构

```text
manifest.json
src/
  assets/
    icons/
  background.js
  content-script.js
  core/
    tab-manager.js
    url-utils.js
    workspace-store.js
  popup/
    popup.html
    popup.css
    popup.js
tests/
docs/
```

## 技术实现要点

- 基于原生 JavaScript（ES Modules）
- Popup 负责交互界面，Background 负责调度与状态操作
- 使用 `storage.local` 持久化工作区与规则
- 通过 `browser ?? chrome` 实现多浏览器 API 兼容
- 与原生标签组相关功能依赖 `tabs` 与 `tabGroups` 权限
- 使用单元测试覆盖核心逻辑（分组、URL 处理、工作区存储）

## 文档导航

- [安装指南 / Installation Guide](./docs/install.md)
- [用户手册 / User Guide](./docs/user-guide.md)
- [性能报告 / Performance Report](./docs/performance-report.md)

## 已知说明

- Firefox 临时加载方式在浏览器重启后需要重新加载
- 某些系统页（如 `chrome://`）标签在浏览器 API 下可操作能力有限
- 原生标签组能力依赖浏览器支持与扩展权限
