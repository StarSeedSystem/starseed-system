// Lo copia native/src-tauri/build.rs en el proyecto Android que genera Tauri (no editar allí).
// Bluetooth directo entre neuronas (BLE1108A). Contrato: architecture/bluetooth-directo.md §6.
package app.starseed.nativa

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.app.Application
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothServerSocket
import android.bluetooth.BluetoothSocket
import android.bluetooth.BluetoothStatusCodes
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.os.SystemClock
import android.provider.Settings
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.util.UUID
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Puente con el núcleo Rust (src/ble_android.rs). Rust decide (anuncio, tramas, acuses, a quién
 * conectar); esto solo mueve bytes por la radio.
 */
object PuenteBle {
    /** radio · visto · conectado · mtu · desconectado (JSON con "e"). */
    @JvmStatic
    external fun evento(json: String)

    /** Un paquete que llegó por el enlace («c:<dirección>» o «p:<dirección>»), en hex. */
    @JvmStatic
    external fun datos(enlace: String, hex: String)

    /** El siguiente paquete a mandar por ese enlace, en hex («» = nada ahora). */
    @JvmStatic
    external fun siguiente(enlace: String): String

    /** Espera hasta `ms` la siguiente orden de Rust (JSON con "o"); «» si no llegó ninguna. */
    @JvmStatic
    external fun esperarOrden(ms: Long): String

    /** (BLE1109A) Bytes que llegaron por el flujo del canal L2CAP de ese enlace, en hex (Rust los desmarca). */
    @JvmStatic
    external fun rapido(enlace: String, hex: String)

    /** (BLE1109A) Lo siguiente que escribir en el flujo del canal L2CAP (ya marcado), en hex, hasta ~`max` bytes («» = nada). */
    @JvmStatic
    external fun siguienteRapido(enlace: String, max: Int): String
}

/** Arranca el Bluetooth directo al crearse el proceso (también con la app cerrada y el servicio vivo). */
class ArranqueBle : ContentProvider() {
    override fun onCreate(): Boolean {
        val app = context?.applicationContext ?: return true
        MotorBle.iniciar(app)
        return true
    }

    override fun query(uri: Uri, projection: Array<String>?, selection: String?, selectionArgs: Array<String>?, sortOrder: String?): Cursor? = null

    override fun getType(uri: Uri): String? = null

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<String>?): Int = 0

    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<String>?): Int = 0
}

/**
 * La radio: anunciante (UUID rotatorio que manda Rust), escáner con filtro «SS·B1», servidor GATT
 * (ENTRADA escritura, SALIDA notificación) y clientes GATT. Todo el estado se toca en el hilo
 * principal (las llamadas de la pila Bluetooth se pasan a él con `principal.post`).
 */
@SuppressLint("MissingPermission")
object MotorBle : Application.ActivityLifecycleCallbacks {
    val SERVICIO: UUID = UUID.fromString("53530001-b1e0-4d2a-9c3e-537461727365")
    val ENTRADA: UUID = UUID.fromString("53530002-b1e0-4d2a-9c3e-537461727365")
    val SALIDA: UUID = UUID.fromString("53530003-b1e0-4d2a-9c3e-537461727365")
    val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    /** (BLE1109A) Característica de lectura con el PSM del canal L2CAP (2 bytes big-endian; 0 = sin canal). */
    val PSM_UUID: UUID = UUID.fromString("53530004-b1e0-4d2a-9c3e-537461727365")
    val PREFIJO: UUID = UUID.fromString("5353b100-0000-0000-0000-000000000000")
    val MASCARA: UUID = UUID.fromString("ffffff00-0000-0000-0000-000000000000")
    private const val PETICION_PERMISOS = 4711
    private const val PREFERENCIAS = "starseed-ble"
    private const val MTU_PEDIDO = 517
    private const val PAQUETE_MIN = 20
    private const val PAQUETE_MAX = 512
    // (BLE1108C) Si `onCharacteristicWrite` / `onNotificationSent` no llega en este tiempo, se sigue igual y se anota
    // `listo-tarde`: una señal perdida nunca vuelve a bloquear el enlace.
    private const val VIGIA_ESCRITURA_MS = 500L
    // (BLE1108C) Reintentos de la suscripción (CCCD) y espera para que el otro se suscriba al ser el periférico.
    private const val REINTENTOS_SUSCRIPCION = 3
    private const val ESPERA_SUSCRIPCION_MS = 1000L
    private const val VIGIA_SUSCRIPCION_MS = 10_000L
    private const val ESPERA_SOLTAR_MTU_MS = 60_000L // BLE1110A: ver `ble_autocura::decidir_mtu`
    // (BLE1109A) Canal L2CAP: lo que se lee/escribe de una vez, y cuánto puede estar una escritura sin avanzar.
    private const val RETRASO_PHY_MS = 5_000L
    private const val LECTURA_FLUJO = 8192
    private const val ESCRITURA_FLUJO = 8192
    private const val PLAZO_ESCRITURA_FLUJO_MS = 8_000L

    /** (BLE1109A) Un canal L2CAP abierto: dos hilos (lee y escribe) y una señal para despertar al que escribe. */
    private class Canal(val enlace: String, val socket: BluetoothSocket, val psm: Int) {
        val cerrado = AtomicBoolean(false)
        @Volatile var escribiendoDesde = 0L
        /** (BLE1110A) Último byte leído del canal: una escritura lenta con el otro lado hablando no es un atasco. */
        @Volatile var ultimaLecturaMs = SystemClock.elapsedRealtime()
        val senal = ArrayBlockingQueue<Boolean>(1)
    }

    private class Cliente(val direccion: String, val gatt: BluetoothGatt) {
        var entrada: BluetoothGattCharacteristic? = null
        var paquete = PAQUETE_MIN
        var listo = false
        var ocupadoDesde = 0L
        var pendiente: ByteArray? = null
        var reintentosSub = 0
        var tardes = 0
    }

    private class Central(val device: BluetoothDevice) {
        var paquete = PAQUETE_MIN
        var suscrito = false
    }

    private var tardesServidor = 0

    // (BLE1109A) Carril rápido. `canales` y `conectando` se tocan desde hilos de E/S: mapas concurrentes.
    private val canales = ConcurrentHashMap<String, Canal>()
    private val conectando = ConcurrentHashMap<String, BluetoothSocket>()
    @Volatile private var servidorL2cap: BluetoothServerSocket? = null
    @Volatile private var psmPublicado = 0
    private var vigiaCanales = false

    /**
     * (BLE1109B) Ajuste «Canal rápido Bluetooth (experimental)»: Rust lo manda ANTES de «arrancar». Encendido por defecto;
     * apagado, el servicio GATT es el de prueba.30: sin la característica PSM, sin socket L2CAP y sin petición de PHY 2M.
     * Encendido, NADA de esto toca el hilo principal ni los callbacks GATT (ver `servirL2cap`).
     */
    @Volatile private var canalRapido = true
    @Volatile private var generacionL2cap = 0
    private val abriendoL2cap = AtomicBoolean(false)

    // (BLE1109B) Autocuración del periférico: ver `vigilarAutocura`.
    private var ultimoEnlaceMs = 0L
    private val caidasRecientes = ArrayList<Long>()
    private var curasSeguidas = 0
    private var vigiaAutocura = false
    // (BLE1110A) Gemelo de `ble_autocura.rs`: última cura, último tráfico (cualquier sentido, GATT o L2CAP) y una evaluación pendiente.
    private var ultimaCuraMs = -1L
    @Volatile private var ultimoTraficoMs = -1L
    private var evaluacionPendiente = false
    // (BLE1110A) MTU recordado por central (sobrevive a recrear el servidor GATT: la conexión ACL sigue con su MTU) y cuándo se soltó uno.
    private val paqueteRecordado = HashMap<String, Int>()
    private val soltadoMtuMs = HashMap<String, Long>()
    private var anuncioTurno = 0
    private var reintentoAnuncio = false
    // (MLL1111C) Gemelo de `ble_autocura::Anuncio`: cuándo se pidió el arranque en curso (-1: ninguno); una reanudación
    // pendiente (se juntan); y el contador de hechos REALES por minuto (`ble_autocura::ContadorEnlaces`).
    private var anuncioPedidoMs = -1L
    private var reanudarPendiente = false
    private var contDesdeMs = -1L
    private var contConexiones = 0
    private var contReales = 0
    private var contRepetidas = 0

    private lateinit var ctx: Context
    private val principal = Handler(Looper.getMainLooper())
    private var actual: WeakReference<Activity>? = null
    private var iniciado = false
    private var activo = false
    private var ultimoEstado = ""
    private var pendientePermisos = false
    private var adaptador: BluetoothAdapter? = null
    private var servidor: BluetoothGattServer? = null
    private var salida: BluetoothGattCharacteristic? = null
    private var servicioListo = false
    private var anuncioUuid: String? = null
    private var anunciando = false
    private var escaneando = false
    private var servidorOcupadoDesde = 0L
    private var pendienteServidor: Pair<String, ByteArray>? = null
    private var turno = 0
    private val clientes = HashMap<String, Cliente>()
    private val centrales = HashMap<String, Central>()
    private val vistos = HashMap<String, Pair<BluetoothDevice, Long>>()
    private val ultimoAviso = HashMap<String, Pair<String, Long>>()

    // ───────────────────────────── Arranque y órdenes ─────────────────────────────

    @Synchronized
    fun iniciar(c: Context) {
        if (iniciado) return
        iniciado = true
        ctx = c.applicationContext
        (ctx as? Application)?.registerActivityLifecycleCallbacks(this)
        // Carga la librería de Rust (y el guardián, que tiene la clave de faro de la cuenta).
        if (!PuenteNativo.arrancarGuardian(ctx)) return
        try {
            val filtro = IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED)
            if (Build.VERSION.SDK_INT >= 33) {
                ctx.registerReceiver(receptorEstado, filtro, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                ctx.registerReceiver(receptorEstado, filtro)
            }
        } catch (e: Exception) {
            // Sin aviso de encendido/apagado: se mira al volver a la app.
        }
        val hilo = Thread({ bucleOrdenes() }, "starseed-ble-ordenes")
        hilo.isDaemon = true
        hilo.start()
    }

    private fun bucleOrdenes() {
        while (true) {
            val o = try {
                PuenteBle.esperarOrden(10_000)
            } catch (t: Throwable) {
                SystemClock.sleep(5_000)
                ""
            }
            if (o.isNotEmpty()) principal.post { atender(o) }
        }
    }

    private fun atender(texto: String) {
        val o = try {
            JSONObject(texto)
        } catch (e: Exception) {
            return
        }
        try {
            when (o.optString("o")) {
                "arrancar" -> {
                    activo = true
                    arrancar()
                }
                "anunciar" -> {
                    anuncioUuid = o.optString("uuid").ifEmpty { null }
                    anunciar()
                }
                "conectar" -> conectar(o.optString("direccion"))
                "desconectar" -> desconectar(o.optString("enlace"))
                "datos" -> bombear(o.optString("enlace"))
                "permisos" -> pedirPermisos(true)
                "l2cap" -> abrirCanal(o.optString("enlace"), o.optInt("psm"))
                "cerrar-l2cap" -> cerrarCanalDe(o.optString("enlace"), "cerrado por la app")
                "leer-psm" -> leerPsm(o.optString("enlace"), 0)
                "canal-rapido" -> canalRapido = o.optBoolean("activo")
                "compartir" -> compartirRegistro(o.optString("titulo"), o.optString("texto"))
                "parar" -> {
                    activo = false
                    parar()
                }
            }
        } catch (e: SecurityException) {
            radio("sin-permiso", textoSinPermiso())
        } catch (e: Exception) {
            // Una orden que falla no tumba la radio.
        }
    }

    private fun evento(j: JSONObject) {
        try {
            PuenteBle.evento(j.toString())
        } catch (t: Throwable) {
            // Sin librería no hay nadie a quien contarlo.
        }
    }

    private fun radio(estado: String, motivo: String) {
        ultimoEstado = estado
        evento(JSONObject().put("e", "radio").put("estado", estado).put("motivo", motivo))
    }

    /** (BLE1108C) Un hito de la radio para el registro de Rust (`enlaces.log`): nunca cambia el estado del enlace. */
    private fun nota(tipo: String, enlace: String?, detalle: String) {
        val j = JSONObject().put("e", "nota").put("tipo", tipo).put("detalle", detalle)
        if (enlace != null) j.put("enlace", enlace)
        evento(j)
    }

    private fun desconectado(enlace: String, motivo: String) {
        cerrarCanalDe(enlace, "el enlace Bluetooth se cerró")
        evento(JSONObject().put("e", "desconectado").put("enlace", enlace).put("motivo", motivo))
        reanudarRadio()
    }

    /**
     * (BLE1108B) Tras CUALQUIER caída vuelve a anunciarse y asegura el escaneo: en Android un anuncio
     * conectable puede quedar parado al conectarse alguien y, sin él, la otra neurona no encuentra a
     * esta para reconectar. Rust reconecta con 0 s, 2 s, 5 s y luego cada 15 s.
     *
     * (BLE1108C) Solo ARRANCA lo que falta (anuncio y escaneo): no para un anuncio que ya está, no toca el
     * servidor GATT ni los clientes, así que un enlace en marcha jamás se cae por esto.
     */
    private fun reanudarRadio() {
        // (MLL1111C) Una sola reanudación pendiente: una ráfaga de avisos no programa cientos (prueba 35: ~300 por segundo).
        if (reanudarPendiente) return
        reanudarPendiente = true
        principal.postDelayed({
            reanudarPendiente = false
            if (!activo || ultimoEstado != "encendida") return@postDelayed
            if (!anunciando) anunciar(false)
            escanear()
        }, 400)
    }

    private val receptorEstado = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.getIntExtra(BluetoothAdapter.EXTRA_STATE, -1)) {
                BluetoothAdapter.STATE_ON -> principal.post { if (activo) arrancar() }
                BluetoothAdapter.STATE_TURNING_OFF, BluetoothAdapter.STATE_OFF -> principal.post {
                    limpiar("el Bluetooth de este aparato se apagó")
                    radio("apagada", "El Bluetooth de este aparato está apagado: enciéndelo en los ajustes rápidos.")
                }
            }
        }
    }

    // ───────────────────────────── Permisos ─────────────────────────────

    private fun permisosNecesarios(): Array<String> =
        if (Build.VERSION.SDK_INT >= 31) {
            arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }

    private fun permisos(): Boolean = permisosNecesarios().all { ctx.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }

    private fun textoSinPermiso(): String =
        if (Build.VERSION.SDK_INT >= 31) {
            "Falta el permiso «Dispositivos cercanos»: sin él StarSeed no puede buscar, anunciarse ni conectar por Bluetooth."
        } else {
            "Falta el permiso de ubicación: hasta Android 11, Android lo exige para buscar aparatos Bluetooth (StarSeed no usa tu ubicación)."
        }

    private fun textoPermiso(): String =
        if (Build.VERSION.SDK_INT >= 31) {
            "StarSeed usa el Bluetooth para hablar directamente con tus otras neuronas cercanas, sin Wi-Fi ni internet.\n\n" +
                "Android te pedirá «Dispositivos cercanos»: sirve para buscarlas, anunciarse y conectar con ellas. No se usa para saber dónde estás."
        } else {
            "StarSeed usa el Bluetooth para hablar directamente con tus otras neuronas cercanas, sin Wi-Fi ni internet.\n\n" +
                "Hasta Android 11, Android pide «Ubicación» para poder buscar aparatos Bluetooth (y la ubicación del aparato tiene que estar activada). " +
                "StarSeed no usa ni guarda tu ubicación."
        }

    /** Explica en claro y pide los permisos (una vez sola; `forzar`: lo pidió la persona desde la web). */
    private fun pedirPermisos(forzar: Boolean) {
        if (permisos()) return
        val prefs = ctx.getSharedPreferences(PREFERENCIAS, Context.MODE_PRIVATE)
        val yaPreguntado = prefs.getBoolean("preguntado", false)
        if (!forzar && yaPreguntado) return
        val a = actual?.get()
        if (a == null || a.isFinishing) {
            pendientePermisos = true
            return
        }
        pendientePermisos = false
        prefs.edit().putBoolean("preguntado", true).apply()
        // Si Android ya no deja volver a preguntar (dijo «no» dos veces), se abre la ficha de la app.
        val bloqueado = yaPreguntado && permisosNecesarios().none { a.shouldShowRequestPermissionRationale(it) }
        try {
            AlertDialog.Builder(a)
                .setTitle("Bluetooth directo")
                .setMessage(textoPermiso() + if (bloqueado) "\n\nAndroid ya no deja preguntarlo aquí: se abrirán los ajustes de la app (Permisos › Dispositivos cercanos)." else "")
                .setPositiveButton("Continuar") { _, _ ->
                    if (bloqueado) {
                        try {
                            a.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + a.packageName)))
                        } catch (e: Exception) {
                        }
                    } else {
                        a.requestPermissions(permisosNecesarios(), PETICION_PERMISOS)
                    }
                }
                .setNegativeButton("Ahora no", null)
                .show()
        } catch (e: Exception) {
            pendientePermisos = true
        }
    }

    // ───────────────────────────── Radio ─────────────────────────────

    private fun arrancar() {
        if (!activo) return
        val mgr = ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        val a = mgr?.adapter
        if (a == null || !ctx.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)) {
            radio("no-disponible", "Este aparato no tiene Bluetooth de baja energía.")
            return
        }
        adaptador = a
        if (!permisos()) {
            radio("sin-permiso", textoSinPermiso())
            pedirPermisos(false)
            return
        }
        if (!a.isEnabled) {
            radio("apagada", "El Bluetooth de este aparato está apagado: enciéndelo en los ajustes rápidos.")
            return
        }
        if (!abrirServidor(mgr)) return
        // (BLE1109B) El socket L2CAP se crea en su propio hilo cuando el servicio GATT ya está registrado (`onServiceAdded`).
        escanear()
        if (!vigiaAutocura) {
            vigiaAutocura = true
            ultimoEnlaceMs = SystemClock.elapsedRealtime()
            principal.postDelayed({ vigilarAutocura() }, VIGIA_AUTOCURA_MS)
        }
        // Rust contesta con «anunciar» (el UUID de esta ventana de 5 min).
        radio("encendida", if (a.bluetoothLeAdvertiser == null) "Bluetooth encendido, pero este aparato no puede anunciarse: solo busca y conecta." else "")
    }

    private fun limpiar(motivo: String) {
        try {
            if (escaneando) adaptador?.bluetoothLeScanner?.stopScan(escaneo)
        } catch (e: Exception) {
        }
        escaneando = false
        try {
            if (anunciando) adaptador?.bluetoothLeAdvertiser?.stopAdvertising(anuncio)
        } catch (e: Exception) {
        }
        anunciando = false
        for ((k, c) in clientes.entries.toList()) {
            try {
                c.gatt.disconnect()
                c.gatt.close()
            } catch (e: Exception) {
            }
            desconectado(k, motivo)
        }
        clientes.clear()
        for ((k, c) in centrales.entries.toList()) {
            if (c.suscrito) desconectado(k, motivo)
        }
        centrales.clear()
        try {
            servidor?.close()
        } catch (e: Exception) {
        }
        servidor = null
        salida = null
        servicioListo = false
        pendienteServidor = null
        servidorOcupadoDesde = 0L
        // (BLE1109A) El canal rápido muere con la radio.
        for (k in canales.keys.toList()) cerrarCanalDe(k, motivo)
        for (k in conectando.keys.toList()) cerrarCanalDe(k, motivo)
        generacionL2cap++
        try {
            servidorL2cap?.close()
        } catch (e: Exception) {
        }
        servidorL2cap = null
        psmPublicado = 0
    }

    private fun parar() {
        limpiar("Bluetooth directo apagado")
    }

    // ───────────────────────────── Servidor GATT (periférico) ─────────────────────────────

    private fun abrirServidor(mgr: BluetoothManager): Boolean {
        if (servidor != null) return true
        val s = mgr.openGattServer(ctx, servidorCb)
        if (s == null) {
            radio("no-disponible", "Android no dejó abrir el servidor Bluetooth de StarSeed.")
            return false
        }
        val servicio = BluetoothGattService(SERVICIO, BluetoothGattService.SERVICE_TYPE_PRIMARY)
        val entrada = BluetoothGattCharacteristic(
            ENTRADA,
            BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
            BluetoothGattCharacteristic.PERMISSION_WRITE,
        )
        val sal = BluetoothGattCharacteristic(SALIDA, BluetoothGattCharacteristic.PROPERTY_NOTIFY, BluetoothGattCharacteristic.PERMISSION_READ)
        sal.addDescriptor(BluetoothGattDescriptor(CCCD, BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE))
        servicio.addCharacteristic(entrada)
        servicio.addCharacteristic(sal)
        // (BLE1109A) PSM del canal rápido: se responde en `onCharacteristicReadRequest`. (BLE1109B) Solo con el ajuste encendido.
        if (canalRapido) {
            servicio.addCharacteristic(BluetoothGattCharacteristic(PSM_UUID, BluetoothGattCharacteristic.PROPERTY_READ, BluetoothGattCharacteristic.PERMISSION_READ))
        }
        servidor = s
        salida = sal
        servicioListo = false
        s.addService(servicio)
        return true
    }

    private val servidorCb = object : BluetoothGattServerCallback() {
        override fun onServiceAdded(status: Int, service: BluetoothGattService?) {
            principal.post {
                servicioListo = status == BluetoothGatt.GATT_SUCCESS
                anunciar()
                if (servicioListo) abrirServidorL2cap() // BLE1109B: ya registrado; el socket se crea en OTRO hilo
            }
        }

        override fun onConnectionStateChange(device: BluetoothDevice?, status: Int, newState: Int) {
            val d = device ?: return
            principal.post {
                val k = "p:" + d.address
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    if (!centrales.containsKey(k)) {
                        centrales[k] = nuevaCentral(k, d)
                        contConexiones++ // MLL1111C: hechos reales
                    }
                    val central = centrales[k]
                    pedirPhy2M { if (centrales[k]?.suscrito == true) servidor?.setPreferredPhy(d, BluetoothDevice.PHY_LE_2M_MASK, BluetoothDevice.PHY_LE_2M_MASK, BluetoothDevice.PHY_OPTION_NO_PREFERRED) }
                    // (BLE1108C) Si el otro conecta y no se suscribe a SALIDA, se anota y se suelta (él reintenta).
                    principal.postDelayed({
                        val c = centrales[k]
                        if (c != null && c === central && !c.suscrito) {
                            nota("sin-suscripcion", k, "el otro aparato conectó pero no se suscribió en ${VIGIA_SUSCRIPCION_MS / 1000} s; se suelta")
                            centrales.remove(k)
                            try {
                                servidor?.cancelConnection(c.device)
                            } catch (e: Exception) {
                            }
                            reanudarRadio() // MLL1111C: su desconexión llegará como repetida y ya no reanuda la radio
                        }
                    }, VIGIA_SUSCRIPCION_MS)
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    val c = centrales.remove(k)
                    // (MLL1111C) Gemelo de `ble_autocura::clasificar_desconexion`. Un aparato que NO constaba como conectado
                    // es un aviso repetido (el eco de nuestro propio `cancelConnection`): no se cancela otra vez, no cuenta
                    // como caída y no toca la radio. Antes cada aviso cancelaba de nuevo → otro aviso → bucle de ~300/s
                    // («tormenta» de 18 000/min) y el anuncio no llegaba a arrancar nunca: nueve horas sin enlace.
                    if (c == null) {
                        contRepetidas++
                        return@post
                    }
                    contReales++
                    // (BLE1110A) Una desconexión real olvida el MTU; las que provoca la propia cura no (la ACL puede seguir viva).
                    if (!enGracia(SystemClock.elapsedRealtime())) paqueteRecordado.remove(k)
                    // (BLE1109B) Libera la conexión en la pila de Android: sin esto, tras caídas con estado ≠ 0 el servidor podía
                    // quedarse con conexiones a medias y dejar de aceptar centrales (macOS: «Device disconnected without being ready»).
                    try {
                        servidor?.cancelConnection(d)
                    } catch (e: Exception) {
                    }
                    anotarCaida()
                    if (c?.suscrito == true) desconectado(k, "el otro aparato se desconectó (estado $status)") else reanudarRadio()
                }
            }
        }

        override fun onMtuChanged(device: BluetoothDevice?, mtu: Int) {
            val d = device ?: return
            principal.post {
                val k = "p:" + d.address
                val c = centrales.getOrPut(k) { nuevaCentral(k, d) }
                val antes = c.paquete
                c.paquete = (mtu - 3).coerceIn(PAQUETE_MIN, PAQUETE_MAX)
                paqueteRecordado[k] = c.paquete
                if (antes != c.paquete) nota("mtu-cambio", k, "paquete $antes → ${c.paquete} (mtu $mtu)")
                if (c.suscrito) evento(JSONObject().put("e", "mtu").put("enlace", k).put("paquete", c.paquete))
            }
        }

        /** (BLE1109A) El central lee el PSM del canal rápido (0 mientras no haya canal: él sigue por GATT). */
        override fun onCharacteristicReadRequest(device: BluetoothDevice?, requestId: Int, offset: Int, characteristic: BluetoothGattCharacteristic?) {
            val d = device ?: return
            val psm = psmPublicado
            val valor = byteArrayOf((psm shr 8).toByte(), psm.toByte())
            val bien = characteristic?.uuid == PSM_UUID && offset in 0..valor.size
            try {
                servidor?.sendResponse(d, requestId, if (bien) BluetoothGatt.GATT_SUCCESS else BluetoothGatt.GATT_READ_NOT_PERMITTED, offset, if (bien) valor.copyOfRange(offset, valor.size) else null)
            } catch (e: Exception) {
            }
        }

        override fun onDescriptorReadRequest(device: BluetoothDevice?, requestId: Int, offset: Int, descriptor: BluetoothGattDescriptor?) {
            val d = device ?: return
            val suscrito = centrales["p:" + d.address]?.suscrito == true
            val valor = if (suscrito) BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE else BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE
            try {
                servidor?.sendResponse(d, requestId, BluetoothGatt.GATT_SUCCESS, 0, valor)
            } catch (e: Exception) {
            }
        }

        override fun onDescriptorWriteRequest(
            device: BluetoothDevice?,
            requestId: Int,
            descriptor: BluetoothGattDescriptor?,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?,
        ) {
            val d = device ?: return
            if (responseNeeded) {
                try {
                    servidor?.sendResponse(d, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
                } catch (e: Exception) {
                }
            }
            if (descriptor == null || descriptor.uuid != CCCD || descriptor.characteristic?.uuid != SALIDA) return
            val encendido = value != null && value.isNotEmpty() && (value[0].toInt() and 1) != 0
            principal.post {
                val k = "p:" + d.address
                val c = centrales.getOrPut(k) { nuevaCentral(k, d) }
                if (encendido && !c.suscrito) {
                    // (BLE1110A) Nunca paquetes de 20 B a un central que negoció 512: se usa el MTU recordado; sin él y en el mínimo,
                    // se suelta UNA vez la conexión para que el central reconecte y renegocie.
                    val ahoraMs = SystemClock.elapsedRealtime()
                    if (c.paquete <= PAQUETE_MIN) {
                        val rec = paqueteRecordado[k]
                        if (rec != null && rec > PAQUETE_MIN) {
                            nota("mtu-cambio", k, "paquete ${c.paquete} → $rec (recordado de la negociación anterior)")
                            c.paquete = rec
                        } else if (soltadoMtuMs[k]?.let { ahoraMs - it < ESPERA_SOLTAR_MTU_MS } != true) {
                            soltadoMtuMs[k] = ahoraMs
                            nota("mtu-soltado", k, "se suscribió con paquete ${c.paquete} B y sin MTU negociado: se suelta para que renegocie")
                            centrales.remove(k)
                            try {
                                servidor?.cancelConnection(d)
                            } catch (e: Exception) {
                            }
                            return@post
                        }
                    }
                    c.suscrito = true
                    marcarActividad()
                    nota("suscrito", k, "el otro aparato activó las notificaciones de SALIDA, paquete ${c.paquete}")
                    evento(JSONObject().put("e", "conectado").put("enlace", k).put("rol", "periferico").put("direccion", d.address).put("paquete", c.paquete))
                    bombearServidor()
                } else if (!encendido && c.suscrito) {
                    c.suscrito = false
                    desconectado(k, "el otro aparato se desuscribió")
                }
            }
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice?,
            requestId: Int,
            characteristic: BluetoothGattCharacteristic?,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?,
        ) {
            val d = device ?: return
            if (responseNeeded) {
                try {
                    servidor?.sendResponse(d, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
                } catch (e: Exception) {
                }
            }
            if (characteristic?.uuid != ENTRADA || value == null || value.isEmpty() || preparedWrite || offset != 0) return
            val copia = value.copyOf()
            marcarTrafico()
            principal.post {
                val k = "p:" + d.address
                // Solo de quien se suscribió a SALIDA (así abre el enlace un central StarSeed).
                if (centrales[k]?.suscrito == true) {
                    try {
                        PuenteBle.datos(k, aHex(copia))
                    } catch (t: Throwable) {
                    }
                }
            }
        }

        override fun onNotificationSent(device: BluetoothDevice?, status: Int) {
            principal.post {
                servidorOcupadoDesde = 0L
                bombearServidor()
            }
        }
    }

    /** Una notificación en vuelo para todo el servidor (Android no admite más), por turnos entre centrales. */
    private fun bombearServidor() {
        val s = servidor ?: return
        val sal = salida ?: return
        if (servidorOcupadoDesde != 0L) {
            if (SystemClock.elapsedRealtime() - servidorOcupadoDesde < VIGIA_ESCRITURA_MS) return
            tardesServidor += 1
            if (tardesServidor <= 3 || tardesServidor % 50 == 0) {
                nota("listo-tarde", null, "sin onNotificationSent en $VIGIA_ESCRITURA_MS ms: se notifica igual (aviso $tardesServidor)")
            }
        }
        servidorOcupadoDesde = 0L
        pendienteServidor?.let { (k, b) ->
            val c = centrales[k]
            if (c == null || !c.suscrito) {
                pendienteServidor = null
            } else {
                if (notificar(s, sal, c.device, b)) {
                    pendienteServidor = null
                    servidorOcupadoDesde = SystemClock.elapsedRealtime()
                } else {
                    principal.postDelayed({ bombearServidor() }, 15)
                }
                return
            }
        }
        val lista = centrales.entries.filter { it.value.suscrito }.map { it.key }.sorted()
        if (lista.isEmpty()) return
        for (i in lista.indices) {
            val k = lista[(turno + i) % lista.size]
            val b = deHex(siguiente(k)) ?: continue
            turno += 1
            val c = centrales[k] ?: continue
            if (notificar(s, sal, c.device, b)) {
                servidorOcupadoDesde = SystemClock.elapsedRealtime()
                marcarTrafico()
            } else {
                pendienteServidor = Pair(k, b)
                principal.postDelayed({ bombearServidor() }, 15)
            }
            return
        }
    }

    private fun notificar(s: BluetoothGattServer, sal: BluetoothGattCharacteristic, d: BluetoothDevice, b: ByteArray): Boolean =
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                s.notifyCharacteristicChanged(d, sal, false, b) == BluetoothStatusCodes.SUCCESS
            } else {
                notificarAntiguo(s, sal, d, b)
            }
        } catch (e: Exception) {
            false
        }

    // ───────────────────────────── Anuncio y escaneo ─────────────────────────────

    private val anuncio = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            principal.post {
                anunciando = true
                anuncioPedidoMs = -1L // MLL1111C: confirmado
                reintentoAnuncio = false
            }
        }

        override fun onStartFailure(errorCode: Int) {
            principal.post {
                anuncioPedidoMs = -1L // MLL1111C: la pila contestó (bien o mal): se puede volver a pedir
                // (BLE1110A) Código 3 = ADVERTISE_FAILED_ALREADY_STARTED: el anuncio YA está activo. No es un fallo ni se dice
                // «solo busca y conecta». Una vez se para y se vuelve a arrancar para verificarlo; si vuelve a decir 3, se da por activo.
                if (errorCode == AdvertiseCallback.ADVERTISE_FAILED_ALREADY_STARTED) {
                    anunciando = true
                    if (!reintentoAnuncio) {
                        reintentoAnuncio = true
                        nota("anuncio-ya-activo", null, "código 3: ya estaba anunciando; se para y se arranca una vez para verificarlo")
                        anunciar()
                    } else {
                        reintentoAnuncio = false
                        nota("anuncio-ya-activo", null, "código 3 otra vez tras parar y arrancar: el anuncio está activo")
                    }
                    return@post
                }
                reintentoAnuncio = false
                anunciando = false
                if (ultimoEstado == "encendida") {
                    radio("encendida", "Bluetooth encendido, pero Android no dejó anunciarse (código $errorCode): solo busca y conecta.")
                }
            }
        }
    }

    /** Anuncia SOLO el UUID rotatorio (cabe en el paquete principal: 3 B de indicadores + 18 B). */
    private fun anunciar(forzar: Boolean = true) {
        anuncioUuid ?: return
        if (!activo || !servicioListo) return
        val adv = adaptador?.bluetoothLeAdvertiser ?: return
        // (MLL1111C) Gemelo de `ble_autocura::Anuncio::pedir`: un arranque en curso (pedido hace < 3 s y sin confirmar) no se
        // reinicia, y si ya se anuncia solo se rearranca forzado (UUID nuevo, servidor recreado).
        val ahora = SystemClock.elapsedRealtime()
        if (anuncioPedidoMs >= 0 && ahora - anuncioPedidoMs < CONFIRMAR_ANUNCIO_MS) return
        if (anunciando && !forzar) return
        // (BLE1110A) SIEMPRE se para antes de arrancar (`anunciando` puede ir por detrás de la pila) y se espera un poco.
        try {
            adv.stopAdvertising(anuncio)
        } catch (e: Exception) {
        }
        anunciando = false
        anuncioPedidoMs = ahora
        val turno = ++anuncioTurno
        principal.postDelayed({
            val uuid = anuncioUuid
            if (turno == anuncioTurno && activo && servicioListo && uuid != null) empezarAnuncio(adv, uuid) else anuncioPedidoMs = -1L
        }, 300)
    }

    private fun empezarAnuncio(adv: android.bluetooth.le.BluetoothLeAdvertiser, u: String) {
        val ajustes = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
            .setConnectable(true)
            .setTimeout(0)
            .build()
        val datos = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .setIncludeTxPowerLevel(false)
            .addServiceUuid(ParcelUuid(UUID.fromString(u)))
            .build()
        adv.startAdvertising(ajustes, datos, anuncio)
    }

    private val escaneo = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult?) {
            val r = result ?: return
            principal.post { visto(r) }
        }

        override fun onBatchScanResults(results: MutableList<ScanResult>?) {
            val l = results?.toList() ?: return
            principal.post { for (r in l) visto(r) }
        }

        override fun onScanFailed(errorCode: Int) {
            principal.post {
                escaneando = false
                // Android limita los arranques de escaneo (5 cada 30 s): se reintenta con calma.
                principal.postDelayed({ if (activo && ultimoEstado == "encendida") escanear() }, 30_000)
            }
        }
    }

    /** Escaneo con filtro por los 3 primeros bytes («SS·B1»): Android lo deja seguir con la pantalla apagada. */
    private fun escanear() {
        if (escaneando) return
        val sc = adaptador?.bluetoothLeScanner ?: return
        val filtro = ScanFilter.Builder().setServiceUuid(ParcelUuid(PREFIJO), ParcelUuid(MASCARA)).build()
        val ajustes = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_BALANCED).build()
        sc.startScan(listOf(filtro), ajustes, escaneo)
        escaneando = true
    }

    private fun esAnuncio(u: UUID): Boolean = ((u.mostSignificantBits ushr 40) and 0xffffffL) == 0x5353b1L

    private fun visto(r: ScanResult) {
        val u = r.scanRecord?.serviceUuids?.map { it.uuid }?.firstOrNull { esAnuncio(it) } ?: return
        val dir = r.device?.address ?: return
        val ahora = SystemClock.elapsedRealtime()
        // El dispositivo del escaneo conserva el tipo de dirección (aleatoria): con él se conecta.
        vistos[dir] = Pair(r.device, ahora)
        if (vistos.size > 256) vistos.entries.removeAll { ahora - it.value.second > 60_000 }
        val texto = u.toString()
        val previo = ultimoAviso[dir]
        if (previo != null && previo.first == texto && ahora - previo.second < 1_000) return
        ultimoAviso[dir] = Pair(texto, ahora)
        if (ultimoAviso.size > 256) ultimoAviso.clear()
        evento(JSONObject().put("e", "visto").put("direccion", dir).put("uuid", texto).put("rssi", r.rssi))
    }

    // ───────────────────────────── Clientes GATT (central) ─────────────────────────────

    private fun conectar(dir: String) {
        val k = "c:$dir"
        if (!activo || clientes.containsKey(k)) return
        val d = vistos[dir]?.first ?: run {
            desconectado(k, "ese aparato ya no se oye")
            return
        }
        val g = d.connectGatt(ctx, false, clienteCb, BluetoothDevice.TRANSPORT_LE)
        if (g == null) {
            desconectado(k, "Android no dejó conectar")
            return
        }
        clientes[k] = Cliente(dir, g)
        // Vigía: si en 20 s no quedó listo, se cierra (Rust lo reintenta más tarde).
        principal.postDelayed({
            val c = clientes[k]
            if (c != null && !c.listo && c.gatt === g) cerrarCliente(k, "no terminó de conectar en 20 s")
        }, 20_000)
    }

    private fun cerrarCliente(k: String, motivo: String) {
        val c = clientes.remove(k) ?: return
        try {
            c.gatt.disconnect()
            c.gatt.close()
        } catch (e: Exception) {
        }
        desconectado(k, motivo)
    }

    private fun desconectar(k: String) {
        if (k.startsWith("c:")) {
            cerrarCliente(k, "cerrado por la app")
        } else if (k.startsWith("p:")) {
            val c = centrales.remove(k) ?: return
            try {
                servidor?.cancelConnection(c.device)
            } catch (e: Exception) {
            }
        }
    }

    private fun clientePor(g: BluetoothGatt?): Pair<String, Cliente>? {
        val d = g?.device?.address ?: return null
        val k = "c:$d"
        val c = clientes[k] ?: return null
        return if (c.gatt === g) Pair(k, c) else null
    }

    private val clienteCb = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt?, status: Int, newState: Int) {
            principal.post {
                val (k, c) = clientePor(gatt) ?: return@post
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    try {
                        c.gatt.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_HIGH)
                    } catch (e: Exception) {
                    }
                    pedirPhy2M { if (clientes[k]?.listo == true) c.gatt.setPreferredPhy(BluetoothDevice.PHY_LE_2M_MASK, BluetoothDevice.PHY_LE_2M_MASK, BluetoothDevice.PHY_OPTION_NO_PREFERRED) }
                    // Primero el MTU (hasta 517: paquetes de 512 B); los servicios, cuando conteste.
                    if (!c.gatt.requestMtu(MTU_PEDIDO)) c.gatt.discoverServices()
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    cerrarCliente(k, "desconectado (estado $status)")
                }
            }
        }

        override fun onMtuChanged(gatt: BluetoothGatt?, mtu: Int, status: Int) {
            principal.post {
                val (k, c) = clientePor(gatt) ?: return@post
                if (status == BluetoothGatt.GATT_SUCCESS) c.paquete = (mtu - 3).coerceIn(PAQUETE_MIN, PAQUETE_MAX)
                if (c.listo) {
                    evento(JSONObject().put("e", "mtu").put("enlace", k).put("paquete", c.paquete))
                } else {
                    c.gatt.discoverServices()
                }
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt?, status: Int) {
            principal.post {
                val (k, c) = clientePor(gatt) ?: return@post
                val s = c.gatt.getService(SERVICIO)
                val e = s?.getCharacteristic(ENTRADA)
                val sal = s?.getCharacteristic(SALIDA)
                val d = sal?.getDescriptor(CCCD)
                if (status != BluetoothGatt.GATT_SUCCESS || e == null || sal == null || d == null) {
                    cerrarCliente(k, "no es una neurona StarSeed (sin su servicio Bluetooth)")
                    return@post
                }
                c.entrada = e
                nota("servicios-descubiertos", k, "servicio StarSeed encontrado, suscribiendo a SALIDA")
                c.gatt.setCharacteristicNotification(sal, true)
                if (!escribirDescriptor(c.gatt, d)) reintentarSuscripcion(k, c, "no se pudo pedir la suscripción")
            }
        }

        /** (BLE1108C) La suscripción a SALIDA no quedó: se anota y se repite (a 1 s) antes de cerrar el enlace. */
        private fun reintentarSuscripcion(k: String, c: Cliente, motivo: String) {
            if (c.reintentosSub >= REINTENTOS_SUSCRIPCION) {
                nota("sin-suscripcion", k, "$motivo; sin más reintentos, se cierra el enlace")
                cerrarCliente(k, "no se pudo suscribir a sus avisos")
                return
            }
            c.reintentosSub += 1
            nota("sin-suscripcion", k, "$motivo; reintento ${c.reintentosSub} de $REINTENTOS_SUSCRIPCION")
            principal.postDelayed({
                val vivo = clientes[k]
                if (vivo === c && !c.listo) {
                    val d = c.gatt.getService(SERVICIO)?.getCharacteristic(SALIDA)?.getDescriptor(CCCD)
                    if (d == null || !escribirDescriptor(c.gatt, d)) {
                        reintentarSuscripcion(k, c, "no se pudo pedir la suscripción")
                    } else {
                        nota("suscripcion-reintento", k, "pidiendo de nuevo las notificaciones de SALIDA")
                    }
                }
            }, ESPERA_SUSCRIPCION_MS)
        }

        override fun onDescriptorWrite(gatt: BluetoothGatt?, descriptor: BluetoothGattDescriptor?, status: Int) {
            principal.post {
                val (k, c) = clientePor(gatt) ?: return@post
                if (descriptor?.uuid != CCCD) return@post
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    reintentarSuscripcion(k, c, "no aceptó la suscripción (estado $status)")
                    return@post
                }
                c.listo = true
                nota("suscrito", k, "notificaciones de SALIDA activas, paquete ${c.paquete}")
                evento(JSONObject().put("e", "conectado").put("enlace", k).put("rol", "central").put("direccion", c.direccion).put("paquete", c.paquete))
                marcarActividad()
                // (BLE1109B) El PSM NO se lee aquí: Rust ordena `leer-psm` cuando el enlace queda ligado por GATT, para que la
                // lectura nunca compita con el saludo firmado.
                bombear(k)
            }
        }

        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
            if (characteristic.uuid != SALIDA) return
            val copia = value.copyOf()
            principal.post { recibidoCliente(gatt, copia) }
        }

        @Deprecated("Android 12 y anteriores")
        @Suppress("DEPRECATION")
        override fun onCharacteristicChanged(gatt: BluetoothGatt?, characteristic: BluetoothGattCharacteristic?) {
            val ch = characteristic ?: return
            if (ch.uuid != SALIDA) return
            val copia = ch.value?.copyOf() ?: return
            principal.post { recibidoCliente(gatt, copia) }
        }

        override fun onCharacteristicRead(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray, status: Int) {
            val copia = value.copyOf()
            principal.post { psmLeido(gatt, characteristic, copia, status) }
        }

        @Deprecated("Android 12 y anteriores")
        @Suppress("DEPRECATION")
        override fun onCharacteristicRead(gatt: BluetoothGatt?, characteristic: BluetoothGattCharacteristic?, status: Int) {
            val ch = characteristic ?: return
            val copia = ch.value?.copyOf() ?: return
            principal.post { psmLeido(gatt, ch, copia, status) }
        }

        override fun onCharacteristicWrite(gatt: BluetoothGatt?, characteristic: BluetoothGattCharacteristic?, status: Int) {
            principal.post {
                val (k, c) = clientePor(gatt) ?: return@post
                c.ocupadoDesde = 0L
                bombear(k)
            }
        }
    }

    private fun recibidoCliente(gatt: BluetoothGatt?, b: ByteArray) {
        val (k, c) = clientePor(gatt) ?: return
        if (!c.listo) return
        marcarTrafico()
        try {
            PuenteBle.datos(k, aHex(b))
        } catch (t: Throwable) {
        }
    }

    /** Escribe en ENTRADA sin respuesta, uno detrás de otro (cada uno espera su `onCharacteristicWrite`). */
    private fun bombear(k: String) {
        // (BLE1109A) Con el canal L2CAP abierto se despierta al hilo que escribe en su flujo. (BLE1109B) GATT sigue su camino:
        // Rust decide por qué carril sale cada paquete (por GATT solo sale algo mientras el canal no esté EN USO).
        canales[k]?.senal?.offer(true)
        if (k.startsWith("p:")) {
            bombearServidor()
            return
        }
        val c = clientes[k] ?: return
        if (!c.listo) return
        if (c.ocupadoDesde != 0L) {
            if (SystemClock.elapsedRealtime() - c.ocupadoDesde < VIGIA_ESCRITURA_MS) return
            c.tardes += 1
            if (c.tardes <= 3 || c.tardes % 50 == 0) {
                nota("listo-tarde", k, "sin onCharacteristicWrite en $VIGIA_ESCRITURA_MS ms: se escribe igual (aviso ${c.tardes})")
            }
        }
        c.ocupadoDesde = 0L
        val e = c.entrada ?: return
        val b = c.pendiente ?: deHex(siguiente(k)) ?: return
        if (escribir(c.gatt, e, b)) {
            c.pendiente = null
            c.ocupadoDesde = SystemClock.elapsedRealtime()
        } else {
            // La pila está ocupada: el mismo paquete, en un momento (nunca se pierde).
            c.pendiente = b
            principal.postDelayed({ bombear(k) }, 15)
        }
    }

    private fun siguiente(k: String): String =
        try {
            PuenteBle.siguiente(k)
        } catch (t: Throwable) {
            ""
        }

    private fun escribir(g: BluetoothGatt, e: BluetoothGattCharacteristic, b: ByteArray): Boolean =
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                g.writeCharacteristic(e, b, BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE) == BluetoothStatusCodes.SUCCESS
            } else {
                escribirAntiguo(g, e, b)
            }
        } catch (x: Exception) {
            false
        }

    @Suppress("DEPRECATION")
    private fun escribirAntiguo(g: BluetoothGatt, e: BluetoothGattCharacteristic, b: ByteArray): Boolean {
        e.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
        e.value = b
        return g.writeCharacteristic(e)
    }

    private fun escribirDescriptor(g: BluetoothGatt, d: BluetoothGattDescriptor): Boolean =
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                g.writeDescriptor(d, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) == BluetoothStatusCodes.SUCCESS
            } else {
                escribirDescriptorAntiguo(g, d)
            }
        } catch (x: Exception) {
            false
        }

    @Suppress("DEPRECATION")
    private fun escribirDescriptorAntiguo(g: BluetoothGatt, d: BluetoothGattDescriptor): Boolean {
        d.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
        return g.writeDescriptor(d)
    }

    @Suppress("DEPRECATION")
    private fun notificarAntiguo(s: BluetoothGattServer, sal: BluetoothGattCharacteristic, d: BluetoothDevice, b: ByteArray): Boolean {
        sal.value = b
        return s.notifyCharacteristicChanged(d, sal, false)
    }

    // ───────────────────────────── Hex ─────────────────────────────

    private val HEX = "0123456789abcdef".toCharArray()

    // ───────────────────────────── Autocuración del periférico (BLE1109B) ─────────────────────────────
    // Caso real del 09-11: tras varias caídas la tablet dejó de aceptar centrales (macOS: «Device disconnected without being
    // ready», 106 reintentos). Un vigía lo cura solo: si no hay ningún enlace vivo durante un rato CON una neurona anunciándose
    // cerca, o tras una tormenta de desconexiones, suelta lo que quedó a medias y reinicia el anuncio; a la segunda vez seguida
    // recrea además el servidor GATT (y su socket L2CAP, si el ajuste está encendido). Nunca toca un enlace en marcha.

    private const val VIGIA_AUTOCURA_MS = 30_000L
    private const val SIN_CENTRAL_MS = 90_000L
    private const val VENTANA_TORMENTA_MS = 60_000L
    private const val CAIDAS_TORMENTA = 4
    private const val VECINO_CERCA_MS = 60_000L

    // (BLE1110A) Reglas nuevas tras prueba.32 (68 curas, una tiró un enlace sano de 476 s). Gemelo de `ble_autocura.rs`
    // (misma decisión, con pruebas): jamás con un enlace ligado ni con tráfico en los últimos 30 s; como mucho una cura cada
    // 5 min; las desconexiones que provoca la propia cura no cuentan; y una línea de registro con la evidencia de cada cura.
    private const val SIN_TRAFICO_MS = 30_000L
    private const val ENTRE_CURAS_MS = 300_000L
    private const val GRACIA_CURA_MS = 20_000L
    // (MLL1111C) Gemelos de `ble_autocura.rs`.
    private const val ENTRE_CURAS_MAX_MS = 1_800_000L
    private const val CONFIRMAR_ANUNCIO_MS = 3_000L

    private fun marcarActividad() {
        ultimoEnlaceMs = SystemClock.elapsedRealtime()
        curasSeguidas = 0
    }

    /** Pasaron bytes por algún enlace (GATT o L2CAP, cualquier sentido). Se llama también desde los hilos del canal. */
    private fun marcarTrafico() {
        ultimoTraficoMs = SystemClock.elapsedRealtime()
    }

    private fun enGracia(ahora: Long): Boolean = ultimaCuraMs >= 0 && ahora - ultimaCuraMs < GRACIA_CURA_MS

    private fun nuevaCentral(k: String, d: BluetoothDevice): Central {
        val c = Central(d)
        paqueteRecordado[k]?.let { c.paquete = it }
        return c
    }

    private fun hayEnlaceVivo(): Boolean = centrales.values.any { it.suscrito } || clientes.values.any { it.listo } || canales.isNotEmpty()

    private fun vecinoCerca(): Boolean {
        val ahora = SystemClock.elapsedRealtime()
        return vistos.values.any { ahora - it.second < VECINO_CERCA_MS }
    }

    private fun anotarCaida() {
        val ahora = SystemClock.elapsedRealtime()
        if (enGracia(ahora)) return // las desconexiones de la propia cura no cuentan
        caidasRecientes.add(ahora)
        caidasRecientes.removeAll { ahora - it > VENTANA_TORMENTA_MS }
        if (caidasRecientes.size >= CAIDAS_TORMENTA && !evaluacionPendiente) {
            evaluacionPendiente = true
            principal.postDelayed({
                evaluacionPendiente = false
                evaluarAutocura()
            }, 2_000)
        }
    }

    private fun plazoEntreCuras(n: Int): Long =
        if (n <= 1) ENTRE_CURAS_MS else minOf(ENTRE_CURAS_MS shl minOf(n - 1, 10), ENTRE_CURAS_MAX_MS)

    /** (MLL1111C) Gemelo de `ble_autocura::ContadorEnlaces::cerrar`: una línea por minuto con hechos (un minuto callado no escribe). */
    private fun cerrarContador() {
        val ahora = SystemClock.elapsedRealtime()
        if (contDesdeMs < 0) contDesdeMs = ahora
        val ms = ahora - contDesdeMs
        if (ms < 60_000L) return
        if (contConexiones + contReales + contRepetidas > 0) {
            nota("contador-enlaces", null, "en ${ms / 1000} s: $contConexiones conexiones, $contReales desconexiones reales, $contRepetidas avisos repetidos ignorados")
        }
        contDesdeMs = ahora
        contConexiones = 0
        contReales = 0
        contRepetidas = 0
    }

    private fun vigilarAutocura() {
        if (!activo) {
            vigiaAutocura = false
            return
        }
        cerrarContador()
        evaluarAutocura()
        principal.postDelayed({ vigilarAutocura() }, VIGIA_AUTOCURA_MS)
    }

    /** La decisión (ver `ble_autocura::Autocura::decidir`). Solo aquí se cura. */
    private fun evaluarAutocura() {
        if (!activo || ultimoEstado != "encendida") return
        val ahora = SystemClock.elapsedRealtime()
        caidasRecientes.removeAll { ahora - it > VENTANA_TORMENTA_MS }
        if (hayEnlaceVivo()) {
            ultimoEnlaceMs = ahora
            caidasRecientes.clear()
            return
        }
        val desdeTrafico = if (ultimoTraficoMs >= 0) ahora - ultimoTraficoMs else -1L
        if (desdeTrafico in 0 until SIN_TRAFICO_MS) return
        // (MLL1111C) Gemelo de `ble_autocura::plazo_entre_curas`: 5, 5, 10, 20 y 30 min de tope según la racha.
        if (ultimaCuraMs >= 0 && ahora - ultimaCuraMs < plazoEntreCuras(curasSeguidas)) return
        val sinEnlaceMs = ahora - ultimoEnlaceMs
        val traficoTxt = if (desdeTrafico >= 0) "${desdeTrafico / 1000} s sin tráfico" else "sin tráfico desde que arrancó"
        val tormenta = caidasRecientes.size >= CAIDAS_TORMENTA
        val evidencia: String
        val recrear: Boolean
        if (tormenta) {
            evidencia = "tormenta de desconexiones (${caidasRecientes.size} en ${VENTANA_TORMENTA_MS / 1000} s), ningún enlace ligado, $traficoTxt, $curasSeguidas curas seguidas"
            recrear = true
        } else if (sinEnlaceMs > SIN_CENTRAL_MS && vecinoCerca()) {
            evidencia = "ningún enlace ligado desde hace ${sinEnlaceMs / 1000} s con una neurona anunciándose cerca, $traficoTxt, $curasSeguidas curas seguidas"
            recrear = curasSeguidas + 1 >= 2
        } else {
            return
        }
        ultimaCuraMs = ahora
        curasSeguidas += 1
        ultimoEnlaceMs = ahora
        caidasRecientes.clear()
        autocurar(evidencia, recrear)
    }

    private fun autocurar(motivo: String, recrearServidor: Boolean) {
        if (!activo || ultimoEstado != "encendida") return
        nota("autocuracion", null, "$motivo → " + if (recrearServidor) "recrea servidor GATT y anuncio" else "reinicia anuncio y suelta conexiones a medias")
        try {
            for ((k, c) in centrales.entries.toList()) {
                if (!c.suscrito) {
                    centrales.remove(k)
                    try {
                        servidor?.cancelConnection(c.device)
                    } catch (e: Exception) {
                    }
                }
            }
            try {
                if (anunciando) adaptador?.bluetoothLeAdvertiser?.stopAdvertising(anuncio)
            } catch (e: Exception) {
            }
            anunciando = false
            anuncioPedidoMs = -1L // MLL1111C: parado a propósito
            if (recrearServidor) {
                for ((k, c) in centrales.entries.toList()) {
                    if (c.suscrito) desconectado(k, "se recrea el servidor Bluetooth (autocuración)")
                }
                centrales.clear()
                for (k in canales.keys.toList()) cerrarCanalDe(k, "autocuración del servidor Bluetooth")
                generacionL2cap++
                try {
                    servidorL2cap?.close()
                } catch (e: Exception) {
                }
                servidorL2cap = null
                psmPublicado = 0
                try {
                    servidor?.close()
                } catch (e: Exception) {
                }
                servidor = null
                salida = null
                servicioListo = false
                pendienteServidor = null
                servidorOcupadoDesde = 0L
                val mgr = ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
                // `onServiceAdded` vuelve a anunciar cuando el servicio está listo.
                if (mgr != null) abrirServidor(mgr)
            } else {
                anunciar()
            }
            if (escaneando) {
                try {
                    adaptador?.bluetoothLeScanner?.stopScan(escaneo)
                } catch (e: Exception) {
                }
                escaneando = false
            }
            escanear()
        } catch (e: SecurityException) {
            radio("sin-permiso", textoSinPermiso())
        } catch (e: Exception) {
            nota("autocuracion", null, "falló: ${e.message ?: e.javaClass.simpleName}")
        }
    }

    /** (BLE1109B) «Compartir registro de enlaces»: la hoja de compartir de Android con el final de `enlaces.log`. */
    private fun compartirRegistro(titulo: String, texto: String) {
        if (texto.isEmpty()) return
        try {
            val envio = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_SUBJECT, titulo)
                putExtra(Intent.EXTRA_TEXT, texto)
            }
            val hoja = Intent.createChooser(envio, titulo)
            val a = actual?.get()
            if (a != null && !a.isFinishing) {
                a.startActivity(hoja)
            } else {
                hoja.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                ctx.startActivity(hoja)
            }
        } catch (e: Exception) {
            nota("compartir-fallido", null, e.message ?: e.javaClass.simpleName)
        }
    }

    // ───────────────────────────── Carril rápido: canal L2CAP (BLE1109A) ─────────────────────────────
    // Android 10+ (API 29). Periférico: `listenUsingInsecureL2capChannel` y su PSM en la característica PSM; central: lee el
    // PSM del otro y Rust ordena `l2cap` para conectar. Sin cifrar por el aire (va cifrado por encima, CIF1108A). La E/S
    // bloquea en dos hilos por canal; un vigía cierra el canal si una escritura no avanza. Rust marca y desmarca el flujo.

    /**
     * Pide el PHY de 2 Mbit/s donde se puede (Android 8+). (BLE1109B) NUNCA al conectar: cinco segundos después, con el enlace
     * ya suscrito (la condición la comprueba cada llamada), para que el cambio de PHY no choque con el MTU, el descubrimiento
     * de servicios ni el saludo. Si el sistema no lo da, sigue con 1M.
     */
    private fun pedirPhy2M(f: () -> Unit) {
        if (!canalRapido || Build.VERSION.SDK_INT < 26) return // sin el ajuste, el PHY es el de siempre
        principal.postDelayed({
            try {
                f()
            } catch (e: Exception) {
            }
        }, RETRASO_PHY_MS)
    }

    /**
     * (BLE1109B) Se llama desde `onServiceAdded`, con el servicio GATT ya registrado. TODO lo que puede bloquear
     * (`listenUsingInsecureL2capChannel`, leer su PSM, `accept()`) ocurre en un hilo propio: jamás en el hilo principal, que
     * atiende cada callback GATT, ni en los hilos binder de la pila. El PSM solo se publica cuando el socket ya existe.
     */
    private fun abrirServidorL2cap() {
        if (!canalRapido || Build.VERSION.SDK_INT < 29 || servidorL2cap != null) return
        val a = adaptador ?: return
        if (!abriendoL2cap.compareAndSet(false, true)) return
        val gen = generacionL2cap
        val hilo = Thread({ servirL2cap(a, gen) }, "starseed-l2cap-acepta")
        hilo.isDaemon = true
        hilo.start()
    }

    private fun servirL2cap(a: BluetoothAdapter, gen: Int) {
        var fallos = 0
        try {
            while (gen == generacionL2cap && activo && canalRapido) {
                val ss = try {
                    a.listenUsingInsecureL2capChannel()
                } catch (e: Exception) {
                    null
                }
                val psm = try {
                    ss?.psm ?: 0
                } catch (e: Exception) {
                    0
                }
                if (ss == null || psm <= 0) {
                    try {
                        ss?.close()
                    } catch (e: Exception) {
                    }
                    fallos++
                    nota("l2cap-servidor", null, "no se pudo crear el socket L2CAP (intento $fallos); GATT sigue igual")
                    SystemClock.sleep(minOf(60_000L, 2_000L shl minOf(fallos, 5)))
                    continue
                }
                if (gen != generacionL2cap) {
                    try {
                        ss.close()
                    } catch (e: Exception) {
                    }
                    return
                }
                fallos = 0
                servidorL2cap = ss
                psmPublicado = psm // solo ahora puede leerlo un central
                nota("l2cap-servidor", null, "socket L2CAP listo, psm=$psm")
                while (true) {
                    val socket = try {
                        ss.accept()
                    } catch (e: Exception) {
                        break // cerrado por nosotros (limpiar/autocura) o por el sistema
                    }
                    principal.post {
                        val k = "p:" + socket.remoteDevice.address
                        if (centrales[k]?.suscrito == true) iniciarCanal(k, socket, psmPublicado) else cerrarSocket(socket)
                    }
                }
                if (servidorL2cap === ss) {
                    servidorL2cap = null
                    psmPublicado = 0 // nadie debe leer un PSM que ya no acepta
                }
                try {
                    ss.close()
                } catch (e: Exception) {
                }
                SystemClock.sleep(2_000)
            }
        } finally {
            abriendoL2cap.set(false)
            // Una apertura pedida mientras este hilo terminaba (p. ej. tras recrear el servidor GATT) no se pierde.
            if (gen != generacionL2cap && activo && canalRapido) principal.post { abrirServidorL2cap() }
        }
    }

    /** (BLE1109B) Orden de Rust, con el enlace ya ligado: lee la característica PSM del periférico (reintenta si la pila está ocupada). */
    private fun leerPsm(k: String, intento: Int) {
        if (!canalRapido || k.startsWith("p:")) return
        val c = clientes[k] ?: return
        if (!c.listo) return
        val pedido = try {
            val ch = c.gatt.getService(SERVICIO)?.getCharacteristic(PSM_UUID)
            ch != null && c.gatt.readCharacteristic(ch)
        } catch (e: Exception) {
            false
        }
        if (!pedido && intento < 5 && c.gatt.getService(SERVICIO)?.getCharacteristic(PSM_UUID) != null) {
            principal.postDelayed({ leerPsm(k, intento + 1) }, 600L)
        }
    }

    private fun cerrarSocket(s: BluetoothSocket?) {
        try {
            s?.close()
        } catch (e: Exception) {
        }
    }

    /** Orden de Rust: abrir el canal con el PSM que publicó el periférico (este aparato es el central). */
    private fun abrirCanal(k: String, psm: Int) {
        val c = clientes[k]
        if (Build.VERSION.SDK_INT < 29 || c == null || !c.listo) {
            evento(JSONObject().put("e", "l2cap-cerrado").put("enlace", k).put("motivo", if (Build.VERSION.SDK_INT < 29) "Android anterior a 10: sin canales L2CAP" else "el aparato ya no está conectado"))
            return
        }
        if (canales.containsKey(k) || conectando.containsKey(k)) return
        val hilo = Thread({
            var socket: BluetoothSocket? = null
            try {
                socket = c.gatt.device.createInsecureL2capChannel(psm)
                conectando[k] = socket
                socket.connect()
                val abierto = socket
                principal.post {
                    conectando.remove(k)
                    if (clientes[k] === c) iniciarCanal(k, abierto, psm) else cerrarSocket(abierto)
                }
            } catch (e: Exception) {
                cerrarSocket(socket)
                principal.post {
                    // Si Rust ya cerró este intento (`cerrar-l2cap`), el cierre ya se contó: no se vuelve a decir.
                    if (conectando.remove(k) != null || socket == null) {
                        evento(JSONObject().put("e", "l2cap-cerrado").put("enlace", k).put("motivo", "no se pudo abrir el canal L2CAP: ${e.message ?: e.javaClass.simpleName}"))
                    }
                }
            }
        }, "starseed-l2cap-conecta")
        hilo.isDaemon = true
        hilo.start()
    }

    private fun iniciarCanal(k: String, socket: BluetoothSocket, psm: Int) {
        canales.remove(k)?.let { cerrarCanalHilos(it, "sustituido por otro canal") }
        val canal = Canal(k, socket, psm)
        canales[k] = canal
        evento(JSONObject().put("e", "l2cap-abierto").put("enlace", k).put("psm", psm))
        val lector = Thread({
            val buf = ByteArray(LECTURA_FLUJO)
            var motivo = "el otro aparato cerró el canal L2CAP"
            try {
                val ent = socket.inputStream
                while (!canal.cerrado.get()) {
                    val n = ent.read(buf)
                    if (n < 0) break
                    if (n > 0) {
                        canal.ultimaLecturaMs = SystemClock.elapsedRealtime()
                        marcarTrafico()
                        PuenteBle.rapido(k, aHex(buf.copyOf(n)))
                    }
                }
            } catch (e: Exception) {
                if (!canal.cerrado.get()) motivo = "error al leer del canal L2CAP: ${e.message ?: e.javaClass.simpleName}"
            }
            cerrarCanalHilos(canal, motivo)
        }, "starseed-l2cap-lee")
        lector.isDaemon = true
        lector.start()
        val escritor = Thread({
            var motivo = "el otro aparato cerró el canal L2CAP"
            try {
                val sal = socket.outputStream
                while (!canal.cerrado.get()) {
                    val hex = try {
                        PuenteBle.siguienteRapido(k, ESCRITURA_FLUJO)
                    } catch (t: Throwable) {
                        ""
                    }
                    val b = if (hex.isEmpty()) null else deHex(hex)
                    if (b == null) {
                        // Nada que escribir: espera el aviso de Rust (o 500 ms por si se escapó alguno).
                        canal.senal.poll(500, TimeUnit.MILLISECONDS)
                        continue
                    }
                    canal.escribiendoDesde = SystemClock.elapsedRealtime()
                    sal.write(b)
                    canal.escribiendoDesde = 0L
                    marcarTrafico()
                }
            } catch (e: Exception) {
                if (!canal.cerrado.get()) motivo = "error al escribir en el canal L2CAP: ${e.message ?: e.javaClass.simpleName}"
            }
            cerrarCanalHilos(canal, motivo)
        }, "starseed-l2cap-escribe")
        escritor.isDaemon = true
        escritor.start()
        if (!vigiaCanales) {
            vigiaCanales = true
            principal.postDelayed({ vigilarCanales() }, 1000)
        }
        // Rust ya sabe que hay canal: que empiece a sacar por él.
        canal.senal.offer(true)
    }

    /** Un solo cierre por canal (el primero que llega manda el motivo); cuenta a Rust y suelta el mapa. */
    private fun cerrarCanalHilos(c: Canal, motivo: String) {
        if (!c.cerrado.compareAndSet(false, true)) return
        cerrarSocket(c.socket)
        c.senal.offer(true)
        principal.post {
            if (canales[c.enlace] === c) canales.remove(c.enlace)
            evento(JSONObject().put("e", "l2cap-cerrado").put("enlace", c.enlace).put("motivo", motivo))
        }
    }

    /** Cierra el canal (o el intento de abrirlo) de ese enlace, si lo hay. */
    private fun cerrarCanalDe(k: String, motivo: String) {
        canales[k]?.let { cerrarCanalHilos(it, motivo) }
        conectando.remove(k)?.let { cerrarSocket(it) }
    }

    private fun vigilarCanales() {
        val ahora = SystemClock.elapsedRealtime()
        for (c in canales.values.toList()) {
            val desde = c.escribiendoDesde
            // (BLE1110A) Atascada solo si la escritura no avanza Y el otro lado tampoco dice nada: con eco o datos llegando, el
            // canal vive y solo va con el control de flujo apretado.
            if (desde != 0L && ahora - desde > PLAZO_ESCRITURA_FLUJO_MS && ahora - c.ultimaLecturaMs > PLAZO_ESCRITURA_FLUJO_MS) {
                cerrarCanalHilos(c, "escritura atascada: sin avanzar en ${PLAZO_ESCRITURA_FLUJO_MS / 1000} s y sin oír nada")
            }
        }
        if (canales.isEmpty()) {
            vigiaCanales = false
        } else {
            principal.postDelayed({ vigilarCanales() }, 1000)
        }
    }

    /** El PSM que leyó el central de la característica PSM del periférico. Rust lo valida (1–255). */
    private fun psmLeido(gatt: BluetoothGatt?, ch: BluetoothGattCharacteristic, b: ByteArray, status: Int) {
        if (ch.uuid != PSM_UUID || status != BluetoothGatt.GATT_SUCCESS || b.size != 2) return
        val (k, _) = clientePor(gatt) ?: return
        val psm = ((b[0].toInt() and 0xff) shl 8) or (b[1].toInt() and 0xff)
        evento(JSONObject().put("e", "psm").put("enlace", k).put("psm", psm))
    }

    fun aHex(b: ByteArray): String {
        val c = CharArray(b.size * 2)
        for (i in b.indices) {
            val v = b[i].toInt() and 0xff
            c[2 * i] = HEX[v ushr 4]
            c[2 * i + 1] = HEX[v and 0x0f]
        }
        return String(c)
    }

    fun deHex(s: String): ByteArray? {
        if (s.isEmpty() || s.length % 2 != 0) return null
        val out = ByteArray(s.length / 2)
        for (i in out.indices) {
            val a = Character.digit(s[2 * i], 16)
            val b = Character.digit(s[2 * i + 1], 16)
            if (a < 0 || b < 0) return null
            out[i] = ((a shl 4) or b).toByte()
        }
        return out
    }

    // ───────────────────────────── Ciclo de la actividad ─────────────────────────────

    override fun onActivityResumed(activity: Activity) {
        actual = WeakReference(activity)
        // Al volver de Ajustes (o del diálogo de permisos) puede haber cambiado algo.
        if (pendientePermisos) principal.post { pedirPermisos(false) }
        if (activo && ultimoEstado != "encendida") principal.post { arrancar() }
    }

    override fun onActivityPaused(activity: Activity) {
        if (actual?.get() === activity) actual = null
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}

    override fun onActivityStarted(activity: Activity) {}

    override fun onActivityStopped(activity: Activity) {}

    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}

    override fun onActivityDestroyed(activity: Activity) {}
}
