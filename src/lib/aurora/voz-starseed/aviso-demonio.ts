/**
 * AVISO DEL DEMONIO APAGADO (tarea IMG-profunda-eliminar-exposicion-de-comando)
 * ─────────────────────────────────────────────────────────────────────────────
 * Texto del panel «Motor» para cuando el demonio local de voz (127.0.0.1:4500)
 * está apagado. Antes se enseñaba el comando exacto de arranque, con rutas del
 * disco del usuario; eso ya no se expone en ninguna pantalla del OS.
 *
 * El arranque se hace desde la pestaña «Motores» del propio Estudio: su
 * `POST /api/voz/motores` valida el tamaño contra una lista blanca y levanta el
 * demonio sin devolver rutas absolutas.
 */

/**
 * Qué se le dice a la persona cuando el demonio está apagado: qué pierde, cómo
 * recuperarlo desde el OS y sin comandos. Puro y sin red, para poder probarlo.
 */
export function avisoDemonioApagado(): string {
    return (
        "El demonio está apagado y la voz baja a los niveles del navegador con el mismo " +
        "timbre. Para recuperar Estudio y Alta, abre la pestaña «Motores» y pulsa " +
        "«Cargar este modelo»: el OS levanta el demonio en esta neurona sin que escribas " +
        "ningún comando."
    );
}
