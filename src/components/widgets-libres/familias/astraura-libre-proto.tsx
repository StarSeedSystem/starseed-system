"use client";

import * as React from "react";
import { Mic, MicOff, MessageCircle } from "lucide-react";
import { Preguntar, SUGERENCIAS } from "./astraura-libre";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { readAuroraChatEntries, AURORA_CHATLOG_CHANGE_EVENT, AURORA_CHATLOG_KEY, type AuroraChatLogEntry } from "@/lib/aurora/aurora-chat-log";
import { AURORA_EXOCORTEX_OPEN_EVENT } from "@/lib/aurora/aurora-orb-bus";
import { disenoDe, recortarPalabras } from "./comun";
import { Accion, escalaTipo, esTactil, useClaseForzada, useDispositivo, useEnPantalla } from "./inicio-piezas";
import { SelectorDisenoAstraura } from "./selector-diseno-astraura";
import { DisenoAcciones } from "./diseno-acciones";
import { AstrauraForma } from "./astraura-forma";
import { resolverDiseno, tamanoDe, type EstadoAsistente } from "@/lib/widgets/astraura/disenos";
import { useEstadoAstraura } from "./use-estado-astraura";
import { useDisenoAstraura } from "./use-diseno-astraura";
import { textoDeEstado } from "@/lib/widgets/astraura/estado-forma";
import type { DashboardWidget } from "@/components/dashboard/dashboard-types";

function abrirChat() {
    try { window.dispatchEvent(new CustomEvent(AURORA_EXOCORTEX_OPEN_EVENT)); } catch { /* defensivo */ }
}

const VIOLETA = "#7c5cff";
const TURQUESA = "#23d5ab";

export function AstrauraLibreProto({ widget, onUpdateSettings }: { widget?: DashboardWidget; onUpdateSettings?: (patch: Record<string, unknown>) => void }) {
    const [entradas, setEntradas] = React.useState<AuroraChatLogEntry[] | null>(null);
    const [ref, visible] = useEnPantalla<HTMLDivElement>();
    const { estado, voz, escuchar, callar } = useEstadoAstraura(visible, entradas ? [...entradas].reverse().find((e) => e.role === "aurora")?.ts ?? null);
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
    const hilo = (entradas ?? []).slice(-6);
    const [ahora, setAhora] = React.useState(0);
    React.useEffect(() => setAhora(Date.now()), [entradas]);

    const [diseno, elegir] = useDisenoAstraura(widget, onUpdateSettings);
    const resuelto = resolverDiseno(diseno, { tamano: tamanoDe(forzada ?? "m"), tactil, hayVoz: voz, hayConversacion: hilo.length > 0 });

    const frase = (clases: string, max = 150) => ultima
        ? <p className={clases} title={ultima.text}>{recortarPalabras(ultima.text, max)}</p>
        : <p className="text-[12.5px] text-white/65">{entradas === null ? "…" : "Aún no habéis hablado."}</p>;

    const botonVoz = voz ? <Accion icono={estado === "escuchando" ? MicOff : Mic} color={TURQUESA} grande={tactil} onClick={estado === "escuchando" ? callar : escuchar} aria-label={estado === "escuchando" ? "Dejar de escuchar" : "Hablar con Astraura por voz"}>{estado === "escuchando" ? "Parar" : "Hablar"}</Accion> : null;
    const rotulo = <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,.6)" }}>{textoDeEstado(estado)}</span>;
    const hiloNodo = (n: number) => hilo.length === 0 ? <p className="text-[12.5px] text-white/60">Aún no habéis hablado. Pregúntale lo que quieras.</p> : <ol className="flex min-w-0 flex-col gap-1.5" aria-label="Última conversación">{hilo.slice(-n).map((e, i) => <li key={`${e.ts}-${i}`} className={`min-w-0 text-[12.5px] leading-snug ${e.role === "user" ? "text-white/60" : "text-white/90"}`}><p className="line-clamp-2" title={e.text}>{recortarPalabras(e.role === "user" ? `Tú: ${e.text}` : e.text, 110)}</p></li>)}</ol>;

    return (
        <div ref={ref} className="h-full w-full">
            <WidgetLibre forma="ninguna" acento={VIOLETA} acento2={TURQUESA} etiqueta={ultima ? `Astraura dijo: ${ultima.text.slice(0, 80)}` : "Astraura"}>
                {({ clase: medida, ancho, alto }) => {
                    const clase = forzada ?? medida;
                    const { base: b } = disenoDe(clase);
                    const lado = Math.min(ancho, alto);
                    const apaisado = ancho >= alto * 1.3;
                    const tamOrbe = (base: "m" | "l" | "xl") => Math.min(alto * 0.42, ancho * 0.26, base === "xl" ? 170 : 140) * k;

                    if (resuelto.diseno === "acciones") {
                        const t = b === "m" ? Math.min(lado * 0.34, 110) * k : tamOrbe(b);
                        return <DisenoAcciones estado={estado} tam={t} ultima={ultima ? { texto: ultima.text, ts: ultima.ts } : null} hilo={hilo.map((e) => ({ rol: e.role, texto: e.text, ts: e.ts }))} ahora={ahora || Date.now()} tactil={tactil} voz={voz} preguntar={<><Preguntar tactil={tactil} /><SelectorDisenoAstraura valor={diseno} onCambiar={elegir} degradado={resuelto.degradado} /></>} botonVoz={botonVoz} sugerencias={SUGERENCIAS} onAbrirChat={abrirChat} onSugerencia={(t) => { void (async () => { const { openAurora } = await import("@/lib/aurora/open-aurora"); await openAurora({ prompt: t, reveal: true }); })(); }} />;
                    }
                    if (b === "micro") return <div className="flex h-full items-center justify-center" data-diseno="micro"><AstrauraForma estado={estado} tam={lado * 0.62} onClick={abrirChat} /></div>;
                    if (b === "s") return <div className="flex h-full flex-col items-center justify-center gap-2 px-2 text-center" data-diseno="s"><AstrauraForma estado={estado} tam={lado * 0.42} onClick={abrirChat} />{frase("line-clamp-2 text-[12.5px] leading-snug text-white/90", 90)}</div>;
                    if (clase === "panoramico") return <div className="flex h-full w-full items-center gap-4 px-3" data-diseno="panoramico"><AstrauraForma estado={estado} tam={Math.min(alto * 0.72, 110)} onClick={abrirChat} /><div className="min-w-0 flex-1">{frase("line-clamp-2 text-[13px] leading-snug text-white/90", 110)}</div><div className="w-[40%] min-w-[200px] max-w-[340px]"><Preguntar tactil={tactil} compacto /></div></div>;
                    if (clase === "torre") return <div className="flex h-full w-full flex-col items-center gap-3 px-3 py-3" data-diseno="torre"><AstrauraForma estado={estado} tam={Math.min(ancho * 0.55, 120)} onClick={abrirChat} />{rotulo}<div className="min-h-0 w-full flex-1 flex flex-col gap-2.5 mt-auto">{hiloNodo(4)}<Preguntar tactil={tactil} compacto /></div></div>;
                    if (b === "m") return apaisado ? <div className="flex h-full w-full items-center gap-4 px-3" data-diseno="m-fila"><AstrauraForma estado={estado} tam={Math.min(alto * 0.5, 120) * k} onClick={abrirChat} /><div className="flex min-w-0 flex-1 flex-col gap-2">{frase("line-clamp-3 text-[13px] leading-snug text-white/90")}<Preguntar tactil={tactil} compacto /></div></div> : <div className="items-center px-3 text-center" data-diseno="m"><div className="my-auto flex w-full min-w-0 flex-col items-center gap-2"><AstrauraForma estado={estado} tam={Math.min(lado * 0.34, 110) * k} onClick={abrirChat} />{frase("line-clamp-3 text-[13px] leading-snug text-white/90", 140)}<Preguntar tactil={tactil} compacto /></div></div>;

                    return <div className={`flex h-full w-full gap-5 px-4 py-3 ${apaisado || b === "xl" ? "flex-row items-center" : "flex-col items-center justify-center"}`} data-diseno={`${b}-hilo`}><div className="flex shrink-0 flex-col items-center gap-2"><AstrauraForma estado={estado} tam={tamOrbe(b)} onClick={abrirChat} />{rotulo}<div className="flex flex-wrap justify-center gap-1.5">{botonVoz}<Accion icono={MessageCircle} color={VIOLETA} grande={tactil} onClick={abrirChat} aria-label="Abrir el chat de Astraura">Chat</Accion><SelectorDisenoAstraura valor={diseno} onCambiar={elegir} degradado={false} /></div></div><div className="min-w-0 flex-1 self-stretch flex flex-col gap-2.5 my-auto">{hiloNodo(b === "xl" ? 6 : alto >= 340 ? 4 : 2)}<Preguntar tactil={tactil} sugerencias={b === "xl" ? 3 : alto >= 300 ? 2 : 0} /></div>;
                }}
            </WidgetLibre>
        </div>
    );
}


export default AstrauraLibreProto;