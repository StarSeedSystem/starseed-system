# -*- coding: utf-8 -*-
"""Los directores de la Mac al día, sin que nadie pulse nada (Ola 1104 · AC).

Alex (2026-11-04): «de nuevo no se autorepara, pero si ya van muchísimas veces que te lo he pedido». Medido ese día:
director, nube, revisor, vigía, nodo-metagenesis, producción, acciones y otros servicios de launchd llevaban 5 días y
19 horas vivos, desde el 29-10: ningún arreglo de su código posterior a esa fecha corría. La supervisión lo apuntaba
cada pasada («reinicios pendientes») y esperaba a que alguien los relanzara a mano.

Cada pasada de la autocuración (como mucho cada 15 min), para los servicios de `SERVICIOS`:

1. Su guion principal (del plist) y los módulos del repo que importa directamente.
2. Si el proceso arrancó ANTES del último cambio de esos archivos, pasados `GRACIA_S` desde ese cambio (varios commits
   seguidos dan un solo reinicio), como mucho una vez cada `REINICIO_MINIMO_S` por servicio y `MAX_POR_PASADA` por
   pasada, `launchctl kickstart -k`: launchd lo relanza con el código nuevo.
3. Nunca en mitad de algo: «reconstruir» no se toca compilando, ni «produccion» publicando. El vigilante (que lleva el
   orquestador), Genesis, los túneles y la voz quedan fuera: tienen su propio camino (`orquestador_al_dia`,
   `reconstruir_mando`) o cortarlos interrumpe a una persona.

Las decisiones son PURAS (`modulos_de`, `decidir`) y están en `test_servicios_al_dia.py`.
Uso: python3 servicios_al_dia.py [--aplicar] [--json]
"""
from __future__ import annotations

import json
import os
import plistlib
import re
import subprocess
import sys
import time

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(AQUI))
AGENTES = os.path.expanduser("~/Library/LaunchAgents")
ESTADO = os.path.expanduser("~/.starseed/servicios-al-dia.json")
MANDO = os.path.join(RAIZ, "starseed_memory_root", "mando")
#: Los servicios de larga vida que se ponen al día solos (sin vigilante, mando, túneles ni voz).
#: En orden de importancia: los primeros se ponen al día antes cuando hay más que `MAX_POR_PASADA`.
SERVICIOS = ("revisor", "nube", "director", "nodo-metagenesis", "vigia", "guardia", "reconstruir", "produccion",
             "acciones", "tokens", "telegram", "cartero", "eco", "flujos", "pantalla", "laya")
GRACIA_S = 10 * 60
REINICIO_MINIMO_S = 6 * 3600
MAX_POR_PASADA = 4
_IMPORT = re.compile(r"^\s*(?:import\s+([\w, ]+)|from\s+(\w+)\s+import)", re.M)
_ARCHIVO = re.compile(r"[\"']([\w-]+\.py)[\"']")


def modulos_de(texto, existentes):
    """PURA. Los módulos del repo que un guion importa directamente (por `import x`, `from x import` o una ruta
    «x.py» en una cadena, como hacen los guiones con guion en el nombre), dentro de `existentes` (nombres sin .py)."""
    nombres = set()
    for a, b in _IMPORT.findall(texto or ""):
        for n in (a.split(",") if a else [b]):
            n = n.strip().split(" as ")[0].strip()
            if n:
                nombres.add(n)
    for archivo in _ARCHIVO.findall(texto or ""):
        nombres.add(archivo[:-3])
    return sorted(n for n in nombres if n in existentes)


def decidir(servicios, ahora, ultimos, ocupados=(), gracia_s=GRACIA_S, minimo_s=REINICIO_MINIMO_S,
            maximo=MAX_POR_PASADA):
    """PURA. `servicios`: [{"nombre", "inicio" (ts del proceso), "cambio" (ts del último cambio de su código)}].
    Devuelve ([nombres a reiniciar], [(nombre, motivo) de los que esperan])."""
    reiniciar, esperan = [], []
    for s in servicios:  # en el orden dado (el de importancia)
        nombre, inicio, cambio = s.get("nombre"), s.get("inicio"), s.get("cambio")
        if not inicio or not cambio or inicio >= cambio - 60:
            continue
        if nombre in ocupados:
            esperan.append((nombre, "está en mitad de un trabajo: espero"))
        elif ahora - cambio < gracia_s:
            esperan.append((nombre, "su código cambió hace %d min: espero por si llegan más commits" % ((ahora - cambio) // 60)))
        elif ahora - float((ultimos or {}).get(nombre) or 0) < minimo_s:
            esperan.append((nombre, "ya lo reinicié hace menos de %d h" % (minimo_s // 3600)))
        elif len(reiniciar) >= maximo:
            esperan.append((nombre, "como mucho %d reinicios por pasada: en la próxima" % maximo))
        else:
            reiniciar.append(nombre)
    return reiniciar, esperan


def _leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _guion(nombre):
    try:
        with open(os.path.join(AGENTES, "com.starseed.%s.plist" % nombre), "rb") as f:
            args = plistlib.load(f).get("ProgramArguments") or []
    except Exception:  # noqa: BLE001
        return None
    for a in args:
        for trozo in str(a).split():
            if trozo.startswith(RAIZ) and trozo.endswith(".py") and os.path.exists(trozo):
                return trozo
    return None


def _cambio(guion):
    carpeta = os.path.dirname(guion)
    existentes = {f[:-3] for f in os.listdir(carpeta) if f.endswith(".py")}
    try:
        texto = open(guion, encoding="utf-8").read()
    except OSError:
        return None
    rutas = [guion] + [os.path.join(carpeta, m + ".py") for m in modulos_de(texto, existentes)]
    return max(os.path.getmtime(r) for r in rutas if os.path.exists(r))


def _pid_e_inicio(nombre, ahora):
    try:
        salida = subprocess.run(["launchctl", "print", "gui/%d/com.starseed.%s" % (os.getuid(), nombre)],
                                capture_output=True, text=True, timeout=10).stdout
    except Exception:  # noqa: BLE001
        return None, None
    m = re.search(r"^\s*pid = (\d+)", salida, re.M)
    if not m:
        return None, None
    pid = int(m.group(1))
    try:
        etime = subprocess.run(["ps", "-o", "etime=", "-p", str(pid)], capture_output=True, text=True, timeout=10).stdout
    except Exception:  # noqa: BLE001
        return pid, None
    sys.path.insert(0, AQUI)
    import orquestador_al_dia as OD

    seg = OD.minutos_de_etime(etime)
    return pid, (ahora - seg) if seg is not None else None


def _ocupados():
    """Los que no se tocan ahora: reconstruir compilando y producción publicando."""
    ocupados = set()
    rec = _leer_json(os.path.join(MANDO, "reconstruccion.json"), {}) or {}
    if str(rec.get("estado") or "").startswith("compil"):
        ocupados.add("reconstruir")
    pub = _leer_json(os.path.join(MANDO, "publicacion-estado.json"), {}) or {}
    if pub.get("estado") == "corriendo":
        ocupados.add("produccion")
    return ocupados


def revisar(aplicar=True, ahora=None):
    """Una pasada: {"hechos": [...], "reiniciados": [...], "esperan": [...]}. Nunca lanza."""
    ahora = time.time() if ahora is None else ahora
    estado = _leer_json(ESTADO, {}) or {}
    servicios = []
    for nombre in SERVICIOS:
        guion = _guion(nombre)
        if not guion:
            continue
        _pid, inicio = _pid_e_inicio(nombre, ahora)
        try:
            cambio = _cambio(guion)
        except OSError:
            cambio = None
        servicios.append({"nombre": nombre, "inicio": inicio, "cambio": cambio})
    reiniciar, esperan = decidir(servicios, ahora, estado.get("ultimos") or {}, _ocupados())
    hechos = []
    for nombre in reiniciar if aplicar else []:
        r = subprocess.run(["launchctl", "kickstart", "-k", "gui/%d/com.starseed.%s" % (os.getuid(), nombre)],
                           capture_output=True, text=True, timeout=30)
        if r.returncode == 0:
            estado.setdefault("ultimos", {})[nombre] = ahora
            hechos.append("%s relanzado con el código nuevo (corría el de antes del último cambio)" % nombre)
        else:
            hechos.append("no pude relanzar %s: %s" % (nombre, (r.stderr or r.stdout or "").strip()[-160:]))
    if aplicar and reiniciar:
        try:
            os.makedirs(os.path.dirname(ESTADO), exist_ok=True)
            with open(ESTADO + ".tmp", "w", encoding="utf-8") as f:
                json.dump(estado, f, ensure_ascii=False, indent=1)
            os.replace(ESTADO + ".tmp", ESTADO)
        except OSError:
            pass
    return {"hechos": hechos, "reiniciados": reiniciar if aplicar else [], "por_reiniciar": reiniciar,
            "esperan": esperan}


if __name__ == "__main__":
    d = revisar(aplicar="--aplicar" in sys.argv)
    print(json.dumps(d, ensure_ascii=False, indent=1) if "--json" in sys.argv else
          "\n".join(d["hechos"] or ["por reiniciar: %s · esperan: %s" % (", ".join(d["por_reiniciar"]) or "ninguno",
                                                                         "; ".join("%s (%s)" % e for e in d["esperan"]) or "nadie")]))
