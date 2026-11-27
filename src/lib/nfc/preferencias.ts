export type RelacionNFC =
    | "misma-cuenta"
    | "otra-reconocida"
    | "otra-nueva"
    | "nodo-propio"
    | "nodo-publico"
    | "etiqueta";

export type PerfilVisibilidad = "publico" | "no-mostrar" | "pedir-permiso";

export type AvisoNFC = "notificar" | "silenciar" | "ignorar" | "recordar";

export type UbicacionRegistro = "privado" | "publico" | "no";

export type AccionCatalogo =
    | "añadir-contacto"
    | "enviar-mensaje"
    | "enviar-archivo"
    | "crear-grupo"
    | "invitar-grupo"
    | "compartir-capacidades"
    | "vincular-capa"
    | "control-remoto"
    | "registro-evento"
    | "abrir-oferta-nodo"
    | "registrar-ubicacion";

export interface PreferenciasRelacion {
    perfil: PerfilVisibilidad;
    accionesAutomaticas: AccionCatalogo[];
    accionesOfrecidas: AccionCatalogo[];
    aviso: AvisoNFC;
    ubicacion: UbicacionRegistro;
}

export interface ExcepcionNeurona {
    neuronaId: string;
    perfil?: PerfilVisibilidad;
    accionesAutomaticas?: AccionCatalogo[];
    accionesOfrecidas?: AccionCatalogo[];
    aviso?: AvisoNFC;
    ubicacion?: UbicacionRegistro;
}

export interface PreferenciasNFC {
    porRelacion: Record<RelacionNFC, PreferenciasRelacion>;
    excepciones: ExcepcionNeurona[];
}

const CATALOGO_COMPLETO: AccionCatalogo[] = [
    "añadir-contacto",
    "enviar-mensaje",
    "enviar-archivo",
    "crear-grupo",
    "invitar-grupo",
    "compartir-capacidades",
    "vincular-capa",
    "control-remoto",
    "registro-evento",
    "abrir-oferta-nodo",
    "registrar-ubicacion",
];

const ACCIONES_MISMA_CUENTA_AUTO: AccionCatalogo[] = [
    "añadir-contacto",
    "enviar-mensaje",
    "compartir-capacidades",
    "vincular-capa",
    "registrar-ubicacion",
];

const ACCIONES_MISMA_CUENTA_OFRECIDAS: AccionCatalogo[] = [
    "enviar-archivo",
    "crear-grupo",
    "invitar-grupo",
    "control-remoto",
    "registro-evento",
    "abrir-oferta-nodo",
];

const ACCIONES_NODO_PROPIO_AUTO: AccionCatalogo[] = [
    "abrir-oferta-nodo",
    "registrar-ubicacion",
];

const ACCIONES_NODO_PROPIO_OFRECIDAS: AccionCatalogo[] = [
    "añadir-contacto",
    "enviar-mensaje",
    "enviar-archivo",
    "crear-grupo",
    "invitar-grupo",
    "compartir-capacidades",
    "vincular-capa",
    "control-remoto",
    "registro-evento",
    "abrir-oferta-nodo",
];

const ACCIONES_NODO_PUBLICO_OFRECIDAS: AccionCatalogo[] = [
    "abrir-oferta-nodo",
    "registrar-ubicacion",
    "añadir-contacto",
    "enviar-mensaje",
];

const ACCIONES_OTRA_RECONOCIDA_OFRECIDAS: AccionCatalogo[] = [
    "añadir-contacto",
    "enviar-mensaje",
    "enviar-archivo",
    "crear-grupo",
    "invitar-grupo",
    "compartir-capacidades",
    "vincular-capa",
    "registro-evento",
    "registrar-ubicacion",
];

const ACCIONES_OTRA_NUEVA_OFRECIDAS: AccionCatalogo[] = [
    "añadir-contacto",
    "enviar-mensaje",
    "enviar-archivo",
    "crear-grupo",
    "invitar-grupo",
    "compartir-capacidades",
    "vincular-capa",
    "registro-evento",
    "registrar-ubicacion",
];

const ACCIONES_ETIQUETA_OFRECIDAS: AccionCatalogo[] = [
    "registrar-ubicacion",
    "abrir-oferta-nodo",
];

export function crearPreferenciasPorDefecto(): PreferenciasNFC {
    return {
        porRelacion: {
            "misma-cuenta": {
                perfil: "publico",
                accionesAutomaticas: [...ACCIONES_MISMA_CUENTA_AUTO],
                accionesOfrecidas: [...ACCIONES_MISMA_CUENTA_OFRECIDAS],
                aviso: "notificar",
                ubicacion: "privado",
            },
            "otra-reconocida": {
                perfil: "pedir-permiso",
                accionesAutomaticas: [],
                accionesOfrecidas: [...ACCIONES_OTRA_RECONOCIDA_OFRECIDAS],
                aviso: "notificar",
                ubicacion: "no",
            },
            "otra-nueva": {
                perfil: "pedir-permiso",
                accionesAutomaticas: [],
                accionesOfrecidas: [...ACCIONES_OTRA_NUEVA_OFRECIDAS],
                aviso: "notificar",
                ubicacion: "no",
            },
            "nodo-propio": {
                perfil: "publico",
                accionesAutomaticas: [...ACCIONES_NODO_PROPIO_AUTO],
                accionesOfrecidas: [...ACCIONES_NODO_PROPIO_OFRECIDAS],
                aviso: "notificar",
                ubicacion: "privado",
            },
            "nodo-publico": {
                perfil: "publico",
                accionesAutomaticas: [],
                accionesOfrecidas: [...ACCIONES_NODO_PUBLICO_OFRECIDAS],
                aviso: "notificar",
                ubicacion: "publico",
            },
            etiqueta: {
                perfil: "no-mostrar",
                accionesAutomaticas: [],
                accionesOfrecidas: [...ACCIONES_ETIQUETA_OFRECIDAS],
                aviso: "notificar",
                ubicacion: "no",
            },
        },
        excepciones: [],
    };
}

export function obtenerPreferenciasParaRelacion(
    prefs: PreferenciasNFC,
    relacion: RelacionNFC,
    neuronaId?: string
): PreferenciasRelacion {
    let base = { ...prefs.porRelacion[relacion] };
    if (neuronaId) {
        const excepcion = prefs.excepciones.find((e) => e.neuronaId === neuronaId);
        if (excepcion) {
            if (excepcion.perfil) base.perfil = excepcion.perfil;
            if (excepcion.accionesAutomaticas) base.accionesAutomaticas = [...excepcion.accionesAutomaticas];
            if (excepcion.accionesOfrecidas) base.accionesOfrecidas = [...excepcion.accionesOfrecidas];
            if (excepcion.aviso) base.aviso = excepcion.aviso;
            if (excepcion.ubicacion) base.ubicacion = excepcion.ubicacion;
        }
    }
    return base;
}

export function aplicarExcepcionNeurona(
    prefs: PreferenciasNFC,
    neuronaId: string,
    cambios: Partial<Omit<ExcepcionNeurona, "neuronaId">>
): PreferenciasNFC {
    const indice = prefs.excepciones.findIndex((e) => e.neuronaId === neuronaId);
    const nuevaExcepcion: ExcepcionNeurona = { neuronaId, ...cambios };
    const nuevasExcepciones = [...prefs.excepciones];
    if (indice >= 0) {
        nuevasExcepciones[indice] = { ...nuevasExcepciones[indice], ...cambios };
    } else {
        nuevasExcepciones.push(nuevaExcepcion);
    }
    return { ...prefs, excepciones: nuevasExcepciones };
}

export function eliminarExcepcionNeurona(prefs: PreferenciasNFC, neuronaId: string): PreferenciasNFC {
    return {
        ...prefs,
        excepciones: prefs.excepciones.filter((e) => e.neuronaId !== neuronaId),
    };
}

export function obtenerTodasLasAccionesDelCatalogo(): AccionCatalogo[] {
    return [...CATALOGO_COMPLETO];
}