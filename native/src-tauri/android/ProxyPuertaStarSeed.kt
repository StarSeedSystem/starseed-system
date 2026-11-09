package app.starseed.nativa

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.FileObserver
import android.os.Handler
import android.os.Looper
import androidx.webkit.ProxyConfig
import androidx.webkit.ProxyController
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executor

/** Arranca la parte Android del proxy de la puerta al crearse el proceso, antes que la actividad. */
class ArranqueProxyPuerta : ContentProvider() {
    override fun onCreate(): Boolean {
        val app = context?.applicationContext ?: return true
        ProxyPuerta.iniciar(app)
        return true
    }

    override fun query(uri: Uri, projection: Array<String>?, selection: String?, selectionArgs: Array<String>?, sortOrder: String?): Cursor? = null

    override fun getType(uri: Uri): String? = null

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<String>?): Int = 0

    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<String>?): Int = 0
}

/**
 * Lleva TODOS los WebView de la app (también los <iframe> del navegador) por el proxy HTTP de 127.0.0.1 que abre
 * `puerta.cjs`, mientras la página lo tiene encendido (PTA1108B, contrato §5.3 c). Rust (puerta_proxy.rs) deja
 * `peticion-<n>.json` ({"n":…,"puerto":<número|null>}) en filesDir/starseed/proxy-puerta; aquí se atiende la última y se
 * contesta en `estado.json` ({"version":1,"n":…,"soportado":…,"aplicado":…,"error":…}).
 *
 * `ProxyController` es del proceso entero (no hace falta un WebView). Se exige `PROXY_OVERRIDE`; sin él no se toca
 * nada y se dice `soportado:false`. El bucle local (127.0.0.1, localhost, *.localhost) NUNCA pasa por el proxy.
 */
object ProxyPuerta {
    const val CARPETA = "proxy-puerta"
    const val PREFIJO_PETICION = "peticion-"
    const val ESTADO = "estado.json"
    private val DIRECTAS = listOf("127.0.0.1", "localhost", "*.localhost", "[::1]", "<local>")

    private var iniciado = false
    private var ctxApp: Context? = null
    private var observador: FileObserver? = null
    private val principal = Handler(Looper.getMainLooper())
    private var ultimoN = 0L
    private var aplicado = false

    fun dir(ctx: Context): File {
        val d = File(File(ctx.filesDir, "starseed"), CARPETA)
        if (!d.exists()) d.mkdirs()
        return d
    }

    @Synchronized
    fun iniciar(ctx: Context) {
        if (iniciado) return
        iniciado = true
        ctxApp = ctx
        // Una vida nueva del proceso: el proxy de la anterior ya no existe y sus peticiones tampoco valen.
        dir(ctx).listFiles()?.forEach { if (it.name.startsWith(PREFIJO_PETICION) || it.name == ESTADO) it.delete() }
        escribirEstado(null)
        @Suppress("DEPRECATION")
        val o = object : FileObserver(dir(ctx).absolutePath, FileObserver.CLOSE_WRITE or FileObserver.MOVED_TO) {
            override fun onEvent(event: Int, path: String?) {
                if (path != null && path.startsWith(PREFIJO_PETICION) && path.endsWith(".json")) principal.post { atenderCola() }
            }
        }
        o.startWatching()
        observador = o
        principal.post { atenderCola() }
    }

    private fun soportado(): Boolean =
        try {
            Build.VERSION.SDK_INT >= 21 && WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)
        } catch (e: Throwable) {
            false
        }

    private fun atenderCola() {
        val ctx = ctxApp ?: return
        val archivos = dir(ctx).listFiles { f -> f.name.startsWith(PREFIJO_PETICION) && f.name.endsWith(".json") }?.sortedBy { it.name } ?: return
        if (archivos.isEmpty()) return
        // Solo vale la última: cada petición sustituye a la anterior.
        var n = ultimoN
        var puerto: Int? = null
        var hay = false
        for (f in archivos) {
            try {
                val p = JSONObject(f.readText())
                n = maxOf(n, p.optLong("n", 0L))
                puerto = if (p.isNull("puerto")) null else p.optInt("puerto", 0).takeIf { it in 1024..65535 }
                hay = true
            } catch (e: Exception) {
                // petición ilegible: se descarta
            }
            f.delete()
        }
        if (!hay) return
        ultimoN = n
        aplicar(puerto)
    }

    private fun aplicar(puerto: Int?) {
        if (!soportado()) {
            aplicado = false
            escribirEstado("El WebView de este teléfono no admite PROXY_OVERRIDE.")
            return
        }
        val directo = Executor { it.run() }
        try {
            if (puerto == null) {
                ProxyController.getInstance().clearProxyOverride(directo, Runnable {
                    aplicado = false
                    escribirEstado(null)
                })
            } else {
                val b = ProxyConfig.Builder().addProxyRule("127.0.0.1:$puerto")
                for (r in DIRECTAS) b.addBypassRule(r)
                try {
                    // Si el proxy cae antes de que la página lo quite, se intenta directo en vez de dejar al navegador mudo.
                    b.addDirect()
                } catch (e: Throwable) {
                    // androidx.webkit antiguo: sin salida directa de respaldo
                }
                ProxyController.getInstance().setProxyOverride(b.build(), directo, Runnable {
                    aplicado = true
                    escribirEstado(null)
                })
            }
        } catch (e: Exception) {
            aplicado = false
            escribirEstado(e.message ?: e.javaClass.simpleName)
        }
    }

    private fun escribirEstado(error: String?) {
        val ctx = ctxApp ?: return
        try {
            val j = JSONObject()
                .put("version", 1)
                .put("n", ultimoN)
                .put("soportado", soportado())
                .put("aplicado", aplicado)
                .put("error", error ?: JSONObject.NULL)
            val d = dir(ctx)
            val tmp = File(d, ".$ESTADO.tmp")
            tmp.writeText(j.toString())
            tmp.renameTo(File(d, ESTADO))
        } catch (e: Exception) {
            // sin estado: Rust esperará y dirá que no contestó
        }
    }
}
