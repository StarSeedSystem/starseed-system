/**
 * Aplicadores REALES de cada capa en este medio (contrato §3), sobre lo que el OS ya tiene.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *   · datos     → en caliente: cada sistema registra su aplicador (`registrarAplicadorDatos`);
 *                 sin aplicador registrado se dice, no se finge.
 *   · interfaz  → recarga suave con el mismo freno que `RegisterSW` (`puedeRecargarSuave`); si la
 *                 persona escribe, se avisa al banner «Nueva versión» (`starseed:update-ready`).
 *   · sw        → `registration.update()` y `SKIP_WAITING` al SW en espera (`public/sw-v7.js` lo
 *                 atiende); `RegisterSW` recarga una vez al cambiar de controlador.
 *   · servicios → `POST /api/mando/servidor {accion:"reiniciar"}` (lista blanca, solo en la Mac).
 *   · modelos   → aún sin aplicador en el navegador (las capas se renuevan con su gestor): se dice.
 *   · nativa    → comandos Tauri `check_update` y `reiniciar_para_actualizar` (solo escritorio).
 *
 * También la prueba de humo real de este medio. SSR-safe, sin `node:*`. Nunca lanza.
 */

import { puedeRecargarSuave } from "@/lib/pwa/aviso-version";
import type { CapaActualizacion, ManifiestoVersion } from "./manifiesto";
import type { ResultadoHumo } from "./planificador";
import { olvidarVersionesMedidas } from "./versiones-locales";

export type ResultadoAplicar =
  | { ok: true; texto: string }
  | { ok: false; pospuesta?: boolean; texto: string };

/** Lo que los aplicadores necesitan de un manifiesto (el panel los usa también con el estado del servidor). */
export type ManifiestoAplicable = Pick<ManifiestoVersion, "sistema" | "requiere"> & Partial<ManifiestoVersion>;

type AplicadorDatos = (m: ManifiestoAplicable) => Promise<ResultadoAplicar> | ResultadoAplicar;
const aplicadoresDatos = new Map<string, AplicadorDatos>();

/** Un sistema con datos declarativos (UiSpec, plantillas…) dice cómo aplicarlos en caliente. */
export function registrarAplicadorDatos(sistema: string, fn: AplicadorDatos): () => void {
  aplicadoresDatos.set(sistema, fn);
  return () => {
    if (aplicadoresDatos.get(sistema) === fn) aplicadoresDatos.delete(sistema);
  };
}

export function hayAplicadorDatos(sistema: string): boolean {
  return aplicadoresDatos.has(sistema);
}

interface TauriGlobal {
  core?: { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
}

function tauri(): TauriGlobal | null {
  try {
    return typeof window !== "undefined" ? ((window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__ ?? null) : null;
  } catch {
    return null;
  }
}

const no = (texto: string, pospuesta = false): ResultadoAplicar => ({ ok: false, texto, ...(pospuesta ? { pospuesta } : {}) });

async function aplicarDatos(m: ManifiestoAplicable): Promise<ResultadoAplicar> {
  const fn = aplicadoresDatos.get(m.sistema);
  if (!fn) return no(`«${m.sistema}» no tiene aplicador de datos en este medio todavía.`);
  try {
    return await fn(m);
  } catch (e) {
    return no(`Falló al aplicar los datos: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function aplicarInterfaz(): ResultadoAplicar {
  if (typeof window === "undefined") return no("Sin navegador.");
  if (!puedeRecargarSuave()) {
    try {
      window.dispatchEvent(new Event("starseed:update-ready"));
    } catch {
      /* */
    }
    return no("Estás escribiendo: se recargará cuando termines (o pulsa «Nueva versión»).", true);
  }
  try {
    const aplicar = (window as unknown as { STARSEED_APPLY_UPDATE?: () => void }).STARSEED_APPLY_UPDATE;
    if (typeof aplicar === "function") aplicar();
    else window.location.reload();
    return { ok: true, texto: "Recargando con la versión nueva." };
  } catch {
    return no("No se pudo recargar la página.");
  }
}

async function aplicarSw(): Promise<ResultadoAplicar> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return no("Este navegador no usa service worker.");
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return no("No hay service worker registrado (en desarrollo no se registra).");
    await reg.update();
    if (reg.waiting) {
      reg.waiting.postMessage("SKIP_WAITING");
      return { ok: true, texto: "Copia sin conexión nueva activada: recarga suave en curso." };
    }
    return { ok: true, texto: reg.installing ? "Instalando la copia sin conexión nueva." : "La copia sin conexión ya es la última." };
  } catch {
    return no("No se pudo comprobar el service worker.");
  }
}

async function aplicarServicios(m: ManifiestoAplicable): Promise<ResultadoAplicar> {
  const lista = m.requiere.reinicio;
  if (!lista.length) return { ok: true, texto: "Ningún servicio que reiniciar." };
  const hechos: string[] = [];
  for (const servicio of lista) {
    try {
      const r = await fetch("/api/mando/servidor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "reiniciar", servicio }),
      });
      if (r.status === 404) return no("Reiniciar servicios solo se puede desde la neurona que los tiene (la Mac).");
      const d = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!r.ok || d?.ok === false) return no(`«${servicio}» no se reinició: ${d?.error ?? `HTTP ${r.status}`}.`);
      hechos.push(servicio);
    } catch {
      return no(`Sin respuesta al reiniciar «${servicio}».`);
    }
  }
  return { ok: true, texto: `Reiniciado: ${hechos.join(", ")}.` };
}

async function aplicarNativa(permitirRelanzar: boolean): Promise<ResultadoAplicar> {
  const invoke = tauri()?.core?.invoke;
  if (!invoke) return no("No es la app nativa: esta capa se actualiza desde el programa instalado.");
  try {
    const msg = String(await invoke("check_update"));
    if (/descargada/i.test(msg) && permitirRelanzar) {
      await invoke("reiniciar_para_actualizar");
      return { ok: true, texto: "Relanzando la app con la versión nueva." };
    }
    return { ok: true, texto: msg };
  } catch (e) {
    return no(`El actualizador nativo falló: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Aplica UNA capa de un manifiesto en este medio. */
export async function aplicarCapa(
  capa: CapaActualizacion,
  m: ManifiestoAplicable,
  opciones: { permitirRelanzar?: boolean } = {},
): Promise<ResultadoAplicar> {
  let r: ResultadoAplicar;
  switch (capa) {
    case "datos": r = await aplicarDatos(m); break;
    case "interfaz": r = aplicarInterfaz(); break;
    case "sw": r = await aplicarSw(); break;
    case "servicios": r = await aplicarServicios(m); break;
    case "modelos": r = no("Las capas de modelos se renuevan con su gestor (Astraura › Capas); aún no se aplican desde aquí."); break;
    case "nativa": r = await aplicarNativa(!!opciones.permitirRelanzar); break;
    default: r = no("Capa desconocida.");
  }
  if (r.ok) olvidarVersionesMedidas();
  return r;
}

/** Prueba de humo de ESTE medio: el OS responde y su `/version.json` se lee. */
export async function pruebaDeHumo(): Promise<ResultadoHumo> {
  const responde = async (url: string) => {
    try {
      const r = await fetch(url, { cache: "no-store" });
      return r.ok;
    } catch {
      return false;
    }
  };
  const [pagina, version] = await Promise.all([responde("/"), responde("/version.json")]);
  return { paginaCarga: pagina && version, servicios: {} };
}
