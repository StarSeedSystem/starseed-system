package app.starseed.nativa

// (PENC1) Pantalla FLUIDA por proyección (MediaProjection). Contrato: architecture/control-remoto-entre-neuronas.md §12.
//
//   · Android pregunta en CADA sesión y no se puede saltar: la persona contesta «Sí» en el diálogo nativo de esta app y
//     luego en la pantalla de consentimiento del SISTEMA. Nada de aquí contesta un diálogo del sistema.
//   · El consentimiento vale para UNA sesión de control (su token) y para UNA proyección: no se guarda en disco ni entre
//     sesiones; al parar (orden, Terminar, apagar el interruptor, bloquear la pantalla, «Dejar de compartir» o el chip de
//     Android) se suelta la proyección y la próxima vez Android vuelve a preguntar.
//   · Los cuadros salen en el MISMO formato que los de accesibilidad (`cuadro.bin`: 12 bytes + JPEG, escritura atómica),
//     ya derechos, a 30 por segundo como mucho (CTL1118F; antes 15) y sin cola (el archivo solo guarda el más nuevo). Nunca se guardan más.

import android.app.Activity
import android.app.AlertDialog
import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.graphics.drawable.Icon
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File

/** Lo que ve ControlEntradaStarSeed.kt: pedir el «Sí», arrancar y parar. Todo en el hilo principal. */
object ProyeccionPantalla {
    @Volatile var servicio: ServicioProyeccionPantalla? = null
    /** Token de la sesión de control para la que la persona dijo «Sí». Solo en memoria. */
    @Volatile var consentidaPara: String? = null
    private var preguntaHasta = 0L
    /** FSG1116 · C1: el «Sí» propio pasó a la pantalla de Android; la entrada sigue congelada hasta que Android conteste. */
    @Volatile var congeladaEnSistema = false

    /** FSG1116 · C1: la pantalla de consentimiento de Android ya contestó (o no llegó a abrirse): se descongela. */
    fun sistemaContesto() {
        if (!congeladaEnSistema) return
        congeladaEnSistema = false
        ControlEntradaNativo.descongelar()
    }

    fun concedida(): Boolean = servicio != null && consentidaPara != null && consentidaPara == ControlNeuronasNativo.sesion

    /** CTL1118F: ¿está escribiendo cuadros ahora? (la fuente REAL que dice `capacidades.fuente_activa`). */
    fun capturandoAhora(): Boolean = servicio?.capturandoAhora() == true

    private fun no(motivo: String, falta: String? = null): JSONObject {
        val o = JSONObject().put("ok", false).put("motivo", motivo)
        if (falta != null) o.put("falta", JSONArray().put(falta))
        return o
    }

    /** Diálogo nativo que explica quién pide y, solo con el «Sí», abre la pantalla de consentimiento de Android. */
    fun pedir(a: Activity): JSONObject {
        if (a.isFinishing || a.isDestroyed) return no("sin-pantalla")
        if (!ControlNeuronasNativo.encendido() || !ControlNeuronasNativo.mostrando || ControlNeuronasNativo.sesion == null) return no("sesion")
        if (concedida()) return JSONObject().put("ok", true).put("dialogo", false)
        val ahora = System.currentTimeMillis()
        if (ahora < preguntaHasta) return JSONObject().put("ok", true).put("dialogo", false) // ya se preguntó hace poco: no se apila
        if (ControlEntradaNativo.congelado()) return JSONObject().put("ok", true).put("dialogo", false) // FSG1116 · B3
        preguntaHasta = ahora + 30_000L
        val g = ControlEntradaNativo.Guarda() // FSG1116 · C1
        var alSistema = false
        val b = AlertDialog.Builder(a)
            .setTitle("¿Compartir la pantalla en esta sesión?")
            .setMessage(
                "Otra neurona de tu cuenta, que aceptaste aquí, quiere ver esta pantalla con fluidez. Android te va a preguntar ahora " +
                    "y tendrás que contestar allí. Solo vale para esta sesión: se corta al terminar el control, al bloquear la pantalla " +
                    "o con «Dejar de compartir». Los cuadros no se guardan."
            )
            .setPositiveButton("Sí, continuar") { _, _ ->
                if (!g.valida()) { preguntaHasta = 0L; return@setPositiveButton } // FSG1116 · C1
                // El congelado sigue hasta que la pantalla de Android conteste (`sistemaContesto`).
                ControlEntradaNativo.congelar(); congeladaEnSistema = true; alSistema = true
                try { a.startActivity(Intent(a, ProyeccionConsentimientoActivity::class.java)) } catch (_: Throwable) { preguntaHasta = 0L; sistemaContesto() }
            }
            .setNegativeButton("No") { _, _ -> preguntaHasta = 0L }
            .setCancelable(true)
        ControlEntradaNativo.mostrarConsentimiento(b, g) { if (!alSistema) preguntaHasta = 0L }
        return JSONObject().put("ok", true).put("dialogo", true)
    }

    fun iniciar(ladoMax: Int, calidad: Int): JSONObject {
        val s = servicio
        if (s == null || !concedida()) return no("sin-consentimiento", "consentimiento-proyeccion")
        return s.empezar(ladoMax, calidad)
    }

    /** Suelta la proyección y borra el cuadro. Sin proyección, no hace nada. */
    fun parar() {
        val s = servicio ?: return
        if (Looper.myLooper() == Looper.getMainLooper()) s.detener() else Handler(Looper.getMainLooper()).post { s.detener() }
    }
}

/** Actividad transparente: solo existe para recibir el resultado de la pantalla de consentimiento de Android. */
@Suppress("DEPRECATION")
class ProyeccionConsentimientoActivity : Activity() {
    private val peticion = 7416

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        // Recreada por el sistema, o sin sesión de control a la vista: no se vuelve a preguntar.
        if (b != null || !ControlNeuronasNativo.encendido() || !ControlNeuronasNativo.mostrando || ControlNeuronasNativo.sesion == null) { ProyeccionPantalla.sistemaContesto(); finish(); return }
        try {
            val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            startActivityForResult(mpm.createScreenCaptureIntent(), peticion)
        } catch (_: Throwable) { ProyeccionPantalla.sistemaContesto(); finish() }
    }

    // FSG1116 · C1: pase lo que pase (contestó, se canceló, se destruyó), el congelado de la proyección se suelta aquí.
    override fun onDestroy() {
        ProyeccionPantalla.sistemaContesto()
        super.onDestroy()
    }

    override fun onActivityResult(codigo: Int, resultado: Int, datos: Intent?) {
        super.onActivityResult(codigo, resultado, datos)
        val token = ControlNeuronasNativo.sesion
        if (codigo == peticion && resultado == RESULT_OK && datos != null && token != null && ControlNeuronasNativo.mostrando) {
            val i = Intent(this, ServicioProyeccionPantalla::class.java).putExtra("codigo", resultado).putExtra("datos", datos).putExtra("sesion", token)
            try { if (Build.VERSION.SDK_INT >= 26) startForegroundService(i) else startService(i) } catch (_: Throwable) { /* sin servicio: sin pantalla */ }
        }
        ProyeccionPantalla.sistemaContesto() // FSG1116 · C1
        finish()
    }
}

/** Servicio en primer plano de tipo mediaProjection (notificación visible «Compartiendo la pantalla»). */
class ServicioProyeccionPantalla : Service() {
    companion object {
        const val ID = 47163
        const val CANAL = "starseed_proyeccion"
        const val PARAR = "app.starseed.nativa.PROYECCION_PARAR"
        const val ENTRE_CUADROS_MS = 33L // CTL1118F: ≤ 30 cuadros por segundo (antes 67 ms = 15)
        /** CTL1118F: calidad adaptativa: si codificar tarda de media más de ALTO_MS, baja de 5 en 5 hasta MIN; si tarda menos de BAJO_MS, sube hasta la pedida. La MISMA regla que `calidad_adaptada` de control_entrada_logica.rs. */
        const val CODIFICAR_ALTO_MS = 40L
        const val CODIFICAR_BAJO_MS = 20L
        const val CALIDAD_MIN = 40
        fun calidadAdaptada(actual: Int, pedida: Int, mediaMs: Long): Int = when {
            mediaMs > CODIFICAR_ALTO_MS -> maxOf(minOf(CALIDAD_MIN, pedida), actual - 5)
            mediaMs < CODIFICAR_BAJO_MS -> minOf(pedida, actual + 5)
            else -> actual
        }
        const val SIN_USAR_MS = 60_000L  // con el «Sí» dado pero sin pedir la pantalla, se suelta
    }

    private val principal = Handler(Looper.getMainLooper())
    private var proy: MediaProjection? = null
    private var pantalla: VirtualDisplay? = null
    private var lector: ImageReader? = null
    private var hilo: HandlerThread? = null
    private var trabajo: Handler? = null
    @Volatile private var capturando = false
    @Volatile private var deteniendo = false
    private var lado = 1280
    private var calidad = 60
    private var ultimo = 0L
    private var reintento = false
    private var calidadPedida = 60
    private var mediaCodificarMs = 0L
    private var cuadrosMedidos = 0
    private var reuso: Bitmap? = null
    private val bufer = ByteArrayOutputStream(96 * 1024)
    private var ancho = 0
    private var alto = 0
    private var dpi = 320
    private var desde = 0L
    private val apagada = object : BroadcastReceiver() { override fun onReceive(c: Context?, i: Intent?) { detener() } }

    override fun onBind(i: Intent?): IBinder? = null

    fun capturandoAhora(): Boolean = capturando && !deteniendo

    override fun onStartCommand(i: Intent?, flags: Int, id: Int): Int {
        if (i == null || i.action == PARAR) { detener(); return START_NOT_STICKY }
        val codigo = i.getIntExtra("codigo", Activity.RESULT_CANCELED)
        @Suppress("DEPRECATION")
        val datos: Intent? = if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra("datos", Intent::class.java) else i.getParcelableExtra("datos")
        val token = i.getStringExtra("sesion")
        try {
            if (codigo != Activity.RESULT_OK || datos == null || token == null || token != ControlNeuronasNativo.sesion || !ControlNeuronasNativo.mostrando) { detener(); return START_NOT_STICKY }
            crearCanal()
            // Android 14+: primero el servicio en primer plano con su tipo, DESPUÉS la proyección.
            if (Build.VERSION.SDK_INT >= 29) startForeground(ID, notificacion(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION) else startForeground(ID, notificacion())
            val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            val p = mpm.getMediaProjection(codigo, datos) ?: throw IllegalStateException("el sistema no dio la proyección")
            // Android 14+: la devolución de llamada va ANTES de crear la pantalla virtual; onStop = «Dejar de compartir» del chip de Android.
            p.registerCallback(object : MediaProjection.Callback() { override fun onStop() { principal.post { detener() } } }, principal)
            proy = p
            val f = IntentFilter(Intent.ACTION_SCREEN_OFF)
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(apagada, f, Context.RECEIVER_NOT_EXPORTED) else registerReceiver(apagada, f)
            desde = System.currentTimeMillis()
            ProyeccionPantalla.servicio = this
            ProyeccionPantalla.consentidaPara = token
            principal.postDelayed(vigia, 1000L)
        } catch (_: Throwable) { detener() }
        return START_NOT_STICKY
    }

    /** Cada segundo: sin sesión a la vista, con la pantalla bloqueada o sin usar tras el «Sí», se suelta todo. */
    private val vigia = object : Runnable {
        override fun run() {
            if (deteniendo) return
            val bloqueada = try { (getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked } catch (_: Throwable) { false }
            val sinSesion = !ControlNeuronasNativo.encendido() || !ControlNeuronasNativo.mostrando || ControlNeuronasNativo.sesion != ProyeccionPantalla.consentidaPara
            val ociosa = !capturando && System.currentTimeMillis() - desde > SIN_USAR_MS
            if (bloqueada || sinSesion || ociosa) detener() else principal.postDelayed(this, 1000L)
        }
    }

    private fun escalado(m: IntArray): IntArray {
        // La MISMA cuenta que `escalar` de control_entrada_logica.rs: lado mayor = lado_max, sin ampliar, lados pares >= 2.
        val tope = lado.coerceIn(160, 2048)
        val k = if (maxOf(m[0], m[1]) <= tope) 1.0 else tope.toDouble() / maxOf(m[0], m[1])
        fun par(v: Int) = maxOf(2, Math.round(v * k).toInt() and 1.inv())
        return intArrayOf(par(m[0]), par(m[1]))
    }

    /** `pantalla-iniciar` con `fuente: "proyeccion"` y el «Sí» de esta sesión: crea la pantalla virtual. */
    fun empezar(ladoMax: Int, calidadJpeg: Int): JSONObject {
        val p = proy ?: return JSONObject().put("ok", false).put("motivo", "sin-consentimiento").put("falta", JSONArray().put("consentimiento-proyeccion"))
        lado = ladoMax
        calidad = calidadJpeg.coerceIn(20, 95)
        calidadPedida = calidad
        mediaCodificarMs = 0L
        cuadrosMedidos = 0
        val m = ControlEntradaNativo.medidas()
        if (!capturando) {
            try {
                File(ControlEntradaNativo.carpeta(), ControlEntradaNativo.CUADRO).delete()
                hilo = HandlerThread("starseed-proyeccion").also { it.start() }
                trabajo = Handler(hilo!!.looper)
                dpi = resources.displayMetrics.densityDpi
                val e = escalado(m)
                ancho = e[0]; alto = e[1]
                val r = ImageReader.newInstance(ancho, alto, PixelFormat.RGBA_8888, 2)
                r.setOnImageAvailableListener({ cuadro(it) }, trabajo)
                lector = r
                pantalla = p.createVirtualDisplay("starseed-control", ancho, alto, dpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, r.surface, null, trabajo)
                if (pantalla == null) throw IllegalStateException("sin-pantalla-virtual")
                capturando = true
                desde = System.currentTimeMillis()
            } catch (_: Throwable) {
                detener()
                return JSONObject().put("ok", false).put("motivo", "sin-servicio")
            }
        }
        return JSONObject().put("ok", true).put("fuente", "proyeccion").put("ancho", ancho).put("alto", alto).put("giro", m[2])
    }

    /** Hilo de trabajo: gira la pantalla virtual si el aparato giró, y publica el cuadro más nuevo (nunca una cola). */
    private fun cuadro(l: ImageReader) {
        if (!capturando || deteniendo || l !== lector) return
        val e = escalado(ControlEntradaNativo.medidas())
        if (e[0] != ancho || e[1] != alto) { girar(e); return } // el siguiente cuadro llega por el lector nuevo, ya derecho
        val falta = ENTRE_CUADROS_MS - (System.currentTimeMillis() - ultimo)
        if (falta > 0) { // sin acquire: el cuadro espera en el lector (el más nuevo reemplaza al viejo) y se mira al acabar el plazo
            if (!reintento) { reintento = true; trabajo?.postDelayed({ reintento = false; cuadro(l) }, falta) }
            return
        }
        if (!ControlNeuronasNativo.mostrando) { principal.post { detener() }; return }
        // FSG1116 · M2: en pausa (o bloqueada) no se escribe ningún cuadro; el lector suelta el suyo.
        if (!ControlEntradaNativo.puedePublicarCuadro()) { try { l.acquireLatestImage()?.close() } catch (_: Throwable) {}; ControlEntradaNativo.borrarCuadro(); return }
        val img = (try { l.acquireLatestImage() } catch (_: Throwable) { null }) ?: return
        try {
            ultimo = System.currentTimeMillis()
            val pl = img.planes[0]
            val fila = pl.rowStride / pl.pixelStride
            // CTL1118F: el Bitmap y el búfer del JPEG se reutilizan (antes: ~3,5 MB nuevos por cuadro) mientras no cambie el tamaño.
            var bmp = reuso
            if (bmp == null || bmp.isRecycled || bmp.width != fila || bmp.height != img.height) {
                bmp?.recycle()
                bmp = Bitmap.createBitmap(fila, img.height, Bitmap.Config.ARGB_8888)
                reuso = bmp
            }
            bmp.copyPixelsFromBuffer(pl.buffer)
            val recto = if (fila == img.width) bmp else Bitmap.createBitmap(bmp, 0, 0, img.width, img.height)
            bufer.reset()
            recto.compress(Bitmap.CompressFormat.JPEG, calidad, bufer)
            if (recto !== bmp) recto.recycle()
            publicar(img.width, img.height, bufer.toByteArray())
            // CTL1118F: lo que costó este cuadro (copiar + JPEG + escribir) manda la calidad de los siguientes.
            val ms = System.currentTimeMillis() - ultimo
            mediaCodificarMs = if (cuadrosMedidos == 0) ms else (mediaCodificarMs * 7 + ms) / 8
            cuadrosMedidos++
            if (cuadrosMedidos % 10 == 0) calidad = calidadAdaptada(calidad, calidadPedida, mediaCodificarMs)
        } catch (_: Throwable) { /* un cuadro perdido; sigue el siguiente */ } finally { img.close() }
    }

    private fun girar(e: IntArray) {
        try {
            val nuevo = ImageReader.newInstance(e[0], e[1], PixelFormat.RGBA_8888, 2)
            nuevo.setOnImageAvailableListener({ cuadro(it) }, trabajo)
            pantalla?.resize(e[0], e[1], dpi)
            pantalla?.surface = nuevo.surface
            val viejo = lector
            lector = nuevo
            ancho = e[0]; alto = e[1]
            viejo?.close()
        } catch (_: Throwable) { principal.post { detener() } }
    }

    /** `cuadro.bin` = 12 bytes (u32 nº, u16 ancho, u16 alto, u16 giro, u16 cero; little endian) + el JPEG. Un archivo, reemplazo atómico. */
    private fun publicar(w: Int, h: Int, jpeg: ByteArray) {
        val numero = ControlEntradaNativo.numeroCuadro() // CTL1118F: numeración única de la sesión (también la de accesibilidad)
        val giro = ControlEntradaNativo.medidas()[2]
        val c = ByteArray(12)
        for (i in 0 until 4) c[i] = ((numero ushr (8 * i)) and 0xFF).toByte()
        c[4] = (w and 0xFF).toByte(); c[5] = ((w shr 8) and 0xFF).toByte()
        c[6] = (h and 0xFF).toByte(); c[7] = ((h shr 8) and 0xFF).toByte()
        c[8] = (giro and 0xFF).toByte(); c[9] = ((giro shr 8) and 0xFF).toByte()
        val d = ControlEntradaNativo.carpeta()
        val tmp = File(d, ".${ControlEntradaNativo.CUADRO}.tmp")
        try {
            tmp.outputStream().use { it.write(c); it.write(jpeg) }
            tmp.renameTo(File(d, ControlEntradaNativo.CUADRO))
            ControlEntradaNativo.ultimoCuadroMs = System.currentTimeMillis() // CTL1117F
        } catch (_: Exception) {}
        if (!capturando || deteniendo) ControlEntradaNativo.borrarCuadro() // FSG1116 · M3: detener() llegó mientras se escribía
    }

    /** Suelta TODO: pantalla virtual, lector, proyección, notificación y el consentimiento de esta sesión. */
    fun detener() {
        if (deteniendo) return
        deteniendo = true
        val hacia = capturando
        // Una sesión nueva puede haber arrancado otra proyección antes de que esta termine de soltarse.
        // En ese caso esta solo libera lo suyo: no le borra el consentimiento, ni el cuadro, ni le
        // arranca la accesibilidad por debajo.
        val eraActual = ProyeccionPantalla.servicio === this
        capturando = false
        principal.removeCallbacks(vigia)
        try { unregisterReceiver(apagada) } catch (_: Throwable) {}
        try { pantalla?.release() } catch (_: Throwable) {}
        try { lector?.close() } catch (_: Throwable) {}
        try { proy?.stop() } catch (_: Throwable) {}
        pantalla = null; lector = null; proy = null
        try { reuso?.recycle() } catch (_: Throwable) {}
        reuso = null
        hilo?.quitSafely()
        hilo = null; trabajo = null
        if (hacia && eraActual) File(ControlEntradaNativo.carpeta(), ControlEntradaNativo.CUADRO).delete()
        if (eraActual) ProyeccionPantalla.consentidaPara = null
        if (eraActual) ProyeccionPantalla.servicio = null
        // CTL1118F: si la proyección se cortó con la sesión aún a la vista y la pantalla pedida, la accesibilidad toma el relevo (no se cierra nada ni se vuelve a preguntar).
        if (hacia && eraActual) principal.post { try { ControlEntradaNativo.volverAAccesibilidad() } catch (_: Throwable) {} }
        try { if (Build.VERSION.SDK_INT >= 24) stopForeground(Service.STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true) } catch (_: Throwable) {}
        stopSelf()
    }

    override fun onDestroy() {
        detener()
        super.onDestroy()
    }

    private fun crearCanal() {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CANAL) != null) return
        nm.createNotificationChannel(NotificationChannel(CANAL, "Compartir la pantalla", NotificationManager.IMPORTANCE_LOW))
    }

    private fun notificacion(): Notification {
        val parar = PendingIntent.getService(this, 1, Intent(this, ServicioProyeccionPantalla::class.java).setAction(PARAR), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CANAL) else Notification.Builder(this)
        return b.setContentTitle("Compartiendo la pantalla")
            .setContentText("Otra neurona de tu cuenta ve esta pantalla durante esta sesión de control.")
            .setSmallIcon(applicationInfo.icon)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(null as Icon?, "Dejar de compartir", parar).build())
            .build()
    }
}
