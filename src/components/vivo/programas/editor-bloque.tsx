"use client";

import { useState, type FormEvent } from "react";
import { Check, X } from "lucide-react";
import { sanearBloque } from "@/lib/vivo/programas/esquema";
import { NOMBRE_TIPO_BLOQUE, type BloqueProg, type TipoBloqueProg } from "@/lib/vivo/programas/tipos";
import { Boton, estilos as s } from "../juegos/comun";
import { CamposContador, CamposEncuesta, CamposFormulario, CamposKanban, CamposTareas, CamposTexto, CamposTitulo } from "./editor-campos";
import { bloqueDeBorrador, borradorDeBloque, borradorNuevo, type BorradorBloque } from "./editor-modelo";
import p from "./programas.module.css";

export interface PropsEditorBloque {
    /** Bloque que se edita, o null si se crea uno nuevo. */
    bloque: BloqueProg | null;
    /** Tipo del bloque nuevo (si `bloque` es null). */
    tipo: TipoBloqueProg;
    /** Identificador del bloque nuevo. */
    idNuevo: string;
    /** Recibe el bloque ya validado. Devuelve true si se aplicó (el editor se cierra). */
    alGuardar: (bloque: BloqueProg, esNuevo: boolean) => boolean;
    alCancelar: () => void;
}

/** Editor de un bloque: los campos propios de su tipo y la validación con las mismas reglas del motor. */
export function EditorBloque({ bloque, tipo, idNuevo, alGuardar, alCancelar }: PropsEditorBloque) {
    const esNuevo = bloque === null;
    const [borrador, setBorrador] = useState<BorradorBloque>(() => (bloque ? borradorDeBloque(bloque) : borradorNuevo(tipo, idNuevo)));
    const [error, setError] = useState<string | null>(null);
    const nombre = NOMBRE_TIPO_BLOQUE[borrador.tipo];

    const cambiar = (b: BorradorBloque) => {
        setBorrador(b);
        if (error) setError(null);
    };

    const guardar = (e: FormEvent) => {
        e.preventDefault();
        const r = sanearBloque(bloqueDeBorrador(borrador), { semillas: esNuevo });
        if (!r.bloque) {
            setError(r.problemas[0] ?? "Revisa los datos del bloque.");
            return;
        }
        if (alGuardar(r.bloque, esNuevo)) alCancelar();
    };

    return (
        <form className={`${s.vidrio} ${p.editor}`} onSubmit={guardar} noValidate aria-label={esNuevo ? `Nuevo bloque: ${nombre}` : `Editar el bloque: ${nombre}`}>
            <h2 className={s.titulo}>{esNuevo ? `Añadir: ${nombre}` : `Editar: ${nombre}`}</h2>

            {borrador.tipo === "titulo" && <CamposTitulo b={borrador} alCambiar={cambiar} />}
            {borrador.tipo === "texto" && <CamposTexto b={borrador} alCambiar={cambiar} />}
            {borrador.tipo === "tareas" && <CamposTareas b={borrador} alCambiar={cambiar} nuevo={esNuevo} />}
            {borrador.tipo === "contador" && <CamposContador b={borrador} alCambiar={cambiar} />}
            {borrador.tipo === "encuesta" && <CamposEncuesta b={borrador} alCambiar={cambiar} />}
            {borrador.tipo === "kanban" && <CamposKanban b={borrador} alCambiar={cambiar} />}
            {borrador.tipo === "formulario" && <CamposFormulario b={borrador} alCambiar={cambiar} />}

            {error && (
                <p className={p.errorCampo} role="alert">
                    {error}
                </p>
            )}
            {!esNuevo && borrador.tipo !== "titulo" && borrador.tipo !== "texto" && (
                <p className={s.nota}>Lo que el grupo ya ha puesto se conserva; solo se descarta lo que deja de tener sentido (por ejemplo, votos a una opción que quitas).</p>
            )}
            <div className={s.filaBotones}>
                <Boton type="submit" variante="primario" icono={<Check size={16} aria-hidden="true" />}>
                    {esNuevo ? "Añadir al programa" : "Guardar los cambios"}
                </Boton>
                <Boton onClick={alCancelar} icono={<X size={16} aria-hidden="true" />}>
                    Cancelar
                </Boton>
            </div>
        </form>
    );
}
