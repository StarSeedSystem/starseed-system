"use client";

/**
 * Ajustes › Notificaciones (2026-09-28): Mensajes, Grupos y Correos por separado (activas,
 * sonido, vista previa y «Silenciar ▸») y unas horas de silencio para todo.
 */

import { useId, useState } from "react";
import { Bell, BellOff, ChevronRight, Mail, MessageSquare, Moon, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { OPCIONES_SILENCIO } from "@/lib/mensajeria/ajustes";
import type { AjustesMensajeriaApi, AjustesNotificaciones } from "@/lib/mensajeria/ajustes-tipos";
import { describirSilencio } from "@/components/messages/marco/formato-tiempo";
import { ACENTO } from "@/components/messages/marco/estilos";
import { Bloque, Fila, FilaInterruptor } from "./controles";

/** «Silenciar ▸» desplegable en su sitio (vertical, sin submenús flotantes). */
export function SelectorSilencio({
    hasta,
    onCambiar,
    formato24h,
}: {
    hasta: string | null;
    onCambiar: (hasta: string | null) => void;
    formato24h: boolean;
}) {
    const [abierto, setAbierto] = useState(false);
    const idLista = useId();
    const estado = describirSilencio(hasta, formato24h);
    return (
        <div className="px-4 py-3">
            <button
                type="button"
                aria-expanded={abierto}
                aria-controls={idLista}
                onClick={() => setAbierto((v) => !v)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF]"
            >
                {estado ? <BellOff className="h-4 w-4 shrink-0 text-[#FFBF00]" /> : <Bell className="h-4 w-4 shrink-0 text-white/60" />}
                <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-white/90">Silenciar</span>
                    <span className="block text-[12px] text-white/55">{estado ?? "Suena con normalidad"}</span>
                </span>
                <ChevronRight className={cn("h-4 w-4 shrink-0 text-white/50 transition-transform duration-150", abierto && "rotate-90")} />
            </button>
            {abierto && (
                <ul id={idLista} className="mt-2 ml-7 space-y-0.5 border-l border-white/10 pl-2">
                    {estado && (
                        <li>
                            <button
                                type="button"
                                onClick={() => {
                                    onCambiar(null);
                                    setAbierto(false);
                                }}
                                className="w-full cursor-pointer rounded-lg px-2.5 py-1.5 text-left text-[13px] text-[#10B981] transition-colors hover:bg-white/[0.06]"
                            >
                                Volver a avisar
                            </button>
                        </li>
                    )}
                    {OPCIONES_SILENCIO.map((op) => (
                        <li key={op.id}>
                            <button
                                type="button"
                                onClick={() => {
                                    onCambiar(op.hasta(new Date()));
                                    setAbierto(false);
                                }}
                                className="w-full cursor-pointer rounded-lg px-2.5 py-1.5 text-left text-[13px] text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white"
                            >
                                {op.etiqueta}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

type ClaveCanal = "mensajes" | "grupos" | "correos";

const CANALES: { clave: ClaveCanal; titulo: string; Icono: typeof Bell; color: string }[] = [
    { clave: "mensajes", titulo: "Mensajes", Icono: MessageSquare, color: ACENTO.mensajes },
    { clave: "grupos", titulo: "Grupos", Icono: Users, color: ACENTO.esmeralda },
    { clave: "correos", titulo: "Correos", Icono: Mail, color: ACENTO.aurora },
];

export function SeccionNotificaciones({ api }: { api: AjustesMensajeriaApi }) {
    const n = api.ajustes.notificaciones;
    const formato24h = api.ajustes.chats.apariencia.formato24h;
    const idDesde = useId();
    const idHasta = useId();

    const cambiarCanal = (clave: ClaveCanal, cambios: Partial<AjustesNotificaciones>) =>
        api.cambiar("notificaciones", { [clave]: { ...n[clave], ...cambios } } as Partial<typeof n>);

    return (
        <div className="space-y-6">
            {CANALES.map(({ clave, titulo, Icono, color }) => {
                const canal = n[clave];
                return (
                    <Bloque key={clave} titulo={titulo}>
                        <div className="flex items-center gap-2.5 px-4 pt-3.5">
                            <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: `${color}1f`, color }}>
                                <Icono className="h-3.5 w-3.5" />
                            </span>
                            <span className="text-[12px] text-white/55">
                                {canal.activas ? "Avisos activos" : "Sin avisos: los verás al entrar"}
                            </span>
                        </div>
                        <FilaInterruptor etiqueta="Avisos" checked={canal.activas} onChange={(activas) => cambiarCanal(clave, { activas })} />
                        <FilaInterruptor etiqueta="Sonido" checked={canal.sonido} disabled={!canal.activas} onChange={(sonido) => cambiarCanal(clave, { sonido })} />
                        <FilaInterruptor
                            etiqueta="Vista previa del contenido"
                            detalle="Si la apagas, el aviso dice quién escribe pero no qué."
                            checked={canal.vistaPrevia}
                            disabled={!canal.activas}
                            onChange={(vistaPrevia) => cambiarCanal(clave, { vistaPrevia })}
                        />
                        <SelectorSilencio hasta={canal.silencioHasta} formato24h={formato24h} onCambiar={(silencioHasta) => cambiarCanal(clave, { silencioHasta })} />
                    </Bloque>
                );
            })}

            <Bloque titulo="Horas de silencio" descripcion="Durante esa franja no suena nada; los mensajes te esperan igual.">
                <FilaInterruptor
                    etiqueta="Activar horas de silencio"
                    checked={n.horasSilencio.activo}
                    onChange={(activo) => api.cambiar("notificaciones", { horasSilencio: { ...n.horasSilencio, activo } })}
                />
                <Fila etiqueta={<span className="inline-flex items-center gap-2"><Moon className="h-4 w-4 text-[#FFBF00]" /> Franja</span>} apilada>
                    <div className="flex flex-wrap items-center gap-3">
                        <label htmlFor={idDesde} className="flex items-center gap-2 text-[13px] text-white/70">
                            Desde
                            <input
                                id={idDesde}
                                type="time"
                                value={n.horasSilencio.desde}
                                disabled={!n.horasSilencio.activo}
                                onChange={(e) => api.cambiar("notificaciones", { horasSilencio: { ...n.horasSilencio, desde: e.target.value } })}
                                className="h-9 cursor-pointer rounded-xl border border-white/10 bg-white/[0.04] px-2.5 text-[13px] text-white disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:dark]"
                            />
                        </label>
                        <label htmlFor={idHasta} className="flex items-center gap-2 text-[13px] text-white/70">
                            Hasta
                            <input
                                id={idHasta}
                                type="time"
                                value={n.horasSilencio.hasta}
                                disabled={!n.horasSilencio.activo}
                                onChange={(e) => api.cambiar("notificaciones", { horasSilencio: { ...n.horasSilencio, hasta: e.target.value } })}
                                className="h-9 cursor-pointer rounded-xl border border-white/10 bg-white/[0.04] px-2.5 text-[13px] text-white disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:dark]"
                            />
                        </label>
                    </div>
                </Fila>
            </Bloque>
        </div>
    );
}

export default SeccionNotificaciones;
