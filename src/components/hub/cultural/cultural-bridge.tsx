"use client";

/*
 * CulturalBridge — Onboarding «puente cultural» (Adenda 77 · PACK 2, punto 13).
 * Flujo de 3 pasos glass: (1) declara idiomas/región → (2) te sugerimos un
 * mentor de OTRO sistema cultural (matching real + diversidad cross-sistema; si
 * H1 expone su lib de diversidad en runtime, se usa de forma defensiva) →
 * (3) crea la conexión (DM real) y practica con Astraura.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Compass, Loader2, Check, Sparkles, MessageSquarePlus, ArrowRight, ArrowLeft, Handshake, ExternalLink, Globe2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    loadCulturalPrefs, listCulturalProfiles, matchLanguagePartners, pickCrossSystemMentor,
    exchangeSystemPrompt, languageLabel, type CulturalPrefs, type LanguageMatch,
} from "@/lib/cultural/languages";
import { systemById } from "@/lib/cultural/systems";
import { createDm } from "@/lib/messages/dm";
import { CulturalPrefsEditor } from "./cultural-prefs-editor";
import { ExchangeChat } from "./exchange-chat";

const STEPS = ["Tus idiomas", "Tu mentor", "Conexión"] as const;

/**
 * Selección de mentor con diversidad. Si el Hub social (H1) expone en runtime un
 * selector de diversidad (`window.__starseedHubDiversity`), se usa de forma
 * DEFENSIVA; si no existe, usamos nuestra selección cross-sistema propia.
 */
function selectMentor(mine: CulturalPrefs, matches: LanguageMatch[]): LanguageMatch | null {
    try {
        const hook = (globalThis as unknown as { __starseedHubDiversity?: (m: LanguageMatch[]) => LanguageMatch | null }).__starseedHubDiversity;
        if (typeof hook === "function") {
            const picked = hook(matches);
            if (picked) return picked;
        }
    } catch {
        /* defensivo: si el hook de H1 falla, seguimos con lo nuestro */
    }
    return pickCrossSystemMentor(mine, matches);
}

export function CulturalBridge() {
    const router = useRouter();
    const [step, setStep] = useState(0);
    const [prefs, setPrefs] = useState<CulturalPrefs | null>(null);
    const [mentor, setMentor] = useState<LanguageMatch | null>(null);
    const [searching, setSearching] = useState(false);
    const [connected, setConnected] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [showChat, setShowChat] = useState(false);

    const findMentor = async () => {
        setSearching(true);
        try {
            const mine = await loadCulturalPrefs();
            setPrefs(mine);
            const candidates = await listCulturalProfiles(250);
            const matches = matchLanguagePartners(mine, candidates);
            setMentor(selectMentor(mine, matches));
            setStep(1);
        } finally {
            setSearching(false);
        }
    };

    const connect = async () => {
        if (!mentor) return;
        setConnecting(true);
        try {
            const res = await createDm(mentor.profile.userId);
            if (!res.ok) {
                toast.error(res.error || "Inicia sesión para crear la conexión.");
                return;
            }
            setConnected(true);
            toast.success("¡Puente cultural tejido! Conexión creada.");
        } finally {
            setConnecting(false);
        }
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-1">
                <h3 className="flex items-center gap-2 text-lg font-black tracking-tight text-foreground/90">
                    <Compass className="size-5 text-primary" /> Puente cultural
                </h3>
                <p className="max-w-2xl text-sm text-muted-foreground">
                    En tres pasos, tejemos un puente entre tú y un mentor de otro sistema cultural. Diversidad real,
                    reciprocidad y una primera conversación guiada por Astraura.
                </p>
            </div>

            {/* Indicador de pasos */}
            <div className="flex items-center gap-2">
                {STEPS.map((label, i) => (
                    <div key={label} className="flex flex-1 items-center gap-2">
                        <div
                            className={cn(
                                "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-black transition-colors",
                                i < step ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300" : i === step ? "border-primary/50 bg-primary/15 text-primary" : "border-white/12 text-muted-foreground",
                            )}
                        >
                            {i < step ? <Check className="size-4" /> : i + 1}
                        </div>
                        <span className={cn("text-[11px] font-bold uppercase tracking-wider", i === step ? "text-foreground" : "text-muted-foreground")}>{label}</span>
                        {i < STEPS.length - 1 && <div className="h-px flex-1 bg-white/10" />}
                    </div>
                ))}
            </div>

            {/* Paso 1 */}
            {step === 0 && (
                <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-1 backdrop-blur">
                    <CulturalPrefsEditor
                        onSaved={(p) => {
                            setPrefs(p);
                            void findMentor();
                        }}
                    />
                    <div className="flex justify-end px-3 pb-3">
                        <button
                            type="button"
                            onClick={findMentor}
                            disabled={searching}
                            className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full bg-primary/90 px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary disabled:opacity-60"
                        >
                            {searching ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                            Buscar mi mentor
                        </button>
                    </div>
                </div>
            )}

            {/* Paso 2 */}
            {step === 1 && (
                <div className="space-y-4">
                    {mentor ? (
                        <MentorCard mentor={mentor} />
                    ) : (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-muted-foreground">
                            Todavía no encontramos un mentor de otro sistema con idiomas complementarios. Cuando más gente
                            declare sus idiomas, tu puente aparecerá aquí. Puedes volver más tarde.
                        </div>
                    )}
                    <div className="flex items-center justify-between">
                        <button type="button" onClick={() => setStep(0)} className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-full border border-white/12 px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-white">
                            <ArrowLeft className="size-4" /> Atrás
                        </button>
                        {mentor && (
                            <button type="button" onClick={() => setStep(2)} className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-full bg-primary/90 px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary">
                                Tejer el puente <ArrowRight className="size-4" />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Paso 3 */}
            {step === 2 && mentor && (
                <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center backdrop-blur">
                        {connected ? (
                            <div className="flex flex-col items-center gap-3">
                                <div className="grid size-14 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
                                    <Handshake className="size-7" />
                                </div>
                                <p className="text-base font-bold text-foreground">Puente cultural tejido con {mentor.profile.displayName}</p>
                                <p className="max-w-md text-sm text-muted-foreground">
                                    Ya tenéis una conversación abierta. Salúdale y comienza vuestro intercambio.
                                </p>
                                <div className="flex flex-wrap items-center justify-center gap-2">
                                    <button type="button" onClick={() => router.push("/messages")} className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-full bg-primary/90 px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary">
                                        <MessageSquarePlus className="size-4" /> Ir a la conversación
                                    </button>
                                    <button type="button" onClick={() => setShowChat((v) => !v)} className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-full border border-primary/30 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/10">
                                        <Sparkles className="size-4" /> {showChat ? "Cerrar práctica" : "Practicar con Astraura"}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-3">
                                <MentorMini mentor={mentor} />
                                <button type="button" onClick={connect} disabled={connecting} className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full bg-primary/90 px-5 py-2 text-sm font-bold text-primary-foreground hover:bg-primary disabled:opacity-60">
                                    {connecting ? <Loader2 className="size-4 animate-spin" /> : <Handshake className="size-4" />}
                                    Crear la conexión con {mentor.profile.displayName}
                                </button>
                            </div>
                        )}
                    </div>
                    {showChat && prefs && (
                        <ExchangeChat
                            systemPrompt={exchangeSystemPrompt(prefs, mentor)}
                            partnerName={mentor.profile.displayName}
                            starter="¡Hola! Soy nuevo en este puente cultural, ¿por dónde empezamos?"
                            onClose={() => setShowChat(false)}
                        />
                    )}
                    {!connected && (
                        <div className="flex justify-start">
                            <button type="button" onClick={() => setStep(1)} className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-full border border-white/12 px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-white">
                                <ArrowLeft className="size-4" /> Atrás
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function MentorCard({ mentor }: { mentor: LanguageMatch }) {
    const sys = systemById(mentor.prefs.region?.systemId);
    const initials = (mentor.profile.displayName || "?").slice(0, 2).toUpperCase();
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur" style={{ borderColor: `${sys.color}40` }}>
            <p className="mb-3 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest" style={{ color: sys.color }}>
                <Globe2 className="size-3.5" /> Mentor sugerido · sistema {sys.label}
            </p>
            <div className="flex items-start gap-3">
                <Avatar className="size-14 border-2" style={{ borderColor: sys.color }}>
                    <AvatarImage src={mentor.profile.avatarUrl || undefined} alt={mentor.profile.displayName} />
                    <AvatarFallback className="bg-primary/15 font-bold text-primary">{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <p className="text-base font-bold text-foreground">{mentor.profile.displayName}</p>
                        {mentor.reciprocal && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-300">
                                <Handshake className="size-2.5" /> recíproco
                            </span>
                        )}
                    </div>
                    {mentor.prefs.region?.label && <p className="text-[11px] text-muted-foreground">{mentor.prefs.region.label}</p>}
                    <p className="mt-1.5 text-sm text-foreground/80">{mentor.reason}</p>
                    {mentor.profile.username && (
                        <Link href={`/profile/${mentor.profile.username}`} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
                            Ver perfil <ExternalLink className="size-3" />
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}

function MentorMini({ mentor }: { mentor: LanguageMatch }) {
    const sys = systemById(mentor.prefs.region?.systemId);
    const initials = (mentor.profile.displayName || "?").slice(0, 2).toUpperCase();
    return (
        <div className="flex items-center gap-3">
            <Avatar className="size-12 border-2" style={{ borderColor: sys.color }}>
                <AvatarImage src={mentor.profile.avatarUrl || undefined} alt={mentor.profile.displayName} />
                <AvatarFallback className="bg-primary/15 font-bold text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div className="text-left">
                <p className="font-bold text-foreground">{mentor.profile.displayName}</p>
                <p className="text-[11px]" style={{ color: sys.color }}>{sys.label} · te puede enseñar {mentor.theyTeachYou.map(languageLabel).join(", ") || "su lengua"}</p>
            </div>
        </div>
    );
}

export default CulturalBridge;
