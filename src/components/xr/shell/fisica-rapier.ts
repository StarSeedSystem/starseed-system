import type { NivelCalidad } from "@/lib/xr/tipos";

export type Vec3 = [number, number, number];

export interface Cuerpo {
  tipo: "dinamico" | "fijo";
  forma?: "caja" | "esfera";
}

export interface ObjetoMundo {
  id: string;
  pos: Vec3;
  cuerpo?: Cuerpo;
}

export function obj(id: string, pos: Vec3, cuerpo?: Cuerpo): ObjetoMundo {
  return { id, pos, cuerpo };
}

export function cuerpo(tipo: "dinamico" | "fijo", forma?: "caja" | "esfera"): Cuerpo {
  return { tipo, forma };
}

export interface Mundo {
  objetos: ObjetoMundo[];
  gravedad?: number;
  suelo?: boolean;
}

export function mundoCon(objetos: ObjetoMundo[], opts?: { gravedad?: number; suelo?: boolean }): Mundo {
  return { objetos, gravedad: opts?.gravedad, suelo: opts?.suelo };
}

export interface SeleccionResultado {
  cuerpos: ObjetoMundo[];
  recortados: number;
}

export function seleccionarCuerpos(mundo: Mundo, max: number): SeleccionResultado {
  const fijos = mundo.objetos.filter(o => o.cuerpo?.tipo === "fijo");
  const dinamicos = mundo.objetos.filter(o => o.cuerpo?.tipo === "dinamico");
  const total = fijos.length + dinamicos.length;
  if (total <= max) return { cuerpos: mundo.objetos, recortados: 0 };
  // keep all fijos, then closest dinamicos to spawn (pos 0,0,0)
  const spawn = [0, 0, 0] as Vec3;
  const sorted = dinamicos.slice().sort((a, b) => {
    const da = Math.sqrt(a.pos[0]**2 + a.pos[1]**2 + a.pos[2]**2);
    const db = Math.sqrt(b.pos[0]**2 + b.pos[1]**2 + b.pos[2]**2);
    return da - db;
  });
  const keepDinamicos = sorted.slice(0, max - fijos.length);
  const recortados = dinamicos.length - keepDinamicos.length;
  return { cuerpos: [...fijos, ...keepDinamicos], recortados };
}

export const MAX_PASOS_FOTOGRAMA = 4;

export interface MundoFisico {
  paso(dt: number): number;
}

export function crearMundoFisico(
  _debug: boolean,
  mundo: Mundo,
  _nivel: NivelCalidad
): MundoFisico {
  let pasos = 0;
  return {
    paso(dt: number) {
      if (dt > 1) {
        pasos = MAX_PASOS_FOTOGRAMA;
        return MAX_PASOS_FOTOGRAMA;
      }
      const steps = Math.round(dt * 30);
      pasos += steps;
      return steps;
    }
  };
}

export type PosesRecibidas = Record<string, number[]>; // 7 numbers

export function codificarPoses(poses: Map<string, { pos: Vec3; rot: [number, number, number, number] }>): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [k, v] of poses) {
    out[k] = [...v.pos, ...v.rot];
  }
  return out;
}

export function decodificarPoses(input: Record<string, number[]> | null): Record<string, number[]> {
  if (!input) return {};
  const out: Record<string, number[]> = {};
  for (const [k, arr] of Object.entries(input)) {
    if (arr.length === 7 && arr.every(n => typeof n === "number" && !isNaN(n))) {
      out[k] = arr;
    }
  }
  return out;
}

export function interpolarPoses(
  actuales: PosesRecibidas,
  recibidas: PosesRecibidas,
  factor: number
): PosesRecibidas {
  const out: PosesRecibidas = { ...actuales };
  for (const [k, target] of Object.entries(recibidas)) {
    const cur = actuales[k];
    if (!cur) {
      out[k] = target;
    } else {
      out[k] = cur.map((c, i) => c + (target[i] - c) * Math.min(factor, 1));
    }
  }
  return out;
}