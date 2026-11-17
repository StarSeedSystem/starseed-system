// Lo copia native/src-tauri/build.rs en el proyecto Android que genera Tauri (no editar allí). ORD1114T.
// Contrato: architecture/control-remoto-entre-neuronas.md §1 caso H y §2.4; permisos: permisos-y-control-del-dispositivo.md §2.2.
package app.starseed.nativa

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.app.Application
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ComponentName
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.database.Cursor
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.FileObserver
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.lang.ref.WeakReference

/** Arranca la parte Android del control entre neuronas al crearse el proceso. No pide ni enseña nada. */
class ArranqueControlNeuronas : ContentProvider() {
    override fun onCreate(): Boolean {
        val app = context?.applicationContext ?: return true
        ControlNeuronasNativo.iniciar(app)
        ControlEntradaNativo.iniciar(app) // AND1115K
        return true
    }

    override fun query(uri: Uri, projection: Array<String>?, selection: String?, selectionArgs: Array<String>?, sortOrder: String?): Cursor? = null

    override fun getType(uri: Uri): String? = null

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<String>?): Int = 0

    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<String>?): Int = 0
}

/**
 * El borde Android del indicador de control. La sesión, la puerta de cada orden y el registro encadenado viven
 * en Rust (control_neuronas.rs); aquí solo lo que es de la plataforma:
 *   · el interruptor NATIVO «Dejar que tus otras neuronas controlen esta tableta» (diálogo de Android que la
 *     página no puede pulsar) y, con su «Sí», los permisos: notificaciones (diálogo del sistema, 13+) y
 *     «Mostrar sobre otras apps» (pantalla de Ajustes: Android no tiene diálogo para ese). Nunca antes;
 *   · la notificación en curso del servicio en primer plano con «Terminar» (y «Reanudar» en pausa), atendida
 *     aquí aunque la página esté colgada; descartarla (Android 14+ lo deja) TERMINA: sin indicador no hay control;
 *   · la superposición: borde rojo en toda la pantalla (no recibe toques) y una pastilla arriba con «Terminar».
 *     Un toque local fuera de la pastilla (ACTION_OUTSIDE) PAUSA el control al instante.
 * Se habla con Rust por archivos en filesDir/starseed/control-neuronas (peticion-<n>.json → estado.json).
 * La app nunca se concede nada a sí misma.
 */
object ControlNeuronasNativo : Application.ActivityLifecycleCallbacks {
    const val CARPETA = "control-neuronas"
    const val ESTADO = "estado.json"
    const val PREFIJO_PETICION = "peticion-"
    const val INTERRUPTOR = "interruptor.json"
    private const val PIDE_NOTIFICACIONES = 47150
    private const val PREGUNTA_CADA_MS = 10 * 60_000L
    private const val TRAS_UN_NO_MS = 24 * 60 * 60_000L
    const val GRACIA_MS = 1_500L

    private lateinit var app: Context
    private lateinit var dir: File
    private val principal = Handler(Looper.getMainLooper())
    private var actividad: WeakReference<Activity>? = null
    private var observador: FileObserver? = null
    private var iniciado = false

    // Estado que publica estado.json (solo en el hilo principal).
    @Volatile var mostrando = false
    @Volatile var sesion: String? = null
    @Volatile var nombre: String = ""
    @Volatile var pausada = false
    /** FSG1116 · M1: lo pone el servicio del indicador; lo llama la entrada cuando Android cancela un gesto por un toque. */
    @Volatile var pausarLocal: (() -> Unit)? = null
    @Volatile var desdeMs = 0L
    // CTL1117F: por qué se pausó y se reanudó, y cuántas veces (Rust lo anota en `control-pausa` aunque la pausa dure menos que su sondeo).
    @Volatile var motivoPausa = ""
    @Volatile var pausas = 0
    @Volatile var pausaMotivo = ""
    @Volatile var pausaDesdeGestoMs = -1L
    @Volatile var pausaInicioMs = 0L
    @Volatile var reanudaMotivo = ""
    @Volatile var pausaDurMs = 0L
    private var terminada: JSONObject? = null
    // IND1115F: en qué paso quedó el último intento de «mostrar» y por qué (Rust lo lee para decir QUÉ falló).
    @Volatile var intento: String = ""
    @Volatile var paso: String = ""
    @Volatile var error: String = ""
    @Volatile var hilo: String = ""
    private var ultimaPregunta = 0L
    private var pendienteSuperposicion = false

    fun iniciar(ctx: Context) {
        if (iniciado) return
        iniciado = true
        app = ctx.applicationContext
        dir = File(app.filesDir, "starseed/$CARPETA").apply { mkdirs() }
        (app as? Application)?.registerActivityLifecycleCallbacks(this)
        @Suppress("DEPRECATION")
        val o = object : FileObserver(dir.path, CLOSE_WRITE or MOVED_TO) {
            override fun onEvent(event: Int, path: String?) {
                if (path != null && path.startsWith(PREFIJO_PETICION)) principal.post { atender() }
            }
        }
        o.startWatching()
        observador = o
        principal.post { atender(); escribirEstado() }
    }

    private fun atender() {
        val peticiones = dir.listFiles { f -> f.name.startsWith(PREFIJO_PETICION) && f.name.endsWith(".json") }?.sortedBy { it.name } ?: return
        for (f in peticiones) {
            val p = try { JSONObject(f.readText()) } catch (_: Exception) { null }
            f.delete() // la petición la creó Rust para este lado y ya está atendida
            if (p == null) continue
            val ses = p.optString("sesion", "")
            when (p.optString("accion")) {
                "preparar" -> preparar()
                "mostrar" -> if (ses.length >= 16) {
                    // IND1115F: se apunta ANTES de arrancar nada, para que Rust vea que la petición llegó y en qué hilo.
                    intento = ses
                    paso = "peticion"
                    error = ""
                    hilo = if (Looper.myLooper() === Looper.getMainLooper()) "main" else Thread.currentThread().name
                    escribirEstado()
                    ServicioControlNeuronas.mostrar(app, ses, p.optString("nombre", "otra neurona").take(40))
                }
                // IND1115F: un botón del panel pide YA esa cosa (sin la pausa de 10 min del aviso automático).
                "pedir-interruptor" -> pedirInterruptorYa()
                "pedir-notificaciones" -> pedirNotificacionesYa()
                "pedir-superposicion" -> actividad?.get()?.let { abrirSuperposicionSiFalta(it) }
                "quitar" -> if (ses == sesion) ServicioControlNeuronas.quitar(app)
                // ORD1114V: la persona quitó el permiso en la página: se apaga al instante, sin diálogo (apagar
                // nunca pide nada; encender solo con el «Sí» del diálogo nativo de abajo).
                "apagar" -> {
                    escribirAtomico(File(dir, INTERRUPTOR), JSONObject().put("encendido", false).put("t_ms", System.currentTimeMillis()).toString())
                    if (mostrando) ServicioControlNeuronas.quitar(app)
                    ControlEntradaNativo.alApagar() // AND1115K
                    escribirEstado()
                }
            }
        }
    }

    // ─────────────────────────────── Interruptor y permisos ───────────────────────────────

    fun encendido(): Boolean = try {
        JSONObject(File(dir, INTERRUPTOR).readText()).optBoolean("encendido", false)
    } catch (_: Exception) { false }

    private fun respuestaNo(): Long = try {
        JSONObject(File(dir, INTERRUPTOR).readText()).optLong("no_ms", 0L)
    } catch (_: Exception) { 0L }

    private fun guardarInterruptor(si: Boolean) {
        val o = JSONObject().put("encendido", si).put("t_ms", System.currentTimeMillis())
        if (!si) o.put("no_ms", System.currentTimeMillis())
        if (!si) ControlEntradaNativo.alApagar() // AND1115K: apagar vacía la lista de controladores aceptados
        escribirAtomico(File(dir, INTERRUPTOR), o.toString())
    }

    fun notificacionesPermitidas(): Boolean {
        if (Build.VERSION.SDK_INT >= 33 && app.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false
        val nm = app.getSystemService(NotificationManager::class.java) ?: return false
        if (!nm.areNotificationsEnabled()) return false
        if (Build.VERSION.SDK_INT >= 26) {
            val c = nm.getNotificationChannel(ServicioControlNeuronas.CANAL)
            if (c != null && c.importance == NotificationManager.IMPORTANCE_NONE) return false
        }
        return true
    }

    fun superposicionPermitida(): Boolean = Build.VERSION.SDK_INT >= 26 && Settings.canDrawOverlays(app)

    private fun falta(): JSONArray {
        val a = JSONArray()
        if (Build.VERSION.SDK_INT < 26) a.put("android-anterior-a-8")
        if (!encendido()) a.put("interruptor")
        if (!notificacionesPermitidas()) a.put("notificaciones")
        if (!superposicionPermitida()) a.put("superposicion")
        return a
    }

    /** Lo pide Rust (la persona lo encendió en la página o llegó una petición de sesión). Solo PREGUNTA. */
    private fun preparar() {
        val ahora = System.currentTimeMillis()
        if (encendido()) {
            if (ahora - ultimaPregunta >= PREGUNTA_CADA_MS) { ultimaPregunta = ahora; pedirPermisosQueFaltan() }
            return
        }
        if (ahora - ultimaPregunta < PREGUNTA_CADA_MS || ahora - respuestaNo() < TRAS_UN_NO_MS) return
        val a = actividad?.get() ?: return
        ultimaPregunta = ahora
        dialogoInterruptor(a)
    }

    private fun dialogoInterruptor(a: Activity) {
        if (ControlEntradaNativo.congelado()) return // FSG1116 · B3: un consentimiento a la vez
        val g = ControlEntradaNativo.Guarda() // FSG1116 · C1
        val b = AlertDialog.Builder(a)
            .setTitle("¿Dejar que tus otras neuronas controlen esta tableta?")
            .setMessage(
                "Solo aparatos de tu cuenta que hayas aceptado. Mientras alguno la controle verás una notificación fija y un borde rojo, " +
                    "y podrás terminar con un toque. Tocar la pantalla lo pausa. Cada orden queda en el registro de este aparato.\n\n" +
                    "Para eso Android te pedirá permitir las notificaciones y «Mostrar sobre otras apps»."
            )
            .setPositiveButton("Sí, dejar") { _, _ ->
                if (!g.valida()) return@setPositiveButton // FSG1116 · C1: un «Sí» inyectado no enciende nada
                guardarInterruptor(true)
                pedirPermisosQueFaltan()
                escribirEstado()
            }
            .setNegativeButton("No") { _, _ ->
                guardarInterruptor(false)
                escribirEstado()
            }
            .setCancelable(true)
        ControlEntradaNativo.mostrarConsentimiento(b, g) // FSG1116 · C1: entrada remota congelada desde ya hasta que se cierre
    }

    /** IND1115F: el botón «Activar» del panel: si ya está encendido, pide lo que falte; si no, el diálogo nativo. */
    private fun pedirInterruptorYa() {
        val a = actividad?.get() ?: return
        if (encendido()) pedirPermisosQueFaltan() else dialogoInterruptor(a)
    }

    /**
     * IND1115F: el botón de notificaciones del panel. Primera vez: el diálogo del sistema (13+). Si ya se pidió (Android
     * no vuelve a enseñar el diálogo tras dos «No») o el permiso está dado pero el canal o la app están bloqueados:
     * la pantalla de Ajustes de notificaciones de la app.
     */
    private fun pedirNotificacionesYa() {
        val a = actividad?.get() ?: return
        val marca = File(dir, "notificaciones-pedidas")
        if (Build.VERSION.SDK_INT >= 33 && a.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED && !marca.exists()) {
            try { marca.writeText("1") } catch (_: Exception) {}
            a.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), PIDE_NOTIFICACIONES)
            return
        }
        if (Build.VERSION.SDK_INT < 26) return
        try {
            val i = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, a.packageName)
                .putExtra(Settings.EXTRA_CHANNEL_ID, ServicioControlNeuronas.CANAL)
            a.startActivity(i)
        } catch (_: Exception) { /* sin pantalla de Ajustes: queda en «falta» */ }
    }

    private fun pedirPermisosQueFaltan() {
        val a = actividad?.get() ?: return
        if (Build.VERSION.SDK_INT >= 33 && a.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            pendienteSuperposicion = true
            a.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), PIDE_NOTIFICACIONES)
            return
        }
        abrirSuperposicionSiFalta(a)
    }

    private fun abrirSuperposicionSiFalta(a: Activity) {
        pendienteSuperposicion = false
        if (Build.VERSION.SDK_INT >= 26 && !Settings.canDrawOverlays(a)) {
            try {
                a.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + a.packageName)))
            } catch (_: Exception) { /* sin pantalla de Ajustes: queda en «falta» */ }
        }
    }

    // ─────────────────────────────── Estado para Rust ───────────────────────────────

    fun terminar(motivo: String) {
        val s = sesion
        if (s != null) terminada = JSONObject().put("sesion", s).put("motivo", motivo).put("t_ms", System.currentTimeMillis())
        mostrando = false
        pausada = false
        sesion = null
        escribirEstado()
    }

    fun escribirEstado() {
        if (!iniciado) return
        val o = JSONObject()
            .put("v", 1)
            .put("t_ms", System.currentTimeMillis())
            .put("encendido", encendido())
            .put("notificaciones", notificacionesPermitidas())
            .put("superposicion", superposicionPermitida())
            .put("mostrando", mostrando)
            .put("en_fondo", ControlFondo.enFondo) // CTL1117C · FALLO 1: solo diagnóstico para la línea `control-fondo`
            .put("fondo", ControlFondo.medida)
            .put("reanudos", ControlFondo.reanudos)
            .put("sesion", sesion ?: JSONObject.NULL)
            .put("pausada", pausada)
            .put("pausas", pausas) // CTL1117F: diagnóstico de la pausa local (línea `control-pausa` y `control-fondo`)
            .put("pausa_motivo", pausaMotivo)
            .put("pausa_desde_gesto_ms", pausaDesdeGestoMs)
            .put("reanuda_motivo", reanudaMotivo)
            .put("pausa_ms", if (pausada && pausaInicioMs > 0) System.currentTimeMillis() - pausaInicioMs else pausaDurMs)
            .put("ignorados", ControlEntradaNativo.ignorados)
            .put("cuadro_ms", ControlEntradaNativo.cuadroHace())
            .put("terminada", terminada ?: JSONObject.NULL)
            .put("falta", falta())
            .put("intento", intento)
            .put("paso", paso)
            .put("error", error)
            .put("hilo", hilo)
        escribirAtomico(File(dir, ESTADO), o.toString())
    }

    private fun escribirAtomico(f: File, texto: String) {
        try {
            val tmp = File(f.parentFile, "." + f.name + ".tmp")
            tmp.writeText(texto)
            tmp.renameTo(f)
        } catch (_: Exception) { /* sin disco: Rust no ve latido y la sesión se cierra (lo seguro) */ }
    }

    // ─────────────────────────────── Ciclo de vida de la actividad ───────────────────────────────

    override fun onActivityResumed(a: Activity) {
        actividad = WeakReference(a)
        ControlFondo.cambio(a, false) // CTL1117C · FALLO 1
        if (pendienteSuperposicion) abrirSuperposicionSiFalta(a)
        escribirEstado()
    }

    override fun onActivityCreated(a: Activity, b: Bundle?) { actividad = WeakReference(a) }
    override fun onActivityStarted(a: Activity) {}
    // CTL1117C · FALLO 1: con sesión viva, la actividad detrás NO deja el WebView parado (ver `ControlFondo`).
    override fun onActivityPaused(a: Activity) { ControlFondo.cambio(a, true) }
    override fun onActivityStopped(a: Activity) { ControlFondo.cambio(a, true) }
    override fun onActivitySaveInstanceState(a: Activity, b: Bundle) {}
    override fun onActivityDestroyed(a: Activity) {
        if (actividad?.get() === a) actividad = null
    }

    /** CTL1117C: la actividad que hay ahora (la de la página), si la hay. */
    fun actividadActual(): Activity? = actividad?.get()
}

/**
 * CTL1117C · FALLO 1 · el control con StarSeed OS DETRÁS (la persona pulsó Inicio en la tableta).
 * `WryActivity.onPause()` llama a `mWebView.onPause()` y, con la actividad parada, el WebView oculta la página: sus temporizadores se
 * alinean y el renderizador baja de prioridad, y con ello la pantalla remota (bucle de cuadros, latido) y las órdenes iban a ratos.
 * SOLO mientras `ControlNeuronasNativo.mostrando` (hay sesión y su indicador a la vista) esto la mantiene viva: reanuda el WebView
 * (`onResume` + `resumeTimers`, lo mismo que ya hacen `PuertaSegundoPlano` y la llamada nativa) a los 300 ms de cada onPause/onStop y
 * en cada latido del indicador (2 s), y pide al renderizador prioridad IMPORTANTE aunque no se vea. Al cerrar la sesión lo deja como
 * estaba (prioridad de antes y, si la app sigue detrás, el WebView otra vez en pausa). Sin permisos nuevos; sin sesión no hace nada.
 * No tapa nada y no toca la regla G, la pausa local ni «Terminar».
 */
object ControlFondo {
    private val principal = Handler(Looper.getMainLooper())
    /** Kotlin cree que la actividad está detrás (onPause/onStop vistos y todavía sin onResume). */
    @Volatile var enFondo = false
    /** Qué medida aplicó la última vez (`ninguna`, `en-primer-plano`, `webview-activo`, `sin-webview`, `fallo`): va a estado.json y a la línea `control-fondo`. */
    @Volatile var medida = "ninguna"
    @Volatile var reanudos = 0
    private var aplicada = false
    private var prioridadAntes = 0
    private var esperaAntes = false

    private fun buscarWeb(v: View?): WebView? {
        if (v is WebView) return v
        if (v is ViewGroup) {
            for (k in 0 until v.childCount) {
                val w = buscarWeb(v.getChildAt(k))
                if (w != null) return w
            }
        }
        return null
    }

    /** onPause/onStop (`fondo` = true) u onResume (false) de la actividad. */
    fun cambio(a: Activity, fondo: Boolean) {
        enFondo = fondo
        if (ControlNeuronasNativo.mostrando) principal.postDelayed({ mantener(a) }, 300)
    }

    /** Una vuelta: la del latido del indicador (cada 2 s, solo con sesión) o la de 300 ms tras un cambio. Nunca lanza. */
    fun mantener(a: Activity?) {
        if (!ControlNeuronasNativo.mostrando) {
            soltar(a)
            return
        }
        if (a == null) return
        try {
            val w = buscarWeb(a.window?.decorView)
            if (w == null) {
                medida = "sin-webview"
                return
            }
            if (Build.VERSION.SDK_INT >= 26 && !aplicada) {
                prioridadAntes = w.getRendererRequestedPriority()
                esperaAntes = w.getRendererPriorityWaivedWhenNotVisible()
                w.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
                aplicada = true
            }
            if (enFondo) {
                w.onResume()
                w.resumeTimers()
                reanudos += 1
                medida = "webview-activo"
            } else {
                medida = "en-primer-plano"
            }
        } catch (_: Throwable) {
            medida = "fallo"
        }
    }

    /** La sesión acabó: todo como estaba (prioridad del renderizador y, si la app sigue detrás, el WebView en pausa como lo deja Wry). */
    fun soltar(a: Activity?) {
        val habiaHecho = aplicada || medida == "webview-activo"
        try {
            val w = if (a != null) buscarWeb(a.window?.decorView) else null
            if (w != null && habiaHecho) {
                if (Build.VERSION.SDK_INT >= 26 && aplicada) w.setRendererPriorityPolicy(prioridadAntes, esperaAntes)
                if (enFondo) w.onPause()
            }
        } catch (_: Throwable) {
            // nada que devolver
        }
        aplicada = false
        medida = "ninguna"
        reanudos = 0
    }
}

/** Servicio en primer plano con la notificación en curso y la superposición. Todo lo atiende Kotlin. */
class ServicioControlNeuronas : Service() {
    companion object {
        const val CANAL = "starseed-control-neuronas"
        const val ID = 47160
        const val MOSTRAR = "app.starseed.nativa.control.MOSTRAR"
        const val TERMINAR = "app.starseed.nativa.control.TERMINAR"
        const val REANUDAR = "app.starseed.nativa.control.REANUDAR"
        const val DESCARTADA = "app.starseed.nativa.control.DESCARTADA"
        const val QUITAR = "app.starseed.nativa.control.QUITAR"
        const val LATIDO_MS = 2_000L

        fun mostrar(ctx: Context, sesion: String, nombre: String) {
            val i = Intent(ctx, ServicioControlNeuronas::class.java).setAction(MOSTRAR).putExtra("sesion", sesion).putExtra("nombre", nombre)
            ControlNeuronasNativo.paso = "arranque-servicio"
            try {
                val c: ComponentName? = if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
                if (c == null) {
                    // Android no encontró el servicio: no está declarado en el manifiesto (el parche no lo añadió).
                    ControlNeuronasNativo.sesion = sesion
                    ControlNeuronasNativo.error = "arranque:servicio-no-declarado"
                    ControlNeuronasNativo.terminar("no-se-pudo-mostrar")
                }
            } catch (e: Exception) {
                // Android no deja arrancar el servicio (p. ej. en segundo plano sin «Mostrar sobre otras apps"):
                // sin indicador no hay control; Rust ve el error y niega la sesión.
                ControlNeuronasNativo.sesion = sesion
                ControlNeuronasNativo.error = "arranque:" + e.javaClass.simpleName
                ControlNeuronasNativo.terminar("no-se-pudo-mostrar")
            }
        }

        fun quitar(ctx: Context) {
            try { ctx.startService(Intent(ctx, ServicioControlNeuronas::class.java).setAction(QUITAR)) } catch (_: Exception) {}
        }
    }

    private val principal = Handler(Looper.getMainLooper())
    private var borde: View? = null
    private var pastilla: LinearLayout? = null
    private var textoPastilla: TextView? = null
    private var botonReanudar: TextView? = null
    private val latido = object : Runnable {
        override fun run() {
            if (!ControlNeuronasNativo.mostrando) return
            ControlFondo.mantener(ControlNeuronasNativo.actividadActual()) // CTL1117C · FALLO 1
            vigilarPausa() // CTL1117F: la pausa no puede quedarse pegada si el temporizador de 3 s se perdió
            ControlNeuronasNativo.escribirEstado()
            principal.postDelayed(this, LATIDO_MS)
        }
    }

    /** CTL1117A · S7: la pausa por un toque local se quita SOLA a los 3 s sin tocar (contrato §12.1); antes quedaba pegada. */
    private val reanudarSola = Runnable { reanudarPorSilencio() }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            MOSTRAR -> mostrar(intent.getStringExtra("sesion") ?: "", intent.getStringExtra("nombre") ?: "otra neurona")
            TERMINAR -> terminar("la-persona-desde-la-notificacion")
            DESCARTADA -> terminar("notificacion-descartada")
            REANUDAR -> reanudar()
            QUITAR -> cerrar()
            else -> if (!ControlNeuronasNativo.mostrando) cerrar()
        }
        return START_NOT_STICKY
    }

    private fun mostrar(sesion: String, nombre: String) {
        ControlNeuronasNativo.sesion = sesion
        ControlNeuronasNativo.nombre = nombre
        ControlNeuronasNativo.pausada = false
        ControlNeuronasNativo.paso = "servicio-recibido"
        var donde = "aviso"
        val ok = try {
            crearCanal()
            val aviso = aviso()
            donde = "primer-plano"
            if (Build.VERSION.SDK_INT >= 34) startForeground(ID, aviso, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE) else startForeground(ID, aviso)
            ControlNeuronasNativo.paso = "primer-plano"
            donde = "superposicion"
            ponerSuperposicion()
        } catch (e: Exception) {
            ControlNeuronasNativo.error = donde + ":" + e.javaClass.simpleName
            false
        }
        if (!ok) {
            if (ControlNeuronasNativo.error.isEmpty()) ControlNeuronasNativo.error = "superposicion:sin-vista"
            terminar("no-se-pudo-mostrar")
            return
        }
        ControlNeuronasNativo.paso = "mostrando"
        ControlNeuronasNativo.desdeMs = System.currentTimeMillis()
        ControlNeuronasNativo.pausarLocal = { principal.post { pausaLocal() } } // FSG1116 · M1
        ControlNeuronasNativo.mostrando = true
        principal.removeCallbacks(latido)
        principal.post(latido)
    }

    private fun crearCanal() {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = getSystemService(NotificationManager::class.java) ?: return
        if (nm.getNotificationChannel(CANAL) != null) return
        val c = NotificationChannel(CANAL, "Control entre mis neuronas", NotificationManager.IMPORTANCE_HIGH)
        c.description = "Aviso fijo mientras otra neurona de tu cuenta controla esta"
        c.setShowBadge(true)
        nm.createNotificationChannel(c)
    }

    private fun pi(accion: String, codigo: Int): PendingIntent {
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
        return PendingIntent.getService(this, codigo, Intent(this, ServicioControlNeuronas::class.java).setAction(accion), flags)
    }

    private fun aviso(): Notification {
        val n = ControlNeuronasNativo.nombre
        val pausada = ControlNeuronasNativo.pausada
        @Suppress("DEPRECATION")
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CANAL) else Notification.Builder(this)
        b.setSmallIcon(applicationInfo.icon)
            .setContentTitle(if (pausada) "Control en pausa" else "● Controlada por $n")
            .setContentText(if (pausada) "Tocaste la pantalla: $n no puede mandar nada hasta que reanudes." else "$n manda órdenes a esta tableta. Tocar la pantalla lo pausa.")
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setDeleteIntent(pi(DESCARTADA, 3)) // descartarla = indicador desaparecido = termina
            .addAction(Notification.Action.Builder(null, "Terminar", pi(TERMINAR, 1)).build())
        if (pausada) b.addAction(Notification.Action.Builder(null, "Reanudar", pi(REANUDAR, 2)).build())
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
        @Suppress("DEPRECATION")
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH)
        val a = b.build()
        a.flags = a.flags or Notification.FLAG_ONGOING_EVENT or Notification.FLAG_NO_CLEAR
        return a
    }

    private fun refrescarAviso() {
        try { getSystemService(NotificationManager::class.java)?.notify(ID, aviso()) } catch (_: Exception) {}
        textoPastilla?.text = if (ControlNeuronasNativo.pausada) "  ‖ En pausa  " else "  ● Controlada por ${ControlNeuronasNativo.nombre}  "
        botonReanudar?.visibility = if (ControlNeuronasNativo.pausada) View.VISIBLE else View.GONE
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    /** Borde a toda pantalla (no toca nada) + pastilla con «Terminar». false si Android no deja dibujar. */
    private fun ponerSuperposicion(): Boolean {
        if (Build.VERSION.SDK_INT < 26 || !Settings.canDrawOverlays(this)) {
            ControlNeuronasNativo.error = "superposicion:sin-permiso"
            return false
        }
        val wm = getSystemService(WindowManager::class.java)
        if (wm == null) {
            ControlNeuronasNativo.error = "superposicion:sin-wm"
            return false
        }
        quitarSuperposicion()
        val tipo = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        val marco = FrameLayout(this).apply {
            background = GradientDrawable().apply { setStroke(dp(6), Color.rgb(220, 20, 60)); setColor(Color.TRANSPARENT) }
        }
        val pBorde = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT, tipo,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        )
        // Android 12+: los toques solo atraviesan una superposición de otra app si su opacidad es ≤ 0,8.
        pBorde.alpha = 0.8f
        wm.addView(marco, pBorde)
        borde = marco

        val fila = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            background = GradientDrawable().apply { cornerRadius = dp(14).toFloat(); setColor(Color.rgb(220, 20, 60)) }
            setPadding(dp(8), dp(4), dp(8), dp(4))
        }
        val t = TextView(this).apply { setTextColor(Color.WHITE); textSize = 13f }
        val reanudarB = TextView(this).apply {
            text = "  Reanudar  "; setTextColor(Color.WHITE); textSize = 13f; visibility = View.GONE
            setOnClickListener { reanudar() }
        }
        val terminarB = TextView(this).apply {
            text = "  Terminar  "; setTextColor(Color.WHITE); textSize = 13f
            setOnClickListener { terminar("la-persona-desde-la-superposicion") }
        }
        fila.addView(t); fila.addView(reanudarB); fila.addView(terminarB)
        // Un toque en cualquier otro sitio de la pantalla llega aquí como ACTION_OUTSIDE: pausa al instante.
        fila.setOnTouchListener { _, ev ->
            // AND1115K: el toque de un gesto remoto nuestro no es «local»; uno de la persona sí (y marca los 3 s de pausa).
            if (ev.actionMasked == MotionEvent.ACTION_OUTSIDE) { if (!ControlEntradaNativo.esGestoPropio()) { ControlEntradaNativo.toqueLocal(); pausaLocal(); esperarSilencio() } else ControlEntradaNativo.ignorado(); true } else false
        }
        val pPastilla = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT, tipo,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.TRANSLUCENT
        )
        pPastilla.gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
        pPastilla.y = dp(8)
        wm.addView(fila, pPastilla)
        pastilla = fila
        textoPastilla = t
        botonReanudar = reanudarB
        refrescarAviso()
        // IND1115F: ANTES se devolvía `borde?.isAttachedToWindow != false`. Justo después de `addView` la vista aún no
        // está «unida a la ventana» (eso ocurre en el primer recorrido del ViewRootImpl, un fotograma después), así que
        // daba false SIEMPRE y la sesión se negaba aunque la superposición ya estuviera puesta. Si `addView` no lanzó,
        // está puesta (una excepción sube a `mostrar`, que la apunta en `error`).
        return borde != null && pastilla != null
    }

    private fun quitarSuperposicion() {
        val wm = getSystemService(WindowManager::class.java) ?: return
        borde?.let { try { wm.removeView(it) } catch (_: Exception) {} }
        pastilla?.let { try { wm.removeView(it) } catch (_: Exception) {} }
        borde = null; pastilla = null; textoPastilla = null; botonReanudar = null
    }

    private fun pausaLocal() {
        val motivo = ControlNeuronasNativo.motivoPausa.ifEmpty { "toque-fuera" }
        ControlNeuronasNativo.motivoPausa = ""
        if (!ControlNeuronasNativo.mostrando || ControlNeuronasNativo.pausada) return
        if (System.currentTimeMillis() - ControlNeuronasNativo.desdeMs < ControlNeuronasNativo.GRACIA_MS) return
        ControlNeuronasNativo.pausada = true
        ControlNeuronasNativo.pausas += 1 // CTL1117F
        ControlNeuronasNativo.pausaMotivo = motivo
        ControlNeuronasNativo.pausaDesdeGestoMs = ControlEntradaNativo.gestoHace()
        ControlNeuronasNativo.pausaInicioMs = System.currentTimeMillis()
        ServicioControlEntrada.instancia?.cortar() // FSG1116 · M1/M6: la pausa corta también el gesto en curso
        ControlEntradaNativo.borrarCuadro() // FSG1116 · M2: en pausa no queda ni sale ningún cuadro
        ControlNeuronasNativo.escribirEstado()
        refrescarAviso()
        if (ControlEntradaNativo.ultimoToqueLocal < ControlNeuronasNativo.desdeMs) ControlEntradaNativo.toqueLocal() // CTL1117A: los 3 s cuentan desde ahora
        esperarSilencio()
    }

    /** CTL1117A · S7: (re)arma el reloj de los 3 s sin tocar; cada toque local lo vuelve a armar. */
    private fun esperarSilencio() {
        if (!ControlNeuronasNativo.mostrando || !ControlNeuronasNativo.pausada) return
        principal.removeCallbacks(reanudarSola)
        principal.postDelayed(reanudarSola, ControlEntradaNativo.PAUSA_LOCAL_MS + 50)
    }

    /** CTL1117A · S7: pasaron 3 s sin tocar la pantalla: el control sigue solo (lo dice el contrato; «Terminar» sigue mandando). */
    private fun reanudarPorSilencio() {
        if (!ControlNeuronasNativo.mostrando || !ControlNeuronasNativo.pausada) return
        val desdeToque = System.currentTimeMillis() - ControlEntradaNativo.ultimoToqueLocal
        if (desdeToque < ControlEntradaNativo.PAUSA_LOCAL_MS) {
            principal.postDelayed(reanudarSola, ControlEntradaNativo.PAUSA_LOCAL_MS - desdeToque + 50)
            return
        }
        if (!reanudar("reanudada-sola")) esperarSilencio() // CTL1117F: antes, un gesto propio en el aire dejaba la pausa pegada para siempre
    }

    /** CTL1117F: red de seguridad en cada latido (2 s): con la pausa puesta y 3 s sin tocar, se reanuda aunque el temporizador se perdiera. */
    private fun vigilarPausa() {
        if (!ControlNeuronasNativo.mostrando || !ControlNeuronasNativo.pausada) return
        if (System.currentTimeMillis() - ControlEntradaNativo.ultimoToqueLocal < ControlEntradaNativo.PAUSA_LOCAL_MS) return
        reanudar("reanudada-vigia")
    }

    /** true si dejó de estar en pausa (o no lo estaba). */
    private fun reanudar(motivo: String = "reanudada-por-la-persona"): Boolean {
        if (!ControlNeuronasNativo.mostrando || !ControlNeuronasNativo.pausada) return true
        if (ControlEntradaNativo.esGestoPropio()) return false // AND1115K: un gesto remoto nunca reanuda el control
        ControlNeuronasNativo.pausada = false
        ControlNeuronasNativo.reanudaMotivo = motivo // CTL1117F
        ControlNeuronasNativo.pausaDurMs = System.currentTimeMillis() - ControlNeuronasNativo.pausaInicioMs
        ControlNeuronasNativo.pausaInicioMs = 0L
        ControlNeuronasNativo.desdeMs = System.currentTimeMillis() // el gesto de reanudar no vuelve a pausar
        ControlNeuronasNativo.escribirEstado()
        refrescarAviso()
        return true
    }

    /** La persona (o el sistema) termina: sin la página, sin Rust; Rust lo lee en estado.json. */
    private fun terminar(motivo: String) {
        ControlNeuronasNativo.terminar(motivo)
        cerrar()
    }

    /** Rust lo pidió (sesión cerrada allí): quita todo sin apuntar «terminada». */
    private fun cerrar() {
        principal.removeCallbacks(latido)
        ControlFondo.soltar(ControlNeuronasNativo.actividadActual())
        principal.removeCallbacks(reanudarSola) // CTL1117A
        ServicioControlEntrada.instancia?.parar() // AND1115K: sin indicador no hay dedos abajo ni captura
        if (ControlNeuronasNativo.mostrando) {
            ControlNeuronasNativo.mostrando = false
            ControlNeuronasNativo.sesion = null
            ControlNeuronasNativo.pausada = false
            ControlNeuronasNativo.escribirEstado()
        }
        quitarSuperposicion()
        try {
            if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
        } catch (_: Exception) {}
        stopSelf()
    }

    override fun onDestroy() {
        // Si Android mata el servicio con la sesión viva, el indicador ya no está: termina.
        if (ControlNeuronasNativo.mostrando) ControlNeuronasNativo.terminar("no-se-pudo-mostrar")
        ControlFondo.soltar(ControlNeuronasNativo.actividadActual()) // CTL1117C
        ControlNeuronasNativo.pausarLocal = null // UNI1116B: no retener el servicio que se va
        quitarSuperposicion()
        principal.removeCallbacks(latido)
        principal.removeCallbacks(reanudarSola) // CTL1117A
        super.onDestroy()
    }
}
