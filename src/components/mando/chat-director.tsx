"use client";

/**
 * Chat Director de Genesis (Ola 1004)
 * ─────────────────────────────────────────────────────────────────────────────
 * Sección plegable «Dirección · chat del director», justo encima del «Pulso del
 * trabajo». Lee el feed fundido de `/api/mando/director-chat` (cada 10 s solo lo
 * nuevo, con `desde`), lo filtra por pestañas y compone mensajes a la dirección.
 * Un fallo de red se anota en un aviso pequeño: el chat jamás rompe Genesis.
 * El estado plegado se recuerda en `starseed.mando.director.plegado`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, MessagesSquare } from "lucide-react";

import { filtrarFeed, fusionarFeed, type FiltroFeed } from "@/lib/mando/chat-director-feed";
import {
    CANALES,
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
const INTERVALO_NORMAL_MS = 10_000;
const INTERVALO_RESPUESTA_MS = 3_000;
const MARGEN_FINAL_PX = 80;

/** ¿La lista está a ≤ 80 px del fondo? Si Alex subió a leer, no se le arrastra. */
export function estaPegadoAlFinal(nodo: { scrollHeight: number; scrollTop: number; clientHeight: number }): boolean {
    return nodo.scrollHeight - nodo.scrollTop - nodo.clientHeight <= MARGEN_FINAL_PX;
}

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

interface EnvioLocal {
    mensaje: MensajeDirector;
    iniciadoEnMs: number;
    estado: "enviando" | "fallo";
}

function esRespuestaInmediata(canal: string): canal is CanalId {
    return CANALES.some((opcion) => opcion.id === canal && opcion.respuesta === "inmediata");
}

function entregaEsperaRespuesta(estado: EstadoEntrega | undefined): boolean {
    return estado === "pendiente" || estado === "entregado";
}

function feedConfirmaEnvio(local: EnvioLocal, nuevos: readonly MensajeDirector[]): boolean {
    return nuevos.some((mensaje) => mensaje.rol === "alex"
        && mensaje.texto === local.mensaje.texto
        && Date.parse(mensaje.t) >= local.iniciadoEnMs);
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
    const [envioLocal, setEnvioLocal] = useState<EnvioLocal | null>(null);
    const [nuevos, setNuevos] = useState(0);
    const listaRef = useRef<HTMLDivElement | null>(null);
    const contenidoRef = useRef<HTMLDivElement | null>(null);
    const pegadoAlFinalRef = useRef(true);
    const vistosRef = useRef<Set<string>>(new Set());
    const primeraCargaRef = useRef(true);
    // El último `t` vive en una referencia: si `cargar` dependiera de `mensajes`, cada lectura
    // crearía un `cargar` nuevo, el efecto lo relanzaría con lectura completa y el chat
    // martillearía /api/mando/director-chat en bucle (revisión de CDL1004, 2026-10-04).
    const ultimoTRef = useRef<string | undefined>(undefined);

    /** Baja al último mensaje sin animación y da la lista por «pegada al final». */
    const bajarAlFinal = useCallback(() => {
        pegadoAlFinalRef.current = true;
        setNuevos(0);
        const nodo = listaRef.current;
        if (nodo) nodo.scrollTop = nodo.scrollHeight;
    }, []);

    const cargar = useCallback(async (soloNuevos: boolean) => {
        try {
            const ultimo = ultimoTRef.current;
            const params = new URLSearchParams({ limite: "150" });
            if (soloNuevos && ultimo) params.set("desde", ultimo);
            const res = await fetch(`/api/mando/director-chat?${params.toString()}`, { cache: "no-store" });
            if (!res.ok) return;
            const datos = (await res.json()) as FeedRespuesta;
            const recibidos = Array.isArray(datos.mensajes) ? datos.mensajes : [];
            setMensajes((previos) => (soloNuevos ? fusionarFeed(previos, recibidos) : fusionarFeed(recibidos)).slice(-500));
            setEnvioLocal((local) => local && feedConfirmaEnvio(local, recibidos) ? null : local);
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
    }, [cargar]);

    const esperaRespuestaInmediata = useMemo(() => mensajes.some((mensaje) => {
        if (mensaje.rol !== "alex") return false;
        return Object.entries(entregas[mensaje.id] ?? {}).some(([canal, estado]) =>
            esRespuestaInmediata(canal) && entregaEsperaRespuesta(estado));
    }), [entregas, mensajes]);

    useEffect(() => {
        const intervalo = esperaRespuestaInmediata ? INTERVALO_RESPUESTA_MS : INTERVALO_NORMAL_MS;
        const id = window.setInterval(() => void cargar(true), intervalo);
        return () => window.clearInterval(id);
    }, [cargar, esperaRespuestaInmediata]);

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
            void cargar(true);
        }
    }, [cargar]);

    const enviarMensaje = useCallback(async (
        datos: { texto: string; modelo: string; canales: CanalId[] },
        previo?: EnvioLocal,
    ) => {
        const iniciadoEnMs = Date.now();
        const local: EnvioLocal = {
            mensaje: previo?.mensaje ?? {
                id: `local-${iniciadoEnMs}`,
                t: new Date(iniciadoEnMs).toISOString(),
                de: "alex",
                rol: "alex",
                tipo: "mensaje",
                texto: datos.texto,
                canal: "mando",
                modelo: datos.modelo,
                canales: datos.canales,
            },
            iniciadoEnMs,
            estado: "enviando",
        };
        setEnvioLocal(local);
        setEnviando(true);
        try {
            const res = await fetch("/api/mando/director-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion: "decir", ...datos }),
            });
            if (!res.ok) throw new Error("envío rechazado");
            setAviso(null);
        } catch {
            setEnvioLocal((actual) => actual?.mensaje.id === local.mensaje.id
                ? { ...actual, estado: "fallo" }
                : actual);
            setAviso("El mensaje no se envió; puedes reintentarlo.");
        } finally {
            setEnviando(false);
            void cargar(true);
        }
    }, [cargar]);

    const visibles = useMemo(() => filtrarFeed(mensajes, filtro), [mensajes, filtro]);
    const ultimoVisible = visibles.length > 0 ? visibles[visibles.length - 1] : null;
    // La identidad del último mensaje y el largo de su texto, no la longitud de la lista:
    // con el recorte a 500, cada mensaje nuevo saca otro y `length` nunca cambia.
    const ultimoId = ultimoVisible?.id ?? ultimoVisible?.t ?? "";
    const ultimoLargo = ultimoVisible?.texto.length ?? 0;

    // El «Responder con» de cada mensaje arranca con lo último que usó Alex:
    // su elección guardada, si no el último modelo del feed, si no el de defecto.
    const modeloPreferido = modeloGuardado()
        || (ultimoModelo.trim() !== "" ? ultimoModelo : "")
        || MODELO_DIRECTOR_DEFECTO;
    const modelosConMotores = useMemo(() => [
        ...MOTORES_DIRECTOR.map((m) => ({ id: m.id, nombre: m.nombre })),
        ...modelos,
    ], [modelos]);
    const nombrePensando = envioLocal?.mensaje.modelo
        ? modelosConMotores.find((modelo) => modelo.id === envioLocal.mensaje.modelo)?.nombre
            ?? envioLocal.mensaje.modelo
        : "La dirección";

    const alDesplazar = useCallback(() => {
        const nodo = listaRef.current;
        if (!nodo) return;
        const pegado = estaPegadoAlFinal(nodo);
        pegadoAlFinalRef.current = pegado;
        if (pegado) setNuevos(0);
    }, []);

    // Sigue al último aunque la lista esté recortada o el mensaje crezca por partes.
    useEffect(() => {
        const nodo = listaRef.current;
        if (!nodo) return;
        if (!pegadoAlFinalRef.current) return;
        nodo.scrollTop = nodo.scrollHeight;
        setNuevos(0);
    }, [ultimoId, ultimoLargo]);

    // Cuenta los mensajes que llegan mientras Alex lee más arriba (sin duplicar los ya vistos).
    useEffect(() => {
        let llegados = 0;
        for (const mensaje of mensajes) {
            const clave = mensaje.id || mensaje.t;
            if (vistosRef.current.has(clave)) continue;
            vistosRef.current.add(clave);
            llegados += 1;
        }
        if (primeraCargaRef.current) {
            primeraCargaRef.current = false;
            return;
        }
        if (llegados > 0 && !pegadoAlFinalRef.current) {
            setNuevos((previos) => previos + llegados);
        }
    }, [mensajes]);

    // Al desplegar (o al cargar la primera vez) siempre se abre por el último mensaje.
    useEffect(() => {
        if (!plegado) bajarAlFinal();
    }, [plegado, cargado, bajarAlFinal]);

    // Cuando Alex envía, su mensaje no puede quedarse fuera de vista.
    useEffect(() => {
        if (enviando || envioLocal) bajarAlFinal();
    }, [enviando, envioLocal, bajarAlFinal]);

    // Un mensaje que crece (texto por partes, imagen, bloque desplegado) también arrastra
    // el fondo, pero solo si Alex ya estaba pegado al final.
    useEffect(() => {
        if (plegado) return;
        const contenido = contenidoRef.current;
        if (!contenido || typeof ResizeObserver === "undefined") return;
        const observador = new ResizeObserver(() => {
            if (!pegadoAlFinalRef.current) return;
            const nodo = listaRef.current;
            if (nodo) nodo.scrollTop = nodo.scrollHeight;
        });
        observador.observe(contenido);
        return () => observador.disconnect();
    }, [plegado]);

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
                    <div className="relative">
                        <div
                            ref={listaRef}
                            role="log"
                            aria-label="Mensajes del director"
                            onScroll={alDesplazar}
                            className="flex max-h-[min(340px,40vh)] flex-col overflow-y-auto"
                        >
                            <div ref={contenidoRef} className="flex flex-col gap-2">
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
                        </div>
                        {nuevos > 0 ? (
                            <button
                                type="button"
                                onClick={bajarAlFinal}
                                aria-label={`Bajar al último mensaje (${nuevos} nuevos)`}
                                className="absolute bottom-2 right-2 cursor-pointer rounded-full border border-violet-400/60 bg-violet-600/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg"
                            >
                                ↓ {nuevos} nuevos
                            </button>
                        ) : null}
                    </div>
                    {cargado ? (
                        <CompositorDirector
                            modelos={modelos}
                            ultimoModelo={ultimoModelo}
                            enviando={enviando}
                            onEnviar={({ texto, modelo, canales }) => {
                                bajarAlFinal();
                                void publicar({ accion: "decir", texto, modelo, canales });
                            }}
                        />
                    ) : (
                        <p className="text-[11px] text-white/40">Leyendo el chat…</p>
                    )}
                </div>
            )}
        </section>
    );
}
