import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ExcalidrawImperativeAPI } from '@zsviczian/excalidraw/types/excalidraw/types';
import { ExcalidrawElement } from '@zsviczian/excalidraw/types/element/src/types';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';

interface Slide {
  id: string;
  name: string;
  frameId: string;
}

interface SlideManagerProps {
  excalidrawAPI: ExcalidrawImperativeAPI;
  onSlideChange?: (slideIndex: number) => void;
}

export const SlideManager: React.FC<SlideManagerProps> = ({
  excalidrawAPI,
  onSlideChange,
}) => {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // 从现有 Frame 元素初始化幻灯片列表
  useEffect(() => {
    const elements = excalidrawAPI.getSceneElements();
    const frameElements = elements.filter(
      (el: any) => el.type === 'frame' && el.id?.startsWith('slide-')
    );

    if (frameElements.length > 0) {
      const existingSlides = frameElements.map((el: any, index: number) => ({
        id: el.id,
        name: el.name || `Slide ${index + 1}`,
        frameId: el.id,
      }));
      setSlides(existingSlides);
    }
  }, [excalidrawAPI]);

  // 新建幻灯片
  const createNewSlide = useCallback(() => {
    const slideNumber = slides.length + 1;
    const slideName = `Slide ${slideNumber}`;
    const frameId = `slide-${Date.now()}`;

    // 获取当前所有元素
    const currentElements = excalidrawAPI.getSceneElements();

    // 计算新幻灯片位置（横向排列）
    const xOffset = slides.length > 0
      ? Math.max(...currentElements
          .filter((el: any) => el.type === 'frame')
          .map((el: any) => el.x + el.width)) + 100
      : 0;

    // 创建 Frame 元素
    const frameElement: any = {
      type: 'frame',
      id: frameId,
      x: xOffset,
      y: 0,
      width: 1000,
      height: 600,
      name: slideName,
      backgroundColor: '#ffffff',
      strokeColor: '#cccccc',
      strokeWidth: 2,
      opacity: 100,
      roundness: null,
      seed: Math.floor(Math.random() * 1000000),
      version: 1,
      versionNonce: Date.now(),
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
    };

    // 添加到底框到画布
    excalidrawAPI.updateScene({
      elements: [...currentElements, frameElement],
    });

    const newSlide: Slide = {
      id: frameId,
      name: slideName,
      frameId,
    };

    const newSlides = [...slides, newSlide];
    setSlides(newSlides);
    setCurrentSlide(newSlides.length - 1);
    onSlideChange?.(newSlides.length - 1);

    // 自动跳转到新幻灯片
    setTimeout(() => {
      excalidrawAPI.scrollToContent(frameElement);
      excalidrawAPI.selectElements([frameElement]);
    }, 100);
  }, [slides, excalidrawAPI, onSlideChange]);

  // 切换幻灯片
  const switchToSlide = useCallback((index: number) => {
    if (index < 0 || index >= slides.length) return;

    setCurrentSlide(index);
    onSlideChange?.(index);

    const slide = slides[index];
    const elements = excalidrawAPI.getSceneElements();
    const frameElement = elements.find((el: ExcalidrawElement) => el.id === slide.frameId);

    if (frameElement) {
      excalidrawAPI.scrollToContent(frameElement);
      excalidrawAPI.selectElements([frameElement]);
    }
  }, [slides, excalidrawAPI, onSlideChange]);

  // 切换到上一张
  const goToPrevSlide = useCallback(() => {
    if (currentSlide > 0) {
      switchToSlide(currentSlide - 1);
    }
  }, [currentSlide, switchToSlide]);

  // 切换到下一张
  const goToNextSlide = useCallback(() => {
    if (currentSlide < slides.length - 1) {
      switchToSlide(currentSlide + 1);
    }
  }, [currentSlide, switchToSlide]);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略在输入框中的键盘事件
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrevSlide();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNextSlide();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrevSlide, goToNextSlide]);

  // 删除幻灯片
  const deleteSlide = useCallback((index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (slides.length <= 1) return;

    const slideToDelete = slides[index];
    const elements = excalidrawAPI.getSceneElements();

    // 从场景中移除 Frame 元素
    const updatedElements = elements.filter((el: ExcalidrawElement) => el.id !== slideToDelete.frameId);
    excalidrawAPI.updateScene({ elements: updatedElements });

    // 更新幻灯片列表
    const newSlides = slides.filter((_, i) => i !== index);
    setSlides(newSlides);

    // 调整当前幻灯片索引
    if (index <= currentSlide && currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
      onSlideChange?.(currentSlide - 1);
    }
  }, [slides, currentSlide, excalidrawAPI, onSlideChange]);

  return (
    <div className="slide-manager" ref={containerRef}>
      <div className="slide-header">
        <span className="slide-title">幻灯片</span>
        <span className="slide-count">{slides.length}</span>
      </div>

      <div className="slide-list">
        {slides.map((slide, index) => (
          <div
            key={slide.id}
            className={`slide-item ${index === currentSlide ? 'active' : ''}`}
            onClick={() => switchToSlide(index)}
            title={slide.name}
          >
            <span className="slide-number">{index + 1}</span>
            {slides.length > 1 && (
              <button
                className="slide-delete-btn"
                onClick={(e) => deleteSlide(index, e)}
                title="删除幻灯片"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <button className="slide-add-btn" onClick={createNewSlide} title="新建幻灯片">
        <Plus size={20} />
      </button>

      {slides.length > 0 && (
        <div className="slide-nav">
          <button
            className="slide-nav-btn"
            onClick={goToPrevSlide}
            disabled={currentSlide === 0}
            title="上一张 (←)"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="slide-indicator">
            {currentSlide + 1} / {slides.length}
          </span>
          <button
            className="slide-nav-btn"
            onClick={goToNextSlide}
            disabled={currentSlide === slides.length - 1}
            title="下一张 (→)"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
};
