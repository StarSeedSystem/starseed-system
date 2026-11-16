// Pruebas de lo puro de la lista de controladores aceptados (PEN1116). Sin Android ni Gradle, en cualquier JVM:
//   kotlinc native/src-tauri/android/ControlEntradaLogica.kt native/src-tauri/android/pruebas/ControlEntradaLogicaPrueba.kt \
//     -include-runtime -d /tmp/cel.jar && java -jar /tmp/cel.jar
// No la copia nadie al proyecto Android (solo ControlEntradaLogica.kt).
package app.starseed.nativa

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

private val DOS = """{"v":1,"controladores":[{"spki":"s1","huella":"aaa111","cuenta":"c1","nombre":"una","t_ms":1},{"spki":"s2","huella":"bbb222","cuenta":"c2","nombre":"dos","t_ms":2}]}"""

fun main() {
    prueba("huella válida: un bloque, sin espacios, de 1 a 128") {
        cierto(ControlEntradaLogica.huellaValida("a"), "una letra")
        cierto(ControlEntradaLogica.huellaValida("a".repeat(128)), "justo 128")
        for (mala in listOf("", "a".repeat(129), "a b", "a\nb", "\ta", "a\t", "añ a")) {
            igual(false, ControlEntradaLogica.huellaValida(mala))
        }
    }
    prueba("quitar una: se va solo su objeto y el resto queda tal cual") {
        val (nuevo, n) = ControlEntradaLogica.sinHuella(DOS, "aaa111")
        igual(1, n)
        igual("""{"v":1,"controladores":[{"spki":"s2","huella":"bbb222","cuenta":"c2","nombre":"dos","t_ms":2}]}""", nuevo)
    }
    prueba("quitar la última deja la lista vacía, con la clave v intacta") {
        val una = """{"v":1,"controladores":[{"spki":"s1","huella":"aaa111","t_ms":1}]}"""
        val (nuevo, n) = ControlEntradaLogica.sinHuella(una, "aaa111")
        igual(1, n)
        igual("""{"v":1,"controladores":[]}""", nuevo)
    }
    prueba("quitar la que no está: n=0 y el json no se toca") {
        val (nuevo, n) = ControlEntradaLogica.sinHuella(DOS, "zzz999")
        igual(0, n)
        igual(DOS, nuevo)
    }
    prueba("huella igual por prefijo NO quita (comparación exacta)") {
        val (n1, q1) = ControlEntradaLogica.sinHuella(DOS, "aaa") // más corta que la guardada
        igual(0, q1)
        igual(DOS, n1)
        val (n2, q2) = ControlEntradaLogica.sinHuella(DOS, "aaa111x") // más larga que la guardada
        igual(0, q2)
        igual(DOS, n2)
    }
    prueba("repetidas: se quitan todas las que coinciden") {
        val rep = """{"v":1,"controladores":[{"huella":"a1"},{"huella":"b2"},{"huella":"a1"}]}"""
        val (nuevo, n) = ControlEntradaLogica.sinHuella(rep, "a1")
        igual(2, n)
        igual("""{"v":1,"controladores":[{"huella":"b2"}]}""", nuevo)
    }
    prueba("json roto no se pisa: vuelve igual y con 0") {
        for (roto in listOf(
            "",
            "no es json",
            """{"v":1}""",
            """{"v":1,"controladores":5}""",
            """{"v":1,"controladores":[{"huella":"a1"}""",
            """{"v":1,"controladores":[{huella:"a1"}]}""",
            """{"v":1,"controladores":[{"otro":"x"}]}""",
            """{"v":1,"controladores":["a1"]}]""",
        )) {
            val (nuevo, n) = ControlEntradaLogica.sinHuella(roto, "a1")
            igual(0, n)
            igual(roto, nuevo)
        }
    }
    println("$hechas pruebas, $fallos fallos")
    if (fallos > 0) System.exit(1)
}
