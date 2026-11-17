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
import android.view.InputDevice
import android.view.MotionEvent
import android.view.Surface
import android.view.View
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
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

    /**
     * FSG1116 · A1 · Regla G: la MISMA decisión que `regla_g` de control_entrada_logica.rs (una prueba de Rust compara
     * las cláusulas), con la lista que build.rs genera desde control_regla_g.txt (`ReglaGLista`). Por PAQUETE y por el
     * TIPO de ventana que da Android, nunca por nombres de clase ni títulos (idioma, fabricante). Ante la duda, `true`.
     * `ventanas` = (paquete o null, ¿es de tipo aplicación?) de cada ventana a la vista.
     */
    fun reglaG(ventanas: List<Pair<String?, Boolean>>, propio: String, bloqueada: Boolean, congelada: Boolean, contrasena: Boolean): Boolean {
        if (congelada || bloqueada || contrasena || ventanas.isEmpty()) return true
        val yo = propio.lowercase()
        return ventanas.any { (paquete, actividad) ->
            val p = paquete?.lowercase()
            if (p == null) actividad // una actividad de quien no se sabe: no se toca
            else p in ReglaGLista.PROTEGIDOS || (actividad && (p == yo || p in ReglaGLista.SISTEMA))
        }
    }

    /**
     * CTL1117A · la ÚNICA excepción de la regla G (decisión del dueño, 16-11): la tecla INICIO pasa desde una ventana
     * protegida para salir de Ajustes o de una tienda. LISTA POSITIVA (ante la duda, se niega): solo si TODAS las ventanas
     * protegidas a la vista son de la propia app o de `ReglaGLista.SALIDA`. Con un diálogo de permisos, un instalador,
     * credenciales, managedprovisioning o una actividad de systemui a la vista, se niega; igual con consentimiento
     * abierto (`congelada`), pantalla bloqueada, contraseña con foco o sin ventanas. La MISMA decisión que
     * `regla_g_deja_inicio` de control_entrada_logica.rs.
     */
    fun reglaGInicio(ventanas: List<Pair<String?, Boolean>>, propio: String, bloqueada: Boolean, congelada: Boolean, contrasena: Boolean): Boolean {
        if (congelada || bloqueada || contrasena || ventanas.isEmpty()) return false
        val yo = propio.lowercase()
        return ventanas.all { (paquete, actividad) ->
            val p = paquete?.lowercase()
            if (p == null) !actividad
            else {
                val protegida = p in ReglaGLista.PROTEGIDOS || (actividad && (p == yo || p in ReglaGLista.SISTEMA))
                !protegida || p == yo || p in ReglaGLista.SALIDA
            }
        }
    }

    /**
     * CTL1117C · FALLO 2: una ventana SIN raíz (Android no dio su árbol) cuenta como la propia app solo si está PROBADO: es la
     * ventana activa y la raíz de la ventana activa es de la propia app. Sin prueba sigue siendo «una actividad de quien no se
     * sabe» y se niega. La MISMA decisión que `ventana_sin_raiz_es_propia` de control_entrada_logica.rs.
     */
    fun sinRaizEsPropia(esLaActiva: Boolean, raizDeLaActiva: String?, propio: String): Boolean =
        esLaActiva && raizDeLaActiva != null && raizDeLaActiva.equals(propio, ignoreCase = true)

    /**
     * CTL1117C · FALLO 2: la CLASE de una ventana para la traza de un Inicio negado (nunca el nombre de otras apps): `propia`,
     * `salida`, `protegida:<paquete de la lista>`, `sistema-actividad`, `otra` o `sin-raiz`. La MISMA que `clase_ventana` de Rust.
     */
    fun claseVentana(paquete: String?, actividad: Boolean, propio: String): String {
        val p = paquete?.lowercase() ?: return "sin-raiz"
        return when {
            p == propio.lowercase() -> "propia"
            p in ReglaGLista.SALIDA -> "salida"
            p in ReglaGLista.PROTEGIDOS -> "protegida:" + p
            actividad && p in ReglaGLista.SISTEMA -> "sistema-actividad"
            else -> "otra"
        }
    }

    private lateinit var app: Context
    private lateinit var dir: File
    private val principal = Handler(Looper.getMainLooper())
    private var actividad: WeakReference<Activity>? = null
    private var observador: FileObserver? = null
    private var iniciado = false

    /**
     * FSG1116 · C1: diálogos de consentimiento de este control PEDIDOS y aún sin cerrar (interruptor, aceptar un
     * controlador, «ver sin preguntar», proyección hasta que Android contesta). Mientras haya uno, NADA remoto entra:
     * se congela en el instante de pedirlo (antes de enseñarlo) y la cola y el gesto en curso se cortan.
     */
    @Volatile var congelados = 0
    /** Hora (ms de reloj) del último trozo de gesto remoto despachado. */
    @Volatile var ultimoGestoRemoto = 0L
    /** Hasta cuándo (ms de reloj) el toque que llega es de un gesto NUESTRO y no de la persona. */
    @Volatile var gestoPropioHasta = 0L
    @Volatile var ultimoToqueLocal = 0L

    fun esGestoPropio(): Boolean = System.currentTimeMillis() < gestoPropioHasta
    fun toqueLocal() { ultimoToqueLocal = System.currentTimeMillis() }
    fun congelado(): Boolean = congelados > 0
    fun congelar() { congelados++; ServicioControlEntrada.instancia?.cortar() }
    fun descongelar() { congelados = maxOf(0, congelados - 1) }

    /** FSG1116 · C1: un toque de un aparato de entrada FÍSICO (no virtual). Los gestos inyectados no llegan así. */
    fun toqueFisico(ev: MotionEvent): Boolean {
        val d = InputDevice.getDevice(ev.deviceId) ?: return false
        return !d.isVirtual
    }

    /**
     * FSG1116 · C1: la guarda del «Sí» de un diálogo de consentimiento. Vale solo si desde que se PIDIÓ no se despachó
     * ningún gesto remoto, no hay uno en curso y el toque que lo pulsó (si lo hubo) vino de un aparato físico. Un clic
     * sin toque (TalkBack, teclado físico) vale por lo primero: con la entrada congelada nada remoto puede pulsar.
     */
    class Guarda {
        val desde = System.currentTimeMillis()
        @Volatile private var toqueVirtual = false
        fun toque(ev: MotionEvent) { toqueVirtual = !ControlEntradaNativo.toqueFisico(ev) }
        fun valida(): Boolean = !toqueVirtual && ControlEntradaNativo.ultimoGestoRemoto < desde && !ControlEntradaNativo.esGestoPropio() &&
            ServicioControlEntrada.instancia?.ocupado() != true
    }

    /**
     * FSG1116 · C1: enseña un diálogo de consentimiento con la entrada remota CONGELADA desde ya hasta que se cierre.
     * `alCerrar` corre al cerrarse (la proyección pasa allí el congelado a la pantalla de Android). Sin pantalla, se
     * descongela y no se enseña nada.
     */
    fun mostrarConsentimiento(b: AlertDialog.Builder, g: Guarda, alCerrar: (() -> Unit)? = null) {
        congelar()
        try {
            val d = b.create()
            d.setOnDismissListener { descongelar(); alCerrar?.invoke() }
            d.setOnShowListener {
                d.findViewById<View>(android.R.id.button1)?.setOnTouchListener { _, ev -> if (ev.actionMasked == MotionEvent.ACTION_DOWN) g.toque(ev); false }
            }
            d.show()
        } catch (e: Throwable) {
            descongelar()
            throw e
        }
    }

    /** FSG1116 · M2/M3: sin sesión a la vista, en pausa o con la pantalla bloqueada no queda ningún cuadro en disco. */
    fun puedePublicarCuadro(): Boolean {
        if (!ControlNeuronasNativo.mostrando || ControlNeuronasNativo.pausada) return false
        return try { !(app.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked } catch (_: Throwable) { false }
    }
    fun borrarCuadro() { if (iniciado) File(dir, CUADRO).delete() }

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

    /** Huella aceptable: no vacía, de 128 caracteres como máximo y sin espacios ni caracteres de control. */
    fun huellaValida(h: String): Boolean = h.isNotEmpty() && h.length <= 128 && h.none { it.isWhitespace() || it.isISOControl() }

    /** Pura: quita SOLO las entradas cuya `huella` sea igual (exacta). JSON roto o ilegible: se devuelve igual, con 0 quitados. */
    fun sinHuella(json: String, huella: String): Pair<String, Int> {
        val o = try { JSONObject(json) } catch (_: Exception) { return Pair(json, 0) }
        val previos = o.optJSONArray("controladores") ?: return Pair(json, 0)
        val lista = JSONArray()
        var quitados = 0
        for (i in 0 until previos.length()) {
            val c = previos.optJSONObject(i)
            if (c != null && c.optString("huella") == huella) quitados++ else lista.put(previos.opt(i))
        }
        if (quitados == 0) return Pair(json, 0)
        return Pair(o.put("controladores", lista).toString(), quitados)
    }

    /** Solo Kotlin escribe `aceptados.json`. Sin archivo: 0. Si no se quitó nada, no se reescribe. */
    private fun quitarControlador(huella: String): Int {
        val f = File(dir, ACEPTADOS)
        val texto = try { f.readText() } catch (_: Exception) { return 0 }
        val (nuevo, n) = sinHuella(texto, huella)
        if (n > 0) escribirAtomico(f, nuevo)
        return n
    }

    /** El interruptor de control se apagó (aquí o desde la página): se vacía la lista y se apaga lo de la pantalla. */
    fun alApagar() {
        if (!iniciado) return
        escribirAtomico(File(dir, ACEPTADOS), JSONObject().put("v", 1).put("controladores", JSONArray()).toString())
        guardarSinPreguntar(false)
        ServicioControlEntrada.instancia?.parar()
        ProyeccionPantalla.parar() // PENC1
    }

    /** Por si el interruptor se apagó por otro camino: cada petición y el arranque lo comprueban. */
    private fun comprobarInterruptor() {
        if (!ControlNeuronasNativo.encendido() && (aceptados().length() > 0 || sinPreguntar())) alApagar()
    }

    // ───────────── diálogos nativos (la persona decide; nada se acepta solo) ─────────────

    private fun dialogoAceptar(a: Activity, spki: String, cuenta: String, nombre: String, codigo: String, huella: String) {
        val g = Guarda()
        val b = AlertDialog.Builder(a)
            .setTitle("¿Dejar que «$nombre» toque y escriba en esta tableta?")
            .setMessage(
                "Código de ese aparato: $codigo\n\nCompáralo con el que enseña ese aparato en StarSeed OS. Si no coincide, di que No.\n\n" +
                    "Aceptado, podrá mandar toques, teclas, volumen, brillo y texto mientras veas el borde rojo y la notificación. " +
                    "Tocar la pantalla lo pausa. La lista se vacía al apagar «Dejar que tus otras neuronas controlen esta tableta»."
            )
            .setPositiveButton("Sí, aceptar") { _, _ ->
                if (!g.valida() || !ControlNeuronasNativo.encendido()) return@setPositiveButton // FSG1116 · C1
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
        mostrarConsentimiento(b, g)
    }

    private fun dialogoPantalla(a: Activity) {
        val g = Guarda()
        val b = AlertDialog.Builder(a)
            .setTitle("¿Ver esta pantalla sin preguntar en cada sesión?")
            .setMessage(
                "Mientras otra neurona de tu cuenta, que aceptaste aquí, controle esta tableta con el borde rojo a la vista, " +
                    "podrá ver la pantalla sin que Android te lo vuelva a preguntar. Los cuadros no se guardan. " +
                    "Puedes apagarlo cuando quieras (se apaga solo al apagar el control)."
            )
            .setPositiveButton("Sí, dejar ver") { _, _ -> if (g.valida() && ControlNeuronasNativo.encendido()) guardarSinPreguntar(true) } // FSG1116 · C1
            .setNegativeButton("No") { _, _ -> guardarSinPreguntar(false) }
            .setCancelable(true)
        mostrarConsentimiento(b, g)
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
                .put("proyeccion", ProyeccionPantalla.concedida()) // PENC1: el «Sí» de ESTA sesión, nunca guardado
                .put("escribir_ajustes", Settings.System.canWrite(app))
                .put("restringido", srv == null && ajustesRestringidos())
            "estado-aparato" -> estadoAparato()
            "abrir-ajuste" -> abrirAjuste(p.optString("cual"))
            "aceptar-controlador" -> {
                val a = actividad?.get()
                if (!ControlNeuronasNativo.encendido()) no("interruptor-apagado")
                else if (a == null) no("sin-pantalla")
                else if (congelado()) no("dialogo-abierto") // FSG1116 · B3: un consentimiento a la vez
                else {
                    dialogoAceptar(a, p.optString("spki"), p.optString("cuenta").take(100), p.optString("nombre", "otra neurona").take(40), p.optString("codigo"), p.optString("huella"))
                    JSONObject().put("ok", true)
                }
            }
            // PENB1: quitar un controlador de la lista aceptada. Solo QUITA (nunca añade) y no cierra la sesión activa.
            "quitar-controlador" -> {
                val h = p.optString("huella")
                if (!ControlNeuronasNativo.encendido()) no("interruptor-apagado")
                else if (!huellaValida(h)) no("huella-invalida")
                else JSONObject().put("ok", true).put("quitados", quitarControlador(h))
            }
            "entrada" -> when {
                !ControlNeuronasNativo.encendido() || !ControlNeuronasNativo.mostrando || ControlNeuronasNativo.sesion == null -> no("sesion")
                srv == null -> no("sin-servicio", "servicio-accesibilidad")
                else -> srv.ejecutar(p.optJSONObject("orden") ?: JSONObject())
            }
            "pantalla-iniciar" -> when {
                !ControlNeuronasNativo.encendido() || !ControlNeuronasNativo.mostrando || ControlNeuronasNativo.sesion == null -> no("sesion")
                // PENC1: fuente «proyeccion» = fluida; Android pregunta en CADA sesión. Sin el «Sí» de esta sesión, se lo pregunta a la persona.
                p.optString("fuente") == "proyeccion" -> if (ProyeccionPantalla.concedida()) {
                    srv?.parar()
                    ProyeccionPantalla.iniciar(p.optInt("lado_max", 1280), p.optInt("calidad", 60))
                } else {
                    actividad?.get()?.let { ProyeccionPantalla.pedir(it) }
                    no("sin-consentimiento", "consentimiento-proyeccion")
                }
                srv == null -> no("sin-servicio", "servicio-accesibilidad")
                !sinPreguntar() -> no("sin-consentimiento", "consentimiento-pantalla")
                else -> { ProyeccionPantalla.parar(); srv.iniciarCaptura(p.optInt("lado_max", 1280), p.optInt("calidad", 60)) }
            }
            "pantalla-parar" -> { srv?.parar(); ProyeccionPantalla.parar(); null }
            else -> no("sin-servicio")
        }
    }

    /** La pantalla de Ajustes donde la persona lo arregla, o el diálogo nativo del consentimiento. NO concede nada. */
    private fun abrirAjuste(cual: String): JSONObject {
        val a = actividad?.get()
        val ctx: Context = a ?: app
        val i = when (cual) {
            "servicio-accesibilidad" -> {
                // (FAC1116) Primero la ficha del propio servicio (si el aparato la tiene); si no, la lista de Accesibilidad.
                val ficha = Intent("android.settings.ACCESSIBILITY_DETAILS_SETTINGS")
                    .putExtra("android.intent.extra.COMPONENT_NAME", app.packageName + "/app.starseed.nativa.ServicioControlEntrada")
                if (a == null) ficha.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                try {
                    ctx.startActivity(ficha)
                    return JSONObject().put("ok", true).put("ficha", true)
                } catch (_: Exception) {
                    Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                }
            }
            "ajustes-restringidos" -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + app.packageName))
            "escribir-ajustes" -> Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:" + app.packageName))
            "consentimiento-pantalla" -> {
                if (!ControlNeuronasNativo.encendido()) return no("interruptor-apagado")
                if (a == null) return no("sin-pantalla")
                if (congelado()) return no("dialogo-abierto") // FSG1116 · B3
                dialogoPantalla(a)
                return JSONObject().put("ok", true).put("dialogo", true)
            }
            // PENC1: solo ABRE nuestro diálogo; el «Sí» de Android lo da la persona en su pantalla de consentimiento.
            "consentimiento-proyeccion" -> {
                if (!ControlNeuronasNativo.encendido()) return no("interruptor-apagado")
                if (a == null) return no("sin-pantalla")
                return ProyeccionPantalla.pedir(a)
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
        /** FSG1116 · C1: cada gesto se despacha en trozos de como mucho 200 ms; la regla G se mira antes de CADA uno. */
        const val TROZO_MS = 200L
    }

    private val principal = Handler(Looper.getMainLooper())

    override fun onServiceConnected() {
        super.onServiceConnected()
        instancia = this
    }

    override fun onAccessibilityEvent(ev: AccessibilityEvent?) {
        if (ev == null) return
        val t = ev.eventType
        if (t != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED && t != AccessibilityEvent.TYPE_WINDOWS_CHANGED) return
        // FSG1116 · C1: cambió lo que hay delante. Una cola llenada cuando era válida se tira si ahora hay algo protegido.
        if ((actual != null || cola.isNotEmpty() || enCurso.isNotEmpty()) && ventanaProtegida()) cortar()
    }

    override fun onInterrupt() { cortar() }

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

    /** Fin de sesión o servicio que se va: suelta los dedos (también el gesto en curso, FSG1116 · M6) y para la captura. */
    fun parar() {
        capturando = false
        ControlEntradaNativo.borrarCuadro()
        cortar()
    }

    // ───────────── regla G (FSG1116: se decide al DESPACHAR, con todas las ventanas a la vista) ─────────────

    private fun ventanaProtegida(): Boolean {
        val bloqueada = try { (getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked } catch (_: Throwable) { true }
        val vs = ArrayList<Pair<String?, Boolean>>()
        try {
            for (w in windows ?: emptyList<AccessibilityWindowInfo>()) {
                if (w.type == AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY) continue
                val p = try { w.root?.packageName?.toString() } catch (_: Throwable) { null }
                vs.add(Pair(p, w.type == AccessibilityWindowInfo.TYPE_APPLICATION))
            }
        } catch (_: Throwable) { vs.clear() }
        if (vs.isEmpty()) rootInActiveWindow?.packageName?.toString()?.let { vs.add(Pair(it, true)) }
        // M2: con el foco en un campo de contraseña tampoco se toca el teclado en pantalla.
        val contrasena = try { rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)?.isPassword == true } catch (_: Throwable) { true }
        return ControlEntradaNativo.reglaG(vs, packageName, bloqueada, ControlEntradaNativo.congelado(), contrasena)
    }

    /** CTL1117C · FALLO 2: por qué se negó el último Inicio (clases de ventana y marcas; ver `traza_inicio_negado` de Rust). */
    @Volatile private var trazaInicio = ""

    /**
     * CTL1117A: ¿deja pasar la tecla Inicio la situación de ahora? (las mismas entradas que la regla G, mirada aparte).
     * CTL1117C: una ventana sin raíz se cuenta como la propia solo si está probado (`sinRaizEsPropia`); y si se niega, deja en
     * `trazaInicio` POR QUÉ (la clase de cada ventana a la vista, su tipo y si es la activa, y las marcas), sin nombrar otras apps.
     */
    private fun inicioDesdeProtegida(): Boolean {
        val bloqueada = try { (getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked } catch (_: Throwable) { true }
        val vs = ArrayList<Pair<String?, Boolean>>()
        val clases = ArrayList<String>()
        val raizActiva = try { rootInActiveWindow?.packageName?.toString() } catch (_: Throwable) { null }
        try {
            for (w in windows ?: emptyList<AccessibilityWindowInfo>()) {
                if (w.type == AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY) continue
                val raiz = try { w.root?.packageName?.toString() } catch (_: Throwable) { null }
                val p = raiz ?: (if (ControlEntradaNativo.sinRaizEsPropia(w.isActive, raizActiva, packageName)) packageName else null)
                val actividad = w.type == AccessibilityWindowInfo.TYPE_APPLICATION
                vs.add(Pair(p, actividad))
                val tipo = when (w.type) {
                    AccessibilityWindowInfo.TYPE_APPLICATION -> "app"
                    AccessibilityWindowInfo.TYPE_SYSTEM -> "sistema"
                    AccessibilityWindowInfo.TYPE_INPUT_METHOD -> "teclado"
                    else -> "otro"
                }
                clases.add(ControlEntradaNativo.claseVentana(p, actividad, packageName) + "/" + tipo + (if (w.isActive) "/activa" else "") + (if (raiz == null && p != null) "/raiz-probada" else ""))
            }
        } catch (_: Throwable) { vs.clear(); clases.clear() }
        if (vs.isEmpty()) rootInActiveWindow?.packageName?.toString()?.let { vs.add(Pair(it, true)); clases.add(ControlEntradaNativo.claseVentana(it, true, packageName) + "/app/activa/respaldo") }
        val contrasena = try { rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)?.isPassword == true } catch (_: Throwable) { true }
        val congelada = ControlEntradaNativo.congelado()
        val pasa = ControlEntradaNativo.reglaGInicio(vs, packageName, bloqueada, congelada, contrasena)
        if (!pasa) {
            val marcas = ArrayList<String>()
            if (bloqueada) marcas.add("bloqueada")
            if (congelada) marcas.add("congelada")
            if (contrasena) marcas.add("contrasena")
            if (vs.isEmpty()) marcas.add("sin-ventanas")
            trazaInicio = "ventanas=" + (if (clases.isEmpty()) "ninguna" else clases.joinToString(",")) + " marcas=" + (if (marcas.isEmpty()) "ninguna" else marcas.joinToString(","))
        }
        return pasa
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
            // La regla G se mira aquí (para decirlo pronto) y OTRA VEZ antes de despachar cada trozo (`bombear`).
            "gesto", "tecla", "texto" -> if (ventanaProtegida()) {
                // CTL1117A: SOLO la tecla Inicio pasa desde una ventana protegida (con su traza propia); todo lo demás sigue negado.
                if (nombre == "tecla" && args.optString("cual") == "inicio" && inicioDesdeProtegida()) {
                    tecla("inicio").also { if (it.optBoolean("ok", false)) it.put("detalle", "inicio-desde-protegida") }
                } else rechazo("regla-g").also { if (nombre == "tecla" && args.optString("cual") == "inicio") it.put("detalle", "inicio-negado " + trazaInicio) } // CTL1117C · FALLO 2
            } else when (nombre) {
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
    // FSG1116 · C1: una orden de gesto se despacha en TROZOS de ≤ 200 ms encadenados con `continueStroke`; antes de
    // cada trozo (el primero y cada continuación) se mira la regla G. Si sale protegida, o se congela, o «Terminar»,
    // no se despacha nada nuevo: los dedos que sigan abajo se levantan donde están (su flujo táctil es de la ventana
    // que recibió el DOWN, no de la protegida) y la cola se tira.

    /** Un dedo de la orden: puntos en píxeles con su hora desde el inicio de la orden (ms). */
    private class Dedo(val id: Int, val xs: FloatArray, val ys: FloatArray, val ts: LongArray, val fin: Long, val sigue: Boolean) {
        fun en(t: Long): FloatArray {
            if (t <= ts[0]) return floatArrayOf(xs[0], ys[0])
            for (i in 1 until ts.size) if (t <= ts[i]) {
                val k = if (ts[i] == ts[i - 1]) 1f else (t - ts[i - 1]).toFloat() / (ts[i] - ts[i - 1])
                return floatArrayOf(xs[i - 1] + (xs[i] - xs[i - 1]) * k, ys[i - 1] + (ys[i] - ys[i - 1]) * k)
            }
            return floatArrayOf(xs.last(), ys.last())
        }
    }
    private class Orden(val dedos: List<Dedo>, val total: Long)

    private val cola = ArrayDeque<JSONObject>()
    private var actual: Orden? = null
    private var trozo = 0
    private var despachando = false
    private var cortarPendiente = false
    private val enCurso = HashMap<Int, GestureDescription.StrokeDescription>()
    private val ultimoPunto = HashMap<Int, FloatArray>()
    private val soltar = Runnable { soltarTodo() }

    /** ¿Hay un gesto remoto en el aire o dedos abajo? (la guarda del «Sí» lo mira). */
    fun ocupado(): Boolean = despachando || enCurso.isNotEmpty()

    private fun gesto(args: JSONObject): JSONObject {
        if (cola.size >= 16) return rechazo("limite")
        cola.add(args)
        bombear()
        return JSONObject().put("ok", true)
    }

    /** FSG1116 · C1/M6: tira la cola y el gesto a medias y levanta los dedos que sigan abajo. */
    fun cortar() {
        cola.clear()
        actual = null
        if (despachando) { cortarPendiente = true; return }
        soltarTodo()
    }

    private fun preparar(args: JSONObject): Orden? {
        val m = ControlEntradaNativo.medidas()
        val w = (m[0] - 1).toFloat()
        val h = (m[1] - 1).toFloat()
        val dedos = args.optJSONArray("dedos") ?: return null
        val sigue = args.optBoolean("sigue", false)
        val maxMs = if (Build.VERSION.SDK_INT >= 24) GestureDescription.getMaxGestureDuration() else 60_000L
        val lista = ArrayList<Dedo>()
        for (i in 0 until dedos.length()) {
            val d = dedos.getJSONObject(i)
            val id = d.optInt("id")
            val pts = d.optJSONArray("puntos") ?: continue
            if (pts.length() == 0) continue
            val sigueDeAntes = enCurso.containsKey(id)
            val xs = ArrayList<Float>(); val ys = ArrayList<Float>(); val ts = ArrayList<Long>()
            var t = 0L
            if (sigueDeAntes) { val u = ultimoPunto[id] ?: floatArrayOf(0f, 0f); xs.add(u[0]); ys.add(u[1]); ts.add(0L) }
            for (k in 0 until pts.length()) {
                val q = pts.getJSONArray(k)
                // UNI1115M · dt = ms desde el punto anterior de ESE dedo (el primero de un dedo nuevo, 0)
                if (k > 0 || sigueDeAntes) t += q.optLong(2, 0).coerceAtLeast(0)
                xs.add((q.getDouble(0).toFloat() * w).coerceIn(0f, w))
                ys.add((q.getDouble(1).toFloat() * h).coerceIn(0f, h))
                ts.add(t.coerceAtMost(maxMs))
            }
            var fin = t
            if (sigueDeAntes && fin == 0L) fin = 1
            if (!sigueDeAntes && pts.length() == 1) fin = 50 // un toque
            fin = fin.coerceIn(1L, maxMs)
            lista.add(Dedo(id, xs.toFloatArray(), ys.toFloatArray(), ts.toLongArray(), fin, sigue))
        }
        if (lista.isEmpty()) return null
        return Orden(lista, lista.maxOf { it.fin })
    }

    private fun bombear() {
        if (despachando) return
        if (ControlNeuronasNativo.pausada || !ControlNeuronasNativo.mostrando) { cortar(); return } // una pausa local tira lo encolado
        while (actual == null) {
            val args = cola.poll() ?: return
            actual = preparar(args)
            trozo = 0
        }
        // C1: la regla G y el congelado se deciden AQUÍ, antes de despachar CADA trozo, no al encolar.
        if (ventanaProtegida()) { cortar(); return }
        despacharTrozo(actual!!)
    }

    private fun despacharTrozo(o: Orden) {
        val a = trozo * TROZO_MS
        val b = a + TROZO_MS
        val g = GestureDescription.Builder()
        var hay = false
        // Los dedos de antes que esta orden no nombra: se sueltan donde estaban (en su primer trozo).
        if (trozo == 0) for ((id, s) in enCurso) if (o.dedos.none { it.id == id }) {
            val u = ultimoPunto[id] ?: floatArrayOf(0f, 0f)
            g.addStroke(s.continueStroke(Path().apply { moveTo(u[0], u[1]) }, 0, 1, false)); hay = true
        }
        val nuevos = HashMap<Int, GestureDescription.StrokeDescription>()
        val puntos = HashMap<Int, FloatArray>()
        var durMax = 1L
        for (d in o.dedos) {
            if (!d.sigue && a >= d.fin) continue // ya se levantó en un trozo anterior
            val hasta = if (d.sigue) minOf(b, o.total) else minOf(b, d.fin)
            val p = Path()
            val ini = d.en(a)
            p.moveTo(ini[0], ini[1])
            for (i in d.ts.indices) if (d.ts[i] > a && d.ts[i] < hasta) p.lineTo(d.xs[i], d.ys[i])
            val fin = d.en(hasta)
            p.lineTo(fin[0], fin[1])
            val dur = (hasta - a).coerceAtLeast(1L)
            val continua = d.sigue || hasta < d.fin
            val prev = enCurso[d.id]
            val s = if (prev != null) prev.continueStroke(p, 0, dur, continua) else GestureDescription.StrokeDescription(p, 0, dur, continua)
            g.addStroke(s); hay = true
            if (continua) { nuevos[d.id] = s; puntos[d.id] = fin }
            if (dur > durMax) durMax = dur
        }
        val ultimo = b >= o.total
        if (!hay) { terminado(nuevos, puntos, ultimo); return }
        despachando = true
        val ahora = System.currentTimeMillis()
        ControlEntradaNativo.ultimoGestoRemoto = ahora
        ControlEntradaNativo.gestoPropioHasta = ahora + durMax + 150 // M1: el toque que se oye es nuestro, y no más
        val ok = try {
            dispatchGesture(g.build(), object : GestureResultCallback() {
                override fun onCompleted(x: GestureDescription?) { terminado(nuevos, puntos, ultimo) }
                // M1: Android cancela un gesto inyectado cuando la persona toca la pantalla: eso es un toque local.
                override fun onCancelled(x: GestureDescription?) { cancelado() }
            }, principal)
        } catch (_: Exception) { false }
        if (!ok) cancelado()
    }

    private fun terminado(nuevos: HashMap<Int, GestureDescription.StrokeDescription>, puntos: HashMap<Int, FloatArray>, ultimo: Boolean) {
        despachando = false
        enCurso.clear(); enCurso.putAll(nuevos)
        ultimoPunto.clear(); ultimoPunto.putAll(puntos)
        ControlEntradaNativo.gestoPropioHasta = System.currentTimeMillis() + 150
        principal.removeCallbacks(soltar)
        if (cortarPendiente) { cortarPendiente = false; cola.clear(); actual = null; soltarTodo(); return }
        if (ultimo) { actual = null; trozo = 0 } else trozo++
        if (enCurso.isNotEmpty()) principal.postDelayed(soltar, SUELTA_TRAS_MS) // dedos olvidados abajo: se sueltan solos
        bombear()
    }

    private fun cancelado() {
        despachando = false
        cortarPendiente = false
        enCurso.clear(); ultimoPunto.clear()
        cola.clear(); actual = null
        principal.removeCallbacks(soltar)
        ControlEntradaNativo.toqueLocal()
        ControlNeuronasNativo.pausarLocal?.invoke() // FSG1116 · M1
    }

    /** Levanta los dedos que sigan abajo (sin una orden nueva en 5 s, al cortar, al terminar la sesión o al irse el servicio). */
    private fun soltarTodo() {
        principal.removeCallbacks(soltar)
        if (despachando) { cortarPendiente = true; return }
        if (enCurso.isEmpty()) { ultimoPunto.clear(); return }
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
        // FSG1116 · M3/M2: un cuadro que llega tras parar, en pausa o con la pantalla bloqueada no se escribe (y se borra el que hubiera).
        if (!capturando || !ControlEntradaNativo.puedePublicarCuadro()) { ControlEntradaNativo.borrarCuadro(); return }
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
        if (!capturando) ControlEntradaNativo.borrarCuadro() // parar() llegó mientras se escribía
    }
}
