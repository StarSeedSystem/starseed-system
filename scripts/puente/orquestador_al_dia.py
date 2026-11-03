# -*- coding: utf-8 -*-
"""El orquestador al día, sin que nadie pulse nada (Ola 1103 · G, 2026-11-02).

Alex: «todo lo ejecutable en la terminal lo haces tú o un director de MetaGenesis, por sí mismo y en cualquier
terminal». El 02-11 el orquestador de la Mac llevaba dos días con el código del 31-10: los arreglos posteriores
(SUP0211L, SUP0111N, 1103 · C) estaban en main pero no en `~/.local/bin`, y para ponerlos hacía falta que una
persona corriera `instalar.sh` y parara el orquestador.

Cada pasada de la autocuración (como mucho cada 15 min):

1. **Instalar.** Si los `.py` de `scripts/enjambre/` difieren de los instalados y TODOS los distintos son más nuevos
   en el repo, corre `scripts/enjambre/instalar.sh` (la misma copia de siempre). Si alguno instalado es más nuevo
   (un cambio en caliente que aún no volvió al repo con `--traer`), no lo pisa: lo dice.
2. **Reiniciar en un momento seguro.** Un orquestador que arrancó ANTES de la última instalación corre código viejo.
   Pasados `GRACIA_S` desde la instalación (varios commits seguidos dan un solo reinicio) y como mucho uno cada
   `REINICIO_MINIMO_S`, recibe SIGTERM con el cerrojo del progreso tomado (`suenos.detener_orquestadores`, el mismo
   «Detener» de Genesis). El vigilante lo relanza con el código nuevo y retoma por sus puntos de control.

Las decisiones son PURAS (`diferencias`, `decidir_instalar`, `minutos_de_etime`, `decidir_reinicio`) y están en
`test_orquestador_al_dia.py`. Uso: python3 orquestador_al_dia.py [--aplicar] [--json]
"""
from __future__ import annotations

import hashlib
import json
import os
import platform
import subprocess
import sys
import time

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(AQUI))
ORIGEN = os.path.join(RAIZ, "scripts", "enjambre")
INSTALADOR = os.path.join(ORIGEN, "instalar.sh")
DESTINO = os.path.expanduser("~/bin" if platform.system() == "Linux" else "~/.local/bin")
ESTADO = os.path.expanduser("~/.starseed/orquestador-al-dia.json")
ORQUESTADOR = "starseed-enjambre.py"
#: Tras instalar, se espera esto antes de reiniciar (una tanda de commits seguidos da UN reinicio).
GRACIA_S = 10 * 60
#: Como mucho un reinicio por código nuevo cada tanto (un reinicio corta los sueños en curso y repite su trabajo).
REINICIO_MINIMO_S = 6 * 3600


def _md5(ruta):
    h = hashlib.md5()
    with open(ruta, "rb") as f:
        for trozo in iter(lambda: f.read(1 << 16), b""):
            h.update(trozo)
    return h.hexdigest()


def modulos(origen=ORIGEN):
    """Los archivos que instala `instalar.sh`: el orquestador y cada `.py` salvo pruebas y conftest."""
    try:
        nombres = sorted(os.listdir(origen))
    except OSError:
        return []
    return [n for n in nombres if n.endswith(".py") and not n.startswith("test_") and n != "conftest.py"]


def diferencias(origen=ORIGEN, destino=DESTINO, md5=_md5):
    """[(nombre, mtime_repo, mtime_instalado|None)] de lo que difiere entre el repo y lo instalado."""
    salida = []
    for n in modulos(origen):
        r, i = os.path.join(origen, n), os.path.join(destino, n)
        try:
            if os.path.exists(i) and md5(r) == md5(i):
                continue
            salida.append((n, os.path.getmtime(r), os.path.getmtime(i) if os.path.exists(i) else None))
        except OSError:
            continue
    return salida


def decidir_instalar(difs):
    """PURA. (acción, motivo) con acción ∈ nada | instalar | avisar."""
    if not difs:
        return "nada", "el orquestador instalado ya es el del repo"
    calientes = [n for n, repo, inst in difs if inst is not None and inst > repo]
    if calientes:
        return "avisar", ("%d archivo(s) instalado(s) son más nuevos que el repo (%s): cambio en caliente sin traer; "
                          "no lo piso (scripts/enjambre/instalar.sh --traer)" % (len(calientes), ", ".join(calientes[:4])))
    return "instalar", "%d archivo(s) del enjambre cambiaron en main (%s)" % (len(difs), ", ".join(n for n, _r, _i in difs[:4]))


def minutos_de_etime(texto):
    """PURA. «[[dd-]hh:]mm:ss» de `ps -o etime=` en segundos; None si no se entiende."""
    t = (texto or "").strip()
    try:
        dias, _, resto = t.rpartition("-")
        partes = [int(p) for p in resto.split(":")]
        while len(partes) < 3:
            partes.insert(0, 0)
        h, m, s = partes[-3:]
        return int(dias or 0) * 86400 + h * 3600 + m * 60 + s
    except ValueError:
        return None


def orquestadores(salida_ps, ahora):
    """PURA. [(pid, inicio_ts)] de los orquestadores en `ps -axo pid=,etime=,args=`."""
    vivos = []
    for linea in (salida_ps or "").splitlines():
        trozos = linea.split(None, 2)
        if len(trozos) < 3 or ORQUESTADOR not in trozos[2] or "orquestador_al_dia" in trozos[2]:
            continue
        seg = minutos_de_etime(trozos[1])
        if trozos[0].isdigit() and seg is not None:
            vivos.append((int(trozos[0]), ahora - seg))
    return vivos


def decidir_reinicio(vivos, instalado_ts, ahora, ultimo_reinicio=None, gracia_s=GRACIA_S, minimo_s=REINICIO_MINIMO_S):
    """PURA. ([pids], motivo): los orquestadores con código viejo que toca reiniciar ya."""
    if not instalado_ts:
        return [], "sin copia instalada que comparar"
    viejos = [pid for pid, inicio in vivos if inicio < instalado_ts - 60]
    if not viejos:
        return [], "el orquestador vivo ya corre el código instalado"
    if ahora - instalado_ts < gracia_s:
        return [], "instalado hace %d min: espero %d min por si llegan más commits" % ((ahora - instalado_ts) // 60, gracia_s // 60)
    if ultimo_reinicio and ahora - ultimo_reinicio < minimo_s:
        return [], "ya lo reinicié hace %d min (como mucho uno cada %d h)" % ((ahora - ultimo_reinicio) // 60, minimo_s // 3600)
    return viejos, "%d orquestador(es) con el código de antes de la instalación" % len(viejos)


def _leer_estado():
    try:
        with open(ESTADO, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _guardar_estado(d):
    try:
        os.makedirs(os.path.dirname(ESTADO), exist_ok=True)
        tmp = ESTADO + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=1)
        os.replace(tmp, ESTADO)
    except OSError:
        pass


def _instalar():
    r = subprocess.run(["bash", INSTALADOR], cwd=RAIZ, capture_output=True, text=True, timeout=120)
    return r.returncode == 0, (r.stderr or r.stdout or "").strip()[-200:]


def _ps():
    return subprocess.run(["ps", "-axo", "pid=,etime=,args="], capture_output=True, text=True, timeout=20).stdout


def _detener(pids):
    if AQUI not in sys.path:
        sys.path.insert(0, AQUI)
    import suenos

    return suenos.detener_orquestadores([{"pid": p} for p in pids])


def revisar(aplicar=True, ahora=None, difs_fn=diferencias, instalar_fn=_instalar, ps_fn=_ps, detener_fn=_detener,
            estado=None, guardar=_guardar_estado):
    """Una pasada: {"hechos": [...], "instalar": acción, "reinicio": [pids]}. Nunca lanza por un paso."""
    ahora = time.time() if ahora is None else ahora
    est = _leer_estado() if estado is None else estado
    hechos = []
    accion, motivo = decidir_instalar(difs_fn())
    if accion == "instalar" and aplicar:
        ok, salida = instalar_fn()
        hechos.append(("instalado: %s" % motivo) if ok else ("no pude instalar (%s): %s" % (motivo, salida)))
    elif accion == "avisar":
        hechos.append(motivo)
    try:
        instalado_ts = os.path.getmtime(os.path.join(DESTINO, ORQUESTADOR))
    except OSError:
        instalado_ts = None
    pids, porque = decidir_reinicio(orquestadores(ps_fn(), ahora), instalado_ts, ahora, est.get("ultimo_reinicio"))
    if pids and aplicar:
        r = detener_fn(pids) or {}
        est["ultimo_reinicio"] = ahora
        guardar(est)
        hechos.append("reinicio seguro (SIGTERM con el cerrojo del progreso; el vigilante lo relanza con el código nuevo): "
                      "pid %s · %s%s" % (", ".join(str(p) for p in r.get("enviados") or pids), porque,
                                         " · siguen vivos: %s" % r["siguen"] if r.get("siguen") else ""))
    return {"hechos": hechos, "instalar": accion, "motivo_instalar": motivo, "reinicio": pids, "motivo_reinicio": porque}


if __name__ == "__main__":
    d = revisar(aplicar="--aplicar" in sys.argv)
    print(json.dumps(d, ensure_ascii=False, indent=1) if "--json" in sys.argv else
          "\n".join(d["hechos"] or ["instalar: %s · reinicio: %s" % (d["motivo_instalar"], d["motivo_reinicio"])]))
