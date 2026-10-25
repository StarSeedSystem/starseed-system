import os
import shutil
import time
from typing import List, Dict, Tuple, Optional

from arbol_de_trabajo import ruta_de

# Decide qué trabajadores están colgados sin escribir
#
# Los trabajadores que llevan demasiado tiempo sin escribir se consideran colgados
# y deben ser matados para liberar recursos.
#
# Args:
#     procesos: Lista de diccionarios con información sobre los procesos
#     ahora: Tiempo actual en segundos desde la época
#     tope_s: Tiempo máximo en segundos que un proceso puede estar sin escribir
#
# Returns:
#     Lista de pids de los procesos que deben ser matados


def colgados_a_matar(
    procesos: List[Dict], ahora: float, tope_s: int = 1800
) -> List[int]:
    pids_a_matar = []
    for proceso in procesos:
        if proceso.get("propio", False):
            continue
        pid = proceso.get("pid")
        # Pids ausentes o ≤ 1 (kernel/init) jamás se matan: sería tumbar el sistema
        if not isinstance(pid, int) or pid <= 1:
            continue
        ultimo_byte = proceso.get("ultimo_byte", 0)
        inicio = proceso.get("inicio", 0)
        tiempo_sin_escribir = ahora - (ultimo_byte if ultimo_byte else inicio)
        if tiempo_sin_escribir > tope_s:
            pids_a_matar.append(pid)
    return sorted(pids_a_matar)


# UNA sola fuente de verdad para «estorbo» (2026-10-25, ENJ1025A).
#
# Hasta hoy había TRES clasificadores que no coincidían: `clasificar_arbol_sucio` (el vigilante)
# sabía de informes sueltos y colas `.no-lanzada`, `desatascar.clasificar_sucio` (el director)
# sabía de `.log` y no de lo otro, y el guardia del orquestador no sabía nada de estorbo. Un
# `informe_analisis.md` suelto en la raíz paró el enjambre de la Mac unas 29 horas: el guardia
# decía «no arranco · ajeno: informe_analisis.md» y nadie lo apartaba. Ahora desatascar, el
# vigilante y el orquestador preguntan aquí.

SUFIJOS_ESTORBO = (".log", ".new", ".tmp", ".orig", ".rej", ".bak", "~")
NOMBRES_ESTORBO = (".DS_Store",)


def es_informe_suelto(ruta: str) -> bool:
    """Un informe .md sin seguimiento EN LA RAÍZ del repo con nombre de informe o de sueño
    (`informe_dream.md`, `informe_analisis.md`, `sugerencias-….md`): lo deja un agente que
    escribió en su carpeta de trabajo en vez de en `starseed_memory_root/dream/` o
    `starseed_memory_root/informes/`. (2026-10-06) `informe_dream.md` (07:02) contaba como
    «trabajo» y el vigilante no relanzaba el enjambre: seis horas parado. Va a `_apartado/` (no
    se borra), como el resto del estorbo."""
    if "/" in ruta or not ruta.lower().endswith(".md"):
        return False
    nombre = ruta.lower()
    return nombre.startswith(("informe", "sugerencias")) or "dream" in nombre or "sueno" in nombre


def es_cola_no_lanzada(ruta: str) -> bool:
    """Una cola del reparto que nadie llegó a lanzar (`nube-gh.py` y `oracle_nodo.py` la renombran a
    `.no-lanzada` para que no cuente como envío). La escribe el PROPIO enjambre, así que nunca es
    trabajo de nadie. (2026-10-14) Dos de ellas, sin seguimiento, contaron como «trabajo»: el
    orquestador de la Mac se negó a arrancar ~10 h con 123 tareas listas y nadie lo curó."""
    return ruta.startswith("enjambre/colas/") and ruta.endswith(".no-lanzada")


def es_estorbo(estado: str, ruta: str) -> bool:
    """¿Es un residuo que no es trabajo de nadie? Solo si NO tiene seguimiento (`??`) y tiene pinta de
    residuo: copias (`.new`, `.orig`, `.rej`, `.bak`, `~`), temporales y registros, `.DS_Store`
    en cualquier carpeta, informes sueltos de la raíz y colas `.no-lanzada`. Ante la duda es
    trabajo: apartar lo de otro es peor que no arrancar. Un archivo CON seguimiento y
    modificado nunca es estorbo."""
    if estado != "??" or not ruta:
        return False
    base = os.path.basename(ruta.rstrip("/"))
    return (
        ruta.endswith(SUFIJOS_ESTORBO)
        or base in NOMBRES_ESTORBO
        or es_informe_suelto(ruta)
        or es_cola_no_lanzada(ruta)
    )


def clasificar_lineas(lineas, propias=()) -> Tuple[List[str], List[str], List[str]]:
    """Reparte las líneas de `git status --porcelain` en (estorbo, propias, trabajo), en el orden
    en que llegaron. Es LA clasificación: `desatascar.clasificar_sucio`, el vigilante y el
    guardia del orquestador (vía `arbol_de_trabajo.clasificar`) la usan.

    · propias = rutas que regenera el propio enjambre (`arbol_de_trabajo.PROPIAS`, que quien llama
      pasa); en cualquier estado.
    · estorbo = ver `es_estorbo`.
    · trabajo = todo lo demás.
    Las líneas vacías o que no se entienden se ignoran."""
    conocidas = set(propias or ())
    estorbo: List[str] = []
    mias: List[str] = []
    trabajo: List[str] = []
    for linea in lineas or []:
        if not linea or not str(linea).strip():
            continue
        ruta = ruta_de(linea)
        if not ruta:
            continue
        if ruta in conocidas:
            mias.append(ruta)
        elif es_estorbo(linea[:2], ruta):
            estorbo.append(ruta)
        else:
            trabajo.append(ruta)
    return estorbo, mias, trabajo


def clasificar_arbol_sucio(lineas_porcelain: List[str]) -> Dict[str, List[str]]:
    """Clasifica los archivos del árbol de trabajo como estorbo o trabajo (para el vigilante).

    Args:
        lineas_porcelain: líneas de `git status --porcelain`.

    Returns:
        {'estorbo': [...], 'trabajo': [...]}. Para el vigilante lo que escribe el enjambre
        (`PROPIAS`) cuenta como trabajo: quien lo recoge es el orquestador al arrancar."""
    estorbo, _mias, trabajo = clasificar_lineas(lineas_porcelain)
    return {"estorbo": estorbo, "trabajo": trabajo}


def _destino_libre(carpeta: str, nombre: str) -> str:
    """`carpeta/nombre`, o `carpeta/nombre.1`, `.2`… si ya hay uno: apartar NUNCA pisa lo apartado."""
    destino = os.path.join(carpeta, nombre)
    n = 0
    while os.path.lexists(destino):
        n += 1
        destino = os.path.join(carpeta, "%s.%d" % (nombre, n))
    return destino


def apartar_estorbo(raiz: str, rutas, destino_base: Optional[str] = None, ahora: Optional[float] = None):
    """MUEVE (nunca borra) el estorbo a `<destino_base>/AAAAMMDD/`. Por defecto
    `<raiz>/starseed_memory_root/olas/_apartado/`, que git ignora. Si ya hay uno con el mismo
    nombre ese día, el nuevo lleva `.1`, `.2`…

    Devuelve [(ruta, destino)] de lo que movió. Ignora lo que ya no existe y las rutas que
    salen de la raíz (absolutas o con `..`): este movimiento solo toca el repo."""
    base = destino_base or os.path.join(raiz, "starseed_memory_root", "olas", "_apartado")
    carpeta = os.path.join(base, time.strftime("%Y%m%d", time.localtime(ahora or time.time())))
    movidos = []
    raiz_abs = os.path.abspath(raiz)
    for ruta in rutas or []:
        if not ruta or not ruta.strip() or os.path.isabs(ruta):
            continue
        partes = os.path.normpath(ruta).split(os.sep)
        origen = os.path.abspath(os.path.join(raiz, ruta))
        # Solo lo que cuelga DENTRO de la raíz: ni `..`, ni la propia raíz (ruta «.» o vacía).
        if ".." in partes or origen == raiz_abs or not origen.startswith(raiz_abs + os.sep):
            continue
        if not os.path.lexists(origen):
            continue
        try:
            os.makedirs(carpeta, exist_ok=True)
            destino = _destino_libre(carpeta, os.path.basename(ruta.rstrip("/")))
            shutil.move(origen, destino)
        except OSError:
            continue
        movidos.append((ruta, destino))
    return movidos


def informes_en_la_raiz(raiz: str) -> set:
    """Los nombres de los `.md` de la raíz del repo que `es_informe_suelto` tomaría por un informe
    suelto (con o sin seguimiento: quien llama compara el antes y el después de una corrida)."""
    try:
        return {
            n
            for n in os.listdir(raiz)
            if os.path.isfile(os.path.join(raiz, n)) and es_informe_suelto(n)
        }
    except OSError:
        return set()


def mover_informes(raiz: str, nombres, ahora: Optional[float] = None):
    """MUEVE (nunca borra) informes que un agente dejó en la raíz del repo a su sitio,
    `starseed_memory_root/informes/AAAAMMDD-<nombre>` (git ignora esa carpeta). Un
    `informe_analisis.md` en la raíz paró el enjambre ~29 h (2026-10-25, ENJ1025A): los informes
    de análisis van a `starseed_memory_root/informes/`, no a `main`. Devuelve [(nombre, destino)]."""
    carpeta = os.path.join(raiz, "starseed_memory_root", "informes")
    fecha = time.strftime("%Y%m%d", time.localtime(ahora or time.time()))
    movidos = []
    for nombre in sorted(nombres or []):
        if "/" in nombre or os.sep in nombre or nombre.startswith("."):
            continue
        origen = os.path.join(raiz, nombre)
        if not os.path.isfile(origen):
            continue
        try:
            os.makedirs(carpeta, exist_ok=True)
            destino = _destino_libre(carpeta, "%s-%s" % (fecha, nombre))
            shutil.move(origen, destino)
        except OSError:
            continue
        movidos.append((nombre, destino))
    return movidos


# Decide si el enjambre debe reintentar después de un fallo
#
# Si la causa del fallo sigue presente, el enjambre debe esperar antes de reintentar.
# Si la causa del fallo ha desaparecido, el enjambre debe reintentar inmediatamente.
#
# Args:
#     motivo_anterior: Motivo del fallo anterior
#     causa_sigue: Booleano que indica si la causa del fallo sigue presente
#     segundos_desde_fallo: Tiempo transcurrido desde el fallo en segundos
#     pausa_s: Tiempo de pausa en segundos antes de reintentar
#
# Returns:
#     Booleano que indica si el enjambre debe reintentar


def debe_reintentar_ya(
    motivo_anterior: str,
    causa_sigue: bool,
    segundos_desde_fallo: float,
    pausa_s: int = 600,
) -> bool:
    if not motivo_anterior:
        return True
    if not causa_sigue:
        return True
    return segundos_desde_fallo >= pausa_s
