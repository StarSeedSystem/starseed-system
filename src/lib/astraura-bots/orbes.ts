// src/lib/astraura-bots/orbes.ts (BOT1011C1)
export const MAX_ORBES_VISIBLES = 5;

export interface PosOrbe {
  xRatio: number;
  yRatio: number;
}

export function disposicionOrbes(
  abiertos: readonly { id: string; principal?: boolean; pos?: PosOrbe }[],
  vista: { ancho: number; alto: number; diametro: number }
): { id: string; pos: PosOrbe; visible: boolean }[] {
  if (!abiertos.length) return [];
  const { ancho, alto, diametro } = vista;
  const radio = diametro / 2;
  const minDist = diametro + 8;
  const margenX = radio / ancho;
  const margenY = radio / alto;
  const aPix = (x: number, y: number) => ({ x: x * ancho, y: y * alto });
  const dist = (p1: { x: number; y: number }, p2: { x: number; y: number }) =>
    Math.hypot(p1.x - p2.x, p1.y - p2.y);
  const enMargen = (p: PosOrbe) =>
    p.xRatio >= margenX && p.xRatio <= 1 - margenX &&
    p.yRatio >= margenY && p.yRatio <= 1 - margenY;
  const seSolapan = (p1: PosOrbe, p2: PosOrbe) =>
    dist(aPix(p1.xRatio, p1.yRatio), aPix(p2.xRatio, p2.yRatio)) < minDist;

  // principal index
  let priIdx = abiertos.findIndex(o => o.principal);
  if (priIdx < 0) priIdx = 0;

  // initial positions
  const initPos: (PosOrbe | null)[] = abiertos.map((o, i) =>
    i === priIdx ? o.pos ?? { xRatio: 0.9, yRatio: 0.88 } : o.pos ?? null
  );

  // final positions
  const finPos: PosOrbe[] = [];
  for (let i = 0; i < abiertos.length; i++) {
    if (initPos[i] !== null) {
      finPos[i] = initPos[i];
    } else {
      const priPos = finPos[priIdx];
      if (!priPos) {
        finPos[i] = { xRatio: 0.5, yRatio: 0.5 };
        continue;
      }
      const priPix = aPix(priPos.xRatio, priPos.yRatio);
      let placed = false;
      for (let attempt = 0; attempt < 100 && !placed; attempt++) {
        const angle = (attempt % 12) * (Math.PI / 6);
        const radius = minDist + Math.floor(attempt / 12) * 5;
        const candPix = {
          x: priPix.x + radius * Math.cos(angle),
          y: priPix.y + radius * Math.sin(angle),
        };
        const cand: PosOrbe = {
          xRatio: candPix.x / ancho,
          yRatio: candPix.y / alto,
        };
        if (!enMargen(cand)) continue;
        let overlap = false;
        for (let j = 0; j < i; j++) {
          if (seSolapan(cand, finPos[j])) {
            overlap = true;
            break;
          }
        }
        if (overlap) continue;
        finPos[i] = cand;
        placed = true;
      }
      if (!placed) finPos[i] = { xRatio: 0.5, yRatio: 0.5 };
    }
  }

  // adjust positions
  for (let i = 0; i < finPos.length; i++) {
    let pos = finPos[i];
    // clamp to margins
    pos = {
      xRatio: Math.max(margenX, Math.min(1 - margenX, pos.xRatio)),
      yRatio: Math.max(margenY, Math.min(1 - margenY, pos.yRatio)),
    };
    let attempts = 0;
    while (attempts < 50) {
      let overlap = false;
      for (let j = 0; j < i; j++) {
        if (seSolapan(pos, finPos[j])) {
          overlap = true;
          break;
        }
      }
      if (!overlap) break;
      const pix = aPix(pos.xRatio, pos.yRatio);
      const angle = (attempts * 0.5) * (Math.PI / 180);
      const radius = 1 + attempts * 0.5;
      pix.x += radius * Math.cos(angle);
      pix.y += radius * Math.sin(angle);
      pos = {
        xRatio: Math.max(margenX, Math.min(1 - margenX, pix.x / ancho)),
        yRatio: Math.max(margenY, Math.min(1 - margenY, pix.y / alto)),
      };
      attempts++;
    }
    finPos[i] = pos;
  }

  // visibility
  return abiertos.map((o, i) => ({
    id: o.id,
    pos: finPos[i],
    visible: i < MAX_ORBES_VISIBLES,
  }));
}

export function ordenZ(ids: readonly string[], enfocado: string): string[] {
  const cnt = ids.filter(i => i === enfocado).length;
  if (!cnt) return [...ids];
  const without = ids.filter(i => i !== enfocado);
  return [...without, ...Array(cnt).fill(enfocado)];
}