# -*- coding: utf-8 -*-
"""Nodo de MetaGenesis · decisiones PURAS (OPA1011, 2026-10-10).

Alex: «no está funcionando MetaGenesis por sí misma: aún no ha sido capaz de continuar con las
tareas sin tener que decírtelo aquí … que funcione desde cualquier medio, en cualquier neurona,
sin necesidad de esta Mac». Este módulo es el CRITERIO del nodo; nada aquí toca red, disco ni
procesos (todo entra por argumentos), así que cada regla se prueba sola en
`test_nodo_metagenesis.py`. La entrada/salida vive en `nodo_metagenesis_bus.py` (Supabase) y
`nodo_metagenesis_medio.py` (la máquina); el bucle, en `nodo_metagenesis.py`.

Piezas:
  · identidad y puntos de un nodo (quién merece dirigir: el que tiene las colas en su disco,
    luego el que nunca se apaga, luego el resto; un nodo «seco» nunca le gana a uno real);
  · elección de líder sobre el bus (latidos + reclamos con término creciente, determinista:
    todos los nodos llegan a la misma respuesta con los mismos eventos);
  · órdenes firmadas (HMAC-SHA256 sobre un texto canónico que TS reproduce igual) con lista
    blanca de acciones, caducidad y antirepetición;
  · el PLAN del líder (continuidad, guardianes caídos, bloqueadas, trabajo nuevo, relevo de un
    medio caído) y la AUTOCURACIÓN de cada nodo, con enfriamientos para no repetir;
  · el rescate de trabajo de `colas-fuente/` (lo que nadie cerró ni está en ninguna cola viva);
  · la FOTO compacta que leen las neuronas (sin claves, sin IPs, sin nombres de máquina).
SOP: architecture/metagenesis-autonoma.md
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

VERSION = "1"

#: Un nodo late cada `LATIDO_S`; quien lleva `TTL_LIDER_S` sin latir ya no cuenta como vivo.
#: Medido el 2026-10-10: Supabase iba al 81 % del presupuesto diario (20.303 de 25.000
#: peticiones a las 11:33 UTC), así que el nodo es frugal: ~290 escrituras/día por nodo.
LATIDO_S = 300
TTL_LIDER_S = 900
#: Un nodo preferente (más puntos) solo le quita el mando a un líder vivo si le saca este margen
#: y lleva vivo al menos dos latidos (evita el baile de líderes al arrancar).
MARGEN_RELEVO = 100
ESTABLE_S = 2 * LATIDO_S
#: Órdenes: caducan a los 15 min (como el lanzador de la nube) y se recuerdan 24 h.
ORDEN_CADUCA_S = 15 * 60
NONCE_RECUERDO_S = 24 * 3600
#: Si el medio con las colas en su disco (la Mac) calla tanto tiempo, otro medio sigue su trabajo.
RELEVO_MEDIO_S = 20 * 60
#: Una tarea entregada a otro medio que no vuelve integrada en este plazo vuelve a la cola.
GRACIA_ASIGNACION_S = 6 * 3600

#: Medios conocidos. `autoritativo` = tiene las colas y el progreso en su disco (hoy, la Mac).
MEDIOS: Dict[str, Dict[str, Any]] = {
    "mac": {"etiqueta": "Mac de desarrollo", "base": 300, "siempre": False},
    "oracle-a1": {"etiqueta": "Oracle A1 (24/7)", "base": 250, "siempre": True},
    "neurona": {"etiqueta": "Otra neurona", "base": 120, "siempre": False},
    "nube-cowork": {"etiqueta": "Nube (contenedor de Claude)", "base": 80, "siempre": False},
    "gh-actions": {"etiqueta": "GitHub Actions", "base": 10, "siempre": False},
}

#: Acciones que una orden puede pedir (lista blanca; lo demás se rechaza).
ACCIONES_ORDEN: Dict[str, Dict[str, Any]] = {
    "continuar": {"texto": "Seguir con el trabajo pendiente ahora (o buscar trabajo nuevo)", "args": ()},
    "revisar_bloqueadas": {"texto": "Revisar las bloqueadas con todos los directores", "args": ()},
    "buscar_capacidad": {"texto": "Buscar más capacidad en todos los medios", "args": ()},
    "reactivar": {"texto": "Reactivar los directores y servicios del medio", "args": ()},
    "buscar_trabajo": {"texto": "Buscar trabajo pendiente en colas-fuente", "args": ()},
    "lanzar_cola": {"texto": "Lanzar una cola en un medio", "args": ("cola", "trabajadores", "tareas_sha")},
    "detener_cola": {"texto": "Detener el orquestador de una cola", "args": ("cola",)},
    "pausar": {"texto": "Pausar la autonomía del líder", "args": ()},
    "reanudar": {"texto": "Reanudar la autonomía del líder", "args": ()},
    "ceder": {"texto": "El líder cede el mando al siguiente", "args": ()},
    # (OPA1011b) Interna: el líder se la pide al medio con las colas en su disco cuando no es él
    # (la web no la manda; por eso no está en el CHECK de la tabla ni en los botones).
    "repartir": {"texto": "Prestar tareas listas a un medio ocioso", "args": ("destino", "tope", "modo", "trabajadores")},
    "desconectar": {"texto": "Guardar el trabajo a medias de este aparato y pasarlo a otro contenedor", "args": ()},
    "contenedor": {"texto": "Usar o dejar de usar este aparato como contenedor de agentes", "args": ("activo", "trabajadores")},
}

#: Tipos de evento en el bus (`relevo_eventos.tipo`, ≤ 40 caracteres).
T_LATIDO = "mg_latido"
T_LIDER = "mg_lider"
T_BAJA = "mg_baja"
T_FOTO = "mg_foto"
T_ORDEN = "mg_orden"
T_ORDEN_HECHA = "mg_orden_hecha"
T_DECISION = "mg_decision"
T_COLAS = "mg_colas"
T_ASIGNACION = "mg_asignacion"
TIPOS_NODO = (T_LATIDO, T_LIDER, T_BAJA, T_ORDEN, T_ORDEN_HECHA, T_ASIGNACION)

_RE_ID = re.compile(r"^[a-z0-9][a-z0-9-]{1,38}$")
_RE_COLA = re.compile(r"^cola-[A-Za-z0-9._-]{1,80}$")
_RE_VALOR = re.compile(r"^[\w .:/@+,()\-]{0,200}$", re.UNICODE)
_RE_NONCE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")

#: Servicios de la Mac que CURAN a los demás: si caen, nadie relanza nada.
GUARDIANES_MAC = ("com.starseed.vigia", "com.starseed.vigilante", "com.starseed.mando")


# ─── identidad y puntos ─────────────────────────────────────────────────────────────────


def id_de_nodo(medio: str, huella_maquina: str) -> str:
    """PURA. `<medio>-<6 hex>`: estable por máquina y sin nombre de máquina (el bus es público)."""
    medio = medio if medio in MEDIOS else "neurona"
    h = hashlib.sha256((huella_maquina or "").encode("utf-8")).hexdigest()[:6]
    return "%s-%s" % (medio, h)


def id_valido(nodo: Any) -> bool:
    return isinstance(nodo, str) and bool(_RE_ID.match(nodo))


def puntos_nodo(cap: Dict[str, Any]) -> int:
    """PURA. Cuánto merece dirigir un nodo. Real ≫ seco; colas en disco ≫ siempre encendido ≫ resto.

    Un nodo con las colas en su disco (`autoritativo`) es el que sabe la verdad del trabajo;
    uno siempre encendido es el que sostiene cuando la Mac duerme. RAM libre y disco desempatan.
    """
    medio = cap.get("medio") if cap.get("medio") in MEDIOS else "neurona"
    p = int(MEDIOS[medio]["base"])
    if cap.get("autoritativo"):
        p += 200
    if cap.get("modo") == "real":
        p += 1000
    if not cap.get("repo"):
        p -= 60
    if not cap.get("orquestador"):
        p -= 40
    ram = cap.get("ram_libre_mb")
    if isinstance(ram, (int, float)):
        p += max(0, min(40, int(ram) // 256))
    disco = cap.get("disco_gb")
    if isinstance(disco, (int, float)) and disco < 2:
        p -= 80
    return p


# ─── elección de líder sobre el bus ─────────────────────────────────────────────────────


def _t(e: Dict[str, Any]) -> float:
    try:
        return float(e.get("ts") or 0)
    except (TypeError, ValueError):
        return 0.0


def nodos_vivos(latidos: Iterable[Dict[str, Any]], bajas: Iterable[Dict[str, Any]], ahora: float,
                ttl: int = TTL_LIDER_S) -> Dict[str, Dict[str, Any]]:
    """PURA. {nodo: último latido} de los que latieron en el plazo y no se dieron de baja después.

    Cada latido: {nodo, ts, puntos, modo, medio, …}. `desde` = inicio de su racha ACTUAL de
    latidos (sin huecos mayores que `ttl`): un nodo que vuelve tras apagarse empieza de cero,
    aunque sus latidos viejos sigan en la ventana."""
    por_nodo: Dict[str, List[Dict[str, Any]]] = {}
    for l in latidos or ():
        n = l.get("nodo")
        if id_valido(n):
            por_nodo.setdefault(n, []).append(l)
    baja_en: Dict[str, float] = {}
    for b in bajas or ():
        n = b.get("nodo")
        if id_valido(n):
            baja_en[n] = max(baja_en.get(n, 0.0), _t(b))
    vivos = {}
    for n, lista in por_nodo.items():
        lista.sort(key=_t)
        ultimo = lista[-1]
        if ahora - _t(ultimo) > ttl or baja_en.get(n, -1.0) >= _t(ultimo):
            continue
        desde = _t(ultimo)
        for anterior in reversed(lista[:-1]):
            if desde - _t(anterior) > ttl or baja_en.get(n, -1.0) >= _t(anterior):
                break
            desde = _t(anterior)
        vivos[n] = dict(ultimo, desde=desde)
    return vivos


def _clave_mejor(n: str, info: Dict[str, Any]) -> Tuple[int, str]:
    # Más puntos primero; a igualdad, el id menor (orden total: todos eligen lo mismo).
    return (-int(info.get("puntos") or 0), n)


def lider_vigente(reclamos: Iterable[Dict[str, Any]], latidos: Iterable[Dict[str, Any]]) -> Tuple[Optional[str], int, int]:
    """PURA. (líder, término, puntos) del reclamo con término más alto. Los latidos llevan el
    líder que cada nodo vio, así que un nodo recién llegado no necesita el historial entero."""
    candidatos: List[Tuple[int, int, str]] = []  # (término, puntos, nodo)
    for r in reclamos or ():
        n, term = r.get("nodo"), r.get("termino")
        if id_valido(n) and isinstance(term, int) and not isinstance(term, bool) and term >= 0:
            candidatos.append((term, int(r.get("puntos") or 0), n))
    for l in latidos or ():
        n, term = l.get("lider_visto"), l.get("termino_visto")
        if id_valido(n) and isinstance(term, int) and not isinstance(term, bool) and term >= 0:
            candidatos.append((term, int(l.get("puntos_lider") or 0), n))
    if not candidatos:
        return None, 0, 0
    # Término más alto; a igualdad (dos reclamos a la vez), más puntos y luego el id menor:
    # el mismo orden total en todos los nodos, así que todos convergen al mismo líder.
    term, puntos, n = max(candidatos, key=lambda c: (c[0], c[1], _invertir(c[2])))
    return n, term, puntos


def _invertir(n: str) -> Tuple[int, ...]:
    """Para que, a igual término y puntos, gane el id MENOR en una comparación «mayor es mejor»."""
    return tuple(-ord(c) for c in n)


def elegir_lider(yo: str, mis_puntos: int, vivos: Dict[str, Dict[str, Any]],
                 reclamos: Sequence[Dict[str, Any]], latidos: Sequence[Dict[str, Any]],
                 ahora: float) -> Dict[str, Any]:
    """PURA. Quién dirige ahora y si YO debo reclamar el mando.

    Reglas (en este orden):
      1. El líder vigente (término más alto reclamado) sigue si está vivo, salvo relevo
         ordenado: un nodo vivo y estable que le saca `MARGEN_RELEVO` puntos (la Mac real que
         vuelve frente al A1) lo reclama él mismo con término + 1. Hasta que lo reclama, el
         vigente sigue dirigiendo (nunca hay una vuelta sin líder por un relevo).
      2. Si no hay líder vivo, el mejor vivo (puntos, luego id) reclama con término + 1.
    Solo quien reclama cambia el término: los demás publican en su latido el líder VIGENTE, no
    su propuesta (así el término no sube por opiniones).
    Devuelve {lider, termino, reclamar, motivo, vigente, termino_vigente}.
    """
    vivos = dict(vivos)
    if yo not in vivos:
        vivos[yo] = {"nodo": yo, "puntos": mis_puntos, "ts": ahora, "desde": ahora}
    lider, termino, _ = lider_vigente(reclamos, latidos)
    base = {"vigente": lider, "termino_vigente": termino}
    mejor = min(vivos.items(), key=lambda kv: _clave_mejor(kv[0], kv[1]))[0]
    if lider and lider in vivos:
        p_lider = int(vivos[lider].get("puntos") or 0)
        p_mejor = int(vivos[mejor].get("puntos") or 0)
        estable = ahora - float(vivos[mejor].get("desde") or ahora) >= ESTABLE_S
        if mejor != lider and p_mejor >= p_lider + MARGEN_RELEVO and estable:
            motivo = "relevo ordenado: %s (%d) supera a %s (%d)" % (mejor, p_mejor, lider, p_lider)
            if mejor == yo:
                return dict(base, lider=yo, termino=termino + 1, reclamar=True, motivo=motivo)
            return dict(base, lider=lider, termino=termino, reclamar=False, motivo=motivo + "; lo reclamará él")
        return dict(base, lider=lider, termino=termino, reclamar=False, motivo="líder vigente vivo")
    motivo = "sin líder" if not lider else "%s dejó de latir" % lider
    return dict(base, lider=mejor, termino=termino + 1, reclamar=mejor == yo, motivo=motivo)


# ─── órdenes firmadas ────────────────────────────────────────────────────────────────────


def args_canonicos(args: Any) -> str:
    """PURA. JSON con claves ordenadas y sin espacios: el MISMO texto que `JSON.stringify` de
    `canonico()` en `src/lib/metagenesis/remoto-nodos.ts` (solo cadenas, enteros y booleanos)."""
    return json.dumps(args or {}, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def texto_a_firmar(o: Dict[str, Any]) -> str:
    return "%s|%s|%s|%s|%s" % (o.get("accion", ""), o.get("para", ""), o.get("t", ""), o.get("nonce", ""),
                               args_canonicos(o.get("args")))


def firmar(o: Dict[str, Any], secreto: str) -> str:
    return hmac.new(secreto.encode("utf-8"), texto_a_firmar(o).encode("utf-8"), hashlib.sha256).hexdigest()


def args_validos(accion: str, args: Any) -> Optional[str]:
    """PURA. None si los argumentos encajan con la acción; si no, el motivo."""
    if args is None:
        args = {}
    if not isinstance(args, dict):
        return "argumentos no válidos"
    permitidos = set(ACCIONES_ORDEN[accion]["args"])
    for k, v in args.items():
        if k not in permitidos:
            return "argumento no admitido: %s" % k
        if isinstance(v, bool) or (isinstance(v, int) and -10**6 < v < 10**6):
            continue
        if not isinstance(v, str) or not _RE_VALOR.match(v):
            return "valor no admitido en %s" % k
    if accion in ("lanzar_cola", "detener_cola"):
        if not isinstance(args.get("cola"), str) or not _RE_COLA.match(args["cola"]):
            return "nombre de cola no válido"
    if "trabajadores" in args and not (isinstance(args["trabajadores"], int) and 1 <= args["trabajadores"] <= 4):
        return "trabajadores fuera de 1–4"
    if accion == "repartir":
        if not id_valido(args.get("destino")):
            return "destino no válido"
        if "tope" in args and not (isinstance(args["tope"], int) and not isinstance(args["tope"], bool)
                                   and 1 <= args["tope"] <= 8):
            return "tope fuera de 1–8"
        if "modo" in args and args["modo"] != "alimentar":
            return "modo no admitido"
    if accion == "contenedor":
        # activo is required and must be boolean
        if "activo" not in args:
            return "falta argumento: activo"
        if not isinstance(args["activo"], bool):
            return "activo debe ser booleano"
        # if activo is True, then trabajadores must be present and between 1 and 4
        if args["activo"]:
            if "trabajadores" not in args:
                return "falta argumento: trabajadores"
            if not (isinstance(args["trabajadores"], int) and 1 <= args["trabajadores"] <= 4):
                return "trabajadores fuera de 1–4"
        else:
            # if activo is False, trabajadores should not be present
            if "trabajadores" in args:
                return "trabajadores solo se permite si activo es True"
    return None


def epoch_de_iso(t: Any) -> Optional[float]:
    import datetime as _dt
    if not isinstance(t, str) or len(t) < 19:
        return None
    try:
        return _dt.datetime.fromisoformat(t.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def validar_orden(o: Any, secreto: str, ahora: float, nonces_vistos: Dict[str, float],
                   firmada: bool = True) -> Tuple[bool, str]:
    """PURA. ¿Se puede ejecutar esta orden? `firmada=False` = viene de una tabla con RLS (el
    autor ya lo garantizó Postgres) y solo se miran forma, caducidad y repetición."""
    if not isinstance(o, dict):
        return False, "orden ilegible"
    accion = o.get("accion")
    if accion not in ACCIONES_ORDEN:
        return False, "acción no admitida"
    para = o.get("para")
    if not (para in ("lider", "todos") or para in MEDIOS or id_valido(para)):
        return False, "destino no válido"
    # Para desconectar y contenedor, el destino debe ser un id de nodo concreto
    if accion in ("desconectar", "contenedor"):
        if para in ("lider", "todos") or para in MEDIOS:
            return False, "destino no válido: no se puede mandar a lider, todos o un medio genérico"
    nonce = o.get("nonce")
    if not isinstance(nonce, str) or not _RE_NONCE.match(nonce):
        return False, "nonce no válido"
    if nonce in nonces_vistos:
        return False, "orden repetida"
    malos = args_validos(accion, o.get("args"))
    if malos:
        return False, malos
    t = epoch_de_iso(o.get("t"))
    if t is None:
        return False, "fecha ilegible"
    if not str(o.get("t")).endswith("Z"):
        return False, "la fecha debe ir en UTC (…Z)"
    if abs(ahora - t) > ORDEN_CADUCA_S:
        return False, "orden caducada (%d s)" % int(ahora - t)
    if firmada:
        if not secreto:
            return False, "este nodo no tiene el secreto para comprobar firmas"
        if not hmac.compare_digest(firmar(o, secreto), str(o.get("firma") or "")):
            return False, "firma inválida"
    return True, ""


def es_para_mi(o: Dict[str, Any], yo: str, medio: str, soy_lider: bool) -> bool:
    para = o.get("para")
    return para == yo or para == medio or para == "todos" or (para == "lider" and soy_lider)


def huella_tareas(tareas: Any) -> Optional[str]:
    """PURA. Huella de las tareas que viajan con una orden (va DENTRO de lo firmado)."""
    if tareas is None:
        return None
    return hashlib.sha256(json.dumps(tareas, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
                          .encode("utf-8")).hexdigest()[:32]


def podar_nonces(vistos: Dict[str, float], ahora: float) -> Dict[str, float]:
    return {n: t for n, t in (vistos or {}).items() if ahora - float(t or 0) < NONCE_RECUERDO_S}


# ─── vigía de RESULTADOS (OPA1011b, 2026-10-10 tarde) ────────────────────────────────────
#
# Alex (14:40): «de nuevo hay muchas bloqueadas, fallidas y sin publicar que no se procesaron
# automáticamente … solucionalo y haz que ya funcione automáticamente». Medido entonces: el líder
# llevaba desde las 10:44 diciendo «nada que hacer» en cada vuelta, porque solo miraba si los
# directores estaban VIVOS (lo estaban todos), no si el trabajo AVANZABA:
#   · 33 tareas listas para los 3 trabajadores de una Mac con 736 MB libres y carga 14, y 75
#     esperando detrás, mientras el A1 de Oracle (2 OCPU, 9,8 GB libres, carga 0) esperaba sin cola:
#     el reparto a otros medios excluía todo lo que estaba en la tanda viva de la Mac;
#   · la autopublicación, frenada dos horas por el mismo motivo, esperando «un commit nuevo» que no
#     lo iba a arreglar, y a las 14:28 vetada por pruebas que fallaban en el ÁRBOL de la Mac (un
#     cambio a medias de otro agente), no en el commit.
# Ahora el líder mide RESULTADOS y actúa por los caminos que ya existen: presta trabajo al medio
# ocioso sin duplicarlo, convierte una puerta de publicación en rojo en una tarea de reparación con
# la salida exacta, y avisa una sola vez de lo que lleva horas quieto y solo puede decidir una persona.

#: Estados de fallo de una tarea (los mismos que el revisor de bloqueadas, OPB1011).
FALLOS = ("fallo", "fallo_tsc", "fallo_tests", "fallo_motor", "conflicto", "bloqueante")
#: Una hermana en estos estados NO cuenta como «alguien la retoma».
_HERMANA_MUERTA = FALLOS + ("rechazada", "descartada", "obsoleta", "bloqueada")
ESPERA_VB = ("esperando_aprobacion", "pendiente_aprobacion")
VENTANA_FALLIDAS_S = 72 * 3600
#: Préstamo de trabajo a un medio ocioso: con cuántas listas, cuántas, cada cuánto.
REPARTO_MIN_LISTAS = 6
REPARTO_TOPE = 4


def trabajadores_prestamo(latido: Dict[str, Any]) -> Optional[int]:
    """PURA (2026-10-25, CAP1025E). Los trabajadores con los que corre su enjambre el medio al que se presta,
    si él lo publica (el A1: `salud.a1.trabajadores`, de su `STARSEED_A1_TRABAJADORES`); None si no lo dice.

    Medido el 25-10: el A1 está configurado con 3 trabajadores, pero cada préstamo le llegaba con
    `--workers 2` y 4 tareas (67 min por cola, el último agente solo y huecos entre colas): un agente
    menos del que tiene. Con su número, el préstamo lleva dos rondas de ellos (`tope_prestamo`)."""
    a1 = ((latido or {}).get("salud") or {}).get("a1")
    n = a1.get("trabajadores") if isinstance(a1, dict) else None
    return n if isinstance(n, int) and not isinstance(n, bool) and 1 <= n <= 4 else None


def tope_prestamo(trabajadores: Optional[int]) -> int:
    """PURA (CAP1025E): tareas por préstamo: dos rondas de los trabajadores del medio, entre 4 y 8."""
    return REPARTO_TOPE if not trabajadores else max(REPARTO_TOPE, min(8, 2 * int(trabajadores)))
REPARTO_ESPERA_S = 30 * 60
#: Lo que lleva quieto este tiempo se escala (aviso o reparación) y no se repite antes de AVISO_ESPERA_S.
FALLIDA_AVISO_S = 2 * 3600
VB_AVISO_S = 3 * 3600
PUBLICACION_ROJA_S = 60 * 60
AVISO_ESPERA_S = 6 * 3600
#: Lo que pide un prompt y solo tiene la Mac (su Chrome, launchd, su Genesis): no se presta.
_SOLO_MAC = re.compile(r"\b(navegador|chrome|launchd|launchctl|localhost:9002|caffeinate|pmset|en la mac)\b", re.I)
#: Motivos de veto de la autopublicación que se REPARAN con una tarea (hay salida con rutas).
VETOS_REPARABLES = ("pruebas del puente en rojo", "CI en rojo")
#: Motivos que no toca nadie más que una persona o que ya tienen su botón en Genesis.
VETOS_DE_PERSONA = ("Vetado desde Genesis",)


def _epoch_local(t: Any) -> Optional[float]:
    """«AAAA-MM-DD HH:MM:SS» (hora local, como escribe el orquestador) → epoch. None si no se lee."""
    import time as _time
    if not isinstance(t, str) or len(t) < 19:
        return None
    try:
        return _time.mktime(_time.strptime(t[:19], "%Y-%m-%d %H:%M:%S"))
    except ValueError:
        return None


def base_de_tarea(tid: Any) -> str:
    """PURA. La raíz de una cadena: `CPA1007Kb-d1b` → `CPA1007K`, `S1010-TU-LL1c` → `S1010-TU-LL1`."""
    t = str(tid or "")
    m = re.match(r"^(.+?)-d\d+[a-z]?$", t)
    if m:
        t = m.group(1)
    while len(t) > 1 and t[-1] in "bcdefghijklmnopqrstuvwxyz" and (t[-2].isdigit() or t[-2].isupper()):
        t = t[:-1]
    return t


def id_en_asuntos(tid: Any, asuntos: Sequence[str]) -> bool:
    """PURA. ¿Hay un commit de main con «· ID:» (o empezando por «ID:»)?"""
    patron = re.compile(r"(?:^|·\s*)%s\s*:" % re.escape(str(tid)))
    return any(patron.search(a or "") for a in asuntos or ())


def _posterior(k: str, tid: str) -> bool:
    return len(k) > len(tid) or (len(k) == len(tid) and k > tid)


def fallidas_sin_resolver(progreso: Dict[str, Any], asuntos: Sequence[str], ahora: float,
                          ventana_s: int = VENTANA_FALLIDAS_S) -> List[Dict[str, Any]]:
    """PURA. Tareas en fallo de los últimos `ventana_s` que NADIE retoma: ni están en main, ni
    tienen sucesora viva o integrada (misma raíz, id posterior), ni se dieron por sustituidas.
    La más vieja primero. [{id, estado, hace_s}]."""
    por_base: Dict[str, List[Tuple[str, Any]]] = {}
    for k, v in (progreso or {}).items():
        por_base.setdefault(base_de_tarea(k), []).append((str(k), v))
    salida = []
    for tid, e in (progreso or {}).items():
        if not isinstance(e, dict) or e.get("estado") not in FALLOS:
            continue
        t = _epoch_local(e.get("t"))
        if t is None or ahora - t > ventana_s:
            continue
        if e.get("sustituida_por") or id_en_asuntos(tid, asuntos):
            continue
        if _sigue_otra(str(tid), por_base):
            continue
        salida.append({"id": str(tid), "estado": e["estado"], "hace_s": max(0, int(ahora - t))})
    return sorted(salida, key=lambda f: -f["hace_s"])


def _sigue_otra(tid: str, por_base: Dict[str, List[Tuple[str, Any]]]) -> bool:
    """¿Una tarea POSTERIOR de la misma cadena sigue viva o ya cerró? (entonces esta ya no manda)."""
    return any(k != tid and _posterior(k, tid) and isinstance(v, dict) and v.get("estado") not in _HERMANA_MUERTA
               for k, v in por_base.get(base_de_tarea(tid), []))


def esperando_visto_bueno(progreso: Dict[str, Any], ahora: float, asuntos: Sequence[str] = ()) -> List[Dict[str, Any]]:
    """PURA. Tareas que de verdad esperan visto bueno (la más vieja primero): fuera las que ya están en
    main y las que una tarea posterior de su cadena ya continúa (medido el 10-10: CNS1010Mb «esperaba»
    6 h con CNS1010Mc ya en la tanda, y S1010-TU-LL1c con su trabajo ya integrado). [{id, hace_s}]."""
    por_base: Dict[str, List[Tuple[str, Any]]] = {}
    for k, v in (progreso or {}).items():
        por_base.setdefault(base_de_tarea(k), []).append((str(k), v))
    salida = []
    for tid, e in (progreso or {}).items():
        if not isinstance(e, dict) or e.get("estado") not in ESPERA_VB:
            continue
        if id_en_asuntos(tid, asuntos) or _sigue_otra(str(tid), por_base):
            continue
        t = _epoch_local(e.get("t"))
        salida.append({"id": str(tid), "hace_s": max(0, int(ahora - t)) if t is not None else 0})
    return sorted(salida, key=lambda f: -f["hace_s"])


def es_integracion(asunto: str) -> bool:
    """PURA. ¿Este asunto de main es una tarea INTEGRADA (no un salvavidas ni un commit suelto)?"""
    a = (asunto or "").strip()
    return a.startswith("Ola ") and bool(re.search(r"·\s*[A-Za-z0-9_-]*\d[A-Za-z0-9_-]*\s*:", a))


def motivo_publicacion(detalle: Any) -> str:
    """PURA. El motivo de la autopublicación sin shas ni lo que le añade cada pasada
    («… · espero a que llegue un commit nuevo»): así se sabe si es EL MISMO motivo de antes."""
    t = str(detalle or "").split(" · ")[0]
    t = re.sub(r"\b[0-9a-f]{7,40}\b", "", t)
    return re.sub(r"\s+", " ", t).strip()[:200]


def firma_publicacion(pub: Dict[str, Any]) -> str:
    """PURA. «fase|motivo»: cambia cuando la autopublicación cambia de verdad de situación."""
    p = pub or {}
    return "%s|%s" % (p.get("fase") or "", motivo_publicacion(p.get("detalle")))


def clase_publicacion(pub: Dict[str, Any]) -> Optional[str]:
    """PURA. Qué le toca al líder ante la publicación: None (nada), «reparar» (una puerta en rojo
    con salida que nombra archivos) o «avisar» (frenada por algo que el enjambre no arregla)."""
    p = pub or {}
    if not p.get("activa") or not (p.get("sin_publicar") or 0) > 0 or p.get("fase") != "bloqueado":
        return None
    motivo = motivo_publicacion(p.get("detalle"))
    if any(motivo.startswith(v) for v in VETOS_DE_PERSONA):
        return None
    ev = p.get("evidencia") or {}
    if any(motivo.startswith(v) for v in VETOS_REPARABLES) and ev.get("texto"):
        return "reparar"
    return "avisar"


_RE_PY_FILE = re.compile(r'File "[^"]*?/((?:scripts|deploy|servicios|backend)/[^"\s]+\.py)"')
_RE_PY_TEST = re.compile(r"\((test_[A-Za-z0-9_]+)\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)?\)")
_RE_TS = re.compile(r"(?:^|[\s(\"'])((?:src|scripts|native)/[\w./\-\[\]()@]+?\.(?:tsx?|mts|mjs))(?=[(:\s\"']|$)", re.M)
#: (2026-10-14) Una GUARDIA (pureza, sin-node-en-cliente…) nombra en el título del caso el archivo que la
#: rompe: «FAIL src/lib/astraura-bots/__tests__/pureza.test.ts > … > sincronia-bots.ts: solo importa…».
#: Sin esto la reparación solo podía tocar la prueba (MGP1014-C715AA): o la relajaba, o no arreglaba nada.
_RE_FAIL = re.compile(r"FAIL\s+((?:src|native)/[\w./\-\[\]()@]+?/__tests__/[\w.\-]+\.test\.tsx?)\s+>\s*(.+)$", re.M)
_RE_NOMBRE_TS = re.compile(r"(?<![\w/.\-])([A-Za-z0-9_][\w.\-]*\.tsx?)(?=[:\s]|$)")


def rutas_de_evidencia(texto: Any, tope: int = 3) -> List[str]:
    """PURA. Archivos del repo que nombra la salida de una puerta en rojo (pruebas del puente,
    tsc o vitest), en orden de aparición y sin repetir. Las pruebas de Python cuentan por su
    archivo (`test_x.Clase.metodo` → scripts/puente/test_x.py) y por el de la traza."""
    t = str(texto or "")
    rutas: List[str] = []

    def meter(r: str) -> None:
        r = r.strip().lstrip("./")
        if r and r not in rutas and ".." not in r:
            rutas.append(r)

    for m in _RE_PY_TEST.finditer(t):
        meter("scripts/puente/%s.py" % m.group(1))
    for m in _RE_PY_FILE.finditer(t):
        meter(m.group(1))
    for m in _RE_TS.finditer(t):
        meter(m.group(1))
    for m in _RE_FAIL.finditer(t):
        prueba, base = m.group(1), m.group(1).split("/__tests__/")[0]
        for nombre in _RE_NOMBRE_TS.findall(m.group(2)):
            ruta = "%s/%s" % (base, nombre)
            if ".test." in nombre or ruta in rutas:
                continue
            # El archivo culpable va ANTES que su prueba: es lo que hay que arreglar.
            rutas.insert(rutas.index(prueba) if prueba in rutas else len(rutas), ruta)
    return rutas[:tope]


def tarea_de_reparacion(pub: Dict[str, Any], archivos: Sequence[str], ahora: float) -> Optional[Dict[str, Any]]:
    """PURA. La tarea del enjambre que arregla una puerta de publicación en rojo, con la salida
    EXACTA de la puerta. None si no hay archivos que nombrar (no sería trabajo del enjambre)."""
    import time as _time
    archivos = [a for a in archivos or [] if isinstance(a, str) and a][:3]
    ev = (pub or {}).get("evidencia") or {}
    if not archivos or not ev.get("texto"):
        return None
    motivo = motivo_publicacion((pub or {}).get("detalle"))
    huella = hashlib.sha256(("%s|%s|%s" % (motivo, "|".join(archivos), ev.get("sha") or "")).encode("utf-8")
                            ).hexdigest()[:6].upper()
    fecha = _time.strftime("%m%d", _time.localtime(ahora))
    salida = tachar(str(ev.get("texto") or ""))[-1800:]
    pruebas = [a for a in archivos if a.endswith(".py") and os.path.basename(a).startswith("test_")]
    comprobar = ("python3 -m unittest %s" % " ".join(pruebas)) if pruebas else (
        "npx vitest run %s" % " ".join(a for a in archivos if ".test." in a) if any(".test." in a for a in archivos)
        else "npx tsc --noEmit")
    return {
        "id": "MGP%s-%s" % (fecha, huella),
        "ola": "MetaGenesis · que lo integrado llegue a producción",
        "titulo": "Puerta de publicación en rojo: %s" % motivo[:80],
        "archivos": archivos,
        "depende": [],
        "origen": "metagenesis",
        "prompt": (
            "NOTA DE METAGENESIS (%s): la autopublicación lleva más de %d min frenada en %s por «%s» y "
            "ningún commit nuevo lo ha arreglado. Esta es la salida de la puerta (recortada):\n```\n%s\n```\n"
            "Arregla la CAUSA en estos archivos: el código si la prueba describe bien lo que debe pasar, o la "
            "prueba si quedó desfasada respecto a un cambio intencionado (dilo en el mensaje del commit). No "
            "toques autopublicar.py, produccion_puertas.py ni el escáner de secretos; no relajes ni borres una "
            "prueba para que pase; nada de claves en el código. Comprueba con: `%s`."
            % (_time.strftime("%Y-%m-%d %H:%M", _time.localtime(ahora)), PUBLICACION_ROJA_S // 60,
               str(ev.get("sha") or "")[:8], motivo, salida, comprobar)),
    }


def prestable(t: Any) -> bool:
    """PURA. ¿Puede trabajarse esta tarea en otro medio? (≤ 3 archivos, con prompt, sin visto bueno
    humano y sin nada que solo tenga la Mac)."""
    if not isinstance(t, dict) or not t.get("id"):
        return False
    archivos = t.get("archivos") or []
    if not isinstance(archivos, list) or not 1 <= len(archivos) <= 3:
        return False
    if t.get("aprobacion") or str(t.get("medio") or t.get("donde") or "").lower() == "mac":
        return False
    prompt = str(t.get("prompt") or "")
    return bool(prompt.strip()) and not _SOLO_MAC.search(prompt + " " + str(t.get("titulo") or ""))


def elegir_reparto(candidatas: Sequence[Dict[str, Any]], excluir: Iterable[str], tope: int = REPARTO_TOPE
                   ) -> List[Dict[str, Any]]:
    """PURA. Qué tareas listas se prestan a otro medio SIN duplicar trabajo con la Mac.

    `candidatas` llega en el orden en que la Mac las va a coger (lo que más desbloquea, primero):
    se prestan las del FINAL, que la Mac no tocaría en horas. Cuando el otro medio las integra,
    `traer_nube` las lleva a main y el orquestador de la Mac las salta (`cerradas_en_disco`); si
    falla, siguen en la tanda de la Mac como siempre: nada se pierde. Las reparaciones de MetaGenesis
    (`origen: metagenesis`) van primero: desatascan la publicación de todo lo demás."""
    fuera = {str(x) for x in excluir or ()}
    bases_fuera = {base_de_tarea(x) for x in fuera}
    validas = [t for t in candidatas or () if prestable(t) and str(t.get("id")) not in fuera
               and base_de_tarea(t.get("id")) not in bases_fuera]
    # Una sola tarea por cadena, la más reciente (medido el 10-10: RTOPO1011T1 y RTOPO1011T1b, el mismo
    # rescate desde dos ramas, habrían ido juntas al A1 a hacer dos veces lo mismo).
    ultima: Dict[str, str] = {}
    for t in validas:
        b, tid = base_de_tarea(t.get("id")), str(t.get("id"))
        if b not in ultima or _posterior(tid, ultima[b]):
            ultima[b] = tid
    validas = [t for t in validas if ultima.get(base_de_tarea(t.get("id"))) == str(t.get("id"))]
    propias = [t for t in validas if t.get("origen") == "metagenesis"]
    resto = [t for t in reversed(validas) if t.get("origen") != "metagenesis"]
    return (propias + resto)[:max(0, int(tope))]


def tarea_limpia(t: Dict[str, Any]) -> Dict[str, Any]:
    """PURA. Lo que viaja de una tarea a otro medio (nada de rutas de disco ni de estado de la Mac)."""
    limpia = {k: t.get(k) for k in ("id", "ola", "titulo", "archivos", "prompt", "depende", "modelo", "importancia",
                                     "origen", "dificultad") if t.get(k) is not None}
    return json.loads(tachar(json.dumps(limpia, ensure_ascii=False)))


def medio_ocioso(n: str, l: Dict[str, Any]) -> Tuple[bool, str]:
    """PURA. ¿Este nodo puede trabajar una cola prestada AHORA? (bool, por qué no)."""
    s = l.get("salud") or {}
    if l.get("modo") != "real":
        return False, "seco"
    if s.get("autoritativo"):
        return False, "es el medio con las colas"
    if not s.get("repo") or not s.get("orquestador"):
        return False, "sin repo u orquestador"
    if l.get("secreto") is not True:
        return False, "sin secreto: no podría comprobar la orden firmada"
    if s.get("orquestadores"):
        return False, "ya trabaja una cola"
    a1 = s.get("a1") or {}
    # «guardian» = el A1 comprobando main (tsc, vitest, next build) a falta de trabajo: le CEDE la
    # máquina a una cola en cuanto llega (oracle_a1.guardian), así que cuenta como libre.
    if a1 and (a1.get("orquestador_vivo") or a1.get("cola")
               or str(a1.get("fase") or "espera") not in ("espera", "", "guardian")):
        return False, "su medio del enjambre está ocupado (%s)" % (a1.get("fase") or "cola")
    if isinstance(s.get("disco_gb"), (int, float)) and s["disco_gb"] < 3:
        return False, "poco disco"
    if isinstance(s.get("ram_libre_mb"), (int, float)) and s["ram_libre_mb"] < 1500:
        return False, "poca memoria"
    return True, ""


def mejor_medio_ocioso(nodos: Dict[str, Dict[str, Any]], excepto: Optional[str] = None) -> Optional[str]:
    libres = [(n, l) for n, l in (nodos or {}).items() if n != excepto and medio_ocioso(n, l)[0]]
    if not libres:
        return None
    return min(libres, key=lambda kv: _clave_mejor(kv[0], kv[1]))[0]


ALIMENTAR_QUIETA_S = 10 * 60


def medio_alimentable(n: str, l: Dict[str, Any]) -> Tuple[bool, str]:
    """PURA. ¿Se puede ALIMENTAR la cola viva de este medio (UN orquestador por medio: nunca una segunda
    cola)? Hace falta orquestador vivo, algún trabajador libre y que su cola no haya recibido tareas
    nuevas en los últimos 10 min. Lee `salud.cola_viva` = {trabajando, esperando, libres, sin_nuevas_s}."""
    s = l.get("salud") or {}
    if l.get("modo") != "real":
        return False, "seco"
    if s.get("autoritativo"):
        return False, "es el medio con las colas"
    if l.get("secreto") is not True:
        return False, "sin secreto: no podría comprobar la orden firmada"
    if not s.get("repo") or not s.get("orquestador"):
        return False, "sin repo u orquestador"
    if not s.get("orquestadores"):
        return False, "sin orquestador vivo: se le lanza una cola, no se alimenta"
    cv = s.get("cola_viva")
    if not isinstance(cv, dict):
        return False, "sin resumen de su cola viva"
    libres = cv.get("libres")
    if isinstance(libres, bool) or not isinstance(libres, int) or libres < 1:
        return False, "sin trabajadores libres"
    quieta = cv.get("sin_nuevas_s")
    if isinstance(quieta, bool) or not isinstance(quieta, (int, float)) or quieta < ALIMENTAR_QUIETA_S:
        return False, "su cola recibió tareas hace menos de 10 min"
    return True, ""


def mejor_medio_alimentable(nodos: Dict[str, Dict[str, Any]], excepto: Optional[str] = None) -> Optional[str]:
    """El alimentable con más trabajadores libres (desempate estable por `_clave_mejor`)."""
    ok = [(n, l) for n, l in (nodos or {}).items() if n != excepto and medio_alimentable(n, l)[0]]
    if not ok:
        return None
    return min(ok, key=lambda kv: (-kv[1]["salud"]["cola_viva"]["libres"], _clave_mejor(kv[0], kv[1])))[0]


def _h(texto: str) -> str:
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()[:8]


def _min(s: Any) -> str:
    s = int(s or 0)
    return ("%d h %02d min" % (s // 3600, (s % 3600) // 60)) if s >= 3600 else "%d min" % (s // 60)


def medidores_de_resultados(r: Dict[str, Any], prestamos: Sequence[Dict[str, Any]] = (), ahora: float = 0) -> Dict[str, str]:
    """PURA. Las cifras de resultados como pastillas de la foto (las ve cualquier neurona)."""
    r = r or {}
    m: Dict[str, str] = {}
    fall = r.get("fallidas") or []
    n_fall = int(r.get("n_fallidas") or len(fall))
    m["fallidas"] = ("%d sin resolver · la más vieja hace %s" % (n_fall, _min(fall[0].get("hace_s")))
                     if n_fall and fall else "ninguna sin resolver en 3 días")
    vb = r.get("visto_bueno") or []
    if vb:
        m["visto-bueno"] = "%d esperan visto bueno · la más vieja hace %s" % (
            int(r.get("n_visto_bueno") or len(vb)), _min(vb[0].get("hace_s")))
    pub = r.get("publicacion") or {}
    if pub.get("sin_publicar") is not None:
        estado = "apagada" if not pub.get("activa") else (pub.get("fase") or "—")
        motivo = motivo_publicacion(pub.get("detalle")) if pub.get("fase") == "bloqueado" else ""
        m["sin-publicar"] = ("%d commit(s) · autopublicación: %s%s" % (
            int(pub.get("sin_publicar") or 0), estado, (" (%s)" % motivo[:70]) if motivo else ""))[:160]
    if r.get("integradas_2h") is not None:
        m["integradas"] = "%d en las últimas 2 h" % int(r.get("integradas_2h") or 0)
    vivos = [p for p in prestamos or () if ahora - float(p.get("ts") or 0) < GRACIA_ASIGNACION_S]
    if vivos:
        por: Dict[str, int] = {}
        for p in vivos:
            por[p.get("destino") or "?"] = por.get(p.get("destino") or "?", 0) + len(p.get("ids") or [])
        m["prestadas"] = " · ".join("%d en %s" % (k, v) for v, k in sorted(por.items()))[:160]
    return m


# ─── el plan del líder ───────────────────────────────────────────────────────────────────


def _numero(texto: Any) -> Optional[int]:
    """PURA. El primer entero de un resumen de medidor («32 se pueden coger ya» → 32; «ninguna…» → 0)."""
    t = str(texto or "").strip()
    if re.match(r"^(ningun|nada|sin |no hay)", t, re.I):
        return 0
    m = re.search(r"\d+", t)
    return int(m.group(0)) if m else None


def trabajo_de_medidores(medidores: Dict[str, Any]) -> Dict[str, Optional[int]]:
    """PURA. Cifras del vigía de medidores (`starseed_memory_root/mando/vigia-medidores.json`):
    las MISMAS que ve Alex en Genesis, para que no haya dos verdades."""
    m = medidores or {}
    return {
        "listas": _numero(m.get("listas")),
        "en_curso": _numero(m.get("en-curso")),
        "agentes": _numero(m.get("agentes")),
        "bloqueadas": _numero(m.get("bloqueadas")),
    }


def enfriado(memoria: Dict[str, Any], clave: str, ahora: float, espera_s: int) -> bool:
    """PURA. ¿Pasó `espera_s` desde la última vez que se hizo `clave`?"""
    hecho = (memoria or {}).get("hecho", {}).get(clave)
    return hecho is None or ahora - float(hecho) >= espera_s


def accion(clave: str, que: str, nodo: str, motivo: str, args: Optional[Dict[str, Any]] = None,
           espera_s: int = 1800) -> Dict[str, Any]:
    return {"clave": clave, "accion": que, "nodo": nodo, "motivo": motivo, "args": args or {}, "espera_s": espera_s}


def planificar(mundo: Dict[str, Any], memoria: Dict[str, Any], ahora: float) -> List[Dict[str, Any]]:
    """PURA. Lo que el LÍDER decide hacer en esta vuelta, con enfriamientos.

    `mundo`: {nodos: {id: latido}, yo, autonomia (bool), asignaciones: [...], colas_portables:
    [...tareas], ultimo_autoritativo_ts}. Cada latido de nodo lleva `salud`: {guardianes_caidos,
    orquestadores, revisor_vivo, revisor_hace_s, trabajo: {listas, en_curso, bloqueadas, ...},
    tranquilo_desde, sin_orquestador_desde, disco_gb, autoritativo, modo, orquestador (sabe
    lanzar), repo}.
    """
    if not mundo.get("autonomia", True):
        return []
    nodos: Dict[str, Dict[str, Any]] = mundo.get("nodos") or {}
    plan: List[Dict[str, Any]] = []

    def anadir(a: Dict[str, Any]) -> None:
        if enfriado(memoria, a["clave"], ahora, a["espera_s"]):
            plan.append(a)

    autoritativos = [n for n, l in nodos.items() if (l.get("salud") or {}).get("autoritativo")]
    for n in autoritativos:
        s = nodos[n].get("salud") or {}
        trabajo = s.get("trabajo") or {}
        listas = trabajo.get("listas") or 0
        bloqueadas = trabajo.get("bloqueadas") or 0
        orquestadores = s.get("orquestadores") or []
        caidos = [g for g in s.get("guardianes_caidos") or [] if g]
        # 1. Quien cura a los demás no puede estar caído.
        if caidos:
            anadir(accion("reactivar:%s" % n, "reactivar", n,
                          "guardianes caídos en %s: %s" % (n, ", ".join(sorted(caidos))), espera_s=1800))
        # 2. Trabajo listo y nadie lo coge desde hace 10 min → los directores, ya.
        pausado = bool(s.get("pausado"))  # Alex pausó a los directores en Genesis: no se relanza nada
        sin_orq = s.get("sin_orquestador_desde")
        if not pausado and not orquestadores and listas > 0 and sin_orq and ahora - float(sin_orq) >= 600:
            anadir(accion("continuar:%s" % n, "continuar", n,
                          "%d listas y ningún orquestador desde hace %d min" % (listas, (ahora - float(sin_orq)) // 60),
                          espera_s=1800))
        # 3. Bloqueadas o fallidas y el revisor automático (OPB1011) sin pasar → una pasada ahora.
        hace = s.get("revisor_hace_s")
        res = s.get("resultados") or {}
        n_fall = int(res.get("n_fallidas") or 0)
        if (bloqueadas > 0 or n_fall > 0) and (not s.get("revisor_vivo")) and (hace is None or hace >= 900):
            anadir(accion("revisar_bloqueadas:%s" % n, "revisar_bloqueadas", n,
                          "%d bloqueadas y %d fallidas y el revisor no pasa desde %s" % (
                              bloqueadas, n_fall, "nunca" if hace is None else "hace %d min" % (hace // 60)),
                          espera_s=900))
        # 4. Nada listo, nada en curso, nadie trabajando desde hace 15 min → buscar trabajo.
        tranquilo = s.get("tranquilo_desde")
        en_curso = trabajo.get("en_curso") or 0
        if not pausado and not orquestadores and listas == 0 and en_curso == 0 and tranquilo and ahora - float(tranquilo) >= 900:
            anadir(accion("buscar_trabajo:%s" % n, "buscar_trabajo", n,
                          "sin trabajo listo ni en curso desde hace %d min" % ((ahora - float(tranquilo)) // 60),
                          espera_s=3 * 3600))

        # 6-9. RESULTADOS, no solo latidos (OPA1011b).
        for a in planificar_resultados(n, s, nodos, mundo.get("yo") or n, ahora):
            anadir(a)

    # 5. El medio con las colas en disco calla: otro medio real sigue su trabajo (relevo de medio).
    ultimo_aut = mundo.get("ultimo_autoritativo_ts")
    if not autoritativos and ultimo_aut and ahora - float(ultimo_aut) >= RELEVO_MEDIO_S:
        asignadas = ids_asignados_vigentes(mundo.get("asignaciones") or [], ahora)
        portables = [t for t in mundo.get("colas_portables") or [] if t.get("id") not in asignadas]
        destino = mejor_medio_libre(nodos)
        if portables and destino:
            anadir(accion("relevo_medio:%s" % destino, "lanzar_cola", destino,
                          "el medio con las colas calla desde hace %d min: %d tareas listas siguen en %s" % (
                              (ahora - float(ultimo_aut)) // 60, len(portables[:8]), destino),
                          args={"cola": "cola-relevo-%s" % destino, "trabajadores": 2,
                                "_tareas": portables[:8]}, espera_s=3600))
    return plan


def planificar_resultados(n: str, s: Dict[str, Any], nodos: Dict[str, Dict[str, Any]], yo: str,
                          ahora: float) -> List[Dict[str, Any]]:
    """PURA. Las reglas de RESULTADOS para el medio con las colas `n` (su salud `s`). Las devuelve sin
    filtrar por enfriamiento (eso lo hace `planificar`).

      6. Préstamo: con ≥ REPARTO_MIN_LISTAS listas y un medio ocioso (el A1), la Mac le presta las
         del final de su orden (sin duplicar: ver `elegir_reparto`).
      7. Publicación en rojo ≥ 1 h por el mismo motivo: si la salida nombra archivos, una tarea de
         reparación con esa salida (al medio ocioso si lo hay; si no, delante en la tanda de la Mac);
         si no, un aviso con lo que hace falta.
      8. Fallidas que nadie retoma desde hace ≥ 2 h: aviso con la lista (el revisor ya pasó por ellas).
      9. Visto bueno esperando ≥ 3 h: aviso (lo decide el aprobador automático o Alex).
    """
    plan: List[Dict[str, Any]] = []
    trabajo = s.get("trabajo") or {}
    r = s.get("resultados") or {}
    pausado = bool(s.get("pausado"))
    listas = int(trabajo.get("listas") or 0)
    destino = mejor_medio_ocioso(nodos, excepto=n)
    # 6.
    if not pausado and not s.get("nube_pausada") and destino and listas >= REPARTO_MIN_LISTAS:
        trab = trabajadores_prestamo(nodos.get(destino) or {})
        args_rep = {"destino": destino, "tope": tope_prestamo(trab)}
        if trab:
            args_rep["trabajadores"] = trab
        plan.append(accion("repartir:%s" % destino, "repartir", n,
                           "%d listas en %s y %s libre: las del final del orden, que la Mac tardaría horas en "
                           "coger" % (listas, n, destino),
                           args=args_rep, espera_s=REPARTO_ESPERA_S))
    elif not pausado and not s.get("nube_pausada") and not destino and listas >= REPARTO_MIN_LISTAS:
        # 6b. Nadie ocioso, pero un medio con trabajadores libres: se alimenta SU cola viva.
        alim = mejor_medio_alimentable(nodos, excepto=n)
        if alim:
            libres = nodos[alim]["salud"]["cola_viva"]["libres"]
            plan.append(accion("repartir:%s:alimentar" % alim, "repartir", n,
                               "%d listas en %s y %s con %d trabajador(es) libre(s) en su cola viva: se le añaden "
                               "a ella, sin segunda cola" % (listas, n, alim, libres),
                               args={"destino": alim, "tope": min(libres * 2, 8), "modo": "alimentar"},
                               espera_s=REPARTO_ESPERA_S))
    # 7.
    pub = r.get("publicacion") or {}
    clase = clase_publicacion(pub)
    desde = pub.get("desde")
    if clase and desde and ahora - float(desde) >= PUBLICACION_ROJA_S:
        motivo = motivo_publicacion(pub.get("detalle"))
        firma = _h(firma_publicacion(pub))
        quieta = _min(ahora - float(desde))
        if clase == "reparar" and n == yo:
            plan.append(accion("reparar_pub:%s" % firma, "reparar_publicacion", n,
                               "la autopublicación lleva %s frenada por «%s» con %d commit(s) esperando: la salida "
                               "de la puerta pasa a una tarea de reparación" % (
                                   quieta, motivo[:90], int(pub.get("sin_publicar") or 0)),
                               args={"destino": destino or ""}, espera_s=AVISO_ESPERA_S))
        else:
            plan.append(accion("avisar:pub:%s" % firma, "avisar", yo,
                               "la autopublicación lleva %s frenada por «%s»" % (quieta, motivo[:90]),
                               args={"texto": texto_aviso_publicacion(pub, quieta)}, espera_s=AVISO_ESPERA_S))
    # 8.
    viejas = [f for f in r.get("fallidas") or [] if int(f.get("hace_s") or 0) >= FALLIDA_AVISO_S]
    if viejas:
        ids = [f["id"] for f in viejas]
        plan.append(accion("avisar:fallidas:%s" % _h(",".join(sorted(ids))), "avisar", yo,
                           "%d fallida(s) sin que nadie las retome desde hace más de %s" % (len(ids), _min(FALLIDA_AVISO_S)),
                           args={"texto": (
                               "MetaGenesis · fallidas que nadie retoma: %s. QUÉ: fallaron hace más de %s y ni la "
                               "escalera del director ni el revisor de bloqueadas les han dado una sucesora. POR QUÉ "
                               "importa: lo que espera detrás no avanza. CÓMO: el revisor vuelve a pasar cada 5 min; "
                               "si es algo de la tarea, en Genesis › El trabajo ahora › Fallidas se ve el motivo y "
                               "«Reparar con mi cambio» la relanza con tu indicación." % (
                                   ", ".join("%s (%s, hace %s)" % (f["id"], f.get("estado"), _min(f.get("hace_s")))
                                             for f in viejas[:6]), _min(FALLIDA_AVISO_S)))},
                           espera_s=AVISO_ESPERA_S))
    # 9.
    vb = [f for f in r.get("visto_bueno") or [] if int(f.get("hace_s") or 0) >= VB_AVISO_S]
    if vb:
        ids = [f["id"] for f in vb]
        plan.append(accion("avisar:vb:%s" % _h(",".join(sorted(ids))), "avisar", yo,
                           "%d tarea(s) esperan visto bueno desde hace más de %s" % (len(ids), _min(VB_AVISO_S)),
                           args={"texto": (
                               "MetaGenesis · %d tarea(s) llevan más de %s esperando visto bueno: %s. El aprobador "
                               "automático decide las que tienen dictamen y puertas en verde; las demás son tuyas en "
                               "Genesis › Lo que sale › Tu visto bueno." % (
                                   len(ids), _min(VB_AVISO_S), ", ".join(ids[:8])))},
                           espera_s=AVISO_ESPERA_S))
    return plan


def texto_aviso_publicacion(pub: Dict[str, Any], quieta: str) -> str:
    """PURA. El aviso de una publicación frenada que el enjambre no puede arreglar solo: QUÉ, POR QUÉ, CÓMO."""
    motivo = motivo_publicacion((pub or {}).get("detalle"))
    if motivo.startswith("Jev"):
        como = ("Jev (el consejero barato) está seguro de que no conviene publicar este lote. Si crees que sí, en "
                "Genesis › Lo que sale › Sin publicar pulsa «Publicar sin Jev esta vez»: las demás puertas siguen.")
    elif motivo.startswith("análisis"):
        como = ("El análisis del lote vio algo con forma de secreto o una migración que borra datos. Si es un valor "
                "real, hay que sacarlo del código; si es un falso positivo del escáner, se corrige el escáner (nunca "
                "se publica saltándolo).")
    else:
        como = ("No es algo que el enjambre arregle editando código (red, GitHub o Vercel). La autopublicación lo "
                "reintenta con el siguiente commit.")
    return ("MetaGenesis · la autopublicación lleva %s frenada por «%s» y hay %d commit(s) esperando. %s" % (
        quieta, motivo[:160], int((pub or {}).get("sin_publicar") or 0), como))[:900]


def mejor_medio_libre(nodos: Dict[str, Dict[str, Any]]) -> Optional[str]:
    """PURA. El nodo REAL con repo y orquestador, sin orquestador corriendo y con disco, mejor puntuado."""
    libres = []
    for n, l in (nodos or {}).items():
        s = l.get("salud") or {}
        if l.get("modo") != "real" or not s.get("repo") or not s.get("orquestador"):
            continue
        if s.get("orquestadores"):
            continue
        if isinstance(s.get("disco_gb"), (int, float)) and s["disco_gb"] < 3:
            continue
        libres.append((n, l))
    if not libres:
        return None
    return min(libres, key=lambda kv: _clave_mejor(kv[0], kv[1]))[0]


def ids_asignados_vigentes(asignaciones: Iterable[Dict[str, Any]], ahora: float,
                           gracia_s: int = GRACIA_ASIGNACION_S) -> set:
    """PURA. Ids entregados a otro medio hace menos de `gracia_s` (no se vuelven a repartir)."""
    vigentes = set()
    for a in asignaciones or ():
        if ahora - _t(a) < gracia_s:
            vigentes.update(str(i) for i in a.get("ids") or [] if i)
    return vigentes


def autocurar(salud: Dict[str, Any], memoria: Dict[str, Any], ahora: float) -> List[Dict[str, Any]]:
    """PURA. Lo que CADA nodo hace por sí mismo, sea líder o no (no necesita a nadie)."""
    plan: List[Dict[str, Any]] = []

    def anadir(a: Dict[str, Any]) -> None:
        if enfriado(memoria, a["clave"], ahora, a["espera_s"]):
            plan.append(a)

    yo = salud.get("nodo") or "yo"
    caidos = salud.get("servicios_caidos") or []
    if caidos:
        anadir(accion("servicios", "revivir_servicios", yo, "servicios caídos: %s" % ", ".join(sorted(caidos)[:6]),
                      args={"servicios": sorted(caidos)[:12]}, espera_s=600))
    disco = salud.get("disco_gb")
    if isinstance(disco, (int, float)) and disco < 2.5 and not salud.get("autoritativo"):
        # En la Mac ya limpia la autocuración de Genesis (umbral 6 GB): aquí, los demás medios.
        anadir(accion("disco", "liberar_disco", yo, "quedan %.1f GB libres" % disco, espera_s=3600))
    return plan


# ─── rescate de trabajo de colas-fuente ──────────────────────────────────────────────────

#: Estados que cierran una tarea para siempre (no se rescata).
CERRADAS = {"commit", "hecho", "integrada", "sustituida", "rechazada", "descartada", "obsoleta", "informe",
            "reasignada"}


def candidatos_rescate(colas_fuente: Sequence[Tuple[str, float, List[Dict[str, Any]]]], ids_vivos: set,
                       progreso: Dict[str, Any], asuntos_git: Sequence[str], ahora: float,
                       max_dias: int = 21, tope: int = 12) -> List[Dict[str, Any]]:
    """PURA. Tareas de `colas-fuente/` que nadie cerró ni están en ninguna cola viva.

    `colas_fuente`: [(nombre, mtime, tareas)]. Fuera: copias `cola-auto-*`, sueños, colas de más
    de `max_dias`, tareas sin archivos o sin prompt (no son trabajo del enjambre), las que piden
    visto bueno humano, las cerradas en el progreso o con su id ya en un commit de main, y las
    que tienen una sucesora (misma cadena) cerrada. Gana la definición más nueva de cada id.
    """
    try:
        from vigilante_logica import id_en_asuntos, sucesora_integrada  # misma regla que el vigilante
    except ImportError:  # pragma: no cover — medio sin el resto del puente
        def _base(tid: Any) -> str:
            tid = str(tid or "")
            if len(tid) > 1 and tid[-1] in "bcdefghijklmnopqrstuvwxyz" and (tid[-2].isdigit() or tid[-2].isupper()):
                return tid[:-1]
            return tid

        def id_en_asuntos(tid: Any, asuntos: Sequence[str]) -> bool:
            patron = re.compile(r"(?:^|·\s*)%s\s*:" % re.escape(str(tid)))
            return any(patron.search(a) for a in asuntos)

        def sucesora_integrada(dep: Any, progreso: Dict[str, Any], asuntos_git: Sequence[str] = ()) -> Optional[str]:
            for k, v in sorted((progreso or {}).items()):
                if k <= dep or _base(k) != _base(dep):
                    continue
                if (isinstance(v, dict) and v.get("estado") in ("commit", "hecho")) or id_en_asuntos(k, asuntos_git):
                    return k
            return None

    elegidas: Dict[str, Dict[str, Any]] = {}
    vistos: set = set()
    for nombre, mtime, tareas in sorted(colas_fuente or (), key=lambda x: -float(x[1] or 0)):
        if not nombre.startswith("cola-") or nombre.startswith(("cola-auto-", "cola-suenos")):
            continue
        if ahora - float(mtime or 0) > max_dias * 86400:
            continue
        for t in tareas or ():
            if not isinstance(t, dict) or not t.get("id"):
                continue
            tid = str(t["id"])
            if tid in vistos or tid in ids_vivos:
                continue
            vistos.add(tid)  # la definición más nueva manda, sirva o no
            if t.get("aprobacion") or not t.get("archivos") or not str(t.get("prompt") or "").strip():
                continue
            est = (progreso or {}).get(tid)
            estado = est.get("estado") if isinstance(est, dict) else ""
            if estado in CERRADAS or estado in ("fallo", "fallo_tsc", "fallo_tests", "bloqueante",
                                                "esperando_aprobacion", "pendiente_aprobacion"):
                # Las falladas son del revisor de bloqueadas (OPB1011), no de un rescate a ciegas.
                continue
            if id_en_asuntos(tid, asuntos_git or []) or sucesora_integrada(tid, progreso or {}, asuntos_git or []):
                continue
            elegidas[tid] = dict(t, origen_rescate=nombre)
    return list(elegidas.values())[:tope]


# ─── la foto que leen las neuronas ───────────────────────────────────────────────────────


def resumen_nodo(n: str, l: Dict[str, Any], lider: Optional[str], ahora: float) -> Dict[str, Any]:
    s = l.get("salud") or {}
    return {
        "nodo": n,
        "medio": l.get("medio"),
        "etiqueta": MEDIOS.get(l.get("medio") or "", {}).get("etiqueta", "Neurona"),
        "modo": l.get("modo"),
        "lider": n == lider,
        "hace_s": max(0, int(ahora - _t(l))),
        "puntos": l.get("puntos"),
        "orquestadores": [o.get("cola") for o in s.get("orquestadores") or []][:4],
        "caidos": (s.get("servicios_caidos") or [])[:6],
        "disco_gb": s.get("disco_gb"),
        "disco_total_gb": s.get("disco_total_gb"),
        "ram_libre_mb": s.get("ram_libre_mb"),
        "ram_total_mb": s.get("ram_total_mb"),
        "nucleos": s.get("nucleos"),
        "carga": s.get("carga"),
        "cpu_pct": s.get("cpu_pct"),
        "trabajo": s.get("trabajo") or {},
        "version": l.get("version"),
    }


def foto(yo: str, termino: int, nodos: Dict[str, Dict[str, Any]], decisiones: Sequence[Dict[str, Any]],
         medidores: Dict[str, Any], autonomia: bool, modo: str, ahora: float, fuentes: Optional[Dict[str, Any]] = None
         ) -> Dict[str, Any]:
    """PURA. Lo que ve cualquier neurona: nodos, quién dirige, el trabajo y lo último decidido."""
    lista = [resumen_nodo(n, l, yo, ahora) for n, l in sorted(nodos.items())]
    return {
        "v": VERSION,
        "lider": yo,
        "termino": termino,
        "modo": modo,
        "autonomia": autonomia,
        "ts": ahora,
        "nodos": lista,
        "medidores": {k: str(v)[:160] for k, v in (medidores or {}).items() if isinstance(v, (str, int))},
        "decisiones": [
            {k: d.get(k) for k in ("ts", "accion", "nodo", "motivo", "resultado", "seco")}
            for d in list(decisiones or [])[-8:]
        ],
        "fuentes": fuentes or {},
    }


def texto_foto(f: Dict[str, Any]) -> str:
    vivos = len(f.get("nodos") or [])
    m = f.get("medidores") or {}
    return ("MetaGenesis · líder %s (término %s, %s) · %d nodo(s) · listas: %s · bloqueadas: %s"
            % (f.get("lider"), f.get("termino"), "autónoma" if f.get("autonomia") else "en pausa", vivos,
               _numero(m.get("listas")), _numero(m.get("bloqueadas"))))[:600]


def huella_foto(f: Dict[str, Any]) -> str:
    """PURA. Lo que cambia de verdad (sin relojes): si no cambia, no se vuelve a publicar."""
    sin_reloj = {
        "lider": f.get("lider"),
        "termino": f.get("termino"),
        "autonomia": f.get("autonomia"),
        "nodos": [{k: v for k, v in n.items()
                   if k not in ("hace_s", "ram_libre_mb", "disco_gb", "cpu_pct", "ram_total_mb",
                                "disco_total_gb", "nucleos", "carga")}
                  for n in f.get("nodos") or []],
        # De cada medidor, solo su cifra: sus textos llevan la hora de la medida y cambiarían siempre.
        "medidores": {k: _numero(v) for k, v in (f.get("medidores") or {}).items()},
        "decisiones": [(d.get("accion"), d.get("nodo"), d.get("resultado")) for d in f.get("decisiones") or []],
    }
    return hashlib.sha256(json.dumps(sin_reloj, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]


def tachar(texto: Any) -> str:
    """PURA. Nada con forma de clave, token, IP pública ni URL de túnel sale en un texto."""
    t = str(texto or "")
    t = re.sub(r"\b(sk|gsk|ghp|gho|xox[abprs]|nvapi|hf)[-_][A-Za-z0-9_\-]{8,}", "[clave]", t)
    t = re.sub(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{5,}", "[token]", t)
    t = re.sub(r"https?://[a-z0-9-]+\.trycloudflare\.com\S*", "[túnel]", t)
    t = re.sub(r"\b(?!(?:10|127|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.)(?:\d{1,3}\.){3}\d{1,3}\b", "[ip]", t)
    return t
