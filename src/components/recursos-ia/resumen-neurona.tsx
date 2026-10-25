"use client";

/**
 * ResumenRecursosNeurona — tarjeta compacta de «Recursos de IA» para el panel de cada neurona:
 * procesador principal, libre en disco, topología actual, la oferta de esta neurona a la malla
 * (`ofertaDesdeAsignaciones`) y el mejor modelo de texto y de voz sugerido aquí.
 * Enlaza al panel completo (`/agent?tab=recursos-ia`).
 */

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Cpu, HardDrive, Layers, Loader2, MessageSquare, Network, Share2, Volume2 } from "lucide-react";

import { CARD, LABEL } from "@/components/astraura/s158/shared";
import { cn } from "@/lib/utils";
import { claveAlcance } from "@/lib/recursos-ia/asignaciones";
import { catalogoRecursos } from "@/lib/recursos-ia/catalogo";
import { ofertaDesdeAsignaciones, PUERTO_SERVIDOR_IA } from "@/lib/recursos-ia/oferta-desde-asignaciones";
import { sugerirPlan, topologiaSugerida } from "@/lib/recursos-ia/sugerencias";
import { NOMBRE_TOPOLOGIA, type Procesador, type Sugerencia } from "@/lib/recursos-ia/tipos";
import { useRecursosIa } from "@/lib/recursos-ia/use-recursos-ia";
import type { OfertaNeurona } from "@/lib/recursos/oferta";
import { ALCANCE_PROPIO, BitsBadge, FOCO, Linea, NivelBadge, fmtGb, fmtLibre, seguro, useInventarioRecursos } from "./piezas";

const PESO_TIPO: Record<Procesador["tipo"], number> = { gpu: 4, npu: 3, cpu: 2, webgpu: 1, servidor: 0 };

/** La oferta de esta neurona en una línea: qué modelos sirve, su servidor propio y a quién presta. */
function textoOferta(o: OfertaNeurona): string {
    const modelos = o.apps.filter((a) => a.id !== "servidor-ia").length;
    const partes = [modelos > 0 ? `sirve ${modelos} ${modelos === 1 ? "modelo" : "modelos"}` : "sin modelos servidos aún"];
    if (o.apps.some((a) => a.id === "servidor-ia")) partes.push(`su servidor propio de IA escucha en el puerto ${PUERTO_SERVIDOR_IA}`);
    const aQuien: string[] = [];
    if (o.presta.cuenta) aQuien.push("a tu cuenta");
    for (const g of o.presta.grupos) aQuien.push(`al grupo o comunidad ${g}`);
    if (o.presta.publico) aQuien.push("a la malla pública (elegido a propósito)");
    partes.push(aQuien.length ? `presta ${aQuien.join(", ")}` : "no presta a nadie");
    return partes.join(" · ");
}

/** El procesador que más IA puede llevar en esta neurona. */
export function procesadorPrincipal(ps: Procesador[]): Procesador | undefined {
    return [...ps].sort((a, b) => (b.ramGb ?? 0) + (b.vramGb ?? 0) - ((a.ramGb ?? 0) + (a.vramGb ?? 0)) || PESO_TIPO[b.tipo] - PESO_TIPO[a.tipo])[0];
}

function Fila({ icono: Icono, etiqueta, children }: { icono: typeof Cpu; etiqueta: string; children: ReactNode }) {
    return (
        <div className="flex min-w-0 items-start gap-2">
            <Icono className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/55" aria-hidden="true" />
            <div className="min-w-0 flex-1">
                <p className={LABEL}>{etiqueta}</p>
                <div className="min-w-0 text-[11px] text-white/85">{children}</div>
            </div>
        </div>
    );
}

function Modelo({ s }: { s?: Sugerencia }) {
    if (!s) return <span className="text-white/50">sin sugerencia todavía</span>;
    return (
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Linea className="min-w-0 max-w-full">{s.modelo.nombre}</Linea>
            <BitsBadge bits={s.modelo.bits} />
            <NivelBadge nivel={s.compat.nivel} />
        </span>
    );
}

export function ResumenRecursosNeurona() {
    const [estado] = useRecursosIa();
    const { inv, detectando } = useInventarioRecursos(estado.almacenesDeclarados);
    const catalogo = useMemo(() => seguro(() => catalogoRecursos(), []), []);
    const guardada = estado.topologias[claveAlcance(ALCANCE_PROPIO)];
    const oferta = useMemo(
        () => (inv ? seguro(() => ofertaDesdeAsignaciones(inv, estado), null) : null),
        [inv, estado],
    );
    const plan = useMemo(
        () =>
            inv
                ? seguro(
                      () => sugerirPlan(inv, catalogo, { capacidades: ["texto", "voz-tts"], alcance: ALCANCE_PROPIO, topologia: guardada, tamanosConfirmados: estado.tamanosConfirmados, instalados: inv.modelosInstalados }),
                      null,
                  )
                : null,
        [inv, catalogo, guardada, estado.tamanosConfirmados],
    );
    const sugerida = useMemo(() => (inv ? seguro(() => topologiaSugerida(inv, ALCANCE_PROPIO), null) : null), [inv]);
    const esta = inv?.neuronas.find((n) => n.esEsta) ?? inv?.neuronas[0];
    const proc = esta ? procesadorPrincipal(esta.procesadores) : undefined;
    const disco = esta?.almacenes.find((a) => a.tipo === "neurona-local") ?? esta?.almacenes[0];
    const topo = guardada?.topologia ?? plan?.topologia.topologia ?? sugerida?.topologia;

    return (
        <section aria-label="Recursos de IA de esta neurona" className={cn(CARD, "flex min-w-0 flex-col gap-2.5 p-3")} data-testid="resumen-recursos-ia">
            <p className="flex items-center gap-2 text-[12px] font-semibold text-white/90">
                <Network className="h-3.5 w-3.5 shrink-0 text-[#007FFF]" aria-hidden="true" /> Recursos de IA
                {detectando && <Loader2 className="h-3 w-3 animate-spin text-white/50" aria-label="detectando" />}
            </p>
            {!inv ? (
                <p className="text-[11px] text-white/55">{detectando ? "Detectando procesadores y almacenes…" : "Sin inventario de esta neurona todavía."}</p>
            ) : (
                <div className="grid gap-2.5 sm:grid-cols-2">
                    <Fila icono={Cpu} etiqueta="Procesador principal">
                        {proc ? (
                            <Linea titulo={proc.nombre}>
                                {proc.nombre}
                                {typeof proc.ramGb === "number" ? ` · ${fmtGb(proc.ramGb)} RAM` : ""}
                            </Linea>
                        ) : (
                            <span className="text-white/50">sin detectar</span>
                        )}
                    </Fila>
                    <Fila icono={HardDrive} etiqueta="Libre en disco">
                        {disco ? <Linea>{fmtLibre(disco)}</Linea> : <span className="text-white/50">sin medir</span>}
                    </Fila>
                    <Fila icono={Layers} etiqueta="Topología">
                        {topo ? (
                            <Linea titulo={NOMBRE_TOPOLOGIA[topo]}>
                                {NOMBRE_TOPOLOGIA[topo]}
                                {!guardada ? " (sugerida)" : ""}
                            </Linea>
                        ) : (
                            <span className="text-white/50">sin elegir</span>
                        )}
                    </Fila>
                    <Fila icono={Share2} etiqueta="Ofrece a la malla">
                        {oferta ? (
                            <Linea titulo="Lo que esta neurona ofrece a las demás: los modelos que sirve, su servidor propio de IA y a quién presta.">
                                <span data-testid="oferta-neurona">{textoOferta(oferta)}</span>
                            </Linea>
                        ) : (
                            <span className="text-white/50">sin oferta todavía</span>
                        )}
                    </Fila>
                    <Fila icono={MessageSquare} etiqueta="Mejor modelo de texto">
                        <Modelo s={plan?.sugerencias.find((s) => s.capacidad === "texto")} />
                    </Fila>
                    <Fila icono={Volume2} etiqueta="Mejor voz">
                        <Modelo s={plan?.sugerencias.find((s) => s.capacidad === "voz-tts")} />
                    </Fila>
                </div>
            )}
            <Link
                href="/agent?tab=recursos-ia"
                className={cn(
                    "inline-flex min-h-9 cursor-pointer items-center gap-1.5 self-start rounded-md border border-[#007FFF]/45 bg-[#007FFF]/10 px-2.5 py-1 text-[11px] text-sky-100 transition-colors duration-200 hover:bg-[#007FFF]/20",
                    FOCO,
                )}
            >
                Abrir Recursos de IA <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
        </section>
    );
}

export default ResumenRecursosNeurona;
