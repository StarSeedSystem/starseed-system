import type { MedidaVoz } from "@/lib/aurora/medidas-voz";

export const CLAVE_OIDO_NUBE = "starseed.oido.nube";

const MOTORES_NUBE = new Set(["groq-whisper", "gemini", "pollinations"]);

function nombreLegibleMotor(motor: string): string {
  if (motor === "groq-whisper") return "Groq Whisper";
  if (motor === "gemini") return "Gemini";
  if (motor === "pollinations") return "Pollinations";
  return motor;
}

export interface DepsOidoNube {
  leerLS: (clave: string) => string | null;
  escribirLS: (clave: string, valor: string) => void;
  leerMedidas: () => MedidaVoz[];
  vozMedida: (medidas: MedidaVoz[]) => { oido?: { motor: string }[]; habla?: { motor: string }[] } | undefined;
  ahora: () => number;
}

const crearDepsPorDefecto = (): DepsOidoNube => ({
  leerLS: (k) => typeof window !== "undefined" ? window.localStorage.getItem(k) : null,
  escribirLS: (k, v) => { if (typeof window !== "undefined") window.localStorage.setItem(k, v); },
  leerMedidas: () => typeof window !== "undefined" ? (function() {
    const mod = require("@/lib/aurora/medidas-voz") as typeof import("@/lib/aurora/medidas-voz");
    return mod.leerMedidas();
  })() : [],
  vozMedida: (medidas) => {
    const mod = require("@/lib/network/capacidades-nodo") as typeof import("@/lib/network/capacidades-nodo");
    return mod.vozMedida(medidas);
  },
  ahora: () => Date.now(),
});

export function oidoNubeEncendido(deps?: DepsOidoNube): boolean {
  try {
    const d = deps ?? crearDepsPorDefecto();
    const valor = d.leerLS(CLAVE_OIDO_NUBE);
    return valor !== "0";
  } catch {
    return true;
  }
}

export function fijarOidoNube(encendido: boolean, deps?: DepsOidoNube): void {
  try {
    const d = deps ?? crearDepsPorDefecto();
    d.escribirLS(CLAVE_OIDO_NUBE, encendido ? "1" : "0");
  } catch { /* */ }
}

export interface EstadoOidoNube {
  encendido: boolean;
  motorHabla: string | null;
  oido: "nube" | "navegador";
  nombreMotor: string;
}

export function obtenerEstadoOidoNube(deps?: DepsOidoNube): EstadoOidoNube {
  const d = deps ?? crearDepsPorDefecto();
  const medidas = d.leerMedidas();
  const voz = d.vozMedida(medidas);
  const habla = voz?.habla?.[0]?.motor ?? null;
  const esNube = habla ? MOTORES_NUBE.has(habla) : false;
  return {
    encendido: oidoNubeEncendido(d),
    motorHabla: habla,
    oido: esNube ? "nube" : "navegador",
    nombreMotor: habla ? nombreLegibleMotor(habla) : "",
  };
}