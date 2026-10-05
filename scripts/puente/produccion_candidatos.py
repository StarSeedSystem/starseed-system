#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Candidatos de producción — §2 y puerta 1 de §3 del director de producción.

Contrato: `architecture/director-produccion.md`. Este módulo es puro: toda
entrada externa (git, disco) se inyecta. Solo la capa fina `git_log` toca el
repo de verdad, y `vetar`/`cargar_vetos` leen `~/.starseed/produccion/vetos.json`.

- `candidatos(raiz, git=…, desde=…, tareas=…)`: commits de `origin/main..main`
  con su id de tarea; los «salvavidas» se agrupan con su tarea.
- `medios_de(archivos)`: tabla de §2 como datos; lo que no casa va a «repo».
- `veredictos(tid, progreso, eventos, dir_diseno)`: revisión, verificación de
  main y nota de diseño (si no existe, «sin nota» y no bloquea).
- `vetar`/`cargar_vetos`/`elegible`: vetos con escritura atómica.
"""

import fnmatch
import json
import os
import subprocess
import tempfile

from identidad_tarea import esta_integrada, identidad_commit

# Tabla de §2: (medio, patrones fnmatch). El orden no excluye: un archivo
# puede caer en varios medios (p. ej. src/lib/mando/** → web y mando).
MEDIOS = (
    ("web", ("src/**", "public/**", "next.config.*", "package*.json", "tailwind.config.ts")),
    ("mando", ("src/app/api/mando/**", "src/lib/mando/**")),
    ("servicios", ("scripts/puente/**", "scripts/enjambre/**")),
    ("supabase", ("supabase/migrations/**",)),
    ("hermes", ("scripts/hermes/skills/**",)),
    ("nativo", ("native/**",)),
    ("repo", ("architecture/**", "memory/**", "docs/**", "*.md")),
)
MEDIO_RESERVA = "repo"

RUTA_VETOS = os.path.expanduser("~/.starseed/produccion/vetos.json")
DIR_DISENO = os.path.join("starseed_memory_root", "diseno")

UMBRAL_DISENO = 75


def medios_de(archivos):
    """Medios que toca el lote §2. Lo que no casa con ningún patrón → «repo»."""
    medios = set()
    for archivo in archivos or []:
        a = str(archivo).strip()
        if not a:
            continue
        cayos = [medio for medio, patrones in MEDIOS if any(fnmatch.fnmatch(a, p) for p in patrones)]
        medios.update(cayos or [MEDIO_RESERVA])
    return sorted(medios)


def git_log(raiz, rango):
    """`git log --format=%H%x1f%s <rango>`; devuelve [(sha, asunto)] o []."""
    rc, out = _git(raiz, ["log", "--format=%H%x1f%s", rango])
    if rc != 0 or not out.strip():
        return []
    filas = []
    for linea in out.strip().splitlines():
        sha, _, asunto = linea.partition("\x1f")
        filas.append((sha.strip(), asunto.strip()))
    return filas


def _git(raiz, args):
    """Capa fina de git: (rc, stdout). Nunca lanza."""
    try:
        p = subprocess.run(
            ["git"] + args, cwd=raiz, capture_output=True, text=True, timeout=60
        )
        return p.returncode, p.stdout
    except Exception:
        return 1, ""


def _archivos_de(raiz, sha, git=None):
    """Archivos tocados por un commit (`git show --format= --name-only`)."""
    cmd = git or _git
    rc, out = cmd(raiz, ["show", "--format=", "--name-only", sha])
    if rc != 0:
        return []
    return [l.strip() for l in out.splitlines() if l.strip()]


def candidatos(raiz, git=None, desde=None, tareas=None):
    """Candidatos de producción: commits de `<base>..main` con id de tarea.

    `git` es inyectable: `git(raiz, args) -> (rc, stdout)` (por defecto `_git`).
    `desde` permite cambiar la base (por defecto `origin/main`).
    `tareas` ({tid: tarea}) activa el filtro de `esta_integrada`: SOLO entran
    commits cuya ola+id casan con una tarea real.

    Los commits «salvavidas» (sin asunto de integración) se AGRUPAN con la
    candidata más antigua abierta hacia delante en el tiempo: no son candidatos
    sueltos.

    Cada candidato: {sha, asunto, ola, tarea, archivos, medios, salvavidas}.
    """
    base = (desde or "origin/main").strip()
    cmd = git or _git
    filas = git_log_con(raiz, "%s..main" % base, git=cmd)
    candidatas = []
    for sha, asunto in reversed(filas):  # de más viejo a más nuevo
        identidad = identidad_commit(asunto)
        archivos = _archivos_de(raiz, sha, git=cmd)
        if identidad is None:
            if candidatas:
                ultima = candidatas[-1]
                ultima["salvavidas"].append({"sha": sha, "asunto": asunto})
                fusionar = sorted(set(ultima["archivos"]) | set(archivos))
                ultima["archivos"] = fusionar
                ultima["medios"] = medios_de(fusionar)
            continue
        ola, tid = identidad
        candidatas.append(
            {
                "sha": sha,
                "asunto": asunto,
                "ola": ola,
                "tarea": tid,
                "archivos": archivos,
                "medios": medios_de(archivos),
                "salvavidas": [],
            }
        )
    if tareas:
        asuntos = [c["asunto"] for c in candidatas]
        candidatas = [
            c
            for c in candidatas
            if isinstance(tareas.get(c["tarea"]), dict)
            and esta_integrada(tareas[c["tarea"]], asuntos)
        ]
    return candidatas


def git_log_con(raiz, rango, git=None):
    """Igual que `git_log` pero con `git` inyectable."""
    cmd = git or _git
    rc, out = cmd(raiz, ["log", "--format=%H%x1f%s", rango])
    if rc != 0 or not out.strip():
        return []
    filas = []
    for linea in out.strip().splitlines():
        sha, _, asunto = linea.partition("\x1f")
        filas.append((sha.strip(), asunto.strip()))
    return filas


def _veredicto_texto(valor):
    """Normaliza un veredicto (str o dict con 'veredicto'/'resultado') o None."""
    if isinstance(valor, dict):
        valor = valor.get("veredicto") or valor.get("resultado") or ""
    if valor is None:
        return None
    return str(valor).strip().lower() or None


def veredictos(tid, progreso=None, eventos=None, dir_diseno=None, toca_interfaz=False):
    """Lo que ya filtraron los demás directores para `tid` (puerta 1 de §3).

    Todas las fuentes son inyectables y NUNCA tocan disco ni red:
    - `progreso`: dict de `olas/progreso.json` (entrada por tid).
    - `eventos`: lista de dicts de `olas/canal.jsonl`.
    - `dir_diseno`: carpeta de notas de diseño (por defecto
      `starseed_memory_root/diseno`); si no existe, «sin nota».

    Revisión: no bloqueante (o aprobada por Alex). Verificación: `verificado`
    de la tanda o la puerta propia. Diseño: solo se informa la nota; la nota
    baja la decide `elegible`. Nunca lanza: lectura rota → «sin nota».
    """
    entrada = (progreso or {}).get(tid) or {}
    revision = _revision(entrada, tid, eventos)

    verificado = entrada.get("verificado")
    det_ver = "verificado de la tarea" if verificado else ""
    if not verificado:
        for ev in eventos or []:
            if isinstance(ev, dict) and str(ev.get("tipo") or "") == "verificacion":
                res = _veredicto_texto(ev.get("veredicto") or ev.get("detalle"))
                if res in ("ok", "verde", "verificado"):
                    verificado = True
                    det_ver = "verificado de la tanda"
                    break
    verificacion = {
        "ok": bool(verificado),
        "detalle": det_ver or "sin verificación de main",
    }

    diseno = nota_diseno(tid, dir_diseno=dir_diseno, toca_interfaz=toca_interfaz)
    return {"revision": revision, "verificacion": verificacion, "diseno": diseno}


def _revision(entrada, tid, eventos):
    """Puerta de revisión: no bloqueante (o aprobada por Alex)."""
    revision = {"ok": False, "detalle": "sin veredicto de revisión"}
    if entrada.get("aprobada_por") == "alex" or entrada.get("aprobada_alex"):
        return {"ok": True, "detalle": "aprobada por Alex"}
    for ev in eventos or []:
        if not isinstance(ev, dict) or str(ev.get("tarea") or "") != str(tid):
            continue
        tipo = str(ev.get("tipo") or "")
        if tipo == "aprobada" and str(ev.get("de") or "").lower() == "alex":
            return {"ok": True, "detalle": "aprobada por Alex"}
        if tipo == "revision":
            veredicto = _veredicto_texto(ev.get("veredicto") or ev.get("detalle"))
            if veredicto in ("bloqueante", "bloqueada"):
                return {"ok": False, "detalle": "revisión bloqueante"}
            revision = {"ok": True, "detalle": "revisión no bloqueante (%s)" % (veredicto or "ok")}
            break
    else:
        rev_prog = _veredicto_texto(entrada.get("revision"))
        if rev_prog is not None:
            if rev_prog in ("bloqueante", "bloqueada"):
                revision = {"ok": False, "detalle": "revisión bloqueante"}
            else:
                revision = {"ok": True, "detalle": "revisión no bloqueante (%s)" % rev_prog}
    return revision


def nota_diseno(tid, dir_diseno=None, toca_interfaz=False):
    """Nota del director de diseño para `tid`; «sin nota» si no hay."""
    resultado = {"nota": None, "detalle": "sin nota", "toca_interfaz": bool(toca_interfaz)}
    if not toca_interfaz:
        resultado["detalle"] = "no toca interfaz"
        return resultado
    carpeta = dir_diseno if dir_diseno is not None else DIR_DISENO
    if not carpeta or not os.path.isdir(carpeta):
        return resultado
    try:
        for nombre in sorted(os.listdir(carpeta)):
            base, punto, ext = nombre.rpartition(".")
            if not punto or str(tid) not in base:
                continue
            ruta = os.path.join(carpeta, nombre)
            if ext == "json":
                with open(ruta, encoding="utf-8") as f:
                    dato = json.load(f)
                nota = dato.get("nota") if isinstance(dato, dict) else None
                if isinstance(nota, (int, float)):
                    resultado.update(nota=float(nota), detalle="nota %s" % nota)
                    return resultado
            else:
                with open(ruta, encoding="utf-8") as f:
                    for linea in f:
                        if "nota" not in linea.lower():
                            continue
                        _, _, cola = linea.partition(":")
                        try:
                            nota = float(cola.strip().split()[0].replace(",", "."))
                        except (ValueError, IndexError):
                            continue
                        resultado.update(nota=nota, detalle="nota %s" % nota)
                        return resultado
    except Exception:
        return resultado
    return resultado


def cargar_vetos(ruta=None):
    """Vetos de `~/.starseed/produccion/vetos.json` ({sha|tid: {…}}). Nunca lanza."""
    ruta = ruta or RUTA_VETOS
    try:
        with open(ruta, encoding="utf-8") as f:
            datos = json.load(f)
        return datos if isinstance(datos, dict) else {}
    except Exception:
        return {}


def vetar(clave, quien, motivo, ruta=None, ahora=None):
    """Veta un `sha` o un `tid` con motivo. Escritura ATÓMICA (tmp + replace)."""
    from datetime import datetime

    clave = str(clave or "").strip()
    if not clave:
        return False
    ruta = ruta or RUTA_VETOS
    vetos = cargar_vetos(ruta)
    vetos[clave] = {
        "quien": str(quien or "desconocido"),
        "motivo": str(motivo or ""),
        "desde": ahora or datetime.now().isoformat(timespec="seconds"),
    }
    carpeta = os.path.dirname(ruta)
    os.makedirs(carpeta, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".vetos-", dir=carpeta)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(vetos, f, ensure_ascii=False, indent=2, sort_keys=True)
            f.write("\n")
        os.replace(tmp, ruta)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        return False
    return True


def veto_de(vetos, sha=None, tid=None):
    """El veto que toca a este sha o tid, o None."""
    for clave in (sha, tid):
        if clave and str(clave) in (vetos or {}):
            v = (vetos or {})[str(clave)]
            return v if isinstance(v, dict) else {"motivo": str(v)}
    return None


def elegible(c, vetos=None, umbral_diseno=UMBRAL_DISENO):
    """(bool, motivos) de la puerta 1 de §3 para una candidata `c`.

    `c` lleva `sha`, `tarea` y `veredictos` (salida de `veredictos()`).
    Motor de motivos: veto, revisión bloqueante, main sin verificar y, si
    toca interfaz, nota de diseño < `umbral_diseno` («sin nota» no bloquea).
    """
    motivos = []
    veto = veto_de(vetos, sha=c.get("sha"), tid=c.get("tarea"))
    if veto:
        motivos.append(
            "vetada por %s: %s" % (veto.get("quien", "?"), str(veto.get("motivo", ""))[:120])
        )
    v = c.get("veredictos") or {}
    if not (v.get("revision") or {}).get("ok"):
        motivos.append("revisión: %s" % (v.get("revision") or {}).get("detalle", "sin veredicto"))
    if not (v.get("verificacion") or {}).get("ok"):
        motivos.append(
            "verificación: %s" % (v.get("verificacion") or {}).get("detalle", "sin verificar")
        )
    diseno = v.get("diseno") or {}
    nota = diseno.get("nota")
    if diseno.get("toca_interfaz") and nota is not None and nota < umbral_diseno:
        motivos.append("diseño: nota %s < %s" % (nota, umbral_diseno))
    return (len(motivos) == 0, motivos)
