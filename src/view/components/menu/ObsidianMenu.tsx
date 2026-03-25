import { AppState, ExcalidrawImperativeAPI } from "@zsviczian/excalidraw/types/excalidraw/types";
import clsx from "clsx";
import { Notice, TFile } from "obsidian";
import * as React from "react";
import { DEVICE } from "src/constants/constants";
import { PenSettingsModal } from "src/shared/Dialogs/PenSettingsModal";
import ExcalidrawView from "src/view/ExcalidrawView";
import { PenStyle } from "src/types/penTypes";
import { PENS } from "src/utils/pens";
import ExcalidrawPlugin from "../../../core/main";
import { ICONS, penIcon, stringToSVG } from "../../../constants/actionIcons";
import { UniversalInsertFileModal } from "src/shared/Dialogs/UniversalInsertFileModal";
import { t } from "src/lang/helpers";
import { getExcalidrawViews } from "src/utils/obsidianUtils";
import { CaptureUpdateAction } from "src/constants/constants";

export function setPen (pen: PenStyle, api: any) {
  const st = api.getAppState();
  api.updateScene({
    appState: {
      currentStrokeOptions: pen.penOptions,
      ...(!pen.strokeWidth || (pen.strokeWidth === 0)) ? null : {currentItemStrokeWidth: pen.strokeWidth},
      ...pen.backgroundColor ? {currentItemBackgroundColor: pen.backgroundColor} : null,
      ...pen.strokeColor ? {currentItemStrokeColor: pen.strokeColor} : null,
      ...pen.fillStyle === "" ? null : {currentItemFillStyle: pen.fillStyle},
      ...(pen.roughness !== null) ? {currentItemRoughness: pen.roughness} : null,
      ...pen.freedrawOnly && !st.resetCustomPen //switching from custom pen to next custom pen
        ? {
          resetCustomPen: {
            currentItemStrokeWidth:     st.currentItemStrokeWidth,
            currentItemBackgroundColor: st.currentItemBackgroundColor,
            currentItemStrokeColor:     st.currentItemStrokeColor,
            currentItemFillStyle:       st.currentItemFillStyle,
            currentItemRoughness:       st.currentItemRoughness,
          }} 
        : null,
    },
    captureUpdate: CaptureUpdateAction.NEVER,
  })
}

export function resetStrokeOptions (resetCustomPen:any, api: ExcalidrawImperativeAPI, clearCurrentStrokeOptions: boolean) {
  api.updateScene({
    appState: {
      ...resetCustomPen ? {
        currentItemStrokeWidth:     resetCustomPen.currentItemStrokeWidth,
        currentItemBackgroundColor: resetCustomPen.currentItemBackgroundColor,
        currentItemStrokeColor:     resetCustomPen.currentItemStrokeColor,
        currentItemFillStyle:       resetCustomPen.currentItemFillStyle,
        currentItemRoughness:       resetCustomPen.currentItemRoughness,
      }: null,
      resetCustomPen: null,
      ...clearCurrentStrokeOptions ? {currentStrokeOptions: null} : null,
    },
    captureUpdate: CaptureUpdateAction.NEVER
  });
}

export class ObsidianMenu {
  private clickTimestamp:number[];
  private activePen: PenStyle;
  private longpressTimeout : { [key: number]: number } = {};
  private prevClickTimestamp: number = 0;
  
  // 录制相关
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private audioStream: MediaStream | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private isRecording: boolean = false;
  private isPaused: boolean = false;
  private recordingDuration: number = 0;
  
  // 录制设置
  private recordingSettings = {
    cameraEnabled: false,
    cameraShape: 'rounded' as 'rounded' | 'circle' | 'square',
    cameraSize: 200,
    aspectRatio: '16:9' as string,
    customWidth: 1920,
    customHeight: 1080,
  };
  
  // 提词器
  private teleprompterElement: HTMLDivElement | null = null;
  private teleprompterSettings = {
    text: '',
    scrollSpeed: 2,
    opacity: 0.9,
    width: 400,
    height: 200,
    x: 100,
    y: 100,
    isScrolling: false,
  };
  private teleprompterScrollInterval: ReturnType<typeof setInterval> | null = null;
  private isTeleprompterDragging: boolean = false;
  private isTeleprompterResizing: boolean = false;
  private teleprompterDragStart: { x: number; y: number } = { x: 0, y: 0 };
  
  // 幻灯片/画框管理
  private slidesPanel: HTMLDivElement | null = null;
  private slides: Array<{ id: string; name: string; viewState: any }> = [];
  private currentSlideIndex: number = 0;
  private slidesListElement: HTMLDivElement | null = null;
  private slidesBasePosition: { x: number; y: number } | null = null; // 画框布局基准点
  
  // 摄像头预览
  private cameraStream: MediaStream | null = null;
  private isCameraEnabled: boolean = false;
  private isCameraVisible: boolean = false;
  private cameraPosition: { x: number; y: number; width: number; height: number } = {
    x: 0,
    y: 0,
    width: 200,
    height: 150,
  };
  private isDragging: boolean = false;
  private dragStartPos: { x: number; y: number } = { x: 0, y: 0 };
  private cameraElement: HTMLDivElement | null = null;
  private _recordingBoundaryElement: HTMLDivElement | null = null; // 录制边界框
  private _settingsModal: HTMLDivElement | null = null; // 设置面板
  
  constructor(
    private plugin: ExcalidrawPlugin,
    private toolsRef: React.MutableRefObject<any>,
    private view: ExcalidrawView,
  ) {
    this.clickTimestamp = Array.from({length: Object.keys(PENS).length}, () => 0);
    // 预加载摄像头
    this.preloadCamera();
  }

  // 预加载摄像头流
  private async preloadCamera() {
    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, frameRate: 15 },
        audio: false,
      });
    } catch (e) {
      console.warn('摄像头预加载失败:', e);
    }
  }

  private actionCustomPenLabelClick(index: number, pen: PenStyle) {
    const now = Date.now();
    const dblClick = now-this.clickTimestamp[index] < 500;
    //open pen settings on double click
    if(dblClick) {
      const penSettings = new PenSettingsModal(this.plugin,this.view,index);
      (async () => {
        await this.plugin.loadSettings();
        penSettings.open();
      })();
      return;
    }
    this.clickTimestamp[index] = now;
    
    const api = this.view.excalidrawAPI;
    const st = api.getAppState();

    //single second click to reset freedraw to default
    if(st.currentStrokeOptions === pen.penOptions && st.activeTool.type === "freedraw") {
      resetStrokeOptions(st.resetCustomPen, api, true);
      return;
    }

    //apply pen settings to canvas
    this.activePen = {...pen};
    setPen(pen,api);
    api.setActiveTool({type:"freedraw"});
  }

  private actionScriptButtonPonterUp(index: number, key: string) {
    if(this.longpressTimeout[index]) {
      this.view.ownerWindow.clearTimeout(this.longpressTimeout[index]);
      this.longpressTimeout[index] = 0;
      (async ()=>{
        const f = this.view.app.vault.getAbstractFileByPath(key);
        if (f && f instanceof TFile) {
          this.plugin.scriptEngine.executeScript(
            this.view,
            await this.view.app.vault.read(f),
            this.plugin.scriptEngine.getScriptName(f),
            f
          );
        }
      })()
    }
  }

  private actionScriptButtonPointerDown(index: number, key: string) {
    const now = Date.now();
    if(this.longpressTimeout[index]>0) {
      this.view.ownerWindow.clearTimeout(this.longpressTimeout[index]);
      this.longpressTimeout[index] = 0;
    }
    if(now-this.prevClickTimestamp >= 500) {
      this.longpressTimeout[index] = this.view.ownerWindow.setTimeout(
        () => {
          this.longpressTimeout[index] = 0;
          (async () =>{
            await this.plugin.loadSettings();
            const index = this.plugin.settings.pinnedScripts.indexOf(key)
            if(index > -1) {
              this.plugin.settings.pinnedScripts.splice(index,1);
              this.view.excalidrawAPI?.setToast({message:`Pin removed: ${name}`, duration: 3000, closable: true});
            } 
            await this.plugin.saveSettings();
            getExcalidrawViews(this.plugin.app).forEach(excalidrawView=>excalidrawView.updatePinnedScripts());
          })()
        },
        1500
      )
    }
    this.prevClickTimestamp = now;
  }

  private actionShowHideMenu (isMobile: boolean, appState: AppState) {
    this.toolsRef.current.setTheme(appState.theme);
    this.toolsRef.current.toggleVisibility(
      appState.zenModeEnabled || isMobile,
    );
  }

  private actionInsertAnyFile() {
    this.view.setCurrentPositionToCenter();
    const insertFileModal = new UniversalInsertFileModal(this.plugin, this.view);
    insertFileModal.open();
  }

  private actionToggleFullscreen() {
    if (this.view.isFullscreen()) {
      this.view.exitFullscreen();
    } else {
      this.view.gotoFullscreen();
    }
    this.view.excalidrawAPI?.updateScene({
      appState: {},
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }

  // ================== 录制功能 ==================
  
  private getSupportedMimeType(): string {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return 'video/webm';
  }

  private formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // 初始化摄像头
  private async initCamera() {
    if (this.cameraStream) return this.cameraStream;
    
    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, frameRate: 15 },
        audio: false,
      });
      return this.cameraStream;
    } catch (e) {
      console.warn('无法获取摄像头:', e);
      new Notice('无法获取摄像头，请检查权限');
      return null;
    }
  }

  // 切换摄像头显示（不停止流，只是隐藏/显示）
  private async toggleCamera() {
    // 如果还没有摄像头流，先初始化
    if (!this.cameraStream) {
      const stream = await this.initCamera();
      if (!stream) {
        // 初始化失败
        return;
      }
    }
    
    this.isCameraEnabled = !this.isCameraEnabled;
    
    if (this.isCameraEnabled) {
      // 开启摄像头预览（使用 DOM 方法，立即显示）
      this.createCameraPreviewDOM();
    } else {
      // 关闭摄像头预览
      this.removeCameraPreviewDOM();
    }
    
    // 更新按钮状态
    this.view.excalidrawAPI?.updateScene({
      appState: {},
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }

  private async startRecording() {
    const api = this.view.excalidrawAPI;
    const file = this.view.file;
    if (!api || !file) {
      new Notice('无法开始录制');
      return;
    }

    try {
      // 获取 Excalidraw 画布
      const sourceCanvas = document.querySelector('.excalidraw__canvas') as HTMLCanvasElement 
        || document.querySelector('canvas') as HTMLCanvasElement;
      if (!sourceCanvas) {
        new Notice('未找到画布');
        return;
      }

      // 获取摄像头（如果启用）
      if (this.recordingSettings.cameraEnabled && !this.cameraStream) {
        await this.initCamera();
      }

      // 获取麦克风
      try {
        this.audioStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
      } catch (e) {
        console.warn('无法获取麦克风:', e);
      }

      // 获取设置的分辨率
      const resolution = this.getResolutionFromRatio(this.recordingSettings.aspectRatio);
      
      // 创建离屏 Canvas 用于合成
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = resolution.width;
      offscreenCanvas.height = resolution.height;
      const offscreenCtx = offscreenCanvas.getContext('2d');
      
      if (!offscreenCtx) {
        new Notice('无法创建画布上下文');
        return;
      }

      // 保存引用
      this._recordingCanvas = offscreenCanvas;
      this._recordingCtx = offscreenCtx;
      this._sourceCanvas = sourceCanvas;
      this._recordingResolution = resolution;

      // 设置录制状态
      this.isRecording = true;
      this.isPaused = false;
      this.recordingDuration = 0;
      
      // 更新摄像头预览状态（显示录制中）
      this.updateCameraPreviewState();

      // 合成循环
      const compose = () => {
        if (!this.isRecording || this.isPaused) {
          if (this.isRecording) {
            // 暂停时继续请求动画帧
            requestAnimationFrame(compose);
          }
          return;
        }

        // 清空画布
        offscreenCtx.fillStyle = '#ffffff';
        offscreenCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

        // 计算缩放比例，保持比例填充
        const scaleX = offscreenCanvas.width / sourceCanvas.width;
        const scaleY = offscreenCanvas.height / sourceCanvas.height;
        const scale = Math.min(scaleX, scaleY);
        const drawWidth = sourceCanvas.width * scale;
        const drawHeight = sourceCanvas.height * scale;
        const drawX = (offscreenCanvas.width - drawWidth) / 2;
        const drawY = (offscreenCanvas.height - drawHeight) / 2;

        // 绘制源画布内容（居中）
        try {
          offscreenCtx.drawImage(sourceCanvas, drawX, drawY, drawWidth, drawHeight);
        } catch (e) {
          // 忽略绘制错误
        }

        // 绘制摄像头画中画（使用 DOM 中的视频元素）
        if (this.recordingSettings.cameraEnabled && this._cameraVideoElement && this._cameraVideoElement.readyState >= 2) {
          try {
            // 使用设置中的摄像头大小
            const camSize = this.recordingSettings.cameraSize;
            const camX = offscreenCanvas.width - camSize - 20;
            const camY = offscreenCanvas.height - camSize - 20;
            
            // 根据形状绘制
            offscreenCtx.save();
            
            if (this.recordingSettings.cameraShape === 'circle') {
              // 圆形
              offscreenCtx.beginPath();
              offscreenCtx.arc(camX + camSize / 2, camY + camSize / 2, camSize / 2, 0, Math.PI * 2);
              offscreenCtx.clip();
            } else if (this.recordingSettings.cameraShape === 'rounded') {
              // 圆角方形
              offscreenCtx.beginPath();
              offscreenCtx.roundRect(camX, camY, camSize, camSize, 12);
              offscreenCtx.clip();
            }
            // square 不需要 clip

            // 绘制摄像头视频
            offscreenCtx.drawImage(this._cameraVideoElement, camX, camY, camSize, camSize);

            // 绘制边框
            offscreenCtx.strokeStyle = this.isRecording ? '#ef4444' : 'rgba(255,255,255,0.8)';
            offscreenCtx.lineWidth = 2;
            
            if (this.recordingSettings.cameraShape === 'circle') {
              offscreenCtx.beginPath();
              offscreenCtx.arc(camX + camSize / 2, camY + camSize / 2, camSize / 2 - 1, 0, Math.PI * 2);
              offscreenCtx.stroke();
            } else {
              offscreenCtx.strokeRect(camX, camY, camSize, camSize);
            }

            offscreenCtx.restore();
          } catch (e) {
            // 忽略摄像头绘制错误
          }
        }

        requestAnimationFrame(compose);
      };

      // 开始合成
      compose();

      // 从离屏 Canvas 创建流
      const canvasStream = offscreenCanvas.captureStream(30);
      const tracks = [...canvasStream.getVideoTracks()];
      if (this.audioStream) {
        tracks.push(...this.audioStream.getAudioTracks());
      }
      const combinedStream = new MediaStream(tracks);

      // 创建录制器
      this.mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: this.getSupportedMimeType(),
        videoBitsPerSecond: 4000000,
      });

      this.recordedChunks = [];
      
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.onerror = (e) => {
        console.error('录制错误:', e);
        new Notice('录制出错');
        this.cleanupRecording();
      };

      this.mediaRecorder.start(500); // 每500ms收集一次数据

      // 计时器
      this.timerInterval = setInterval(() => {
        this.recordingDuration++;
        this.view.excalidrawAPI?.updateScene({
          appState: {},
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }, 1000);

      new Notice('开始录制');

    } catch (error) {
      console.error('录制失败:', error);
      new Notice('开始录制失败: ' + (error as Error).message);
      this.cleanupRecording();
    }
  }

  // 存储录制相关的引用
  private _recordingCanvas: HTMLCanvasElement | null = null;
  private _recordingCtx: CanvasRenderingContext2D | null = null;
  private _sourceCanvas: HTMLCanvasElement | null = null;
  private _recordingResolution: { width: number; height: number } = { width: 1920, height: 1080 };

  // 暂停/继续录制
  private togglePauseRecording() {
    if (!this.mediaRecorder || !this.isRecording) return;
    
    if (this.isPaused) {
      // 继续
      this.mediaRecorder.resume();
      this.isPaused = false;
      // 恢复计时
      this.timerInterval = setInterval(() => {
        this.recordingDuration++;
        this.view.excalidrawAPI?.updateScene({
          appState: {},
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }, 1000);
      new Notice('继续录制');
    } else {
      // 暂停
      this.mediaRecorder.pause();
      this.isPaused = true;
      // 暂停计时
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      new Notice('已暂停');
    }
    
    // 更新UI
    this.view.excalidrawAPI?.updateScene({
      appState: {},
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }

  private async stopRecording() {
    if (!this.mediaRecorder) return;

    // 如果暂停中，先恢复
    if (this.isPaused) {
      this.mediaRecorder.resume();
      this.isPaused = false;
    }

    // 停止计时
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    new Notice('正在保存视频...');

    // 使用 Promise 等待录制停止
    return new Promise<void>((resolve) => {
      if (!this.mediaRecorder) {
        resolve();
        return;
      }

      this.mediaRecorder.onstop = async () => {
        // 保存视频
        await this.saveRecording();
        
        this.isRecording = false;
        this.isPaused = false;
        this.recordingDuration = 0;
        
        // 更新摄像头预览状态
        this.updateCameraPreviewState();
        
        this.view.excalidrawAPI?.updateScene({
          appState: {},
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        
        resolve();
      };

      this.mediaRecorder.stop();
    });
  }

  private cleanupRecording() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(t => t.stop());
      this.audioStream = null;
    }
    this.mediaRecorder = null;
    this._recordingCanvas = null;
    this._recordingCtx = null;
    this._sourceCanvas = null;
    this.recordedChunks = [];
  }

  private cleanupCamera() {
    // 移除摄像头预览 DOM
    this.removeCameraPreviewDOM();
    
    // 隐藏录制边界框
    this.hideRecordingBoundary();
    
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
      this.cameraStream = null;
    }
    this.isCameraEnabled = false;
  }

  private async saveRecording() {
    const file = this.view.file;
    
    if (!file) {
      new Notice('无法保存：文件不存在');
      return;
    }
    
    if (this.recordedChunks.length === 0) {
      new Notice('无法保存：没有录制数据');
      return;
    }

    try {
      const mimeType = this.getSupportedMimeType();
      const blob = new Blob(this.recordedChunks, { type: mimeType });
      
      if (blob.size === 0) {
        new Notice('无法保存：视频数据为空');
        return;
      }
      
      const arrayBuffer = await blob.arrayBuffer();
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const videoFileName = `${file.basename}_录制_${timestamp}.webm`;
      const videoPath = file.parent?.path 
        ? `${file.parent.path}/${videoFileName}`
        : videoFileName;

      await file.vault.adapter.writeBinary(videoPath, arrayBuffer);
      new Notice(`视频已保存: ${videoFileName}`);
    } catch (error) {
      console.error('保存视频失败:', error);
      new Notice('保存视频失败: ' + (error as Error).message);
    }

    this.recordedChunks = [];
  }

  private async toggleRecording() {
    if (this.isRecording) {
      new Notice('正在停止录制...');
      await this.stopRecording();
      this.cleanupRecording();
    } else {
      await this.startRecording();
    }
  }

  // ================== 结束录制功能 ==================

  // 根据比例计算宽高
  private getResolutionFromRatio(ratio: string, baseWidth?: number): { width: number; height: number } {
    const base = baseWidth || 1920;
    switch (ratio) {
      case '16:9': return { width: base, height: Math.round(base * 9 / 16) };
      case '4:3': return { width: base, height: Math.round(base * 3 / 4) };
      case '3:4': return { width: Math.round(base * 3 / 4), height: base };
      case '9:16': return { width: Math.round(base * 9 / 16), height: base };
      case '1:1': return { width: base, height: base };
      case 'custom': return { width: this.recordingSettings.customWidth, height: this.recordingSettings.customHeight };
      default: return { width: 1920, height: 1080 };
    }
  }

  // 打开设置面板
  private openSettingsModal() {
    // 如果已存在，先关闭
    if (this._settingsModal) {
      this.closeSettingsModal();
      return;
    }
    
    const modal = document.createElement('div');
    modal.id = 'recording-settings-modal';
    modal.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 720px;
      max-height: 85vh;
      background: var(--background-primary, #1a1a2e);
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
      z-index: 9999;
      display: flex;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      border: 1px solid rgba(255,255,255,0.1);
    `;
    
    // 左侧预览区
    const previewSection = document.createElement('div');
    previewSection.style.cssText = `
      width: 300px;
      padding: 24px;
      background: linear-gradient(180deg, #16213e 0%, #0f0f23 100%);
      border-right: 1px solid rgba(255,255,255,0.08);
      display: flex;
      flex-direction: column;
      align-items: center;
    `;
    
    const previewTitle = document.createElement('div');
    previewTitle.style.cssText = `
      color: var(--text-normal, #fff);
      font-weight: 600;
      margin-bottom: 20px;
      font-size: 15px;
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    previewTitle.innerHTML = '<span style="font-size: 18px;">📺</span> 实时预览';
    previewSection.appendChild(previewTitle);
    
    // 预览画布容器
    const previewContainer = document.createElement('div');
    previewContainer.id = 'recording-preview-container';
    previewContainer.style.cssText = `
      position: relative;
      background: #0d1b2a;
      border: 2px solid rgba(59, 130, 246, 0.3);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    `;
    previewSection.appendChild(previewContainer);
    
    // 预览信息
    const previewInfo = document.createElement('div');
    previewInfo.id = 'recording-preview-info';
    previewInfo.style.cssText = `
      color: var(--text-muted, #888);
      font-size: 12px;
      margin-top: 16px;
      text-align: center;
      padding: 12px;
      background: rgba(0,0,0,0.2);
      border-radius: 8px;
      width: 100%;
    `;
    previewSection.appendChild(previewInfo);
    
    modal.appendChild(previewSection);
    
    // 右侧设置区
    const settingsSection = document.createElement('div');
    settingsSection.style.cssText = `
      flex: 1;
      padding: 24px;
      overflow-y: auto;
      background: var(--background-primary, #1a1a2e);
    `;
    
    // 标题栏
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    `;
    header.innerHTML = `
      <h3 style="margin: 0; color: var(--text-normal, #fff); font-size: 18px; display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 22px;">🎬</span> 屏幕录制设置
      </h3>
      <button id="close-settings-btn" style="background: rgba(255,255,255,0.1); border: none; color: var(--text-muted, #888); font-size: 20px; cursor: pointer; padding: 6px 12px; border-radius: 8px; transition: all 0.2s;">×</button>
    `;
    settingsSection.appendChild(header);
    
    // 摄像头设置
    const cameraSection = this.createSettingsSection('📷 摄像头设置');
    
    // 摄像头开关
    const cameraToggle = this.createToggleRow('开启摄像头', this.recordingSettings.cameraEnabled, (checked) => {
      this.recordingSettings.cameraEnabled = checked;
      this.updatePreview();
    });
    cameraSection.appendChild(cameraToggle);
    
    // 摄像头形状
    const shapeRow = document.createElement('div');
    shapeRow.style.cssText = `margin-top: 16px;`;
    shapeRow.innerHTML = `
      <label style="color: var(--text-normal, #fff); font-size: 13px; display: block; margin-bottom: 8px; font-weight: 500;">摄像头形状</label>
      <div style="display: flex; gap: 8px;">
        <button class="shape-btn rounded" data-shape="rounded" style="flex:1; padding: 10px; border-radius: 8px; border: 2px solid ${this.recordingSettings.cameraShape === 'rounded' ? '#3b82f6' : 'rgba(255,255,255,0.2)'}; background: ${this.recordingSettings.cameraShape === 'rounded' ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)'}; color: var(--text-normal, #fff); cursor: pointer; font-size: 12px; transition: all 0.2s;">圆角方形</button>
        <button class="shape-btn circle" data-shape="circle" style="flex:1; padding: 10px; border-radius: 50px; border: 2px solid ${this.recordingSettings.cameraShape === 'circle' ? '#3b82f6' : 'rgba(255,255,255,0.2)'}; background: ${this.recordingSettings.cameraShape === 'circle' ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)'}; color: var(--text-normal, #fff); cursor: pointer; font-size: 12px; transition: all 0.2s;">圆形</button>
        <button class="shape-btn square" data-shape="square" style="flex:1; padding: 10px; border-radius: 4px; border: 2px solid ${this.recordingSettings.cameraShape === 'square' ? '#3b82f6' : 'rgba(255,255,255,0.2)'}; background: ${this.recordingSettings.cameraShape === 'square' ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)'}; color: var(--text-normal, #fff); cursor: pointer; font-size: 12px; transition: all 0.2s;">方形</button>
      </div>
    `;
    cameraSection.appendChild(shapeRow);
    
    // 摄像头大小滑块
    const sizeRow = document.createElement('div');
    sizeRow.style.cssText = `margin-top: 16px;`;
    sizeRow.innerHTML = `
      <label style="color: var(--text-normal, #fff); font-size: 13px; display: flex; justify-content: space-between; font-weight: 500;">
        <span>摄像头大小</span>
        <span id="camera-size-value" style="color: #60a5fa; font-weight: 600;">${this.recordingSettings.cameraSize}px</span>
      </label>
      <input type="range" id="camera-size-slider" min="100" max="300" value="${this.recordingSettings.cameraSize}" style="width: 100%; margin-top: 8px; accent-color: #3b82f6; height: 6px;" />
      <div style="display: flex; justify-content: space-between; color: var(--text-muted, #888); font-size: 11px; margin-top: 4px;">
        <span>100px</span>
        <span>300px</span>
      </div>
    `;
    cameraSection.appendChild(sizeRow);
    
    settingsSection.appendChild(cameraSection);
    
    // 画面比例设置
    const ratioSection = this.createSettingsSection('📐 画面比例');
    
    const ratioOptions = ['16:9', '4:3', '3:4', '9:16', '1:1', 'custom'];
    const ratioLabels: Record<string, string> = {
      '16:9': '16:9',
      '4:3': '4:3',
      '3:4': '3:4',
      '9:16': '9:16',
      '1:1': '1:1',
      'custom': '自定义',
    };
    
    const ratioGrid = document.createElement('div');
    ratioGrid.style.cssText = `display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;`;
    
    ratioOptions.forEach(ratio => {
      const btn = document.createElement('button');
      btn.className = 'ratio-btn';
      btn.dataset.ratio = ratio;
      btn.textContent = ratioLabels[ratio];
      btn.style.cssText = `
        padding: 12px 8px;
        border-radius: 8px;
        border: 2px solid ${this.recordingSettings.aspectRatio === ratio ? '#3b82f6' : 'rgba(255,255,255,0.2)'};
        background: ${this.recordingSettings.aspectRatio === ratio ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)'};
        color: var(--text-normal, #fff);
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.2s;
      `;
      ratioGrid.appendChild(btn);
    });
    
    ratioSection.appendChild(ratioGrid);
    
    // 自定义尺寸输入
    const customSizeRow = document.createElement('div');
    customSizeRow.id = 'custom-size-row';
    customSizeRow.style.cssText = `margin-top: 16px; display: ${this.recordingSettings.aspectRatio === 'custom' ? 'flex' : 'none'}; gap: 12px; align-items: center;`;
    customSizeRow.innerHTML = `
      <div style="flex: 1;">
        <label style="color: var(--text-muted, #888); font-size: 12px; display: block; margin-bottom: 4px;">宽度</label>
        <input type="number" id="custom-width" value="${this.recordingSettings.customWidth}" min="640" max="3840" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: var(--text-normal, #fff); font-size: 14px;" />
      </div>
      <div style="padding-top: 24px; color: var(--text-muted, #888); font-size: 18px;">×</div>
      <div style="flex: 1;">
        <label style="color: var(--text-muted, #888); font-size: 12px; display: block; margin-bottom: 4px;">高度</label>
        <input type="number" id="custom-height" value="${this.recordingSettings.customHeight}" min="480" max="2160" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: var(--text-normal, #fff); font-size: 14px;" />
      </div>
    `;
    ratioSection.appendChild(customSizeRow);
    
    settingsSection.appendChild(ratioSection);
    
    // 底部按钮
    const footer = document.createElement('div');
    footer.style.cssText = `margin-top: 24px; display: flex; justify-content: flex-end; gap: 12px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);`;
    footer.innerHTML = `
      <button id="settings-cancel-btn" style="padding: 12px 24px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: var(--text-normal, #fff); cursor: pointer; font-size: 14px; transition: all 0.2s;">取消</button>
      <button id="settings-save-btn" style="padding: 12px 24px; border-radius: 8px; border: none; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; cursor: pointer; font-weight: 600; font-size: 14px; box-shadow: 0 4px 12px rgba(59,130,246,0.3); transition: all 0.2s;">保存设置</button>
    `;
    settingsSection.appendChild(footer);
    
    modal.appendChild(settingsSection);
    
    // 遮罩层
    const overlay = document.createElement('div');
    overlay.id = 'recording-settings-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      z-index: 9998;
    `;
    
    document.body.appendChild(overlay);
    document.body.appendChild(modal);
    
    this._settingsModal = modal;
    
    // 绑定事件
    this.bindSettingsEvents(modal, overlay);
    
    // 初始化预览
    this.updatePreview();
  }
  
  private createSettingsSection(title: string): HTMLDivElement {
    const section = document.createElement('div');
    section.style.cssText = `
      background: rgba(255,255,255,0.03);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
      border: 1px solid rgba(255,255,255,0.08);
    `;
    
    const titleEl = document.createElement('div');
    titleEl.style.cssText = `color: var(--text-normal, #fff); font-weight: 600; margin-bottom: 16px; font-size: 14px;`;
    titleEl.textContent = title;
    section.appendChild(titleEl);
    
    return section;
  }
  
  private createToggleRow(label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = `display: flex; justify-content: space-between; align-items: center;`;
    
    const labelEl = document.createElement('span');
    labelEl.style.cssText = `color: var(--text-normal, #fff); font-size: 13px;`;
    labelEl.textContent = label;
    row.appendChild(labelEl);
    
    // 存储当前状态
    let currentChecked = checked;
    
    const toggle = document.createElement('div');
    toggle.style.cssText = `
      width: 44px;
      height: 24px;
      border-radius: 12px;
      background: ${currentChecked ? '#3b82f6' : '#444'};
      cursor: pointer;
      position: relative;
      transition: background 0.2s;
    `;
    
    const knob = document.createElement('div');
    knob.style.cssText = `
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: white;
      position: absolute;
      top: 2px;
      left: ${currentChecked ? '22px' : '2px'};
      transition: left 0.2s;
    `;
    toggle.appendChild(knob);
    
    toggle.addEventListener('click', () => {
      currentChecked = !currentChecked;
      toggle.style.background = currentChecked ? '#3b82f6' : '#444';
      knob.style.left = currentChecked ? '22px' : '2px';
      onChange(currentChecked);
    });
    
    row.appendChild(toggle);
    return row;
  }
  
  private bindSettingsEvents(modal: HTMLDivElement, overlay: HTMLDivElement) {
    // 关闭按钮
    const closeBtn = modal.querySelector('#close-settings-btn');
    closeBtn?.addEventListener('click', () => this.closeSettingsModal());
    overlay.addEventListener('click', () => this.closeSettingsModal());
    
    // 取消按钮
    const cancelBtn = modal.querySelector('#settings-cancel-btn');
    cancelBtn?.addEventListener('click', () => this.closeSettingsModal());
    
    // 保存按钮
    const saveBtn = modal.querySelector('#settings-save-btn');
    saveBtn?.addEventListener('click', () => {
      this.saveSettings();
      this.closeSettingsModal();
      new Notice('设置已保存');
    });
    
    // 形状按钮
    modal.querySelectorAll('.shape-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const shape = (e.currentTarget as HTMLElement).dataset.shape as any;
        this.recordingSettings.cameraShape = shape;
        this.updateShapeButtons();
        this.updatePreview();
      });
    });
    
    // 比例按钮
    modal.querySelectorAll('.ratio-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const ratio = (e.currentTarget as HTMLElement).dataset.ratio || '16:9';
        this.recordingSettings.aspectRatio = ratio;
        this.updateRatioButtons();
        this.updatePreview();
      });
    });
    
    // 摄像头大小滑块
    const sizeSlider = modal.querySelector('#camera-size-slider') as HTMLInputElement;
    const sizeValue = modal.querySelector('#camera-size-value');
    sizeSlider?.addEventListener('input', (e) => {
      const value = parseInt((e.target as HTMLInputElement).value);
      this.recordingSettings.cameraSize = value;
      if (sizeValue) sizeValue.textContent = `${value}px`;
      this.updatePreview();
    });
    
    // 自定义尺寸输入
    const customWidth = modal.querySelector('#custom-width') as HTMLInputElement;
    const customHeight = modal.querySelector('#custom-height') as HTMLInputElement;
    customWidth?.addEventListener('input', (e) => {
      this.recordingSettings.customWidth = parseInt((e.target as HTMLInputElement).value) || 1920;
      this.updatePreview();
    });
    customHeight?.addEventListener('input', (e) => {
      this.recordingSettings.customHeight = parseInt((e.target as HTMLInputElement).value) || 1080;
      this.updatePreview();
    });
  }
  
  private updateShapeButtons() {
    if (!this._settingsModal) return;
    this._settingsModal.querySelectorAll('.shape-btn').forEach(btn => {
      const el = btn as HTMLElement;
      const shape = el.dataset.shape;
      const isActive = this.recordingSettings.cameraShape === shape;
      el.style.borderColor = isActive ? '#3b82f6' : 'rgba(255,255,255,0.2)';
      el.style.background = isActive ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)';
    });
  }
  
  private updateRatioButtons() {
    if (!this._settingsModal) return;
    this._settingsModal.querySelectorAll('.ratio-btn').forEach(btn => {
      const el = btn as HTMLElement;
      const ratio = el.dataset.ratio;
      const isActive = this.recordingSettings.aspectRatio === ratio;
      el.style.borderColor = isActive ? '#3b82f6' : 'rgba(255,255,255,0.2)';
      el.style.background = isActive ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)';
    });
    
    // 显示/隐藏自定义尺寸输入
    const customRow = this._settingsModal.querySelector('#custom-size-row') as HTMLElement;
    if (customRow) {
      customRow.style.display = this.recordingSettings.aspectRatio === 'custom' ? 'flex' : 'none';
    }
  }
  
  private updatePreview() {
    if (!this._settingsModal) return;
    
    const container = this._settingsModal.querySelector('#recording-preview-container') as HTMLElement;
    const info = this._settingsModal.querySelector('#recording-preview-info') as HTMLElement;
    if (!container || !info) return;
    
    // 获取分辨率
    const resolution = this.getResolutionFromRatio(this.recordingSettings.aspectRatio);
    
    // 计算预览缩放比例（最大显示 220px 宽度，160px 高度）
    const maxPreviewWidth = 220;
    const maxPreviewHeight = 160;
    const scaleW = maxPreviewWidth / resolution.width;
    const scaleH = maxPreviewHeight / resolution.height;
    const scale = Math.min(scaleW, scaleH);
    const previewWidth = resolution.width * scale;
    const previewHeight = resolution.height * scale;
    
    container.style.width = `${previewWidth}px`;
    container.style.height = `${previewHeight}px`;
    container.style.borderRadius = '8px';
    container.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    
    // 清空容器
    container.innerHTML = '';
    
    // 绘制画布背景
    const canvas = document.createElement('canvas');
    canvas.width = previewWidth;
    canvas.height = previewHeight;
    canvas.style.borderRadius = '6px';
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // 渐变背景
      const gradient = ctx.createLinearGradient(0, 0, previewWidth, previewHeight);
      gradient.addColorStop(0, '#1e3a5f');
      gradient.addColorStop(1, '#0d1b2a');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, previewWidth, previewHeight);
      
      // 绘制网格
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 0.5;
      const gridSize = 15;
      for (let i = 0; i <= previewWidth; i += gridSize) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, previewHeight);
        ctx.stroke();
      }
      for (let i = 0; i <= previewHeight; i += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(previewWidth, i);
        ctx.stroke();
      }
      
      // 中心十字
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(previewWidth / 2, 0);
      ctx.lineTo(previewWidth / 2, previewHeight);
      ctx.moveTo(0, previewHeight / 2);
      ctx.lineTo(previewWidth, previewHeight / 2);
      ctx.stroke();
      
      // 画布图标
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = `${Math.max(16, 24 * scale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🎨', previewWidth / 2, previewHeight / 2 + 8);
    }
    container.appendChild(canvas);
    
    // 摄像头预览
    if (this.recordingSettings.cameraEnabled) {
      const camSize = Math.max(30, this.recordingSettings.cameraSize * scale);
      const camX = previewWidth - camSize - 8;
      const camY = previewHeight - camSize - 8;
      
      const camPreview = document.createElement('div');
      camPreview.style.cssText = `
        position: absolute;
        left: ${camX}px;
        top: ${camY}px;
        width: ${camSize}px;
        height: ${camSize}px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        border: 2px solid rgba(255,255,255,0.9);
        ${this.recordingSettings.cameraShape === 'circle' ? 'border-radius: 50%;' : 
          this.recordingSettings.cameraShape === 'rounded' ? 'border-radius: 6px;' : 'border-radius: 0;'}
      `;
      
      // 摄像头图标
      const camIcon = document.createElement('span');
      camIcon.style.cssText = `font-size: ${Math.max(12, camSize * 0.4)}px;`;
      camIcon.textContent = '📷';
      camPreview.appendChild(camIcon);
      
      container.appendChild(camPreview);
    }
    
    // 更新信息
    const ratioLabel = this.recordingSettings.aspectRatio === 'custom' ? '自定义' : this.recordingSettings.aspectRatio;
    const shapeLabel = this.recordingSettings.cameraShape === 'circle' ? '圆形' : 
                       this.recordingSettings.cameraShape === 'rounded' ? '圆角' : '方形';
    
    info.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 6px;">
        <span style="background: rgba(59,130,246,0.2); color: #60a5fa; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 500;">
          ${resolution.width} × ${resolution.height}
        </span>
        <span style="background: rgba(34,197,94,0.2); color: #4ade80; padding: 2px 8px; border-radius: 4px; font-size: 12px;">
          ${ratioLabel}
        </span>
      </div>
      ${this.recordingSettings.cameraEnabled ? `
        <div style="display: flex; align-items: center; justify-content: center; gap: 6px; color: var(--text-muted, #888); font-size: 11px;">
          <span>📷 ${this.recordingSettings.cameraSize}px</span>
          <span>•</span>
          <span>${shapeLabel}</span>
        </div>
      ` : ''}
    `;
  }
  
  private saveSettings() {
    // 同步摄像头状态
    this.isCameraEnabled = this.recordingSettings.cameraEnabled;
    
    // 更新摄像头大小
    this.cameraPosition.width = this.recordingSettings.cameraSize;
    this.cameraPosition.height = this.recordingSettings.cameraSize;
    
    // 如果摄像头开启，更新预览
    if (this.isCameraEnabled) {
      if (!this.cameraElement) {
        this.createCameraPreviewDOM();
      } else {
        // 更新现有预览
        this.updateCameraPreviewStyle();
      }
    } else {
      this.removeCameraPreviewDOM();
    }
    
    // 更新 UI
    this.view.excalidrawAPI?.updateScene({
      appState: {},
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }
  
  private updateCameraPreviewStyle() {
    if (!this.cameraElement) return;
    
    // 更新大小
    this.cameraElement.style.width = `${this.cameraPosition.width}px`;
    this.cameraElement.style.height = `${this.cameraPosition.height}px`;
    
    // 更新形状
    if (this.recordingSettings.cameraShape === 'circle') {
      this.cameraElement.style.borderRadius = '50%';
    } else if (this.recordingSettings.cameraShape === 'rounded') {
      this.cameraElement.style.borderRadius = '12px';
    } else {
      this.cameraElement.style.borderRadius = '0';
    }
  }
  
  private closeSettingsModal() {
    const modal = document.getElementById('recording-settings-modal');
    const overlay = document.getElementById('recording-settings-overlay');
    modal?.remove();
    overlay?.remove();
    this._settingsModal = null;
  }

  // ================== 摄像头预览 ==================

  // 获取白板画布的边界（实际录制区域）
  private getCanvasBounds(): { x: number; y: number; width: number; height: number } | null {
    // 获取 Excalidraw 的主容器
    const appContainer = document.querySelector('.excalidraw') as HTMLElement;
    if (!appContainer) {
      // 降级到 canvas
      const canvas = document.querySelector('.excalidraw__canvas') as HTMLCanvasElement 
        || document.querySelector('canvas') as HTMLCanvasElement;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    }
    
    const rect = appContainer.getBoundingClientRect();
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  // 初始化摄像头位置（右下角）
  private initCameraPosition() {
    const bounds = this.getCanvasBounds();
    if (bounds) {
      // 放在右下角，留一点边距
      this.cameraPosition.x = bounds.x + bounds.width - this.cameraPosition.width - 20;
      this.cameraPosition.y = bounds.y + bounds.height - this.cameraPosition.height - 20;
    } else {
      // 默认位置
      this.cameraPosition.x = window.innerWidth - this.cameraPosition.width - 40;
      this.cameraPosition.y = window.innerHeight - this.cameraPosition.height - 100;
    }
  }

  // 检查摄像头是否在录制边界内
  private isCameraWithinBounds(): boolean {
    const bounds = this.getCanvasBounds();
    if (!bounds) return true;
    
    const { x, y, width, height } = this.cameraPosition;
    
    // 检查摄像头是否完全在边界外
    const completelyOutside = 
      x + width < bounds.x || 
      x > bounds.x + bounds.width ||
      y + height < bounds.y ||
      y > bounds.y + bounds.height;
    
    return !completelyOutside;
  }

  // 创建录制边界框
  private showRecordingBoundary() {
    const bounds = this.getCanvasBounds();
    if (!bounds) return;
    
    // 如果已存在，先移除
    this.hideRecordingBoundary();
    
    const boundary = document.createElement('div');
    boundary.id = 'recording-boundary';
    boundary.style.cssText = `
      position: fixed;
      left: ${bounds.x}px;
      top: ${bounds.y}px;
      width: ${bounds.width}px;
      height: ${bounds.height}px;
      border: 3px dashed #3b82f6;
      border-radius: 8px;
      background: rgba(59, 130, 246, 0.05);
      pointer-events: none;
      z-index: 998;
      box-sizing: border-box;
    `;
    
    // 添加标签
    const label = document.createElement('div');
    label.style.cssText = `
      position: absolute;
      top: -24px;
      left: 50%;
      transform: translateX(-50%);
      background: #3b82f6;
      color: white;
      padding: 2px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    `;
    label.textContent = '📺 录制区域';
    boundary.appendChild(label);
    
    document.body.appendChild(boundary);
    this._recordingBoundaryElement = boundary;
  }

  // 隐藏录制边界框
  private hideRecordingBoundary() {
    if (this._recordingBoundaryElement) {
      this._recordingBoundaryElement.remove();
      this._recordingBoundaryElement = null;
    }
  }

  private setVideoSrcObject = (el: HTMLVideoElement | null): void => {
    if (el && this.cameraStream) {
      (el as any).srcObject = this.cameraStream;
      // 确保视频播放
      el.play().catch(() => {});
    }
  };

  // 创建独立的摄像头预览 DOM 元素（不依赖 React 渲染）
  private createCameraPreviewDOM() {
    // 如果已经存在，先移除
    this.removeCameraPreviewDOM();
    
    // 初始化位置（右下角）
    this.initCameraPosition();
    
    const container = document.createElement('div');
    container.className = 'camera-preview-container';
    container.style.cssText = `
      position: fixed;
      left: ${this.cameraPosition.x}px;
      top: ${this.cameraPosition.y}px;
      width: ${this.cameraPosition.width}px;
      height: ${this.cameraPosition.height}px;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      z-index: 999;
      background: #000;
      cursor: grab;
    `;
    
    // 标签
    const label = document.createElement('div');
    label.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      padding: 4px 8px;
      background: linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 100%);
      color: white;
      font-size: 11px;
      font-weight: 600;
      border-radius: 12px 12px 0 0;
      user-select: none;
      cursor: grab;
    `;
    label.textContent = '📷 摄像头';
    label.id = 'camera-label';
    container.appendChild(label);
    
    // 视频
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: cover;
      pointer-events: none;
    `;
    if (this.cameraStream) {
      video.srcObject = this.cameraStream;
    }
    container.appendChild(video);
    
    // 边框
    const border = document.createElement('div');
    border.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      border: 2px solid rgba(255,255,255,0.3);
      border-radius: 12px;
      pointer-events: none;
      box-sizing: border-box;
    `;
    border.id = 'camera-border';
    container.appendChild(border);
    
    // 拖拽事件
    container.addEventListener('mousedown', this.handleCameraMouseDownDOM);
    
    document.body.appendChild(container);
    this.cameraElement = container;
    this._cameraVideoElement = video;
    this._cameraLabelElement = label;
    this._cameraBorderElement = border;
  }
  
  private _cameraVideoElement: HTMLVideoElement | null = null;
  private _cameraLabelElement: HTMLDivElement | null = null;
  private _cameraBorderElement: HTMLDivElement | null = null;
  
  private removeCameraPreviewDOM() {
    if (this.cameraElement) {
      this.cameraElement.removeEventListener('mousedown', this.handleCameraMouseDownDOM);
      this.cameraElement.remove();
      this.cameraElement = null;
      this._cameraVideoElement = null;
      this._cameraLabelElement = null;
      this._cameraBorderElement = null;
    }
  }
  
  private handleCameraMouseDownDOM = (e: MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'VIDEO') return;
    
    this.isDragging = true;
    this.dragStartPos = { x: e.clientX - this.cameraPosition.x, y: e.clientY - this.cameraPosition.y };
    
    // 显示录制边界框
    this.showRecordingBoundary();
    
    const handleMouseMove = (e: MouseEvent) => {
      this.cameraPosition.x = e.clientX - this.dragStartPos.x;
      this.cameraPosition.y = e.clientY - this.dragStartPos.y;
      if (this.cameraElement) {
        this.cameraElement.style.left = `${this.cameraPosition.x}px`;
        this.cameraElement.style.top = `${this.cameraPosition.y}px`;
      }
      
      // 更新边界警告
      this.updateCameraBoundaryWarning();
    };
    
    const handleMouseUp = () => {
      this.isDragging = false;
      
      // 隐藏录制边界框
      this.hideRecordingBoundary();
      
      // 检查是否在边界内
      if (!this.isCameraWithinBounds()) {
        new Notice('⚠️ 摄像头未在白板录制界面中', 3000);
      }
      
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };
  
  // 更新摄像头边界警告样式
  private updateCameraBoundaryWarning() {
    if (!this._cameraBorderElement) return;
    
    const withinBounds = this.isCameraWithinBounds();
    
    if (withinBounds) {
      this._cameraBorderElement.style.borderColor = this.isRecording ? '#ef4444' : 'rgba(255,255,255,0.3)';
      this._cameraBorderElement.style.boxShadow = 'none';
    } else {
      // 超出边界，显示警告
      this._cameraBorderElement.style.borderColor = '#f59e0b';
      this._cameraBorderElement.style.boxShadow = '0 0 10px #f59e0b';
    }
  }
  
  // 更新摄像头预览状态（录制中等）
  private updateCameraPreviewState() {
    if (this._cameraLabelElement) {
      this._cameraLabelElement.textContent = this.isRecording ? '🔴 录制中' : '📷 摄像头';
    }
    if (this._cameraBorderElement) {
      this._cameraBorderElement.style.borderColor = this.isRecording ? '#ef4444' : 'rgba(255,255,255,0.3)';
    }
  }

  // ================== 提词器功能 ==================

  // 创建提词器
  private createTeleprompter() {
    if (this.teleprompterElement) {
      this.removeTeleprompter();
      return;
    }

    const container = document.createElement('div');
    container.id = 'teleprompter-container';
    container.style.cssText = `
      position: fixed;
      left: ${this.teleprompterSettings.x}px;
      top: ${this.teleprompterSettings.y}px;
      width: ${this.teleprompterSettings.width}px;
      height: ${this.teleprompterSettings.height}px;
      background: rgba(0, 0, 0, ${this.teleprompterSettings.opacity});
      border: 2px solid rgba(59, 130, 246, 0.5);
      border-radius: 12px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(8px);
      resize: both;
      min-width: 280px;
      min-height: 150px;
    `;

    // 标题栏
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: rgba(59, 130, 246, 0.2);
      cursor: move;
      user-select: none;
      flex-shrink: 0;
    `;
    header.innerHTML = `
      <span style="color: white; font-size: 12px; font-weight: 600;">📝 提词器</span>
      <div style="display: flex; gap: 6px; align-items: center;">
        <label style="color: rgba(255,255,255,0.7); font-size: 10px; display: flex; align-items: center; gap: 3px;">
          速度
          <input type="range" id="teleprompter-speed" min="0" max="10" value="${this.teleprompterSettings.scrollSpeed}" style="width: 50px; accent-color: #3b82f6; height: 4px;" />
        </label>
        <label style="color: rgba(255,255,255,0.7); font-size: 10px; display: flex; align-items: center; gap: 3px;">
          透明度
          <input type="range" id="teleprompter-opacity" min="20" max="100" value="${this.teleprompterSettings.opacity * 100}" style="width: 50px; accent-color: #3b82f6; height: 4px;" />
        </label>
        <button id="teleprompter-close" style="background: rgba(239,68,68,0.3); border: none; color: white; width: 20px; height: 20px; border-radius: 4px; cursor: pointer; font-size: 14px; line-height: 1;">×</button>
      </div>
    `;
    container.appendChild(header);

    // 文本区域
    const textarea = document.createElement('textarea');
    textarea.id = 'teleprompter-text';
    textarea.placeholder = '在此输入提示词文本...';
    textarea.value = this.teleprompterSettings.text;
    textarea.style.cssText = `
      flex: 1;
      width: 100%;
      padding: 16px;
      background: transparent;
      border: none;
      color: white;
      font-size: 18px;
      line-height: 1.8;
      resize: none;
      outline: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;
    container.appendChild(textarea);

    // 底部控制栏
    const controls = document.createElement('div');
    controls.style.cssText = `
      display: flex;
      justify-content: center;
      gap: 12px;
      padding: 8px 12px;
      background: rgba(0, 0, 0, 0.3);
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      flex-shrink: 0;
    `;
    
    // 启动/暂停按钮
    const startBtn = document.createElement('button');
    startBtn.id = 'teleprompter-start';
    startBtn.innerHTML = this.teleprompterSettings.isScrolling ? '⏸ 暂停' : '▶ 启动';
    startBtn.style.cssText = `
      padding: 6px 16px;
      border-radius: 6px;
      border: none;
      background: ${this.teleprompterSettings.isScrolling ? '#f59e0b' : '#22c55e'};
      color: white;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      transition: all 0.2s;
    `;
    controls.appendChild(startBtn);
    
    // 置顶按钮
    const topBtn = document.createElement('button');
    topBtn.id = 'teleprompter-top';
    topBtn.innerHTML = '⬆ 置顶';
    topBtn.style.cssText = `
      padding: 6px 16px;
      border-radius: 6px;
      border: none;
      background: #3b82f6;
      color: white;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      transition: all 0.2s;
    `;
    controls.appendChild(topBtn);
    
    container.appendChild(controls);

    // 调整大小的角标
    const resizeHandle = document.createElement('div');
    resizeHandle.style.cssText = `
      position: absolute;
      right: 0;
      bottom: 0;
      width: 16px;
      height: 16px;
      cursor: se-resize;
      background: linear-gradient(135deg, transparent 50%, rgba(59,130,246,0.5) 50%);
      border-radius: 0 0 10px 0;
    `;
    container.appendChild(resizeHandle);

    document.body.appendChild(container);
    this.teleprompterElement = container;

    // 绑定事件
    this.bindTeleprompterEvents(container, header, textarea, resizeHandle, startBtn, topBtn);
  }

  private bindTeleprompterEvents(
    container: HTMLDivElement,
    header: HTMLDivElement,
    textarea: HTMLTextAreaElement,
    resizeHandle: HTMLDivElement,
    startBtn: HTMLButtonElement,
    topBtn: HTMLButtonElement
  ) {
    // 拖动
    header.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'BUTTON') return;
      
      this.isTeleprompterDragging = true;
      this.teleprompterDragStart = {
        x: e.clientX - this.teleprompterSettings.x,
        y: e.clientY - this.teleprompterSettings.y,
      };
      
      const handleMove = (e: MouseEvent) => {
        if (!this.isTeleprompterDragging) return;
        
        this.teleprompterSettings.x = e.clientX - this.teleprompterDragStart.x;
        this.teleprompterSettings.y = e.clientY - this.teleprompterDragStart.y;
        container.style.left = `${this.teleprompterSettings.x}px`;
        container.style.top = `${this.teleprompterSettings.y}px`;
      };
      
      const handleUp = () => {
        this.isTeleprompterDragging = false;
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
      };
      
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    });

    // 调整大小
    resizeHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.isTeleprompterResizing = true;
      
      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = this.teleprompterSettings.width;
      const startHeight = this.teleprompterSettings.height;
      
      const handleMove = (e: MouseEvent) => {
        if (!this.isTeleprompterResizing) return;
        
        const newWidth = Math.max(200, startWidth + (e.clientX - startX));
        const newHeight = Math.max(100, startHeight + (e.clientY - startY));
        
        this.teleprompterSettings.width = newWidth;
        this.teleprompterSettings.height = newHeight;
        container.style.width = `${newWidth}px`;
        container.style.height = `${newHeight}px`;
      };
      
      const handleUp = () => {
        this.isTeleprompterResizing = false;
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
      };
      
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    });

    // 文本输入
    textarea.addEventListener('input', () => {
      this.teleprompterSettings.text = textarea.value;
    });

    // 速度调整
    const speedSlider = container.querySelector('#teleprompter-speed') as HTMLInputElement;
    speedSlider?.addEventListener('input', () => {
      this.teleprompterSettings.scrollSpeed = parseInt(speedSlider.value);
      if (this.teleprompterSettings.isScrolling) {
        this.startTeleprompterScroll(); // 重启滚动
      }
    });

    // 透明度调整
    const opacitySlider = container.querySelector('#teleprompter-opacity') as HTMLInputElement;
    opacitySlider?.addEventListener('input', () => {
      this.teleprompterSettings.opacity = parseInt(opacitySlider.value) / 100;
      container.style.background = `rgba(0, 0, 0, ${this.teleprompterSettings.opacity})`;
    });

    // 启动/暂停按钮
    startBtn.addEventListener('click', () => {
      this.teleprompterSettings.isScrolling = !this.teleprompterSettings.isScrolling;
      
      if (this.teleprompterSettings.isScrolling) {
        startBtn.innerHTML = '⏸ 暂停';
        startBtn.style.background = '#f59e0b';
        this.startTeleprompterScroll();
      } else {
        startBtn.innerHTML = '▶ 启动';
        startBtn.style.background = '#22c55e';
        this.stopTeleprompterScroll();
      }
    });

    // 置顶按钮
    topBtn.addEventListener('click', () => {
      textarea.scrollTop = 0;
    });

    // 关闭按钮
    const closeBtn = container.querySelector('#teleprompter-close');
    closeBtn?.addEventListener('click', () => {
      this.removeTeleprompter();
    });
  }

  // 开始滚动
  private startTeleprompterScroll() {
    // 清除之前的滚动
    this.stopTeleprompterScroll();

    const speed = this.teleprompterSettings.scrollSpeed;
    if (speed === 0) return; // 速度为0不滚动

    this.teleprompterScrollInterval = setInterval(() => {
      if (!this.teleprompterElement || !this.teleprompterSettings.isScrolling) return;
      
      const textarea = this.teleprompterElement.querySelector('#teleprompter-text') as HTMLTextAreaElement;
      if (!textarea) return;
      
      // 滚动文本
      textarea.scrollTop += speed * 0.5;
      
      // 如果滚动到底部，回到顶部
      if (textarea.scrollTop >= textarea.scrollHeight - textarea.clientHeight) {
        textarea.scrollTop = 0;
      }
    }, 50);
  }

  // 停止滚动
  private stopTeleprompterScroll() {
    if (this.teleprompterScrollInterval) {
      clearInterval(this.teleprompterScrollInterval);
      this.teleprompterScrollInterval = null;
    }
  }

  // 移除提词器
  private removeTeleprompter() {
    this.stopTeleprompterScroll();
    this.teleprompterSettings.isScrolling = false;
    
    if (this.teleprompterElement) {
      this.teleprompterElement.remove();
      this.teleprompterElement = null;
    }
  }

  // 切换提词器
  private toggleTeleprompter() {
    if (this.teleprompterElement) {
      this.removeTeleprompter();
    } else {
      this.createTeleprompter();
    }
  }

  // ================== 结束提词器功能 ==================

  // ================== 幻灯片管理功能 ==================

  // 获取画板容器边界
  private getExcalidrawBounds(): { left: number; top: number; width: number; height: number } {
    // 优先使用 Excalidraw 视图的方法
    const api = this.view.excalidrawAPI;
    if (api) {
      const appState = api.getAppState();
      // 使用 appState 中的宽高
      if (appState.width && appState.height) {
        // 找到 Excalidraw 容器
        const excalidrawEl = this.view.containerEl || document.querySelector('.excalidraw') as HTMLElement;
        if (excalidrawEl) {
          const rect = excalidrawEl.getBoundingClientRect();
          return {
            left: rect.left,
            top: rect.top,
            width: appState.width,
            height: appState.height,
          };
        }
      }
    }
    
    // 备选方案：直接查找容器
    const viewContent = this.view.containerEl;
    if (viewContent) {
      const rect = viewContent.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
    }
    
    // 降级到窗口
    return {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  // 更新画框面板位置
  private updateSlidesPanelPosition() {
    if (!this.slidesPanel) return;

    // 直接检查全屏状态
    const isFullscreen = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
    
    // 获取画板边界
    const bounds = this.getExcalidrawBounds();

    // 设置位置
    if (isFullscreen) {
      // 全屏时：最左侧
      this.slidesPanel.style.left = '0px';
      this.slidesPanel.style.top = `${window.innerHeight / 2}px`;
    } else {
      // 非全屏时：画板左侧
      this.slidesPanel.style.left = `${bounds.left}px`;
      this.slidesPanel.style.top = `${bounds.top + bounds.height / 2}px`;
    }
    
    console.log('面板位置更新:', { isFullscreen, left: this.slidesPanel.style.left, bounds });
  }

  // 创建幻灯片面板
  private createSlidesPanel() {
    if (this.slidesPanel) {
      this.removeSlidesPanel();
      return;
    }

    // 直接检查全屏状态
    const isFullscreen = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
    const bounds = this.getExcalidrawBounds();

    const panel = document.createElement('div');
    panel.id = 'slides-panel';
    panel.style.cssText = `
      position: fixed;
      left: ${isFullscreen ? 0 : bounds.left}px;
      top: ${isFullscreen ? window.innerHeight / 2 : bounds.top + bounds.height / 2}px;
      transform: translateY(-50%);
      width: 80px;
      background: rgba(30, 30, 40, 0.95);
      border-radius: 0 12px 12px 0;
      box-shadow: 4px 0 20px rgba(0, 0, 0, 0.3);
      z-index: 100;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 12px 8px;
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-left: none;
    `;

    // 标题
    const title = document.createElement('div');
    title.style.cssText = `
      color: white;
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 8px;
      text-align: center;
    `;
    title.textContent = '🎞 画框';
    panel.appendChild(title);

    // 画框列表容器
    const listContainer = document.createElement('div');
    listContainer.style.cssText = `
      flex: 1;
      width: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      max-height: 400px;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.3) transparent;
    `;
    listContainer.id = 'slides-list-container';
    
    // 画框列表
    const list = document.createElement('div');
    list.id = 'slides-list';
    list.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 100%;
    `;
    listContainer.appendChild(list);
    panel.appendChild(listContainer);
    
    this.slidesListElement = list;

    // 添加按钮
    const addBtn = document.createElement('button');
    addBtn.id = 'slide-add-btn';
    addBtn.innerHTML = '+';
    addBtn.style.cssText = `
      width: 48px;
      height: 32px;
      border-radius: 8px;
      border: 2px dashed rgba(59, 130, 246, 0.5);
      background: rgba(59, 130, 246, 0.1);
      color: #3b82f6;
      font-size: 18px;
      cursor: pointer;
      margin-top: 8px;
      transition: all 0.2s;
    `;
    addBtn.addEventListener('click', () => this.addSlide());
    addBtn.addEventListener('mouseenter', () => {
      addBtn.style.background = 'rgba(59, 130, 246, 0.2)';
    });
    addBtn.addEventListener('mouseleave', () => {
      addBtn.style.background = 'rgba(59, 130, 246, 0.1)';
    });
    panel.appendChild(addBtn);

    // 全部删除按钮
    const deleteAllBtn = document.createElement('button');
    deleteAllBtn.id = 'slide-delete-all-btn';
    deleteAllBtn.innerHTML = '🗑';
    deleteAllBtn.title = '删除所有画框';
    deleteAllBtn.style.cssText = `
      width: 48px;
      height: 28px;
      border-radius: 8px;
      border: 2px dashed rgba(239, 68, 68, 0.5);
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
      font-size: 14px;
      cursor: pointer;
      margin-top: 4px;
      transition: all 0.2s;
    `;
    deleteAllBtn.addEventListener('click', () => {
      if (this.slides.length > 0) {
        // 确认对话框
        if (confirm(`确定删除所有 ${this.slides.length} 个画框？`)) {
          this.deleteAllSlides();
        }
      } else {
        new Notice('没有画框可删除');
      }
    });
    deleteAllBtn.addEventListener('mouseenter', () => {
      deleteAllBtn.style.background = 'rgba(239, 68, 68, 0.2)';
    });
    deleteAllBtn.addEventListener('mouseleave', () => {
      deleteAllBtn.style.background = 'rgba(239, 68, 68, 0.1)';
    });
    panel.appendChild(deleteAllBtn);

    document.body.appendChild(panel);
    this.slidesPanel = panel;

    // 监听窗口大小变化，更新面板位置
    this._slidesPanelResizeHandler = () => this.updateSlidesPanelPosition();
    window.addEventListener('resize', this._slidesPanelResizeHandler);
    
    // 监听全屏变化（延迟执行确保状态更新）
    this._fullscreenChangeHandler = () => {
      setTimeout(() => this.updateSlidesPanelPosition(), 100);
    };
    document.addEventListener('fullscreenchange', this._fullscreenChangeHandler);
    document.addEventListener('webkitfullscreenchange', this._fullscreenChangeHandler);

    // 初始化：渲染画框列表（初始为空，不自动添加画框）
    console.log('createSlidesPanel: 初始化画框列表，当前画框数量:', this.slides.length);
    
    // 尝试从白板上恢复已存在的画框
    this.restoreSlidesFromCanvas();
    
    this.renderSlidesList();

    // 绑定键盘事件
    this.bindSlidesKeyboardEvents();
  }

  private _slidesPanelResizeHandler: (() => void) | null = null;
  private _fullscreenChangeHandler: (() => void) | null = null;

  // 从白板恢复已存在的画框
  private restoreSlidesFromCanvas() {
    const api = this.view?.excalidrawAPI;
    if (!api) return;
    
    // 如果已经有画框，不需要恢复
    if (this.slides.length > 0) return;
    
    try {
      const elements = api.getSceneElements();
      
      // 查找所有画框元素（ID 格式: slide_${timestamp}_frame）
      const frameElements = elements.filter((el: any) => 
        el.type === 'rectangle' && 
        el.id.startsWith('slide_') && 
        el.id.endsWith('_frame') &&
        el.strokeColor === '#3b82f6'
      );
      
      if (frameElements.length === 0) return;
      
      console.log('restoreSlidesFromCanvas: 找到', frameElements.length, '个画框元素');
      
      // 按照 ID 中的时间戳排序
      frameElements.sort((a: any, b: any) => {
        const timestampA = parseInt(a.id.split('_')[1]) || 0;
        const timestampB = parseInt(b.id.split('_')[1]) || 0;
        return timestampA - timestampB;
      });
      
      // 恢复画框信息
      frameElements.forEach((frame: any, index: number) => {
        const slide = {
          id: frame.id.replace('_frame', ''),
          name: `画框 ${index + 1}`,
          viewState: {
            frameX: frame.x,
            frameY: frame.y,
            frameWidth: frame.width,
            frameHeight: frame.height,
          },
          frameElementId: frame.id,
          created: true,
        };
        this.slides.push(slide);
      });
      
      console.log('restoreSlidesFromCanvas: 已恢复', this.slides.length, '个画框');
    } catch (e) {
      console.error('restoreSlidesFromCanvas: 恢复画框失败', e);
    }
  }

  // 添加画框
  private addSlide() {
    const api = this.view.excalidrawAPI;
    if (!api) {
      console.warn('无法获取 Excalidraw API');
      new Notice('无法获取 Excalidraw API');
      return;
    }

    // 获取当前视图状态
    const appState = api.getAppState();
    
    // 获取画板容器尺寸
    const bounds = this.getExcalidrawBounds();
    const viewportWidth = bounds.width;
    const viewportHeight = bounds.height;
    
    // 检查 scrollX 和 scrollY 是否有效
    let scrollX = appState.scrollX;
    let scrollY = appState.scrollY;
    if (!isFinite(scrollX) || isNaN(scrollX)) {
      console.warn('addSlide: scrollX 无效，使用默认值 0');
      scrollX = 0;
    }
    if (!isFinite(scrollY) || isNaN(scrollY)) {
      console.warn('addSlide: scrollY 无效，使用默认值 0');
      scrollY = 0;
    }
    
    console.log('画板边界:', bounds);
    console.log('视图状态:', { scrollX, scrollY, zoom: appState.zoom });
    
    // 创建画框元素
    const slideId = `slide_${Date.now()}`;
    const slideNumber = this.slides.length + 1;
    
    // 画框尺寸
    const frameWidth = 800;
    const frameHeight = 450;
    
    // 画框间距
    const gapX = 100; // 水平间距
    const gapY = 80;  // 垂直间距
    
    // 每行最多5个画框
    const framesPerRow = 5;
    
    // 计算行列位置（0-indexed）
    const colIndex = (slideNumber - 1) % framesPerRow;
    const rowIndex = Math.floor((slideNumber - 1) / framesPerRow);
    
    // 设置基准位置（第一个画框时设置）
    if (this.slidesBasePosition === null) {
      // 基准点：当前视图中心对应的画布坐标
      // 画框应该在当前视图中心创建
      // 获取当前视图的中心点（画布坐标）
      const currentZoom = appState.zoom?.value || 1;
      
      // 计算当前视图中心在画布上的位置
      // 视图中心 = (scrollX + viewportWidth/2/zoom, scrollY + viewportHeight/2/zoom)
      // 或者更简单：使用视图坐标转换为画布坐标
      const centerX = viewportWidth / 2 / currentZoom - scrollX;
      const centerY = viewportHeight / 2 / currentZoom - scrollY;
      
      // 画框左上角位置（让画框中心在视图中心）
      this.slidesBasePosition = {
        x: centerX - frameWidth / 2,
        y: centerY - frameHeight / 2,
      };
      console.log('基准位置:', this.slidesBasePosition, '中心点:', { centerX, centerY }, '当前缩放:', currentZoom);
    }
    
    // 基于基准位置计算画框位置
    const frameX = this.slidesBasePosition.x + colIndex * (frameWidth + gapX);
    const frameY = this.slidesBasePosition.y + rowIndex * (frameHeight + gapY);

    console.log(`画框 ${slideNumber} 位置:`, { frameX, frameY, colIndex, rowIndex });

    const slide = {
      id: slideId,
      name: `画框 ${slideNumber}`,
      viewState: {
        frameX: frameX,
        frameY: frameY,
        frameWidth: frameWidth,
        frameHeight: frameHeight,
      },
      created: false,
    };

    this.slides.push(slide);
    console.log('addSlide: 添加画框，当前画框数量:', this.slides.length);
    
    // 在白板上创建画框（简化版，只创建矩形边框）
    this.createFrameOnCanvas(slide, frameX, frameY, frameWidth, frameHeight);
    
    this.renderSlidesList();
    
    // 选中新添加的画框
    this.currentSlideIndex = this.slides.length - 1;
    this.updateSlideSelection();
    
    // 延迟跳转到新画框（确保画框已渲染）
    setTimeout(() => {
      this.goToSlide(this.currentSlideIndex, true);
    }, 100);
    
    new Notice(`已添加 ${slide.name}`);
  }

  // 在白板上创建画框矩形（简化版，无名称标签）
  private createFrameOnCanvas(slide: any, frameX: number, frameY: number, frameWidth: number, frameHeight: number) {
    console.log('createFrameOnCanvas: 开始创建画框', slide.name, { frameX, frameY, frameWidth, frameHeight });
    
    const api = this.view?.excalidrawAPI;
    if (!api) {
      console.warn('createFrameOnCanvas: 无法获取 Excalidraw API, view:', !!this.view, 'api:', !!api);
      return;
    }
    
    try {
      // 生成唯一 ID
      const frameId = `${slide.id}_frame`;
      
      // 创建画框矩形元素（不包含名称标签）
      const frameElement: any = {
        id: frameId,
        type: 'rectangle',
        x: frameX,
        y: frameY,
        width: frameWidth,
        height: frameHeight,
        angle: 0,
        strokeColor: '#3b82f6',
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: 2,
        strokeStyle: 'solid',
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null as any,
        roundness: null as any,
        seed: Math.floor(Math.random() * 2000000000),
        version: 1,
        versionNonce: Math.floor(Math.random() * 2000000000),
        isDeleted: false,
        boundElements: [],
        updated: Date.now(),
        link: null as any,
        locked: false,
      };
      
      console.log('createFrameOnCanvas: 创建画框元素', frameElement);
      
      // 获取现有元素并添加新元素
      const existingElements = api.getSceneElements() || [];
      console.log('createFrameOnCanvas: 现有元素数量', existingElements.length);
      const newElements = [...existingElements, frameElement];
      
      // 更新场景
      api.updateScene({
        elements: newElements,
      });
      
      // 保存元素 ID
      slide.frameElementId = frameId;
      slide.created = true;
      
      console.log('createFrameOnCanvas: 画框创建成功', slide.name, '元素ID:', frameId);
    } catch (e) {
      console.error('createFrameOnCanvas: 创建画框失败', e);
    }
  }

  // 渲染画框列表
  private renderSlidesList() {
    console.log('renderSlidesList: 开始渲染，slidersListElement:', !!this.slidesListElement, '画框数量:', this.slides.length);
    if (!this.slidesListElement) {
      console.warn('renderSlidesList: slidesListElement 为 null，无法渲染');
      return;
    }

    this.slidesListElement.innerHTML = '';

    this.slides.forEach((slide, index) => {
      const btn = document.createElement('div');
      btn.className = 'slide-btn';
      btn.dataset.index = index.toString();
      btn.style.cssText = `
        width: 100%;
        padding: 8px 4px;
        border-radius: 6px;
        border: 2px solid ${index === this.currentSlideIndex ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)'};
        background: ${index === this.currentSlideIndex ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.05)'};
        color: white;
        font-size: 10px;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s;
        position: relative;
      `;

      // 编号
      const num = document.createElement('div');
      num.style.cssText = `
        font-size: 14px;
        font-weight: 700;
        margin-bottom: 2px;
      `;
      num.textContent = (index + 1).toString();
      btn.appendChild(num);

      // 名称
      const name = document.createElement('div');
      name.style.cssText = `
        font-size: 9px;
        opacity: 0.8;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `;
      name.textContent = slide.name;
      name.title = slide.name;
      btn.appendChild(name);

      // 点击跳转
      btn.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('slide-rename') || 
            (e.target as HTMLElement).classList.contains('slide-delete')) return;
        this.goToSlide(index);
      });

      // 双击重命名
      btn.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.renameSlide(index);
      });

      // 右键菜单
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showSlideContextMenu(e, index);
      });

      this.slidesListElement!.appendChild(btn);
    });

    // 滚动到当前选中的画框
    this.scrollToCurrentSlide();
  }

  // 跳转到画框
  private goToSlide(index: number, fitToView: boolean = false) {
    console.log('goToSlide: 开始跳转，index:', index, 'fitToView:', fitToView);
    if (index < 0 || index >= this.slides.length) return;

    const slide = this.slides[index];
    const api = this.view.excalidrawAPI;
    if (!api) {
      console.warn('goToSlide: 无法获取 Excalidraw API');
      return;
    }

    // 如果画框有保存的位置信息
    if (slide.viewState && slide.viewState.frameX !== undefined) {
      const { frameX, frameY, frameWidth, frameHeight } = slide.viewState;
      console.log('goToSlide: frameX:', frameX, 'frameY:', frameY, 'frameWidth:', frameWidth, 'frameHeight:', frameHeight);
      
      // 查找画框元素
      const elements = api.getSceneElements();
      const frameElement = elements.find((el: any) => el.id === (slide as any).frameElementId);
      
      if (frameElement) {
        console.log('goToSlide: 找到画框元素，使用 zoomToFit');
        // 使用 Excalidraw 的 zoomToFit 功能，需要传入数组
        if (fitToView) {
          api.zoomToFit([frameElement]);
        } else {
          // 只滚动不缩放
          api.scrollToContent([frameElement]);
        }
      } else {
        console.log('goToSlide: 未找到画框元素，使用坐标计算');
        // 使用 Excalidraw 的 scrollToContent 方法
        // 创建一个临时元素来滚动
        const tempElement: any = {
          id: 'temp-scroll-target',
          type: 'rectangle',
          x: frameX,
          y: frameY,
          width: frameWidth,
          height: frameHeight,
        };
        
        if (fitToView) {
          api.zoomToFit([tempElement]);
        } else {
          api.scrollToContent([tempElement]);
        }
      }
    }

    this.currentSlideIndex = index;
    this.updateSlideSelection();
    
    new Notice(`切换到 ${slide.name}`);
  }

  // 更新选中状态
  private updateSlideSelection() {
    if (!this.slidesListElement) return;

    const buttons = this.slidesListElement.querySelectorAll('.slide-btn');
    buttons.forEach((btn, index) => {
      const el = btn as HTMLElement;
      if (index === this.currentSlideIndex) {
        el.style.borderColor = '#3b82f6';
        el.style.background = 'rgba(59, 130, 246, 0.3)';
      } else {
        el.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        el.style.background = 'rgba(255, 255, 255, 0.05)';
      }
    });

    this.scrollToCurrentSlide();
  }

  // 滚动到当前选中
  private scrollToCurrentSlide() {
    if (!this.slidesListElement) return;

    const container = this.slidesListElement.parentElement;
    if (!container) return;

    const currentBtn = this.slidesListElement.children[this.currentSlideIndex] as HTMLElement;
    if (currentBtn) {
      const containerRect = container.getBoundingClientRect();
      const btnRect = currentBtn.getBoundingClientRect();
      
      if (btnRect.top < containerRect.top || btnRect.bottom > containerRect.bottom) {
        currentBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  // 重命名画框
  private renameSlide(index: number) {
    if (index < 0 || index >= this.slides.length) return;

    const slide = this.slides[index];
    
    // 创建自定义输入框
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10001;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background: var(--background-primary, #1e1e2e);
      border-radius: 12px;
      padding: 20px;
      min-width: 300px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    `;

    modal.innerHTML = `
      <div style="color: var(--text-normal, #fff); font-weight: 600; margin-bottom: 12px;">重命名画框</div>
      <input type="text" id="rename-input" value="${slide.name}" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: var(--text-normal, #fff); font-size: 14px; outline: none;" />
      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
        <button id="rename-cancel" style="padding: 8px 16px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: transparent; color: var(--text-normal, #fff); cursor: pointer;">取消</button>
        <button id="rename-confirm" style="padding: 8px 16px; border-radius: 6px; border: none; background: #3b82f6; color: white; cursor: pointer; font-weight: 600;">确定</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const input = modal.querySelector('#rename-input') as HTMLInputElement;
    const cancelBtn = modal.querySelector('#rename-cancel');
    const confirmBtn = modal.querySelector('#rename-confirm');

    // 聚焦并选中文字
    input.focus();
    input.select();

    const closeModal = () => {
      overlay.remove();
    };

    const confirmRename = () => {
      const newName = input.value.trim();
      if (newName) {
        slide.name = newName;
        this.renderSlidesList();
        new Notice(`已重命名为 ${slide.name}`);
      }
      closeModal();
    };

    cancelBtn?.addEventListener('click', closeModal);
    confirmBtn?.addEventListener('click', confirmRename);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmRename();
      if (e.key === 'Escape') closeModal();
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }

  // 删除画框
  private deleteSlide(index: number) {
    if (index < 0 || index >= this.slides.length) return;
    
    const slide = this.slides[index];
    const slideName = slide.name;
    
    // 删除白板上的画框元素
    this.deleteFrameFromCanvas(slide);
    
    // 从列表中删除
    this.slides.splice(index, 1);
    
    // 调整当前索引
    if (this.currentSlideIndex >= this.slides.length) {
      this.currentSlideIndex = this.slides.length - 1;
    }
    
    this.renderSlidesList();
    new Notice(`已删除 ${slideName}`);
  }
  
  // 删除白板上的画框元素
  private deleteFrameFromCanvas(slide: any) {
    const api = this.view?.excalidrawAPI;
    if (!api) return;
    
    try {
      const elements = api.getSceneElements();
      const frameId = slide.frameElementId;
      
      // 过滤掉要删除的元素
      const updatedElements = elements.filter((el: any) => {
        return el.id !== frameId;
      });
      
      api.updateScene({ elements: updatedElements });
      console.log('deleteFrameFromCanvas: 已删除画框元素', frameId);
    } catch (e) {
      console.error('deleteFrameFromCanvas: 删除画框元素失败', e);
    }
  }
  
  // 删除所有画框
  private deleteAllSlides() {
    if (this.slides.length === 0) {
      new Notice('没有画框可删除');
      return;
    }
    
    // 删除白板上的所有画框元素
    const api = this.view?.excalidrawAPI;
    if (api) {
      try {
        const elements = api.getSceneElements();
        const frameIds = new Set<string>();
        
        this.slides.forEach((slide: any) => {
          if (slide.frameElementId) frameIds.add(slide.frameElementId);
        });
        
        const updatedElements = elements.filter((el: any) => !frameIds.has(el.id));
        api.updateScene({ elements: updatedElements });
        console.log('deleteAllSlides: 已删除所有画框元素');
      } catch (e) {
        console.error('deleteAllSlides: 删除画框元素失败', e);
      }
    }
    
    // 清空列表
    const count = this.slides.length;
    this.slides = [];
    this.currentSlideIndex = 0;
    this.slidesBasePosition = null;  // 重置基准位置
    
    this.renderSlidesList();
    new Notice(`已删除 ${count} 个画框`);
  }

  // 右键菜单
  private showSlideContextMenu(e: MouseEvent, index: number) {
    // 移除已存在的菜单
    const existingMenu = document.getElementById('slide-context-menu');
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement('div');
    menu.id = 'slide-context-menu';
    menu.style.cssText = `
      position: fixed;
      left: ${e.clientX}px;
      top: ${e.clientY}px;
      background: rgba(30, 30, 40, 0.98);
      border-radius: 8px;
      padding: 4px 0;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      z-index: 10000;
      min-width: 120px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    `;

    const items = [
      { label: '✏️ 重命名', action: () => this.renameSlide(index) },
      { label: '📋 复制视图', action: () => this.copySlideView(index) },
      { label: '🗑️ 删除', action: () => this.deleteSlide(index) },
    ];

    items.forEach(item => {
      const menuItem = document.createElement('div');
      menuItem.style.cssText = `
        padding: 8px 16px;
        color: white;
        font-size: 12px;
        cursor: pointer;
        transition: background 0.15s;
      `;
      menuItem.textContent = item.label;
      menuItem.addEventListener('click', () => {
        item.action();
        menu.remove();
      });
      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.background = 'rgba(59, 130, 246, 0.3)';
      });
      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.background = 'transparent';
      });
      menu.appendChild(menuItem);
    });

    document.body.appendChild(menu);

    // 点击其他地方关闭
    const closeMenu = (ev: MouseEvent) => {
      if (!menu.contains(ev.target as Node)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  // 复制视图到当前
  private copySlideView(index: number) {
    if (index < 0 || index >= this.slides.length) return;

    const api = this.view.excalidrawAPI;
    if (!api) return;

    const appState = api.getAppState();
    this.slides[index].viewState = {
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
      zoom: appState.zoom,
    };

    new Notice(`已更新 ${this.slides[index].name} 的视图`);
  }

  // 绑定键盘事件
  private bindSlidesKeyboardEvents() {
    this._slidesKeyHandler = this.handleSlidesKeyDown.bind(this);
    document.addEventListener('keydown', this._slidesKeyHandler);
  }

  private _slidesKeyHandler: ((e: KeyboardEvent) => void) | null = null;

  private handleSlidesKeyDown(e: KeyboardEvent) {
    // 只有画框面板打开且有画框时才响应
    if (!this.slidesPanel || this.slides.length === 0) return;
    
    // 如果正在输入文字，不响应
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

    // 左右键切换画框
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIndex = (this.currentSlideIndex - 1 + this.slides.length) % this.slides.length;
      this.goToSlide(prevIndex);
      console.log('键盘切换：上一个画框', prevIndex);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIndex = (this.currentSlideIndex + 1) % this.slides.length;
      this.goToSlide(nextIndex);
      console.log('键盘切换：下一个画框', nextIndex);
      return;
    }

    // 上下键切换（仅在鼠标悬停在面板上时）
    if (this.slidesPanel.matches(':hover') || document.activeElement?.closest('#slides-panel')) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = Math.max(0, this.currentSlideIndex - 1);
        if (prevIndex !== this.currentSlideIndex) {
          this.goToSlide(prevIndex);
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = Math.min(this.slides.length - 1, this.currentSlideIndex + 1);
        if (nextIndex !== this.currentSlideIndex) {
          this.goToSlide(nextIndex);
        }
        return;
      }
    }
  }

  // 更新当前画框视图
  private updateCurrentSlideView() {
    if (this.currentSlideIndex < 0 || this.currentSlideIndex >= this.slides.length) return;

    const api = this.view.excalidrawAPI;
    if (!api) return;

    const appState = api.getAppState();
    this.slides[this.currentSlideIndex].viewState = {
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
      zoom: appState.zoom,
    };
  }

  // 移除幻灯片面板
  private removeSlidesPanel() {
    if (this._slidesKeyHandler) {
      document.removeEventListener('keydown', this._slidesKeyHandler);
      this._slidesKeyHandler = null;
    }
    
    if (this._slidesPanelResizeHandler) {
      window.removeEventListener('resize', this._slidesPanelResizeHandler);
      this._slidesPanelResizeHandler = null;
    }
    
    if (this._fullscreenChangeHandler) {
      document.removeEventListener('fullscreenchange', this._fullscreenChangeHandler);
      document.removeEventListener('webkitfullscreenchange', this._fullscreenChangeHandler);
      this._fullscreenChangeHandler = null;
    }
    
    if (this.slidesPanel) {
      this.slidesPanel.remove();
      this.slidesPanel = null;
      this.slidesListElement = null;
    }
  }

  // 切换幻灯片面板
  private toggleSlidesPanel() {
    if (this.slidesPanel) {
      this.removeSlidesPanel();
    } else {
      this.createSlidesPanel();
    }
  }

  // ================== 结束幻灯片管理功能 ==================

  private handleCameraMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    this.isDragging = true;
    this.dragStartPos = {
      x: e.clientX - this.cameraPosition.x,
      y: e.clientY - this.cameraPosition.y,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!this.isDragging) return;
      
      // 直接更新位置
      this.cameraPosition.x = Math.max(0, moveEvent.clientX - this.dragStartPos.x);
      this.cameraPosition.y = Math.max(0, moveEvent.clientY - this.dragStartPos.y);
      
      // 直接更新元素位置，不触发重新渲染
      if (this.cameraElement) {
        this.cameraElement.style.left = `${this.cameraPosition.x}px`;
        this.cameraElement.style.top = `${this.cameraPosition.y}px`;
      }
    };

    const handleMouseUp = () => {
      this.isDragging = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  private setCameraElement = (el: HTMLDivElement | null): void => {
    this.cameraElement = el;
  };

  public renderCameraPreview(): React.ReactElement | null {
    // 使用 DOM 方法管理摄像头预览，不再通过 React 渲染
    // 这里返回 null，实际的预览通过 createCameraPreviewDOM 创建
    return null;
  }

  // ================== 结束摄像头预览 ==================

  public renderCustomPens (isMobile: boolean, appState: AppState) {
    return(
      appState.customPens?.map((_,index)=>{
        const pen = this.plugin.settings.customPens[index]
        //Reset stroke setting when changing to a different tool
        if( 
          appState.resetCustomPen &&
          appState.activeTool.type !== "freedraw" &&
          appState.currentStrokeOptions === pen.penOptions
        ) {
          setTimeout(()=> resetStrokeOptions(appState.resetCustomPen, this.view.excalidrawAPI, false));
        }
        //if Pen settings are loaded, select custom pen when activating the freedraw element
        if (
          !appState.resetCustomPen &&
          appState.activeTool.type === "freedraw" &&
          appState.currentStrokeOptions === pen.penOptions &&
          pen.freedrawOnly
        ) {
          setTimeout(()=>setPen(this.activePen,this.view.excalidrawAPI));
        }

        if(
          this.activePen &&
          appState.resetCustomPen &&
          appState.activeTool.type === "freedraw" &&
          appState.currentStrokeOptions === pen.penOptions &&
          pen.freedrawOnly
        ) {
          this.activePen.strokeWidth = appState.currentItemStrokeWidth;
          this.activePen.backgroundColor = appState.currentItemBackgroundColor;
          this.activePen.strokeColor = appState.currentItemStrokeColor;
          this.activePen.fillStyle = appState.currentItemFillStyle;
          this.activePen.roughness = appState.currentItemRoughness;
        }

        return (
          <label
            key={index}
            className={clsx(
              "ToolIcon",
              "ToolIcon_size_medium",
              {
                "is-mobile": isMobile,
              },
            )}
            onClick={ this.actionCustomPenLabelClick.bind(this,index, pen) }
          >
            <div
              className="ToolIcon__icon"
              aria-label={DEVICE.isDesktop ? pen.type : undefined}
              style={{
                ...appState.activeTool.type === "freedraw" && appState.currentStrokeOptions === pen.penOptions
                  ? {background: "var(--color-primary)"}
                  : {}
              }}
            >
              {penIcon(pen)}
            </div>
          </label>
        )
      })
    )
  }

  public renderPinnedScriptButtons (isMobile: boolean, appState: AppState) {
    return (
      appState?.pinnedScripts?.map((key,index)=>{ //pinned scripts
        const scriptProp = this.plugin.scriptEngine.scriptIconMap[key];
        const name = scriptProp?.name ?? "";
        const icon = scriptProp?.svgString
          ? stringToSVG(scriptProp.svgString)
          : ICONS.cog;
        if(!this.longpressTimeout[index]) this.longpressTimeout[index] = 0;
        return (
          <label
            key = {index}
            className={clsx(
              "ToolIcon",
              "ToolIcon_size_medium",
              {
                "is-mobile": isMobile,
              },
            )}
            onPointerUp={this.actionScriptButtonPonterUp.bind(this,index,key)}
            onPointerDown={this.actionScriptButtonPointerDown.bind(this,index,key)}
          >
            <div
              className="ToolIcon__icon"
              aria-label={DEVICE.isDesktop ? name : undefined}
            >
              {icon}
            </div>
          </label>
        )
      })
    )
  }

  // 检查视图是否有效，用于清理面板
  private checkViewValidity(): boolean {
    // 检查视图是否还存在
    if (!this.view) {
      console.log('ObsidianMenu: view is null, cleaning up');
      this.cleanupAllPanels();
      return false;
    }
    
    // 检查 Excalidraw API 是否有效
    if (!this.view.excalidrawAPI) {
      console.log('ObsidianMenu: excalidrawAPI is null, cleaning up');
      this.cleanupAllPanels();
      return false;
    }
    
    // 检查视图是否仍然打开（通过检查容器元素）
    const container = this.view.containerEl;
    if (!container || !container.isConnected) {
      console.log('ObsidianMenu: container is not connected, cleaning up');
      this.cleanupAllPanels();
      return false;
    }
    
    // 检查文件是否匹配
    const currentFile = this.view.file;
    if (!currentFile) {
      console.log('ObsidianMenu: file is null, cleaning up');
      this.cleanupAllPanels();
      return false;
    }
    
    return true;
  }
  
  // 清理所有面板和资源
  private cleanupAllPanels() {
    console.log('ObsidianMenu: cleanupAllPanels called');
    
    // 停止录制
    if (this.isRecording) {
      this.stopRecording();
    }
    this.cleanupRecording();
    
    // 清理摄像头
    this.cleanupCamera();
    
    // 清理提词器
    this.removeTeleprompter();
    
    // 清理画框面板
    this.removeSlidesPanel();
    
    // 清理设置面板
    this.closeSettingsModal();
    
    // 清理录制边界框
    this.hideRecordingBoundary();
    
    // 清理右键菜单
    const contextMenu = document.getElementById('slide-context-menu');
    if (contextMenu) contextMenu.remove();
  }

  // 同步检查白板上的画框是否被删除
  private syncSlidesWithCanvas() {
    const api = this.view?.excalidrawAPI;
    if (!api) return;
    
    const elements = api.getSceneElements();
    const elementIds = new Set(elements.map((el: any) => el.id));
    
    // 检查每个画框元素是否还存在
    const slidesToRemove: number[] = [];
    this.slides.forEach((slide: any, index: number) => {
      const frameExists = slide.frameElementId && elementIds.has(slide.frameElementId);
      if (slide.frameElementId && !frameExists) {
        // 画框元素已被删除
        slidesToRemove.push(index);
        console.log('syncSlidesWithCanvas: 画框元素已被删除', slide.name);
      }
    });
    
    // 从后往前删除，避免索引问题
    slidesToRemove.reverse().forEach(index => {
      this.slides.splice(index, 1);
    });
    
    // 调整当前索引
    if (this.slides.length === 0) {
      this.currentSlideIndex = 0;
      this.slidesBasePosition = null;
    } else if (this.currentSlideIndex >= this.slides.length) {
      this.currentSlideIndex = this.slides.length - 1;
    }
    
    // 如果有删除，重新渲染
    if (slidesToRemove.length > 0) {
      this.renderSlidesList();
      new Notice(`已同步删除 ${slidesToRemove.length} 个画框`);
    }
  }

  public renderButton (isMobile: boolean, appState: AppState) {
    // 检查视图是否有效
    if (!this.checkViewValidity()) {
      return null;
    }
    
    // 同步检查白板上的画框是否被删除
    this.syncSlidesWithCanvas();
    
    const isFullscreen = this.view.isFullscreen();
    return (
      <>
        <label
          className={clsx(
            "ToolIcon",
            "ToolIcon_size_medium",
            {
              "is-mobile": isMobile,
            },
          )}
          onClick={this.actionShowHideMenu.bind(this, isMobile, appState)}
        >
          <div className="ToolIcon__icon" aria-label={t("OBSIDIAN_TOOLS_PANEL")}>
            {ICONS.obsidian}
          </div>
        </label>
        <label
          className={clsx(
            "ToolIcon",
            "ToolIcon_size_medium",
            {
              "is-mobile": isMobile,
            },
          )}
          onClick={this.actionInsertAnyFile.bind(this)}
        >
          <div className="ToolIcon__icon" aria-label={t("UNIVERSAL_ADD_FILE")}>
            {ICONS["add-file"]}
          </div>
        </label>
        <label
          className={clsx(
            "ToolIcon",
            "ToolIcon_size_medium",
            {
              "is-mobile": isMobile,
            },
          )}
          onClick={this.actionToggleFullscreen.bind(this)}
        >
          <div className="ToolIcon__icon" aria-label={isFullscreen ? t("EXIT_FULLSCREEN") : t("GOTO_FULLSCREEN")}>
            {isFullscreen ? ICONS.exitFullScreen : ICONS.gotoFullScreen}
          </div>
        </label>
        {/* 录制设置按钮 */}
        <label
          className={clsx(
            "ToolIcon",
            "ToolIcon_size_medium",
            { "is-mobile": isMobile },
          )}
          onClick={this.openSettingsModal.bind(this)}
        >
          <div className="ToolIcon__icon" aria-label="录制设置">
            <span>⚙️</span>
          </div>
        </label>
        {/* 提词器按钮 */}
        <label
          className={clsx(
            "ToolIcon",
            "ToolIcon_size_medium",
            { "is-mobile": isMobile },
          )}
          onClick={this.toggleTeleprompter.bind(this)}
          style={this.teleprompterElement ? { background: '#8b5cf6' } : {}}
        >
          <div className="ToolIcon__icon" aria-label="提词器">
            <span style={{ color: this.teleprompterElement ? 'white' : 'inherit' }}>📝</span>
          </div>
        </label>
        {/* 幻灯片按钮 */}
        <label
          className={clsx(
            "ToolIcon",
            "ToolIcon_size_medium",
            { "is-mobile": isMobile },
          )}
          onClick={this.toggleSlidesPanel.bind(this)}
          style={this.slidesPanel ? { background: '#10b981' } : {}}
        >
          <div className="ToolIcon__icon" aria-label="画框管理">
            <span style={{ color: this.slidesPanel ? 'white' : 'inherit' }}>🎞</span>
          </div>
        </label>
        {/* 录制按钮组 */}
        {!this.isRecording ? (
          // 未录制：显示开始按钮
          <label
            className={clsx(
              "ToolIcon",
              "ToolIcon_size_medium",
              { "is-mobile": isMobile },
            )}
            onClick={this.startRecording.bind(this)}
          >
            <div className="ToolIcon__icon" aria-label="开始录制">
              <span>⏺</span>
            </div>
          </label>
        ) : (
          // 录制中：显示暂停/继续 + 结束
          <>
            {/* 暂停/继续按钮 */}
            <label
              className={clsx(
                "ToolIcon",
                "ToolIcon_size_medium",
                { "is-mobile": isMobile },
              )}
              onClick={this.togglePauseRecording.bind(this)}
              style={this.isPaused ? { background: '#f59e0b' } : { background: '#3b82f6' }}
            >
              <div className="ToolIcon__icon" aria-label={this.isPaused ? '继续录制' : '暂停录制'}>
                <span style={{ color: 'white' }}>
                  {this.isPaused ? '▶' : '⏸'}
                </span>
              </div>
            </label>
            {/* 结束按钮 */}
            <label
              className={clsx(
                "ToolIcon",
                "ToolIcon_size_medium",
                { "is-mobile": isMobile },
              )}
              onClick={this.stopRecording.bind(this)}
              style={{ background: '#dc2626' }}
            >
              <div className="ToolIcon__icon" aria-label="结束录制">
                <span style={{ color: 'white', fontSize: '12px' }}>⏹ {this.formatDuration(this.recordingDuration)}</span>
              </div>
            </label>
          </>
        )}
        {this.renderCustomPens(isMobile, appState)}
        {this.renderPinnedScriptButtons(isMobile, appState)}
        {/* 摄像头预览 */}
        {this.renderCameraPreview()}
      </>
    );
  };

  destroy() {
    console.log('ObsidianMenu.destroy() called');
    
    try {
      // 清理定时器
      Object.values(this.longpressTimeout).forEach(
        t=> {
          if (this.view?.ownerWindow) {
            this.view.ownerWindow.clearTimeout(t);
          } else {
            window.clearTimeout(t);
          }
        }
      );
    } catch (e) {
      console.warn('Error clearing longpressTimeout:', e);
    }
    this.longpressTimeout = {};
    this.activePen = null;
    this.plugin = null;
    this.toolsRef = null;
    this.clickTimestamp = null;
    this.renderButton = null;
    this.renderCustomPens = null;
    this.renderPinnedScriptButtons = null;
    
    // 清理录制资源
    if (this.isRecording) {
      this.stopRecording();
    }
    this.cleanupRecording();
    
    // 清理摄像头资源
    this.cleanupCamera();
    
    // 清理提词器资源
    this.removeTeleprompter();
    
    // 清理幻灯片面板
    this.removeSlidesPanel();
    
    // 清理设置面板
    this.closeSettingsModal();
    
    // 清理录制边界框
    this.hideRecordingBoundary();
    
    // 清理右键菜单
    const contextMenu = document.getElementById('slide-context-menu');
    if (contextMenu) contextMenu.remove();
    
    // 清理重命名对话框
    const renameOverlay = document.querySelector('div[style*="position: fixed"][style*="z-index: 10001"]');
    if (renameOverlay) renameOverlay.remove();
    
    // 最后清理 view 引用
    this.view = null;
  }
}
