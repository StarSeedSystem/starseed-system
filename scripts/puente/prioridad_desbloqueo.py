#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AUT1116B · cuando una compilación de pruebas falla o la publicación queda bloqueada, los directores abren solos la
tarea de arreglo, URGENTE, en la cola del enjambre (convención PRI01: `urgente`, `prioridad`, título «URGENTE · …»).

El 16-11 la versión de pruebas .47 cayó a la 01:00 por UNA línea de Kotlin y la autopublicación estuvo 10 h con «CI en
rojo»: nadie abrió la tarea de reparación. Aquí queda hecho, en tres capas:

  1. PURO (sin red, reloj ni disco; todo entra por argumentos): `motivo_de_bloqueo`, `tarea_de_arreglo`, `ya_pedida`,
     `errores_de_compilacion` (el parser del log del compilador), `limpiar_evidencia`, `contar_seguidas`.
  2. `pasada_desbloqueo(medios, est, ahora)`: la decisión de una pasada, con los medios inyectados (en las pruebas son
     falsos). La llama `autopublicar.py` al final de cada pasada.
  3. `MediosDesbloqueo`: los medios reales (estado del director de pruebas, log del run con `gh`, cola en `olas/`,
     chat de dirección). Solo ESCRIBE un archivo nuevo `cola-a-desbloqueo-<clave>.json` y un aviso.

Qué NUNCA hace: publicar, empujar, pedir compilaciones, parar ni reiniciar nada, ni tocar tareas en marcha (una cola nueva
solo entra en la tanda por delante de las pendientes). Qué NO arregla solo: lo que decide una persona («la decide Alex»),
un posible secreto o un veto (de Genesis o de Jev): ahí no hay tarea, solo UN aviso para Alex, una vez por clave.
"""
import hashlib
import json
import os
import re
import time

#: Cuántas pasadas seguidas con el MISMO bloqueo hacen falta antes de actuar (un bloqueo de una sola pasada se suele
#: levantar solo: el siguiente commit, el reintento).
PASADAS_MINIMAS = 2
#: Evidencia que viaja en la tarea y en el aviso.
TOPE_EVIDENCIA = 1200
#: Cuántas claves recuerda el estado de la autopublicación (la más vieja sale primero).
TOPE_HECHAS = 40
PREFIJO_COLA = "cola-a-desbloqueo-"

_ANSI = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")
# Lo que tiene FORMA de clave: sk-…, ak_…, ghp_… o 32+ caracteres hexadecimales seguidos (un hash largo, un token).
_FORMA_CLAVE = re.compile(r"\b(?:sk-[A-Za-z0-9_\-]{8,}|ak_[A-Za-z0-9_\-]{8,}|ghp_[A-Za-z0-9]{8,}|[0-9a-fA-F]{32,})\b")
_MARCA_TIEMPO = re.compile(r"^\s*\d{4}-\d{2}-\d{2}T[\d:.]+Z\s?")
_PREFIJO_RUNNER = re.compile(r"^.*?/(?:home|Users)/runner/work/[^/]+/[^/]+/")
# Prefijo de log de GitHub Actions: <job>\t<step>\t<fecha ISO>\t
_PREFIJO_GH_LOG = re.compile(r"^[^\t]+\t[^\t]+\t\d{4}-\d{2}-\d{2}T[\d:.]+Z\t")

#: Lo que decide una persona: ningún director lo arregla solo.
_DECIDE_PERSONA = re.compile(r"la\s+decide\s+alex|decide\s+alex|posible\s+secreto|vetad[oa]\s+desde\s+genesis|^\s*jev\s+fren", re.I)

_RE_KOTLIN = re.compile(r"^e:\s+(?:file://)?(?P<ruta>\S+?\.(?:kt|kts|java))(?::(?P<linea>\d+)(?::\d+)?)?\s+(?P<msg>.+)$")
_RE_RUST = re.compile(r"^(?:error(?:\[E\d{4}\])?:\s+.+|warning: unused.*never used)$")
_RE_RUST_DONDE = re.compile(r"^\s*-->\s+(?P<ruta>\S+?):(?P<linea>\d+)(?::\d+)?\s*$")
_RE_TSC = re.compile(r"^(?P<ruta>\S+?\.(?:tsx?|mjs|js))(?:\((?P<l1>\d+),\d+\)|:(?P<l2>\d+):\d+)(?::|\s+-)\s+error\s+TS\d+")
_RE_GRADLE = re.compile(r"^(?:\* What went wrong:|FAILURE: Build failed.*|Execution failed for task .+|> Task \S+ FAILED)$")
_RE_RUTA_EN_TEXTO = re.compile(
    r"(?:file://)?(?P<ruta>[\w@.\-/]+\.(?:kt|kts|java|rs|swift|tsx?|py|mjs|gradle))(?::(?P<linea>\d+))?")
_RE_LINEA_CULPA = re.compile(r"^(?P<ruta>[\w@.\-/]+\.(?:kt|java|rs|swift|tsx?|py|mjs))[:(](?P<linea>\d+)")


# ── limpieza ─────────────────────────────────────────────────────────────────────────────────────────────────────
def limpiar_evidencia(texto, tope=TOPE_EVIDENCIA):
    """PURA. Sin colores ANSI, sin nada con forma de clave («clave») y de ≤ `tope` caracteres (conserva el principio y,
    sobre todo, el final, que es donde los compiladores y las pruebas dicen la causa)."""
    t = _ANSI.sub("", str(texto or "")).replace("\r", "")
    t = _FORMA_CLAVE.sub("clave", t)
    t = "\n".join(l.rstrip() for l in t.splitlines()).strip()
    if len(t) <= tope:
        return t
    cabeza, cola = tope // 3, tope - tope // 3 - 5
    return (t[:cabeza].rstrip() + "\n[…]\n" + t[-cola:].lstrip())[:tope]


def _sha9(sha):
    return re.sub(r"[^0-9a-z]", "", str(sha or "").lower())[:9]


def _norm_detalle(detalle):
    """El motivo sin cifras ni espacios de más: «CI en rojo · espero…» igual en cada pasada aunque cambie un contador."""
    return re.sub(r"\d+", "#", re.sub(r"\s+", " ", str(detalle or "")).strip().lower())


def contar_seguidas(visto, fase, detalle):
    """PURA. Pasadas seguidas en `bloqueado` por el mismo motivo. `visto` = {"detalle", "n"} de la pasada anterior."""
    if fase != "bloqueado":
        return 0
    previo = visto if isinstance(visto, dict) else {}
    if previo.get("detalle") == _norm_detalle(detalle):
        return int(previo.get("n") or 0) + 1
    return 1


# ── parser del log del compilador ────────────────────────────────────────────────────────────────────────────────
def errores_de_compilacion(log, tope=8):
    """PURA. Las líneas de error del compilador en el log de un job fallido: Kotlin/Gradle (`e: …kt:189:14 …`), Rust
    (`error[E0599]: …` con su ` --> ruta:línea`), tsc (`ruta(l,c): error TS…`) y el resumen de Gradle. Sin colores ni
    marcas de tiempo, sin repetir, ≤ `tope` líneas de ≤ 300 caracteres. Vacío si el log no trae ninguna."""
    lineas = [_MARCA_TIEMPO.sub("", _PREFIJO_GH_LOG.sub("", _ANSI.sub("", l))).rstrip() for l in str(log or "").splitlines()]
    fuera, vistas = [], set()

    def meter(l):
        l = l.strip()[:300]
        if l and l not in vistas and len(fuera) < tope:
            vistas.add(l)
            fuera.append(l)

    for i, l in enumerate(lineas):
        s = l.strip()
        if _RE_KOTLIN.match(s) or _RE_TSC.match(s):
            meter(s)
        elif _RE_RUST.match(s) and not s.startswith("warning"):
            if s.startswith("error: aborting") or s.startswith("error: could not compile"):
                meter(s)
                continue
            meter(s)
            # La línea ` --> ruta:línea:col` va justo debajo (a veces tras una línea en blanco): dice DÓNDE.
            for sig in lineas[i + 1:i + 3]:
                if _RE_RUST_DONDE.match(sig):
                    meter(sig)
                    break
        elif _RE_GRADLE.match(s):
            meter(s)
            if s.startswith("* What went wrong"):
                for sig in lineas[i + 1:i + 3]:
                    if sig.strip():
                        meter(sig)
    return fuera


def archivo_de_evidencia(texto):
    """PURA. (ruta, línea) del primer archivo de código que señala la evidencia, con el prefijo del runner quitado
    (`/home/runner/work/<repo>/<repo>/native/…` → `native/…`). (None, None) si no señala ninguno."""
    t = _ANSI.sub("", str(texto or ""))
    for l in t.splitlines():
        s = l.strip()
        m = _RE_KOTLIN.match(s) or _RE_RUST_DONDE.match(s) or _RE_TSC.match(s) or _RE_LINEA_CULPA.match(s)
        if m:
            ruta = m.group("ruta")
            linea = next((m.group(g) for g in ("linea", "l1", "l2") if g in m.groupdict() and m.group(g)), None)
            return _ruta_limpia(ruta), int(linea) if linea else None
    m = _RE_RUTA_EN_TEXTO.search(t)
    if m:
        return _ruta_limpia(m.group("ruta")), int(m.group("linea")) if m.group("linea") else None
    return None, None


def _ruta_limpia(ruta):
    r = _PREFIJO_RUNNER.sub("", str(ruta or "").replace("file://", ""))
    return r.lstrip("./") if r.startswith("./") else r.lstrip("/") if r.startswith("/") else r


def resolver_en_repo(ruta, rutas_repo):
    """PURA. La ruta del repo (git ls-files) a la que corresponde la que dice el log: igual, o terminada igual, o, si es
    única, la de mismo nombre (el log de Android trae la copia generada `gen/android/…` de un `.kt` fuente). Si no hay
    lista o no hay coincidencia única, la ruta tal cual."""
    if not ruta or not rutas_repo:
        return ruta
    conjunto = [r for r in rutas_repo if isinstance(r, str)]
    if ruta in conjunto:
        return ruta
    sufijo = [r for r in conjunto if r.endswith("/" + ruta)]
    if len(sufijo) == 1:
        return sufijo[0]
    base = ruta.rsplit("/", 1)[-1]
    mismas = [r for r in conjunto if r.rsplit("/", 1)[-1] == base]
    return mismas[0] if len(mismas) == 1 else ruta


# ── el motivo ────────────────────────────────────────────────────────────────────────────────────────────────────
def _compilacion_superada(prueba, numero_fallo):
    """PURA. True si hay una compilación de número mayor en estado publicado o en marcha."""
    if not isinstance(prueba, dict):
        return False
    builds = prueba.get("builds") or prueba.get("historial") or prueba.get("ultimas")
    if not isinstance(builds, list):
        return False
    estados_superados = {"publicada", "compilando", "en_marcha"}
    for b in builds:
        if not isinstance(b, dict):
            continue
        n = b.get("numero")
        est = str(b.get("estado") or "").lower()
        if isinstance(n, int) and n > numero_fallo and est in estados_superados:
            return True
    return False


def motivo_de_bloqueo(prueba, publicacion, errores=None):
    """PURA. `None` o `{clase, clave, resumen, evidencia, sha, ...}`.

    · `compilacion`: el director de pruebas (`prueba` = su estado, o directamente su `en_curso`) tiene la compilación en
      `fallo` con run y sha. La evidencia son las líneas del compilador (`errores`, ya traídas por quien llama; sin ellas
      queda el job y el paso que falló).
    · `publicacion`: la autopublicación (`publicacion` = fase, detalle, sha, evidencia.texto, seguidas) lleva ≥ 2 pasadas
      seguidas `bloqueado` por el mismo motivo y tiene una salida de puerta que citar.
    · `decision`: lo anterior, pero el motivo dice que decide una persona, que hay un posible secreto o un veto.
      No produce tarea: solo un aviso para Alex.
    La clave = clase + 9 primeros caracteres del sha: sirve para no pedir nunca dos veces lo mismo."""
    ec = prueba.get("en_curso") if isinstance(prueba, dict) and "en_curso" in prueba else prueba
    if isinstance(ec, dict) and ec.get("estado") == "fallo" and _sha9(ec.get("sha")):
        num = ec.get("numero")
        if isinstance(num, int) and _compilacion_superada(prueba, num):
            return None
        fallo = ec.get("fallo") if isinstance(ec.get("fallo"), dict) else {"paso": str(ec.get("fallo") or "")}
        if "orden de lanzar" not in str(fallo.get("paso") or ""):
            lineas = errores if isinstance(errores, (list, tuple)) else str(errores or "").splitlines()
            texto = "\n".join(str(l) for l in lineas if str(l).strip())
            if not texto:      # sin líneas del compilador, lo que el director de pruebas anotó del paso (a veces un texto suelto)
                texto = str(fallo.get("detalle") or fallo.get("paso") or "") if ec.get("run_id") is None else ""
            donde = "; ".join(str(x) for x in (fallo.get("job"), fallo.get("paso")) if x)
            return {
                "clase": "compilacion", "clave": "compilacion-" + _sha9(ec.get("sha")), "sha": str(ec.get("sha")),
                "resumen": "La compilación de la versión de pruebas %s falló%s." % (
                    ("N.º %s" % ec["numero"]) if ec.get("numero") else "", (" (%s)" % donde[:160]) if donde else ""),
                "evidencia": limpiar_evidencia(texto), "run_id": ec.get("run_id"), "numero": ec.get("numero")}
    pub = publicacion if isinstance(publicacion, dict) else {}
    if pub.get("fase") != "bloqueado" or int(pub.get("seguidas") or 0) < PASADAS_MINIMAS:
        return None
    ev = pub.get("evidencia") if isinstance(pub.get("evidencia"), dict) else {}
    sha = ev.get("sha") or pub.get("sha")
    if not _sha9(sha):
        return None
    detalle = str(pub.get("detalle") or "")
    texto = limpiar_evidencia(ev.get("texto"))
    if _DECIDE_PERSONA.search(detalle) or _DECIDE_PERSONA.search(str(ev.get("motivo") or "")):
        return {"clase": "decision", "clave": "decision-" + _sha9(sha), "sha": str(sha),
                "resumen": "La publicación está parada y lo decide una persona: %s" % limpiar_evidencia(detalle, 300),
                "evidencia": ""}
    if not texto:
        return None   # sin la salida de la puerta no hay nada que citar ni archivo que nombrar: no es trabajo del enjambre
    return {"clase": "publicacion", "clave": "publicacion-" + _sha9(sha), "sha": str(sha),
            "resumen": "La publicación lleva %d pasadas seguidas bloqueada: %s" % (
                int(pub.get("seguidas") or 0), limpiar_evidencia(detalle, 200)),
            "evidencia": texto}


_REGLAS = (
    "Reglas: la arreglo MÍNIMA, la causa y nada más (una línea si basta); no toques los frenos de la publicación "
    "(scripts/puente/autopublicar.py, scripts/puente/produccion_puertas.py), ni las pruebas guardia (si una prueba guardia "
    "falla, el código es el que se corrige, nunca la prueba), ni permisos (capabilities, AndroidManifest, entitlements, "
    "RLS); sin claves ni cadenas con forma de clave; ≤ 3 archivos; no hagas push, ni pidas ni lances compilaciones ni "
    "publicaciones: eso lo hace el director. Comprueba con la prueba o el compilador del archivo que cambies y di en tu "
    "respuesta qué cambiaste y por qué.")


def tarea_de_arreglo(motivo, rutas_repo=None, ahora=None):
    """PURA. La cola de UNA tarea (`{"ola", "tareas": [...]}`) que arregla el motivo, o None si el motivo es una
    decisión (no se arregla solo). Id estable desde la clave (una letra + 8 hex), título «URGENTE · …», `urgente: true`
    (la compilación además `prioridad: 120`: va delante de la publicación), prompt en español con la evidencia."""
    if not isinstance(motivo, dict) or motivo.get("clase") not in ("compilacion", "publicacion") or not motivo.get("clave"):
        return None
    clave = str(motivo["clave"])
    tid = "A" + hashlib.sha1(clave.encode("utf-8")).hexdigest()[:8].upper()
    ruta, linea = archivo_de_evidencia(motivo.get("evidencia"))
    ruta = resolver_en_repo(ruta, rutas_repo)
    valida = bool(ruta) and ".." not in ruta and not ruta.startswith("/") and not re.search(r"\s", ruta)
    archivos = [ruta] if valida else []
    if motivo["clase"] == "compilacion":
        titulo = "URGENTE · Arreglar la compilación de pruebas%s" % ((" N.º %s" % motivo["numero"]) if motivo.get("numero") else "")
        intro = ("La compilación nativa de la versión de pruebas falló y NO hay versión nueva que probar hasta que se "
                 "arregle. Es la prioridad de la lista (sin interrumpir lo que ya corre).")
    else:
        titulo = "URGENTE · Desbloquear la publicación (%s)" % clave.split("-", 1)[-1]
        intro = ("La autopublicación lleva varias pasadas bloqueada por el mismo motivo y no sale nada a producción hasta "
                 "que la causa se corrija en el código.")
    donde = ("El archivo que señala la evidencia es `%s`%s." % (ruta, (", línea %d" % linea) if linea else "")
             if archivos else
             "La evidencia no señala un archivo del repo: búscalo por el nombre de la prueba o del símbolo que cita y "
             "dilo en tu respuesta.")
    if archivos and ruta != (archivo_de_evidencia(motivo.get("evidencia"))[0] or ruta):
        donde += " (El log nombra una copia generada; el archivo fuente del repo es ese.)"
    prompt = "\n\n".join([
        intro, motivo.get("resumen") or "", donde,
        "Evidencia (tal cual la dio el compilador o la puerta):\n" + "\n".join("> " + l for l in (motivo.get("evidencia") or "sin salida").splitlines()),
        "Pide la corrección más pequeña que haga desaparecer ESE error. " + _REGLAS])
    tarea = {"id": tid, "ola": "Ola A-desbloqueo · %s" % clave, "titulo": titulo, "archivos": archivos, "depende": [],
             "urgente": True, "clave_desbloqueo": clave, "prompt": prompt[:11000]}
    if motivo["clase"] == "compilacion":
        tarea["prioridad"] = 120
    return {"ola": "Ola A-desbloqueo · %s" % clave, "tareas": [tarea]}


def nombre_de_cola(clave):
    return "%s%s.json" % (PREFIJO_COLA, re.sub(r"[^a-z0-9-]", "", str(clave).lower()))


def ya_pedida(clave, nombres):
    """PURA. ¿Ya existe (o existió) la cola de esta clave entre `nombres` (archivos de `olas/`, con o sin ruta)?"""
    if not str(clave or "").strip():
        return False
    esperado = nombre_de_cola(clave)
    base = esperado[:-5]
    for n in nombres or []:
        n = str(n).rsplit("/", 1)[-1].lower()
        if n == esperado or n == base or n.startswith(base + ".") or str(clave).lower() in n:
            return True
    return False


def aviso_de_decision(motivo):
    """PURA. El aviso para Alex de un bloqueo que solo él decide (sin tarea)."""
    return ("Publicación parada que decides tú (no abro tarea de arreglo): %s Clave %s. Cuando lo decidas, la "
            "autopublicación sigue sola con el siguiente commit." % (motivo.get("resumen") or "", motivo.get("clave")))


def ya_arreglado(motivo, cambios):
    """PURA. ¿Ya cambió `main` el archivo que señala la evidencia desde el sha del fallo? `cambios` = rutas tocadas en main
    desde ese sha (None si el sha no es antecesor de main o no se pudo mirar: entonces NO se salta nada). Compara por ruta
    o, si el log nombra una copia generada, por nombre de archivo. → la ruta que cambió, o None."""
    if not cambios:
        return None
    ruta, _ = archivo_de_evidencia((motivo or {}).get("evidencia"))
    if not ruta:
        return None
    base = ruta.rsplit("/", 1)[-1]
    return next((c for c in cambios if c == ruta or c.endswith("/" + ruta) or c.rsplit("/", 1)[-1] == base), None)


# ── la pasada (medios inyectados) ────────────────────────────────────────────────────────────────────────────────
def pasada_desbloqueo(med, est, ahora):
    """Una decisión por pasada de la autopublicación. Devuelve el estado con `desbloqueo` actualizado:
    `visto` (cuántas pasadas seguidas con el mismo bloqueo), `hechas` (clave → qué se hizo y cuándo; JAMÁS se repite una
    clave), `ultima` (la última frase). Nunca lanza: lo que falle se anota en `error`."""
    est = dict(est or {})
    reg = dict(est.get("desbloqueo") or {})
    est["desbloqueo"] = reg
    try:
        seguidas = contar_seguidas(reg.get("visto"), est.get("fase"), est.get("detalle"))
        reg["visto"] = {"detalle": _norm_detalle(est.get("detalle")), "n": seguidas}
        pub = {"fase": est.get("fase"), "detalle": est.get("detalle"), "sha": est.get("sha"),
               "evidencia": est.get("evidencia"), "vetados": est.get("vetados"), "seguidas": seguidas}
        prueba = med.estado_pruebas()
        motivo = motivo_de_bloqueo(prueba, pub)
        if not motivo:
            reg.pop("error", None)
            return est
        hechas = dict(reg.get("hechas") or {})
        reg["hechas"] = hechas
        clave = motivo["clave"]
        if clave in hechas or ya_pedida(clave, med.nombres_colas()):
            return est
        fecha = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ahora))
        # Se anota ANTES de actuar: si algo falla a medias no se repite (una vez por clave; lo que falló queda dicho).
        hechas[clave] = {"t": fecha, "clase": motivo["clase"], "accion": "intentando"}
        if motivo["clase"] == "decision":
            med.avisar(aviso_de_decision(motivo), "aviso")
            hechas[clave].update(accion="aviso a Alex", cola=None)
            reg["ultima"] = "%s · %s: aviso a Alex (sin tarea)" % (fecha, clave)
        else:
            if motivo["clase"] == "compilacion" and motivo.get("run_id"):
                motivo = motivo_de_bloqueo(prueba, pub, errores=med.errores_de_run(motivo.get("run_id")))
            arreglado = ya_arreglado(motivo, med.cambios_desde(motivo["sha"])) if motivo and motivo["clase"] == "compilacion" else None
            if arreglado:
                hechas[clave].update(accion="nada", porque="main ya cambió %s desde el fallo" % arreglado)
                reg["ultima"] = "%s · %s: ya arreglado en main (%s); no abro tarea" % (fecha, clave, arreglado)
            elif not motivo or not motivo.get("evidencia"):
                hechas[clave].update(accion="nada", porque="el log no trae errores del compilador que citar")
                reg["ultima"] = "%s · %s: sin errores que citar; no abro tarea" % (fecha, clave)
            else:
                cola = tarea_de_arreglo(motivo, rutas_repo=med.archivos_repo())
                nombre = nombre_de_cola(clave)
                med.escribir_cola(nombre, cola)
                tarea = cola["tareas"][0]
                hechas[clave].update(accion="tarea abierta", cola=nombre, tarea=tarea["id"], archivos=tarea["archivos"])
                reg["ultima"] = "%s · %s: tarea %s en olas/%s" % (fecha, clave, tarea["id"], nombre)
                med.avisar("Dirección de desbloqueo: %s He abierto la tarea URGENTE %s en olas/%s (%s); va delante de las "
                           "pendientes sin parar las que corren. Cuando se integre y se publique, la nueva versión de "
                           "pruebas se pide con la orden «compilar» del director de pruebas." % (
                               motivo["resumen"], tarea["id"], nombre, ", ".join(tarea["archivos"]) or "archivo por localizar"),
                           "informe")
        for k in list(hechas)[:-TOPE_HECHAS]:
            hechas.pop(k, None)
        reg.pop("error", None)
    except Exception as e:  # noqa: BLE001 — el desbloqueo nunca tumba la pasada de la autopublicación
        reg["error"] = "%s: %s" % (type(e).__name__, str(e)[:160])
    return est


class MediosDesbloqueo(object):
    """Los medios reales, apoyados en los de la autopublicación (`base`: git, gh, chat)."""

    def __init__(self, base, carpeta, raiz_olas):
        self.base, self.carpeta, self.raiz_olas = base, carpeta, raiz_olas

    def estado_pruebas(self):
        try:
            with open(os.path.join(self.carpeta, "pruebas-director-estado.json"), encoding="utf-8") as f:
                d = json.load(f)
            return d if isinstance(d, dict) else {}
        except (OSError, ValueError):
            return {}

    def errores_de_run(self, run_id):
        return errores_de_compilacion(self.base.log_fallido(run_id))

    def nombres_colas(self):
        try:
            return os.listdir(self.raiz_olas)
        except OSError:
            return []

    def archivos_repo(self):
        rc, out, _ = self.base.git(["ls-files"], timeout=60)
        return out.splitlines() if rc == 0 else []

    def cambios_desde(self, sha):
        """Rutas que `main` (HEAD) cambió desde `sha`, o None si `sha` no es antecesor de main o git no responde."""
        if self.base.git(["merge-base", "--is-ancestor", sha, "HEAD"], timeout=60)[0] != 0:
            return None
        rc, out, _ = self.base.git(["diff", "--name-only", "%s..HEAD" % sha], timeout=120)
        return out.splitlines() if rc == 0 else None

    def escribir_cola(self, nombre, datos):
        os.makedirs(self.raiz_olas, exist_ok=True)
        ruta = os.path.join(self.raiz_olas, nombre)
        if os.path.exists(ruta):
            return
        tmp = "%s.tmp-%d" % (ruta, os.getpid())          # no empieza por «cola-…json»: el enjambre no lo ve a medias
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
            f.write("\n")
        os.replace(tmp, ruta)

    def avisar(self, texto, tipo):
        self.base.avisar(texto, tipo=tipo)
