"use client";

import { useState } from "react";
import { Check, Copy, Lock, LockOpen, Save } from "lucide-react";
import { LIM, type EstadoPrograma } from "@/lib/vivo/programas/tipos";
import { Boton, estilos as s } from "../juegos/comun";
import p from "./programas.module.css";

export interface PropsLateralPrograma {
    estado: EstadoPrograma;
    /** Puede cambiar título y descripción (y ve los ajustes). */
    puedeEstructura: boolean;
    /** Es quien creó el programa: decide si queda abierto a cambios. */
    esCreador: boolean;
    modoEdicion: boolean;
    alGuardarTitulo: (titulo: string, descripcion: string) => boolean;
    alAlternarAbierto: () => void;
    alCopiarInterfaz: () => void;
}

/** Ajustes del programa (al editar) y las notas honestas de cómo funciona y sus límites. */
export function LateralPrograma({ estado, puedeEstructura, esCreador, modoEdicion, alGuardarTitulo, alAlternarAbierto, alCopiarInterfaz }: PropsLateralPrograma) {
    const [titulo, setTitulo] = useState(estado.titulo);
    const [descripcion, setDescripcion] = useState(estado.descripcion);
    const cambiado = titulo.trim() !== estado.titulo || descripcion.trim() !== estado.descripcion;
    return (
        <aside className={s.lateral}>
            {puedeEstructura && modoEdicion && (
                <section className={`${s.vidrio} ${s.panel}`} aria-label="Ajustes del programa">
                    <span className={s.rotulo}>Ajustes del programa</span>
                    <div className={s.campo}>
                        <label className={s.rotulo} htmlFor="ajuste-titulo">
                            Título
                        </label>
                        <input id="ajuste-titulo" className={s.entrada} value={titulo} maxLength={LIM.titulo} autoComplete="off" onChange={(e) => setTitulo(e.target.value)} />
                    </div>
                    <div className={s.campo}>
                        <label className={s.rotulo} htmlFor="ajuste-descripcion">
                            Descripción (opcional)
                        </label>
                        <textarea id="ajuste-descripcion" className={`${s.entrada} ${p.area}`} value={descripcion} maxLength={LIM.descripcion} onChange={(e) => setDescripcion(e.target.value)} />
                    </div>
                    <div>
                        <Boton
                            variante="primario"
                            disabled={!cambiado || titulo.trim().length === 0}
                            onClick={() => alGuardarTitulo(titulo, descripcion)}
                            icono={cambiado ? <Save size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                        >
                            {cambiado ? "Guardar título y descripción" : "Título guardado"}
                        </Boton>
                    </div>
                    {esCreador && (
                        <div className={p.editorGrupo}>
                            <span className={s.rotulo}>Quién cambia los bloques</span>
                            <Boton
                                onClick={alAlternarAbierto}
                                aria-pressed={estado.abierto}
                                icono={estado.abierto ? <LockOpen size={16} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
                            >
                                {estado.abierto ? "Abierto: cualquiera con permiso puede editar" : "Cerrado: solo tú cambias los bloques"}
                            </Boton>
                            <span className={p.etiquetaPequena}>Participar (votar, marcar, apuntarse…) lo puede hacer siempre cualquiera con permiso de edición.</span>
                        </div>
                    )}
                </section>
            )}

            <section className={`${s.vidrio} ${s.panel}`} aria-label="Cómo funciona">
                <span className={s.rotulo}>Cómo funciona (y sus límites)</span>
                <p className={s.nota}>Cada acción se comprueba con las mismas reglas en todos los dispositivos. Si recargas o entras tarde, el programa se reconstruye solo.</p>
                <p className={s.nota}>Los votos y las respuestas no son secretos: el grupo puede ver quién hizo qué.</p>
                <p className={s.nota}>
                    El canal en vivo no identifica a quien envía cada mensaje. Lo que queda guardado solo lo escriben personas con permiso de edición. Un enlace público solo deja mirar.
                </p>
                <p className={s.nota}>Un programa no ejecuta código: es un catálogo cerrado de bloques.</p>
                <div>
                    <Boton onClick={alCopiarInterfaz} icono={<Copy size={16} aria-hidden="true" />}>
                        Copiar como interfaz (UiSpec)
                    </Boton>
                </div>
            </section>
        </aside>
    );
}
