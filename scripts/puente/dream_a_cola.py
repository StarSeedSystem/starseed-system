"""dream_a_cola · convierte el informe del Dream en tareas que el enjambre puede hacer.

Por qué existe (2026-09-16). El Dream de Hermes lleva desde el 6 de septiembre escribiendo
`starseed_memory_root/dream/sugerencias-AAAA-MM-DD.md` cada mañana a las siete: mejoras
detectadas, riesgos, ideas nuevas. Nueve informes. **Y nadie los ha leído.** Un analista que
trabaja toda la noche y cuyo informe nadie abre no es un analista: es un archivo creciendo.

Alex: «ese reporte del dream que ya se genera automáticamente que se envíe a los directores
del puente de mando para que lo procesen y ejecuten lo que sea útil y coherente y se
autoperfeccione».

Lo que este módulo decide, y lo que NO:
  · SÍ: qué dice el informe, qué es accionable, con qué prioridad, y si ya se encargó antes.
  · NO: ejecutar nada. Devuelve tareas propuestas; lanzarlas es cosa del director.

Y una cautela que importa: el Dream lo escriben modelos gratuitos leyendo registros. Repite
cosas, se inventa alguna y a veces propone lo que ya está hecho. Por eso hay un filtro de
coherencia y una memoria de lo ya encargado — sin eso, cada mañana encolaríamos lo mismo.

Módulo PURO: entra el texto del informe, salen tareas propuestas.
"""

import re

# Las secciones que el Dream escribe, y cuánto pesa cada una. Un riesgo vivo importa más
# que una idea bonita: el orden de la lista es el orden en que se atienden.
PESO = {
    "riesgos": 0,
    "top 3 accionables": 1,
    "mejoras detectadas": 2,
    "ideas nuevas": 3,
}
# Lo que NO es una tarea aunque esté en una lista: estado, no trabajo.
NO_ES_TAREA = (
    "estado del enjambre",
    "resumen",
    "sin novedad",
)
# Señales de que un punto es una OBSERVACIÓN y no un encargo. Sin un verbo de acción,
# el enjambre no sabría qué escribir.
VERBOS = (
    "añadir", "crear", "unificar", "acotar", "paginar", "rotar", "mover", "convertir",
    "reducir", "evaluar", "comprobar", "corregir", "arreglar", "quitar", "separar",
    "implementar", "migrar", "cachear", "limitar", "documentar", "renombrar", "publicar",
    "des-simular", "optimizar", "sustituir", "dividir", "cerrar", "desactivar",
)

_TITULO = re.compile(r"^\s*\d+\.\s+\*\*(.+?)\*\*\s*(?:—|-|·)?\s*(.*)$")
_SECCION = re.compile(r"^##\s+(.+?)\s*$")


def secciones(texto):
    """{nombre_de_seccion_en_minúsculas: [línea, …]} del informe del Dream."""
    fuera, actual = {}, None
    for linea in (texto or "").splitlines():
        m = _SECCION.match(linea)
        if m:
            actual = m.group(1).strip().lower()
            # El emoji y los adornos no son parte del nombre.
            actual = re.sub(r"[^\wáéíóúñü0-9 ]+", "", actual).strip()
            fuera.setdefault(actual, [])
            continue
        if actual is not None and linea.strip():
            fuera[actual].append(linea)
    return fuera


def puntos(lineas):
    """[(título, cuerpo)] de una sección numerada del informe."""
    fuera = []
    for linea in lineas or []:
        m = _TITULO.match(linea)
        if m:
            fuera.append((m.group(1).strip(), m.group(2).strip()))
    return fuera


def es_accionable(titulo, cuerpo):
    """¿Esto se puede encargar, o es una observación?

    Pide un verbo de acción en alguna parte. Un punto que solo describe un hecho
    —«load average 15.67»— es información para una persona, no una tarea para un agente:
    encargarlo produce trabajo inventado, que es peor que no hacer nada.
    """
    t = ("%s %s" % (titulo or "", cuerpo or "")).lower()
    if not t.strip():
        return False
    if any(n in t for n in NO_ES_TAREA):
        return False
    return any(v in t for v in VERBOS)


def clave(titulo):
    """Identidad estable de una sugerencia, para no encargarla dos veces.

    El Dream reescribe el mismo punto cada mañana con palabras distintas; el título
    aguanta mejor que el cuerpo. Se normaliza para que «Governor de troncos (CPU
    contention)» y «Governor de troncos» sean el mismo asunto.
    """
    t = (titulo or "").lower()
    t = re.sub(r"\(.*?\)", " ", t)
    t = re.sub(r"[^\wáéíóúñü0-9 ]+", " ", t)
    return " ".join(t.split())[:60]


def proponer(texto, ya_encargadas=(), tope=3):
    """Tareas propuestas a partir de un informe, las más urgentes primero.

    `ya_encargadas`: claves de sugerencias que ya se convirtieron en tarea otro día.
    `tope`: cuántas como mucho. El Dream propone veinte cosas cada mañana; encargar
    veinte es garantizar que no se hace ninguna.
    """
    vistas = set(ya_encargadas or ())
    candidatas = []
    for nombre, lineas in secciones(texto).items():
        peso = None
        for etiqueta, p in PESO.items():
            if etiqueta in nombre:
                peso = p
                break
        if peso is None:
            continue
        for titulo, cuerpo in puntos(lineas):
            k = clave(titulo)
            if not k or k in vistas:
                continue
            if not es_accionable(titulo, cuerpo):
                continue
            vistas.add(k)
            candidatas.append({
                "clave": k,
                "titulo": titulo,
                "cuerpo": cuerpo,
                "seccion": nombre,
                "peso": peso,
            })
    candidatas.sort(key=lambda c: c["peso"])
    return candidatas[:max(0, int(tope or 0))]


def resumen(propuestas, total_leidas=None):
    """Una frase para el canal: qué se encargó y de dónde salió."""
    if not propuestas:
        return "Dream leído: nada accionable nuevo que encargar."
    titulos = "; ".join(p["titulo"] for p in propuestas)
    cola = " de %d leídas" % total_leidas if total_leidas else ""
    return "Dream leído: encargo %d%s — %s" % (len(propuestas), cola, titulos)
