"use client";

/**
 * Quién soy en una llamada.
 *
 * · Cada pestaña es un participante distinto: la clave de presencia (y el id del par WebRTC) es
 *   `<uid>:<sufijo de pestaña>`. Así, si alguien entra desde el móvil y el ordenador, son dos
 *   mosaicos y no se pisan las conexiones.
 * · Un invitado con enlace público no tiene cuenta: su id es `inv-<aleatorio>` y vive en
 *   sessionStorage (se conserva al recargar esa pestaña, no se comparte con otras).
 */
import { getCurrentUserId } from "@/lib/os-social";
import { fetchMyProfile } from "@/lib/social/os-profiles";
import { sanearNombre, urlAvatarSegura } from "@/lib/llamadas/presencia";

function aleatorio(largo: number): string {
    try {
        const c = globalThis.crypto;
        if (c?.randomUUID) return c.randomUUID().replace(/-/g, "").slice(0, largo);
        if (c?.getRandomValues) {
            const b = new Uint8Array(largo);
            c.getRandomValues(b);
            return Array.from(b, (x) => (x % 36).toString(36)).join("");
        }
    } catch {
        /* sigue abajo */
    }
    return Math.random().toString(36).slice(2, 2 + largo).padEnd(largo, "0");
}

/** Sufijo fijo durante la vida de esta pestaña. */
const SUFIJO_PESTANA = aleatorio(6);

export function clavePestana(base: string): string {
    return `${base}:${SUFIJO_PESTANA}`;
}

export interface Identidad {
    /** Base del id (uid o inv-xxxx). */
    base: string;
    uid: string | null;
    nombre: string;
    avatar: string | null;
    invitado: boolean;
}

const CLAVE_INVITADO = "starseed.llamadas.invitado.v1";

function almacen(): Storage | null {
    try {
        return typeof window !== "undefined" ? window.sessionStorage : null;
    } catch {
        return null;
    }
}

/** Identidad de invitado de esta pestaña (la crea si no existe). */
export function leerInvitado(storage: Storage | null = almacen()): { id: string; nombre: string } {
    try {
        const crudo = storage?.getItem(CLAVE_INVITADO);
        if (crudo) {
            const o = JSON.parse(crudo) as { id?: unknown; nombre?: unknown };
            if (typeof o.id === "string" && /^inv-[a-z0-9]{6,20}$/.test(o.id)) {
                return { id: o.id, nombre: typeof o.nombre === "string" ? sanearNombre(o.nombre, "") : "" };
            }
        }
    } catch {
        /* storage corrupto o bloqueado: se crea uno nuevo */
    }
    const nuevo = { id: `inv-${aleatorio(10).toLowerCase()}`, nombre: "" };
    try {
        storage?.setItem(CLAVE_INVITADO, JSON.stringify(nuevo));
    } catch {
        /* sin storage: vale para esta visita */
    }
    return nuevo;
}

export function guardarNombreInvitado(nombre: string, storage: Storage | null = almacen()): { id: string; nombre: string } {
    const actual = leerInvitado(storage);
    const limpio = sanearNombre(nombre, "Invitado");
    const siguiente = { id: actual.id, nombre: limpio };
    try {
        storage?.setItem(CLAVE_INVITADO, JSON.stringify(siguiente));
    } catch {
        /* sin storage */
    }
    return siguiente;
}

/** Identidad del usuario con sesión (nombre y foto de su perfil), o null sin sesión. */
export async function miIdentidad(): Promise<Identidad | null> {
    const uid = await getCurrentUserId();
    if (!uid) return null;
    let nombre = "Yo";
    let avatar: string | null = null;
    try {
        const p = await fetchMyProfile();
        if (p) {
            nombre = sanearNombre(p.displayName || p.username, "Yo");
            avatar = urlAvatarSegura(p.avatarUrl);
        }
    } catch {
        /* sin perfil: nombre genérico */
    }
    return { base: uid, uid, nombre, avatar, invitado: false };
}

export function identidadInvitado(nombre: string): Identidad {
    const inv = guardarNombreInvitado(nombre);
    return { base: inv.id, uid: null, nombre: inv.nombre, avatar: null, invitado: true };
}
