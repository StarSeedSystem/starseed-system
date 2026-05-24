'use client';

import React, { useState, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Theme Constants (from config/theme_params.json) ──────────────────────────
const THEME = {
  surface: 'rgba(15, 15, 35, 0.65)',
  surfaceElevated: 'rgba(20, 20, 45, 0.75)',
  glassBorder: 'rgba(255, 255, 255, 0.12)',
  glassHighlight: 'rgba(255, 255, 255, 0.25)',
  backdropBlur: '16px',
  borderRadius: '24px',
  titleBarHeight: '44px',
  textPrimary: '#F8FAFC',
  textSecondary: 'rgba(248, 250, 252, 0.7)',
  textMuted: 'rgba(248, 250, 252, 0.4)',
  shadows: {
    resting: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
    focused: '0 16px 48px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(139, 92, 246, 0.2)',
    extreme: '0 24px 64px rgba(0, 0, 0, 0.5)',
  },
};

const SPRINGS = {
  windowEnter: { type: 'spring' as const, stiffness: 260, damping: 22, mass: 0.7 },
  windowExit: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const },
  tabSwitch: { type: 'tween' as const, duration: 0.25, ease: [0.22, 1, 0.36, 1] as const },
};

// ── Props ────────────────────────────────────────────────────────────────────
interface WindowFrameProps {
  children: React.ReactNode;
  title?: string;
  titleBarStyle?: 'minimal' | 'liquid' | 'skeuomorphic';
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  isFocused?: boolean;
  className?: string;
}

interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface TabbedWindowProps extends Omit<WindowFrameProps, 'title'> {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
  tabTransition?: 'fade' | 'slide';
}

// ── WindowFrame ──────────────────────────────────────────────────────────────
export const WindowFrame: React.FC<WindowFrameProps> = ({
  children,
  title,
  titleBarStyle = 'liquid',
  onClose,
  onMinimize,
  onMaximize,
  isFocused = true,
  className = '',
}) => {
  const sysId = useId().replace(/:/g, '').slice(0, 5).toUpperCase();

  const trafficLightClasses = (color: string, hoverColor: string) =>
    `w-3 h-3 rounded-full ${color} hover:${hoverColor} transition-all duration-200 cursor-pointer shadow-inner`;

  const titleBarVariants: Record<string, string> = {
    minimal: 'border-b border-white/5',
    liquid: 'border-b border-white/5 bg-gradient-to-r from-white/[0.03] to-transparent',
    skeuomorphic: 'border-b border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02]',
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 24 }}
      transition={SPRINGS.windowEnter}
      className={`relative overflow-hidden flex flex-col ${className}`}
      style={{
        background: `linear-gradient(145deg, ${isFocused ? THEME.surfaceElevated : THEME.surface} 0%, rgba(15, 15, 35, 0.35) 100%)`,
        backdropFilter: `blur(${THEME.backdropBlur}) saturate(180%)`,
        WebkitBackdropFilter: `blur(${THEME.backdropBlur}) saturate(180%)`,
        border: `1px solid ${isFocused ? 'rgba(255, 255, 255, 0.18)' : THEME.glassBorder}`,
        borderRadius: THEME.borderRadius,
        boxShadow: isFocused ? THEME.shadows.focused : THEME.shadows.resting,
        transition: 'box-shadow 0.4s ease, border-color 0.4s ease',
      }}
    >
      {/* Refraction Glossy Overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background: `
            radial-gradient(ellipse at 30% 0%, rgba(255,255,255,0.12) 0%, transparent 60%),
            radial-gradient(ellipse at 70% 100%, rgba(139,92,246,0.04) 0%, transparent 50%)
          `,
        }}
      />

      {/* Chromatic top edge */}
      <div
        className="absolute top-0 left-[10%] right-[10%] h-px pointer-events-none z-10"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.4), rgba(0,127,255,0.3), rgba(16,185,129,0.3), rgba(255,191,0,0.3), transparent)',
        }}
      />

      {/* Title Bar */}
      <div
        className={`relative z-10 flex items-center justify-between px-4 select-none ${titleBarVariants[titleBarStyle]}`}
        style={{ height: THEME.titleBarHeight }}
      >
        <div className="flex items-center gap-2">
          <div className="flex gap-2">
            <button onClick={onClose} className={trafficLightClasses('bg-red-400', 'bg-red-500')} aria-label="Close" />
            <button onClick={onMinimize} className={trafficLightClasses('bg-yellow-400', 'bg-yellow-500')} aria-label="Minimize" />
            <button onClick={onMaximize} className={trafficLightClasses('bg-green-400', 'bg-green-500')} aria-label="Maximize" />
          </div>
          <span className="ml-4 text-sm font-medium tracking-wide" style={{ color: THEME.textSecondary }}>
            {title || 'Antigravity Module'}
          </span>
        </div>
        <div className="text-xs font-mono" style={{ color: THEME.textMuted }}>
          SYS.{sysId}
        </div>
      </div>

      {/* Content Area */}
      <div className="relative z-10 flex-1 overflow-auto p-4" style={{ color: THEME.textPrimary }}>
        {children}
      </div>

      {/* Scanline Noise */}
      <div
        className="absolute inset-0 z-0 opacity-[0.02] pointer-events-none"
        style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 4px)' }}
      />
    </motion.div>
  );
};

// ── TabbedWindow ─────────────────────────────────────────────────────────────
export const TabbedWindow: React.FC<TabbedWindowProps> = ({
  children,
  tabs,
  activeTab,
  onTabChange,
  tabTransition = 'fade',
  titleBarStyle = 'liquid',
  onClose,
  onMinimize,
  onMaximize,
  isFocused = true,
  className = '',
}) => {
  const sysId = useId().replace(/:/g, '').slice(0, 5).toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 24 }}
      transition={SPRINGS.windowEnter}
      className={`relative overflow-hidden flex flex-col ${className}`}
      style={{
        background: `linear-gradient(145deg, ${isFocused ? THEME.surfaceElevated : THEME.surface} 0%, rgba(15, 15, 35, 0.35) 100%)`,
        backdropFilter: `blur(${THEME.backdropBlur}) saturate(180%)`,
        WebkitBackdropFilter: `blur(${THEME.backdropBlur}) saturate(180%)`,
        border: `1px solid ${isFocused ? 'rgba(255, 255, 255, 0.18)' : THEME.glassBorder}`,
        borderRadius: THEME.borderRadius,
        boxShadow: isFocused ? THEME.shadows.focused : THEME.shadows.resting,
      }}
    >
      {/* Refraction Overlay */}
      <div className="absolute inset-0 pointer-events-none z-0" style={{
        background: 'radial-gradient(ellipse at 30% 0%, rgba(255,255,255,0.1) 0%, transparent 60%)',
      }} />

      {/* Title Bar + Traffic Lights */}
      <div className="relative z-10 flex items-center gap-2 px-4 pt-3 pb-0 select-none">
        <div className="flex gap-2">
          <button onClick={onClose} className="w-3 h-3 rounded-full bg-red-400 hover:bg-red-500 transition-colors cursor-pointer shadow-inner" aria-label="Close" />
          <button onClick={onMinimize} className="w-3 h-3 rounded-full bg-yellow-400 hover:bg-yellow-500 transition-colors cursor-pointer shadow-inner" aria-label="Minimize" />
          <button onClick={onMaximize} className="w-3 h-3 rounded-full bg-green-400 hover:bg-green-500 transition-colors cursor-pointer shadow-inner" aria-label="Maximize" />
        </div>
        <div className="flex-1" />
        <div className="text-xs font-mono" style={{ color: THEME.textMuted }}>SYS.{sysId}</div>
      </div>

      {/* Tab Bar */}
      <div className="relative z-10 flex items-end gap-0.5 px-4 pt-2 border-b border-white/5">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative px-4 py-2 text-sm font-medium transition-colors duration-200 cursor-pointer ${isActive ? 'text-white' : 'text-white/50 hover:text-white/70'
                }`}
              style={{ borderRadius: '16px 16px 0 0' }}
            >
              <span className="relative z-10 flex items-center gap-1.5">
                {tab.icon}
                {tab.label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute inset-0"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: '16px 16px 0 0',
                  }}
                  transition={SPRINGS.tabSwitch}
                />
              )}
            </button>
          );
        })}
        {/* Active tab underline glow */}
        <motion.div
          className="absolute bottom-0 h-0.5"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.6), transparent)',
            width: `${100 / tabs.length}%`,
            left: `${(tabs.findIndex((t) => t.id === activeTab) / tabs.length) * 100}%`,
          }}
          layout
          transition={SPRINGS.tabSwitch}
        />
      </div>

      {/* Tab Content */}
      <div className="relative z-10 flex-1 overflow-auto p-4" style={{ color: THEME.textPrimary }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: tabTransition === 'slide' ? 16 : 0 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: tabTransition === 'slide' ? -16 : 0 }}
            transition={SPRINGS.tabSwitch}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

// ── ModalOverlay ─────────────────────────────────────────────────────────────
export const ModalOverlay: React.FC<{
  children: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
}> = ({ children, isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 50 }}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />
      <motion.div
        className="relative w-full max-w-2xl"
        style={{ zIndex: 10 }}
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={SPRINGS.windowEnter}
      >
        {children}
      </motion.div>
    </div>
  );
};
