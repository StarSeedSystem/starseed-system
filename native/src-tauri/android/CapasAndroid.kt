// Lo copia native/servidor-local/preparar-android.mjs en el proyecto Android (no editar allí).
// Contrato: architecture/apps-autonomas-sin-internet.md §10 (capas) y AND1114L.
package app.starseed.nativa

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.FileObserver
import android.os.Process
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * AND1114L · el lado Android de las CAPAS del servidor local. Rust (capas_http_android.rs) no tiene cliente HTTPS en el móvil:
 * deja `pet-<id>.json` en `noBackupFilesDir/servidor-capas-puente/` y aquí se baja a donde diga (https; reanuda con Range) y se
 * contesta con `res-<id>.json`. Rust verifica TODO lo bajado (firma, SHA-256 del archivo y de cada archivo): aquí solo se trae.
 * `reiniciar.json` = relevo de capa: Node arranca una sola vez por proceso, así que la capa nueva se carga en un proceso nuevo
 * (se cierra este y se reabre la app; los datos de la app no se tocan).
 */
object CapasAndroid {
    private const val CARPETA = "servidor-capas-puente"
    private const val PET = "pet-"
    private const val RES = "res-"
    private const val REINICIAR = "reiniciar.json"
    private const val MAX_FALLOS_TAM = 64L * 1024 * 1024 * 1024

    private val trabajo = Executors.newSingleThreadExecutor { r -> Thread(r, "starseed-capas-http").apply { isDaemon = true } }
    @Volatile
    private var observador: FileObserver? = null

    @Synchronized
    fun iniciar(ctx: Context) {
        if (observador != null) return
        val dir = File(ctx.noBackupFilesDir, CARPETA)
        dir.mkdirs()
        val app = ctx.applicationContext
        val o = object : FileObserver(dir, FileObserver.CLOSE_WRITE or FileObserver.MOVED_TO) {
            override fun onEvent(event: Int, path: String?) {
                if (path == null) return
                if (path.startsWith(PET) && path.endsWith(".json")) trabajo.execute { atender(dir, File(dir, path)) }
                if (path == REINICIAR) trabajo.execute { reiniciar(app, dir) }
            }
        }
        o.startWatching()
        observador = o
        // Lo que ya estuviera escrito antes de mirar (un proceso anterior murió a medias).
        dir.listFiles()?.filter { it.name.startsWith(PET) && it.name.endsWith(".json") }?.forEach { f -> trabajo.execute { atender(dir, f) } }
    }

    private fun atender(dir: File, pet: File) {
        var id = ""
        try {
            val j = JSONObject(pet.readText())
            id = j.optString("id")
            pet.delete()
            if (!idSeguro(id)) return
            val url = j.getString("url")
            val destino = File(j.getString("destino"))
            val tope = j.optLong("tope", 0L)
            val reanudar = j.optBoolean("reanudar", false)
            val bytes = bajar(url, destino, tope, reanudar)
            responder(dir, id, true, bytes, "")
        } catch (t: Throwable) {
            if (idSeguro(id)) responder(dir, id, false, 0L, "${t.javaClass.simpleName}: ${t.message ?: ""}".take(280))
        }
    }

    internal fun idSeguro(id: String): Boolean = id.isNotEmpty() && id.length <= 64 && id.all { it.isLetterOrDigit() || it == '-' || it == '_' }

    /** Solo https (también tras redirecciones: HttpURLConnection no cruza de https a http) y, para pruebas, 127.0.0.1. */
    internal fun urlPermitida(url: String): Boolean {
        val u = try { URL(url) } catch (e: Exception) { return false }
        return u.protocol == "https" || (u.protocol == "http" && u.host == "127.0.0.1")
    }

    private fun bajar(url: String, destino: File, tope: Long, reanudar: Boolean): Long {
        if (!urlPermitida(url)) throw IllegalArgumentException("solo https")
        destino.parentFile?.mkdirs()
        var ya = if (reanudar && destino.isFile) destino.length() else 0L
        if (!reanudar) destino.delete()
        val con = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 20_000
            readTimeout = 60_000
            instanceFollowRedirects = true
            if (ya > 0) setRequestProperty("Range", "bytes=$ya-")
        }
        try {
            val codigo = con.responseCode
            val anexar = when {
                codigo == 206 -> true
                codigo == 200 -> { ya = 0L; false } // el servidor no reanuda: se empieza de cero
                codigo == 416 -> return destino.length() // ya estaba entero
                else -> throw java.io.IOException("HTTP $codigo")
            }
            val declarado = con.contentLengthLong
            if (tope > 0 && declarado > 0 && ya + declarado > tope) throw java.io.IOException("más grande que el tope")
            var total = ya
            FileOutputStream(destino, anexar).use { o ->
                con.inputStream.use { i ->
                    val buf = ByteArray(1 shl 16)
                    while (true) {
                        val n = i.read(buf)
                        if (n < 0) break
                        total += n
                        if (tope > 0 && total > tope) throw java.io.IOException("más grande que el tope")
                        o.write(buf, 0, n)
                    }
                }
            }
            return total
        } finally {
            con.disconnect()
        }
    }

    private fun responder(dir: File, id: String, ok: Boolean, bytes: Long, error: String) {
        val j = JSONObject().put("id", id).put("ok", ok).put("bytes", bytes).put("error", error)
        val tmp = File(dir, ".tmp-$RES$id.json")
        tmp.writeText(j.toString())
        tmp.renameTo(File(dir, "$RES$id.json"))
    }

    /** Cierra este proceso y reabre la app (Rust ya dejó la capa elegida en disco; la web ya comprobó que es buen momento). */
    private fun reiniciar(ctx: Context, dir: File) {
        File(dir, REINICIAR).delete()
        try {
            val abrir = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (abrir != null) {
                val pi = PendingIntent.getActivity(ctx, 114, abrir, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_CANCEL_CURRENT)
                (ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager).set(AlarmManager.RTC, System.currentTimeMillis() + 1500L, pi)
            }
        } catch (t: Throwable) {
            // Sin alarma, el sistema vuelve a abrir la última pantalla al morir el proceso; si no, se abre a mano y ya usa la capa.
        }
        Process.killProcess(Process.myPid())
    }
}
