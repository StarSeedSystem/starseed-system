# -*- coding: utf-8 -*-
"""Líder de dirección de MetaGenesis (IND1029B): un arriendo `direccion.lider` en la puerta del A1
(architecture/metagenesis-autonoma.md §2-3). Vive como latido `director/direccion.lider` (ficha
`enjambre`): `renovar()` lo toma con escritura condicional (si coincide la versión), lo alarga o
renuncia; `soy_lider()` solo LEE si el arriendo vigente es mío. Caducidad 180 s, renovación cada 60 s,
prioridad `a1` › `mac` › otras: tras caducar, un rango peor espera su fila y un dueño de peor prioridad
se reclama solo en su primer minuto. AHOGADA (LID1101A): presión del núcleo ≥ 2, swap > 90 % o su
Genesis callada 10 s ⇒ ni toma ni renueva; sin puerta o sin red tampoco se declara líder en local si
el A1 latía hace menos de 10 min (se anota su vista al leer el arriendo). Solo biblioteca estándar;
nunca imprime fichas, claves ni la IP del A1.
"""
import json
import os
import re
import subprocess
import time
import urllib.request

import nodo_metagenesis_logica as L
import nodo_metagenesis_medio as Nm
import puerta_datos_cliente as PDC

CLASE, ID = "director", "direccion.lider"
CADUCA_S, RENOVA_S = 180, 60                     # vida del arriendo; cadencia de renovación
RECLAMA_S, ESPERA_RANGO = 45, (0, 10, 20)        # ventana de reclamo; la fila que espera cada rango
AHOGA = {"presion": 2, "swap_pct": 90.0, "genesis_tarda": 10.0}   # límites de la neurona ahogada
VIVE_A1_S = 600                                  # sin puerta: el A1 manda 10 min desde su último latido
MOTIVO_AHOGADA = "ahogada: no toma ni renueva el arriendo (que dirija el A1)"


def prioridad(neurona):
    """PURA. 0 = a1 (siempre encendido), 1 = mac, 2 = otras."""
    n = str(neurona or "").lower()
    return 0 if n.startswith(("a1", "oracle-a1")) else (1 if n.startswith("mac") else 2)


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def ahogada(presion=None, swap_pct=None, genesis_tarda=None):
    """PURA. ¿Viene ahogada la neurona? Presión del núcleo ≥ 2, swap > 90 % o Genesis callada > 10 s."""
    n = lambda v: float(v) if isinstance(v, (int, float)) else None
    p, s, g = n(presion), n(swap_pct), n(genesis_tarda)
    return (p is not None and p >= AHOGA["presion"]) or (s is not None and s > AHOGA["swap_pct"]) \
        or (g is not None and g > AHOGA["genesis_tarda"])


def cede_local(visto_a1, ahora, vive_s=VIVE_A1_S):
    """PURA. Sin puerta, ¿NO toca líder en local? Sí si el A1 latía (arriendo vigente) hace < 10 min."""
    try:
        return 0 < float(visto_a1) <= ahora < float(visto_a1) + vive_s
    except (TypeError, ValueError):
        return False


def ruta_visto():
    """Marca local con la última vez que un A1 tuvo el arriendo; el entorno la apunta para las pruebas."""
    return os.environ.get("STARSEED_LIDER_VISTO") or os.path.join(
        os.path.expanduser("~"), ".starseed", "lider-visto-a1.json")


def _anotar_visto(a, ahora):
    """Anota cuándo se leyó un A1 con el arriendo vigente (para no dirigir en local si sigue latiendo)."""
    try:
        if isinstance(a, dict) and prioridad(a.get("dueno")) == 0 and _num(a.get("caduca")) > ahora:
            os.makedirs(os.path.dirname(ruta_visto()), exist_ok=True)
            with open(ruta_visto(), "w", encoding="utf-8") as f:
                json.dump({"t": ahora}, f)
    except Exception:
        pass


def _visto_a1():
    """La hora anotada del A1 con el arriendo vigente (0.0 si nunca)."""
    try:
        with open(ruta_visto(), encoding="utf-8") as f:
            return float((json.load(f) or {}).get("t") or 0.0)
    except Exception:
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


def _sysctl(nombre):
    """El valor de un `sysctl` (macOS); '' si no existe el equipo ni la clave."""
    try:
        return subprocess.run(["sysctl", "-n", nombre], capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:
        return ""


def _presion():
    """El nivel de presión de memoria del kernel (macOS 1-3); None donde no se puede medir."""
    try:
        return int(_sysctl("kern.memorystatus_vm_pressure_level"))
    except ValueError:
        return None


def _swap_pct():
    """El % del swap en uso (macOS via `sysctl`, Linux via `/proc/meminfo`); None si no hay dato."""
    s = _sysctl("vm.swapusage")
    t, u = re.search(r"total\s*=\s*([\d.]+)", s), re.search(r"used\s*=\s*([\d.]+)", s)
    if t and u:
        return 100.0 * float(u.group(1)) / max(1.0, float(t.group(1)))
    try:
        with open("/proc/meminfo", encoding="utf-8") as f:
            m = f.read()
        t2, l2 = re.search(r"SwapTotal:\s+(\d+)", m), re.search(r"SwapFree:\s+(\d+)", m)
        if t2 and l2:
            total = int(t2.group(1))
            return 100.0 * (total - int(l2.group(1))) / max(1, total)
    except Exception:
        pass
    return None


def medidas(presion=None, swap_pct=None, genesis_tarda=None):
    """Las tres medidas de fondo (inyectable en las pruebas); cada una None si no se pudo medir."""
    return {"presion": presion if presion is not None else _presion(),
            "swap_pct": swap_pct if swap_pct is not None else _swap_pct(),
            "genesis_tarda": genesis_tarda if genesis_tarda is not None else _genesis_tarda()}


_GENESIS = {"t": 0.0, "tarda": 0.0}


def _genesis_tarda():
    """Los segundos que tardó el Genesis local; > 10 s si no contestó; a lo sumo se relee cada 30 s."""
    inicio = time.time()
    if inicio - _GENESIS["t"] < 30:
        return _GENESIS["tarda"]
    url = (os.environ.get("STARSEED_MANDO_URL") or "http://127.0.0.1:9002").rstrip("/") + "/genesis"
    try:
        with urllib.request.urlopen(url, timeout=int(AHOGA["genesis_tarda"])) as r:
            if r.status != 200:
                raise ValueError("estado %s" % r.status)
            _GENESIS.update(tarda=time.time() - inicio)
    except Exception:
        _GENESIS.update(tarda=AHOGA["genesis_tarda"] + 1.0)
    _GENESIS["t"] = time.time()
    return _GENESIS["tarda"]


def _sin_puerta(ahora, m):
    """Sin puerta o sin red (LID1101A): la ahogada no dirige; con el A1 latiendo hace menos de
    `VIVE_A1_S` tampoco se declara líder en local; sin eso, líder en local, como siempre."""
    if ahogada(**m):
        return {"soy": False, "motivo": MOTIVO_AHOGADA, "arriendo": None}
    desde = _visto_a1()
    if cede_local(desde, ahora):
        return {"soy": False, "motivo": "sin puerta: el A1 latía hace %d s, que siga él" % int(ahora - desde),
                "arriendo": None}
    return {"soy": True, "motivo": "sin puerta o sin red: líder en local", "arriendo": None}


def soy_lider(neurona=None, ahora=None, puerta=None, medidas_ahora=None):
    """Solo LEE: ¿el arriendo vigente es mío? Ahogada, no (LID1101A); sin puerta, según `cede_local`."""
    ahora = time.time() if ahora is None else ahora
    neurona = neurona or mismo_id()
    m = medidas_ahora or medidas()
    if ahogada(**m):  # también con la puerta sana: la ahogada retira la mano para que caduque el arriendo
        return {"soy": False, "motivo": MOTIVO_AHOGADA, "arriendo": None}
    p = puerta if puerta is not None else _puerta()
    if p is None or not p.configurada() or not p.disponible():
        return _sin_puerta(ahora, m)
    a = _leer_arriendo(p)
    _anotar_visto(a, ahora)
    d = decidir(a, neurona, ahora)
    return {"soy": bool(d.get("soy")) and not bool(d.get("actuar")), "motivo": d["motivo"], "arriendo": a}


def renovar(neurona=None, ahora=None, puerta=None, medidas_ahora=None):
    """Toma, alarga o renueva el arriendo (cada `RENOVA_S`) con escritura condicional; la ahogada, no."""
    ahora = time.time() if ahora is None else ahora
    neurona = neurona or mismo_id()
    m = medidas_ahora or medidas()
    if ahogada(**m):
        return {"soy": False, "escrito": False, "arriendo": None, "motivo": MOTIVO_AHOGADA}
    p = puerta if puerta is not None else _puerta()
    if p is None or not p.configurada() or not p.disponible():
        return dict(_sin_puerta(ahora, m), escrito=False)
    prev = _leer_arriendo(p)
    _anotar_visto(prev, ahora)
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
        _anotar_visto(queda, ahora)
        if isinstance(queda, dict) and queda.get("dueno") == neurona and _num(queda.get("caduca")) > ahora:
            return {"soy": True, "escrito": True, "arriendo": queda, "motivo": d["motivo"]}
        # Empate: otra neurona escribió después; la puerta manda y se respeta hasta que caduque.
        de_coger = decidir(queda, neurona, ahora)
        if de_coger.get("actuar"):
            break
        return {"soy": bool(de_coger.get("soy")), "escrito": False, "arriendo": queda, "motivo": de_coger["motivo"]}
    return {"soy": bool(d.get("soy")) and not bool(d.get("actuar")), "escrito": False,
            "arriendo": prev if isinstance(prev, dict) else None, "motivo": d.get("motivo", "")}
