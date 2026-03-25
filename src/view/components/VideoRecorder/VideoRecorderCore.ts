/**
 * 视频录制核心模块
 * 支持：画布录制 + 摄像头画中画 + 音频录制 + 暂停/继续功能
 */

export interface RecorderConfig {
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  videoQuality: 'high' | 'medium' | 'low';
  frameRate: number;
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
}

export interface CameraPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type RecordingStateCallback = (state: RecordingState) => void;
export type CameraPositionCallback = (position: CameraPosition) => void;

export class VideoRecorderCore {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private canvasStream: MediaStream | null = null;
  private cameraStream: MediaStream | null = null;
  private audioStream: MediaStream | null = null;
  private combinedStream: MediaStream | null = null;
  private recordingTimer: ReturnType<typeof setInterval> | null = null;
  private startTime: number = 0;
  private pausedTime: number = 0;
  private totalPausedDuration: number = 0;
  private config: RecorderConfig;
  private onStateChange: RecordingStateCallback;
  private onCameraPositionChange?: CameraPositionCallback;
  private cameraVideo: HTMLVideoElement | null = null;
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private sourceCanvas: HTMLCanvasElement | null = null;
  private slideBounds: { x: number; y: number; width: number; height: number } | null = null;
  
  // 摄像头位置配置
  private cameraPosition: CameraPosition = {
    x: 20,
    y: 20,
    width: 200,
    height: 150,
  };

  constructor(
    config: RecorderConfig = {
      cameraEnabled: true,
      microphoneEnabled: true,
      videoQuality: 'high',
      frameRate: 30,
    },
    onStateChange: RecordingStateCallback = () => {}
  ) {
    this.config = config;
    this.onStateChange = onStateChange;
  }

  /**
   * 设置摄像头位置回调
   */
  setOnCameraPositionChange(callback: CameraPositionCallback): void {
    this.onCameraPositionChange = callback;
  }

  /**
   * 更新摄像头位置
   */
  setCameraPosition(position: Partial<CameraPosition>): void {
    this.cameraPosition = { ...this.cameraPosition, ...position };
    this.onCameraPositionChange?.(this.cameraPosition);
  }

  /**
   * 获取摄像头位置
   */
  getCameraPosition(): CameraPosition {
    return { ...this.cameraPosition };
  }

  /**
   * 获取摄像头流（用于预览）
   */
  getCameraStream(): MediaStream | null {
    return this.cameraStream;
  }

  /**
   * 更新配置
   */
  setConfig(config: Partial<RecorderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 设置摄像头开关
   */
  setCameraEnabled(enabled: boolean): void {
    this.config.cameraEnabled = enabled;
    if (!enabled && this.cameraStream) {
      this.stopStream(this.cameraStream);
      this.cameraStream = null;
      if (this.cameraVideo) {
        this.cameraVideo.pause();
        this.cameraVideo.srcObject = null;
        this.cameraVideo = null;
      }
    }
  }

  /**
   * 设置麦克风开关
   */
  setMicrophoneEnabled(enabled: boolean): void {
    this.config.microphoneEnabled = enabled;
    if (!enabled && this.audioStream) {
      this.stopStream(this.audioStream);
      this.audioStream = null;
    }
  }

  /**
   * 初始化摄像头（用于预览）
   */
  async initCamera(): Promise<MediaStream | null> {
    if (this.cameraStream) {
      return this.cameraStream;
    }

    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, frameRate: 30 },
        audio: false,
      });
      return this.cameraStream;
    } catch (err) {
      console.warn('无法获取摄像头:', err);
      return null;
    }
  }

  /**
   * 开始录制
   * @param canvas 要录制的画布
   * @param slideBounds 幻灯片边界（限制录制区域）
   */
  async startRecording(
    canvas: HTMLCanvasElement,
    slideBounds: { x: number; y: number; width: number; height: number }
  ): Promise<boolean> {
    try {
      this.sourceCanvas = canvas;
      this.slideBounds = slideBounds;
      this.recordedChunks = [];
      this.totalPausedDuration = 0;

      // 1. 获取 Canvas 流
      this.canvasStream = canvas.captureStream(this.config.frameRate);

      // 2. 获取摄像头流（如果启用且尚未初始化）
      if (this.config.cameraEnabled && !this.cameraStream) {
        try {
          this.cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, frameRate: 30 },
            audio: false,
          });
        } catch (err) {
          console.warn('无法获取摄像头:', err);
          this.cameraStream = null;
        }
      }

      // 3. 获取音频流（如果启用）
      if (this.config.microphoneEnabled) {
        try {
          this.audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              sampleRate: 44100,
            },
            video: false,
          });
        } catch (err) {
          console.warn('无法获取麦克风:', err);
          this.audioStream = null;
        }
      }

      // 4. 创建离屏 Canvas 用于合成画面
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCanvas.width = slideBounds.width;
      this.offscreenCanvas.height = slideBounds.height;
      this.offscreenCtx = this.offscreenCanvas.getContext('2d', {
        alpha: false,
      });

      if (!this.offscreenCtx) {
        throw new Error('无法创建 Canvas 上下文');
      }

      // 5. 创建摄像头视频元素
      if (this.cameraStream) {
        this.cameraVideo = document.createElement('video');
        this.cameraVideo.srcObject = this.cameraStream;
        this.cameraVideo.autoplay = true;
        this.cameraVideo.muted = true;
        this.cameraVideo.playsInline = true;
        await this.cameraVideo.play();
      }

      // 6. 设置合成循环
      this.startCompositionLoop();

      // 7. 捕获合成后的流
      this.combinedStream = this.offscreenCanvas.captureStream(this.config.frameRate);

      // 8. 添加音频轨道
      if (this.audioStream) {
        const audioTrack = this.audioStream.getAudioTracks()[0];
        if (audioTrack) {
          this.combinedStream.addTrack(audioTrack);
        }
      }

      // 9. 创建 MediaRecorder
      const mimeType = this.getSupportedMimeType();
      const videoBitsPerSecond = this.getVideoBitrate();

      this.mediaRecorder = new MediaRecorder(this.combinedStream, {
        mimeType,
        videoBitsPerSecond,
      });

      // 10. 设置录制事件
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder 错误:', event);
        this.cleanup();
      };

      // 11. 开始录制
      this.mediaRecorder.start(100); // 每100ms收集一次数据
      this.startTime = Date.now();
      this.startRecordingTimer();

      this.onStateChange({
        isRecording: true,
        isPaused: false,
        duration: 0,
      });

      return true;
    } catch (error) {
      console.error('开始录制失败:', error);
      this.cleanup();
      throw error;
    }
  }

  /**
   * 暂停录制
   */
  pauseRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      this.pausedTime = Date.now();
      this.stopRecordingTimer();

      this.onStateChange({
        isRecording: true,
        isPaused: true,
        duration: this.pausedTime - this.startTime - this.totalPausedDuration,
      });
    }
  }

  /**
   * 继续录制
   */
  resumeRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      const pauseDuration = Date.now() - this.pausedTime;
      this.totalPausedDuration += pauseDuration;
      this.startRecordingTimer();

      this.onStateChange({
        isRecording: true,
        isPaused: false,
        duration: Date.now() - this.startTime - this.totalPausedDuration,
      });
    }
  }

  /**
   * 停止录制并返回视频 Blob
   */
  async stopRecording(): Promise<Blob | null> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        this.cleanup();
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const mimeType = this.getSupportedMimeType();
        const blob = new Blob(this.recordedChunks, { type: mimeType });
        this.cleanup();
        resolve(blob);
      };

      this.mediaRecorder.onerror = (event) => {
        console.error('停止录制时出错:', event);
        this.cleanup();
        reject(new Error('停止录制失败'));
      };

      this.mediaRecorder.stop();
      this.stopRecordingTimer();

      this.onStateChange({
        isRecording: false,
        isPaused: false,
        duration: 0,
      });
    });
  }

  /**
   * 获取当前录制状态
   */
  getState(): RecordingState {
    return {
      isRecording: this.isRecording(),
      isPaused: this.isPaused(),
      duration: this.getDuration(),
    };
  }

  /**
   * 是否正在录制
   */
  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording' || this.mediaRecorder?.state === 'paused';
  }

  /**
   * 是否暂停
   */
  isPaused(): boolean {
    return this.mediaRecorder?.state === 'paused';
  }

  /**
   * 获取录制时长（秒）
   */
  getDuration(): number {
    if (!this.isRecording()) return 0;
    const now = Date.now();
    return Math.floor((now - this.startTime - this.totalPausedDuration) / 1000);
  }

  /**
   * 启动合成循环
   * 将画布内容和摄像头画面合成为最终视频
   */
  private startCompositionLoop(): void {
    const compose = () => {
      if (!this.offscreenCtx || !this.sourceCanvas || !this.slideBounds) {
        return;
      }

      // 清空画布
      this.offscreenCtx.fillStyle = '#ffffff';
      this.offscreenCtx.fillRect(0, 0, this.slideBounds.width, this.slideBounds.height);

      // 绘制主画布内容（裁剪到幻灯片区域）
      this.offscreenCtx.drawImage(
        this.sourceCanvas,
        this.slideBounds.x,
        this.slideBounds.y,
        this.slideBounds.width,
        this.slideBounds.height,
        0,
        0,
        this.slideBounds.width,
        this.slideBounds.height
      );

      // 绘制摄像头画中画
      if (this.cameraVideo && this.config.cameraEnabled) {
        this.drawCameraPiP();
      }

      // 继续下一帧
      this.animationFrameId = requestAnimationFrame(compose);
    };

    // 启动循环
    this.animationFrameId = requestAnimationFrame(compose);
  }

  /**
   * 绘制摄像头画中画
   */
  private drawCameraPiP(): void {
    if (!this.offscreenCtx || !this.cameraVideo) return;

    const { x, y, width, height } = this.cameraPosition;
    
    // 确保摄像头画面在画布范围内
    const maxX = this.slideBounds!.width - width;
    const maxY = this.slideBounds!.height - height;
    const drawX = Math.max(0, Math.min(x, maxX));
    const drawY = Math.max(0, Math.min(y, maxY));

    // 绘制圆角矩形裁剪区域
    this.offscreenCtx.save();
    
    // 绘制阴影
    this.offscreenCtx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    this.offscreenCtx.shadowBlur = 10;
    this.offscreenCtx.shadowOffsetX = 2;
    this.offscreenCtx.shadowOffsetY = 2;

    // 绘制圆角矩形边框
    const radius = 12;
    this.offscreenCtx.beginPath();
    this.offscreenCtx.roundRect(drawX, drawY, width, height, radius);
    this.offscreenCtx.clip();

    // 绘制摄像头视频
    this.offscreenCtx.drawImage(
      this.cameraVideo,
      drawX,
      drawY,
      width,
      height
    );

    // 绘制边框
    this.offscreenCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    this.offscreenCtx.lineWidth = 2;
    this.offscreenCtx.stroke();

    this.offscreenCtx.restore();
  }

  /**
   * 停止合成循环
   */
  private stopCompositionLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * 启动录制计时器
   */
  private startRecordingTimer(): void {
    this.stopRecordingTimer();
    this.recordingTimer = setInterval(() => {
      this.onStateChange(this.getState());
    }, 1000);
  }

  /**
   * 停止录制计时器
   */
  private stopRecordingTimer(): void {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
  }

  /**
   * 获取支持的 MIME 类型
   */
  private getSupportedMimeType(): string {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'video/webm';
  }

  /**
   * 根据质量设置获取视频比特率
   */
  private getVideoBitrate(): number {
    switch (this.config.videoQuality) {
      case 'high':
        return 8000000; // 8 Mbps
      case 'medium':
        return 4000000; // 4 Mbps
      case 'low':
        return 2000000; // 2 Mbps
      default:
        return 4000000;
    }
  }

  /**
   * 停止媒体流
   */
  private stopStream(stream: MediaStream): void {
    stream.getTracks().forEach((track) => track.stop());
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    // 停止合成循环
    this.stopCompositionLoop();

    // 停止计时器
    this.stopRecordingTimer();

    // 停止媒体流（但保留摄像头流用于预览）
    if (this.canvasStream) {
      this.stopStream(this.canvasStream);
      this.canvasStream = null;
    }

    if (this.audioStream) {
      this.stopStream(this.audioStream);
      this.audioStream = null;
    }

    // 不停止摄像头流，保留给预览使用
    // 但清理视频元素
    if (this.cameraVideo) {
      this.cameraVideo.pause();
      this.cameraVideo.srcObject = null;
      this.cameraVideo = null;
    }

    // 清理离屏 Canvas
    this.offscreenCanvas = null;
    this.offscreenCtx = null;
    this.sourceCanvas = null;
    this.slideBounds = null;

    // 重置状态
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.startTime = 0;
    this.pausedTime = 0;
    this.totalPausedDuration = 0;
  }

  /**
   * 完全销毁（释放所有资源包括摄像头）
   */
  destroy(): void {
    this.cleanup();

    if (this.cameraStream) {
      this.stopStream(this.cameraStream);
      this.cameraStream = null;
    }
  }
}