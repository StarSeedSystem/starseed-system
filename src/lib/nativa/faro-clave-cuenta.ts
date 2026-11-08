/*
 * faro-clave-cuenta — reparte la CLAVE DE FARO de la cuenta a la app nativa (2026-11-07 · VIN1107A).
 * Contrato: architecture/apps-nativas-segundo-plano.md §3.1 y T2, y architecture/sincronizacion-neuronas.md §7.
 *
 * Sin esta clave el faro de la app nativa es anónimo: las neuronas de la misma cuenta salen en «otras
 * cuentas cerca» y la solicitud de sincronización se difunde a ciegas. Con ella, el faro dice «es de mi
 * cuenta» por HMAC y la solicitud va exacta a la neurona nombrada.
 *
 * Reglas que no se saltan:
 *  · SOLO en la app nativa (`esAppNativa()`); en la web normal no se lee ni se crea nada.
 *  · SOLO la clave de faro derivada de la cuenta (32 bytes aleatorios, `faro-clave.ts`): ni tokens ni claves
 *    de sesión ni claves de IA. Vive en los ajustes privados de la cuenta (`user_settings.prefs`, RLS por
 *    dueño) y en `antenas.json` de la app (0600). No se escribe en consola, no se devuelve en el resultado.
 *  · Sin sesión no se crea ninguna clave (no habría dónde guardarla para las demás neuronas).
 *  · Se guarda la configuración ENTERA de la app con un solo campo cambiado (`antenasConfigurar` la
 *    sustituye): `meshtastic_hosts`, `nas` y `faro_apagado` se conservan tal cual.
 *
 * Puro salvo `depsReales()`: el almacén, la app y los ids se inyectan.
 */

import { CLAVE_AJUSTE_FARO, esClaveFaro, obtenerOCrearClaveFaro } from "./faro-clave";
import type { ConfigAntenas, EstadoAntenas, Resultado } from "./tipos";

export interface DepsFaroCuenta {
  esNativa(): boolean;
  /** Hay sesión iniciada (si no, no se crea ni se reparte nada). */
  hayCuenta(): Promise<boolean>;
  leerAjuste(): Promise<string | null>;
  /** Escribe la clave en los ajustes privados de la cuenta; lanza si no se pudo. */
  escribirAjuste(clave: string): Promise<void>;
  /** Id de ESTA neurona (`neuron_devices`). */
  idNeurona(): string;
  /** Ids de neurona de la cuenta (incluida esta; se filtra). */
  idsNeuronasCuenta(): Promise<string[]>;
  antenasConfig(): Promise<Resultado<ConfigAntenas>>;
  antenasConfigurar(c: ConfigAntenas): Promise<Resultado<EstadoAntenas>>;
}

export type MotivoFaro = "no-nativa" | "sin-cuenta" | "sin-clave" | "sin-config" | "no-aplicada";

/** Nunca lleva la clave: solo qué pasó. */
export type ResultadoFaro =
  | { ok: true; aplicado: boolean; claveNueva: boolean; conocidas: number }
  | { ok: false; motivo: MotivoFaro; detalle: string };

/** La config nueva: solo cambian `clave_faro`, `neurona` y `conocidas`. Pura. */
export function configConClave(cfg: ConfigAntenas, clave: string, neurona: string, ids: readonly string[]): ConfigAntenas {
  const conocidas = Array.from(new Set(ids.filter((i) => typeof i === "string" && i.trim() && i !== neurona))).sort();
  return { ...cfg, clave_faro: clave, neurona: neurona || cfg.neurona, conocidas };
}

/** ¿La app ya tiene exactamente esto? (entonces no se vuelve a escribir su archivo). Pura. */
export function mismaConfigFaro(a: ConfigAntenas, b: ConfigAntenas): boolean {
  const ca = [...(a.conocidas ?? [])].sort();
  const cb = [...(b.conocidas ?? [])].sort();
  return (
    (a.clave_faro ?? null) === (b.clave_faro ?? null) &&
    (a.neurona ?? null) === (b.neurona ?? null) &&
    ca.length === cb.length &&
    ca.every((x, i) => x === cb[i])
  );
}

/**
 * sincronizarClaveFaro — una vuelta: clave de la cuenta (la que hay o una nueva) → config de la app.
 * Nunca lanza. En la web normal no llama a nada.
 */
export async function sincronizarClaveFaro(deps: DepsFaroCuenta, aleatorio?: (n: Uint8Array) => Uint8Array): Promise<ResultadoFaro> {
  if (!deps.esNativa()) return { ok: false, motivo: "no-nativa", detalle: "Solo la app nativa tiene faro." };
  try {
    if (!(await deps.hayCuenta())) {
      return { ok: false, motivo: "sin-cuenta", detalle: "Sin sesión iniciada no hay clave de faro de la cuenta." };
    }
    const clave = await obtenerOCrearClaveFaro(
      {
        leer: () => deps.leerAjuste(),
        // Otra neurona pudo escribirla a la vez: se escribe solo si falta y se vuelve a leer lo que quedó.
        escribirSiFalta: async (propuesta) => {
          const actual = await deps.leerAjuste();
          if (esClaveFaro(actual?.toLowerCase())) return (actual as string).toLowerCase();
          await deps.escribirAjuste(propuesta);
          const queda = await deps.leerAjuste();
          return esClaveFaro(queda?.toLowerCase()) ? (queda as string).toLowerCase() : propuesta;
        },
      },
      aleatorio,
    );
    if (!clave.ok) return { ok: false, motivo: "sin-clave", detalle: clave.motivo };

    const actual = await deps.antenasConfig();
    if (!actual.ok) return { ok: false, motivo: "sin-config", detalle: actual.motivo };
    const ids = await deps.idsNeuronasCuenta().catch(() => [] as string[]);
    const nueva = configConClave(actual.valor, clave.clave, deps.idNeurona(), ids);
    if (mismaConfigFaro(actual.valor, nueva)) return { ok: true, aplicado: false, claveNueva: clave.nueva, conocidas: nueva.conocidas.length };

    const r = await deps.antenasConfigurar(nueva);
    if (!r.ok) return { ok: false, motivo: "no-aplicada", detalle: r.motivo };
    return { ok: true, aplicado: true, claveNueva: clave.nueva, conocidas: nueva.conocidas.length };
  } catch (e) {
    // Nunca se incluye nada que pueda llevar la clave: solo el mensaje del error.
    return { ok: false, motivo: "sin-clave", detalle: e instanceof Error ? e.message.replace(/[0-9a-f]{64}/gi, "…") : "Falló el reparto de la clave de faro." };
  }
}

/* ══════════════════════════ Calendario de vueltas ══════════════════════════ */

const MIN = 60_000;
export const ESPERA_PRIMERA_MS = 5_000;
export const ESPERA_OK_MS = 30 * MIN;
export const ESPERA_MAX_FALLO_MS = 30 * MIN;

/** Cuánto esperar para la vuelta siguiente: tras acierto, 30 min (por si hay neuronas nuevas); tras fallo, 30 s ×4 por intento. Pura. */
export function esperaTras(r: ResultadoFaro, fallosSeguidos: number): number {
  if (r.ok) return ESPERA_OK_MS;
  // Sin app nativa o sin sesión no tiene sentido insistir pronto.
  if (r.motivo === "no-nativa") return ESPERA_MAX_FALLO_MS;
  return Math.min(ESPERA_MAX_FALLO_MS, 30_000 * 4 ** Math.max(0, fallosSeguidos));
}

/* ══════════════════════════ Dependencias reales ══════════════════════════ */

export async function depsReales(): Promise<DepsFaroCuenta> {
  const [{ esAppNativa, puenteNativo }, { uidActual }, { identidadDispositivo }] = await Promise.all([
    import("./puente"),
    import("@/lib/consumo/usuario"),
    import("@/lib/network/identidad-dispositivo"),
  ]);
  const puente = puenteNativo();
  return {
    esNativa: () => esAppNativa(),
    hayCuenta: async () => !!(await uidActual()),
    leerAjuste: async () => {
      const uid = await uidActual();
      if (!uid) return null;
      const { createClient } = await import("@/utils/supabase/client");
      const { data, error } = await createClient().from("user_settings").select("prefs").eq("user_id", uid).maybeSingle();
      // (OFF1108A) Un fallo de lectura (sin red, RLS, tiempo agotado) NO es «no hay clave»: se lanza para que
      // `obtenerOCrearClaveFaro` no fabrique una clave nueva que luego pise la de la cuenta al volver la red.
      if (error) throw new Error("No se pudo leer la clave de faro de la cuenta (sin conexión o sin permiso).");
      if (!data?.prefs || typeof data.prefs !== "object") return null;
      const v = (data.prefs as Record<string, unknown>)[CLAVE_AJUSTE_FARO];
      return typeof v === "string" ? v : null;
    },
    escribirAjuste: async (clave) => {
      const uid = await uidActual();
      const { mergeUserPrefs } = await import("@/lib/sync/user-prefs");
      const r = await mergeUserPrefs({ [CLAVE_AJUSTE_FARO]: clave }, uid ? { userId: uid } : undefined);
      if (!r.ok) throw new Error("No se pudo guardar la clave de faro en los ajustes de la cuenta.");
    },
    idNeurona: () => identidadDispositivo().neuronDeviceId,
    idsNeuronasCuenta: async () => {
      const [{ listNeurons }, { idsConocidasConAlias, leerFusiones }] = await Promise.all([
        import("@/lib/neurons/neurons"),
        import("@/lib/neurons/fusion-alias"),
      ]);
      // (NEU1107B) Tras una fusión, el id que se quedó está en la lista y los absorbidos se añaden por su
      // alias: un medio que aún anuncia el viejo (app cerrada, sin internet) se sigue reconociendo.
      return idsConocidasConAlias((await listNeurons()).map((n) => n.id), leerFusiones().alias);
    },
    antenasConfig: () => puente.antenasConfig(),
    antenasConfigurar: (c) => puente.antenasConfigurar(c),
  };
}

/**
 * iniciarClaveFaroNativa — lo monta `MallaNeuronasMount`. En la web normal no hace nada. Reintenta con
 * espera creciente si falla (sin sesión todavía, red caída…) y se repite cada 30 min para anotar neuronas
 * nuevas de la cuenta. Devuelve la parada.
 */
export function iniciarClaveFaroNativa(
  opciones: { deps?: () => Promise<DepsFaroCuenta>; poner?: (f: () => void, ms: number) => unknown; quitar?: (h: unknown) => void } = {},
): () => void {
  const poner = opciones.poner ?? ((f, ms) => setTimeout(f, ms));
  const quitar = opciones.quitar ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let vivo = true;
  let timer: unknown = null;
  let fallos = 0;

  const vuelta = async () => {
    timer = null;
    if (!vivo) return;
    let r: ResultadoFaro;
    try {
      r = await sincronizarClaveFaro(await (opciones.deps ?? depsReales)());
    } catch {
      r = { ok: false, motivo: "sin-clave", detalle: "No se pudo preparar el reparto de la clave de faro." };
    }
    fallos = r.ok ? 0 : fallos + 1;
    // En la web normal no hay faro: no se vuelve a mirar.
    if (!r.ok && r.motivo === "no-nativa") return;
    if (vivo) timer = poner(() => void vuelta(), esperaTras(r, fallos - 1));
  };

  timer = poner(() => void vuelta(), ESPERA_PRIMERA_MS);
  return () => {
    vivo = false;
    if (timer != null) quitar(timer);
  };
}
