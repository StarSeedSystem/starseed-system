"use client";
/**
 * Panel «Pestaña»: todo lo de la pestaña activa en un sitio — nombre, icono, color, orden,
 * acciones (nueva, duplicar, compartir, principal, eliminar con confirmación), dispositivos y la
 * vuelta de las pestañas temáticas.
 */
import * as React from "react";
import {
    Check, Copy, MonitorSmartphone, MoveLeft, MoveRight, Plus, RotateCcw, Share2, Sparkles, Star, Trash2, Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeviceType } from "../dashboard-types";
import { DEVICE_TYPES } from "../dashboard-devices";
import { COLORES_PESTANA, ICONOS_PESTANA, acentoDePestana } from "./aspecto-pestana";
import type { AccionesEditor, DashboardConAspecto } from "./tipos";
import { BotonHerramienta, Seccion, pildoraFantasma } from "./ui-editor";

const TURQUESA = "#14B8A6";

export interface PanelPestanaProps {
    dashboard: DashboardConAspecto;
    indice: number;
    total: number;
    faltanTematicas: number;
    currentDevice?: DeviceType;
    acciones: Pick<AccionesEditor,
        "onRenombrar" | "onAspecto" | "onDuplicar" | "onMover" | "onEliminar" | "onPrincipal" | "onNuevaPestana"
        | "onCompartir" | "onDispositivos" | "onGestorDispositivos" | "onRestaurarTematicas" | "onRestablecerPredeterminados">;
}

export function PanelPestana({ dashboard, indice, total, faltanTematicas, currentDevice, acciones }: PanelPestanaProps) {
    const [nombre, setNombre] = React.useState(dashboard.name);
    React.useEffect(() => setNombre(dashboard.name), [dashboard.id, dashboard.name]);
    const limpio = nombre.trim();
    const puedeGuardar = limpio.length > 0 && limpio !== dashboard.name;
    const guardar = () => { if (puedeGuardar) acciones.onRenombrar(dashboard.id, limpio); };
    const acento = acentoDePestana(dashboard.acento);
    const tags = dashboard.deviceTags ?? [];

    const alternarDispositivo = (t: DeviceType) => {
        if (t === "all") { acciones.onDispositivos(dashboard.id, []); return; }
        const set = new Set(tags.filter((x) => x !== "all"));
        if (set.has(t)) set.delete(t); else set.add(t);
        acciones.onDispositivos(dashboard.id, Array.from(set));
    };

    return (
        <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-5">
                <Seccion titulo="Nombre">
                    <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
                        <label className="min-w-[min(100%,200px)] flex-1">
                            <span className="sr-only">Nombre de la pestaña</span>
                            <input
                                value={nombre}
                                onChange={(e) => setNombre(e.target.value)}
                                maxLength={60}
                                className="h-10 w-full rounded-xl bg-black/30 px-3 text-[14px] text-white outline-none ring-1 ring-white/10 transition-shadow duration-200 focus:ring-2 focus:ring-[#14B8A6]/60"
                            />
                        </label>
                        <button
                            type="submit"
                            disabled={!puedeGuardar}
                            className="ss-redondo inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-white cursor-pointer transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-40"
                            style={pildoraFantasma(TURQUESA)}
                        >
                            <Check className="size-4" aria-hidden /> Guardar nombre
                        </button>
                    </form>
                </Seccion>

                <Seccion titulo="Icono">
                    <div role="radiogroup" aria-label="Icono de la pestaña" className="flex flex-wrap gap-1.5">
                        <button
                            type="button" role="radio" aria-checked={!dashboard.icono} aria-label="Sin icono"
                            onClick={() => acciones.onAspecto(dashboard.id, { icono: undefined })}
                            className="grid size-10 cursor-pointer place-items-center rounded-xl text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white"
                            style={!dashboard.icono ? pildoraFantasma(TURQUESA) : { boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }}
                        >
                            <Ban className="size-4" aria-hidden />
                        </button>
                        {Object.entries(ICONOS_PESTANA).map(([clave, { icono: Icono, nombre: n }]) => {
                            const activo = dashboard.icono === clave;
                            return (
                                <button
                                    key={clave} type="button" role="radio" aria-checked={activo} aria-label={n} title={n}
                                    onClick={() => acciones.onAspecto(dashboard.id, { icono: clave })}
                                    className={cn("grid size-10 cursor-pointer place-items-center rounded-xl transition-colors duration-200 hover:bg-white/10", activo ? "text-white" : "text-white/65")}
                                    style={activo ? pildoraFantasma(acento ?? TURQUESA) : { boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }}
                                >
                                    <Icono className="size-[18px]" aria-hidden style={activo && acento ? { color: acento } : undefined} />
                                </button>
                            );
                        })}
                    </div>
                </Seccion>

                <Seccion titulo="Color">
                    <div role="radiogroup" aria-label="Color de la pestaña" className="flex flex-wrap items-center gap-2">
                        <button
                            type="button" role="radio" aria-checked={!acento} aria-label="Sin color"
                            onClick={() => acciones.onAspecto(dashboard.id, { acento: undefined })}
                            className="ss-redondo grid size-9 cursor-pointer place-items-center rounded-full text-white/60"
                            style={{ boxShadow: `inset 0 0 0 ${!acento ? 2 : 1}px rgba(255,255,255,${!acento ? ".7" : ".2"})` }}
                        >
                            <Ban className="size-3.5" aria-hidden />
                        </button>
                        {COLORES_PESTANA.map((c) => {
                            const activo = acento?.toLowerCase() === c.valor.toLowerCase();
                            return (
                                <button
                                    key={c.valor} type="button" role="radio" aria-checked={activo} aria-label={c.nombre} title={c.nombre}
                                    onClick={() => acciones.onAspecto(dashboard.id, { acento: c.valor })}
                                    className="ss-redondo grid size-9 cursor-pointer place-items-center rounded-full transition-transform duration-200 hover:scale-110 motion-reduce:hover:scale-100"
                                    style={{ background: c.valor, boxShadow: activo ? `0 0 0 2px rgba(10,12,28,1), 0 0 0 4px ${c.valor}, 0 0 16px ${c.valor}` : `0 0 10px -2px ${c.valor}88` }}
                                >
                                    {activo && <Check className="size-4 text-black/80" aria-hidden />}
                                </button>
                            );
                        })}
                    </div>
                </Seccion>

                <Seccion titulo="Orden" ayuda={`Posición ${indice + 1} de ${total}.`}>
                    <div className="flex flex-wrap gap-2">
                        <BotonHerramienta icono={MoveLeft} titulo="Mover a la izquierda" acento={TURQUESA} disabled={indice <= 0} onClick={() => acciones.onMover(dashboard.id, "izquierda")} className="w-auto flex-1" />
                        <BotonHerramienta icono={MoveRight} titulo="Mover a la derecha" acento={TURQUESA} disabled={indice >= total - 1} onClick={() => acciones.onMover(dashboard.id, "derecha")} className="w-auto flex-1" />
                    </div>
                </Seccion>
            </div>

            <div className="space-y-5">
                <Seccion titulo="Acciones">
                    <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
                        <BotonHerramienta icono={Plus} titulo="Nueva pestaña" ayuda="Un tablero nuevo, vacío o con plantilla." acento="#10B981" onClick={acciones.onNuevaPestana} />
                        <BotonHerramienta icono={Copy} titulo="Duplicar" ayuda="Copia la pestaña con todos sus widgets." acento={TURQUESA} onClick={() => acciones.onDuplicar(dashboard.id)} />
                        {acciones.onCompartir && (
                            <BotonHerramienta icono={Share2} titulo="Compartir" ayuda="Con quién y con qué permisos." acento="#007FFF" onClick={() => acciones.onCompartir?.(dashboard.id)} />
                        )}
                        <BotonHerramienta
                            icono={Star}
                            titulo={dashboard.is_default ? "Es la principal" : "Marcar como principal"}
                            ayuda="La pestaña que se abre primero."
                            acento="#FFBF00"
                            disabled={dashboard.is_default}
                            onClick={() => acciones.onPrincipal(dashboard.id)}
                        />
                        <BotonHerramienta icono={Trash2} titulo="Eliminar pestaña" ayuda="Pide confirmación antes de borrar." peligro disabled={total <= 1} onClick={() => acciones.onEliminar(dashboard.id)} />
                    </div>
                </Seccion>

                <Seccion
                    titulo="Dispositivos"
                    ayuda="Para qué pantallas es esta pestaña. Sin marcar, vale para todas."
                    accion={(
                        <button type="button" onClick={acciones.onGestorDispositivos} className="ss-redondo inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold text-white/75 cursor-pointer hover:text-white" style={pildoraFantasma("#10B981")}>
                            <MonitorSmartphone className="size-3.5" aria-hidden /> Dispositivos y sincronización
                        </button>
                    )}
                >
                    <div className="flex flex-wrap gap-1.5">
                        {DEVICE_TYPES.map((d) => {
                            const activo = d.id === "all" ? tags.length === 0 : tags.includes(d.id);
                            const Icono = d.icon;
                            return (
                                <button
                                    key={d.id} type="button" aria-pressed={activo} onClick={() => alternarDispositivo(d.id)} title={d.blurb}
                                    className={cn("ss-redondo inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold cursor-pointer transition-[background,box-shadow,color] duration-200", activo ? "text-white" : "text-white/60 hover:text-white")}
                                    style={activo ? pildoraFantasma(d.accent) : { boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }}
                                >
                                    <Icono className="size-3.5" style={{ color: d.accent }} aria-hidden /> {d.label}
                                    {currentDevice === d.id && <span className="text-[10px] font-medium text-white/45">(este)</span>}
                                </button>
                            );
                        })}
                    </div>
                </Seccion>

                <Seccion titulo="Pestañas temáticas">
                    <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
                        <BotonHerramienta
                            icono={Sparkles}
                            titulo="Restaurar pestañas temáticas"
                            ayuda={faltanTematicas > 0 ? `Vuelven ${faltanTematicas} que faltan (Política, Clima…).` : "Ya tienes todas."}
                            acento="#7C5CFF"
                            disabled={faltanTematicas === 0}
                            onClick={acciones.onRestaurarTematicas}
                        />
                        <BotonHerramienta icono={RotateCcw} titulo="Restablecer predeterminados" ayuda="Acomodo de fábrica en las temáticas; las tuyas se conservan." peligro onClick={acciones.onRestablecerPredeterminados} />
                    </div>
                </Seccion>
            </div>
        </div>
    );
}
