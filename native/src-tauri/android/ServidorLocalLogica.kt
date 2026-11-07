// Lo copia native/servidor-local/preparar-android.mjs en el proyecto Android (no editar allí).
// Contrato: architecture/apps-autonomas-sin-internet.md §9.1 (AND1107A).
package app.starseed.nativa

import java.io.File

/**
 * Lo PURO del servidor local de Android (sin nada de Android: solo java.io), para poder probarlo en
 * cualquier JVM: native/src-tauri/android/pruebas/ServidorLocalLogicaPrueba.kt.
 */
object ServidorLocalLogica {
    /** Marcador de una extracción COMPLETA (se escribe lo último; contiene el buildId). */
    const val MARCADOR = ".starseed-completo"
    const val SUFIJO_PARCIAL = ".parcial"
    const val REGISTRO = "servidor-local.log"

    /**
     * El estado que lee Rust (servidor_local_android_logica::leer_estado): líneas `clave=valor`. Los
     * valores no pueden llevar saltos de línea (se cambian por espacios); los nulos no se escriben.
     */
    fun lineas(campos: Map<String, Any?>): String {
        val sb = StringBuilder()
        for ((k, v) in campos) {
            if (v == null) continue
            if (k.isEmpty() || k.contains('=') || k.contains('\n') || k.contains('\r')) continue
            sb.append(k).append('=').append(v.toString().replace('\n', ' ').replace('\r', ' ')).append('\n')
        }
        return sb.toString()
    }

    /** El buildId de Next se usa como nombre de carpeta: solo [A-Za-z0-9._-], 1–64, sin «.»/«..». */
    fun idSeguro(s: String?): String? {
        val t = s?.trim() ?: return null
        if (t.isEmpty() || t.length > 64 || t == "." || t == "..") return null
        return if (t.all { it.isLetterOrDigit() && it.code < 128 || it == '.' || it == '_' || it == '-' }) t else null
    }

    /**
     * Dónde va una entrada del zip, o null si saldría de `base` (zip slip: «../», rutas absolutas,
     * «\\» de Windows). Nunca se escribe fuera de la carpeta de la versión.
     */
    fun destinoSeguro(base: File, nombre: String): File? {
        if (nombre.isEmpty() || nombre.startsWith("/") || nombre.contains('\\') || nombre.contains('\u0000')) return null
        val partes = nombre.split('/')
        if (partes.any { it == ".." }) return null
        val raiz = base.canonicalFile
        val f = File(raiz, nombre).canonicalFile
        return if (f.path == raiz.path || f.path.startsWith(raiz.path + File.separator)) f else null
    }

    /** ¿Está ya extraída ESTA versión? (marcador con su buildId + server.js). */
    fun completo(dir: File): Boolean {
        val m = File(dir, MARCADOR)
        return try {
            m.isFile && m.readText().trim() == dir.name && File(dir, "server.js").isFile
        } catch (e: Exception) {
            false
        }
    }

    /** Lo que sobra en `base`: versiones anteriores y extracciones a medias (nunca el registro). */
    fun sobrantes(base: File, actual: String): List<File> {
        val hijos = base.listFiles() ?: return emptyList()
        return hijos.filter { it.isDirectory && it.name != actual }.sortedBy { it.name }
    }

    fun porcentaje(hecho: Long, total: Long): Int {
        if (total <= 0) return 0
        return ((hecho.coerceIn(0, total) * 100) / total).toInt()
    }

    /** Avisar a Rust del progreso cada punto porcentual y como mucho cada 400 ms (o al acabar). */
    fun debeAvisar(ultimoPct: Int, pct: Int, ultimoMs: Long, ahoraMs: Long): Boolean =
        pct >= 100 || (pct != ultimoPct && ahoraMs - ultimoMs >= 400)

    /** Hace falta lo que ocupa descomprimido + un 10 % + 200 MB de margen para el resto del aparato. */
    fun espacioSuficiente(libre: Long, total: Long): Boolean = libre >= total + total / 10 + 200L * 1024 * 1024

    fun mb(b: Long): Long = b / (1024 * 1024)
}
