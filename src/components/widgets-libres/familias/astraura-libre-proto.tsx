"use client";

import * as React from "react";
import Link from "next/link";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { readAuroraChatEntries, AURORA_CHATLOG_CHANGE_EVENT, AURORA_CHATLOG_KEY, type AuroraChatLogEntry } from "@/lib/aurora/aurora-chat-log";
import { AURORA_EXOCORTEX_OPEN_EVENT } from "@/lib/aurora/aurora-orb-bus";
import { openAurora } from "@/lib/aurora/open-aurora";
import { disenoDe } from "./comun";
import { Accion, escalaTipo, esTactil, useClaseForzada, useDispositivo, useEnPantalla } from "./inicio-piezas";
import { SelectorDisenoAstraura } from "./selector-diseno-astraura";
import { DisenoAcciones } from "./diseno-acciones";
import DisenoMinimo from "./diseno-minimo";
import DisenoConversacion from "./diseno-conversacion";
import DisenoVoz from "./diseno-voz";
import { resolverDiseno, tamanoDe, type PropsDiseno } from "@/lib/widgets/astraura/disenos";
import { useDisenoAstraura } from "./use-diseno-astraura";
import { useEstadoAstraura } from "./use-estado-astraura";
import { PALETAS } from "@/lib/protomolecula/orbe4d/coreografia";
import { Mic, MicOff, Send } from "lucide-react";
import type { DashboardWidget } from "@/components/dashboard/dashboard-types";

const SUGERENCIAS = ["Resúmeme mi día", "¿Qué hay nuevo en la red?", "Ayúdame a ordenar mis tareas de hoy"];

const PALETA_ASTRAURA = PALETAS.astraura;
const VIOLETA = PALETA_ASTRAURA.colores[0]!;
const TURQUESA = PALETA_ASTRAURA.colores[2]!;

function abrirChat() {
    try { window.dispatchEvent(new CustomEvent(AURORA_EXOCORTEX_OPEN_EVENT)); } catch { /* defensivo */ }
}

function Preguntar({ tactil, compacto }: { tactil: boolean; compacto?: boolean }) {
    const [texto, setTexto] = React.useState("");
    const [estado, setEstado] = React.useState<"listo" | "enviando" | "enviado" | "sin-aurora">("listo");
    const enviar = async (pregunta: string) => {
        const p = pregunta.trim();
        if (!p || estado === "enviando") return;
        setEstado("enviando");
        const ok = await openAurora({ prompt: p, reveal: true });
        if (ok) { setTexto(""); setEstado("enviado"); window.setTimeout(() => setEstado((e) => (e === "enviado" ? "listo" : e)), 3000); }
        else { setTexto(p); setEstado("sin-aurora"); }
    };
    return (
        <div className="flex w-full min-w-0 flex-col gap-1.5">
            <form onSubmit={(e) => { e.preventDefault(); void enviar(texto); }}
                className="ss-redondo flex w-full min-w-0 items-center gap-1 rounded-full pl-3 pr-1 transition-shadow duration-200 focus-within:shadow-[0_0_0_1.5px_rgba(124,92,255,.6)]"
                style={{ background: `${VIOLETA}1c`, boxShadow: `inset 0 0 0 1px ${VIOLETA}55` }}>
                <input value={texto} onChange={(e) => { setTexto(e.target.value); if (estado === "sin-aurora") setEstado("listo"); }}
                    placeholder={compacto ? "Pregúntale…" : "Pregúntale a Astraura…"} aria-label="Pregunta para Astraura"
                    className={`min-w-0 flex-1 bg-transparent text-white placeholder:text-white/40 focus:outline-none ${tactil ? "py-2.5 text-[15px]" : "py-1.5 text-[13px]"}`} />
                <button type="submit" aria-label="Enviar a Astraura" disabled={!texto.trim() || estado === "enviando"}
                    className={`ss-redondo grid shrink-0 cursor-pointer place-items-center rounded-full text-white transition-transform duration-200 hover:scale-105 disabled:cursor-default disabled:opacity-40 ${tactil ? "size-10" : "size-7"}`}
                    style={{ background: texto.trim() ? `linear-gradient(135deg, ${VIOLETA}, ${TURQUESA})` : "transparent" }}>
                    <Send className="size-3.5" />
                </button>
            </form>
            {estado === "enviado" && <span role="status" className="text-[11.5px] text-emerald-300">Enviado: la respuesta llega a su chat.</span>}
            {estado === "sin-aurora" && (
                <span role="status" className="text-[11.5px] text-amber-200/90">
                    Astraura aún no está despierta en esta pestaña; tu pregunta sigue aquí. <Link href="/agent" className="cursor-pointer font-semibold underline underline-offset-2">Abrir el chat</Link>
                </span>
            )}
        </div>
    );
}

export function AstrauraLibreProto({ widget, onUpdateSettings }: { widget?: DashboardWidget; onUpdateSettings?: (patch: Record<string, unknown>) => void }) {
    const [entradas, setEntradas] = React.useState<AuroraChatLogEntry[] | null>(null);
    const [ref, visible] = useEnPantalla<HTMLDivElement>();
    const dispositivo = useDispositivo();
    const forzada = useClaseForzada();
    const k = escalaTipo(dispositivo);
    const tactil = esTactil(dispositivo);

    React.useEffect(() => {
        const leer = () => { try { setEntradas(readAuroraChatEntries()); } catch { setEntradas([]); } };
        const alGuardar = (e: StorageEvent) => { if (e.key === AURORA_CHATLOG_KEY) leer(); };
        leer();
        window.addEventListener(AURORA_CHATLOG_CHANGE_EVENT, leer);
        window.addEventListener("storage", alGuardar);
        return () => { window.removeEventListener(AURORA_CHATLOG_CHANGE_EVENT, leer); window.removeEventListener("storage", alGuardar); };
    }, []);

    const ultima = entradas ? [...entradas].reverse().find((e) => e.role === "aurora") : undefined;
    const ultimaMs = ultima?.ts ?? null;
    const { estado, voz, escuchar, callar } = useEstadoAstraura(visible, ultimaMs);
    const hilo = (entradas ?? []).slice(-6);
    const [ahora, setAhora] = React.useState(0);
    React.useEffect(() => setAhora(Date.now()), [entradas]);
    const vivaAhora = estado !== "calma" ? estado : ultima && ahora - ultima.ts < 60_000 ? "hablando" : "calma";

    const [diseno, elegir] = useDisenoAstraura(widget, onUpdateSettings);

    const botonVoz = voz ? (
        <Accion icono={estado === "escuchando" ? MicOff : Mic} color={TURQUESA} grande={tactil} onClick={estado === "escuchando" ? callar : escuchar}
            aria-label={estado === "escuchando" ? "Dejar de escuchar" : "Hablar con Astraura por voz"}>
            {estado === "escuchando" ? "Parar" : "Hablar"}
        </Accion>
    ) : null;

    return (
        <div ref={ref} className="h-full w-full">
            <WidgetLibre forma="ninguna" acento={VIOLETA} acento2={TURQUESA} etiqueta={ultima ? `Astraura dijo: ${ultima.text.slice(0, 80)}` : "Astraura"}>
                {({ clase: medida, ancho, alto }) => {
                    const clase = forzada ?? medida;
                    const { base: b } = disenoDe(clase);
                    const lado = Math.min(ancho, alto);
                    const resuelto = resolverDiseno(diseno, {
                        tamano: tamanoDe(clase), tactil, hayVoz: voz,
                        hayConversacion: hilo.length > 0,
                    });

                    const hiloDiseno = hilo.map((e) => ({ rol: e.role, texto: e.text, ts: e.ts }));
                    const preguntar = (
                        <div className="flex w-full min-w-0 flex-col gap-1.5">
                            <Preguntar tactil={tactil} compacto={tamanoDe(clase) === "compacto"} />
                            <SelectorDisenoAstraura valor={diseno} onCambiar={elegir}
                                degradado={resuelto.degradado || tamanoDe(clase) === "compacto"} />
                        </div>
                    );
                    const comun: Omit<PropsDiseno, "tam"> = {
                        estado: vivaAhora,
                        ultima: ultima ? { texto: ultima.text, ts: ultima.ts } : null,
                        hilo: hiloDiseno,
                        ahora: ahora || Date.now(),
                        tactil,
                        voz,
                        preguntar,
                        botonVoz,
                        sugerencias: SUGERENCIAS,
                        onAbrirChat: abrirChat,
                        onSugerencia: (t) => { void openAurora({ prompt: t, reveal: true }); },
                    };

                    if (resuelto.diseno === "minimo") {
                        return (
                            <div className="h-full w-full overflow-hidden" data-diseno="minimo">
                                <DisenoMinimo {...comun} tam={Math.min(lado * 0.42, 120) * k} />
                            </div>
                        );
                    }

                    if (resuelto.diseno === "conversacion") {
                        return (
                            <div className="h-full w-full overflow-hidden" data-diseno="conversacion">
                                <DisenoConversacion {...comun} tam={Math.min(lado * 0.4, 120) * k} />
                            </div>
                        );
                    }

                    if (resuelto.diseno === "voz") {
                        return (
                            <div className="h-full w-full overflow-hidden" data-diseno="voz">
                                <DisenoVoz {...comun} tam={Math.min(lado * 0.5, 160) * k} />
                            </div>
                        );
                    }

                    const tamOrbe = b === "m"
                        ? Math.min(lado * 0.34, 110) * k
                        : Math.min(alto * 0.42, ancho * 0.26, b === "xl" ? 170 : 140) * k;
                    const preguntarAcciones = hilo.length === 0 ? (
                        <div className="flex w-full min-w-0 flex-col gap-1.5">
                            <p className="text-[12.5px] text-white/60">Aún no habéis hablado. Pregúntale lo que quieras.</p>
                            {preguntar}
                        </div>
                    ) : preguntar;
                    return <DisenoAcciones {...comun} tam={tamOrbe} preguntar={preguntarAcciones} />;
                }}
            </WidgetLibre>
        </div>
    );
}

export default AstrauraLibreProto;