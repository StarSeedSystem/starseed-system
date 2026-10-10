// Lo copia native/src-tauri/build.rs en el proyecto Android que genera Tauri (no editar allí).
// Contrato: architecture/apps-nativas-segundo-plano.md §2.3.
package app.starseed.nativa

import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import org.json.JSONObject
import java.io.File

/**
 * Puente entre Android y el guardián de antenas escrito en Rust (antenas.rs).
 * El guardián vive en hilos del PROCESO: mientras el servicio en primer plano mantenga vivo
 * el proceso, los faros y las sondas siguen aunque la ventana esté cerrada.
 */
object PuenteNativo {
    private const val LIBRERIA = "{{LIB}}"

    @Volatile
    private var cargada = false

    /** Implementada en Rust (src/android.rs). Idempotente: la segunda llamada no hace nada. */
    @JvmStatic
    external fun iniciarGuardian(dirDatos: String): Boolean

    /** Carpeta compartida con Rust: preferencias, peticiones y estado (archivos JSON pequeños). */
    fun dir(ctx: Context): File {
        val d = File(ctx.filesDir, "starseed")
        if (!d.exists()) d.mkdirs()
        return d
    }

    @Synchronized
    fun arrancarGuardian(ctx: Context): Boolean {
        return try {
            if (!cargada) {
                System.loadLibrary(LIBRERIA)
                cargada = true
            }
            iniciarGuardian(dir(ctx).absolutePath)
        } catch (t: Throwable) {
            Archivos.escribirServicio(ctx, false, "No se pudo cargar el guardián de antenas (${t.javaClass.simpleName}).")
            false
        }
    }
}

/** Archivos que se cruzan Rust y Kotlin en filesDir/starseed (contrato §2.3). */
object Archivos {
    const val PREFERENCIA = "segundo-plano.json"
    const val PETICION = "peticion.json"
    const val SERVICIO = "servicio.json"
    const val RESUMEN = "estado-antenas.json"

    fun leer(ctx: Context, nombre: String): JSONObject? {
        return try {
            val f = File(PuenteNativo.dir(ctx), nombre)
            if (f.exists()) JSONObject(f.readText()) else null
        } catch (e: Exception) {
            null
        }
    }

    fun escribir(ctx: Context, nombre: String, json: JSONObject) {
        try {
            val d = PuenteNativo.dir(ctx)
            val tmp = File(d, "$nombre.tmp")
            tmp.writeText(json.toString())
            if (!tmp.renameTo(File(d, nombre))) tmp.delete()
        } catch (e: Exception) {
            // Sin disco no hay estado que contar; el servicio sigue.
        }
    }

    /** Segundo plano encendido (por defecto sí: es lo que pidió Alex). */
    fun activo(ctx: Context): Boolean = leer(ctx, PREFERENCIA)?.optBoolean("activo", true) ?: true

    /** Arrancar al encender el aparato (por defecto sí). */
    fun arranque(ctx: Context): Boolean = leer(ctx, PREFERENCIA)?.optBoolean("arranque", true) ?: true

    fun resumen(ctx: Context): String {
        val t = leer(ctx, RESUMEN)?.optString("texto", "") ?: ""
        return if (t.isBlank()) "Midiendo antenas…" else t
    }

    /** Lo que la web enseña: vivo o no, por qué, y los dos permisos que cambian el resultado. */
    fun escribirServicio(ctx: Context, vivo: Boolean, motivo: String) {
        val j = JSONObject()
        j.put("vivo", vivo)
        j.put("motivo", motivo)
        j.put("desde_ms", System.currentTimeMillis())
        j.put("sdk", Build.VERSION.SDK_INT)
        try {
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
            j.put("bateria_exenta", pm.isIgnoringBatteryOptimizations(ctx.packageName))
        } catch (e: Exception) {
            j.put("bateria_exenta", false)
        }
        try {
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            j.put("notificaciones", nm.areNotificationsEnabled())
        } catch (e: Exception) {
            j.put("notificaciones", false)
        }
        escribir(ctx, SERVICIO, j)
    }
}
