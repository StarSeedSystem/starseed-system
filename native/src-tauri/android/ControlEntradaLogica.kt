package app.starseed.nativa

/** Lo puro de la lista de controladores aceptados (PEN1116): quitar por huella sin tocar el resto.
 *  Sin Android ni org.json, para poder probarla en cualquier JVM; en el aparato la llama ControlEntradaNativo.
 *  El archivo `aceptados.json` lo escribe SOLO Kotlin, formato {"v":1,"controladores":[…]} compacto. */
object ControlEntradaLogica {

    /** Huella con forma válida: no vacía, hasta 128 caracteres y sin espacios (un solo bloque). */
    fun huellaValida(h: String): Boolean = h.isNotEmpty() && h.length <= 128 && h.none { it.isWhitespace() }

    /** Devuelve (json nuevo, cuántos quitó). Si algo no cuadra devuelve (el json de entrada, 0):
     *  un archivo roto o con un formato que no sepamos leer NUNCA se pisa. */
    fun sinHuella(json: String, huella: String): Pair<String, Int> {
        val clave = "\"controladores\""
        val c0 = json.indexOf(clave)
        if (c0 < 0) return json to 0
        val a0 = json.indexOf('[', c0 + clave.length)
        if (a0 < 0) return json to 0
        // Entre la clave y el corchete solo puede haber «:» y espacios; cualquier otra cosa: no se toca.
        if (json.substring(c0 + clave.length, a0).any { it != ':' && !it.isWhitespace() }) return json to 0
        val fin = finDeArray(json, a0) ?: return json to 0
        val objetos = partes(json, a0 + 1, fin) ?: return json to 0
        if (objetos.isEmpty()) return json to 0
        var quitados = 0
        val quedan = mutableListOf<String>()
        for ((s, e) in objetos) {
            val h = huellaDeObjeto(json, s, e) ?: return json to 0 // una entrada que no sepamos leer: no se toca nada
            if (h == huella) quitados++ else quedan.add(json.substring(s, e))
        }
        if (quitados == 0) return json to 0
        // Los objetos que quedan salen tal cual estaban; solo se regeneran las comas entre ellos.
        return (json.substring(0, a0 + 1) + quedan.joinToString(",") + json.substring(fin)) to quitados
    }

    /** Posición del «]» que cierra el array que empieza en a0, o null si no cierra bien. */
    private fun finDeArray(json: String, a0: Int): Int? {
        var enTexto = false; var escape = false; var profundidad = 0
        for (p in a0 until json.length) {
            val ch = json[p]
            if (enTexto) { if (escape) escape = false else if (ch == '\\') escape = true else if (ch == '"') enTexto = false }
            else when (ch) {
                '"' -> enTexto = true
                '[' -> profundidad++
                ']' -> { profundidad--; if (profundidad == 0) return p }
            }
        }
        return null
    }

    /** Tramos (inicio, fin exclusivo) de cada objeto del array, o null si hay algo que no cuadra. */
    private fun partes(json: String, desde: Int, hasta: Int): List<Pair<Int, Int>>? {
        val r = mutableListOf<Pair<Int, Int>>()
        var p = desde; var enTexto = false; var escape = false; var profundidad = 0; var inicio = -1
        while (p < hasta) {
            val ch = json[p]
            if (enTexto) { if (escape) escape = false else if (ch == '\\') escape = true else if (ch == '"') enTexto = false }
            else when (ch) {
                '"' -> enTexto = true
                '{' -> { if (profundidad == 0) inicio = p; profundidad++ }
                '}' -> {
                    profundidad--; if (profundidad < 0 || inicio < 0) return null
                    if (profundidad == 0) { r.add(inicio to p + 1); inicio = -1 }
                }
                ',' -> if (profundidad == 0 && inicio >= 0) return null
                else -> if (profundidad == 0 && !ch.isWhitespace()) return null // en esta lista solo hay objetos
            }
            p++
        }
        return if (enTexto || escape || profundidad != 0 || inicio >= 0) null else r
    }

    /** El valor de la clave "huella" dentro de un objeto, ya sin escapes, o null si no está claro. */
    private fun huellaDeObjeto(json: String, s: Int, e: Int): String? {
        var k = s
        while (k < e) {
            k = json.indexOf("\"huella\"", k)
            if (k < 0 || k + 8 > e) return null
            val v = valorTrasClave(json, k + 8, e)
            if (v != null) return v
            k += 8
        }
        return null
    }

    /** Tras una clave, el valor si es un texto JSON (con sus escapes resueltos), o null. */
    private fun valorTrasClave(json: String, desde: Int, hasta: Int): String? {
        var p = desde
        while (p < hasta && json[p].isWhitespace()) p++
        if (p >= hasta || json[p] != ':') return null
        p++
        while (p < hasta && json[p].isWhitespace()) p++
        if (p >= hasta || json[p] != '"') return null
        p++
        val sb = StringBuilder()
        while (p < hasta) {
            val ch = json[p]
            if (ch == '\\') {
                if (p + 1 >= hasta) return null
                p++
                when (json[p]) {
                    'u' -> { if (p + 5 > hasta) return null; sb.append(json.substring(p + 1, p + 5).toIntOrNull(16)?.toChar() ?: return null); p += 4 }
                    '"' -> sb.append('"')
                    '\\' -> sb.append('\\')
                    '/' -> sb.append('/')
                    'b' -> sb.append('\b')
                    'f' -> sb.append('')
                    'n' -> sb.append('\n')
                    'r' -> sb.append('\r')
                    't' -> sb.append('\t')
                    else -> return null
                }
            } else if (ch == '"') return sb.toString()
            else sb.append(ch)
            p++
        }
        return null // sin comilla de cierre
    }
}