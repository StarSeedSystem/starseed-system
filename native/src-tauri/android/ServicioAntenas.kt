// Lo copia native/src-tauri/build.rs en el proyecto Android que genera Tauri (no editar allí).
// Contrato: architecture/apps-nativas-segundo-plano.md §2.3.
package app.starseed.nativa

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.net.wifi.WifiManager
import android.os.Build
import android.os.FileObserver
import android.os.Handler
import android.os.IBinder
import android.os.Looper

/**
 * Servicio en primer plano tipo connectedDevice: mantiene vivo el proceso (y con él el guardián
 * de Rust) con la app cerrada. No usa dataSync para estar siempre encendido: Android 15 lo limita
 * a 6 h cada 24 h y no deja lanzarlo al encender. Sin WakeLock permanente (gasta batería).
 */
class ServicioAntenas : Service() {
    companion object {
        private const val CANAL = "starseed-antenas"
        private const val ID = 4707
        private const val ACCION_DETENER = "app.starseed.nativa.DETENER"

        @Volatile
        var vivo = false
            private set

        @Volatile
        var motivo = "El servicio aún no ha arrancado."
            private set

        fun arrancar(ctx: Context) {
            if (vivo) return
            val i = Intent(ctx, ServicioAntenas::class.java)
            try {
                if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
            } catch (e: Exception) {
                motivo = "Android no dejó arrancar el servicio (${e.javaClass.simpleName})."
                Archivos.escribirServicio(ctx, false, motivo)
            }
        }

        fun parar(ctx: Context) {
            ctx.stopService(Intent(ctx, ServicioAntenas::class.java))
        }
    }

    private var multicast: WifiManager.MulticastLock? = null
    private var observador: FileObserver? = null
    private val principal = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACCION_DETENER) {
            motivo = "Detenido desde la notificación; vuelve al abrir StarSeed."
            stopForeground(Service.STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        crearCanal()
        val aviso = notificacion(Archivos.resumen(this))
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(ID, aviso, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
            } else {
                startForeground(ID, aviso)
            }
        } catch (e: Exception) {
            motivo = "Android no dejó el servicio en primer plano (${e.javaClass.simpleName})."
            Archivos.escribirServicio(this, false, motivo)
            stopSelf()
            return START_NOT_STICKY
        }
        vivo = true
        motivo = "Antenas activas también con la app cerrada."
        PuenteNativo.arrancarGuardian(this)
        tomarMulticast()
        vigilarResumen()
        Archivos.escribirServicio(this, true, motivo)
        return START_STICKY
    }

    override fun onDestroy() {
        vivo = false
        if (motivo.startsWith("Antenas activas")) motivo = "Servicio detenido."
        try {
            multicast?.release()
        } catch (e: Exception) {
        }
        multicast = null
        observador?.stopWatching()
        observador = null
        Archivos.escribirServicio(this, false, motivo)
        super.onDestroy()
    }

    /** Android descarta el multicast entrante si nadie lo pide: sin esto no se oyen los faros. */
    private fun tomarMulticast() {
        if (multicast?.isHeld == true) return
        try {
            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val l = wm.createMulticastLock("starseed-faro")
            l.setReferenceCounted(false)
            l.acquire()
            multicast = l
        } catch (e: Exception) {
            motivo = "Sin permiso de multicast: los faros se envían pero no se oyen."
        }
    }

    /** Rust reescribe estado-antenas.json cuando cambia el resumen: la notificación lo sigue. */
    private fun vigilarResumen() {
        if (observador != null) return
        val dir = PuenteNativo.dir(this)
        @Suppress("DEPRECATION")
        val o = object : FileObserver(dir.absolutePath, FileObserver.CLOSE_WRITE or FileObserver.MOVED_TO) {
            override fun onEvent(event: Int, path: String?) {
                if (path == Archivos.RESUMEN) principal.post { actualizar() }
            }
        }
        o.startWatching()
        observador = o
    }

    private fun actualizar() {
        if (!vivo) return
        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(ID, notificacion(Archivos.resumen(this)))
        } catch (e: Exception) {
        }
    }

    private fun crearCanal() {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CANAL) != null) return
        val c = NotificationChannel(CANAL, "Antenas StarSeed", NotificationManager.IMPORTANCE_LOW)
        c.description = "Aviso fijo mientras StarSeed mantiene tus antenas con la app cerrada."
        c.setShowBadge(false)
        nm.createNotificationChannel(c)
    }

    @Suppress("DEPRECATION")
    private fun nuevoAviso(): Notification.Builder =
        if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CANAL) else Notification.Builder(this)

    private fun notificacion(texto: String): Notification {
        val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        val b = nuevoAviso()
            .setSmallIcon(applicationInfo.icon)
            .setContentTitle("StarSeed · antenas")
            .setContentText(texto)
            .setStyle(Notification.BigTextStyle().bigText(texto))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
        packageManager.getLaunchIntentForPackage(packageName)?.let {
            b.setContentIntent(PendingIntent.getActivity(this, 0, it, flags))
        }
        val detener = Intent(this, ServicioAntenas::class.java).setAction(ACCION_DETENER)
        val piDetener = PendingIntent.getService(this, 1, detener, flags)
        b.addAction(Notification.Action.Builder(null as Icon?, "Detener", piDetener).build())
        return b.build()
    }
}
