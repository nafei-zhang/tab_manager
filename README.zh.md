# Tab Disaster Manager

智能标签页管理扩展（Manifest V3），适用于 Chrome / Edge / Firefox。

英文版本（默认）: [README.md](./README.md)

## 项目定位

当浏览器标签页数量快速增长时，常见痛点是：

- 重复页面过多，难以清理
- 标签来源分散，难以定位
- 临时任务切换频繁，难以回到之前工作现场

Tab Disaster Manager 的核心目标是让你在高标签量场景下，依然能快速“整理、查找、恢复”。

## 功能总览

### 1) 重复标签清理

- 支持规则化重复检测
- 可配置忽略项：
  - URL 参数（Query）
  - Hash
  - 协议（http/https）
  - `www`
- 一键清理重复项，保留最早原始标签

### 2) 域名分组与排序

- 自动按域名聚合标签
- 分组支持展开/折叠
- 显示每组标签数量与估算内存
- 支持一键按域名整理，结果直接生效到浏览器标签栏顺序

### 3) 搜索定位与快捷操作

- 搜索模式：
  - 普通匹配
  - 模糊匹配
  - 正则匹配
- 结果高亮，便于快速识别
- 每条结果提供快捷操作：
  - 切换到该标签
  - 关闭该标签

### 4) 工作区管理

- 保存当前标签集合为工作区
- 支持恢复全部或恢复选中项
- 支持导入/导出 JSON
- 支持逐条管理记录：
  - 打开单条记录
  - 仅从工作区列表移除记录（不关闭已打开网页）
- 支持一键将当前焦点页面添加到指定工作区

## 典型使用流程

### 流程 A：先清理再继续工作

1. 打开扩展弹窗
2. 先执行重复清理
3. 再执行域名一键整理
4. 使用搜索快速跳转到目标标签

### 流程 B：临时任务快照

1. 当前任务开始前点击“保存当前”为工作区
2. 中途切到其他任务
3. 返回时在工作区中恢复选中记录继续

### 流程 C：知识收集

1. 浏览过程中遇到有价值页面
2. 在对应工作区点击 `+` 添加当前焦点页
3. 后续统一恢复或导出归档

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
- 使用单元测试覆盖核心逻辑（分组、URL 处理、工作区存储）

## 文档导航

- [安装指南 / Installation Guide](./docs/install.md)
- [用户手册 / User Guide](./docs/user-guide.md)
- [性能报告 / Performance Report](./docs/performance-report.md)

## 已知说明

- Firefox 临时加载方式在浏览器重启后需要重新加载
- 浏览器对扩展弹窗尺寸存在上限，不同浏览器显示可能略有差异
- 某些系统页（如 `chrome://`）标签在浏览器 API 下可操作能力有限

## 路线建议

- 增加当前窗口/全部窗口的整理范围切换
- 增加工作区重命名、拖拽排序、去重策略增强
- 增加快捷键支持与命令面板集成
