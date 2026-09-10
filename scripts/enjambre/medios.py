# -*- coding: utf-8 -*-
"""Decisiones puras para repartir tareas entre medios del enjambre.

No toca procesos ni archivos. El orquestador conserva esas responsabilidades y usa
este módulo para decidir qué medio está sano, qué arriendos vencieron y quién debe
recibir cada tarea pendiente.
"""
import copy
import math


ESTADOS_UTILIZABLES = ("disponible", "ocupado")


def _entero_no_negativo(valor):
    try:
        return max(0, int(valor or 0))
    except (TypeError, ValueError):
        return 0


def _numero(valor):
    try:
        return float(valor or 0)
    except (TypeError, ValueError):
        return 0.0


def area_de_tarea(tarea):
    """Devuelve un área estable para aprender qué medio resuelve mejor cada trabajo."""
    explicita = str(tarea.get("area") or tarea.get("área") or "").strip().lower()
    if explicita:
        return explicita
    rutas = [str(r).lower() for r in tarea.get("archivos") or []]
    pistas = (
        ("tests", ("test", "spec", "vitest", "pytest")),
        ("datos", ("supabase", "sql", "schema", "migration")),
        ("api", ("/api/", "route.ts", "server/")),
        ("interfaz", ("component", "page.tsx", "layout.tsx", ".css")),
        ("automatización", ("scripts/", ".py", ".sh")),
        ("documentación", (".md", "docs/")),
    )
    texto = " ".join(rutas + [str(tarea.get("titulo") or "").lower()])
    for area, claves in pistas:
        if any(clave in texto for clave in claves):
            return area
    return "general"


def estado_medio(medio, ahora, latido_max_s=90, avance_max_s=300):
    """Clasifica un medio sin confundir proceso vivo con escritura que progresa."""
    if not medio.get("activo", True):
        return "desconectado"
    try:
        edad_latido = ahora - float(medio.get("latido", 0))
    except (TypeError, ValueError):
        edad_latido = latido_max_s + 1
    if edad_latido > latido_max_s:
        return "desconectado"
    carga = _entero_no_negativo(medio.get("carga"))
    if carga:
        try:
            edad_avance = ahora - float(medio.get("avance", medio.get("latido", 0)))
        except (TypeError, ValueError):
            edad_avance = avance_max_s + 1
        if edad_avance > avance_max_s:
            return "colgado"
    capacidad = _entero_no_negativo(medio.get("capacidad"))
    return "ocupado" if carga >= capacidad else "disponible"


def normalizar_medios(medios, ahora, latido_max_s=90, avance_max_s=300):
    """Copia el registro y añade estado y capacidad libre calculados."""
    salida = {}
    for medio_id, original in (medios or {}).items():
        medio = copy.deepcopy(original)
        medio["id"] = str(medio.get("id") or medio_id)
        medio["estado"] = estado_medio(medio, ahora, latido_max_s, avance_max_s)
        capacidad = _entero_no_negativo(medio.get("capacidad"))
        carga = _entero_no_negativo(medio.get("carga"))
        medio["libres"] = max(0, capacidad - carga) if medio["estado"] in ESTADOS_UTILIZABLES else 0
        salida[medio_id] = medio
    return salida


def arriendo_vigente(arriendo, medios, ahora, latido_max_s=90, avance_max_s=300):
    """Un arriendo solo protege la tarea si no venció y su medio sigue sano."""
    if not isinstance(arriendo, dict):
        return False
    try:
        if float(arriendo.get("vence", 0)) <= ahora:
            return False
    except (TypeError, ValueError):
        return False
    medio = (medios or {}).get(arriendo.get("medio"))
    return bool(medio and estado_medio(medio, ahora, latido_max_s, avance_max_s) in ESTADOS_UTILIZABLES)


def vencer_arriendos(arriendos, medios, ahora, latido_max_s=90, avance_max_s=300):
    """Separa arriendos vigentes y vencidos, sin mutar los datos recibidos."""
    vigentes, vencidos = {}, []
    for tarea_id, arriendo in (arriendos or {}).items():
        if arriendo_vigente(arriendo, medios, ahora, latido_max_s, avance_max_s):
            vigentes[tarea_id] = copy.deepcopy(arriendo)
        else:
            vencidos.append(tarea_id)
    return vigentes, vencidos


def _estadistica(historial, medio_id, area):
    por_medio = (historial or {}).get(medio_id) or {}
    return por_medio.get(area) or por_medio.get("general") or {}


def puntuacion_medio(medio, tarea, historial=None):
    """Puntúa capacidad y experiencia; el éxito en el área pesa más que la velocidad."""
    area = area_de_tarea(tarea)
    areas = [str(a).lower() for a in medio.get("areas") or ["*"]]
    if "*" not in areas and area not in areas:
        return None
    estadistica = _estadistica(historial, medio.get("perfil") or medio.get("id"), area)
    exitos = _entero_no_negativo(estadistica.get("exitos"))
    fallos = _entero_no_negativo(estadistica.get("fallos"))
    total = exitos + fallos
    confianza = exitos / total if total else 0.5
    segundos = max(0.0, _numero(estadistica.get("segundos_promedio")))
    rapidez = 20.0 / (1.0 + segundos / 600.0) if segundos else 10.0
    experiencia = min(20.0, math.log2(total + 1) * 5.0)
    prioridad = _numero(medio.get("prioridad"))
    libres = _entero_no_negativo(medio.get("libres"))
    return round(confianza * 100.0 + rapidez + experiencia + prioridad + min(libres, 5), 6)


def ordenar_medios(tarea, medios, historial=None):
    """Devuelve solo medios sanos con hueco, mejor historial primero y desempate estable."""
    candidatos = []
    for medio_id, medio in (medios or {}).items():
        if medio.get("estado") != "disponible" or _entero_no_negativo(medio.get("libres")) <= 0:
            continue
        candidato = dict(medio)
        candidato["id"] = str(candidato.get("id") or medio_id)
        puntuacion = puntuacion_medio(candidato, tarea, historial)
        if puntuacion is not None:
            candidatos.append((puntuacion, candidato["id"]))
    candidatos.sort(key=lambda item: (-item[0], item[1]))
    return [medio_id for _, medio_id in candidatos]


def repartir(tareas, medios, arriendos=None, historial=None, ahora=0,
             duracion_arriendo_s=120, latido_max_s=90, avance_max_s=300):
    """Recalcula el reparto sin tocar tareas que aún tienen un arriendo sano.

    Devuelve las asignaciones nuevas, todos los arriendos vigentes y los identificadores
    recuperados. Una tarea recuperada conserva su `worktree`, que el ejecutor puede reusar.
    """
    sanos = normalizar_medios(medios, ahora, latido_max_s, avance_max_s)
    vigentes, vencidos = vencer_arriendos(
        arriendos, medios, ahora, latido_max_s, avance_max_s)
    ocupacion = {}
    for arriendo in vigentes.values():
        medio_id = arriendo.get("medio")
        ocupacion[medio_id] = ocupacion.get(medio_id, 0) + 1
    for medio_id, medio in sanos.items():
        capacidad = _entero_no_negativo(medio.get("capacidad"))
        carga_real = max(_entero_no_negativo(medio.get("carga")), ocupacion.get(medio_id, 0))
        medio["libres"] = max(0, capacidad - carga_real)
        medio["estado"] = "ocupado" if medio["libres"] == 0 and medio["estado"] in ESTADOS_UTILIZABLES else medio["estado"]
    asignaciones = []
    ya_arrendadas = set(vigentes)
    for tarea in tareas or []:
        tarea_id = str(tarea.get("id") or "").strip()
        if not tarea_id or tarea_id in ya_arrendadas:
            continue
        orden = ordenar_medios(tarea, sanos, historial)
        if not orden:
            continue
        medio_id = orden[0]
        arriendo = {
            "tarea": tarea_id,
            "medio": medio_id,
            "area": area_de_tarea(tarea),
            "desde": ahora,
            "renovado": ahora,
            "vence": ahora + duracion_arriendo_s,
            "worktree": str(tarea.get("worktree") or ""),
            "reanudar": tarea_id in vencidos or bool(tarea.get("reanudar")),
        }
        vigentes[tarea_id] = arriendo
        asignaciones.append(copy.deepcopy(arriendo))
        sanos[medio_id]["libres"] -= 1
        if sanos[medio_id]["libres"] <= 0:
            sanos[medio_id]["estado"] = "ocupado"
    return {"asignaciones": asignaciones, "arriendos": vigentes,
            "vencidos": vencidos, "medios": sanos}


def renovar_arriendo(arriendo, ahora, duracion_arriendo_s, worktree=""):
    """Renueva una copia del arriendo; nunca borra la ruta donde quedó lo escrito."""
    nuevo = copy.deepcopy(arriendo or {})
    nuevo["renovado"] = ahora
    nuevo["vence"] = ahora + duracion_arriendo_s
    if worktree:
        nuevo["worktree"] = worktree
    return nuevo


def registrar_resultado(historial, medio_id, area, exito, segundos):
    """Actualiza una copia del historial que luego guía el próximo reparto."""
    nuevo = copy.deepcopy(historial or {})
    areas = nuevo.setdefault(medio_id, {})
    dato = areas.setdefault(area or "general", {
        "exitos": 0, "fallos": 0, "segundos_promedio": 0.0,
    })
    clave = "exitos" if exito else "fallos"
    dato[clave] = _entero_no_negativo(dato.get(clave)) + 1
    muestras = _entero_no_negativo(dato.get("exitos")) + _entero_no_negativo(dato.get("fallos"))
    anterior = _numero(dato.get("segundos_promedio"))
    dato["segundos_promedio"] = round(
        (anterior * (muestras - 1) + max(0, _numero(segundos))) / muestras, 3)
    return nuevo
