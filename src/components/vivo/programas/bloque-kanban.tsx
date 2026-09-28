"use client";

import { useState, type DragEvent, type FormEvent } from "react";
import { ArrowDown, ArrowRightLeft, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { columnasKanban, datosDeTipo } from "@/lib/vivo/programas/derivados";
import { K, LIM, type BloqueKanban, type Tarjeta } from "@/lib/vivo/programas/tipos";
import { Boton, estilos as s } from "../juegos/comun";
import { usePrograma } from "./contexto";
import { MarcoBloque } from "./marco-bloque";
import p from "./programas.module.css";

function FormNueva({ bloque, col, titulo }: { bloque: BloqueKanban; col: string; titulo: string }) {
    const { yoNombre, enviar } = usePrograma();
    const [texto, setTexto] = useState("");
    const enviarForm = (e: FormEvent) => {
        e.preventDefault();
        const limpio = texto.trim();
        if (!limpio) return;
        if (enviar(K.tarjetaAdd, { b: bloque.id, col, texto: limpio, nom: yoNombre })) setTexto("");
    };
    return (
        <form className={p.fila} onSubmit={enviarForm}>
            <input
                className={s.entrada}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                maxLength={LIM.item}
                placeholder="Nueva tarjeta"
                aria-label={`Nueva tarjeta en «${titulo}»`}
                autoComplete="off"
            />
            <Boton type="submit" redondo className={p.pequenoRedondo} variante="primario" disabled={texto.trim().length === 0} aria-label={`Añadir la tarjeta a «${titulo}»`}>
                <Plus size={16} aria-hidden="true" />
            </Boton>
        </form>
    );
}

function TarjetaVista({ bloque, tarjeta, indice, total, arrastrando, alArrastrar, alSoltar }: {
    bloque: BloqueKanban;
    tarjeta: Tarjeta;
    indice: number;
    total: number;
    arrastrando: boolean;
    alArrastrar: (id: string | null) => void;
    alSoltar: () => void;
}) {
    const { puedeParticipar, enviar } = usePrograma();
    const [menu, setMenu] = useState(false);
    const [editando, setEditando] = useState(false);
    const [borrador, setBorrador] = useState(tarjeta.texto);

    const guardarEdicion = (e: FormEvent) => {
        e.preventDefault();
        const limpio = borrador.trim();
        if (!limpio) return;
        if (limpio === tarjeta.texto || enviar(K.tarjetaEditar, { b: bloque.id, i: tarjeta.id, texto: limpio })) setEditando(false);
    };
    const mover = (col: string, pos?: number) => {
        if (enviar(K.tarjetaMover, { b: bloque.id, i: tarjeta.id, col, ...(pos === undefined ? {} : { pos }) })) setMenu(false);
    };

    return (
        <li
            className={`${p.tarjetaKanban} ${arrastrando ? p.tarjetaArrastrando : ""}`}
            draggable={puedeParticipar && !editando}
            onDragStart={(e: DragEvent<HTMLLIElement>) => {
                e.dataTransfer.setData("text/plain", tarjeta.id);
                e.dataTransfer.effectAllowed = "move";
                alArrastrar(tarjeta.id);
            }}
            onDragEnd={alSoltar}
        >
            {editando ? (
                <form className={p.fila} onSubmit={guardarEdicion}>
                    <input className={s.entrada} value={borrador} onChange={(e) => setBorrador(e.target.value)} maxLength={LIM.item} aria-label="Texto de la tarjeta" autoFocus />
                    <Boton type="submit" redondo className={p.pequenoRedondo} variante="primario" disabled={borrador.trim().length === 0} aria-label="Guardar el texto de la tarjeta">
                        <Check size={16} aria-hidden="true" />
                    </Boton>
                    <Boton redondo className={p.pequenoRedondo} onClick={() => { setEditando(false); setBorrador(tarjeta.texto); }} aria-label="Cancelar la edición">
                        <X size={16} aria-hidden="true" />
                    </Boton>
                </form>
            ) : (
                <span className={p.tarjetaTexto}>{tarjeta.texto}</span>
            )}
            {tarjeta.por && !editando && <span className={p.etiquetaPequena}>Añadida por {tarjeta.por}</span>}
            {puedeParticipar && !editando && (
                <div className={p.tarjetaAcciones}>
                    <Boton className={p.pequeno} onClick={() => setMenu((v) => !v)} aria-expanded={menu} icono={<ArrowRightLeft size={14} aria-hidden="true" />}>
                        Mover
                    </Boton>
                    <Boton redondo className={p.pequenoRedondo} onClick={() => { setBorrador(tarjeta.texto); setEditando(true); }} aria-label={`Editar la tarjeta: ${tarjeta.texto}`} title="Editar">
                        <Pencil size={14} aria-hidden="true" />
                    </Boton>
                    <Boton redondo className={p.pequenoRedondo} onClick={() => enviar(K.tarjetaQuitar, { b: bloque.id, i: tarjeta.id })} aria-label={`Quitar la tarjeta: ${tarjeta.texto}`} title="Quitar">
                        <Trash2 size={14} aria-hidden="true" />
                    </Boton>
                </div>
            )}
            {menu && puedeParticipar && (
                <div className={p.menuMover} role="group" aria-label={`Mover la tarjeta: ${tarjeta.texto}`}>
                    {bloque.columnas
                        .filter((c) => c.id !== tarjeta.col)
                        .map((c) => (
                            <Boton key={c.id} className={p.pequeno} onClick={() => mover(c.id)}>
                                Mover a «{c.titulo}»
                            </Boton>
                        ))}
                    {indice > 0 && (
                        <Boton className={p.pequeno} onClick={() => mover(tarjeta.col, indice - 1)} icono={<ArrowUp size={14} aria-hidden="true" />}>
                            Subir en la columna
                        </Boton>
                    )}
                    {indice < total - 1 && (
                        <Boton className={p.pequeno} onClick={() => mover(tarjeta.col, indice + 1)} icono={<ArrowDown size={14} aria-hidden="true" />}>
                            Bajar en la columna
                        </Boton>
                    )}
                </div>
            )}
        </li>
    );
}

/** Tablero kanban compartido: tarjetas en columnas que cualquiera añade, edita y mueve (con botones o arrastrando). */
export function BloqueKanbanVista({ bloque }: { bloque: BloqueKanban }) {
    const { estado, puedeParticipar, enviar } = usePrograma();
    const tarjetas = datosDeTipo(estado.datos[bloque.id], "kanban")?.tarjetas ?? [];
    const columnas = columnasKanban(bloque, tarjetas);
    const [arrastrada, setArrastrada] = useState<string | null>(null);
    const [sobre, setSobre] = useState<string | null>(null);

    const soltarEn = (col: string) => (e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain") || arrastrada;
        setSobre(null);
        setArrastrada(null);
        if (!id) return;
        const t = tarjetas.find((x) => x.id === id);
        if (t && t.col !== col) enviar(K.tarjetaMover, { b: bloque.id, i: id, col });
    };

    return (
        <MarcoBloque bloque={bloque} titulo={bloque.titulo} subtitulo={`${tarjetas.length} ${tarjetas.length === 1 ? "tarjeta" : "tarjetas"} en ${columnas.length} ${columnas.length === 1 ? "columna" : "columnas"}`}>
            <div className={p.tablero}>
                {columnas.map((c) => (
                    <section
                        key={c.id}
                        className={`${p.columna} ${sobre === c.id ? p.columnaSobre : ""}`}
                        aria-label={`Columna ${c.titulo}, ${c.tarjetas.length} ${c.tarjetas.length === 1 ? "tarjeta" : "tarjetas"}`}
                        onDragOver={(e) => {
                            if (!puedeParticipar) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            if (sobre !== c.id) setSobre(c.id);
                        }}
                        onDragLeave={() => setSobre((v) => (v === c.id ? null : v))}
                        onDrop={puedeParticipar ? soltarEn(c.id) : undefined}
                    >
                        <div className={p.columnaCabecera}>
                            <h3 className={p.columnaTitulo}>{c.titulo}</h3>
                            <span className={p.cuenta} aria-hidden="true">{c.tarjetas.length}</span>
                        </div>
                        <ul className={p.tarjetasKanban}>
                            {c.tarjetas.map((t, i) => (
                                <TarjetaVista
                                    key={t.id}
                                    bloque={bloque}
                                    tarjeta={t}
                                    indice={i}
                                    total={c.tarjetas.length}
                                    arrastrando={arrastrada === t.id}
                                    alArrastrar={setArrastrada}
                                    alSoltar={() => { setArrastrada(null); setSobre(null); }}
                                />
                            ))}
                        </ul>
                        {puedeParticipar && <FormNueva bloque={bloque} col={c.id} titulo={c.titulo} />}
                    </section>
                ))}
            </div>
            {!puedeParticipar && <p className={s.nota}>Puedes mirar el tablero, pero no cambiarlo.</p>}
        </MarcoBloque>
    );
}
