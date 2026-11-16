// Pruebas de la descarga reanudable (FAC1116). Sin Android ni Gradle, en cualquier JVM:
//   kotlinc native/src-tauri/android/DescargaReanudable.kt native/src-tauri/android/pruebas/DescargaReanudablePrueba.kt \
//     -include-runtime -d /tmp/dr.jar && java -jar /tmp/dr.jar
// (Escritas el 16-11 sin compilador a mano: las comprueba la CI. No las copia nadie al proyecto Android.)
package app.starseed.nativa

import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.net.SocketTimeoutException
import java.nio.file.Files

private var fallos = 0

private fun prueba(nombre: String, cuerpo: () -> Unit) {
    try {
        cuerpo()
        println("ok   $nombre")
    } catch (t: Throwable) {
        fallos++
        println("FALLA $nombre: ${t.message}")
    }
}

private fun cierto(v: Boolean, que: String) {
    if (!v) throw AssertionError(que)
}

private fun <T> igual(esperado: T, real: T) {
    if (esperado != real) throw AssertionError("esperaba <$esperado> y salió <$real>")
}

/** Un servidor falso con un archivo de `bytes`; cada conexión sirve `cortes[i]` bytes y luego falla como se diga. */
private class Servidor(val datos: ByteArray, val aceptaRange: Boolean = true, val cortes: MutableList<Pair<Int, String>> = mutableListOf()) {
    val pedidos = mutableListOf<Long>()
    val fuente = DescargaReanudable.Fuente { desde ->
        pedidos.add(desde)
        val corte = if (cortes.isNotEmpty()) cortes.removeAt(0) else null
        val empieza = if (aceptaRange) desde.toInt() else 0
        val codigo = if (aceptaRange && desde > 0) 206 else 200
        val resto = datos.copyOfRange(empieza, datos.size)
        val flujo: InputStream = if (corte == null) {
            ByteArrayInputStream(resto)
        } else {
            val buenos = resto.copyOfRange(0, minOf(corte.first, resto.size))
            object : InputStream() {
                val base = ByteArrayInputStream(buenos)
                override fun read(): Int = base.read()
                override fun read(b: ByteArray, off: Int, len: Int): Int {
                    val n = base.read(b, off, len)
                    if (n >= 0) return n
                    if (corte.second == "tiempo") throw SocketTimeoutException("sin datos")
                    if (corte.second == "cierre") return -1
                    throw IOException(corte.second)
                }
            }
        }
        DescargaReanudable.Respuesta(codigo, flujo, datos.size.toLong()) {}
    }
}

private fun datos(n: Int) = ByteArray(n) { (it * 31 % 251).toByte() }

private fun tmp(): File = File(Files.createTempDirectory("dr").toFile(), "x.parcial")

/** Reloj falso: avanza solo cuando se «duerme». */
private class Reloj {
    var t = 0L
    val pausas = mutableListOf<Long>()
    fun ahora() = t
    fun dormir(ms: Long) {
        pausas.add(ms); t += ms
    }
}

fun main() {
    prueba("sin cortes: baja todo de una vez") {
        val s = Servidor(datos(200_000)); val r = Reloj(); val f = tmp()
        val n = DescargaReanudable.bajar(s.fuente, f, 200_000, 1 shl 30, r::ahora, r::dormir) {}
        igual(200_000L, n); igual(listOf(0L), s.pedidos)
        cierto(f.readBytes().contentEquals(s.datos), "contenido distinto")
    }
    prueba("un corte a los 36 %: reanuda con Range desde donde estaba y el archivo queda igual") {
        val s = Servidor(datos(200_000), cortes = mutableListOf(72_000 to "tiempo")); val r = Reloj(); val f = tmp()
        val avisos = mutableListOf<String>()
        DescargaReanudable.bajar(s.fuente, f, 200_000, 1 shl 30, r::ahora, r::dormir) { p -> p.aviso?.let { avisos.add(it) } }
        igual(listOf(0L, 72_000L), s.pedidos)
        cierto(f.readBytes().contentEquals(s.datos), "contenido distinto")
        cierto(avisos.size == 1 && avisos[0].contains("36 %"), "el aviso dice el porcentaje: $avisos")
    }
    prueba("el servidor que ignora Range (200) hace empezar de cero sin duplicar bytes") {
        val s = Servidor(datos(100_000), aceptaRange = false, cortes = mutableListOf(40_000 to "tiempo")); val r = Reloj(); val f = tmp()
        DescargaReanudable.bajar(s.fuente, f, 100_000, 1 shl 30, r::ahora, r::dormir) {}
        cierto(f.readBytes().contentEquals(s.datos), "contenido distinto")
    }
    prueba("cierre limpio antes de tiempo (EOF a medias) también reanuda") {
        val s = Servidor(datos(100_000), cortes = mutableListOf(50_000 to "cierre")); val r = Reloj(); val f = tmp()
        DescargaReanudable.bajar(s.fuente, f, 100_000, 1 shl 30, r::ahora, r::dormir) {}
        cierto(f.readBytes().contentEquals(s.datos), "contenido distinto")
    }
    prueba("una línea lenta pero viva (avanza entre cortes) nunca se rinde") {
        val cortes = MutableList(30) { 20_000 to "tiempo" }
        val s = Servidor(datos(500_000), cortes = cortes); val r = Reloj(); val f = tmp()
        DescargaReanudable.bajar(s.fuente, f, 500_000, 1 shl 30, r::ahora, r::dormir) {}
        cierto(f.readBytes().contentEquals(s.datos), "contenido distinto")
    }
    prueba("sin avance 5 veces seguidas: se rinde con bytes, porcentaje y motivo, y CONSERVA el parcial") {
        val cortes = MutableList(20) { 0 to "tiempo" }
        val s = Servidor(datos(200_000), cortes = cortes); val r = Reloj(); val f = tmp()
        f.writeBytes(datos(200_000).copyOfRange(0, 72_000))
        val e = try {
            DescargaReanudable.bajar(s.fuente, f, 200_000, 1 shl 30, r::ahora, r::dormir) {}
            null
        } catch (x: DescargaReanudable.Rendida) { x }
        cierto(e != null, "debía rendirse")
        igual(5, e!!.reanudaciones)
        cierto(e.message!!.contains("36 %") && e.message!!.contains("5 reanudaciones") && e.message!!.contains("sin datos desde hace 30 s"), e.message!!)
        igual(72_000L, f.length())
        igual(5, s.pedidos.size) // 1 inicial + 4 reanudaciones; a la 5.ª sin avance se rinde
    }
    prueba("la pausa crece 2, 4, 8, 16, 20 s") {
        val v = (0..5).map { DescargaReanudable.pausaMs(it) }
        igual(listOf(2000L, 4000L, 8000L, 16000L, 20000L, 20000L), v.map { it })
    }
    prueba("parcial más largo que el archivo: se descarta y se empieza de cero") {
        val s = Servidor(datos(10_000)); val r = Reloj(); val f = tmp()
        f.writeBytes(ByteArray(20_000))
        DescargaReanudable.bajar(s.fuente, f, 10_000, 1 shl 30, r::ahora, r::dormir) {}
        cierto(f.readBytes().contentEquals(s.datos), "contenido distinto")
    }
    prueba("parcial ya completo: no abre ninguna conexión") {
        val s = Servidor(datos(10_000)); val r = Reloj(); val f = tmp()
        f.writeBytes(s.datos)
        DescargaReanudable.bajar(s.fuente, f, 10_000, 1 shl 30, r::ahora, r::dormir) {}
        igual(0, s.pedidos.size)
    }
    prueba("Content-Range y porcentaje") {
        igual(500L, DescargaReanudable.totalDeContentRange("bytes 100-199/500"))
        igual(0L, DescargaReanudable.totalDeContentRange("bytes 100-199/*"))
        igual(0L, DescargaReanudable.totalDeContentRange(null))
        igual(36, DescargaReanudable.porcentaje(72, 200))
        igual(0, DescargaReanudable.porcentaje(5, 0))
    }
    println(if (fallos == 0) "TODO EN VERDE" else "FALLARON $fallos")
    if (fallos > 0) System.exit(1)
}
