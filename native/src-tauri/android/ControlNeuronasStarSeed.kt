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
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.drawable.InsetDrawable
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
    // CTL1117G: cuántas veces el servicio repuso el aviso fijo (descartado o ausente) y por qué falló la última reposición (Rust anota `control-aviso`).
    @Volatile var avisos = 0
    @Volatile var avisoMotivo = ""
    @Volatile var avisoError = ""
    // CTL1117H: quién controla (color público, nivel, desde cuándo), y los ajustes LOCALES (`ajustes.json`, solo los pone la página de ESTE aparato).
    @Volatile var color = "#dd3c3c"
    @Volatile var nivel = "ver"
    @Volatile var lista: List<Controlador> = emptyList()
    @Volatile var indicador = "punto" // "punto" (el punto de la esquina) | "oculto" (solo el aviso fijo; la notificación SIEMPRE está)
    @Volatile var verToques = true // la onda del color del controlador en cada toque remoto
    /** CTL1117K · S2: hasta dónde llega el control en ESTE aparato: "total" (por defecto; un valor ausente o desconocido también) o "protegido" (la regla G de siempre). */
    @Volatile var alcance = "total"
    @Volatile var pausaManual = false // la pausa del botón «Pausar»: solo «Reanudar» la quita (la de un toque local se quita sola a los 3 s)
    private var terminada: JSONObject? = null
    // IND1115F: en qué paso quedó el último intento de «mostrar» y por qué (Rust lo lee para decir QUÉ falló).
    @Volatile var intento: String = ""
    @Volatile var paso: String = ""
    @Volatile var error: String = ""
    @Volatile var hilo: String = ""
    private var ultimaPregunta = 0L
    private var pendienteSuperposicion = false

    /** CTL1117H: lee los ajustes locales que escribió Rust. Sin archivo o con basura: los de fábrica (punto, toques sí). */
    fun leerAjustes() {
        var ind = "punto"
        var toques = true
        var alc = "total"
        try {
            val j = JSONObject(File(dir, "ajustes.json").readText())
            if (j.optString("indicador") == "oculto") ind = "oculto"
            toques = j.optBoolean("ver_toques", true)
            alc = ControlEntradaNativo.alcanceEfectivo(j.optString("alcance", ""))
        } catch (_: Exception) {}
        indicador = ind
        verToques = toques
        alcance = alc
    }

    /** `#rrggbb` válido o el rojo de siempre; nunca lanza. */
    fun colorInt(): Int = try { Color.parseColor(if (Regex("^#[0-9a-f]{6}$").matches(color)) color else "#dd3c3c") } catch (_: Exception) { Color.rgb(221, 60, 60) }

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
        leerAjustes() // CTL1117K: el alcance vigente desde el arranque (antes solo se leía al abrir sesión)
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
                    leerAjustes() // CTL1117H
                    ServicioControlNeuronas.mostrar(app, ses, p.optString("nombre", "otra neurona").take(41) /* CTL1118G: 40 letras y «…» (lo recorta Rust) */, p.optString("color", "#dd3c3c"), if (p.optString("nivel") == "controlar") "controlar" else "ver")
                }
                // CTL1117H: la página de este aparato cambió «indicador» o «ver_toques»: se vuelve a leer y se redibuja sin cortar la sesión.
                "ajustes" -> { leerAjustes(); if (mostrando) ServicioControlNeuronas.refrescarAjustes(app); escribirEstado() }
                // IND1115F: un botón del panel pide YA esa cosa (sin la pausa de 10 min del aviso automático).
                "pedir-interruptor" -> pedirInterruptorYa()
                "pedir-notificaciones" -> pedirNotificacionesYa()
                "pedir-superposicion" -> actividad?.get()?.let { abrirSuperposicionSiFalta(it) }
                "quitar" -> if (ses == sesion) ServicioControlNeuronas.quitar(app)
                // ORD1114V: la persona quitó el permiso en la página: se apaga al instante, sin diálogo (apagar
                // nunca pide nada; encender solo con el «Sí» del diálogo nativo de abajo).
                "apagar" -> {
                    apagarInterruptor()
                    if (mostrando) ServicioControlNeuronas.quitar(app)
                    escribirEstado()
                }
            }
        }
    }

    // ─────────────────────────────── Interruptor y permisos ───────────────────────────────

    /**
     * ORD1114V / CTL1117K: apagar el interruptor NATIVO (apagar nunca pide nada) y vaciar la lista de controladores. Lo usan la petición `apagar` de Rust
     * (la persona quitó el permiso en la página) y «Revocar» del panel del punto (la persona lo quita aquí); no toca la sesión.
     */
    fun apagarInterruptor() {
        escribirAtomico(File(dir, INTERRUPTOR), JSONObject().put("encendido", false).put("t_ms", System.currentTimeMillis()).toString())
        ControlEntradaNativo.alApagar() // AND1115K
    }

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
                "Solo aparatos de tu cuenta que hayas aceptado, uno a uno, con su código. " +
                    (if (alcance == "total") "Cada uno que aceptes podrá ver toda la pantalla y manejar toda esta tableta, cualquier app incluida. " else "Cada uno que aceptes podrá tocar y escribir en tus apps (no en Ajustes, tiendas ni contraseñas). ") +
                    "Mientras alguno la controle verás una notificación fija y un punto de color, y podrás terminar con un toque. Tocar la pantalla lo pausa. Cada orden queda en el registro de este aparato.\n\n" +
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
            .put("cancel_propias", ControlEntradaNativo.cancelPropias) // CTL1117K: cancelaciones de gestos que causó nuestro código, no un dedo
            .put("cancel_ultima", ControlEntradaNativo.cancelUltima)
            .put("cancel_ms", ControlEntradaNativo.cancelMs) // CTL1118F: ms y retraso del hilo principal de la última cancelación (la decisión de la pausa)
            .put("cancel_lag_ms", ControlEntradaNativo.cancelLagMs)
            .put("alcance", alcance)
            .put("avisos", avisos) // CTL1117G
            .put("aviso_motivo", avisoMotivo)
            .put("aviso_error", avisoError)
            .put("indicador", indicador) // CTL1117H
            .put("toques", verToques)
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
                if (!ControlEntradaNativo.congelado()) {
                    w.onResume()
                    w.resumeTimers()
                    reanudos += 1
                    medida = "webview-activo"
                } else {
                    medida = "dialogo-abierto"
                }
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

/** CTL1117H: quién controla esta neurona ahora (lo que enseña el aviso en lista y el panel del punto). */
data class Controlador(val nombre: String, val nivel: String, val color: String, val desdeMs: Long)

/** Servicio en primer plano con la notificación en curso y la superposición. Todo lo atiende Kotlin. */
class ServicioControlNeuronas : Service() {
    companion object {
        const val CANAL = "starseed-control-neuronas"
        const val ID = 47160
        const val MOSTRAR = "app.starseed.nativa.control.MOSTRAR"
        const val TERMINAR = "app.starseed.nativa.control.TERMINAR"
        const val QUITAR_PERMISO = "app.starseed.nativa.control.QUITAR_PERMISO" // CTL1118G
        const val REANUDAR = "app.starseed.nativa.control.REANUDAR"
        const val DESCARTADA = "app.starseed.nativa.control.DESCARTADA"
        const val QUITAR = "app.starseed.nativa.control.QUITAR"
        const val PAUSAR = "app.starseed.nativa.control.PAUSAR" // CTL1117H
        const val AJUSTES = "app.starseed.nativa.control.AJUSTES" // CTL1117H
        const val LATIDO_MS = 2_000L

        fun refrescarAjustes(ctx: Context) {
            try { ctx.startService(Intent(ctx, ServicioControlNeuronas::class.java).setAction(AJUSTES)) } catch (_: Exception) {}
        }

        fun mostrar(ctx: Context, sesion: String, nombre: String, color: String = "#dd3c3c", nivel: String = "ver") {
            val i = Intent(ctx, ServicioControlNeuronas::class.java).setAction(MOSTRAR).putExtra("sesion", sesion).putExtra("nombre", nombre).putExtra("color", color).putExtra("nivel", nivel)
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
    // CTL1117H: ya no hay borde rojo ni pastilla ancha. La ventana (`pastilla`) lleva el punto de 12 dp y, al tocarlo, un panel que se pliega a los 5 s.
    // Con `indicador=oculto` la ventana mide 1×1 px y no se ve, pero SIGUE ahí: es la que oye ACTION_OUTSIDE (el toque local que pausa).
    private var pastilla: LinearLayout? = null
    private var panel: LinearLayout? = null
    private var textoPanel: TextView? = null
    private var nombrePanel: TextView? = null // CTL1118G: el nombre entero, aparte de la línea de estado
    private var botonPausa: TextView? = null
    private var paramsPastilla: WindowManager.LayoutParams? = null // CTL1117K · S4: para volver a medir la ventana cuando el panel se abre o se pliega
    private var filaBotones: LinearLayout? = null
    private var filaConfirma: LinearLayout? = null
    private val plegarPanel = Runnable { cancelarRevocar(); panel?.visibility = View.GONE; reajustarVentana() }
    /** CTL1117K · S4 / CTL1118G: «Quitar permiso» pide confirmación 3 s («¿Quitar permiso? Sí · No»); pasados, o con «No», vuelve a «Revocar». */
    private val cancelarRevocarTras = Runnable { cancelarRevocar(); principal.removeCallbacks(plegarPanel); principal.postDelayed(plegarPanel, 5_000L) }
    private val latido = object : Runnable {
        override fun run() {
            if (!ControlNeuronasNativo.mostrando) return
            ControlFondo.mantener(ControlNeuronasNativo.actividadActual()) // CTL1117C · FALLO 1
            vigilarAviso() // CTL1117G: si el aviso fijo no está en la barra, se repone
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
            MOSTRAR -> mostrar(intent.getStringExtra("sesion") ?: "", intent.getStringExtra("nombre") ?: "otra neurona", intent.getStringExtra("color") ?: "#dd3c3c", intent.getStringExtra("nivel") ?: "ver")
            PAUSAR -> pausarPorBoton() // CTL1117H
            AJUSTES -> if (ControlNeuronasNativo.mostrando) { ponerSuperposicion(); refrescarAviso() } // CTL1117H
            TERMINAR -> terminar("la-persona-desde-la-notificacion") // CTL1118G: SOLO corta la sesión; el permiso sigue encendido
            QUITAR_PERMISO -> revocar() // CTL1118G: «Quitar permiso» desde la notificación: corta y apaga el permiso de ESTE aparato
            // CTL1117G (decisión del dueño): descartar el aviso fijo NO termina el control; se repone. Solo «Terminar» (o las paradas de siempre) lo cierran.
            DESCARTADA -> if (ControlNeuronasNativo.mostrando) reponerAviso("descartado") else cerrar()
            REANUDAR -> reanudar()
            QUITAR -> cerrar()
            else -> if (!ControlNeuronasNativo.mostrando) cerrar()
        }
        return START_NOT_STICKY
    }

    private fun mostrar(sesion: String, nombre: String, color: String, nivel: String) {
        ControlNeuronasNativo.sesion = sesion
        ControlNeuronasNativo.nombre = nombre
        ControlNeuronasNativo.color = color
        ControlNeuronasNativo.nivel = nivel
        ControlNeuronasNativo.lista = listOf(Controlador(nombre, nivel, color, System.currentTimeMillis()))
        ControlNeuronasNativo.pausada = false
        ControlNeuronasNativo.pausaManual = false
        ControlEntradaNativo.cancelPropias = 0 // CTL1117K: el contador es de esta sesión
        ControlEntradaNativo.cancelUltima = ""
        ControlNeuronasNativo.paso = "servicio-recibido"
        var donde = "aviso"
        val ok = try {
            crearCanal()
            val aviso = aviso()
            donde = "primer-plano"
            if (Build.VERSION.SDK_INT >= 34) startForeground(ID, aviso, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE) else startForeground(ID, aviso)
            ControlNeuronasNativo.paso = "primer-plano"
            avisoDesde = System.currentTimeMillis()
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

    private fun hora(ms: Long): String = java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(java.util.Date(ms))

    /**
     * CTL1117H: el aviso SIEMPRE está (con o sin punto) y es una LISTA: una línea por controlador (nombre, nivel, desde cuándo), en el color del
     * controlador, con «Terminar» y «Pausar»/«Reanudar». Se actualiza con `notify` del mismo id.
     */
    private fun aviso(): Notification {
        val n = ControlNeuronasNativo.nombre
        val pausada = ControlNeuronasNativo.pausada
        @Suppress("DEPRECATION")
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CANAL) else Notification.Builder(this)
        val estilo = Notification.InboxStyle().setBigContentTitle(if (pausada) "Control en pausa" else "Controlada por $n")
        for (c in ControlNeuronasNativo.lista) estilo.addLine("● ${c.nombre} · ${if (c.nivel == "controlar") "controla" else "ve"} · desde ${hora(c.desdeMs)}" + (if (ControlNeuronasNativo.alcance == "total") " · control total" else " · protegido"))
        if (pausada) estilo.addLine("En pausa: no puede mandar nada hasta que reanudes.")
        b.setSmallIcon(applicationInfo.icon)
            .setContentTitle(if (pausada) "Control en pausa" else "● Controlada por $n")
            .setContentText(if (pausada) "$n no puede mandar nada hasta que reanudes." else if (ControlNeuronasNativo.alcance == "total") "$n ve y maneja TODA esta tableta, cualquier app. Tocar la pantalla lo pausa." else "$n manda órdenes a esta tableta (no en Ajustes ni tiendas). Tocar la pantalla lo pausa.")
            .setStyle(estilo)
            .setColor(ControlNeuronasNativo.colorInt())
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setDeleteIntent(pi(DESCARTADA, 3)) // CTL1117G: descartarla repone el aviso (ya no termina)
            .addAction(Notification.Action.Builder(null, "Terminar", pi(TERMINAR, 1)).build())
            .addAction(Notification.Action.Builder(null, "Quitar permiso", pi(QUITAR_PERMISO, 5)).build()) // CTL1118G
        if (pausada) b.addAction(Notification.Action.Builder(null, "Reanudar", pi(REANUDAR, 2)).build())
        else b.addAction(Notification.Action.Builder(null, "Pausar", pi(PAUSAR, 4)).build())
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
        @Suppress("DEPRECATION")
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH)
        val a = b.build()
        a.flags = a.flags or Notification.FLAG_ONGOING_EVENT or Notification.FLAG_NO_CLEAR
        return a
    }

    private var avisoDesde = 0L

    /**
     * CTL1117G: vuelve a poner el aviso fijo (misma sesión; no toca token, pausa ni estado). `startForeground` repite el primer plano del servicio y,
     * si Android lo rechaza, `notify`. Un fallo se apunta en `aviso_error` y NO termina nada: la pastilla sigue siendo el indicador a la vista.
     */
    private fun reponerAviso(motivo: String) {
        ControlNeuronasNativo.avisos += 1
        ControlNeuronasNativo.avisoMotivo = motivo
        ControlNeuronasNativo.avisoError = ""
        avisoDesde = System.currentTimeMillis()
        try {
            val a = aviso()
            if (Build.VERSION.SDK_INT >= 34) startForeground(ID, a, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE) else startForeground(ID, a)
        } catch (e: Throwable) {
            ControlNeuronasNativo.avisoError = "primer-plano:" + e.javaClass.simpleName
            try { getSystemService(NotificationManager::class.java)?.notify(ID, aviso()) } catch (e2: Throwable) { ControlNeuronasNativo.avisoError += ",notify:" + e2.javaClass.simpleName }
        }
        ControlNeuronasNativo.escribirEstado()
    }

    /** CTL1117G: en cada latido, con sesión viva, ¿sigue el aviso en la barra? Si no (lo quitó algo sin pasar por el borrado), se repone. */
    private fun vigilarAviso() {
        if (!ControlNeuronasNativo.mostrando || Build.VERSION.SDK_INT < 23) return
        if (System.currentTimeMillis() - avisoDesde < 4_000L) return
        try {
            val nm = getSystemService(NotificationManager::class.java) ?: return
            if (nm.activeNotifications.none { it.id == ID }) reponerAviso("ausente")
        } catch (_: Throwable) { /* sin lista de avisos: no se puede saber, no se hace nada */ }
    }

    private fun refrescarAviso() {
        try { getSystemService(NotificationManager::class.java)?.notify(ID, aviso()) } catch (_: Exception) {}
        val c = ControlNeuronasNativo.lista.firstOrNull()
        val alc = if (ControlNeuronasNativo.alcance == "total") "control total" else "protegido"
        // CTL1118G: el nombre ENTERO en su propia vista (hasta dos líneas; «…» solo si pasa de 40 letras, lo corta Rust) y la línea de estado aparte.
        nombrePanel?.text = ControlNeuronasNativo.nombre
        textoPanel?.text = if (ControlNeuronasNativo.pausada) "En pausa · $alc" else "${if (c?.nivel == "controlar") "Controla" else "Ve"} · desde ${hora(c?.desdeMs ?: System.currentTimeMillis())} · $alc"
        botonPausa?.text = if (ControlNeuronasNativo.pausada) "  Reanudar  " else "  Pausar  "
    }

    /** CTL1117H: «Pausar» (del aviso o del panel). Solo «Reanudar» la quita: no se reanuda sola a los 3 s como la del toque local. */
    private fun pausarPorBoton() {
        if (!ControlNeuronasNativo.mostrando || ControlNeuronasNativo.pausada) return
        ControlNeuronasNativo.motivoPausa = "boton-pausa"
        pausaLocal()
        if (ControlNeuronasNativo.pausada) ControlNeuronasNativo.pausaManual = true
    }

    private fun alternarPanel() {
        val p = panel ?: return
        principal.removeCallbacks(plegarPanel)
        if (p.visibility == View.VISIBLE) { cancelarRevocar(); p.visibility = View.GONE; reajustarVentana(); return }
        refrescarAviso()
        p.visibility = View.VISIBLE
        reajustarVentana()
        principal.postDelayed(plegarPanel, 5_000L)
    }

    /**
     * CTL1117K · S4: la ventana del punto es WRAP_CONTENT y se creó con el panel en GONE (28 dp de ancho). Al abrir el panel, la ventana tiene que
     * volver a medirse: sin esto, en algunos Android (One UI) el nombre del controlador queda recortado por el tamaño viejo de la ventana.
     */
    private fun reajustarVentana() {
        val v = pastilla ?: return
        val lp = paramsPastilla ?: return
        try {
            // CTL1118G: sin ancho fijo que corte el nombre. Con el panel abierto la ventana mide lo que pide su contenido, hasta el ancho de la
            // pantalla menos márgenes (pegada arriba a la derecha: crece hacia la izquierda y no se sale); plegado, vuelve a su tamaño.
            if (ControlNeuronasNativo.indicador != "oculto") {
                if (panel?.visibility == View.VISIBLE) {
                    val tope = (resources.displayMetrics.widthPixels - dp(16)).coerceAtLeast(dp(120))
                    nombrePanel?.maxWidth = tope - dp(20)
                    textoPanel?.maxWidth = tope - dp(20)
                    v.measure(View.MeasureSpec.makeMeasureSpec(tope, View.MeasureSpec.AT_MOST), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED))
                    lp.width = minOf(v.measuredWidth, tope)
                } else {
                    lp.width = WindowManager.LayoutParams.WRAP_CONTENT
                }
            }
            v.requestLayout()
            getSystemService(WindowManager::class.java)?.updateViewLayout(v, lp)
        } catch (_: Throwable) { /* sin esto el panel puede verse recortado, pero nada se rompe */ }
    }

    /** CTL1117K · S4 / CTL1118G: primer toque de «Quitar permiso»: enseña «¿Quitar permiso? Sí · No» durante 3 s. Nada se quita todavía. */
    private fun pedirConfirmarRevocar() {
        val fb = filaBotones ?: return
        val fc = filaConfirma ?: return
        fb.visibility = View.GONE
        fc.visibility = View.VISIBLE
        principal.removeCallbacks(plegarPanel)
        principal.removeCallbacks(cancelarRevocarTras)
        principal.postDelayed(cancelarRevocarTras, 3_000L)
        reajustarVentana()
    }

    private fun cancelarRevocar() {
        principal.removeCallbacks(cancelarRevocarTras)
        filaConfirma?.visibility = View.GONE
        filaBotones?.visibility = View.VISIBLE
        reajustarVentana()
    }

    /**
     * CTL1117K · S4 / CTL1118G: «Sí» de «¿Quitar permiso?». Termina la sesión con el motivo `revocado` (el mismo que usa `control_neuronas_parar("revocado")` de Rust: la ventana de
     * quien manda dice «La persona quitó el permiso de control en el aparato») y apaga el interruptor nativo de ESTE aparato, vaciando la lista de aceptados.
     * Solo apaga: encender de nuevo exige otra vez el diálogo nativo con su «Sí». Rust lo ve por `terminada` y repite la parada y el apagado por su camino.
     */
    private fun revocar() {
        principal.removeCallbacks(cancelarRevocarTras)
        ControlNeuronasNativo.apagarInterruptor()
        terminar("revocado")
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    /**
     * CTL1117H: una ventana pequeña con el punto de 12 dp (si `indicador=punto`) y su panel; con `indicador=oculto`, la misma ventana de 1×1 px sin
     * nada dibujado. Es la que oye ACTION_OUTSIDE: un toque en cualquier otro sitio pausa al instante. false si Android no deja dibujar
     * (sin «Mostrar sobre otras apps» tampoco hay pausa por toque, así que no hay control).
     */
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
        val oculto = ControlNeuronasNativo.indicador == "oculto"
        val fila = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.END }
        // El punto se ve de 12 dp con un borde blanco; el área que se toca es de 28 dp.
        val punto = View(this).apply {
            val d = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(ControlNeuronasNativo.colorInt()); setStroke(dp(2), Color.WHITE) }
            background = InsetDrawable(d, dp(8))
            visibility = if (oculto) View.GONE else View.VISIBLE
            setOnClickListener { alternarPanel() }
        }
        fila.addView(punto, LinearLayout.LayoutParams(dp(28), dp(28)))
        val t = TextView(this).apply { setTextColor(Color.WHITE); textSize = 13f }
        val pausarB = TextView(this).apply {
            setTextColor(Color.WHITE); textSize = 13f
            setOnClickListener { if (ControlNeuronasNativo.pausada) reanudar() else pausarPorBoton(); alternarPanel() }
        }
        val terminarB = TextView(this).apply {
            text = "  Terminar  "; setTextColor(Color.WHITE); textSize = 13f
            setOnClickListener { terminar("la-persona-desde-la-superposicion") }
        }
        val revocarB = TextView(this).apply {
            text = "  Quitar permiso  "; setTextColor(Color.WHITE); textSize = 13f
            setOnClickListener { pedirConfirmarRevocar() } // CTL1117K · S4: primer paso; nada se quita hasta el «Sí»
        }
        val botones = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        botones.addView(pausarB); botones.addView(terminarB); botones.addView(revocarB)
        val confirma = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; visibility = View.GONE }
        confirma.addView(TextView(this).apply { text = "  ¿Quitar permiso?"; setTextColor(Color.WHITE); textSize = 13f })
        confirma.addView(TextView(this).apply { text = "  Sí  "; setTextColor(Color.WHITE); textSize = 13f; setTypeface(typeface, android.graphics.Typeface.BOLD); setOnClickListener { revocar() } })
        confirma.addView(TextView(this).apply { text = "  No  "; setTextColor(Color.WHITE); textSize = 13f; setOnClickListener { cancelarRevocar() } })
        val pan = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = GradientDrawable().apply { cornerRadius = dp(12).toFloat(); setColor(Color.argb(235, 24, 24, 32)); setStroke(dp(2), ControlNeuronasNativo.colorInt()) }
            setPadding(dp(10), dp(8), dp(10), dp(8))
            visibility = View.GONE
        }
        // CTL1118G: el nombre ENTERO en su propia vista, hasta dos líneas y sin ancho fijo (la ventana se mide al abrir: `reajustarVentana`); la línea de estado va debajo.
        val nombreV = TextView(this).apply {
            setTextColor(Color.WHITE); textSize = 14f; setTypeface(typeface, android.graphics.Typeface.BOLD)
            setSingleLine(false); maxLines = 2; ellipsize = android.text.TextUtils.TruncateAt.END
        }
        t.setSingleLine(false)
        t.maxLines = 2
        pan.minimumWidth = dp(200)
        pan.addView(nombreV)
        pan.addView(t); pan.addView(botones); pan.addView(confirma)
        fila.addView(pan)
        // Un toque en cualquier otro sitio de la pantalla llega aquí como ACTION_OUTSIDE: pausa al instante.
        fila.setOnTouchListener { _, ev ->
            // AND1115K: el toque de un gesto remoto nuestro no es «local»; uno de la persona sí (y marca los 3 s de pausa).
            if (ev.actionMasked == MotionEvent.ACTION_OUTSIDE) { if (!ControlEntradaNativo.esGestoPropio()) { ControlEntradaNativo.toqueLocal(); pausaLocal(); esperarSilencio() } else ControlEntradaNativo.ignorado(); true } else false
        }
        val pPastilla = WindowManager.LayoutParams(
            if (oculto) 1 else WindowManager.LayoutParams.WRAP_CONTENT, if (oculto) 1 else WindowManager.LayoutParams.WRAP_CONTENT, tipo,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.TRANSLUCENT
        )
        pPastilla.gravity = Gravity.TOP or Gravity.END
        pPastilla.x = dp(4)
        pPastilla.y = dp(8)
        wm.addView(fila, pPastilla)
        pastilla = fila
        paramsPastilla = pPastilla
        panel = pan
        textoPanel = t
        nombrePanel = nombreV
        botonPausa = pausarB
        filaBotones = botones
        filaConfirma = confirma
        refrescarAviso()
        // IND1115F: justo después de `addView` la vista aún no está «unida a la ventana»; si `addView` no lanzó, está puesta.
        return pastilla != null
    }

    private fun quitarSuperposicion() {
        val wm = getSystemService(WindowManager::class.java) ?: return
        principal.removeCallbacks(plegarPanel)
        pastilla?.let { try { wm.removeView(it) } catch (_: Exception) {} }
        pastilla = null; panel = null; textoPanel = null; nombrePanel = null; botonPausa = null
        paramsPastilla = null; filaBotones = null; filaConfirma = null // CTL1117K
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
        if (!ControlNeuronasNativo.mostrando || !ControlNeuronasNativo.pausada || ControlNeuronasNativo.pausaManual) return
        val desdeToque = System.currentTimeMillis() - ControlEntradaNativo.ultimoToqueLocal
        if (desdeToque < ControlEntradaNativo.PAUSA_LOCAL_MS) {
            principal.postDelayed(reanudarSola, ControlEntradaNativo.PAUSA_LOCAL_MS - desdeToque + 50)
            return
        }
        if (!reanudar("reanudada-sola")) esperarSilencio() // CTL1117F: antes, un gesto propio en el aire dejaba la pausa pegada para siempre
    }

    /** CTL1117F: red de seguridad en cada latido (2 s): con la pausa puesta y 3 s sin tocar, se reanuda aunque el temporizador se perdiera. */
    private fun vigilarPausa() {
        if (!ControlNeuronasNativo.mostrando || !ControlNeuronasNativo.pausada || ControlNeuronasNativo.pausaManual) return
        if (System.currentTimeMillis() - ControlEntradaNativo.ultimoToqueLocal < ControlEntradaNativo.PAUSA_LOCAL_MS) return
        reanudar("reanudada-vigia")
    }

    /** true si dejó de estar en pausa (o no lo estaba). */
    private fun reanudar(motivo: String = "reanudada-por-la-persona"): Boolean {
        if (!ControlNeuronasNativo.mostrando || !ControlNeuronasNativo.pausada) return true
        if (ControlEntradaNativo.esGestoPropio()) return false // AND1115K: un gesto remoto nunca reanuda el control
        ControlNeuronasNativo.pausada = false
        ControlNeuronasNativo.pausaManual = false
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
        principal.removeCallbacks(cancelarRevocarTras) // CTL1117K
        ServicioControlEntrada.instancia?.parar() // AND1115K: sin indicador no hay dedos abajo ni captura
        if (ControlNeuronasNativo.mostrando) {
            ControlNeuronasNativo.mostrando = false
            ControlNeuronasNativo.sesion = null
            ControlNeuronasNativo.pausada = false
            ControlNeuronasNativo.escribirEstado()
        }
        quitarSuperposicion()
        ControlToques.quitar() // CTL1117H
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
        ControlToques.quitar() // CTL1117H
        quitarSuperposicion()
        principal.removeCallbacks(latido)
        principal.removeCallbacks(reanudarSola) // CTL1117A
        super.onDestroy()
    }
}

/**
 * CTL1117H · los toques remotos se ven: una onda del color del controlador (anillo que crece ~450 ms y un punto central) donde toca cada dedo, una estela
 * corta si arrastra, y una marca de texto (~1,5 s) cuando escribe. Es una ventana `TYPE_ACCESSIBILITY_OVERLAY` a toda pantalla, que NO se toca ni toma el foco
 * (los toques la atraviesan y la regla G la salta como a todo «overlay» de accesibilidad). Se crea con el primer efecto y se quita al acabar el último.
 * Solo si `ver_toques`, hay sesión, no está en pausa y la ventana de debajo no es protegida (eso último ya lo decide quien llama: la orden no se despacha).
 * Se anima con el reloj del dibujo (`postInvalidateOnAnimation`), sin hilos propios.
 */
object ControlToques {
    private const val ONDA_MS = 450L
    private const val ESTELA_MS = 350L
    private const val MARCA_MS = 1_500L
    private class Efecto(val x: Float, val y: Float, val x2: Float, val y2: Float, val ini: Long, val dur: Long, val texto: String?, val color: Int)
    private val principal = Handler(Looper.getMainLooper())
    private val efectos = ArrayList<Efecto>()
    private var vista: Capa? = null
    private var wm: WindowManager? = null

    private class Capa(ctx: Context) : View(ctx) {
        private val pl = Paint(Paint.ANTI_ALIAS_FLAG)
        private val dpx = ctx.resources.displayMetrics.density
        override fun onDraw(c: Canvas) {
            val ahora = System.currentTimeMillis()
            var vivos = false
            for (e in efectos.toList()) {
                val t = (ahora - e.ini).toFloat() / e.dur
                if (t >= 1f) continue
                vivos = true
                val a = ((1f - t) * 255).toInt().coerceIn(0, 255)
                if (e.texto != null) {
                    pl.style = Paint.Style.FILL; pl.textSize = 14f * dpx
                    val w = pl.measureText(e.texto) + 24f * dpx
                    val x = (width / 2f).coerceAtLeast(w / 2f)
                    val y = if (e.y > 0f) (e.y - 40f * dpx).coerceAtLeast(64f * dpx) else 72f * dpx
                    pl.color = Color.argb(a, Color.red(e.color), Color.green(e.color), Color.blue(e.color))
                    c.drawRoundRect(RectF(x - w / 2f, y - 18f * dpx, x + w / 2f, y + 12f * dpx), 14f * dpx, 14f * dpx, pl)
                    pl.color = Color.argb(a, 255, 255, 255)
                    c.drawText(e.texto, x - w / 2f + 12f * dpx, y + 3f * dpx, pl)
                    continue
                }
                pl.color = Color.argb(a, Color.red(e.color), Color.green(e.color), Color.blue(e.color))
                pl.style = Paint.Style.STROKE; pl.strokeWidth = 3f * dpx
                c.drawCircle(e.x, e.y, (10f + 34f * t) * dpx, pl)
                pl.style = Paint.Style.FILL
                c.drawCircle(e.x, e.y, 5f * dpx, pl)
                if (Math.abs(e.x2 - e.x) + Math.abs(e.y2 - e.y) > 24f * dpx) {
                    pl.style = Paint.Style.STROKE; pl.strokeWidth = 4f * dpx; pl.strokeCap = Paint.Cap.ROUND
                    c.drawLine(e.x, e.y, e.x + (e.x2 - e.x) * minOf(1f, t * 2f), e.y + (e.y2 - e.y) * minOf(1f, t * 2f), pl)
                }
            }
            if (vivos) postInvalidateOnAnimation() else principal.post { quitar() }
        }
    }

    private fun puede(): Boolean = ControlNeuronasNativo.verToques && ControlNeuronasNativo.mostrando && !ControlNeuronasNativo.pausada

    fun toque(ctx: Context, x: Float, y: Float, x2: Float, y2: Float) {
        if (!puede()) return
        val col = ControlNeuronasNativo.colorInt()
        principal.post { poner(ctx, Efecto(x, y, x2, y2, System.currentTimeMillis(), if (Math.abs(x2 - x) + Math.abs(y2 - y) > 24f) ONDA_MS + ESTELA_MS else ONDA_MS, null, col)) }
    }

    fun marca(ctx: Context, texto: String, x: Float, y: Float) {
        if (!puede()) return
        val col = ControlNeuronasNativo.colorInt()
        principal.post { poner(ctx, Efecto(x, y, x, y, System.currentTimeMillis(), MARCA_MS, texto, col)) }
    }

    private fun poner(ctx: Context, e: Efecto) {
        try {
            if (efectos.size >= 12) efectos.removeAt(0)
            efectos.add(e)
            if (vista == null) {
                val m = ctx.getSystemService(WindowManager::class.java) ?: return
                val v = Capa(ctx)
                val lp = WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                    PixelFormat.TRANSLUCENT
                )
                m.addView(v, lp)
                wm = m
                vista = v
            }
            vista?.postInvalidateOnAnimation()
        } catch (_: Throwable) { /* sin onda no se rompe nada: el control sigue igual */ }
    }

    fun quitar() {
        efectos.clear()
        val v = vista ?: return
        vista = null
        try { wm?.removeView(v) } catch (_: Throwable) {}
        wm = null
    }
}
