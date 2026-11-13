#!/usr/bin/env python3
"""Procesos de la dirección (MED1113A): los agentes de Claude que la dirección lanza, vistos en Genesis
sin pasar por el relevo del carril.

Alex: «en metagenesis no aparecen todos los procesos y agentes activos en los medidores aparecen en 0
cuando hay varios procesos activos». La única vía para que Genesis viera a un agente de la dirección era
registrarlo en el carril de Claude (`relevo_carril_claude.py`), y el carril tiene un relevo: si el latido
de Claude envejece 45 min, el enjambre gratuito se queda la tarea. Eso rehízo trabajo terminado dos
veces, así que la dirección dejó de registrar y sus agentes desaparecieron de los medidores. Ver se
quedó atado a ser relevado. Aquí se separan:

  · Ver: cada proceso tiene su ficha en `~/.starseed/direccion/procesos/<ID>.json` (id, título, modelo,
    árbol, rama, desde). Ninguna ficha se entrega al enjambre.
  · Vida MEDIDA, no declarada: la señal más reciente entre su latido, los commits de su árbol
    (`logs/HEAD` del worktree), los archivos cambiados o nuevos de su árbol y su carpeta de trabajo
    (`~/.starseed/opus1031/<ID>-informe.md`, `~/.starseed/opus1031/<id>/`). Con señal en los últimos
    VIDA_MIN minutos está «activo»; si no, «en silencio desde <hora>» (no activo y no desaparecido).
  · Terminado: por su marcador `~/.starseed/opus1031/<ID>.listo` o por `cerrar`.
  · Relevo SOLO si se abrió con `--relevable --prompt ARCHIVO`: entonces, y solo entonces, también se
    anota en el carril de Claude. Un despliegue o un arreglo del motor de llamadas no se abre así nunca.

Órdenes (una línea):
  abrir ID "título" [--modelo M] [--arbol RUTA] [--rama R] [--tipo agente] [--relevable --prompt ARCHIVO]
  latido ID [--fase "texto corto"]
  cerrar ID [--cancelar]
  estado [--json] [--todos]
  descubrir [--horas 12] [--aplicar]      Registra los árboles OPUS1106-* con actividad reciente (relleno).
  orden ID|todos "texto" --de DIRECCION-X   (ORD1113E) La dirección principal manda una orden a otra dirección.
  acuse ID ORDEN "respuesta corta"          El destinatario confirma que la leyó y qué hará.
  ordenes [--de ID] [--para ID] [--pendientes] [--json]
Las órdenes llegan con el `latido`/`abrir` de la dirección destinataria, en un bloque enmarcado.

Nunca guarda prompts, claves ni direcciones; las rutas salen con «~».
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

#: Minutos con señal para contar como activo. El mismo número vive en `src/lib/mando/procesos-direccion.ts`
#: (`VIDA_DIRECCION_MIN`) y una prueba de vitest compara los dos.
VIDA_MIN = 30
#: Cuánto se sigue enseñando un proceso terminado (para «qué acaba de terminar»).
TERMINADOS_HORAS = 12
TIPOS = ("agente", "puerta", "servicio")
_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$")
_TOPE_ARCHIVOS = 400

HOME = os.path.expanduser("~")
CARPETA = os.environ.get("STARSEED_DIRECCION_PROCESOS") or os.path.join(HOME, ".starseed", "direccion", "procesos")
TRABAJO = os.environ.get("STARSEED_DIRECCION_TRABAJO") or os.path.join(HOME, ".starseed", "opus1031")
ARBOLES = os.environ.get("STARSEED_DIRECCION_ARBOLES") or os.path.join(HOME, "Documents", "starseed-opus")
#: Órdenes entre direcciones (ORD1113E): registro de sucesos que solo se añade, junto a las fichas.
ORDENES = os.environ.get("STARSEED_DIRECCION_ORDENES") or os.path.join(HOME, ".starseed", "direccion", "ordenes")
TOPE_ORDEN = 2000
TOPE_ACUSE = 300
AQUI = os.path.dirname(os.path.abspath(__file__))


# ── puro ────────────────────────────────────────────────────────────────────────────────────────────

def id_valido(pid: str) -> bool:
    return bool(_ID.match(pid or ""))


def limpiar(texto: Any, tope: int = 160) -> str:
    """Sin rutas absolutas ni saltos de línea, recortado."""
    t = texto if isinstance(texto, str) else ""
    t = re.sub(r"(?:[A-Za-z]:\\|/(?:Users|home|tmp|var|private|mnt|opt|root)/)[^\s\"')\]]*", "[ruta]", t)
    return re.sub(r"\s+", " ", t).strip()[:tope]


def con_virgulilla(ruta: Optional[str], home: str = HOME) -> Optional[str]:
    if not ruta:
        return None
    return "~" + ruta[len(home):] if ruta.startswith(home) else "[fuera de la carpeta personal]"


def instante(valor: Any) -> Optional[float]:
    """ISO o segundos de época → segundos de época; None si no se entiende."""
    if isinstance(valor, (int, float)) and valor > 0:
        return float(valor) / 1000.0 if valor > 1e11 else float(valor)
    if isinstance(valor, str) and valor.strip():
        try:
            return datetime.fromisoformat(valor.strip().replace("Z", "+00:00")).timestamp()
        except ValueError:
            return None
    return None


def clasificar(ficha: Dict[str, Any], senales: Dict[str, Optional[float]], marcador: Optional[float],
               ahora: float, vida_min: float = VIDA_MIN) -> Dict[str, Any]:
    """PURA. El estado de un proceso a partir de lo MEDIDO.

    `senales`: {fuente: segundos de época} (latido, commits, cambios, trabajo, apertura). Lo cerrado gana:
    un cierre explícito o el marcador `.listo`. Si no, activo con alguna señal en los últimos `vida_min`
    minutos; si no, en silencio desde la última señal."""
    cerrado = instante(ficha.get("cerrado"))
    if cerrado is not None:
        cancelado = ficha.get("cierre") == "cancelado"
        return {"estado": "cancelado" if cancelado else "terminado", "cuando": cerrado, "por": "cierre explícito",
                "ultima_senal": None, "senal": None}
    if marcador is not None:
        return {"estado": "terminado", "cuando": marcador, "por": "marcador .listo", "ultima_senal": None, "senal": None}
    validas = [(t, f) for f, t in senales.items() if isinstance(t, (int, float)) and t > 0]
    if not validas:
        return {"estado": "en-silencio", "cuando": None, "por": "sin ninguna señal medida", "ultima_senal": None,
                "senal": None}
    t, fuente = max(validas)
    if ahora - t <= vida_min * 60:
        return {"estado": "activo", "cuando": None, "por": fuente, "ultima_senal": t, "senal": fuente}
    return {"estado": "en-silencio", "cuando": t, "por": fuente, "ultima_senal": t, "senal": fuente}


def visible(estado: Dict[str, Any], ahora: float, todos: bool = False) -> bool:
    """Lo terminado hace más de TERMINADOS_HORAS deja de enseñarse (salvo `--todos`)."""
    if todos or estado["estado"] in ("activo", "en-silencio"):
        return True
    return estado.get("cuando") is not None and ahora - estado["cuando"] <= TERMINADOS_HORAS * 3600


def titulo_de_informe(texto: str) -> Optional[str]:
    """PURA. «# GEN1113A · informe (…)» no dice qué se hizo; la primera línea de «Qué se hizo» sí."""
    lineas = [l.strip() for l in (texto or "").splitlines()]
    for i, l in enumerate(lineas):
        if re.match(r"^#+\s*qu[eé] se hizo", l, re.I):
            for s in lineas[i + 1:]:
                if s and not s.startswith("#"):
                    return limpiar(s.lstrip("-* "), 160) or None
    return None


def titulo_de_asunto(pid: str, asunto: str) -> Optional[str]:
    """PURA. «GEN1113A: la puerta …» → «la puerta …»; un commit de otra tarea (la base de main) no vale."""
    if not asunto.startswith(pid + ":"):
        return None
    return limpiar(asunto[len(pid) + 1:]) or None


# ── disco ───────────────────────────────────────────────────────────────────────────────────────────

def ruta_ficha(pid: str, carpeta: str = CARPETA) -> str:
    return os.path.join(carpeta, "%s.json" % pid)


def leer_ficha(pid: str, carpeta: str = CARPETA) -> Optional[Dict[str, Any]]:
    try:
        with open(ruta_ficha(pid, carpeta), encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else None
    except (OSError, ValueError):
        return None


def guardar_ficha(ficha: Dict[str, Any], carpeta: str = CARPETA) -> None:
    os.makedirs(carpeta, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=carpeta, prefix=".ficha-", suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(ficha, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta_ficha(ficha["id"], carpeta))  # atómico: Genesis nunca lee media ficha


def fichas(carpeta: str = CARPETA) -> List[Dict[str, Any]]:
    fuera = []
    try:
        nombres = sorted(os.listdir(carpeta))
    except OSError:
        return []
    for n in nombres:
        if n.endswith(".json") and not n.startswith("."):
            d = leer_ficha(n[:-5], carpeta)
            if d and id_valido(str(d.get("id") or "")):
                fuera.append(d)
    return fuera


def _mtime(ruta: str) -> Optional[float]:
    try:
        return os.stat(ruta).st_mtime
    except OSError:
        return None


def _gitdir(arbol: str) -> Optional[str]:
    punto = os.path.join(arbol, ".git")
    if os.path.isdir(punto):
        return punto
    try:
        with open(punto, encoding="utf-8") as f:
            m = re.match(r"gitdir:\s*(.+)", f.read().strip())
        return m.group(1) if m else None
    except OSError:
        return None


def senal_commits(arbol: Optional[str]) -> Optional[float]:
    """Último movimiento de la rama del árbol (commit, rebase, checkout): `logs/HEAD` de su gitdir.
    No se mira el `index`: un `git status` ajeno lo reescribe y daría por vivo a cualquiera."""
    gd = _gitdir(arbol) if arbol else None
    return _mtime(os.path.join(gd, "logs", "HEAD")) if gd else None


def senal_cambios(arbol: Optional[str]) -> Optional[float]:
    """El archivo cambiado o nuevo más reciente del árbol (sin tocar su índice: `--no-optional-locks`)."""
    if not arbol or not os.path.isdir(arbol):
        return None
    try:
        r = subprocess.run(["git", "--no-optional-locks", "-C", arbol, "status", "--porcelain", "-uall", "-z"],
                           capture_output=True, text=True, timeout=15)
    except (OSError, subprocess.SubprocessError):
        return None
    if r.returncode != 0:
        return None
    mejor = None
    for i, trozo in enumerate(t for t in r.stdout.split("\0") if len(t) > 3):
        if i >= _TOPE_ARCHIVOS:
            break
        m = _mtime(os.path.join(arbol, trozo[3:]))
        if m is not None and (mejor is None or m > mejor):
            mejor = m
    return mejor


def senal_trabajo(pid: str, trabajo: str = TRABAJO) -> Optional[float]:
    """Su informe y su carpeta de trabajo (registros de pruebas en segundo plano, borradores)."""
    candidatas = [_mtime(os.path.join(trabajo, "%s-informe.md" % pid))]
    carpeta = os.path.join(trabajo, pid.lower())
    if os.path.isdir(carpeta):
        vistos = 0
        for raiz, dirs, archivos in os.walk(carpeta):
            if raiz[len(carpeta):].count(os.sep) >= 2:
                dirs[:] = []
            for a in archivos:
                vistos += 1
                candidatas.append(_mtime(os.path.join(raiz, a)))
                if vistos > 500:
                    break
    validas = [c for c in candidatas if c]
    return max(validas) if validas else None


def medir(ficha: Dict[str, Any], ahora: float, trabajo: str = TRABAJO) -> Dict[str, Any]:
    pid = str(ficha["id"])
    marcador = _mtime(os.path.join(trabajo, "%s.listo" % pid))
    arbol = ficha.get("arbol") if isinstance(ficha.get("arbol"), str) else None
    senales: Dict[str, Optional[float]] = {}
    if instante(ficha.get("cerrado")) is None and marcador is None:
        senales = {
            "latido": instante(ficha.get("latido")),
            "apertura": instante(ficha.get("desde")),
            "commits en su árbol": senal_commits(arbol),
            "cambios en su árbol": senal_cambios(arbol),
            "su carpeta de trabajo": senal_trabajo(pid, trabajo),
        }
    e = clasificar(ficha, senales, marcador, ahora)
    return {
        "id": pid,
        "titulo": limpiar(ficha.get("titulo")) or pid,
        "modelo": limpiar(ficha.get("modelo"), 60) or "sin declarar",
        "tipo": ficha.get("tipo") if ficha.get("tipo") in TIPOS else "agente",
        "donde": con_virgulilla(arbol) or "sin árbol declarado",
        "rama": limpiar(ficha.get("rama"), 80) or None,
        "fase": limpiar(ficha.get("fase"), 80) or None,
        "desdeMs": int(instante(ficha.get("desde")) * 1000) if instante(ficha.get("desde")) else None,
        "estado": e["estado"],
        "senal": e["senal"],
        "ultimaSenalMs": int(e["ultima_senal"] * 1000) if e["ultima_senal"] else None,
        "cerradoMs": int(e["cuando"] * 1000) if e["estado"] in ("terminado", "cancelado") and e["cuando"] else None,
        "silencioDesdeMs": int(e["cuando"] * 1000) if e["estado"] == "en-silencio" and e["cuando"] else None,
        "porque": e["por"],
        "relevable": bool(ficha.get("relevable")),
    }


def estado(carpeta: str = CARPETA, trabajo: str = TRABAJO, ahora: Optional[float] = None, todos: bool = False) -> Dict[str, Any]:
    ahora = time.time() if ahora is None else ahora
    procesos = []
    for f in fichas(carpeta):
        m = medir(f, ahora, trabajo)
        e = {"estado": m["estado"], "cuando": (m["cerradoMs"] or 0) / 1000 or None}
        if visible(e, ahora, todos):
            procesos.append(m)
    orden = {"activo": 0, "en-silencio": 1, "terminado": 2, "cancelado": 3}
    procesos.sort(key=lambda p: (orden.get(p["estado"], 9), -(p["ultimaSenalMs"] or p["cerradoMs"] or 0)))
    return {"generadoMs": int(ahora * 1000), "vidaMin": VIDA_MIN, "procesos": procesos}


# ── relevo (solo si se pidió) ───────────────────────────────────────────────────────────────────────

def _carril(*args: str) -> Tuple[bool, str]:
    try:
        r = subprocess.run([sys.executable, os.path.join(AQUI, "relevo_carril_claude.py"), *args],
                           capture_output=True, text=True, timeout=60)
        return r.returncode == 0, (r.stdout or r.stderr).strip()[:300]
    except (OSError, subprocess.SubprocessError) as e:
        return False, str(e)[:300]


# ── órdenes ─────────────────────────────────────────────────────────────────────────────────────────

def _ahora_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def abrir(pid: str, titulo: str, modelo: Optional[str] = None, arbol: Optional[str] = None, rama: Optional[str] = None,
          tipo: str = "agente", relevable: bool = False, prompt: Optional[str] = None, carpeta: str = CARPETA,
          arboles: str = ARBOLES) -> Dict[str, Any]:
    if not id_valido(pid):
        raise ValueError("id inválido: letras, números, . _ - (máx. 40)")
    if relevable and not prompt:
        raise ValueError("--relevable necesita --prompt ARCHIVO: sin encargo, el enjambre no podría seguirlo")
    if arbol is None:
        candidato = os.path.join(arboles, "OPUS1106-%s" % pid)
        arbol = candidato if os.path.isdir(candidato) else None
    if arbol is not None:
        arbol = os.path.abspath(os.path.expanduser(arbol))
    previa = leer_ficha(pid, carpeta) or {}
    ficha = {
        "id": pid,
        "titulo": limpiar(titulo) or pid,
        "modelo": limpiar(modelo, 60) if modelo else previa.get("modelo") or "sin declarar",
        "tipo": tipo if tipo in TIPOS else "agente",
        "arbol": arbol,
        "rama": rama or previa.get("rama") or ("opus1106/%s" % pid if arbol and "OPUS1106-" in arbol else None),
        "desde": previa.get("desde") if previa and not previa.get("cerrado") else _ahora_iso(),
        "latido": _ahora_iso(),
        "fase": None,
        "cerrado": None,
        "cierre": None,
        "relevable": bool(relevable),
    }
    guardar_ficha(ficha, carpeta)
    if relevable and prompt:
        with open(prompt, encoding="utf-8") as f:
            encargo = f.read()
        tmp = os.path.join(tempfile.mkdtemp(prefix="direccion-relevo-"), "tarea.json")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump([{"id": pid, "titulo": ficha["titulo"], "prompt": encargo}], f, ensure_ascii=False)
        ok, msj = _carril("registrar", "--json", tmp)
        ficha["relevo"] = "anotado en el carril" if ok else "NO se pudo anotar en el carril: %s" % msj
    return ficha


def latido(pid: str, fase: Optional[str] = None, carpeta: str = CARPETA) -> Dict[str, Any]:
    ficha = leer_ficha(pid, carpeta)
    if not ficha:
        raise ValueError("%s no está abierto: usa «abrir» primero" % pid)
    ficha["latido"] = _ahora_iso()
    if fase is not None:
        ficha["fase"] = limpiar(fase, 80) or None
    guardar_ficha(ficha, carpeta)
    if ficha.get("relevable") and not ficha.get("cerrado"):
        _carril("latido")  # solo lo relevable mantiene vivo el carril
    return ficha


def cerrar(pid: str, cancelar: bool = False, carpeta: str = CARPETA) -> Dict[str, Any]:
    ficha = leer_ficha(pid, carpeta)
    if not ficha:
        raise ValueError("%s no está abierto" % pid)
    ficha["cerrado"] = _ahora_iso()
    ficha["cierre"] = "cancelado" if cancelar else "hecho"
    guardar_ficha(ficha, carpeta)
    if ficha.get("relevable"):
        _carril("cerrar", pid, *(["--cancelar"] if cancelar else []))
    return ficha


def descubrir(horas: float = 12, aplicar: bool = False, carpeta: str = CARPETA, arboles: str = ARBOLES,
              trabajo: str = TRABAJO, ahora: Optional[float] = None) -> List[Dict[str, Any]]:
    """Relleno: árboles `OPUS1106-<ID>` con señal en las últimas `horas` que no tienen ficha.
    El título sale de «Qué se hizo» de su informe o del último commit de su rama; el modelo no se sabe."""
    ahora = time.time() if ahora is None else ahora
    nuevos = []
    try:
        nombres = sorted(os.listdir(arboles))
    except OSError:
        return []
    for n in nombres:
        if not n.startswith("OPUS1106-"):
            continue
        pid = n[len("OPUS1106-"):]
        arbol = os.path.join(arboles, n)
        if not id_valido(pid) or not os.path.isdir(arbol) or leer_ficha(pid, carpeta):
            continue
        cambios, trabajo_s = senal_cambios(arbol), senal_trabajo(pid, trabajo)
        senales = [s for s in (senal_commits(arbol), cambios, trabajo_s) if s]
        if not senales or ahora - max(senales) > horas * 3600:
            continue
        titulo = None
        try:
            r = subprocess.run(["git", "--no-optional-locks", "-C", arbol, "log", "-1", "--format=%s"],
                               capture_output=True, text=True, timeout=10)
            titulo = titulo_de_asunto(pid, r.stdout.strip())
        except (OSError, subprocess.SubprocessError):
            titulo = None
        if not titulo and cambios is None and trabajo_s is None:
            # Un árbol recién creado sobre main, sin commit suyo, sin cambios y sin carpeta de trabajo: no hay
            # prueba de que nadie trabajara en él. Crearlo no es trabajar.
            continue
        if not titulo:
            try:
                with open(os.path.join(trabajo, "%s-informe.md" % pid), encoding="utf-8") as f:
                    titulo = titulo_de_informe(f.read())
            except OSError:
                pass
        ficha = {"id": pid, "titulo": titulo or "%s (sin título: registrado por el relleno)" % pid,
                 "modelo": "sin declarar", "tipo": "agente", "arbol": arbol, "rama": "opus1106/%s" % pid,
                 "desde": datetime.fromtimestamp(min(senales)).astimezone().isoformat(timespec="seconds"),
                 "latido": None, "fase": None, "cerrado": None, "cierre": None, "relevable": False,
                 "origen": "relleno"}
        if aplicar:
            guardar_ficha(ficha, carpeta)
        nuevos.append(ficha)
    return nuevos


# ── órdenes entre direcciones (ORD1113E) ────────────────────────────────────────────────────────────
# Una sesión de Claude no puede escribir en otra, pero toda dirección corre `latido <ID>` con cada orden que
# manda al Mac. Ese latido es el canal: la orden se guarda aquí y se imprime en el latido del destinatario.
# Registro `ordenes.jsonl`, solo se añade (una línea por suceso: orden, entrega, acuse), bajo un candado de
# archivo para que dos latidos a la vez no entreguen dos veces ni pierdan una orden. El texto se guarda y se
# imprime como texto: no se ejecuta ni se expande nada.

def es_direccion(pid: str) -> bool:
    return id_valido(pid) and pid.startswith("DIRECCION-")


def texto_plano(texto: Any, tope: int) -> str:
    """Texto tal cual (con saltos de línea) pero sin caracteres de control (p. ej. secuencias de terminal)."""
    t = texto if isinstance(texto, str) else ""
    t = t.replace("\r\n", "\n").replace("\r", "\n")
    t = "".join(c if (c == "\n" or c == "\t" or ord(c) >= 32 and ord(c) != 127) else " " for c in t)
    return t.strip()[:tope]


class _Candado:
    def __init__(self, carpeta: str):
        os.makedirs(carpeta, exist_ok=True)
        self.ruta = os.path.join(carpeta, ".candado")

    def __enter__(self):
        self.f = open(self.ruta, "a")
        fcntl.flock(self.f, fcntl.LOCK_EX)
        return self

    def __exit__(self, *a):
        fcntl.flock(self.f, fcntl.LOCK_UN)
        self.f.close()


def _registro(carpeta: str) -> str:
    return os.path.join(carpeta, "ordenes.jsonl")


def _leer_sucesos(carpeta: str) -> List[Dict[str, Any]]:
    fuera = []
    try:
        with open(_registro(carpeta), encoding="utf-8") as f:
            for linea in f:
                try:
                    d = json.loads(linea)
                except ValueError:
                    continue  # una línea rota no tumba el resto
                if isinstance(d, dict):
                    fuera.append(d)
    except OSError:
        pass
    return fuera


def _anadir(carpeta: str, sucesos: List[Dict[str, Any]]) -> None:
    """Una sola escritura en modo añadir (el llamador ya tiene el candado)."""
    datos = "".join(json.dumps(s, ensure_ascii=False) + "\n" for s in sucesos).encode("utf-8")
    fd = os.open(_registro(carpeta), os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o644)
    try:
        os.write(fd, datos)
        os.fsync(fd)
    finally:
        os.close(fd)


def plegar_ordenes(sucesos: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """PURA. Los sucesos → una orden por entrada con su estado: esperando, entregada o acusada."""
    por_id: Dict[str, Dict[str, Any]] = {}
    for s in sucesos:
        oid = s.get("orden")
        if s.get("tipo") == "orden" and isinstance(oid, str) and oid not in por_id:
            por_id[oid] = {"id": oid, "de": s.get("de"), "para": s.get("para"), "texto": s.get("texto") or "",
                           "cuando": s.get("cuando"), "entregada": None, "acuse": None, "respuesta": None}
        elif oid in por_id and s.get("tipo") == "entrega" and por_id[oid]["entregada"] is None:
            por_id[oid]["entregada"] = s.get("cuando")
        elif oid in por_id and s.get("tipo") == "acuse" and por_id[oid]["acuse"] is None:
            por_id[oid]["acuse"] = s.get("cuando")
            por_id[oid]["respuesta"] = s.get("respuesta") or ""
    for o in por_id.values():
        o["estado"] = "acusada" if o["acuse"] else "entregada" if o["entregada"] else "esperando"
    return list(por_id.values())


def listar_ordenes(carpeta: str = ORDENES, fichas_carpeta: str = CARPETA, de: Optional[str] = None,
                   para: Optional[str] = None, pendientes: bool = False) -> List[Dict[str, Any]]:
    """Las órdenes con su estado; `registrada` dice si el destinatario tiene ficha (Genesis lo puede mostrar)."""
    ids = {f["id"] for f in fichas(fichas_carpeta)}
    fuera = []
    for o in plegar_ordenes(_leer_sucesos(carpeta)):
        if (de and o["de"] != de) or (para and o["para"] != para) or (pendientes and o["acuse"]):
            continue
        o["registrada"] = o["para"] in ids
        fuera.append(o)
    return fuera


def lineas_estado_ordenes(carpeta: str = ORDENES, fichas_carpeta: str = CARPETA) -> List[str]:
    """Una línea por dirección con órdenes esperando o sin acuse."""
    cuenta: Dict[str, List[int]] = {}
    for o in listar_ordenes(carpeta, fichas_carpeta, pendientes=True):
        c = cuenta.setdefault(o["para"], [0, 0])
        c[0 if o["estado"] == "esperando" else 1] += 1
    return ["  órdenes %-22s %d esperando · %d entregadas sin acuse" % (k, v[0], v[1]) for k, v in sorted(cuenta.items())]


def dar_orden(destino: str, texto: str, de: str, carpeta: str = ORDENES, fichas_carpeta: str = CARPETA,
              ahora: Optional[str] = None) -> List[Dict[str, Any]]:
    """Registra la orden para una dirección o, con «todos», para cada dirección abierta (menos quien manda)."""
    if not es_direccion(de) or not leer_ficha(de, fichas_carpeta):
        raise ValueError("solo una dirección registrada puede dar órdenes: %r no es una dirección abierta "
                         "(DIRECCION-…; ábrela con «abrir»)" % de)
    if not isinstance(texto, str) or not texto.strip():
        raise ValueError("la orden no tiene texto")
    if len(texto) > TOPE_ORDEN:
        raise ValueError("la orden tiene %d caracteres; el máximo es %d" % (len(texto), TOPE_ORDEN))
    limpio = texto_plano(texto, TOPE_ORDEN)
    if destino == "todos":
        destinos = sorted(f["id"] for f in fichas(fichas_carpeta)
                          if es_direccion(f["id"]) and not f.get("cerrado") and f["id"] != de)
        if not destinos:
            raise ValueError("no hay otra dirección abierta a la que dar la orden")
    else:
        if not es_direccion(destino):
            raise ValueError("solo se dan órdenes a una dirección (DIRECCION-…) o a «todos»: %r no lo es" % destino)
        if destino == de:
            raise ValueError("una dirección no se da órdenes a sí misma")
        destinos = [destino]
    cuando = ahora or _ahora_iso()
    base = datetime.now().strftime("%m%d%H%M%S")
    sucesos = [{"tipo": "orden", "orden": "O%s-%s" % (base, uuid.uuid4().hex[:5]), "de": de, "para": d,
                "texto": limpio, "cuando": cuando} for d in destinos]
    with _Candado(carpeta):
        _anadir(carpeta, sucesos)
    return [{"id": s["orden"], "de": de, "para": s["para"], "cuando": cuando} for s in sucesos]


def entregar_ordenes(pid: str, carpeta: str = ORDENES, ahora: Optional[str] = None) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Marca como entregadas las órdenes de `pid` que no lo estaban. Devuelve (nuevas, recordatorios):
    las nuevas se imprimen enteras; las ya entregadas y sin acuse, en una línea."""
    cuando = ahora or _ahora_iso()
    with _Candado(carpeta):
        propias = [o for o in plegar_ordenes(_leer_sucesos(carpeta)) if o["para"] == pid]
        nuevas = [o for o in propias if o["estado"] == "esperando"]
        recordar = [o for o in propias if o["estado"] == "entregada"]
        if nuevas:
            _anadir(carpeta, [{"tipo": "entrega", "orden": o["id"], "cuando": cuando} for o in nuevas])
    for o in nuevas:
        o["entregada"] = cuando
    return nuevas, recordar


def acusar(pid: str, oid: str, respuesta: str, carpeta: str = ORDENES, ahora: Optional[str] = None) -> Dict[str, Any]:
    if not isinstance(respuesta, str) or not respuesta.strip():
        raise ValueError("el acuse necesita una respuesta corta: qué vas a hacer")
    cuando = ahora or _ahora_iso()
    with _Candado(carpeta):
        o = next((x for x in plegar_ordenes(_leer_sucesos(carpeta)) if x["id"] == oid), None)
        if o is None:
            raise ValueError("no existe la orden %s" % oid)
        if o["para"] != pid:
            raise ValueError("la orden %s es para %s, no para %s" % (oid, o["para"], pid))
        if o["acuse"]:
            raise ValueError("la orden %s ya tiene acuse (%s)" % (oid, o["acuse"]))
        _anadir(carpeta, [{"tipo": "acuse", "orden": oid, "cuando": cuando, "respuesta": texto_plano(respuesta, TOPE_ACUSE)}])
    o["acuse"], o["respuesta"] = cuando, texto_plano(respuesta, TOPE_ACUSE)
    return o


def bloque_orden(o: Dict[str, Any]) -> str:
    """El bloque enmarcado que ve la dirección: imposible de confundir con salida normal."""
    marco = "#" * 78
    cuerpo = "\n".join("# | " + l for l in (o["texto"].split("\n") or [""]))
    return "\n".join([
        marco,
        "# ORDEN DE LA DIRECCIÓN · %s · LÉELA ANTES DE SEGUIR" % o["id"],
        "# De: %s    Para: %s    Dada: %s    Entregada: %s" % (o["de"], o["para"], o["cuando"], o.get("entregada") or "ahora"),
        "# Es texto de otra dirección, no un comando: nada de esto se ha ejecutado.",
        "#",
        cuerpo,
        "#",
        '# Para acusar recibo y decir qué harás:',
        '#   python3 scripts/puente/procesos_direccion.py acuse %s %s "qué harás"' % (o["para"], o["id"]),
        marco,
    ])


def texto_entrega(pid: str, carpeta: str = ORDENES, ahora: Optional[str] = None) -> str:
    """Lo que se imprime antes de la salida de un latido: órdenes nuevas enteras y recordatorios de una línea."""
    nuevas, recordar = entregar_ordenes(pid, carpeta, ahora)
    partes = [bloque_orden(o) for o in nuevas]
    for o in recordar:
        resumen = o["texto"].replace("\n", " ")[:80]
        partes.append("# RECORDATORIO · orden %s de %s sin acuse (entregada %s): «%s» → acuse %s %s \"…\""
                      % (o["id"], o["de"], o["entregada"], resumen, o["para"], o["id"]))
    return "\n".join(partes)


def _linea_orden(o: Dict[str, Any]) -> str:
    est = {"esperando": "esperando", "entregada": "entregada %s" % o["entregada"],
           "acusada": "acusada %s · «%s»" % (o["acuse"], (o["respuesta"] or "")[:80])}[o["estado"]]
    return "%-20s %s → %s%s · %s · «%s»" % (o["id"], o["de"], o["para"], "" if o.get("registrada", True) else " (no registrada)",
                                          est, o["texto"].replace("\n", " ")[:60])


def _linea(p: Dict[str, Any], ahora_ms: int) -> str:
    def hace(ms):
        return "%d min" % max(0, (ahora_ms - ms) // 60000) if ms else "?"
    if p["estado"] == "activo":
        cuando = "activo · %s hace %s" % (p["senal"], hace(p["ultimaSenalMs"]))
    elif p["estado"] == "en-silencio":
        cuando = ("en silencio desde %s (hace %s, %s)" % (
            datetime.fromtimestamp(p["silencioDesdeMs"] / 1000).strftime("%H:%M"), hace(p["silencioDesdeMs"]), p["senal"])
            if p["silencioDesdeMs"] else "en silencio: sin ninguna señal medida")
    else:
        cuando = "%s hace %s (%s)" % (p["estado"], hace(p["cerradoMs"]), p["porque"])
    return "%-12s %-22s %s · %s · %s" % (p["id"], cuando[:60], p["modelo"], p["donde"], p["titulo"][:70])


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="orden", required=True)
    a = sub.add_parser("abrir")
    a.add_argument("id"); a.add_argument("titulo")
    a.add_argument("--modelo"); a.add_argument("--arbol"); a.add_argument("--rama")
    a.add_argument("--tipo", default="agente", choices=TIPOS)
    a.add_argument("--relevable", action="store_true"); a.add_argument("--prompt")
    l = sub.add_parser("latido"); l.add_argument("id"); l.add_argument("--fase")
    c = sub.add_parser("cerrar"); c.add_argument("id"); c.add_argument("--cancelar", action="store_true")
    e = sub.add_parser("estado"); e.add_argument("--json", action="store_true"); e.add_argument("--todos", action="store_true")
    d = sub.add_parser("descubrir"); d.add_argument("--horas", type=float, default=12); d.add_argument("--aplicar", action="store_true")
    o = sub.add_parser("orden"); o.add_argument("para"); o.add_argument("texto"); o.add_argument("--de", required=True)
    k = sub.add_parser("acuse"); k.add_argument("id"); k.add_argument("oid"); k.add_argument("respuesta")
    li = sub.add_parser("ordenes"); li.add_argument("--de"); li.add_argument("--para")
    li.add_argument("--pendientes", action="store_true"); li.add_argument("--json", action="store_true")
    x = p.parse_args(argv)
    if x.orden in ("abrir", "latido") and es_direccion(x.id):  # ORD1113E: las órdenes llegan antes que nada
        entrega = texto_entrega(x.id)
        if entrega:
            print(entrega + "\n")
    try:
        if x.orden == "abrir":
            f = abrir(x.id, x.titulo, x.modelo, x.arbol, x.rama, x.tipo, x.relevable, x.prompt)
            print("abierto %s · %s · %s%s" % (f["id"], f["modelo"], con_virgulilla(f["arbol"]) or "sin árbol",
                                               " · relevable: %s" % f.get("relevo") if f["relevable"] else " · no relevable"))
            try:  # PRE1113D: avisa (nunca rechaza) si el modelo pedido es más fuerte que el presupuesto de Claude
                import presupuesto_claude
                aviso = presupuesto_claude.aviso_para_modelo(f["modelo"])
                if aviso:
                    print(aviso)
            except Exception as e:  # el aviso nunca impide abrir
                print("presupuesto de Claude: no se pudo calcular (%s)" % str(e)[:80])
        elif x.orden == "latido":
            f = latido(x.id, x.fase)
            print("latido %s%s" % (f["id"], " · fase: %s" % f["fase"] if f.get("fase") else ""))
        elif x.orden == "cerrar":
            f = cerrar(x.id, x.cancelar)
            print("cerrado %s (%s)" % (f["id"], f["cierre"]))
        elif x.orden == "estado":
            r = estado(todos=x.todos)
            if x.json:
                print(json.dumps(r, ensure_ascii=False))
            else:
                n = {k: sum(1 for q in r["procesos"] if q["estado"] == k) for k in ("activo", "en-silencio", "terminado")}
                print("%d activos · %d en silencio · %d terminados (últimas %d h) · vida %d min"
                      % (n["activo"], n["en-silencio"], n["terminado"], TERMINADOS_HORAS, VIDA_MIN))
                for q in r["procesos"]:
                    print("  " + _linea(q, r["generadoMs"]))
                for l in lineas_estado_ordenes():  # ORD1113E
                    print(l)
        elif x.orden == "orden":
            for r in dar_orden(x.para, x.texto, x.de):
                print("orden %s de %s para %s: llegará con su próximo latido" % (r["id"], r["de"], r["para"]))
        elif x.orden == "acuse":
            r = acusar(x.id, x.oid, x.respuesta)
            print("acuse de %s a la orden %s (de %s): «%s»" % (x.id, r["id"], r["de"], r["respuesta"]))
        elif x.orden == "ordenes":
            lista = listar_ordenes(de=x.de, para=x.para, pendientes=x.pendientes)
            if x.json:
                print(json.dumps(lista, ensure_ascii=False))
            else:
                print("%d orden(es)" % len(lista))
                for q in lista:
                    print("  " + _linea_orden(q))
        else:
            nuevos = descubrir(x.horas, x.aplicar)
            print("%s %d árbol(es):" % ("registrados" if x.aplicar else "se registrarían (usa --aplicar)", len(nuevos)))
            for f in nuevos:
                print("  %s · %s" % (f["id"], f["titulo"][:90]))
    except ValueError as err:
        print("error: %s" % err, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
