"""Capa de red y CLI del importador de variaciones aprobadas (DSN1019Kc).

Publica con la API de Supabase del OS: en `os_variaciones` si la tabla existe y hay uuid de
autor (`STARSEED_SUPABASE_AUTOR_UUID`), y si no en `library_public_items` (categoría diseño,
carpeta de su familia). Idempotente por clave+nombre. Las claves llegan solo por NOMBRE de
variable de `.env.local` o `~/.starseed/env`: jamás se imprimen.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import importar_variaciones_aprobadas as puro


def leer_env(nombres, rutas=None) -> dict:
    """Las variables pedidas, de .env.local (y ~/.starseed/env) o del entorno."""
    rutas = rutas if rutas is not None else [
        puro.raiz_repo() / ".env.local", Path("~/.starseed/env").expanduser()]
    linea = []
    for ruta in rutas:
        try:
            linea = linea + Path(ruta).read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
    halladas: dict = {}
    for fila in linea:
        fila = fila.strip()
        if fila.startswith("export "):
            fila = fila[7:].strip()
        if "=" not in fila or fila.startswith("#"):
            continue
        nombre, valor = fila.split("=", 1)
        nombre = nombre.strip()
        if nombre in nombres and nombre not in halladas:
            halladas[nombre] = valor.strip().strip('"').strip("'")
    for nombre in nombres:
        if nombre not in halladas and os.environ.get(nombre):
            halladas[nombre] = os.environ[nombre]
    return halladas


def _peticion(metodo, url, clave_api, cuerpo=None):
    """Una llamada a PostgREST: (estado, cuerpo); los errores HTTP se pliegan en el par."""
    peticion = urllib.request.Request(
        url, method=metodo, data=cuerpo,
        headers={"apikey": clave_api, "Authorization": f"Bearer {clave_api}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(peticion, timeout=30) as respuesta:
            return respuesta.status, respuesta.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8")


def existe_tabla(base, clave_api, tabla):
    """True si PostgREST responde, False si la tabla no existe (PGRST205/404), None si no se sabe."""
    estado, cuerpo = _peticion("GET", f"{base}/rest/v1/{tabla}?select=id&limit=1", clave_api)
    return True if estado == 200 else (None if cuerpo and not puro.es_tabla_ausente(estado, cuerpo) else False)


def ya_publicada(base, clave_api, tabla, ficha):
    """¿Hay ya una fila de esta clave+nombre? True/False, None si la consulta falla."""
    filtros = ({"clave": ficha["clave"], "titulo": ficha["nombre"]} if tabla == puro.TABLA_OS else
               {"category": "design", "folder": f"diseño/{ficha.get('familia', '')}", "name": ficha["nombre"]})
    consulta = "&".join(f"{c}=eq.{urllib.parse.quote(str(v), safe='')}" for c, v in filtros.items())
    estado, cuerpo = _peticion("GET", f"{base}/rest/v1/{tabla}?{consulta}&select=id", clave_api)
    try:
        return None if estado != 200 else len(json.loads(cuerpo or "[]")) > 0
    except ValueError:
        return None


def main(argv=None) -> int:
    analizador = argparse.ArgumentParser(description="Publica las variaciones aprobadas en la Librería del OS")
    analizador.add_argument("--seco", action="store_true", help="solo muestra lo que haría, sin escribir en la base")
    analizador.add_argument("--carpeta", help="carpeta de fichas distinta de la predeterminada")
    opciones = analizador.parse_args(argv)

    fichas, rechazadas = [], 0
    for ficha in puro.load_variations(opciones.carpeta):
        errores = puro.validar_ficha(ficha)
        if errores:
            print(f"[rechazada] {ficha.get('clave', '?')}: {'; '.join(errores)}")
            rechazadas += 1
        else:
            fichas.append(ficha)

    env = leer_env([puro.ENV_URL, puro.ENV_CLAVE, puro.ENV_AUTOR])
    base, clave_api, autor = (env.get(puro.ENV_URL, "").rstrip("/"),
                              env.get(puro.ENV_CLAVE, ""), env.get(puro.ENV_AUTOR, ""))
    credenciales = bool(base and clave_api)
    # Modo seco (o sin credenciales, con aviso honesto): vista previa, nunca escribe.
    if opciones.seco or not credenciales:
        destino = puro.TABLA_LIB
        if credenciales:
            destino = puro.destino_de(existe_tabla(base, clave_api, puro.TABLA_OS) is True, autor)
        print(f"[seco] {len(fichas)} fichas aprobadas · destino previsto: {destino}")
        if not credenciales:
            print(f"[seco] sin credenciales por nombre de variable ({puro.ENV_URL} / {puro.ENV_CLAVE})")
        for ficha in fichas:
            saltada = credenciales and ya_publicada(base, clave_api, destino, ficha)
            print(f"[seco] {ficha['clave']} · {ficha['nombre']} → "
                  f"{'ya publicada: se saltaría' if saltada else 'nueva'}")
        return 0 if opciones.seco else 2

    destino = puro.destino_de(existe_tabla(base, clave_api, puro.TABLA_OS) is True, autor)
    bien, mal = 0, 0
    for ficha in fichas:
        ya = ya_publicada(base, clave_api, destino, ficha)
        if ya is None:
            print(f"[aviso] no se pudo consultar si {ficha['clave']} ya estaba publicada; se salta")
            continue
        if ya:
            print(f"[saltada] {ficha['clave']} · {ficha['nombre']} ya estaba publicada (idempotencia)")
            continue
        fila = (puro.fila_para_os_variaciones(ficha, autor) if destino == puro.TABLA_OS
                else puro.fila_para_library_public_items(ficha))
        if destino == puro.TABLA_LIB and autor:
            fila["owner"] = autor
        estado, cuerpo = _peticion(
            "POST", f"{base}/rest/v1/{destino}", clave_api, json.dumps(fila).encode("utf-8"))
        if estado in (200, 201):
            print(f"[publicada] {ficha['clave']} · {ficha['nombre']}")
            bien += 1
        else:
            print(f"[error] {ficha['clave']}: HTTP {estado}: {cuerpo[:200]}")
            mal += 1
    print(f"resumen: {bien} publicadas, {rechazadas} rechazadas, {mal} con error")
    return 2 if mal else 0


if __name__ == "__main__":
    sys.exit(main())
