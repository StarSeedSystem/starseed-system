import time
from typing import List, Dict, Tuple, Optional

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


# Clasifica los archivos en el árbol de trabajo como estorbo o trabajo
#
# Los archivos que no están bajo seguimiento y que no son de trabajo se consideran estorbo.
# Los archivos que están bajo seguimiento o que son de trabajo se consideran trabajo.
#
# Args:
#     lineas_porcelain: Lista de líneas de salida de `git status --porcelain`
#
# Returns:
#     Diccionario con dos claves: 'estorbo' y 'trabajo', cada una con una lista de rutas


def es_informe_suelto(ruta: str) -> bool:
    """Un informe .md sin seguimiento EN LA RAÍZ del repo con nombre de informe o de sueño
    (`informe_dream.md`, `sugerencias-….md`): lo deja un agente que escribió en su carpeta de
    trabajo en vez de en `starseed_memory_root/dream/`. (2026-10-06) `informe_dream.md` (07:02)
    contaba como «trabajo» y el vigilante no relanzaba el enjambre: seis horas parado. Va a
    `_apartado/` (no se borra), como el resto del estorbo."""
    if "/" in ruta or not ruta.lower().endswith(".md"):
        return False
    nombre = ruta.lower()
    return nombre.startswith(("informe", "sugerencias")) or "dream" in nombre or "sueno" in nombre


def clasificar_arbol_sucio(lineas_porcelain: List[str]) -> Dict[str, List[str]]:
    estorbo = []
    trabajo = []
    for linea in lineas_porcelain:
        partes = linea.split()
        estado = partes[0]
        ruta = partes[1] if len(partes) > 1 else ""
        if estado == "??":
            if (
                ruta.endswith((".new", ".tmp", ".orig", ".rej", ".bak", "~"))
                or ruta == ".DS_Store"
                or es_informe_suelto(ruta)
            ):
                estorbo.append(ruta)
            else:
                trabajo.append(ruta)
        else:
            trabajo.append(ruta)
    return {"estorbo": estorbo, "trabajo": trabajo}


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
