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
    val PREFIJO: UUID = UUID.fromString("5353b100-0000-0000-0000-000000000000")
    val MASCARA: UUID = UUID.fromString("ffffff00-0000-0000-0000-000000000000")
    private const val PETICION_PERMISOS = 4711
    private const val PREFERENCIAS = "starseed-ble"
    private const val MTU_PEDIDO = 517
    private const val PAQUETE_MIN = 20
    private const val PAQUETE_MAX = 512
    private const val VIGIA_ESCRITURA_MS = 1500L

    private class Cliente(val direccion: String, val gatt: BluetoothGatt) {
        var entrada: BluetoothGattCharacteristic? = null
        var paquete = PAQUETE_MIN
        var listo = false
        var ocupadoDesde = 0L
        var pendiente: ByteArray? = null
    }

    private class Central(val device: BluetoothDevice) {
        var paquete = PAQUETE_MIN
        var suscrito = false
    }

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

    private fun desconectado(enlace: String, motivo: String) {
        evento(JSONObject().put("e", "desconectado").put("enlace", enlace).put("motivo", motivo))
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
        escanear()
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
            }
        }

        override fun onConnectionStateChange(device: BluetoothDevice?, status: Int, newState: Int) {
            val d = device ?: return
            principal.post {
                val k = "p:" + d.address
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    if (!centrales.containsKey(k)) centrales[k] = Central(d)
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    val c = centrales.remove(k)
                    if (c?.suscrito == true) desconectado(k, "el otro aparato se desconectó (estado $status)")
                }
            }
        }

        override fun onMtuChanged(device: BluetoothDevice?, mtu: Int) {
            val d = device ?: return
            principal.post {
                val k = "p:" + d.address
                val c = centrales.getOrPut(k) { Central(d) }
                c.paquete = (mtu - 3).coerceIn(PAQUETE_MIN, PAQUETE_MAX)
                if (c.suscrito) evento(JSONObject().put("e", "mtu").put("enlace", k).put("paquete", c.paquete))
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
                val c = centrales.getOrPut(k) { Central(d) }
                if (encendido && !c.suscrito) {
                    c.suscrito = true
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
        if (servidorOcupadoDesde != 0L && SystemClock.elapsedRealtime() - servidorOcupadoDesde < VIGIA_ESCRITURA_MS) return
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
            principal.post { anunciando = true }
        }

        override fun onStartFailure(errorCode: Int) {
            principal.post {
                anunciando = false
                if (ultimoEstado == "encendida") {
                    radio("encendida", "Bluetooth encendido, pero Android no dejó anunciarse (código $errorCode): solo busca y conecta.")
                }
            }
        }
    }

    /** Anuncia SOLO el UUID rotatorio (cabe en el paquete principal: 3 B de indicadores + 18 B). */
    private fun anunciar() {
        val u = anuncioUuid ?: return
        if (!activo || !servicioListo) return
        val adv = adaptador?.bluetoothLeAdvertiser ?: return
        if (anunciando) {
            try {
                adv.stopAdvertising(anuncio)
            } catch (e: Exception) {
            }
            anunciando = false
        }
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
                c.gatt.setCharacteristicNotification(sal, true)
                if (!escribirDescriptor(c.gatt, d)) cerrarCliente(k, "no se pudo suscribir a sus avisos")
            }
        }

        override fun onDescriptorWrite(gatt: BluetoothGatt?, descriptor: BluetoothGattDescriptor?, status: Int) {
            principal.post {
                val (k, c) = clientePor(gatt) ?: return@post
                if (descriptor?.uuid != CCCD) return@post
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    cerrarCliente(k, "no aceptó la suscripción (estado $status)")
                    return@post
                }
                c.listo = true
                evento(JSONObject().put("e", "conectado").put("enlace", k).put("rol", "central").put("direccion", c.direccion).put("paquete", c.paquete))
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
        try {
            PuenteBle.datos(k, aHex(b))
        } catch (t: Throwable) {
        }
    }

    /** Escribe en ENTRADA sin respuesta, uno detrás de otro (cada uno espera su `onCharacteristicWrite`). */
    private fun bombear(k: String) {
        if (k.startsWith("p:")) {
            bombearServidor()
            return
        }
        val c = clientes[k] ?: return
        if (!c.listo) return
        if (c.ocupadoDesde != 0L && SystemClock.elapsedRealtime() - c.ocupadoDesde < VIGIA_ESCRITURA_MS) return
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
