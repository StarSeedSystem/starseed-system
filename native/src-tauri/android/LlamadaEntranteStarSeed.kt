// Lo copia native/src-tauri/build.rs en el proyecto Android que genera Tauri (no editar allí).
// La llamada entrante que suena, despierta la pantalla y abre su ventana (LLA1108F). Contrato: architecture/llamadas-telefonia.md § 8.5.
package app.starseed.nativa

import android.app.Activity
import android.app.AlertDialog
import android.app.NotificationManager
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Calendar

/**
 * Los silencios («Ignorar»/«Silenciar…») leídos y escritos desde Kotlin: el mismo `silencios-llamadas.json` que Rust
 * fusiona con la web. Así la llamada suena o calla aunque el JS esté congelado. Misma regla que
 * `src/lib/llamadas/silencio-llamadas.ts` y `llamada_entrante_logica.rs`: gana el `mod` más reciente y quitar deja lápida.
 */
object SilenciosLlamada {
    const val ARCHIVO = "silencios-llamadas.json"
    const val SIN_FIN = Long.MAX_VALUE / 2
    private const val VIDA_LAPIDA_MS = 24L * 3_600_000L
    private const val TOPE = 100

    class Item(val id: String, val ambito: String, val clave: String, val etiqueta: String, val hasta: Long?, val creado: Long, val mod: Long, val quitado: Boolean)

    private fun archivo(ctx: Context) = File(LlamadaNativa.dir(ctx), ARCHIVO)

    @Synchronized
    fun leer(ctx: Context): List<Item> {
        return try {
            val a = JSONObject(archivo(ctx).readText()).optJSONArray("silencios") ?: return emptyList()
            val fuera = ArrayList<Item>()
            for (k in 0 until a.length()) {
                val x = a.optJSONObject(k) ?: continue
                val id = x.optString("id")
                val ambito = x.optString("ambito")
                val clave = x.optString("clave")
                if (id.isEmpty() || clave.isEmpty() || ambito !in listOf("persona", "neurona", "chat", "medio", "todas")) continue
                val hasta = if (x.isNull("hasta") || !x.has("hasta")) null else x.optLong("hasta")
                fuera.add(Item(id, ambito, clave, x.optString("etiqueta", clave), hasta, x.optLong("creado"), x.optLong("mod"), x.optBoolean("quitado", false)))
            }
            fuera
        } catch (e: Exception) {
            emptyList()
        }
    }

    @Synchronized
    private fun escribir(ctx: Context, lista: List<Item>) {
        val ahora = System.currentTimeMillis()
        val util = lista.filter { if (it.quitado) ahora - it.mod < VIDA_LAPIDA_MS else (it.hasta == null || ahora - it.hasta < VIDA_LAPIDA_MS) }
            .sortedByDescending { it.mod }.take(TOPE)
        val a = JSONArray()
        for (i in util) {
            a.put(JSONObject().put("id", i.id).put("ambito", i.ambito).put("clave", i.clave).put("etiqueta", i.etiqueta)
                .put("hasta", i.hasta ?: JSONObject.NULL).put("creado", i.creado).put("mod", i.mod).put("quitado", i.quitado))
        }
        try {
            val d = archivo(ctx)
            val tmp = File(d.parentFile, "$ARCHIVO.tmp")
            tmp.writeText(JSONObject().put("v", 1).put("silencios", a).toString())
            if (!tmp.renameTo(d)) tmp.delete()
        } catch (e: Exception) {
            // Sin disco, el silencio vale solo en la web.
        }
    }

    fun vigente(i: Item, ahora: Long) = !i.quitado && (i.hasta == null || i.hasta > ahora)

    /** El silencio vigente que cubre la llamada (el que dura más), o null si suena. */
    fun quienCubre(ctx: Context, uid: String, neurona: String, chat: String, medio: String): Item? {
        val ahora = System.currentTimeMillis()
        var mejor: Item? = null
        for (s in leer(ctx)) {
            if (!vigente(s, ahora)) continue
            val cubre = when (s.ambito) {
                "todas" -> true
                "persona" -> uid.isNotEmpty() && s.clave == uid
                "neurona" -> neurona.isNotEmpty() && s.clave == neurona
                "chat" -> chat.isNotEmpty() && s.clave == chat
                "medio" -> medio.isNotEmpty() && s.clave == medio
                else -> false
            }
            if (!cubre) continue
            val m = mejor
            if (m == null || (m.hasta != null && (s.hasta == null || s.hasta > m.hasta))) mejor = s
        }
        return mejor
    }

    fun hastaDe(duracion: String, ahora: Long): Long? = when (duracion) {
        "15m" -> ahora + 15 * 60_000L
        "1h" -> ahora + 3_600_000L
        "8h" -> ahora + 8 * 3_600_000L
        "manana" -> Calendar.getInstance().apply {
            timeInMillis = ahora
            add(Calendar.DAY_OF_YEAR, 1)
            set(Calendar.HOUR_OF_DAY, 8)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis
        else -> null
    }

    fun agregar(ctx: Context, ambito: String, clave: String, etiqueta: String, hasta: Long?): Item {
        val ahora = System.currentTimeMillis()
        val nuevo = Item("$ambito:$clave", ambito, clave, etiqueta, hasta, ahora, ahora, false)
        escribir(ctx, leer(ctx).filter { it.id != nuevo.id } + nuevo)
        return nuevo
    }

    fun quitar(ctx: Context, id: String) {
        val ahora = System.currentTimeMillis()
        escribir(ctx, leer(ctx).map { if (it.id == id && !it.quitado) Item(it.id, it.ambito, it.clave, it.etiqueta, it.hasta, it.creado, ahora, true) else it })
    }

    /** «hasta 18:30», «hasta mañana 08:00» o «hasta que lo reactives». */
    fun textoHasta(hasta: Long): String {
        if (hasta >= 1_000_000_000_000_000L) return "hasta que lo reactives"
        val f = Calendar.getInstance().apply { timeInMillis = hasta }
        val a = Calendar.getInstance()
        val hora = String.format("%02d:%02d", f.get(Calendar.HOUR_OF_DAY), f.get(Calendar.MINUTE))
        return if (f.get(Calendar.YEAR) == a.get(Calendar.YEAR) && f.get(Calendar.DAY_OF_YEAR) == a.get(Calendar.DAY_OF_YEAR)) "hasta $hora" else "hasta mañana $hora"
    }
}

/** El timbre propio de la llamada: tono del teléfono, vibración y pantalla encendida, respetando silencio y No molestar. */
object TimbreLlamada {
    private val principal = Handler(Looper.getMainLooper())
    private var tono: Ringtone? = null
    private var vibrador: Vibrator? = null
    private var despertador: PowerManager.WakeLock? = null
    private val repetir = object : Runnable {
        override fun run() {
            val t = tono ?: return
            try {
                if (!t.isPlaying) t.play()
            } catch (e: Exception) {
                // El tono no se puede repetir: queda la vibración.
            }
            principal.postDelayed(this, 1500)
        }
    }

    /** ¿No molestar deja pasar las llamadas? (sin él, silencio total y alarmas: no; prioritarias: según su ajuste). */
    private fun permiteLlamadas(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT < 23) return true
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return true
        return when (nm.currentInterruptionFilter) {
            NotificationManager.INTERRUPTION_FILTER_NONE, NotificationManager.INTERRUPTION_FILTER_ALARMS -> false
            NotificationManager.INTERRUPTION_FILTER_PRIORITY -> (nm.notificationPolicy.priorityCategories and NotificationManager.Policy.PRIORITY_CATEGORY_CALLS) != 0
            else -> true
        }
    }

    /** Suena el tono por defecto del teléfono (con su volumen de llamada) y vibra, salvo silencio o No molestar. */
    fun sonar(ctx: Context) {
        parar()
        try {
            val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (!permiteLlamadas(ctx) || am.ringerMode == AudioManager.RINGER_MODE_SILENT) return
            if (am.ringerMode == AudioManager.RINGER_MODE_NORMAL) {
                val t = RingtoneManager.getRingtone(ctx, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))
                if (t != null) {
                    t.audioAttributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
                    tono = t
                    t.play()
                    principal.postDelayed(repetir, 1500)
                }
            }
            vibrar(ctx)
        } catch (e: Exception) {
            // Sin tono: queda el aviso emergente.
        }
    }

    @Suppress("DEPRECATION")
    private fun vibrar(ctx: Context) {
        try {
            val v = if (Build.VERSION.SDK_INT >= 31) (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            else ctx.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            val patron = longArrayOf(0, 700, 500, 700, 1200)
            if (Build.VERSION.SDK_INT >= 26) {
                // Con atributos de timbre: Android deja vibrar a una app que no está a la vista.
                v.vibrate(VibrationEffect.createWaveform(patron, 0), AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build())
            } else {
                v.vibrate(patron, 0)
            }
            vibrador = v
        } catch (e: Exception) {
            // Sin vibrador.
        }
    }

    fun parar() {
        principal.removeCallbacks(repetir)
        try {
            tono?.stop()
        } catch (e: Exception) {
            // Ya estaba parado.
        }
        tono = null
        try {
            vibrador?.cancel()
        } catch (e: Exception) {
            // Ya estaba parada.
        }
        vibrador = null
    }

    /** Pantalla apagada: la enciende unos segundos (respaldo si Android no deja la pantalla completa). */
    @Suppress("DEPRECATION")
    fun despertar(ctx: Context) {
        try {
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
            if (pm.isInteractive) return
            val w = despertador ?: pm.newWakeLock(PowerManager.FULL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE, "starseed:llamada-despertar").also {
                it.setReferenceCounted(false)
                despertador = it
            }
            w.acquire(10_000L)
        } catch (e: Exception) {
            // Sin permiso o sin soporte: queda el aviso emergente.
        }
    }
}

/** Lo que enseña la ventana de la llamada entrante. */
class DatosEntrante(
    val id: String,
    val nombre: String,
    val iniciales: String,
    val video: Boolean,
    val medioTexto: String
)

/**
 * La ventana de la llamada entrante: sobre el bloqueo, enciende la pantalla y enseña quién llama, el tipo, el medio y
 * Contestar, Rechazar, Ignorar, Responder con mensaje y Silenciar…. Se abre por la pantalla completa del aviso. Con «Contestar»
 * desde el aviso (sin ventana) solo cuenta la respuesta y abre la app.
 */
class ActividadLlamadaStarSeed : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        @Suppress("DEPRECATION")
        window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD)
        val accion = intent?.getStringExtra(LlamadaNativa.EXTRA_ACCION)
        if (accion == "contestar") {
            LlamadaNativa.contestarDesdeUi(this)
            finish()
            return
        }
        val d = LlamadaNativa.datosEntrante()
        if (d == null) {
            // No hay llamada sonando (un aviso de llamada en curso, o ya acabó): se abre la app tal cual.
            LlamadaNativa.abrirApp(this)
            finish()
            return
        }
        LlamadaNativa.ponerUi(this)
        setContentView(construir(d))
        if (accion == "silenciar") menuSilenciar()
    }

    override fun onDestroy() {
        LlamadaNativa.quitarUi(this)
        super.onDestroy()
    }

    fun cerrar() {
        runOnUiThread { if (!isFinishing) finish() }
    }

    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()

    private fun fondo(color: Int, radio: Int) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(radio).toFloat()
    }

    private fun texto(t: String, sp: Float, color: Int, negrita: Boolean = false) = TextView(this).apply {
        text = t
        textSize = sp
        setTextColor(color)
        gravity = Gravity.CENTER
        if (negrita) setTypeface(typeface, Typeface.BOLD)
    }

    private fun boton(t: String, color: Int, alPulsar: () -> Unit) = texto(t, 16f, Color.WHITE, true).apply {
        background = fondo(color, 28)
        setPadding(dp(8), dp(16), dp(8), dp(16))
        isClickable = true
        setOnClickListener { alPulsar() }
    }

    private fun construir(d: DatosEntrante): View {
        val raiz = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(56), dp(24), dp(32))
            background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(0xFF0C0E22.toInt(), 0xFF1B1442.toInt()))
        }
        raiz.addView(texto(if (d.video) "VIDEOLLAMADA ENTRANTE" else "LLAMADA DE VOZ ENTRANTE", 12f, 0x99FFFFFF.toInt(), true))
        val avatar = texto(d.iniciales, 34f, Color.WHITE, true).apply { background = fondo(0xFF7C5CFF.toInt(), 60) }
        raiz.addView(avatar, LinearLayout.LayoutParams(dp(120), dp(120)).apply { topMargin = dp(36); bottomMargin = dp(20) })
        raiz.addView(texto(d.nombre, 28f, Color.WHITE, true))
        raiz.addView(texto(d.medioTexto, 15f, 0xB3FFFFFF.toInt()), LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(6) })
        raiz.addView(View(this), LinearLayout.LayoutParams(1, 0, 1f))
        val extra = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        extra.addView(boton("Responder con mensaje", 0x22FFFFFF) { menuMensajes() }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { rightMargin = dp(8) })
        extra.addView(boton("Silenciar…", 0x22FFFFFF) { menuSilenciar() }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        raiz.addView(extra, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(16) })
        val fila = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        fila.addView(boton("Rechazar", 0xFFDC143C.toInt()) { LlamadaNativa.rechazarDesdeUi(this) }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { rightMargin = dp(8) })
        fila.addView(boton("Ignorar", 0x33FFFFFF) { LlamadaNativa.ignorarDesdeUi(this) }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { rightMargin = dp(8) })
        fila.addView(boton("Contestar", 0xFF10B981.toInt()) { LlamadaNativa.contestarDesdeUi(this) }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        raiz.addView(fila, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        return raiz
    }

    private fun menuMensajes() {
        val opciones = arrayOf("No puedo contestar ahora.", "Te llamo en un rato.", "¿Me escribes?")
        AlertDialog.Builder(this).setTitle("Responder con mensaje").setItems(opciones) { _, i -> LlamadaNativa.mensajeRapidoDesdeUi(this, opciones[i]) }.show()
    }

    private fun menuSilenciar() {
        val ambitos = LlamadaNativa.ambitosSilencio()
        AlertDialog.Builder(this).setTitle("Silenciar llamadas de…").setItems(ambitos.map { it.second }.toTypedArray()) { _, i ->
            val duraciones = arrayOf("15 minutos" to "15m", "1 hora" to "1h", "8 horas" to "8h", "Hasta mañana" to "manana", "Hasta que lo reactive" to "siempre")
            AlertDialog.Builder(this).setTitle("¿Cuánto tiempo?").setItems(duraciones.map { it.first }.toTypedArray()) { _, j ->
                LlamadaNativa.silenciarDesdeUi(this, ambitos[i].first, duraciones[j].second)
            }.show()
        }.show()
    }
}
