"use client";
/**
 * Vista de móvil: una tarjeta por fila (nada de una rejilla apretada) y una hoja inferior para
 * editar todos los campos de la fila con controles hechos para el dedo.
 */
import * as Popover from "@radix-ui/react-popover";
import { ChevronLeft, ChevronRight, Copy, ExternalLink, Plus, Trash2, User } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FN_DE_TOTAL, textoCalculado, type Calculadora } from "@/lib/vivo/tabla/formulas";
import {
    ETIQUETA_TOTAL,
    enlaceSeguro,
    estaVacio,
    opcionesOrdenadas,
    type Columna,
    type Tabla,
} from "@/lib/vivo/tabla/modelo";
import type { Posicion, Presente } from "@/lib/vivo/tabla/presencia";
import { CeldaVista, valorDe } from "./celda-vista";
import { textoParaEditar } from "./celda-editor";
import { PanelModal } from "./panel-modal";
import { AvatarPersona, type PerfilCorto } from "./personas";
import { SelectorPersona } from "./selectores";
import type { AccionesTabla } from "./tipos";
import css from "./tabla.module.css";

const POR_PAGINA = 30;

function titulo(tabla: Tabla, columnas: Columna[], filaId: string, numero: number, calc: Calculadora): string {
    for (const c of columnas) {
        if (c.tipo.v !== "texto" && c.tipo.v !== "enlace") continue;
        const v = valorDe(tabla, filaId, c.id);
        if (!estaVacio(v)) return String(v).slice(0, 120);
    }
    for (const c of columnas) {
        if (c.tipo.v === "calculado") {
            const v = calc.calculada(filaId, c.id);
            if (v?.ok) return textoCalculado(v);
            continue;
        }
        const v = valorDe(tabla, filaId, c.id);
        if (!estaVacio(v) && typeof v !== "boolean") return String(v).slice(0, 120);
    }
    return `Fila ${numero}`;
}

export function Tarjetas({ tabla, calc, columnas, filaIds, puedeEditar, presentes, perfil, acciones, alAbrirFila, mensajeVacio }: {
    tabla: Tabla;
    calc: Calculadora;
    columnas: Columna[];
    filaIds: string[];
    puedeEditar: boolean;
    presentes: readonly Presente[];
    perfil: (uid: string) => PerfilCorto | undefined;
    acciones: AccionesTabla;
    alAbrirFila: (filaId: string) => void;
    mensajeVacio: string;
}) {
    const [limite, setLimite] = useState(POR_PAGINA);
    const porFila = useMemo(() => {
        const m = new Map<string, Presente>();
        for (const p of presentes) if (p.fila) m.set(p.fila, p);
        return m;
    }, [presentes]);
    const totales = columnas.filter((c) => (c.total?.v ?? "ninguno") !== "ninguno");
    if (!filaIds.length) {
        return (
            <div className={`${css.vacio} ${css.panel}`} role="status">
                <p>{mensajeVacio}</p>
                {puedeEditar ? (
                    <button type="button" className={`${css.boton} ${css.botonPrimario}`} onClick={() => acciones.anadirFila()}>
                        <Plus size={16} aria-hidden="true" /> Añadir una fila
                    </button>
                ) : null}
            </div>
        );
    }
    return (
        <div className={css.tarjetas} role="list" aria-label="Filas de la tabla">
            {filaIds.slice(0, limite).map((filaId, i) => {
                const pr = porFila.get(filaId);
                const campos = columnas
                    .filter((c) => {
                        if (c.tipo.v === "calculado") return !!calc.calculada(filaId, c.id);
                        return !estaVacio(valorDe(tabla, filaId, c.id)) || c.tipo.v === "casilla";
                    })
                    .slice(0, 7);
                return (
                    <div
                        key={filaId}
                        role="listitem"
                    >
                        <div
                            className={css.tarjeta}
                            role="button"
                            tabIndex={0}
                            data-presente={!!pr}
                            style={pr ? { ["--pc" as string]: pr.color } : undefined}
                            aria-label={`Abrir la fila ${i + 1}: ${titulo(tabla, columnas, filaId, i + 1, calc)}`}
                            onClick={() => alAbrirFila(filaId)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    alAbrirFila(filaId);
                                }
                            }}
                        >
                            <span className={css.rotulo}>Fila {i + 1}</span>
                            <span className={css.tarjetaTitulo}>{titulo(tabla, columnas, filaId, i + 1, calc)}</span>
                            {campos.length > 0 ? (
                                <div className={css.tarjetaCampos}>
                                    {campos.map((c) => (
                                        <div key={c.id} className={css.tarjetaCampo}>
                                            <span className={css.rotulo}>{c.nombre.v}</span>
                                            <span className="valor">
                                                <CeldaVista tabla={tabla} col={c} filaId={filaId} calc={calc} perfil={perfil} puedeEditar={false} multilinea dentroDeBoton />
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                            {pr ? (
                                <span className={css.presenteEnTarjeta}>
                                    <AvatarPersona uid={pr.uid} nombre={pr.nombre} chico />
                                    {pr.nombre} {pr.editando ? "está editando esta fila" : "está mirando esta fila"}
                                </span>
                            ) : null}
                        </div>
                    </div>
                );
            })}
            {filaIds.length > limite ? (
                <div className={css.masFilas}>
                    <button type="button" className={css.boton} onClick={() => setLimite((l) => l + POR_PAGINA)}>
                        Mostrar {Math.min(POR_PAGINA, filaIds.length - limite)} filas más ({filaIds.length - limite} sin ver)
                    </button>
                </div>
            ) : null}
            {totales.length > 0 ? (
                <div className={`${css.seccion} ${css.panel}`} aria-label="Totales">
                    <span className={css.rotulo}>Totales de lo que ves</span>
                    {totales.map((c) => {
                        const fn = c.total!.v;
                        const r = fn === "ninguno" ? null : calc.agregar(c.id, FN_DE_TOTAL[fn], filaIds);
                        return (
                            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                <span className={css.secundario}>
                                    {ETIQUETA_TOTAL[fn]} de {c.nombre.v}
                                </span>
                                <strong>{r ? textoCalculado(r) : ""}</strong>
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

// ───────────── hoja de edición de una fila ─────────────

export function HojaFila({ tabla, calc, columnas, filaIds, filaId, puedeEditar, perfil, candidatosPersonas, acciones, alCerrar, alIr, onPosicion }: {
    tabla: Tabla;
    calc: Calculadora;
    columnas: Columna[];
    filaIds: string[];
    filaId: string | null;
    puedeEditar: boolean;
    perfil: (uid: string) => PerfilCorto | undefined;
    candidatosPersonas: PerfilCorto[];
    acciones: AccionesTabla;
    alCerrar: () => void;
    alIr: (filaId: string) => void;
    onPosicion: (pos: Posicion) => void;
}) {
    const idx = filaId ? filaIds.indexOf(filaId) : -1;
    const [borrando, setBorrando] = useState(false);
    useEffect(() => {
        if (filaId && idx < 0) alCerrar(); // la borró otra persona
    }, [filaId, idx, alCerrar]);
    useEffect(() => {
        if (filaId) onPosicion({ fila: filaId, col: null, editando: true });
        else onPosicion({ fila: null, col: null, editando: false });
    }, [filaId, onPosicion]);
    useEffect(() => setBorrando(false), [filaId]);
    if (!filaId || idx < 0) return null;
    return (
        <PanelModal
            abierto
            alCambiar={(a) => !a && alCerrar()}
            titulo={`Fila ${idx + 1} de ${filaIds.length}`}
            descripcion={puedeEditar ? "Cada campo se guarda al salir de él." : "Solo lectura."}
            lado="abajo"
        >
            {columnas.map((c) => (
                <Campo key={c.id} tabla={tabla} calc={calc} col={c} filaId={filaId} puedeEditar={puedeEditar} perfil={perfil} candidatosPersonas={candidatosPersonas} acciones={acciones} onPosicion={onPosicion} />
            ))}
            {columnas.length === 0 ? <p className={css.ayuda}>Esta tabla aún no tiene columnas.</p> : null}
            <div className={css.fichas}>
                <button type="button" className={css.boton} disabled={idx <= 0} onClick={() => alIr(filaIds[idx - 1])}>
                    <ChevronLeft size={16} aria-hidden="true" /> Fila anterior
                </button>
                <button type="button" className={css.boton} disabled={idx >= filaIds.length - 1} onClick={() => alIr(filaIds[idx + 1])}>
                    Fila siguiente <ChevronRight size={16} aria-hidden="true" />
                </button>
            </div>
            {puedeEditar ? (
                <div className={css.fichas}>
                    <button type="button" className={css.boton} onClick={() => acciones.duplicarFila(filaId)}>
                        <Copy size={16} aria-hidden="true" /> Duplicar la fila
                    </button>
                    {!borrando ? (
                        <button type="button" className={`${css.boton} ${css.botonPeligro}`} onClick={() => setBorrando(true)}>
                            <Trash2 size={16} aria-hidden="true" /> Eliminar la fila
                        </button>
                    ) : (
                        <>
                            <button
                                type="button"
                                className={`${css.boton} ${css.botonPeligro}`}
                                onClick={() => {
                                    acciones.borrarFilas([filaId]);
                                    alCerrar();
                                }}
                            >
                                <Trash2 size={16} aria-hidden="true" /> Sí, eliminar la fila
                            </button>
                            <button type="button" className={css.boton} onClick={() => setBorrando(false)}>
                                Cancelar
                            </button>
                        </>
                    )}
                </div>
            ) : null}
        </PanelModal>
    );
}

function Campo({ tabla, calc, col, filaId, puedeEditar, perfil, candidatosPersonas, acciones, onPosicion }: {
    tabla: Tabla;
    calc: Calculadora;
    col: Columna;
    filaId: string;
    puedeEditar: boolean;
    perfil: (uid: string) => PerfilCorto | undefined;
    candidatosPersonas: PerfilCorto[];
    acciones: AccionesTabla;
    onPosicion: (pos: Posicion) => void;
}) {
    const tipo = col.tipo.v;
    const id = `campo-${col.id}`;
    const valor = valorDe(tabla, filaId, col.id);
    const remoto = textoParaEditar(tabla, col, filaId);
    const [texto, setTexto] = useState(remoto);
    const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
    const [nuevaOpcion, setNuevaOpcion] = useState("");
    const [abiertoPersona, setAbiertoPersona] = useState(false);

    // Un cambio ajeno se refleja salvo que esta persona esté escribiendo justo en este campo.
    useEffect(() => {
        if (typeof document === "undefined" || document.activeElement !== ref.current) setTexto(remoto);
    }, [remoto]);

    const alEnfocar = () => onPosicion({ fila: filaId, col: col.id, editando: true });
    const guardar = () => {
        if (texto !== remoto) acciones.escribirTexto(filaId, col.id, texto);
    };

    let control: React.ReactNode;
    if (tipo === "calculado") {
        control = (
            <div className={css.entrada} style={{ display: "flex", alignItems: "center" }}>
                <CeldaVista tabla={tabla} col={col} filaId={filaId} calc={calc} perfil={perfil} puedeEditar={false} multilinea />
            </div>
        );
    } else if (tipo === "texto") {
        control = (
            <textarea
                id={id}
                ref={ref}
                className={`${css.entrada} ${css.area}`}
                value={texto}
                disabled={!puedeEditar}
                maxLength={2000}
                onFocus={alEnfocar}
                onChange={(e) => setTexto(e.target.value)}
                onBlur={guardar}
            />
        );
    } else if (tipo === "numero" || tipo === "enlace") {
        control = (
            <>
                <input
                    id={id}
                    ref={ref}
                    className={css.entrada}
                    value={texto}
                    disabled={!puedeEditar}
                    inputMode={tipo === "numero" ? "decimal" : "url"}
                    autoCapitalize="none"
                    autoComplete="off"
                    maxLength={2000}
                    onFocus={alEnfocar}
                    onChange={(e) => setTexto(e.target.value)}
                    onBlur={guardar}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                />
                {tipo === "enlace" && typeof valor === "string" && enlaceSeguro(valor) ? (
                    <a className={css.enlace} href={enlaceSeguro(valor) ?? undefined} target="_blank" rel="noopener noreferrer nofollow">
                        <ExternalLink size={14} aria-hidden="true" style={{ display: "inline", marginRight: 6 }} />
                        Abrir el enlace
                    </a>
                ) : null}
            </>
        );
    } else if (tipo === "fecha") {
        control = (
            <input
                id={id}
                ref={ref}
                type="date"
                className={css.entrada}
                value={texto}
                disabled={!puedeEditar}
                onFocus={alEnfocar}
                onChange={(e) => {
                    setTexto(e.target.value);
                    acciones.escribirTexto(filaId, col.id, e.target.value);
                }}
            />
        );
    } else if (tipo === "casilla") {
        control = (
            <button
                type="button"
                role="switch"
                aria-checked={valor === true}
                aria-labelledby={`${id}-r`}
                disabled={!puedeEditar}
                className={`${css.boton} ${valor === true ? css.botonPrimario : ""}`}
                onFocus={alEnfocar}
                onClick={() => acciones.alternarCasilla(filaId, col.id)}
            >
                {valor === true ? "Sí, marcada" : "No, sin marcar"}
            </button>
        );
    } else if (tipo === "seleccion") {
        const opciones = opcionesOrdenadas(col);
        control = (
            <>
                <div className={css.fichas} role="radiogroup" aria-labelledby={`${id}-r`}>
                    {opciones.map((o) => (
                        <button
                            key={o.id}
                            type="button"
                            role="radio"
                            aria-checked={valor === o.id}
                            disabled={!puedeEditar}
                            className={`${css.pildora} ${css.pildoraBoton} ss-redondo`}
                            style={{
                                ["--c" as string]: o.color,
                                background: valor === o.id ? `${o.color}55` : undefined,
                                minHeight: 36,
                            }}
                            onFocus={alEnfocar}
                            onClick={() => acciones.escribir([{ filaId, colId: col.id, valor: valor === o.id ? null : o.id }])}
                        >
                            {o.nombre}
                        </button>
                    ))}
                    {opciones.length === 0 ? <span className={css.ayuda}>Aún no hay opciones.</span> : null}
                </div>
                {puedeEditar ? (
                    <div className={css.filaEditable}>
                        <input
                            className={css.entrada}
                            value={nuevaOpcion}
                            maxLength={40}
                            placeholder="Crear una opción nueva"
                            aria-label={`Crear una opción nueva en ${col.nombre.v}`}
                            onChange={(e) => setNuevaOpcion(e.target.value)}
                        />
                        <button
                            type="button"
                            className={css.boton}
                            disabled={!nuevaOpcion.trim()}
                            onClick={() => {
                                const idNuevo = acciones.crearOpcion(col.id, nuevaOpcion.trim());
                                if (idNuevo) acciones.escribir([{ filaId, colId: col.id, valor: idNuevo }]);
                                setNuevaOpcion("");
                            }}
                        >
                            <Plus size={16} aria-hidden="true" /> Crear y elegir
                        </button>
                    </div>
                ) : null}
            </>
        );
    } else {
        const uid = typeof valor === "string" ? valor : null;
        const p = uid ? perfil(uid) : undefined;
        control = (
            <Popover.Root open={abiertoPersona} onOpenChange={setAbiertoPersona}>
                <Popover.Trigger asChild>
                    <button type="button" className={css.boton} style={{ justifyContent: "flex-start" }} disabled={!puedeEditar} onFocus={alEnfocar}>
                        {uid ? <AvatarPersona uid={uid} nombre={p?.nombre ?? "?"} avatar={p?.avatar} chico /> : <User size={16} aria-hidden="true" />}
                        {uid ? p?.nombre ?? "Persona" : "Elegir a una persona"}
                    </button>
                </Popover.Trigger>
                <Popover.Portal>
                    <Popover.Content className={css.flotante} align="start" sideOffset={6} collisionPadding={12} style={{ zIndex: 400 }}>
                        <SelectorPersona
                            candidatos={candidatosPersonas}
                            valorActual={uid}
                            alElegir={(u) => {
                                acciones.escribir([{ filaId, colId: col.id, valor: u }]);
                                setAbiertoPersona(false);
                            }}
                            alCerrar={() => setAbiertoPersona(false)}
                        />
                    </Popover.Content>
                </Popover.Portal>
            </Popover.Root>
        );
    }

    return (
        <div className={css.campo}>
            <label id={`${id}-r`} htmlFor={tipo === "texto" || tipo === "numero" || tipo === "enlace" || tipo === "fecha" ? id : undefined}>
                {col.nombre.v}
            </label>
            {control}
        </div>
    );
}
