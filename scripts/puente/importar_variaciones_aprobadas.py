#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Importa a la Librería las variaciones de identidad que Alex aprobó (DSN1019Kc).

Lee las fichas de `starseed_memory_root/diseno/variaciones-aprobadas/` (formato §3 de
`memory/diseno/estudio-audiovisual/references/variaciones-de-identidad.md`, `estado: "aprobada"`),
las valida y las publica por la API REST de Supabase del OS: en `os_variaciones` (migración
20261019130000) si está aplicada y, si no, en `library_public_items` (20261019141000):
categoría `design`, carpeta de su familia y ficha con etiquetas y referencias en el `payload`
(§4). Idempotente por clave+nombre; créditos SOLO por NOMBRE en `.env.local`
(`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STARSEED_AUTOR_UUID`); `--seco` sin tocar la base.
"""
from __future__ import annotations

import argparse, json, os, sys
import urllib.error, urllib.parse, urllib.request
from pathlib import Path
from typing import Callable, Dict, List, Tuple

# Familias de identidad (variaciones-de-identidad.md §1 · architecture/variaciones-publicas.md §8).
FAMILIAS = ("animacion", "composicion", "elemento-3d", "icono", "sonido", "tema", "tipografia", "transicion")
CATEGORIA_DESIGN = "design"
RAIZ = Path(os.environ.get("STARSEED_ROOT") or Path(__file__).resolve().parent.parent.parent)
DIR_VARIACIONES = RAIZ / "starseed_memory_root" / "diseno" / "variaciones-aprobadas"
Transporte = Callable[[str, str, Dict | None], Tuple[int, str]]


def _leer_env(nombre: str, raiz: Path = RAIZ) -> str:
    """Lee una credencial por su NOMBRE en `.env.local` (los valores nunca se imprimen)."""
    try:
        with open(raiz / ".env.local", encoding="utf-8") as f:
            for linea in f:
                if linea.startswith(nombre + "="):
                    return linea.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return os.environ.get(nombre, "")


def load_variations(custom_dir: Path | None = None) -> List[Dict]:
    """Fichas con `estado: "aprobada"` de la carpeta dada (o la del memory root)."""
    dir_path = custom_dir or DIR_VARIACIONES
    if not dir_path.exists():
        return []
    variaciones: List[Dict] = []
    for file in dir_path.glob("*.json"):
        with file.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if data.get("estado") == "aprobada":
            variaciones.append(data)
    return variaciones


def validar_ficha(ficha: Dict) -> List[str]:
    """Formato §3 + reglas del área (tokens, material, versión reducida). → errores, vacía si vale."""
    errores: List[str] = []
    familia, _, id_var = str(ficha.get("clave", "")).partition(":")
    if not id_var or familia not in FAMILIAS:
        errores.append("clave ha de ser familia:id de una de: %s" % ", ".join(FAMILIAS))
    if not isinstance(ficha.get("nombre"), str) or not 1 <= len(ficha.get("nombre") or "") <= 200:
        errores.append("nombre ausente o mayor de 200 caracteres")
    if not isinstance(ficha.get("parametros"), dict):
        errores.append("parametros ha de ser objeto")
    reducido = ficha.get("movimientoReducido")
    if not isinstance(reducido, dict) or not isinstance(reducido.get("duracionMs"), (int, float)) or reducido.get("recorridoPx") != 0:
        errores.append("toda variación lleva versión reducida: movimientoReducido con duracionMs y recorridoPx 0")
    if not ficha.get("licencia"):
        errores.append("licencia ausente")
    return errores


def _familia(ficha: Dict) -> str:
    return ficha.get("familia") or str(ficha["clave"]).split(":")[0]


def fila_os_variaciones(ficha: Dict, autor: str) -> Dict:
    """Fila para `os_variaciones`: con autor, licencia y referencias de las que aprendió."""
    return {"clave": ficha["clave"], "familia": _familia(ficha), "tipo": "variacion", "titulo": ficha["nombre"],
            "descripcion": "; ".join(ficha.get("fundamentos") or []) or None, "licencia": ficha["licencia"],
            "tema": ficha.get("registro") or None, "etiquetas": ["variacion", _familia(ficha), ficha.get("registro") or "nexus"],
            "payload": {"parametros": ficha.get("parametros", {}), "movimientoReducido": ficha.get("movimientoReducido", {}),
                        "ejemplo": ficha.get("ejemplo"), "referencias": ficha.get("referencias", [])},
            "autor": autor}


def fila_library_public_items(ficha: Dict, owner: str) -> Dict:
    """Plan B sin migrar: elemento público de la Librería, carpeta de su familia, ficha entera."""
    familia = _familia(ficha)
    return {"owner": owner, "category": CATEGORIA_DESIGN, "folder": "diseño/%s" % familia,
            "name": ficha["nombre"], "kind": "file", "payload": {"ficha": ficha},
            "tags": ["variacion", familia, ficha.get("registro") or "nexus", ficha["clave"]]}


def _filas(texto: str) -> List:
    """Filas de una respuesta de PostgREST ([] si ya no devolvió JSON de lista)."""
    try:
        datos = json.loads(texto or "[]")
    except ValueError:
        return []
    return datos if isinstance(datos, list) else []


def _disponible(estado: int, texto: str) -> bool:
    """«La tabla existe»: cualquier 200/4xx salvo la ausente (404, PGRST205, 42P01)."""
    return estado != 404 and "PGRST205" not in texto and "42P01" not in texto


def publicar_ficha(ficha: Dict, autor: str, pedir: Transporte) -> Tuple[str, str]:
    """Publica una variación aprobada. → (acción, detalle): ya_estaba · publicada · error.
    Idempotente por clave+nombre: si ya hay fila con la misma clave y título, no reescribe.
    Si `os_variaciones` no está migrada publica en `library_public_items` (plan B de §4)."""
    familia = _familia(ficha)
    q = lambda s: urllib.parse.quote(s, safe=":")
    estado, texto = pedir("GET", "/rest/v1/os_variaciones?select=id&clave=eq.%s&titulo=eq.%s" % (q(ficha["clave"]), q(ficha["nombre"])))
    if _disponible(estado, texto):
        if estado >= 400:
            return "error", "os_variaciones respondió %d" % estado
        if _filas(texto):
            return "ya_estaba", "os_variaciones"
        estado, texto = pedir("POST", "/rest/v1/os_variaciones", fila_os_variaciones(ficha, autor))
        return ("publicada", "os_variaciones") if 200 <= estado < 300 else ("error", "os_variaciones %d: %s" % (estado, texto[:120]))
    ruta = "/rest/v1/library_public_items?select=id&category=eq.%s&folder=eq.%s&name=eq.%s" % (CATEGORIA_DESIGN, q("diseño/" + familia), q(ficha["nombre"]))
    estado, texto = pedir("GET", ruta)
    if not _disponible(estado, texto):
        return "error", "ni os_variaciones ni library_public_items están disponibles"
    if _filas(texto):
        return "ya_estaba", "library_public_items"
    estado, texto = pedir("POST", "/rest/v1/library_public_items", fila_library_public_items(ficha, autor))
    return ("publicada", "library_public_items") if 200 <= estado < 300 else ("error", "library_public_items %d: %s" % (estado, texto[:120]))


def _pedir_hacia(url_base: str, clave: str) -> Transporte:
    """Transporte real de PostgREST (los 4xx se devuelven como valores, nunca como excepción)."""
    def pedir(metodo: str, ruta: str, cuerpo: Dict | None = None) -> Tuple[int, str]:
        cab = {"apikey": clave, "Accept": "application/json"}
        if cuerpo is not None:
            cab.update({"Content-Type": "application/json", "Prefer": "return=minimal"})
        if clave.startswith("eyJ") or cuerpo is not None:
            cab["Authorization"] = "Bearer " + clave
        datos = None if cuerpo is None else json.dumps(cuerpo).encode("utf-8")
        req = urllib.request.Request(url_base.rstrip("/") + ruta, data=datos, method=metodo, headers=cab)
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return r.status, r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            return e.code, (e.read() or b"").decode("utf-8", "replace")
    return pedir


def main() -> int:
    parser = argparse.ArgumentParser(description="Publica las variaciones de identidad aprobadas en la Librería del OS")
    parser.add_argument("--seco", action="store_true", help="valida y muestra lo que haría, sin tocar la base")
    opc = parser.parse_args()
    fichas = load_variations()
    validas: List[Dict] = []
    for ficha in fichas:
        errores = validar_ficha(ficha)
        if errores:
            print("[descartada] %s: %s" % (ficha.get("clave", "sin-clave"), "; ".join(errores)))
        else:
            validas.append(ficha)
    print("[fichas] %d válidas de %d en %s" % (len(validas), len(fichas), DIR_VARIACIONES))
    if opc.seco:
        for ficha in validas:
            print("[seco] publicaría %s: %s" % (ficha["clave"], ficha["nombre"]))
        return 0
    url, clave, autor = (_leer_env("NEXT_PUBLIC_SUPABASE_URL"), _leer_env("SUPABASE_SERVICE_ROLE_KEY"), _leer_env("STARSEED_AUTOR_UUID"))
    if not (url and clave and autor):
        print("[falta] rellena NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y STARSEED_AUTOR_UUID en .env.local")
        return 1
    resumen: Dict[str, int] = {}
    for ficha in validas:
        accion, detalle = publicar_ficha(ficha, autor, _pedir_hacia(url, clave))
        resumen[accion] = resumen.get(accion, 0) + 1
        print("[%s] %s: %s%s" % (accion, ficha["clave"], ficha["nombre"], " · " + detalle if detalle else ""))
    return 1 if resumen.get("error") else 0


if __name__ == "__main__":
    sys.exit(main())
