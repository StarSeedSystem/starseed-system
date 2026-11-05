"use client";

export const CLAVE_VOTOS_VOZ = "starseed.voz.votos.v1";
export const MAX_VOTOS_TOTAL = 300;

export interface VotoVoz {
  motor: string;
  voto: number;
  timestamp: number;
}

export interface DepsVotos {
  leer: (clave: string) => string | null;
  escribir: (clave: string, valor: string) => boolean | void;
  borrar: (clave: string) => void;
  ahora: () => number;
  neurona: () => string;
}

function votoValido(x: unknown): VotoVoz | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  if (typeof r.motor !== "string" || r.motor.trim() === "") return null;
  if (![1, -1].includes(r.voto as number)) return null;
  if (typeof r.timestamp !== "number") return null;
  return {
    motor: r.motor.trim(),
    voto: r.voto as number,
    timestamp: r.timestamp as number,
  };
}

function recortarVotos(votados: VotoVoz[]): VotoVoz[] {
  const ordenados = [...votados].sort((a, b) => b.timestamp - a.timestamp);
  return ordenados.slice(0, MAX_VOTOS_TOTAL);
}

export function anotarVoto(p: { motor: string; voto: number }, deps: DepsVotos): boolean {
  try {
    const motorNormalizado = p.motor.trim();
    if (!motorNormalizado) return false;
    if (p.voto !== 1 && p.voto !== -1) return false;
    const depsOk = {
      leer: deps.leer,
      escribir: (k: string, v: string) => {
        const r = deps.escribir(k, v);
        return r === false || r === undefined ? false : true;
      },
      borrar: deps.borrar,
      ahora: deps.ahora,
      neurona: deps.neurona,
    };
    const voto = {
      motor: motorNormalizado,
      voto: p.voto,
      timestamp: depsOk.ahora(),
    };
    const actual = depsOk.leer(CLAVE_VOTOS_VOZ);
    let lista: unknown[] = [];
    if (actual) {
      try {
        lista = JSON.parse(actual);
      } catch {
        lista = [];
      }
    }
    if (!Array.isArray(lista)) lista = [];
    const votados = (Array.isArray(lista) ? lista : [])
      .map(votoValido)
      .filter((v): v is VotoVoz => v !== null)
      .concat(voto);
    const recortado = recortarVotos(votados);
    if (depsOk.escribir(CLAVE_VOTOS_VOZ, JSON.stringify(recortado)) === false) return false;
    return true;
  } catch {
    return false;
  }
}

export function leerVotos(deps: DepsVotos): VotoVoz[] {
  try {
    const raw = deps.leer(CLAVE_VOTOS_VOZ);
    if (!raw) return [];
    let lista: unknown;
    try {
      lista = JSON.parse(raw);
    } catch {
      return [];
    }
    return (Array.isArray(lista) ? lista : [])
      .map(votoValido)
      .filter((v): v is VotoVoz => v !== null);
  } catch {
    return [];
  }
}