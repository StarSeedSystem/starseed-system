"use client";

/**
 * Chats de Genesis · «Información del chat» (GEN1114F · 2026-11-13, contrato GEN1114 §2.3, §3.9, §8.5 y §10)
 * ─────────────────────────────────────────────────────────────────────────────
 * Lo que se sabe de un chat canónico: su nombre (entero), su id de StarSeed, en qué medios aparece y
 * con qué nombre en cada uno, y a dónde va lo que se escribe. Nada de ids nativos ni tokens: el
 * catálogo no los trae (§2.4). Lo que aún no existe lo dice como «llega en la fase 2», sin botones
 * muertos. El catálogo lo publica la Mac pero lo sirve la puerta, y eso también se dice (§3.11.3).
 *
 * Solo pinta el contenido: el hilo lo abre en una `Hoja` a pantalla completa por debajo de `sm`.
 */

import { AtSign, Fingerprint, Layers, Route, TriangleAlert } from "lucide-react";

import { DESTINO_DE_FUENTE, fuenteDeAlias } from "@/lib/chats-genesis/alias-gen1113";
import { nombreDeChat, type ChatCanonicoPublico, type MedioChat, type MedioPublico } from "@/lib/chats-genesis/canon";
import { cn } from "@/lib/utils";

import { TEXTO_PROVISIONAL } from "./cabecera-espejo";

export interface InfoChatProps {
    chat: ChatCanonicoPublico | null;
    /** La clave de GEN1113 del hilo («direccion», «puente:hermes-avisos»…): da el nombre provisional y el destino fijo. */
    claveGen1113: string;
    esDueno: boolean;
}

export const NOMBRE_MEDIO: Record<MedioChat, string> = {
    "mac-direccion": "Dirección en la Mac (/genesis)",
    claude: "Claude",
    codex: "Codex",
    hermes: "Hermes",
    antigravity: "Antigravity",
    ide: "IDE",
    terminal: "Terminal",
    telegram: "Telegram",
    "a1-peticiones": "Peticiones del A1",
    "genesis-web": "Genesis en Astraura",
    astraura: "Chats de Astraura",
};

const NOMBRE_TIPO: Record<ChatCanonicoPublico["tipo"], string> = {
    direccion: "Dirección de MetaGenesis",
    "canal-director": "Canal de un director",
    "puente-telegram": "Puente de Telegram",
    astraura: "Chat de Astraura",
};

function fecha(t: string | null): string | null {
    if (!t) return null;
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Lo que se dice del nombre de un medio (puro). */
export function lineaMedio(m: MedioPublico, nombreCanonico: string): string {
    const donde = NOMBRE_MEDIO[m.medio] ?? m.medio;
    const cuando = fecha(m.comprobado);
    switch (m.estadoNombre) {
        case "igual":
            return `Mismo nombre${cuando ? ` (comprobado el ${cuando})` : ""}`;
        case "distinto":
            return `En ${donde} se llama «${m.nombreEnMedio ?? "?"}»; aquí, «${nombreCanonico}». Elegir cuál se queda llega en la fase 2.`;
        case "no-se-puede":
            return "Este medio no deja leer su nombre";
        default:
            return "Nombre sin comprobar todavía";
    }
}

export function InfoChat({ chat, claveGen1113, esDueno }: InfoChatProps) {
    const respaldo = nombreDeChat(null, claveGen1113);
    const nombre = chat?.nombre ?? respaldo.nombre;
    const id = chat?.id ?? respaldo.id;
    const provisional = !chat || chat.nombreProvisional;
    const fuente = chat?.fuente ?? fuenteDeAlias(claveGen1113);
    const destino = fuente ? DESTINO_DE_FUENTE[fuente] : null;
    const otrosNombres = (chat?.alias ?? []).filter((a) => a !== nombre && !a.includes(":"));

    return (
        <div data-testid="info-chat" className="flex flex-col gap-4 p-2 text-[13px] text-white/80">
            <section className="flex flex-col gap-1">
                <h3 className="break-words text-base font-semibold leading-snug text-white [overflow-wrap:anywhere]">{nombre}</h3>
                {provisional ? <p className="text-[12px] leading-snug text-amber-200/85">({TEXTO_PROVISIONAL})</p> : null}
                <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-white/60">
                    <Fingerprint className="size-3.5 shrink-0 text-cyan-300" aria-hidden />
                    <span>Id del chat:</span>
                    <code data-testid="id-chat" className="break-all rounded bg-white/[0.06] px-1.5 py-0.5 text-[12px] text-cyan-100">{id ?? "aún sin publicar (la Mac no ha subido el catálogo)"}</code>
                </p>
                {chat ? <p className="text-[12px] text-white/50">{NOMBRE_TIPO[chat.tipo] ?? chat.tipo}</p> : null}
                {otrosNombres.length > 0 ? (
                    <p className="break-words text-[12px] text-white/45">También se llamó: {otrosNombres.map((a) => `«${a}»`).join(", ")}</p>
                ) : null}
            </section>

            {destino ? (
                <section className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                    <Route className="mt-0.5 size-4 shrink-0 text-violet-300" aria-hidden />
                    <p className="min-w-0 leading-snug">
                        <span className="block text-[11px] uppercase tracking-wide text-white/40">Lo que escribes aquí va a</span>
                        <span data-testid="destino-fijo" className="break-words">{destino}</span>
                    </p>
                </section>
            ) : null}

            <section aria-label="Medios" className="flex flex-col gap-1.5">
                <h4 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/40">
                    <Layers className="size-3.5" aria-hidden /> Dónde aparece
                </h4>
                {chat && chat.medios.length > 0 ? (
                    <ul className="flex flex-col gap-1.5">
                        {chat.medios.map((m, i) => (
                            <li key={`${m.medio}-${i}`} data-medio={m.medio} className={cn("rounded-lg border px-3 py-2", m.estadoNombre === "distinto" ? "border-amber-400/30 bg-amber-500/[0.07]" : "border-white/10 bg-black/20")}>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                    <span className="font-medium text-white/90">{NOMBRE_MEDIO[m.medio] ?? m.medio}</span>
                                    {esDueno && m.usuario ? (
                                        <span className="inline-flex items-center gap-0.5 text-[11px] text-white/50"><AtSign className="size-3" aria-hidden />{m.usuario.replace(/^@/, "")}</span>
                                    ) : null}
                                </div>
                                <p className={cn("mt-0.5 break-words text-[12px] leading-snug", m.estadoNombre === "distinto" ? "text-amber-100" : "text-white/55")}>
                                    {m.estadoNombre === "distinto" ? <TriangleAlert className="mr-1 inline size-3.5 align-[-2px]" aria-hidden /> : null}
                                    {lineaMedio(m, nombre)}
                                </p>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-[12px] text-white/50">La Mac aún no ha publicado en qué medios aparece este chat.</p>
                )}
            </section>

            <section className="flex flex-col gap-1 border-t border-white/10 pt-3 text-[12px] leading-snug text-white/45">
                <p>Nombres e id según el catálogo que publica la Mac y sirve la puerta del A1 (la Mac lo firmará en la fase 2).</p>
                <p>La configuración y el contexto comunes de este chat llegan en la fase 2.</p>
            </section>
        </div>
    );
}

export default InfoChat;
