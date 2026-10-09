#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Renovador de capas Astraura. Consulta Hugging Face, compara con config/capas-astraura.json
y gestiona espejo y estado para Genesis.
"""
from __future__ import annotations
import argparse
import json
import hashlib
import os
from pathlib import Path
from datetime import datetime
from typing import Callable, Dict, List, Tuple, Optional

CONFIG_PATH = Path(__file__).parents[2] / "config" / "capas-astraura.json"
ESTADO_PATH = Path(os.path.expanduser("~/.starseed/capas-estado.json"))
ESPEJO_DIR = Path(os.environ.get("CAPAS_ESPEJO_DIR", os.path.expanduser("~/.starseed/espejo/capas")))

HF_BASE = "https://huggingface.co/api"

#: Marcas de archivos que NO son los pesos desplegables de una capa: precisión
#: completa (F16/BF16), proyectores multimodales y versiones de desarrollo.
_NO_DESPLEGABLE = ("-f16.", "-bf16.", "_f16.", "_bf16.", "mmproj", "-dev.")
#: Preferencia por etiqueta de cuantización cuando quedan varios candidatos
#: (se compara contra el nombre en minúsculas, separado por - _ . como palabra).
_PREFERENCIA_CUANT = ("i2_s", "q2_0", "q1_0", "q2")
_EXTENSION = {"gguf": ".gguf", "onnx": ".onnx", "cact": ".cact"}


def _sha256_lfs(entry: Dict) -> Optional[str]:
    """sha256 del CONTENIDO según la API de Hugging Face: solo `lfs.oid`.

    El `oid` de primer nivel es el id de blob de git (sha1 de 40 hex), NO el
    sha256 del archivo: confundirlos fue el fallo de la primera versión. Un
    archivo sin LFS no trae sha256 sin descargarlo → None (no se inventa).
    """
    lfs = entry.get("lfs")
    if isinstance(lfs, dict):
        oid = str(lfs.get("oid") or "").strip().lower()
        if len(oid) == 64 and all(c in "0123456789abcdef" for c in oid):
            return oid
    return None


def _ficha(entry: Dict) -> Optional[Dict]:
    sha = _sha256_lfs(entry)
    if not sha:
        return None
    tam = entry.get("size")
    if not isinstance(tam, int):
        tam = (entry.get("lfs") or {}).get("size") if isinstance(entry.get("lfs"), dict) else None
    return {"path": entry.get("path", ""), "sha256": sha, "bytes": int(tam or 0)}


def _tiene_etiqueta(nombre: str, etiqueta: str) -> bool:
    """¿El nombre (sin extensión) TERMINA en la etiqueta, tras un separador?
    «…-Q2_0» sí; «…-PQ2_0» y «…-Q2_0_g64» no (son otras variantes)."""
    import re
    return re.search(r"(^|[-_.])" + re.escape(etiqueta) + r"$", nombre) is not None


def elegir_archivo(capa: Dict, arbol: List[Dict]) -> Tuple[Optional[List[Dict]], List[str]]:
    """PURA. Elige del árbol del repo los archivos de pesos de una capa.

    Devuelve `(archivos, candidatos)`:
      · `archivos` = [{path, sha256, bytes}] (el principal primero; un ONNX va
        con su `.onnx_data`), o None si no se puede decidir sin adivinar.
      · `candidatos` = rutas consideradas (para el informe de «ambigua»).
    Reglas: si la capa ya fija `archivo`, se busca ESA ruta; si no, se filtra
    por la extensión del formato, se descartan F16/BF16/mmproj/dev, se quitan
    duplicados con el mismo sha256 y, si quedan varios, se prefiere i2_s, Q2_0,
    Q1_0 o q2 cuando exactamente uno lleva esa etiqueta. Nada más.
    """
    archivos_arbol = [e for e in arbol if isinstance(e, dict) and e.get("path") and e.get("type", "file") == "file"]
    por_ruta = {e["path"]: e for e in archivos_arbol}

    def con_companero(entry: Dict) -> Optional[List[Dict]]:
        ficha = _ficha(entry)
        if not ficha:
            return None
        out = [ficha]
        datos = por_ruta.get(entry["path"] + "_data")
        if datos is not None:
            f2 = _ficha(datos)
            if not f2:
                return None
            out.append(f2)
        return out

    fijado = capa.get("archivo")
    if fijado:
        # `archivos_extra`: capas que necesitan varios pesos (VibeASR: modelo de
        # lenguaje + codificador). Si falta uno, la capa no queda verificada.
        rutas_fijadas = [fijado] + [str(x) for x in (capa.get("archivos_extra") or [])]
        out: List[Dict] = []
        for ruta in rutas_fijadas:
            entry = por_ruta.get(ruta)
            fichas = con_companero(entry) if entry else None
            if not fichas:
                return (None, rutas_fijadas)
            out.extend(fichas)
        return (out, rutas_fijadas)

    ext = _EXTENSION.get(str(capa.get("formato", "")).lower())
    if not ext:
        return (None, [])
    candidatos = [e for e in archivos_arbol if e["path"].lower().endswith(ext)]
    rutas = [e["path"] for e in candidatos]
    if not candidatos:
        return (None, rutas)
    desplegables = [e for e in candidatos if not any(m in e["path"].lower() for m in _NO_DESPLEGABLE)]
    if desplegables:
        candidatos = desplegables
    unicos: Dict[str, Dict] = {}
    for e in sorted(candidatos, key=lambda x: (len(x["path"]), x["path"])):
        sha = _sha256_lfs(e) or ("sin-lfs:" + e["path"])
        unicos.setdefault(sha, e)
    candidatos = list(unicos.values())
    if len(candidatos) == 1:
        return (con_companero(candidatos[0]), rutas)
    for etiqueta in _PREFERENCIA_CUANT:
        con = [e for e in candidatos
               if _tiene_etiqueta(Path(e["path"]).name.lower().rsplit(".", 1)[0], etiqueta)]
        if len(con) == 1:
            return (con_companero(con[0]), rutas)
        if len(con) > 1:
            break
    return (None, rutas)


def cargar_config() -> Dict:
    with CONFIG_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def _repo_de(fuente: str) -> Optional[str]:
    prefijo = "https://huggingface.co/"
    if not fuente or not fuente.startswith(prefijo):
        return None
    repo = fuente[len(prefijo):].strip("/")
    return repo if repo.count("/") == 1 else None


def verificar_capas(config: Dict, getter: Callable[[str], object] | None = None,
                    hoy: Optional[str] = None) -> Tuple[Dict, List[str]]:
    """Rellena `archivo`, `sha256` y `tamano_bytes` de cada capa «por-verificar»
    con lo que publica la API de Hugging Face (`lfs.oid` = sha256), sin
    descargar los pesos. Una línea de informe por capa. Nunca lanza.

    Estados del informe: ya-verificada · verificada · repo-inexistente (401/404:
    Hugging Face responde así a un repo que no existe o es privado) · sin-red ·
    ambigua (candidatos: …) · sin-sha (archivo sin LFS).
    """
    import urllib.error
    hoy = hoy or datetime.utcnow().date().isoformat()
    informe: List[str] = []
    config_nueva = dict(config)
    config_nueva["capas"] = []

    def get_json(url: str) -> object:
        return getter(url) if getter else fetch_json(url)

    for capa in config.get("capas", []):
        cid = capa.get("id", "?")
        if capa.get("sha256") not in (None, "", "por-verificar"):
            config_nueva["capas"].append(capa)
            informe.append(f"{cid}: ya-verificada")
            continue
        repo = _repo_de(capa.get("fuente_oficial", ""))
        if not repo:
            config_nueva["capas"].append(capa)
            informe.append(f"{cid}: sin-fuente (fuente_oficial no es un repo de Hugging Face)")
            continue
        try:
            arbol = get_json(f"{HF_BASE}/models/{repo}/tree/main?recursive=1")
        except urllib.error.HTTPError as e:
            config_nueva["capas"].append(capa)
            estado = "repo-inexistente" if e.code in (401, 404) else f"sin-red (HTTP {e.code})"
            informe.append(f"{cid}: {estado} ({repo})")
            continue
        except Exception as e:
            config_nueva["capas"].append(capa)
            informe.append(f"{cid}: sin-red ({type(e).__name__})")
            continue
        if not isinstance(arbol, list):
            config_nueva["capas"].append(capa)
            informe.append(f"{cid}: sin-red (respuesta inesperada)")
            continue
        archivos, candidatos = elegir_archivo(capa, arbol)
        if not archivos:
            config_nueva["capas"].append(capa)
            if candidatos and capa.get("archivo") and capa["archivo"] in candidatos:
                informe.append(f"{cid}: sin-sha ({capa['archivo']} no existe o no está en LFS)")
            else:
                info = ", ".join(candidatos[:4]) if candidatos else "ninguno"
                informe.append(f"{cid}: ambigua (candidatos: {info})")
            continue
        principal = archivos[0]
        nueva = dict(capa)
        nueva["archivo"] = principal["path"]
        nueva["sha256"] = principal["sha256"]
        nueva["tamano_bytes"] = sum(a["bytes"] for a in archivos)
        if len(archivos) > 1:
            # Mismo formato que ya usa needle_web_paquete.py: {ruta: sha256}.
            mapa = dict(nueva.get("archivos") or {}) if isinstance(nueva.get("archivos"), dict) else {}
            mapa.update({a["path"]: a["sha256"] for a in archivos})
            nueva["archivos"] = mapa
        nueva["verificado"] = hoy
        config_nueva["capas"].append(nueva)
        informe.append(f"{cid}: verificada ({principal['path']} · {principal['sha256'][:12]}…)")
    return (config_nueva, informe)


def guardar_estado(estado: Dict) -> None:
    ESTADO_PATH.parent.mkdir(parents=True, exist_ok=True)
    with ESTADO_PATH.open("w", encoding="utf-8") as f:
        json.dump(estado, f, ensure_ascii=False, indent=2)

def fetch_json(url: str, getter: Callable[[str], object] | None = None) -> object:
    import urllib.request
    if getter:
        data = getter(url)
        if isinstance(data, bytes):
            return json.loads(data.decode("utf-8"))
        return data
    with urllib.request.urlopen(url, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))

def sha256_stream(url: str, dest: Path, getter: Callable[[str], bytes] | None = None) -> str:
    import urllib.request
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    h = hashlib.sha256()
    if getter:
        data = getter(url)
        with tmp.open("wb") as f:
            f.write(data)
        h.update(data)
    else:
        with urllib.request.urlopen(url) as resp, tmp.open("wb") as f:
            while True:
                chunk = resp.read(8192)
                if not chunk:
                    break
                f.write(chunk)
                h.update(chunk)
    tmp.replace(dest)
    return h.hexdigest()

def detectar_nuevas(config: Dict, getter: Callable[[str], Dict] | None = None) -> List[Dict]:
    import fnmatch
    familias = [
        ("Cactus-Compute", "needle*"),
        ("prism-ml", "*"),
        ("microsoft", "BitNet*"),
        ("onnx-community", "*Bonsai*"),
    ]
    existentes = {c["fuente_oficial"] for c in config.get("capas", [])}
    nuevas = []
    for autor, patron in familias:
        url = f"{HF_BASE}/models?author={autor}&limit=100"
        try:
            modelos = fetch_json(url, getter) if getter else fetch_json(url)
            if not isinstance(modelos, list):
                continue
        except Exception:
            continue
        for m in modelos:
            repo = m.get("id")
            if not repo or not fnmatch.fnmatch(repo, f"{autor}/{patron.lstrip('*')}*"):
                # filtro simple por autor y patrón
                if not repo.startswith(f"{autor}/"):
                    continue
                if patron != "*" and not fnmatch.fnmatch(repo.split("/",1)[1], patron):
                    continue
            fuente = f"https://huggingface.co/{repo}"
            if fuente in existentes:
                continue
            # detalle
            try:
                detalle = fetch_json(f"{HF_BASE}/models/{repo}", getter)
                last = detalle.get("lastModified") or ""
            except Exception:
                last = ""
            nuevas.append({"repo": repo, "fuente_oficial": fuente, "lastModified": last, "estado": "en-banco"})
    return nuevas

def descargar_espejo(config: Dict, ids: Optional[List[str]] = None,
                     getter: Callable[[str], bytes] | None = None) -> List[str]:
    """Copia al espejo local los pesos de las capas YA verificadas y comprueba
    que el sha256 descargado coincide con el del catálogo. Solo con
    `--descargar` (son GB). Una capa sin sha verificado no se descarga."""
    informe: List[str] = []
    for capa in config.get("capas", []):
        cid = capa.get("id", "?")
        if ids and cid not in ids:
            continue
        repo = _repo_de(capa.get("fuente_oficial", ""))
        principal = capa.get("archivo")
        if not repo or not principal or capa.get("sha256") in (None, "", "por-verificar"):
            informe.append(f"{cid}: sin verificar, no se descarga")
            continue
        # Solo los pesos publicados en el repo: el principal, sus extras y el
        # `_data` de un ONNX. (El mapa `archivos` de needle3 incluye además los
        # archivos del paquete web, que no están en Hugging Face.)
        mapa = capa.get("archivos") if isinstance(capa.get("archivos"), dict) else {}
        rutas = [principal] + [str(x) for x in (capa.get("archivos_extra") or [])]
        if principal + "_data" in mapa:
            rutas.append(principal + "_data")
        archivos = [{"path": r, "sha256": capa["sha256"] if r == principal else mapa.get(r)} for r in rutas]
        for a in archivos:
            if not a.get("sha256"):
                informe.append(f"{cid}: {a['path']} sin sha en el catálogo, no se descarga")
                continue
            dest = ESPEJO_DIR / cid / Path(a["path"]).name
            url = f"https://huggingface.co/{repo}/resolve/main/{a['path']}"
            try:
                sha = sha256_stream(url, dest, getter)
            except Exception as e:
                informe.append(f"{cid}: descarga fallida ({type(e).__name__}) {a['path']}")
                continue
            if sha != a.get("sha256"):
                dest.unlink(missing_ok=True)
                informe.append(f"{cid}: SHA DISTINTO en {a['path']} (esperado {str(a.get('sha256'))[:12]}…, llegó {sha[:12]}…) — borrado")
            else:
                informe.append(f"{cid}: espejo ok {a['path']}")
    return informe


def volcar_json(obj, nivel: int = 0) -> str:
    """JSON con el estilo a mano del catálogo: listas de valores simples y
    objetos sin anidar (de nivel ≥3) en una línea; el resto, indentado a 2.
    Así reescribir el catálogo solo cambia las líneas que de verdad cambian."""
    sp, sp2 = "  " * nivel, "  " * (nivel + 1)
    d = lambda v: json.dumps(v, ensure_ascii=False)  # noqa: E731

    def hoja(o) -> bool:
        return all(not isinstance(v, (dict, list)) for v in (o.values() if isinstance(o, dict) else o))

    if isinstance(obj, dict):
        if not obj:
            return "{}"
        if nivel >= 3 and hoja(obj):
            return "{ " + ", ".join(f"{d(k)}: {d(v)}" for k, v in obj.items()) + " }"
        return "{\n" + ",\n".join(f"{sp2}{d(k)}: {volcar_json(v, nivel + 1)}" for k, v in obj.items()) + "\n" + sp + "}"
    if isinstance(obj, list):
        if not obj:
            return "[]"
        if hoja(obj):
            return "[" + ", ".join(d(v) for v in obj) + "]"
        return "[\n" + ",\n".join(f"{sp2}{volcar_json(v, nivel + 1)}" for v in obj) + "\n" + sp + "]"
    return d(obj)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--descargar", action="store_true", help="copia al espejo los pesos verificados (GB)")
    parser.add_argument("--capa", action="append", help="limita --descargar a esta capa (repetible)")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--verificar", action="store_true")
    parser.add_argument("--escribir", action="store_true")
    args = parser.parse_args()

    config = cargar_config()
    if args.verificar:
        config_nueva, informe = verificar_capas(config)
        for linea in informe:
            print(linea)
        if args.escribir:
            config_nueva["actualizado"] = datetime.utcnow().date().isoformat()
            tmp = CONFIG_PATH.with_suffix(CONFIG_PATH.suffix + ".tmp")
            with tmp.open("w", encoding="utf-8") as f:
                f.write(volcar_json(config_nueva) + "\n")
            tmp.replace(CONFIG_PATH)
        return

    if args.descargar:
        for linea in descargar_espejo(config, args.capa):
            print(linea)
        return

    nuevas = detectar_nuevas(config)
    estado = {"actualizado": datetime.utcnow().isoformat(), "nuevas": nuevas}
    for n in nuevas:
        print(f"nueva en Hugging Face: {n['repo']} ({n.get('lastModified') or 'sin fecha'})")
    if args.json:
        guardar_estado(estado)


if __name__ == "__main__":
    main()
