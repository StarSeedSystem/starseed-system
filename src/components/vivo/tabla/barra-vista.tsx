"use client";
/**
 * Ordenar y filtrar «para mí»: nada de esto viaja al documento compartido ni cambia lo que ven
 * las demás personas; se recuerda en este dispositivo.
 */
import * as Popover from "@radix-ui/react-popover";
import { ArrowDownAZ, ArrowUpAZ, ListFilter, Plus, X } from "lucide-react";
import { opcionesOrdenadas, type Columna } from "@/lib/vivo/tabla/modelo";
import {
    ETIQUETA_OPERADOR,
    filtroNecesitaValor,
    operadoresDe,
    vistaVacia,
    type Filtro,
    type VistaTabla,
} from "@/lib/vivo/tabla/vista";
import css from "./tabla.module.css";

export type PanelVista = "orden" | "filtros" | null;

export function BarraVista({
    columnas,
    vista,
    alCambiar,
    abierto,
    setAbierto,
    filaVisibles,
    filasTotal,
}: {
    columnas: Columna[];
    vista: VistaTabla;
    alCambiar: (v: VistaTabla) => void;
    abierto: PanelVista;
    setAbierto: (p: PanelVista) => void;
    filaVisibles: number;
    filasTotal: number;
}) {
    const nombreDe = (id: string) => columnas.find((c) => c.id === id)?.nombre.v ?? "una columna";
    const orden = vista.orden;
    return (
        <div className={`${css.vista} ${css.panel}`} role="group" aria-label="Tu vista de la tabla: orden y filtros">
            <Popover.Root open={abierto === "orden"} onOpenChange={(o) => setAbierto(o ? "orden" : null)}>
                <Popover.Trigger className={`${css.boton} ${css.botonChico}`} aria-haspopup="dialog">
                    {orden?.dir === "desc" ? <ArrowDownAZ size={16} aria-hidden="true" /> : <ArrowUpAZ size={16} aria-hidden="true" />}
                    Ordenar
                </Popover.Trigger>
                <Popover.Portal>
                    <Popover.Content className={css.flotante} align="start" sideOffset={6} collisionPadding={12}>
                        <PanelOrden columnas={columnas} vista={vista} alCambiar={alCambiar} />
                    </Popover.Content>
                </Popover.Portal>
            </Popover.Root>

            <Popover.Root open={abierto === "filtros"} onOpenChange={(o) => setAbierto(o ? "filtros" : null)}>
                <Popover.Trigger className={`${css.boton} ${css.botonChico}`} aria-haspopup="dialog">
                    <ListFilter size={16} aria-hidden="true" />
                    Filtrar
                </Popover.Trigger>
                <Popover.Portal>
                    <Popover.Content className={css.flotante} style={{ width: "min(420px, calc(100vw - 24px))" }} align="start" sideOffset={6} collisionPadding={12}>
                        <PanelFiltros columnas={columnas} vista={vista} alCambiar={alCambiar} />
                    </Popover.Content>
                </Popover.Portal>
            </Popover.Root>

            {orden ? (
                <span className={`${css.chipVista} ss-redondo`}>
                    Orden: {nombreDe(orden.col)} {orden.dir === "asc" ? "de menor a mayor" : "de mayor a menor"}
                    <button type="button" className="ss-redondo" aria-label="Quitar el orden" onClick={() => alCambiar({ ...vista, orden: null })}>
                        <X size={14} aria-hidden="true" />
                    </button>
                </span>
            ) : null}
            {vista.filtros.map((f, i) => (
                <span key={i} className={`${css.chipVista} ss-redondo`}>
                    {nombreDe(f.col)} {ETIQUETA_OPERADOR[f.op]}
                    {filtroNecesitaValor(f.op) && f.valor ? ` «${f.valor}»` : ""}
                    <button
                        type="button"
                        className="ss-redondo"
                        aria-label={`Quitar el filtro de ${nombreDe(f.col)}`}
                        onClick={() => alCambiar({ ...vista, filtros: vista.filtros.filter((_, k) => k !== i) })}
                    >
                        <X size={14} aria-hidden="true" />
                    </button>
                </span>
            ))}
            <span className={css.secundario} style={{ marginLeft: "auto" }} role="status">
                {vistaVacia(vista)
                    ? `${filasTotal} ${filasTotal === 1 ? "fila" : "filas"}`
                    : `Viendo ${filaVisibles} de ${filasTotal} · solo tú ves este orden y estos filtros`}
            </span>
            {!vistaVacia(vista) ? (
                <button type="button" className={`${css.boton} ${css.botonChico}`} onClick={() => alCambiar({ orden: null, filtros: [] })}>
                    Quitar todo
                </button>
            ) : null}
        </div>
    );
}

function PanelOrden({ columnas, vista, alCambiar }: { columnas: Columna[]; vista: VistaTabla; alCambiar: (v: VistaTabla) => void }) {
    const orden = vista.orden;
    return (
        <>
            <span className={css.rotulo}>Ordenar solo para mí</span>
            <div className={css.campo}>
                <label htmlFor="orden-col">Columna</label>
                <select
                    id="orden-col"
                    className={css.selector}
                    value={orden?.col ?? ""}
                    onChange={(e) => alCambiar({ ...vista, orden: e.target.value ? { col: e.target.value, dir: orden?.dir ?? "asc" } : null })}
                >
                    <option value="">Como está en la tabla</option>
                    {columnas.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.nombre.v}
                        </option>
                    ))}
                </select>
            </div>
            {orden ? (
                <div className={css.fichas} role="radiogroup" aria-label="Sentido del orden">
                    <button type="button" role="radio" aria-checked={orden.dir === "asc"} className={`${css.boton} ${orden.dir === "asc" ? css.botonPrimario : ""}`} onClick={() => alCambiar({ ...vista, orden: { ...orden, dir: "asc" } })}>
                        <ArrowUpAZ size={16} aria-hidden="true" /> De menor a mayor
                    </button>
                    <button type="button" role="radio" aria-checked={orden.dir === "desc"} className={`${css.boton} ${orden.dir === "desc" ? css.botonPrimario : ""}`} onClick={() => alCambiar({ ...vista, orden: { ...orden, dir: "desc" } })}>
                        <ArrowDownAZ size={16} aria-hidden="true" /> De mayor a menor
                    </button>
                </div>
            ) : null}
            <p className={css.ayuda}>No cambia el orden de la tabla que ven las demás personas.</p>
        </>
    );
}

function PanelFiltros({ columnas, vista, alCambiar }: { columnas: Columna[]; vista: VistaTabla; alCambiar: (v: VistaTabla) => void }) {
    const poner = (i: number, f: Filtro) => alCambiar({ ...vista, filtros: vista.filtros.map((x, k) => (k === i ? f : x)) });
    const nuevo = () => {
        const c = columnas[0];
        if (!c) return;
        alCambiar({ ...vista, filtros: [...vista.filtros, { col: c.id, op: operadoresDe(c)[0], valor: "" }] });
    };
    return (
        <>
            <span className={css.rotulo}>Filtrar solo para mí</span>
            <div className={css.listaOpciones} style={{ gap: 10 }}>
                {vista.filtros.length === 0 ? <p className={css.ayuda}>Ningún filtro activo.</p> : null}
                {vista.filtros.map((f, i) => {
                    const col = columnas.find((c) => c.id === f.col);
                    const ops = col ? operadoresDe(col) : [];
                    return (
                        <div key={i} className={css.seccion} style={{ padding: 10, gap: 8 }}>
                            <select
                                className={css.selector}
                                aria-label={`Columna del filtro ${i + 1}`}
                                value={f.col}
                                onChange={(e) => {
                                    const c = columnas.find((x) => x.id === e.target.value);
                                    if (c) poner(i, { col: c.id, op: operadoresDe(c)[0], valor: "" });
                                }}
                            >
                                {columnas.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.nombre.v}
                                    </option>
                                ))}
                            </select>
                            <select className={css.selector} aria-label={`Condición del filtro ${i + 1}`} value={f.op} onChange={(e) => poner(i, { ...f, op: e.target.value as Filtro["op"] })}>
                                {ops.map((o) => (
                                    <option key={o} value={o}>
                                        {ETIQUETA_OPERADOR[o]}
                                    </option>
                                ))}
                            </select>
                            {filtroNecesitaValor(f.op) ? (
                                col?.tipo.v === "seleccion" ? (
                                    <select className={css.selector} aria-label={`Valor del filtro ${i + 1}`} value={f.valor} onChange={(e) => poner(i, { ...f, valor: e.target.value })}>
                                        <option value="">Elige una opción</option>
                                        {opcionesOrdenadas(col).map((o) => (
                                            <option key={o.id} value={o.nombre}>
                                                {o.nombre}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        className={css.entrada}
                                        aria-label={`Valor del filtro ${i + 1}`}
                                        type={col?.tipo.v === "fecha" ? "date" : "text"}
                                        inputMode={col?.tipo.v === "numero" || col?.tipo.v === "calculado" ? "decimal" : undefined}
                                        value={f.valor}
                                        placeholder="Valor"
                                        onChange={(e) => poner(i, { ...f, valor: e.target.value })}
                                    />
                                )
                            ) : null}
                            <button type="button" className={`${css.boton} ${css.botonChico} ${css.botonPeligro}`} onClick={() => alCambiar({ ...vista, filtros: vista.filtros.filter((_, k) => k !== i) })}>
                                <X size={14} aria-hidden="true" /> Quitar este filtro
                            </button>
                        </div>
                    );
                })}
            </div>
            <button type="button" className={css.boton} onClick={nuevo} disabled={!columnas.length}>
                <Plus size={16} aria-hidden="true" /> Añadir un filtro
            </button>
            <p className={css.ayuda}>Las filas que no cumplan todos los filtros se ocultan solo para ti. Los totales del pie usan las filas que ves.</p>
        </>
    );
}
