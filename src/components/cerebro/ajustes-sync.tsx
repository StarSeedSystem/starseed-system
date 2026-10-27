"use client";

/** Pestaña Vinculación y sincronización de los ajustes del cerebro. */
import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { APLICACION, AJUSTES_POR_DEFECTO, type AjustesObjetivo } from "@/lib/cerebros/ajustes";

interface TelepatiaVinculo {
    id: string;
    destino: { tipo: string; id: string };
    alcance: { completo: boolean; memorias: string[]; carpetas: string[]; configuraciones: string[] };
    direccion: string;
    acceso: string;
    auto: boolean;
    estado: string;
    creadoEn: string;
    ultimaSync: string | null;
}

interface AjustesSyncProps {
    valor: Pick<AjustesObjetivo, "sync">;
    onCambio: (parcial: Partial<AjustesObjetivo>) => void;
    cerebro: { config?: { memoryDestinations?: unknown; telepatia?: TelepatiaVinculo[] } };
    onAbrirTelepatia?: () => void;
}

function MarcaAplicacion({ texto }: { texto: "se-aplica" | "solo-se-guarda" }) {
    return (
        <span className={cn(
            "text-[11px] px-2 py-0.5 rounded border",
            texto === "se-aplica" 
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" 
                : "bg-amber-500/15 text-amber-300 border-amber-500/30"
        )}>
            {texto === "se-aplica" ? "Se aplica ya" : "Solo se guarda por ahora"}
        </span>
    );
}

function BotonOpcion({ 
    activo, 
    etiqueta,
    onClick,
    ariaPressed,
    disabled 
}: { 
    activo: boolean; 
    etiqueta: string;
    onClick: () => void;
    ariaPressed: boolean;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            role="button"
            aria-pressed={ariaPressed}
            aria-label={etiqueta}
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                disabled 
                    ? "opacity-50 cursor-not-allowed" 
                    : activo 
                        ? "bg-white/10 text-white border-white/20" 
                        : "text-white/70 hover:bg-white/5 hover:text-white"
            )}
        >
            {etiqueta}
        </button>
    );
}

function getMarcaSync(): "se-aplica" | "solo-se-guarda" {
    return "solo-se-guarda";
}

export function AjustesSync({ valor, onCambio, cerebro, onAbrirTelepatia }: AjustesSyncProps) {
    const sync = valor.sync ?? AJUSTES_POR_DEFECTO.sync;
    const memoryDestinations = (cerebro.config?.memoryDestinations as { 
        starseed?: { enabled: boolean }; 
        external?: { id: string; url: string; label: string }[] 
    }) ?? {};
    const telepatia = (cerebro.config?.telepatia as TelepatiaVinculo[]) ?? [];

    const handleDireccionChange = (nuevaDireccion: "enviar" | "recibir" | "ambas" | "ninguna") => {
        onCambio({ sync: { ...sync, direccion: nuevaDireccion } });
    };

    const handleAutoChange = (checked: boolean) => {
        onCambio({ sync: { ...sync, auto: checked } });
    };

    const handleDestinosChange = (destinos: string[]) => {
        onCambio({ sync: { ...sync, destinos } });
    };

    const vinculosValidos = telepatia.filter(v => v.estado === "activo" && v.destino?.id);
    const hayVinculosValidos = vinculosValidos.length > 0;

    return (
        <div className="space-y-6">
            <section className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wide">Dirección de sincronización</h3>
                    <MarcaAplicacion texto={getMarcaSync()} />
                </div>
                <p className="text-xs text-white/50">
                    Define si este cerebro/envía/recibe datos de los destinos configurados.
                </p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Dirección de sincronización">
                    <BotonOpcion
                        activo={sync.direccion === "ambas"}
                        ariaPressed={sync.direccion === "ambas"}
                        onClick={() => handleDireccionChange("ambas")}
                        etiqueta="Bidireccional"
                    />
                    <BotonOpcion
                        activo={sync.direccion === "enviar"}
                        ariaPressed={sync.direccion === "enviar"}
                        onClick={() => handleDireccionChange("enviar")}
                        etiqueta="Enviar"
                    />
                    <BotonOpcion
                        activo={sync.direccion === "recibir"}
                        ariaPressed={sync.direccion === "recibir"}
                        onClick={() => handleDireccionChange("recibir")}
                        etiqueta="Recibir"
                    />
                    <BotonOpcion
                        activo={sync.direccion === "ninguna"}
                        ariaPressed={sync.direccion === "ninguna"}
                        onClick={() => handleDireccionChange("ninguna")}
                        etiqueta="Sin sincronizar"
                    />
                </div>
            </section>

            <section className="space-y-4 pt-4 border-t border-white/10">
                <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wide">Sincronización automática</h3>
                    <MarcaAplicacion texto={getMarcaSync()} />
                </div>
                <p className="text-xs text-white/50">
                    Sincroniza automáticamente cuando cambien los datos. Intervalo configurable en ajustes de procesos.
                </p>
                <div className="flex items-center gap-3">
                    <Switch
                        checked={sync.auto}
                        onCheckedChange={handleAutoChange}
                    />
                    <Label className="text-sm text-white/90">Activar sincronización automática</Label>
                </div>
            </section>

            <section className="space-y-4 pt-4 border-t border-white/10">
                <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wide">Destinos de sincronización</h3>
                    <MarcaAplicacion texto={getMarcaSync()} />
                </div>
                <p className="text-xs text-white/50">
                    Qué servidores reciben los datos al sincronizar. Se usa junto con la dirección seleccionada arriba.
                </p>
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <BotonOpcion
                            activo={sync.destinos?.includes("local") ?? false}
                            ariaPressed={sync.destinos?.includes("local") ?? false}
                            onClick={() => handleDestinosChange(
                                sync.destinos?.includes("local") 
                                    ? (sync.destinos ?? []).filter(d => d !== "local")
                                    : [...(sync.destinos ?? []), "local"]
                            )}
                            etiqueta="Este aparato"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <BotonOpcion
                            activo={sync.destinos?.includes("starseed") ?? false}
                            ariaPressed={sync.destinos?.includes("starseed") ?? false}
                            onClick={() => handleDestinosChange(
                                sync.destinos?.includes("starseed") 
                                    ? (sync.destinos ?? []).filter(d => d !== "starseed")
                                    : [...(sync.destinos ?? []), "starseed"]
                            )}
                            disabled={!memoryDestinations.starseed?.enabled}
                            etiqueta={`StarSeed · ${memoryDestinations.starseed?.enabled ? "encendido" : "apagado"}`}
                        />
                    </div>
                    {memoryDestinations.external?.map((ext) => (
                        <div key={ext.id} className="flex items-center gap-2">
                            <BotonOpcion
                                activo={sync.destinos?.includes(ext.id) ?? false}
                                ariaPressed={sync.destinos?.includes(ext.id) ?? false}
                                onClick={() => handleDestinosChange(
                                    sync.destinos?.includes(ext.id) 
                                        ? (sync.destinos ?? []).filter(d => d !== ext.id)
                                        : [...(sync.destinos ?? []), ext.id]
                                )}
                                etiqueta={ext.label}
                            />
                        </div>
                    ))}
                    {(!memoryDestinations.external || memoryDestinations.external.length === 0) && (
                        <div className="text-white/40 text-xs">Ningún servidor externo configurado.</div>
                    )}
                    <div className="text-xs text-white/50" id="elegidos-text">
                        {`Elegidos: ${sync.destinos?.length ?? 0} · ${sync.destinos?.join(", ") || "Ninguno elegido."}`}
                    </div>
                </div>
            </section>

            <section className="space-y-4 pt-4 border-t border-white/10">
                <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wide">Telepatía</h3>
                </div>
                <p className="text-xs text-white/50">
                    Vínculos activos que sincronizan memorias, carpetas y configuraciones con otros cerebros, grupos o cuentas.
                </p>
                <div className="space-y-2">
                    <p className="text-sm text-white/90">
                        {vinculosValidos.length} vínculo{vinculosValidos.length !== 1 ? "s" : ""}
                    </p>
                    {vinculosValidos.map((v) => (
                        <div key={v.id} className="pl-4 border-l border-white/10 space-y-1">
                            <p className="text-xs font-medium text-white/80">
                                {v.destino.tipo.charAt(0).toUpperCase() + v.destino.tipo.slice(1)} · {v.destino.id}
                            </p>
                            <p className="text-xs text-white/50 whitespace-nowrap">
                                {v.acceso === "leer" ? "Solo lectura" : "Lectura y escritura"} · 
                                {v.auto ? "auto" : "manual"} · 
                                {v.alcance.memorias.length} memorias, {v.alcance.carpetas.length} carpetas, {v.alcance.configuraciones.length} configuraciones · 
                                última sincronización: {v.ultimaSync ? new Date(v.ultimaSync).toLocaleString() : "sin medida"}
                            </p>
                        </div>
                    ))}
                    {!hayVinculosValidos && (
                        <p className="text-white/50 text-xs">Este cerebro no tiene vínculos de Telepatía.</p>
                    )}
                    {onAbrirTelepatia && hayVinculosValidos && (
                        <Button variant="outline" size="sm" onClick={onAbrirTelepatia}>
                            Abrir Telepatía
                        </Button>
                    )}
                </div>
            </section>
        </div>
    );
}