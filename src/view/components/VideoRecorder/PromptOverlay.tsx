import React, { useState, useCallback } from 'react';
import { X, GripHorizontal } from 'lucide-react';

interface PromptOverlayProps {
  isVisible: boolean;
  onClose: () => void;
}

export const PromptOverlay: React.FC<PromptOverlayProps> = ({
  isVisible,
  onClose,
}) => {
  const [prompts, setPrompts] = useState<string[]>(['']);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleAddPrompt = useCallback(() => {
    setPrompts([...prompts, '']);
  }, [prompts]);

  const handleRemovePrompt = useCallback((index: number) => {
    setPrompts(prompts.filter((_, i) => i !== index));
  }, [prompts]);

  const handlePromptChange = useCallback(
    (index: number, value: string) => {
      const newPrompts = [...prompts];
      newPrompts[index] = value;
      setPrompts(newPrompts);
    },
    [prompts]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    },
    [position]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  if (!isVisible) return null;

  return (
    <div
      className="prompt-overlay"
      style={{
        left: position.x,
        top: position.y,
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* 标题栏（可拖拽） */}
      <div className="prompt-header" onMouseDown={handleMouseDown}>
        <GripHorizontal size={16} />
        <span>提示词（仅自己可见）</span>
        <button className="prompt-close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {/* 提示词列表 */}
      <div className="prompt-list">
        {prompts.map((prompt, index) => (
          <div key={index} className="prompt-item">
            <textarea
              value={prompt}
              onChange={(e) => handlePromptChange(index, e.target.value)}
              placeholder={`提示词 ${index + 1}...`}
              rows={3}
            />
            {prompts.length > 1 && (
              <button
                className="prompt-remove"
                onClick={() => handleRemovePrompt(index)}
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 添加按钮 */}
      <button className="prompt-add" onClick={handleAddPrompt}>
        + 添加提示词
      </button>
    </div>
  );
};
