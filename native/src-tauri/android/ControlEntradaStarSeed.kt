package app.starseed.nativa

// (AND1115K) Control entre mis neuronas, fases 2-3 · la ENTRADA y la PANTALLA de la tableta.
// Solo se declara aquí lo que declara el parche del manifiesto (`control_entrada_parche.rs`). Contrato: seams 1 y 2 de
// `control-fase23-costuras.md`. Rust (control_entrada.rs / control_pantalla.rs) YA comprobó la firma del controlador,
// la sesión y el límite de 60/s antes de pasar nada a este archivo; aquí se aplican la regla G, la pausa por un toque
// local y la ejecución.
//
//   · Nada se enciende solo: el servicio de accesibilidad lo activa la persona en Ajustes de Android; los controladores
//     los acepta la persona en un diálogo con su código; «Ver la pantalla sin preguntar en cada sesión» lo enciende la
//     persona en otro diálogo. Este archivo no concede ningún permiso ni contesta ningún diálogo del sistema.
//   · El servicio no hace nada y no guarda nada si no hay una sesión de control abierta con el indicador a la vista.
//   · Rust <-> Kotlin por archivos JSON en `filesDir/starseed/control-entrada`: `peticion-<id>.json` -> `resultado-<id>.json`.

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.app.Activity
import android.app.AlertDialog
import android.app.AppOpsManager
import android.app.Application
import android.app.KeyguardManager
import android.bluetooth.BluetoothAdapter
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.Path
import android.hardware.display.DisplayManager
import android.media.AudioManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.FileObserver
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.PowerManager
import android.os.Process
import android.provider.Settings
import android.util.DisplayMetrics
import android.view.Display
import android.view.Surface
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.lang.ref.WeakReference
import java.util.ArrayDeque
import java.util.concurrent.Executor

/** Todo lo que no es el servicio: archivos, diálogos, estado del aparato y las listas de la regla G. */
object ControlEntradaNativo {
    const val CARPETA = "control-entrada"
    const val PREFIJO_PETICION = "peticion-"
    const val PREFIJO_RESULTADO = "resultado-"
    const val ACEPTADOS = "aceptados.json"
    const val INTERRUPTOR_PANTALLA = "pantalla-interruptor.json"
    const val CUADRO = "cuadro.bin"
    /** Un toque local mantiene el control en pausa hasta que pasan 3 s sin otro. */
    const val PAUSA_LOCAL_MS = 3_000L

    // Regla G: las MISMAS listas que control_entrada_logica.rs (una prueba de Rust lo comprueba).
    val PAQUETES_G = listOf(
        "com.google.android.permissioncontroller", "com.android.permissioncontroller", "com.samsung.android.permissioncontroller",
        "com.google.android.packageinstaller", "com.android.packageinstaller", "com.samsung.android.packageinstaller",
        "com.samsung.android.app.permission",
    )
    val PAQUETES_AJUSTES = listOf("com.android.settings", "com.samsung.android.settings")
    val CLASES_AJUSTES_G = listOf(
        "accessibility", "deviceadmin", "specialaccess", "drawoverlay", "overlaysettings", "writesettings", "usageaccess",
        "notificationaccess", "managedeviceadmins", "installedappdetails", "appinfodashboard", "manageappexternalsources",
        "restrictedsettings", "alldevicesadmin",
    )
    val CLASES_SISTEMA_G = listOf("mediaprojectionpermission", "screencapturepermission", "mediaprojectionappselector")

    fun reglaG(paquete: String?, clase: String?): Boolean {
        val p = (paquete ?: "").lowercase()
        val c = (clase ?: "").lowercase()
        return PAQUETES_G.any { p == it } ||
            (PAQUETES_AJUSTES.any { p == it } && CLASES_AJUSTES_G.any { c.contains(it) }) ||
            (p == "com.android.systemui" && CLASES_SISTEMA_G.any { c.contains(it) })
    }

    private lateinit var app: Context
    private lateinit var dir: File
    private val principal = Handler(Looper.getMainLooper())
    private var actividad: WeakReference<Activity>? = null
    private var observador: FileObserver? = null
    private var iniciado = false

    /** Diálogos NATIVOS de esta app abiertos ahora: mientras haya uno, la regla G protege la ventana propia. */
    @Volatile var dialogosPropios = 0
    /** Hasta cuándo (ms de reloj) el toque que llega es de un gesto NUESTRO y no de la persona. */
    @Volatile var gestoPropioHasta = 0L
    @Volatile var ultimoToqueLocal = 0L

    fun esGestoPropio(): Boolean = System.currentTimeMillis() < gestoPropioHasta
    fun toqueLocal() { ultimoToqueLocal = System.currentTimeMillis() }

    fun iniciar(ctx: Context) {
        if (iniciado) return
        iniciado = true
        app = ctx.applicationContext
        dir = File(app.filesDir, "starseed/$CARPETA").apply { mkdirs() }
        // Peticiones y resultados de antes de este arranque ya no valen.
        dir.listFiles { f -> f.name.startsWith(PREFIJO_PETICION) || f.name.startsWith(PREFIJO_RESULTADO) || f.name == CUADRO }?.forEach { it.delete() }
        (app as? Application)?.registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
            override fun onActivityResumed(a: Activity) { actividad = WeakReference(a) }
            override fun onActivityCreated(a: Activity, b: Bundle?) { actividad = WeakReference(a) }
            override fun onActivityStarted(a: Activity) {}
            override fun onActivityPaused(a: Activity) {}
            override fun onActivityStopped(a: Activity) {}
            override fun onActivitySaveInstanceState(a: Activity, b: Bundle) {}
            override fun onActivityDestroyed(a: Activity) { if (actividad?.get() === a) actividad = null }
        })
        @Suppress("DEPRECATION")
        val o = object : FileObserver(dir.path, CLOSE_WRITE or MOVED_TO) {
            override fun onEvent(event: Int, path: String?) {
                if (path != null && path.startsWith(PREFIJO_PETICION) && path.endsWith(".json")) principal.post { atender() }
            }
        }
        o.startWatching()
        observador = o
        principal.post { atender(); comprobarInterruptor() }
    }

    // ───────────── interruptores y lista de controladores ─────────────

    private fun escribirAtomico(f: File, texto: String) {
        try {
            val tmp = File(f.parentFile, "." + f.name + ".tmp")
            tmp.writeText(texto)
            tmp.renameTo(f)
        } catch (_: Exception) { /* sin disco: Rust no ve resultado y niega (lo seguro) */ }
    }

    fun sinPreguntar(): Boolean = try {
        JSONObject(File(dir, INTERRUPTOR_PANTALLA).readText()).optBoolean("encendido", false)
    } catch (_: Exception) { false }

    private fun guardarSinPreguntar(si: Boolean) {
        escribirAtomico(File(dir, INTERRUPTOR_PANTALLA), JSONObject().put("encendido", si).put("t_ms", System.currentTimeMillis()).toString())
    }

    private fun aceptados(): JSONArray = try {
        JSONObject(File(dir, ACEPTADOS).readText()).optJSONArray("controladores") ?: JSONArray()
    } catch (_: Exception) { JSONArray() }

    /** El interruptor de control se apagó (aquí o desde la página): se vacía la lista y se apaga lo de la pantalla. */
    fun alApagar() {
        if (!iniciado) return
        escribirAtomico(File(dir, ACEPTADOS), JSONObject().put("v", 1).put("controladores", JSONArray()).toString())
        guardarSinPreguntar(false)
        ServicioControlEntrada.instancia?.parar()
    }

    /** Por si el interruptor se apagó por otro camino: cada petición y el arranque lo comprueban. */
    private fun comprobarInterruptor() {
        if (!ControlNeuronasNativo.encendido() && (aceptados().length() > 0 || sinPreguntar())) alApagar()
    }

    // ───────────── diálogos nativos (la persona decide; nada se acepta solo) ─────────────

    fun vigilarDialogo(d: AlertDialog) {
        dialogosPropios++
        d.setOnDismissListener { dialogosPropios = maxOf(0, dialogosPropios - 1) }
    }

    private fun dialogoAceptar(a: Activity, spki: String, cuenta: String, nombre: String, codigo: String, huella: String) {
        val d = AlertDialog.Builder(a)
            .setTitle("¿Dejar que «$nombre» toque y escriba en esta tableta?")
            .setMessage(
                "Código de ese aparato: $codigo\n\nCompáralo con el que enseña ese aparato en StarSeed OS. Si no coincide, di que No.\n\n" +
                    "Aceptado, podrá mandar toques, teclas, volumen, brillo y texto mientras veas el borde rojo y la notificación. " +
                    "Tocar la pantalla lo pausa. La lista se vacía al apagar «Dejar que tus otras neuronas controlen esta tableta»."
            )
            .setPositiveButton("Sí, aceptar") { _, _ ->
                if (!ControlNeuronasNativo.encendido()) return@setPositiveButton
                val lista = JSONArray()
                val previos = aceptados()
                for (i in 0 until previos.length()) {
                    val c = previos.optJSONObject(i) ?: continue
                    if (c.optString("huella") != huella) lista.put(c)
                }
                lista.put(JSONObject().put("spki", spki).put("huella", huella).put("cuenta", cuenta).put("nombre", nombre).put("t_ms", System.currentTimeMillis()))
                escribirAtomico(File(dir, ACEPTADOS), JSONObject().put("v", 1).put("controladores", lista).toString())
            }
            .setNegativeButton("No", null)
            .setCancelable(true)
            .show()
        vigilarDialogo(d)
    }

    private fun dialogoPantalla(a: Activity) {
        val d = AlertDialog.Builder(a)
            .setTitle("¿Ver esta pantalla sin preguntar en cada sesión?")
            .setMessage(
                "Mientras otra neurona de tu cuenta, que aceptaste aquí, controle esta tableta con el borde rojo a la vista, " +
                    "podrá ver la pantalla sin que Android te lo vuelva a preguntar. Los cuadros no se guardan. " +
                    "Puedes apagarlo cuando quieras (se apaga solo al apagar el control)."
            )
            .setPositiveButton("Sí, dejar ver") { _, _ -> if (ControlNeuronasNativo.encendido()) guardarSinPreguntar(true) }
            .setNegativeButton("No") { _, _ -> guardarSinPreguntar(false) }
            .setCancelable(true)
            .show()
        vigilarDialogo(d)
    }

    // ───────────── peticiones de Rust ─────────────

    private fun atender() {
        comprobarInterruptor()
        val ps = dir.listFiles { f -> f.name.startsWith(PREFIJO_PETICION) && f.name.endsWith(".json") }?.sortedBy { it.name } ?: return
        for (f in ps) {
            val p = try { JSONObject(f.readText()) } catch (_: Exception) { null }
            f.delete()
            if (p == null) continue
            val id = p.optLong("id", 0L)
            val r = try { responder(p) } catch (e: Throwable) { JSONObject().put("ok", false).put("motivo", "sin-servicio").put("detalle", (e.javaClass.simpleName).take(40)) }
            if (id != 0L && r != null) escribirAtomico(File(dir, "$PREFIJO_RESULTADO$id.json"), r.toString())
        }
    }

    private fun no(motivo: String, falta: String? = null): JSONObject {
        val o = JSONObject().put("ok", false).put("motivo", motivo)
        if (falta != null) o.put("falta", JSONArray().put(falta))
        return o
    }

    private fun responder(p: JSONObject): JSONObject? {
        val srv = ServicioControlEntrada.instancia
        return when (p.optString("tipo")) {
            "capacidades" -> JSONObject()
                .put("servicio", srv != null)
                .put("captura", Build.VERSION.SDK_INT >= 30)
                .put("max_dedos", if (Build.VERSION.SDK_INT >= 24) GestureDescription.getMaxStrokeCount() else 0)
                .put("sin_preguntar", sinPreguntar() && ControlNeuronasNativo.encendido())
                .put("escribir_ajustes", Settings.System.canWrite(app))
                .put("restringido", srv == null && ajustesRestringidos())
            "estado-aparato" -> estadoAparato()
            "abrir-ajuste" -> abrirAjuste(p.optString("cual"))
            "aceptar-controlador" -> {
                val a = actividad?.get()
                if (!ControlNeuronasNativo.encendido()) no("interruptor-apagado")
                else if (a == null) no("sin-pantalla")
                else {
                    dialogoAceptar(a, p.optString("spki"), p.optString("cuenta").take(100), p.optString("nombre", "otra neurona").take(40), p.optString("codigo"), p.optString("huella"))
                    JSONObject().put("ok", true)
                }
            }
            "quitar-controlador" -> {
                if (!ControlNeuronasNativo.encendido()) no("interruptor-apagado")
                else {
                    val huella = p.optString("huella")
                    if (!ControlEntradaLogica.huellaValida(huella)) no("huella-invalida")
                    else {
                        val texto = try { File(dir, ACEPTADOS).readText() } catch (_: Exception) { null }
                        if (texto == null) JSONObject().put("ok", true).put("quitados", 0) // sin archivo: ok con 0
                        else {
                            val (nuevo, n) = ControlEntradaLogica.sinHuella(texto, huella)
                            if (n > 0) escribirAtomico(File(dir, ACEPTADOS), nuevo)
                            JSONObject().put("ok", true).put("quitados", n)
                        }
                    }
                }
            }
            "entrada" -> when {
                !ControlNeuronasNativo.encendido() || !ControlNeuronasNativo.mostrando || ControlNeuronasNativo.sesion == null -> no("sesion")
                srv == null -> no("sin-servicio", "servicio-accesibilidad")
                else -> srv.ejecutar(p.optJSONObject("orden") ?: JSONObject())
            }
            "pantalla-iniciar" -> when {
                !ControlNeuronasNativo.encendido() || !ControlNeuronasNativo.mostrando || ControlNeuronasNativo.sesion == null -> no("sesion")
                srv == null -> no("sin-servicio", "servicio-accesibilidad")
                !sinPreguntar() -> no("sin-consentimiento", "consentimiento-pantalla")
                else -> srv.iniciarCaptura(p.optInt("lado_max", 1280), p.optInt("calidad", 60))
            }
            "pantalla-parar" -> { srv?.parar(); null }
            else -> no("sin-servicio")
        }
    }

    /** La pantalla de Ajustes donde la persona lo arregla, o el diálogo nativo del consentimiento. NO concede nada. */
    private fun abrirAjuste(cual: String): JSONObject {
        val a = actividad?.get()
        val ctx: Context = a ?: app
        val i = when (cual) {
            "servicio-accesibilidad" -> Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            "ajustes-restringidos" -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + app.packageName))
            "escribir-ajustes" -> Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:" + app.packageName))
            "consentimiento-pantalla" -> {
                if (!ControlNeuronasNativo.encendido()) return no("interruptor-apagado")
                if (a == null) return no("sin-pantalla")
                dialogoPantalla(a)
                return JSONObject().put("ok", true).put("dialogo", true)
            }
            else -> return no("ajuste-desconocido")
        }
        if (a == null) i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return try { ctx.startActivity(i); JSONObject().put("ok", true) } catch (_: Exception) { no("sin-pantalla-de-ajustes") }
    }

    /** En Android 13+ una app instalada fuera de la tienda tiene «ajustes restringidos»: la accesibilidad sale en gris. */
    private fun ajustesRestringidos(): Boolean = try {
        if (Build.VERSION.SDK_INT < 33) false
        else {
            val ops = app.getSystemService(AppOpsManager::class.java)
            ops.unsafeCheckOpNoThrow("android:access_restricted_settings", Process.myUid(), app.packageName) == AppOpsManager.MODE_IGNORED
        }
    } catch (_: Throwable) { false }

    // ───────────── estado del aparato ─────────────

    fun medidas(): IntArray {
        val d = (app.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager).getDisplay(Display.DEFAULT_DISPLAY)
        val m = DisplayMetrics()
        @Suppress("DEPRECATION")
        d.getRealMetrics(m)
        val giro = when (d.rotation) { Surface.ROTATION_90 -> 90; Surface.ROTATION_180 -> 180; Surface.ROTATION_270 -> 270; else -> 0 }
        return intArrayOf(m.widthPixels, m.heightPixels, giro)
    }

    private fun nivelFlujo(am: AudioManager, flujo: Int): Double {
        val max = am.getStreamMaxVolume(flujo)
        return if (max <= 0) 0.0 else am.getStreamVolume(flujo).toDouble() / max
    }

    private fun estadoAparato(): JSONObject {
        val am = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val vol = JSONObject()
            .put("multimedia", nivelFlujo(am, AudioManager.STREAM_MUSIC))
            .put("llamada", nivelFlujo(am, AudioManager.STREAM_VOICE_CALL))
            .put("timbre", nivelFlujo(am, AudioManager.STREAM_RING))
            .put("alarma", nivelFlujo(am, AudioManager.STREAM_ALARM))
        val brillo = try { Settings.System.getInt(app.contentResolver, Settings.System.SCREEN_BRIGHTNESS) / 255.0 } catch (_: Exception) { 0.0 }
        val bat = app.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val nivel = bat?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val escala = bat?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        val estado = bat?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val wifi = try { (app.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager).isWifiEnabled } catch (_: Throwable) { false }
        val datos = try {
            val cm = app.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            cm.getNetworkCapabilities(cm.activeNetwork)?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true
        } catch (_: Throwable) { false }
        val bt = try { BluetoothAdapter.getDefaultAdapter()?.isEnabled == true } catch (_: Throwable) { false }
        val m = medidas()
        val encendida = (app.getSystemService(Context.POWER_SERVICE) as PowerManager).isInteractive
        val bloqueada = (app.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked
        return JSONObject()
            .put("volumen", vol)
            .put("brillo", brillo)
            .put("bateria", if (nivel < 0) 0.0 else nivel.toDouble() / maxOf(1, escala))
            .put("cargando", estado == BatteryManager.BATTERY_STATUS_CHARGING || estado == BatteryManager.BATTERY_STATUS_FULL)
            .put("red", JSONObject().put("wifi", wifi).put("datos", datos).put("bluetooth", bt))
            .put("pantalla", JSONObject().put("ancho", m[0]).put("alto", m[1]).put("giro", m[2]).put("encendida", encendida).put("bloqueada", bloqueada))
    }

    // ───────────── volumen y brillo (no son «entrada a una ventana»: no pasan por la regla G) ─────────────

    fun ponerVolumen(flujo: String, nivel: Double): JSONObject {
        val am = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val s = when (flujo) {
            "multimedia" -> AudioManager.STREAM_MUSIC
            "llamada" -> AudioManager.STREAM_VOICE_CALL
            "timbre" -> AudioManager.STREAM_RING
            "alarma" -> AudioManager.STREAM_ALARM
            else -> return no("sin-servicio")
        }
        return try {
            am.setStreamVolume(s, Math.round(nivel * am.getStreamMaxVolume(s)).toInt(), 0)
            JSONObject().put("ok", true)
        } catch (_: SecurityException) { no("sin-servicio").put("detalle", "no-molestar") }
    }

    fun ponerBrillo(nivel: Double): JSONObject {
        if (!Settings.System.canWrite(app)) return no("sin-servicio", "escribir-ajustes")
        return try {
            Settings.System.putInt(app.contentResolver, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL)
            Settings.System.putInt(app.contentResolver, Settings.System.SCREEN_BRIGHTNESS, Math.round(nivel * 255).toInt().coerceIn(1, 255))
            JSONObject().put("ok", true)
        } catch (_: Exception) { no("sin-servicio", "escribir-ajustes") }
    }

    fun teclaDeVolumen(cual: String) {
        val am = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val dir = when (cual) { "volumen-subir" -> AudioManager.ADJUST_RAISE; "volumen-bajar" -> AudioManager.ADJUST_LOWER; else -> AudioManager.ADJUST_TOGGLE_MUTE }
        am.adjustSuggestedStreamVolume(dir, AudioManager.USE_DEFAULT_STREAM_TYPE, AudioManager.FLAG_SHOW_UI)
    }

    fun carpeta(): File = dir
    fun contexto(): Context = app
}

@android.annotation.SuppressLint("NewApi") // lo de API 30 va tras `SDK_INT >= 30`
/** El servicio de accesibilidad. APAGADO hasta que la persona lo activa en Ajustes > Accesibilidad. */
class ServicioControlEntrada : AccessibilityService() {
    companion object {
        @Volatile var instancia: ServicioControlEntrada? = null
        private const val SUELTA_TRAS_MS = 5_000L
        private const val INTERVALO_CAPTURA_MS = 350L
    }

    private val principal = Handler(Looper.getMainLooper())
    private var ultimoPaquete: String? = null
    private var ultimaClase: String? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        instancia = this
    }

    override fun onAccessibilityEvent(ev: AccessibilityEvent?) {
        if (ev == null || ev.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val p = ev.packageName?.toString() ?: return
        val c = ev.className?.toString() ?: ""
        // Nuestra superposición (borde y pastilla) no es «la ventana en primer plano».
        if (p == packageName && !c.endsWith("Activity")) return
        ultimoPaquete = p
        ultimaClase = c
    }

    override fun onInterrupt() { soltarTodo() }

    override fun onUnbind(intent: Intent?): Boolean {
        parar()
        instancia = null
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        parar()
        instancia = null
        super.onDestroy()
    }

    /** Fin de sesión o servicio que se va: suelta los dedos y para la captura. */
    fun parar() {
        capturando = false
        File(ControlEntradaNativo.carpeta(), ControlEntradaNativo.CUADRO).delete()
        cola.clear()
        soltarTodo()
    }

    // ───────────── regla G ─────────────

    private fun ventanaProtegida(): Boolean {
        if (ControlEntradaNativo.dialogosPropios > 0) return true // diálogos nativos de esta app (permisos del control)
        val raiz = rootInActiveWindow
        val paquete = raiz?.packageName?.toString() ?: ultimoPaquete ?: return true // sin saber qué hay delante: no se toca
        val clase = if (paquete == ultimoPaquete) ultimaClase else ""
        var titulo = ""
        try { windows?.firstOrNull { it.isActive }?.title?.toString()?.let { titulo = it } } catch (_: Throwable) {}
        return ControlEntradaNativo.reglaG(paquete, clase) || ControlEntradaNativo.reglaG(paquete, titulo)
    }

    private fun rechazo(m: String): JSONObject = JSONObject().put("ok", false).put("motivo", m)

    /** Una orden ya verificada por Rust. Corre en el hilo principal. */
    fun ejecutar(orden: JSONObject): JSONObject {
        val nombre = orden.optString("nombre")
        val args = orden.optJSONObject("args") ?: JSONObject()
        if (!ControlNeuronasNativo.mostrando) return rechazo("sesion")
        // Pausa por un toque local: la que sigue pulsada (fase 1) y los 3 s sin tocar (seam, regla 5).
        if (ControlNeuronasNativo.pausada || System.currentTimeMillis() - ControlEntradaNativo.ultimoToqueLocal < ControlEntradaNativo.PAUSA_LOCAL_MS) return rechazo("pausa-local")
        return when (nombre) {
            "volumen" -> ControlEntradaNativo.ponerVolumen(args.optString("flujo"), args.optDouble("nivel", 0.0).coerceIn(0.0, 1.0))
            "brillo" -> ControlEntradaNativo.ponerBrillo(args.optDouble("nivel", 0.0).coerceIn(0.0, 1.0))
            "gesto", "tecla", "texto" -> if (ventanaProtegida()) rechazo("regla-g") else when (nombre) {
                "gesto" -> gesto(args)
                "tecla" -> tecla(args.optString("cual"))
                else -> texto(args.optString("texto"))
            }
            else -> rechazo("sin-servicio")
        }
    }

    // ───────────── teclas y texto ─────────────

    private fun tecla(cual: String): JSONObject {
        val ok = when (cual) {
            "atras" -> performGlobalAction(GLOBAL_ACTION_BACK)
            "inicio" -> performGlobalAction(GLOBAL_ACTION_HOME)
            "recientes" -> performGlobalAction(GLOBAL_ACTION_RECENTS)
            "notificaciones" -> performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS)
            "ajustes-rapidos" -> performGlobalAction(GLOBAL_ACTION_QUICK_SETTINGS)
            "bloquear" -> Build.VERSION.SDK_INT >= 28 && performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN)
            "captura" -> Build.VERSION.SDK_INT >= 28 && performGlobalAction(GLOBAL_ACTION_TAKE_SCREENSHOT)
            "menu-energia" -> performGlobalAction(GLOBAL_ACTION_POWER_DIALOG)
            "volumen-subir", "volumen-bajar", "silencio" -> { ControlEntradaNativo.teclaDeVolumen(cual); true }
            else -> false
        }
        return if (ok) JSONObject().put("ok", true) else rechazo("sin-servicio").put("detalle", "tecla-no-aplicada")
    }

    private fun texto(t: String): JSONObject {
        val raiz = rootInActiveWindow ?: return rechazo("sin-servicio").put("detalle", "sin-ventana")
        val foco = raiz.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        if (foco != null && foco.isPassword) return rechazo("regla-g") // nunca texto en un campo de contraseña
        if (foco == null || !foco.isEditable) return rechazo("sin-servicio").put("detalle", "sin-campo")
        val previo = if (foco.isShowingHintText) "" else (foco.text?.toString() ?: "")
        val a = Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, previo + t) }
        return if (foco.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, a)) JSONObject().put("ok", true) else rechazo("sin-servicio").put("detalle", "texto-no-aplicado")
    }

    // ───────────── gestos (varios dedos a la vez; `sigue` continúa los trazos con la orden siguiente) ─────────────

    private val cola = ArrayDeque<JSONObject>()
    private var despachando = false
    private val enCurso = HashMap<Int, GestureDescription.StrokeDescription>()
    private val ultimoPunto = HashMap<Int, FloatArray>()
    private val soltar = Runnable { soltarTodo() }

    private fun gesto(args: JSONObject): JSONObject {
        if (cola.size >= 16) return rechazo("limite")
        cola.add(args)
        bombear()
        return JSONObject().put("ok", true)
    }

    private fun bombear() {
        if (despachando) return
        if (ControlNeuronasNativo.pausada || !ControlNeuronasNativo.mostrando) { cola.clear(); return } // una pausa local tira lo encolado
        val args = cola.poll() ?: return
        val m = ControlEntradaNativo.medidas()
        val w = (m[0] - 1).toFloat()
        val h = (m[1] - 1).toFloat()
        val dedos = args.optJSONArray("dedos") ?: return
        val sigue = args.optBoolean("sigue", false)
        val maxMs = if (Build.VERSION.SDK_INT >= 24) GestureDescription.getMaxGestureDuration() else 60_000L
        val b = GestureDescription.Builder()
        val ids = HashSet<Int>()
        for (i in 0 until dedos.length()) ids.add(dedos.getJSONObject(i).optInt("id"))
        // Los dedos de antes que esta orden no nombra: se sueltan donde estaban.
        for ((id, s) in enCurso) if (id !in ids) {
            val p = Path().apply { val u = ultimoPunto[id] ?: floatArrayOf(0f, 0f); moveTo(u[0], u[1]) }
            b.addStroke(s.continueStroke(p, 0, 1, false))
        }
        val nuevos = HashMap<Int, GestureDescription.StrokeDescription>()
        var duracionMax = 1L
        for (i in 0 until dedos.length()) {
            val d = dedos.getJSONObject(i)
            val id = d.optInt("id")
            val pts = d.optJSONArray("puntos") ?: continue
            if (pts.length() == 0) continue
            val prev = enCurso[id]
            val p = Path()
            var dur = 0L
            var x = 0f
            var y = 0f
            if (prev != null) { val u = ultimoPunto[id] ?: floatArrayOf(0f, 0f); p.moveTo(u[0], u[1]) }
            for (k in 0 until pts.length()) {
                val q = pts.getJSONArray(k)
                x = (q.getDouble(0).toFloat() * w).coerceIn(0f, w)
                y = (q.getDouble(1).toFloat() * h).coerceIn(0f, h)
                if (k == 0 && prev == null) p.moveTo(x, y) else p.lineTo(x, y)
                if (k > 0 || prev != null) dur += q.optLong(2, 0) // UNI1115M · dt = ms desde el punto anterior de ESE dedo (el primero de un dedo nuevo, 0)
            }
            if (prev != null && dur == 0L) dur = 1
            if (prev == null && pts.length() == 1) dur = 50 // un toque
            dur = dur.coerceIn(1L, maxMs)
            val s = if (prev != null) prev.continueStroke(p, 0, dur, sigue) else GestureDescription.StrokeDescription(p, 0, dur, sigue)
            b.addStroke(s)
            if (sigue) { nuevos[id] = s; ultimoPunto[id] = floatArrayOf(x, y) } else ultimoPunto.remove(id)
            if (dur > duracionMax) duracionMax = dur
        }
        ultimoPunto.keys.retainAll(nuevos.keys) // UNI1115M · un dedo que esta orden no nombra ya se soltó (costura f)
        despachando = true
        ControlEntradaNativo.gestoPropioHasta = System.currentTimeMillis() + duracionMax + 500 // el toque que se oye es nuestro
        val ok = try {
            dispatchGesture(b.build(), object : GestureResultCallback() {
                override fun onCompleted(g: GestureDescription?) { terminado(nuevos) }
                override fun onCancelled(g: GestureDescription?) { terminado(HashMap()) }
            }, principal)
        } catch (_: Exception) { false }
        if (!ok) terminado(HashMap())
    }

    private fun terminado(nuevos: HashMap<Int, GestureDescription.StrokeDescription>) {
        despachando = false
        enCurso.clear()
        enCurso.putAll(nuevos)
        ControlEntradaNativo.gestoPropioHasta = System.currentTimeMillis() + 300
        principal.removeCallbacks(soltar)
        if (enCurso.isNotEmpty()) principal.postDelayed(soltar, SUELTA_TRAS_MS) // dedos olvidados abajo: se sueltan solos
        bombear()
    }

    /** Levanta los dedos que sigan abajo (sin una orden nueva en 5 s, al terminar la sesión o al irse el servicio). */
    private fun soltarTodo() {
        principal.removeCallbacks(soltar)
        if (enCurso.isEmpty() || despachando) { if (!despachando) { enCurso.clear(); ultimoPunto.clear() }; return }
        val b = GestureDescription.Builder()
        for ((id, s) in enCurso) {
            val u = ultimoPunto[id] ?: floatArrayOf(0f, 0f)
            b.addStroke(s.continueStroke(Path().apply { moveTo(u[0], u[1]) }, 0, 1, false))
        }
        enCurso.clear()
        ultimoPunto.clear()
        despachando = true
        try { dispatchGesture(b.build(), object : GestureResultCallback() {
            override fun onCompleted(g: GestureDescription?) { despachando = false }
            override fun onCancelled(g: GestureDescription?) { despachando = false }
        }, principal) } catch (_: Exception) { despachando = false }
    }

    // ───────────── pantalla por capturas de accesibilidad (API 30+, como mucho ~3 por segundo) ─────────────

    @Volatile private var capturando = false
    private var lado = 1280
    private var calidad = 60
    private var numero = 0
    private var hilo: HandlerThread? = null
    private var trabajo: Handler? = null
    private var ejecutor: Executor? = null

    private fun escalado(ancho: Int, alto: Int): IntArray {
        // La MISMA cuenta que `escalar` de control_entrada_logica.rs: lado mayor = lado_max, sin ampliar, lados pares >= 2.
        val tope = lado.coerceIn(160, 2048)
        val k = if (maxOf(ancho, alto) <= tope) 1.0 else tope.toDouble() / maxOf(ancho, alto)
        fun par(v: Int) = maxOf(2, Math.round(v * k).toInt() and 1.inv())
        return intArrayOf(par(ancho), par(alto))
    }

    fun iniciarCaptura(ladoMax: Int, calidadJpeg: Int): JSONObject {
        if (Build.VERSION.SDK_INT < 30) return rechazo("sin-servicio").put("detalle", "android-anterior-a-11")
        lado = ladoMax
        calidad = calidadJpeg.coerceIn(20, 95)
        numero = 0
        File(ControlEntradaNativo.carpeta(), ControlEntradaNativo.CUADRO).delete()
        if (hilo == null) {
            hilo = HandlerThread("starseed-cuadros").also { it.start() }
            trabajo = Handler(hilo!!.looper)
            ejecutor = Executor { r -> trabajo?.post(r) }
        }
        val m = ControlEntradaNativo.medidas()
        val e = escalado(m[0], m[1])
        if (!capturando) {
            capturando = true
            trabajo?.post { capturar() }
        }
        return JSONObject().put("ok", true).put("fuente", "accesibilidad").put("ancho", e[0]).put("alto", e[1]).put("giro", m[2])
    }

    private fun siguiente(desde: Long, espera: Long = INTERVALO_CAPTURA_MS) {
        val resta = maxOf(0L, espera - (System.currentTimeMillis() - desde))
        trabajo?.postDelayed({ capturar() }, resta)
    }

    private fun capturar() {
        // Sin sesión abierta con el indicador a la vista, no se captura nada.
        if (!capturando || !ControlNeuronasNativo.mostrando || Build.VERSION.SDK_INT < 30) { capturando = false; return }
        val t0 = System.currentTimeMillis()
        try {
            takeScreenshot(Display.DEFAULT_DISPLAY, ejecutor!!, object : TakeScreenshotCallback {
                override fun onSuccess(r: ScreenshotResult) {
                    try {
                        val hb = r.hardwareBuffer
                        val duro = Bitmap.wrapHardwareBuffer(hb, r.colorSpace)
                        val blando = duro?.copy(Bitmap.Config.ARGB_8888, false)
                        hb.close()
                        if (blando != null) {
                            val e = escalado(blando.width, blando.height)
                            val esc = if (e[0] == blando.width && e[1] == blando.height) blando else Bitmap.createScaledBitmap(blando, e[0], e[1], true)
                            val sal = ByteArrayOutputStream(64 * 1024)
                            esc.compress(Bitmap.CompressFormat.JPEG, calidad, sal)
                            publicar(esc.width, esc.height, sal.toByteArray())
                            if (esc !== blando) esc.recycle()
                            blando.recycle()
                        }
                    } catch (_: Throwable) { /* un cuadro perdido; sigue el siguiente */ }
                    siguiente(t0)
                }

                override fun onFailure(codigo: Int) {
                    siguiente(t0, 500) // intervalo demasiado corto, pantalla apagada o ventana segura: se reintenta sin machacar
                }
            })
        } catch (_: Throwable) { siguiente(t0, 1000) }
    }

    /** `cuadro.bin` = 12 bytes (u32 nº, u16 ancho, u16 alto, u16 giro, u16 cero; little endian) + el JPEG. Un archivo, reemplazo atómico. */
    private fun publicar(ancho: Int, alto: Int, jpeg: ByteArray) {
        numero++
        val giro = ControlEntradaNativo.medidas()[2]
        val c = ByteArray(12)
        for (i in 0 until 4) c[i] = ((numero ushr (8 * i)) and 0xFF).toByte()
        c[4] = (ancho and 0xFF).toByte(); c[5] = ((ancho shr 8) and 0xFF).toByte()
        c[6] = (alto and 0xFF).toByte(); c[7] = ((alto shr 8) and 0xFF).toByte()
        c[8] = (giro and 0xFF).toByte(); c[9] = ((giro shr 8) and 0xFF).toByte()
        val d = ControlEntradaNativo.carpeta()
        val tmp = File(d, ".${ControlEntradaNativo.CUADRO}.tmp")
        try {
            tmp.outputStream().use { it.write(c); it.write(jpeg) }
            tmp.renameTo(File(d, ControlEntradaNativo.CUADRO))
        } catch (_: Exception) {}
    }
}
