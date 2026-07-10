"use client";

// ════════════════════════════════════════════════════════════════
// AccountProvider — Cuenta / Sesión soberana unificada (StarSeed)
// ----------------------------------------------------------------
// Sesión real con Supabase (proyecto unificado Portal/Café/SOSD),
// compartida por TODAS las áreas vía useAccount().
//
//   • Lee supabase.auth.getSession() al montar.
//   • Se suscribe a onAuthStateChange para mantenerse en vivo.
//   • Carga el perfil del usuario (cafe_profiles → fallback profiles)
//     por user.id, tolerante a fallos (try/catch, nunca rompe).
//   • signOut() cierra la sesión soberana en todo el ecosistema.
//
// Tolerante: si no hay sesión → user = null, profile = null. La UI
// debe degradar con elegancia (mostrar "Entrar", etc.). SSR-safe:
// "use client" + sin acceso directo a window.
// ════════════════════════════════════════════════════════════════

import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";
import { onTableChange, type RealtimePayload } from "@/lib/realtime/realtime";
import { ensureDefaultBrain } from "@/lib/brains/brains";

// ── Perfil unificado (subconjunto tolerante de cafe_profiles/profiles) ──
export interface AccountProfile {
    id?: string | null;
    user_id?: string | null;
    handle?: string | null;
    username?: string | null;
    display_name?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    [key: string]: unknown;
}

interface AccountContextType {
    session: Session | null;
    user: User | null;
    profile: AccountProfile | null;
    loading: boolean;
    /**
     * true solo cuando el perfil tiene datos REALES mínimos (un @handle y un
     * nombre visible reales, no placeholders demo). Si es false y hay sesión,
     * la UI debe pedir completar el perfil real (ver onboarding / ajustes).
     */
    profileComplete: boolean;
    signOut: () => Promise<void>;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

// ── De-mock: valores genéricos/demo que NO deben tratarse como identidad real ──
// (avatares y nombres de ejemplo históricos del proyecto). Si un perfil llega con
// alguno de estos, los neutralizamos para no mostrar datos falsos por defecto.
const FAKE_HANDLES = new Set([
    "starseeduser",
    "starseed_user",
    "starseeduser0",
    "usuario",
    "user",
    "demo",
    "guest",
    "invitado",
    "anon",
    "anonymous",
]);
const FAKE_NAMES = new Set([
    "starseed user",
    "usuario starseed",
    "usuario",
    "user",
    "demo user",
    "guest",
    "invitado",
    "nuevo usuario",
]);

function isFakeHandle(v: unknown): boolean {
    return typeof v === "string" && FAKE_HANDLES.has(v.trim().toLowerCase());
}
function isFakeName(v: unknown): boolean {
    return typeof v === "string" && FAKE_NAMES.has(v.trim().toLowerCase());
}

/**
 * Limpia un perfil de placeholders demo para que la app nunca muestre datos
 * falsos como si fueran reales. Los campos con valores de ejemplo se anulan
 * (quedan vacíos → la UI degrada con honestidad y pide completarlos).
 */
function sanitizeProfile(p: AccountProfile | null): AccountProfile | null {
    if (!p) return p;
    const out: AccountProfile = { ...p };
    if (isFakeHandle(out.handle)) out.handle = null;
    if (isFakeHandle(out.username)) out.username = null;
    if (isFakeName(out.display_name)) out.display_name = null;
    if (isFakeName(out.full_name)) out.full_name = null;
    return out;
}

/** ¿El perfil tiene datos reales mínimos (handle + nombre, sin placeholders)? */
export function isProfileComplete(p: AccountProfile | null): boolean {
    if (!p) return false;
    const handle = (p.handle ?? p.username ?? null) as string | null;
    const name = (p.display_name ?? p.full_name ?? null) as string | null;
    const handleOk = !!handle && handle.trim().length > 0 && !isFakeHandle(handle);
    const nameOk = !!name && name.trim().length > 0 && !isFakeName(name);
    return handleOk && nameOk;
}

// ── Carga del perfil: cafe_profiles primero, profiles como fallback ──
async function loadProfile(
    supabase: ReturnType<typeof createClient>,
    userId: string,
): Promise<AccountProfile | null> {
    // 0) os_profiles (StarSeed OS sovereign identity)
    try {
        const { data, error } = await supabase
            .from("os_profiles")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();
        if (!error && data) return data as AccountProfile;
    } catch {
        // ignorar y probar fallback
    }
    // 1) cafe_profiles (por user_id)
    try {
        const { data, error } = await supabase
            .from("cafe_profiles")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();
        if (!error && data) return data as AccountProfile;
    } catch {
        // ignorar y probar fallback
    }
    // 2) profiles (por id == user.id, patrón típico de la tabla profiles)
    try {
        const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle();
        if (!error && data) return data as AccountProfile;
    } catch {
        // ignorar
    }
    return null;
}

export function AccountProvider({ children }: { children: ReactNode }) {
    const supabase = useMemo(() => createClient(), []);

    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<AccountProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;

        const applySession = async (nextSession: Session | null) => {
            if (!active) return;
            setSession(nextSession);
            const nextUser = nextSession?.user ?? null;
            setUser(nextUser);
            if (nextUser) {
                try {
                    const p = await loadProfile(supabase, nextUser.id);
                    // De-mock: nunca dejar pasar placeholders demo como identidad real.
                    if (active) setProfile(sanitizeProfile(p));
                } catch {
                    if (active) setProfile(null);
                }
                // Auto-crea un Cerebro StarSeed por defecto si el usuario no tiene
                // ninguno. NO bloquea el login: fire-and-forget, idempotente y
                // tolerante a fallos (ensureDefaultBrain ya envuelve todo en
                // try/catch y es no-op si ya existe un cerebro o si falla).
                void ensureDefaultBrain().catch(() => {
                    /* nunca bloquea ni rompe el alta/login */
                });
            } else if (active) {
                setProfile(null);
            }
        };

        // Sesión inicial
        (async () => {
            try {
                const { data } = await supabase.auth.getSession();
                await applySession(data.session ?? null);
            } catch {
                if (active) {
                    setSession(null);
                    setUser(null);
                    setProfile(null);
                }
            } finally {
                if (active) setLoading(false);
            }
        })();

        // Suscripción en vivo a cambios de auth
        const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            void applySession(nextSession ?? null);
        });

        return () => {
            active = false;
            sub.subscription.unsubscribe();
        };
    }, [supabase]);

    // ── Realtime: propaga cambios de perfil EN VIVO a toda la UI ──────────────
    // Suscripción aditiva y defensiva: NO toca la carga inicial de arriba. Cuando
    // la fila de perfil del usuario cambia (UPDATE) en Supabase, fusionamos los
    // campos nuevos en el estado `profile` en memoria, de modo que el chip de
    // cuenta, el menú de usuario, la página de perfil y cualquier consumidor de
    // useAccount() se actualicen sin recargar. Reutilizamos la primitiva común
    // `onTableChange` (SSR-safe, envuelta en try/catch; no-op si realtime falla).
    //
    // Esquema tolerante: distintas áreas escriben `profiles` filtrando por
    // `user_id` (cuenta/ajustes) mientras que la carga aquí también prueba `id`.
    // Nos suscribimos a AMBOS filtros y, además, a `cafe_profiles` (tabla que
    // loadProfile intenta primero), para captar el cambio venga de donde venga.
    const userId = user?.id ?? null;
    useEffect(() => {
        if (typeof window === "undefined" || !userId) return;

        // Fusiona en memoria la fila nueva del payload sobre el perfil actual.
        const mergeProfileRow = (payload: RealtimePayload<AccountProfile>) => {
            const next = payload?.new;
            if (!next || typeof next !== "object") return;
            // Fusiona y sanea: los placeholders demo entrantes tampoco cuentan.
            setProfile((prev) => sanitizeProfile({ ...(prev ?? {}), ...(next as AccountProfile) }));
        };

        // Limpiadores de cada suscripción (best-effort, tolerantes a fallos).
        const unsubs: Array<() => void> = [];
        try {
            // profiles filtrada por user_id (patrón de escritura cuenta/ajustes)
            unsubs.push(
                onTableChange<AccountProfile>(
                    "profiles",
                    { event: "UPDATE", filter: `user_id=eq.${userId}` },
                    mergeProfileRow,
                ),
            );
            // profiles filtrada por id (patrón típico de la tabla profiles)
            unsubs.push(
                onTableChange<AccountProfile>(
                    "profiles",
                    { event: "UPDATE", filter: `id=eq.${userId}` },
                    mergeProfileRow,
                ),
            );
            // os_profiles filtrada por user_id (tabla soberana de StarSeed)
            unsubs.push(
                onTableChange<AccountProfile>(
                    "os_profiles",
                    { event: "*", filter: `user_id=eq.${userId}` },
                    mergeProfileRow,
                ),
            );
            // cafe_profiles filtrada por user_id (tabla preferente del ecosistema)
            unsubs.push(
                onTableChange<AccountProfile>(
                    "cafe_profiles",
                    { event: "UPDATE", filter: `user_id=eq.${userId}` },
                    mergeProfileRow,
                ),
            );
        } catch {
            // Si algo falla al suscribir, degradamos a comportamiento previo.
        }

        return () => {
            for (const unsub of unsubs) {
                try {
                    unsub();
                } catch {
                    /* limpieza best-effort */
                }
            }
        };
    }, [userId]);

    const signOut = async () => {
        try {
            await supabase.auth.signOut();
        } catch {
            // tolerante: aunque falle el round-trip, limpiamos local
        }
        setSession(null);
        setUser(null);
        setProfile(null);
    };

    const value = useMemo<AccountContextType>(
        () => ({
            session,
            user,
            profile,
            loading,
            profileComplete: isProfileComplete(profile),
            signOut,
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [session, user, profile, loading],
    );

    return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextType {
    const ctx = useContext(AccountContext);
    if (!ctx) {
        throw new Error("useAccount debe usarse dentro de <AccountProvider>");
    }
    return ctx;
}
