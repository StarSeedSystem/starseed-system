// Malla cristalina SiO₂ amorfa: cristalización pura, sin node:* ni Supabase
import { 
  NeuronaReticula, 
  SenalMedida, 
  Tesela, 
  Reticula, 
  Puente, 
  Cristal, 
  EstadoVitreo,
  Medio,
  coordinacionDe,
  claveSenal
} from "./tipos";
import { costeSenal } from './coste';

export function temperaturaDe(
  historial: Array<{clave: string; t: number; calidad: number}>,
  ventanaMs = 120000,
  ahora: number
): Record<string, number> {
  const inicio = ahora - ventanaMs;
  const claves = [...new Set(historial.map(e => e.clave))];
  const out: Record<string, number> = {};
  for (const c of claves) {
    const vals = historial.filter(e => e.clave === c && e.t >= inicio && e.t <= ahora).map(e => e.calidad);
    if (vals.length === 0) { out[c] = 0.5; continue; }
    const media = vals.reduce((s, v) => s + v, 0) / vals.length;
    const varianza = vals.reduce((s, v) => s + (v - media) ** 2, 0) / vals.length;
    const desv = Math.sqrt(varianza);
    let t = desv * 4;
    if (t > 1) t = 1;
    out[c] = t;
  }
  return out;
}

export function estadoDe(t: number): EstadoVitreo {
  return t >= 0.6 ? 'fundido' : t >= 0.25 ? 'subenfriado' : 'vitreo';
}

export function cristalizar(
  r: Reticula,
  opc: {confianza?: Record<string, number>; temperatura?: Record<string, number>} = {}
): Cristal {
  const conf = opc.confianza ?? {};
  let temps: Record<string, number>;
  if (opc.temperatura) temps = opc.temperatura;
  else {
    const ids: string[] = [];
    for (const k in r.teselas) ids.push(k);
    temps = {};
    for (const id of ids) temps[id] = 0.5;
  }

  const senales: SenalMedida[] = [];
  for (const k in r.teselas) senales.push(...r.teselas[k].senales);

  const puentes: Puente[] = [];
  const seen = new Set<string>();
  for (const s of senales) {
    let a = s.de, b = s.a;
    if (a > b) [a, b] = [b, a];
    const key = `${a}|${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const confA = conf[s.de] ?? 1;
    const confB = conf[s.a] ?? 1;
    const confMed = (confA + confB) / 2;
    const coste = costeSenal(s, confMed);
    puentes.push({a, b, medio: s.medio, coste});
  }

  if (puentes.length === 0) {
    const withPos: {id: string; p: {x: number; y: number}}[] = [];
    for (const k in r.teselas) {
      const tes = r.teselas[k];
      if (tes.neurona.posicion) withPos.push({id: tes.neurona.id, p: tes.neurona.posicion});
    }
    const WIFI_RANGE = 300;
    for (let i = 0; i < withPos.length; i++) {
      for (let j = i + 1; j < withPos.length; j++) {
        const {id: idA, p: posA} = withPos[i];
        const {id: idB, p: posB} = withPos[j];
        const dx = posA.x - posB.x, dy = posA.y - posB.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > WIFI_RANGE) continue;
        const neurA = r.teselas[idA].neurona;
        const neurB = r.teselas[idB].neurona;
        const shared = neurA.medios.filter(m => neurB.medios.includes(m));
        if (shared.length === 0) continue;
        const medio = shared[0];
        let a = idA, b = idB;
        if (a > b) [a, b] = [b, a];
        const key = `${a}|${b}`;
        if (seen.has(key)) continue;
        seen.add(key);
        puentes.push({a, b, medio, coste: 0.8});
      }
    }
  }

  const vals = Object.values(temps);
  const mediaTemp = vals.reduce((s, v) => s + v, 0) / vals.length || 0.5;
  const estado = estadoDe(mediaTemp);
  const huella = '' + ':' + puentes.length;

  const coord: Record<string, number> = {};
  const ids: string[] = [];
  for (const k in r.teselas) ids.push(k);
  for (const id of ids) {
    let g = 0;
    for (const p of puentes) {
      if (p.a === id || p.b === id) g++;
    }
    coord[id] = g;
  }

  return {puentes, estado, temperatura: temps, huella, coordinacion: coord};
}