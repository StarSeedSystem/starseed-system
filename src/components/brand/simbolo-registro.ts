// ════════════════════════════════════════════════════════════════
// StarSeed OS — «Símbolo del escritorio» por perfil, página y grupo (ESC1110B)
// ----------------------------------------------------------------
// Lógica PURA del ajuste: forma del registro guardado, su migración, la
// copia local (local-first) y la resolución por ámbito. La E/S con la nube
// (`entity_state`, sin migraciones de Supabase) vive en `simbolo-almacen.ts`.
//
// Dónde se guarda cada ámbito (mecanismos existentes):
//   · perfil  → entity_state { kind: "user", id: uid }, clave
//               `simbolo-escritorio.perfil.<perfilId>` (RLS: el propio usuario);
//   · página  → entity_state { kind: "page",  id: slug }, clave `simbolo-escritorio`;
//   · grupo   → entity_state { kind: "group", id: slug }, clave `simbolo-escritorio`.
// En este aparato, además, una copia en localStorage (`starseed.escritorio.simbolo.v1`)
// para pintar al instante y sin conexión.
// ════════════════════════════════════════════════════════════════

import { SIMBOLO_OFICIAL, validarArchivoSimbolo, type ArchivoSimbolo } from "./simbolo-archivo";

export const CLAVE_LOCAL_SIMBOLO = "starseed.escritorio.simbolo.v1";
export const CLAVE_ENTIDAD_SIMBOLO = "simbolo-escritorio";
export const EVENTO_SIMBOLO = "starseed:simbolo-escritorio";
export const VERSION_REGISTRO = 1 as const;

export type AmbitoSimbolo = "perfil" | "pagina" | "grupo";

export interface DestinoSimbolo {
    ambito: AmbitoSimbolo;
    /** Id del perfil del OS, o slug de la página o del grupo. */
    id: string;
    /** Nombre visible (para rotular el símbolo propio). */
    nombre?: string;
}

export interface RegistroSimbolo {
    v: typeof VERSION_REGISTRO;
    /** null = el oficial. */
    archivo: ArchivoSimbolo | null;
    actualizado: number;
    /** Id de la molécula de la Protomolécula enlazada (ida y vuelta). */
    protomolecula?: string;
}

export const REGISTRO_OFICIAL: RegistroSimbolo = Object.freeze({ v: VERSION_REGISTRO, archivo: null, actualizado: 0 }) as RegistroSimbolo;

/** Clave de la copia local para un destino. */
export function claveDestino(d: DestinoSimbolo): string {
    return `${d.ambito}:${d.id}`;
}

/** Clave de `entity_state` para un destino. */
export function claveEntidad(d: DestinoSimbolo): string {
    return d.ambito === "perfil" ? `${CLAVE_ENTIDAD_SIMBOLO}.perfil.${d.id}` : CLAVE_ENTIDAD_SIMBOLO;
}

/**
 * Migra lo que haya guardado (de cualquier época) al registro v1:
 *   · nada / "oficial"                    → oficial;
 *   · un archivo de símbolo suelto (v0)   → se envuelve en el registro;
 *   · registro v1                         → se revalida su archivo;
 *   · cualquier otra cosa                 → oficial, con el motivo.
 * Nunca lanza.
 */
export function migrarRegistro(bruto: unknown): { registro: RegistroSimbolo; motivo: string | null } {
    if (bruto === null || bruto === undefined || bruto === "oficial") return { registro: REGISTRO_OFICIAL, motivo: null };
    if (typeof bruto === "string") {
        try { return migrarRegistro(JSON.parse(bruto)); } catch { return { registro: REGISTRO_OFICIAL, motivo: "el ajuste guardado no es JSON" }; }
    }
    if (typeof bruto !== "object" || Array.isArray(bruto)) return { registro: REGISTRO_OFICIAL, motivo: "el ajuste guardado no se entiende" };
    const o = bruto as Record<string, unknown>;
    // v0: el archivo guardado tal cual, sin envoltorio.
    if (o.formato !== undefined && o.v === undefined) {
        const r = validarArchivoSimbolo(o);
        return r.ok
            ? { registro: { v: VERSION_REGISTRO, archivo: r.archivo, actualizado: 0 }, motivo: null }
            : { registro: REGISTRO_OFICIAL, motivo: r.motivo };
    }
    if (o.v !== VERSION_REGISTRO) return { registro: REGISTRO_OFICIAL, motivo: `versión de ajuste desconocida (${String(o.v)})` };
    const actualizado = typeof o.actualizado === "number" && Number.isFinite(o.actualizado) ? o.actualizado : 0;
    const protomolecula = typeof o.protomolecula === "string" && /^[\w.:-]{1,80}$/.test(o.protomolecula) ? o.protomolecula : undefined;
    if (o.archivo === null || o.archivo === undefined) return { registro: { v: VERSION_REGISTRO, archivo: null, actualizado, ...(protomolecula ? { protomolecula } : {}) }, motivo: null };
    const r = validarArchivoSimbolo(o.archivo);
    if (!r.ok) return { registro: { v: VERSION_REGISTRO, archivo: null, actualizado }, motivo: r.motivo };
    return { registro: { v: VERSION_REGISTRO, archivo: r.archivo, actualizado, ...(protomolecula ? { protomolecula } : {}) }, motivo: null };
}

/** Lo que pinta el escritorio: entidad (página o grupo) › perfil › oficial. */
export function resolverSimbolo(por: { entidad?: RegistroSimbolo | null; perfil?: RegistroSimbolo | null }): { archivo: ArchivoSimbolo; de: AmbitoSimbolo | "oficial" | "entidad" } {
    if (por.entidad?.archivo) return { archivo: por.entidad.archivo, de: "entidad" };
    if (por.perfil?.archivo) return { archivo: por.perfil.archivo, de: "perfil" };
    return { archivo: SIMBOLO_OFICIAL, de: "oficial" };
}

type Lector = Pick<Storage, "getItem">;
type Escritor = Pick<Storage, "getItem" | "setItem">;

function almacenNavegador(): Storage | null {
    try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

/** Mapa local completo (migrado). */
export function leerMapaLocal(almacen: Lector | null = almacenNavegador()): Record<string, RegistroSimbolo> {
    try {
        const crudo = almacen?.getItem(CLAVE_LOCAL_SIMBOLO);
        if (!crudo) return {};
        const obj = JSON.parse(crudo) as { v?: number; entradas?: Record<string, unknown> };
        const out: Record<string, RegistroSimbolo> = {};
        for (const [k, val] of Object.entries(obj?.entradas ?? {})) out[k] = migrarRegistro(val).registro;
        return out;
    } catch {
        return {};
    }
}

export function leerLocal(d: DestinoSimbolo, almacen: Lector | null = almacenNavegador()): RegistroSimbolo {
    return leerMapaLocal(almacen)[claveDestino(d)] ?? REGISTRO_OFICIAL;
}

/** Guarda la copia local y avisa a la app en vivo. Nunca lanza. Devuelve false si no cupo. */
export function guardarLocal(d: DestinoSimbolo, r: RegistroSimbolo, almacen: Escritor | null = almacenNavegador()): boolean {
    try {
        if (!almacen) return false;
        const mapa = leerMapaLocal(almacen);
        if (r.archivo === null && !r.protomolecula) delete mapa[claveDestino(d)];
        else mapa[claveDestino(d)] = r;
        almacen.setItem(CLAVE_LOCAL_SIMBOLO, JSON.stringify({ v: VERSION_REGISTRO, entradas: mapa }));
    } catch {
        return false;
    }
    try {
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENTO_SIMBOLO, { detail: { clave: claveDestino(d) } }));
    } catch { /* sin ventana */ }
    return true;
}

/** Registro nuevo con un archivo (o el oficial con null). */
export function nuevoRegistro(archivo: ArchivoSimbolo | null, ahora: number, protomolecula?: string): RegistroSimbolo {
    return { v: VERSION_REGISTRO, archivo, actualizado: ahora, ...(protomolecula ? { protomolecula } : {}) };
}

/** Rótulo del símbolo propio (la marca oficial no se rotula). */
export function rotuloSimbolo(archivo: ArchivoSimbolo, d?: Pick<DestinoSimbolo, "ambito" | "nombre"> | null): string | null {
    if (archivo.fuente.tipo === "oficial") return null;
    const de = d?.nombre ? ` de ${d.nombre}` : d?.ambito === "pagina" ? " de esta página" : d?.ambito === "grupo" ? " de este grupo" : " de este perfil";
    return `Símbolo propio${de}`;
}
