"use client";

import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { LIM, type TipoCampo } from "@/lib/vivo/programas/tipos";
import { Boton, estilos as s } from "../juegos/comun";
import { siguienteId, type BorradorBloque, type CampoBorrador, type ItemBorrador } from "./editor-modelo";
import p from "./programas.module.css";

type De<T extends BorradorBloque["tipo"]> = Extract<BorradorBloque, { tipo: T }>;

function Campo({ id, rotulo, ayuda, children }: { id: string; rotulo: string; ayuda?: string; children: ReactNode }) {
    return (
        <div className={s.campo}>
            <label className={s.rotulo} htmlFor={id}>
                {rotulo}
            </label>
            {children}
            {ayuda && <span className={p.etiquetaPequena}>{ayuda}</span>}
        </div>
    );
}

/** Lista de textos con identificador (opciones de una encuesta, columnas de un tablero). */
function ListaEditable({
    idBase,
    rotulo,
    rotuloItem,
    rotuloAnadir,
    prefijoId,
    items,
    min,
    max,
    alCambiar,
}: {
    idBase: string;
    rotulo: string;
    rotuloItem: string;
    rotuloAnadir: string;
    prefijoId: string;
    items: ItemBorrador[];
    min: number;
    max: number;
    alCambiar: (items: ItemBorrador[]) => void;
}) {
    return (
        <div className={p.editorGrupo} role="group" aria-label={rotulo}>
            <span className={s.rotulo}>{rotulo}</span>
            {items.map((it, i) => (
                <div key={it.id} className={p.editorFila}>
                    <input
                        id={`${idBase}-${it.id}`}
                        className={s.entrada}
                        value={it.texto}
                        maxLength={LIM.etiqueta}
                        aria-label={`${rotuloItem} ${i + 1}`}
                        autoComplete="off"
                        onChange={(e) => alCambiar(items.map((x) => (x.id === it.id ? { ...x, texto: e.target.value } : x)))}
                    />
                    <Boton
                        redondo
                        className={p.pequenoRedondo}
                        disabled={items.length <= min}
                        onClick={() => alCambiar(items.filter((x) => x.id !== it.id))}
                        aria-label={`Quitar ${rotuloItem.toLowerCase()} ${i + 1}`}
                        title="Quitar"
                    >
                        <Trash2 size={15} aria-hidden="true" />
                    </Boton>
                </div>
            ))}
            <div>
                <Boton
                    disabled={items.length >= max}
                    onClick={() => alCambiar([...items, { id: siguienteId(prefijoId, items.map((x) => x.id)), texto: "" }])}
                    icono={<Plus size={16} aria-hidden="true" />}
                >
                    {rotuloAnadir}
                </Boton>
            </div>
        </div>
    );
}

export function CamposTitulo({ b, alCambiar }: { b: De<"titulo">; alCambiar: (b: De<"titulo">) => void }) {
    return (
        <>
            <Campo id="ed-texto" rotulo="Título">
                <input id="ed-texto" className={s.entrada} value={b.texto} maxLength={LIM.titulo} autoComplete="off" onChange={(e) => alCambiar({ ...b, texto: e.target.value })} />
            </Campo>
            <div className={p.editorGrupo} role="radiogroup" aria-label="Tamaño del título">
                <span className={s.rotulo}>Tamaño</span>
                <div className={s.opciones}>
                    {([1, 2, 3] as const).map((n) => (
                        <button
                            key={n}
                            type="button"
                            role="radio"
                            aria-checked={b.nivel === n}
                            className={`${s.opcion} ${b.nivel === n ? s.opcionSel : ""} ss-redondo`}
                            onClick={() => alCambiar({ ...b, nivel: n })}
                        >
                            {n === 1 ? "Grande" : n === 2 ? "Mediano" : "Pequeño"}
                        </button>
                    ))}
                </div>
            </div>
        </>
    );
}

export function CamposTexto({ b, alCambiar }: { b: De<"texto">; alCambiar: (b: De<"texto">) => void }) {
    return (
        <Campo id="ed-texto" rotulo="Texto" ayuda="Se muestra tal cual, sin formato. Los saltos de línea se respetan.">
            <textarea id="ed-texto" className={`${s.entrada} ${p.area}`} value={b.texto} maxLength={LIM.texto} onChange={(e) => alCambiar({ ...b, texto: e.target.value })} />
        </Campo>
    );
}

export function CamposTareas({ b, alCambiar, nuevo }: { b: De<"tareas">; alCambiar: (b: De<"tareas">) => void; nuevo: boolean }) {
    return (
        <>
            <Campo id="ed-titulo" rotulo="Título de la lista">
                <input id="ed-titulo" className={s.entrada} value={b.titulo} maxLength={LIM.titulo} autoComplete="off" onChange={(e) => alCambiar({ ...b, titulo: e.target.value })} />
            </Campo>
            {nuevo && (
                <Campo id="ed-iniciales" rotulo="Tareas para empezar (opcional)" ayuda="Una por línea. Después, cualquiera del grupo puede añadir más.">
                    <textarea id="ed-iniciales" className={`${s.entrada} ${p.area}`} value={b.iniciales} onChange={(e) => alCambiar({ ...b, iniciales: e.target.value })} />
                </Campo>
            )}
        </>
    );
}

export function CamposContador({ b, alCambiar }: { b: De<"contador">; alCambiar: (b: De<"contador">) => void }) {
    return (
        <>
            <Campo id="ed-titulo" rotulo="Título del contador">
                <input id="ed-titulo" className={s.entrada} value={b.titulo} maxLength={LIM.titulo} autoComplete="off" onChange={(e) => alCambiar({ ...b, titulo: e.target.value })} />
            </Campo>
            <div className={p.dosColumnas}>
                <Campo id="ed-inicial" rotulo="Valor inicial">
                    <input id="ed-inicial" className={s.entrada} inputMode="numeric" value={b.inicial} onChange={(e) => alCambiar({ ...b, inicial: e.target.value })} />
                </Campo>
                <Campo id="ed-paso" rotulo="Paso">
                    <input id="ed-paso" className={s.entrada} inputMode="numeric" value={b.paso} onChange={(e) => alCambiar({ ...b, paso: e.target.value })} />
                </Campo>
                <Campo id="ed-min" rotulo="Mínimo (opcional)">
                    <input id="ed-min" className={s.entrada} inputMode="numeric" value={b.min} onChange={(e) => alCambiar({ ...b, min: e.target.value })} />
                </Campo>
                <Campo id="ed-max" rotulo="Máximo (opcional)">
                    <input id="ed-max" className={s.entrada} inputMode="numeric" value={b.max} onChange={(e) => alCambiar({ ...b, max: e.target.value })} />
                </Campo>
                <Campo id="ed-unidad" rotulo="Unidad (opcional)">
                    <input id="ed-unidad" className={s.entrada} value={b.unidad} maxLength={24} autoComplete="off" onChange={(e) => alCambiar({ ...b, unidad: e.target.value })} />
                </Campo>
            </div>
            <div className={p.editorGrupo} role="radiogroup" aria-label="Quién puede sumar">
                <span className={s.rotulo}>Quién puede sumar</span>
                <div className={s.menuVertical}>
                    {(
                        [
                            ["libre", "Libre: cualquiera suma y resta sin límite personal"],
                            ["voto", "Un voto por persona (se puede retirar)"],
                            ["limite", "Hasta un número de pasos por persona"],
                        ] as const
                    ).map(([modo, texto]) => (
                        <button
                            key={modo}
                            type="button"
                            role="radio"
                            aria-checked={b.modo === modo}
                            className={`${s.boton} ${b.modo === modo ? s.botonPrimario : ""}`}
                            onClick={() => alCambiar({ ...b, modo })}
                        >
                            {texto}
                        </button>
                    ))}
                </div>
                {b.modo === "limite" && (
                    <Campo id="ed-limite" rotulo="Pasos máximos por persona">
                        <input id="ed-limite" className={s.entrada} inputMode="numeric" value={b.limite} onChange={(e) => alCambiar({ ...b, limite: e.target.value })} />
                    </Campo>
                )}
            </div>
        </>
    );
}

export function CamposEncuesta({ b, alCambiar }: { b: De<"encuesta">; alCambiar: (b: De<"encuesta">) => void }) {
    return (
        <>
            <Campo id="ed-titulo" rotulo="Título">
                <input id="ed-titulo" className={s.entrada} value={b.titulo} maxLength={LIM.titulo} autoComplete="off" onChange={(e) => alCambiar({ ...b, titulo: e.target.value })} />
            </Campo>
            <Campo id="ed-pregunta" rotulo="Pregunta">
                <input id="ed-pregunta" className={s.entrada} value={b.pregunta} maxLength={LIM.etiqueta * 2} autoComplete="off" onChange={(e) => alCambiar({ ...b, pregunta: e.target.value })} />
            </Campo>
            <ListaEditable
                idBase="ed-op"
                rotulo="Opciones"
                rotuloItem="Opción"
                rotuloAnadir="Añadir una opción"
                prefijoId="o"
                items={b.opciones}
                min={2}
                max={LIM.opciones}
                alCambiar={(opciones) => alCambiar({ ...b, opciones })}
            />
            <Campo id="ed-max-el" rotulo="Opciones que puede marcar cada persona" ayuda="1 = elección única.">
                <input id="ed-max-el" className={s.entrada} inputMode="numeric" value={b.maxElecciones} onChange={(e) => alCambiar({ ...b, maxElecciones: e.target.value })} />
            </Campo>
        </>
    );
}

export function CamposKanban({ b, alCambiar }: { b: De<"kanban">; alCambiar: (b: De<"kanban">) => void }) {
    return (
        <>
            <Campo id="ed-titulo" rotulo="Título del tablero">
                <input id="ed-titulo" className={s.entrada} value={b.titulo} maxLength={LIM.titulo} autoComplete="off" onChange={(e) => alCambiar({ ...b, titulo: e.target.value })} />
            </Campo>
            <ListaEditable
                idBase="ed-col"
                rotulo="Columnas"
                rotuloItem="Columna"
                rotuloAnadir="Añadir una columna"
                prefijoId="c"
                items={b.columnas}
                min={1}
                max={LIM.columnas}
                alCambiar={(columnas) => alCambiar({ ...b, columnas })}
            />
        </>
    );
}

const TIPOS_CAMPO: { id: TipoCampo; nombre: string }[] = [
    { id: "texto", nombre: "Texto corto" },
    { id: "largo", nombre: "Texto largo" },
    { id: "numero", nombre: "Número" },
    { id: "opcion", nombre: "Elegir una opción" },
    { id: "casilla", nombre: "Casilla (sí / no)" },
];

export function CamposFormulario({ b, alCambiar }: { b: De<"formulario">; alCambiar: (b: De<"formulario">) => void }) {
    const cambiarCampo = (id: string, cambio: Partial<CampoBorrador>) =>
        alCambiar({ ...b, campos: b.campos.map((c) => (c.id === id ? { ...c, ...cambio } : c)) });
    return (
        <>
            <Campo id="ed-titulo" rotulo="Título del formulario">
                <input id="ed-titulo" className={s.entrada} value={b.titulo} maxLength={LIM.titulo} autoComplete="off" onChange={(e) => alCambiar({ ...b, titulo: e.target.value })} />
            </Campo>
            <Campo id="ed-desc" rotulo="Explicación (opcional)">
                <textarea id="ed-desc" className={`${s.entrada} ${p.area}`} value={b.descripcion} maxLength={LIM.descripcion} onChange={(e) => alCambiar({ ...b, descripcion: e.target.value })} />
            </Campo>
            <div className={p.editorGrupo} role="group" aria-label="Campos">
                <span className={s.rotulo}>Campos</span>
                {b.campos.map((c, i) => (
                    <div key={c.id} className={p.editorGrupo}>
                        <div className={p.editorFila}>
                            <input className={s.entrada} value={c.etiqueta} maxLength={LIM.etiqueta} aria-label={`Etiqueta del campo ${i + 1}`} autoComplete="off" onChange={(e) => cambiarCampo(c.id, { etiqueta: e.target.value })} />
                            <Boton
                                redondo
                                className={p.pequenoRedondo}
                                disabled={b.campos.length <= 1}
                                onClick={() => alCambiar({ ...b, campos: b.campos.filter((x) => x.id !== c.id) })}
                                aria-label={`Quitar el campo ${i + 1}`}
                                title="Quitar"
                            >
                                <Trash2 size={15} aria-hidden="true" />
                            </Boton>
                        </div>
                        <div className={p.editorFila}>
                            <select className={`${s.entrada} ${p.selector}`} value={c.tipo} aria-label={`Tipo del campo ${i + 1}`} onChange={(e) => cambiarCampo(c.id, { tipo: e.target.value as TipoCampo })}>
                                {TIPOS_CAMPO.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.nombre}
                                    </option>
                                ))}
                            </select>
                            <label className={p.campoCasilla} style={{ flex: "0 0 auto" }}>
                                <input type="checkbox" checked={c.obligatorio} onChange={(e) => cambiarCampo(c.id, { obligatorio: e.target.checked })} />
                                <span>Obligatorio</span>
                            </label>
                        </div>
                        {c.tipo === "opcion" && (
                            <textarea
                                className={`${s.entrada} ${p.area}`}
                                value={c.opciones}
                                aria-label={`Opciones del campo ${i + 1}, una por línea`}
                                placeholder="Una opción por línea"
                                onChange={(e) => cambiarCampo(c.id, { opciones: e.target.value })}
                            />
                        )}
                    </div>
                ))}
                <div>
                    <Boton
                        disabled={b.campos.length >= LIM.campos}
                        onClick={() => alCambiar({ ...b, campos: [...b.campos, { id: siguienteId("f", b.campos.map((x) => x.id)), etiqueta: "", tipo: "texto", obligatorio: false, opciones: "" }] })}
                        icono={<Plus size={16} aria-hidden="true" />}
                    >
                        Añadir un campo
                    </Boton>
                </div>
            </div>
            <div className={p.dosColumnas}>
                <Campo id="ed-cupo" rotulo="Plazas (opcional)" ayuda="Vacío = sin límite.">
                    <input id="ed-cupo" className={s.entrada} inputMode="numeric" value={b.cupo} onChange={(e) => alCambiar({ ...b, cupo: e.target.value })} />
                </Campo>
            </div>
            <Campo id="ed-conf" rotulo="Mensaje para quien se apunta (opcional)">
                <input id="ed-conf" className={s.entrada} value={b.confirmacion} maxLength={LIM.item} autoComplete="off" onChange={(e) => alCambiar({ ...b, confirmacion: e.target.value })} />
            </Campo>
        </>
    );
}
