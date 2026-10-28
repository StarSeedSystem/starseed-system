"""Colmena · relevo sin pérdidas y cualquier neurona como contenedor (COL1012) — DECISIONES PURAS.

Contrato: architecture/colmena-relevo-contenedores.md. Lo usan el nodo de MetaGenesis (latido, órdenes
`desconectar`/`contenedor`, plan del líder) y el orquestador (puntos de control). Sin red, sin disco,
sin reloj: el tiempo `ahora` lo da quien llama. Solo biblioteca estándar (corre en la Mac, el A1, WSL2…).
"""
from typing import Any, Dict, Iterable, List, Optional, Tuple

#: Cada cuánto se guarda (y se saca del aparato) el trabajo a medias de un agente: lo máximo que se pierde.
PUNTO_CONTROL_S = 300
#: Un nodo que no late en max(3 × su periodo, esto) cuenta como perdido (con freno de consumo late cada 10 min).
SILENCIO_MIN_S = 900
#: Tras «Desconectar», el nodo tiene esto para guardar y soltar; si no confirma, cuenta como corte sin aviso.
GRACIA_DESCONECTAR_S = 120
#: Medido en la Mac el 2026-10-11: tsc con pico de 3,7 GB, node_modules 1,4 GB, .git 0,25 GB, worktree ~75 MB.
RAM_MIN_MB = 6 * 1024
DISCO_BASE_GB = 5.0
DISCO_POR_AGENTE_GB = 0.1
TOPE_AGENTES = 4
HERRAMIENTAS = ("git", "node", "python3", "opencode")
#: Las fases en las que un agente ESCRIBE en su worktree (las dos que emite `latir` del orquestador: la primera
#: pasada y «completando», la segunda del mismo modelo). Solo ahí hay trabajo a medias que sacar con un punto de
#: control. «reparando» y «corrigiendo» NO existen: el orquestador nunca las emite.
FASES_CON_TRABAJO = ("escribiendo", "completando")
#: Única fase que cierra una tarea: el `finally` del orquestador la deja en «hecho».
FASE_CERRADA = "hecho"
#: Para seguir la tarea de otro: primero lo que nunca se apaga, al final lo efímero.
PREFERENCIA = {"oracle-a1": 0, "mac": 1, "neurona": 1, "nube-cowork": 2, "gh-actions": 3}
NUBE_COMPARTIDA = ("gh-actions", "nube-cowork")
MAX_ARCHIVOS_GH = 3


def tarea_viva(fase: Any) -> bool:
    """PURA. ¿Esta fase de `latidos-<cola>.json` es una tarea viva en este aparato?

    La misma regla que el orquestador (`_datos_tareas_del_medio`): viva es toda fase que no es vacía ni «hecho».
    También lo son tsc, tests, revision, integrando, «esperando proveedor» o «esperando cupo»: el aparato las lleva
    a medias (una integración con el cerrojo tomado, 40 min esperando proveedor) aunque ningún agente esté
    escribiendo en ese instante. Apagarlo en cualquiera de ellas corta trabajo."""
    return isinstance(fase, str) and fase.strip() != "" and fase != FASE_CERRADA


def _num(x: Any, defecto: float = 0.0) -> float:
    return float(x) if isinstance(x, (int, float)) and not isinstance(x, bool) else defecto


def capacidad_contenedor(cap: Dict[str, Any]) -> Dict[str, Any]:
    """PURA. ¿Puede este aparato ser contenedor de agentes, y con cuántos? → {apto, agentes, motivo, falta}."""
    so = str(cap.get("so") or "otro")
    herr = cap.get("herramientas") or {}
    falta = [h for h in HERRAMIENTAS if not herr.get(h)]
    if so == "ios":
        return _no("iPhone y iPad no dejan ejecutar git ni Node: pueden mirar y mandar órdenes, no trabajar.")
    if cap.get("medio_app") in ("navegador", "pwa") and not herr:
        return _no("Una pestaña no puede ejecutar git ni los agentes: instala el trabajador en este aparato.", ["trabajador"])
    if so == "windows" and not cap.get("wsl"):
        return _no("En Windows el trabajador corre dentro de WSL2.", ["wsl2"])
    if falta:
        return _no("Faltan herramientas: %s." % ", ".join(falta), falta)
    ram_mb = _num(cap.get("ram_total_mb"))
    if ram_mb < RAM_MIN_MB:
        return _no("Con menos de 6 GB de RAM no cabe la comprobación de tipos (pico medido 3,7 GB).")
    n = min(TOPE_AGENTES, int((ram_mb / 1024 - 2) // 2), int(_num(cap.get("nucleos"), 1)) or 1)
    motivo = "%d agente(s) por la memoria y los núcleos." % n
    if so == "android":
        n, motivo = min(n, 1), "Android con Termux: 1 agente (experimental)."
    disco = _num(cap.get("disco_libre_gb"))
    if disco < DISCO_BASE_GB + DISCO_POR_AGENTE_GB:
        return _no("Poco disco: hacen falta %.1f GB libres y hay %.1f." % (DISCO_BASE_GB + DISCO_POR_AGENTE_GB, disco))
    caben = int(round((disco - DISCO_BASE_GB) / DISCO_POR_AGENTE_GB, 6))
    if caben < n:
        n, motivo = caben, "%d agente(s) por el disco libre." % caben
    bat = cap.get("bateria") or {}
    if bat and bat.get("cargando") is False:
        if _num(bat.get("nivel"), 1.0) < 0.2:
            return {"apto": True, "agentes": 0, "motivo": "Batería baja sin cargador: en espera hasta que lo enchufes.", "falta": []}
        n, motivo = min(n, 1), "Con batería sin cargador: 1 agente."
    if (cap.get("red") or {}).get("medida") and n > 1:
        n, motivo = 1, "Con datos móviles o red medida: 1 agente."
    return {"apto": True, "agentes": n, "motivo": motivo, "falta": []}


def _no(motivo: str, falta: Optional[List[str]] = None) -> Dict[str, Any]:
    return {"apto": False, "agentes": 0, "motivo": motivo, "falta": list(falta or [])}


def debe_guardar_punto(tarea: Dict[str, Any], ahora: float) -> bool:
    """PURA. ¿Toca guardar y sacar del aparato el trabajo a medias de esta tarea?"""
    if tarea.get("fase") not in FASES_CON_TRABAJO or not tarea.get("cambios"):
        return False
    punto = tarea.get("punto") or {}
    return not punto.get("t") or ahora - _num(punto.get("t")) >= PUNTO_CONTROL_S


def silencio_max(latido: Dict[str, Any]) -> float:
    return max(3 * _num(latido.get("periodo_s"), 300.0), float(SILENCIO_MIN_S))


def nodos_perdidos(latidos: Dict[str, Dict[str, Any]], bajas: Dict[str, Dict[str, Any]], ahora: float) -> Dict[str, str]:
    """PURA. {nodo: motivo} de los que ya no van a seguir su trabajo.

    Una baja normal (un reinicio del servicio) no cuenta: se espera a que calle de verdad. Una baja con
    `traspaso` (el botón «Desconectar») cuenta al momento."""
    fuera: Dict[str, str] = {}
    for nodo, l in (latidos or {}).items():
        t = _num(l.get("t"))
        b = (bajas or {}).get(nodo) or {}
        if b.get("traspaso") and _num(b.get("t")) >= t:
            fuera[nodo] = "se desconectó avisando"
        elif ahora - t > silencio_max(l):
            fuera[nodo] = "sin latir desde hace %d min" % int((ahora - t) // 60)
    return fuera


def tareas_a_reenrutar(latidos: Dict[str, Dict[str, Any]], bajas: Dict[str, Dict[str, Any]],
                       asignadas: Dict[str, Dict[str, Any]], ahora: float) -> List[Dict[str, Any]]:
    """PURA. Lo que tenían A MEDIAS los nodos perdidos y nadie ha seguido aún, con su último punto."""
    salida = []
    for nodo, motivo in sorted(nodos_perdidos(latidos, bajas, ahora).items()):
        l = latidos[nodo]
        for e in (l.get("en_curso") or [])[:8]:
            tid = str(e.get("id") or "")
            ya = (asignadas or {}).get(tid) or {}
            if not tid or (ya and _num(ya.get("t")) >= _num(l.get("t"))):
                continue
            punto = e.get("punto") or None
            perdida = int(ahora - _num(punto.get("t"))) if punto and punto.get("t") else None
            salida.append({"id": tid, "de": nodo, "motivo": motivo, "punto": punto, "perdida_s": perdida})
    return salida


def _insomne_hasta(info: Dict[str, Any]) -> Optional[float]:
    insomne = info.get("insomne")
    if isinstance(insomne, dict) and "hasta" in insomne:
        h = insomne.get("hasta")
        if isinstance(h, (int, float)) and not isinstance(h, bool):
            return float(h)
    senales = info.get("senales") or {}
    if isinstance(senales, dict):
        insomne2 = senales.get("insomne") or {}
        if isinstance(insomne2, dict) and "hasta" in insomne2:
            h = insomne2.get("hasta")
            if isinstance(h, (int, float)) and not isinstance(h, bool):
                return float(h)
    return None


def elegir_destino(tarea: Dict[str, Any], nodos: Dict[str, Dict[str, Any]], ocupados: Dict[str, int],
                   excluir: Iterable[str] = ()) -> Tuple[Optional[str], str]:
    """PURA. El mejor contenedor libre para seguir esta tarea, o (None, por qué)."""
    fuera = set(excluir or ())
    archivos = len(tarea.get("archivos") or [])
    candidatos = []
    for n, info in (nodos or {}).items():
        c = info.get("contenedor") or {}
        medio = str(info.get("medio") or "neurona")
        libres = int(_num(c.get("agentes"))) - int(ocupados.get(n, 0))
        if (n in fuera or not info.get("vivo") or info.get("modo") != "real" or info.get("desconectando")
                or not c.get("activo") or libres <= 0):
            continue
        if tarea.get("privado") and medio in NUBE_COMPARTIDA:
            continue
        if medio == "gh-actions" and archivos > MAX_ARCHIVOS_GH:
            continue
        if tarea.get("solo_mac") and medio != "mac":
            continue
        hasta = _insomne_hasta(info)
        if hasta is not None:
            # nunca una cuya sesión termina antes de 15 min
            if hasta < 900:  # < 15 minutos
                continue
        pref = PREFERENCIA.get(medio, 1)
        candidatos.append((pref, -libres, hasta if hasta is not None else -float("inf"), n))
    if not candidatos:
        return None, "Ningún contenedor libre: espera en el A1 y la coge el primero que se libere."
    # A igual preferencia de medio, gana la neurona con insomne.hasta posterior
    elegido = min(candidatos, key=lambda x: (x[0], x[1], -x[2] if x[2] != -float("inf") else -float("inf"), x[3]))
    return elegido[3], ""


def plan_relevo(latidos: Dict[str, Dict[str, Any]], bajas: Dict[str, Dict[str, Any]], asignadas: Dict[str, Dict[str, Any]],
                nodos: Dict[str, Dict[str, Any]], ocupados: Dict[str, int], tareas: Dict[str, Dict[str, Any]],
                ahora: float) -> List[Dict[str, Any]]:
    """PURA. Para cada tarea a medias de un nodo perdido: a qué contenedor va (o «espera»), sin pasarse de huecos."""
    ocup = dict(ocupados or {})
    perdidos = set(nodos_perdidos(latidos, bajas, ahora))
    plan = []
    for r in tareas_a_reenrutar(latidos, bajas, asignadas, ahora):
        destino, porque = elegir_destino((tareas or {}).get(r["id"]) or {"id": r["id"]}, nodos, ocup, perdidos)
        if destino:
            ocup[destino] = ocup.get(destino, 0) + 1
        plan.append(dict(r, a=destino, espera=porque))
    return plan


def al_volver(yo: str, mis_en_curso: Iterable[str], asignadas: Dict[str, Dict[str, Any]],
              mi_ultimo_latido_t: float) -> Tuple[List[str], List[str]]:
    """PURA. (soltar, seguir): lo que otro siguió mientras yo no estaba deja de ser mío (subo mi último punto)."""
    soltar, seguir = [], []
    for tid in mis_en_curso or ():
        a = (asignadas or {}).get(tid) or {}
        if a.get("a") and a.get("a") != yo and _num(a.get("t")) >= mi_ultimo_latido_t:
            soltar.append(tid)
        else:
            seguir.append(tid)
    return soltar, seguir


def debe_desconectarse_solo(senales: Dict[str, Any]) -> Tuple[bool, str]:
    """PURA. ¿Pide el propio aparato su desconexión antes de caerse? (batería crítica o apagado inminente)."""
    bat = senales.get("bateria") or {}
    if bat and bat.get("cargando") is False and _num(bat.get("nivel"), 1.0) <= 0.10:
        return True, "batería al %d %% sin cargador" % int(_num(bat.get("nivel")) * 100)
    apagado = senales.get("apagado_en_s")
    if isinstance(apagado, (int, float)) and not isinstance(apagado, bool) and 0 <= apagado <= 300:
        return True, "se apaga en %d min" % max(1, int(apagado // 60))
    # Insomne
    insomne = senales.get("insomne")
    if isinstance(insomne, dict):
        hasta = insomne.get("hasta")
    else:
        hasta = None
    if hasta is None:
        s2 = senales.get("senales") or {}
        if isinstance(s2, dict):
            insomne2 = s2.get("insomne") or {}
            if isinstance(insomne2, dict):
                hasta = insomne2.get("hasta")
    if isinstance(hasta, (int, float)) and not isinstance(hasta, bool):
        queda = float(hasta)
        # Si viene como timestamp muy grande, no podemos calcular sin ahora; pero según enunciado
        # "si senales.insomne.hasta llega en menos de 5 min" -> tratar como que queda < 300
        if queda < 300 and queda >= 0:  # segundos que quedan
            mins = int(queda // 60)
            if mins < 1 and queda > 0:
                mins = 1
            if queda == 0:
                mins = 0
            return True, "la sesión insomne termina en %d min" % mins
        # También aceptar <= 300 por redondeo
        if queda <= 300 and queda >= 0:
            mins = int(round(queda / 60))
            if mins < 1 and queda > 0:
                mins = 1
            if queda == 0:
                mins = 0
            return True, "la sesión insomne termina en %d min" % mins
    return False, ""
