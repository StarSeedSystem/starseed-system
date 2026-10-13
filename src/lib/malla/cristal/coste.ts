import type { Medio, SenalMedida } from './tipos';
import { puntuaLatencia, puntuaAnchoBanda } from '../../../ai/astraura/mesh/camr/metrica';

export const CAPACIDAD_KBPS: Record<Medio, number> = {
  lora: 5,
  ble: 1000,
  'wifi-lan': 100000,
  'wifi-mesh': 200000,
  webrtc: 20000,
  servidor: 10000,
  reticulum: 50,
  serie: 115,
  nfc: 400,
};

export function calidadSenal(s: SenalMedida): number {
  const medidas: { score: number; peso: number }[] = [];

  if (typeof s.rssiDbm === 'number') {
    const rssiNorm = Math.max(0, Math.min(1, (s.rssiDbm + 90) / 50));
    medidas.push({ score: rssiNorm, peso: 0.25 });
  }

  if (typeof s.snrDb === 'number') {
    const snrNorm = Math.max(0, Math.min(1, (s.snrDb + 20) / 35));
    medidas.push({ score: snrNorm, peso: 0.25 });
  }

  if (typeof s.rttMs === 'number') {
    const rttScore = puntuaLatencia(s.rttMs);
    medidas.push({ score: rttScore, peso: 0.2 });
  }

  if (typeof s.anchoBandaKbps === 'number') {
    const cap = CAPACIDAD_KBPS[s.medio] ?? 0;
    const anchoScore = puntuaAnchoBanda(s.anchoBandaKbps, cap);
    medidas.push({ score: anchoScore, peso: 0.2 });
  }

  if (typeof s.perdidaPct === 'number') {
    const perdidaScore = Math.max(0, Math.min(1, 1 - s.perdidaPct / 30));
    medidas.push({ score: perdidaScore, peso: 0.1 });
  }

  if (medidas.length === 0) return 0.3;

  const pesoTotal = medidas.reduce((acc, m) => acc + m.peso, 0);
  const sumaPonderada = medidas.reduce((acc, m) => acc + m.score * m.peso, 0);
  return sumaPonderada / pesoTotal;
}

export function costeSenal(s: SenalMedida, confianzaNodo = 1): number {
  const calidad = calidadSenal(s);
  return (1 - calidad) + (1 - confianzaNodo) * 0.5;
}
