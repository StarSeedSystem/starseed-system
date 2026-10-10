"use client";

/*
 * fusion — juntar en UNA neurona las filas repetidas de un mismo aparato (2026-10-09).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * «Fusionar» hace, en este orden, y con respaldo para deshacer:
 *   1. Lee las filas de `neuron_devices` (la que se queda y las absorbidas) y las guarda tal cual.
 *   2. Funde sus fichas en la que se queda: rasgos del aparato (gana la principal, las demás
 *      rellenan huecos) y la lista de MEDIOS (cada fila absorbida aporta los suyos; una fila
 *      vieja sin lista aporta su navegador como medio).
 *   3. Mueve sus AJUSTES: en cada almacén que viaja con la cuenta (nombres, permisos, ajustes por
 *      neurona, sistemas por personalidad, avisos vistos, pantalla de inicio…) todo lo que
 *      colgaba del id absorbido pasa al que se queda. Si los dos tenían algo, gana el que se
 *      queda y el otro rellena lo que falte. Lo movido se guarda para deshacer.
 *   4. Deja el ALIAS `absorbida → principal` (viaja con la cuenta): los medios que aún usan el id
 *      viejo lo adoptan solos en su próximo latido, en vez de volver a crear la fila.
 *   5. Borra las filas absorbidas (RLS: solo las de la propia cuenta) y avisa a los medios
 *      abiertos por el canal de la cuenta.
 *
 * Deshacer vuelve a crear las filas y devuelve los ajustes movidos; los medios que ya adoptaron
 * la principal siguen en ella (son el mismo aparato: si no lo fueran, «Es otra neurona»).
 * Nunca lanza.
 */

import { createClient } from "@/utils/supabase/client";
import {
  combinarCapacidades,
  invalidarListaNeuronas,
  NEURON_EVENT,
  resolverAliasEsteMedio,
  type NeuronCapabilities,
} from "@/lib/neurons/neurons";
import { esIdNeuronaValido } from "@/lib/network/identidad-dispositivo";
import {
  CLAVE_FUSIONES,
  escribirFusiones,
  leerFusiones,
  type EntradaMovida,
  type RespaldoFusion,
} from "@/lib/neurons/fusion-alias";
import type { RegistroMedio, TipoMedio } from "@/lib/neurons/medio";
import { SYNCED_KEYS, SYNCED_PREFIXES, SYNCED_PREFIX_EXCLUDE, isNeverSyncedKey } from "@/lib/settings-sync";
import { sendAccountBroadcast } from "@/lib/sync/realtime-sync";

/** Evento de cuenta con el que los medios abiertos se enteran de una fusión al momento. */
export const EVENTO_CUENTA_FUSION = "neuronas:fusion";
/** Tope del respaldo de ajustes movidos por fusión (bytes de JSON). */
const TOPE_MOVIDAS = 60_000;

/* ───────────────────────────── Reetiquetado puro ───────────────────────────── */

function esObjeto(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Funde `secundario` en `principal`: gana el principal; el secundario rellena huecos. Puro. */
export function fundirPrincipalGana(principal: unknown, secundario: unknown): unknown {
  if (esObjeto(principal) && esObjeto(secundario)) {
    const out: Record<string, unknown> = { ...principal };
    for (const [k, v] of Object.entries(secundario)) {
      out[k] = k in principal ? fundirPrincipalGana(principal[k], v) : v;
    }
    return out;
  }
  return principal === undefined ? secundario : principal;
}

export interface ResultadoReetiquetado {
  valor: unknown;
  cambiado: boolean;
  /** Entradas (clave de objeto) que colgaban del id viejo: ruta + valor original. */
  movidas: Array<{ ruta: string[]; valor: unknown }>;
}

/**
 * Cambia `viejo` por `nuevo` en todo un valor JSON: en las CLAVES de los objetos (fundiendo si el
 * nuevo ya existía, gana lo que ya tenía el nuevo) y en los textos. Las listas de textos no
 * quedan con repetidos. Puro.
 */
export function reetiquetarId(valor: unknown, viejo: string, nuevo: string, ruta: string[] = []): ResultadoReetiquetado {
  if (!viejo || viejo === nuevo) return { valor, cambiado: false, movidas: [] };
  if (typeof valor === "string") {
    if (!valor.includes(viejo)) return { valor, cambiado: false, movidas: [] };
    return { valor: valor.split(viejo).join(nuevo), cambiado: true, movidas: [] };
  }
  if (Array.isArray(valor)) {
    let cambiado = false;
    const movidas: ResultadoReetiquetado["movidas"] = [];
    let lista = valor.map((v, i) => {
      const r = reetiquetarId(v, viejo, nuevo, [...ruta, String(i)]);
      if (r.cambiado) cambiado = true;
      movidas.push(...r.movidas);
      return r.valor;
    });
    if (cambiado && lista.every((v) => typeof v === "string")) lista = Array.from(new Set(lista as string[]));
    return { valor: cambiado ? lista : valor, cambiado, movidas };
  }
  if (esObjeto(valor)) {
    let cambiado = false;
    const movidas: ResultadoReetiquetado["movidas"] = [];
    const out: Record<string, unknown> = {};
    const conViejo: string[] = [];
    // Primero lo que NO cuelga del id viejo (incluido lo del nuevo: es lo que gana).
    for (const [k, v] of Object.entries(valor)) {
      if (k.includes(viejo)) {
        conViejo.push(k);
        continue;
      }
      const r = reetiquetarId(v, viejo, nuevo, [...ruta, k]);
      if (r.cambiado) cambiado = true;
      movidas.push(...r.movidas);
      out[k] = r.valor;
    }
    for (const k of conViejo) {
      const v = valor[k];
      const nk = k.split(viejo).join(nuevo);
      const r = reetiquetarId(v, viejo, nuevo, [...ruta, nk]);
      movidas.push({ ruta: [...ruta, k], valor: v });
      out[nk] = nk in out ? fundirPrincipalGana(out[nk], r.valor) : r.valor;
      cambiado = true;
    }
    return { valor: cambiado ? out : valor, cambiado, movidas };
  }
  return { valor, cambiado: false, movidas: [] };
}

/* ───────────────────────────── Fichas ───────────────────────────── */

function tipoMedioDeFila(caps: Record<string, unknown>): TipoMedio {
  if (caps.installedApp === true) return "app-instalada";
  if (!caps.browser && caps.platform) return "app-nativa"; // WKWebView de la app nativa no dice navegador
  return "navegador";
}

/** Una fila vieja sin `medios` aporta su navegador como medio (para no perder de dónde venía). */
export function mediosDeFila(fila: { id: string; name?: unknown; capabilities?: unknown; last_seen_at?: unknown }): Record<string, RegistroMedio> {
  const caps = esObjeto(fila.capabilities) ? fila.capabilities : {};
  const propios = esObjeto(caps.medios) ? (caps.medios as Record<string, RegistroMedio>) : null;
  if (propios && Object.keys(propios).length) return propios;
  const visto = typeof fila.last_seen_at === "string" ? fila.last_seen_at : new Date(0).toISOString();
  const tipo = tipoMedioDeFila(caps);
  const nav = typeof caps.browser === "string" && caps.browser ? caps.browser : undefined;
  const etiqueta =
    tipo === "app-nativa" ? "App nativa StarSeed OS" : tipo === "app-instalada" ? `${nav ?? "Navegador"} · app instalada` : nav ?? "Navegador";
  return { [`fila-${fila.id}`]: { tipo, etiqueta, navegador: nav, visto } };
}

/** Ficha fundida: la principal gana; las absorbidas rellenan y aportan sus medios. Pura. */
export function fichaFundida(
  principal: { id: string; capabilities?: unknown; last_seen_at?: unknown },
  absorbidas: Array<{ id: string; name?: unknown; capabilities?: unknown; last_seen_at?: unknown }>,
  ahora: number = Date.now(),
): NeuronCapabilities {
  const base = (esObjeto(principal.capabilities) ? principal.capabilities : {}) as unknown as NeuronCapabilities;
  let acc: NeuronCapabilities = { ...base, medios: mediosDeFila(principal) };
  for (const a of absorbidas) {
    const caps = (esObjeto(a.capabilities) ? a.capabilities : {}) as Record<string, unknown>;
    // combinarCapacidades(remotas, locales): las «locales» ganan → la acumulada (principal) gana.
    acc = combinarCapacidades({ ...caps, medios: mediosDeFila(a) }, acc, ahora);
  }
  return acc;
}

/* ───────────────────────────── Almacenes sincronizados ───────────────────────────── */

function clavesSincronizadas(): string[] {
  const out = new Set<string>();
  for (const k of SYNCED_KEYS as readonly string[]) if (!isNeverSyncedKey(k) && k !== CLAVE_FUSIONES) out.add(k);
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || isNeverSyncedKey(k)) continue;
      if (SYNCED_PREFIX_EXCLUDE.some((p) => k.startsWith(p))) continue;
      if (SYNCED_PREFIXES.some((p) => k.startsWith(p))) out.add(k);
    }
  } catch {
    /* sin almacenamiento */
  }
  return [...out];
}

/** Mueve los ajustes de `viejos` a `nuevo` en todos los almacenes que viajan con la cuenta. */
function moverAjustes(viejos: string[], nuevo: string): { claves: string[]; movidas: EntradaMovida[] } {
  const claves: string[] = [];
  const movidas: EntradaMovida[] = [];
  for (const clave of clavesSincronizadas()) {
    let crudo: string | null = null;
    try {
      crudo = window.localStorage.getItem(clave);
    } catch {
      crudo = null;
    }
    if (!crudo || !viejos.some((v) => crudo!.includes(v))) continue;
    let valor: unknown;
    let esJson = true;
    try {
      valor = JSON.parse(crudo);
    } catch {
      valor = crudo;
      esJson = false;
    }
    let cambiado = false;
    for (const v of viejos) {
      const r = reetiquetarId(valor, v, nuevo);
      if (r.cambiado) {
        cambiado = true;
        valor = r.valor;
        for (const m of r.movidas) movidas.push({ clave, ruta: m.ruta, valor: m.valor });
      }
    }
    if (!cambiado) continue;
    try {
      // setItem directo: el parche de realtime-sync lo empuja a la cuenta.
      window.localStorage.setItem(clave, esJson ? JSON.stringify(valor) : String(valor));
      claves.push(clave);
    } catch {
      /* clave suelta ignorada */
    }
  }
  return { claves, movidas };
}

function recortarMovidas(m: EntradaMovida[]): EntradaMovida[] {
  try {
    if (JSON.stringify(m).length <= TOPE_MOVIDAS) return m;
  } catch {
    /* */
  }
  // Demasiado grande para el respaldo: se guardan las rutas (qué se movió) sin los valores.
  return m.map((e) => ({ clave: e.clave, ruta: e.ruta, valor: null }));
}

/* ───────────────────────────── Fusión ───────────────────────────── */

export interface ResultadoFusion {
  ok: boolean;
  motivo?: string;
  principal?: string;
  absorbidas?: string[];
  /** Almacenes de ajustes que cambiaron. */
  claves?: string[];
  /** Id del respaldo (para deshacer). */
  respaldo?: number;
}

export async function fusionarNeuronas(principalId: string, absorbidasIds: readonly string[]): Promise<ResultadoFusion> {
  const absorbidas = Array.from(new Set(absorbidasIds.filter((id) => id && id !== principalId)));
  if (!esIdNeuronaValido(principalId) || absorbidas.length === 0 || !absorbidas.every(esIdNeuronaValido)) {
    return { ok: false, motivo: "Elige la neurona que se queda y al menos otra del mismo aparato." };
  }
  try {
    const supabase = createClient();
    const lectura = await supabase
      .from("neuron_devices")
      .select("id, owner, name, kind, capabilities, permissions, last_seen_at, created_at")
      .in("id", [principalId, ...absorbidas]);
    if (lectura.error) return { ok: false, motivo: `No se pudieron leer las neuronas: ${lectura.error.message}` };
    const filas = (lectura.data ?? []) as Array<Record<string, unknown> & { id: string }>;
    const principal = filas.find((f) => f.id === principalId);
    if (!principal) return { ok: false, motivo: "La neurona que se queda ya no está en tu cuenta." };
    const deAbsorbidas = filas.filter((f) => f.id !== principalId);

    // 1-2 · ficha fundida y nombre (si la principal no tiene, el de la primera que lo tenga).
    const capabilities = fichaFundida(principal, deAbsorbidas);
    const nombre =
      (typeof principal.name === "string" && principal.name.trim()) ||
      (deAbsorbidas.map((f) => (typeof f.name === "string" ? f.name.trim() : "")).find(Boolean) ?? null);
    const subida = await supabase
      .from("neuron_devices")
      .update({ capabilities, ...(nombre ? { name: nombre } : {}) })
      .eq("id", principalId);
    if (subida.error) return { ok: false, motivo: `No se pudo guardar la neurona fundida: ${subida.error.message}` };

    // 3 · ajustes de la cuenta.
    const { claves, movidas } = moverAjustes(absorbidas, principalId);

    // 4 · alias + respaldo (antes de borrar: si el borrado falla, el alias igualmente evita duplicados).
    const ts = Date.now();
    const reg = leerFusiones();
    for (const a of absorbidas) reg.alias[a] = { a: principalId, ts };
    const respaldo: RespaldoFusion = { ts, principal: principalId, absorbidas, filas: deAbsorbidas, movidas: recortarMovidas(movidas) };
    reg.respaldos.push(respaldo);
    escribirFusiones(reg);

    // 5 · borrar las absorbidas.
    const borrado = await supabase.from("neuron_devices").delete().in("id", absorbidas);
    if (borrado.error) return { ok: false, motivo: `Ajustes fundidos, pero no se pudieron quitar las filas repetidas: ${borrado.error.message}` };

    resolverAliasEsteMedio();
    invalidarListaNeuronas();
    try {
      window.dispatchEvent(new CustomEvent(NEURON_EVENT));
    } catch {
      /* */
    }
    void sendAccountBroadcast(EVENTO_CUENTA_FUSION, { principal: principalId, absorbidas, ts });
    return { ok: true, principal: principalId, absorbidas, claves, respaldo: ts };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "sin red" };
  }
}

/** Pone `valor` en la ruta de un objeto si no hay nada ahí. Devuelve si cambió. Pura salvo la mutación de `raiz`. */
function ponerSiFalta(raiz: Record<string, unknown>, ruta: string[], valor: unknown): boolean {
  if (ruta.length === 0) return false;
  let nodo: Record<string, unknown> = raiz;
  for (const parte of ruta.slice(0, -1)) {
    const sig = nodo[parte];
    if (!esObjeto(sig)) {
      if (sig !== undefined) return false;
      nodo[parte] = {};
    }
    nodo = nodo[parte] as Record<string, unknown>;
  }
  const ultima = ruta[ruta.length - 1];
  if (ultima in nodo) return false;
  nodo[ultima] = valor;
  return true;
}

/** Deshace una fusión: vuelve a crear las filas, quita los alias y devuelve los ajustes movidos. */
export async function deshacerFusion(ts: number): Promise<ResultadoFusion> {
  const reg = leerFusiones();
  const r = reg.respaldos.find((x) => x.ts === ts);
  if (!r || r.deshecha) return { ok: false, motivo: "Esa fusión ya no se puede deshacer." };
  try {
    if (r.filas.length) {
      const res = await createClient().from("neuron_devices").upsert(r.filas, { onConflict: "id" });
      if (res.error) return { ok: false, motivo: `No se pudieron recuperar las filas: ${res.error.message}` };
    }
    for (const a of r.absorbidas) if (reg.alias[a]?.a === r.principal) delete reg.alias[a];
    // Ajustes: se devuelven a su id original solo donde no haya nada (no se pisa lo nuevo).
    const porClave = new Map<string, EntradaMovida[]>();
    for (const m of r.movidas) if (m.valor !== null) porClave.set(m.clave, [...(porClave.get(m.clave) ?? []), m]);
    for (const [clave, lista] of porClave) {
      try {
        const crudo = window.localStorage.getItem(clave);
        const valor = crudo ? (JSON.parse(crudo) as unknown) : {};
        if (!esObjeto(valor)) continue;
        let cambio = false;
        for (const m of lista) cambio = ponerSiFalta(valor, m.ruta, m.valor) || cambio;
        if (cambio) window.localStorage.setItem(clave, JSON.stringify(valor));
      } catch {
        /* clave suelta ignorada */
      }
    }
    r.deshecha = true;
    escribirFusiones(reg);
    invalidarListaNeuronas();
    try {
      window.dispatchEvent(new CustomEvent(NEURON_EVENT));
    } catch {
      /* */
    }
    return { ok: true, principal: r.principal, absorbidas: r.absorbidas, respaldo: ts };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "sin red" };
  }
}

/** Filas vacías (sin nombre ni capacidades) que no son de este medio: se pueden quitar sin perder nada. */
export async function quitarFichasVacias(ids: readonly string[]): Promise<{ ok: boolean; quitadas: number; motivo?: string }> {
  const validos = ids.filter(esIdNeuronaValido);
  if (!validos.length) return { ok: true, quitadas: 0 };
  try {
    const res = await createClient().from("neuron_devices").delete().in("id", validos).is("name", null);
    if (res.error) return { ok: false, quitadas: 0, motivo: res.error.message };
    invalidarListaNeuronas();
    try {
      window.dispatchEvent(new CustomEvent(NEURON_EVENT));
    } catch {
      /* */
    }
    return { ok: true, quitadas: validos.length };
  } catch (e) {
    return { ok: false, quitadas: 0, motivo: e instanceof Error ? e.message : "sin red" };
  }
}
