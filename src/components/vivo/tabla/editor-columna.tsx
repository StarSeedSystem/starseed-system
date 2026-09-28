"use client";
/**
 * Editor de una columna: nombre, tipo, opciones de «Selección», fórmula de «Calculado», total,
 * ancho, posición y borrado. Funciona igual en escritorio (diálogo) y móvil (hoja inferior).
 */
import { ArrowDown, ArrowLeftToLine, ArrowRightToLine, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    columnasCitables,
    columnasUsadas,
    compilarFormula,
    mostrarFormula,
} from "@/lib/vivo/tabla/formulas";
import {
    COLORES_OPCION,
    ETIQUETA_TIPO,
    ETIQUETA_TOTAL,
    LIMITES,
    TIPOS_COLUMNA,
    columnasVisibles,
    opcionesOrdenadas,
    type Columna,
    type Tabla,
    type TipoColumna,
    type TotalFn,
} from "@/lib/vivo/tabla/modelo";
import { PanelModal } from "./panel-modal";
import { totalesPara, type AccionesColumna } from "./tipos";
import css from "./tabla.module.css";

const AYUDA_TIPO: Record<TipoColumna, string> = {
    texto: "Cualquier texto.",
    numero: "Admite coma o punto decimal. Permite totales.",
    fecha: "Una fecha; se muestra en tu idioma.",
    casilla: "Sí o no, con un toque.",
    seleccion: "Una opción de una lista con colores.",
    enlace: "Una dirección web o de correo (solo se abren http, https y mailto).",
    persona: "Una persona de StarSeed.",
    calculado: "Se calcula solo a partir de otras columnas.",
};

export function EditorColumna({
    tabla,
    colId,
    puedeEditar,
    lado,
    acciones,
    alCerrar,
}: {
    tabla: Tabla;
    colId: string | null;
    puedeEditar: boolean;
    lado: "centro" | "abajo";
    acciones: AccionesColumna;
    alCerrar: () => void;
}) {
    const col = colId ? tabla.columnas[colId] : undefined;
    const viva = !!col && !col.borrada?.v;
    useEffect(() => {
        if (colId && !viva) alCerrar();
    }, [colId, viva, alCerrar]);
    if (!colId || !col || !viva) return null;
    return (
        <PanelModal abierto alCambiar={(a) => !a && alCerrar()} titulo={`Columna «${col.nombre.v}»`} descripcion={puedeEditar ? "Los cambios se guardan solos y los ve todo el que tenga la tabla abierta." : "Solo lectura."} lado={lado}>
            <Contenido key={col.id} tabla={tabla} col={col} puedeEditar={puedeEditar} acciones={acciones} alCerrar={alCerrar} />
        </PanelModal>
    );
}

function Contenido({ tabla, col, puedeEditar, acciones, alCerrar }: {
    tabla: Tabla;
    col: Columna;
    puedeEditar: boolean;
    acciones: AccionesColumna;
    alCerrar: () => void;
}) {
    const [nombre, setNombre] = useState(col.nombre.v);
    const [borrando, setBorrando] = useState(false);
    const [ancho, setAncho] = useState(col.ancho.v);
    const dis = !puedeEditar;
    const tipo = col.tipo.v;
    const columnas = columnasVisibles(tabla);
    const indice = columnas.findIndex((c) => c.id === col.id);
    const dependientes = useMemo(
        () =>
            columnas
                .filter((c) => c.id !== col.id && c.tipo.v === "calculado" && c.formula?.v && columnasUsadas(c.formula.v).includes(col.id))
                .map((c) => c.nombre.v),
        [columnas, col.id],
    );

    const guardarNombre = () => {
        const limpio = nombre.trim();
        if (!limpio) setNombre(col.nombre.v);
        else if (limpio !== col.nombre.v) acciones.renombrar(col.id, limpio);
    };

    return (
        <>
            <div className={css.campo}>
                <label htmlFor="col-nombre">Nombre</label>
                <input
                    id="col-nombre"
                    className={css.entrada}
                    value={nombre}
                    disabled={dis}
                    maxLength={LIMITES.nombreColumna}
                    onChange={(e) => setNombre(e.target.value)}
                    onBlur={guardarNombre}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            guardarNombre();
                        }
                    }}
                />
                <p className={css.ayuda}>Las fórmulas usan este nombre entre corchetes; si lo cambias, siguen funcionando.</p>
            </div>

            <div className={css.campo}>
                <label htmlFor="col-tipo">Tipo de dato</label>
                <select id="col-tipo" className={css.selector} value={tipo} disabled={dis} onChange={(e) => acciones.cambiarTipo(col.id, e.target.value as TipoColumna)}>
                    {TIPOS_COLUMNA.map((t) => (
                        <option key={t} value={t}>
                            {ETIQUETA_TIPO[t]}
                        </option>
                    ))}
                </select>
                <p className={css.ayuda}>
                    {AYUDA_TIPO[tipo]} Al cambiar de tipo los valores se convierten cuando es posible; lo que no encaje queda vacío (puedes deshacerlo).
                </p>
            </div>

            {tipo === "seleccion" ? <SeccionOpciones col={col} dis={dis} acciones={acciones} /> : null}
            {tipo === "calculado" ? <SeccionFormula tabla={tabla} col={col} dis={dis} acciones={acciones} /> : null}

            <div className={css.campo}>
                <label htmlFor="col-total">Total al pie de la tabla</label>
                <select id="col-total" className={css.selector} value={col.total?.v ?? "ninguno"} disabled={dis} onChange={(e) => acciones.establecerTotal(col.id, e.target.value as TotalFn)}>
                    {totalesPara(col).map((t) => (
                        <option key={t} value={t}>
                            {ETIQUETA_TOTAL[t]}
                        </option>
                    ))}
                </select>
                <p className={css.ayuda}>Se calcula con las filas que tú ves (respeta tus filtros).</p>
            </div>

            <div className={css.campo}>
                <label htmlFor="col-ancho">Ancho en pantallas grandes: {ancho} px</label>
                <input
                    id="col-ancho"
                    type="range"
                    min={LIMITES.anchoMin}
                    max={LIMITES.anchoMax}
                    step={4}
                    value={ancho}
                    disabled={dis}
                    onChange={(e) => setAncho(Number(e.target.value))}
                    onPointerUp={() => ancho !== col.ancho.v && acciones.redimensionar(col.id, ancho)}
                    onKeyUp={() => ancho !== col.ancho.v && acciones.redimensionar(col.id, ancho)}
                />
            </div>

            {!dis ? (
                <div className={css.fichas}>
                    <button type="button" className={css.boton} disabled={indice <= 0} onClick={() => acciones.mover(col.id, -1)}>
                        <ArrowLeftToLine size={16} aria-hidden="true" /> Mover a la izquierda
                    </button>
                    <button type="button" className={css.boton} disabled={indice >= columnas.length - 1} onClick={() => acciones.mover(col.id, 1)}>
                        <ArrowRightToLine size={16} aria-hidden="true" /> Mover a la derecha
                    </button>
                </div>
            ) : null}

            {!dis ? (
                <div className={css.seccion}>
                    <span className={css.rotulo}>Zona delicada</span>
                    {dependientes.length ? (
                        <p className={css.aviso} role="note">
                            La usan las fórmulas de: {dependientes.join(", ")}. Si la eliminas, esas fórmulas darán error hasta que las cambies.
                        </p>
                    ) : null}
                    {!borrando ? (
                        <button type="button" className={`${css.boton} ${css.botonPeligro}`} onClick={() => setBorrando(true)}>
                            <Trash2 size={16} aria-hidden="true" /> Eliminar la columna
                        </button>
                    ) : (
                        <>
                            <p className={css.ayuda}>Se quitará de la tabla para todo el mundo. Sus datos se conservan un tiempo y puedes recuperarla con «Deshacer».</p>
                            <div className={css.fichas}>
                                <button
                                    type="button"
                                    className={`${css.boton} ${css.botonPeligro}`}
                                    onClick={() => {
                                        acciones.borrar(col.id);
                                        alCerrar();
                                    }}
                                >
                                    <Trash2 size={16} aria-hidden="true" /> Sí, eliminar la columna
                                </button>
                                <button type="button" className={css.boton} onClick={() => setBorrando(false)}>
                                    Cancelar
                                </button>
                            </div>
                        </>
                    )}
                </div>
            ) : null}
        </>
    );
}

function SeccionOpciones({ col, dis, acciones }: { col: Columna; dis: boolean; acciones: AccionesColumna }) {
    const [nueva, setNueva] = useState("");
    const opciones = opcionesOrdenadas(col);
    const anadir = () => {
        const n = nueva.trim();
        if (!n) return;
        acciones.anadirOpcion(col.id, n);
        setNueva("");
    };
    return (
        <div className={css.seccion}>
            <span className={css.rotulo}>Opciones</span>
            {opciones.length === 0 ? <p className={css.ayuda}>Todavía no hay opciones. También se crean al escribir un nombre nuevo en una celda.</p> : null}
            {opciones.map((o, i) => (
                <div key={o.id} className={css.filaEditable}>
                    <button
                        type="button"
                        className={`${css.muestra} ss-redondo`}
                        style={{ ["--c" as string]: o.color }}
                        disabled={dis}
                        aria-label={`Cambiar el color de «${o.nombre}»`}
                        onClick={() => {
                            const k = COLORES_OPCION.indexOf(o.color as (typeof COLORES_OPCION)[number]);
                            acciones.editarOpcion(col.id, o.id, { color: COLORES_OPCION[(k + 1) % COLORES_OPCION.length] });
                        }}
                    />
                    <NombreOpcion key={o.id + o.nombre} nombre={o.nombre} disabled={dis} alGuardar={(n) => acciones.editarOpcion(col.id, o.id, { nombre: n })} />
                    {!dis ? (
                        <>
                            <button type="button" className={`${css.boton} ${css.botonIcono} ss-redondo`} disabled={i === 0} aria-label={`Subir «${o.nombre}»`} onClick={() => acciones.moverOpcion(col.id, o.id, -1)}>
                                <ArrowUp size={16} aria-hidden="true" />
                            </button>
                            <button type="button" className={`${css.boton} ${css.botonIcono} ss-redondo`} disabled={i === opciones.length - 1} aria-label={`Bajar «${o.nombre}»`} onClick={() => acciones.moverOpcion(col.id, o.id, 1)}>
                                <ArrowDown size={16} aria-hidden="true" />
                            </button>
                            <button type="button" className={`${css.boton} ${css.botonIcono} ${css.botonPeligro} ss-redondo`} aria-label={`Quitar «${o.nombre}»`} onClick={() => acciones.quitarOpcion(col.id, o.id)}>
                                <X size={16} aria-hidden="true" />
                            </button>
                        </>
                    ) : null}
                </div>
            ))}
            {!dis ? (
                <div className={css.filaEditable}>
                    <input
                        className={css.entrada}
                        value={nueva}
                        maxLength={40}
                        placeholder="Nombre de la nueva opción"
                        aria-label="Nombre de la nueva opción"
                        onChange={(e) => setNueva(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                anadir();
                            }
                        }}
                    />
                    <button type="button" className={css.boton} disabled={!nueva.trim()} onClick={anadir}>
                        <Plus size={16} aria-hidden="true" /> Añadir opción
                    </button>
                </div>
            ) : null}
            {opciones.length > 0 ? <p className={css.ayuda}>Toca el círculo de color para cambiarlo.</p> : null}
        </div>
    );
}

function NombreOpcion({ nombre, disabled, alGuardar }: { nombre: string; disabled: boolean; alGuardar: (n: string) => void }) {
    const [v, setV] = useState(nombre);
    const guardar = () => {
        const n = v.trim();
        if (!n) setV(nombre);
        else if (n !== nombre) alGuardar(n);
    };
    return (
        <input
            className={css.entrada}
            value={v}
            disabled={disabled}
            maxLength={40}
            aria-label={`Nombre de la opción «${nombre}»`}
            onChange={(e) => setV(e.target.value)}
            onBlur={guardar}
            onKeyDown={(e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    guardar();
                }
            }}
        />
    );
}

function SeccionFormula({ tabla, col, dis, acciones }: { tabla: Tabla; col: Columna; dis: boolean; acciones: AccionesColumna }) {
    const refs = useMemo(() => columnasCitables(tabla, col.id), [tabla, col.id]);
    const guardada = col.formula?.v ?? "";
    const inicial = useMemo(() => (guardada ? mostrarFormula(guardada, refs) : ""), [guardada, refs]);
    const [texto, setTexto] = useState(inicial);
    const entrada = useRef<HTMLInputElement>(null);
    const resultado = useMemo(() => (texto.trim() ? compilarFormula(texto, refs, col.id) : null), [texto, refs, col.id]);
    const sinCambios = resultado ? resultado.ok && resultado.almacenada === guardada : !guardada;
    const insertar = (nombre: string) => {
        const el = entrada.current;
        const trozo = `[${nombre}]`;
        if (!el) return setTexto((t) => t + trozo);
        const a = el.selectionStart ?? texto.length;
        const b = el.selectionEnd ?? texto.length;
        const nuevo = texto.slice(0, a) + trozo + texto.slice(b);
        setTexto(nuevo);
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(a + trozo.length, a + trozo.length);
        });
    };
    const guardar = () => {
        if (!resultado) acciones.establecerFormula(col.id, "");
        else if (resultado.ok) acciones.establecerFormula(col.id, resultado.almacenada);
    };
    return (
        <div className={css.seccion}>
            <span className={css.rotulo}>Fórmula</span>
            <div className={css.campo}>
                <label htmlFor="col-formula">Escribe la fórmula</label>
                <input
                    id="col-formula"
                    ref={entrada}
                    className={css.entrada}
                    value={texto}
                    disabled={dis}
                    maxLength={LIMITES.formula}
                    placeholder="[Precio] * [Cantidad]"
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={resultado ? !resultado.ok : false}
                    aria-describedby="col-formula-ayuda"
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !sinCambios && (!resultado || resultado.ok)) {
                            e.preventDefault();
                            guardar();
                        }
                    }}
                />
                {resultado && !resultado.ok ? (
                    <p className={css.error} role="alert">
                        {resultado.error}
                    </p>
                ) : null}
                <p className={css.ayuda} id="col-formula-ayuda">
                    Operaciones + − * / y paréntesis con las celdas de la misma fila, como <code>[Precio] * [Cantidad]</code>. Sobre toda una columna: <code>SUMA([Precio])</code>, <code>PROMEDIO</code>, <code>MIN</code>, <code>MAX</code> y <code>CONTAR</code> (cuenta las celdas con algo escrito). No se ejecuta código: solo esta gramática.
                </p>
            </div>
            {refs.length ? (
                <div>
                    <span className={css.etiqueta}>Insertar una columna</span>
                    <div className={css.fichas} style={{ marginTop: 6 }}>
                        {refs.map((r) => (
                            <button key={r.id} type="button" className={`${css.pildora} ${css.pildoraBoton} ss-redondo`} disabled={dis} onClick={() => insertar(r.nombre)}>
                                [{r.nombre}]
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <p className={css.ayuda}>Añade antes alguna otra columna para poder usarla en la fórmula.</p>
            )}
            {!dis ? (
                <div className={css.fichas}>
                    <button type="button" className={`${css.boton} ${css.botonPrimario}`} disabled={sinCambios || (!!resultado && !resultado.ok)} onClick={guardar}>
                        Guardar la fórmula
                    </button>
                </div>
            ) : null}
        </div>
    );
}
