// Lo copia native/src-tauri/build.rs en el proyecto Android que genera Tauri (no editar allí). NFC1126B.
// Contrato: architecture/nfc-neuronas.md §2. Rust (nfc.rs) deja `peticion-<n>.json` en filesDir/starseed/nfc y
// aquí se atienden; las respuestas y los encuentros van en `estado.json`.
package app.starseed.nativa

import android.app.Activity
import android.app.Application
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.nfc.tech.Ndef
import android.os.Bundle
import android.os.FileObserver
import android.os.Handler
import android.os.Looper
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.lang.ref.WeakReference
import java.util.concurrent.Executors
import kotlin.random.Random

/** Arranca la parte Android del NFC al crearse el proceso. No enciende nada: solo queda a la escucha. */
class ArranqueNfc : ContentProvider() {
    override fun onCreate(): Boolean {
        context?.applicationContext?.let { NfcNativa.iniciar(it) }
        return true
    }
    override fun query(uri: Uri, p: Array<String>?, s: String?, a: Array<String>?, o: String?): Cursor? = null
    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, v: ContentValues?): Uri? = null
    override fun delete(uri: Uri, s: String?, a: Array<String>?): Int = 0
    override fun update(uri: Uri, v: ContentValues?, s: String?, a: Array<String>?): Int = 0
}

/**
 * Lector (ReaderMode) y tarjeta (HCE) que se turnan: con ReaderMode encendido Android apaga la emulación, así que
 * el modo lector se enciende por ventanas cortas con pausas al azar y el otro aparato puede leer en las pausas.
 * Solo funciona con la app abierta y la pantalla encendida (límite de Android). Nada se envía solo: la tarjeta la
 * prepara la web con `nfc_iniciar` y caduca a los 30 s (`tarjeta.ts`); lo leído sube a la web, que verifica la firma.
 */
object NfcNativa : Application.ActivityLifecycleCallbacks {
    const val CARPETA = "nfc"
    const val ESTADO = "estado.json"
    const val VIDA_TARJETA_MS = 30_000L
    private const val FLAGS = NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK
    private val ES_PETICION = Regex("""peticion-(\d+)\.json""")
    private val hilo = Executors.newSingleThreadExecutor()
    private val ui = Handler(Looper.getMainLooper())
    private lateinit var dir: File
    private lateinit var app: Context
    private var actividad = WeakReference<Activity>(null)
    private var observador: FileObserver? = null
    private var tarjeta: ByteArray? = null
    private var tarjetaHasta = 0L
    private var activo = false
    private var lectorEncendido = false
    private var seq = 0
    private var ultimaPeticion = 0L
    private val encuentros = JSONArray()
    private val respuestas = JSONObject()

    @Synchronized fun tarjetaVigente(): ByteArray? = if (System.currentTimeMillis() <= tarjetaHasta) tarjeta else null

    fun iniciar(contexto: Context) {
        app = contexto
        dir = File(contexto.filesDir, "starseed/$CARPETA").also { it.mkdirs() }
        (contexto as? Application)?.registerActivityLifecycleCallbacks(this)
        observador = object : FileObserver(dir, CLOSE_WRITE or MOVED_TO) {
            override fun onEvent(evento: Int, ruta: String?) { if (ruta != null && ES_PETICION.matches(ruta)) hilo.execute { atender() } }
        }.also { it.startWatching() }
        hilo.execute { atender() }
    }

    private fun capacidad(): NfcAdapter? = NfcAdapter.getDefaultAdapter(app)

    @Synchronized private fun publicar() {
        val a = capacidad()
        val e = JSONObject().put("lector", a != null).put("emulador", a != null && app.packageManager.hasSystemFeature("android.hardware.nfc.hce"))
            .put("encendido", a?.isEnabled == true).put("activo", activo).put("encuentros", encuentros).put("respuestas", respuestas)
        val tmp = File(dir, "$ESTADO.tmp")
        tmp.writeText(e.toString())
        tmp.renameTo(File(dir, ESTADO))
    }

    @Synchronized private fun atender() {
        val pendientes = dir.listFiles().orEmpty().mapNotNull { f -> ES_PETICION.matchEntire(f.name)?.let { f to it.groupValues[1].toLong() } }
            .filter { it.second > ultimaPeticion }.sortedBy { it.second }
        for ((f, id) in pendientes) {
            ultimaPeticion = id
            val p = runCatching { JSONObject(f.readText()) }.getOrNull()
            f.delete()
            if (p == null) continue
            val ok = when (p.optString("orden")) {
                "iniciar" -> { prepararTarjeta(p.optString("tarjeta_b64")); activo = true; ui.post { turno(true) }; true }
                "parar" -> { activo = false; tarjeta = null; ui.post { apagarLector() }; true }
                "escribir" -> escribirPendiente(p.optString("tarjeta_b64"))
                else -> false
            }
            respuestas.put(id.toString(), ok)
        }
        publicar()
    }

    private fun prepararTarjeta(b64: String) {
        tarjeta = if (b64.isEmpty()) null else runCatching { Base64.decode(b64, Base64.DEFAULT) }.getOrNull()
        tarjetaHasta = System.currentTimeMillis() + VIDA_TARJETA_MS
    }

    private var escribirB64: String? = null
    private fun escribirPendiente(b64: String): Boolean {
        if (b64.isEmpty()) return false
        escribirB64 = b64
        ui.post { turno(true) }
        return true
    }

    /** Un turno de lector: se enciende un rato y se apaga otro tanto, al azar, para que el otro aparato también lea. */
    private fun turno(encender: Boolean) {
        if (!activo && escribirB64 == null) return apagarLector()
        val a = actividad.get()
        val nfc = capacidad()
        if (a != null && nfc != null && nfc.isEnabled && encender) {
            nfc.enableReaderMode(a, { t -> hilo.execute { leer(t) } }, FLAGS, Bundle().apply { putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 250) })
            lectorEncendido = true
        } else apagarLector()
        ui.postDelayed({ turno(!lectorEncendido) }, Random.nextLong(400, 900))
    }

    private fun apagarLector() {
        val a = actividad.get() ?: return
        if (lectorEncendido) runCatching { capacidad()?.disableReaderMode(a) }
        lectorEncendido = false
    }

    private fun leer(t: Tag) {
        escribirB64?.let { b64 -> if (escribir(t, b64)) { escribirB64 = null; anotar("escrita", null) }; return }
        val iso = runCatching { IsoDep.get(t) }.getOrNull()
        val bytes = if (iso != null) leerPorApdu(iso) else leerNdef(t)
        if (bytes != null) anotar(if (iso != null) "neurona" else "etiqueta", bytes)
    }

    private fun leerPorApdu(iso: IsoDep): ByteArray? = runCatching {
        iso.connect(); iso.timeout = 1500
        val select = byteArrayOf(0, 0xA4.toByte(), 4, 0, HceStarSeed.AID.size.toByte()) + HceStarSeed.AID + byteArrayOf(0)
        if (!iso.transceive(select).contentEquals(HceStarSeed.SW_OK)) return null
        val total = java.io.ByteArrayOutputStream()
        repeat(6) {
            val d = total.size()
            val r = iso.transceive(byteArrayOf(HceStarSeed.CLA_STARSEED, HceStarSeed.INS_TARJETA, (d shr 8).toByte(), d.toByte(), 0))
            if (r.size < 2) return null
            total.write(r, 0, r.size - 2)
            val sw = r.copyOfRange(r.size - 2, r.size)
            if (total.size() > HceStarSeed.MAX_TARJETA) return null
            if (sw.contentEquals(HceStarSeed.SW_OK)) return total.toByteArray()
            if (!sw.contentEquals(HceStarSeed.SW_MAS)) return null
        }
        null
    }.also { runCatching { iso.close() } }.getOrNull()

    private fun leerNdef(t: Tag): ByteArray? = runCatching {
        val n = Ndef.get(t) ?: return null
        n.connect()
        val msg = n.ndefMessage ?: n.cachedNdefMessage
        n.close()
        msg?.records?.firstOrNull { it.tnf == NdefRecord.TNF_MIME_MEDIA && String(it.type) == "application/vnd.starseed.neurona" }?.payload
    }.getOrNull()

    private fun escribir(t: Tag, b64: String): Boolean = runCatching {
        val registro = NdefRecord.createMime("application/vnd.starseed.neurona", Base64.decode(b64, Base64.DEFAULT))
        val n = Ndef.get(t) ?: return false
        n.connect()
        val ok = n.isWritable && n.maxSize >= registro.toByteArray().size
        if (ok) n.writeNdefMessage(NdefMessage(registro))
        n.close()
        ok
    }.getOrDefault(false)

    @Synchronized private fun anotar(via: String, bytes: ByteArray?) {
        val e = JSONObject().put("seq", ++seq).put("via", via).put("hora_ms", System.currentTimeMillis())
        if (bytes != null) e.put("bytes_b64", Base64.encodeToString(bytes, Base64.NO_WRAP))
        encuentros.put(e)
        while (encuentros.length() > 10) encuentros.remove(0)
        publicar()
    }

    /** Otro aparato terminó de leer NUESTRA tarjeta (sin bytes: son los nuestros). */
    fun anotarLeida() = hilo.execute { anotar("leida", null) }

    override fun onActivityResumed(a: Activity) { actividad = WeakReference(a); if (activo || escribirB64 != null) ui.post { turno(true) } }
    override fun onActivityPaused(a: Activity) { apagarLector(); actividad.clear() }
    override fun onActivityCreated(a: Activity, s: Bundle?) {}
    override fun onActivityStarted(a: Activity) {}
    override fun onActivityStopped(a: Activity) {}
    override fun onActivitySaveInstanceState(a: Activity, s: Bundle) {}
    override fun onActivityDestroyed(a: Activity) {}
}
