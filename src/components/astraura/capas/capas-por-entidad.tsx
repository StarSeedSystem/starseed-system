"use client";

/**
 * CapasPorEntidad — ajustes «Por personalidad y agente» del panel de capas
 * (Ola 1003 · architecture/astraura-158-sistema-primario.md §19). Cada capa
 * puede anularse para una personalidad o un agente concreto; lo que no se
 * fija sigue el ajuste de la cuenta (por defecto, todo encendido).
 */

import { useMemo, useState } from "react";

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getUserContextSettings } from "@/ai/astraura/user-context";
import { listAgents } from "@/lib/agents/store";
import { CAMPOS_CAPA, ETIQUETA_CAMPO, capasDeCuenta, resolverCapasEntidad, type AmbitoCapas, type CampoCapa } from "@/lib/astraura/capas-entidad";
import { preferenciaCapasGuardada } from "@/lib/astraura/capas-conciencia";
import { fijarCapaGuardada, useAjustesCapasEntidad } from "@/lib/astraura/use-capas-entidad";
import { listPersonalityProfiles } from "@/lib/aurora/personalities";
import { cn } from "@/lib/utils";

interface Entidad {
    ambito: AmbitoCapas;
    id: string;
    nombre: string;
}

function listaSegura(leer: () => { id: string; name: string }[], ambito: AmbitoCapas): Entidad[] {
    try {
        return leer().map((e) => ({ ambito, id: e.id, nombre: e.name }));
    } catch {
        return [];
    }
}

export function CapasPorEntidad({ compacto = false }: { compacto?: boolean }) {
    const ajustes = useAjustesCapasEntidad();
    const entidades = useMemo(
        () => [...listaSegura(listPersonalityProfiles, "personalidad"), ...listaSegura(listAgents, "agente")],
        [],
    );
    const [clave, setClave] = useState<string | null>(null);
    const elegida = entidades.find((e) => `${e.ambito}:${e.id}` === clave) ?? entidades[0] ?? null;

    const cuenta = capasDeCuenta(preferenciaCapasGuardada(), getUserContextSettings().enabled);
    const resuelto = useMemo(
        () =>
            elegida
                ? resolverCapasEntidad(cuenta, ajustes, elegida.ambito === "personalidad" ? { personalidadId: elegida.id } : { agenteId: elegida.id })
                : null,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [ajustes, elegida?.ambito, elegida?.id],
    );

    if (entidades.length === 0) {
        return <p className="text-[11px] text-white/55">Aún no hay personalidades ni agentes propios.</p>;
    }
    const overrides = elegida ? (elegida.ambito === "personalidad" ? ajustes.personalidades[elegida.id] : ajustes.agentes[elegida.id]) ?? {} : {};

    const seccion = (ambito: AmbitoCapas, titulo: string) => {
        const lista = entidades.filter((e) => e.ambito === ambito);
        if (lista.length === 0) return null;
        return (
            <SelectGroup>
                <SelectLabel>{titulo}</SelectLabel>
                {lista.map((e) => (
                    <SelectItem key={`${e.ambito}:${e.id}`} value={`${e.ambito}:${e.id}`} className="cursor-pointer">
                        {e.nombre}
                    </SelectItem>
                ))}
            </SelectGroup>
        );
    };

    return (
        <div className={cn("flex flex-col", compacto ? "gap-2" : "gap-3")} data-testid="capas-por-entidad">
            <Select value={elegida ? `${elegida.ambito}:${elegida.id}` : ""} onValueChange={setClave}>
                <SelectTrigger aria-label="Elegir personalidad o agente" className="min-h-11 cursor-pointer border-white/15 bg-black/40 text-xs transition-colors duration-200 hover:border-[#007FFF]/60">
                    <SelectValue placeholder="Elige a quién ajustar…" />
                </SelectTrigger>
                <SelectContent>
                    {seccion("personalidad", "Personalidades")}
                    {seccion("agente", "Agentes")}
                </SelectContent>
            </Select>

            {elegida && resuelto && (
                <ul className="flex flex-col gap-1.5">
                    {CAMPOS_CAPA.map((campo: CampoCapa) => {
                        const propio = overrides[campo];
                        const modo = propio === undefined ? "auto" : propio ? "on" : "off";
                        const heredado = resuelto.procedencia[campo] === "cuenta" ? cuenta[campo] : resuelto.efectivas[campo];
                        const opciones: { id: string; texto: string; valor: boolean | null }[] = [
                            { id: "auto", texto: `Auto (hereda: ${heredado ? "Encendida" : "Apagada"})`, valor: null },
                            { id: "on", texto: "Encendida", valor: true },
                            { id: "off", texto: "Apagada", valor: false },
                        ];
                        return (
                            <li key={campo} data-testid={`campo-${campo}`} className="flex flex-col gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                                <p className="text-xs leading-snug">
                                    <span className="font-medium">{ETIQUETA_CAMPO[campo].nombre}</span>{" "}
                                    <span className="text-white/50">{ETIQUETA_CAMPO[campo].descripcion}</span>
                                </p>
                                <div role="group" aria-label={`Ajuste de ${ETIQUETA_CAMPO[campo].nombre}`} className="flex flex-wrap gap-1.5">
                                    {opciones.map((op) => (
                                        <button
                                            key={op.id}
                                            type="button"
                                            aria-pressed={modo === op.id}
                                            onClick={() => fijarCapaGuardada(elegida.ambito, elegida.id, campo, op.valor)}
                                            className={cn(
                                                "ss-redondo min-h-11 cursor-pointer border px-3 text-[11px] transition-colors duration-150",
                                                modo === op.id ? "border-[#007FFF] bg-[#007FFF]/20 text-white" : "border-white/15 text-white/60 hover:border-white/40 hover:text-white",
                                            )}
                                        >
                                            {op.texto}
                                        </button>
                                    ))}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {elegida && (
                <button
                    type="button"
                    onClick={() => {
                        for (const c of CAMPOS_CAPA) fijarCapaGuardada(elegida.ambito, elegida.id, c, null);
                    }}
                    className="ss-redondo min-h-11 cursor-pointer self-start border border-white/15 px-4 text-[11px] text-white/70 transition-colors duration-150 hover:border-[#007FFF]/60 hover:text-white"
                >
                    Volver a auto en todo
                </button>
            )}
            <p className="text-[10px] text-white/45">Todo está encendido por defecto: lo que no fijes aquí sigue el ajuste de tu cuenta.</p>
        </div>
    );
}
