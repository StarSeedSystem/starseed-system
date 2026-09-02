// ════════════════════════════════════════════════════════════════════════════
// SSO · Detección de sesión StarSeed ya presente en este dispositivo (#93)
// ----------------------------------------------------------------------------
// ⚠️ CORREGIDO 2026-07-12: NO existe un proyecto Supabase compartido por todo el
// ecosistema. El OS/SOSD usa su PROPIO proyecto —`nxstilnyidvkqeosofuh`— con
// cuentas SEPARADAS de las de Nexus/Café (`dzkjapinnewkxzjltadv`). Ver CLAUDE.md
// §2. El helper sigue siendo válido DENTRO del OS: reanuda la sesión del propio
// OS ya presente en este navegador.
// Como el cliente browser del
// OS (`@/utils/supabase/client`, vía `createBrowserClient` de `@supabase/ssr`)
// persiste su sesión bajo la MISMA clave de localStorage que cualquier app del
// ecosistema que use el cliente JS por defecto — `sb-<projectRef>-auth-token` —,
// si el usuario ya inició sesión en Café/Nexus en este navegador, ese token es
// legible por el cliente del OS y `supabase.auth.getSession()` lo devuelve.
//
// Este helper detecta, de forma defensiva, si hay una sesión StarSeed válida en
// el dispositivo (sin pedir credenciales) y devuelve la identidad para ofrecer
// "Continuar como @usuario". Es la base del SessionResumePrompt.
//
// Invariantes:
//   • Aditivo y a prueba de fallos: cualquier error → { found: false }.
//   • SSR-safe: si no hay `window`/localStorage o falla Supabase, no-op.
//   • Solo LECTURA: nunca escribe, nunca cierra ni crea sesión.
//   • No incluye sesiones anónimas (invitado) — solo cuentas reales con correo.
// ════════════════════════════════════════════════════════════════════════════

import { createClient } from "@/utils/supabase/client";
import type { Session } from "@supabase/supabase-js";

// Ref del proyecto Supabase DEL OS (Nexus/Café tienen el suyo: `dzkjapinnewkxzjltadv`).
// Fuente de verdad: `.env.local` + CLAUDE.md §2. Se deriva de la URL en runtime y
// solo se cae a esta constante como respaldo si no hay env var.
// ⚠️ 2026-07-12: este respaldo apuntaba al proyecto EQUIVOCADO (el de Nexus/Café),
// lo que habría hecho leer la clave de localStorage `sb-<ref>-auth-token` de otro
// proyecto si faltase NEXT_PUBLIC_SUPABASE_URL. Corregido.
export const STARSEED_SUPABASE_REF = "nxstilnyidvkqeosofuh";

/** Deriva el project ref desde NEXT_PUBLIC_SUPABASE_URL (https://<ref>.supabase.co). */
export function getSupabaseProjectRef(): string {
    try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
        const m = url.match(/^https?:\/\/([a-z0-9]+)\.supabase\.(co|in|net)/i);
        if (m && m[1] && m[1] !== "dummy") return m[1];
    } catch {
        /* ignore */
    }
    return STARSEED_SUPABASE_REF;
}

/** Clave de localStorage donde `@supabase/ssr` persiste la sesión del proyecto. */
export function getAuthStorageKey(): string {
    return `sb-${getSupabaseProjectRef()}-auth-token`;
}

// ── Identidad mínima que mostramos en el prompt "Continuar como …" ──
export interface DetectedIdentity {
    userId: string;
    /** Handle/usuario si el token trae metadatos; si no, derivado del correo. */
    handle: string | null;
    /** Correo del ecosistema (idealmente la dirección @star.seed). */
    email: string | null;
    /** Avatar si viene en user_metadata. */
    avatarUrl: string | null;
    /** true si la sesión es anónima (invitado) — la excluimos del prompt. */
    isAnonymous: boolean;
}

export interface DetectSessionResult {
    /** Hay una sesión real adoptable en este dispositivo. */
    found: boolean;
    /** Identidad para la UI (solo si found). */
    identity: DetectedIdentity | null;
    /** De dónde se detectó: el cliente Supabase (canónico) o el sondeo de storage. */
    source: "supabase" | "localStorage" | "none";
    /** La sesión viva, por si el consumidor quiere adoptarla/refrescarla. */
    session: Session | null;
}

const EMPTY: DetectSessionResult = {
    found: false,
    identity: null,
    source: "none",
    session: null,
};

/** ¿La cadena parece un correo @star.seed (identidad interna del ecosistema)? */
export function isStarSeedEmail(email: string | null | undefined): boolean {
    return !!email && /@star\.seed$/i.test(email.trim());
}

/** Construye un handle legible a partir de metadatos o del correo, defensivo. */
function deriveHandle(
    meta: Record<string, unknown> | null | undefined,
    email: string | null,
): string | null {
    const pick = (k: string): string | null => {
        const v = meta?.[k];
        return typeof v === "string" && v.trim() ? v.trim() : null;
    };
    return (
        pick("handle") ||
        pick("username") ||
        pick("user_name") ||
        pick("preferred_username") ||
        pick("display_name") ||
        pick("full_name") ||
        pick("name") ||
        (email ? email.split("@")[0] || null : null)
    );
}

/** Extrae avatar de user_metadata con las claves habituales, defensivo. */
function deriveAvatar(meta: Record<string, unknown> | null | undefined): string | null {
    const v = meta?.["avatar_url"] ?? meta?.["avatar"] ?? meta?.["picture"];
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Sondeo defensivo de localStorage: confirma que existe un token de sesión
 * StarSeed (clave `sb-<ref>-auth-token`) sin depender de Supabase. No descifra
 * ni confía en su contenido para decisiones de seguridad — solo sirve como
 * señal secundaria de presencia (la verdad la da `getSession()`).
 */
export function hasStoredStarSeedToken(): boolean {
    try {
        if (typeof window === "undefined" || !window.localStorage) return false;
        const ls = window.localStorage;
        // Coincidencia exacta del proyecto del OS …
        if (ls.getItem(getAuthStorageKey())) return true;
        // … o cualquier token `sb-*-auth-token` (otras superficies StarSeed).
        for (let i = 0; i < ls.length; i++) {
            const k = ls.key(i);
            if (k && /^sb-[a-z0-9]+-auth-token$/i.test(k) && ls.getItem(k)) return true;
        }
    } catch {
        /* localStorage no disponible (modo privado, SSR, etc.) */
    }
    return false;
}

/**
 * Detecta si ya existe una sesión StarSeed válida en este dispositivo y, de ser
 * así, devuelve la identidad para ofrecer entrar con un toque.
 *
 * Estrategia:
 *   1) Vía canónica: `supabase.auth.getSession()` — el cliente del OS lee la
 *      MISMA clave de storage que Café/Nexus (mismo proyecto), por lo que una
 *      sesión iniciada allí aparece aquí. Es la fuente de verdad.
 *   2) Si por cualquier motivo getSession() no devuelve sesión pero sí hay un
 *      token almacenado, lo reportamos como señal débil (`localStorage`) sin
 *      identidad — el consumidor puede decidir reintentar; nunca bloquea.
 *
 * Nunca lanza: cualquier fallo se traduce en `{ found: false }`.
 */
/**
 * Borra el rastro local de una cuenta que ya no existe en el servidor: cierra
 * la sesión y limpia las memorias del dispositivo que la mostraban. Nunca
 * lanza — si algo falla, peor es dejar el fantasma.
 */
async function olvidarCuentaLocal(
    supabase: { auth: { signOut: () => Promise<unknown> } },
): Promise<void> {
    try { await supabase.auth.signOut(); } catch { /* el token ya no vale igualmente */ }
    try {
        const ls = window.localStorage;
        for (const clave of Object.keys(ls)) {
            // Cachés de identidad y del rito. NO se tocan los ajustes del
            // dispositivo (voz, apariencia, timbres): esos son de la neurona,
            // no de la cuenta, y sobreviven a un borrado.
            if (/^starseed\.(account|sso|session|guia|perfil|sistemas|onboard|recien)/.test(clave)) {
                ls.removeItem(clave);
            }
        }
    } catch { /* sin almacenamiento: nada que limpiar */ }
    try { window.sessionStorage.clear(); } catch { /* */ }
}

export async function detectStarSeedSession(): Promise<DetectSessionResult> {
    try {
        if (typeof window === "undefined") return EMPTY;

        const supabase = createClient();
        const { data, error } = await supabase.auth.getSession();
        const session = data?.session ?? null;

        if (!error && session?.user) {
            // ── (Adenda 214) EL FANTASMA DE LA CUENTA BORRADA ────────────────
            // `getSession()` NO habla con el servidor: lee el token guardado en
            // este dispositivo. Si la cuenta se borró en el servidor, el token
            // sigue pareciendo válido hasta que caduca, y el OS seguía
            // ofreciendo «Continuar como @fulano» de una cuenta que ya no
            // existe. Alex lo vivió como «no borraste la cuenta».
            // `getUser()` SÍ pregunta al servidor de auth: si la cuenta no
            // está, falla. Entonces se cierra sesión y se borra el rastro local
            // para que el dispositivo deje de recordar un fantasma.
            const { data: verif, error: errVerif } = await supabase.auth.getUser();
            if (errVerif || !verif?.user) {
                await olvidarCuentaLocal(supabase);
                return EMPTY;
            }

            const user = session.user;
            const isAnonymous = (user as { is_anonymous?: boolean }).is_anonymous === true;
            const email = (user.email ?? null) || null;
            const meta = (user.user_metadata ?? null) as Record<string, unknown> | null;

            const identity: DetectedIdentity = {
                userId: user.id,
                handle: deriveHandle(meta, email),
                email,
                avatarUrl: deriveAvatar(meta),
                isAnonymous,
            };

            // Solo ofrecemos "continuar" para cuentas reales (no invitados).
            if (isAnonymous) return { ...EMPTY, source: "supabase", session };

            return { found: true, identity, source: "supabase", session };
        }

        // Señal secundaria: hay token guardado pero getSession() no resolvió.
        // (Adenda 214) Antes esto bastaba para seguir mostrando la cuenta. Un
        // token que no resuelve es exactamente lo que deja una cuenta borrada,
        // así que ya no se anuncia identidad ninguna a partir de él.
        if (hasStoredStarSeedToken()) {
            return { ...EMPTY, source: "localStorage" };
        }

        return EMPTY;
    } catch {
        return EMPTY;
    }
}

/**
 * Etiqueta corta para la UI: prioriza @handle; si no, el correo; si no, genérico.
 */
export function identityLabel(identity: DetectedIdentity | null): string {
    if (!identity) return "tu cuenta StarSeed";
    if (identity.handle) {
        return identity.handle.startsWith("@") ? identity.handle : `@${identity.handle}`;
    }
    if (identity.email) return identity.email;
    return "tu cuenta StarSeed";
}
