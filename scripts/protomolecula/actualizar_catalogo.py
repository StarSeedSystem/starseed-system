#!/usr/bin/env python3
"""Autoactualización del catálogo de la Protomolécula (solo versiones; no descarga ni instala nada).

Lee `src/lib/protomolecula/catalogo-herramientas.ts`, pregunta a cada origen cuál es la última versión
(`actualizacion.fuente`: GitHub releases/tags, npm, PyPI, Flathub; `web` se omite) y deja:

  · `config/protomolecula-versiones.json` con SOLO las diferencias (versión, fecha, licencia y sha si el
    origen la da). Si no hay diferencias no escribe nada.
  · con `--aplicar`, reescribe únicamente las líneas `actualizacion: {…}` de las herramientas que cambiaron.

Reglas: sin claves en el repo (el token de GitHub se lee por NOMBRE de variable: GITHUB_TOKEN o GH_TOKEN, solo
se manda a api.github.com y jamás se imprime ni se guarda); pausa entre llamadas; caché de 6 h en
`~/.starseed/protomolecula/versiones.json` (solo aciertos); si GitHub limita la API cae a los Atom públicos.
Uso: python3 scripts/protomolecula/actualizar_catalogo.py [--aplicar] [--solo id1,id2] [--licencias] [--sin-red]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
CATALOGO = RAIZ / "src" / "lib" / "protomolecula" / "catalogo-herramientas.ts"
SALIDA = RAIZ / "config" / "protomolecula-versiones.json"
CACHE = Path.home() / ".starseed" / "protomolecula" / "versiones.json"
HORAS_CACHE = 6
UA = "starseed-protomolecula/1.0 (+catalogo)"
TOKEN_VARS = ("GITHUB_TOKEN", "GH_TOKEN")

# ───────────────────────────── lectura del catálogo TS ─────────────────────────────
_S = r'"(?:[^"\\]|\\.)*"'
# El id y el nombre van en la misma línea (`id: "x", nombre: "X",`) o, en las entradas largas, el nombre en
# la siguiente (`pixelartistry-watertight`: 240 != 241 entradas leídas, 2026-10-20).
RE_ID = re.compile(rf"^\s+id:\s*({_S}),(?:\s*nombre:\s*({_S}))?")
RE_NOMBRE = re.compile(rf"^\s+nombre:\s*({_S})")
RE_LIC = re.compile(rf"^\s+licencia:\s*({_S}),")
RE_ACT = re.compile(
    rf"^(\s+)actualizacion:\s*\{{\s*fuente:\s*({_S}),\s*ref:\s*({_S}),\s*ultimaVersion:\s*(null|{_S}),"
    rf"\s*fechaVersion:\s*(null|{_S})(?:,\s*filtro:\s*({_S}))?\s*\}},\s*$"
)


@dataclass
class Entrada:
    id: str
    nombre: str
    licencia: str
    fuente: str
    ref: str
    version: str | None
    fecha: str | None
    filtro: str | None
    linea: int
    sangria: str


def _j(txt: str | None):
    return None if txt in (None, "null") else json.loads(txt)


def leer_catalogo(texto: str) -> list[Entrada]:
    """Saca de cada entrada su id, licencia y la línea `actualizacion`. Falla en alto si falta alguna."""
    salida: list[Entrada] = []
    actual: dict | None = None
    for n, linea in enumerate(texto.split("\n")):
        m = RE_ID.match(linea)
        if m:
            if actual is not None:
                raise ValueError(f"entrada «{actual['id']}» sin línea actualizacion")
            actual = {"id": json.loads(m.group(1)), "nombre": json.loads(m.group(2)) if m.group(2) else "", "licencia": ""}
            continue
        if actual is None:
            continue
        m = RE_NOMBRE.match(linea)
        if m and not actual["nombre"]:
            actual["nombre"] = json.loads(m.group(1))
            continue
        m = RE_LIC.match(linea)
        if m and not actual["licencia"]:
            actual["licencia"] = json.loads(m.group(1))
            continue
        m = RE_ACT.match(linea)
        if m:
            salida.append(Entrada(actual["id"], actual["nombre"], actual["licencia"], json.loads(m.group(2)), json.loads(m.group(3)),
                                  _j(m.group(4)), _j(m.group(5)), _j(m.group(6)), n, m.group(1)))
            actual = None
    if actual is not None:
        raise ValueError(f"entrada «{actual['id']}» sin línea actualizacion")
    return salida


def linea_actualizacion(e: Entrada, version: str | None, fecha: str | None) -> str:
    def v(x):
        return "null" if x is None else json.dumps(x, ensure_ascii=False)
    extra = f", filtro: {json.dumps(e.filtro, ensure_ascii=False)}" if e.filtro else ""
    return (f"{e.sangria}actualizacion: {{ fuente: {json.dumps(e.fuente)}, ref: {json.dumps(e.ref, ensure_ascii=False)}, "
            f"ultimaVersion: {v(version)}, fechaVersion: {v(fecha)}{extra} }},")


# ───────────────────────────── red (inyectable en las pruebas) ─────────────────────────────
def http_get(url: str, cabeceras: dict[str, str] | None = None, plazo: int = 30) -> tuple[int, dict[str, str], str]:
    peticion = urllib.request.Request(url, headers={"User-Agent": UA, **(cabeceras or {})})
    try:
        with urllib.request.urlopen(peticion, timeout=plazo) as r:
            cab = {k.lower(): v for k, v in r.headers.items()}
            cab["x-url-final"] = r.geturl()  # tras redirecciones: así se lee la etiqueta de `releases/latest`
            return r.status, cab, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in (e.headers or {}).items()}, ""
    except (urllib.error.URLError, TimeoutError, OSError):
        return 0, {}, ""


def _dia(iso: str | None) -> str | None:
    if not iso:
        return None
    m = re.match(r"(\d{4}-\d{2}-\d{2})", str(iso))
    return m.group(1) if m else None


def _clave_version(tag: str) -> tuple:
    return tuple(int(x) for x in re.findall(r"\d+", tag)) or (-1,)


RE_PARECE_VERSION = re.compile(r"^[A-Za-z]{0,12}[-_ ]?v?\d")


class Consultor:
    def __init__(self, get=http_get, ahora=time.time, dormir=time.sleep, pausa: float = 0.5, cache_ruta: Path | None = CACHE,
                 horas_cache: float = HORAS_CACHE, entorno=None):
        self.get, self.ahora, self.dormir, self.pausa = get, ahora, dormir, pausa
        self.cache_ruta, self.horas_cache = cache_ruta, horas_cache
        env = os.environ if entorno is None else entorno
        self._token = next((env[v] for v in TOKEN_VARS if env.get(v)), None)  # solo por NOMBRE de variable
        self.cache: dict = {}
        self.cambios_cache = False
        self.llamadas = 0
        self.api_github_limitada = False
        if cache_ruta and cache_ruta.exists():
            try:
                self.cache = json.loads(cache_ruta.read_text("utf-8"))
            except (OSError, ValueError):
                self.cache = {}

    # --- utilidades de red
    def _pedir(self, url: str, accept: str = "application/json") -> tuple[int, dict[str, str], str]:
        if self.llamadas:
            self.dormir(self.pausa)
        self.llamadas += 1
        cab = {"Accept": accept}
        if self._token and urllib.parse.urlparse(url).hostname == "api.github.com":
            cab["Authorization"] = f"Bearer {self._token}"
        return self.get(url, cab)

    def _json(self, url: str):
        st, cab, cuerpo = self._pedir(url)
        if st == 200:
            try:
                return st, cab, json.loads(cuerpo)
            except ValueError:
                return 0, cab, None
        return st, cab, None

    def _gh(self, ruta: str):
        """Llamada a la API de GitHub; si limita (403/429 o quedan 0), marca el límite y devuelve None."""
        if self.api_github_limitada:
            return 0, None
        st, cab, datos = self._json(f"https://api.github.com{ruta}")
        if st in (403, 429) or cab.get("x-ratelimit-remaining") == "0":
            self.api_github_limitada = True
        return st, datos

    # --- caché
    def _de_cache(self, clave: str):
        c = self.cache.get(clave)
        if c and self.ahora() - c["t"] < self.horas_cache * 3600:
            return c["r"]
        return None

    def _a_cache(self, clave: str, r: dict) -> None:
        self.cache[clave] = {"t": self.ahora(), "r": r}
        self.cambios_cache = True

    def guardar_cache(self) -> None:
        if not (self.cache_ruta and self.cambios_cache):
            return
        self.cache_ruta.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=self.cache_ruta.parent, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(self.cache, f, ensure_ascii=False)
        os.replace(tmp, self.cache_ruta)

    # --- orígenes
    def consultar(self, e: Entrada, con_licencia: bool = False) -> dict | None:
        """Devuelve {version, fecha, licencia?, sha?, via} o None si no se pudo. Nunca lanza por red."""
        if e.fuente == "web":
            return None
        clave = f"{e.fuente}|{e.ref}|{e.filtro or ''}|{int(con_licencia)}"
        hit = self._de_cache(clave)
        if hit is not None:
            return hit
        try:
            r = {
                "github-releases": self._github_releases, "github-tags": self._github_tags, "npm": self._npm,
                "pypi": self._pypi, "flathub": self._flathub,
            }[e.fuente](e)
        except (KeyError, TypeError, ValueError, IndexError):
            r = None
        if r and con_licencia and e.fuente.startswith("github"):
            st, datos = self._gh(f"/repos/{e.ref}/license")
            if st == 200 and isinstance(datos, dict):
                spdx = (datos.get("license") or {}).get("spdx_id")
                r["licencia"] = spdx if spdx and spdx != "NOASSERTION" else None
        if r:
            self._a_cache(clave, r)
        return r

    def _filtrar(self, tag: str, filtro: str | None) -> bool:
        return bool(re.search(filtro, tag)) if filtro else True

    def _github_releases(self, e: Entrada):
        if not e.filtro:
            st, d = self._gh(f"/repos/{e.ref}/releases/latest")
            if st == 200 and d and d.get("tag_name") and not d.get("draft"):
                return {"version": d["tag_name"], "fecha": _dia(d.get("published_at") or d.get("created_at")), "via": "api"}
        st, lista = self._gh(f"/repos/{e.ref}/releases?per_page=30")
        if st == 200 and isinstance(lista, list):
            for d in lista:
                if d.get("draft") or d.get("prerelease") or not self._filtrar(d.get("tag_name", ""), e.filtro):
                    continue
                return {"version": d["tag_name"], "fecha": _dia(d.get("published_at") or d.get("created_at")), "via": "api"}
            return self._github_tags(e) if not lista else None
        return self._atom(e, "releases")

    def _github_tags(self, e: Entrada):
        st, lista = self._gh(f"/repos/{e.ref}/tags?per_page=60")
        if st == 200 and isinstance(lista, list):
            pool = [t for t in lista if self._filtrar(t["name"], e.filtro) and (e.filtro or RE_PARECE_VERSION.match(t["name"]))]
            if not pool:
                return None
            mejor = max(pool, key=lambda t: _clave_version(t["name"]))
            fecha = None
            st2, c = self._gh(f"/repos/{e.ref}/commits/{urllib.parse.quote(mejor['commit']['sha'])}")
            if st2 == 200 and isinstance(c, dict):
                fecha = _dia(((c.get("commit") or {}).get("committer") or {}).get("date"))
            return {"version": mejor["name"], "fecha": fecha, "sha": mejor["commit"]["sha"][:7], "via": "api"}
        return self._atom(e, "tags")

    def _atom(self, e: Entrada, tipo: str):
        """Respaldo sin API. Releases: la etiqueta de `releases/latest` (que excluye las preliminares) y su fecha en el Atom
        público (10 entradas, de la más nueva a la más vieja). Tags: la primera entrada del Atom que parezca una versión."""
        tag_latest = None
        if tipo == "releases" and not e.filtro:
            st, cab, _ = self._pedir(f"https://github.com/{e.ref}/releases/latest", "text/html")
            m = re.search(r"/releases/tag/([^?#]+)$", cab.get("x-url-final", "")) if st == 200 else None
            tag_latest = urllib.parse.unquote(m.group(1)) if m else None
        st, _, cuerpo = self._pedir(f"https://github.com/{e.ref}/{tipo}.atom", "application/atom+xml")
        if st != 200:
            return {"version": tag_latest, "fecha": None, "via": "atom"} if tag_latest else None
        for m in re.finditer(r"<entry>(.*?)</entry>", cuerpo, re.S):
            enlace = re.search(r'<link[^>]*href="[^"]*/releases/tag/([^"]+)"', m.group(1))
            if not enlace:
                continue
            tag = urllib.parse.unquote(enlace.group(1))
            if tag_latest and tag != tag_latest:
                continue
            if not tag_latest and (not self._filtrar(tag, e.filtro) or (not e.filtro and tipo == "tags" and not RE_PARECE_VERSION.match(tag))):
                continue
            f = re.search(r"<updated>(.*?)</updated>", m.group(1))
            return {"version": tag, "fecha": _dia(f.group(1) if f else None), "via": "atom"}
        return {"version": tag_latest, "fecha": None, "via": "atom"} if tag_latest else None

    def _npm(self, e: Entrada):
        q = urllib.parse.quote(e.ref, safe="@")
        st, _, d = self._json(f"https://registry.npmjs.org/{q}/latest")
        if st != 200 or not d or not d.get("version"):
            return None
        lic = d.get("license")
        lic = lic.get("type") if isinstance(lic, dict) else lic
        r = {"version": d["version"], "fecha": None, "licencia": lic if isinstance(lic, str) else None, "via": "api"}
        if d["version"] != e.version:  # el paquete entero es pesado: solo se baja si hay algo nuevo que fechar
            st2, _, doc = self._json(f"https://registry.npmjs.org/{q}")
            if st2 == 200 and isinstance(doc, dict):
                r["fecha"] = _dia((doc.get("time") or {}).get(d["version"]))
        else:
            r["fecha"] = e.fecha
        return r

    def _pypi(self, e: Entrada):
        st, _, d = self._json(f"https://pypi.org/pypi/{urllib.parse.quote(e.ref)}/json")
        if st != 200 or not d:
            return None
        info = d["info"]
        urls = d.get("urls") or []
        return {"version": info["version"], "fecha": _dia(urls[0].get("upload_time_iso_8601")) if urls else None,
                "licencia": info.get("license_expression") or None, "via": "api"}

    def _flathub(self, e: Entrada):
        st, _, d = self._json(f"https://flathub.org/api/v2/appstream/{urllib.parse.quote(e.ref)}")
        if st != 200 or not d:
            return None
        rels = sorted(d.get("releases") or [], key=lambda r: int(r.get("timestamp") or 0), reverse=True)
        if not rels:
            return None
        ts = int(rels[0].get("timestamp") or 0)
        fecha = datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d") if ts else None
        return {"version": rels[0]["version"], "fecha": fecha, "licencia": d.get("project_license"), "via": "api"}


# ───────────────────────────── comparación ─────────────────────────────
def _familias(lic: str) -> set[str]:
    out = set()
    for t in re.split(r"\s+(?:OR|AND)\s+|[()]", lic or ""):
        t = t.strip().upper()
        if not t:
            continue
        t = re.sub(r"(-ONLY|-OR-LATER|\+)$", "", t)
        t = re.sub(r"-(\d(\.\d)?)$", "", t) if t.startswith(("GPL", "LGPL", "AGPL")) else t
        out.add(t)
    return out


def licencia_cambio(catalogo: str, upstream: str | None) -> bool:
    """True solo si las familias de licencia no tienen nada en común (evita ruido GPL-3.0 vs GPL-3.0+)."""
    if not upstream or catalogo.startswith(("LicenseRef-", "NOASSERTION")):
        return False
    return not (_familias(catalogo) & _familias(upstream))


def comparar(entradas: list[Entrada], consultor: Consultor, con_licencia: bool = False, solo: set[str] | None = None) -> dict:
    cambios, errores, omitidas, iguales = [], [], [], 0
    for e in entradas:
        if solo and e.id not in solo:
            continue
        if e.fuente == "web":
            omitidas.append(e.id)
            continue
        r = consultor.consultar(e, con_licencia)
        if r is None:
            errores.append({"id": e.id, "fuente": e.fuente, "ref": e.ref, "motivo": "sin respuesta del origen"})
            continue
        lic_cambia = licencia_cambio(e.licencia, r.get("licencia"))
        if r["version"] == e.version and not lic_cambia:
            iguales += 1
            continue
        c = {"id": e.id, "nombre": e.nombre, "fuente": e.fuente, "ref": e.ref,
             "desde": {"version": e.version, "fecha": e.fecha}, "hasta": {"version": r["version"], "fecha": r.get("fecha"), "via": r.get("via")}}
        if r.get("sha"):
            c["hasta"]["sha"] = r["sha"]
        if r.get("licencia"):
            c["licenciaUpstream"] = r["licencia"]
        if lic_cambia:
            c["licenciaCambiada"] = {"catalogo": e.licencia, "upstream": r["licencia"]}
        if r["version"] == e.version:
            c["soloLicencia"] = True
        cambios.append(c)
    return {"cambios": cambios, "errores": errores, "omitidas": omitidas, "iguales": iguales}


def aplicar_cambios(texto: str, entradas: list[Entrada], cambios: list[dict]) -> tuple[str, int]:
    """Reescribe SOLO las líneas `actualizacion` de las herramientas con versión nueva."""
    por_id = {e.id: e for e in entradas}
    lineas = texto.split("\n")
    n = 0
    for c in cambios:
        if c.get("soloLicencia"):
            continue
        e = por_id[c["id"]]
        nueva = linea_actualizacion(e, c["hasta"]["version"], c["hasta"].get("fecha") or None)
        if lineas[e.linea] != nueva:
            lineas[e.linea] = nueva
            n += 1
    return "\n".join(lineas), n


def _escribir_atomico(ruta: Path, contenido: str) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=ruta.parent, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(contenido)
    os.replace(tmp, ruta)


def ejecutar(catalogo: Path, salida: Path, consultor: Consultor, aplicar: bool = False, con_licencia: bool = False,
             solo: set[str] | None = None, ahora_iso: str | None = None) -> dict:
    texto = catalogo.read_text("utf-8")
    mtime = catalogo.stat().st_mtime_ns
    entradas = leer_catalogo(texto)
    res = comparar(entradas, consultor, con_licencia, solo)
    consultor.guardar_cache()
    res["total"] = len(entradas)
    res["escrito"] = False
    res["lineasReescritas"] = 0
    if res["cambios"]:
        informe = {"generado": ahora_iso or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "catalogo": str(catalogo.relative_to(RAIZ)) if catalogo.is_relative_to(RAIZ) else str(catalogo),
                   "total": len(entradas), "iguales": res["iguales"], "sinConsulta": len(res["omitidas"]), "errores": res["errores"],
                   "cambios": res["cambios"]}
        _escribir_atomico(salida, json.dumps(informe, ensure_ascii=False, indent=2) + "\n")
        res["escrito"] = True
        if aplicar:
            nuevo, n = aplicar_cambios(texto, entradas, res["cambios"])
            if catalogo.stat().st_mtime_ns != mtime:  # alguien editó el catálogo mientras tanto: no pisarlo
                res["aviso"] = "el catálogo cambió durante la consulta; no se reescribió, repite la orden"
            elif n:
                leer_catalogo(nuevo)  # el resultado tiene que seguir siendo legible
                _escribir_atomico(catalogo, nuevo)
                res["lineasReescritas"] = n
    return res


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--catalogo", type=Path, default=CATALOGO)
    p.add_argument("--salida", type=Path, default=SALIDA)
    p.add_argument("--cache", type=Path, default=CACHE)
    p.add_argument("--horas-cache", type=float, default=HORAS_CACHE)
    p.add_argument("--pausa", type=float, default=0.5, help="segundos entre llamadas de red")
    p.add_argument("--solo", help="ids separados por coma")
    p.add_argument("--licencias", action="store_true", help="también compara la licencia (una llamada más por repo de GitHub)")
    p.add_argument("--aplicar", action="store_true", help="reescribe las líneas `actualizacion` que cambiaron")
    p.add_argument("--sin-red", action="store_true", help="solo valida que el catálogo se lee")
    a = p.parse_args(argv)
    try:
        entradas = leer_catalogo(a.catalogo.read_text("utf-8"))
    except (OSError, ValueError) as ex:
        print(f"No se pudo leer el catálogo: {ex}", file=sys.stderr)
        return 2
    if a.sin_red:
        print(f"Catálogo legible: {len(entradas)} herramientas, {sum(1 for e in entradas if e.fuente != 'web')} con consulta automática.")
        return 0
    consultor = Consultor(pausa=a.pausa, cache_ruta=a.cache, horas_cache=a.horas_cache)
    res = ejecutar(a.catalogo, a.salida, consultor, a.aplicar, a.licencias, set(a.solo.split(",")) if a.solo else None)
    print(f"{res['total']} herramientas · {res['iguales']} al día · {len(res['cambios'])} con cambios · {len(res['omitidas'])} sin consulta "
          f"(fuente web) · {len(res['errores'])} sin respuesta · {consultor.llamadas} llamadas de red"
          f"{' (API de GitHub limitada: se usaron los Atom públicos)' if consultor.api_github_limitada else ''}")
    for c in res["cambios"]:
        lic = "  ¡LICENCIA CAMBIADA!" if c.get("licenciaCambiada") else ""
        print(f"  {c['id']}: {c['desde']['version']} -> {c['hasta']['version']} ({c['hasta'].get('fecha')}){lic}")
    if res["escrito"]:
        print(f"Informe: {a.salida}" + (f" · {res['lineasReescritas']} líneas del catálogo reescritas" if a.aplicar else " · usa --aplicar para reescribir el catálogo"))
    if res.get("aviso"):
        print(res["aviso"], file=sys.stderr)
    return 0 if (res["iguales"] + len(res["cambios"])) or not res["errores"] else 1


if __name__ == "__main__":
    sys.exit(main())
