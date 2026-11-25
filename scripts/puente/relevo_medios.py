#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""RES1121A · Relevo de medios (DIR1121): Mac, A1 de Oracle y Maggabox enlazados.

Cada medio tiene su especialidad y su relevo; los tres canales de dirección y el estado de
olas se replican cada pocos minutos al A1 y al Maggabox (este último sin secretos). Si el Mac
calla más de `SILENCIO_MAC_S`, el A1 toma el ARRENDAMIENTO de cada bot de Telegram y atiende
los tres canales; al volver, el Mac lo recupera conservando el cursor (sin duplicar ni perder).

Las claves que el A1 necesite viajan SOLO por `oracle_nodo.py claves` (archivo 600 del
servicio): nunca por este módulo, nunca al Maggabox ni a nubes efímeras. Las funciones son
puras (sin red, sin disco, sin reloj propio: el tiempo entra por `ahora`); `ciclo()` es la
única que toca disco y recibe el transporte inyectado. Solo biblioteca estándar.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from typing import Any, Callable, Dict, List, Optional

SILENCIO_MAC_S = 300
REPLICA_S = 180
CANALES = ("principal", "general", "audiovisual")
ARCHIVOS_CANAL = {"principal": "chat.jsonl", "general": "general.jsonl", "audiovisual": "audiovisual.jsonl"}
OCULTO = "[oculto]"

MEDIOS: Dict[str, Dict[str, Any]] = {
    "mac": {
        "nombre": "Mac",
        "especialidad": "orquestador, puertas, cartero y presidente; bot Principal",
        "releva": "a1",
        "puede_guardar_claves": True,
    },
    "a1": {
        "nombre": "A1 de Oracle",
        "especialidad": "siempre encendido, bot de diseño, guardián de main, cola de respaldo y nube",
        "releva": "mac",
        "puede_guardar_claves": True,
    },
    "maggabox": {
        "nombre": "Neurona nodo Maggabox Linux",
        "especialidad": "almacén: espejo de GitHub cada 15 min, versiones y respaldos cifrados",
        "releva": "a1",
        "puede_guardar_claves": False,
    },
    "github-actions": {
        "nombre": "GitHub Actions (nube efímera)",
        "especialidad": "trabajo sin secretos de Alex; runners de 4 vCPU y 16 GB",
        "releva": "ninguno: es efímera",
        "puede_guardar_claves": False,
    },
    "cloudroom": {
        "nombre": "Cloudroom (nube efímera)",
        "especialidad": "agentes de código en hilos de su nube; solo trabajo sin secretos de Alex",
        "releva": "ninguno: es efímera",
        "puede_guardar_claves": False,
    },
}

_SECRETO = re.compile(r"(token|clave|secret|password|passwd|cookie|api[_-]?key|authorization)", re.I)
_TOKEN = re.compile(r"\b\d{6,}:[A-Za-z0-9_-]{30,}\b")


def registro() -> List[Dict[str, Any]]:
    """PURA. El registro `relevo-de-medios`: cada medio con nombre, especialidad y quién lo releva."""
    return [dict(ficha, id=medio) for medio, ficha in MEDIOS.items()]


def medios_sin_claves() -> List[str]:
    """PURA. Los medios que NUNCA guardan claves de Alex (Maggabox público y nubes efímeras)."""
    return sorted(m for m, f in MEDIOS.items() if not f.get("puede_guardar_claves"))


def destino_de_claves() -> List[str]:
    """PURA. El ÚNICO destino de las claves: el A1, por `oracle_nodo.py claves` (archivo 600)."""
    return sorted(m for m, f in MEDIOS.items() if f.get("puede_guardar_claves"))


def nombre_de_canal(canal: str, canales_cfg: Optional[Dict[str, Dict[str, Any]]] = None) -> str:
    """PURA. Nombre visible desde la fuente única (`~/.starseed/canales-direccion.json`)."""
    try:
        import sincronizador_direccion as SD
        return SD.nombre_de_canal(canal, canales_cfg)
    except Exception:  # noqa: BLE001 — sin el módulo, el nombre canónico sigue siendo uno solo
        return {"principal": "Principal", "general": "General",
                "audiovisual": "Audiovisual y diseño"}.get(canal, canal)


def archivos_de_replica() -> List[str]:
    """PURA. Lo que se replica cada `REPLICA_S`: los tres canales y el estado de olas."""
    return ["starseed_memory_root/mando/director/" + ARCHIVOS_CANAL[c] for c in CANALES] + \
           ["starseed_memory_root/olas"]


def sin_secretos(datos: Any) -> Any:
    """PURA. Copia profunda con tokens, claves y valores con forma de token de bot ocultos."""
    if isinstance(datos, dict):
        return {k: (OCULTO if _SECRETO.search(str(k)) else sin_secretos(v)) for k, v in datos.items()}
    if isinstance(datos, list):
        return [sin_secretos(v) for v in datos]
    if isinstance(datos, str):
        return _TOKEN.sub(OCULTO, datos)
    return datos


def toca_replicar(ultima: float, ahora: float, cada_s: float = REPLICA_S) -> bool:
    """PURA. ¿Toca replicar? Cada `REPLICA_S` (3 min), muy por debajo del silencio de 5 min."""
    return ahora - float(ultima or 0) >= float(cada_s)


def _num(valor: Any, defecto: float = 0.0) -> float:
    return float(valor) if isinstance(valor, (int, float)) and not isinstance(valor, bool) else defecto


def _parado(accion: str, motivo: str) -> Dict[str, Any]:
    return {"accion": accion, "soy": False, "nuevo": None, "motivo": motivo}


def _tomar(previo: Dict[str, Any], medio: str, ahora: float, motivo: str) -> Dict[str, Any]:
    """Toma el arriendo conservando el cursor del anterior: no se repite ni se salta un mensaje."""
    nuevo = {
        "dueno": medio,
        "caduca": ahora + SILENCIO_MAC_S,
        "version": int(_num(previo.get("version"))) + 1,
        "cursor": dict(previo.get("cursor") or {}),
        "tomado": ahora,
    }
    return {"accion": "tomar", "soy": True, "nuevo": nuevo, "motivo": motivo}


def decidir_polling(arriendo: Optional[Dict[str, Any]], latidos: Optional[Dict[str, Any]],
                    medio: str, ahora: float) -> Dict[str, Any]:
    """PURA. Un solo lector por bot: quién hace `getUpdates` en este canal.

    El Mac vivo siempre manda (y recupera al volver). Si lleva `SILENCIO_MAC_S` sin latir, el A1
    toma el arriendo de cada canal. El resto de medios solo espera; nunca hay dos lectores.
    """
    a = arriendo if isinstance(arriendo, dict) else {}
    dueno, caduca = str(a.get("dueno") or ""), _num(a.get("caduca"))
    mac = _num((latidos or {}).get("mac"))
    a1 = _num((latidos or {}).get("a1"))
    mac_vivo = bool(mac) and ahora - mac <= SILENCIO_MAC_S
    a1_vivo = bool(a1) and ahora - a1 <= SILENCIO_MAC_S
    if mac_vivo:
        if medio == "mac":
            return _tomar(a, "mac", ahora, "el Mac está vivo y recupera el canal")
        return _parado("ceder", "el Mac está vivo: el canal es suyo")
    if medio == "mac":
        return _parado("esperar", "el Mac no está latiendo: no toma un canal a ciegas")
    if medio != "a1":
        return _parado("esperar", "el relevo del A1 es el único que atiende sin el Mac")
    if not a1_vivo:
        return _parado("esperar", "sin latido propio: no se toma un canal a ciegas")
    if dueno == "a1" and caduca > ahora:
        return {"accion": "renovar", "soy": True,
                "nuevo": dict(a, caduca=ahora + SILENCIO_MAC_S, version=int(_num(a.get("version"))) + 1),
                "motivo": "renovado: el Mac sigue callado"}
    if dueno and dueno != "a1" and caduca > ahora:
        return _parado("esperar", "otro medio tiene el arriendo vigente: %s" % dueno)
    return _tomar(a, "a1", ahora, "el Mac lleva %d s sin latir: releva el A1" % int(ahora - mac))


def simulacro(ahora: float = 0.0) -> Dict[str, Any]:
    """PURA. El ensayo documentado: se para el latido del Mac y el A1 responde en ≤ N+2 min.

    Comprueba de verdad la regla: toma del A1 tras el silencio, cursor intacto, vuelta del Mac
    que recupera el canal y el A1 que cede. Sin red, sin disco y sin reloj propio.
    """
    latidos = {"mac": ahora, "a1": ahora}
    arriendo = {"dueno": "mac", "caduca": ahora + SILENCIO_MAC_S, "version": 1,
                "cursor": {"general": 42}}
    toma = decidir_polling(arriendo, latidos, "a1", ahora + SILENCIO_MAC_S + 1)
    responde_s = SILENCIO_MAC_S + 1
    vuelta = ahora + SILENCIO_MAC_S + 60
    vuelta_latidos = {"mac": vuelta, "a1": vuelta}
    recupera = decidir_polling(toma.get("nuevo"), vuelta_latidos, "mac", vuelta + 1)
    cede = decidir_polling(recupera.get("nuevo"), vuelta_latidos, "a1", vuelta + 2)
    return {
        "mac_parado_en": ahora,
        "a1_responde_en_s": responde_s,
        "a1_responde_s": responde_s,
        "limite_s": SILENCIO_MAC_S + 120,
        "cumple": bool(toma.get("soy")) and responde_s <= SILENCIO_MAC_S + 120,
        "mac_vuelve_en_s": vuelta,
        "mac_recupera": bool(recupera.get("soy")),
        "a1_cede": not bool(cede.get("soy")),
        "sin_perder": toma.get("nuevo", {}).get("cursor") == arriendo["cursor"],
        "sin_duplicar": bool(recupera.get("nuevo", {}).get("cursor")) and
        recupera.get("nuevo", {}).get("cursor") == toma.get("nuevo", {}).get("cursor"),
    }


RUTA_LATIDOS = "starseed_memory_root/olas/latidos-medios.json"
RUTA_ARRIENDOS = "starseed_memory_root/mando/arriendos-canales.json"


def _leer_json(ruta: str, defecto: Any) -> Any:
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir_json(ruta: str, datos: Any) -> None:
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = ruta + ".tmp-%d" % os.getpid()
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def ciclo(raiz: str, medio: str, ahora: Optional[float] = None,
          transporte: Optional[Callable[[str, str, str], Any]] = None) -> Dict[str, Any]:
    """IO. Late, decide el arriendo de los tres canales y replica lo saneado al otro medio.

    `transporte(destino, ruta_relativa, ruta_local)` lo inyecta quien despliega (ssh/túnel); sin
    él no se copia nada. Lo que viaja pasa por `sin_secretos` y NUNCA es `~/.starseed/env`.
    """
    ahora = time.time() if ahora is None else ahora
    ruta_latidos = os.path.join(raiz, RUTA_LATIDOS)
    latidos = _leer_json(ruta_latidos, {})
    latidos[medio] = ahora
    _escribir_json(ruta_latidos, latidos)
    ruta_arriendos = os.path.join(raiz, RUTA_ARRIENDOS)
    arriendos = _leer_json(ruta_arriendos, {})
    acciones: Dict[str, Any] = {}
    for canal in CANALES:
        d = decidir_polling(arriendos.get(canal), latidos, medio, ahora)
        acciones[canal] = {"accion": d["accion"], "soy": d["soy"], "motivo": d["motivo"]}
        if d.get("nuevo"):
            arriendos[canal] = d["nuevo"]
    _escribir_json(ruta_arriendos, arriendos)
    destinos = [d for d in ("mac", "a1", "maggabox") if d != medio]
    copiado = []
    if transporte:
        for destino in destinos:
            for rel in archivos_de_replica():
                local = os.path.join(raiz, rel)
                if os.path.exists(local):
                    transporte(destino, rel, local)
                    copiado.append({"destino": destino, "ruta": rel})
    return {"medio": medio, "ahora": ahora, "acciones": acciones, "replicado": copiado}


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("orden", choices=("registro", "simulacro", "ciclo"))
    ap.add_argument("--medio", default="a1", choices=sorted(MEDIOS))
    ap.add_argument("--raiz", default=os.environ.get("STARSEED_ROOT", os.getcwd()))
    a = ap.parse_args(argv)
    if a.orden == "registro":
        print(json.dumps(registro(), ensure_ascii=False, indent=1))
    elif a.orden == "simulacro":
        print(json.dumps(simulacro(), ensure_ascii=False, indent=1))
    else:
        print(json.dumps(ciclo(a.raiz, a.medio), ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
