"use client";

/**
 * VentanaLlamada — la llamada activa, a pantalla completa o como ventanita flotante.
 *
 * Pantalla completa: fondo vivo, cabecera con el título, el cronómetro y la calidad; mosaicos
 * que se reparten solos (dúo tipo FaceTime, rejilla, foco para una pantalla compartida o una
 * persona fijada, avatares grandes en las llamadas de voz); barra de cristal con botones
 * redondos y su nombre debajo. «Chat» la encoge a una ventanita que se arrastra y se imanta a
 * la esquina más cercana, para seguir escribiendo sin colgar.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { animate, AnimatePresence, motion, useMotionValue } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    AlertTriangle,
    Ellipsis,
    Headset,
    Maximize2,
    MessageSquare,
    Mic,
    MicOff,
    Minimize2,
    MonitorUp,
    PhoneOff,
    ScanEye,
    Settings2,
    ShieldAlert,
    Signal,
    SignalHigh,
    SignalLow,
    SignalMedium,
    UserPlus,
    Users,
    Video,
    VideoOff,
    X,
} from "lucide-react";
import { InvitarSesionDialog } from "@/components/messages/vivo/invitar-sesion";
import { cerrarVentanaLlamada, colgarLlamada, minimizarLlamada, revisarCanalLlamada } from "@/lib/llamadas/acciones";
import { useEstadoMotor, useLlamadas, type LlamadaActiva } from "@/lib/llamadas/store";
import { disposicionLlamada, esquinaMasCercana, posicionEsquina, type Esquina } from "@/lib/llamadas/disposicion";
import { formatearDuracion, TEXTO_TIPO, textoPersonas } from "@/lib/llamadas/formato";
import { ETIQUETA_CALIDAD, peorCalidad } from "@/lib/llamadas/calidad";
import { soportaPantalla } from "@/lib/llamadas/medios";
import { crearTono, type Tono } from "@/lib/llamadas/sonido";
import type { CalidadConexion, EstadoLlamada, ParticipanteLlamada } from "@/lib/llamadas/tipos";
import { AvatarLlamada } from "./avatar-llamada";
import { AudiosRemotos, MosaicoParticipante, VideoStream } from "./mosaico";
import { BotonRedondo, MenuMas, PanelDispositivos, type OpcionMas } from "./controles";
import estilos from "./llamadas.module.css";

const RESORTE = { type: "spring", stiffness: 380, damping: 32 } as const;

/* ───────────────────────────── Utilidades de vista ───────────────────────────── */

function useAhoraMs(activo: boolean, cadaMs = 1000): number {
    const [ahora, setAhora] = useState(() => Date.now());
    useEffect(() => {
        if (!activo) return;
        setAhora(Date.now());
        const id = window.setInterval(() => setAhora(Date.now()), cadaMs);
        return () => window.clearInterval(id);
    }, [activo, cadaMs]);
    return ahora;
}

function useMedida<T extends HTMLElement>(): [React.RefObject<T | null>, { ancho: number; alto: number }] {
    const ref = useRef<T | null>(null);
    const [m, setM] = useState({ ancho: 0, alto: 0 });
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const medir = () => setM({ ancho: el.clientWidth, alto: el.clientHeight });
        medir();
        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", medir);
            return () => window.removeEventListener("resize", medir);
        }
        const ro = new ResizeObserver(medir);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return [ref, m];
}

function textoFase(activa: LlamadaActiva, e: EstadoLlamada, ahora: number): string {
    switch (e.fase) {
        case "preparando":
            return "Preparando micro y cámara…";
        case "conectando":
            return "Conectando…";
        case "esperando":
            if (activa.esCreador && !e.contestada) return "Llamando…";
            return e.contestada ? "Esperando a que vuelva alguien" : "Esperando a que entre alguien";
        case "en-curso":
            return e.inicio ? formatearDuracion(ahora - e.inicio) : "En curso";
        case "terminada":
            return "Llamada terminada";
        case "llena":
            return "Llamada completa";
        case "error":
            return "No se pudo conectar";
        default:
            return "";
    }
}

const ICONO_CALIDAD: Record<CalidadConexion, { icono: typeof Signal; color: string }> = {
    buena: { icono: SignalHigh, color: "#10B981" },
    regular: { icono: SignalMedium, color: "#FFBF00" },
    mala: { icono: SignalLow, color: "#DC143C" },
    desconocida: { icono: Signal, color: "rgba(255,255,255,.5)" },
};

function ChipCalidad({ calidad }: { calidad: CalidadConexion }) {
    const { icono: Icono, color } = ICONO_CALIDAD[calidad];
    return (
        <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium text-white/80"
            style={{ background: "rgba(255,255,255,.06)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.1)" }}
            role="status"
            aria-label={ETIQUETA_CALIDAD[calidad]}
            title={ETIQUETA_CALIDAD[calidad]}
        >
            <Icono className="h-3.5 w-3.5" style={{ color }} aria-hidden />
            <span className="hidden sm:inline">{ETIQUETA_CALIDAD[calidad]}</span>
        </span>
    );
}

/* ───────────────────────────── Escenario (mosaicos) ───────────────────────────── */

interface PropsEscenario {
    estado: EstadoLlamada;
    activa: LlamadaActiva;
    fijado: string | null;
    onFijar: (id: string | null) => void;
    ahora: number;
}

/** Mide el hueco disponible (un solo elemento medido, cambie lo que cambie dentro). */
function Escenario(props: PropsEscenario) {
    const [ref, medida] = useMedida<HTMLDivElement>();
    return (
        <div ref={ref} className="relative h-full w-full">
            {medida.ancho > 0 && <ContenidoEscenario {...props} ancho={medida.ancho} alto={medida.alto} />}
        </div>
    );
}

function ContenidoEscenario({ estado, activa, fijado, onFijar, ahora, ancho, alto }: PropsEscenario & { ancho: number; alto: number }) {
    const participantes = estado.participantes;
    const yo = participantes.find((p) => p.yo) ?? null;
    const otros = participantes.filter((p) => !p.yo);
    const audioSolo = !participantes.some((p) => p.camara || p.pantalla);
    const pantallaDe = otros.find((p) => p.pantalla)?.id ?? null;
    const hablante = estado.hablante;
    const disp = useMemo(
        () =>
            disposicionLlamada(
                participantes.map((p) => p.id),
                { yo: yo?.id ?? "", ancho, alto, pantallaDe, fijado, hablante, hueco: 10 },
            ),
        [participantes, yo?.id, ancho, alto, pantallaDe, fijado, hablante],
    );
    const porId = useMemo(() => new Map(participantes.map((p) => [p.id, p])), [participantes]);

    // Solo yo: pantalla de «llamando» / «esperando».
    if (otros.length === 0 && yo) {
        const conVideo = yo.camara && !!yo.stream;
        const esperandoRespuesta = activa.esCreador && !estado.contestada && (estado.fase === "esperando" || estado.fase === "conectando");
        return (
            <div className="relative flex h-full w-full flex-col items-center justify-center gap-5 px-4 text-center">
                {conVideo && (
                    <div className="absolute inset-0 overflow-hidden rounded-[24px] opacity-60">
                        <VideoStream stream={yo.stream} espejo ajuste="cover" etiqueta="Tu cámara" />
                        <div className="absolute inset-0 bg-gradient-to-b from-[#060714]/40 via-transparent to-[#060714]/80" />
                    </div>
                )}
                <div className="relative flex flex-col items-center gap-5">
                    <AvatarLlamada id={yo.id} nombre={yo.nombre} avatar={yo.avatar} tam={ancho < 420 ? 112 : 140} ondas={esperandoRespuesta} animado nivel={yo.nivel} hablando={estado.hablante === yo.id} />
                    <div>
                        <p className="text-[22px] font-semibold text-white">{activa.titulo}</p>
                        <p className="mt-1 text-[14px] text-white/65" aria-live="polite">
                            {esperandoRespuesta ? (
                                <>
                                    Llamando
                                    <span className={estilos.punto}>.</span>
                                    <span className={estilos.punto}>.</span>
                                    <span className={estilos.punto}>.</span>
                                </>
                            ) : (
                                textoFase(activa, estado, ahora)
                            )}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Llamada de voz: avatares grandes que respiran y brillan al hablar.
    if (audioSolo && !fijado) {
        const tam = participantes.length <= 2 ? (ancho < 420 ? 112 : 148) : participantes.length <= 4 ? (ancho < 420 ? 84 : 116) : ancho < 420 ? 64 : 92;
        return (
            <div className="flex h-full w-full items-center justify-center overflow-y-auto px-4 py-6">
                <ul className="flex max-w-4xl flex-wrap items-start justify-center gap-x-8 gap-y-7" aria-label="Personas en la llamada">
                    {participantes.map((p) => (
                        <li key={p.id} className="flex flex-col items-center gap-3" aria-label={`${p.yo ? "Tú" : p.nombre}${p.micro ? "" : ", micrófono apagado"}${estado.hablante === p.id ? ", hablando" : ""}`}>
                            <AvatarLlamada id={p.id} nombre={p.nombre} avatar={p.avatar} tam={tam} nivel={p.nivel} hablando={estado.hablante === p.id} animado />
                            <span className="flex max-w-[11rem] items-center gap-1.5 text-[14px] font-semibold text-white">
                                {!p.micro && <MicOff className="h-3.5 w-3.5 shrink-0 text-[#ff5a78]" aria-hidden />}
                                <span className="truncate">{p.yo ? "Tú" : p.nombre}</span>
                            </span>
                            {!p.yo && p.conexion !== "conectado" && (
                                <span className="-mt-2 text-[12px] text-white/55">{p.conexion === "fallida" ? "Sin conexión" : p.conexion === "reconectando" ? "Reconectando…" : "Conectando…"}</span>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        );
    }

    if (disp.modo === "duo" && disp.principal) {
        const principal = porId.get(disp.principal);
        const mini = disp.miniaturas[0] ? porId.get(disp.miniaturas[0]) : undefined;
        return (
            <div className="relative h-full w-full">
                {principal && <MosaicoParticipante p={principal} hablando={hablante === principal.id} tam="grande" onFijar={onFijar} fijado={fijado === principal.id} className="h-full w-full" />}
                {mini && (
                    <motion.div
                        layout
                        transition={RESORTE}
                        className="absolute bottom-3 right-3 aspect-video w-[34%] min-w-[120px] max-w-[260px] shadow-2xl"
                    >
                        <MosaicoParticipante p={mini} hablando={hablante === mini.id} tam="normal" className="h-full w-full" />
                    </motion.div>
                )}
            </div>
        );
    }

    if (disp.modo === "foco" && disp.principal) {
        const principal = porId.get(disp.principal);
        const lateral = disp.tira === "lateral";
        return (
            <div className={`flex h-full w-full gap-2.5 ${lateral ? "flex-row" : "flex-col"}`}>
                <div className="min-h-0 min-w-0 flex-1">
                    {principal && <MosaicoParticipante p={principal} hablando={hablante === principal.id} tam="grande" onFijar={onFijar} fijado={fijado === principal.id} className="h-full w-full" />}
                </div>
                <div className={lateral ? "flex w-52 shrink-0 flex-col gap-2.5 overflow-y-auto" : "flex h-24 shrink-0 gap-2.5 sm:h-28"}>
                    {disp.miniaturas.map((id) => {
                        const p = porId.get(id);
                        if (!p) return null;
                        return (
                            <div key={id} className={lateral ? "aspect-video w-full shrink-0" : "aspect-video h-full min-w-0 max-w-[12rem] flex-1"}>
                                <MosaicoParticipante p={p} hablando={hablante === id} tam={lateral ? "normal" : "mini"} onFijar={lateral ? onFijar : undefined} className="h-full w-full" />
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    const r = disp.rejilla;
    return (
        <div className="flex h-full w-full items-center justify-center">
            {r && r.ancho > 0 && (
                <div className="grid justify-center gap-2.5" style={{ gridTemplateColumns: `repeat(${r.columnas}, ${r.ancho}px)` }}>
                    {participantes.map((p) => (
                        <motion.div key={p.id} layout transition={RESORTE} style={{ width: r.ancho, height: r.alto }}>
                            <MosaicoParticipante p={p} hablando={hablante === p.id} tam="normal" onFijar={onFijar} fijado={fijado === p.id} className="h-full w-full" />
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ───────────────────────────── Pantalla completa ───────────────────────────── */

function PantallaCompleta({ activa, estado, onInvitar }: { activa: LlamadaActiva; estado: EstadoLlamada; onInvitar: () => void }) {
    const router = useRouter();
    const ruta = usePathname();
    const [fijado, setFijado] = useState<string | null>(null);
    const [hoja, setHoja] = useState<null | "dispositivos" | "mas">(null);
    const [ref, { ancho }] = useMedida<HTMLDivElement>();
    const enCurso = estado.fase === "en-curso";
    const ahora = useAhoraMs(enCurso || estado.fase === "esperando");
    const estrecho = ancho > 0 && ancho < 600;
    const motor = activa.motor;
    const otros = estado.participantes.filter((p) => !p.yo);
    const calidad = peorCalidad(otros.map((p) => p.calidad));
    const finalizada = estado.fase === "terminada" || estado.fase === "llena" || estado.fase === "error";
    const pantallaPosible = soportaPantalla();
    const esSala = activa.tipo === "sala-vr" || activa.tipo === "sala-ar";

    useEffect(() => {
        if (fijado && !estado.participantes.some((p) => p.id === fijado)) setFijado(null);
    }, [estado.participantes, fijado]);

    // El foco del teclado y del lector entra en la llamada al abrirse.
    useEffect(() => {
        ref.current?.focus({ preventScroll: true });
    }, [ref]);

    useEffect(() => {
        const alTeclado = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            if (hoja) setHoja(null);
            else if (!finalizada) minimizarLlamada(true);
        };
        window.addEventListener("keydown", alTeclado);
        return () => window.removeEventListener("keydown", alTeclado);
    }, [hoja, finalizada]);

    const avisarError = (e: string | null) => {
        if (e) toast.error(e);
    };
    const alMicro = () => void motor.alternarMicro().then(avisarError);
    const alCamara = () => void motor.alternarCamara().then(avisarError);
    const alPantalla = () => void motor.alternarPantalla().then(avisarError);
    const alChat = () => {
        minimizarLlamada(true);
        // Quien entró con enlace público (quizá sin cuenta) se queda donde está, con la ventanita.
        if (activa.hiloId && !activa.token && !(ruta ?? "").startsWith("/messages")) router.push("/messages");
    };
    const alSala = () => {
        // El espacio 3D se abre en otra pestaña: la voz sigue viva en esta pase lo que pase con la
        // navegación. Si el navegador bloquea la pestaña, se navega aquí con la llamada minimizada.
        const url = `/xr?sesion=${encodeURIComponent(activa.sesionId)}&modo=${activa.tipo === "sala-ar" ? "ar" : "vr"}`;
        let nueva: Window | null = null;
        try {
            nueva = window.open(url, "_blank");
            if (nueva) nueva.opener = null;
        } catch {
            nueva = null;
        }
        if (!nueva) {
            minimizarLlamada(true);
            router.push(url);
        }
    };

    const opcionesMas: OpcionMas[] = [
        ...(pantallaPosible
            ? [
                  {
                      id: "pantalla",
                      icono: MonitorUp,
                      etiqueta: estado.pantalla ? "Dejar de compartir la pantalla" : "Compartir pantalla",
                      ayuda: "Enseña una ventana o toda tu pantalla",
                      color: "#007FFF",
                      onElegir: alPantalla,
                  },
              ]
            : []),
        { id: "dispositivos", icono: Settings2, etiqueta: "Audio y vídeo", ayuda: "Micrófono, cámara y altavoz", color: "#14B8A6", onElegir: () => setHoja("dispositivos") },
        { id: "invitar", icono: UserPlus, etiqueta: "Invitar", ayuda: "Perfiles, grupos, contactos o un enlace", color: "#7C5CFF", onElegir: onInvitar },
        ...(esSala
            ? [
                  {
                      id: "sala",
                      icono: activa.tipo === "sala-ar" ? ScanEye : Headset,
                      etiqueta: activa.tipo === "sala-ar" ? "Entrar en la sala AR" : "Entrar en la sala VR",
                      ayuda: "Abre el espacio 3D en otra pestaña; la voz sigue aquí",
                      color: "#FFBF00",
                      onElegir: alSala,
                  },
              ]
            : []),
    ];

    const tamBoton = estrecho ? 48 : 54;

    return (
        <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={`${TEXTO_TIPO[activa.tipo].nombre}: ${activa.titulo}`}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={RESORTE}
            tabIndex={-1}
            className="fixed inset-0 z-[450] flex flex-col overflow-hidden text-white outline-none"
            style={{ background: "#060714" }}
        >
            {/* Fondo vivo */}
            <div aria-hidden className={`pointer-events-none absolute inset-0 ${estilos.aurora}`} style={{ background: "radial-gradient(60% 50% at 15% 0%, rgba(124,92,255,.28), transparent 70%), radial-gradient(55% 45% at 100% 100%, rgba(0,127,255,.22), transparent 70%)" }} />

            {/* Cabecera */}
            <header className="relative z-10 flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-[max(0.9rem,env(safe-area-inset-top))] sm:px-6">
                <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">{TEXTO_TIPO[activa.tipo].nombre}</p>
                    <h2 className="truncate text-[17px] font-semibold sm:text-[19px]">{activa.titulo}</h2>
                    <p className="text-[13px] tabular-nums text-white/70" aria-live="polite">
                        {textoFase(activa, estado, ahora)}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {enCurso && <ChipCalidad calidad={calidad} />}
                    <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium text-white/80"
                        style={{ background: "rgba(255,255,255,.06)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.1)" }}
                        aria-label={textoPersonas(estado.participantes.length)}
                    >
                        <Users className="h-3.5 w-3.5" aria-hidden />
                        {estado.participantes.length}
                    </span>
                    {!finalizada && (
                        <button
                            type="button"
                            onClick={() => minimizarLlamada(true)}
                            className="ss-redondo grid h-10 w-10 cursor-pointer place-items-center rounded-full text-white transition-colors duration-200 hover:bg-white/10"
                            style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,.14)" }}
                            aria-label="Minimizar la llamada a una ventanita"
                            title="Minimizar"
                        >
                            <Minimize2 className="h-4 w-4" aria-hidden />
                        </button>
                    )}
                </div>
            </header>

            {estado.aviso && !finalizada && (
                <div className="relative z-10 mx-auto mb-1 flex max-w-xl items-start gap-2 rounded-[16px] px-3.5 py-2.5 text-[13px] text-amber-50" role="status" style={{ background: "rgba(255,191,0,.12)", boxShadow: "inset 0 0 0 1px rgba(255,191,0,.35)" }}>
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#FFBF00]" aria-hidden />
                    <span className="min-w-0 flex-1">{estado.aviso}</span>
                    <button type="button" onClick={() => motor.avisar(null)} className="ss-redondo -m-1 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full hover:bg-white/10" aria-label="Cerrar aviso">
                        <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                </div>
            )}

            {/* Mosaicos */}
            <main className="relative z-0 min-h-0 flex-1 px-3 pb-2 pt-1 sm:px-6">
                {!finalizada && <Escenario estado={estado} activa={activa} fijado={fijado} onFijar={setFijado} ahora={ahora} />}
                {finalizada && (
                    <div className="grid h-full place-items-center px-4">
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={RESORTE}
                            className="flex max-w-sm flex-col items-center gap-3 rounded-[24px] px-6 py-7 text-center"
                            style={{ background: "rgba(12,14,34,.55)", backdropFilter: "blur(20px) saturate(140%)", border: "1px solid rgba(255,255,255,.08)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)" }}
                            role="status"
                        >
                            {estado.fase === "error" ? (
                                <span className="grid h-14 w-14 place-items-center rounded-full" style={{ background: "#FFBF001f", boxShadow: "inset 0 0 0 1px #FFBF0066" }}>
                                    <ShieldAlert className="h-6 w-6 text-[#FFBF00]" aria-hidden />
                                </span>
                            ) : (
                                <span className="grid h-14 w-14 place-items-center rounded-full" style={{ background: "#DC143C1f", boxShadow: "inset 0 0 0 1px #DC143C66" }}>
                                    <PhoneOff className="h-6 w-6 text-[#ff5a78]" aria-hidden />
                                </span>
                            )}
                            <p className="text-[18px] font-semibold">{estado.fase === "llena" ? "La llamada está completa" : estado.fase === "error" ? "No se pudo entrar" : "Llamada terminada"}</p>
                            {estado.motivoFin && <p className="text-[14px] text-white/70">{estado.motivoFin}</p>}
                            {estado.fase === "terminada" && estado.contestada && activa.motor.resumen().duracionMs > 0 && (
                                <p className="text-[13px] tabular-nums text-white/55">Duración {formatearDuracion(activa.motor.resumen().duracionMs)}</p>
                            )}
                            <button
                                type="button"
                                onClick={() => cerrarVentanaLlamada()}
                                className="ss-redondo mt-1 cursor-pointer rounded-full px-5 py-2 text-[14px] font-semibold text-white transition-transform duration-200 hover:scale-[1.03]"
                                style={{ background: "#7C5CFF1f", boxShadow: "inset 0 0 0 1px #7C5CFF66" }}
                            >
                                Cerrar
                            </button>
                        </motion.div>
                    </div>
                )}
            </main>

            {/* Sala VR/AR */}
            {esSala && !finalizada && (
                <div className="relative z-10 flex shrink-0 flex-col items-center gap-1 px-4 pb-2">
                    <button
                        type="button"
                        onClick={alSala}
                        className="ss-redondo inline-flex cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-semibold text-white shadow-lg transition-transform duration-200 hover:-translate-y-px"
                        style={{ background: activa.tipo === "sala-ar" ? "linear-gradient(135deg,#22D3EE,#007FFF)" : "linear-gradient(135deg,#A855F7,#7C5CFF)" }}
                    >
                        {activa.tipo === "sala-ar" ? <ScanEye className="h-4 w-4" aria-hidden /> : <Headset className="h-4 w-4" aria-hidden />}
                        {activa.tipo === "sala-ar" ? "Entrar en la sala AR" : "Entrar en la sala VR"}
                    </button>
                    <p className="max-w-md text-center text-[12px] text-white/55">
                        Abre el espacio 3D del OS en otra pestaña (con «Entrar en VR/AR» si tu dispositivo lo admite); la voz sigue en esta. Los avatares de cada persona aún no se sincronizan dentro del espacio.
                    </p>
                </div>
            )}

            {/* Barra de controles */}
            {!finalizada && (
                <nav
                    aria-label="Controles de la llamada"
                    className="relative z-10 mx-auto mb-[max(0.9rem,env(safe-area-inset-bottom))] flex shrink-0 items-start justify-center gap-3 rounded-[24px] px-4 pb-2.5 pt-3 sm:gap-5 sm:px-6"
                    style={{ background: "rgba(12,14,34,.55)", backdropFilter: "blur(20px) saturate(140%)", border: "1px solid rgba(255,255,255,.08)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.06), 0 18px 50px rgba(0,0,0,.35)" }}
                >
                    <BotonRedondo
                        icono={estado.micro ? Mic : MicOff}
                        etiqueta="Micro"
                        aria={estado.micro ? "Silenciar micrófono" : "Activar micrófono"}
                        variante={estado.micro ? "normal" : "apagado"}
                        onClick={alMicro}
                        tam={tamBoton}
                    />
                    <BotonRedondo
                        icono={estado.camara ? Video : VideoOff}
                        etiqueta="Cámara"
                        aria={estado.camara ? "Apagar cámara" : "Encender cámara"}
                        variante={estado.camara ? "normal" : "apagado"}
                        onClick={alCamara}
                        disabled={estado.pantalla}
                        title={estado.pantalla ? "Deja de compartir la pantalla para usar la cámara" : undefined}
                        tam={tamBoton}
                    />
                    {!estrecho && pantallaPosible && (
                        <BotonRedondo
                            icono={MonitorUp}
                            etiqueta="Pantalla"
                            aria={estado.pantalla ? "Dejar de compartir la pantalla" : "Compartir pantalla"}
                            variante={estado.pantalla ? "acento" : "normal"}
                            onClick={alPantalla}
                            tam={tamBoton}
                        />
                    )}
                    {!estrecho && (
                        <BotonRedondo icono={Settings2} etiqueta="Audio y vídeo" aria="Elegir micrófono, cámara y altavoz" onClick={() => setHoja(hoja === "dispositivos" ? null : "dispositivos")} expandido={hoja === "dispositivos"} tam={tamBoton} />
                    )}
                    {!estrecho && <BotonRedondo icono={UserPlus} etiqueta="Invitar" aria="Invitar a más personas" onClick={onInvitar} tam={tamBoton} />}
                    {estrecho && <BotonRedondo icono={Ellipsis} etiqueta="Más" aria="Más opciones de la llamada" onClick={() => setHoja(hoja === "mas" ? null : "mas")} expandido={hoja === "mas"} tam={tamBoton} />}
                    <BotonRedondo icono={MessageSquare} etiqueta="Chat" aria="Volver al chat (la llamada sigue en una ventanita)" onClick={alChat} tam={tamBoton} />
                    <BotonRedondo icono={PhoneOff} etiqueta="Colgar" aria="Colgar la llamada" variante="peligro" onClick={() => colgarLlamada()} tam={tamBoton} />
                </nav>
            )}

            <AnimatePresence>
                {hoja === "dispositivos" && (
                    <PanelDispositivos
                        key="dispositivos"
                        estado={estado}
                        onMicro={(id) => void motor.cambiarMicro(id).then(avisarError)}
                        onCamara={(id) => void motor.cambiarCamara(id).then(avisarError)}
                        onAltavoz={(id) => motor.cambiarAltavoz(id)}
                        onActualizar={() => void motor.actualizarDispositivos()}
                        onCerrar={() => setHoja(null)}
                    />
                )}
                {hoja === "mas" && <MenuMas key="mas" opciones={opcionesMas} onCerrar={() => setHoja(null)} />}
            </AnimatePresence>
        </motion.div>
    );
}

/* ───────────────────────────── Ventanita flotante ───────────────────────────── */

const CLAVE_ESQUINA = "starseed.llamadas.esquina.v1";

function leerEsquina(): Esquina {
    try {
        const v = window.localStorage.getItem(CLAVE_ESQUINA);
        if (v === "arriba-izquierda" || v === "arriba-derecha" || v === "abajo-izquierda" || v === "abajo-derecha") return v;
    } catch {
        /* sin storage */
    }
    return "abajo-derecha";
}

function guardarEsquina(e: Esquina) {
    try {
        window.localStorage.setItem(CLAVE_ESQUINA, e);
    } catch {
        /* sin storage */
    }
}

function useVentanaNavegador(): { w: number; h: number } {
    const [vp, setVp] = useState(() => ({ w: typeof window !== "undefined" ? window.innerWidth : 1024, h: typeof window !== "undefined" ? window.innerHeight : 768 }));
    useEffect(() => {
        const alCambiar = () => setVp({ w: window.innerWidth, h: window.innerHeight });
        window.addEventListener("resize", alCambiar);
        return () => window.removeEventListener("resize", alCambiar);
    }, []);
    return vp;
}

function elegirFoco(estado: EstadoLlamada): ParticipanteLlamada | null {
    const ps = estado.participantes;
    const otros = ps.filter((p) => !p.yo);
    return (
        otros.find((p) => p.pantalla) ??
        otros.find((p) => p.id === estado.hablante) ??
        otros.find((p) => p.camara) ??
        otros[0] ??
        ps.find((p) => p.yo) ??
        null
    );
}

function Ventanita({ activa, estado }: { activa: LlamadaActiva; estado: EstadoLlamada }) {
    const vp = useVentanaNavegador();
    const [esquina, setEsquina] = useState<Esquina>("abajo-derecha");
    useEffect(() => setEsquina(leerEsquina()), []);
    const estrecho = vp.w < 480;
    const W = estrecho ? 176 : 232;
    const H = estrecho ? 118 : 146;
    const medidas = { anchoVentana: vp.w, altoVentana: vp.h, anchoPip: W, altoPip: H, margen: 14, margenInferior: 104, margenSuperior: 16 };
    const destino = posicionEsquina(esquina, medidas);
    const x = useMotionValue(destino.x);
    const y = useMotionValue(destino.y);
    const ahora = useAhoraMs(estado.fase === "en-curso");
    const foco = elegirFoco(estado);
    const finalizada = estado.fase === "terminada" || estado.fase === "llena" || estado.fase === "error";

    useEffect(() => {
        const cx = animate(x, destino.x, RESORTE);
        const cy = animate(y, destino.y, RESORTE);
        return () => {
            cx.stop();
            cy.stop();
        };
    }, [destino.x, destino.y, x, y]);

    const alSoltar = useCallback(() => {
        const nueva = esquinaMasCercana(x.get() + W / 2, y.get() + H / 2, vp.w, vp.h);
        guardarEsquina(nueva);
        if (nueva === esquina) {
            const d = posicionEsquina(nueva, medidas);
            animate(x, d.x, RESORTE);
            animate(y, d.y, RESORTE);
        } else {
            setEsquina(nueva);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [x, y, W, H, vp.w, vp.h, esquina]);

    const video = foco && (foco.camara || foco.pantalla) && foco.stream ? foco : null;

    return (
        <motion.div
            role="region"
            aria-label={`Llamada en curso: ${activa.titulo}`}
            drag
            dragMomentum={false}
            dragElastic={0.12}
            onDragEnd={alSoltar}
            onDoubleClick={() => minimizarLlamada(false)}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={RESORTE}
            className="fixed left-0 top-0 z-[450] cursor-grab touch-none overflow-hidden rounded-[20px] text-white active:cursor-grabbing"
            style={{
                x,
                y,
                width: W,
                height: H,
                background: "rgba(12,14,34,.82)",
                backdropFilter: "blur(20px) saturate(140%)",
                border: "1px solid rgba(255,255,255,.1)",
                boxShadow: foco && estado.hablante === foco.id ? "0 0 0 2px #10B981, 0 18px 44px rgba(0,0,0,.5)" : "inset 0 1px 0 rgba(255,255,255,.06), 0 18px 44px rgba(0,0,0,.5)",
            }}
        >
            <div className="pointer-events-none absolute inset-0">
                {video ? (
                    <VideoStream stream={video.stream} espejo={video.yo && video.camara && !video.pantalla} ajuste={video.pantalla ? "contain" : "cover"} etiqueta={`Vídeo de ${video.yo ? "ti" : video.nombre}`} />
                ) : foco ? (
                    <div className="grid h-full place-items-center pb-6">
                        <AvatarLlamada id={foco.id} nombre={foco.nombre} avatar={foco.avatar} tam={estrecho ? 44 : 54} nivel={foco.nivel} hablando={estado.hablante === foco.id} animado={false} ondas={activa.esCreador && !estado.contestada && !finalizada} />
                    </div>
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/55" />
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 px-2.5 pt-2 text-[11px] font-semibold">
                <span className="truncate">{foco && !foco.yo ? foco.nombre : activa.titulo}</span>
                <span className="shrink-0 tabular-nums text-white/80">{textoFase(activa, estado, ahora)}</span>
            </div>
            {!finalizada ? (
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 pb-2">
                    <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => void activa.motor.alternarMicro().then((e) => e && toast.error(e))}
                        className="ss-redondo grid h-8 w-8 cursor-pointer place-items-center rounded-full transition-transform duration-150 hover:scale-105"
                        style={estado.micro ? { background: "rgba(255,255,255,.14)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.2)" } : { background: "rgba(255,255,255,.92)", color: "#12142a" }}
                        aria-label={estado.micro ? "Silenciar micrófono" : "Activar micrófono"}
                    >
                        {estado.micro ? <Mic className="h-4 w-4" aria-hidden /> : <MicOff className="h-4 w-4" aria-hidden />}
                    </button>
                    <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => minimizarLlamada(false)}
                        className="ss-redondo grid h-8 w-8 cursor-pointer place-items-center rounded-full transition-transform duration-150 hover:scale-105"
                        style={{ background: "rgba(255,255,255,.14)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.2)" }}
                        aria-label="Volver a la llamada en pantalla completa"
                    >
                        <Maximize2 className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => colgarLlamada()}
                        className="ss-redondo grid h-8 w-8 cursor-pointer place-items-center rounded-full transition-transform duration-150 hover:scale-105"
                        style={{ background: "#DC143C" }}
                        aria-label="Colgar la llamada"
                    >
                        <PhoneOff className="h-4 w-4" aria-hidden />
                    </button>
                </div>
            ) : (
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-2.5 pb-2">
                    <span className="text-[12px] text-white/80">{estado.fase === "llena" ? "Llamada completa" : "Terminada"}</span>
                    <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => cerrarVentanaLlamada()}
                        className="ss-redondo grid h-7 w-7 cursor-pointer place-items-center rounded-full hover:bg-white/15"
                        aria-label="Cerrar"
                    >
                        <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                </div>
            )}
        </motion.div>
    );
}

/* ───────────────────────────── Componente público ───────────────────────────── */

function LlamadaVisible({ activa }: { activa: LlamadaActiva }) {
    const estado = useEstadoMotor(activa.motor);
    const [invitar, setInvitar] = useState(false);
    const volverAGrande = useRef(false);
    const tono = useRef<Tono | null>(null);
    const rechazosVistos = useRef(0);

    // Tono de espera para quien llama, hasta que alguien contesta.
    const esperando = !!estado && activa.esCreador && !estado.contestada && (estado.fase === "esperando" || estado.fase === "conectando");
    useEffect(() => {
        if (!esperando) return;
        const t = crearTono("saliente");
        tono.current = t;
        t.iniciar();
        return () => {
            t.parar();
            tono.current = null;
        };
    }, [esperando]);

    // En grupo, si alguien rechaza, se avisa con suavidad (en 1:1 la llamada se cierra sola).
    useEffect(() => {
        if (!estado) return;
        const n = estado.rechazos.length;
        if (n > rechazosVistos.current && !activa.unoAUno && activa.esCreador) {
            const ultimo = estado.rechazos[n - 1];
            toast.message(`${ultimo.nombre} no puede atender ahora.`);
        }
        rechazosVistos.current = n;
    }, [estado, activa.unoAUno, activa.esCreador]);

    const abrirInvitar = useCallback(() => {
        // El diálogo de invitar se abre por encima: la llamada pasa a la ventanita mientras tanto.
        volverAGrande.current = !activa.minimizada;
        minimizarLlamada(true);
        setInvitar(true);
    }, [activa.minimizada]);

    if (!estado) return null;

    return (
        <>
            <AudiosRemotos participantes={estado.participantes} altavozId={estado.seleccion.altavozId} />
            <AnimatePresence mode="wait">
                {activa.minimizada ? (
                    <Ventanita key="ventanita" activa={activa} estado={estado} />
                ) : (
                    <PantallaCompleta key="completa" activa={activa} estado={estado} onInvitar={abrirInvitar} />
                )}
            </AnimatePresence>
            <InvitarSesionDialog
                open={invitar}
                onOpenChange={(v) => {
                    setInvitar(v);
                    // Si desde «Invitar» se creó o revocó el enlace público, la llamada suma el
                    // canal que toca y avisa a los demás (nadie se queda en otra sala).
                    if (!v) void revisarCanalLlamada().catch(() => false);
                    if (!v && volverAGrande.current) {
                        volverAGrande.current = false;
                        minimizarLlamada(false);
                    }
                }}
                sesionId={activa.sesionId}
            />
        </>
    );
}

/** La llamada activa de esta pestaña (nada si no hay). Se pinta en <body> con un portal. */
export function VentanaLlamada() {
    const { activa } = useLlamadas();
    const [montado, setMontado] = useState(false);
    useEffect(() => setMontado(true), []);
    if (!montado || !activa || typeof document === "undefined") return null;
    return createPortal(<LlamadaVisible key={activa.sesionId} activa={activa} />, document.body);
}
