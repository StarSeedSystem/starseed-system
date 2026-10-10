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
        # 3. Bloqueadas y el revisor automático (OPB1011) sin pasar → una pasada ahora.
        hace = s.get("revisor_hace_s")
        if bloqueadas > 0 and (not s.get("revisor_vivo")) and (hace is None or hace >= 900):
            anadir(accion("revisar_bloqueadas:%s" % n, "revisar_bloqueadas", n,
                          "%d bloqueadas y el revisor no pasa desde %s" % (
                              bloqueadas, "nunca" if hace is None else "hace %d min" % (hace // 60)),
                          espera_s=900))
        # 4. Nada listo, nada en curso, nadie trabajando desde hace 15 min → buscar trabajo.
        tranquilo = s.get("tranquilo_desde")
        en_curso = trabajo.get("en_curso") or 0
        if not pausado and not orquestadores and listas == 0 and en_curso == 0 and tranquilo and ahora - float(tranquilo) >= 900:
            anadir(accion("buscar_trabajo:%s" % n, "buscar_trabajo", n,
                          "sin trabajo listo ni en curso desde hace %d min" % ((ahora - float(tranquilo)) // 60),
                          espera_s=3 * 3600))

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
        "ram_libre_mb": s.get("ram_libre_mb"),
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
        "nodos": [{k: v for k, v in n.items() if k not in ("hace_s", "ram_libre_mb", "disco_gb")}
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
