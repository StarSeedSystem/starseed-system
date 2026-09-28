"use client";

import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Lock, LockOpen, Pencil, Trash2 } from "lucide-react";
import { K, NOMBRE_TIPO_BLOQUE, type BloqueProg } from "@/lib/vivo/programas/tipos";
import { Boton, estilos as s } from "../juegos/comun";
import { usePrograma } from "./contexto";
import { COLOR_BLOQUE, ICONO_BLOQUE } from "./iconos-bloque";
import p from "./programas.module.css";

export interface CierreBloque {
    cerrado: boolean;
    /** Texto del botón cuando está abierto («Cerrar la encuesta»). */
    cerrar: string;
    /** Texto del botón cuando está cerrado («Reabrir la encuesta»). */
    abrir: string;
    /** Nombre de la acción de estructura que lo cambia. */
    accion: typeof K.encuestaCerrar | typeof K.formularioCerrar;
}

/**
 * Marco común de un bloque: icono, título y, en modo edición, los controles de estructura
 * (subir, bajar, editar, cerrar/reabrir y quitar con confirmación).
 */
export function MarcoBloque({
    bloque,
    titulo,
    subtitulo,
    cierre,
    etiquetas,
    children,
}: {
    bloque: BloqueProg;
    titulo: string;
    subtitulo?: string;
    cierre?: CierreBloque;
    /** Píldoras junto al título («Cerrada», «Sin plazas»…). */
    etiquetas?: ReactNode;
    children: ReactNode;
}) {
    const { estado, puedeEstructura, modoEdicion, enviar, editarBloque } = usePrograma();
    const [confirmando, setConfirmando] = useState(false);
    const Icono = ICONO_BLOQUE[bloque.tipo];
    const color = COLOR_BLOQUE[bloque.tipo];
    const editando = puedeEstructura && modoEdicion;
    const indice = estado.bloques.findIndex((b) => b.id === bloque.id);
    const nombre = NOMBRE_TIPO_BLOQUE[bloque.tipo].toLowerCase();

    return (
        <section className={`${s.vidrio} ${p.bloque} ${editando ? p.bloqueEditando : ""}`} aria-label={titulo || NOMBRE_TIPO_BLOQUE[bloque.tipo]}>
            <header className={p.bloqueCabecera}>
                <span className={p.bloqueIcono} style={{ background: `${color}26`, boxShadow: `inset 0 0 0 1px ${color}66`, color }}>
                    <Icono size={18} aria-hidden="true" />
                </span>
                <div className={p.bloqueTitulos}>
                    <h2 className={p.bloqueTitulo}>{titulo}</h2>
                    {subtitulo && <span className={s.nota}>{subtitulo}</span>}
                </div>
                {etiquetas}
                {editando && (
                    <div className={p.controlesBloque} role="group" aria-label={`Estructura de ${titulo || nombre}`}>
                        <Boton
                            redondo
                            className={p.pequenoRedondo}
                            disabled={indice <= 0}
                            onClick={() => enviar(K.bloqueMover, { b: bloque.id, dir: -1 })}
                            aria-label={`Subir el bloque ${titulo || nombre}`}
                            title="Subir"
                        >
                            <ArrowUp size={16} aria-hidden="true" />
                        </Boton>
                        <Boton
                            redondo
                            className={p.pequenoRedondo}
                            disabled={indice < 0 || indice >= estado.bloques.length - 1}
                            onClick={() => enviar(K.bloqueMover, { b: bloque.id, dir: 1 })}
                            aria-label={`Bajar el bloque ${titulo || nombre}`}
                            title="Bajar"
                        >
                            <ArrowDown size={16} aria-hidden="true" />
                        </Boton>
                        <Boton
                            redondo
                            className={p.pequenoRedondo}
                            onClick={() => editarBloque(bloque)}
                            aria-label={`Editar el bloque ${titulo || nombre}`}
                            title="Editar"
                        >
                            <Pencil size={16} aria-hidden="true" />
                        </Boton>
                        {cierre && (
                            <Boton
                                redondo
                                className={p.pequenoRedondo}
                                onClick={() => enviar(cierre.accion, cierre.accion === K.encuestaCerrar ? { b: bloque.id, cerrada: !cierre.cerrado } : { b: bloque.id, cerrado: !cierre.cerrado })}
                                aria-label={cierre.cerrado ? cierre.abrir : cierre.cerrar}
                                title={cierre.cerrado ? cierre.abrir : cierre.cerrar}
                            >
                                {cierre.cerrado ? <LockOpen size={16} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
                            </Boton>
                        )}
                        <Boton
                            redondo
                            variante="peligro"
                            className={p.pequenoRedondo}
                            onClick={() => setConfirmando(true)}
                            aria-label={`Quitar el bloque ${titulo || nombre}`}
                            title="Quitar"
                        >
                            <Trash2 size={16} aria-hidden="true" />
                        </Boton>
                    </div>
                )}
            </header>

            {editando && confirmando && (
                <div className={s.confirmar} role="alertdialog" aria-label="Confirmar que se quita el bloque">
                    <strong>¿Quitar este bloque y todo lo que el grupo ha puesto en él?</strong>
                    <div className={s.filaBotones}>
                        <Boton
                            variante="peligro"
                            onClick={() => {
                                setConfirmando(false);
                                enviar(K.bloqueQuitar, { b: bloque.id });
                            }}
                        >
                            Sí, quitar el bloque
                        </Boton>
                        <Boton onClick={() => setConfirmando(false)}>Conservarlo</Boton>
                    </div>
                </div>
            )}

            {children}
        </section>
    );
}
