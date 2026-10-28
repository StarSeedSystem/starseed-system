"""arbol_de_trabajo · quién ensucia el árbol: el propio enjambre o alguien de fuera.

Por qué existe (2026-09-16). El orquestador se niega a arrancar si `main` tiene
cambios sin commitear, y hace bien: nadie quiere agentes escribiendo encima de
trabajo a medias. Pero el 16/09 el único archivo sucio era
`memory/aprendizaje-olas.md`, que escribe el DIRECTOR DE APRENDIZAJE del propio
enjambre al cerrar cada ola. Su commit falló una vez (choque con el commit de la
ola) y el archivo se quedó en el índice: el guardia vio «1 archivo sin commit»,
se negó a arrancar, el vigilante vio lo mismo y tampoco relanzó, y el enjambre
estuvo diez horas parado por su propia contabilidad.

La regla que sale de ahí: un guardia que protege el trabajo AJENO no debe
tropezar con lo PROPIO. Este módulo separa una cosa de la otra y no decide nada
más; quien llama elige qué hacer con cada montón (el orquestador commitea lo
propio y sigue, y se planta solo si hay algo ajeno).

Módulo PURO: entra el texto de `git status --porcelain`, salen dos listas.

(2026-10-28, DEC1028E) Las COLAS versionadas que el propio enjambre re-apunta (el revisor de
Bloqueadas hereda `depende` a las partes `-dN`) también son contabilidad propia: si el archivo
sigue siendo una lista JSON de tareas con `id`, el guardia la commitea y arranca. Antes esas
tres colas de la ola 1025 pararon el enjambre de la Mac desde el 27/10 a las 22:26. Si la cola
no se puede leer o ya no es una lista de tareas, sigue siendo ajena: el lado seguro.
"""

import fnmatch
import json
import os

# Carpeta y patrón de las colas versionadas del enjambre (relativas a la raíz del repo). Solo se
# dan por propias si están MODIFICADAS (` M`), no si aparecen sin seguimiento ni en otro estado.
CARPETA_COLAS = "starseed_memory_root/olas"
PATRON_COLA = "cola-*.json"

# Raíz por defecto para leer las colas: este archivo vive en `<raíz>/scripts/puente/`.
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Rutas (relativas a la raíz del repo) que escribe el propio enjambre como parte
# de su funcionamiento normal. Solo esto se considera «propio»: la lista se
# amplía a mano y con motivo, nunca con comodines, para que un fallo de un agente
# no se cuele por aquí disfrazado de contabilidad.
PROPIAS = (
    "memory/aprendizaje-olas.md",
    # (2026-09-16, otra vez) El relevo del workflow a los IDE regenera estos cuatro al
    # cerrar cada ola. Añadí el relevo por la tarde y volví a dejar el enjambre parado por
    # lo mismo que por la mañana: «no arranco · ajeno: PUENTE-DE-MANDO.md». La lección no
    # era «commitea la memoria de aprendizaje», era **todo lo que el enjambre escribe solo
    # va en esta lista el mismo día que se escribe**.
    "PUENTE-DE-MANDO.md",
    ".github/copilot-instructions.md",
    ".cursor/rules/puente-de-mando.mdc",
    "memory/workflow-actual.md",
)


def ruta_de(linea):
    """La ruta que nombra una línea de `git status --porcelain`.

    Formato: dos letras de estado, un espacio, y la ruta. En renombrados y
    copias llegan dos rutas (`R  vieja -> nueva`) y nos quedamos con la nueva,
    que es la que existe ahora. Git entrecomilla las rutas con caracteres raros.
    """
    if not linea or len(linea) < 4:
        return ""
    resto = linea[3:].strip()
    if " -> " in resto:
        resto = resto.split(" -> ", 1)[1].strip()
    if len(resto) >= 2 and resto[0] == '"' and resto[-1] == '"':
        resto = resto[1:-1].replace('\\"', '"').replace("\\\\", "\\")
    return resto


def repartir(porcelain, propias=PROPIAS):
    """Reparte las líneas sucias en (propias, ajenas), en el orden que llegaron.

    Devuelve rutas, no líneas: quien llame va a commitear o a nombrar archivos.
    """
    conocidas = set(propias)
    mias, ajenas = [], []
    for linea in (porcelain or "").splitlines():
        if not linea.strip():
            continue
        ruta = ruta_de(linea)
        if not ruta:
            continue
        (mias if ruta in conocidas else ajenas).append(ruta)
    return mias, ajenas


def es_cola_propia(linea, ruta, raiz=None):
    """¿Esta línea es una cola versionada que el propio enjambre re-apunta?

    Solo la línea ` M <cola>`: modificada en el árbol y con seguimiento, nunca `??` ni `M `
    (el resto de estados sigue como hoy). Además el archivo tiene que seguir siendo una lista
    JSON de tareas con `id`; si no se puede leer o no lo es, devuelve False y cuenta como ajena.
    """
    carpeta, _, nombre = ruta.rpartition("/")
    if (
        linea[:2] != " M"
        or carpeta != CARPETA_COLAS
        or not fnmatch.fnmatchcase(nombre, PATRON_COLA)
    ):
        return False
    try:
        with open(os.path.join(raiz or RAIZ, ruta), "r", encoding="utf-8") as f:
            tareas = json.load(f)
    except (OSError, ValueError):
        return False
    if not isinstance(tareas, list):
        return False
    for tarea in tareas:
        if not isinstance(tarea, dict) or not isinstance(tarea.get("id"), str) or not tarea["id"]:
            return False
    return True


def clasificar(porcelain, propias=PROPIAS, raiz=None):
    """Reparte las líneas sucias en (propias, estorbo, ajenas), en el orden que llegaron.

    (2026-10-25, ENJ1025A) Como `repartir`, pero separa además el ESTORBO: un residuo sin
    seguimiento que no es trabajo de nadie (un `informe_analisis.md` suelto en la raíz, una
    copia `.new`, una cola `.no-lanzada`). Un `informe_analisis.md` paró el enjambre de la Mac
    unas 29 horas porque el guardia lo contaba como «ajeno». La regla de qué es estorbo vive en
    UN solo sitio, `curacion_logica`, y la comparten desatascar, el vigilante y este guardia.

    `ajenas` es solo el trabajo de verdad: lo único que justifica «no arranco». Quien llama
    aparta el estorbo con `curacion_logica.apartar_estorbo` (a `olas/_apartado/AAAAMMDD/`, nunca
    se borra) y sigue. `repartir` se queda como estaba.

    (2026-10-28, DEC1028E) Las colas versionadas que el enjambre re-apunta (` M
    starseed_memory_root/olas/cola-*.json`) también son propias, siempre que sigan siendo una
    lista JSON de tareas con `id` (ver `es_cola_propia`). `raiz` es de dónde se leen: por
    defecto, la raíz del repo."""
    import curacion_logica  # aquí y no arriba: curacion_logica importa `ruta_de` de este módulo

    lineas = [l for l in (porcelain or "").splitlines() if l.strip()]
    conocidas = set(propias or ())
    colas = []
    for linea in lineas:
        ruta = ruta_de(linea)
        if ruta and ruta not in conocidas and es_cola_propia(linea, ruta, raiz):
            colas.append(ruta)
    estorbo, mias, ajenas = curacion_logica.clasificar_lineas(
        lineas, tuple(propias or ()) + tuple(colas)
    )
    return mias, estorbo, ajenas


def solo_es_nuestro(porcelain, propias=PROPIAS):
    """¿El árbol está sucio ÚNICAMENTE por archivos del enjambre?

    Con el árbol limpio devuelve False: no hay nada que recoger, y quien llama
    no debe confundir «no hay nada» con «lo recojo yo».
    """
    mias, ajenas = repartir(porcelain, propias)
    return bool(mias) and not ajenas
