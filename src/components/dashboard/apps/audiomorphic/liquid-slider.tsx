"use client";

/** Port verbatim de `components/LiquidSlider.tsx` (repo audiomorphic-ar). */
import React, { useState, useRef, useEffect } from 'react';

interface LiquidSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  disabled?: boolean;
}

const LiquidSlider: React.FC<LiquidSliderProps> = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  className = '',
  disabled = false
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const percentage = ((value - min) / (max - min)) * 100;

  const handleInteraction = (clientX: number) => {
    if (!containerRef.current || disabled) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const rawValue = (x / rect.width) * (max - min) + min;
    const steppedValue = Math.round(rawValue / step) * step;
    onChange(Math.max(min, Math.min(max, steppedValue)));
  };

  const onMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleInteraction(e.clientX);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    handleInteraction(e.touches[0].clientX);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) handleInteraction(e.clientX);
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (isDragging) handleInteraction(e.touches[0].clientX);
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div 
      ref={containerRef}
      className={`relative h-6 flex items-center group ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    >
      {/* Track Background */}
      <div className="absolute inset-0 h-1.5 my-auto w-full bg-white/5 rounded-full overflow-hidden border border-white/5 shadow-inner" />
      
      {/* Progress Fill */}
      <div 
        className="absolute h-1.5 my-auto bg-gradient-to-r from-cyan-500/50 to-purple-500/80 rounded-full transition-all duration-75 ease-out shadow-[0_0_8px_rgba(6,182,212,0.3)]"
        style={{ width: `${percentage}%` }}
      />

      {/* Slider Thumb (Liquid Bubble) */}
      <div 
        className={`absolute h-4 w-4 bg-white rounded-full shadow-[0_0_12px_rgba(255,255,255,0.4)] border border-cyan-200/50 transition-all duration-75 ease-out z-10 
          ${isDragging ? 'scale-125 ring-4 ring-white/10' : 'group-hover:scale-110'}`}
        style={{ 
          left: `calc(${percentage}% - 8px)`,
          background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,1), rgba(6,182,212,0.6))'
        }}
      >
        {/* Active Value Bubble */}
        {(isDragging || !disabled) && (
          <div className={`absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-mono text-cyan-200 border border-cyan-500/30 transition-opacity duration-200 ${isDragging ? 'opacity-100 scale-110' : 'opacity-0 scale-95 group-hover:opacity-100'}`}>
            {value.toFixed(1)}
          </div>
        )}
      </div>

      {/* Discrete Steps (Subtle Indicators) */}
      <div className="absolute inset-0 h-1.5 my-auto pointer-events-none flex justify-between px-1 opacity-20">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="w-[1px] h-1 bg-white/50" />
        ))}
      </div>
    </div>
  );
};

export default LiquidSlider;
