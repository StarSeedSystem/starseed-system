import type { AdapterInfo } from './types';

export interface AdapterDetectionResult {
  usados: Array<'css' | 'waapi' | 'animejs' | 'lottie' | 'three' | 'typegpu' | 'gsap'>;
  editableVisualmente: boolean;
  motivo: string;
}

function detectarGsap(html: string): boolean {
  const patronGsap = /gsap\s*\(\s*\)|\$\s*\.gsap/g;
  if (patronGsap.test(html)) {
    return true;
  }
  if (html.includes('gsap') || html.includes('GSAP')) {
    return true;
  }
  return false;
}

export function detectarAdaptadores(html: string): AdapterDetectionResult {
  const usados: AdapterDetectionResult['usados'] = [];

  if (html.includes('animation:')) {
    usados.push('css');
  }

  if (html.includes('transform') && html.includes('animation')) {
    usados.push('waapi');
  }

  if (html.includes('animejs') || html.includes('anime(') || html.includes('anime')) {
    usados.push('animejs');
  }

  if (html.includes('lottie')) {
    usados.push('lottie');
  }

  if (html.includes('three.js') || html.includes('THREE.') || html.includes('Three')) {
    usados.push('three');
  }

  if (html.includes('typegpu') || html.includes('WebGPU')) {
    usados.push('typegpu');
  }

  const tieneGsap = detectarGsap(html);

  if (tieneGsap) {
    usados.push('gsap');
    return {
      usados,
      editableVisualmente: false,
      motivo: 'Licencia GSAP Standard: prohíbe usar GSAP en herramientas que permiten crear animaciones visuales sin código (editor visual). Sugerencia: convertir a WAAPI para edición visual.',
    };
  }

  return {
    usados,
    editableVisualmente: true,
    motivo: 'Cumple con la plantilla StarSeed (solo CSS/WAAPI).',
  };
}
