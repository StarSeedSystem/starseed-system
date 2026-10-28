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
"""

import json
import os

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


def _es_cola_versionada_propia(ruta, linea, raiz=None):
    """(2026-10-28) Las colas versionadas que re-apunta el propio enjambre
    (revisor_bloqueadas_logica.heredar_dependientes, dividir_tareas) se modifican
    en tracked: ` M starseed_memory_root/olas/cola-*.json`. Si sigue siendo
    una lista JSON de tareas con `id`, son contabilidad propia del enjambre
    (se commitean con `_recoger_lo_nuestro`). Si no se puede leer o no lo es,
    sigue siendo ajena: lado seguro."""
    if not ruta:
        return False
    if not ruta.startswith("starseed_memory_root/olas/cola-") or not ruta.endswith(".json"):
        return False
    # Debe ser modificado en el árbol (tracked), no sin seguimiento
    if len(linea) >= 2 and linea[0:2] == "??":
        return False
    # Buscar archivo
    candidatos = []
    if raiz:
        candidatos.append(os.path.join(raiz, ruta))
    candidatos.append(ruta)
    candidatos.append(os.path.join(os.getcwd(), ruta))
    for cand in candidatos:
        try:
            with open(cand, "r", encoding="utf-8") as f:
                datos = json.load(f)
            if isinstance(datos, list) and datos and all(isinstance(t, dict) and "id" in t for t in datos):
                return True
            # Si es lista pero vacía o sin ids, según requisito dice "lista JSON de tareas con `id`"
            # una lista de tareas con id - debe tener elementos con id
            if isinstance(datos, list):
                # si tiene elementos, todos deben tener id
                if datos and all(isinstance(t, dict) for t in datos) and all("id" in t for t in datos):
                    return True
            return False
        except Exception:
            continue
    return False


def repartir(porcelain, propias=PROPIAS, raiz=None):
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
        if ruta in conocidas or _es_cola_versionada_propia(ruta, linea, raiz):
            mias.append(ruta)
        else:
            ajenas.append(ruta)
    return mias, ajenas


def clasificar(porcelain, propias=PROPIAS, raiz=None):
    """Reparte las líneas sucias en (propias, estorbo, ajenas), en el orden que llegaron.

    (2026-10-25, ENJ1025A) Como `repartir`, pero separa además el ESTORBO: un residuo sin
    seguimiento que no es trabajo de nadie (un `informe_analisis.md` suelto en la raíz, una
    copia `.new`, una cola `.no-lanzada`). Un `informe_analisis.md` paró el enjambre de la Mac
    unas 29 horas porque el guardia lo contaba como «ajeno». La regla de qué es estorbo vive en
    UN solo sitio, `curacion_logica`, y la comparten desatascar, el vigilante y este guardia.

    `ajenas` es solo el trabajo de verdad: lo único que justifica «no arranco». Quien llama
    aparta el estorbo con `curacion_logica.apartar_estorbo` (a `olas/_apartado/AAAAMMDD/`, nunca
    se borra) y sigue. `repartir` se queda como estaba."""
    import curacion_logica  # aquí y no arriba: curacion_logica importa `ruta_de` de este módulo

    lineas = [l for l in (porcelain or "").splitlines() if l.strip()]
    estorbo, mias, ajenas = curacion_logica.clasificar_lineas(lineas, propias)
    # (2026-10-28) Las colas versionadas re-apuntadas por el propio enjambre pasan a propias
    if ajenas:
        nuevas_ajenas = []
        for ruta in ajenas:
            # buscar línea correspondiente
            linea_corr = ""
            for l in lineas:
                if ruta_de(l) == ruta:
                    linea_corr = l
                    break
            if _es_cola_versionada_propia(ruta, linea_corr, raiz):
                mias.append(ruta)
            else:
                nuevas_ajenas.append(ruta)
        ajenas = nuevas_ajenas
    return mias, estorbo, ajenas


def solo_es_nuestro(porcelain, propias=PROPIAS):
    """¿El árbol está sucio ÚNICAMENTE por archivos del enjambre?

    Con el árbol limpio devuelve False: no hay nada que recoger, y quien llama
    no debe confundir «no hay nada» con «lo recojo yo».
    """
    mias, ajenas = repartir(porcelain, propias)
    return bool(mias) and not ajenas
