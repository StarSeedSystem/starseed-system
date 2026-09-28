"use client";

/**
 * Ajustes › Chats personalizados (2026-09-28): los chats y correos con ajustes propios, cada uno
 * con lo que cambia y un «Restablecer» que lo devuelve a los ajustes generales (nada se borra).
 */

import { useMemo, useState } from "react";
import { Mail, MessageSquare, RotateCcw, Settings2, SlidersHorizontal, Users } from "lucide-react";
import { toast } from "sonner";
import type { AjustesHilo, AjustesMensajeriaApi, TipoHilo } from "@/lib/mensajeria/ajustes-tipos";
import { nombreDeHilo, useNombresHilos } from "@/components/messages/marco/nombres-hilos";
import { DialogoAjustesHilo } from "@/components/messages/marco/dialogo-ajustes-hilo";
import { describirSilencio } from "@/components/messages/marco/formato-tiempo";
import { ACENTO, pildoraFantasma } from "@/components/messages/marco/estilos";
import { Nota } from "./controles";

function tieneValor(v: unknown): boolean {
    if (v === undefined) return false;
    if (v && typeof v === "object" && !Array.isArray(v)) return Object.values(v).some((x) => x !== undefined);
    if (Array.isArray(v)) return v.length > 0;
    return true;
}

/** ¿Este hilo cambia algo respecto a los ajustes generales? */
export function tieneAjustesPropios(h: AjustesHilo | undefined): boolean {
    if (!h) return false;
    return Object.entries(h).some(([k, v]) => k !== "actualizado" && tieneValor(v));
}

/** Resumen legible de lo que cambia un hilo (chips). */
export function resumenAjustesHilo(h: AjustesHilo): string[] {
    const r: string[] = [];
    if (h.apodo) r.push(`Apodo «${h.apodo}»`);
    if (h.fijado) r.push("Fijado");
    if (h.archivado) r.push("Archivado");
    if (h.restringido) r.push("Restringido");
    if (h.notificaciones && tieneValor(h.notificaciones)) {
        const s = describirSilencio(h.notificaciones.silencioHasta ?? null);
        r.push(s ?? (h.notificaciones.activas === false ? "Sin avisos" : "Avisos propios"));
    }
    if (h.apariencia && tieneValor(h.apariencia)) r.push(h.apariencia.fondo ? "Fondo propio" : "Apariencia propia");
    if (h.confirmacionesLectura !== undefined) r.push(h.confirmacionesLectura ? "Con confirmaciones" : "Sin confirmaciones");
    if (h.vistaPreviaEnlaces !== undefined) r.push(h.vistaPreviaEnlaces ? "Con vista de enlaces" : "Sin vista de enlaces");
    if (h.cargarMultimedia) r.push("Multimedia propia");
    if (h.vaciadoEn) r.push("Vaciado para ti");
    if (h.etiquetas?.length) r.push(`${h.etiquetas.length} ${h.etiquetas.length === 1 ? "etiqueta" : "etiquetas"}`);
    return r;
}

const ICONO: Record<TipoHilo, typeof Mail> = { dm: MessageSquare, grupo: Users, correo: Mail };

export function SeccionPersonalizados({ api }: { api: AjustesMensajeriaApi }) {
    const { nombres } = useNombresHilos();
    const [editando, setEditando] = useState<{ id: string; tipo: TipoHilo; nombre: string } | null>(null);

    const filas = useMemo(
        () =>
            Object.entries(api.ajustes.hilos)
                .filter(([, h]) => tieneAjustesPropios(h))
                .map(([id, h]) => ({ id, h, ...nombreDeHilo(nombres, id) }))
                .sort((a, b) => (b.h.actualizado ?? "").localeCompare(a.h.actualizado ?? "")),
        [api.ajustes.hilos, nombres],
    );

    if (filas.length === 0) {
        return (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-6 py-12 text-center">
                <SlidersHorizontal className="h-8 w-8 text-white/30" />
                <p className="text-[14px] font-medium text-white/85">Ningún chat tiene ajustes propios</p>
                <p className="max-w-sm text-[12px] text-white/55">
                    Desde el menú de cada chat («Ajustes del chat») puedes darle otro fondo, un apodo, silenciarlo o fijarlo. Aparecerá aquí.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <Nota color={ACENTO.mensajes}>
                Restablecer un chat solo le quita sus ajustes propios y vuelve a seguir los generales. Ningún mensaje se borra.
            </Nota>
            <ul className="space-y-2" aria-label="Chats con ajustes propios">
                {filas.map(({ id, h, nombre, tipo }) => {
                    const Icono = ICONO[tipo];
                    return (
                        <li key={id} className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 sm:flex-row sm:items-center">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={pildoraFantasma(ACENTO.mensajes)}>
                                    <Icono className="h-4 w-4 text-white/85" />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-[14px] font-semibold text-white/90">{nombre}</p>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {resumenAjustesHilo(h).map((r) => (
                                            <span key={r} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/65">
                                                {r}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="flex shrink-0 gap-2 sm:justify-end">
                                <button
                                    type="button"
                                    onClick={() => setEditando({ id, tipo, nombre })}
                                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-white/[0.06] px-3 text-[13px] font-medium text-white/85 transition-colors hover:bg-white/[0.12]"
                                >
                                    <Settings2 className="h-3.5 w-3.5" /> Editar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        api.restablecerHilo(id);
                                        toast.success(`«${nombre}» vuelve a los ajustes generales.`);
                                    }}
                                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                                    style={pildoraFantasma(ACENTO.carmesi)}
                                >
                                    <RotateCcw className="h-3.5 w-3.5" /> Restablecer
                                </button>
                            </div>
                        </li>
                    );
                })}
            </ul>
            <DialogoAjustesHilo
                open={!!editando}
                onOpenChange={(v) => !v && setEditando(null)}
                hiloId={editando?.id ?? null}
                tipo={editando?.tipo ?? "dm"}
                titulo={editando?.nombre ?? ""}
            />
        </div>
    );
}

export default SeccionPersonalizados;
