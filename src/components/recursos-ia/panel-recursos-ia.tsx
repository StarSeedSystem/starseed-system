"use client";

/**
 * PanelRecursosIa — «Recursos de IA» de StarSeed OS (SOP `architecture/recursos-ia-neurona.md`).
 *
 * Elige, para cada neurona y cada alcance (perfil, grupo o comunidad; privado o público), dónde
 * se GUARDA y dónde se PROCESA la IA: el OS detecta procesadores y almacenes, sugiere la mejor
 * topología y el mejor modelo por capacidad (1.58-bit primero), pregunta antes de asumir un
 * tamaño y deja todo guardado con la cuenta. Aquí no se descarga nada: se decide.
 */

import { useMemo, useState, type ReactNode } from "react";
import { BookOpen, CircleHelp, Cpu, HardDrive, Layers, Loader2, Network, Orbit, RefreshCw, TriangleAlert, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { BTN, CARD, Empty, PILL, PILL_OFF, PILL_ON, SectionTitle, SELECT, INPUT, Stat, fmtTs } from "@/components/astraura/s158/shared";
import { cn } from "@/lib/utils";
import { asignar, claveAlcance, claveElemento, confirmarTamano, declararAlmacen, fijarTopologia } from "@/lib/recursos-ia/asignaciones";
import { catalogoRecursos } from "@/lib/recursos-ia/catalogo";
import { sugerirPlan, topologiaSugerida } from "@/lib/recursos-ia/sugerencias";
import { CAPACIDADES, NOMBRE_TOPOLOGIA, type Alcance, type ConfigTopologia, type MedioAlmacen } from "@/lib/recursos-ia/tipos";
import { useRecursosIa } from "@/lib/recursos-ia/use-recursos-ia";
import { ConstelacionRecursos } from "./constelacion-recursos";
import { ALCANCE_PROPIO, FOCO, fmtGb, seguro, todosLosAlmacenes, todosLosProcesadores, useInventarioRecursos } from "./piezas";
import { SeccionCapacidades, SeccionPreguntas, type ConfirmacionDescarga } from "./seccion-capacidades";
import { SeccionAlmacenes, SeccionCatalogo } from "./seccion-catalogo";
import { SeccionTopologia } from "./seccion-topologia";

function Bloque({ id, icon, titulo, pista, derecha, children, tono }: { id: string; icon: LucideIcon; titulo: string; pista?: string; derecha?: ReactNode; children: ReactNode; tono?: string }) {
    return (
        <section id={id} aria-label={titulo} className={cn(CARD, "flex min-w-0 flex-col gap-3 p-3 sm:p-4")}>
            <SectionTitle icon={icon} title={titulo} hint={pista} right={derecha} tone={tono} />
            {children}
        </section>
    );
}

const TIPOS_ALCANCE: { id: Alcance["tipo"]; texto: string }[] = [
    { id: "perfil", texto: "Mi perfil" },
    { id: "grupo", texto: "Un grupo" },
    { id: "comunidad", texto: "Una comunidad" },
];

function SelectorAlcance({ alcance, alCambiar }: { alcance: Alcance; alCambiar: (a: Alcance) => void }) {
    return (
        <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center" aria-label="Alcance">
            <select
                aria-label="Alcance de la IA"
                className={cn(SELECT, "sm:w-40")}
                value={alcance.tipo}
                onChange={(e) => {
                    const tipo = e.target.value as Alcance["tipo"];
                    alCambiar({ ...alcance, tipo, id: tipo === "perfil" ? ALCANCE_PROPIO.id : alcance.tipo === "perfil" ? "" : alcance.id });
                }}
            >
                {TIPOS_ALCANCE.map((t) => (
                    <option key={t.id} value={t.id}>
                        {t.texto}
                    </option>
                ))}
            </select>
            {alcance.tipo !== "perfil" && (
                <input
                    aria-label={`Identificador del ${alcance.tipo === "grupo" ? "grupo" : "la comunidad"}`}
                    className={cn(INPUT, "sm:w-40")}
                    placeholder={alcance.tipo === "grupo" ? "id del grupo" : "id de la comunidad"}
                    value={alcance.id}
                    onChange={(e) => alCambiar({ ...alcance, id: e.target.value.trim() })}
                />
            )}
            <div className="flex gap-1.5" role="group" aria-label="Visibilidad">
                {(["privada", "publica"] as const).map((v) => (
                    <button
                        key={v}
                        type="button"
                        aria-pressed={alcance.visibilidad === v}
                        className={cn(PILL, alcance.visibilidad === v ? PILL_ON : PILL_OFF, "flex-1 justify-center sm:flex-none", FOCO)}
                        onClick={() => alCambiar({ ...alcance, visibilidad: v })}
                    >
                        {v === "privada" ? "Privada" : "Pública"}
                    </button>
                ))}
            </div>
        </div>
    );
}

export function PanelRecursosIa({ alcance: alcanceInicial }: { alcance?: Alcance } = {}) {
    const [estado, cambiar] = useRecursosIa();
    const [alcance, setAlcance] = useState<Alcance>(alcanceInicial ?? ALCANCE_PROPIO);
    const { inv, detectando, error, detectar } = useInventarioRecursos(estado.almacenesDeclarados);
    const catalogo = useMemo(() => seguro(() => catalogoRecursos(), []), []);

    const clave = claveAlcance(alcance);
    const guardada = estado.topologias[clave];
    const sugerida = useMemo(() => (inv ? seguro(() => topologiaSugerida(inv, alcance), null) : null), [inv, alcance]);
    const plan = useMemo(
        () =>
            inv
                ? seguro(
                      () =>
                          sugerirPlan(inv, catalogo, {
                              capacidades: [...CAPACIDADES],
                              alcance,
                              topologia: guardada,
                              tamanosConfirmados: estado.tamanosConfirmados,
                              preferir158: true,
                              instalados: inv.modelosInstalados,
                          }),
                      null,
                  )
                : null,
        [inv, catalogo, alcance, guardada, estado.tamanosConfirmados],
    );
    const actual: ConfigTopologia = {
        ...(guardada ?? plan?.topologia ?? sugerida ?? { topologia: "cada-neurona" as const, vias: ["local" as const, "malla-local" as const] }),
        alcance,
    };
    const procesadores = useMemo(() => (inv ? todosLosProcesadores(inv) : []), [inv]);
    const almacenes = useMemo(() => (inv ? todosLosAlmacenes(inv) : []), [inv]);
    const esta = inv?.neuronas.find((n) => n.esEsta) ?? inv?.neuronas[0];
    const libreEsta = esta?.almacenes.filter((a) => a.tipo === "neurona-local").reduce((s, a) => s + (a.libreGb ?? 0), 0);
    // Una descarga ya confirmada (su asignación está guardada) deja de preguntarse.
    const preguntas = (plan?.preguntas ?? []).filter(
        (q) => !(q.tipo === "confirmar-descarga" && q.modeloId && estado.asignaciones[claveElemento("modelo", q.modeloId)]),
    );

    const guardarTopologia = (c: ConfigTopologia) => {
        cambiar((e) => fijarTopologia(e, { ...c, alcance }));
        if (c.topologia !== actual.topologia || !guardada) toast.success(`Topología guardada: ${NOMBRE_TOPOLOGIA[c.topologia]}`);
    };

    const alConfirmarTamano = (modeloId: string, gb: number) => {
        cambiar((e) => confirmarTamano(e, modeloId, gb));
        toast.success("Tamaño confirmado", { description: `${catalogo.find((m) => m.id === modeloId)?.nombre ?? modeloId}: ${fmtGb(gb)}` });
    };

    const alConfirmarDescarga = (c: ConfirmacionDescarga) => {
        cambiar((e) =>
            asignar(e, {
                elemento: { tipo: "modelo", id: c.modeloId, nombre: c.modelo?.nombre ?? c.modeloId, tamanoGb: c.tamanoGb ?? undefined },
                almacenEn: c.almacen?.id ?? "auto",
                procesaEn: c.procesador?.id ?? "auto",
                alcance,
                t: Date.now(),
            }),
        );
        toast.success("Decisión guardada", {
            description: `Siguiente paso: lanza la descarga desde Neuronas → Descargas de modelos; irá a ${c.almacen?.etiqueta ?? "el destino automático"}.`,
        });
    };

    const alDeclarar = (m: MedioAlmacen) => cambiar((e) => declararAlmacen(e, m));
    const alQuitar = (id: string) => {
        cambiar((e) => ({ ...e, almacenesDeclarados: e.almacenesDeclarados.filter((x) => x.id !== id) }));
        toast.success("Almacenamiento quitado");
    };

    return (
        <div className="flex min-w-0 flex-col gap-3 text-white" data-testid="panel-recursos-ia">
            {/* a) Cabecera */}
            <section aria-label="Recursos de IA" className={cn(CARD, "flex flex-col gap-3 p-3 sm:p-4")}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-white/95">
                            <Network className="h-4 w-4 shrink-0 text-[#007FFF]" aria-hidden="true" /> Recursos de IA
                        </h2>
                        <p className="mt-1 max-w-2xl text-[11px] leading-snug text-white/65">
                            Elige dónde se guarda y dónde se procesa la IA de cada neurona: el OS detecta tus procesadores y almacenes, sugiere lo mejor (1.58-bit primero) y
                            pregunta antes de asumir un tamaño.
                        </p>
                        {plan?.resumen && <p className="mt-1.5 max-w-2xl text-[11px] leading-snug text-sky-100/90" data-testid="resumen-plan">{plan.resumen}</p>}
                    </div>
                    <div className="flex flex-col gap-2 lg:items-end">
                        <SelectorAlcance alcance={alcance} alCambiar={setAlcance} />
                        <div className="flex flex-wrap items-center gap-2">
                            {inv && <span className="font-code text-[10px] text-white/45">detectado {fmtTs(inv.generado)}</span>}
                            <button type="button" className={BTN} onClick={() => void detectar()} disabled={detectando}>
                                {detectando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
                                Volver a detectar
                            </button>
                        </div>
                    </div>
                </div>
                {inv && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Stat label="Neuronas" value={inv.neuronas.length} hint={inv.neuronas.map((n) => n.nombre).join(" · ")} />
                        <Stat label="Procesadores" value={procesadores.length} />
                        <Stat label="Almacenes" value={almacenes.length} />
                        <Stat label="Libre aquí" value={typeof libreEsta === "number" && esta?.almacenes.some((a) => typeof a.libreGb === "number") ? fmtGb(libreEsta) : "—"} hint={esta?.nombre} />
                    </div>
                )}
                {(inv?.avisos.length || preguntas.length > 0) && (
                    <ul className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap" aria-label="Avisos">
                        {preguntas.length > 0 && (
                            <li>
                                <a
                                    href="#ria-preguntas"
                                    className={cn("flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#FFBF00]/45 bg-[#FFBF00]/10 px-2 py-1 text-[10px] text-amber-100 transition-colors duration-200 hover:bg-[#FFBF00]/20", FOCO)}
                                >
                                    <CircleHelp className="h-3 w-3 shrink-0" aria-hidden="true" /> {preguntas.length} {preguntas.length === 1 ? "pregunta" : "preguntas"} antes de asumir
                                </a>
                            </li>
                        )}
                        {inv?.avisos.map((a, i) => (
                            <li key={i} className="flex min-w-0 items-start gap-1.5 rounded-lg border border-[#FFBF00]/30 bg-[#FFBF00]/[0.06] px-2 py-1 text-[10px] leading-snug text-amber-100/90">
                                <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-[#FFBF00]" aria-hidden="true" />
                                <span className="min-w-0">{a}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {!inv ? (
                <section className={cn(CARD, "p-4")}>
                    {detectando || !error ? (
                        <p className="flex items-center gap-1.5 text-[11px] text-white/60">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Detectando procesadores y almacenes de tus neuronas…
                        </p>
                    ) : (
                        <Empty text={`No se pudo detectar esta neurona: ${error}. Prueba «Volver a detectar».`} />
                    )}
                </section>
            ) : (
                <>
                    {/* b) Constelación */}
                    <Bloque id="ria-constelacion" icon={Orbit} titulo="Constelación de recursos" pista="Tus neuronas como cristal de silicio: procesadores en el anillo interior, almacenes como satélites. Toca un nodo para ver su detalle.">
                        <ConstelacionRecursos inv={inv} plan={plan} topologia={actual} />
                    </Bloque>

                    {/* c) Topología */}
                    <Bloque id="ria-topologia" icon={Layers} titulo="Topología de tu IA" pista="Cómo se reparte la IA de este alcance entre tus neuronas, tus servidores y los de tu comunidad.">
                        <SeccionTopologia inv={inv} actual={actual} asignaciones={estado.asignaciones} sugerida={sugerida} guardada={!!guardada} alGuardar={guardarTopologia} />
                    </Bloque>

                    {/* d) Por capacidad */}
                    <Bloque id="ria-capacidades" icon={Cpu} titulo="Por capacidad" pista="Modelo → procesador → almacén para cada cosa que hace tu IA. «Fijar» la deja así aunque cambien las sugerencias." tono="text-[#39FF14]">
                        <SeccionCapacidades plan={plan} inv={inv} catalogo={catalogo} config={actual} alGuardar={guardarTopologia} />
                    </Bloque>

                    {/* e) Preguntas */}
                    <Bloque id="ria-preguntas" icon={CircleHelp} titulo="Preguntas antes de asumir" pista="Ningún tamaño se da por sabido y ninguna descarga se decide sin ti." tono="text-[#FFBF00]">
                        <SeccionPreguntas
                            preguntas={preguntas}
                            plan={plan}
                            inv={inv}
                            catalogo={catalogo}
                            tamanos={estado.tamanosConfirmados}
                            alConfirmarTamano={alConfirmarTamano}
                            alConfirmarDescarga={alConfirmarDescarga}
                        />
                    </Bloque>

                    {/* f) Catálogo */}
                    <Bloque id="ria-catalogo" icon={BookOpen} titulo="Catálogo de modelos" pista="Lo que se puede instalar, con sus requisitos y el mejor encaje que tiene en tus neuronas.">
                        <SeccionCatalogo catalogo={catalogo} inv={inv} procesadores={procesadores} almacenes={almacenes} tamanos={estado.tamanosConfirmados} privado={alcance.visibilidad === "privada"} />
                    </Bloque>

                    {/* g) Almacenes declarados */}
                    <Bloque id="ria-almacenes" icon={HardDrive} titulo="Almacenes declarados" pista="Un disco externo o un servidor de almacenamiento que no se detecta solo.">
                        <SeccionAlmacenes inv={inv} declarados={estado.almacenesDeclarados} alDeclarar={alDeclarar} alQuitar={alQuitar} />
                    </Bloque>
                </>
            )}
        </div>
    );
}

export default PanelRecursosIa;
