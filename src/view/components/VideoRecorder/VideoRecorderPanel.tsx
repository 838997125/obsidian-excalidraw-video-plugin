import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Settings, FileText, Circle } from 'lucide-react';

interface VideoRecorderPanelProps {
  onStartRecording: () => void;
  onPauseRecording: () => void;
  onStopRecording: () => void;
  onToggleCamera: () => void;
  onTogglePrompt: () => void;
  isRecording: boolean;
  isPaused: boolean;
  isCameraEnabled: boolean;
  isPromptVisible: boolean;
}

export const VideoRecorderPanel: React.FC<VideoRecorderPanelProps> = ({
  onStartRecording,
  onPauseRecording,
  onStopRecording,
  onToggleCamera,
  onTogglePrompt,
  isRecording,
  isPaused,
  isCameraEnabled,
  isPromptVisible,
}) => {
  return (
    <div className="video-recorder-panel">
      {/* 配置按钮 */}
      <button
        className={`recorder-btn ${isCameraEnabled ? 'active' : ''}`}
        onClick={onToggleCamera}
        title="配置摄像头"
      >
        <Settings size={18} />
      </button>

      {/* 提示词按钮 */}
      <button
        className={`recorder-btn ${isPromptVisible ? 'active' : ''}`}
        onClick={onTogglePrompt}
        title="显示/隐藏提示词"
      >
        <FileText size={18} />
      </button>

      {/* 录制按钮 */}
      {!isRecording ? (
        <button
          className="recorder-btn record-btn"
          onClick={onStartRecording}
          title="开始录制"
        >
          <Circle size={18} fill="#ef4444" color="#ef4444" />
          <span>录制</span>
        </button>
      ) : isPaused ? (
        <button
          className="recorder-btn resume-btn"
          onClick={onStartRecording}
          title="继续录制"
        >
          <Circle size={18} fill="#22c55e" color="#22c55e" />
          <span>继续</span>
        </button>
      ) : (
        <button
          className="recorder-btn pause-btn"
          onClick={onPauseRecording}
          title="暂停录制"
        >
          <span>⏸</span>
          <span>暂停</span>
        </button>
      )}

      {/* 停止按钮（仅在录制时显示） */}
      {isRecording && (
        <button
          className="recorder-btn stop-btn"
          onClick={onStopRecording}
          title="停止录制"
        >
          <span>⏹</span>
          <span>停止</span>
        </button>
      )}
    </div>
  );
};
