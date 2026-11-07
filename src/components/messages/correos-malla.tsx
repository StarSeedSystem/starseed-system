"use client";

/**
 * Bandeja «Por la malla» de Correos (GRP1107A · 2026-11-07).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Los correos que no pudieron salir por el buzón @star.seed se guardan CIFRADOS en este aparato
 * y viajan por la malla (guardar y reenviar). Aquí se ven, con sus recibos (Enviado · En tránsito ·
 * Entregado · En el servidor) y la vía por la que fueron. Los recibidos por la malla que ya están
 * en el buzón del servidor no se enseñan dos veces (`fusionarConServidor`).
 */

import { useMemo, useState } from "react";
import { Check, ChevronDown, Lock, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { fusionarConServidor, marcasRecibo, textoEstadoCorreo, type CorreoMalla } from "@/lib/mail/correo-malla";
import { motorCorreoMalla, useCorreosMalla } from "@/lib/mail/correo-malla-motor";
import { ACENTO, pildoraFantasma } from "@/components/messages/marco/estilos";

const NOMBRES_MEDIO: Record<string, string> = {
    local: "Mesh · Sin internet",
    "wifi-local": "Mesh · Wi-Fi local",
    "p2p-internet": "P2P",
    turn: "P2P · TURN",
    correo: "Buzón @star.seed",
};

/** «Mesh · Sin internet · Tablet de Alex». */
export function textoViaCorreo(c: CorreoMalla): string | null {
    if (!c.via) return null;
    const medio = NOMBRES_MEDIO[c.via.medio] ?? c.via.medio;
    return c.via.medio === "correo" ? medio : `${medio} · ${c.via.etiqueta}`;
}

function cuando(ms: number): string {
    try {
        return new Date(ms).toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch {
        return "";
    }
}

function Tarjeta({ c }: { c: CorreoMalla }) {
    const [abierta, setAbierta] = useState(false);
    const via = textoViaCorreo(c);
    const para = c.para.map((u) => c.paraNombres?.[u] ?? "destinatario").join(", ");
    return (
        <li className="rounded-2xl px-3 py-2.5" style={{ background: "rgba(255,255,255,.045)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.07)" }} data-testid="correo-malla">
            <button type="button" onClick={() => setAbierta((v) => !v)} className="flex w-full cursor-pointer items-start gap-2 text-left" aria-expanded={abierta}>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-white">{c.asunto}</p>
                    <p className="truncate text-[12px] text-white/60">
                        {c.dir === "entra" ? `De ${c.de.nombre}` : c.dir === "relevo" ? `Relevo de ${c.de.nombre} para ${para}` : `Para ${para}`} · {cuando(c.creado)}
                    </p>
                </div>
                <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-white/50 transition-transform", abierta && "rotate-180")} aria-hidden />
            </button>
            <p className="mt-1 text-[12px] text-white/75" role="status">{textoEstadoCorreo(c)}</p>
            {c.dir === "sale" && (
                <ol className="mt-1.5 flex flex-wrap gap-1" aria-label="Recibos">
                    {marcasRecibo(c).map((m) => (
                        <li
                            key={m.tipo}
                            className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", m.hecho ? "text-emerald-100" : "text-white/40")}
                            style={m.hecho ? { background: "rgba(16,185,129,.16)", boxShadow: "inset 0 0 0 1px rgba(16,185,129,.35)" } : { boxShadow: "inset 0 0 0 1px rgba(255,255,255,.1)" }}
                        >
                            {m.hecho && <Check className="h-3 w-3" aria-hidden />} {m.texto}
                        </li>
                    ))}
                </ol>
            )}
            {via && (
                <p className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white/80" style={pildoraFantasma(ACENTO.esmeralda)} data-testid="via-correo-malla">
                    <Radio className="h-3 w-3" aria-hidden /> {via}
                </p>
            )}
            {c.aviso && <p className="mt-1 text-[11.5px] text-amber-200/90">{c.aviso}</p>}
            {abierta && <div className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-black/20 px-3 py-2 text-[13px] leading-relaxed text-white/85">{c.cuerpo || "(sin cuerpo)"}</div>}
        </li>
    );
}

/**
 * La bandeja de la malla, encima de la lista de Correos. No pinta nada si está vacía.
 * `mallaIdsServidor`: los correos del buzón que vinieron de la malla (para no duplicarlos).
 */
export function BandejaCorreosMalla({ mallaIdsServidor }: { mallaIdsServidor: string[] }) {
    const todos = useCorreosMalla();
    const [abierta, setAbierta] = useState(true);
    const lista = useMemo(() => fusionarConServidor(todos, mallaIdsServidor), [todos, mallaIdsServidor]);
    if (!lista.length) return null;
    const pendientes = lista.filter((c) => c.dir !== "entra" && c.estado !== "en-servidor").length;
    let cifrado = false;
    try {
        cifrado = motorCorreoMalla().cifrado();
    } catch {
        cifrado = false;
    }
    return (
        <section className="mx-1 mb-2 rounded-[20px] px-2 py-2" style={pildoraFantasma(ACENTO.esmeralda)} aria-label="Correos por la malla" data-testid="bandeja-correos-malla">
            <button type="button" onClick={() => setAbierta((v) => !v)} className="flex w-full cursor-pointer items-center gap-2 px-1 text-left" aria-expanded={abierta}>
                <Radio className="h-4 w-4 text-emerald-200" aria-hidden />
                <span className="flex-1 text-[12.5px] font-semibold text-white">
                    Por la malla · {lista.length} {lista.length === 1 ? "correo" : "correos"}
                    {pendientes ? ` · ${pendientes} por llegar al buzón` : ""}
                </span>
                <ChevronDown className={cn("h-4 w-4 text-white/60 transition-transform", abierta && "rotate-180")} aria-hidden />
            </button>
            <p className="mt-1 flex items-center gap-1 px-1 text-[11px] text-white/55">
                <Lock className="h-3 w-3" aria-hidden />
                {cifrado ? "Guardados cifrados en este aparato hasta que lleguen." : "Este navegador no deja guardarlos cifrados en disco: viven en esta pestaña hasta que lleguen."}
            </p>
            {abierta && <ul className="mt-2 space-y-1.5">{lista.map((c) => <Tarjeta key={c.id} c={c} />)}</ul>}
        </section>
    );
}

export default BandejaCorreosMalla;
