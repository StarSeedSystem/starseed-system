// Lo copia native/src-tauri/build.rs en el proyecto Android que genera Tauri (no editar allí). NFC1126B.
// Contrato: architecture/nfc-neuronas.md §2. Las constantes son las de src/nfc_logica.rs (una prueba vigila que casen).
package app.starseed.nativa

import android.nfc.cardemulation.HostApduService
import android.os.Bundle

/**
 * La neurona como TARJETA: otro aparato en modo lector selecciona el AID de StarSeed y pide la tarjeta de neurona
 * (firmada, de vida corta) por trozos. Solo entrega lo que la web dejó preparado con `nfc_iniciar`; sin tarjeta o
 * caducada contesta «sin tarjeta». Nunca guarda ni envía nada más.
 */
class HceStarSeed : HostApduService() {
    override fun processCommandApdu(apdu: ByteArray?, extras: Bundle?): ByteArray {
        val a = apdu ?: return SW_INS_DESCONOCIDA
        if (a.size >= 2 && a[0] == 0x00.toByte() && a[1] == 0xA4.toByte()) {
            val esNuestro = a.size >= 5 + AID.size && a[4].toInt() == AID.size && AID.indices.all { a[5 + it] == AID[it] }
            return if (esNuestro) SW_OK else SW_SELECT_NO_ENCONTRADO
        }
        if (a.size < 4 || a[0] != CLA_STARSEED || a[1] != INS_TARJETA) return SW_INS_DESCONOCIDA
        val t = NfcNativa.tarjetaVigente()
        if (t == null || t.isEmpty() || t.size > MAX_TARJETA) return SW_SIN_TARJETA
        val desde = ((a[2].toInt() and 0xFF) shl 8) or (a[3].toInt() and 0xFF)
        if (desde >= t.size) return SW_FUERA_DE_RANGO
        val fin = minOf(desde + TROZO_MAX, t.size)
        if (fin == t.size) NfcNativa.anotarLeida()
        return t.copyOfRange(desde, fin) + (if (fin == t.size) SW_OK else SW_MAS)
    }

    override fun onDeactivated(reason: Int) {}

    companion object {
        const val CLA_STARSEED: Byte = 0x80.toByte()
        const val INS_TARJETA: Byte = 0xCA.toByte()
        const val TROZO_MAX = 250
        const val MAX_TARJETA = 1024
        val AID = byteArrayOf(0xF0.toByte(), 0x53, 0x54, 0x41, 0x52, 0x53, 0x45, 0x45, 0x44)
        val SW_OK = byteArrayOf(0x90.toByte(), 0x00)
        val SW_MAS = byteArrayOf(0x91.toByte(), 0x00)
        val SW_FUERA_DE_RANGO = byteArrayOf(0x6B, 0x00)
        val SW_SIN_TARJETA = byteArrayOf(0x69, 0x85.toByte())
        val SW_INS_DESCONOCIDA = byteArrayOf(0x6D, 0x00)
        val SW_SELECT_NO_ENCONTRADO = byteArrayOf(0x6A, 0x82.toByte())
    }
}
