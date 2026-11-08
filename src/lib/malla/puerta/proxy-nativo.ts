/**
 * puerta/proxy-nativo — la página le dice a la app nativa dónde está el proxy local de la puerta (PTA1108B · 2026-11-08).
 * Contrato: `architecture/red-sin-dependencias.md` §5.3 (c).
 *
 * `puerta.cjs` abre un proxy HTTP en 127.0.0.1:<puerto> mientras el modo «salir por la malla» está encendido. Para que el
 * navegador de la app (los <iframe> del webview), el actualizador y las descargas de capas salgan por él, la app nativa
 * necesita el puerto: `puerta_proxy_local({ puerto, neurona, via })`. Rust lo aplica EN CALIENTE al webview (macOS 14+,
 * Android) y a sus descargas, y emite `puerta://estado`; esta pieza guarda ese estado para la interfaz.
 *
 * Reglas: no hace nada fuera de la app nativa (web normal, SSR, pruebas sin puente); nunca lanza; no repite un envío
 * idéntico; las peticiones van de una en una y gana la última. Sin DOM ni React: el puente se inyecta.
 */

/** Lo que devuelve el comando y emite el evento (los campos de `EstadoPublico` en Rust). */
export interface EstadoProxyNativo {
  puerto: number | null;
  neurona: string | null;
  via: string | null;
  /** El webview YA sale por el proxy. */
  aplicado: boolean;
  /** Esta plataforma puede llevar el webview por el proxy. */
  soportado: boolean;
  plataforma: string;
  /** Por qué no (en llano), si `soportado` es falso. */
  motivo: string | null;
  error: string | null;
  /** Las descargas de Rust (actualizador, capas) usan el proxy mientras hay puerto. */
  descargas: boolean;
}

export const COMANDO_PROXY = "puerta_proxy_local";
export const COMANDO_ESTADO = "puerta_proxy_estado";
export const EVENTO_PROXY = "puerta://estado";

type Resultado<T> = { ok: true; valor: T } | { ok: false; motivo: string };

/** Lo mínimo de `PuenteNativo` (src/lib/nativa/puente.ts) que se usa. */
export interface PuenteProxy {
  disponible: boolean;
  llamar<T>(cmd: string, args?: Record<string, unknown>): Promise<Resultado<T>>;
  escuchar(evento: string, cb: (payload: unknown) => void): Promise<() => void>;
}

export interface EntradaProxy {
  puerto: number | null;
  neurona?: string | null;
  via?: string | null;
}

/** «Bluetooth directo, 1 salto»: el texto de la vía, igual que en la tarjeta de Ajustes. */
export function textoVia(enlace: string, saltos: number): string {
  const e = (enlace || "enlace").trim();
  return saltos > 0 ? `${e}, ${saltos} ${saltos === 1 ? "salto" : "saltos"}` : e;
}

function esEstado(x: unknown): x is EstadoProxyNativo {
  return !!x && typeof x === "object" && "soportado" in x && "aplicado" in x && "descargas" in x;
}

let estado: EstadoProxyNativo | null = null;
const oyentes = new Set<() => void>();
function publicar(e: EstadoProxyNativo | null): void {
  estado = e;
  for (const cb of Array.from(oyentes)) cb();
}

/** Lo que el navegador de la app necesita saber del servicio de la puerta (un recorte de `EstadoServicioPuerta`). */
export interface EntradaIndicador {
  nativo: boolean;
  proxyLocal: number | null;
  internetPor: { nombre: string; enlace: string; saltos: number } | null;
  puertas: Array<{ nombre: string; enlace: string; saltos: number }>;
}

export interface VistaIndicador {
  visible: boolean;
  /** `ok`: el navegador sale por la malla · `aviso`: no puede (plataforma o error). */
  tono: "ok" | "aviso";
  texto: string;
  /** Qué lo explica (plataforma que no puede, error), si lo hay. */
  detalle: string | null;
}

const OCULTO: VistaIndicador = { visible: false, tono: "ok", texto: "", detalle: null };

/**
 * El indicador pequeño del navegador de la app: «Internet por: <neurona> (vía Bluetooth directo, 1 salto)» mientras
 * navega por una puerta de la malla, o el motivo claro de que esta plataforma no puede llevar el navegador por ella.
 * Solo aparece con el proxy encendido (sin salida propia): con internet propio no aparece nada.
 */
export function vistaIndicador(p: EntradaIndicador, n: EstadoProxyNativo | null): VistaIndicador {
  if (!p.nativo || p.proxyLocal == null) return OCULTO;
  const fuente = p.internetPor ?? p.puertas[0] ?? null;
  const texto = fuente ? `Internet por: ${fuente.nombre} (vía ${textoVia(fuente.enlace, fuente.saltos)})` : "Internet por la malla";
  if (n && !n.soportado) {
    return {
      visible: true,
      tono: "aviso",
      texto: "Este navegador no puede salir por la malla en este sistema",
      detalle: n.motivo ?? "La plataforma no admite un proxy para el navegador de la app.",
    };
  }
  if (n && n.soportado && !n.aplicado && n.error) {
    return { visible: true, tono: "aviso", texto: "No se pudo llevar el navegador por la malla", detalle: n.error };
  }
  return { visible: true, tono: "ok", texto, detalle: null };
}

/** El último estado que dijo la app nativa (`null` en la web o antes de la primera respuesta). */
export const estadoProxyNativo = (): EstadoProxyNativo | null => estado;
export function suscribirProxyNativo(cb: () => void): () => void {
  oyentes.add(cb);
  return () => oyentes.delete(cb);
}

/** Para pruebas: olvida el estado guardado. */
export function olvidarProxyNativo(): void {
  publicar(null);
}

/** El puente real de la ventana (carga perezosa; `null` en la web normal y en el servidor). */
export async function puenteProxyPorDefecto(): Promise<PuenteProxy | null> {
  if (typeof window === "undefined") return null;
  try {
    const m = await import("@/lib/nativa/puente");
    if (!m.esAppNativa()) return null;
    return m.puenteNativo() as unknown as PuenteProxy;
  } catch {
    return null;
  }
}

export interface SincroProxy {
  /** Dice a la app nativa dónde está el proxy (o `null`: ya no). No lanza; devuelve el estado o `null` si no hay app. */
  sincronizar(e: EntradaProxy): Promise<EstadoProxyNativo | null>;
  /** Pide el estado actual (para quien llega tarde al evento). */
  leer(): Promise<EstadoProxyNativo | null>;
  /** Deja de escuchar el evento y, si había proxy, lo quita. */
  detener(): Promise<void>;
}

/**
 * Crea la sincronización. `puente` puede ser el puente ya resuelto, una promesa de él o `null` (web: todo es no-op).
 * Se suscribe a `puerta://estado` para que el estado de la interfaz siga lo que Rust diga (cambios hechos por otros).
 */
export function crearSincroProxy(puente: PuenteProxy | null | Promise<PuenteProxy | null>): SincroProxy {
  let p: PuenteProxy | null | undefined;
  let bajaEvento: (() => void) | null = null;
  let ultimo: string | null = null;
  let cola: Promise<unknown> = Promise.resolve();
  let detenido = false;

  const resolver = async (): Promise<PuenteProxy | null> => {
    if (p === undefined) {
      try {
        p = await puente;
      } catch {
        p = null;
      }
      if (p && !p.disponible) p = null;
      if (p && !detenido) {
        void p
          .escuchar(EVENTO_PROXY, (carga) => {
            if (esEstado(carga) && !detenido) publicar(carga);
          })
          .then((baja) => {
            if (detenido) baja();
            else bajaEvento = baja;
          })
          .catch(() => undefined);
      }
    }
    return p;
  };

  const limpiar = (e: EntradaProxy): { puerto: number | null; neurona: string | null; via: string | null } => {
    const puerto = e.puerto != null && Number.isInteger(e.puerto) && e.puerto > 0 ? e.puerto : null;
    return {
      puerto,
      neurona: puerto != null && e.neurona ? String(e.neurona).slice(0, 80) : null,
      via: puerto != null && e.via ? String(e.via).slice(0, 120) : null,
    };
  };

  return {
    sincronizar(e) {
      const carga = limpiar(e);
      const clave = JSON.stringify(carga);
      const hacer = async (): Promise<EstadoProxyNativo | null> => {
        const pu = await resolver();
        if (!pu) return null;
        if (clave === ultimo) return estado;
        // Si aún no se envió nada y no hay proxy que quitar, no hace falta molestar a la app.
        if (ultimo === null && carga.puerto === null && estado === null) {
          ultimo = clave;
          return null;
        }
        const r = await pu.llamar<EstadoProxyNativo>(COMANDO_PROXY, carga);
        if (!r.ok) {
          ultimo = null; // se reintentará en la siguiente señal
          return estado;
        }
        ultimo = clave;
        if (esEstado(r.valor)) publicar(r.valor);
        return estado;
      };
      const siguiente = cola.then(hacer, hacer);
      cola = siguiente.catch(() => undefined);
      return siguiente.catch(() => null);
    },
    async leer() {
      const pu = await resolver();
      if (!pu) return null;
      const r = await pu.llamar<EstadoProxyNativo>(COMANDO_ESTADO);
      if (r.ok && esEstado(r.valor)) publicar(r.valor);
      return r.ok ? estado : null;
    },
    async detener() {
      if (estado?.puerto != null) await this.sincronizar({ puerto: null });
      detenido = true;
      bajaEvento?.();
      bajaEvento = null;
    },
  };
}
