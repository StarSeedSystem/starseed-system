"""Líder de dirección de MetaGenesis (IND1029B): arriendo `direccion.lider` en la puerta del A1.
`renovar()` lo toma con escritura condicional; `soy_lider()` solo LEE si es mío. (LID1101A) Una
neurona ahogada no toma ni renueva, y sin puerta no se declara líder en local si el A1 late.
Solo biblioteca estándar; nunca imprime fichas."""
import time

import nodo_metagenesis_logica as L
import nodo_metagenesis_medio as Nm
import puerta_datos_cliente as PDC
from lider_direccion_salud import a1_late, ahogada, leer_oracle, lider_local, medir_salud

CLASE, ID = "director", "direccion.lider"
CADUCA_S, RENOVA_S = 180, 60                     # vida del arriendo; cadencia de renovación
RECLAMA_S, ESPERA_RANGO = 45, (0, 10, 20)        # ventana de reclamo; la fila que espera cada rango


def prioridad(neurona):
    n = str(neurona or "").lower()
    return 0 if n.startswith(("a1", "oracle-a1")) else (1 if n.startswith("mac") else 2)


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def decidir(arriendo, neurona, ahora, renueva=False):
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
    try:
        return L.id_de_nodo(Nm.detectar_medio(), Nm.huella_maquina())
    except Exception:
        return "neurona"


def _puerta():
    p = PDC.Puerta.desde_entorno(rol="enjambre")
    return p if p.configurada() else None

def _leer_arriendo(puerta):
    estado, j = puerta._pedir("GET", "/v1/latidos?clase=%s&vivos_s=%d" % (CLASE, 7200))
    return next((l["datos"] for l in (j or {}).get("latidos") or [] if estado == 200
                 and isinstance(l, dict) and isinstance(l.get("datos"), dict) and l.get("id") == ID), None)


def _base(neurona, ahora, puerta):
    p = puerta if puerta is not None else _puerta()
    sin_puerta = p is None or not p.configurada() or not p.disponible()
    late = sin_puerta and prioridad(neurona) != 0 and a1_late(leer_oracle(), ahora)
    salud = medir_salud(genesis=sin_puerta and prioridad(neurona) == 1)
    ahogada_ = ahogada(salud.get("presion"), salud.get("swap_pct"), salud.get("genesis", True))
    return p, sin_puerta, lider_local(ahogada_, late)


def soy_lider(neurona=None, ahora=None, puerta=None):
    ahora = time.time() if ahora is None else ahora
    neurona = neurona or mismo_id()
    p, sin_puerta, (soy, motivo) = _base(neurona, ahora, puerta)
    if not soy:
        return {"soy": False, "motivo": motivo, "arriendo": None}
    if sin_puerta:
        return {"soy": True, "motivo": motivo, "arriendo": None}
    a = _leer_arriendo(p)
    d = decidir(a, neurona, ahora)
    return {"soy": bool(d.get("soy")) and not bool(d.get("actuar")), "motivo": d["motivo"], "arriendo": a}


def renovar(neurona=None, ahora=None, puerta=None):
    ahora = time.time() if ahora is None else ahora
    neurona = neurona or mismo_id()
    p, sin_puerta, (soy, motivo) = _base(neurona, ahora, puerta)
    if not soy:
        return {"soy": False, "escrito": False, "arriendo": None, "motivo": motivo}
    if sin_puerta:
        return {"soy": True, "escrito": False, "arriendo": None, "motivo": motivo}
    assert p is not None
    prev = _leer_arriendo(p)
    d = decidir(prev, neurona, ahora, renueva=True)
    for _ in range(2):
        if not d.get("actuar"):
            break
        presente = _leer_arriendo(p)
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
        de_coger = decidir(queda, neurona, ahora)
        if de_coger.get("actuar"):
            break
        return {"soy": bool(de_coger.get("soy")), "escrito": False, "arriendo": queda, "motivo": de_coger["motivo"]}
    return {"soy": bool(d.get("soy")) and not bool(d.get("actuar")), "escrito": False,
            "arriendo": prev if isinstance(prev, dict) else None, "motivo": d.get("motivo", "")}
