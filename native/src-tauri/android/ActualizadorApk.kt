// Lo copia native/src-tauri/build.rs en el proyecto Android que genera Tauri (no editar allí).
// Actualizador interno del APK (ACT1108A). Contrato: architecture/centro-versiones-1105.md §9.
package app.starseed.nativa

import android.app.Activity
import android.app.Application
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.FileObserver
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.io.FileNotFoundException
import java.lang.ref.WeakReference
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors

/** FileProvider propio: el de la plantilla de Tauri ya usa androidx.core.content.FileProvider. */
class ProveedorActualizacion : FileProvider()

/** Arranca el actualizador al crearse el proceso, antes que la actividad. */
class ArranqueActualizador : ContentProvider() {
    override fun onCreate(): Boolean {
        val app = context?.applicationContext ?: return true
        ActualizadorApk.iniciar(app)
        return true
    }

    override fun query(uri: Uri, projection: Array<String>?, selection: String?, selectionArgs: Array<String>?, sortOrder: String?): Cursor? = null

    override fun getType(uri: Uri): String? = null

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<String>?): Int = 0

    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<String>?): Int = 0
}

/**
 * Busca el APK nuevo en los manifiestos que dice Rust (canal_actualizacion_logica.rs), lo descarga en
 * filesDir/starseed/actualizacion, comprueba SHA-256, paquete, versionCode y firma, y abre el
 * instalador de Android. Android SIEMPRE pide a la persona que confirme; con la misma firma conserva
 * los datos de la app. Rust y Kotlin se hablan con peticion.json / estado.json / puente.json.
 */
object ActualizadorApk : Application.ActivityLifecycleCallbacks {
    /** Lo mismo que PREFIJO_DESCARGAS de canal_actualizacion_logica.rs (una prueba lo vigila): solo se
     *  bajan APK de los Releases del repositorio. */
    const val PREFIJO_DESCARGAS = "https://github.com/StarSeedSystem/starseed-system/releases/download/"
    /** Los manifiestos: los mismos Releases (`…/releases/download/canal-pruebas/…` o `…/releases/latest/download/…`). */
    const val PREFIJO_REPO = "https://github.com/StarSeedSystem/starseed-system/releases/"
    private val HOSTS = setOf("github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com")
    const val CARPETA = "actualizacion"
    const val PETICION = "peticion.json"
    const val ESTADO = "estado.json"
    const val PUENTE = "puente.json"
    private const val AVISO = "aviso.json"
    const val SUFIJO_AUTORIDAD = ".starseed-actualizacion"
    private const val CANAL = "starseed-actualizacion"
    private const val ID_AVISO = 47072
    private const val MAX_BYTES = 800L * 1024 * 1024
    private const val TIPO_APK = "application/vnd.android.package-archive"

    private var actual: WeakReference<Activity>? = null
    private var observador: FileObserver? = null
    private val trabajo = Executors.newSingleThreadExecutor()
    private val principal = Handler(Looper.getMainLooper())

    @Volatile
    private var instalarAlVolver = false
    private var iniciado = false

    private class Manifiesto(
        val version: String,
        val codigo: Long,
        val apk: String,
        val sha256: String,
        val bytes: Long,
        val notas: String,
        val canal: String,
    )

    fun dir(ctx: Context): File {
        val d = File(File(ctx.filesDir, "starseed"), CARPETA)
        if (!d.exists()) d.mkdirs()
        return d
    }

    @Synchronized
    fun iniciar(ctx: Context) {
        if (iniciado) return
        iniciado = true
        (ctx as? Application)?.registerActivityLifecycleCallbacks(this)
        val d = dir(ctx)
        val (nombre, codigo) = instalado(ctx)
        escribir(ctx, PUENTE, JSONObject().put("version", 1).put("instalada", nombre).put("version_code", codigo))
        // Tras instalar, Android arranca la app con el APK nuevo: se dice y se borra lo descargado.
        val e = leer(ctx, ESTADO)
        if (e != null && e.optString("fase") in setOf("lista", "permiso", "instalador")) {
            val nuevo = e.optLong("version_code", -1)
            if (nuevo in 1..codigo) {
                borrarApks(ctx)
                estado(ctx, "instalada", e, "Instalada la ${e.optString("version")}: tus datos y ajustes siguen donde estaban.")
            }
        }
        @Suppress("DEPRECATION")
        val o = object : FileObserver(d.absolutePath, FileObserver.CLOSE_WRITE or FileObserver.MOVED_TO) {
            override fun onEvent(event: Int, path: String?) {
                if (path == PETICION) trabajo.execute { atender(ctx) }
            }
        }
        o.startWatching()
        observador = o
        if (File(d, PETICION).exists()) trabajo.execute { atender(ctx) }
    }

    private fun atender(ctx: Context) {
        val f = File(dir(ctx), PETICION)
        val p = try {
            JSONObject(f.readText())
        } catch (e: Exception) {
            null
        }
        f.delete()
        if (p == null) return
        when (p.optString("accion")) {
            "buscar" -> {
                val lista = mutableListOf<String>()
                val arr = p.optJSONArray("manifiestos")
                if (arr != null) for (i in 0 until arr.length()) lista.add(arr.optString(i))
                buscar(ctx, lista, p.optBoolean("instalar", false))
            }
            "instalar" -> principal.post { instalarListo(ctx) }
        }
    }

    // ─── Buscar, descargar y verificar (hilo de trabajo) ───

    private fun buscar(ctx: Context, urls: List<String>, instalar: Boolean) {
        val (nombre, codigo) = instalado(ctx)
        estado(ctx, "buscando", null, "Buscando la versión nueva…")
        var mejor: Manifiesto? = null
        var respondio = false
        var error = ""
        for (u in urls) {
            if (!u.startsWith(PREFIJO_REPO)) continue
            try {
                val m = leerManifiesto(JSONObject(descargarTexto(u)), if (u.contains("/canal-pruebas/")) "pruebas" else "oficial")
                respondio = true
                if (m != null && (mejor == null || m.codigo > mejor.codigo)) mejor = m
            } catch (e: FileNotFoundException) {
                respondio = true // 404: ese canal aún no tiene manifiesto
            } catch (e: Exception) {
                error = e.message ?: e.javaClass.simpleName
            }
        }
        val m = mejor
        if (m == null) {
            if (respondio) estado(ctx, "al-dia", null, "Ya tienes la última versión ($nombre).")
            else estado(ctx, "error", null, "No se pudo leer el canal de versiones (¿sin conexión?): $error")
            return
        }
        if (m.codigo <= codigo) {
            estado(ctx, "al-dia", m, "Ya tienes la última versión ($nombre).")
            return
        }
        val apk = File(dir(ctx), "StarSeed-${m.codigo}.apk")
        try {
            if (!(apk.isFile && sha256(apk).equals(m.sha256, ignoreCase = true))) {
                borrarApks(ctx)
                descargar(ctx, m, apk)
            }
            comprobarApk(ctx, apk, m)
        } catch (e: Exception) {
            apk.delete()
            estado(ctx, "error", m, e.message ?: "No se pudo descargar la versión nueva.")
            return
        }
        estado(ctx, "lista", m, "Descargada y verificada la ${m.version}. Android te pedirá confirmar «Instalar»; es la misma firma, tus datos se quedan.")
        if (instalar) {
            principal.post { instalarListo(ctx) }
        } else if (actual?.get() == null) {
            avisar(ctx, m)
        }
    }

    private fun leerManifiesto(j: JSONObject, canal: String): Manifiesto? {
        val version = j.optString("version").trim()
        val codigo = j.optLong("versionCode", -1)
        val apk = j.optString("apk").trim()
        val sha = j.optString("sha256").trim().lowercase()
        if (version.isEmpty() || codigo <= 0 || !apk.startsWith(PREFIJO_DESCARGAS) || !Regex("^[0-9a-f]{64}$").matches(sha)) return null
        return Manifiesto(version, codigo, apk, sha, j.optLong("bytes", -1), j.optString("notas", ""), canal)
    }

    private fun abrir(url: String): HttpURLConnection {
        val c = URL(url).openConnection() as HttpURLConnection
        c.instanceFollowRedirects = true
        c.connectTimeout = 20_000
        c.readTimeout = 60_000
        c.setRequestProperty("User-Agent", "StarSeed-OS-Android-Actualizador")
        c.setRequestProperty("Accept", "application/octet-stream, application/json")
        val codigo = c.responseCode
        if (codigo == 404) throw FileNotFoundException(url)
        if (codigo !in 200..299) throw Exception("HTTP $codigo en $url")
        // Tras las redirecciones (GitHub manda los archivos a *.githubusercontent.com): solo https y esos sitios.
        val destino = c.url
        if (destino.protocol != "https" || destino.host !in HOSTS) throw Exception("La descarga acabó en un sitio no permitido (${destino.host}).")
        return c
    }

    private fun descargarTexto(url: String): String {
        val c = abrir(url)
        try {
            val bytes = c.inputStream.use { it.readBytes() }
            if (bytes.size > 64 * 1024) throw Exception("El manifiesto es demasiado grande.")
            return String(bytes, Charsets.UTF_8)
        } finally {
            c.disconnect()
        }
    }

    private fun descargar(ctx: Context, m: Manifiesto, destino: File) {
        val parcial = File(destino.path + ".parcial")
        val c = abrir(m.apk)
        try {
            val total = c.contentLengthLong.takeIf { it > 0 } ?: m.bytes
            if (total > MAX_BYTES) throw Exception("El APK es demasiado grande (${total / 1_048_576} MB).")
            val md = MessageDigest.getInstance("SHA-256")
            var hecho = 0L
            var ultimo = 0L
            c.inputStream.use { ent ->
                parcial.outputStream().use { sal ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = ent.read(buf)
                        if (n < 0) break
                        sal.write(buf, 0, n)
                        md.update(buf, 0, n)
                        hecho += n
                        if (hecho > MAX_BYTES) throw Exception("El APK es más grande de lo permitido.")
                        val ahora = System.currentTimeMillis()
                        if (ahora - ultimo > 700) {
                            ultimo = ahora
                            estadoDescarga(ctx, m, hecho, total)
                        }
                    }
                }
            }
            val sha = hex(md.digest())
            if (!sha.equals(m.sha256, ignoreCase = true)) {
                parcial.delete()
                throw Exception("El SHA-256 del APK no casa con el del canal: se borró y no se instala nada.")
            }
            if (!parcial.renameTo(destino)) throw Exception("No se pudo colocar el APK descargado.")
        } finally {
            c.disconnect()
            parcial.delete()
        }
    }

    @Suppress("DEPRECATION")
    private fun comprobarApk(ctx: Context, apk: File, m: Manifiesto) {
        val pm = ctx.packageManager
        val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
        val nuevo = pm.getPackageArchiveInfo(apk.absolutePath, flags) ?: throw Exception("Android no reconoce el archivo descargado como un APK.")
        if (nuevo.packageName != ctx.packageName) throw Exception("El APK es de otra app (${nuevo.packageName}): no se instala.")
        if (codigo(nuevo) != m.codigo) throw Exception("El APK no es la versión que anuncia el canal (versionCode ${codigo(nuevo)} ≠ ${m.codigo}).")
        val actuales = firmas(pm.getPackageInfo(ctx.packageName, flags))
        val nuevas = firmas(nuevo)
        // Si Android no deja leer alguna de las dos, decide él al instalar (rechaza otra firma).
        if (actuales.isNotEmpty() && nuevas.isNotEmpty() && actuales != nuevas) {
            throw Exception("El APK tiene otra firma: Android no lo instalaría encima de esta app. No se toca nada.")
        }
    }

    @Suppress("DEPRECATION")
    private fun firmas(pi: PackageInfo): Set<String> {
        val lista = if (Build.VERSION.SDK_INT >= 28) pi.signingInfo?.apkContentsSigners else pi.signatures
        return lista?.map { hex(MessageDigest.getInstance("SHA-256").digest(it.toByteArray())) }?.toSet() ?: emptySet()
    }

    // ─── Instalar (hilo principal) ───

    private fun instalarListo(ctx: Context) {
        val e = leer(ctx, ESTADO) ?: return
        val apk = File(dir(ctx), "StarSeed-${e.optLong("version_code", -1)}.apk")
        if (!apk.isFile) {
            estado(ctx, "error", e, "El APK descargado ya no está: vuelve a buscar la versión nueva.")
            return
        }
        val a = actual?.get()
        if (a == null) {
            // Sin la app a la vista no se puede abrir el instalador: se abre al volver.
            instalarAlVolver = true
            return
        }
        if (Build.VERSION.SDK_INT >= 26 && !ctx.packageManager.canRequestPackageInstalls()) {
            instalarAlVolver = true
            estado(ctx, "permiso", e, "Android pide que permitas a StarSeed OS «Instalar apps desconocidas». Se abrió ese ajuste: actívalo y vuelve; la instalación sigue sola.")
            try {
                a.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.packageName)))
            } catch (x: Exception) {
                try {
                    a.startActivity(Intent(Settings.ACTION_SECURITY_SETTINGS))
                } catch (y: Exception) {
                    // Sin pantalla de ajustes: el texto de arriba dice dónde está.
                }
            }
            return
        }
        instalarAlVolver = false
        try {
            val uri = FileProvider.getUriForFile(ctx, ctx.packageName + SUFIJO_AUTORIDAD, apk)
            val i = Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, TIPO_APK)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            a.startActivity(i)
            estado(ctx, "instalador", e, "Android te pide confirmar: pulsa «Instalar» o «Actualizar». Es la misma firma: tus datos y ajustes se quedan donde están.")
        } catch (x: Exception) {
            estado(ctx, "error", e, "No se pudo abrir el instalador de Android: ${x.message}")
        }
    }

    private fun avisar(ctx: Context, m: Manifiesto) {
        try {
            if (leer(ctx, AVISO)?.optLong("version_code", -1) == m.codigo) return
            if (Build.VERSION.SDK_INT >= 33 && ctx.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CANAL) == null) {
                nm.createNotificationChannel(NotificationChannel(CANAL, "Actualizaciones de StarSeed OS", NotificationManager.IMPORTANCE_DEFAULT))
            }
            val abrirApp = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            val pi = abrirApp?.let { PendingIntent.getActivity(ctx, ID_AVISO, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
            @Suppress("DEPRECATION")
            val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(ctx, CANAL) else Notification.Builder(ctx)
            val titulo = if (m.canal == "pruebas") "StarSeed OS ${m.version} · canal de pruebas" else "StarSeed OS ${m.version}"
            b.setSmallIcon(ctx.applicationInfo.icon)
                .setContentTitle(titulo)
                .setContentText("Lista: ábrela para instalarla. Android te pedirá confirmar.")
                .setAutoCancel(true)
            if (pi != null) b.setContentIntent(pi)
            nm.notify(ID_AVISO, b.build())
            escribir(ctx, AVISO, JSONObject().put("version_code", m.codigo))
        } catch (e: Exception) {
            // Sin notificaciones la ventana de la app lo dice al abrirla.
        }
    }

    // ─── Ciclo de vida: qué actividad está a la vista ───

    override fun onActivityResumed(activity: Activity) {
        actual = WeakReference(activity)
        if (!instalarAlVolver) return
        val ctx = activity.applicationContext
        val e = leer(ctx, ESTADO) ?: return
        if (Build.VERSION.SDK_INT < 26 || ctx.packageManager.canRequestPackageInstalls()) {
            instalarListo(ctx)
        } else if (e.optString("fase") == "permiso") {
            // Volvió sin activarlo: no se reabre el ajuste en bucle.
            instalarAlVolver = false
            estado(ctx, "permiso", e, "Sin «Instalar apps desconocidas» Android no deja instalar. Actívalo y pulsa «Instalar» otra vez.")
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

    @Suppress("DEPRECATION")
    private fun codigo(pi: PackageInfo): Long = if (Build.VERSION.SDK_INT >= 28) pi.longVersionCode else pi.versionCode.toLong()

    @Suppress("DEPRECATION")
    private fun instalado(ctx: Context): Pair<String, Long> =
        try {
            val pi = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
            Pair(pi.versionName ?: "", codigo(pi))
        } catch (e: Exception) {
            Pair("", 0L)
        }

    private fun borrarApks(ctx: Context) {
        dir(ctx).listFiles()?.filter { it.name.endsWith(".apk") || it.name.endsWith(".parcial") }?.forEach { it.delete() }
    }

    private fun estado(ctx: Context, fase: String, m: Manifiesto?, mensaje: String) {
        val j = JSONObject().put("fase", fase).put("mensaje", mensaje).put("instalada", instalado(ctx).first).put("t", System.currentTimeMillis())
        if (m != null) j.put("version", m.version).put("version_code", m.codigo).put("canal", m.canal).put("notas", m.notas)
        escribir(ctx, ESTADO, j)
    }

    /** Cambia la fase y el mensaje y conserva lo demás (versión, canal, notas) del estado anterior. */
    private fun estado(ctx: Context, fase: String, anterior: JSONObject, mensaje: String) {
        val j = JSONObject(anterior.toString())
            .put("fase", fase)
            .put("mensaje", mensaje)
            .put("instalada", instalado(ctx).first)
            .put("t", System.currentTimeMillis())
        j.remove("descargado")
        j.remove("total")
        escribir(ctx, ESTADO, j)
    }

    private fun estadoDescarga(ctx: Context, m: Manifiesto, hecho: Long, total: Long) {
        val j = JSONObject()
            .put("fase", "descargando")
            .put("version", m.version)
            .put("version_code", m.codigo)
            .put("canal", m.canal)
            .put("notas", m.notas)
            .put("instalada", instalado(ctx).first)
            .put("descargado", hecho)
            .put("mensaje", "Descargando la ${m.version}…")
            .put("t", System.currentTimeMillis())
        if (total > 0) j.put("total", total)
        escribir(ctx, ESTADO, j)
    }

    private fun leer(ctx: Context, nombre: String): JSONObject? =
        try {
            val f = File(dir(ctx), nombre)
            if (f.exists()) JSONObject(f.readText()) else null
        } catch (e: Exception) {
            null
        }

    // El hilo de trabajo y el principal escriben el estado: uno a la vez (mismo temporal).
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

    private fun sha256(f: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        f.inputStream().use { ent ->
            val buf = ByteArray(64 * 1024)
            while (true) {
                val n = ent.read(buf)
                if (n < 0) break
                md.update(buf, 0, n)
            }
        }
        return hex(md.digest())
    }

    private fun hex(b: ByteArray): String = b.joinToString("") { "%02x".format(it) }
}
