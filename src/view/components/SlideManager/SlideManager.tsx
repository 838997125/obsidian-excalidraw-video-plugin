import React, { useState, useCallback, useEffect } from 'react';
import { ExcalidrawImperativeAPI } from '@zsviczian/excalidraw/types/excalidraw/types';
import { ExcalidrawElement } from '@zsviczian/excalidraw/types/element/src/types';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';

interface Slide {
  id: string;
  name: string;
  frameId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SlideManagerProps {
  excalidrawAPI: ExcalidrawImperativeAPI;
  onSlideChange?: (slideIndex: number, slide: Slide) => void;
}

export const SlideManager: React.FC<SlideManagerProps> = ({
  excalidrawAPI,
  onSlideChange,
}) => {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);

  // 从现有元素中加载幻灯片
  useEffect(() => {
    const elements = excalidrawAPI.getSceneElements();
    const existingSlides = elements
      .filter((el: any) => el.id?.startsWith('slide-'))
      .map((el: any, index: number) => ({
        id: el.id,
        name: el.name || `Slide ${index + 1}`,
        frameId: el.id,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
      }));

    if (existingSlides.length > 0) {
      setSlides(existingSlides);
    }
  }, [excalidrawAPI]);

  // 新建幻灯片
  const createNewSlide = useCallback(() => {
    const slideNumber = slides.length + 1;
    const frameId = `slide-${Date.now()}`;

    // 计算新幻灯片位置（横向排列）
    const SLIDE_WIDTH = 1000;
    const SLIDE_HEIGHT = 600;
    const GAP = 100;
    const x = slides.length > 0
      ? slides[slides.length - 1].x + SLIDE_WIDTH + GAP
      : 0;
    const y = 0;

    // 创建 Frame 元素（作为幻灯片底框）
    const frameElement: any = {
      type: 'frame',
      id: frameId,
      x,
      y,
      width: SLIDE_WIDTH,
      height: SLIDE_HEIGHT,
      name: `Slide ${slideNumber}`,
      backgroundColor: '#ffffff',
      strokeColor: '#e5e7eb',
      strokeWidth: 2,
      fillStyle: 'solid',
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      isDeleted: false,
    };

    // 添加到底框到画布
    const currentElements = excalidrawAPI.getSceneElements();
    excalidrawAPI.updateScene({
      elements: [...currentElements, frameElement as ExcalidrawElement],
    });

    const newSlide: Slide = {
      id: frameId,
      name: `Slide ${slideNumber}`,
      frameId,
      x,
      y,
      width: SLIDE_WIDTH,
      height: SLIDE_HEIGHT,
    };

    const newSlides = [...slides, newSlide];
    setSlides(newSlides);
    setCurrentSlide(newSlides.length - 1);
    onSlideChange?.(newSlides.length - 1, newSlide);

    // 自动跳转到新幻灯片
    setTimeout(() => {
      excalidrawAPI.scrollToContent(frameElement as ExcalidrawElement);
    }, 100);
  }, [slides, excalidrawAPI, onSlideChange]);

  // 切换幻灯片
  const switchToSlide = useCallback((index: number) => {
    if (index < 0 || index >= slides.length) return;

    setCurrentSlide(index);
    const slide = slides[index];
    onSlideChange?.(index, slide);

    // 获取 Frame 元素并跳转
    const elements = excalidrawAPI.getSceneElements();
    const frameElement = elements.find((el: ExcalidrawElement) => el.id === slide.frameId);

    if (frameElement) {
      excalidrawAPI.scrollToContent(frameElement);
    }
  }, [slides, excalidrawAPI, onSlideChange]);

  // 上一张
  const goToPrevSlide = useCallback(() => {
    switchToSlide(currentSlide - 1);
  }, [currentSlide, switchToSlide]);

  // 下一张
  const goToNextSlide = useCallback(() => {
    switchToSlide(currentSlide + 1);
  }, [currentSlide, switchToSlide]);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 只在非输入状态下响应
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

  return (
    <div className="slide-manager">
      {/* 标题 */}
      <div className="slide-header">
        <span className="slide-title">幻灯片</span>
        <span className="slide-count">{slides.length}</span>
      </div>

      {/* 幻灯片列表 */}
      <div className="slide-list">
        {slides.map((slide, index) => (
          <button
            key={slide.id}
            className={`slide-item ${index === currentSlide ? 'active' : ''}`}
            onClick={() => switchToSlide(index)}
            title={slide.name}
          >
            <span className="slide-number">{index + 1}</span>
          </button>
        ))}
      </div>

      {/* 新建按钮 */}
      <button className="slide-add-btn" onClick={createNewSlide} title="新建幻灯片">
        <Plus size={20} />
      </button>

      {/* 导航按钮 */}
      {slides.length > 1 && (
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
