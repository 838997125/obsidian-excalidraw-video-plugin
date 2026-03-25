import React, { useState, useEffect } from 'react';
import { Settings, FileText, Circle, Video, VideoOff, Clock } from 'lucide-react';

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

/**
 * 格式化时间为 MM:SS
 */
const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

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
  const [duration, setDuration] = useState(0);

  // 录制计时器
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    
    if (isRecording && !isPaused) {
      timer = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [isRecording, isPaused]);

  // 重置计时器
  useEffect(() => {
    if (!isRecording) {
      setDuration(0);
    }
  }, [isRecording]);

  return (
    <div className="video-recorder-panel">
      {/* 摄像头开关 */}
      <button
        className={`recorder-btn ${isCameraEnabled ? 'active' : ''}`}
        onClick={onToggleCamera}
        title={isCameraEnabled ? '关闭摄像头' : '开启摄像头'}
      >
        {isCameraEnabled ? <Video size={18} /> : <VideoOff size={18} />}
      </button>

      {/* 配置按钮 */}
      <button
        className={`recorder-btn ${isCameraEnabled ? 'active' : ''}`}
        onClick={onToggleCamera}
        title="摄像头设置"
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

      {/* 录制时长（仅在录制时显示） */}
      {isRecording && (
        <div className="recorder-duration">
          <Clock size={14} />
          <span className={`duration-text ${isPaused ? 'paused' : ''}`}>
            {formatDuration(duration)}
          </span>
        </div>
      )}

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

export default VideoRecorderPanel;