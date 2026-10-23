"use client";

/**
 * «Dónde se guarda y se procesa» — para CUALQUIER archivo, carpeta, memoria o modelo.
 * Enseña el medio efectivo (propio o heredado de su carpeta), los almacenes del inventario
 * agrupados (esta neurona · mis neuronas · cuenta y cerebros · externos) con libre/total y aviso
 * si no cabe, «Automático» e «Igual que la carpeta», el procesador (solo modelos, verificado),
 * réplicas opcionales y el alcance. Guarda con `asignar` / `quitarAsignacion`.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Cpu, FolderTree, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bar, BTN, BTN_PRIMARY, LABEL, PILL, PILL_OFF, PILL_ON, SELECT } from "@/components/astraura/s158/shared";
import { cn } from "@/lib/utils";
import { asignar, claveElemento, quitarAsignacion, resolverAsignacion } from "@/lib/recursos-ia/asignaciones";
import { modeloPorId } from "@/lib/recursos-ia/catalogo";
import { cabeEn, verificar } from "@/lib/recursos-ia/compatibilidad";
import type { Alcance, ElementoRef, InventarioRecursos, MedioAlmacen, TipoElemento } from "@/lib/recursos-ia/tipos";
import { useRecursosIa } from "@/lib/recursos-ia/use-recursos-ia";
import { ListaMotivos } from "./seccion-capacidades";
import {
    ALCANCE_PROPIO,
    FOCO,
    ICONO_ALMACEN,
    Linea,
    NOMBRE_TIPO_ALMACEN,
    NivelBadge,
    fmtGb,
    fmtLibre,
    fraccionOcupada,
    nombreNeurona,
    nombreVia,
    seguro,
    todosLosAlmacenes,
    todosLosProcesadores,
    tonoBarra,
    useInventarioRecursos,
    viaEntre,
} from "./piezas";

const NOMBRE_ELEMENTO: Record<TipoElemento, string> = { modelo: "Modelo", archivo: "Archivo", carpeta: "Carpeta", memoria: "Memoria" };

export const AUTO = "auto";
export const IGUAL_CARPETA = "carpeta";

export interface GrupoAlmacenes {
    id: "esta" | "mias" | "cuenta" | "externos";
    titulo: string;
    almacenes: MedioAlmacen[];
}

/** Almacenes agrupados como los ve la persona. Pura. */
export function agruparAlmacenes(inv: InventarioRecursos): GrupoAlmacenes[] {
    const esta = inv.neuronas.find((n) => n.esEsta) ?? inv.neuronas[0];
    const grupos: GrupoAlmacenes[] = [
        { id: "esta", titulo: esta ? `Esta neurona · ${esta.nombre}` : "Esta neurona", almacenes: esta?.almacenes ?? [] },
        { id: "mias", titulo: "Mis neuronas", almacenes: inv.neuronas.filter((n) => n !== esta).flatMap((n) => n.almacenes) },
        { id: "cuenta", titulo: "Cuenta y cerebros", almacenes: inv.almacenesSueltos.filter((a) => a.tipo === "biblioteca" || a.tipo === "carpeta-cerebro") },
        { id: "externos", titulo: "Externos", almacenes: inv.almacenesSueltos.filter((a) => a.tipo !== "biblioteca" && a.tipo !== "carpeta-cerebro") },
    ];
    return grupos.filter((g) => g.almacenes.length > 0);
}

export function SelectorMedioDialog({
    elemento,
    abierto,
    alCerrar,
    padres,
}: {
    elemento: ElementoRef;
    abierto: boolean;
    alCerrar: () => void;
    /** Carpetas que lo contienen, de la más cercana a la raíz (herencia del medio). */
    padres?: ElementoRef[];
}) {
    const [estado, cambiar] = useRecursosIa();
    const { inv, detectando } = useInventarioRecursos(estado.almacenesDeclarados, abierto);
    const propia = estado.asignaciones[claveElemento(elemento.tipo, elemento.id)];
    const efectivo = useMemo(() => seguro(() => resolverAsignacion(estado, elemento, padres ?? []), { almacenEn: AUTO } as ReturnType<typeof resolverAsignacion>), [estado, elemento, padres]);
    const hayCarpeta = (padres?.length ?? 0) > 0 || !!elemento.padreId;

    const inicial = propia ? propia.almacenEn : efectivo.heredadaDe ? IGUAL_CARPETA : AUTO;
    const [almacenEn, setAlmacenEn] = useState(inicial);
    const [procesaEn, setProcesaEn] = useState(propia?.procesaEn ?? AUTO);
    const [replicas, setReplicas] = useState<string[]>(propia?.replicas ?? []);
    const [alcance, setAlcance] = useState<Alcance>(propia?.alcance ?? ALCANCE_PROPIO);

    // Cada vez que se abre, se parte de lo guardado (no de lo que quedó a medias la última vez).
    useEffect(() => {
        if (!abierto) return;
        setAlmacenEn(inicial);
        setProcesaEn(propia?.procesaEn ?? AUTO);
        setReplicas(propia?.replicas ?? []);
        setAlcance(propia?.alcance ?? ALCANCE_PROPIO);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [abierto, elemento.tipo, elemento.id]);

    const almacenes = useMemo(() => (inv ? todosLosAlmacenes(inv) : []), [inv]);
    const grupos = useMemo(() => (inv ? agruparAlmacenes(inv) : []), [inv]);
    const procesadores = useMemo(() => (inv ? todosLosProcesadores(inv) : []), [inv]);
    const modelo = useMemo(() => (elemento.tipo === "modelo" ? seguro(() => modeloPorId(elemento.id), undefined) : undefined), [elemento.tipo, elemento.id]);
    const tam = elemento.tamanoGb ?? (modelo ? estado.tamanosConfirmados[modelo.id] ?? modelo.disco.gb ?? undefined : undefined);

    const etiquetaDe = (id: string | undefined) => {
        if (!id || id === AUTO) return "Automático (lo decide el OS)";
        return almacenes.find((a) => a.id === id)?.etiqueta ?? id;
    };
    const nombreCarpeta = (id?: string) => (id ? padres?.find((p) => p.id === id)?.nombre ?? id : "");
    const almacenElegido = almacenes.find((a) => a.id === almacenEn);
    const verif = (pid: string) => {
        const p = procesadores.find((x) => x.id === pid);
        if (!modelo || !p || !almacenElegido) return null;
        return seguro(() => verificar(modelo, p, almacenElegido, { tamanoConfirmadoGb: estado.tamanosConfirmados[modelo.id], viaAlmacen: viaEntre(p, almacenElegido), privado: alcance.visibilidad === "privada" }), null);
    };
    const compatElegida = procesaEn !== AUTO ? verif(procesaEn) : null;

    const guardar = () => {
        if (almacenEn === IGUAL_CARPETA) {
            cambiar((e) => quitarAsignacion(e, elemento.tipo, elemento.id));
            toast.success("Hereda el medio de su carpeta", { description: elemento.nombre });
        } else {
            cambiar((e) =>
                asignar(e, {
                    elemento,
                    almacenEn,
                    procesaEn: elemento.tipo === "modelo" ? procesaEn : undefined,
                    replicas: replicas.filter((r) => r !== almacenEn),
                    alcance,
                    t: Date.now(),
                }),
            );
            toast.success("Medio guardado", { description: `${elemento.nombre} → ${etiquetaDe(almacenEn)}` });
        }
        alCerrar();
    };

    return (
        <Dialog open={abierto} onOpenChange={(o) => !o && alCerrar()}>
            <DialogContent className="max-h-[90vh] max-w-xl">
                <DialogHeader>
                    <DialogTitle className="text-sm">Dónde se guarda y se procesa</DialogTitle>
                    <DialogDescription className="flex min-w-0 flex-col gap-0.5 text-[11px] text-white/60">
                        <span className="truncate" title={elemento.nombre}>
                            {NOMBRE_ELEMENTO[elemento.tipo]} · {elemento.nombre}
                            {typeof tam === "number" ? ` · ${fmtGb(tam)}` : ""}
                        </span>
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3">
                    {/* Medio efectivo */}
                    <div className="rounded-lg border border-[#007FFF]/35 bg-[#007FFF]/[0.07] p-2.5" data-testid="medio-efectivo">
                        <p className={LABEL}>Ahora</p>
                        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-white/90">
                            <Linea className="min-w-0">{etiquetaDe(efectivo.almacenEn)}</Linea>
                            {efectivo.heredadaDe && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-white/15 px-1.5 py-0.5 text-[9px] leading-none text-white/70">
                                    <FolderTree className="h-2.5 w-2.5" aria-hidden="true" /> heredado de {nombreCarpeta(efectivo.heredadaDe)}
                                </span>
                            )}
                            {elemento.tipo === "modelo" && efectivo.procesaEn && efectivo.procesaEn !== AUTO && (
                                <span className="text-[10px] text-white/55">· procesa {procesadores.find((p) => p.id === efectivo.procesaEn)?.nombre ?? efectivo.procesaEn}</span>
                            )}
                        </p>
                    </div>

                    {/* Dónde se guarda */}
                    <fieldset className="flex min-w-0 flex-col gap-2" role="radiogroup" aria-label="Dónde se guarda">
                        <legend className={cn(LABEL, "mb-1")}>Dónde se guarda</legend>
                        <OpcionMedio
                            valor={AUTO}
                            elegido={almacenEn === AUTO}
                            alElegir={setAlmacenEn}
                            titulo="Automático"
                            sub="El OS elige el mejor sitio según el tamaño, la privacidad y tus neuronas."
                            icono={<Sparkles className="h-3.5 w-3.5 text-[#39FF14]" aria-hidden="true" />}
                        />
                        {hayCarpeta && (
                            <OpcionMedio
                                valor={IGUAL_CARPETA}
                                elegido={almacenEn === IGUAL_CARPETA}
                                alElegir={setAlmacenEn}
                                titulo="Igual que la carpeta"
                                sub={padres?.[0] ? `Sigue a «${padres[0].nombre}» si cambia.` : "Sigue a su carpeta si cambia."}
                                icono={<FolderTree className="h-3.5 w-3.5 text-white/60" aria-hidden="true" />}
                            />
                        )}
                        {!inv && <p className="text-[11px] text-white/55">{detectando ? "Detectando almacenes…" : "Sin inventario todavía."}</p>}
                        {grupos.map((g) => (
                            <div key={g.id} className="flex min-w-0 flex-col gap-1.5" role="group" aria-label={g.titulo}>
                                <p className="truncate text-[10px] font-medium text-white/55" title={g.titulo}>
                                    {g.titulo}
                                </p>
                                {g.almacenes.map((a) => {
                                    const noCabe = typeof tam === "number" && typeof a.libreGb === "number" && !seguro(() => cabeEn(a, tam), true);
                                    const Icono = ICONO_ALMACEN[a.tipo];
                                    const ocupada = fraccionOcupada(a);
                                    return (
                                        <OpcionMedio
                                            key={a.id}
                                            valor={a.id}
                                            elegido={almacenEn === a.id}
                                            alElegir={setAlmacenEn}
                                            deshabilitado={!a.disponible}
                                            titulo={a.etiqueta}
                                            sub={[NOMBRE_TIPO_ALMACEN[a.tipo], fmtLibre(a), a.neuronaId && g.id === "mias" ? nombreNeurona(inv, a.neuronaId) : null, nombreVia(a.via)].filter(Boolean).join(" · ")}
                                            icono={<Icono className="h-3.5 w-3.5 text-white/60" aria-hidden="true" />}
                                        >
                                            {ocupada !== null && <Bar value={ocupada * 100} tone={tonoBarra(a)} className="mt-1" />}
                                            {noCabe && (
                                                <span className="mt-1 flex items-start gap-1 text-[10px] text-rose-100" data-testid={`no-cabe-${a.id}`}>
                                                    <TriangleAlert className="mt-0.5 h-2.5 w-2.5 shrink-0 text-[#DC143C]" aria-hidden="true" /> No cabe: necesita {fmtGb(tam)} y quedan {fmtGb(a.libreGb)}.
                                                </span>
                                            )}
                                            {!a.privado && alcance.visibilidad === "privada" && (
                                                <span className="mt-1 flex items-start gap-1 text-[10px] text-amber-100/90">
                                                    <TriangleAlert className="mt-0.5 h-2.5 w-2.5 shrink-0 text-[#FFBF00]" aria-hidden="true" /> No es privado: lo tuyo saldría de la cuenta.
                                                </span>
                                            )}
                                        </OpcionMedio>
                                    );
                                })}
                            </div>
                        ))}
                    </fieldset>

                    {/* Procesador (solo modelos) */}
                    {elemento.tipo === "modelo" && (
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <label className="flex min-w-0 flex-col gap-1">
                                <span className={LABEL}>
                                    <Cpu className="mr-1 inline h-3 w-3" aria-hidden="true" /> Dónde se procesa
                                </span>
                                <select aria-label="Procesador" className={SELECT} value={procesaEn} onChange={(e) => setProcesaEn(e.target.value)}>
                                    <option value={AUTO}>Automático</option>
                                    {procesadores.map((p) => {
                                        const c = verif(p.id);
                                        return (
                                            <option key={p.id} value={p.id}>
                                                {p.nombre}
                                                {nombreNeurona(inv, p.neuronaId) ? ` · ${nombreNeurona(inv, p.neuronaId)}` : ""}
                                                {c ? ` — ${c.nivel}` : ""}
                                            </option>
                                        );
                                    })}
                                </select>
                            </label>
                            {!modelo && <p className="text-[10px] text-white/50">Este modelo no está en el catálogo: no se puede comprobar su compatibilidad.</p>}
                            {modelo && procesaEn !== AUTO && !almacenElegido && <p className="text-[10px] text-white/50">Elige un almacén concreto para comprobar la compatibilidad.</p>}
                            {compatElegida && (
                                <div className="flex flex-col gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] p-2" data-testid="compat-procesador">
                                    <NivelBadge nivel={compatElegida.nivel} className="self-start" />
                                    <ListaMotivos motivos={compatElegida.motivos} />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Réplicas */}
                    {almacenEn !== IGUAL_CARPETA && almacenes.length > 1 && (
                        <details className="min-w-0 rounded-lg border border-white/10 bg-white/[0.02] p-2">
                            <summary className={cn("cursor-pointer text-[11px] text-white/75", FOCO)}>Réplicas (copias extra, opcional){replicas.length ? ` · ${replicas.length}` : ""}</summary>
                            <ul className="mt-2 flex flex-col gap-1">
                                {almacenes
                                    .filter((a) => a.id !== almacenEn)
                                    .map((a) => (
                                        <li key={a.id}>
                                            <label className="flex min-w-0 cursor-pointer items-center gap-2 text-[11px] text-white/80">
                                                <input
                                                    type="checkbox"
                                                    className="h-3.5 w-3.5 cursor-pointer accent-[#007FFF]"
                                                    checked={replicas.includes(a.id)}
                                                    onChange={(e) => setReplicas((r) => (e.target.checked ? [...r, a.id] : r.filter((x) => x !== a.id)))}
                                                />
                                                <Linea className="min-w-0 flex-1">{a.etiqueta}</Linea>
                                                <span className="shrink-0 text-[10px] text-white/45">{fmtGb(a.libreGb)}</span>
                                            </label>
                                        </li>
                                    ))}
                            </ul>
                        </details>
                    )}

                    {/* Alcance */}
                    {almacenEn !== IGUAL_CARPETA && (
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                            <span className={LABEL}>Visibilidad</span>
                            <div className="flex gap-1.5" role="group" aria-label="Visibilidad">
                                {(["privada", "publica"] as const).map((v) => (
                                    <button
                                        key={v}
                                        type="button"
                                        aria-pressed={alcance.visibilidad === v}
                                        className={cn(PILL, alcance.visibilidad === v ? PILL_ON : PILL_OFF, "flex-1 justify-center sm:flex-none", FOCO)}
                                        onClick={() => setAlcance((a) => ({ ...a, visibilidad: v }))}
                                    >
                                        {v === "privada" ? "Privada" : "Pública"}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                    <button type="button" className={BTN} onClick={alCerrar}>
                        Cancelar
                    </button>
                    <button type="button" className={BTN_PRIMARY} onClick={guardar}>
                        Guardar
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function OpcionMedio({
    valor,
    elegido,
    alElegir,
    titulo,
    sub,
    icono,
    deshabilitado,
    children,
}: {
    valor: string;
    elegido: boolean;
    alElegir: (v: string) => void;
    titulo: string;
    sub?: string;
    icono: ReactNode;
    deshabilitado?: boolean;
    children?: ReactNode;
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={elegido}
            disabled={deshabilitado}
            onClick={() => alElegir(valor)}
            className={cn(
                "flex w-full min-w-0 cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50",
                elegido ? "border-[#007FFF]/60 bg-[#007FFF]/[0.12]" : "border-white/10 bg-white/[0.02] hover:border-white/25",
                FOCO,
            )}
        >
            <span className="mt-0.5 shrink-0">{icono}</span>
            <span className="flex min-w-0 flex-1 flex-col">
                <Linea className="text-[11px] font-medium text-white/90">{titulo}</Linea>
                {sub && <Linea className="text-[10px] text-white/50">{sub}</Linea>}
                {children}
            </span>
            <span className={cn("mt-1 h-3 w-3 shrink-0 rounded-full border", elegido ? "border-[#007FFF] bg-[#007FFF] shadow-[0_0_6px_#007FFF]" : "border-white/30")} aria-hidden="true" />
        </button>
    );
}
