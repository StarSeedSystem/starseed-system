#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Orquestador VIVO pero PARADO: se detecta y se reinicia solo (2026-10-08).

Alex (2026-10-08, 16:30): «buscar más capacidades en todos los medios no funciona, ya que hay
listas pendientes sin proceso activo… nada se está autoreparando… ya basta».

Lo que pasó: una tarea (JF2b) rompió el reparto de arriendos del orquestador y, desde que se
instaló a las 16:01, la tanda `cola-auto-1008-160157` latió «sin tareas activas» 35 minutos
con 3 tareas listas y 3 trabajadores libres. Nadie lo arregló:
  · el vigilante solo relanza cuando NO hay orquestador, y había uno (vivo, sin hacer nada);
  · el vigía de medidores vio «trabajo_sin_nadie (3)» cada 2 min y su remedio era una frase
    («el vigilante lo relanza solo en menos de 90 s»), que no era verdad;
  · «Buscar más capacidad» decía «no cabe más ahora mismo».

Aquí vive la decisión (PURA, `decidir`) y el remedio (`curar`), que usan los tres: el
vigilante en cada vuelta, el vigía cuando ve trabajo sin nadie, y el botón de capacidad.
Atasco = orquestador con edad suficiente, ninguna tarea suya en marcha según sus latidos, y
al menos una tarea de SU cola pendiente con las dependencias ya integradas. Tiene que durar
`PERSISTE_S` entre dos miradas (salvo que lo pida una persona con el botón). Remedio: TERM al
orquestador (no tiene nada en marcha: no se pierde trabajo), despertar al vigilante (que
relanza con la versión instalada) y decirlo en el Chat Director.

  python3 scripts/puente/atasco_orquestador.py            # mirar y curar si toca
  python3 scripts/puente/atasco_orquestador.py --mirar    # solo mirar
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
ESTADO = os.path.expanduser("~/.starseed/atasco-orquestador.json")

#: Un orquestador recién lanzado se orienta (instalar, poner al día, tsc por turnos).
EDAD_MIN_S = int(os.environ.get("STARSEED_ATASCO_EDAD_S", "300"))
#: Lo que tiene que durar el atasco entre dos miradas antes de actuar solo.
PERSISTE_S = int(os.environ.get("STARSEED_ATASCO_PERSISTE_S", "240"))

_PATRON = re.compile(r"^\s*(\d+)\s+(\S+)\s+([^ ]*[Pp]ython[0-9.]* +-u +.*starseed-enjambre\.py.*)$")
CERRADOS = ("commit", "hecho")


def _en_asuntos(tid, asuntos):
    patron = re.compile(r"(?:^|·\s*)%s\s*:" % re.escape(tid))
    return any(patron.search(a or "") for a in asuntos or [])


def decidir(latido_tareas, cola_tareas, progreso, asuntos=()):
    """PURA. (atascado, motivo, listas). `latido_tareas`: {id: {fase…}} del orquestador;
    `cola_tareas`: su cola; `progreso`: progreso.json; `asuntos`: asuntos de main."""
    progreso = progreso or {}
    activas = sorted(tid for tid, v in (latido_tareas or {}).items()
                     if isinstance(v, dict) and str(v.get("fase") or "").strip() not in ("", "hecho"))
    if activas:
        return False, "trabaja en %s" % ", ".join(activas[:4]), []
    listas = []
    for t in cola_tareas or []:
        tid = str((t or {}).get("id") or "")
        if not tid:
            continue
        est = (progreso.get(tid) or {}).get("estado")
        if est not in (None, "", "pendiente"):
            continue
        deps = t.get("depende") or []
        deps = [deps] if isinstance(deps, str) else deps
        if all((progreso.get(d) or {}).get("estado") in CERRADOS or _en_asuntos(d, asuntos) for d in deps):
            listas.append(tid)
    if not listas:
        return False, "su cola no tiene nada que se pueda empezar ahora", []
    return True, ("orquestador vivo sin ninguna tarea en marcha y con %d lista(s) en su cola (%s)"
                  % (len(listas), ", ".join(listas[:6]))), listas


def _segundos(etime):
    """`ps -o etime` («[[dd-]hh:]mm:ss») a segundos."""
    dias, _, resto = etime.rpartition("-")
    partes = [int(p) for p in resto.split(":")]
    while len(partes) < 3:
        partes.insert(0, 0)
    return (int(dias) if dias else 0) * 86400 + partes[0] * 3600 + partes[1] * 60 + partes[2]


def orquestadores():
    """[(pid, edad_s, ruta_cola)] de los orquestadores vivos (solo procesos python -u)."""
    try:
        salida = subprocess.run(["ps", "-axo", "pid=,etime=,args="], capture_output=True, text=True,
                                timeout=20).stdout
    except Exception:
        return []
    vivos = []
    for linea in salida.splitlines():
        m = _PATRON.match(linea)
        if not m:
            continue
        cola = next((t for t in m.group(3).split() if os.path.basename(t).startswith("cola-")
                     and t.endswith(".json")), None)
        if cola and not os.path.isabs(cola):
            cola = os.path.join(RAIZ, cola)
        try:
            edad = _segundos(m.group(2))
        except ValueError:
            edad = 0
        vivos.append((int(m.group(1)), edad, cola))
    return vivos


def _leer(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def medir():
    """Estado del (primer) orquestador vivo con la decisión aplicada."""
    vivos = orquestadores()
    if not vivos:
        return {"pid": None}
    pid, edad, cola = vivos[0]
    tareas = _leer(cola, []) if cola else []
    tareas = tareas if isinstance(tareas, list) else (tareas or {}).get("tareas", [])
    latidos = _leer(os.path.join(OLAS, "latidos-" + os.path.basename(cola or "")), {}) if cola else {}
    try:
        asuntos = subprocess.run(["git", "log", "main", "--format=%s"], cwd=RAIZ, capture_output=True,
                                 text=True, timeout=30).stdout.splitlines()
    except Exception:
        asuntos = []
    atascado, motivo, listas = decidir((latidos or {}).get("tareas") or {}, tareas,
                                       _leer(os.path.join(OLAS, "progreso.json"), {}), asuntos)
    return {"pid": pid, "edad_s": edad, "cola": os.path.basename(cola or ""), "atascado": atascado,
            "motivo": motivo, "listas": listas}


def _decir(texto):
    try:
        import director_chat
        director_chat.publicar(texto, de="director-atascos", rol="director", tipo="aviso")
    except Exception:
        pass


def _vivo(pid):
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def curar(persiste_s=PERSISTE_S, edad_min_s=EDAD_MIN_S, ahora=None, decir=_decir, matar=None, despertar=None):
    """Mira y, si el atasco se confirma, reinicia. Devuelve {accion, motivo, …}.

    accion: «sin_orquestador» | «trabajando» | «vigilando» (atasco visto, esperando a que dure)
    | «reiniciado». `matar`/`despertar` se inyectan en las pruebas."""
    ahora = time.time() if ahora is None else ahora
    m = medir()
    estado = _leer(ESTADO, {})
    if not m.get("pid"):
        return {"accion": "sin_orquestador", "motivo": "no hay orquestador vivo"}
    if not m["atascado"] or m["edad_s"] < edad_min_s:
        if estado:
            _guardar({})
        motivo = m["motivo"] if not m["atascado"] else "recién lanzado (%d s): se está orientando" % m["edad_s"]
        return {"accion": "trabajando", "motivo": motivo}
    desde = estado.get("desde") if estado.get("pid") == m["pid"] else None
    if desde is None:
        _guardar({"pid": m["pid"], "desde": ahora, "motivo": m["motivo"]})
        desde = ahora
    if ahora - float(desde) < persiste_s:
        return {"accion": "vigilando", "motivo": m["motivo"], "desde_s": int(ahora - float(desde))}
    (matar or _matar)(m["pid"])
    ok = (despertar or _despertar)()
    _guardar({"ultimo_reinicio": ahora, "pid_reiniciado": m["pid"], "motivo": m["motivo"]})
    texto = ("Reinicio el orquestador %d (%s): %s. El vigilante %s una tanda nueva ya."
             % (m["pid"], m["cola"], m["motivo"], "lanza" if ok else "lanzará en su próxima vuelta"))
    decir(texto)
    return {"accion": "reiniciado", "motivo": m["motivo"], "pid": m["pid"], "listas": m["listas"]}


def _guardar(datos):
    try:
        os.makedirs(os.path.dirname(ESTADO), exist_ok=True)
        tmp = ESTADO + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False)
        os.replace(tmp, ESTADO)
    except OSError:
        pass


def _matar(pid):
    subprocess.run(["kill", "-TERM", str(pid)], capture_output=True, timeout=10)
    for _ in range(10):
        if not _vivo(pid):
            return
        time.sleep(1)
    # Solo si sigue siendo el MISMO orquestador (un pid se puede reutilizar).
    args = subprocess.run(["ps", "-p", str(pid), "-o", "args="], capture_output=True, text=True,
                          timeout=5).stdout
    if "starseed-enjambre.py" in args:
        subprocess.run(["kill", "-KILL", str(pid)], capture_output=True, timeout=10)


def _despertar():
    try:
        import asignar_huecos
        return bool(asignar_huecos.despertar_vigilante())
    except Exception:
        return False


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if "--mirar" in argv:
        print(json.dumps(medir(), ensure_ascii=False))
        return 0
    print(json.dumps(curar(), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
