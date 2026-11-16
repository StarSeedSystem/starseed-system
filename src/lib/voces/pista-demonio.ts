/**
 * Pistas de la interfaz para el demonio de voz local.
 *
 * Regla de seguridad: la interfaz NO enseña el comando de arranque ni rutas del
 * disco (`~/.starseed/...`). Para encender el demonio, la persona usa la pestaña
 * «Motores» del Estudio, que lo reinicia con el modelo elegido por
 * `/api/voz/motores`; así no se lanza un segundo tts-server a mano (900 MB por
 * copia en una Mac de 8 GB, CLAUDE.md).
 */

/** Texto del panel «Motor» cuando el demonio está apagado. */
export interface PistaDemonioApagado {
    titulo: string;
    detalle: string;
}

/** Pista segura para encender el demonio: sin comandos ni rutas. */
export function pistaDemonioApagado(): PistaDemonioApagado {
    return {
        titulo: "El demonio está apagado.",
        detalle:
            "Enciéndelo desde la pestaña «Motores» de este Estudio: elige el modelo y pulsa «Cargar este modelo».",
    };
}
