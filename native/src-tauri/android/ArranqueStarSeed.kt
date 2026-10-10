// Lo copia native/src-tauri/build.rs en el proyecto Android que genera Tauri (no editar allí).
// Contrato: architecture/apps-nativas-segundo-plano.md §2.3.
package app.starseed.nativa

import android.app.Activity
import android.app.Application
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.os.Bundle
import android.os.FileObserver
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import java.io.File
import java.lang.ref.WeakReference

/**
 * Se crea al arrancar el proceso, antes que la actividad (como androidx.startup):
 * arranca el guardián de Rust, escucha la carpeta compartida y vigila cuándo la app está a la
 * vista para arrancar el servicio (Android solo deja arrancarlo con la app visible o al encender).
 */
class ArranqueStarSeed : ContentProvider() {
    override fun onCreate(): Boolean {
        val app = context?.applicationContext ?: return true
        PuenteNativo.arrancarGuardian(app)
        (app as? Application)?.registerActivityLifecycleCallbacks(Vigia)
        Vigia.vigilarCarpeta(app)
        return true
    }

    override fun query(uri: Uri, projection: Array<String>?, selection: String?, selectionArgs: Array<String>?, sortOrder: String?): Cursor? = null

    override fun getType(uri: Uri): String? = null

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<String>?): Int = 0

    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<String>?): Int = 0
}

/** Atiende lo que la web pide por archivos (preferencia y peticiones) y arranca el servicio a la vista. */
object Vigia : Application.ActivityLifecycleCallbacks {
    private var actual: WeakReference<Activity>? = null
    private var observador: FileObserver? = null
    private val principal = Handler(Looper.getMainLooper())

    fun vigilarCarpeta(ctx: Context) {
        if (observador != null) return
        val dir = PuenteNativo.dir(ctx)
        @Suppress("DEPRECATION")
        val o = object : FileObserver(dir.absolutePath, FileObserver.CLOSE_WRITE or FileObserver.MOVED_TO) {
            override fun onEvent(event: Int, path: String?) {
                when (path) {
                    Archivos.PREFERENCIA -> principal.post { aplicarPreferencia(ctx) }
                    Archivos.PETICION -> principal.post { atenderPeticion(ctx) }
                }
            }
        }
        o.startWatching()
        observador = o
    }

    private fun aVista(): Activity? = actual?.get()

    fun aplicarPreferencia(ctx: Context) {
        if (Archivos.activo(ctx)) {
            if (aVista() != null) ServicioAntenas.arrancar(ctx)
        } else {
            ServicioAntenas.parar(ctx)
            Archivos.escribirServicio(ctx, false, "Segundo plano apagado por ti: las antenas solo viven con la app abierta.")
        }
    }

    private fun atenderPeticion(ctx: Context) {
        val a = aVista() ?: return
        val p = Archivos.leer(ctx, Archivos.PETICION) ?: return
        File(PuenteNativo.dir(ctx), Archivos.PETICION).delete()
        when (p.optString("accion")) {
            "bateria" -> pedirBateria(a)
        }
    }

    private fun pedirBateria(a: Activity) {
        try {
            a.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + a.packageName)))
        } catch (e: Exception) {
            try {
                a.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            } catch (e2: Exception) {
                // Sin pantalla de batería en este Android: la web lo dirá con servicio.json.
            }
        }
    }

    override fun onActivityResumed(activity: Activity) {
        actual = WeakReference(activity)
        val ctx = activity.applicationContext
        if (Archivos.activo(ctx)) ServicioAntenas.arrancar(ctx)
        // Al volver de Ajustes, los permisos pueden haber cambiado: se reescribe el estado.
        Archivos.escribirServicio(ctx, ServicioAntenas.vivo, ServicioAntenas.motivo)
        atenderPeticion(ctx)
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
