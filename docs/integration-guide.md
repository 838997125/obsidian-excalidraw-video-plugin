# Excalidraw 幻灯片录制功能集成指南

> **文档版本**: 1.0  
> **最后更新**: 2026-03-23  
> **任务ID**: ZYQ-001  
> **编制部门**: 尚书省（汇总协调）  

---

## 一、项目概述

本指南汇总四部开发的 Excalidraw 幻灯片录制功能产出，提供完整的集成说明。

### 功能特性
1. **幻灯片管理** - 无限新建幻灯片，自动命名 Slide-N
2. **视频录制** - 录制画布 + 摄像头画中画 + 音频
3. **提示词功能** - 录制时隐藏的讲解提示词（PromptOverlay）
4. **键盘导航** - 左右方向键切换幻灯片

---

## 二、集成清单

### 2.1 新建文件列表

| 序号 | 文件路径 | 文件类型 | 作用说明 |
|------|----------|----------|----------|
| 1 | `src/view/components/SlideManager.tsx` | React组件 | 幻灯片管理组件（根导出文件） |
| 2 | `src/view/components/SlideManager/SlideManager.tsx` | React组件 | 幻灯片管理核心组件 |
| 3 | `src/view/components/SlideManager/index.tsx` | 导出文件 | SlideManager模块统一导出 |
| 4 | `src/view/components/VideoRecorder/index.tsx` | React组件 | 视频录制容器组件 |
| 5 | `src/view/components/VideoRecorder/VideoRecorderCore.ts` | TypeScript类 | 视频录制核心逻辑类 |
| 6 | `src/view/components/VideoRecorder/VideoRecorderPanel.tsx` | React组件 | 录制控制面板UI |
| 7 | `src/view/components/VideoRecorder/PromptOverlay.tsx` | React组件 | 提示词浮动框组件 |
| 8 | `src/view/components/VideoRecorder/styles.css` | CSS样式 | 录制功能样式文件 |
| 9 | `docs/SLIDE_VIDEO_RECORDER.md` | 文档 | 功能设计方案文档 |

### 2.2 需修改的现有文件

| 序号 | 文件路径 | 修改内容 |
|------|----------|----------|
| 1 | `src/view/ExcalidrawView.ts` | 集成 SlideManager 和 VideoRecorder 组件 |
| 2 | `src/core/main.ts` | 注册录制相关命令 |
| 3 | `styles.css` | 导入 VideoRecorder 样式 |

---

## 三、文件结构说明

### 3.1 组件目录结构

```
src/view/components/
├── SlideManager/
│   ├── SlideManager.tsx      # 幻灯片管理核心组件
│   └── index.tsx             # 统一导出
├── VideoRecorder/
│   ├── VideoRecorderCore.ts  # 录制核心逻辑
│   ├── VideoRecorderPanel.tsx # 录制控制面板
│   ├── PromptOverlay.tsx     # 提示词浮动框
│   ├── styles.css            # 组件样式
│   └── index.tsx             # 容器组件（集成入口）
└── SlideManager.tsx          # 根目录导出文件
```

### 3.2 核心组件说明

#### SlideManager.tsx
- **功能**: 管理幻灯片列表、创建新幻灯片、切换幻灯片
- **关键特性**:
  - 从 Frame 元素自动识别幻灯片
  - 横向排列新幻灯片
  - 支持键盘导航（← → 键）
  - 幻灯片删除功能

#### VideoRecorderCore.ts
- **功能**: 视频录制核心逻辑
- **关键特性**:
  - Canvas 流捕获
  - 摄像头画中画合成
  - 音频录制
  - 暂停/继续功能
  - 离屏 Canvas 合成

#### VideoRecorderPanel.tsx
- **功能**: 录制控制面板UI
- **按钮**: 配置、提示词、录制/暂停/停止

#### PromptOverlay.tsx
- **功能**: 可拖拽的提示词浮动框
- **特性**: 多提示词管理、拖拽定位、录制时隐藏

---

## 四、集成步骤

### 4.1 在 ExcalidrawView.ts 中集成 SlideManager

#### 步骤 1: 导入组件

在 `ExcalidrawView.ts` 文件顶部添加导入：

```typescript
import * as React from "react";
import * as ReactDOM from "react-dom";
import { SlideManager } from "./components/SlideManager";
import { VideoRecorderContainer } from "./components/VideoRecorder";
```

#### 步骤 2: 添加组件引用

在 `ExcalidrawView` 类中添加成员变量：

```typescript
export default class ExcalidrawView extends TextFileView {
  // ... 现有代码 ...
  
  private slideManagerContainer: HTMLElement | null = null;
  private videoRecorderContainer: HTMLElement | null = null;
  private currentSlideIndex: number = 0;
}
```

#### 步骤 3: 初始化组件

在 `onload()` 或初始化方法中添加：

```typescript
async onload() {
  // ... 现有初始化代码 ...
  
  // 等待 Excalidraw API 就绪后初始化组件
  this.initializeSlideManager();
  this.initializeVideoRecorder();
}

private initializeSlideManager() {
  // 创建容器
  this.slideManagerContainer = document.createElement('div');
  this.slideManagerContainer.className = 'slide-manager-container';
  
  // 添加到视图
  this.contentEl.appendChild(this.slideManagerContainer);
  
  // 渲染 React 组件（需要等待 excalidrawAPI 就绪）
  const renderSlideManager = () => {
    if (!this.excalidrawAPI || !this.slideManagerContainer) return;
    
    ReactDOM.render(
      React.createElement(SlideManager, {
        excalidrawAPI: this.excalidrawAPI,
        onSlideChange: (index) => {
          this.currentSlideIndex = index;
        }
      }),
      this.slideManagerContainer
    );
  };
  
  // 如果 API 已就绪直接渲染，否则等待
  if (this.excalidrawAPI) {
    renderSlideManager();
  } else {
    // 监听 API 就绪事件
    const checkAPI = setInterval(() => {
      if (this.excalidrawAPI) {
        clearInterval(checkAPI);
        renderSlideManager();
      }
    }, 100);
  }
}

private initializeVideoRecorder() {
  // 创建容器
  this.videoRecorderContainer = document.createElement('div');
  this.videoRecorderContainer.className = 'video-recorder-container';
  
  // 添加到视图
  this.contentEl.appendChild(this.videoRecorderContainer);
  
  // 渲染录制组件
  const renderVideoRecorder = () => {
    if (!this.excalidrawAPI || !this.file || !this.videoRecorderContainer) return;
    
    ReactDOM.render(
      React.createElement(VideoRecorderContainer, {
        excalidrawAPI: this.excalidrawAPI,
        file: this.file
      }),
      this.videoRecorderContainer
    );
  };
  
  if (this.excalidrawAPI && this.file) {
    renderVideoRecorder();
  } else {
    const checkReady = setInterval(() => {
      if (this.excalidrawAPI && this.file) {
        clearInterval(checkReady);
        renderVideoRecorder();
      }
    }, 100);
  }
}
```

#### 步骤 4: 清理组件

在 `onunload()` 方法中添加清理：

```typescript
onunload() {
  // ... 现有清理代码 ...
  
  // 卸载 React 组件
  if (this.slideManagerContainer) {
    ReactDOM.unmountComponentAtNode(this.slideManagerContainer);
    this.slideManagerContainer.remove();
  }
  
  if (this.videoRecorderContainer) {
    ReactDOM.unmountComponentAtNode(this.videoRecorderContainer);
    this.videoRecorderContainer.remove();
  }
}
```

### 4.2 在 main.ts 中注册命令

#### 步骤 1: 添加命令

在 `main.ts` 的 `onload()` 方法中添加：

```typescript
async onload() {
  // ... 现有代码 ...
  
  // 幻灯片相关命令
  this.addCommand({
    id: 'excalidraw-create-slide',
    name: 'Create New Slide',
    checkCallback: (checking: boolean) => {
      const view = this.app.workspace.getActiveViewOfType(ExcalidrawView);
      if (!view) return false;
      if (!checking) {
        // 触发创建幻灯片逻辑
        view.createNewSlide?.();
      }
      return true;
    }
  });
  
  // 录制相关命令
  this.addCommand({
    id: 'excalidraw-start-recording',
    name: 'Start Video Recording',
    checkCallback: (checking: boolean) => {
      const view = this.app.workspace.getActiveViewOfType(ExcalidrawView);
      if (!view) return false;
      if (!checking) {
        view.startRecording?.();
      }
      return true;
    }
  });
  
  this.addCommand({
    id: 'excalidraw-stop-recording',
    name: 'Stop Video Recording',
    checkCallback: (checking: boolean) => {
      const view = this.app.workspace.getActiveViewOfType(ExcalidrawView);
      if (!view) return false;
      if (!checking) {
        view.stopRecording?.();
      }
      return true;
    }
  });
}
```

#### 步骤 2: 在 ExcalidrawView.ts 中实现命令方法

```typescript
export default class ExcalidrawView extends TextFileView {
  // ... 现有代码 ...
  
  public createNewSlide() {
    // 触发 SlideManager 的创建幻灯片方法
    // 可以通过事件或回调实现
    const event = new CustomEvent('excalidraw:create-slide');
    window.dispatchEvent(event);
  }
  
  public startRecording() {
    const event = new CustomEvent('excalidraw:start-recording');
    window.dispatchEvent(event);
  }
  
  public stopRecording() {
    const event = new CustomEvent('excalidraw:stop-recording');
    window.dispatchEvent(event);
  }
}
```

### 4.3 添加样式导入

#### 方案 A: 在 styles.css 中导入（推荐）

在 `styles.css` 文件末尾添加：

```css
/* Slide Manager & Video Recorder Styles */
@import url('./src/view/components/VideoRecorder/styles.css');
```

#### 方案 B: 在 ExcalidrawView.ts 中动态加载

```typescript
private loadStyles() {
  const styleEl = document.createElement('style');
  styleEl.id = 'excalidraw-recorder-styles';
  
  // 读取并注入 CSS 内容
  const cssPath = this.plugin.manifest.dir + '/src/view/components/VideoRecorder/styles.css';
  // 使用 Obsidian 的适配器读取文件
  this.app.vault.adapter.read(cssPath).then(css => {
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  });
}
```

#### 方案 C: 在 main.ts 中注册样式

```typescript
async