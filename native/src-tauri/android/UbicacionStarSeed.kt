// Lo copia native/src-tauri/build.rs en el proyecto Android que genera Tauri (no editar allí). UBI1114K.
// Contrato: architecture/ubicacion-nativa.md.
package app.starseed.nativa

import android.Manifest
import android.app.Activity
import android.app.Application
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.database.Cursor
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.FileObserver
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.io.File
import java.lang.ref.WeakReference
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/** Arranca la parte Android de la ubicación al crearse el proceso. No pide nada: solo queda a la escucha. */
class ArranqueUbicacion : ContentProvider() {
    override fun onCreate(): Boolean {
        val app = context?.applicationContext ?: return true
        UbicacionNativa.iniciar(app)
        return true
    }

    override fun query(uri: Uri, projection: Array<String>?, selection: String?, selectionArgs: Array<String>?, sortOrder: String?): Cursor? = null

    override fun getType(uri: Uri): String? = null

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<String>?): Int = 0

    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<String>?): Int = 0
}

/**
 * La posición del aparato para la web. Rust (ubicacion.rs) deja peticiones `peticion-<n>.json` en
 * filesDir/starseed/ubicacion y aquí se atienden en orden; la respuesta y lo último medido van en `estado.json`.
 *   · El permiso lo da la PERSONA en el aviso del propio Android, y solo cuando la petición trae `pedir: true`
 *     (ella acaba de pulsar el botón). Nada se pide solo ni en segundo plano; la app nunca se concede nada.
 *   · Fina o aproximada (Android 12+): con solo la aproximada se usa la red; se dice «aproximado».
 *   · Nada se redondea: precisión, altitud, rumbo, velocidad y la hora de la MEDIDA pasan tal cual.
 */
object UbicacionNativa : Application.ActivityLifecycleCallbacks {
    const val CARPETA = "ubicacion"
    const val PREFIJO_PETICION = "peticion-"
    const val ESTADO = "estado.json"
    private const val PREFS = "starseed-ubicacion"
    private const val CLAVE_PIDIO = "pidio-permiso"
    private const val MAX_EDAD_MS = 60_000L
    private const val ESPERA_MEDIDA_MS = 25_000L
    private const val ESPERA_MEJORA_MS = 6_000L
    private const val ESPERA_AVISO_MS = 120_000L

    private var ctx: Context? = null
    private var dir: File? = null
    private var observador: FileObserver? = null
    private var actual: WeakReference<Activity>? = null
    private val pausas = AtomicInteger(0)
    private val reanudadas = AtomicInteger(0)
    private val principal = Handler(Looper.getMainLooper())
    private val trabajo: ExecutorService = Executors.newCachedThreadPool()
    private val vigilando = AtomicBoolean(false)
    private val cerrojoAhora = Any()
    private val cerrojoEstado = Any()

    @Volatile private var ultimo: JSONObject? = null
    @Volatile private var respuestaA = 0L
    @Volatile private var errorCodigo: String? = null
    private var escuchaVigilancia: LocationListener? = null

    @Synchronized
    fun iniciar(app: Context) {
        if (ctx != null) return
        ctx = app
        val d = File(File(app.filesDir, "starseed"), CARPETA)
        d.mkdirs()
        dir = d
        (app as? Application)?.registerActivityLifecycleCallbacks(this)
        escribirEstado()
        @Suppress("DEPRECATION")
        val o = object : FileObserver(d.absolutePath, FileObserver.CLOSE_WRITE or FileObserver.MOVED_TO) {
            override fun onEvent(event: Int, path: String?) {
                if (path != null && path.startsWith(PREFIJO_PETICION) && path.endsWith(".json")) atenderPendientes()
            }
        }
        o.startWatching()
        observador = o
        atenderPendientes()
    }

    // ─────────────────────────────── Estado ───────────────────────────────

    private fun tiene(permiso: String): Boolean =
        try {
            ctx?.checkSelfPermission(permiso) == PackageManager.PERMISSION_GRANTED
        } catch (e: Exception) {
            false
        }

    private fun preguntado(): Boolean = ctx?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)?.getBoolean(CLAVE_PIDIO, false) ?: false

    private fun marcarPreguntado() {
        ctx?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)?.edit()?.putBoolean(CLAVE_PIDIO, true)?.apply()
    }

    /** concedido | aproximado | sin-preguntar | denegado */
    private fun permiso(): String =
        when {
            tiene(Manifest.permission.ACCESS_FINE_LOCATION) -> "concedido"
            tiene(Manifest.permission.ACCESS_COARSE_LOCATION) -> "aproximado"
            preguntado() -> "denegado"
            else -> "sin-preguntar"
        }

    private fun gestor(): LocationManager? = ctx?.getSystemService(Context.LOCATION_SERVICE) as? LocationManager

    private fun serviciosActivos(): Boolean? =
        try {
            val g = gestor() ?: return null
            if (Build.VERSION.SDK_INT >= 28) g.isLocationEnabled
            else g.isProviderEnabled(LocationManager.GPS_PROVIDER) || g.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
        } catch (e: Exception) {
            null
        }

    private fun aJson(l: Location): JSONObject {
        val j = JSONObject()
        j.put("lat", l.latitude)
        j.put("lon", l.longitude)
        if (l.hasAccuracy()) j.put("precision_m", l.accuracy.toDouble())
        if (l.hasAltitude()) j.put("altitud_m", l.altitude)
        if (Build.VERSION.SDK_INT >= 26 && l.hasVerticalAccuracy()) j.put("precision_altitud_m", l.verticalAccuracyMeters.toDouble())
        if (l.hasBearing()) j.put("rumbo", l.bearing.toDouble())
        if (l.hasSpeed()) j.put("velocidad_ms", l.speed.toDouble())
        j.put("t_ms", if (l.time > 0) l.time else System.currentTimeMillis())
        j.put("fuente", l.provider ?: "desconocida")
        return j
    }

    private fun escribirEstado() {
        val d = dir ?: return
        synchronized(cerrojoEstado) {
            try {
                val j = JSONObject()
                j.put("version", 1)
                j.put("respuesta_a", respuestaA)
                j.put("permiso", permiso())
                serviciosActivos()?.let { j.put("servicios", it) }
                j.put("vigilando", vigilando.get())
                ultimo?.let { j.put("fix", it) }
                errorCodigo?.let { j.put("error", JSONObject().put("codigo", it)) }
                j.put("t", System.currentTimeMillis())
                val tmp = File(d, ".$ESTADO.tmp")
                tmp.writeText(j.toString())
                tmp.renameTo(File(d, ESTADO))
            } catch (e: Exception) {
            }
        }
    }

    // ─────────────────────────────── Peticiones ───────────────────────────────

    @Synchronized
    private fun atenderPendientes() {
        val d = dir ?: return
        val archivos = d.listFiles { f -> f.name.startsWith(PREFIJO_PETICION) && f.name.endsWith(".json") }?.sortedBy { it.name } ?: return
        for (f in archivos) {
            val texto = try { f.readText() } catch (e: Exception) { continue }
            f.delete()
            val j = try { JSONObject(texto) } catch (e: Exception) { continue }
            val id = j.optLong("id", 0)
            val orden = j.optString("orden")
            val pedir = j.optBoolean("pedir", false)
            trabajo.execute {
                try {
                    when (orden) {
                        "ahora" -> ahora(id, pedir)
                        "vigilar" -> vigilar(id)
                        "parar" -> parar(id)
                        else -> responder(id)
                    }
                } catch (e: Exception) {
                    errorCodigo = "no-disponible"
                    responder(id)
                }
            }
        }
    }

    private fun responder(id: Long) {
        if (id > respuestaA) respuestaA = id
        escribirEstado()
    }

    // ─────────────────────────────── Permiso ───────────────────────────────

    /** Enseña el aviso de Android (solo con `pedir`). Devuelve el permiso que queda. */
    private fun pedirPermiso(): String {
        val a = actual?.get() ?: return permiso()
        val antes = pausas.get()
        marcarPreguntado()
        principal.post {
            try {
                if (Build.VERSION.SDK_INT >= 23) {
                    a.requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), 47140)
                }
            } catch (e: Exception) {
            }
        }
        // Si Android no enseña el aviso (negado para siempre), la actividad no se pausa: no hay nada que esperar.
        var t = 0L
        while (pausas.get() == antes && t < 1_500) { Thread.sleep(100); t += 100 }
        if (pausas.get() == antes) return permiso()
        // El aviso está en pantalla: se espera a que la persona conteste (la actividad vuelve).
        val vueltas = reanudadas.get()
        t = 0
        while (reanudadas.get() == vueltas && t < ESPERA_AVISO_MS) { Thread.sleep(200); t += 200 }
        Thread.sleep(300)
        return permiso()
    }

    // ─────────────────────────────── Medidas ───────────────────────────────

    private fun proveedores(g: LocationManager, p: String): List<String> {
        val l = ArrayList<String>()
        try {
            if (p == "concedido" && g.isProviderEnabled(LocationManager.GPS_PROVIDER)) l.add(LocationManager.GPS_PROVIDER)
            if (g.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) l.add(LocationManager.NETWORK_PROVIDER)
        } catch (e: SecurityException) {
        }
        return l
    }

    private fun ahora(id: Long, pedir: Boolean) {
        synchronized(cerrojoAhora) {
            var p = permiso()
            if (p == "sin-preguntar" && pedir) p = pedirPermiso()
            if (p == "denegado" && pedir && actual?.get() != null) p = pedirPermiso()
            if (p == "sin-preguntar" || p == "denegado") {
                errorCodigo = if (p == "denegado") "denegado" else "sin-preguntar"
                return responder(id)
            }
            val g = gestor()
            val activos = if (g != null) proveedores(g, p) else emptyList()
            if (g == null || serviciosActivos() == false || activos.isEmpty()) {
                errorCodigo = "servicios-apagados"
                return responder(id)
            }
            val mejor = medir(g, activos)
            if (mejor == null) {
                errorCodigo = "sin-fijar"
            } else {
                errorCodigo = null
                ultimo = aJson(mejor)
            }
            responder(id)
        }
    }

    /** Una medida reciente: la última conocida si es de hace menos de un minuto, o la primera que llegue. */
    @Suppress("MissingPermission")
    private fun medir(g: LocationManager, activos: List<String>): Location? {
        var mejor: Location? = null
        val ahora = System.currentTimeMillis()
        for (p in activos) {
            try {
                val l = g.getLastKnownLocation(p)
                if (l != null && ahora - l.time <= MAX_EDAD_MS && (mejor == null || l.accuracy < mejor.accuracy)) mejor = l
            } catch (e: Exception) {
            }
        }
        val recibida = Object()
        var nueva: Location? = null
        val escucha = object : LocationListener {
            override fun onLocationChanged(l: Location) {
                synchronized(recibida) {
                    val n = nueva
                    if (n == null || (l.hasAccuracy() && (!n.hasAccuracy() || l.accuracy < n.accuracy))) nueva = l
                    recibida.notifyAll()
                }
            }
            @Deprecated("Deprecated in Java")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {}
        }
        try {
            for (p in activos) principal.post { try { g.requestLocationUpdates(p, 0L, 0f, escucha, Looper.getMainLooper()) } catch (e: Exception) {} }
            val t0 = System.currentTimeMillis()
            var primera = 0L
            synchronized(recibida) {
                while (System.currentTimeMillis() - t0 < ESPERA_MEDIDA_MS) {
                    val n = nueva
                    if (n != null) {
                        if (primera == 0L) primera = System.currentTimeMillis()
                        // Una de GPS no se mejora; una de red se espera un poco por si llega la de GPS.
                        if (n.provider == LocationManager.GPS_PROVIDER || System.currentTimeMillis() - primera >= ESPERA_MEJORA_MS) break
                    }
                    recibida.wait(500)
                }
            }
        } catch (e: InterruptedException) {
        } finally {
            principal.post { try { g.removeUpdates(escucha) } catch (e: Exception) {} }
        }
        val n = nueva
        return if (n != null && (mejor == null || !n.hasAccuracy() || !mejor.hasAccuracy() || n.accuracy <= mejor.accuracy || n.time >= mejor.time)) n else mejor
    }

    @Suppress("MissingPermission")
    private fun vigilar(id: Long) {
        val p = permiso()
        val g = gestor()
        if (g == null || p == "sin-preguntar" || p == "denegado") {
            errorCodigo = if (p == "denegado") "denegado" else "sin-preguntar"
            return responder(id)
        }
        if (vigilando.compareAndSet(false, true)) {
            val escucha = object : LocationListener {
                override fun onLocationChanged(l: Location) {
                    errorCodigo = null
                    ultimo = aJson(l)
                    escribirEstado()
                }
                @Deprecated("Deprecated in Java")
                override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
                override fun onProviderEnabled(provider: String) {}
                override fun onProviderDisabled(provider: String) {}
            }
            escuchaVigilancia = escucha
            val activos = proveedores(g, p)
            principal.post { for (pv in activos) try { g.requestLocationUpdates(pv, 1000L, 0f, escucha, Looper.getMainLooper()) } catch (e: Exception) {} }
        }
        responder(id)
    }

    private fun parar(id: Long) {
        val g = gestor()
        val e = escuchaVigilancia
        if (vigilando.compareAndSet(true, false) && g != null && e != null) {
            principal.post { try { g.removeUpdates(e) } catch (x: Exception) {} }
        }
        escuchaVigilancia = null
        responder(id)
    }

    // ─────────────────────────────── Ciclo de vida de la actividad ───────────────────────────────

    override fun onActivityResumed(activity: Activity) {
        actual = WeakReference(activity)
        reanudadas.incrementAndGet()
        escribirEstado()
    }

    override fun onActivityPaused(activity: Activity) {
        pausas.incrementAndGet()
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}

    override fun onActivityStarted(activity: Activity) {}

    override fun onActivityStopped(activity: Activity) {}

    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}

    override fun onActivityDestroyed(activity: Activity) {}
}
