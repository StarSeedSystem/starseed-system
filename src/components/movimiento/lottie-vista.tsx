'use client';

import { useEffect, useRef, useState } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

export interface LottieVistaProps {
  src: string;
  license?: string;
  author?: string;
  autoplay?: boolean;
  loop?: boolean;
  speed?: number;
}

export function LottieVista({
  src,
  license,
  author,
  autoplay = true,
  loop = true,
  speed = 1,
}: LottieVistaProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setIsReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const shouldPlay = !isReducedMotion && isVisible && autoplay;

  return (
    <div
      ref={ref}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <DotLottieReact
        src={src}
        autoplay={shouldPlay}
        loop={isReducedMotion ? false : loop}
        speed={isReducedMotion ? 0 : speed}
        style={{ width: '100%', height: '100%' }}
      />
      {(license || author) && (
        <div
          style={{
            position: 'absolute',
            bottom: '0.5rem',
            left: '0.5rem',
            fontSize: '0.75rem',
            color: 'rgba(0,0,0,0.7)',
            backgroundColor: 'rgba(255,255,255,0.8)',
            padding: '0.25rem 0.5rem',
            borderRadius: '0.25rem',
            backdropFilter: 'blur(2px)',
          }}
        >
          {author && <span>{author}</span>}
          {license && author && <span> • </span>}
          {license && <span>{license}</span>}
        </div>
      )}
    </div>
  );
}