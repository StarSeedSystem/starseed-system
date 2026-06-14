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
    signOut: () => Promise<void>;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

// ── Carga del perfil: cafe_profiles primero, profiles como fallback ──
async function loadProfile(
    supabase: ReturnType<typeof createClient>,
    userId: string,
): Promise<AccountProfile | null> {
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
                    if (active) setProfile(p);
                } catch {
                    if (active) setProfile(null);
                }
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
        () => ({ session, user, profile, loading, signOut }),
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
