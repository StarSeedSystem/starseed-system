/**
 * (OFF1108A) Perfil y avatar de la cuenta para abrir la app sin internet.
 *
 * Qué faltaba (prueba 08-11): `AccountProvider` solo hidrataba el perfil guardado SI Supabase devolvía una
 * sesión; sin red y con el token caducado no la devuelve, así que cabecera, avatar y nombre salían vacíos
 * aunque la copia estaba en el aparato. Y el avatar es una URL remota: sin internet no pintaba.
 *
 * Aquí: guardar el perfil (sin secretos) + el avatar como blob en la instantánea, y leerlos de vuelta.
 * El perfil que ya guardaba `AccountProvider` en localStorage sigue siendo la primera fuente (síncrona).
 */

import { instantaneaCuenta, sinSecretos, type AvatarGuardado } from "./instantanea-cuenta";

export type FilaPerfil = Record<string, unknown>;

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** Guarda la fila de perfil y, si cambió la URL del avatar, el avatar. No espera; nunca lanza. */
export function guardarPerfilSinRed(uid: string | null, perfil: FilaPerfil | null, deps: { traer?: typeof fetch } = {}): void {
    if (!uid || !perfil) return;
    void (async () => {
        try {
            const inst = instantaneaCuenta();
            await inst.escribir("perfil", uid, sinSecretos(perfil));
            const url = typeof perfil.avatar_url === "string" ? perfil.avatar_url : "";
            if (!/^https?:\/\//i.test(url) && !/^\//.test(url)) return;
            const previo = await inst.leer<AvatarGuardado>("avatar", uid);
            if (previo?.datos?.url === url) return;
            const traer = deps.traer ?? (typeof fetch === "function" ? fetch.bind(globalThis) : null);
            if (!traer) return;
            const r = await traer(url);
            if (!r.ok) return;
            const bytes = await r.arrayBuffer();
            if (!bytes.byteLength || bytes.byteLength > MAX_AVATAR_BYTES) return;
            await inst.escribir("avatar", uid, { url, tipo: r.headers.get("content-type") || "image/png", bytes } satisfies AvatarGuardado);
        } catch {
            /* sin red o sin espacio: el perfil queda sin avatar local */
        }
    })();
}

export async function leerPerfilSinRed(uid: string | null): Promise<FilaPerfil | null> {
    if (!uid) return null;
    const s = await instantaneaCuenta().leer<FilaPerfil>("perfil", uid);
    return s?.datos && typeof s.datos === "object" ? s.datos : null;
}

/** URL local (`blob:`) del avatar guardado, o null. Quien la use no tiene que liberarla: dura lo que la página. */
export async function avatarLocalSinRed(uid: string | null): Promise<string | null> {
    if (!uid || typeof URL === "undefined" || typeof Blob === "undefined") return null;
    try {
        const s = await instantaneaCuenta().leer<AvatarGuardado>("avatar", uid);
        if (!s?.datos?.bytes) return null;
        return URL.createObjectURL(new Blob([s.datos.bytes], { type: s.datos.tipo || "image/png" }));
    } catch {
        return null;
    }
}

/**
 * Perfil para pintar sin internet: la fila guardada y, si hay avatar local, `avatar_url` apunta a él
 * (la URL remota se conserva en `avatar_url_remota`). Pura salvo la lectura del almacén.
 */
export async function perfilParaSinRed(uid: string | null, deLocalStorage: FilaPerfil | null): Promise<FilaPerfil | null> {
    const base = deLocalStorage ?? (await leerPerfilSinRed(uid));
    if (!base) return null;
    const local = await avatarLocalSinRed(uid);
    if (!local) return base;
    return { ...base, avatar_url_remota: base.avatar_url ?? null, avatar_url: local };
}
