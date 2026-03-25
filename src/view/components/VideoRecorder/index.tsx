import * as React from "react";
import { Notice, TFile } from "obsidian";
import { ExcalidrawImperativeAPI } from "@zsviczian/excalidraw/types/excalidraw/types";

interface VideoRecorderProps {
  excalidrawAPI: ExcalidrawImperativeAPI;
  file: TFile | null;
}

interface VideoRecorderState {
  isRecording: boolean;
  isPaused: boolean;
  isCameraEnabled: boolean;
  duration: number;
}

/**
 * 视频录制组件 - 简化版
 * 录制画布内容，支持摄像头画中画
 */
export class VideoRecorder extends React.Component<VideoRecorderProps, VideoRecorderState> {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private cameraStream: MediaStream | null = null;
  private audioStream: MediaStream | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  constructor(props: VideoRecorderProps) {
    super(props);
    this.state = {
      isRecording: false,
      isPaused: false,
      isCameraEnabled: true,
      duration: 0,
    };
  }

  componentWillUnmount() {
    this.cleanup();
  }

  private cleanup() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
      this.cameraStream = null;
    }
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(t => t.stop());
      this.audioStream = null;
    }
    this.mediaRecorder = null;
    this.recordedChunks = [];
  }

  private formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  private getSupportedMimeType = (): string => {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return 'video/webm';
  };

  startRecording = async () => {
    const { excalidrawAPI, file } = this.props;
    if (!excalidrawAPI || !file) {
      new Notice('无法开始录制：缺少必要参数');
      return;
    }

    try {
      // 获取画布
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      if (!canvas) {
        new Notice('未找到画布元素');
        return;
      }

      // 获取摄像头
      if (this.state.isCameraEnabled) {
        try {
          this.cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 320, height: 240 },
            audio: false,
          });
        } catch (e) {
          console.warn('无法获取摄像头:', e);
        }
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

      // 创建合成流
      const canvasStream = canvas.captureStream(30);
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
        if (e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.saveRecording();
      };

      this.mediaRecorder.start(100);
      
      // 开始计时
      this.timerInterval = setInterval(() => {
        this.setState(prev => ({ duration: prev.duration + 1 }));
      }, 1000);

      this.setState({ isRecording: true, duration: 0 });
      new Notice('开始录制');

    } catch (error) {
      console.error('开始录制失败:', error);
      new Notice('开始录制失败');
      this.cleanup();
    }
  };

  stopRecording = () => {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.setState({ isRecording: false, isPaused: false, duration: 0 });
  };

  pauseRecording = () => {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      this.setState({ isPaused: true });
      new Notice('录制已暂停');
    }
  };

  resumeRecording = () => {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      this.setState({ isPaused: false });
      new Notice('继续录制');
    }
  };

  toggleCamera = () => {
    this.setState(prev => ({ isCameraEnabled: !prev.isCameraEnabled }));
  };

  private saveRecording = async () => {
    const { file } = this.props;
    if (!file || this.recordedChunks.length === 0) return;

    try {
      const blob = new Blob(this.recordedChunks, { type: this.getSupportedMimeType() });
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
      new Notice('保存视频失败');
    }

    this.recordedChunks = [];
    this.cleanup();
  };

  render() {
    const { isRecording, isPaused, isCameraEnabled, duration } = this.state;

    return React.createElement(
      'div',
      { className: 'video-recorder-panel' },
      
      // 摄像头开关
      React.createElement(
        'button',
        {
          className: `recorder-btn ${isCameraEnabled ? 'active' : ''}`,
          onClick: this.toggleCamera,
          title: isCameraEnabled ? '关闭摄像头' : '开启摄像头',
        },
        isCameraEnabled ? '🎥' : '📷'
      ),

      // 录制时长
      isRecording && React.createElement(
        'span',
        { className: 'recorder-duration' },
        this.formatDuration(duration)
      ),

      // 录制/暂停/继续按钮
      !isRecording 
        ? React.createElement(
            'button',
            {
              className: 'recorder-btn record-btn',
              onClick: this.startRecording,
              title: '开始录制',
            },
            React.createElement('span', null, '⏺'),
            React.createElement('span', null, '录制')
          )
        : isPaused
          ? React.createElement(
              'button',
              {
                className: 'recorder-btn resume-btn',
                onClick: this.resumeRecording,
                title: '继续录制',
              },
              React.createElement('span', null, '▶'),
              React.createElement('span', null, '继续')
            )
          : React.createElement(
              'button',
              {
                className: 'recorder-btn pause-btn',
                onClick: this.pauseRecording,
                title: '暂停录制',
              },
              React.createElement('span', null, '⏸'),
              React.createElement('span', null, '暂停')
            ),

      // 停止按钮
      isRecording && React.createElement(
        'button',
        {
          className: 'recorder-btn stop-btn',
          onClick: this.stopRecording,
          title: '停止录制',
        },
        React.createElement('span', null, '⏹'),
        React.createElement('span', null, '停止')
      )
    );
  }
}

export default VideoRecorder;