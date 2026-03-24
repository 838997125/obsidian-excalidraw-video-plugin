import React, { useState, useCallback, useRef, useEffect } from 'react';
import { VideoRecorderPanel } from './VideoRecorderPanel';
import { VideoRecorderCore } from './VideoRecorderCore';
import { PromptOverlay } from './PromptOverlay';
import { Notice, TFile } from 'obsidian';
import { ExcalidrawImperativeAPI } from '@zsviczian/excalidraw/types/excalidraw/types';

interface VideoRecorderContainerProps {
  excalidrawAPI: ExcalidrawImperativeAPI;
  file: TFile;
}

export const VideoRecorderContainer: React.FC<VideoRecorderContainerProps> = ({
  excalidrawAPI,
  file,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isPromptVisible, setIsPromptVisible] = useState(false);
  const recorderRef = useRef<VideoRecorderCore | null>(null);

  // 初始化录制器
  useEffect(() => {
    recorderRef.current = new VideoRecorderCore();
    return () => {
      if (recorderRef.current) {
        recorderRef.current.stopRecording();
      }
    };
  }, []);

  // 开始录制
  const handleStartRecording = useCallback(async () => {
    if (!recorderRef.current) return;

    // 获取 Canvas 元素
    const canvas = document.querySelector(
      '.excalidraw__canvas, .excalidraw-canvas'
    ) as HTMLCanvasElement;

    if (!canvas) {
      new Notice('未找到画布元素');
      return;
    }

    // 跳转到第一张幻灯片
    const elements = excalidrawAPI.getSceneElements();
    const firstSlide = elements.find((el: any) =>
      el.id?.startsWith('slide-')
    );
    if (firstSlide) {
      excalidrawAPI.scrollToContent(firstSlide);
    }

    const success = await recorderRef.current.startRecording(
      canvas,
      () => {}, // onDataAvailable
      (blob) => handleRecordingComplete(blob) // onStop
    );

    if (success) {
      setIsRecording(true);
      setIsPaused(false);
      new Notice('开始录制');
    }
  }, [excalidrawAPI]);

  // 暂停录制
  const handlePauseRecording = useCallback(() => {
    if (!recorderRef.current) return;
    recorderRef.current.pauseRecording();
    setIsPaused(true);
    new Notice('录制已暂停');
  }, []);

  // 停止录制
  const handleStopRecording = useCallback(() => {
    if (!recorderRef.current) return;
    recorderRef.current.stopRecording();
    setIsRecording(false);
    setIsPaused(false);
    new Notice('正在保存视频...');
  }, []);

  // 录制完成处理
  const handleRecordingComplete = useCallback(
    async (blob: Blob) => {
      try {
        // 生成文件名
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const videoFileName = `${file.basename}_recording_${timestamp}.webm`;
        const videoPath = `${file.parent?.path}/${videoFileName}`;

        // 转换为 ArrayBuffer
        const arrayBuffer = await blob.arrayBuffer();

        // 保存到 Obsidian 仓库
        const adapter = file.vault.adapter;
        await adapter.writeBinary(videoPath, arrayBuffer);

        new Notice(`视频已保存: ${videoFileName}`);
      } catch (error) {
        console.error('保存视频失败:', error);
        new Notice('保存视频失败');
      }
    },
    [file]
  );

  // 切换摄像头
  const handleToggleCamera = useCallback(() => {
    const newState = !isCameraEnabled;
    setIsCameraEnabled(newState);
    recorderRef.current?.setCameraEnabled(newState);
    new Notice(newState ? '摄像头已开启' : '摄像头已关闭');
  }, [isCameraEnabled]);

  // 切换提示词显示
  const handleTogglePrompt = useCallback(() => {
    setIsPromptVisible(!isPromptVisible);
  }, [isPromptVisible]);

  return (
    <>
      {/* 录制控制面板 */}
      <div className="video-recorder-wrapper">
        <VideoRecorderPanel
          onStartRecording={
            isPaused ? handleStartRecording : handleStartRecording
          }
          onPauseRecording={handlePauseRecording}
          onStopRecording={handleStopRecording}
          onToggleCamera={handleToggleCamera}
          onTogglePrompt={handleTogglePrompt}
          isRecording={isRecording}
          isPaused={isPaused}
          isCameraEnabled={isCameraEnabled}
          isPromptVisible={isPromptVisible}
        />
      </div>

      {/* 提示词浮动框 */}
      <PromptOverlay
        isVisible={isPromptVisible}
        onClose={() => setIsPromptVisible(false)}
      />
    </>
  );
};
