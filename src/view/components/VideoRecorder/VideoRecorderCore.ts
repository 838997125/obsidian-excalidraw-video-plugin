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

export type RecordingStateCallback = (state: RecordingState) => void;

export class VideoRecorderCore {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private canvasStream: MediaStream | null = null;
  private cameraStream: MediaStream | null = null;
  private audioStream: MediaStream | null = null;
  private combinedStream: MediaStream | null = null;
  private recordingTimer: NodeJS.Timeout | null = null;
  private startTime: number = 0;
  private pausedTime: number = 0;
  private totalPausedDuration: number = 0;
  private config: RecorderConfig;
  private onStateChange: RecordingStateCallback;
  private cameraVideo: HTMLVideoElement | null = null;
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private sourceCanvas: HTMLCanvasElement | null = null;
  private slideBounds: { x: number; y: number; width: number; height: number } | null = null;

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

      // 2. 获取摄像头流（如果启用）
      if (this.config.cameraEnabled) {
        try {
          this.cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 320, height: 240, frameRate: 30 },
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
    const now = Date.now();
    const duration = this.isRecording()
      ? now - this.startTime - this.totalPausedDuration - (this.isPaused() ? now -