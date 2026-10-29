import type { Sesion } from "./tipos";
import type { RelojComun } from "@/lib/estaciones/reloj-comun";
import { elementoDeOperacion } from "./sesion-sincronia";

export interface DepsTransporte {
  enviar: (canal: string, cuerpo: unknown) => Promise<unknown>;
  recibir: (canal: string, cb: (msg: unknown) => void) => () => void;
  reloj: RelojComun;
}

export interface EnlaceSesion {
  enviarOperacion: (op: unknown, cambio: unknown) => Promise<void>;
  presencia: Map<string, number>;
  latencia: { p50: number | null; p95: number | null; muestras: number };
  enlaceInfo: string;
}

export function crearEnlaceSesion({ sesion, enviar, recibir, reloj }: { sesion: Sesion; enviar: DepsTransporte["enviar"]; recibir: DepsTransporte["recibir"]; reloj: RelojComun }): EnlaceSesion {
  const canal = "protomolecula";
  const presencia = new Map<string, number>();
  const rtts: number[] = [];

  recibir(canal, (msg) => {
    try {
      const obj = msg as any;
      if (obj?.tipo === "ping") {
        enviar(canal, { tipo: "pong", id: obj.id });
        return;
      }
      if (obj?.tipo === "pong") {
        // latencia medida externamente por quien envía
      }
    } catch {}
  });

  const enviarOperacion = async (op: unknown, cambio: unknown) => {
    const t = reloj.ahora();
    const elemento = elementoDeOperacion(op as any, cambio as any);
    await enviar(canal, { t, elemento, presencia: true });
  };

  return {
    enviarOperacion,
    presencia,
    latencia: { p50: null, p95: null, muestras: 0 },
    enlaceInfo: "sin-enlace",
  };
}
