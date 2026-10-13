import type { Medio, NeuronaReticula, SenalMedida } from './tipos';

export function distanciaPorSenal(s: SenalMedida): number | null {
  if (s.medio === 'wifi-lan' || s.medio === 'wifi-mesh') {
    if (typeof s.rssiDbm !== 'number') return null;
    const rssi0 = -40;
    const n = 2.7;
    const d = Math.pow(10, (rssi0 - s.rssiDbm) / (10 * n));
    return Math.max(1, Math.min(300, d));
  }
  if (s.medio === 'ble') {
    if (typeof s.rssiDbm !== 'number') return null;
    const rssi0 = -59;
    const n = 2.7;
    const d = Math.pow(10, (rssi0 - s.rssiDbm) / (10 * n));
    return Math.max(1, Math.min(300, d));
  }
  if (s.medio === 'lora') {
    if (typeof s.snrDb !== 'number') return null;
    const snr = s.snrDb;
    if (snr >= 10) return 500;
    if (snr <= -20) return 15000;
    const t = (snr + 20) / 30;
    return 15000 - t * 14500;
  }
  if (s.medio === 'nfc') {
    return 0.1;
  }
  return null;
}

export function multilateracion(anclas: Array<{ x: number; y: number; d: number }>): { x: number; y: number } | null {
  if (!anclas || anclas.length < 3) return null;

  let x = anclas.reduce((acc, a) => acc + a.x, 0) / anclas.length;
  let y = anclas.reduce((acc, a) => acc + a.y, 0) / anclas.length;

  for (let iter = 0; iter < 25; iter++) {
    let jtr00 = 0, jtr01 = 0, jtr11 = 0;
    let jt_r0 = 0, jt_r1 = 0;

    for (const anchor of anclas) {
      const dx = x - anchor.x;
      const dy = y - anchor.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r < 1e-6) continue;
      const ri = r - anchor.d;

      const j0 = dx / r;
      const j1 = dy / r;

      jtr00 += j0 * j0;
      jtr01 += j0 * j1;
      jtr11 += j1 * j1;

      jt_r0 += j0 * ri;
      jt_r1 += j1 * ri;
    }

    const det = jtr00 * jtr11 - jtr01 * jtr01;
    if (Math.abs(det) < 1e-12) break;

    const inv00 = jtr11 / det;
    const inv01 = -jtr01 / det;
    const inv11 = jtr00 / det;

    const deltaX = -(inv00 * jt_r0 + inv01 * jt_r1);
    const deltaY = -(inv01 * jt_r0 + inv11 * jt_r1);

    x += deltaX;
    y += deltaY;

    if (Math.hypot(deltaX, deltaY) < 1e-4) break;
  }

  return { x, y };
}

export function posicionesEstimadas(
  neuronas: NeuronaReticula[],
  senales: SenalMedida[]
): Record<string, { x: number; y: number; estimada: boolean }> {
  const result: Record<string, { x: number; y: number; estimada: boolean }> = {};
  const posMap: Record<string, { x: number; y: number }> = {};

  for (const n of neuronas) {
    if (n.posicion && typeof n.posicion.x === 'number' && typeof n.posicion.y === 'number') {
      posMap[n.id] = { x: n.posicion.x, y: n.posicion.y };
      result[n.id] = { x: n.posicion.x, y: n.posicion.y, estimada: false };
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const n of neuronas) {
      if (posMap[n.id]) continue;

      const anchors: Array<{ x: number; y: number; d: number }> = [];
      for (const s of senales) {
        let neighborId: string | null = null;
        if (s.de === n.id) neighborId = s.a;
        else if (s.a === n.id) neighborId = s.de;

        if (neighborId && posMap[neighborId]) {
          const d = distanciaPorSenal(s);
          if (d !== null) {
            anchors.push({ x: posMap[neighborId].x, y: posMap[neighborId].y, d });
          }
        }
      }

      if (anchors.length >= 3) {
        const coords = multilateracion(anchors);
        if (coords) {
          posMap[n.id] = coords;
          result[n.id] = { x: coords.x, y: coords.y, estimada: true };
          changed = true;
        }
      }
    }
  }

  const unlocated = neuronas.filter((n) => !posMap[n.id]).sort((a, b) => a.id.localeCompare(b.id));
  if (unlocated.length > 0) {
    const locatedValues = Object.values(posMap);
    let cx = 0, cy = 0;
    if (locatedValues.length > 0) {
      cx = locatedValues.reduce((acc, p) => acc + p.x, 0) / locatedValues.length;
      cy = locatedValues.reduce((acc, p) => acc + p.y, 0) / locatedValues.length;
    }

    const totalUnloc = unlocated.length;
    unlocated.forEach((n, idx) => {
      const angle = (2 * Math.PI * idx) / totalUnloc;
      const x = cx + 50 * Math.cos(angle);
      const y = cy + 50 * Math.sin(angle);
      result[n.id] = { x, y, estimada: true };
    });
  }

  return result;
}
