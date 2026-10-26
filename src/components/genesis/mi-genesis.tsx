"use client";

/*
 * MiGenesis — el Genesis de cada persona (2026-10-10): cambia TU cuenta (perfil, páginas,
 * apariencia, dock, tableros y agentes) hablando con un agente de modelos gratuitos o con los
 * atajos, siempre con vista previa, confirmación y deshacer. No toca el código del OS (eso es
 * MetaGenesis). SOP: architecture/genesis-personas-poligenesis.md
 */

import { useCallback, useMemo, useRef, useState, useEffect, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { ShieldCheck } from "lucide-react";
import { useAppearance } from "@/context/appearance-context";
import { puertosDelOs, contextoDeMiCuenta } from "@/lib/genesis/puertos-os";
import type { Ambito } from "@/lib/genesis/operaciones";
import { PanelOperaciones } from "./panel-operaciones";
import { AtajosGenesis } from "./atajos-genesis";
import { PanelProtoGenesis, type PanelProtoGenesisProps } from "@/components/protogenesis/panel-protogenesis";
import { almacenNavegador, cargarEncargos, type RegistroEncargo } from "@/lib/protogenesis/almacen-encargos";
import { decidirResultado, propuestaMetaGenesis, faltaDePlan, type Falta } from "@/lib/protogenesis/decision";

const AMBITO: Ambito = { tipo: "persona" };

// Panel de bots (contrato astraaura-bots §13/§18 F1: vive en Genesis). Dinámico:
// el layout raíz no carga nada pesado de forma estática.
const SeccionBotsGenesis = dynamic(
    () => import("./seccion-bots").then((m) => m.SeccionBotsGenesis),
    { ssr: false },
);

const SUGERENCIAS = [
    "Pon Decisiones en mi dock",
    "Cambia mi biografía por: tejedora de comunidades",
    "Añade el widget Ágora Causal a mi tablero principal",
    "Crea un agente privado que me resuma las propuestas abiertas",
    "Haz la letra un poco más grande",
];

/** Decisión calculada fuera (src/lib/protogenesis/decision): quién acepta el resultado. */
export type DecisionEncargo = {
    modo: string;
    motivo: string;
    borrador: { id: string; titulo: string } | null;
};

export interface SeccionProtoGenesisProps {
    titulo: string;
    encargos: RegistroEncargo[] | null;
    decisionPara: (r: RegistroEncargo) => DecisionEncargo;
    /** Qué contexto recibe el panel al abrir un encargo (ámbito, rol, gobierno). */
    panelProps: (r: RegistroEncargo) => PanelProtoGenesisProps;
    testid: string;
    /** Acento por contexto: identidad gráfica de cada Genesis. */
    tono?: "emerald" | "cyan";
    /** Piezas propias del contexto (por ejemplo, el enlace a Gobernanza en PoliGenesis). */
    extra?: ReactNode;
}

const EXPLICACION = "La génesis de cada creación: un director, varios agentes a la vez y tu decisión al final.";
const TONO_DECISION: Record<NonNullable<SeccionProtoGenesisProps["tono"]>, string> = {
    emerald: "text-emerald-200/70",
    cyan: "text-cyan-200/70",
};

/*
 * SeccionProtoGenesis (PG1013I) — la sección que comparten Mi Genesis y PoliGenesis:
 * explica en una línea qué es, lista los encargos guardados y al tocar uno abre su
 * PanelProtoGenesis con el contexto que toque (ámbito personal + esDueno en Mi Genesis;
 * rol y modo de gobierno en PoliGenesis). No duplica reglas ni decisiones: vienen de
 * src/lib/protogenesis/{decision,almacen-encargos}. Contrato: architecture/protogenesis.md §2·§6.
 */
export function SeccionProtoGenesis({ titulo, encargos, decisionPara, panelProps, testid, tono = "emerald", extra }: SeccionProtoGenesisProps) {
    const [abiertoId, setAbiertoId] = useState<string | null>(null);
    const abierto = encargos?.find((r) => r.encargo.id === abiertoId) ?? null;
    return (
        <section id="protoGenesis-encargos" aria-label="Encargos de ProtoGenesis" data-testid={testid}>
            <h2 className="text-base font-semibold">{titulo}</h2>
            <p className="text-[11px] text-white/55">{EXPLICACION}</p>
            {extra}
            {encargos === null ? (
                <p className="text-[11px] text-white/50">Cargando encargos…</p>
            ) : encargos.length === 0 ? (
                <p className="text-[11px] text-white/60">Aún no hay encargos: se encargan desde un panel ProtoGenesis.</p>
            ) : (
                <>
                    <ul className="space-y-1">
                        {encargos.map((registro) => {
                            const decision = decisionPara(registro);
                            return (
                                <li key={registro.encargo.id}>
                                    <button
                                        type="button"
                                        aria-expanded={abiertoId === registro.encargo.id}
                                        onClick={() => setAbiertoId(abiertoId === registro.encargo.id ? null : registro.encargo.id)}
                                        className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-left text-xs text-white/80 transition-colors duration-200 hover:bg-black/30"
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate">{registro.encargo.intencion}</span>
                                            <span className="text-[10px] text-white/45">
                                                {registro.plan ? `Con plan: ${registro.plan.pasos.length} pasos` : "Sin plan"}
                                            </span>
                                            <span className={`block truncate text-[10px] ${TONO_DECISION[tono]}`}>{decision.motivo}</span>
                                            {decision.modo === "proponer-metagenesis" && decision.borrador ? (
                                                <span className="block truncate text-[10px] text-amber-200/80">
                                                    Borrador para MetaGenesis: {decision.borrador.id} — {decision.borrador.titulo}
                                                </span>
                                            ) : null}
                                        </span>
                                        <span className="text-[10px] text-white/45">
                                            {registro.actualizadoEn ? new Date(registro.actualizadoEn).toLocaleString() : ""}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    {abierto ? <PanelProtoGenesis key={abierto.encargo.id} {...panelProps(abierto)} /> : null}
                </>
            )}
        </section>
    );
}

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
    const almacen = useMemo(() => almacenNavegador(), []);

    useEffect(() => {
        if (almacen) {
            const lista = cargarEncargos(almacen); // Without moleculaId, we get all, but we want to limit per molecule? The function already limits to 50 per molecule internally.
            // Aquí solo manda Genesis: los ámbitos grupo/pública los decide su entidad en PoliGenesis (§2.7).
            setEncargos(lista.filter((r) => r.encargo.ambito === "personal" || r.encargo.ambito === "perfil"));
        } else {
            setEncargos([]); // No access to storage
        }
    }, [almacen]);

    const decisionPara = useCallback((r: RegistroEncargo): DecisionEncargo => {
        const falta: Falta | null = faltaDePlan(r.plan);
        const d = decidirResultado({
            ambito: r.encargo.ambito,
            esDueno: true, // en Mi Genesis solo se enseñan los encargos de la propia cuenta
            tocaFueraDeLaMolecula: falta !== null,
        });
        return { modo: d.modo, motivo: d.motivo, borrador: falta ? propuestaMetaGenesis(r.encargo, falta) : null };
    }, []);

    // Un acceso a abrir el PanelProtoGenesis de cada encargo: ámbito personal, manda la persona (PG1013I).
    const panelDeEncargo = useCallback(
        (r: RegistroEncargo): PanelProtoGenesisProps => ({
            moleculaId: r.encargo.moleculaId,
            ambito: r.encargo.ambito,
            esDueno: true,
            plan: r.plan,
            estados: r.estados,
            asignaciones: r.asignaciones,
            almacen,
        }),
        [almacen],
    );

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
            <SeccionProtoGenesis
                titulo="ProtoGenesis de mis moléculas"
                encargos={encargos}
                decisionPara={decisionPara}
                panelProps={panelDeEncargo}
                testid="protogenesis-mi-genesis"
            />
        </section>
    );
}
