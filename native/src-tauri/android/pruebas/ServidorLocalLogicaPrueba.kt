// Pruebas de lo puro del servidor local de Android (AND1107A). Sin Android ni Gradle, en cualquier JVM:
//   kotlinc native/src-tauri/android/ServidorLocalLogica.kt native/src-tauri/android/pruebas/ServidorLocalLogicaPrueba.kt \
//     -include-runtime -d /tmp/sll.jar && java -jar /tmp/sll.jar
// No la copia nadie al proyecto Android (solo ServidorLocal.kt y ServidorLocalLogica.kt).
package app.starseed.nativa

import java.io.File
import java.nio.file.Files

private var fallos = 0
private var hechas = 0

private fun prueba(nombre: String, cuerpo: () -> Unit) {
    hechas++
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

fun main() {
    prueba("líneas clave=valor para Rust, sin nulos ni saltos") {
        val t = ServidorLocalLogica.lineas(linkedMapOf("fase" to "error", "motivo" to "uno\ndos\rtres", "nada" to null, "a=b" to "x", "hecho" to 5L))
        igual("fase=error\nmotivo=uno dos tres\nhecho=5\n", t)
    }
    prueba("buildId seguro como nombre de carpeta") {
        igual("AA0YdaG0s8hV9CgdmX1rc", ServidorLocalLogica.idSeguro(" AA0YdaG0s8hV9CgdmX1rc "))
        igual("v1.2_3-x", ServidorLocalLogica.idSeguro("v1.2_3-x"))
        for (malo in listOf(null, "", ".", "..", "a/b", "a\\b", "ñ", "x".repeat(65), "a b")) {
            igual(null, ServidorLocalLogica.idSeguro(malo))
        }
    }
    prueba("zip slip: nada fuera de la carpeta") {
        val base = Files.createTempDirectory("ss-sl").toFile()
        cierto(ServidorLocalLogica.destinoSeguro(base, ".next/server/app/page.js")?.path?.startsWith(base.canonicalPath) == true, "ruta normal")
        cierto(ServidorLocalLogica.destinoSeguro(base, "public/") != null, "carpeta")
        for (malo in listOf("../fuera.js", "a/../../fuera", "/etc/passwd", "a\\..\\b", "", "..", "x\u0000y")) {
            igual(null, ServidorLocalLogica.destinoSeguro(base, malo))
        }
        base.deleteRecursively()
    }
    prueba("versión completa solo con su marcador y server.js") {
        val base = Files.createTempDirectory("ss-sl").toFile()
        val v = File(base, "B1").apply { mkdirs() }
        cierto(!ServidorLocalLogica.completo(v), "sin nada")
        File(v, "server.js").writeText("//")
        cierto(!ServidorLocalLogica.completo(v), "sin marcador")
        File(v, ServidorLocalLogica.MARCADOR).writeText("OTRA")
        cierto(!ServidorLocalLogica.completo(v), "marcador de otra versión")
        File(v, ServidorLocalLogica.MARCADOR).writeText("B1\n")
        cierto(ServidorLocalLogica.completo(v), "completa")
        base.deleteRecursively()
    }
    prueba("sobran las versiones viejas y las parciales, nunca el registro") {
        val base = Files.createTempDirectory("ss-sl").toFile()
        for (d in listOf("B0", "B1", "B1.parcial", "B2.parcial")) File(base, d).mkdirs()
        File(base, ServidorLocalLogica.REGISTRO).writeText("log")
        igual(listOf("B0", "B1.parcial", "B2.parcial"), ServidorLocalLogica.sobrantes(base, "B1").map { it.name })
        igual(emptyList<File>(), ServidorLocalLogica.sobrantes(File(base, "no-existe"), "B1"))
        base.deleteRecursively()
    }
    prueba("progreso: porcentaje y cuándo avisar") {
        igual(0, ServidorLocalLogica.porcentaje(5, 0))
        igual(25, ServidorLocalLogica.porcentaje(25, 100))
        igual(100, ServidorLocalLogica.porcentaje(150, 100))
        cierto(!ServidorLocalLogica.debeAvisar(3, 3, 0, 10_000), "mismo porcentaje")
        cierto(!ServidorLocalLogica.debeAvisar(3, 4, 1_000, 1_100), "demasiado pronto")
        cierto(ServidorLocalLogica.debeAvisar(3, 4, 1_000, 1_500), "nuevo porcentaje a tiempo")
        cierto(ServidorLocalLogica.debeAvisar(99, 100, 1_000, 1_001), "al acabar siempre")
    }
    prueba("espacio: lo descomprimido + 10 % + 200 MB") {
        val mb = 1024L * 1024
        cierto(ServidorLocalLogica.espacioSuficiente(700 * mb, 400 * mb), "sobra")
        cierto(!ServidorLocalLogica.espacioSuficiente(600 * mb, 400 * mb), "justo no")
        igual(400L, ServidorLocalLogica.mb(400 * mb + 5))
    }
    println("$hechas pruebas, $fallos fallos")
    if (fallos > 0) System.exit(1)
}
