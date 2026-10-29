"use client";

/**
 * «Por capacidad» y «Preguntas antes de asumir» (SOP §3).
 * - Una fila por capacidad: modelo → procesador → almacén, con su nivel, 1.58-bit destacado,
 *   tok/s estimado, el porqué, los motivos con su arreglo, las alternativas y «Fijar».
 * - Lo que no tiene opción se dice con su motivo.
 * - Las preguntas del plan: tamaño del modelo (se guarda con `confirmarTamano`) y confirmar la
 *   descarga (aquí NO se descarga nada: se guarda la asignación y se dice el siguiente paso).
 */

import { useMemo, useState, type ReactNode } from "react";
import { ArrowRight, ChevronDown, CircleHelp, Download, HardDrive, Pin, PinOff, TriangleAlert, Wrench } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BTN, BTN_PRIMARY, Empty, INPUT, LABEL, MONO, SUB } from "@/components/astraura/s158/shared";
import { cn } from "@/lib/utils";
import { cabeEn } from "@/lib/recursos-ia/compatibilidad";
import { cuantizacionesPara, FUENTE_METODOS_HF, NOTA_BITNET, type DispositivoHF } from "@/lib/recursos-ia/cuantizacion-hf";
import {
    CAPACIDADES,
    NOMBRE_CAPACIDAD,
    type Alternativa,
    type Capacidad,
    type ConfigTopologia,
    type InventarioRecursos,
    type MedioAlmacen,
    type Motivo,
    type PlanRecursos,
    type Pregunta,
    type Procesador,
    type RequisitosModelo,
    type Sugerencia,
} from "@/lib/recursos-ia/tipos";
import {
    BitsBadge,
    FOCO,
    ICONO_ALMACEN,
    ICONO_PROCESADOR,
    Linea,
    NivelBadge,
    fmtGb,
    fmtLibre,
    fmtNum,
    nombreNeurona,
    nombreVia,
    tamanoConocido,
    todosLosAlmacenes,
    todosLosProcesadores,
} from "./piezas";

/* ── Por capacidad ─────────────────────────────────────────────────────────── */

function Eslabon({ etiqueta, valor, sub, icono: Icono }: { etiqueta: string; valor: string; sub?: string; icono: typeof HardDrive }) {
    return (
        <div className="flex min-w-0 flex-1 items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5">
            <Icono className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/55" aria-hidden="true" />
            <div className="min-w-0 flex-1">
                <p className={LABEL}>{etiqueta}</p>
                <Linea className="text-[11px] font-medium text-white/90">{valor}</Linea>
                {sub && <Linea className="text-[10px] text-white/50">{sub}</Linea>}
            </div>
        </div>
    );
}

function Flecha() {
    return <ArrowRight className="mx-auto h-3.5 w-3.5 shrink-0 rotate-90 text-white/35 sm:mx-0 sm:mt-3 sm:rotate-0" aria-hidden="true" />;
}

/** El procesador del inventario, traducido a las columnas de la tabla de cuantización de transformers. */
function dispositivoDe(p: Procesador): DispositivoHF {
    const a = p.aceleradores;
    if (a.includes("cuda")) return "cuda";
    if (a.includes("rocm")) return "rocm";
    if (a.includes("metal") || a.includes("metal4")) return "metal";
    if (/intel/i.test(p.nombre)) return "intel";
    return "cpu";
}

/** Los métodos con soporte en ese procesador, ya ordenados (antes «ok» que «parcial»). */
function metodosPara(p: Procesador) {
    return cuantizacionesPara(dispositivoDe(p));
}

export function ListaMotivos({ motivos }: { motivos: Motivo[] }) {
    if (!motivos.length) return <p className="text-[10px] text-white/50">Sin reparos.</p>;
    return (
        <ul className="flex flex-col gap-1.5">
            {motivos.map((m, i) => (
                <li key={`${m.clave}-${i}`} data-motivo={m.clave} className="flex items-start gap-1.5 text-[11px] leading-snug">
                    <TriangleAlert className={cn("mt-0.5 h-3 w-3 shrink-0", m.bloquea ? "text-[#DC143C]" : "text-[#FFBF00]")} aria-hidden="true" />
                    <div className="min-w-0">
                        <p className={m.bloquea ? "text-rose-100" : "text-amber-100/90"}>{m.texto}</p>
                        {m.arreglo && (
                            <p className="mt-0.5 flex items-start gap-1 text-[10px] text-emerald-100/90">
                                <Wrench className="mt-0.5 h-2.5 w-2.5 shrink-0" aria-hidden="true" /> Arreglo: {m.arreglo}
                            </p>
                        )}
                    </div>
                </li>
            ))}
        </ul>
    );
}

function Desplegable({ titulo, children, defecto = false, testid }: { titulo: string; children: ReactNode; defecto?: boolean; testid?: string }) {
    const [abierto, setAbierto] = useState(defecto);
    return (
        <div className="min-w-0">
            <button
                type="button"
                aria-expanded={abierto}
                data-testid={testid}
                onClick={() => setAbierto((v) => !v)}
                className={cn("flex min-h-8 cursor-pointer items-center gap-1 rounded text-[10px] font-medium text-white/65 transition-colors duration-200 hover:text-white max-sm:min-h-9", FOCO)}
            >
                <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", abierto && "rotate-180")} aria-hidden="true" /> {titulo}
            </button>
            {abierto && <div className="mt-1.5 pl-4">{children}</div>}
        </div>
    );
}

export function SeccionCapacidades({
    plan,
    inv,
    catalogo,
    config,
    alGuardar,
}: {
    plan: PlanRecursos | null;
    inv: InventarioRecursos;
    catalogo: RequisitosModelo[];
    config: ConfigTopologia;
    alGuardar: (c: ConfigTopologia) => void;
}) {
    const procesadores = useMemo(() => todosLosProcesadores(inv), [inv]);
    const almacenes = useMemo(() => todosLosAlmacenes(inv), [inv]);
    const sugerencias = plan?.sugerencias ?? [];
    const sinOpcion = plan?.sinOpcion ?? [];
    if (!sugerencias.length && !sinOpcion.length) {
        return <Empty text="El planificador aún no tiene sugerencias para estas neuronas. Vuelve a detectar o declara un almacenamiento." />;
    }
    const fijar = (cap: Capacidad, eleccion: { modeloId: string; procesaEn: string; almacenEn: string } | null) => {
        const por = { ...(config.porCapacidad ?? {}) };
        if (eleccion) por[cap] = eleccion;
        else delete por[cap];
        alGuardar({ ...config, porCapacidad: por });
        toast.success(eleccion ? `${NOMBRE_CAPACIDAD[cap]}: fijada` : `${NOMBRE_CAPACIDAD[cap]}: vuelve a automático`);
    };
    return (
        <ul className="flex flex-col gap-2" aria-label="Por capacidad">
            {CAPACIDADES.map((cap) => {
                const s = sugerencias.find((x) => x.capacidad === cap);
                if (s) return <FilaCapacidad key={cap} s={s} inv={inv} catalogo={catalogo} procesadores={procesadores} almacenes={almacenes} fijada={config.porCapacidad?.[cap]} alFijar={(e) => fijar(cap, e)} />;
                const so = sinOpcion.find((x) => x.capacidad === cap);
                if (!so) return null;
                return (
                    <li key={cap} data-testid={`fila-capacidad-${cap}`} className={cn(SUB, "flex flex-col gap-1 p-3")}>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[12px] font-semibold text-white/90">{NOMBRE_CAPACIDAD[cap]}</span>
                            <span className="inline-flex items-center rounded-full border border-[#DC143C]/55 bg-[#DC143C]/15 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-rose-100">sin opción</span>
                        </div>
                        <p className="text-[11px] leading-snug text-white/70">{so.motivo}</p>
                    </li>
                );
            })}
        </ul>
    );
}

function FilaCapacidad({
    s,
    inv,
    catalogo,
    procesadores,
    almacenes,
    fijada,
    alFijar,
}: {
    s: Sugerencia;
    inv: InventarioRecursos;
    catalogo: RequisitosModelo[];
    procesadores: Procesador[];
    almacenes: MedioAlmacen[];
    fijada?: { procesaEn?: string; almacenEn?: string; modeloId?: string };
    alFijar: (e: { modeloId: string; procesaEn: string; almacenEn: string } | null) => void;
}) {
    const IconoP = ICONO_PROCESADOR[s.procesador.tipo];
    const IconoA = ICONO_ALMACEN[s.almacen.tipo];
    const esFijada = !!fijada?.modeloId && fijada.modeloId === s.modelo.id && fijada.procesaEn === s.procesador.id && fijada.almacenEn === s.almacen.id;
    const tokS = s.compat.tokSEstimado;
    // BitNet y Ternary Bonsai (1.58-bit) ya vienen cuantizados de fábrica: la tabla no les aplica.
    const esTernario = s.modelo.bits === 1.58;
    const metodos = esTernario ? [] : metodosPara(s.procesador).slice(0, 3);
    return (
        <li data-testid={`fila-capacidad-${s.capacidad}`} className={cn(SUB, "flex flex-col gap-2 p-3")}>
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-semibold text-white/90">{NOMBRE_CAPACIDAD[s.capacidad]}</span>
                <NivelBadge nivel={s.compat.nivel} />
                <BitsBadge bits={s.modelo.bits} />
                {typeof tokS === "number" && <span className={MONO}>≈ {fmtNum(tokS)} tok/s</span>}
                {esFijada && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#007FFF]/50 bg-[#007FFF]/10 px-1.5 py-0.5 text-[9px] leading-none text-sky-100">
                        <Pin className="h-2.5 w-2.5" aria-hidden="true" /> fijada
                    </span>
                )}
                <span className="ml-auto">
                    {esFijada ? (
                        <button type="button" className={BTN} onClick={() => alFijar(null)}>
                            <PinOff className="h-3 w-3" aria-hidden="true" /> Soltar
                        </button>
                    ) : (
                        <button
                            type="button"
                            className={BTN_PRIMARY}
                            aria-label={`Fijar ${NOMBRE_CAPACIDAD[s.capacidad]}`}
                            onClick={() => alFijar({ modeloId: s.modelo.id, procesaEn: s.procesador.id, almacenEn: s.almacen.id })}
                        >
                            <Pin className="h-3 w-3" aria-hidden="true" /> Fijar
                        </button>
                    )}
                </span>
            </div>

            <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:items-start">
                <Eslabon etiqueta="Modelo" valor={s.modelo.nombre} sub={`${s.modelo.familia} · ${s.modelo.formato} · ${s.modelo.runtime}`} icono={HardDrive} />
                <Flecha />
                <Eslabon
                    etiqueta="Procesador"
                    valor={s.procesador.nombre}
                    sub={[nombreNeurona(inv, s.procesador.neuronaId), typeof s.procesador.ramGb === "number" ? `${fmtGb(s.procesador.ramGb)} RAM` : null].filter(Boolean).join(" · ")}
                    icono={IconoP}
                />
                <Flecha />
                <Eslabon etiqueta="Almacén" valor={s.almacen.etiqueta} sub={`${fmtLibre(s.almacen)} · ${nombreVia(s.via)}`} icono={IconoA} />
            </div>

            {esTernario ? (
                <p className="text-[11px] leading-snug text-white/70" data-testid={`cuantizacion-${s.capacidad}`}>
                    {NOTA_BITNET}
                </p>
            ) : (
                metodos.length > 0 && (
                    <p
                        className="text-[11px] leading-snug text-white/70"
                        title={FUENTE_METODOS_HF}
                        data-testid={`cuantizacion-${s.capacidad}`}
                    >
                        Cuantización sugerida para {s.procesador.nombre}:{" "}
                        <span className={MONO}>{metodos.map((m) => m.nombre).join(" · ")}</span>
                    </p>
                )
            )}

            {s.porQue.length > 0 && (
                <ul className="grid gap-x-6 gap-y-0.5 text-[11px] leading-snug text-white/70 lg:grid-cols-2">
                    {s.porQue.map((p, i) => (
                        <li key={i} className="flex gap-1.5">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#007FFF]" aria-hidden="true" />
                            {p}
                        </li>
                    ))}
                </ul>
            )}

            <div className="flex flex-col gap-1">
                {s.compat.motivos.length > 0 && (
                    <Desplegable titulo={`Motivos (${s.compat.motivos.length})`} testid={`motivos-${s.capacidad}`}>
                        <ListaMotivos motivos={s.compat.motivos} />
                    </Desplegable>
                )}
                {s.alternativas.length > 0 && (
                    <Desplegable titulo={`Alternativas (${s.alternativas.length})`} testid={`alternativas-${s.capacidad}`}>
                        <ul className="flex flex-col gap-2">
                            {s.alternativas.map((a, i) => (
                                <FilaAlternativa
                                    key={`${a.modeloId}-${a.procesadorId}-${a.almacenId}-${i}`}
                                    a={a}
                                    inv={inv}
                                    catalogo={catalogo}
                                    procesadores={procesadores}
                                    almacenes={almacenes}
                                    alUsar={() => alFijar({ modeloId: a.modeloId, procesaEn: a.procesadorId, almacenEn: a.almacenId })}
                                />
                            ))}
                        </ul>
                    </Desplegable>
                )}
            </div>
        </li>
    );
}

function FilaAlternativa({
    a,
    inv,
    catalogo,
    procesadores,
    almacenes,
    alUsar,
}: {
    a: Alternativa;
    inv: InventarioRecursos;
    catalogo: RequisitosModelo[];
    procesadores: Procesador[];
    almacenes: MedioAlmacen[];
    alUsar: () => void;
}) {
    const m = catalogo.find((x) => x.id === a.modeloId);
    const p = procesadores.find((x) => x.id === a.procesadorId);
    const al = almacenes.find((x) => x.id === a.almacenId);
    const bloqueada = a.compat.nivel === "no-cabe" || a.compat.nivel === "incompatible";
    return (
        <li className="flex flex-col gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-2" data-alternativa={a.modeloId}>
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                <Linea className="min-w-0 flex-1 text-[11px] font-medium text-white/85">{m?.nombre ?? a.modeloId}</Linea>
                <div className="flex shrink-0 items-center gap-1.5">
                    {m && <BitsBadge bits={m.bits} />}
                    <NivelBadge nivel={a.compat.nivel} />
                    {!bloqueada && (
                        <button type="button" className={cn(BTN, "ml-auto sm:ml-0")} onClick={alUsar}>
                            Usar esta
                        </button>
                    )}
                </div>
            </div>
            <Linea className="text-[10px] text-white/50">
                {[p ? `${p.nombre}${nombreNeurona(inv, p.neuronaId) ? ` (${nombreNeurona(inv, p.neuronaId)})` : ""}` : a.procesadorId, al?.etiqueta ?? a.almacenId, nombreVia(a.via)].join(" · ")}
            </Linea>
            {a.compat.motivos.length > 0 && <ListaMotivos motivos={a.compat.motivos} />}
        </li>
    );
}

/* ── Preguntas antes de asumir ─────────────────────────────────────────────── */

/** GB de una opción de variante: su valor numérico o el «N GB» de su texto. */
export function gbDeOpcion(o: { valor: string; texto: string }): number | null {
    const n = Number(String(o.valor).replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
    const m = /(\d+(?:[.,]\d+)?)\s*GB/i.exec(o.texto);
    return m ? Number(m[1].replace(",", ".")) : null;
}

export interface ConfirmacionDescarga {
    modelo: RequisitosModelo | undefined;
    modeloId: string;
    tamanoGb: number | null;
    almacen?: MedioAlmacen;
    procesador?: Procesador;
}

export function SeccionPreguntas({
    preguntas,
    plan,
    inv,
    catalogo,
    tamanos,
    alConfirmarTamano,
    alConfirmarDescarga,
}: {
    preguntas: Pregunta[];
    plan: PlanRecursos | null;
    inv: InventarioRecursos;
    catalogo: RequisitosModelo[];
    tamanos: Record<string, number>;
    alConfirmarTamano: (modeloId: string, gb: number) => void;
    alConfirmarDescarga: (c: ConfirmacionDescarga) => void;
}) {
    const [dialogo, setDialogo] = useState<ConfirmacionDescarga | null>(null);
    // «Ahora no» aparca la pregunta en esta sesión (no se decide nada por la persona).
    const [aparcadas, setAparcadas] = useState<string[]>([]);
    const visibles = preguntas.filter((q) => !aparcadas.includes(q.id));
    if (!visibles.length) {
        return (
            <Empty
                text={
                    preguntas.length
                        ? `Aparcaste ${preguntas.length === 1 ? "la pregunta" : `las ${preguntas.length} preguntas`} por ahora: volverán al recargar.`
                        : "Nada que preguntar: los tamaños y destinos de lo sugerido ya están confirmados."
                }
            />
        );
    }
    const contexto = (modeloId?: string): ConfirmacionDescarga | null => {
        if (!modeloId) return null;
        const modelo = catalogo.find((m) => m.id === modeloId);
        const s = plan?.sugerencias.find((x) => x.modelo.id === modeloId);
        const alt = !s ? plan?.sugerencias.flatMap((x) => x.alternativas).find((x) => x.modeloId === modeloId) : undefined;
        const almacen = s?.almacen ?? (alt ? todosLosAlmacenes(inv).find((a) => a.id === alt.almacenId) : undefined);
        const procesador = s?.procesador ?? (alt ? todosLosProcesadores(inv).find((p) => p.id === alt.procesadorId) : undefined);
        return { modelo, modeloId, tamanoGb: modelo ? tamanoConocido(modelo, tamanos) : tamanos[modeloId] ?? null, almacen, procesador };
    };
    return (
        <>
            <ul className="flex flex-col gap-2" aria-label="Preguntas antes de asumir">
                {visibles.map((q) => (
                    <FilaPregunta
                        key={q.id}
                        q={q}
                        catalogo={catalogo}
                        alConfirmarTamano={alConfirmarTamano}
                        alAbrirDescarga={() => setDialogo(contexto(q.modeloId))}
                        alAparcar={() => setAparcadas((v) => [...v, q.id])}
                    />
                ))}
            </ul>
            <DialogoDescarga
                datos={dialogo}
                alCerrar={() => setDialogo(null)}
                alConfirmar={(c) => {
                    alConfirmarDescarga(c);
                    setDialogo(null);
                }}
            />
        </>
    );
}

function FilaPregunta({
    q,
    catalogo,
    alConfirmarTamano,
    alAbrirDescarga,
    alAparcar,
}: {
    q: Pregunta;
    catalogo: RequisitosModelo[];
    alConfirmarTamano: (modeloId: string, gb: number) => void;
    alAbrirDescarga: () => void;
    alAparcar: () => void;
}) {
    const [gb, setGb] = useState("");
    const modelo = q.modeloId ? catalogo.find((m) => m.id === q.modeloId) : undefined;
    const valor = Number(gb.replace(",", "."));
    const valido = Number.isFinite(valor) && valor > 0 && valor < 2000;
    const esTamano = q.tipo === "tamano-modelo" || q.tipo === "elegir-variante";
    return (
        <li className={cn(SUB, "flex flex-col gap-2 p-3")} data-pregunta={q.tipo}>
            <p className="flex items-start gap-2 text-[11px] leading-snug text-white/85">
                <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FFBF00]" aria-hidden="true" />
                <span className="min-w-0">{q.texto}</span>
            </p>
            {modelo && (
                <Linea className="pl-5 text-[10px] text-white/50" titulo={`${modelo.nombre} · ${modelo.upstream}`}>
                    {modelo.nombre} · {modelo.upstream}
                </Linea>
            )}
            {esTamano && q.opciones && q.opciones.length > 0 && (
                <ul className="flex flex-col gap-1.5 pl-5 sm:flex-row sm:flex-wrap">
                    {q.opciones.map((o) => {
                        const g = gbDeOpcion(o);
                        return (
                            <li key={o.valor}>
                                <button
                                    type="button"
                                    disabled={g === null || !q.modeloId}
                                    className={cn(BTN, "w-full sm:w-auto")}
                                    onClick={() => q.modeloId && g !== null && alConfirmarTamano(q.modeloId, g)}
                                >
                                    {o.texto}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
            {esTamano && q.modeloId && (
                <form
                    className="flex flex-wrap items-center gap-2 pl-5"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (valido && q.modeloId) {
                            alConfirmarTamano(q.modeloId, valor);
                            setGb("");
                        }
                    }}
                >
                    <label className="flex items-center gap-1.5 text-[10px] text-white/60">
                        Tamaño en disco
                        <input
                            aria-label={`Tamaño en GB de ${modelo?.nombre ?? q.modeloId}`}
                            inputMode="decimal"
                            placeholder="p. ej. 14,3"
                            className={cn(INPUT, "w-24")}
                            value={gb}
                            onChange={(e) => setGb(e.target.value)}
                        />
                        GB
                    </label>
                    <button type="submit" className={BTN_PRIMARY} disabled={!valido}>
                        Confirmar tamaño
                    </button>
                </form>
            )}
            {(q.tipo === "confirmar-descarga" || q.tipo === "confirmar-almacen") && (
                <div className="flex flex-col gap-1.5 pl-5 sm:flex-row sm:flex-wrap">
                    <button type="button" className={BTN_PRIMARY} onClick={alAbrirDescarga} disabled={!q.modeloId}>
                        <Download className="h-3 w-3" aria-hidden="true" /> Revisar y confirmar
                    </button>
                    <button type="button" className={BTN} onClick={alAparcar}>
                        Ahora no
                    </button>
                </div>
            )}
        </li>
    );
}

function DialogoDescarga({ datos, alCerrar, alConfirmar }: { datos: ConfirmacionDescarga | null; alCerrar: () => void; alConfirmar: (c: ConfirmacionDescarga) => void }) {
    const m = datos?.modelo;
    const tam = datos?.tamanoGb ?? null;
    const destino = datos?.almacen;
    const noCabe = destino && typeof tam === "number" ? !cabeEn(destino, tam) : false;
    return (
        <Dialog open={!!datos} onOpenChange={(o) => !o && alCerrar()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-sm">Confirmar descarga</DialogTitle>
                    <DialogDescription className="text-[11px] text-white/60">
                        Aquí no se descarga nada: se guarda tu decisión de dónde vivirá y dónde se procesará.
                    </DialogDescription>
                </DialogHeader>
                {datos && (
                    <dl className="grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
                        <div className="min-w-0">
                            <dt className={LABEL}>Modelo</dt>
                            <dd className="truncate text-white/90" title={m?.nombre ?? datos.modeloId}>
                                {m?.nombre ?? datos.modeloId}
                            </dd>
                        </div>
                        <div>
                            <dt className={LABEL}>Tamaño</dt>
                            <dd className="text-white/90">
                                {typeof tam === "number" ? fmtGb(tam) : "por confirmar"}
                                {typeof m?.disco.descargaGb === "number" && <span className="text-white/50"> · descarga {fmtGb(m.disco.descargaGb)}</span>}
                            </dd>
                        </div>
                        <div className="min-w-0">
                            <dt className={LABEL}>Destino</dt>
                            <dd className="truncate text-white/90" title={destino?.etiqueta}>
                                {destino ? `${destino.etiqueta} · ${fmtLibre(destino)}` : "Automático (lo elige el OS)"}
                            </dd>
                        </div>
                        <div className="min-w-0">
                            <dt className={LABEL}>Procesador</dt>
                            <dd className="truncate text-white/90" title={datos.procesador?.nombre}>
                                {datos.procesador?.nombre ?? "Automático"}
                            </dd>
                        </div>
                    </dl>
                )}
                {noCabe && (
                    <p className="flex items-start gap-1.5 text-[11px] text-rose-100">
                        <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-[#DC143C]" aria-hidden="true" /> No cabe en ese destino con margen: elige otro almacén o libera espacio.
                    </p>
                )}
                {typeof tam !== "number" && <p className="text-[11px] text-amber-100/90">Primero confirma el tamaño del modelo: no se asume nunca.</p>}
                <DialogFooter className="gap-2 sm:gap-2">
                    <button type="button" className={BTN} onClick={alCerrar}>
                        Cancelar
                    </button>
                    <button type="button" className={BTN_PRIMARY} disabled={!datos || typeof tam !== "number" || noCabe} onClick={() => datos && alConfirmar(datos)}>
                        Confirmar y guardar
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
