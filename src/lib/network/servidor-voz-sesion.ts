/**
 * Elección autogestionada del servidor de voz de la sesión.
 * Puro, sin red ni reloj externo: todo se inyecta.
 */

export interface OidoMedido {
  motor: string;
  idiomas: string[];
  tiempoReal: number;
  flujo: boolean;
}

export interface HablaMedida {
  motor: string;
  primerSonidoMs: number;
}

export interface VozNodo {
  oido: OidoMedido[];
  habla: HablaMedida[];
}

export interface FichaVoz {
  neuronId: string;
  cuentaId: string;
  at: number;
  ramLibreMb: number;
  voz?: VozNodo;
}

export interface SesionVoz {
  miembros: string[];
  tipo: string;
}

export interface EleccionServidorVoz {
  oido?: string;
  habla?: string;
  motivo: string;
}

const LATIDO_MAX_MS = 2 * 60 * 1000;
const RAM_MIN_MB = 256;
const MEJORA = 0.3;
const ES_A1 = (id: string) => id.startsWith("oracle-a1") || id === "a1";

function viva(f: FichaVoz, ahora: number) {
  return ahora - f.at >= 0 && ahora - f.at < LATIDO_MAX_MS;
}

function deConfianza(f: FichaVoz, miembros: string[]) {
  if (ES_A1(f.neuronId)) return true;
  return miembros.includes(f.cuentaId);
}

function candidata(f: FichaVoz, ahora: number, miembros: string[]) {
  return viva(f, ahora) && f.ramLibreMb >= RAM_MIN_MB && deConfianza(f, miembros) && f.voz;
}

function mejorOido(f: FichaVoz) {
  if (!f.voz?.oido?.length) return null;
  let best = f.voz.oido[0];
  for (const o of f.voz.oido) if (o.tiempoReal > best.tiempoReal) best = o;
  return { tiempoReal: best.tiempoReal };
}

function mejorHabla(f: FichaVoz) {
  if (!f.voz?.habla?.length) return null;
  let best = f.voz.habla[0];
  for (const h of f.voz.habla) if (h.primerSonidoMs < best.primerSonidoMs) best = h;
  return { primerSonidoMs: best.primerSonidoMs };
}

export function elegirServidorVoz(params: {
  sesion: SesionVoz;
  fichas: FichaVoz[];
  ahora: number;
  actual?: { oido?: string; habla?: string };
}): EleccionServidorVoz {
  const { sesion, fichas, ahora, actual } = params;
  const miembros = sesion.miembros ?? [];

  const filtradas = fichas.filter((f) => candidata(f, ahora, miembros));

  const buscarMejor = (actualId: string | undefined, getScore: (f: FichaVoz) => number | null, mejorQue: (nueva: number, actual: number) => boolean, motivoBase: string) => {
    let mejor: FichaVoz | null = null;
    let mejorScore = -Infinity;
    for (const f of filtradas) {
      const s = getScore(f);
      if (s == null) continue;
      if (s > mejorScore) { mejorScore = s; mejor = f; }
    }
    if (!mejor) return { id: undefined as string | undefined, motivo: `${motivoBase}: sin candidatos` };
    if (actualId && mejor.neuronId === actualId) return { id: mejor.neuronId, motivo: `${motivoBase}: se mantiene actual` };
    const actualFicha = fichas.find((f) => f.neuronId === actualId);
    const actualScore = actualFicha ? getScore(actualFicha) : null;
    if (actualId && actualScore != null && mejorScore != null) {
      const mejoraOk = mejorQue(mejorScore, actualScore);
      if (!mejoraOk) return { id: actualId, motivo: `${motivoBase}: histéresis, actual suficiente` };
    }
    return { id: mejor.neuronId, motivo: `${motivoBase}: ${mejor.neuronId}` };
  };

  const oido = buscarMejor(
    actual?.oido,
    (f) => mejorOido(f)?.tiempoReal ?? null,
    (nueva, actualScore) => nueva >= actualScore * (1 + MEJORA),
    "oido"
  );

  const habla = buscarMejor(
    actual?.habla,
    (f) => {
      const m = mejorHabla(f);
      return m ? -m.primerSonidoMs : null;
    },
    (nueva, actualScore) => nueva <= actualScore * (1 - MEJORA),
    "habla"
  );

  const motivo = `oido=${oido.motivo}; habla=${habla.motivo}`;
  return { oido: oido.id, habla: habla.id, motivo };
}
