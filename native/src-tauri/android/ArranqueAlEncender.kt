// Lo copia native/src-tauri/build.rs en el proyecto Android que genera Tauri (no editar allí).
// Contrato: architecture/apps-nativas-segundo-plano.md §2.3.
package app.starseed.nativa

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Al encender el aparato (o tras actualizar la app) vuelve a levantar el servicio de antenas,
 * si la persona lo dejó encendido. connectedDevice SÍ puede lanzarse desde el arranque en
 * Android 15 (dataSync no: por eso el servicio no usa dataSync).
 */
class ArranqueAlEncender : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val accion = intent.action ?: return
        if (accion != Intent.ACTION_BOOT_COMPLETED && accion != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val app = context.applicationContext
        if (Archivos.activo(app) && Archivos.arranque(app)) {
            PuenteNativo.arrancarGuardian(app)
            ServicioAntenas.arrancar(app)
        }
    }
}
