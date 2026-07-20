"use client";

/*
 * LanguageExchange — Intercambio cultural por parejas de idiomas (Adenda 77).
 * Editor de preferencias + matching REAL entre perfiles de la red que se
 * complementan (hablan lo que aprendes). Tarjetas con afinidad explicada,
 * «Conectar» (DM real), «Practicar» (chat de Astraura) y traducción inline.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Users, RefreshCw, Loader2, MessageSquarePlus, Sparkles, ArrowLeftRight, ExternalLink, Handshake } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    loadCulturalPrefs,
    listCulturalProfiles,
    matchLanguagePartners,
    languageLabel,
    exchangeSystemPrompt,
    type CulturalPrefs,
    type LanguageMatch,
} from "@/lib/cultural/languages";
import { systemById } from "@/lib/cultural/systems";
import { createDm } from "@/lib/messages/dm";
import { CulturalPrefsEditor } from "./cultural-prefs-editor";
import { ExchangeChat } from "./exchange-chat";
import { TranslateButton } from "./translate-button";

export function LanguageExchange() {
    const router = useRouter();
    const [prefs, setPrefs] = useState<CulturalPrefs | null>(null);
    const [matches, setMatches] = useState<LanguageMatch[]>([]);
    const [loading, setLoading] = useState(false);
    const [ran, setRan] = useState(false);
    const [connecting, setConnecting] = useState<string | null>(null);
    const [practiceWith, setPracticeWith] = useState<string | null>(null);

    const declaredEnough = !!prefs && (prefs.speaks.length > 0 || prefs.learns.length > 0);

    const runMatch = useCallback(async () => {
        setLoading(true);
        setRan(true);
        try {
            const mine = await loadCulturalPrefs();
            setPrefs(mine);
            const candidates = await listCulturalProfiles(250);
            setMatches(matchLanguagePartners(mine, candidates));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadCulturalPrefs().then(setPrefs);
    }, []);

    const handleConnect = async (userId: string) => {
        setConnecting(userId);
        try {
            const res = await createDm(userId);
            if (!res.ok) {
                toast.error(res.error || "No se pudo iniciar la conversación.");
                return;
            }
            toast.success("Conversación iniciada.");
            router.push("/messages");
        } catch {
            toast.error("No se pudo conectar ahora mismo.");
        } finally {
            setConnecting(null);
        }
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-1">
                <h3 className="flex items-center gap-2 text-lg font-black tracking-tight text-foreground/90">
                    <ArrowLeftRight className="size-5 text-primary" /> Intercambio de idiomas
                </h3>
                <p className="max-w-2xl text-sm text-muted-foreground">
                    Declara qué hablas y qué aprendes. Te emparejamos con ciudadanos de la red que hablan lo que aprendes
                    (y viceversa) — un intercambio real y recíproco.
                </p>
            </div>

            <CulturalPrefsEditor
                onSaved={(p) => {
                    setPrefs(p);
                    void runMatch();
                }}
            />

            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={runMatch}
                    disabled={loading}
                    className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border border-primary/30 bg-primary/15 px-4 py-2 text-sm font-bold text-primary transition-colors hover:bg-primary/25 disabled:opacity-60"
                >
                    {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                    Buscar parejas de intercambio
                </button>
                {ran && !loading && (
                    <span className="text-xs text-muted-foreground">
                        {matches.length} pareja{matches.length === 1 ? "" : "s"} compatible{matches.length === 1 ? "" : "s"}
                    </span>
                )}
            </div>

            {ran && !loading && !declaredEnough && (
                <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-4 text-sm text-amber-200/90">
                    Declara al menos un idioma que hablas o aprendes arriba para encontrar parejas.
                </div>
            )}

            {ran && !loading && declaredEnough && matches.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center text-sm text-muted-foreground">
                    Todavía no hay ciudadanos con idiomas complementarios a los tuyos. A medida que más gente declare sus
                    idiomas, aparecerán aquí. Comparte el Hub con tu comunidad para tejer la red.
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {matches.map((m) => {
                    const sys = systemById(m.prefs.region?.systemId);
                    const initials = (m.profile.displayName || "?").slice(0, 2).toUpperCase();
                    const practicing = practiceWith === m.profile.userId;
                    return (
                        <div
                            key={m.profile.userId}
                            className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur transition-colors hover:border-primary/25"
                        >
                            <div className="flex items-start gap-3">
                                <Avatar className="size-11 border border-white/15">
                                    <AvatarImage src={m.profile.avatarUrl || undefined} alt={m.profile.displayName} />
                                    <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">{initials}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <p className="truncate font-bold text-foreground">{m.profile.displayName}</p>
                                        {m.reciprocal && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-300">
                                                <Handshake className="size-2.5" /> recíproco
                                            </span>
                                        )}
                                    </div>
                                    <p className="flex items-center gap-1 text-[11px]" style={{ color: sys.color }}>
                                        <Sparkles className="size-2.5" /> {sys.label}
                                        {m.prefs.region?.label ? ` · ${m.prefs.region.label}` : ""}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-black" style={{ color: sys.color }}>
                                        {m.affinity}
                                    </p>
                                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">afinidad</p>
                                </div>
                            </div>

                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${m.affinity}%`, background: sys.color }} />
                            </div>

                            <p className="text-xs leading-relaxed text-muted-foreground">{m.reason}</p>

                            {m.profile.bio && (
                                <TranslateButton text={m.profile.bio} compact={false} />
                            )}

                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleConnect(m.profile.userId)}
                                    disabled={connecting === m.profile.userId}
                                    className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-full bg-primary/90 px-3 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary disabled:opacity-60"
                                >
                                    {connecting === m.profile.userId ? <Loader2 className="size-3.5 animate-spin" /> : <MessageSquarePlus className="size-3.5" />}
                                    Conectar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPracticeWith(practicing ? null : m.profile.userId)}
                                    className={cn(
                                        "inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
                                        practicing ? "border-primary/40 bg-primary/15 text-primary" : "border-white/15 text-foreground/80 hover:border-primary/30",
                                    )}
                                >
                                    <Sparkles className="size-3.5" /> {practicing ? "Cerrar" : "Practicar"}
                                </button>
                                {m.profile.username && (
                                    <Link
                                        href={`/profile/${m.profile.username}`}
                                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold text-foreground/70 transition-colors hover:border-white/40"
                                    >
                                        <ExternalLink className="size-3.5" /> Perfil
                                    </Link>
                                )}
                            </div>

                            {practicing && prefs && (
                                <ExchangeChat
                                    systemPrompt={exchangeSystemPrompt(prefs, m)}
                                    partnerName={m.profile.displayName}
                                    starter={`¡Hola! Me encantaría practicar ${m.theyTeachYou.map(languageLabel).join(", ") || "contigo"}.`}
                                    onClose={() => setPracticeWith(null)}
                                    className="mt-1"
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            {!ran && (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/12 p-8 text-center">
                    <Users className="size-7 text-muted-foreground" />
                    <p className="max-w-md text-sm text-muted-foreground">
                        Guarda tus idiomas y pulsa «Buscar parejas» para encontrar tu intercambio cultural.
                    </p>
                </div>
            )}
        </div>
    );
}

export default LanguageExchange;
