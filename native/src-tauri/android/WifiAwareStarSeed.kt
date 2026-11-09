// Lo copia native/src-tauri/build.rs en el proyecto Android que genera Tauri (no editar allí).
// Wi-Fi Aware (NAN) entre dos Android, sin router ni punto de acceso (WFA1109A). Contrato: architecture/wifi-directo.md.
package app.starseed.nativa

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.aware.AttachCallback
import android.net.wifi.aware.DiscoverySessionCallback
import android.net.wifi.aware.PeerHandle
import android.net.wifi.aware.PublishConfig
import android.net.wifi.aware.PublishDiscoverySession
import android.net.wifi.aware.SubscribeConfig
import android.net.wifi.aware.SubscribeDiscoverySession
import android.net.wifi.aware.WifiAwareManager
import android.net.wifi.aware.WifiAwareNetworkInfo
import android.net.wifi.aware.WifiAwareNetworkSpecifier
import android.net.wifi.aware.WifiAwareSession
import android.os.Build
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.net.Inet6Address
import java.security.SecureRandom

/**
 * Wi-Fi Aware: una neurona publica y la otra se suscribe al servicio `starseed-malla`. El aviso del servicio
 * lleva solo [versión, huella de 8 bytes de la neurona]: ningún secreto. La contraseña de la ruta de datos
 * la genera quien publica y viaja cifrada por el canal firmado (enlace.wifi.*). Todo bajo Android 10 (API 29).
 */
@android.annotation.SuppressLint("NewApi")
object WifiAwareStarSeed {
    const val SERVICIO = "starseed-malla"
    const val VERSION = 1

    /** Cómo cuenta esto a EnlaceWifiDirecto: estado (con campos extra) y credenciales. */
    interface Salida {
        fun fase(ses: String, fase: String, codigo: String?, mensaje: String, extra: JSONObject?)
        fun credenciales(ses: String, ssid: String, clave: String)
    }

    private val principal = Handler(Looper.getMainLooper())
    private var sesionAware: WifiAwareSession? = null
    private var publicacion: PublishDiscoverySession? = null
    private var suscripcion: SubscribeDiscoverySession? = null
    private var redCb: ConnectivityManager.NetworkCallback? = null
    private var cm: ConnectivityManager? = null
    private var receptor: BroadcastReceiver? = null
    private var ctxApp: Context? = null
    private var enviadoHola = false

    private fun gestor(ctx: Context): WifiAwareManager? =
        if (Build.VERSION.SDK_INT >= 29) ctx.applicationContext.getSystemService(Context.WIFI_AWARE_SERVICE) as? WifiAwareManager else null

    /** El aparato tiene Wi-Fi Aware (función de hardware), no necesariamente disponible ahora. */
    fun soportado(ctx: Context): Boolean =
        Build.VERSION.SDK_INT >= 29 && ctx.packageManager.hasSystemFeature(PackageManager.FEATURE_WIFI_AWARE)

    /** Hardware presente y servicio disponible ahora mismo (Wi-Fi encendido, sin otra sesión que lo ocupe). */
    fun disponible(ctx: Context): Boolean = soportado(ctx) && gestor(ctx)?.isAvailable == true

    private fun hexABytes(h: String?): ByteArray? {
        if (h == null || h.length != 16) return null
        return try {
            ByteArray(8) { h.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
        } catch (e: Exception) {
            null
        }
    }

    private fun aviso(huellaPropia: String?): ByteArray {
        val h = hexABytes(huellaPropia) ?: ByteArray(8)
        return byteArrayOf(VERSION.toByte()) + h
    }

    private fun claveNueva(): String {
        val alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
        val r = SecureRandom()
        return String(CharArray(20) { alfabeto[r.nextInt(alfabeto.length)] })
    }

    // ─── Publica (rol «ap»): espera a que la otra neurona escriba y le abre la ruta de datos ───

    fun abrirAp(ctx: Context, ses: String, huellaPropia: String?, huellaOtro: String?, salida: Salida) {
        cerrar()
        val m = gestor(ctx)
        if (m == null || !m.isAvailable) {
            salida.fase(ses, "error", "sin-soporte", "Wi-Fi Aware no está disponible ahora en este Android (¿Wi-Fi apagado o en uso?).", null)
            return
        }
        ctxApp = ctx.applicationContext
        cm = ctx.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        vigilarEstado(ctx, ses, salida)
        val clave = claveNueva()
        m.attach(object : AttachCallback() {
            override fun onAttached(s: WifiAwareSession) {
                sesionAware = s
                val cfg = PublishConfig.Builder().setServiceName(SERVICIO).setServiceSpecificInfo(aviso(huellaPropia)).build()
                s.publish(cfg, object : DiscoverySessionCallback() {
                    override fun onPublishStarted(p: PublishDiscoverySession) {
                        publicacion = p
                        salida.credenciales(ses, SERVICIO, clave)
                        salida.fase(ses, "red-lista", null, "Wi-Fi Aware listo: esperando a la otra neurona.", null)
                    }

                    override fun onMessageReceived(peerHandle: PeerHandle, message: ByteArray) {
                        // La otra neurona nos encontró: abrimos la ruta de datos como respondedor.
                        val p = publicacion ?: return
                        if (redCb != null) return
                        if (!esHola(message, huellaOtro)) return
                        pedirRed(ses, WifiAwareNetworkSpecifier.Builder(p, peerHandle).setPskPassphrase(clave).build(), false, salida)
                    }

                    override fun onSessionConfigFailed() {
                        salida.fase(ses, "error", "fallo-nativo", "Wi-Fi Aware no pudo publicar el servicio.", null)
                    }
                }, principal)
            }

            override fun onAttachFailed() {
                salida.fase(ses, "error", "fallo-nativo", "Wi-Fi Aware no pudo iniciarse en este Android.", null)
            }
        }, principal)
    }

    // ─── Se suscribe (rol «cliente»): encuentra al que publica, le escribe y pide la ruta de datos ───

    fun unirse(ctx: Context, ses: String, huellaPropia: String?, huellaOtro: String?, clave: String, salida: Salida) {
        cerrar()
        val m = gestor(ctx)
        if (m == null || !m.isAvailable) {
            salida.fase(ses, "error", "sin-soporte", "Wi-Fi Aware no está disponible ahora en este Android.", null)
            return
        }
        if (clave.length < 8 || clave.length > 63) {
            salida.fase(ses, "error", "fallo-nativo", "La contraseña de la ruta Aware no es válida.", null)
            return
        }
        ctxApp = ctx.applicationContext
        cm = ctx.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        vigilarEstado(ctx, ses, salida)
        salida.fase(ses, "uniendo", null, "Buscando a la otra neurona por Wi-Fi Aware…", null)
        val buscada = hexABytes(huellaOtro)
        m.attach(object : AttachCallback() {
            override fun onAttached(s: WifiAwareSession) {
                sesionAware = s
                val cfg = SubscribeConfig.Builder().setServiceName(SERVICIO).build()
                s.subscribe(cfg, object : DiscoverySessionCallback() {
                    override fun onSubscribeStarted(sub: SubscribeDiscoverySession) {
                        suscripcion = sub
                    }

                    override fun onServiceDiscovered(peerHandle: PeerHandle, info: ByteArray, filtro: List<ByteArray>) {
                        val sub = suscripcion ?: return
                        if (enviadoHola || info.size != 9 || info[0].toInt() != VERSION) return
                        if (buscada != null && !info.copyOfRange(1, 9).contentEquals(buscada)) return
                        enviadoHola = true
                        sub.sendMessage(peerHandle, 1, hola(huellaPropia))
                        pedirRed(ses, WifiAwareNetworkSpecifier.Builder(sub, peerHandle).setPskPassphrase(clave).build(), true, salida)
                    }

                    override fun onSessionConfigFailed() {
                        salida.fase(ses, "error", "fallo-nativo", "Wi-Fi Aware no pudo suscribirse al servicio.", null)
                    }
                }, principal)
            }

            override fun onAttachFailed() {
                salida.fase(ses, "error", "fallo-nativo", "Wi-Fi Aware no pudo iniciarse en este Android.", null)
            }
        }, principal)
    }

    /** «hola» = versión + huella de quien escribe; sin secretos. */
    private fun hola(huellaPropia: String?): ByteArray = aviso(huellaPropia)

    private fun esHola(msg: ByteArray, huellaOtro: String?): Boolean {
        if (msg.size != 9 || msg[0].toInt() != VERSION) return false
        val esperada = hexABytes(huellaOtro) ?: return true
        return msg.copyOfRange(1, 9).contentEquals(esperada)
    }

    // ─── La ruta de datos (NDP) y las direcciones IPv6 de enlace local ───

    private fun pedirRed(ses: String, spec: WifiAwareNetworkSpecifier, iniciador: Boolean, salida: Salida) {
        val c = cm ?: return
        val peticion = NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI_AWARE)
            .setNetworkSpecifier(spec)
            .build()
        var ifaz: String? = null
        var propia: String? = null
        var otra: String? = null

        fun anunciar() {
            val i = ifaz ?: return
            val o = otra ?: return
            val extra = JSONObject().put("ip_otro", "$o%$i").put("ip_propia", propia?.let { "$it%$i" })
            if (iniciador) {
                salida.fase(ses, "unida", null, "Unida por Wi-Fi Aware, sin router ni hotspot.", extra)
            } else {
                salida.fase(ses, "red-lista", null, "Wi-Fi Aware listo: la otra neurona está en la ruta de datos.", extra)
            }
        }
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onCapabilitiesChanged(red: Network, caps: NetworkCapabilities) {
                val info = caps.transportInfo as? WifiAwareNetworkInfo ?: return
                otra = info.peerIpv6Addr?.hostAddress?.substringBefore('%')
                anunciar()
            }

            override fun onLinkPropertiesChanged(red: Network, lp: LinkProperties) {
                ifaz = lp.interfaceName
                propia = lp.linkAddresses.map { it.address }.filterIsInstance<Inet6Address>().firstOrNull { it.isLinkLocalAddress }?.hostAddress?.substringBefore('%')
                anunciar()
            }

            override fun onUnavailable() {
                salida.fase(ses, "error", "no-encontrada", "La otra neurona no abrió la ruta de datos Aware a tiempo.", null)
            }

            override fun onLost(red: Network) {
                salida.fase(ses, "cerrado", null, "Se perdió la ruta Wi-Fi Aware.", null)
            }
        }
        redCb = cb
        try {
            c.requestNetwork(peticion, cb, 30_000)
        } catch (e: Exception) {
            redCb = null
            salida.fase(ses, "error", "fallo-nativo", "Android no abrió la ruta de datos Aware.", null)
        }
    }

    /** Si el servicio deja de estar disponible (Wi-Fi apagado, otra app lo toma), se cuenta una sola vez. */
    private fun vigilarEstado(ctx: Context, ses: String, salida: Salida) {
        val app = ctx.applicationContext
        val r = object : BroadcastReceiver() {
            override fun onReceive(c: Context, i: Intent) {
                if (gestor(c)?.isAvailable != true) {
                    salida.fase(ses, "error", "sin-soporte", "Wi-Fi Aware dejó de estar disponible en este Android.", null)
                }
            }
        }
        receptor = r
        try {
            app.registerReceiver(r, IntentFilter(WifiAwareManager.ACTION_WIFI_AWARE_STATE_CHANGED))
        } catch (e: Exception) {
            receptor = null
        }
    }

    fun cerrar() {
        try {
            redCb?.let { cm?.unregisterNetworkCallback(it) }
        } catch (e: Exception) {
            // Ya estaba suelto.
        }
        redCb = null
        try {
            receptor?.let { ctxApp?.unregisterReceiver(it) }
        } catch (e: Exception) {
            // Ya estaba suelto.
        }
        receptor = null
        try {
            publicacion?.close()
            suscripcion?.close()
            sesionAware?.close()
        } catch (e: Exception) {
            // Sin sesión que cerrar.
        }
        publicacion = null
        suscripcion = null
        sesionAware = null
        enviadoHola = false
    }
}
