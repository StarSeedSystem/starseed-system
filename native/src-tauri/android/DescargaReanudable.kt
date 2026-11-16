// Lo copia native/src-tauri/build.rs (android_actualizador.rs) en el proyecto Android (no editar allí).
// FAC1116 · descarga REANUDABLE del APK. Sin nada de Android (solo java.io / java.net): se prueba en cualquier JVM con
//   kotlinc native/src-tauri/android/DescargaReanudable.kt native/src-tauri/android/pruebas/DescargaReanudablePrueba.kt \
//     -include-runtime -d /tmp/dr.jar && java -jar /tmp/dr.jar
package app.starseed.nativa

import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.SocketTimeoutException

/**
 * La regla (decisión del 16-11, FAC1116): un APK de 100–200 MB por una línea lenta o con la pantalla apagada NO se
 * descarta cuando se corta; se sigue donde se quedó.
 *  · «Sin datos»: [SIN_DATOS_MS] sin recibir ni un byte (es el `readTimeout` de la conexión). Se cierra esa conexión y se
 *    abre otra con `Range: bytes=<lo ya guardado>-` por la URL ORIGINAL (la firmada de GitHub caduca: cada reanudación
 *    pide una nueva).
 *  · Una reanudación «sin avance» es la que acaba sin haber ganado [MIN_AVANCE] bytes más. Tras [MAX_SIN_AVANCE]
 *    seguidas se rinde (y quien llama prueba la otra ruta). Una que avanza reinicia la cuenta: una línea lenta pero
 *    viva nunca se rinde.
 *  · El archivo `.parcial` SE CONSERVA al rendirse y al morir el proceso: la siguiente búsqueda lo continúa.
 */
object DescargaReanudable {
    const val SIN_DATOS_MS = 30_000L
    const val MAX_SIN_AVANCE = 5
    const val MIN_AVANCE = 16L * 1024
    /** Pausa antes de reanudar: 2 s, 4 s, 8 s… hasta 20 s, según las reanudaciones sin avance seguidas. */
    fun pausaMs(sinAvance: Int): Long = minOf(20_000L, 2_000L shl (minOf(sinAvance, 4).coerceAtLeast(0)))

    /** Una respuesta HTTP ya abierta. `total` = tamaño del archivo entero (del Content-Range o del Content-Length); 0 si no se sabe. */
    class Respuesta(val codigo: Int, val flujo: InputStream, val total: Long, val cerrar: () -> Unit)

    /** Abre la URL pidiendo desde el byte `desde` (Range). Lanza IOException si la red falla. */
    fun interface Fuente {
        fun abrir(desde: Long): Respuesta
    }

    /** Lo que se cuenta a la persona y al registro. */
    class Progreso(val hecho: Long, val total: Long, val reanudaciones: Int, val sinDatosMs: Long, val aviso: String?)

    /** La descarga se rindió: dice cuánto había, cuántas veces se reanudó y por qué. */
    class Rendida(val hecho: Long, val total: Long, val reanudaciones: Int, val sinDatosMs: Long, causa: String) :
        IOException(textoRendida(hecho, total, reanudaciones, sinDatosMs, causa))

    fun porcentaje(hecho: Long, total: Long): Int = if (total <= 0) 0 else ((hecho * 100) / total).toInt().coerceIn(0, 100)

    fun mb(bytes: Long): Long = bytes / 1_048_576

    /** «36 % (72 de 200 MB), sin datos desde hace 31 s, 5 reanudaciones sin avance. <causa>». Pura. */
    fun textoRendida(hecho: Long, total: Long, reanudaciones: Int, sinDatosMs: Long, causa: String): String {
        val donde = if (total > 0) "${porcentaje(hecho, total)} % (${mb(hecho)} de ${mb(total)} MB)" else "${mb(hecho)} MB"
        return "La descarga no avanza: $donde, sin datos desde hace ${sinDatosMs / 1000} s, $reanudaciones reanudaciones. $causa".trim()
    }

    /**
     * Descarga a `parcial` (la continúa si ya existe). Devuelve los bytes que tiene al terminar; la verificación
     * (SHA-256, paquete, firma) la hace quien llama. `reloj` y `dormir` se inyectan para probarla sin esperar.
     */
    fun bajar(
        fuente: Fuente,
        parcial: File,
        totalEsperado: Long,
        maxBytes: Long,
        reloj: () -> Long,
        dormir: (Long) -> Unit,
        progreso: (Progreso) -> Unit,
    ): Long {
        var total = totalEsperado
        var reanudaciones = 0
        var sinAvance = 0
        var causa = ""
        var sinDatosMs = 0L
        while (true) {
            var desde = if (parcial.isFile) parcial.length() else 0L
            if (total > 0 && desde > total) {
                // Más bytes de los que mide el archivo: el parcial es de otra versión o está roto.
                parcial.delete()
                desde = 0L
            }
            if (total > 0 && desde == total) return desde
            val antes = desde
            var ultimoByte = reloj()
            try {
                val r = fuente.abrir(desde)
                try {
                    // 206: sigue donde estaba. 200 con `desde` > 0: el servidor ignoró el Range y manda todo desde cero.
                    val anexar = when {
                        r.codigo == 206 -> true
                        r.codigo == 200 -> false
                        // 416: el parcial ya cubre todo el archivo (o es más largo). Sin tamaño conocido decide el SHA-256 de quien llama.
                        r.codigo == 416 && desde > 0 && total <= 0 -> return desde
                        r.codigo == 416 -> throw IOException("El servidor no reconoce el trozo pedido (416).")
                        else -> throw IOException("HTTP ${r.codigo}")
                    }
                    if (r.total > 0) total = r.total
                    if (total > maxBytes) throw IllegalStateException("El APK es demasiado grande (${mb(total)} MB).")
                    var hecho = if (anexar) desde else 0L
                    FileOutputStream(parcial, anexar).use { sal ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            val n = r.flujo.read(buf)
                            if (n < 0) break
                            sal.write(buf, 0, n)
                            hecho += n
                            ultimoByte = reloj()
                            if (hecho > maxBytes) throw IllegalStateException("El APK es más grande de lo permitido.")
                            progreso(Progreso(hecho, total, reanudaciones, 0, null))
                        }
                    }
                    if (total > 0 && hecho < total) throw IOException("La conexión se cerró a los ${porcentaje(hecho, total)} %.")
                    return hecho
                } finally {
                    try {
                        r.cerrar()
                    } catch (e: Exception) {
                        // ya estaba cerrada
                    }
                }
            } catch (e: IllegalStateException) {
                throw e // demasiado grande: no se reintenta
            } catch (e: IOException) {
                if (e is Rendida || e is java.io.FileNotFoundException) throw e
                causa = if (e is SocketTimeoutException) "Sin datos de GitHub" else (e.message ?: e.javaClass.simpleName)
                sinDatosMs = if (e is SocketTimeoutException) maxOf(SIN_DATOS_MS, reloj() - ultimoByte) else reloj() - ultimoByte
                val ahora = if (parcial.isFile) parcial.length() else 0L
                if (ahora - antes >= MIN_AVANCE) sinAvance = 0 else sinAvance++
                reanudaciones++
                if (sinAvance >= MAX_SIN_AVANCE) throw Rendida(ahora, total, reanudaciones, sinDatosMs, causa)
                progreso(
                    Progreso(
                        ahora, total, reanudaciones, sinDatosMs,
                        "Sin datos desde hace ${sinDatosMs / 1000} s: sigo desde el ${porcentaje(ahora, total)} % (reanudación $reanudaciones).",
                    ),
                )
                dormir(pausaMs(sinAvance))
            }
        }
    }

    /** `bytes 100-199/500` → 500. 0 si no se entiende. Pura. */
    fun totalDeContentRange(cabecera: String?): Long {
        val resto = cabecera?.substringAfterLast('/')?.trim() ?: return 0L
        return resto.toLongOrNull()?.takeIf { it > 0 } ?: 0L
    }
}
