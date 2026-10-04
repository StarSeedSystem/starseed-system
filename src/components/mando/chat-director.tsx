"use client";

/**
 * Chat Director del Mando (Ola 1004)
 * ─────────────────────────────────────────────────────────────────────────────
 * Sección plegable «Dirección · chat del director», justo encima del «Pulso del
 * trabajo». Lee el feed fundido de `/api/mando/director-chat` (cada 10 s solo lo
 * nuevo, con `desde`), lo filtra por pestañas y compone mensajes a la dirección.
 * Un fallo de red se anota en un aviso pequeño: el chat jamás rompe el Mando.
 * El estado plegado se recuerda en `starseed.mando.director.plegado`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, MessagesSquare } from "lucide-react";

import { filtrarFeed, fusionarFeed, type FiltroFeed } from "@/lib/mando/chat-director-feed";
import {
    MODELO_DIRECTOR_DEFECTO,
    MOTORES_DIRECTOR,
    type CanalId,
    type EstadoEntrega,
    type MensajeDirector,
} from "@/lib/mando/chat-director-tipos";
import { MensajeDelDirector } from "@/components/mando/chat-director-mensaje";
import { CompositorDirector, type ModeloOpcion } from "@/components/mando/chat-director-compositor";

const CLAVE_PLEGADO = "starseed.mando.director.plegado";
const CLAVE_MODELO = "starseed.mando.director.modelo";
const INTERVALO_MS = 10_000;

const FILTROS: { id: FiltroFeed; etiqueta: string }[] = [
    { id: "todo", etiqueta: "Todo" },
    { id: "conversacion", etiqueta: "Conversación" },
    { id: "informes", etiqueta: "Informes" },
    { id: "enjambre", etiqueta: "Enjambre" },
    { id: "usos", etiqueta: "Usos" },
];

interface FeedRespuesta {
    mensajes?: MensajeDirector[];
    entregas?: Record<string, Partial<Record<CanalId, EstadoEntrega>>>;
    ultimoModelo?: string;
}

function plegadoInicial(): boolean {
    try {
        return typeof window !== "undefined"
            && window.localStorage.getItem(CLAVE_PLEGADO) === "1";
    } catch {
        return false;
    }
}

/** Último modelo elegido por Alex en el compositor, si quedó guardado y no está vacío. */
function modeloGuardado(): string {
    try {
        if (typeof window === "undefined") return "";
        return window.localStorage.getItem(CLAVE_MODELO)?.trim() ?? "";
    } catch {
        return "";
    }
}

export function ChatDirector() {
    const [plegado, setPlegado] = useState<boolean>(plegadoInicial);
    const [filtro, setFiltro] = useState<FiltroFeed>("todo");
    const [mensajes, setMensajes] = useState<MensajeDirector[]>([]);
    const [entregas, setEntregas] = useState<Record<string, Partial<Record<CanalId, EstadoEntrega>>>>({});
    const [ultimoModelo, setUltimoModelo] = useState("");
    const [modelos, setModelos] = useState<ModeloOpcion[]>([]);
    const [aviso, setAviso] = useState<string | null>(null);
    // El compositor no se monta hasta la primera lectura: su modelo inicial es el
    // último usado, y ese dato llega con el feed (montarlo antes fijaría el de defecto).
    const [cargado, setCargado] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const listaRef = useRef<HTMLDivElement | null>(null);
    // El último `t` vive en una referencia: si `cargar` dependiera de `mensajes`, cada lectura
    // crearía un `cargar` nuevo, el efecto lo relanzaría con lectura completa y el chat
    // martillearía /api/mando/director-chat en bucle (revisión de CDL1004, 2026-10-04).
    const ultimoTRef = useRef<string | undefined>(undefined);

    const cargar = useCallback(async (soloNuevos: boolean) => {
        try {
            const ultimo = ultimoTRef.current;
            const params = new URLSearchParams({ limite: "150" });
            if (soloNuevos && ultimo) params.set("desde", ultimo);
            const res = await fetch(`/api/mando/director-chat?${params.toString()}`, { cache: "no-store" });
            if (!res.ok) return;
            const datos = (await res.json()) as FeedRespuesta;
            const nuevos = Array.isArray(datos.mensajes) ? datos.mensajes : [];
            setMensajes((previos) => (soloNuevos ? fusionarFeed(previos, nuevos) : fusionarFeed(nuevos)).slice(-500));
            if (datos.entregas) setEntregas(datos.entregas);
            if (typeof datos.ultimoModelo === "string") setUltimoModelo(datos.ultimoModelo);
            setCargado(true);
            setAviso(null);
        } catch {
            setAviso("No se pudo leer el chat; se reintenta en unos segundos.");
        }
    }, []);

    useEffect(() => {
        ultimoTRef.current = mensajes[mensajes.length - 1]?.t;
    }, [mensajes]);

    useEffect(() => {
        void cargar(false);
        const id = setInterval(() => void cargar(true), INTERVALO_MS);
        return () => clearInterval(id);
    }, [cargar]);

    useEffect(() => {
        let vivo = true;
        fetch("/api/mando/modelos", { cache: "no-store" })
            .then((r) => (r.ok ? (r.json() as Promise<{ modelos?: { id: string; nombre?: string; proveedor: string }[] }>) : null))
            .then((d) => {
                if (!vivo || !d?.modelos) return;
                const fijos = new Set<string>(MOTORES_DIRECTOR.map((m) => m.id));
                setModelos(d.modelos
                    .filter((m) => typeof m.id === "string" && !fijos.has(m.id))
                    .map((m) => ({ id: m.id, nombre: m.nombre ?? m.id, grupo: m.proveedor })));
            })
            .catch(() => { /* el catálogo es opcional: se quedan los motores de dirección */ });
        return () => { vivo = false; };
    }, []);

    const publicar = useCallback(async (cuerpo: Record<string, unknown>) => {
        setEnviando(true);
        try {
            const res = await fetch("/api/mando/director-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cuerpo),
            });
            if (!res.ok) setAviso("La dirección no pudo contestar ahora mismo; queda anotado.");
            else setAviso(null);
        } catch {
            setAviso("Sin conexión con el chat; se reintenta solo.");
        } finally {
            setEnviando(false);
            void cargar(true);
        }
    }, [cargar]);

    const visibles = useMemo(() => filtrarFeed(mensajes, filtro), [mensajes, filtro]);

    // El «Responder con» de cada mensaje arranca con lo último que usó Alex:
    // su elección guardada, si no el último modelo del feed, si no el de defecto.
    const modeloPreferido = modeloGuardado()
        || (ultimoModelo.trim() !== "" ? ultimoModelo : "")
        || MODELO_DIRECTOR_DEFECTO;
    const modelosConMotores = useMemo(() => [
        ...MOTORES_DIRECTOR.map((m) => ({ id: m.id, nombre: m.nombre })),
        ...modelos,
    ], [modelos]);

    useEffect(() => {
        const nodo = listaRef.current;
        if (nodo) nodo.scrollTop = nodo.scrollHeight;
    }, [visibles.length]);

    const alternar = () => {
        setPlegado((p) => {
            try {
                window.localStorage.setItem(CLAVE_PLEGADO, p ? "0" : "1");
            } catch { /* sin almacenamiento: se recuerda solo en memoria */ }
            return !p;
        });
    };

    return (
        <section
            role="region"
            aria-label="Dirección · chat del director"
            className="mc-cristal w-full p-3 text-left"
        >
            <button
                type="button"
                onClick={alternar}
                aria-expanded={!plegado}
                className="flex w-full cursor-pointer items-center gap-2 text-left"
            >
                {plegado
                    ? <ChevronRight className="h-4 w-4 text-violet-300" aria-hidden />
                    : <ChevronDown className="h-4 w-4 text-violet-300" aria-hidden />}
                <MessagesSquare className="h-4 w-4 text-violet-200" aria-hidden />
                <h2 className="text-sm font-semibold text-white/80">Dirección · chat del director</h2>
            </button>
            {plegado ? null : (
                <div className="mt-3 flex flex-col gap-2">
                    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar el chat">
                        {FILTROS.map((f) => (
                            <button
                                key={f.id}
                                type="button"
                                role="tab"
                                aria-selected={filtro === f.id}
                                onClick={() => setFiltro(f.id)}
                                className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] ${filtro === f.id
                                    ? "border-violet-400/60 bg-violet-600/25 text-violet-100"
                                    : "border-white/10 text-white/50 hover:text-white/80"}`}
                            >
                                {f.etiqueta}
                            </button>
                        ))}
                    </div>
                    {aviso ? (
                        <p role="status" className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
                            {aviso}
                        </p>
                    ) : null}
                    <div ref={listaRef} className="flex max-h-[420px] flex-col gap-2 overflow-y-auto">
                        {visibles.length === 0 ? (
                            <p className="text-[11px] text-white/40">Nadie ha hablado todavía; empieza abajo.</p>
                        ) : (
                            visibles.map((m) => (
                                <MensajeDelDirector
                                    key={m.id}
                                    mensaje={m}
                                    entregas={entregas[m.id]}
                                    modelos={modelosConMotores}
                                    modeloPorDefecto={modeloPreferido}
                                    onResponder={(id, modelo) => void publicar({ accion: "responder", respondeA: id, modelo })}
                                    onReenviar={(id, canales) => void publicar({ accion: "reenviar", reenviar: id, canales })}
                                />
                            ))
                        )}
                    </div>
                    {cargado ? (
                        <CompositorDirector
                            modelos={modelos}
                            ultimoModelo={ultimoModelo}
                            enviando={enviando}
                            onEnviar={({ texto, modelo, canales }) =>
                                void publicar({ accion: "decir", texto, modelo, canales })}
                        />
                    ) : (
                        <p className="text-[11px] text-white/40">Leyendo el chat…</p>
                    )}
                </div>
            )}
        </section>
    );
}

