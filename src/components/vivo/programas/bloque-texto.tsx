"use client";

import type { BloqueTexto, BloqueTitulo } from "@/lib/vivo/programas/tipos";
import { usePrograma } from "./contexto";
import { MarcoBloque } from "./marco-bloque";
import p from "./programas.module.css";

function Encabezado({ bloque }: { bloque: BloqueTitulo }) {
    // El h1 de la página es el título del programa: los títulos de bloque empiezan en h2.
    if (bloque.nivel === 1) return <h2 className={p.encabezado1}>{bloque.texto}</h2>;
    if (bloque.nivel === 3) return <h4 className={p.encabezado3}>{bloque.texto}</h4>;
    return <h3 className={p.encabezado2}>{bloque.texto}</h3>;
}

/** Un título: sin marco al mirar, con los controles de estructura al editar. */
export function BloqueTituloVista({ bloque }: { bloque: BloqueTitulo }) {
    const { puedeEstructura, modoEdicion } = usePrograma();
    if (puedeEstructura && modoEdicion) {
        return (
            <MarcoBloque bloque={bloque} titulo="Título">
                <Encabezado bloque={bloque} />
            </MarcoBloque>
        );
    }
    return <Encabezado bloque={bloque} />;
}

/** Un texto: solo texto (React lo escapa; nunca se interpreta como HTML). */
export function BloqueTextoVista({ bloque }: { bloque: BloqueTexto }) {
    const { puedeEstructura, modoEdicion } = usePrograma();
    const cuerpo = <p className={p.parrafo}>{bloque.texto}</p>;
    if (puedeEstructura && modoEdicion) {
        return (
            <MarcoBloque bloque={bloque} titulo="Texto">
                {cuerpo}
            </MarcoBloque>
        );
    }
    return cuerpo;
}
