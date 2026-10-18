/**
 * Protomolécula · TRANSPORTE DE SESIÓN P2P (esbozo F3).
 * Canal de aplicación "protomolecula"; reloj común inyectado; presencia P0;
 * gestos efímeros no guardados; confirmaciones con Operacion; latencia con ping/pong.
 */
import type { Sesion, Operacion, Parametro, EstadoValores, ParametroRef } from "./tipos";

export interface RelojInyectado {
  ahora(): number;
  estado(): { precisionMs: number | null; cotaMs: number | null; muestras: number; retardoMinMs: number | null };
}

export interface EnviarInyectado {
  (canal: string, cuerpo: unknown): Promise<{ ok: boolean; enlace?: string; motivo?: string }>;
}
export interface RecibirInyectado {
  (cb: (m: { cuerpo: unknown; enlace?: string }) => void): () => void;
}

export interface EnlaceSesion {
  sesion: Sesion;
  enviar: EnviarInyectado;
  recibir: RecibirInyectado;
  reloj: RelojInyectado;
}

export interface ResultadoLatencia {
  p50Ms: number | null;
  p95Ms: number | null;
  muestras: number;
  sinMedir: boolean;
  enlace?: string;
  motivo: string;
}

export interface ElementoDeOperacion {
  tipo: "operacion";
  operacion: Operacion;
  sesionId: string;
  t: number;
}

export interface GestoEfimero {
  tipo: "gesto";
  parametro: { atomoId: string; parametroId: string };
  valor: number | boolean | string;
  t: number;
  enlace?: string;
}

const CANAL = "protomolecula";

export function crearEnlaceSesion({ sesion, enviar, recibir, reloj }: EnlaceSesion): {
  enviarOperacion(op: Operacion): Promise<{ ok: boolean; enlace?: string; motivo?: string }>
  alRecibir: (cb: (m: { operacion?: Operacion; gesto?: boolean; enlace?: string }) => void) => () => void;
  presenciaActual: () => Record<string, string>;
  latenciaMedida: () => ResultadoLatencia;
} {
  const presencia: Record<string, string> = {}; // quién (autor.id) mueve qué (param clonado): P0, descartable
  const muestrasLatencia: Array<{ retardoMs: number; desfaseMs?: number }> = [];

  return {
    async enviarOperacion(op) {
      const t = reloj.ahora();
      const elemento: ElementoDeOperacion = {
        tipo: "operacion",
        operacion: { ...op, t },
        sesionId: sesion.id,
        t,
      };
      const r = await enviar(CANAL, elemento);
      return { ok: r.ok, enlace: r.enlace ?? (r.ok ? "protomolecula" : undefined), motivo: r.motivo ?? (r.ok ? undefined : "envío fallido") };
    },

    alRecibir(cb) {
      return recibir((msg) => {
        const cuerpo = msg.cuerpo;
        if (!cuerpo || typeof cuerpo !== "object") return;
        const o = cuerpo as Record<string, unknown>;
        if (o.tipo === "gesto") {
          const g = o as unknown as GestoEfimero;
          presencia[g.enlace ?? "local"] = `gesto:${g.parametro.atomoId}::${g.parametro.parametroId}`;
          cb({ gesto: true, enlace: g.enlace });
          // efímero: NO se guarda; solo notifica y descarta al soltar (aquí solo llega)
          return;
        }
        if (o.tipo === "operacion" && o.sesionId === sesion.id) {
          const op = (o as ElementoDeOperacion).operacion;
          presencia[op.autor.id || "anon"] = `${op.objetivo.atomoId}::${op.objetivo.parametroId}`;
          cb({ operacion: op, enlace: msg.enlace });
        }
      });
    },

    presenciaActual() {
      return { ...presencia };
    },

    latenciaMedida() {
      const e = reloj.estado();
      const n = muestrasLatencia.length;
      if (n < 2) {
        return {
          p50Ms: null, p95Ms: null, muestras: n, sinMedir: true,
          motivo: n === 0 ? "sin medir: sin muestras" : "sin medir: necesita al menos 2 muestras",
        };
      }
      const orden = [...muestrasLatencia].sort((a, b) => a.retardoMs - b.retardoMs);
      const p50 = orden[Math.floor(n * 0.5)].retardoMs;
      const p95 = orden[Math.floor(n * 0.95)].retardoMs;
      return {
        p50Ms: Math.round(p50 * 10) / 10,
        p95Ms: Math.round(p95 * 10) / 10,
        muestras: n,
        sinMedir: false,
        motivo: `medido con ${n} muestras; precisión del reloj: ${e.precisionMs ?? "desconocida"} ms`,
        enlace: "malla-p2p",
      };
    },
  };
}

export function moleculaDesdeElementos(elementos: unknown[]): { valores: EstadoValores; parametros?: Parametro[] } {
  const valores: EstadoValores = {};
  const parametros: Parametro[] = [];
  if (!Array.isArray(elementos)) return { valores, parametros };
  for (const e of elementos) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    if (o.tipo === "parametro" && typeof o.atomoId === "string" && typeof o.parametroId === "string") {
      valores[`${o.atomoId}::${o.parametroId}`] = o.valor ?? 0;
      if (o.def && typeof o.def === "object") {
        parametros.push({
          id: String(o.parametroId),
          nombre: String(o.def.nombre || o.parametroId),
          tipo: "numero",
          sinonimos: Array.isArray(o.def.sinonimos) ? o.def.sinonimos.map(String) : undefined,
        });
      }
    }
  }
  return { valores, parametros };
}
