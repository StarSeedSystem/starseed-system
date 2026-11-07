// Lo copia native/servidor-local/preparar-android.mjs en el proyecto Android (no editar allí).
// Contrato: architecture/apps-autonomas-sin-internet.md §9.1 (AND1107A).
package app.starseed.nativa

import android.app.ActivityManager
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Build
import java.io.File
import java.io.IOException
import java.util.Properties
import java.util.zip.ZipInputStream

/**
 * Se crea al arrancar el proceso, antes que la actividad: prepara el servidor local en segundo plano
 * para que, cuando Rust (servidor_local_android.rs) lo pida, ya esté extraído y libnode cargada.
 */
class ArranqueServidorLocal : ContentProvider() {
    override fun onCreate(): Boolean {
        context?.applicationContext?.let { ServidorLocal.preparar(it) }
        return true
    }

    override fun query(uri: Uri, projection: Array<String>?, selection: String?, selectionArgs: Array<String>?, sortOrder: String?): Cursor? = null

    override fun getType(uri: Uri): String? = null

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<String>?): Int = 0

    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<String>?): Int = 0
}

/**
 * El lado Android del servidor local: extrae `assets/servidor-local/servidor.zip` (la primera vez de
 * cada versión) a `noBackupFilesDir/servidor-local/<buildId>` (fuera de la copia de seguridad: son
 * ≈ 400 MB que se regeneran solos), carga libnode.so (nodejs-mobile) y cuenta cómo va a Rust con
 * `nativoEstado` (líneas `clave=valor`). Rust arranca Node; aquí no se arranca nada.
 */
object ServidorLocal {
    private const val LIBRERIA = "{{LIB}}"
    private const val ASSET_PAQUETE = "servidor-local/paquete.properties"
    private const val ASSET_ZIP = "servidor-local/servidor.zip"

    /** Implementada en Rust (src/servidor_local_android.rs). */
    @JvmStatic
    external fun nativoEstado(estado: String)

    @Volatile
    private var empezado = false

    @Synchronized
    fun preparar(ctx: Context) {
        if (empezado) return
        empezado = true
        Thread(null, { trabajar(ctx) }, "starseed-servidor-local", 1L shl 20).start()
    }

    private fun contar(campos: Map<String, Any?>) {
        try {
            nativoEstado(ServidorLocalLogica.lineas(campos))
        } catch (t: Throwable) {
            // Sin la librería de Rust no hay a quién contárselo: la app abre la web publicada sola.
        }
    }

    private fun memoria(ctx: Context): Long = try {
        val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val mi = ActivityManager.MemoryInfo()
        am.getMemoryInfo(mi)
        mi.totalMem
    } catch (e: Exception) {
        0L
    }

    private fun trabajar(ctx: Context) {
        try {
            System.loadLibrary(LIBRERIA)
        } catch (t: Throwable) {
            return
        }
        val base = File(ctx.noBackupFilesDir, "servidor-local")
        base.mkdirs()
        val abi = Build.SUPPORTED_ABIS.firstOrNull() ?: "?"
        val comunes = linkedMapOf<String, Any?>(
            "cache" to ctx.cacheDir.absolutePath,
            "datos" to ctx.filesDir.absolutePath,
            "registro" to File(base, ServidorLocalLogica.REGISTRO).absolutePath,
            "memoria" to memoria(ctx),
            "abi" to abi,
        )
        val fallo = { fase: String, motivo: String -> contar(comunes + mapOf("fase" to fase, "motivo" to motivo)) }

        val paquete = try {
            ctx.assets.open(ASSET_PAQUETE).use { Properties().apply { load(it) } }
        } catch (e: Exception) {
            return fallo("sin-paquete", "Esta APK no trae el servidor local.")
        }
        val buildId = ServidorLocalLogica.idSeguro(paquete.getProperty("build_id"))
            ?: return fallo("error", "El paquete del servidor local no dice su versión (build_id).")
        val total = paquete.getProperty("bytes")?.toLongOrNull() ?: 0L

        // libnode.so (y su libc++_shared.so) para el procesador de este aparato.
        try {
            System.loadLibrary("node")
        } catch (t: Throwable) {
            return fallo("error", "Este aparato ($abi) no puede cargar el Node de la app: ${t.message ?: t.javaClass.simpleName}")
        }

        val destino = File(base, buildId)
        if (!ServidorLocalLogica.completo(destino)) {
            if (!ServidorLocalLogica.espacioSuficiente(base.usableSpace, total)) {
                return fallo(
                    "error",
                    "No hay espacio para el servidor local: hacen falta ${ServidorLocalLogica.mb(total + total / 10) + 200} MB y quedan ${ServidorLocalLogica.mb(base.usableSpace)} MB.",
                )
            }
            try {
                extraer(ctx, base, buildId, total, comunes)
            } catch (e: Throwable) {
                File(base, buildId + ServidorLocalLogica.SUFIJO_PARCIAL).deleteRecursively()
                return fallo("error", "No se pudo preparar el servidor local: ${e.message ?: e.javaClass.simpleName}")
            }
        }
        for (viejo in ServidorLocalLogica.sobrantes(base, buildId)) viejo.deleteRecursively()
        contar(comunes + mapOf("fase" to "listo", "dir" to destino.absolutePath, "build_id" to buildId, "hecho" to total, "total" to total))
    }

    /** Extrae a `<buildId>.parcial`, deja el marcador lo último y renombra: nunca queda una versión a medias. */
    private fun extraer(ctx: Context, base: File, buildId: String, total: Long, comunes: Map<String, Any?>) {
        val parcial = File(base, buildId + ServidorLocalLogica.SUFIJO_PARCIAL)
        parcial.deleteRecursively()
        if (!parcial.mkdirs()) throw IOException("no se pudo crear ${parcial.name}")
        var hecho = 0L
        var ultimoPct = -1
        var ultimoMs = 0L
        val avisar = {
            val pct = ServidorLocalLogica.porcentaje(hecho, total)
            val ahora = System.currentTimeMillis()
            if (ServidorLocalLogica.debeAvisar(ultimoPct, pct, ultimoMs, ahora)) {
                ultimoPct = pct
                ultimoMs = ahora
                contar(comunes + mapOf("fase" to "extrayendo", "hecho" to hecho, "total" to total, "build_id" to buildId))
            }
        }
        avisar()
        val buf = ByteArray(1 shl 16)
        ZipInputStream(ctx.assets.open(ASSET_ZIP).buffered(1 shl 16)).use { zip ->
            while (true) {
                val e = zip.nextEntry ?: break
                val f = ServidorLocalLogica.destinoSeguro(parcial, e.name)
                    ?: throw IOException("entrada fuera de la carpeta: ${e.name}")
                if (e.isDirectory) {
                    f.mkdirs()
                    continue
                }
                f.parentFile?.mkdirs()
                f.outputStream().buffered(1 shl 16).use { o ->
                    while (true) {
                        val n = zip.read(buf)
                        if (n < 0) break
                        o.write(buf, 0, n)
                        hecho += n
                        avisar()
                    }
                }
            }
        }
        if (!File(parcial, "server.js").isFile) throw IOException("el paquete no trae server.js")
        File(parcial, ServidorLocalLogica.MARCADOR).writeText(buildId)
        val destino = File(base, buildId)
        destino.deleteRecursively()
        if (!parcial.renameTo(destino)) throw IOException("no se pudo colocar la versión $buildId")
    }
}
