"use client";

/**
 * El RENDERIZADOR SEGURO de un programa: recorre el vocabulario CERRADO de bloques y pinta cada
 * uno con un componente propio. No hay HTML crudo, ni `dangerouslySetInnerHTML`, ni evaluación:
 * todo lo que ponen las personas (títulos, tareas, respuestas…) llega como texto y React lo
 * escapa. Un tipo de bloque desconocido (de una versión más nueva) se avisa, no se ejecuta.
 */
import { useMemo } from "react";
import type { Datos } from "@/lib/vivo/juegos/tipos";
import type { BloqueProg, EstadoPrograma } from "@/lib/vivo/programas/tipos";
import { Aviso, estilos as s } from "../juegos/comun";
import { BloqueContadorVista } from "./bloque-contador";
import { BloqueEncuestaVista } from "./bloque-encuesta";
import { BloqueFormularioVista } from "./bloque-formulario";
import { BloqueKanbanVista } from "./bloque-kanban";
import { BloqueTareasVista } from "./bloque-tareas";
import { BloqueTextoVista, BloqueTituloVista } from "./bloque-texto";
import { ProveedorPrograma, type ContextoPrograma } from "./contexto";
import p from "./programas.module.css";

export interface PropsRenderPrograma {
    estado: EstadoPrograma;
    yoUid: string | null;
    yoNombre: string;
    puedeParticipar: boolean;
    modoEdicion?: boolean;
    enviar: (k: string, d?: Datos) => boolean;
    editarBloque?: (b: BloqueProg) => void;
}

function BloqueVista({ bloque }: { bloque: BloqueProg }) {
    switch (bloque.tipo) {
        case "titulo":
            return <BloqueTituloVista bloque={bloque} />;
        case "texto":
            return <BloqueTextoVista bloque={bloque} />;
        case "tareas":
            return <BloqueTareasVista bloque={bloque} />;
        case "contador":
            return <BloqueContadorVista bloque={bloque} />;
        case "encuesta":
            return <BloqueEncuestaVista bloque={bloque} />;
        case "kanban":
            return <BloqueKanbanVista bloque={bloque} />;
        case "formulario":
            return <BloqueFormularioVista bloque={bloque} />;
        default:
            return <Aviso>Este bloque es de un tipo que esta versión no conoce; se omite.</Aviso>;
    }
}

export function RenderPrograma({ estado, yoUid, yoNombre, puedeParticipar, modoEdicion = false, enviar, editarBloque }: PropsRenderPrograma) {
    const puedeEstructura = puedeParticipar && !!yoUid && (estado.abierto || estado.creador === yoUid);
    const contexto = useMemo<ContextoPrograma>(
        () => ({ estado, yoUid, yoNombre, puedeParticipar, puedeEstructura, modoEdicion, enviar, editarBloque: editarBloque ?? (() => {}) }),
        [estado, yoUid, yoNombre, puedeParticipar, puedeEstructura, modoEdicion, enviar, editarBloque],
    );

    return (
        <ProveedorPrograma value={contexto}>
            <div className={p.pila} aria-label="Contenido del programa">
                {estado.bloques.length === 0 ? (
                    <p className={`${s.vidrio} ${p.vacio}`} style={{ padding: 24 }}>
                        Este programa aún no tiene bloques.
                        {puedeEstructura ? " Pulsa «Editar programa» para añadir el primero." : " Quien lo creó puede añadirlos."}
                    </p>
                ) : (
                    estado.bloques.map((b) => <BloqueVista key={b.id} bloque={b} />)
                )}
            </div>
        </ProveedorPrograma>
    );
}
