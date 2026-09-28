"use client";
/**
 * Astraura libre (Ola 383 · WL8) — un orbe líquido violeta→turquesa que respira con la última
 * frase de Astraura. micro = el orbe solo, latiendo · s/m = + la frase · l/xl = + tu última
 * pregunta y «Hablar con Astraura». La fuente es la misma que el widget clásico (el registro
 * local del chat) y la acción también: abrir el Exocórtex. No hay campo de texto porque el
 * Exocórtex aún no acepta una pregunta desde fuera: un campo que la perdiera mentiría.
 */
import * as React from "react";
import { MessageCircle } from "lucide-react";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { personalidadDe } from "@/lib/widgets/forma/asignacion";
import { readAuroraChatEntries, AURORA_CHATLOG_CHANGE_EVENT, AURORA_CHATLOG_KEY, type AuroraChatLogEntry } from "@/lib/aurora/aurora-chat-log";
import { AURORA_EXOCORTEX_OPEN_EVENT } from "@/lib/aurora/aurora-orb-bus";
import { timeAgo } from "@/components/dashboard/kit";
import { Pildora, disenoDe } from "./comun";

function abrirAstraura() {
    try { window.dispatchEvent(new CustomEvent(AURORA_EXOCORTEX_OPEN_EVENT)); } catch { /* defensivo */ }
}

function Orbe({ tam, hablando }: { tam: number; hablando: boolean }) {
    return (
        <button type="button" onClick={abrirAstraura} aria-label="Abrir el chat de Astraura"
            className={`${hablando ? "ss-latir" : "ss-respirar"} relative shrink-0 cursor-pointer rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300`}
            style={{ width: tam, height: tam }}>
            <span aria-hidden className="ss-girar absolute inset-0" style={{ ["--ss-dur" as string]: "14s", borderRadius: "42% 58% 55% 45% / 48% 42% 58% 52%", background: "conic-gradient(from 0deg, #7c5cff, #23d5ab, #007FFF, #b388ff, #7c5cff)", filter: "blur(2px)" }} />
            <span aria-hidden className="ss-contragirar absolute inset-[10%]" style={{ ["--ss-dur" as string]: "9s", borderRadius: "55% 45% 40% 60% / 45% 55% 45% 55%", background: "radial-gradient(circle at 35% 30%, #ffffffcc, #b9a5ff55 35%, transparent 70%)" }} />
            <span aria-hidden className="absolute inset-[-18%] rounded-full" style={{ background: "radial-gradient(closest-side, #7c5cff44, transparent)" }} />
        </button>
    );
}

export function AstrauraLibre() {
    const [entradas, setEntradas] = React.useState<AuroraChatLogEntry[] | null>(null);
    React.useEffect(() => {
        const leer = () => { try { setEntradas(readAuroraChatEntries()); } catch { setEntradas([]); } };
        const alGuardar = (e: StorageEvent) => { if (e.key === AURORA_CHATLOG_KEY) leer(); };
        leer();
        window.addEventListener(AURORA_CHATLOG_CHANGE_EVENT, leer);
        window.addEventListener("storage", alGuardar);
        return () => { window.removeEventListener(AURORA_CHATLOG_CHANGE_EVENT, leer); window.removeEventListener("storage", alGuardar); };
    }, []);
    const ultima = entradas ? [...entradas].reverse().find((e) => e.role === "aurora") : undefined;
    const pregunta = entradas ? [...entradas].reverse().find((e) => e.role === "user") : undefined;
    const reciente = !!ultima && Date.now() - ultima.ts < 60_000;
    const per = personalidadDe("AURORA_LAST");

    return (
        <WidgetLibre forma="ninguna" acento={per.acento} etiqueta={ultima ? `Astraura dijo: ${ultima.text.slice(0, 80)}` : "Astraura"}>
            {({ clase, ancho, alto }) => {
                const { base: b, horizontal } = disenoDe(clase);
                const lado = Math.min(ancho, alto);
                if (b === "micro") return <div className="flex h-full items-center justify-center"><Orbe tam={lado * 0.62} hablando={reciente} /></div>;
                const frase = ultima
                    ? <p className={`${b === "s" ? "line-clamp-2 text-xs" : "line-clamp-3 text-sm"} text-white/90`}>{ultima.text}</p>
                    : <p className="text-xs text-white/70">{entradas === null ? "…" : "Aún no habéis hablado."}</p>;
                const fila = horizontal || ancho > alto * 1.25;
                return (
                    <div className={`flex h-full w-full items-center justify-center gap-4 p-3 ${fila ? "flex-row text-left" : "flex-col text-center"}`}>
                        <Orbe tam={Math.min(lado * (b === "s" ? 0.42 : 0.5), 180)} hablando={reciente} />
                        <div className={`flex min-w-0 max-w-[22rem] flex-col gap-1.5 ${fila ? "items-start" : "items-center"}`}>
                            {(b === "l" || b === "xl") && pregunta && <p className="line-clamp-1 text-[11px] italic text-white/55">Tú: {pregunta.text}</p>}
                            {frase}
                            {ultima && <span className="text-[10px] text-violet-200/70">{timeAgo(ultima.ts)}</span>}
                            {(b !== "s" || !ultima) && <Pildora color="#7c5cff" onClick={abrirAstraura}><MessageCircle className="mr-1 inline size-3" />Hablar con Astraura</Pildora>}
                        </div>
                    </div>
                );
            }}
        </WidgetLibre>
    );
}

export default AstrauraLibre;
