"use client";

import * as React from "react";
import { AstrauraForma } from "./astraura-forma";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { readAuroraChatEntries, AURORA_CHATLOG_CHANGE_EVENT, AURORA_CHATLOG_KEY, type AuroraChatLogEntry } from "@/lib/aurora/aurora-chat-log";
import { AURORA_EXOCORTEX_OPEN_EVENT } from "@/lib/aurora/aurora-orb-bus";
import { openAurora } from "@/lib/aurora/open-aurora";
import { Rotulo, disenoDe, recortarPalabras, haceCuanto } from "./comun";
import { PilaAjustable, Prescindible } from "@/components/dashboard/kit/pila-ajustable";
import { Accion, escalaTipo, esTactil, useClaseForzada, useDispositivo, useEnPantalla } from "./inicio-piezas";
import { SelectorDisenoAstraura } from "./selector-diseno-astraura";
import { DisenoAcciones } from "./diseno-acciones";
import { DisenoConversacion } from "./diseno-conversacion";
import { DisenoMinimo } from "./diseno-minimo";
import { DisenoVoz } from "./diseno-voz";
import { resolverDiseno, tamanoDe, type PropsDiseno, type EstadoAsistente } from "@/lib/widgets/astraura/disenos";
import { useEstadoAstraura } from "./use-estado-astraura";
import { useDisenoAstraura } from "./use-diseno-astraura";
import type { DashboardWidget } from "@/components/dashboard/dashboard-types";

const SUGERENCIAS = ["Resúmeme mi día", "¿Qué hay nuevo en la red?", "Ayúdame a ordenar mis tareas de hoy"];

function abrirChat() {
    try { window.dispatchEvent(new CustomEvent(AURORA_EXOCORTEX_OPEN_EVENT)); } catch { /* defensivo */ }
}

function Preguntar({ tactil, sugerencias, compacto }: { tactil: boolean; sugerencias?: number; compacto?: boolean }) {
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
                style={{ background: `#7c5cff1c`, boxShadow: `inset 0 0 0 1px #7c5cff55` }}>
                <input value={texto} onChange={(e) => { setTexto(e.target.value); if (estado === "sin-aurora") setEstado("listo"); }}
                    placeholder={compacto ? "Pregúntale…" : "Pregúntale a Astraura…"} aria-label="Pregunta para Astraura"
                    className={`min-w-0 flex-1 bg-transparent text-white placeholder:text-white/40 focus:outline-none ${tactil ? "py-2.5 text-[15px]" : "py-1.5 text-[13px]"}`} />
                <button type="submit" aria-label="Enviar a Astraura" disabled={!texto.trim() || estado === "enviando"}
                    className={`ss-redondo grid shrink-0 cursor-pointer place-items-center rounded-full text-white transition-transform duration-200 hover:scale-105 disabled:cursor-default disabled:opacity-40 ${tactil ? "size-10" : "size-7"}`}
                    style={{ background: texto.trim() ? `linear-gradient(135deg, #7c5cff, #23d5ab)` : "transparent" }}>
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                </button>
            </form>
            {estado === "enviado" && <span role="status" className="text-[11.5px] text-emerald-300">Enviado: la respuesta llega a su chat.</span>}
            {estado === "sin-aurora" && (
                <span role="status" className="text-[11.5px] text-amber-200/90">
                    Astraura aún no está despierta en esta pestaña; tu pregunta sigue aquí. <a href="/agent" className="cursor-pointer font-semibold underline underline-offset-2">Abrir el chat</a>
                </span>
            )}
            {!!sugerencias && estado !== "sin-aurora" && (
                <Prescindible nivel={1}>
                    <div className="flex flex-wrap gap-1.5">
                        {SUGERENCIAS.slice(0, sugerencias).map((s) => (
                            <Accion key={s} icono={<svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>} color="#7c5cff" grande={tactil} onClick={() => void enviar(s)} className="max-w-full !whitespace-normal text-left leading-tight">{s}</Accion>
                        ))}
                    </div>
                </Prescindible>
            )}
        </div>
    );
}

export function AstrauraLibreProto({ widget, onUpdateSettings }: { widget?: DashboardWidget; onUpdateSettings?: (patch: Record<string, unknown>) => void }) {
    const [entradas, setEntradas] = React.useState<AuroraChatLogEntry[] | null>(null);
    const [ref, visible] = useEnPantalla<HTMLDivElement>();
    const { estado, voz, escuchar, callar } = useEstadoAstraura(visible, entradas ? Math.max(...entradas.filter(e => e.role === "aurora").map(e => e.ts), 0) : null);
    const dispositivo = useDispositivo();
    const forzada = useClaseForzada();
    const tactil = esTactil(dispositivo);
    const k = escalaTipo(dispositivo);

    React.useEffect(() => {
        const leer = () => { try { setEntradas(readAuroraChatEntries()); } catch { setEntradas([]); } };
        const alGuardar = (e: StorageEvent) => { if (e.key === AURORA_CHATLOG_KEY) leer(); };
        leer();
        window.addEventListener(AURORA_CHATLOG_CHANGE_EVENT, leer);
        window.addEventListener("storage", alGuardar);
        return () => { window.removeEventListener(AURORA_CHATLOG_CHANGE_EVENT, leer); window.removeEventListener("storage", alGuardar); };
    }, []);

    const ultima = entradas ? [...entradas].reverse().find((e) => e.role === "aurora") : undefined;
    const hilo = (entradas ?? []).slice(-6);
    const [ahora, setAhora] = React.useState(0);
    React.useEffect(() => setAhora(Date.now()), [entradas]);
    const vivaAhora = estado !== "calma" ? estado : ultima && ahora - ultima.ts < 60_000 ? "hablando" : "calma";

    const [diseno, elegir] = useDisenoAstraura(widget, onUpdateSettings);

    const frase = (clases: string, max = 150) => ultima
        ? <p className={clases} title={ultima.text}>{recortarPalabras(ultima.text, max)}</p>
        : <p className="text-[12.5px] text-white/65">{entradas === null ? "…" : "Aún no habéis hablado."}</p>;

    const botonVoz = voz ? (
        <Accion icono={estado === "escuchando" ? <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="19" x2="8" y2="22"/><line x1="16" y1="19" x2="16" y2="22"/></svg> : <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>} color="#23d5ab" grande={tactil} onClick={estado === "escuchando" ? callar : escuchar}
            aria-label={estado === "escuchando" ? "Dejar de escuchar" : "Hablar con Astraura por voz"}>
            {estado === "escuchando" ? "Parar" : "Hablar"}
        </Accion>
    ) : null;

    const hiloNodo = (turnos: number) => {
        const vista = hilo.slice(-turnos * 2);
        if (!vista.length) return <p className="text-[12.5px] text-white/60">Aún no habéis hablado. Pregúntale lo que quieras.</p>;
        return (
            <ol className="flex min-w-0 flex-col gap-1.5" aria-label="Última conversación">
                {vista.map((e, i) => {
                    const item = (
                        <li key={`${e.ts}-${i}`} className={`min-w-0 text-[12.5px] leading-snug ${e.role === "user" ? "text-white/60" : "text-white/90"}`}>
                            <p className="line-clamp-2" title={e.text}>{recortarPalabras(e.role === "user" ? `Tú: ${e.text}` : e.text, 110)}</p>
                            {e.role === "aurora" && i === vista.length - 1 && <span className="text-[10.5px] text-violet-200/70">{haceCuanto(e.ts, ahora || Date.now())}</span>}
                        </li>
                    );
                    return i === vista.length - 1 ? item : <Prescindible key={`${e.ts}-${i}`} nivel={2 + i}>{item}</Prescindible>;
                })}
            </ol>
        );
    };

    return (
        <div ref={ref} className="h-full w-full">
            <WidgetLibre forma="ninguna" acento="#7c5cff" acento2="#23d5ab" etiqueta={ultima ? `Astraura dijo: ${ultima.text.slice(0, 80)}` : "Astraura"}>
                {({ clase: medida, ancho, alto }) => {
                    const clase = forzada ?? medida;
                    const { base: b, horizontal } = disenoDe(clase);
                    const lado = Math.min(ancho, alto);
                    const resuelto = resolverDiseno(diseno, {
                        tamano: tamanoDe(clase), tactil, hayVoz: voz,
                        hayConversacion: hilo.length > 0,
                    });

                    const fraccionOrbe = b === "micro" ? 0.62 : b === "s" ? 0.42 : b === "m" ? 0.34 : b === "xl" ? 0.26 : 0.34;
                    const topeOrbe = b === "xl" ? 170 : b === "l" ? 140 : 120;
                    const tamOrbe = Math.min(lado * fraccionOrbe, topeOrbe) * k;

                    if (resuelto.diseno === "acciones") {
                        return (
                            <DisenoAcciones
                                estado={vivaAhora}
                                tam={tamOrbe}
                                ultima={ultima ? { texto: ultima.text, ts: ultima.ts } : null}
                                hilo={hilo.map((e) => ({ rol: e.role, texto: e.text, ts: e.ts }))}
                                ahora={ahora || Date.now()}
                                tactil={tactil}
                                voz={voz}
                                preguntar={
                                    <div className="flex w-full min-w-0 flex-col gap-1.5">
                                        <Preguntar tactil={tactil} />
                                        <SelectorDisenoAstraura valor={diseno} onCambiar={elegir} degradado={resuelto.degradado} />
                                    </div>
                                }
                                botonVoz={botonVoz}
                                sugerencias={SUGERENCIAS}
                                onAbrirChat={abrirChat}
                                onSugerencia={(t) => { void openAurora({ prompt: t, reveal: true }); }}
                            />
                        );
                    }

                    if (resuelto.diseno === "conversacion") {
                        const tamForma = Math.max(44, tamOrbe * 0.9);
                        return (
                            <DisenoConversacion
                                estado={vivaAhora}
                                tam={tamForma}
                                ultima={ultima ? { texto: ultima.text, ts: ultima.ts } : null}
                                hilo={hilo.map((e) => ({ rol: e.role, texto: e.text, ts: e.ts }))}
                                ahora={ahora || Date.now()}
                                tactil={tactil}
                                preguntar={<Preguntar tactil={tactil} compacto />}
                                onAbrirChat={abrirChat}
                            />
                        );
                    }

                    if (resuelto.diseno === "voz") {
                        return (
                            <DisenoVoz
                                estado={vivaAhora}
                                tam={tamOrbe}
                                ultima={ultima ? { texto: ultima.text, ts: ultima.ts } : null}
                                hilo={hilo.map((e) => ({ rol: e.role, texto: e.text, ts: e.ts }))}
                                ahora={ahora || Date.now()}
                                tactil={tactil}
                                voz={voz}
                                botonVoz={botonVoz}
                                preguntar={<Preguntar tactil={tactil} />}
                                onAbrirChat={abrirChat}
                            />
                        );
                    }

                    if (b === "micro") return <div className="flex h-full items-center justify-center" data-diseno="micro"><AstrauraForma estado={vivaAhora} tam={lado * 0.62} onClick={abrirChat} /></div>;

                    if (b === "s") {
                        return (
                            <div className="flex h-full flex-col items-center justify-center gap-2 px-2 text-center" data-diseno="s">
                                <AstrauraForma estado={vivaAhora} tam={lado * 0.42} onClick={abrirChat} />
                                {frase("line-clamp-2 text-[12.5px] leading-snug text-white/90", 90)}
                            </div>
                        );
                    }

                    if (clase === "panoramico" && horizontal) {
                        return (
                            <div className="flex h-full w-full items-center gap-4 px-3" data-diseno="panoramico">
                                <AstrauraForma estado={vivaAhora} tam={Math.min(alto * 0.72, 110)} onClick={abrirChat} />
                                <div className="min-w-0 flex-1">{frase("line-clamp-2 text-[13px] leading-snug text-white/90", 110)}</div>
                                <div className="w-[40%] min-w-[200px] max-w-[340px]"><Preguntar tactil={tactil} compacto /></div>
                            </div>
                        );
                    }

                    if (clase === "torre") {
                        return (
                            <div className="flex h-full w-full flex-col items-center gap-3 px-3 py-3" data-diseno="torre">
                                <AstrauraForma estado={vivaAhora} tam={Math.min(ancho * 0.55, 120)} onClick={abrirChat} />
                                <Rotulo color="#c4b5fd">{vivaAhora === "calma" ? "En calma" : vivaAhora === "escuchando" ? "Escuchando…" : vivaAhora === "pensando" ? "Pensando…" : "Hablando"}</Rotulo>
                                <PilaAjustable niveles={8} className="min-h-0 w-full flex-1">
                                    <div className="mt-auto">{hiloNodo(Math.max(1, Math.floor((alto - 260) / 90)))}</div>
                                </PilaAjustable>
                                <Preguntar tactil={tactil} compacto />
                            </div>
                        );
                    }

                    const apaisado = ancho >= alto * 1.3;
                    if (b === "m") {
                        if (apaisado) {
                            return (
                                <div className="flex h-full w-full items-center gap-4 px-3" data-diseno="m-fila">
                                    <AstrauraForma estado={vivaAhora} tam={Math.min(alto * 0.5, 120) * k} onClick={abrirChat} />
                                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                                        {frase("line-clamp-3 text-[13px] leading-snug text-white/90")}
                                        <Preguntar tactil={tactil} compacto />
                                    </div>
                                </div>
                            );
                        }
                        return (
                            <PilaAjustable niveles={1} className="items-center px-3 text-center" data-diseno="m">
                                <div className="my-auto flex w-full min-w-0 flex-col items-center gap-2">
                                    <Prescindible nivel={1}><AstrauraForma estado={vivaAhora} tam={Math.min(lado * 0.34, 110) * k} onClick={abrirChat} /></Prescindible>
                                    {frase("line-clamp-3 text-[13px] leading-snug text-white/90", 140)}
                                    <Preguntar tactil={tactil} compacto />
                                </div>
                            </PilaAjustable>
                        );
                    }

                    return (
                        <div className={`flex h-full w-full gap-5 px-4 py-3 ${apaisado || b === "xl" ? "flex-row items-center" : "flex-col items-center justify-center"}`} data-diseno={`${b}-hilo`}>
                            <div className="flex shrink-0 flex-col items-center gap-2">
                                <AstrauraForma estado={vivaAhora} tam={tamOrbe} onClick={abrirChat} />
                                <Rotulo color="#c4b5fd">{vivaAhora === "calma" ? "En calma" : vivaAhora === "escuchando" ? "Escuchando…" : vivaAhora === "pensando" ? "Pensando…" : "Hablando"}</Rotulo>
                                <div className="flex flex-wrap justify-center gap-1.5">
                                    {botonVoz}
                                    <Accion icono={<svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>} color="#7c5cff" grande={tactil} onClick={abrirChat} aria-label="Abrir el chat de Astraura">Chat</Accion>
                                    <SelectorDisenoAstraura valor={diseno} onCambiar={elegir} degradado={false} />
                                </div>
                            </div>
                            <PilaAjustable niveles={8} className="min-w-0 flex-1 self-stretch">
                                <div className="my-auto flex min-w-0 flex-col gap-2.5">
                                    {hiloNodo(b === "xl" ? 3 : alto >= 340 ? 2 : 1)}
                                    <Preguntar tactil={tactil} sugerencias={b === "xl" ? 3 : alto >= 300 ? 2 : 0} />
                                </div>
                            </PilaAjustable>
                        </div>
                    );
                }}
            </WidgetLibre>
        </div>
    );
}

export default AstrauraLibreProto;