"use client";
/** Portada de `/tabla`: mis tablas, las que me compartieron y crear una nueva. */
import { Table2 } from "lucide-react";
import { crearVivoTabla, INFO_VIVO_TABLA, rutaTabla } from "@/lib/vivo/tabla";
import { ListaEspacios } from "./lista-espacios";

export function ListaTablas() {
    return (
        <ListaEspacios
            tipo="tabla"
            titulo={INFO_VIVO_TABLA.etiqueta}
            descripcion="Una hoja de datos que se rellena entre varias personas, celda a celda y en vivo. Con columnas de texto, número, fecha, casilla, selección, enlace, persona y fórmulas."
            Icono={Table2}
            color={INFO_VIVO_TABLA.color}
            rutaDe={rutaTabla}
            crear={(titulo) => crearVivoTabla(titulo)}
            etiquetaCrear="Crear una tabla"
            ayudaVacio="Aún no tienes ninguna tabla. Ponle un nombre arriba y crea la primera, o abre el enlace de una que te hayan compartido."
        />
    );
}
