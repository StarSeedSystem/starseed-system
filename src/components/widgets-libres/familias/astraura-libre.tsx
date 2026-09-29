"use client";
/**
 * Astraura libre (Ola 383 · WL8, rediseño ola 0929 · F) — el orbe de voz de Astraura con su
 * estado REAL (en calma · escuchando · hablando, leído del puente de la Aurora global
 * `window.STARSEED_AURORA`, sin red) y la última conversación (el registro local del chat, el
 * mismo del widget clásico). Lo útil: preguntarle desde aquí. La pregunta va a la MISMA Aurora
 * global (`openAurora`: la misma conversación que /agent, el orbe y el Exocórtex); si aún no está
 * despierta en esta pestaña, se dice, la pregunta no se pierde y se ofrece abrir el chat.
 *   micro → el orbe · s → orbe + su última frase · m → + preguntar (apaisado: al lado)
 *   l/xl  → orbe con su estado y voz + el hilo (2-3 turnos) + preguntar + sugerencias
 *   panorámico → orbe, frase y campo en fila · torre → orbe, hilo y campo.
 */
import * as React from "react";
import Link from "next/link";
import { MessageCircle, Mic, MicOff, Send, Sparkles } from "lucide-react";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { readAuroraChatEntries, AURORA_CHATLOG_CHANGE_EVENT, AURORA_CHATLOG_KEY, type AuroraChatLogEntry } from "@/lib/aurora/aurora-chat-log";
import { AURORA_EXOCORTEX_OPEN_EVENT } from "@/lib/aurora/aurora-orb-bus";
import { getAuroraBridge, openAurora } from "@/lib/aurora/open-aurora";
import { Rotulo, disenoDe } from "./comun";
import { Accion, escalaTipo, esTactil, haceCuanto, useClaseForzada, useDispositivo, useEnPantalla } from "./inicio-piezas";

const VIOLETA = "#7c5cff";
const TURQUESA = "#23d5ab";
const SUGERENCIAS = ["Resúmeme mi día", "¿Qué hay nuevo en la red?", "Ayúdame a ordenar mis tareas de hoy"];

type EstadoVoz = "calma" | "escuchando" | "hablando" | "pensando";
const TEXTO_VOZ: Record<EstadoVoz, string> = { calma: "En calma", escuchando: "Escuchando…", hablando: "Hablando", pensando: "Pensando…" };

function abrirChat() {
    try { window.dispatchEvent(new CustomEvent(AURORA_EXOCORTEX_OPEN_EVENT)); } catch { /* defensivo */ }
}

/** El estado de voz de la Aurora global (si su puente existe), por suscripción; sin red. */
function useVozAurora(visible: boolean): { estado: EstadoVoz; voz: boolean; escuchar: () => void; callar: () => void } {
    const [estado, setEstado] = React.useState<EstadoVoz>("calma");
    const [voz, setVoz] = React.useState(false);
    React.useEffect(() => {
        if (!visible) return;
        let quitar: (() => void) | undefined, espera: number | undefined, vivo = true;
        const leer = () => {
            const s = getAuroraBridge()?.getState?.();
            if (!s || !vivo) return;
            setVoz(!!s.supported && !!s.enabled);
            setEstado(s.speaking ? "hablando" : s.listening ? "escuchando" : s.actionStatus && /pens|procesa|think/i.test(s.actionStatus) ? "pensando" : "calma");
        };
        const conectar = () => {
            const puente = getAuroraBridge();
            if (puente?.subscribe) { leer(); quitar = puente.subscribe(leer); return; }
            espera = window.setTimeout(conectar, 5000); // la Aurora global monta después: se busca cada 5 s, en local
        };
        conectar();
        return () => { vivo = false; quitar?.(); window.clearTimeout(espera); };
    }, [visible]);
    return {
        estado, voz,
        escuchar: () => { try { getAuroraBridge()?.start?.(); } catch { /* sin voz */ } },
        callar: () => { try { getAuroraBridge()?.stop?.(); } catch { /* sin voz */ } },
    };
}

/** El orbe: líquido violeta→turquesa que respira; escuchando, un anillo turquesa; hablando, ondas. */
function Orbe({ tam, estado, onClick }: { tam: number; estado: EstadoVoz; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} aria-label={`Abrir el chat de Astraura (${TEXTO_VOZ[estado].toLowerCase().replace("…", "")})`}
            className={`${estado === "hablando" ? "ss-latir" : "ss-respirar"} ss-redondo relative shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-4 focus-visible:ring-offset-transparent`}
            style={{ width: tam, height: tam }}>
            <span aria-hidden className="absolute inset-[-22%] rounded-full" style={{ background: `radial-gradient(closest-side, ${VIOLETA}4d, transparent)` }} />
            {estado === "hablando" && [0, 1].map((i) => (
                <span key={i} aria-hidden className="ss-latir absolute inset-[-8%] rounded-full" style={{ boxShadow: `0 0 0 1.5px ${TURQUESA}66`, animationDelay: `${i * 0.6}s`, ["--ss-dur" as string]: "1.6s" }} />
            ))}
            {estado === "escuchando" && <span aria-hidden className="ss-respirar absolute inset-[-6%] rounded-full" style={{ boxShadow: `0 0 0 2px ${TURQUESA}, 0 0 18px ${TURQUESA}88`, ["--ss-dur" as string]: "1.4s" }} />}
            <span aria-hidden className="ss-girar absolute inset-0" style={{ ["--ss-dur" as string]: estado === "pensando" ? "4s" : "14s", borderRadius: "42% 58% 55% 45% / 48% 42% 58% 52%", background: `conic-gradient(from 0deg, ${VIOLETA}, ${TURQUESA}, #007FFF, #b388ff, ${VIOLETA})`, filter: "blur(2px)" }} />
            <span aria-hidden className="ss-contragirar absolute inset-[10%]" style={{ ["--ss-dur" as string]: "9s", borderRadius: "55% 45% 40% 60% / 45% 55% 45% 55%", background: "radial-gradient(circle at 35% 30%, #ffffffcc, #b9a5ff55 35%, transparent 70%)" }} />
        </button>
    );
}

/** El campo para preguntar: la pregunta va a la Aurora global; si no está, no se pierde. */
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
            {!!sugerencias && estado !== "sin-aurora" && (
                <div className="flex flex-wrap gap-1.5">
                    {SUGERENCIAS.slice(0, sugerencias).map((s) => (
                        <Accion key={s} icono={Sparkles} color={VIOLETA} grande={tactil} onClick={() => void enviar(s)}>{s}</Accion>
                    ))}
                </div>
            )}
        </div>
    );
}

export function AstrauraLibre() {
    const [entradas, setEntradas] = React.useState<AuroraChatLogEntry[] | null>(null);
    const [ref, visible] = useEnPantalla<HTMLDivElement>();
    const { estado, voz, escuchar, callar } = useVozAurora(visible);
    const dispositivo = useDispositivo();
    const forzada = useClaseForzada();
    const k = escalaTipo(dispositivo), tactil = esTactil(dispositivo);
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

    const frase = (clases: string) => ultima
        ? <p className={clases} title={ultima.text}>{ultima.text}</p>
        : <p className="text-[12.5px] text-white/65">{entradas === null ? "…" : "Aún no habéis hablado."}</p>;
    const botonVoz = voz ? (
        <Accion icono={estado === "escuchando" ? MicOff : Mic} color={TURQUESA} grande={tactil} onClick={estado === "escuchando" ? callar : escuchar}
            aria-label={estado === "escuchando" ? "Dejar de escuchar" : "Hablar con Astraura por voz"}>
            {estado === "escuchando" ? "Parar" : "Hablar"}
        </Accion>
    ) : null;
    const hiloNodo = (turnos: number) => {
        const vista = hilo.slice(-turnos * 2);
        if (!vista.length) return <p className="text-[12.5px] text-white/60">Aún no habéis hablado. Pregúntale lo que quieras.</p>;
        return (
            <ol className="flex min-w-0 flex-col gap-1.5" aria-label="Última conversación">
                {vista.map((e, i) => (
                    <li key={`${e.ts}-${i}`} className={`min-w-0 text-[12.5px] leading-snug ${e.role === "user" ? "text-white/60" : "text-white/90"}`}>
                        <p className="line-clamp-2" title={e.text}>{e.role === "user" ? `Tú: ${e.text}` : e.text}</p>
                        {e.role === "aurora" && i === vista.length - 1 && <span className="text-[10.5px] text-violet-200/70">{haceCuanto(e.ts, ahora || Date.now())}</span>}
                    </li>
                ))}
            </ol>
        );
    };

    return (
        <div ref={ref} className="h-full w-full">
            <WidgetLibre forma="ninguna" acento={VIOLETA} acento2={TURQUESA} etiqueta={ultima ? `Astraura dijo: ${ultima.text.slice(0, 80)}` : "Astraura"}>
                {({ clase: medida, ancho, alto }) => {
                    const clase = forzada ?? medida;
                    const { base: b, horizontal } = disenoDe(clase);
                    const lado = Math.min(ancho, alto);

                    if (b === "micro") return <div className="flex h-full items-center justify-center" data-diseno="micro"><Orbe tam={lado * 0.62} estado={vivaAhora} onClick={abrirChat} /></div>;

                    if (b === "s") {
                        return (
                            <div className="flex h-full flex-col items-center justify-center gap-2 px-2 text-center" data-diseno="s">
                                <Orbe tam={lado * 0.42} estado={vivaAhora} onClick={abrirChat} />
                                {frase("line-clamp-2 text-[12.5px] leading-snug text-white/90")}
                            </div>
                        );
                    }

                    if (clase === "panoramico" && horizontal) {
                        return (
                            <div className="flex h-full w-full items-center gap-4 px-3" data-diseno="panoramico">
                                <Orbe tam={Math.min(alto * 0.72, 110)} estado={vivaAhora} onClick={abrirChat} />
                                <div className="min-w-0 flex-1">{frase("line-clamp-2 text-[13px] leading-snug text-white/90")}</div>
                                <div className="w-[40%] min-w-[200px] max-w-[340px]"><Preguntar tactil={tactil} compacto /></div>
                            </div>
                        );
                    }

                    if (clase === "torre") {
                        return (
                            <div className="flex h-full w-full flex-col items-center gap-3 px-3 py-3" data-diseno="torre">
                                <Orbe tam={Math.min(ancho * 0.55, 120)} estado={vivaAhora} onClick={abrirChat} />
                                <Rotulo color="#c4b5fd">{TEXTO_VOZ[vivaAhora]}</Rotulo>
                                <div className="min-h-0 w-full flex-1 overflow-hidden">{hiloNodo(Math.max(1, Math.floor((alto - 260) / 90)))}</div>
                                <Preguntar tactil={tactil} compacto />
                            </div>
                        );
                    }

                    const apaisado = ancho >= alto * 1.3;
                    if (b === "m") {
                        if (apaisado) {
                            return (
                                <div className="flex h-full w-full items-center gap-4 px-3" data-diseno="m-fila">
                                    <Orbe tam={Math.min(alto * 0.5, 120) * k} estado={vivaAhora} onClick={abrirChat} />
                                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                                        {frase("line-clamp-3 text-[13px] leading-snug text-white/90")}
                                        <Preguntar tactil={tactil} compacto />
                                    </div>
                                </div>
                            );
                        }
                        return (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center" data-diseno="m">
                                <Orbe tam={Math.min(lado * 0.34, 110) * k} estado={vivaAhora} onClick={abrirChat} />
                                {frase("line-clamp-3 text-[13px] leading-snug text-white/90")}
                                <Preguntar tactil={tactil} compacto />
                            </div>
                        );
                    }

                    // ── l / xl ──
                    const tamOrbe = Math.min(alto * 0.42, ancho * 0.26, b === "xl" ? 170 : 140) * k;
                    return (
                        <div className={`flex h-full w-full gap-5 px-4 py-3 ${apaisado || b === "xl" ? "flex-row items-center" : "flex-col items-center justify-center"}`} data-diseno={`${b}-hilo`}>
                            <div className="flex shrink-0 flex-col items-center gap-2">
                                <Orbe tam={tamOrbe} estado={vivaAhora} onClick={abrirChat} />
                                <Rotulo color="#c4b5fd">{TEXTO_VOZ[vivaAhora]}</Rotulo>
                                <div className="flex flex-wrap justify-center gap-1.5">
                                    {botonVoz}
                                    <Accion icono={MessageCircle} color={VIOLETA} grande={tactil} onClick={abrirChat} aria-label="Abrir el chat de Astraura">Chat</Accion>
                                </div>
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col gap-2.5 self-stretch justify-center">
                                {hiloNodo(b === "xl" ? 3 : alto >= 340 ? 2 : 1)}
                                <Preguntar tactil={tactil} sugerencias={b === "xl" ? 3 : alto >= 300 ? 2 : 0} />
                            </div>
                        </div>
                    );
                }}
            </WidgetLibre>
        </div>
    );
}

export default AstrauraLibre;
