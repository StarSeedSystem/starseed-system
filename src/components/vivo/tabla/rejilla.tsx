"use client";
/**
 * Rejilla de escritorio de la tabla de datos.
 *
 * · Teclado como una hoja de cálculo: flechas (Mayús extiende, Ctrl salta al borde), Tab y Mayús+Tab,
 *   Enter/F2 editar, Suprimir vaciar, Esc, Ctrl+A/C/X/V/Z/Y, y escribir sobre una celda la sustituye.
 * · Copiar/pegar rangos como TSV (compatible con Excel, Sheets y LibreOffice).
 * · Solo se pintan las filas visibles (alto fijo), así que 3 000 filas van fluidas.
 * · Presencia: quien está en una celda la tiene rodeada de su color, con su nombre.
 * · Columnas: redimensionar arrastrando el borde, reordenar arrastrando la cabecera y menú vertical.
 */
import * as Menu from "@radix-ui/react-dropdown-menu";
import {
    ArrowDown,
    ArrowDownZA,
    ArrowLeftToLine,
    ArrowRightToLine,
    ArrowUp,
    ArrowUpAZ,
    ChevronDown,
    Copy,
    EllipsisVertical,
    ListFilter,
    Pencil,
    Plus,
    Trash2,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as TeclaReact } from "react";
import { FN_DE_TOTAL, textoCalculado, type Calculadora } from "@/lib/vivo/tabla/formulas";
import { matrizDesdeTsv, tsvDesdeRango } from "@/lib/vivo/tabla/csv";
import { ETIQUETA_TIPO, ETIQUETA_TOTAL, LIMITES, type Columna, type Tabla, type TotalFn } from "@/lib/vivo/tabla/modelo";
import type { Posicion, Presente } from "@/lib/vivo/tabla/presencia";
import type { VistaTabla } from "@/lib/vivo/tabla/vista";
import { CeldaVista } from "./celda-vista";
import { EditorCelda, type FinEdicion, type Mover } from "./celda-editor";
import type { PerfilCorto } from "./personas";
import { ALTO_CABECERA, ALTO_FILA, ANCHO_CANAL, ICONO_TIPO, totalesPara, type AccionesTabla } from "./tipos";
import css from "./tabla.module.css";

export interface PropsRejilla {
    tabla: Tabla;
    calc: Calculadora;
    columnas: Columna[];
    filaIds: string[];
    puedeEditar: boolean;
    /** Solo se puede reordenar filas cuando la vista no ordena ni filtra. */
    ordenEditable: boolean;
    vista: VistaTabla;
    presentes: readonly Presente[];
    perfil: (uid: string) => PerfilCorto | undefined;
    candidatosPersonas: PerfilCorto[];
    acciones: AccionesTabla;
    onPosicion: (pos: Posicion) => void;
    mensajeVacio: string;
    /** Cada vez que cambia este número la rejilla baja hasta la última fila (p. ej. tras «Añadir fila»). */
    irAlFinal?: number;
}

interface Punto {
    fila: string;
    col: string;
}
interface Edicion extends Punto {
    tecleado: string | null;
}

const SOBRANTE = 6;

function ctrlOAlt(e: { ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
    return e.ctrlKey || e.metaKey || e.altKey;
}

export function Rejilla(p: PropsRejilla) {
    const { tabla, calc, columnas, filaIds, puedeEditar, ordenEditable, vista, presentes, perfil, candidatosPersonas, acciones, onPosicion } = p;
    const scroller = useRef<HTMLDivElement>(null);
    const [foco, setFoco] = useState<Punto | null>(null);
    const [ancla, setAncla] = useState<Punto | null>(null);
    const [edicion, setEdicion] = useState<Edicion | null>(null);
    const [scroll, setScroll] = useState({ top: 0, alto: 600 });
    const [redim, setRedim] = useState<{ col: string; ancho: number } | null>(null);
    const [arrastre, setArrastre] = useState<{ tipo: "col" | "fila"; id: string; sobre: string | null } | null>(null);
    const seleccionando = useRef(false);
    const ultimo = useRef({ f: 0, c: 0 });

    const finalPedido = useRef(p.irAlFinal ?? 0);
    useEffect(() => {
        const n = p.irAlFinal ?? 0;
        if (n === finalPedido.current) return;
        finalPedido.current = n;
        const el = scroller.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [p.irAlFinal, filaIds.length]);

    const idxFila = useMemo(() => new Map(filaIds.map((id, i) => [id, i])), [filaIds]);
    const idxCol = useMemo(() => new Map(columnas.map((c, i) => [c.id, i])), [columnas]);
    const anchos = useMemo(
        () => columnas.map((c) => (redim && redim.col === c.id ? redim.ancho : c.ancho.v)),
        [columnas, redim],
    );
    const anchoTotal = ANCHO_CANAL + anchos.reduce((a, b) => a + b, 0);

    // Si la fila o la columna con el foco desaparece (la borró otra persona), el foco pasa al vecino.
    useEffect(() => {
        if (!foco) return;
        const f = idxFila.get(foco.fila);
        const c = idxCol.get(foco.col);
        if (f !== undefined && c !== undefined) {
            ultimo.current = { f, c };
            return;
        }
        if (!filaIds.length || !columnas.length) {
            setFoco(null);
            setAncla(null);
            setEdicion(null);
            return;
        }
        const nf = Math.min(f ?? ultimo.current.f, filaIds.length - 1);
        const nc = Math.min(c ?? ultimo.current.c, columnas.length - 1);
        setFoco({ fila: filaIds[nf], col: columnas[nc].id });
        setAncla({ fila: filaIds[nf], col: columnas[nc].id });
        setEdicion(null);
    }, [foco, idxFila, idxCol, filaIds, columnas]);

    // Presencia: dónde estoy yo.
    useEffect(() => {
        onPosicion({ fila: foco?.fila ?? null, col: foco?.col ?? null, editando: !!edicion });
    }, [foco, edicion, onPosicion]);

    // Medida del área visible.
    useEffect(() => {
        const el = scroller.current;
        if (!el) return;
        const medir = () => setScroll((s) => (s.alto === el.clientHeight ? s : { ...s, alto: el.clientHeight }));
        medir();
        if (typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(medir);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const alScroll = useCallback(() => {
        const el = scroller.current;
        if (!el) return;
        setScroll((s) => (Math.abs(s.top - el.scrollTop) < ALTO_FILA / 2 ? s : { top: el.scrollTop, alto: el.clientHeight }));
    }, []);

    // Soltar el ratón termina la selección arrastrada.
    useEffect(() => {
        const soltar = () => {
            seleccionando.current = false;
        };
        window.addEventListener("mouseup", soltar);
        return () => window.removeEventListener("mouseup", soltar);
    }, []);

    const foc = foco ? { f: idxFila.get(foco.fila) ?? -1, c: idxCol.get(foco.col) ?? -1 } : { f: -1, c: -1 };
    const anc = ancla ? { f: idxFila.get(ancla.fila) ?? -1, c: idxCol.get(ancla.col) ?? -1 } : foc;
    const rango = useMemo(() => {
        if (foc.f < 0 || foc.c < 0) return null;
        const a = anc.f < 0 || anc.c < 0 ? foc : anc;
        return { f0: Math.min(a.f, foc.f), f1: Math.max(a.f, foc.f), c0: Math.min(a.c, foc.c), c1: Math.max(a.c, foc.c) };
    }, [foc.f, foc.c, anc.f, anc.c]); // eslint-disable-line react-hooks/exhaustive-deps
    const multiple = !!rango && (rango.f1 > rango.f0 || rango.c1 > rango.c0);

    const presentesPorCelda = useMemo(() => {
        const m = new Map<string, Presente>();
        for (const pr of presentes) if (pr.fila && pr.col) m.set(`${pr.fila}|${pr.col}`, pr);
        return m;
    }, [presentes]);

    const verCelda = useCallback(
        (f: number, c: number) => {
            const el = scroller.current;
            if (!el) return;
            const arriba = ALTO_CABECERA + f * ALTO_FILA;
            if (arriba < el.scrollTop + ALTO_CABECERA) el.scrollTop = arriba - ALTO_CABECERA;
            else if (arriba + ALTO_FILA > el.scrollTop + el.clientHeight - ALTO_CABECERA) el.scrollTop = arriba + ALTO_FILA - el.clientHeight + ALTO_CABECERA;
            let izq = ANCHO_CANAL;
            for (let i = 0; i < c; i++) izq += anchos[i];
            const ancho = anchos[c] ?? 0;
            if (izq < el.scrollLeft + ANCHO_CANAL) el.scrollLeft = izq - ANCHO_CANAL;
            else if (izq + ancho > el.scrollLeft + el.clientWidth) el.scrollLeft = izq + ancho - el.clientWidth;
        },
        [anchos],
    );

    const irA = useCallback(
        (f: number, c: number, extender: boolean) => {
            if (!filaIds.length || !columnas.length) return;
            const nf = Math.max(0, Math.min(filaIds.length - 1, f));
            const nc = Math.max(0, Math.min(columnas.length - 1, c));
            const punto = { fila: filaIds[nf], col: columnas[nc].id };
            setFoco(punto);
            if (!extender) setAncla(punto);
            verCelda(nf, nc);
        },
        [filaIds, columnas, verCelda],
    );

    const enfocar = useCallback(() => scroller.current?.focus({ preventScroll: true }), []);

    const empezarEdicion = useCallback(
        (f: number, c: number, tecleado: string | null) => {
            const col = columnas[c];
            const fila = filaIds[f];
            if (!col || !fila) return;
            if (col.tipo.v === "calculado") {
                if (puedeEditar) acciones.abrirColumna(col.id);
                return;
            }
            if (!puedeEditar) return;
            if (col.tipo.v === "casilla") {
                acciones.alternarCasilla(fila, col.id);
                return;
            }
            setEdicion({ fila, col: col.id, tecleado });
        },
        [columnas, filaIds, puedeEditar, acciones],
    );

    const terminarEdicion = useCallback(
        (fin: FinEdicion) => {
            const ed = edicion;
            setEdicion(null);
            if (!ed) return;
            if (fin.tipo === "cancelar") {
                enfocar();
                return;
            }
            if (fin.tipo === "texto") acciones.escribirTexto(ed.fila, ed.col, fin.texto);
            else acciones.escribir([{ filaId: ed.fila, colId: ed.col, valor: fin.valor }]);
            const f = idxFila.get(ed.fila) ?? 0;
            const c = idxCol.get(ed.col) ?? 0;
            const mover: Mover = fin.mover;
            if (mover === "abajo") irA(f + 1, c, false);
            else if (mover === "arriba") irA(f - 1, c, false);
            else if (mover === "derecha") irA(f, c + 1, false);
            else if (mover === "izquierda") irA(f, c - 1, false);
            if (mover !== "ninguno") enfocar();
            else window.setTimeout(enfocar, 0);
        },
        [edicion, acciones, idxFila, idxCol, irA, enfocar],
    );

    const idsDelRango = useCallback(() => {
        if (!rango) return null;
        return {
            filas: filaIds.slice(rango.f0, rango.f1 + 1),
            cols: columnas.slice(rango.c0, rango.c1 + 1).map((c) => c.id),
        };
    }, [rango, filaIds, columnas]);

    const teclas = (e: TeclaReact<HTMLDivElement>) => {
        if (e.target !== e.currentTarget || edicion) return;
        const nf = filaIds.length;
        const nc = columnas.length;
        if (!nf || !nc) return;
        const ctrl = e.ctrlKey || e.metaKey;
        // Sin celda activa todavía (se llegó con el teclado): la primera tecla la coloca en A1.
        if (foc.f < 0 || foc.c < 0) {
            if (e.key === "Tab" || ctrlOAlt(e)) return;
            e.preventDefault();
            irA(0, 0, false);
            return;
        }
        const cur = foc;
        const ir = (f: number, c: number) => {
            e.preventDefault();
            irA(f, c, e.shiftKey);
        };
        switch (e.key) {
            case "ArrowDown": return ir(ctrl ? nf - 1 : cur.f + 1, cur.c);
            case "ArrowUp": return ir(ctrl ? 0 : cur.f - 1, cur.c);
            case "ArrowRight": return ir(cur.f, ctrl ? nc - 1 : cur.c + 1);
            case "ArrowLeft": return ir(cur.f, ctrl ? 0 : cur.c - 1);
            case "Home": return ir(ctrl ? 0 : cur.f, 0);
            case "End": return ir(ctrl ? nf - 1 : cur.f, nc - 1);
            case "PageDown": return ir(cur.f + 10, cur.c);
            case "PageUp": return ir(cur.f - 10, cur.c);
            case "Tab": {
                // Tab recorre las celdas, pero no encierra: en la última (o la primera) deja salir de la tabla.
                const sig = e.shiftKey ? cur.c - 1 : cur.c + 1;
                if (sig >= nc) {
                    if (cur.f >= nf - 1) return;
                    e.preventDefault();
                    irA(cur.f + 1, 0, false);
                } else if (sig < 0) {
                    if (cur.f <= 0) return;
                    e.preventDefault();
                    irA(cur.f - 1, nc - 1, false);
                } else {
                    e.preventDefault();
                    irA(cur.f, sig, false);
                }
                return;
            }
            case "Enter":
            case "F2":
                e.preventDefault();
                empezarEdicion(cur.f, cur.c, null);
                return;
            case "Delete":
            case "Backspace": {
                if (!puedeEditar) return;
                e.preventDefault();
                const r = idsDelRango();
                if (r) acciones.limpiar(r.filas, r.cols);
                return;
            }
            case "Escape":
                if (multiple && foco) setAncla(foco);
                return;
            case " ":
                if (columnas[cur.c]?.tipo.v === "casilla" && puedeEditar) {
                    e.preventDefault();
                    acciones.alternarCasilla(filaIds[cur.f], columnas[cur.c].id);
                }
                return;
        }
        if (ctrl && (e.key === "a" || e.key === "A")) {
            e.preventDefault();
            setAncla({ fila: filaIds[0], col: columnas[0].id });
            setFoco({ fila: filaIds[nf - 1], col: columnas[nc - 1].id });
            return;
        }
        if (ctrl && (e.key === "z" || e.key === "Z")) {
            e.preventDefault();
            if (e.shiftKey) acciones.rehacer();
            else acciones.deshacer();
            return;
        }
        if (ctrl && (e.key === "y" || e.key === "Y")) {
            e.preventDefault();
            acciones.rehacer();
            return;
        }
        if (!ctrl && !e.altKey && e.key.length === 1 && puedeEditar) {
            e.preventDefault();
            empezarEdicion(cur.f, cur.c, e.key);
        }
    };

    const alCopiar = (e: React.ClipboardEvent<HTMLDivElement>, cortar: boolean) => {
        if (e.target !== e.currentTarget) return;
        const r = idsDelRango();
        if (!r) return;
        const tsv = tsvDesdeRango(tabla, r.filas, r.cols, { calc, nombrePersona: (uid) => perfil(uid)?.nombre ?? null });
        e.clipboardData.setData("text/plain", tsv);
        e.preventDefault();
        if (cortar && puedeEditar) acciones.limpiar(r.filas, r.cols);
    };

    const alPegar = (e: React.ClipboardEvent<HTMLDivElement>) => {
        if (e.target !== e.currentTarget || !puedeEditar || !rango) return;
        const texto = e.clipboardData.getData("text/plain");
        if (!texto) return;
        e.preventDefault();
        let matriz = matrizDesdeTsv(texto);
        // Una sola celda pegada sobre un rango grande rellena todo el rango, como en una hoja de cálculo.
        if (matriz.length === 1 && matriz[0].length === 1 && multiple) {
            const alto = rango.f1 - rango.f0 + 1;
            const ancho = rango.c1 - rango.c0 + 1;
            matriz = Array.from({ length: alto }, () => Array.from({ length: ancho }, () => matriz[0][0]));
        }
        const filasNuevas = acciones.pegar(matriz, { filaIds, desdeFila: rango.f0, colIds: columnas.map((c) => c.id), desdeCol: rango.c0 });
        const alto = matriz.length;
        const ancho = Math.max(...matriz.map((f) => f.length));
        const f1 = Math.min(rango.f0 + alto - 1, filaIds.length + filasNuevas - 1);
        const c1 = Math.min(rango.c0 + ancho - 1, columnas.length - 1);
        setAncla({ fila: filaIds[rango.f0], col: columnas[rango.c0].id });
        if (f1 < filaIds.length) setFoco({ fila: filaIds[f1], col: columnas[c1].id });
    };

    // ── redimensionar columnas ──
    const empezarRedim = (e: React.PointerEvent<HTMLDivElement>, col: Columna) => {
        if (!puedeEditar) return;
        e.preventDefault();
        e.stopPropagation();
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const x0 = e.clientX;
        const w0 = col.ancho.v;
        let ultimoAncho = w0;
        const mover = (ev: PointerEvent) => {
            ultimoAncho = Math.max(LIMITES.anchoMin, Math.min(LIMITES.anchoMax, Math.round(w0 + ev.clientX - x0)));
            setRedim({ col: col.id, ancho: ultimoAncho });
        };
        const soltar = () => {
            el.removeEventListener("pointermove", mover);
            el.removeEventListener("pointerup", soltar);
            el.removeEventListener("pointercancel", soltar);
            setRedim(null);
            if (ultimoAncho !== w0) acciones.redimensionar(col.id, ultimoAncho);
        };
        el.addEventListener("pointermove", mover);
        el.addEventListener("pointerup", soltar);
        el.addEventListener("pointercancel", soltar);
    };

    // ── ventana de filas visibles ──
    const primera = Math.max(0, Math.floor((scroll.top - ALTO_CABECERA) / ALTO_FILA) - SOBRANTE);
    const ultima = Math.min(filaIds.length - 1, Math.ceil((scroll.top + scroll.alto) / ALTO_FILA) + SOBRANTE);
    const visibles: number[] = [];
    for (let i = primera; i <= ultima; i++) visibles.push(i);

    const puedeArrastrarFilas = puedeEditar && ordenEditable;
    const activa = foco && foc.f >= 0 && foc.c >= 0 ? `celda-${foco.fila}-${foco.col}` : undefined;

    return (
        <div className={`${css.rejillaMarco} ${css.panel}`}>
            <div
                ref={scroller}
                className={css.desplazador}
                role="grid"
                tabIndex={0}
                aria-label="Tabla de datos"
                aria-rowcount={filaIds.length + 1}
                aria-colcount={columnas.length}
                aria-multiselectable="true"
                aria-activedescendant={activa}
                onScroll={alScroll}
                onKeyDown={teclas}
                onCopy={(e) => alCopiar(e, false)}
                onCut={(e) => alCopiar(e, true)}
                onPaste={alPegar}
            >
                <div className={css.lienzo} style={{ width: anchoTotal }}>
                    {/* ── cabecera ── */}
                    <div className={css.cabecera} role="row" aria-rowindex={1}>
                        <div className={css.canal} style={{ height: ALTO_CABECERA, cursor: "default" }} role="columnheader" aria-label="Número de fila" />
                        {columnas.map((col, j) => {
                            const Icono = ICONO_TIPO[col.tipo.v];
                            const orden = vista.orden?.col === col.id ? vista.orden.dir : null;
                            return (
                                <div
                                    key={col.id}
                                    role="columnheader"
                                    aria-colindex={j + 1}
                                    aria-sort={orden === "asc" ? "ascending" : orden === "desc" ? "descending" : "none"}
                                    className={css.cabeceraCelda}
                                    style={{ width: anchos[j] }}
                                    draggable={puedeEditar}
                                    data-arrastrando={arrastre?.tipo === "col" && arrastre.id === col.id}
                                    data-destino={arrastre?.tipo === "col" && arrastre.sobre === col.id && arrastre.id !== col.id}
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData("text/plain", col.id);
                                        e.dataTransfer.effectAllowed = "move";
                                        setArrastre({ tipo: "col", id: col.id, sobre: null });
                                    }}
                                    onDragOver={(e) => {
                                        if (arrastre?.tipo !== "col") return;
                                        e.preventDefault();
                                        if (arrastre.sobre !== col.id) setArrastre({ ...arrastre, sobre: col.id });
                                    }}
                                    onDrop={(e) => {
                                        if (arrastre?.tipo !== "col") return;
                                        e.preventDefault();
                                        acciones.moverColumna(arrastre.id, j);
                                        setArrastre(null);
                                    }}
                                    onDragEnd={() => setArrastre(null)}
                                >
                                    <Icono size={15} className={css.tipoIcono} aria-label={ETIQUETA_TIPO[col.tipo.v]} role="img" />
                                    <span className={css.cabeceraNombre} title={col.nombre.v}>
                                        {col.nombre.v}
                                    </span>
                                    {orden ? (
                                        orden === "asc" ? (
                                            <ArrowUp size={14} aria-hidden="true" />
                                        ) : (
                                            <ArrowDown size={14} aria-hidden="true" />
                                        )
                                    ) : null}
                                    <MenuColumna col={col} indice={j} total={columnas.length} puedeEditar={puedeEditar} acciones={acciones} />
                                    <div
                                        className={css.agarre}
                                        data-activo={redim?.col === col.id}
                                        onPointerDown={(e) => empezarRedim(e, col)}
                                        onDoubleClick={() => puedeEditar && acciones.redimensionar(col.id, LIMITES.anchoDefecto)}
                                        role="separator"
                                        aria-orientation="vertical"
                                        aria-label={`Cambiar el ancho de ${col.nombre.v}`}
                                    />
                                </div>
                            );
                        })}
                    </div>

                    {/* ── cuerpo ── */}
                    <div className={css.cuerpo} style={{ height: Math.max(filaIds.length * ALTO_FILA, filaIds.length ? 0 : 120) }}>
                        {!filaIds.length ? (
                            <div className={css.vacio} role="status" style={{ position: "sticky", left: 0, width: "min(100%, 100vw)" }}>
                                <p>{p.mensajeVacio}</p>
                            </div>
                        ) : null}
                        {visibles.map((f) => {
                            const filaId = filaIds[f];
                            const enRangoFila = !!rango && f >= rango.f0 && f <= rango.f1;
                            return (
                                <div
                                    key={filaId}
                                    role="row"
                                    aria-rowindex={f + 2}
                                    className={css.fila}
                                    style={{ top: f * ALTO_FILA, width: anchoTotal }}
                                    data-arrastrando={arrastre?.tipo === "fila" && arrastre.id === filaId}
                                    data-destino={arrastre?.tipo === "fila" && arrastre.sobre === filaId && arrastre.id !== filaId}
                                    onDragOver={(e) => {
                                        if (arrastre?.tipo !== "fila") return;
                                        e.preventDefault();
                                        if (arrastre.sobre !== filaId) setArrastre({ ...arrastre, sobre: filaId });
                                    }}
                                    onDrop={(e) => {
                                        if (arrastre?.tipo !== "fila") return;
                                        e.preventDefault();
                                        acciones.moverFila(arrastre.id, f);
                                        setArrastre(null);
                                    }}
                                >
                                    <div
                                        className={css.canal}
                                        role="rowheader"
                                        draggable={puedeArrastrarFilas}
                                        style={{ cursor: puedeArrastrarFilas ? "grab" : "default" }}
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData("text/plain", filaId);
                                            e.dataTransfer.effectAllowed = "move";
                                            setArrastre({ tipo: "fila", id: filaId, sobre: null });
                                        }}
                                        onDragEnd={() => setArrastre(null)}
                                    >
                                        <span>{f + 1}</span>
                                        <MenuFila filaId={filaId} numero={f + 1} puedeEditar={puedeEditar} ordenEditable={ordenEditable} acciones={acciones} />
                                    </div>
                                    {columnas.map((col, c) => {
                                        const esFoco = foc.f === f && foc.c === c;
                                        const enRango = enRangoFila && !!rango && c >= rango.c0 && c <= rango.c1;
                                        const pr = presentesPorCelda.get(`${filaId}|${col.id}`);
                                        const editando = edicion && edicion.fila === filaId && edicion.col === col.id;
                                        return (
                                            <div
                                                key={col.id}
                                                id={`celda-${filaId}-${col.id}`}
                                                role="gridcell"
                                                aria-colindex={c + 1}
                                                aria-selected={enRango}
                                                aria-readonly={!puedeEditar || col.tipo.v === "calculado"}
                                                className={`${css.celda} ${col.tipo.v === "numero" ? css.celdaNumero : ""} ${col.tipo.v === "calculado" ? css.celdaNumero + " " + css.celdaCalculada : ""}`}
                                                style={{ width: anchos[c], ...(pr ? { ["--pc" as string]: pr.color } : null) }}
                                                data-foco={esFoco}
                                                data-rango={enRango && multiple}
                                                data-presente={!!pr}
                                                onMouseDown={(e) => {
                                                    if (e.button !== 0) return;
                                                    if (edicion && !editando) setEdicion(null);
                                                    if (e.shiftKey && ancla) setFoco({ fila: filaId, col: col.id });
                                                    else {
                                                        setFoco({ fila: filaId, col: col.id });
                                                        setAncla({ fila: filaId, col: col.id });
                                                    }
                                                    seleccionando.current = true;
                                                    if (!editando) {
                                                        e.preventDefault();
                                                        enfocar();
                                                    }
                                                }}
                                                onMouseEnter={() => {
                                                    if (seleccionando.current && !edicion) setFoco({ fila: filaId, col: col.id });
                                                }}
                                                onDoubleClick={() => empezarEdicion(f, c, null)}
                                            >
                                                {pr ? (
                                                    <span className={css.etiquetaPresente}>
                                                        {pr.nombre}
                                                        {pr.editando ? " · escribiendo" : ""}
                                                    </span>
                                                ) : null}
                                                <CeldaVista
                                                    tabla={tabla}
                                                    col={col}
                                                    filaId={filaId}
                                                    calc={calc}
                                                    perfil={perfil}
                                                    puedeEditar={puedeEditar}
                                                    alAlternar={() => acciones.alternarCasilla(filaId, col.id)}
                                                />
                                                {editando ? (
                                                    <EditorCelda
                                                        tabla={tabla}
                                                        col={col}
                                                        filaId={filaId}
                                                        tecleado={edicion.tecleado}
                                                        candidatosPersonas={candidatosPersonas}
                                                        puedeCrearOpcion={puedeEditar}
                                                        crearOpcion={acciones.crearOpcion}
                                                        alTerminar={terminarEdicion}
                                                    />
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>

                    {/* ── totales ── */}
                    <div className={css.pie} role="row" aria-rowindex={filaIds.length + 2}>
                        <div className={css.canal} style={{ height: ALTO_CABECERA, cursor: "default", fontWeight: 600 }} role="rowheader">
                            Total
                        </div>
                        {columnas.map((col, j) => (
                            <PieColumna key={col.id} col={col} ancho={anchos[j]} calc={calc} filaIds={filaIds} puedeEditar={puedeEditar} acciones={acciones} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ───────────── menús ─────────────

const MenuColumna = memo(function MenuColumna({ col, indice, total, puedeEditar, acciones }: {
    col: Columna;
    indice: number;
    total: number;
    puedeEditar: boolean;
    acciones: AccionesTabla;
}) {
    return (
        <Menu.Root>
            <Menu.Trigger className={`${css.cabeceraBoton} ss-redondo`} aria-label={`Opciones de la columna ${col.nombre.v}`}>
                <ChevronDown size={16} aria-hidden="true" />
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Content className={css.menu} align="start" sideOffset={4} collisionPadding={12}>
                    {puedeEditar ? (
                        <Menu.Item className={css.menuItem} onSelect={() => acciones.abrirColumna(col.id)}>
                            <Pencil size={16} aria-hidden="true" /> Editar la columna…
                        </Menu.Item>
                    ) : null}
                    <Menu.Item className={css.menuItem} onSelect={() => acciones.ordenar(col.id, "asc")}>
                        <ArrowUpAZ size={16} aria-hidden="true" /> Ordenar de menor a mayor
                    </Menu.Item>
                    <Menu.Item className={css.menuItem} onSelect={() => acciones.ordenar(col.id, "desc")}>
                        <ArrowDownZA size={16} aria-hidden="true" /> Ordenar de mayor a menor
                    </Menu.Item>
                    <Menu.Item className={css.menuItem} onSelect={() => acciones.filtrarPor(col.id)}>
                        <ListFilter size={16} aria-hidden="true" /> Filtrar por esta columna
                    </Menu.Item>
                    {puedeEditar ? (
                        <>
                            <Menu.Separator className={css.menuSeparador} />
                            <Menu.Item className={css.menuItem} disabled={indice === 0} onSelect={() => acciones.moverColumna(col.id, indice - 1)}>
                                <ArrowLeftToLine size={16} aria-hidden="true" /> Mover a la izquierda
                            </Menu.Item>
                            <Menu.Item className={css.menuItem} disabled={indice >= total - 1} onSelect={() => acciones.moverColumna(col.id, indice + 1)}>
                                <ArrowRightToLine size={16} aria-hidden="true" /> Mover a la derecha
                            </Menu.Item>
                            <Menu.Separator className={css.menuSeparador} />
                            <Menu.Item className={`${css.menuItem} ${css.menuPeligro}`} onSelect={() => acciones.borrarColumna(col.id)}>
                                <Trash2 size={16} aria-hidden="true" /> Eliminar la columna
                            </Menu.Item>
                        </>
                    ) : null}
                </Menu.Content>
            </Menu.Portal>
        </Menu.Root>
    );
});

const MenuFila = memo(function MenuFila({ filaId, numero, puedeEditar, ordenEditable, acciones }: {
    filaId: string;
    numero: number;
    puedeEditar: boolean;
    ordenEditable: boolean;
    acciones: AccionesTabla;
}) {
    if (!puedeEditar) return null;
    return (
        <Menu.Root>
            <Menu.Trigger className={`${css.canalBoton} ss-redondo`} aria-label={`Opciones de la fila ${numero}`}>
                <EllipsisVertical size={16} aria-hidden="true" />
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Content className={css.menu} align="start" sideOffset={4} collisionPadding={12}>
                    <Menu.Item className={css.menuItem} onSelect={() => acciones.anadirFila({ antesDe: filaId })}>
                        <Plus size={16} aria-hidden="true" /> Insertar una fila encima
                    </Menu.Item>
                    <Menu.Item className={css.menuItem} onSelect={() => acciones.anadirFila({ despuesDe: filaId })}>
                        <Plus size={16} aria-hidden="true" /> Insertar una fila debajo
                    </Menu.Item>
                    <Menu.Item className={css.menuItem} onSelect={() => acciones.duplicarFila(filaId)}>
                        <Copy size={16} aria-hidden="true" /> Duplicar la fila
                    </Menu.Item>
                    {ordenEditable ? (
                        <>
                            <Menu.Item className={css.menuItem} disabled={numero <= 1} onSelect={() => acciones.moverFila(filaId, numero - 2)}>
                                <ArrowUp size={16} aria-hidden="true" /> Subir una posición
                            </Menu.Item>
                            <Menu.Item className={css.menuItem} onSelect={() => acciones.moverFila(filaId, numero)}>
                                <ArrowDown size={16} aria-hidden="true" /> Bajar una posición
                            </Menu.Item>
                        </>
                    ) : null}
                    <Menu.Separator className={css.menuSeparador} />
                    <Menu.Item className={`${css.menuItem} ${css.menuPeligro}`} onSelect={() => acciones.borrarFilas([filaId])}>
                        <Trash2 size={16} aria-hidden="true" /> Eliminar la fila
                    </Menu.Item>
                </Menu.Content>
            </Menu.Portal>
        </Menu.Root>
    );
});

const PieColumna = memo(function PieColumna({ col, ancho, calc, filaIds, puedeEditar, acciones }: {
    col: Columna;
    ancho: number;
    calc: Calculadora;
    filaIds: string[];
    puedeEditar: boolean;
    acciones: AccionesTabla;
}) {
    const fn: TotalFn = col.total?.v ?? "ninguno";
    let valor = "";
    if (fn !== "ninguno") {
        const r = calc.agregar(col.id, FN_DE_TOTAL[fn], filaIds);
        valor = textoCalculado(r);
    }
    return (
        <div className={css.pieCelda} style={{ width: ancho }} role="gridcell">
            {puedeEditar ? (
                <select
                    className={css.pieSelect}
                    value={fn}
                    aria-label={`Total de la columna ${col.nombre.v}`}
                    onChange={(e) => acciones.establecerTotal(col.id, e.target.value as TotalFn)}
                >
                    {totalesPara(col).map((t) => (
                        <option key={t} value={t}>
                            {ETIQUETA_TOTAL[t]}
                        </option>
                    ))}
                </select>
            ) : fn !== "ninguno" ? (
                <span>{ETIQUETA_TOTAL[fn]}</span>
            ) : null}
            {fn !== "ninguno" ? <span className={css.pieValor}>{valor}</span> : null}
        </div>
    );
});
