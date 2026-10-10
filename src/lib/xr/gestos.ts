// Gestos de manos puros para XR: entrada = articulaciones (datos), salida = eventos.
// Sin APIs de navegador; los nombres de articulación siguen WebXR Hand.
import type { Vec3 } from "./tipos";
import { activacionMenu } from "./espacio-trinity";
import { GESTOS_RESERVADOS } from "./vinculos-xr";

export type Articulaciones = Partial<Record<string, Vec3>>;
export type Mano = "izquierda" | "derecha";
export type TipoGesto =
  | "pellizco"
  | "puno-cerrado"
  | "palma-a-la-cara"
  | "tocar-muneca";

export interface ContextoGestos {
  cabeza?: Vec3;
  otraMano?: Articulaciones;
}

export interface ResultadoDetector {
  activo: boolean;
  flanco: "sube" | "baja" | null;
}

export interface OpcionesDetector {
  retencionMs?: number;
}

const RETENCION_MS = 120;
const PELLIZCO_CIERRA = 0.015;
const PELLIZCO_ABRE = 0.03;
const PUNO_RADIO = 0.06;
const TOCAR_MUNECA = 0.04;

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function resta(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cruz(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalizar(v: Vec3): Vec3 {
  const m = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

function punto(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

const PUNTAS = [
  "index-finger-tip",
  "middle-finger-tip",
  "ring-finger-tip",
  "pinky-finger-tip",
];

export function distanciaPellizco(art: Articulaciones): number | null {
  const pulgar = art["thumb-tip"];
  const indice = art["index-finger-tip"];
  if (!pulgar || !indice) return null;
  return dist(pulgar, indice);
}

function medicion(tipo: TipoGesto, art: Articulaciones, ctx: ContextoGestos): boolean | null {
  switch (tipo) {
    case "pellizco": {
      const d = distanciaPellizco(art);
      if (d === null) return false;
      if (d < PELLIZCO_CIERRA) return true;
      if (d > PELLIZCO_ABRE) return false;
      return null;
    }
    case "puno-cerrado": {
      const m1 = art["index-finger-metacarpal"];
      const m2 = art["pinky-finger-metacarpal"];
      const m3 = art["wrist"];
      if (!m1 || !m2 || !m3) return false;
      const centro: Vec3 = {
        x: (m1.x + m2.x + m3.x) / 3,
        y: (m1.y + m2.y + m3.y) / 3,
        z: (m1.z + m2.z + m3.z) / 3,
      };
      let cerrado = 0;
      for (const p of PUNTAS) {
        const v = art[p];
        if (!v) return false;
        if (dist(v, centro) < PUNO_RADIO) cerrado += 1;
      }
      return cerrado === PUNTAS.length;
    }
    case "palma-a-la-cara": {
      const n = normalDePalma(art, "izquierda");
      const cabeza = ctx.cabeza;
      const m3 = art["wrist"];
      if (!n || !cabeza || !m3) return false;
      const hacia = normalizar(resta(cabeza, m3));
      return punto(n, hacia) >= activacionMenu.cosenoPalma;
    }
    case "tocar-muneca": {
      const indice = art["index-finger-tip"];
      const muneca = ctx.otraMano?.["wrist"];
      if (!indice || !muneca) return false;
      return dist(indice, muneca) < TOCAR_MUNECA;
    }
  }
}

export function normalDePalma(art: Articulaciones, mano: Mano): Vec3 | null {
  const m1 = art["index-finger-metacarpal"];
  const m2 = art["pinky-finger-metacarpal"];
  const m3 = art["wrist"];
  if (!m1 || !m2 || !m3) return null;
  let n = normalizar(cruz(resta(m1, m3), resta(m2, m3)));
  if (mano === "derecha") n = { x: -n.x, y: -n.y, z: -n.z };
  return n;
}

function esGestoReservado(tipo: TipoGesto, art: Articulaciones, ctx: ContextoGestos): boolean {
  if (!GESTOS_RESERVADOS.includes(tipo)) return false;
  const n = normalDePalma(art, "izquierda");
  if (!n || !ctx.cabeza || !art["wrist"]) return false;
  const hacia = normalizar(resta(ctx.cabeza, art["wrist"] as Vec3));
  return punto(n, hacia) >= activacionMenu.cosenoPalma;
}

export function crearDetector(
  tipo: TipoGesto,
  opciones: OpcionesDetector = {},
): { actualizar(art: Articulaciones, ctx: ContextoGestos, ahora: number): ResultadoDetector } {
  const retencion = opciones.retencionMs ?? RETENCION_MS;
  let activo = false;
  let candidato = false;
  let desde: number | null = null;
  return {
    actualizar(art, ctx, ahora) {
      if (esGestoReservado(tipo, art, ctx)) {
        if (activo) {
          activo = false;
          desde = null;
          return { activo: false, flanco: "baja" };
        }
        desde = null;
        return { activo: false, flanco: null };
      }
      const cruda = medicion(tipo, art, ctx);
      const medida = cruda === null ? activo : cruda;
      if (medida !== candidato) {
        candidato = medida;
        desde = ahora;
        return { activo, flanco: null };
      }
      if (medida !== activo && desde !== null && ahora - desde >= retencion) {
        activo = medida;
        desde = null;
        return { activo, flanco: medida ? "sube" : "baja" };
      }
      return { activo, flanco: null };
    },
  };
}
