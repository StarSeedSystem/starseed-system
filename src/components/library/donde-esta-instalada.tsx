"use client";

/**
 * «Dónde está instalada» — en la ficha de una app de la Biblioteca.
 * ─────────────────────────────────────────────────────────────────────────────
 * (2026-09-25) Rescatado de «Mi Puente de Mando» (retirado a petición de Alex): era
 * lo único de sus páginas que el OS no tenía ya. La ficha solo decía «Instalada en
 * 2 sitios»; ahora se ve CUÁLES (la web, este dispositivo, otra neurona, un perfil),
 * en qué estado está cada uno, y se puede quitar un sitio de la lista. Se sincroniza
 * con la cuenta como el resto de instalaciones (`instalaciones-store`).
 */

import { useEffect, useState } from "react";
import { Globe, MonitorSmartphone, X } from "lucide-react";

import { thisDeviceId } from "@/lib/neurons/neurons";
import { destinosDeApp, ETIQUETA_ESTADO, etiquetaDestino } from "@/lib/instalaciones/destinos";
import { marcarDestino, useInstalaciones } from "@/lib/instalaciones/instalaciones-store";

export function DondeEstaInstalada({ appId }: { appId: string }) {
    const sitios = destinosDeApp(appId, useInstalaciones());
    const [yo, setYo] = useState("");
    const [confirmando, setConfirmando] = useState<string | null>(null);

    useEffect(() => {
        setYo(thisDeviceId());
    }, []);

    if (sitios.length === 0) return null;

    return (
        <section aria-label="Dónde está instalada" className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-white/55">Dónde está instalada</h3>
            <ul className="space-y-1.5">
                {sitios.map((d) => {
                    const Icono = d.tipo === "web" ? Globe : MonitorSmartphone;
                    const pidiendo = confirmando === d.id;
                    return (
                        <li key={d.id} className="flex items-center gap-2 text-sm">
                            <Icono className="h-4 w-4 shrink-0 text-white/50" aria-hidden />
                            <span className="min-w-0 flex-1 truncate text-white/85">
                                {etiquetaDestino(d, yo)}
                                <span className="ml-2 text-xs text-white/45">{ETIQUETA_ESTADO[d.estado]}</span>
                            </span>
                            {pidiendo ? (
                                <span className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            marcarDestino(d.id, "cancelada");
                                            setConfirmando(null);
                                        }}
                                        className="cursor-pointer rounded-md bg-rose-500/20 px-2 py-0.5 text-xs text-rose-200 hover:bg-rose-500/30"
                                    >
                                        Quitar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setConfirmando(null)}
                                        className="cursor-pointer rounded-md px-2 py-0.5 text-xs text-white/60 hover:bg-white/10"
                                    >
                                        Cancelar
                                    </button>
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    aria-label={`Quitar de ${etiquetaDestino(d, yo)}`}
                                    title="Quitar de la lista (una app nativa se desinstala desde el propio sistema)"
                                    onClick={() => setConfirmando(d.id)}
                                    className="cursor-pointer rounded-md p-1 text-white/45 hover:bg-white/10 hover:text-white/80"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
