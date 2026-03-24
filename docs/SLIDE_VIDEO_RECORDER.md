# Excalidraw 幻灯片 + 视频录制功能设计方案

## 功能概述

在 Excalidraw 插件基础上增加幻灯片演示和视频录制功能，支持：

1. **幻灯片管理** - 无限新建幻灯片，自动命名 Slide-N
2. **视频录制** - 录制画布 + 摄像头画中画 + 音频
3. **提示词功能** - 录制时隐藏的讲解提示词
4. **键盘导航** - 左右方向键切换幻灯片

## UI 设计

### 1. 幻灯片管理面板（右侧中间）

```
┌─────────────────────────┐
│        幻灯片           │
├─────────────────────────┤
│  ┌───┐ ┌───┐ ┌───┐     │
│  │ 1 │ │ 2 │ │ 3 │ ...  │
│  └───┘ └───┘ └───┘     │
├─────────────────────────┤
│         [+]             │  ← 新建幻灯片按钮
└─────────────────────────┘
```

### 2. 视频录制面板（右上角）

```
┌─────────────────────────┐
│ [⚙] [📝] [⏺ 录制] [⏹] │
│ 配置 提示词   录制   停止 │
└─────────────────────────┘
```

### 3. 提示词浮动框（录制时隐藏）

```
┌─────────────────────────┐
│ 提示词              [×] │
├─────────────────────────┤
│                         │
│  在此输入讲解内容...    │
│                         │
│                         │
└─────────────────────────┘
```

## 技术实现

### 核心模块

```
src/view/components/
├── SlideManager/
│   ├── SlideManager.tsx      # 幻灯片管理组件
│   ├── SlideManager.css      # 样式
│   └── SlideManager.types.ts # 类型定义
├── VideoRecorder/
│   ├── VideoRecorderCore.ts  # 录制核心逻辑
│   ├── VideoRecorderPanel.tsx # 录制控制面板
│   ├── Teleprompter.tsx      # 提示词组件
│   ├── VideoRecorder.css     # 样式
│   └── index.ts              # 导出
└── index.ts                  # 统一导出
```

### 关键实现点

#### 1. 幻灯片创建

```typescript
// 使用 Excalidraw 的 Frame 元素作为幻灯片底框
const frameElement = {
  type: 'frame',
  id: `slide-${slideNumber}`,
  x: (slideNumber - 1) * 1200, // 横向排列
  y: 0,
  width: 1000,
  height: 600,
  name: `Slide ${slideNumber}`,
  backgroundColor: '#ffffff',
  strokeColor: '#cccccc',
};
```

#### 2. 视频录制

```typescript
// 核心流程
1. 获取 Canvas 流: canvas.captureStream(30)
2. 获取摄像头流: navigator.mediaDevices.getUserMedia({ video: true })
3. 获取音频流: navigator.mediaDevices.getUserMedia({ audio: true })
4. 创建离屏 Canvas 合成画面
5. 画中画: 主画布 + 摄像头（右下角圆角）
6. 使用 MediaRecorder 录制合成后的流
```

#### 3. 键盘导航

```typescript
// 监听键盘事件
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') {
    switchToSlide(currentSlide - 1);
  } else if (e.key === 'ArrowRight') {
    switchToSlide(currentSlide + 1);
  }
});
```

## 文件结构

```
src/
├── view/
│   ├── components/
│   │   ├── SlideManager.tsx      # 幻灯片管理
│   │   ├── VideoRecorder/
│   │   │   ├── VideoRecorderCore.ts   # 录制核心
│   │   │   ├── VideoRecorderPanel.tsx # 录制面板
│   │   │   └── Teleprompter.tsx       # 提示词
│   │   └── index.ts
│   └── ExcalidrawView.ts       # 主视图（需修改）
├── core/
│   └── main.ts                 # 插件入口（需修改）
└── styles/
    └── video-recorder.css      # 样式文件
```

## 修改清单

### 1. ExcalidrawView.ts

添加幻灯片管理和录制组件的挂载：

```typescript
// 在视图初始化时
private slideManager: SlideManager;
private videoRecorder: VideoRecorderPanel;

onload() {
  // ... 现有代码
  
  // 添加幻灯片管理面板
  this.addSlideManager();
  
  // 添加视频录制面板
  this.addVideoRecorderPanel();
}
```

### 2. main.ts

添加命令和设置：

```typescript
// 添加命令
this.addCommand({
  id: 'create-new-slide',
  name: '新建幻灯片',
  callback: () => this.createNewSlide(),
});

this.addCommand({
  id: 'start-recording',
  name: '开始录制',
  callback: () => this.startRecording(),
});
```

### 3. package.json

添加依赖（如果需要）：

```json
{
  "dependencies": {
    // 现有依赖...
    "lucide-react": "^0.x.x"  // 图标库（可选）
  }
}
```

## 功能流程

### 新建幻灯片流程

```
用户点击 [+] 按钮
    ↓
创建 Frame 元素（slide-N）
    ↓
添加到画布（横向排列）
    ↓
自动跳转到新幻灯片
    ↓
更新幻灯片列表面板
```

### 录制流程

```
用户点击 [录制] 按钮
    ↓
跳转到第一张幻灯片
    ↓
请求摄像头/麦克风权限
    ↓
获取 Canvas 流 + 摄像头流 + 音频流
    ↓
创建离屏 Canvas 合成画面
    ↓
开始录制（画中画效果）
    ↓
用户可暂停/继续/停止
    ↓
停止后保存视频到文件同目录
```

### 键盘导航流程

```
用户按 ← 键
    ↓
切换到上一张幻灯片
    ↓
画布滚动到对应 Frame
    ↓
更新当前幻灯片索引

用户按 → 键
    ↓
切换到下一张幻灯片
    ↓
画布滚动到对应 Frame
    ↓
更新当前幻灯片索引
```

## 视频输出

### 文件名格式

```
{白板文件名}_录制_{时间戳}.webm

例如：
- 白板文件：MyPresentation.excalidraw.md
- 视频文件：MyPresentation.excalidraw_录制_20240323_152030.webm
```

### 保存位置

视频保存到白板文件的同目录下。

## 技术难点

### 1. 性能优化

- 使用 `requestAnimationFrame` 优化合成循环
- 录制时降低画布渲染质量（可选）
- 使用离屏 Canvas 减少主线程负担

### 2. 浏览器兼容性

- 检测 `MediaRecorder` 支持
- 提供降级方案（仅录制画布，无摄像头）
- 处理不同浏览器的 MIME 类型

### 3. 权限处理

- 首次使用请求摄像头/麦克风权限
- 权限被拒绝时友好提示
- 提供设置入口重新申请权限

## 后续扩展

1. **视频编辑** - 剪辑、添加字幕
2. **导出格式** - MP4、GIF
3. **直播功能** - 实时推流
4. **AI 辅助** - 自动生成讲解词
5. **协作录制** - 多人同时录制

## 参考资源

- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [Canvas Capture Stream](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream)
- [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [Excalidraw Frame Element](https://docs.excalidraw.com/docs/codebase/overview)
