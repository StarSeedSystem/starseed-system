// Lo copia native/src-tauri/build.rs en el proyecto Android que genera Tauri (no editar allí).
// Llamadas de StarSeed como llamadas del teléfono (LLA1108D). Contrato: architecture/llamadas-telefonia.md.
package app.starseed.nativa

import android.app.Activity
import android.app.Application
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Person
import android.app.Service
import android.content.BroadcastReceiver
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.database.Cursor
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.FileObserver
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.telecom.CallAudioState
import android.telecom.CallEndpoint
import android.telecom.CallEndpointException
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.lang.ref.WeakReference

/** Arranca la parte Android de las llamadas al crearse el proceso, antes que la actividad. */
class ArranqueLlamadaNativa : ContentProvider() {
    override fun onCreate(): Boolean {
        val app = context?.applicationContext ?: return true
        LlamadaNativa.iniciar(app)
        return true
    }

    override fun query(uri: Uri, projection: Array<String>?, selection: String?, selectionArgs: Array<String>?, sortOrder: String?): Cursor? = null

    override fun getType(uri: Uri): String? = null

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<String>?): Int = 0

    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<String>?): Int = 0
}

/**
 * La llamada de StarSeed como llamada del teléfono. Rust (llamada_nativa.rs) deja peticiones
 * `peticion-<n>.json` en filesDir/starseed/llamada-nativa; aquí se atienden en orden y se contesta con
 * `estado.json` (lo de ahora y los últimos eventos con número creciente).
 *   · Telecom autogestionado: la llamada es real para Android (foco de audio, botones de auriculares
 *     Bluetooth, prioridad sobre la música, rutas de audio). Si Android no la acepta, todo lo demás sigue.
 *   · Aviso: CallStyle (Android 12+) con Contestar/Rechazar y pantalla completa sobre el bloqueo (Android 14+
 *     pide permiso: sin él llega como aviso emergente); en curso, con Colgar y Silenciar.
 *   · Servicio en primer plano `phoneCall` (+ micrófono/cámara al contestar) para que la llamada viva con la
 *     pantalla apagada o la app atrás.
 *   · Proximidad: con voz, auricular y llamada activa, el sensor apaga la pantalla junto a la cara.
 * Solo se usan API protegidas con `Build.VERSION.SDK_INT`.
 */
object LlamadaNativa : Application.ActivityLifecycleCallbacks {
    const val CARPETA = "llamada-nativa"
    const val PREFIJO_PETICION = "peticion-"
    const val ESTADO = "estado.json"
    const val CANAL_ENTRANTE = "starseed-llamada-entrante"
    const val CANAL_CURSO = "starseed-llamada-en-curso"
    const val ID_AVISO = 47081
    const val EXTRA_ACCION = "starseed_llamada_accion"
    const val ACCION_RECHAZAR = "app.starseed.llamada.RECHAZAR"
    const val ACCION_COLGAR = "app.starseed.llamada.COLGAR"
    const val ACCION_SILENCIAR = "app.starseed.llamada.SILENCIAR"
    private const val CUENTA = "starseed-llamadas"
    private const val ESPERA_FIN_MS = 5000L
    private const val TOPE_EVENTOS = 32

    private var ctxApp: Context? = null
    private var iniciado = false
    private var actual: WeakReference<Activity>? = null
    private var observador: FileObserver? = null
    private val principal = Handler(Looper.getMainLooper())
    private val epoca = System.currentTimeMillis()

    // La llamada (una a la vez).
    private var id: String? = null
    private var nombre: String = ""
    private var tipo: String = "voz"
    private var entrante: Boolean = false
    private var fase: String = "inactiva"
    private var silenciada = false
    private var ruta = "auricular"
    private var rutas: List<String> = listOf("auricular", "altavoz")
    private var rutaInicialPuesta = false
    private var proximidadWeb = true
    private var proximidadOn = false
    private var inicioMs = 0L
    private var rechazoPedido = false

    private var telecomListo = false
    private var conexion: ConexionStarSeed? = null
    private var puntos: List<Any> = emptyList()
    private var servicioVivo = false
    private var foco: AudioFocusRequest? = null
    private var bloqueoProximidad: PowerManager.WakeLock? = null

    private var contador = 0L
    private val eventos = ArrayList<JSONObject>()

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
        (ctx as? Application)?.registerActivityLifecycleCallbacks(this)
        // Una vida nueva del proceso: lo que quedara de otra no vale.
        dir(ctx).listFiles()?.forEach { if (it.name.startsWith(PREFIJO_PETICION) || it.name == ESTADO) it.delete() }
        crearCanales(ctx)
        telecomListo = registrarCuenta(ctx)
        escribirEstado()
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

    // ─── Peticiones de Rust ───

    private fun atenderCola() {
        val ctx = ctxApp ?: return
        val archivos = dir(ctx).listFiles { f -> f.name.startsWith(PREFIJO_PETICION) && f.name.endsWith(".json") }?.sortedBy { it.name } ?: return
        for (f in archivos) {
            val p = try {
                JSONObject(f.readText())
            } catch (e: Exception) {
                null
            }
            f.delete()
            if (p != null) {
                try {
                    ejecutar(ctx, p)
                } catch (e: Exception) {
                    // Una petición rota no tumba la cola ni la llamada.
                }
            }
        }
        escribirEstado()
    }

    private fun ejecutar(ctx: Context, p: JSONObject) {
        when (p.optString("accion")) {
            "iniciar" -> comenzar(ctx, p)
            "estado" -> cambiarEstado(ctx, p)
            "ruta" -> fijarRuta(ctx, p.optString("ruta"))
            "proximidad" -> {
                proximidadWeb = p.optBoolean("activa", true)
                evaluarProximidad(ctx)
            }
            "permiso" -> pedirPantallaCompleta(ctx)
        }
    }

    private fun comenzar(ctx: Context, p: JSONObject) {
        val nuevo = p.optString("id")
        if (nuevo.isEmpty()) return
        if (id != null && id != nuevo && fase != "inactiva") return
        if (id == nuevo && fase != "inactiva") return
        id = nuevo
        nombre = p.optString("nombre", "StarSeed")
        tipo = p.optString("tipo", "voz")
        entrante = p.optBoolean("entrante", false)
        fase = "sonando"
        silenciada = false
        rechazoPedido = false
        rutaInicialPuesta = false
        inicioMs = 0L
        ruta = "auricular"
        rutas = rutasSinTelecom(ctx)
        solicitarTelecom(ctx)
        actualizarAviso(ctx)
    }

    private fun cambiarEstado(ctx: Context, p: JSONObject) {
        if (p.optString("id") != id) return
        if (p.has("silenciada")) silenciada = p.optBoolean("silenciada")
        when (p.optString("estado")) {
            "activa" -> {
                fase = "activa"
                if (inicioMs == 0L) inicioMs = System.currentTimeMillis()
                conexion?.setActive()
                pedirFoco(ctx)
                if (!telecomListo || conexion == null) modoComunicacion(ctx, true)
                if (!rutaInicialPuesta) {
                    rutaInicialPuesta = true
                    // La videollamada empieza en el altavoz (se mira la pantalla, no se pega al oído).
                    if (tipo == "video") fijarRuta(ctx, "altavoz")
                }
                evaluarProximidad(ctx)
                actualizarAviso(ctx)
            }
            "en-espera" -> {
                fase = "en-espera"
                conexion?.setOnHold()
                evaluarProximidad(ctx)
                actualizarAviso(ctx)
            }
            "terminada" -> terminarNativo(ctx)
        }
    }

    /** Cierra todo lo nativo de la llamada: Telecom, foco, proximidad, servicio y aviso. */
    private fun terminarNativo(ctx: Context) {
        val c = conexion
        if (c != null) {
            val causa = when {
                entrante && fase == "sonando" && rechazoPedido -> DisconnectCause.REJECTED
                entrante && fase == "sonando" -> DisconnectCause.MISSED
                else -> DisconnectCause.LOCAL
            }
            try {
                c.setDisconnected(DisconnectCause(causa))
                c.destroy()
            } catch (e: Exception) {
                // Ya estaba cerrada.
            }
        }
        conexion = null
        soltarFoco(ctx)
        modoComunicacion(ctx, false)
        fase = "inactiva"
        evaluarProximidad(ctx)
        id = null
        silenciada = false
        servicioVivo = false
        try {
            ctx.stopService(Intent(ctx, ServicioLlamadaStarSeed::class.java))
        } catch (e: Exception) {
            // Sin servicio que parar.
        }
        (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager)?.cancel(ID_AVISO)
        actual?.get()?.let { quitarBanderasPantalla(it) }
        escribirEstado()
    }

    // ─── Eventos hacia Rust ───

    @Synchronized
    fun evento(tipoEvento: String, valor: Any?) {
        contador += 1
        val e = JSONObject().put("n", contador).put("tipo", tipoEvento).put("id", id ?: "")
        if (valor != null) e.put("valor", valor)
        eventos.add(e)
        while (eventos.size > TOPE_EVENTOS) eventos.removeAt(0)
        val ctx = ctxApp
        if (ctx != null) {
            if (tipoEvento == "rechazar") rechazoPedido = true
            escribirEstado()
            // Si la web no contesta (cerrada, sin hilo), no se deja una llamada nativa colgada para siempre.
            if (tipoEvento == "colgar" || tipoEvento == "rechazar") {
                val ligada = id
                principal.postDelayed({
                    if (ligada != null && id == ligada) terminarNativo(ctx)
                }, ESPERA_FIN_MS)
            }
        }
    }

    /** Lo que llega de Telecom o del aviso (botón de auriculares, «Contestar»…): se cuenta a la web. */
    fun desdeSistema(tipoEvento: String, valor: Any?) {
        principal.post {
            if (tipoEvento == "silenciar" && valor == null) {
                silenciada = !silenciada
                evento("silenciar", silenciada)
                ctxApp?.let { actualizarAviso(it) }
            } else {
                if (tipoEvento == "silenciar" && valor is Boolean) silenciada = valor
                evento(tipoEvento, valor)
                if (tipoEvento == "silenciar") ctxApp?.let { actualizarAviso(it) }
            }
        }
    }

    /** Un «contestar» que viene de Telecom (auriculares, coche): hace falta la app a la vista para el micrófono. */
    fun abrirAppActual() {
        principal.post { ctxApp?.let { abrirApp(it) } }
    }

    // ─── Estado para Rust ───

    @Synchronized
    private fun escribirEstado() {
        val ctx = ctxApp ?: return
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        val e = JSONObject()
            .put("version", 1)
            .put("epoca", epoca)
            .put("sdk", Build.VERSION.SDK_INT)
            .put("id", id ?: "")
            .put("fase", fase)
            .put("ruta", ruta)
            .put("rutas", JSONArray(rutas))
            .put("proximidad", proximidadOn)
            .put("silenciada", silenciada)
            .put("telecom", telecomListo)
            .put("notificaciones", nm?.areNotificationsEnabled() ?: false)
            .put("pantalla_completa", estadoPantallaCompleta(ctx))
            .put("sensor_proximidad", sensorProximidad(ctx))
            .put("eventos", JSONArray(eventos))
        try {
            val d = dir(ctx)
            val tmp = File(d, "$ESTADO.tmp")
            tmp.writeText(e.toString())
            if (!tmp.renameTo(File(d, ESTADO))) tmp.delete()
        } catch (x: Exception) {
            // Sin disco no hay puente: la web lo ve como «sin integración».
        }
    }

    private fun estadoPantallaCompleta(ctx: Context): String {
        if (Build.VERSION.SDK_INT < 34) return "no-aplica"
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        return if (nm?.canUseFullScreenIntent() == true) "concedido" else "denegado"
    }

    private fun puedePantallaCompleta(ctx: Context): Boolean = estadoPantallaCompleta(ctx) != "denegado"

    /** Android 14+: «Notificaciones a pantalla completa» es un ajuste especial; se abre su pantalla. */
    private fun pedirPantallaCompleta(ctx: Context) {
        if (Build.VERSION.SDK_INT < 34 || puedePantallaCompleta(ctx)) return
        val destino = Uri.parse("package:" + ctx.packageName)
        try {
            val i = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, destino)
            val a = actual?.get()
            if (a != null) a.startActivity(i) else ctx.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: Exception) {
            try {
                ctx.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, destino).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (e2: Exception) {
                // Sin pantalla de ajustes: la web explica dónde está.
            }
        }
    }

    // ─── Telecom autogestionado ───

    private fun cuenta(ctx: Context): PhoneAccountHandle =
        PhoneAccountHandle(android.content.ComponentName(ctx, ServicioConexionStarSeed::class.java), CUENTA)

    private fun registrarCuenta(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT < 26) return false
        return try {
            val tm = ctx.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager ?: return false
            val c = PhoneAccount.builder(cuenta(ctx), "StarSeed")
                .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
                .addSupportedUriScheme("starseed")
                .setShortDescription("Llamadas entre tus neuronas")
                .build()
            tm.registerPhoneAccount(c)
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun solicitarTelecom(ctx: Context) {
        if (!telecomListo) return
        try {
            val tm = ctx.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            val direccion = Uri.fromParts("starseed", id ?: "llamada", null)
            val extras = Bundle()
            if (entrante) {
                extras.putParcelable(TelecomManager.EXTRA_INCOMING_CALL_ADDRESS, direccion)
                tm.addNewIncomingCall(cuenta(ctx), extras)
            } else {
                extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, cuenta(ctx))
                tm.placeCall(direccion, extras)
            }
        } catch (e: Exception) {
            // Android no la acepta (otra llamada, sin permiso…): sigue con aviso, servicio y audio propios.
            telecomListo = false
        }
    }

    /** La llamada que Telecom pide crear; null si ya no hay ninguna. */
    fun crearConexion(ctx: Context, deEntrada: Boolean): Connection {
        val ident = id ?: return Connection.createFailedConnection(DisconnectCause(DisconnectCause.ERROR))
        val c = ConexionStarSeed(ident, nombre)
        if (deEntrada) c.setRinging() else c.setDialing()
        if (fase == "activa") c.setActive()
        conexion = c
        telecomListo = true
        principal.post { escribirEstado() }
        return c
    }

    fun telecomFallo() {
        telecomListo = false
        conexion = null
        principal.post { escribirEstado() }
    }

    // ─── Rutas de audio ───

    private fun rutaDeTipo(tipoPunto: Int): String? = when (tipoPunto) {
        1 -> "auricular"
        2 -> "bluetooth"
        3 -> "cableado"
        4 -> "altavoz"
        else -> null
    }

    private fun tipoDeRuta(r: String): Int = when (r) {
        "auricular" -> 1
        "bluetooth" -> 2
        "cableado" -> 3
        else -> 4
    }

    /** Android 14+: los puntos de audio de la llamada. */
    fun puntosCambiaron(lista: List<Any>) {
        puntos = lista
        val tipos = lista.mapNotNull { (it as? CallEndpoint)?.let { p -> rutaDeTipo(p.endpointType) } }.distinct()
        if (tipos.isNotEmpty()) rutas = tipos
        principal.post { escribirEstado() }
    }

    fun puntoActual(tipoPunto: Int) {
        val nueva = rutaDeTipo(tipoPunto) ?: return
        principal.post { cambioDeRuta(nueva) }
    }

    /** Antes de Android 14: `CallAudioState`. */
    @Suppress("DEPRECATION")
    fun estadoDeAudio(s: CallAudioState?) {
        if (s == null) return
        val nueva = when (s.route) {
            CallAudioState.ROUTE_BLUETOOTH -> "bluetooth"
            CallAudioState.ROUTE_SPEAKER -> "altavoz"
            CallAudioState.ROUTE_WIRED_HEADSET -> "cableado"
            else -> "auricular"
        }
        val m = s.supportedRouteMask
        val lista = ArrayList<String>()
        if (m and CallAudioState.ROUTE_EARPIECE != 0) lista.add("auricular")
        if (m and CallAudioState.ROUTE_SPEAKER != 0) lista.add("altavoz")
        if (m and CallAudioState.ROUTE_WIRED_HEADSET != 0) lista.add("cableado")
        if (m and CallAudioState.ROUTE_BLUETOOTH != 0) lista.add("bluetooth")
        principal.post {
            if (lista.isNotEmpty()) rutas = lista
            cambioDeRuta(nueva)
        }
    }

    private fun cambioDeRuta(nueva: String) {
        val ctx = ctxApp ?: return
        if (nueva == ruta) {
            escribirEstado()
            return
        }
        ruta = nueva
        evaluarProximidad(ctx)
        evento("ruta", nueva)
    }

    private fun rutasSinTelecom(ctx: Context): List<String> {
        val lista = arrayListOf("auricular", "altavoz")
        try {
            val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val salidas = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            if (salidas.any { it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET || it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES || it.type == AudioDeviceInfo.TYPE_USB_HEADSET }) lista.add("cableado")
            if (salidas.any { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO }) lista.add("bluetooth")
        } catch (e: Exception) {
            // Con auricular y altavoz basta.
        }
        return lista
    }

    @Suppress("DEPRECATION")
    private fun fijarRuta(ctx: Context, destino: String) {
        if (destino !in listOf("auricular", "altavoz", "cableado", "bluetooth")) return
        val c = conexion
        if (c != null) {
            try {
                if (Build.VERSION.SDK_INT >= 34 && puntos.isNotEmpty()) {
                    val p = puntos.mapNotNull { it as? CallEndpoint }.firstOrNull { it.endpointType == tipoDeRuta(destino) } ?: return
                    c.requestCallEndpointChange(p, { r -> principal.post(r) }, object : android.os.OutcomeReceiver<Void, CallEndpointException> {
                        override fun onResult(r: Void?) {}

                        override fun onError(e: CallEndpointException) {}
                    })
                } else {
                    c.setAudioRoute(
                        when (destino) {
                            "bluetooth" -> CallAudioState.ROUTE_BLUETOOTH
                            "altavoz" -> CallAudioState.ROUTE_SPEAKER
                            "cableado" -> CallAudioState.ROUTE_WIRED_HEADSET
                            else -> CallAudioState.ROUTE_EARPIECE
                        }
                    )
                }
            } catch (e: Exception) {
                // Android no aceptó el cambio: la ruta que vale es la que diga su callback.
            }
            return
        }
        // Sin Telecom: el audio lo encamina la propia app.
        try {
            val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (Build.VERSION.SDK_INT >= 31) {
                val quiere = when (destino) {
                    "altavoz" -> listOf(AudioDeviceInfo.TYPE_BUILTIN_SPEAKER)
                    "cableado" -> listOf(AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_USB_HEADSET)
                    "bluetooth" -> listOf(AudioDeviceInfo.TYPE_BLUETOOTH_SCO)
                    else -> listOf(AudioDeviceInfo.TYPE_BUILTIN_EARPIECE)
                }
                val d = am.availableCommunicationDevices.firstOrNull { it.type in quiere }
                if (d != null) am.setCommunicationDevice(d)
            } else {
                am.isSpeakerphoneOn = destino == "altavoz"
            }
            cambioDeRuta(destino)
        } catch (e: Exception) {
            // Sin cambio de ruta en este aparato.
        }
    }

    // ─── Foco de audio y modo ───

    @Suppress("DEPRECATION")
    private fun pedirFoco(ctx: Context) {
        if (foco != null) return
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                val r = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(
                        AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
                    )
                    .setOnAudioFocusChangeListener { }
                    .build()
                foco = r
                am.requestAudioFocus(r)
            } else {
                am.requestAudioFocus(null, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            }
        } catch (e: Exception) {
            // Sin foco la llamada suena igual; solo no se pausa la música de otros.
        }
    }

    @Suppress("DEPRECATION")
    private fun soltarFoco(ctx: Context) {
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        try {
            val r = foco
            if (Build.VERSION.SDK_INT >= 26 && r != null) {
                am.abandonAudioFocusRequest(r)
            } else if (Build.VERSION.SDK_INT < 26) {
                am.abandonAudioFocus(null)
            }
        } catch (e: Exception) {
            // Nada que soltar.
        }
        foco = null
    }

    /** Sin Telecom, la app pone el modo de comunicación (con Telecom lo pone Android). */
    @Suppress("DEPRECATION")
    private fun modoComunicacion(ctx: Context, activo: Boolean) {
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        try {
            if (activo) {
                am.mode = AudioManager.MODE_IN_COMMUNICATION
            } else if (am.mode == AudioManager.MODE_IN_COMMUNICATION && conexion == null) {
                am.mode = AudioManager.MODE_NORMAL
                if (Build.VERSION.SDK_INT >= 31) am.clearCommunicationDevice() else am.isSpeakerphoneOn = false
            }
        } catch (e: Exception) {
            // El modo lo decide el sistema.
        }
    }

    // ─── Proximidad ───

    private fun sensorProximidad(ctx: Context): Boolean = try {
        (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager).isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)
    } catch (e: Exception) {
        false
    }

    /** Voz + auricular + llamada activa (+ la web lo permite): el sensor apaga la pantalla junto a la cara. */
    private fun evaluarProximidad(ctx: Context) {
        val debe = fase == "activa" && tipo == "voz" && ruta == "auricular" && proximidadWeb
        if (debe == proximidadOn) return
        try {
            if (debe) {
                if (!sensorProximidad(ctx)) return
                val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
                val b = bloqueoProximidad ?: pm.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "starseed:llamada-proximidad").also {
                    it.setReferenceCounted(false)
                    bloqueoProximidad = it
                }
                // Tope de seguridad: una llamada larga no deja el bloqueo para siempre.
                b.acquire(4 * 60 * 60 * 1000L)
            } else {
                bloqueoProximidad?.let { if (it.isHeld) it.release() }
            }
            proximidadOn = debe
            evento("proximidad", debe)
        } catch (e: Exception) {
            proximidadOn = false
        }
    }

    // ─── Aviso y servicio en primer plano ───

    private fun crearCanales(ctx: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        val timbre = NotificationChannel(CANAL_ENTRANTE, "Llamadas entrantes", NotificationManager.IMPORTANCE_HIGH)
        timbre.description = "Cuando una neurona te llama."
        timbre.setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
            AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
        )
        timbre.enableVibration(true)
        timbre.vibrationPattern = longArrayOf(0, 700, 500, 700, 500)
        timbre.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        nm.createNotificationChannel(timbre)
        val curso = NotificationChannel(CANAL_CURSO, "Llamada en curso", NotificationManager.IMPORTANCE_LOW)
        curso.description = "Mientras hablas: colgar y silenciar desde el aviso."
        curso.setSound(null, null)
        curso.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        nm.createNotificationChannel(curso)
    }

    private fun intentApp(ctx: Context, accion: String, codigo: Int): PendingIntent {
        val i = Intent(ctx, ActividadLlamadaStarSeed::class.java).putExtra(EXTRA_ACCION, accion).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
        return PendingIntent.getActivity(ctx, codigo, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun intentBoton(ctx: Context, accion: String, codigo: Int): PendingIntent {
        val i = Intent(ctx, ReceptorLlamadaStarSeed::class.java).setAction(accion)
        return PendingIntent.getBroadcast(ctx, codigo, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun icono(ctx: Context): Int = if (ctx.applicationInfo.icon != 0) ctx.applicationInfo.icon else android.R.drawable.sym_call_incoming

    private fun accion(ctx: Context, recurso: Int, texto: String, pi: PendingIntent): Notification.Action =
        Notification.Action.Builder(Icon.createWithResource(ctx, recurso), texto, pi).build()

    /** El aviso de ahora según la fase (null si no hay llamada). */
    @Suppress("DEPRECATION")
    fun construirAviso(ctx: Context): Notification? {
        val ident = id ?: return null
        if (fase == "inactiva") return null
        val sonandoEntrante = fase == "sonando" && entrante
        val canal = if (sonandoEntrante) CANAL_ENTRANTE else CANAL_CURSO
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(ctx, canal) else Notification.Builder(ctx)
        b.setSmallIcon(icono(ctx)).setCategory(Notification.CATEGORY_CALL).setOngoing(true).setContentIntent(intentApp(ctx, "abrir", 1))
        b.setVisibility(Notification.VISIBILITY_PUBLIC)
        val contestar = intentApp(ctx, "contestar", 2)
        val rechazar = intentBoton(ctx, ACCION_RECHAZAR, 3)
        val colgar = intentBoton(ctx, ACCION_COLGAR, 4)
        val silenciar = intentBoton(ctx, ACCION_SILENCIAR, 5)
        val texto = when {
            sonandoEntrante -> if (tipo == "video") "Videollamada entrante" else "Llamada entrante"
            fase == "sonando" -> "Llamando…"
            fase == "en-espera" -> "Llamada en espera"
            else -> "Llamada en curso"
        }
        val textoSilencio = if (silenciada) "Activar micrófono" else "Silenciar"
        if (Build.VERSION.SDK_INT >= 31) {
            val persona = Person.Builder().setName(nombre).setImportant(true).build()
            b.setContentTitle(nombre).setContentText(texto)
            if (sonandoEntrante) {
                b.setStyle(Notification.CallStyle.forIncomingCall(persona, rechazar, contestar))
            } else {
                b.setStyle(Notification.CallStyle.forOngoingCall(persona, colgar))
                if (fase == "activa" || fase == "en-espera") b.addAction(accion(ctx, android.R.drawable.ic_lock_silent_mode, textoSilencio, silenciar))
            }
            b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
        } else {
            b.setContentTitle(nombre).setContentText(texto)
            if (sonandoEntrante) {
                b.addAction(accion(ctx, android.R.drawable.ic_menu_call, "Contestar", contestar))
                b.addAction(accion(ctx, android.R.drawable.ic_menu_close_clear_cancel, "Rechazar", rechazar))
            } else {
                b.addAction(accion(ctx, android.R.drawable.ic_menu_close_clear_cancel, "Colgar", colgar))
                if (fase == "activa") b.addAction(accion(ctx, android.R.drawable.ic_lock_silent_mode, textoSilencio, silenciar))
            }
            if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_MAX)
        }
        if (sonandoEntrante) {
            // Sobre el bloqueo (Android 14+ lo pide como ajuste especial: sin él, aviso emergente).
            if (puedePantallaCompleta(ctx)) b.setFullScreenIntent(intentApp(ctx, "abrir", 6), true)
            // Con la app a la vista ya suena la propia web: el aviso no duplica el timbre.
            if (Build.VERSION.SDK_INT >= 30 && actual?.get() != null) b.setSilent(true)
        }
        if (fase == "activa" && inicioMs > 0) b.setUsesChronometer(true).setWhen(inicioMs).setShowWhen(true)
        val n = b.build()
        if (sonandoEntrante && !(Build.VERSION.SDK_INT >= 30 && actual?.get() != null)) n.flags = n.flags or Notification.FLAG_INSISTENT
        return n
    }

    private fun actualizarAviso(ctx: Context) {
        val n = construirAviso(ctx) ?: return
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        // Cada cambio de fase vuelve a pasar por el servicio: así sus tipos (micrófono, cámara) se ajustan.
        try {
            val servicio = Intent(ctx, ServicioLlamadaStarSeed::class.java)
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(servicio) else ctx.startService(servicio)
        } catch (e: Exception) {
            // Android no deja arrancar el servicio ahora: queda el aviso solo.
            servicioVivo = false
            try {
                nm?.notify(ID_AVISO, n)
            } catch (x: Exception) {
                // Sin permiso de notificaciones: la web lo explica con las capacidades.
            }
        }
        escribirEstado()
    }

    /** Lo usa el servicio para saber con qué tipos arrancar en primer plano. */
    fun tiposServicio(ctx: Context): Int {
        if (Build.VERSION.SDK_INT < 29) return 0
        var t = ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
        if (Build.VERSION.SDK_INT >= 30 && (fase == "activa" || fase == "en-espera")) {
            if (ctx.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) t = t or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            if (tipo == "video" && ctx.checkSelfPermission(android.Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) t = t or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
        }
        return t
    }

    fun servicioArrancado(vivo: Boolean) {
        servicioVivo = vivo
    }

    fun abrirApp(ctx: Context) {
        try {
            val i = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: return
            ctx.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
        } catch (e: Exception) {
            // Sin actividad principal que abrir.
        }
    }

    // ─── Pantalla: sobre el bloqueo y web viva ───

    private fun hayLlamada(): Boolean = id != null && fase != "inactiva"

    private fun ponerBanderasPantalla(a: Activity) {
        if (Build.VERSION.SDK_INT >= 27) {
            try {
                a.setShowWhenLocked(true)
                a.setTurnScreenOn(true)
            } catch (e: Exception) {
                // La actividad no deja.
            }
        }
    }

    private fun quitarBanderasPantalla(a: Activity) {
        if (Build.VERSION.SDK_INT >= 27) {
            try {
                a.setShowWhenLocked(false)
                a.setTurnScreenOn(false)
            } catch (e: Exception) {
                // Nada que quitar.
            }
        }
    }

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

    /** Con la pantalla apagada o la app atrás, el WebView no debe pausar el audio de la llamada. */
    private fun mantenerWebViva(a: Activity) {
        if (fase != "activa" && fase != "en-espera") return
        principal.postDelayed({
            try {
                val w = buscarWeb(a.window?.decorView)
                if (w != null && hayLlamada()) {
                    w.onResume()
                    w.resumeTimers()
                }
            } catch (e: Exception) {
                // Si no se puede, el servicio en primer plano ya sostiene el proceso.
            }
        }, 300)
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {
        if (hayLlamada() && activity !is ActividadLlamadaStarSeed) ponerBanderasPantalla(activity)
    }

    override fun onActivityResumed(activity: Activity) {
        actual = WeakReference(activity)
        if (hayLlamada() && activity !is ActividadLlamadaStarSeed) ponerBanderasPantalla(activity)
        // Al volver de Ajustes los permisos pueden haber cambiado.
        escribirEstado()
    }

    override fun onActivityPaused(activity: Activity) {
        if (actual?.get() === activity) actual = null
        mantenerWebViva(activity)
    }

    override fun onActivityStopped(activity: Activity) {
        mantenerWebViva(activity)
    }

    override fun onActivityStarted(activity: Activity) {}

    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}

    override fun onActivityDestroyed(activity: Activity) {}
}

/** La llamada para Telecom: lo que el sistema o unos auriculares piden pasa a la web como evento. */
class ConexionStarSeed(ident: String, nombre: String) : Connection() {
    init {
        setConnectionProperties(Connection.PROPERTY_SELF_MANAGED)
        setConnectionCapabilities(Connection.CAPABILITY_HOLD or Connection.CAPABILITY_SUPPORT_HOLD or Connection.CAPABILITY_MUTE)
        setAudioModeIsVoip(true)
        setAddress(Uri.fromParts("starseed", ident, null), TelecomManager.PRESENTATION_ALLOWED)
        setCallerDisplayName(nombre, TelecomManager.PRESENTATION_ALLOWED)
    }

    override fun onAnswer(videoState: Int) {
        LlamadaNativa.desdeSistema("contestar", null)
        LlamadaNativa.abrirAppActual()
    }

    override fun onReject() {
        LlamadaNativa.desdeSistema("rechazar", null)
    }

    override fun onDisconnect() {
        LlamadaNativa.desdeSistema("colgar", null)
    }

    override fun onAbort() {
        LlamadaNativa.desdeSistema("colgar", null)
    }

    override fun onHold() {
        setOnHold()
        LlamadaNativa.desdeSistema("espera", true)
    }

    override fun onUnhold() {
        setActive()
        LlamadaNativa.desdeSistema("espera", false)
    }

    override fun onShowIncomingCallUi() {
        // Autogestionada: el aviso es de la app (ya lo muestra `actualizarAviso`).
    }

    @Suppress("OVERRIDE_DEPRECATION", "DEPRECATION")
    override fun onCallAudioStateChanged(state: CallAudioState?) {
        LlamadaNativa.estadoDeAudio(state)
    }

    override fun onCallEndpointChanged(callEndpoint: CallEndpoint) {
        LlamadaNativa.puntoActual(callEndpoint.endpointType)
    }

    override fun onAvailableCallEndpointsChanged(availableEndpoints: List<CallEndpoint>) {
        LlamadaNativa.puntosCambiaron(availableEndpoints)
    }

    override fun onMuteStateChanged(isMuted: Boolean) {
        LlamadaNativa.desdeSistema("silenciar", isMuted)
    }
}

/** El servicio de conexión que Android enlaza para las llamadas autogestionadas de StarSeed. */
class ServicioConexionStarSeed : ConnectionService() {
    override fun onCreateIncomingConnection(connectionManagerPhoneAccount: PhoneAccountHandle?, request: ConnectionRequest?): Connection =
        LlamadaNativa.crearConexion(applicationContext, true)

    override fun onCreateOutgoingConnection(connectionManagerPhoneAccount: PhoneAccountHandle?, request: ConnectionRequest?): Connection =
        LlamadaNativa.crearConexion(applicationContext, false)

    override fun onCreateIncomingConnectionFailed(connectionManagerPhoneAccount: PhoneAccountHandle?, request: ConnectionRequest?) {
        LlamadaNativa.telecomFallo()
    }

    override fun onCreateOutgoingConnectionFailed(connectionManagerPhoneAccount: PhoneAccountHandle?, request: ConnectionRequest?) {
        LlamadaNativa.telecomFallo()
    }
}

/** Servicio en primer plano `phoneCall` (más micrófono y cámara al contestar): la llamada sobrevive al fondo. */
class ServicioLlamadaStarSeed : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val n = LlamadaNativa.construirAviso(this)
        if (n == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(LlamadaNativa.ID_AVISO, n, LlamadaNativa.tiposServicio(this))
            } else {
                startForeground(LlamadaNativa.ID_AVISO, n)
            }
            LlamadaNativa.servicioArrancado(true)
        } catch (e: Exception) {
            // Android lo niega (p. ej. micrófono desde el fondo): el aviso sigue sin servicio.
            LlamadaNativa.servicioArrancado(false)
            try {
                (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(LlamadaNativa.ID_AVISO, n)
            } catch (x: Exception) {
                // Sin notificaciones.
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        LlamadaNativa.servicioArrancado(false)
        super.onDestroy()
    }
}

/** Los botones del aviso que no necesitan abrir la app: Rechazar, Colgar y Silenciar. */
class ReceptorLlamadaStarSeed : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            LlamadaNativa.ACCION_RECHAZAR -> LlamadaNativa.desdeSistema("rechazar", null)
            LlamadaNativa.ACCION_COLGAR -> LlamadaNativa.desdeSistema("colgar", null)
            LlamadaNativa.ACCION_SILENCIAR -> LlamadaNativa.desdeSistema("silenciar", null)
        }
    }
}

/**
 * Lo que abre el aviso (pantalla completa o «Contestar»): se pone sobre el bloqueo, cuenta lo que se pidió y
 * pasa a la app. Android no deja abrir actividades desde un receptor de un aviso (12+): por eso es una actividad.
 */
class ActividadLlamadaStarSeed : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        if (intent?.getStringExtra(LlamadaNativa.EXTRA_ACCION) == "contestar") LlamadaNativa.desdeSistema("contestar", null)
        LlamadaNativa.abrirApp(this)
        finish()
    }
}
