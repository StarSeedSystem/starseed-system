"use client";

/*
 * DetalleEstacion (Ola 1010E · ES1010L · §9 y §6.3) — ficha viva de una
 * estación: reproductor autoadaptable, metadatos (título, descripción,
 * licencia, ámbito, estado), espectadores por Presence y chat EFÍMERO por
 * broadcast (canal Realtime `estacion:<id>`, ≤ 500 caracteres, sin guardar).
 * Acciones: «Compartir», «Abrir en una pestaña»; para el dueño: «Estoy
 * emitiendo» (latido cada 60 s con el recuento de presencia), pausar /
 * reanudar, terminar y «Anunciar en la malla». Estación inexistente →
 * mensaje honesto con enlace al directorio.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
    Cast, Eye, Pause, Play, Radio, SendHorizontal, Share2, Square, TowerControl,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { getCurrentUserId } from "@/lib/os-social";
import {
    obtenerEstacion, latirEstacion, pausarEstacion, terminarEstacion,
} from "@/lib/estaciones/datos";
import { estacionesInternas } from "@/lib/estaciones/internas";
import { estadoDirecto } from "@/lib/estaciones/directo";
import { anunciarEnMalla } from "@/lib/estaciones/malla";
import { ETIQUETA_LICENCIA, ETIQUETA_TIPO, type Estacion } from "@/lib/estaciones/tipos";
import { EnlacePestana, ReproductorEstacion } from "./reproductor-estacion";

const MAX_CHAT = 500;
const LATIDO_MS = 60_000;

interface MensajeChat { id: string; nombre: string; texto: string; }

const ETIQUETA_ESTADO: Record<string, string> = {
    "en-directo": "En directo",
    programada: "Programada",
    pausada: "Pausada",
    terminada: "Terminada",
};

export function DetalleEstacion({ id }: { id: string }) {
    const [estacion, setEstacion] = useState<Estacion | null>(null);
    const [buscando, setBuscando] = useState(true);
    const [yo, setYo] = useState<string | null>(null);
    const [espectadores, setEspectadores] = useState(0);
    const [chat, setChat] = useState<MensajeChat[]>([]);
    const [texto, setTexto] = useState("");
    const [emitiendo, setEmitiendo] = useState(false);
    const canalRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

    const cargar = useCallback(async () => {
        setBuscando(true);
        let e: Estacion | null = null;
        if (id.startsWith("interna:")) {
            e = (await estacionesInternas()).find((x) => x.id === id) ?? null;
        } else {
            e = await obtenerEstacion(id);
        }
        setEstacion(e);
        setBuscando(false);
    }, [id]);
    useEffect(() => { void cargar(); }, [cargar]);
    useEffect(() => { void getCurrentUserId().then(setYo); }, []);

    // «Estoy emitiendo»: latido cada 60 s con el recuento de presencia (§6.3).
    useEffect(() => {
        if (!emitiendo || !estacion) return;
        void latirEstacion(estacion.id, espectadores);
        const timer = setInterval(() => {
            void latirEstacion(estacion.id, espectadores);
        }, LATIDO_MS);
        return () => clearInterval(timer);
    }, [emitiendo, estacion, espectadores]);

    const soyDuena = !!yo && !!estacion && estacion.owner_id === yo && !id.startsWith("interna:");

    const compartir = useCallback(async () => {
        const url = `${window.location.origin}/estaciones/${encodeURIComponent(id)}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: estacion?.titulo ?? "Estación", url });
            } else {
                await navigator.clipboard.writeText(url);
                toast.success("Enlace copiado al portapapeles");
            }
        } catch { /* cancelado por la persona */ }
    }, [id, estacion]);

    const enviarChat = useCallback(() => {
        const limpio = texto.trim().slice(0, MAX_CHAT);
        if (!limpio || !canalRef.current) return;
        setTexto("");
        void canalRef.current.send({
            type: "broadcast",
            event: "chat",
            payload: { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, nombre: "tú", texto: limpio },
        });
    }, [texto]);

    const accion = async (fn: () => Promise<boolean>, okMsg: string, recargar = true) => {
        const ok = await fn();
        if (ok) { toast.success(okMsg); if (recargar) await cargar(); }
        else toast.error("No se pudo. Inténtalo de nuevo.");
    };

    // Presence + chat efímero por el canal Realtime `estacion:<id>` (§6.3).
    useEffect(() => {
        if (!estacion || typeof window === "undefined") return;
        const supabase = createClient();
        const clave = yo ?? `anon-${Math.random().toString(36).slice(2, 10)}`;
        const canal = supabase.channel(`estacion:${estacion.id}`, { config: { presence: { key: clave } } });
        canalRef.current = canal;
        canal.on("presence", { event: "sync" }, () => {
            try { setEspectadores(Object.keys(canal.presenceState()).length); } catch { /* sin contador */ }
        });
        canal.on("broadcast", { event: "chat" }, (mensaje: { payload?: Partial<MensajeChat> }) => {
            const p = mensaje.payload;
            const cuerpo = typeof p?.texto === "string" ? p.texto.trim() : "";
            if (!cuerpo) return;
            setChat((prev) => [...prev.slice(-49), {
                id: p?.id ?? `${Date.now()}`,
                nombre: (p?.nombre ?? "alguien").slice(0, 40),
                texto: cuerpo.slice(0, MAX_CHAT),
            }]);
        });
        canal.subscribe((estado: string) => {
            if (estado === "SUBSCRIBED") void canal.track({ at: Date.now() });
        });
        return () => { canalRef.current = null; void supabase.removeChannel(canal); };
    }, [estacion, yo]);

    // ─────────────────────────────── Render ────────────────────────────────

    if (buscando) {
        return <p className="py-16 text-center text-sm text-muted-foreground">Buscando la estación…</p>;
    }
    if (!estacion) {
        return (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
                <Radio className="h-8 w-8 text-muted-foreground" aria-hidden />
                <p className="text-sm text-muted-foreground">
                    Esta estación no existe o ya no está disponible.
                </p>
                <Link href="/estaciones" className="cursor-pointer text-sm text-rose-300 hover:underline">
                    Volver al directorio de estaciones
                </Link>
            </div>
        );
    }
    const estado = estadoDirecto(estacion, Date.now());
    return (
        <div className="flex flex-col gap-5">
            <ReproductorEstacion estacion={estacion} />
            <header className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-headline text-2xl font-bold tracking-tight">{estacion.titulo}</h1>
                    <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-0.5 text-xs">
                        {ETIQUETA_ESTADO[estado]}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Eye className="h-3.5 w-3.5" aria-hidden /> {espectadores || estacion.espectadores} viendo
                    </span>
                </div>
                <p className="text-xs text-muted-foreground">
                    {ETIQUETA_TIPO[estacion.tipo]} · {ETIQUETA_LICENCIA[estacion.licencia]}
                    {estacion.ambito_tipo === "entidad" && estacion.entidad_ref
                        ? ` · de ${estacion.entidad_ref}` : ""}
                    {estacion.idioma !== "es" ? ` · ${estacion.idioma}` : ""}
                </p>
                {estacion.descripcion && (
                    <p className="max-w-2xl whitespace-pre-line text-sm text-muted-foreground">
                        {estacion.descripcion}
                    </p>
                )}
            </header>
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => void compartir()}
                    aria-label="Compartir esta estación"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm backdrop-blur hover:bg-black/50"
                >
                    <Share2 className="h-4 w-4" /> Compartir
                </button>
                {!estacion.enlace.startsWith("/") && <EnlacePestana href={estacion.enlace} />}
                {soyDuena && (
                    <div className="flex flex-wrap items-center gap-2" aria-label="Controles de emisión">
                        <button
                            type="button"
                            onClick={() => setEmitiendo((v) => !v)}
                            aria-pressed={emitiendo}
                            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm backdrop-blur hover:bg-black/50"
                        >
                            <Cast className="h-4 w-4 text-rose-300" />
                            {emitiendo ? "Dejar de emitir" : "Estoy emitiendo"}
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                void accion(
                                    () => pausarEstacion(estacion.id, !estacion.pausada),
                                    estacion.pausada ? "Estación reanudada" : "Estación en pausa",
                                )
                            }
                            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm backdrop-blur hover:bg-black/50"
                        >
                            {estacion.pausada ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                            {estacion.pausada ? "Reanudar" : "Pausar"}
                        </button>
                        <button
                            type="button"
                            onClick={() => void accion(() => terminarEstacion(estacion.id), "Estación terminada")}
                            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm backdrop-blur hover:bg-black/50"
                        >
                            <Square className="h-4 w-4" /> Terminar
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                void anunciarEnMalla(estacion).then((r) =>
                                    r.servidor || r.radio
                                        ? toast.success("Anunciada en la malla")
                                        : toast.error("La malla no respondió"),
                                )
                            }
                            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm backdrop-blur hover:bg-black/50"
                        >
                            <TowerControl className="h-4 w-4" /> Anunciar en la malla
                        </button>
                    </div>
                )}
            </div>

            {/* Chat efímero: broadcast puro, sin historial ni tabla (§6.3). */}
            <section className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                <h2 className="mb-2 text-sm font-semibold">Chat del directo (efímero)</h2>
                <ul className="mb-3 flex max-h-56 flex-col gap-1 overflow-y-auto" aria-live="polite">
                    {chat.length === 0 && (
                        <li className="text-xs text-muted-foreground">
                            Aún no hay mensajes. Lo que se escriba aquí no se guarda.
                        </li>
                    )}
                    {chat.map((m) => (
                        <li key={m.id} className="text-sm">
                            <span className="font-medium text-rose-300">{m.nombre}: </span>
                            {m.texto}
                        </li>
                    ))}
                </ul>
                <div className="flex items-center gap-2">
                    <input
                        value={texto}
                        onChange={(e) => setTexto(e.target.value.slice(0, MAX_CHAT))}
                        onKeyDown={(e) => { if (e.key === "Enter") enviarChat(); }}
                        maxLength={MAX_CHAT}
                        placeholder="Escribe un mensaje (máx. 500 caracteres)…"
                        aria-label="Mensaje del chat efímero"
                        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm outline-none focus:border-rose-300/50"
                    />
                    <button
                        type="button"
                        onClick={enviarChat}
                        aria-label="Enviar mensaje"
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm hover:bg-black/50"
                    >
                        <SendHorizontal className="h-4 w-4" /> Enviar
                    </button>
                </div>
            </section>
        </div>
    );
}
