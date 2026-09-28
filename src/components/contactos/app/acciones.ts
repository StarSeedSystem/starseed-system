/**
 * acciones — operaciones de la app que combinan varias llamadas del almacén.
 *
 * `aplicarVisibilidad`: `cambiarVisibilidad` marca el contacto en local ANTES de hablar con
 * `os_contactos_publicos`; si publicar falla (p. ej. la migración aún no está aplicada en el
 * servidor), aquí se devuelve a «privada» para que la ficha nunca diga «Pública» sin serlo.
 */

import type { Contacto, ContactoEntrada, ContactosApi, VisibilidadContacto } from "@/lib/contactos/tipos";

export async function aplicarVisibilidad(
    api: Pick<ContactosApi, "cambiarVisibilidad" | "actualizar">,
    id: string,
    v: VisibilidadContacto,
): Promise<string | null> {
    const error = await api.cambiarVisibilidad(id, v);
    if (error && v === "publica") api.actualizar(id, { visibilidad: "privada" });
    return error;
}

/** Campos editables de un contacto, para volcar el resultado de una fusión con `actualizar`. */
export function camposEditables(c: Contacto): Partial<ContactoEntrada> {
    return {
        nombre: c.nombre,
        apodo: c.apodo ?? "",
        descripcion: c.descripcion ?? "",
        relacion: c.relacion,
        relacionDetalle: c.relacionDetalle ?? "",
        telefonos: c.telefonos,
        correos: c.correos,
        enlaces: c.enlaces,
        organizacion: c.organizacion ?? "",
        cargo: c.cargo ?? "",
        direccion: c.direccion ?? "",
        cumpleanos: c.cumpleanos,
        categorias: c.categorias,
        listas: c.listas,
        favorito: c.favorito,
        userId: c.userId ?? null,
        username: c.username ?? null,
        perfil: c.perfil ?? null,
    };
}
