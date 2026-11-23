"use client";

/**
 * CTL1117I · «Cómo se ve que te controlan» en el panel «Control entre mis neuronas» de ESTE aparato:
 *  · Indicador en pantalla: Punto en la esquina / Oculto.   · Ver los toques de quien controla: sí / no.
 * Se leen y se escriben solo con `ajustes-aparato.ts` (comandos nativos de ESTA página; ninguna orden remota los toca). En
 * escritorio y web, donde no hay control de pantalla propio, salen apagados y con el motivo. Aparte, quién controla ahora y
 * «Terminar»: así, con el indicador oculto, la persona siempre sabe quién es y puede acabarlo.
 */

import { useCallback, useEffect, useId, useState } from "react";
import { AJUSTES_CONTROL_DEFECTO, leerAjustesControl, ponerAjustesControl, type AjustesControl, type IndicadorControl } from "@/lib/control-remoto/ajustes-aparato";
import type { QuienControla } from "@/lib/control-remoto/quien-controla";
import { PALABRAS_INDICADOR as P } from "@/lib/control-remoto/palabras-indicador";
import { PuntoColor } from "./punto-control";

/** Lo emite el panel al cambiar un ajuste; la banda (el punto de la esquina) lo oye y vuelve a leer. */
export const EVENTO_AJUSTES_CONTROL = "starseed:control-ajustes-cambio";

function hhmm(t: number): string {
    return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export type SesionIndicador = QuienControla & { token?: string };

export function QuienControlaAhora({
    quien,
    sesiones,
    onTerminar,
    onTerminarUna,
    onQuitarPermiso,
}: {
    quien: QuienControla | null;
    sesiones?: readonly SesionIndicador[];
    onTerminar: () => void;
    onTerminarUna?: (token: string) => void;
    onQuitarPermiso?: () => void;
}) {
    const lista: readonly SesionIndicador[] = sesiones && sesiones.length > 0 ? sesiones : quien ? [quien] : [];
    if (lista.length > 1) {
        return (
            <div className="space-y-2 text-[12px]" role="status" data-testid="quien-controla-ahora">
                <ul className="space-y-1.5">
                    {lista.map((item, idx) => (
                        <li key={item.token ?? `${item.neurona}-${idx}`} className="flex flex-wrap items-center gap-2">
                            <PuntoColor color={item.color} />
                            <span className="min-w-0 flex-1 text-white/85">{P.ahora.controla(item.nombre, item.nivel, hhmm(item.desde))}</span>
                            <button
                                type="button"
                                onClick={() => (item.token && onTerminarUna ? onTerminarUna(item.token) : onTerminar())}
                                className="min-h-9 cursor-pointer rounded-md bg-[#DC143C] px-3 py-1 font-medium hover:bg-[#b01030]"
                            >
                                {P.ahora.terminar}
                            </button>
                        </li>
                    ))}
                </ul>
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={onTerminar} className="min-h-9 cursor-pointer rounded-md bg-[#DC143C]/85 px-3 py-1 font-medium hover:bg-[#DC143C]">
                        Terminar todas
                    </button>
                    {onQuitarPermiso && (
                        <button type="button" onClick={onQuitarPermiso} data-testid="quitar-permiso" className="min-h-9 cursor-pointer rounded-md bg-white/10 px-3 py-1 font-medium hover:bg-white/20">
                            {P.ahora.quitarPermiso}
                        </button>
                    )}
                </div>
            </div>
        );
    }
    const unica = lista[0] ?? null;
    return (
        <div className="flex flex-wrap items-center gap-2 text-[12px]" role="status" data-testid="quien-controla-ahora">
            {unica ? (
                <>
                    <PuntoColor color={unica.color} />
                    <span className="min-w-0 flex-1 text-white/85">{P.ahora.controla(unica.nombre, unica.nivel, hhmm(unica.desde))}</span>
                    <button type="button" onClick={onTerminar} className="min-h-9 cursor-pointer rounded-md bg-[#DC143C] px-3 py-1 font-medium hover:bg-[#b01030]">
                        {P.ahora.terminar}
                    </button>
                    {onQuitarPermiso && (
                        <button type="button" onClick={onQuitarPermiso} data-testid="quitar-permiso" className="min-h-9 cursor-pointer rounded-md bg-white/10 px-3 py-1 font-medium hover:bg-white/20">
                            {P.ahora.quitarPermiso}
                        </button>
                    )}
                </>
            ) : (
                <span className="text-white/55">{P.ahora.nadie}</span>
            )}
        </div>
    );
}

export function AjustesIndicadorControl({
    disponible,
    quien,
    sesiones,
    onTerminar,
    onTerminarUna,
    onQuitarPermiso,
    leer = leerAjustesControl,
    poner = ponerAjustesControl,
}: {
    /** ¿Este aparato tiene control de pantalla propio (app de Android)? Si no, los ajustes salen apagados con el motivo. */
    disponible: boolean;
    quien: QuienControla | null;
    sesiones?: readonly SesionIndicador[];
    onTerminar: () => void;
    onTerminarUna?: (token: string) => void;
    /** CTL1118G: «Quitar permiso» (cierra la sesión y apaga el permiso de este aparato), al lado de «Terminar». */
    onQuitarPermiso?: () => void;
    leer?: () => Promise<AjustesControl>;
    poner?: (p: Partial<AjustesControl>) => Promise<AjustesControl>;
}) {
    const id = useId();
    const [a, setA] = useState<AjustesControl>(AJUSTES_CONTROL_DEFECTO);
    const [ocupado, setOcupado] = useState(false);
    const [fallo, setFallo] = useState(false);

    useEffect(() => {
        if (!disponible) return;
        let vivo = true;
        void leer().then((x) => vivo && setA(x));
        return () => {
            vivo = false;
        };
    }, [disponible, leer]);

    const cambiar = useCallback(
        async (parcial: Partial<AjustesControl>) => {
            if (!disponible || ocupado) return;
            setOcupado(true);
            setFallo(false);
            try {
                const r = await poner(parcial);
                setA(r);
                try {
                    window.dispatchEvent(new CustomEvent(EVENTO_AJUSTES_CONTROL)); // la banda de la app vuelve a leer el indicador
                } catch {
                    /* sin eventos (pruebas) */
                }
                const pedido = Object.entries(parcial).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v);
                if (!pedido) setFallo(true);
            } catch {
                setFallo(true);
            } finally {
                setOcupado(false);
            }
        },
        [disponible, ocupado, poner],
    );

    const opciones: { valor: IndicadorControl; texto: string; ayuda: string }[] = [
        { valor: "punto", texto: P.indicador.punto, ayuda: P.indicador.ayudaPunto },
        { valor: "oculto", texto: P.indicador.oculto, ayuda: P.indicador.ayudaOculto },
    ];
    const toques = disponible && a.ver_toques;

    return (
        <section className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[12px] text-white/80" aria-labelledby={`${id}-t`} data-testid="ajustes-indicador">
            <h4 id={`${id}-t`} className="font-medium text-white/90">
                {P.titulo}
            </h4>
            <QuienControlaAhora quien={quien} onTerminar={onTerminar} onQuitarPermiso={onQuitarPermiso} />
            <div role="radiogroup" aria-labelledby={`${id}-i`} aria-describedby={`${id}-ind-ayuda`} className="space-y-1">
                <p id={`${id}-i`} className="text-white/70">
                    {P.indicador.etiqueta}
                </p>
                <div className="flex flex-wrap gap-2">
                    {opciones.map((o) => {
                        const marcado = disponible && a.indicador === o.valor;
                        return (
                            <button
                                key={o.valor}
                                type="button"
                                role="radio"
                                aria-checked={marcado}
                                disabled={!disponible || ocupado}
                                onClick={() => void cambiar({ indicador: o.valor })}
                                data-testid={`indicador-${o.valor}`}
                                className={`min-h-9 cursor-pointer rounded-lg border px-3 py-1.5 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${marcado ? "border-sky-400 bg-sky-400/20 text-white" : "border-white/20 bg-white/5 text-white/70 hover:bg-white/10"}`}
                            >
                                {o.texto}
                            </button>
                        );
                    })}
                </div>
                <p id={`${id}-ind-ayuda`} className="text-white/55" data-testid="indicador-ayuda">
                    {a.indicador === "oculto" && disponible ? P.indicador.ayudaOculto : P.indicador.ayudaPunto}
                </p>
            </div>
            <div role="radiogroup" aria-labelledby={`${id}-a`} aria-describedby={`${id}-alc-ayuda`} className="space-y-1" data-testid="alcance-control">
                <p id={`${id}-a`} className="text-white/70">
                    {P.alcance.etiqueta}
                </p>
                <div className="flex flex-wrap gap-2">
                    {(["total", "protegido"] as const).map((v) => {
                        const marcado = disponible && a.alcance === v;
                        return (
                            <button
                                key={v}
                                type="button"
                                role="radio"
                                aria-checked={marcado}
                                disabled={!disponible || ocupado}
                                onClick={() => void cambiar({ alcance: v })}
                                data-testid={`alcance-${v}`}
                                className={`min-h-9 cursor-pointer rounded-lg border px-3 py-1.5 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${marcado ? "border-sky-400 bg-sky-400/20 text-white" : "border-white/20 bg-white/5 text-white/70 hover:bg-white/10"}`}
                            >
                                {P.alcance[v]}
                            </button>
                        );
                    })}
                </div>
                <p id={`${id}-alc-ayuda`} className="text-white/55" data-testid="alcance-ayuda">
                    {disponible && a.alcance === "protegido" ? P.alcance.ayudaProtegido : P.alcance.ayudaTotal}
                </p>
            </div>
            <div className="space-y-1">
                <button
                    type="button"
                    role="switch"
                    aria-checked={toques}
                    aria-describedby={`${id}-toq-ayuda`}
                    disabled={!disponible || ocupado}
                    onClick={() => void cambiar({ ver_toques: !a.ver_toques })}
                    data-testid="ver-toques"
                    className={`min-h-9 cursor-pointer rounded-lg border px-3 py-1.5 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toques ? "border-sky-400 bg-sky-400/20 text-white" : "border-white/20 bg-white/5 text-white/70 hover:bg-white/10"}`}
                >
                    {P.toques.etiqueta}: {toques ? P.toques.si : P.toques.no}
                </button>
                <p id={`${id}-toq-ayuda`} className="text-white/55">
                    {P.toques.ayuda}
                </p>
            </div>
            {!disponible && (
                <p className="text-amber-200/80" data-testid="ajustes-indicador-motivo">
                    {P.sinNativo}
                </p>
            )}
            {fallo && (
                <p role="alert" className="text-[#ff6b81]" data-testid="ajustes-indicador-fallo">
                    {P.noSePudo}
                </p>
            )}
            <p className="text-white/70" data-testid="aviso-siempre">
                {P.siempre}
            </p>
        </section>
    );
}
