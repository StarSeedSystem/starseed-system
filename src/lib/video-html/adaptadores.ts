export function detectarAdaptadores(html: string): {
  usados: ('css' | 'waapi' | 'animejs' | 'lottie' | 'three' | 'typegpu' | 'gsap')[];
  editableVisualmente: boolean;
  motivo: string;
} {
  const usados: ('css' | 'waapi' | 'animejs' | 'lottie' | 'three' | 'typegpu' | 'gsap')[] = [];

  // Detect CSS animations or keyframes
  if (/@keyframes|animation\s*:/i.test(html)) {
    usados.push('css');
  }

  // Detect Web Animations API (waapi) - look for .animate() or getAnimations()
  if (/\.animate\s*\(|getAnimations\s*\(/i.test(html)) {
    usados.push('waapi');
  }

  // Detect anime.js
  if (/anime\s*\(|animejs/i.test(html)) {
    usados.push('animejs');
  }

  // Detect Lottie / bodymovin
  if (/lottie|bodymovin/i.test(html)) {
    usados.push('lottie');
  }

  // Detect Three.js
  if (/three\s*\.|THREE\s*\.|import.*three/i.test(html)) {
    usados.push('three');
  }

  // Detect TypeGPU
  if (/typegpu/i.test(html)) {
    usados.push('typegpu');
  }

  // Detect GSAP
  if (/gsap|Greensock|TweenMax|TimelineMax/i.test(html)) {
    usados.push('gsap');
  }

  let editableVisualmente = true;
  let motivo = '';

  if (usados.includes('gsap')) {
    editableVisualmente = false;
    motivo = 'GSAP detectado. Licencia GSAP Standard prohíbe usarla en herramientas que permiten crear animaciones visuales sin código. Se sugiere convertir a WAAPI.';
  }

  return {
    usados,
    editableVisualmente,
    motivo,
  };
}