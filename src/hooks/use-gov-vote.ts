// src/hooks/use-gov-vote.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hook de votación de gobernanza con persistencia REAL en Supabase (tabla
// os_gov_votes + RPC os_gov_tally). Lectura pública de recuentos; la escritura
// exige sesión (RLS user_id = auth.uid()). Sin sesión → voto optimista local +
// needsAuth, fiel al patrón de useLikes/useFollow del proyecto.
//
// Cada "papeleta" se identifica por `ballotKey` (estable). Los recuentos se
// siembran con una base determinista (sin Math.random → SSR estable) para que
// la UI nunca se vea vacía, y los votos reales se suman encima.
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export interface GovVoteState {
    tally: Record<string, number>;
    myChoice: string | null;
    total: number;
    loading: boolean;
    needsAuth: boolean;
    vote: (choice: string) => Promise<{ ok?: boolean; needsAuth?: boolean }>;
}

/** Hash determinista → entero estable en [min,max]. */
function seeded(key: string, min = 40, max = 240): number {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const n = Math.abs(h);
    return min + (n % (max - min + 1));
}

export function useGovVote(
    ballotKey: string | undefined,
    opts?: { ballotType?: string; options?: string[]; baseCounts?: number[] },
): GovVoteState {
    const optionsKey = (opts?.options ?? []).join("|");
    const baseKey = (opts?.baseCounts ?? []).join("|");

    // Base determinista (sembrada por papeleta+opción si no se pasan baseCounts).
    const base = useMemo(() => {
        const b: Record<string, number> = {};
        const options = opts?.options ?? [];
        options.forEach((o, i) => {
            b[o] = opts?.baseCounts?.[i] ?? seeded(`${ballotKey ?? "mv"}::${o}`);
        });
        return b;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ballotKey, optionsKey, baseKey]);

    const [tally, setTally] = useState<Record<string, number>>(base);
    const [myChoice, setMyChoice] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(!!ballotKey);
    const [needsAuth, setNeedsAuth] = useState<boolean>(false);
    const mounted = useRef(true);

    const load = useCallback(async () => {
        if (!ballotKey) {
            setTally(base);
            setLoading(false);
            return;
        }
        try {
            const supabase = createClient();
            const { data: rows } = await supabase.rpc("os_gov_tally", { p_ballot_key: ballotKey });
            const t: Record<string, number> = { ...base };
            (rows as { choice: string; votes: number }[] | null ?? []).forEach((r) => {
                t[r.choice] = (t[r.choice] ?? 0) + Number(r.votes);
            });
            const { data: auth } = await supabase.auth.getUser();
            const uid = auth?.user?.id;
            if (!mounted.current) return;
            setTally(t);
            setNeedsAuth(!uid);
            if (uid) {
                const { data: mine } = await supabase
                    .from("os_gov_votes")
                    .select("choice")
                    .eq("ballot_key", ballotKey)
                    .eq("user_id", uid)
                    .maybeSingle();
                if (mounted.current) setMyChoice(mine?.choice ?? null);
            }
        } catch {
            if (mounted.current) setTally(base);
        } finally {
            if (mounted.current) setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ballotKey, base]);

    useEffect(() => {
        mounted.current = true;
        load();
        return () => {
            mounted.current = false;
        };
    }, [load]);

    const vote = useCallback(
        async (choice: string) => {
            // Optimista en todos los casos
            setTally((prev) => {
                const next = { ...prev };
                if (myChoice && myChoice !== choice) next[myChoice] = Math.max(0, (next[myChoice] ?? 1) - 1);
                if (myChoice !== choice) next[choice] = (next[choice] ?? 0) + 1;
                return next;
            });
            setMyChoice(choice);

            if (!ballotKey) return { ok: true };
            try {
                const supabase = createClient();
                const { data: auth } = await supabase.auth.getUser();
                const uid = auth?.user?.id;
                if (!uid) {
                    setNeedsAuth(true);
                    return { needsAuth: true };
                }
                await supabase.from("os_gov_votes").upsert(
                    {
                        ballot_key: ballotKey,
                        choice,
                        ballot_type: opts?.ballotType ?? "general",
                        user_id: uid,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "ballot_key,user_id" },
                );
                load();
                return { ok: true };
            } catch {
                return { ok: true };
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [ballotKey, myChoice, load],
    );

    const total = Object.values(tally).reduce((s, n) => s + n, 0);
    return { tally, myChoice, total, loading, needsAuth, vote };
}
