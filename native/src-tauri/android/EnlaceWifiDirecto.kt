// Lo copia native/src-tauri/build.rs en el proyecto Android que genera Tauri (no editar allí).
// Enlace Wi-Fi directo entre neuronas, sin router (WFD1108A). Contrato: architecture/wifi-directo.md.
package app.starseed.nativa

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.Application
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.database.Cursor
import android.location.LocationManager
import android.net.Uri
import android.net.wifi.WifiManager
import android.net.wifi.p2p.WifiP2pConfig
import android.net.wifi.p2p.WifiP2pManager
import android.os.Build
import android.os.Bundle
import android.os.FileObserver
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.io.File
import java.lang.ref.WeakReference
import java.net.Inet4Address
import java.net.NetworkInterface
import java.security.SecureRandom

/** Arranca el enlace Wi-Fi directo al crearse el proceso, antes que la actividad. */
class ArranqueEnlaceWifi : ContentProvider() {
    override fun onCreate(): Boolean {
        val app = context?.applicationContext ?: return true
        EnlaceWifiDirecto.iniciar(app)
        return true
    }

    override fun query(uri: Uri, projection: Array<String>?, selection: String?, selectionArgs: Array<String>?, sortOrder: String?): Cursor? = null

    override fun getType(uri: Uri): String? = null

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<String>?): Int = 0

    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<String>?): Int = 0
}

/**
 * La parte Android del enlace Wi-Fi directo. Rust (enlace_wifi.rs) escribe peticion.json en
 * filesDir/starseed/enlace-wifi; aquí se atiende y se contesta con estado.json (sin contraseña), y el
 * punto de acceso deja su nombre y contraseña en credenciales.json (privado de la app) para que la web
 * los cifre para la otra neurona. puente.json dice lo que este Android puede y si hay permiso.
 *   · Punto de acceso local (Android 8+, `startLocalOnlyHotspot`): sin internet, nombre y contraseña al
 *     azar que elige Android. Para que un Mac se una.
 *   · Grupo Wi-Fi Direct como dueño (Android 10+ con nombre y contraseña propios; antes, los que dé el
 *     sistema) y unirse a uno como cliente con sus credenciales (Android 10+), sin que nadie pulse nada.
 * Permisos: «Dispositivos cercanos» (NEARBY_WIFI_DEVICES, Android 13+) o «Ubicación» (Android 12 o
 * anterior: Android la exige para crear o buscar redes Wi-Fi; StarSeed no usa la ubicación).
 */
@SuppressLint("MissingPermission")
object EnlaceWifiDirecto : Application.ActivityLifecycleCallbacks {
    const val CARPETA = "enlace-wifi"
    const val PETICION = "peticion.json"
    const val ESTADO = "estado.json"
    const val PUENTE = "puente.json"
    const val CREDENCIALES = "credenciales.json"
    private const val CODIGO_PERMISO = 47073
    private const val PREFS = "starseed-enlace-wifi"
    private const val IP_GRUPO = "192.168.49.1"

    private var actual: WeakReference<Activity>? = null
    private var observador: FileObserver? = null
    private val principal = Handler(Looper.getMainLooper())
    private var iniciado = false
    private var ctxApp: Context? = null

    private var reserva: WifiManager.LocalOnlyHotspotReservation? = null
    private var gestorP2p: WifiP2pManager? = null
    private var canalP2p: WifiP2pManager.Channel? = null
    private var sesion: String? = null
    private var rol: String? = null
    private var metodo: String? = null
    private var ssidActual: String? = null
    /** Acción que espera a que la persona conceda el permiso. */
    private var pendiente: JSONObject? = null

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
        // Al arrancar el proceso no hay ninguna red directa viva: lo que quedara es de otra vida.
        File(dir(ctx), CREDENCIALES).delete()
        val e = leer(ctx, ESTADO)
        if (e != null && e.optString("fase") !in setOf("inactivo", "cerrado", "error")) {
            escribir(ctx, ESTADO, JSONObject().put("fase", "cerrado").put("mensaje", "La app se reinició: la red directa se cerró.").put("t", System.currentTimeMillis()))
        }
        escribirPuente(ctx)
        @Suppress("DEPRECATION")
        val o = object : FileObserver(dir(ctx).absolutePath, FileObserver.CLOSE_WRITE or FileObserver.MOVED_TO) {
            override fun onEvent(event: Int, path: String?) {
                if (path == PETICION) principal.post { atender(ctx) }
            }
        }
        o.startWatching()
        observador = o
        if (File(dir(ctx), PETICION).exists()) principal.post { atender(ctx) }
    }

    // ─── Permisos ───

    private fun permisos(): Array<String> =
        if (Build.VERSION.SDK_INT >= 33) arrayOf("android.permission.NEARBY_WIFI_DEVICES") else arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)

    private fun tienePermiso(ctx: Context): Boolean = permisos().all { ctx.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }

    private fun yaPreguntado(ctx: Context): Boolean = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("preguntado", false)

    private fun estadoPermiso(ctx: Context): String {
        if (tienePermiso(ctx)) return "concedido"
        val a = actual?.get() ?: return "preguntar"
        // Ya se preguntó y Android ya no deja volver a preguntar: solo desde los ajustes de la app.
        return if (yaPreguntado(ctx) && !a.shouldShowRequestPermissionRationale(permisos()[0])) "denegado" else "preguntar"
    }

    private fun pedirPermiso(ctx: Context): Boolean {
        val a = actual?.get() ?: return false
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("preguntado", true).apply()
        return try {
            a.requestPermissions(permisos(), CODIGO_PERMISO)
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun textoPermiso(): String =
        if (Build.VERSION.SDK_INT >= 33) {
            "Android pide «Dispositivos cercanos» para crear o unirse a la red directa entre tus neuronas."
        } else {
            "Android pide «Ubicación» para crear o unirse a una red Wi-Fi (lo exige Android hasta la versión 12; StarSeed no usa tu ubicación)."
        }

    // ─── Lo que puede este aparato ───

    private fun wifi(ctx: Context): WifiManager? = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager

    fun escribirPuente(ctx: Context) {
        val p2p = ctx.packageManager.hasSystemFeature(PackageManager.FEATURE_WIFI_DIRECT)
        val j = JSONObject()
            .put("version", 1)
            .put("sdk", Build.VERSION.SDK_INT)
            .put("p2p", p2p)
            .put("hotspot_local", Build.VERSION.SDK_INT >= 26)
            .put("cliente_p2p", p2p && Build.VERSION.SDK_INT >= 29)
            .put("permiso", estadoPermiso(ctx))
            .put("wifi", wifi(ctx)?.isWifiEnabled == true)
        escribir(ctx, PUENTE, j)
    }

    // ─── Peticiones de Rust ───

    private fun atender(ctx: Context) {
        val f = File(dir(ctx), PETICION)
        val p = try {
            JSONObject(f.readText())
        } catch (e: Exception) {
            null
        }
        // La petición de unirse lleva la contraseña: se borra en cuanto se lee.
        f.delete()
        if (p == null) return
        ejecutar(ctx, p)
    }

    private fun ejecutar(ctx: Context, p: JSONObject) {
        val ses = p.optString("sesion", "")
        when (p.optString("accion")) {
            "permiso" -> {
                if (!tienePermiso(ctx)) pedirPermiso(ctx)
                escribirPuente(ctx)
            }
            "abrir-ap" -> {
                if (!conPermiso(ctx, p, ses, "abriendo")) return
                cerrarTodo(ctx)
                sesion = ses
                rol = "ap"
                metodo = p.optString("metodo")
                if (metodo == "wifi-direct") abrirGrupo(ctx, ses) else abrirPuntoLocal(ctx, ses)
            }
            "unirse" -> {
                if (!conPermiso(ctx, p, ses, "uniendo")) return
                cerrarTodo(ctx)
                sesion = ses
                rol = "cliente"
                metodo = "wifi-direct"
                unirseAGrupo(ctx, ses, p.optString("ssid"), p.optString("clave"), p.optString("ip_ap", ""))
            }
            "cerrar" -> {
                if (ses.isNotEmpty() && sesion != null && ses != sesion) return
                cerrarTodo(ctx)
                estado(ctx, ses, "cerrado", null, "Red directa cerrada.")
            }
        }
    }

    /** Con permiso sigue; sin él, lo pide (si la app está a la vista) y la acción espera a la vuelta. */
    private fun conPermiso(ctx: Context, p: JSONObject, ses: String, fase: String): Boolean {
        if (wifi(ctx)?.isWifiEnabled != true) {
            estado(ctx, ses, "error", "fallo-nativo", "El Wi-Fi de este Android está apagado: enciéndelo para abrir el enlace directo.")
            return false
        }
        if (tienePermiso(ctx)) return true
        if (pedirPermiso(ctx)) {
            pendiente = p
            estado(ctx, ses, fase, null, textoPermiso())
        } else {
            estado(ctx, ses, "error", "permiso-denegado", "Abre StarSeed OS para conceder el permiso: ${textoPermiso()}")
        }
        return false
    }

    // ─── Punto de acceso local (Android 8+) ───

    private fun abrirPuntoLocal(ctx: Context, ses: String) {
        if (Build.VERSION.SDK_INT < 26) {
            estado(ctx, ses, "error", "sin-soporte", "El punto de acceso local llegó con Android 8.")
            return
        }
        val wm = wifi(ctx) ?: return estado(ctx, ses, "error", "sin-soporte", "Este Android no tiene Wi-Fi.")
        val antes = ipv4Locales().values.toSet()
        estado(ctx, ses, "abriendo", null, "Levantando el punto de acceso local…")
        try {
            wm.startLocalOnlyHotspot(object : WifiManager.LocalOnlyHotspotCallback() {
                override fun onStarted(r: WifiManager.LocalOnlyHotspotReservation) {
                    if (sesion != ses) {
                        r.close()
                        return
                    }
                    reserva = r
                    val (ssid, clave) = credencialesDe(r)
                    if (ssid.isNullOrEmpty() || clave.isNullOrEmpty()) {
                        cerrarTodo(ctx)
                        estado(ctx, ses, "error", "fallo-nativo", "Android levantó el punto de acceso pero no dio su nombre o su contraseña.")
                        return
                    }
                    esperarIpNueva(antes, 0) { ip -> redLista(ctx, ses, ssid, clave, null, ip) }
                }

                override fun onStopped() {
                    if (sesion == ses && metodo == "hotspot-local") {
                        reserva = null
                        File(dir(ctx), CREDENCIALES).delete()
                        estado(ctx, ses, "cerrado", null, "Android cerró el punto de acceso local.")
                    }
                }

                override fun onFailed(reason: Int) {
                    if (sesion != ses) return
                    val texto = when (reason) {
                        WifiManager.LocalOnlyHotspotCallback.ERROR_INCOMPATIBLE_MODE -> "el punto de acceso con datos (compartir conexión) está encendido: apágalo"
                        WifiManager.LocalOnlyHotspotCallback.ERROR_TETHERING_DISALLOWED -> "este aparato no deja crear puntos de acceso (política del sistema)"
                        WifiManager.LocalOnlyHotspotCallback.ERROR_NO_CHANNEL -> "no hay canal libre para el punto de acceso"
                        else -> "Android no pudo levantar el punto de acceso (código $reason)"
                    }
                    estado(ctx, ses, "error", "fallo-nativo", texto + pistaUbicacion(ctx))
                }
            }, principal)
        } catch (e: SecurityException) {
            estado(ctx, ses, "error", "permiso-denegado", textoPermiso())
        } catch (e: Exception) {
            estado(ctx, ses, "error", "fallo-nativo", "Android no pudo levantar el punto de acceso (${e.javaClass.simpleName})." + pistaUbicacion(ctx))
        }
    }

    @Suppress("DEPRECATION")
    private fun credencialesDe(r: WifiManager.LocalOnlyHotspotReservation): Pair<String?, String?> {
        if (Build.VERSION.SDK_INT >= 30) {
            val c = r.softApConfiguration
            val ssid = if (Build.VERSION.SDK_INT >= 33) c.wifiSsid?.toString() else c.ssid
            return Pair(sinComillas(ssid), c.passphrase)
        }
        val w = r.wifiConfiguration
        return Pair(sinComillas(w?.SSID), sinComillas(w?.preSharedKey))
    }

    private fun sinComillas(s: String?): String? {
        if (s == null) return null
        return if (s.length >= 2 && s.startsWith("\"") && s.endsWith("\"")) s.substring(1, s.length - 1) else s
    }

    /** Hasta Android 12 el punto de acceso puede fallar con la Ubicación del aparato apagada. */
    private fun pistaUbicacion(ctx: Context): String {
        if (Build.VERSION.SDK_INT >= 33 || Build.VERSION.SDK_INT < 28) return ""
        val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return ""
        return if (lm.isLocationEnabled) "" else " Activa la Ubicación del aparato (Android la exige para el punto de acceso hasta la versión 12)."
    }

    // ─── Grupo Wi-Fi Direct (dueño) ───

    private fun p2p(ctx: Context): Pair<WifiP2pManager, WifiP2pManager.Channel>? {
        if (!ctx.packageManager.hasSystemFeature(PackageManager.FEATURE_WIFI_DIRECT)) return null
        val m = gestorP2p ?: (ctx.getSystemService(Context.WIFI_P2P_SERVICE) as? WifiP2pManager)?.also { gestorP2p = it } ?: return null
        val c = canalP2p ?: m.initialize(ctx, Looper.getMainLooper(), null)?.also { canalP2p = it } ?: return null
        return Pair(m, c)
    }

    private fun aleatorio(n: Int): String {
        val abc = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        val r = SecureRandom()
        return (1..n).map { abc[r.nextInt(abc.length)] }.joinToString("")
    }

    private fun abrirGrupo(ctx: Context, ses: String) {
        val (m, c) = p2p(ctx) ?: return estado(ctx, ses, "error", "sin-soporte", "Este Android no tiene Wi-Fi Direct.")
        estado(ctx, ses, "abriendo", null, "Creando el grupo Wi-Fi Direct…")
        val crear = Runnable {
            val oyente = object : WifiP2pManager.ActionListener {
                override fun onSuccess() {
                    principal.postDelayed({ leerGrupo(ctx, ses, 0) }, 600)
                }

                override fun onFailure(reason: Int) {
                    if (sesion == ses) estado(ctx, ses, "error", "fallo-nativo", "Wi-Fi Direct no creó el grupo (código $reason).")
                }
            }
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    val cfg = WifiP2pConfig.Builder()
                        .setNetworkName("DIRECT-" + aleatorio(2) + "-StarSeed")
                        .setPassphrase(aleatorio(16))
                        .setGroupOperatingBand(WifiP2pConfig.GROUP_OWNER_BAND_AUTO)
                        .enablePersistentMode(false)
                        .build()
                    m.createGroup(c, cfg, oyente)
                } else {
                    m.createGroup(c, oyente)
                }
            } catch (e: SecurityException) {
                estado(ctx, ses, "error", "permiso-denegado", textoPermiso())
            }
        }
        // Un grupo anterior (de otra app o de otra vez) impide crear el nuevo: se quita antes.
        try {
            m.removeGroup(c, object : WifiP2pManager.ActionListener {
                override fun onSuccess() {
                    principal.post(crear)
                }

                override fun onFailure(reason: Int) {
                    principal.post(crear)
                }
            })
        } catch (e: SecurityException) {
            principal.post(crear)
        }
    }

    private fun leerGrupo(ctx: Context, ses: String, intento: Int) {
        if (sesion != ses) return
        val (m, c) = p2p(ctx) ?: return
        try {
            m.requestGroupInfo(c) { g ->
                if (g == null || !g.isGroupOwner || g.passphrase.isNullOrEmpty()) {
                    if (intento < 12) principal.postDelayed({ leerGrupo(ctx, ses, intento + 1) }, 500)
                    else estado(ctx, ses, "error", "fallo-nativo", "El grupo Wi-Fi Direct no dio su nombre o su contraseña.")
                    return@requestGroupInfo
                }
                val banda = if (Build.VERSION.SDK_INT >= 29) bandaDe(g.frequency) else null
                m.requestConnectionInfo(c) { info ->
                    val ip = info?.groupOwnerAddress?.hostAddress ?: IP_GRUPO
                    redLista(ctx, ses, g.networkName, g.passphrase, banda, ip)
                }
            }
        } catch (e: SecurityException) {
            estado(ctx, ses, "error", "permiso-denegado", textoPermiso())
        }
    }

    private fun bandaDe(mhz: Int): String? = when (mhz) {
        in 2400..2500 -> "2.4"
        in 4900..5900 -> "5"
        in 5925..7125 -> "6"
        else -> null
    }

    // ─── Unirse a un grupo Wi-Fi Direct (cliente, Android 10+) ───

    private fun unirseAGrupo(ctx: Context, ses: String, ssid: String, clave: String, ipAp: String) {
        if (Build.VERSION.SDK_INT < 29) {
            estado(ctx, ses, "error", "sin-soporte", "Unirse sin preguntar a un grupo Wi-Fi Direct llegó con Android 10.")
            return
        }
        val (m, c) = p2p(ctx) ?: return estado(ctx, ses, "error", "sin-soporte", "Este Android no tiene Wi-Fi Direct.")
        ssidActual = ssid
        estado(ctx, ses, "uniendo", null, "Uniéndose al grupo Wi-Fi Direct de la otra neurona…")
        try {
            val cfg = WifiP2pConfig.Builder().setNetworkName(ssid).setPassphrase(clave).enablePersistentMode(false).build()
            m.connect(c, cfg, object : WifiP2pManager.ActionListener {
                override fun onSuccess() {
                    principal.postDelayed({ esperarConexion(ctx, ses, ipAp, 0) }, 800)
                }

                override fun onFailure(reason: Int) {
                    if (sesion == ses) estado(ctx, ses, "error", if (reason == WifiP2pManager.P2P_UNSUPPORTED) "sin-soporte" else "fallo-nativo", "Wi-Fi Direct no pudo unirse (código $reason).")
                }
            })
        } catch (e: SecurityException) {
            estado(ctx, ses, "error", "permiso-denegado", textoPermiso())
        } catch (e: IllegalArgumentException) {
            estado(ctx, ses, "error", "fallo-nativo", "Android no acepta ese nombre o esa contraseña de red.")
        }
    }

    private fun esperarConexion(ctx: Context, ses: String, ipAp: String, intento: Int) {
        if (sesion != ses) return
        val (m, c) = p2p(ctx) ?: return
        try {
            m.requestConnectionInfo(c) { info ->
                val go = info?.groupOwnerAddress?.hostAddress ?: ipAp.ifEmpty { null }
                val propia = go?.let { ipEnSubred(it) }
                if (info != null && info.groupFormed && !info.isGroupOwner && propia != null) {
                    val j = base(ses, "unida", null, "Dentro de la red directa de la otra neurona.")
                        .put("ssid", ssidActual)
                        .put("ip_propia", propia)
                        .put("ip_ap", go)
                    escribir(ctx, ESTADO, j)
                } else if (intento < 40) {
                    principal.postDelayed({ esperarConexion(ctx, ses, ipAp, intento + 1) }, 500)
                } else {
                    cerrarTodo(ctx)
                    estado(ctx, ses, "error", "no-encontrada", "No se encontró el grupo Wi-Fi Direct de la otra neurona (¿demasiado lejos?).")
                }
            }
        } catch (e: SecurityException) {
            estado(ctx, ses, "error", "permiso-denegado", textoPermiso())
        }
    }

    // ─── Red lista, IPs y cierre ───

    private fun redLista(ctx: Context, ses: String, ssid: String, clave: String, banda: String?, ip: String?) {
        if (sesion != ses) return
        ssidActual = ssid
        // Primero las credenciales (Rust solo las da si son de esta sesión), después el estado.
        escribir(ctx, CREDENCIALES, JSONObject().put("sesion", ses).put("ssid", ssid).put("clave", clave).put("banda", banda).put("ip", ip))
        val j = base(ses, "red-lista", null, "Red directa lista: esperando a la otra neurona.")
            .put("ssid", ssid)
            .put("banda", banda)
            .put("ip_ap", ip)
            .put("ip_propia", ip)
        escribir(ctx, ESTADO, j)
    }

    /** IPv4 privadas de cada interfaz que está arriba (nombre → IP). */
    private fun ipv4Locales(): Map<String, String> {
        val out = HashMap<String, String>()
        try {
            val it = NetworkInterface.getNetworkInterfaces() ?: return out
            for (ni in it) {
                if (!ni.isUp || ni.isLoopback) continue
                for (a in ni.inetAddresses) {
                    if (a is Inet4Address && a.isSiteLocalAddress) out[ni.name + "/" + a.hostAddress] = a.hostAddress ?: continue
                }
            }
        } catch (e: Exception) {
            // Sin interfaces que leer: el faro encontrará la IP.
        }
        return out
    }

    /** La IP que aparece al levantar el punto de acceso (hasta 5 s); si no, la de una interfaz de punto de acceso. */
    private fun esperarIpNueva(antes: Set<String>, intento: Int, listo: (String?) -> Unit) {
        val ahora = ipv4Locales()
        val nueva = ahora.values.firstOrNull { it !in antes }
        if (nueva != null) return listo(nueva)
        if (intento < 16) {
            principal.postDelayed({ esperarIpNueva(antes, intento + 1, listo) }, 300)
            return
        }
        val porNombre = ahora.entries.firstOrNull { (k, _) -> k.startsWith("swlan") || k.startsWith("ap") || k.startsWith("softap") || k.startsWith("wlan1") }
        listo(porNombre?.value)
    }

    /** IP de este aparato en la misma /24 que `ip` (la red directa). */
    private fun ipEnSubred(ip: String): String? {
        val pre = ip.substringBeforeLast('.', "") + "."
        if (pre.length < 6) return null
        return ipv4Locales().values.firstOrNull { it.startsWith(pre) && it != ip }
    }

    private fun cerrarTodo(ctx: Context) {
        try {
            reserva?.close()
        } catch (e: Exception) {
            // Ya estaba cerrado.
        }
        reserva = null
        val par = if (metodo == "wifi-direct") p2p(ctx) else null
        if (par != null) {
            try {
                par.first.removeGroup(par.second, null)
            } catch (e: Exception) {
                // Sin grupo que quitar.
            }
        }
        File(dir(ctx), CREDENCIALES).delete()
        sesion = null
        rol = null
        metodo = null
        ssidActual = null
        pendiente = null
    }

    // ─── Ciclo de vida: la actividad a la vista (permisos) ───

    override fun onActivityResumed(activity: Activity) {
        actual = WeakReference(activity)
        val ctx = activity.applicationContext
        escribirPuente(ctx)
        val p = pendiente ?: return
        pendiente = null
        if (tienePermiso(ctx)) {
            ejecutar(ctx, p)
        } else {
            estado(ctx, p.optString("sesion", ""), "error", "permiso-denegado", "Sin el permiso no se puede abrir la red directa. ${textoPermiso()}")
        }
    }

    override fun onActivityPaused(activity: Activity) {
        if (actual?.get() === activity) actual = null
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}

    override fun onActivityStarted(activity: Activity) {}

    override fun onActivityStopped(activity: Activity) {}

    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}

    override fun onActivityDestroyed(activity: Activity) {}

    // ─── Archivos con Rust ───

    private fun base(ses: String?, fase: String, codigo: String?, mensaje: String): JSONObject =
        JSONObject()
            .put("sesion", ses)
            .put("fase", fase)
            .put("rol", rol)
            .put("metodo", metodo)
            .put("codigo", codigo)
            .put("mensaje", mensaje)
            .put("t", System.currentTimeMillis())

    private fun estado(ctx: Context, ses: String?, fase: String, codigo: String?, mensaje: String) {
        escribir(ctx, ESTADO, base(ses, fase, codigo, mensaje).put("ssid", ssidActual))
    }

    private fun leer(ctx: Context, nombre: String): JSONObject? =
        try {
            val f = File(dir(ctx), nombre)
            if (f.exists()) JSONObject(f.readText()) else null
        } catch (e: Exception) {
            null
        }

    @Synchronized
    private fun escribir(ctx: Context, nombre: String, json: JSONObject) {
        try {
            val d = dir(ctx)
            val tmp = File(d, "$nombre.tmp")
            tmp.writeText(json.toString())
            if (!tmp.renameTo(File(d, nombre))) tmp.delete()
        } catch (e: Exception) {
            // Sin disco no hay estado que contar.
        }
    }
}
