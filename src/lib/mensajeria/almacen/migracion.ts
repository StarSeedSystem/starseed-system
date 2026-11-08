/**
 * Migración SIN PÉRDIDAS de la bandeja en localStorage al almacén local (MSJ1108C · F1).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Garantías (el historial real de Alex entre su Mac y su tableta vive en esa clave):
 *   1. Antes de importar nada se copia el texto EXACTO de `starseed.mensajeria.malla.v1` a
 *      `starseed.mensajeria.malla.v1.respaldo` (si esa copia ya existe no se pisa: la primera es la buena).
 *   2. La clave vieja NUNCA se borra ni se reescribe aquí. Queda como lectura de respaldo durante una versión.
 *   3. Importar solo AÑADE: un id que ya está en el almacén (o tiene lápida) no se toca. Se puede repetir
 *      en cada arranque (idempotente) y recoge lo que otro camino (p. ej. el rescate de origen de la app
 *      nativa) haya escrito después en la clave vieja.
 *   4. No se recorta nada: el tope de 300 por conversación solo afecta a lo que se muestra en memoria.
 *   5. Lo que no se pudo leer (JSON roto, mensajes con forma inválida) se cuenta y se deja en el respaldo.
 */

import { hlcDeMs } from "./reloj-hibrido";
import type { AlmacenMensajes, RegistroMensaje } from "./almacen";
import { leerBandeja, type EstadoBandeja, type MensajeMalla } from "@/lib/mensajeria/neuronas/bandeja";
import type { ViaMensaje } from "@/lib/mensajeria/medios/tipos";

export const CLAVE_BANDEJA_V1 = "starseed.mensajeria.malla.v1";
export const CLAVE_RESPALDO = `${CLAVE_BANDEJA_V1}.respaldo`;
export const META_MIGRADO = "migrado-v1";
export const META_LEIDO = "leidoHasta";
export const META_VIAS = "vias";

export interface AlmacenamientoClaves {
    getItem(k: string): string | null;
    setItem(k: string, v: string): void;
}

export interface ResultadoMigracion {
    /** Mensajes añadidos al almacén en esta pasada. */
    importados: number;
    /** Ya estaban (o tenían lápida): no se tocaron. */
    existentes: number;
    /** Mensajes del JSON que no cumplían la forma mínima (siguen en el respaldo). */
    descartados: number;
    respaldoCreado: boolean;
    /** El respaldo no se pudo escribir (cuota): la clave vieja sigue intacta y es el respaldo. */
    respaldoFallido: boolean;
    hayDatosViejos: boolean;
}

function contarMensajesCrudos(crudo: string): number {
    try {
        const o = JSON.parse(crudo) as { conv?: Record<string, { mensajes?: unknown[] }> } | null;
        let n = 0;
        for (const c of Object.values(o?.conv ?? {})) if (c && Array.isArray(c.mensajes)) n += c.mensajes.length;
        return n;
    } catch {
        return 0;
    }
}

function registroMigrado(m: MensajeMalla): RegistroMensaje {
    const autor = m.dir === "sale" ? {} : { uid: m.deUid, neurona: m.deNeurona };
    return { id: m.id, clave: m.clave, hlc: m.hlc ?? hlcDeMs(m.at, "migrado"), at: m.at, autor, dir: m.dir, m };
}

/** Lee las vías y los «leído hasta» guardados y los mezcla sin pisar lo ya almacenado. */
async function mezclarMeta(alm: AlmacenMensajes, e: EstadoBandeja): Promise<void> {
    const leido = (await alm.meta<Record<string, number>>(META_LEIDO)) ?? {};
    let cambio = false;
    for (const [k, c] of Object.entries(e.conv)) {
        if (c.leidoHasta > (leido[k] ?? 0)) {
            leido[k] = c.leidoHasta;
            cambio = true;
        }
    }
    if (cambio) await alm.ponerMeta(META_LEIDO, leido);
    const vias = (await alm.meta<Record<string, ViaMensaje>>(META_VIAS)) ?? {};
    let cambioVias = false;
    for (const [k, v] of Object.entries(e.vias)) {
        if (!vias[k]) {
            vias[k] = v;
            cambioVias = true;
        }
    }
    if (cambioVias) await alm.ponerMeta(META_VIAS, vias);
}

/** Importa lo que haya en la clave vieja que el almacén aún no tenga. Nunca lanza. */
export async function migrarDesdeLocalStorage(alm: AlmacenMensajes, ls: AlmacenamientoClaves | null): Promise<ResultadoMigracion> {
    const vacio: ResultadoMigracion = { importados: 0, existentes: 0, descartados: 0, respaldoCreado: false, respaldoFallido: false, hayDatosViejos: false };
    let crudo: string | null = null;
    try {
        crudo = ls ? ls.getItem(CLAVE_BANDEJA_V1) : null;
    } catch {
        crudo = null;
    }
    if (!crudo) return vacio;
    const res = { ...vacio, hayDatosViejos: true };

    // 1 · Respaldo literal, una sola vez.
    try {
        if (ls && ls.getItem(CLAVE_RESPALDO) === null) {
            ls.setItem(CLAVE_RESPALDO, crudo);
            res.respaldoCreado = true;
        }
    } catch {
        res.respaldoFallido = true;
    }

    // 2 · Importar solo lo que falta.
    const estado = leerBandeja(crudo);
    const previos = new Map((await alm.todos()).map((r) => [r.id, r]));
    const nuevos: RegistroMensaje[] = [];
    let leidos = 0;
    for (const c of Object.values(estado.conv)) {
        for (const m of c.mensajes) {
            leidos += 1;
            if (previos.has(m.id)) {
                res.existentes += 1;
                continue;
            }
            const clavePorConv = Object.keys(estado.conv).find((k) => estado.conv[k] === c);
            nuevos.push(registroMigrado({ ...m, clave: m.clave || clavePorConv || "" }));
            previos.set(m.id, nuevos[nuevos.length - 1]);
        }
    }
    res.descartados = Math.max(0, contarMensajesCrudos(crudo) - leidos);
    await alm.poner(nuevos);
    await mezclarMeta(alm, estado);
    res.importados = nuevos.length;
    await alm.ponerMeta(META_MIGRADO, { en: Date.now(), importados: res.importados, existentes: res.existentes, descartados: res.descartados });
    return res;
}

/** Reconstruye la bandeja en memoria desde el almacén (las lápidas no se muestran). */
export async function bandejaDesdeAlmacen(alm: AlmacenMensajes, tope: number): Promise<EstadoBandeja> {
    const [regs, leido, vias] = await Promise.all([
        alm.todos(),
        alm.meta<Record<string, number>>(META_LEIDO),
        alm.meta<Record<string, ViaMensaje>>(META_VIAS),
    ]);
    const porConv = new Map<string, MensajeMalla[]>();
    for (const r of regs) {
        if (r.lapida) continue;
        const m = { ...r.m, id: r.id, clave: r.clave, hlc: r.m.hlc ?? r.hlc, ...(r.subido ? { subido: r.subido } : {}) };
        const l = porConv.get(r.clave);
        if (l) l.push(m);
        else porConv.set(r.clave, [m]);
    }
    const conv: EstadoBandeja["conv"] = {};
    for (const [clave, ms] of porConv) {
        ms.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
        conv[clave] = { mensajes: ms.length > tope ? ms.slice(ms.length - tope) : ms, leidoHasta: leido?.[clave] ?? 0 };
    }
    // Se pasa por el lector de la bandeja: lo que quedó «enviando» al cerrar pasa a esperar.
    return leerBandeja(JSON.stringify({ v: 1, conv, vias: vias ?? {} }));
}
