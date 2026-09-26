"use client";

/**
 * PanelCapas — interruptor maestro del modo Astraura 1.58, un interruptor por capa de
 * conciencia (local · mesh · nube · colectiva), el nivelador de uso preferencial y el
 * modelo específico (Ola 365 · CC4). Todo lo lee y lo guarda `useEstadoCapas`, que ya
 * se sincroniza con la cuenta: por defecto, todo encendido.
 */

import { useEffect, useMemo, useState } from "react";
import { Cloud, Cpu, Layers, RadioTower, Sparkles, Users, type LucideIcon } from "lucide-react";

import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { getUnifiedCatalog } from "@/ai/astraura/unified-intelligence";
import { CAPAS, destinoNivelador, ETIQUETA_CAPA, ETIQUETA_ESTADO, type CapaConciencia, type EstadoCapa } from "@/lib/astraura/capas-conciencia";
import { useEstadoCapas } from "@/lib/astraura/use-estado-capas";
import { cn } from "@/lib/utils";

export const COLOR_ESTADO: Record<EstadoCapa, string> = {
    sincronizada: "#39FF14",
    activa: "#007FFF",
    "sin-senal": "#FFBF00",
    apagada: "rgba(255,255,255,0.22)",
};

const ICONO_CAPA: Record<CapaConciencia, LucideIcon> = { local: Cpu, mesh: RadioTower, nube: Cloud, colectiva: Users };

const DESTINOS = [
    { id: "enrutador", texto: "Enrutador libre" },
    { id: "especifico", texto: "Modelo específico" },
    { id: "capas", texto: "Capas 1.58" },
] as const;

/** Punto de color del estado de una capa (verde con halo cuando está sincronizada con el chat). */
export function PuntoEstado({ estado, className }: { estado: EstadoCapa; className?: string }) {
    const color = COLOR_ESTADO[estado];
    return (
        <span
            data-estado={estado}
            aria-hidden="true"
            className={cn("inline-block h-2 w-2 shrink-0 rounded-full transition-colors duration-200", className)}
            style={{ backgroundColor: color, boxShadow: estado === "sincronizada" ? `0 0 6px 1px ${color}` : undefined }}
        />
    );
}

export function PanelCapas({ compacto = false }: { compacto?: boolean }) {
    const { preferencia, estados, cambiar, cambiarCapa } = useEstadoCapas();
    const maestro = preferencia.activo;

    // Mientras se arrastra el nivelador solo cambia la vista; se guarda al soltar (una
    // escritura y una subida a la cuenta, no una por píxel).
    const [nivel, setNivel] = useState(preferencia.nivelador);
    useEffect(() => setNivel(preferencia.nivelador), [preferencia.nivelador]);
    const destino = destinoNivelador(nivel);

    const fuentes = useMemo(() => {
        if (destino !== "especifico") return [];
        try {
            return getUnifiedCatalog().filter((f) => f.tier !== "paid" && f.models.length > 0);
        } catch {
            return [];
        }
    }, [destino]);
    const valorEspecifico = preferencia.especifico ? `${preferencia.especifico.fuente}::${preferencia.especifico.modelo ?? ""}` : "";

    return (
        <div className={cn("flex flex-col text-white", compacto ? "gap-2.5" : "gap-4")} data-testid="panel-capas">
            <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <Layers className="h-4 w-4 shrink-0 text-[#007FFF]" />
                    <span className={cn("truncate font-medium tracking-wide", compacto ? "text-xs" : "text-sm")}>Astraura 1.58 · capas de conciencia</span>
                </div>
                <Switch aria-label="Modo Astraura 1.58" checked={maestro} onCheckedChange={(on) => cambiar({ activo: on })} />
            </div>

            <ul className={cn("flex flex-col", compacto ? "gap-1.5" : "gap-2")}>
                {CAPAS.map((capa) => {
                    const Icono = ICONO_CAPA[capa];
                    const { nombre, descripcion } = ETIQUETA_CAPA[capa];
                    return (
                        <li
                            key={capa}
                            className={cn(
                                "flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] transition-opacity duration-200",
                                compacto ? "px-2 py-1.5" : "px-3 py-2",
                                !maestro && "opacity-60",
                            )}
                        >
                            <PuntoEstado estado={estados[capa]} />
                            <Icono className="h-3.5 w-3.5 shrink-0 text-white/60" />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-2">
                                    <span className="text-xs font-medium">{nombre}</span>
                                    <span className="truncate text-[10px] text-white/45">{ETIQUETA_ESTADO[estados[capa]]}</span>
                                </div>
                                {!compacto && <p className="truncate text-[11px] text-white/50">{descripcion}</p>}
                            </div>
                            <Switch
                                aria-label={`Capa ${nombre}`}
                                className="scale-90"
                                disabled={!maestro}
                                checked={preferencia.capas[capa]}
                                onCheckedChange={(on) => cambiarCapa(capa, on)}
                            />
                        </li>
                    );
                })}
            </ul>

            <div className={cn("flex flex-col gap-2", !maestro && "opacity-60")}>
                <span className="text-[11px] text-white/60">Uso preferencial</span>
                <Slider
                    aria-label="Nivelador de uso preferencial"
                    min={0}
                    max={100}
                    step={1}
                    disabled={!maestro}
                    value={[nivel]}
                    onValueChange={(v) => setNivel(v[0] ?? nivel)}
                    onValueCommit={(v) => cambiar({ nivelador: v[0] ?? nivel })}
                    getAriaValueText={(v) => DESTINOS.find((d) => d.id === destinoNivelador(v))?.texto ?? String(v)}
                />
                <div className="flex justify-between text-[10px]">
                    {DESTINOS.map((d) => (
                        <span key={d.id} data-activo={d.id === destino} className={cn("transition-colors duration-200", d.id === destino ? "font-medium text-[#39FF14]" : "text-white/40")}>
                            {d.texto}
                        </span>
                    ))}
                </div>
                {maestro && destino === "especifico" && (
                    <select
                        aria-label="Modelo específico"
                        className="cursor-pointer rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white transition-colors duration-200 hover:border-[#007FFF]/60 focus:border-[#007FFF] focus:outline-none"
                        value={valorEspecifico}
                        onChange={(e) => {
                            const [fuente, modelo] = e.target.value.split("::");
                            cambiar({ especifico: fuente ? { fuente, modelo: modelo || undefined } : null });
                        }}
                    >
                        <option value="">Elige una API o modelo gratuito…</option>
                        {fuentes.map((f) => (
                            <optgroup key={f.id} label={f.label}>
                                {f.models.map((m) => (
                                    <option key={`${f.id}::${m.id}`} value={`${f.id}::${m.id}`}>
                                        {m.label}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                )}
            </div>

            {!maestro && <p className="text-[11px] text-white/60">Se usa el enrutador automático con las APIs y modelos gratuitos de la red (los mismos del enjambre).</p>}
            <p className="flex items-center gap-1.5 text-[10px] text-white/40">
                <Sparkles className="h-3 w-3 shrink-0" /> Aprendizaje continuo: la capa colectiva se unirá a Oracle próximamente.
            </p>
        </div>
    );
}
