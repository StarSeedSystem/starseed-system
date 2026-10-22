# -*- coding: utf-8 -*-
"""Importa a la Librería las variaciones de identidad que Alex aprobó en el estudio.

Lee las fichas JSON de ``starseed_memory_root/diseno/variaciones-aprobadas/`` (formato §3 de
``variaciones-de-identidad.md``, ``estado: aprobada``), las valida y las publica con la API REST de
Supabase del OS: en ``os_variaciones`` (migración 20261019130000) si existe y si no en
``library_public_items`` (categoría design, carpeta de la familia, etiquetas y referencias en el
payload). Idempotente por clave+nombre. Claves por NOMBRE de variable de ``.env.local``, jamás
impresas. ``--seco`` valida y anuncia sin escribir. Fuente: ``architecture/variaciones-publicas.md`` §8.
"""
import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FAMILIAS = ("animacion", "transicion", "elemento-3d", "tipografia", "tema", "composicion", "icono", "sonido")
CARPETA_DEFECTO = os.path.join(RAIZ, "starseed_memory_root", "diseno", "variaciones-aprobadas")

def _leer_env(nombre):
    """Valor de una variable del entorno o de un archivo de entorno; nunca se imprime."""
    if os.environ.get(nombre):
        return os.environ[nombre]
    rutas = (os.path.join(RAIZ, ".env.local"), os.path.expanduser("~/.starseed/env"), os.path.expanduser("~/.hermes/.env"))
    for ruta in rutas:
        try:
            with open(ruta, encoding="utf-8") as f:
                for linea in f:
                    m = re.match(r"^\s*(?:export\s+)?%s=(.+?)\s*$" % re.escape(nombre), linea)
                    if m:
                        return m.group(1).strip().strip('"').strip("'")
        except OSError:
            continue
    return ""

def cargar_fichas(carpeta):
    """PURA de red: fichas ``*.json`` con ``estado`` aprobada; ignora lo corrupto."""
    try:
        nombres = sorted(os.listdir(carpeta))
    except OSError:
        return []
    fichas = []
    for nombre in nombres:
        if not nombre.endswith(".json"):
            continue
        try:
            with open(os.path.join(carpeta, nombre), encoding="utf-8") as f:
                ficha = json.load(f)
        except (OSError, ValueError):
            continue
        if isinstance(ficha, dict) and ficha.get("estado") == "aprobada":
            fichas.append(ficha)
    return fichas

def validar_ficha(ficha):
    """PURA: errores de la ficha según el formato §3; lista vacía si está bien."""
    if not isinstance(ficha, dict):
        return ["la ficha no es un objeto JSON"]
    errores = []
    clave = str(ficha.get("clave") or "")
    if ":" not in clave or clave.split(":", 1)[0] not in FAMILIAS:
        errores.append("la clave no es «familia:id» de las familias del sistema")
    for campo in ("nombre", "registro", "licencia"):
        if not str(ficha.get(campo) or "").strip():
            errores.append("falta «%s»" % campo)
    if ficha.get("estado") != "aprobada":
        errores.append("el estado no es «aprobada»")
    if not isinstance(ficha.get("fundamentos"), list) or not ficha.get("fundamentos"):
        errores.append("«fundamentos» debe ser una lista con contenido")
    for campo, mensaje, clase in (("parametros", "un objeto", dict), ("referencias", "una lista", list)):
        if not isinstance(ficha.get(campo), clase):
            errores.append("«%s» debe ser %s" % (campo, mensaje))
    mov = ficha.get("movimientoReducido")
    if not isinstance(mov, dict) or not isinstance(mov.get("duracionMs"), (int, float)):
        errores.append("falta «movimientoReducido» con «duracionMs»")
    return errores

def genero_de(ficha):
    """PURA: etiquetas de la variación (familia, registro e ids de sus referencias)."""
    familia = str(ficha["clave"]).split(":", 1)[0]
    ids = [str(r["id"]) for r in ficha.get("referencias") or [] if isinstance(r, dict) and r.get("id")]
    return [familia, "registro:%s" % ficha.get("registro")] + ids

def fila_os_variaciones(ficha):
    """PURA: fila de ``os_variaciones`` (migración 20261019130000); el autor va con la publicación."""
    return {
        "clave": ficha["clave"], "familia": str(ficha["clave"]).split(":", 1)[0], "tipo": "variacion",
        "titulo": str(ficha["nombre"])[:200],
        "descripcion": " · ".join(map(str, ficha.get("fundamentos") or [])),
        "payload": {"parametros": ficha.get("parametros"), "movimientoReducido": ficha.get("movimientoReducido"),
                    "ejemplo": ficha.get("ejemplo"), "referencias": ficha.get("referencias")},
        "licencia": ficha["licencia"], "etiquetas": genero_de(ficha),
    }

def fila_library_public_item(ficha):
    """PURA fila del catálogo público: categoría design, carpeta de la familia, etiquetas y
    referencias dentro del payload (el resto de columnas se hereda, no se duplica)."""
    familia = str(ficha["clave"]).split(":", 1)[0]
    sin_estado = {k: v for k, v in ficha.items() if k != "estado"}
    return {
        "category": "design", "folder": "diseño/" + familia, "name": str(ficha["nombre"]), "kind": "design",
        "payload": {"type": "variacion-identidad", "clave": ficha["clave"],
                    "description": " · ".join(map(str, ficha.get("fundamentos") or [])),
                    "etiquetas": genero_de(ficha), "ficha": sin_estado},
        "tags": genero_de(ficha),
    }

def par_idempotente(fila, tabla):
    """PURA: el par (clave, nombre) de deduplicación; en ``library_public_items`` la clave
    va en el payload (o en su proyección SQL, que llega como texto: ``payload->>clave``)."""
    if tabla == "os_variaciones":
        return (fila.get("clave"), fila.get("titulo"))
    payload = fila.get("payload")
    return (payload.get("clave") if isinstance(payload, dict) else payload, fila.get("name"))

def sin_duplicadas(filas, existentes, tabla):
    """PURA: conserva solo las filas cuya clave+nombre no esté ya publicada."""
    tomadas = {par_idempotente(e, tabla) for e in existentes if isinstance(e, dict)}
    return [f for f in filas if par_idempotente(f, tabla) not in tomadas]

def _rest(metodo, ruta, cuerpo=None):
    """Con red: una llamada REST de Supabase; ``None`` si falta la clave o la red no responde."""
    url = _leer_env("NEXT_PUBLIC_SUPABASE_URL").rstrip("/")
    clave = _leer_env("SUPABASE_SERVICE_ROLE_KEY") or _leer_env("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not clave:
        return None
    peticion = urllib.request.Request(
        url + ruta, method=metodo, data=json.dumps(cuerpo, ensure_ascii=False).encode() if cuerpo is not None else None,
        headers={"apikey": clave, "Authorization": "Bearer " + clave, "Content-Type": "application/json",
                 "Prefer": "return=minimal"})
    try:
        with urllib.request.urlopen(peticion, timeout=20) as r:
            return json.loads(r.read().decode("utf-8") or "[]")
    except Exception:
        return None

def existe_tabla(tabla):
    return isinstance(_rest("GET", "/rest/v1/%s?select=*&limit=1" % tabla), list)

def publicar(fichas, tabla):
    """Con red: una lectura y hasta un POST por familia; devuelve cuántas entraron
    (y -1 si falta el uuid del autor en el entorno, que jamás se imprime)."""
    autor = _leer_env("STARSEED_AUTOR_UUID")
    if not autor:
        return -1
    entraron = 0
    for familia in sorted({str(f["clave"]).split(":", 1)[0] for f in fichas}):
        filas = [fila_os_variaciones(f) if tabla == "os_variaciones" else fila_library_public_item(f)
                 for f in fichas if str(f["clave"]).startswith(familia + ":")]
        destino = ("select=clave,titulo&familia=eq." if tabla == "os_variaciones" else "select=name,payload->>clave&folder=eq.") \
            + urllib.parse.quote(familia if tabla == "os_variaciones" else "diseño/" + familia)
        existentes = _rest("GET", "/rest/v1/%s?%s" % (tabla, destino)) or []
        for fila in sin_duplicadas(filas, existentes, tabla):
            fila["autor" if tabla == "os_variaciones" else "owner"] = autor
            _rest("POST", "/rest/v1/" + tabla, fila)
            entraron += 1
    return entraron

def main(argv=None):
    parser = argparse.ArgumentParser(description="Importa a la Librería las variaciones de identidad aprobadas por Alex")
    parser.add_argument("--seco", action="store_true", help="recorre y valida sin escribir nada en la base")
    parser.add_argument("--carpeta", default=CARPETA_DEFECTO, help="carpeta de fichas aprobadas")
    args = parser.parse_args(argv)
    fichas = cargar_fichas(args.carpeta)
    if not fichas:
        print("No hay fichas con estado «aprobada» en %s" % args.carpeta)
        return 0
    aprobadas = []
    for ficha in fichas:
        errores = validar_ficha(ficha)
        if errores:
            print("Ficha inválida %s: %s" % (ficha.get("clave") or "?", "; ".join(errores)), file=sys.stderr)
        else:
            aprobadas.append(ficha)
    if args.seco:
        for ficha in aprobadas:
            print("[seco] %s → os_variaciones, o library_public_items si la migración no está aplicada" % ficha["clave"])
        return 0
    tabla = "os_variaciones" if existe_tabla("os_variaciones") else "library_public_items"
    entraron = publicar(aprobadas, tabla)
    if entraron < 0:
        print("Falta «STARSEED_AUTOR_UUID» en el entorno (uuid de Alex; no se imprime)", file=sys.stderr)
        return 2
    print("Publicadas %d en %s (de %d aprobadas)" % (entraron, tabla, len(aprobadas)))
    return 0

if __name__ == "__main__":
    sys.exit(main())
