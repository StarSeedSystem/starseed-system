"use client";

/*
 * MiGenesis — el Genesis de cada persona (2026-10-10): cambia TU cuenta (perfil, páginas,
 * apariencia, dock, tableros y agentes) hablando con un agente de modelos gratuitos o con los
 * atajos, siempre con vista previa, confirmación y deshacer. No toca el código del OS (eso es
 * MetaGenesis). SOP: architecture/genesis-personas-poligenesis.md
 */

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { ListTree, ShieldCheck } from "lucide-react";
import { useAppearance } from "@/context/appearance-context";
import { puertosDelOs, contextoDeMiCuenta } from "@/lib/genesis/puertos-os";
import type { Ambito } from "@/lib/genesis/operaciones";
import { PanelOperaciones } from "./panel-operaciones";
import { AtajosGenesis } from "./atajos-genesis";
import { almacenNavegador, cargarEncargos, type RegistroEncargo } from "@/lib/protogenesis/almacen-encargos";
import { decidirResultado, propuestaMetaGenesis, faltaDePlan, type Falta } from "@/lib/protogenesis/decision";

const AMBITO: Ambito = { tipo: "persona" };

// Panel de bots (contrato astraaura-bots §13/§18 F1: vive en Genesis). Dinámico:
// el layout raíz no carga nada pesado de forma estática.
const SeccionBotsGenesis = dynamic(
    () => import("./seccion-bots").then((m) => m.SeccionBotsGenesis),
    { ssr: false },
);

// El panel de cada encargo se carga al abrirlo: Mi Genesis no arrastra su peso.
const PanelProtoGenesis = dynamic(
    () => import("@/components/protogenesis/panel-protogenesis").then((m) => m.PanelProtoGenesis),
    { ssr: false },
);

const SUGERENCIAS = [
    "Pon Decisiones en mi dock",
    "Cambia mi biografía por: tejedora de comunidades",
    "Añade el widget Ágora Causal a mi tablero principal",
    "Crea un agente privado que me resuma las propuestas abiertas",
    "Haz la letra un poco más grande",
];

export function MiGenesis() {
    const { rawConfig, updateConfig, bgScopeMode } = useAppearance();
    const configRef = useRef(rawConfig);
    configRef.current = rawConfig;
    const actualizarRef = useRef(updateConfig);
    actualizarRef.current = updateConfig;

    const puertos = useMemo(
        () =>
            puertosDelOs({
                leer: () => configRef.current,
                escribir: (parche) => actualizarRef.current(parche as Parameters<typeof updateConfig>[0]),
                ambitoFondo: bgScopeMode,
            }),
        // updateConfig y rawConfig van por referencia (refs): solo el ámbito del fondo rehace los puertos.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [bgScopeMode],
    );

    const cargarContexto = useCallback(() => contextoDeMiCuenta(), []);
    const [encargos, setEncargos] = useState<RegistroEncargo[] | null>(null);
    const [abierto, setAbierto] = useState<string | null>(null);

    useEffect(() => {
        const almacen = almacenNavegador();
        if (almacen) {
            const lista = cargarEncargos(almacen); // Without moleculaId, we get all, but we want to limit per molecule? The function already limits to 50 per molecule internally.
            // Aquí solo manda Genesis: los ámbitos grupo/pública los decide su entidad en PoliGenesis (§2.7).
            setEncargos(lista.filter((r) => r.encargo.ambito === "personal" || r.encargo.ambito === "perfil"));
        } else {
            setEncargos([]); // No access to storage
        }
    }, []);

    const decisionPara = useCallback((r: RegistroEncargo): { modo: string; motivo: string; borrador: { id: string; titulo: string } | null } => {
        const falta: Falta | null = faltaDePlan(r.plan);
        const d = decidirResultado({
            ambito: r.encargo.ambito,
            esDueno: true, // en Mi Genesis solo se enseñan los encargos de la propia cuenta
            tocaFueraDeLaMolecula: falta !== null,
        });
        return { modo: d.modo, motivo: d.motivo, borrador: falta ? propuestaMetaGenesis(r.encargo, falta) : null };
    }, []);

    return (
        <section className="space-y-4" data-testid="mi-genesis">
            <div className="flex items-start gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.05] p-3 text-xs text-white/70">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
                <p>
                    Genesis cambia tu cuenta con operaciones de una lista cerrada: nunca ejecuta código. Ajustes, tu perfil, la Biblioteca y el deshacer
                    siempre siguen a tu alcance.
                </p>
            </div>
            <PanelOperaciones
                ambito={AMBITO}
                modo="aplicar"
                motivoModo="Se aplican en tu cuenta cuando confirmas."
                puertos={puertos}
                cargarContexto={cargarContexto}
                sugerencias={SUGERENCIAS}
                atajos={(anadir, ctx) => <AtajosGenesis anadir={anadir} ctx={ctx} />}
            />
            <section id="bots" aria-label="Mis bots">
                <h2 className="text-base font-semibold">Mis bots</h2>
                <SeccionBotsGenesis />
            </section>
            <section id="protoGenesis-encargos" aria-label="Encargos de ProtoGenesis" className="space-y-1.5">
                <h2 className="text-base font-semibold">ProtoGenesis de mis moléculas</h2>
                <p className="text-[11px] text-white/60">
                    La génesis de cada creación: un director, varios agentes a la vez y tu decisión al final.
                </p>
                {encargos === null ? (
                    <p className="text-[11px] text-white/50">Cargando encargos…</p>
                ) : encargos.length === 0 ? (
                    <p className="text-[11px] text-white/60">
                        Aún no tienes encargos. Crea uno desde el panel de ProtoGenesis.
                    </p>
                ) : (
                    <ul className="space-y-1">
                    {encargos.map((registro) => {
                        const decision = decisionPara(registro);
                        const activo = abierto === registro.encargo.id;
                        return (
                            <li key={registro.encargo.id} className="space-y-1">
                                <button
                                    type="button"
                                    aria-expanded={activo}
                                    onClick={() => setAbierto(activo ? null : registro.encargo.id)}
                                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-left text-xs text-white/80 transition-colors duration-200 hover:bg-black/30"
                                >
                                    <div className="flex-1">
                                        <span className="block truncate">{registro.encargo.intencion}</span>
                                        {registro.plan ? (
                                            <span className="text-[10px] text-white/45">Con plan: {registro.plan.pasos.length} pasos</span>
                                        ) : (
                                            <span className="text-[10px] text-white/45">Sin plan</span>
                                        )}
                                        {/* La decisión del resultado (§2.7 del contrato): quién acepta y por qué. */}
                                        <span className="block truncate text-[10px] text-emerald-200/70">{decision.motivo}</span>
                                        {decision.modo === "proponer-metagenesis" && decision.borrador ? (
                                            <span className="block truncate text-[10px] text-amber-200/80">
                                                Borrador para MetaGenesis: {decision.borrador.id} — {decision.borrador.titulo}
                                            </span>
                                        ) : null}
                                    </div>
                                    <span className="flex shrink-0 items-center gap-1 text-[10px] text-emerald-200/80">
                                        <ListTree className="h-3.5 w-3.5" aria-hidden /> {activo ? "Cerrar panel" : "Abrir panel"}
                                    </span>
                                </button>
                                {activo ? (
                                    <PanelProtoGenesis
                                        moleculaId={registro.encargo.moleculaId}
                                        ambito="personal"
                                        esDueno
                                        plan={registro.plan}
                                        estados={registro.estados}
                                        asignaciones={registro.asignaciones}
                                        tocaFueraDeLaMolecula={decision.borrador !== null}
                                    />
                                ) : null}
                            </li>
                        );
                    })}
                    </ul>
                )}
            </section>
        </section>
    );
}
