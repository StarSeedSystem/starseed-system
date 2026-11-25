#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Relevo de medios (RES1121A · DIR1121): Mac, A1 de Oracle, Maggabox y nubes efímeras
enlazados, cada uno con su especialidad y su respaldo, sin dependencia única.

Reglas de la memoria fundamental `resiliencia-seguridad-y-respaldos`: 3 copias, 2 medios y
1 fuera de la Mac. Los canales y el estado de olas se replican cada pocos minutos al A1 y
al Maggabox (este último SIN secretos). Si la Mac calla N minutos, el A1 toma el arriendo de
cada bot de Telegram: un solo lector por bot; al volver, la Mac lo recupera sin duplicar ni
perder mensajes porque el `offset` viaja con el estado replicado. Las claves que el A1
necesita viajan SOLO por `oracle_nodo.py claves` (archivo 600 del servicio), nunca al
Maggabox ni a nubes efímeras. Solo biblioteca estándar y sin red en las funciones puras.
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import re
import tempfile
import time
from typing import Any, Dict, Iterable, List, Optional, Tuple

CANALES: Tuple[str, ...] = ("principal", "general", "audiovisual")
NOMBRES_CANALES_POR_DEFECTO: Dict[str, str] = {
    "principal": "Principal",
    "general": "General",
    "audiovisual": "Audiovisual y diseño",
}
BOTS_POR_DEFECTO: Dict[str, str] = {
    "principal": "@starseed_neurocortex_bot",
    "general": "@starseed_puente_bot",
    "audiovisual": "@StarSeed_Design_bot",
}
CAMPOS_CANAL_A1: Tuple[str, ...] = (
    "nombre", "telegram_bot", "telegram_env_token", "telegram_env_chat_id",
    "telegram_polling_permitido", "jsonl_local", "astraura_puente", "hermes_sesion",
)

INTERVALO_REPLICA_S = 180          # «cada pocos minutos»: canales y olas al A1 y al Maggabox
SILENCIO_MAC_S = 300               # N: la Mac callada 5 min cede el relevo
MARGEN_SIMULACRO_S = 120           # el A1 debe responder en menos de N + 2 min
ARRIENDO_S = 180                   # vida de cada arriendo de bot
RENOVAR_S = 60                     # cadencia de renovación
RECLAMO_MAC_S = 60                 # la Mac espera a que el A1 cierre su getUpdates antes de recuperar
PRIORIDAD = {"mac": 0, "oracle-a1": 1, "maggabox": 2, "nubes-efimeras": 3}

MOTORES_GRATIS: Tuple[str, ...] = (
    "needle3-local", "astraura-158-local", "astraura-158-malla", "freellmapi",
    "gemini-flash-lite", "nvidia-minimax-m3.1-flash", "openrouter-:free", "hermes",
)
MOTORES_DE_PAGO = ("opus", "sonnet", "fable", "gpt-4", "gpt-5", "claude-", "anthropic/", "openai/")
DESTINO_CLAVES = "oracle-a1"
ARCHIVO_CLAVES_A1 = "/etc/starseed/direccion.env"

REGISTRO: Dict[str, Dict[str, Any]] = {
    "mac": {
        "nombre": "Mac de Alex",
        "siempre_encendido": False,
        "especialidad": ("orquestador", "puertas", "cartero", "presidente", "bot Principal"),
        "releva": ("oracle-a1",),
        "lo_releva": ("oracle-a1",),
        "respaldo": "El A1 toma el arriendo de Telegram y la cola; el Maggabox conserva canales y olas.",
        "con_claves": True,
        "latido_max_s": SILENCIO_MAC_S,
    },
    "oracle-a1": {
        "nombre": "A1 de Oracle Always Free",
        "siempre_encendido": True,
        "especialidad": ("siempre encendido", "bot de diseño", "guardián de main", "cola de respaldo", "nube"),
        "releva": ("mac",),
        "lo_releva": ("mac",),
        "respaldo": "La Mac recupera sus bots al volver; el Maggabox guarda copia de canales y olas.",
        "con_claves": True,
        "latido_max_s": 3 * SILENCIO_MAC_S,
    },
    "maggabox": {
        "nombre": "Neurona nodo Maggabox (Linux)",
        "siempre_encendido": True,
        "especialidad": ("almacén", "espejo de GitHub cada 15 min", "versiones", "respaldos cifrados"),
        "releva": (),
        "lo_releva": ("oracle-a1", "mac"),
        "respaldo": "Es nodo público: recibe copias sin secretos, nunca claves en claro.",
        "con_claves": False,
        "latido_max_s": 3 * SILENCIO_MAC_S,
    },
    "nubes-efimeras": {
        "nombre": "GitHub Actions y Cloudroom",
        "siempre_encendido": False,
        "especialidad": ("GitHub Actions", "Cloudroom", "trabajo sin secretos de Alex"),
        "releva": (),
        "lo_releva": ("mac", "oracle-a1"),
        "respaldo": "Si caen, el trabajo vuelve a la Mac o al A1; no reciben claves ni datos privados.",
        "con_claves": False,
        "latido_max_s": 0,
    },
}

DATOS_CRITICOS: Dict[str, Dict[str, Any]] = {
    "canales": {"copias": ("mac", "oracle-a1", "maggabox"), "fuera_de_mac": ("oracle-a1", "maggabox")},
    "olas": {"copias": ("mac", "oracle-a1", "maggabox"), "fuera_de_mac": ("oracle-a1", "maggabox")},
    "claves": {"copias": ("mac", "oracle-a1"), "fuera_de_mac": ("oracle-a1",),
               "excepcion": "Una clave nunca se copia a un nodo público ni a una nube efímera."},
}

ACCIONES_DE_ALEX: Tuple[str, ...] = (
    "Ejecutar `python3 scripts/puente/oracle_nodo.py claves --aplicar` con las claves que el A1 necesita para relevar (viajan al archivo 600 del servicio; nunca al Maggabox).",
    "Parar de verdad el latido del Mac durante el simulacro y confirmar en el canal «General» de Telegram que el A1 responde en menos de N + 2 min, y luego la vuelta.",
    "Dar de alta la llave SSH y el espacio del Maggabox si aún no está en esta máquina; sin eso la réplica al almacén queda pendiente y se dice, no se inventa.",
)

_RUTA_ESTADO = os.path.expanduser("~/.starseed/relevo-medios.json")
_RUTA_CANALES = os.path.expanduser("~/.starseed/canales-direccion.json")
_CLAVE_SENSIBLE = re.compile(r"(token|secret|clave|contrase|password|passwd|apikey|api_key|authorization|bearer|credencial)", re.I)


def _num(valor: Any, defecto: float = 0.0) -> float:
    return float(valor) if isinstance(valor, (int, float)) and not isinstance(valor, bool) else defecto


def _sin_secretos(dato: Any) -> Any:
    """PURA. Copia profunda sin claves de diccionario que huelan a secreto (para el Maggabox)."""
    if isinstance(dato, dict):
        return {str(k): _sin_secretos(v) for k, v in dato.items() if not _CLAVE_SENSIBLE.search(str(k))}
    if isinstance(dato, list):
        return [_sin_secretos(v) for v in dato]
    return copy.deepcopy(dato)


def registro_publico(registro: Optional[Dict[str, Dict[str, Any]]] = None) -> Dict[str, Any]:
    """PURA. El registro de medios tal cual se enseña: sin valores de claves (el registro no los tiene)."""
    reg = registro if registro is not None else REGISTRO
    return {m: {"nombre": d.get("nombre"), "especialidad": list(d.get("especialidad") or ()),
                "lo_releva": list(d.get("lo_releva") or ()), "releva": list(d.get("releva") or ()),
                "respaldo": d.get("respaldo"), "con_claves": bool(d.get("con_claves"))}
            for m, d in reg.items()}


def validar_registro(registro: Optional[Dict[str, Dict[str, Any]]] = None) -> List[str]:
    """PURA. Lista de fallos del registro; vacía = cada medio tiene especialidad y relevo coherentes."""
    reg = registro if registro is not None else REGISTRO
    fallos: List[str] = []
    for medio in ("mac", "oracle-a1", "maggabox", "nubes-efimeras"):
        if medio not in reg:
            fallos.append("falta el medio %s" % medio)
    for medio, d in reg.items():
        if not d.get("especialidad"):
            fallos.append("%s sin especialidad" % medio)
        if not d.get("lo_releva") and medio not in ("maggabox", "nubes-efimeras"):
            fallos.append("%s sin quién lo releve" % medio)
        for otro in d.get("lo_releva") or ():
            if otro == medio:
                fallos.append("%s no puede relevarse a sí mismo" % medio)
            if otro not in reg:
                fallos.append("%s lo releva un medio desconocido: %s" % (medio, otro))
        if medio in ("maggabox", "nubes-efimeras") and d.get("con_claves"):
            fallos.append("%s es público/efímero y no puede llevar claves" % medio)
    if reg.get("oracle-a1", {}).get("siempre_encendido") is not True:
        fallos.append("el A1 debe estar siempre encendido")
    return fallos


def verificar_resiliencia(datos: Optional[Dict[str, Dict[str, Any]]] = None) -> List[str]:
    """PURA. 3 copias, 2 medios y 1 fuera de la Mac; una clave no va a un nodo público."""
    fallos: List[str] = []
    for nombre, d in (datos or DATOS_CRITICOS).items():
        copias = tuple(d.get("copias") or ())
        if len(copias) < 2:
            fallos.append("%s: menos de 2 copias" % nombre)
        if len(set(copias)) < 2:
            fallos.append("%s: una sola clase de medio" % nombre)
        if not set(d.get("fuera_de_mac") or ()):
            fallos.append("%s: ninguna copia fuera de la Mac" % nombre)
        if nombre in ("canales", "olas") and len(copias) < 3:
            fallos.append("%s: hacen falta 3 copias" % nombre)
        if nombre == "claves" and any(m in ("maggabox", "nubes-efimeras") for m in copias):
            fallos.append("claves: nunca al Maggabox ni a nubes efímeras")
    return fallos


def cargar_canales(ruta: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
    """Lee el registro único `~/.starseed/canales-direccion.json`; vacío si no está o no se puede."""
    objetivo = os.path.expanduser(ruta or _RUTA_CANALES)
    try:
        with open(objetivo, encoding="utf-8") as f:
            crudo = json.load(f)
    except (OSError, ValueError):
        return {}
    return {str(k): dict(v) for k, v in crudo.items() if isinstance(v, dict)} if isinstance(crudo, dict) else {}


def nombre_de_canal(canal: str, canales: Optional[Dict[str, Dict[str, Any]]] = None) -> str:
    """PURA. Nombre visible canónico: el del registro o el de respaldo. Nunca se escribe a mano."""
    d = (canales or {}).get(canal) or {}
    return " ".join(str(d.get("nombre") or "").split()).strip() or NOMBRES_CANALES_POR_DEFECTO.get(canal, canal)


def canales_publicos(canales: Optional[Dict[str, Dict[str, Any]]] = None) -> List[Dict[str, str]]:
    """PURA. Los tres canales con su nombre y su bot, SIN variables de entorno ni valores."""
    cfg = canales if canales is not None else {}
    return [{"clave": c, "nombre": nombre_de_canal(c, cfg),
             "bot": str(((cfg.get(c) or {}).get("telegram_bot")) or BOTS_POR_DEFECTO[c])}
            for c in CANALES]


def canales_para_a1(canales: Optional[Dict[str, Dict[str, Any]]] = None) -> Dict[str, Dict[str, Any]]:
    """PURA. El registro que necesita el A1: nombre, bot y NOMBRES de variables (nunca valores)."""
    cfg = canales if canales is not None else {}
    salida: Dict[str, Dict[str, Any]] = {}
    for c in CANALES:
        entrada = cfg.get(c) or {}
        fila = {k: entrada[k] for k in CAMPOS_CANAL_A1 if k in entrada and not _CLAVE_SENSIBLE.search(k)}
        fila.setdefault("nombre", nombre_de_canal(c, cfg))
        fila.setdefault("telegram_bot", BOTS_POR_DEFECTO[c])
        for k in CAMPOS_CANAL_A1:
            if k in ("telegram_env_token", "telegram_env_chat_id") and entrada.get(k):
                fila[k] = str(entrada[k])
        salida[c] = fila
    return salida


def olas_publicas(progreso: Optional[Dict[str, Any]] = None, medios: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """PURA. Estado de olas replicable: sin claves ni valores que huelan a secreto."""
    return {"progreso": _sin_secretos(progreso or {}), "medios": _sin_secretos(medios or {})}


def puede_replicar(destino: str) -> bool:
    """PURA. Solo el A1 y el Maggabox reciben réplica; las nubes efímeras, nunca."""
    return destino in ("oracle-a1", "maggabox")


def puede_llevar_claves(destino: str) -> bool:
    """PURA. El ÚNICO destino de claves es el A1, por `oracle_nodo.py claves`."""
    return destino == DESTINO_CLAVES


def destinos_de_claves() -> Dict[str, Any]:
    """PURA. Política de claves para documentar y comprobar: origen, permiso y prohibiciones."""
    return {"origen": "oracle_nodo.py claves", "archivo": ARCHIVO_CLAVES_A1,
            "permitidos": [DESTINO_CLAVES], "prohibidos": ["maggabox", "nubes-efimeras"]}


def construir_replica(destino: str, canales: Optional[Dict[str, Dict[str, Any]]] = None,
                      olas: Optional[Dict[str, Any]] = None, estado: Optional[Dict[str, Any]] = None,
                      ahora: Optional[float] = None) -> Dict[str, Any]:
    """PURA. Paquete de réplica por destino: el Maggabox recibe solo lo público, sin secretos."""
    if not puede_replicar(destino):
        raise ValueError("las nubes efímeras no reciben réplica de dirección")
    cuerpo: Dict[str, Any] = {
        "version": 1, "destino": destino, "actualizado": ahora if ahora is not None else time.time(),
        "canales": canales_para_a1(canales) if destino == "oracle-a1" else canales_publicos(canales),
        "olas": olas_publicas(**(olas or {})),
    }
    if estado is not None:
        cuerpo["relevo"] = estado_publico(estado)
    return _sin_secretos(cuerpo) if destino == "maggabox" else cuerpo


def estado_inicial() -> Dict[str, Any]:
    """PURA. Documento de relevo vacío: latidos, arriendos por bot y offsets de Telegram."""
    return {"version": 1, "actualizado": 0.0, "latidos": {}, "arriendos": {}, "offsets": {}}


def latir(estado: Dict[str, Any], medio: str, ahora: float) -> Dict[str, Any]:
    """PURA. Deja el latido de `medio`; devuelve el mismo documento (mutado a propósito)."""
    estado.setdefault("latidos", {})[medio] = float(ahora)
    estado["actualizado"] = max(_num(estado.get("actualizado")), float(ahora))
    return estado


def medio_vivo(estado: Dict[str, Any], medio: str, ahora: float, max_s: Optional[float] = None) -> bool:
    """PURA. ¿Late `medio` dentro de su ventana? El A1 y el Maggabox aguantan más que la Mac."""
    t = _num((estado.get("latidos") or {}).get(medio))
    limite = _num(max_s if max_s is not None else (REGISTRO.get(medio) or {}).get("latido_max_s"), SILENCIO_MAC_S)
    return bool(limite > 0 and ahora - t < limite)


def decidir_lider(estado: Dict[str, Any], ahora: float) -> Optional[str]:
    """PURA. Quién debe el arriendo de Telegram: la Mac si vive; si calla, el A1."""
    for medio in ("mac", "oracle-a1", "maggabox"):
        if medio_vivo(estado, medio, ahora):
            return medio
    return None


def estado_publico(estado: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """PURA. Lo que viaja en la réplica: latidos, arriendos y offsets, sin material sensible."""
    e = estado if isinstance(estado, dict) else estado_inicial()
    return _sin_secretos({"version": int(_num(e.get("version"), 1)), "actualizado": _num(e.get("actualizado")),
                          "latidos": e.get("latidos") or {}, "arriendos": e.get("arriendos") or {},
                          "offsets": e.get("offsets") or {}})


def arriendo_vigente(arriendo: Any, ahora: float) -> bool:
    """PURA. ¿El arriendo de un bot sigue vivo?"""
    return isinstance(arriendo, dict) and bool(arriendo.get("dueno")) and _num(arriendo.get("caduca")) > ahora


def decidir_arriendo(estado: Dict[str, Any], canal: str, yo: str, ahora: float,
                     renovar: bool = False) -> Dict[str, Any]:
    """PURA. Un solo lector por bot: quién hace el polling de `canal` y con qué arriendo.

    Si la Mac vuelve con un arriendo del A1 tomado hace más de `RECLAMO_MAC_S`, lo recupera;
    la espera deja que el A1 cierre su `getUpdates` y guarde el offset, sin duplicar ni perder.
    """
    a = (estado.get("arriendos") or {}).get(canal) or {}
    dueno, version = str(a.get("dueno") or ""), int(_num(a.get("version")))
    nuevo = {"dueno": yo, "caduca": ahora + ARRIENDO_S, "version": version + 1, "tomado": ahora}
    if not dueno or not arriendo_vigente(a, ahora):
        lider = decidir_lider(estado, ahora)
        if yo != lider:
            return {"canal": canal, "soy": False, "actuar": False, "arriendo": a,
                    "motivo": "espera al líder: %s" % (lider or "ninguno")}
        return {"canal": canal, "soy": True, "actuar": True, "arriendo": nuevo, "motivo": "libre o caducado"}
    if dueno == yo:
        if not renovar:
            return {"canal": canal, "soy": True, "actuar": False, "arriendo": a, "motivo": "vigente"}
        return {"canal": canal, "soy": True, "actuar": True,
                "arriendo": dict(nuevo, tomado=a.get("tomado")), "motivo": "renovado"}
    if not medio_vivo(estado, dueno, ahora):
        return {"canal": canal, "soy": True, "actuar": True, "arriendo": nuevo, "motivo": "el dueño no late"}
    if PRIORIDAD.get(yo, 9) < PRIORIDAD.get(dueno, 9) and ahora - _num(a.get("tomado")) >= RECLAMO_MAC_S:
        return {"canal": canal, "soy": True, "actuar": True, "arriendo": nuevo, "motivo": "mejor prioridad: recupero"}
    return {"canal": canal, "soy": False, "actuar": False, "arriendo": a, "motivo": "dueño: %s" % dueno}


def plan_arriendos(estado: Dict[str, Any], yo: str, ahora: float, renovar: bool = False,
                   canales: Iterable[str] = CANALES) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Any]]:
    """PURA. Decide y aplica los arriendos de los tres bots en una copia del estado."""
    nuevo = copy.deepcopy(estado) if estado else estado_inicial()
    plan: Dict[str, Dict[str, Any]] = {}
    for canal in canales:
        d = decidir_arriendo(nuevo, canal, yo, ahora, renovar=renovar)
        plan[canal] = d
        if d.get("actuar"):
            nuevo.setdefault("arriendos", {})[canal] = d["arriendo"]
            nuevo["actualizado"] = max(_num(nuevo.get("actualizado")), float(ahora))
    return plan, nuevo


def siguiente_offset(previo: Any, updates: Iterable[Dict[str, Any]]) -> int:
    """PURA. Próximo `offset` de Telegram: solo los update_id no confirmados; reaplicar no duplica."""
    base = int(_num(previo))
    ids = [int(_num(u.get("update_id"))) for u in (updates or ()) if _num(u.get("update_id")) >= base]
    return max(ids) + 1 if ids else base


def anotar_offset(estado: Dict[str, Any], canal: str, offset: int, ahora: float) -> Dict[str, Any]:
    """PURA. Guarda el offset confirmado por canal; es lo que permite el relevo sin pérdidas."""
    estado.setdefault("offsets", {})[canal] = {"update_id": int(offset), "actualizado": float(ahora)}
    return estado


def offset_de(estado: Dict[str, Any], canal: str) -> int:
    """PURA. El offset replicado de `canal` (0 si aún no hay)."""
    d = (estado.get("offsets") or {}).get(canal) or {}
    return int(_num(d.get("update_id")))


def fusionar_estado(local: Optional[Dict[str, Any]], remoto: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """PURA. Une dos copias del estado sin retroceder: offset máximo y arriendo de más versión."""
    out = estado_inicial()
    fuentes = [f for f in (local, remoto) if isinstance(f, dict)]
    out["version"] = max(int(_num((f or {}).get("version"), 1)) for f in (fuentes or [{}]))
    out["actualizado"] = max(_num((f or {}).get("actualizado")) for f in (fuentes or [{}]))
    for f in fuentes:
        for medio, t in (f.get("latidos") or {}).items():
            out["latidos"][medio] = max(_num(out["latidos"].get(medio)), _num(t))
        for canal, a in (f.get("arriendos") or {}).items():
            actual = out["arriendos"].get(canal) or {}
            if not actual or _num(a.get("version")) > _num(actual.get("version")) or (
                    _num(a.get("version")) == _num(actual.get("version"))
                    and _num(a.get("caduca")) > _num(actual.get("caduca"))):
                out["arriendos"][canal] = dict(a)
        for canal, o in (f.get("offsets") or {}).items():
            actual = out["offsets"].get(canal) or {}
            if _num(o.get("update_id")) > _num(actual.get("update_id")):
                out["offsets"][canal] = dict(o)
    return out


def recuperar_al_volver(local: Optional[Dict[str, Any]], remoto: Optional[Dict[str, Any]], medio: str,
                       ahora: float) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Any]]:
    """PURA. La vuelta de un medio: fusiona la copia que dejó el que relevó (offset incluido), late
    y recupera sus bots. Nunca arranca de un offset más viejo, así no repite ni pierde mensajes."""
    e = fusionar_estado(local, remoto)
    latir(e, medio, ahora)
    plan, e = plan_arriendos(e, medio, ahora)
    return plan, e


def toca_replicar(ahora: float, ultima: float = 0.0, intervalo: float = INTERVALO_REPLICA_S) -> bool:
    """PURA. ¿Toca replicar canales y olas? Cada pocos minutos, nunca en bucle."""
    return float(ahora) - float(ultima or 0) >= float(intervalo)


def es_gratis(motor: str) -> bool:
    """PURA. Un motor de relevo es gratis si está en la flota y no huele a modelo de pago."""
    m = str(motor or "").lower()
    return bool(m) and m not in MOTORES_DE_PAGO and not any(p in m for p in MOTORES_DE_PAGO)


def motor_gratis(disponibles: Iterable[str]) -> Optional[str]:
    """PURA. El primero disponible de la flota gratuita; si no hay, None (se encola)."""
    disponibles = {str(m).lower(): str(m) for m in (disponibles or ())}
    for motor in MOTORES_GRATIS:
        if motor.lower() in disponibles:
            return disponibles[motor.lower()]
    return next((original for clave, original in disponibles.items() if es_gratis(clave)), None)


def plan_turno(disponibles: Iterable[str], ocupado: bool = False, cola: int = 0) -> Dict[str, Any]:
    """PURA. Con el A1 relevando: motor gratuito primero; si está ocupado, a la cola sin gastar."""
    if ocupado:
        return {"motor": None, "cola": True, "motivo": "ocupado: a la cola del A1", "pendientes": int(cola)}
    motor = motor_gratis(disponibles)
    if not motor:
        return {"motor": None, "cola": True, "motivo": "sin motor gratuito disponible: a la cola", "pendientes": int(cola)}
    return {"motor": motor, "cola": False, "motivo": "motor gratuito", "pendientes": int(cola)}


def acciones_de_alex() -> List[str]:
    """PURA. Lo que solo Alex puede hacer; el sistema no lo hace por él."""
    return list(ACCIONES_DE_ALEX)


def leer_estado(ruta: Optional[str] = None) -> Dict[str, Any]:
    """Lee el documento de relevo; un archivo ausente o roto no inventa latidos ni arriendos."""
    try:
        with open(os.path.expanduser(ruta or _RUTA_ESTADO), encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else estado_inicial()
    except (OSError, ValueError):
        return estado_inicial()


def escribir_estado(estado: Dict[str, Any], ruta: Optional[str] = None) -> None:
    """Escribe el estado de forma atómica (nunca a medias) y sin secretos."""
    destino = os.path.expanduser(ruta or _RUTA_ESTADO)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(destino), prefix=".relevo-", suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(estado_publico(estado), f, ensure_ascii=False, indent=1)
    os.replace(tmp, destino)


def leer_olas(olas_dir: str) -> Dict[str, Any]:
    """Lee el estado de olas (progreso y medios) de disco; ausente no es error."""
    salida: Dict[str, Any] = {}
    for nombre, clave in (("progreso.json", "progreso"), ("medios.json", "medios")):
        try:
            with open(os.path.join(olas_dir, nombre), encoding="utf-8") as f:
                salida[clave] = json.load(f)
        except (OSError, ValueError):
            salida[clave] = {}
    return salida


RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
RUTA_RELEVO_A1 = "/home/starseed/starseed-system/starseed_memory_root/relevo"
RUTA_RELEVO_MAGGABOX = "StarSeed-almacen/relevo"


def _escribir_remoto_a1(nombre: str, datos: Dict[str, Any]) -> str:
    import oracle_nodo as N  # noqa: PLC0415 — mismo canal ssh y misma llave que `claves`
    cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
    orden = "mkdir -p %s && cat > %s/%s" % (RUTA_RELEVO_A1, RUTA_RELEVO_A1, nombre)
    rc, salida = N._ssh_bytes(orden, cuerpo, timeout=120)
    if rc != 0:
        raise RuntimeError(str(salida or "ssh sin detalle")[:160])
    return "a1"


def _escribir_remoto_maggabox(nombre: str, datos: Dict[str, Any]) -> str:
    import subprocess  # noqa: PLC0415
    import sonda_maggabox as S  # noqa: PLC0415 — la misma llave y el mismo nodo del almacén
    cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
    orden = "mkdir -p ~/%s && cat > ~/%s/%s" % (RUTA_RELEVO_MAGGABOX, RUTA_RELEVO_MAGGABOX, nombre)
    r = subprocess.run(S.SSH_BASE + ["sh", "-c", orden], input=cuerpo, capture_output=True, timeout=30)
    if r.returncode != 0:
        raise RuntimeError(str((r.stderr or b"ssh sin detalle").decode("utf-8", "replace"))[:160])
    return "maggabox"


def replicar(estado: Dict[str, Any], canales: Dict[str, Dict[str, Any]], olas: Dict[str, Any],
             ahora: Optional[float] = None, seco: bool = False,
             destinos: Iterable[str] = ("oracle-a1", "maggabox")) -> Dict[str, Any]:
    """Réplica de canales, olas y relevo al A1 y al Maggabox (sin secretos en el segundo)."""
    ahora = time.time() if ahora is None else ahora
    resultado: Dict[str, Any] = {"ok": True, "destinos": {}}
    for destino in destinos:
        try:
            datos = construir_replica(destino, canales, olas, estado, ahora)
            if seco:
                via = "seco"
            elif destino == "oracle-a1":
                via = _escribir_remoto_a1("relevo-medios.json", datos)
            else:
                via = _escribir_remoto_maggabox("relevo-medios.json", datos)
            resultado["destinos"][destino] = {"ok": True, "via": via, "secretos": destino != "maggabox"}
        except Exception as e:  # noqa: BLE001 — un destino caído no tumba el otro
            resultado["ok"] = False
            resultado["destinos"][destino] = {"ok": False, "motivo": "%s: %s" % (type(e).__name__, str(e)[:120])}
    return resultado


def simulacro(ahora: Optional[float] = None) -> Dict[str, Any]:
    """PURA. El ensayo documentado: la Mac calla, el A1 releva con arriendo y offset, y la Mac vuelve."""
    ahora = time.time() if ahora is None else ahora
    e = estado_inicial()
    calla = ahora - SILENCIO_MAC_S - 1
    latir(e, "mac", calla)
    latir(e, "oracle-a1", ahora)
    latir(e, "maggabox", ahora)
    for canal in CANALES:
        e["arriendos"][canal] = {"dueno": "mac", "caduca": calla + ARRIENDO_S, "version": 1, "tomado": calla}
    plan_a1, tras_a1 = plan_arriendos(e, "oracle-a1", ahora)
    anotar_offset(tras_a1, "general", 77, ahora + 5)
    vuelve = ahora + RECLAMO_MAC_S + 1
    latir(tras_a1, "mac", vuelve)
    plan_mac, tras_mac = plan_arriendos(tras_a1, "mac", vuelve)
    return {
        "mac_calla_s": SILENCIO_MAC_S,
        "a1_toma_todos_los_bots": all(d.get("soy") for d in plan_a1.values()),
        "respuesta_max_s": SILENCIO_MAC_S + MARGEN_SIMULACRO_S,
        "offset_antes_de_volver": offset_de(tras_a1, "general"),
        "mac_recupera_todos_los_bots": all(d.get("soy") for d in plan_mac.values()),
        "offset_despues_de_volver": offset_de(tras_mac, "general"),
        "canal_del_simulacro": nombre_de_canal("general"),
    }


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="orden", required=True)
    sub.add_parser("registro")
    sub.add_parser("acciones")
    p_lat = sub.add_parser("latir")
    p_lat.add_argument("--medio", default="mac")
    p_arr = sub.add_parser("arriendo")
    p_arr.add_argument("--medio", default="oracle-a1")
    p_arr.add_argument("--renovar", action="store_true")
    p_rep = sub.add_parser("replicar")
    p_rep.add_argument("--seco", action="store_true")
    p_buc = sub.add_parser("bucle")
    p_buc.add_argument("--medio", default=DESTINO_CLAVES)
    p_buc.add_argument("--intervalo", type=float, default=30.0)
    sub.add_parser("simulacro")
    a = ap.parse_args(argv)
    if a.orden == "registro":
        print(json.dumps({"registro": registro_publico(), "fallos": validar_registro(),
                          "resiliencia": verificar_resiliencia(), "claves": destinos_de_claves()},
                         ensure_ascii=False, indent=1))
    elif a.orden == "acciones":
        print("\n".join("- " + x for x in acciones_de_alex()))
    elif a.orden == "latir":
        escribir_estado(latir(leer_estado(), a.medio, time.time()))
        print("latido de %s" % a.medio)
    elif a.orden == "arriendo":
        plan, nuevo = plan_arriendos(leer_estado(), a.medio, time.time(), renovar=a.renovar)
        escribir_estado(nuevo)
        print(json.dumps({c: {"soy": d["soy"], "motivo": d["motivo"]} for c, d in plan.items()},
                         ensure_ascii=False, indent=1))
    elif a.orden == "replicar":
        estado = leer_estado()
        print(json.dumps(replicar(estado, cargar_canales(), leer_olas(OLAS), seco=a.seco),
                         ensure_ascii=False, indent=1))
    elif a.orden == "bucle":
        bucle(a.medio, a.intervalo)
        print("bucle detenido")
    else:
        print(json.dumps(simulacro(), ensure_ascii=False, indent=1))
    return 0



def decision_lectura(estado: Dict[str, Any], canal: str, medio: str, ahora: float) -> Dict[str, Any]:
    """PURA. Lo que consulta el que hace polling: solo el dueño vigente del arriendo lee, desde el
    offset replicado. Sin arriendo todavía, solo el líder (Mac viva, si no el A1) puede tomarlo, así
    que dos medios nunca se creen lectores a la vez."""
    a = (estado.get("arriendos") or {}).get(canal) or {}
    if arriendo_vigente(a, ahora):
        poll, motivo = a.get("dueno") == medio, "arriendo de %s" % a.get("dueno")
    else:
        lider = decidir_lider(estado, ahora)
        poll, motivo = lider == medio, "sin arriendo: líder %s" % (lider or "ninguno")
    return {"canal": canal, "poll": bool(poll), "offset": offset_de(estado, canal), "motivo": motivo}


def bucle(medio: str = DESTINO_CLAVES, intervalo: float = 30.0, destino_estado: Optional[str] = None) -> None:
    """Servicio: late, toma o renueva los arriendos y replica canales y olas cada pocos minutos."""
    ruta = destino_estado or os.environ.get("STARSEED_RELEVO_ESTADO") or _RUTA_ESTADO
    canales = cargar_canales()
    ultima = 0.0
    while True:
        ahora = time.time()
        e = latir(leer_estado(ruta), medio, ahora)
        _, e = plan_arriendos(e, medio, ahora, renovar=True)
        escribir_estado(e, ruta)
        if toca_replicar(ahora, ultima):
            # El A1 no se replica a sí mismo; la Mac manda al A1 y al Maggabox.
            destinos = ("maggabox",) if medio == DESTINO_CLAVES else ("oracle-a1", "maggabox")
            replicar(e, canales, leer_olas(OLAS), ahora, destinos=destinos)
            ultima = ahora
        time.sleep(max(5.0, float(intervalo)))


if __name__ == "__main__":
    raise SystemExit(main())
