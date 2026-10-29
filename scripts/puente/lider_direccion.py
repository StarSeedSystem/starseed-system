# -*- coding: utf-8 -*-
"""Líder de dirección de MetaGenesis (IND1029B): un arriendo `direccion.lider` en la puerta del A1
(architecture/metagenesis-autonoma.md §2-3). Vive como latido `director/direccion.lider`
(`puerta_datos_cliente`, ficha `enjambre`): `renovar()` lo toma con escritura condicional (si
coincide la versión), lo alarga o renuncia; `soy_lider()` solo LEE si el arriendo vigente es mío.
Caducidad 180 s, renovación cada 60 s, prioridad `a1` › `mac` › otras: tras caducar, un rango peor
espera su fila y un dueño de peor prioridad se reclama solo en su primer minuto; sin puerta o sin
red, líder en local, como hoy (y lo dice). Solo biblioteca estándar; nunca imprime fichas.
"""
import time

import nodo_metagenesis_logica as L
import nodo_metagenesis_medio as Nm
import puerta_datos_cliente as PDC

CLASE, ID = "director", "direccion.lider"
CADUCA_S, RENOVA_S = 180, 60                     # vida del arriendo; cadencia de renovación
RECLAMA_S, ESPERA_RANGO = 45, (0, 10, 20)        # ventana de reclamo; la fila que espera cada rango


def prioridad(neurona):
    """PURA. 0 = a1 (siempre encendido), 1 = mac, 2 = otras."""
    n = str(neurona or "").lower()
    return 0 if n.startswith(("a1", "oracle-a1")) else (1 if n.startswith("mac") else 2)


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def decidir(arriendo, neurona, ahora, renueva=False):
    """PURA. Qué toca hacer con el arriendo `direccion.lider` … {soy, actuar, nuevo, motivo}."""
    a = arriendo if isinstance(arriendo, dict) else {}
    dueno, vence = str(a.get("dueno") or ""), _num(a.get("caduca"))
    version, mi = int(_num(a.get("version"))), prioridad(neurona)
    tomar = {"soy": True, "actuar": True, "nuevo": {"dueno": neurona, "caduca": ahora + CADUCA_S,
                                                   "version": version + 1, "tomado": ahora}}
    parado = lambda soy, motivo: {"soy": soy, "actuar": False, "nuevo": None, "motivo": motivo}
    if not dueno:
        return dict(tomar, motivo="tomado: libre")
    if dueno == neurona:
        if vence > ahora and not renueva:
            return parado(True, "líder vigente")
        return dict(tomar, nuevo=dict(tomar["nuevo"], tomado=a.get("tomado")), motivo="renovada")
    if vence > ahora:
        if prioridad(dueno) > mi and ahora - _num(a.get("tomado")) <= RECLAMA_S:
            return dict(tomar, motivo="tomado: %s tiene peor prioridad" % dueno)
        return parado(False, "dueño: %s" % dueno)
    if ahora - vence < ESPERA_RANGO[min(2, mi)]:
        return parado(False, "espera su fila tras caducar")
    return dict(tomar, motivo="tomado: caducó el de %s" % dueno)


def mismo_id():
    """La identidad del nodo de MetaGenesis de esta máquina (`mac-…`, `oracle-a1-…`, …)."""
    try:
        return L.id_de_nodo(Nm.detectar_medio(), Nm.huella_maquina())
    except Exception:
        return "neurona"


def _puerta():
    """El cliente de la puerta del entorno (`rol enjambre`); None si no está configurada."""
    p = PDC.Puerta.desde_entorno(rol="enjambre")
    return p if p.configurada() else None


def _leer_arriendo(puerta):
    """El arriendo tal como está en la puerta (o None), vía el transporte de la ficha."""
    estado, j = puerta._pedir("GET", "/v1/latidos?clase=%s&vivos_s=%d" % (CLASE, 7200))
    return next((l["datos"] for l in (j or {}).get("latidos") or [] if estado == 200
                 and isinstance(l, dict) and isinstance(l.get("datos"), dict) and l.get("id") == ID), None)


def soy_lider(neurona=None, ahora=None, puerta=None):
    """Solo LEE: ¿el arriendo vigente es mío? Sin puerta o sin red: True en local, y lo dice."""
    ahora = time.time() if ahora is None else ahora
    neurona = neurona or mismo_id()
    p = puerta if puerta is not None else _puerta()
    if p is None or not p.configurada() or not p.disponible():
        return {"soy": True, "motivo": "sin puerta o sin red: líder en local", "arriendo": None}
    a = _leer_arriendo(p)
    d = decidir(a, neurona, ahora)
    return {"soy": bool(d.get("soy")) and not bool(d.get("actuar")), "motivo": d["motivo"], "arriendo": a}


def renovar(neurona=None, ahora=None, puerta=None):
    """Toma, alarga o renueva el arriendo con escritura condicional; se repite cada `RENOVA_S`."""
    ahora = time.time() if ahora is None else ahora
    neurona = neurona or mismo_id()
    p = puerta if puerta is not None else _puerta()
    if p is None or not p.configurada() or not p.disponible():
        return {"soy": True, "escrito": False, "arriendo": None, "motivo": "sin puerta o sin red: líder en local"}
    prev = _leer_arriendo(p)
    d = decidir(prev, neurona, ahora, renueva=True)  # a su propio arriendo lo alarga en cada turno
    for _ in range(2):
        if not d.get("actuar"):
            break
        presente = _leer_arriendo(p)
        # Escritura condicional: solo si la versión sigue siendo la leída; si cambió, se relee y se redecide.
        cambio = (presente is None) != (prev is None) or _num((prev or {}).get("version")) != _num((presente or {}).get("version"))
        if cambio:
            prev, d = presente, decidir(presente, neurona, ahora)
            continue
        r = p.latido(CLASE, ID, d["nuevo"], respaldo=lambda _c: None)
        if not (isinstance(r, dict) and r.get("via") == "puerta" and not r.get("error")):
            return {"soy": False, "escrito": False, "arriendo": prev, "motivo": "la puerta no lo tomó"}
        queda = _leer_arriendo(p)
        if isinstance(queda, dict) and queda.get("dueno") == neurona and _num(queda.get("caduca")) > ahora:
            return {"soy": True, "escrito": True, "arriendo": queda, "motivo": d["motivo"]}
        # Empate: otra neurona escribió después; la puerta manda y se respeta hasta que caduque.
        de_coger = decidir(queda, neurona, ahora)
        if de_coger.get("actuar"):
            break
        return {"soy": bool(de_coger.get("soy")), "escrito": False, "arriendo": queda, "motivo": de_coger["motivo"]}
    return {"soy": bool(d.get("soy")) and not bool(d.get("actuar")), "escrito": False,
            "arriendo": prev if isinstance(prev, dict) else None, "motivo": d.get("motivo", "")}
