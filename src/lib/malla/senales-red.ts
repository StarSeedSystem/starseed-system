/**
 * senales-red — las señales de cambio de red que da el sistema, en un solo sitio (MLL1111C).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Para que una llamada pase de carril AL INSTANTE cuando se cae la red (y no tras el plazo de ICE), el motor escucha:
 *  · `offline` / `online` de `window`: todas las vistas web (WKWebView en macOS e iOS, WebView de Android, WebView2 en
 *    Windows, WebKitGTK en Linux). Solo saltan cuando el aparato se queda SIN ninguna red o la recupera.
 *  · `change` de `navigator.connection` (Network Information API): WebView de Android y WebView2 (Chromium). Salta al
 *    cambiar de tipo de red (Wi-Fi → datos móviles → ninguna), justo el caso de «apagar el Wi-Fi de la tableta».
 *  · Donde no hay señal (WKWebView y WebKitGTK sin `connection`, o un corte del router con la interfaz arriba), el
 *    motor hace una comprobación de vida corta: paquetes de WebRTC que dejan de entrar (ver `motor.ts`, `vidaWebrtc`).
 * Nunca lanza: sin `window` (pruebas, servidor) no hace nada y devuelve una baja vacía.
 */

export type TipoSenalRed = "offline" | "online" | "cambio";

export interface SenalRed {
  tipo: TipoSenalRed;
  /** Texto corto para el registro: «sin red», «tipo=wifi→none»… */
  detalle: string;
}

interface ConexionRed extends EventTarget {
  type?: string;
  effectiveType?: string;
}

/** Qué señales hay en este aparato (para el registro de la llamada). */
export function senalesDisponibles(entorno: { win?: unknown; nav?: unknown } = {}): string[] {
  const w = (entorno.win ?? (typeof window !== "undefined" ? window : undefined)) as Window | undefined;
  const n = (entorno.nav ?? (typeof navigator !== "undefined" ? navigator : undefined)) as (Navigator & { connection?: ConexionRed }) | undefined;
  const out: string[] = [];
  if (w && typeof w.addEventListener === "function") out.push("online/offline");
  if (n?.connection && typeof n.connection.addEventListener === "function") out.push("network-information");
  return out;
}

/** Escucha las señales del sistema. Devuelve la baja. */
export function vigilarSenalesRed(cb: (s: SenalRed) => void, entorno: { win?: unknown; nav?: unknown } = {}): () => void {
  const w = (entorno.win ?? (typeof window !== "undefined" ? window : undefined)) as Window | undefined;
  const n = (entorno.nav ?? (typeof navigator !== "undefined" ? navigator : undefined)) as (Navigator & { connection?: ConexionRed }) | undefined;
  const bajas: (() => void)[] = [];
  const avisar = (s: SenalRed) => {
    try {
      cb(s);
    } catch {
      /* un oyente nunca tumba al resto */
    }
  };
  try {
    if (w && typeof w.addEventListener === "function") {
      const off = () => avisar({ tipo: "offline", detalle: "sin red" });
      const on = () => avisar({ tipo: "online", detalle: "red recuperada" });
      w.addEventListener("offline", off);
      w.addEventListener("online", on);
      bajas.push(() => {
        w.removeEventListener("offline", off);
        w.removeEventListener("online", on);
      });
    }
    const c = n?.connection;
    if (c && typeof c.addEventListener === "function") {
      let antes = `${c.type ?? "?"}/${c.effectiveType ?? "?"}`;
      const cambio = () => {
        const ahora = `${c.type ?? "?"}/${c.effectiveType ?? "?"}`;
        const tipo: TipoSenalRed = c.type === "none" ? "offline" : "cambio";
        avisar({ tipo, detalle: `tipo=${antes}→${ahora}` });
        antes = ahora;
      };
      c.addEventListener("change", cambio);
      bajas.push(() => c.removeEventListener("change", cambio));
    }
  } catch {
    /* sin señales: queda la comprobación de vida */
  }
  return () => {
    for (const b of bajas.splice(0)) {
      try {
        b();
      } catch {
        /* noop */
      }
    }
  };
}
