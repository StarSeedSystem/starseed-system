"use client";

import { useState, type FormEvent } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { datosDeTipo } from "@/lib/vivo/programas/derivados";
import { K, LIM, type BloqueTareas } from "@/lib/vivo/programas/tipos";
import { Boton, estilos as s } from "../juegos/comun";
import { usePrograma } from "./contexto";
import { MarcoBloque } from "./marco-bloque";
import p from "./programas.module.css";

/** Lista de tareas compartida: cualquiera añade, marca y quita; se ve quién marcó cada una. */
export function BloqueTareasVista({ bloque }: { bloque: BloqueTareas }) {
    const { estado, puedeParticipar, yoNombre, enviar } = usePrograma();
    const items = datosDeTipo(estado.datos[bloque.id], "tareas")?.items ?? [];
    const [texto, setTexto] = useState("");
    const hechas = items.filter((t) => t.hecha).length;
    const porcentaje = items.length === 0 ? 0 : Math.round((hechas / items.length) * 100);

    const anadir = (e: FormEvent) => {
        e.preventDefault();
        const limpio = texto.trim();
        if (!limpio) return;
        if (enviar(K.tareaAdd, { b: bloque.id, texto: limpio, nom: yoNombre })) setTexto("");
    };

    return (
        <MarcoBloque bloque={bloque} titulo={bloque.titulo} subtitulo={items.length === 0 ? undefined : `${hechas} de ${items.length} hechas`}>
            {items.length > 0 && (
                <div
                    className={p.progreso}
                    role="progressbar"
                    aria-label={`Progreso de «${bloque.titulo}»`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={porcentaje}
                >
                    <div className={p.progresoRelleno} style={{ width: `${porcentaje}%` }} />
                </div>
            )}

            {items.length === 0 ? (
                <p className={p.vacio}>Todavía no hay tareas. Añade la primera.</p>
            ) : (
                <ul className={p.tareas}>
                    {items.map((t) => (
                        <li key={t.id} className={`${p.tarea} ${t.hecha ? p.tareaHecha : ""}`}>
                            <button
                                type="button"
                                role="checkbox"
                                aria-checked={t.hecha}
                                aria-label={`${t.hecha ? "Desmarcar" : "Marcar como hecha"}: ${t.texto}`}
                                className={`${p.check} ${t.hecha ? p.checkOn : ""} ss-redondo`}
                                disabled={!puedeParticipar}
                                onClick={() => enviar(K.tareaMarcar, { b: bloque.id, i: t.id, hecha: !t.hecha, nom: yoNombre })}
                            >
                                <span className={p.checkCirculo}>{t.hecha && <Check size={15} strokeWidth={3} aria-hidden="true" />}</span>
                            </button>
                            <span className={p.tareaCuerpo}>
                                <span className={p.tareaTexto}>{t.texto}</span>
                                {(t.por || (t.hecha && t.hechaPor)) && (
                                    <span className={p.tareaAutor}>
                                        {t.hecha && t.hechaPor ? `Hecha por ${t.hechaPor}` : t.por ? `Añadida por ${t.por}` : ""}
                                    </span>
                                )}
                            </span>
                            {puedeParticipar && (
                                <Boton
                                    redondo
                                    className={p.pequenoRedondo}
                                    onClick={() => enviar(K.tareaQuitar, { b: bloque.id, i: t.id })}
                                    aria-label={`Quitar la tarea: ${t.texto}`}
                                    title="Quitar"
                                >
                                    <Trash2 size={15} aria-hidden="true" />
                                </Boton>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {puedeParticipar ? (
                <form className={p.fila} onSubmit={anadir}>
                    <input
                        className={s.entrada}
                        value={texto}
                        onChange={(e) => setTexto(e.target.value)}
                        maxLength={LIM.item}
                        placeholder="Nueva tarea"
                        aria-label={`Nueva tarea en «${bloque.titulo}»`}
                        autoComplete="off"
                    />
                    <Boton type="submit" variante="primario" disabled={texto.trim().length === 0} icono={<Plus size={16} aria-hidden="true" />}>
                        Añadir
                    </Boton>
                </form>
            ) : (
                <p className={s.nota}>Puedes mirar la lista, pero no cambiarla.</p>
            )}
        </MarcoBloque>
    );
}
