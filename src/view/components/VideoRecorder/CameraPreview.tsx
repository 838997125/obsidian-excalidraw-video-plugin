import React, { useState, useRef, useCallback, useEffect } from 'react';
import { CameraPosition } from './VideoRecorderCore';

interface CameraPreviewProps {
  cameraStream: MediaStream | null;
  position: CameraPosition;
  onPositionChange: (position: CameraPosition) => void;
  isVisible: boolean;
  isRecording: boolean;
}

/**
 * 摄像头预览组件
 * 支持实时预览、拖动调整位置、调整大小
 */
export const CameraPreview: React.FC<CameraPreviewProps> = ({
  cameraStream,
  position,
  onPositionChange,
  isVisible,
  isRecording,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 拖动状态
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ width: 0, height: 0 });

  // 绑定视频流
  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(console.error);
    }
  }, [cameraStream]);

  // 处理拖动开始
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (isResizing) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  }, [position, isResizing]);

  // 处理拖动
  const handleDrag = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    const newX = Math.max(0, e.clientX - dragStart.x);
    const newY = Math.max(0, e.clientY - dragStart.y);

    onPositionChange({
      ...position,
      x: newX,
      y: newY,
    });
  }, [isDragging, dragStart, position, onPositionChange]);

  // 处理拖动结束
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 处理调整大小开始
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({
      width: position.width,
      height: position.height,
    });
    setDragStart({
      x: e.clientX,
      y: e.clientY,
    });
  }, [position]);

  // 处理调整大小
  const handleResize = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;

    // 保持 4:3 比例
    const newWidth = Math.max(120, Math.min(400, resizeStart.width + deltaX));
    const newHeight = Math.max(90, Math.min(300, resizeStart.height + deltaY));

    onPositionChange({
      ...position,
      width: newWidth,
      height: newHeight,
    });
  }, [isResizing, dragStart, resizeStart, position, onPositionChange]);

  // 处理调整大小结束
  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  // 全局鼠标事件
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDrag);
      window.addEventListener('mouseup', handleDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleDrag);
        window.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging, handleDrag, handleDragEnd]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResize);
      window.addEventListener('mouseup', handleResizeEnd);
      return () => {
        window.removeEventListener('mousemove', handleResize);
        window.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, handleResize, handleResizeEnd]);

  if (!isVisible || !cameraStream) return null;

  return (
    <div
      ref={containerRef}
      className={`camera-preview-container ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''}`}
      style={{
        left: position.x,
        top: position.y,
        width: position.width,
        height: position.height,
      }}
    >
      {/* 拖动区域 */}
      <div
        className="camera-preview-drag-handle"
        onMouseDown={handleDragStart}
      >
        <span className="camera-preview-label">
          {isRecording ? '🔴 录制中' : '📷 摄像头'}
        </span>
      </div>

      {/* 视频预览 */}
      <video
        ref={videoRef}
        className="camera-preview-video"
        autoPlay
        playsInline
        muted
      />

      {/* 调整大小手柄 */}
      <div
        className="camera-preview-resize-handle"
        onMouseDown={handleResizeStart}
      />

      {/* 边框装饰 */}
      <div className="camera-preview-border" />
    </div>
  );
};

export default CameraPreview;