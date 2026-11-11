# -*- coding: utf-8 -*-
"""Actividad de cuadernos de NotebookLM (SDP1111J): fichas privadas de fuentes y notas nuevas.

Solo corre donde vive el CLI `notebooklm` (la Mac). Nunca inicia sesión ni reintenta el login:
si falta el CLI o la sesión caducó, devuelve `{ok: False, motivo}`. Las fichas se quedan en el
nodo, en `~/.starseed/actividad/`; no salen a Supabase, ni a Drive, ni a un modelo de pago.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from datetime import datetime

PERFILES = ("default", "fundacion")
CORREOS = {"default": "alexbordongarrigos@gmail.com", "fundacion": "fundacionstarseed@gmail.com"}
RUTA_MAC = "/Users/alex/bin/notebooklm"
TIMEOUT = 90
REL_ESTADO = os.path.join(".starseed", "actividad", "estado-notebooklm.json")
REL_FICHAS = os.path.join(".starseed", "actividad", "fichas")


def _json(texto):
    """JSON del CLI; si trae ruido delante, desde el primer `{` o `[`."""
    texto = (texto or "").strip()
    try:
        return json.loads(texto)
    except ValueError:
        for i, c in enumerate(texto):
            if c in "{[":
                try:
                    return json.loads(texto[i:])
                except ValueError:
                    return {}
    return {}


def _leer(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta + ".tmp", "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2, sort_keys=True)
    os.replace(ruta + ".tmp", ruta)


def _fusionar(viejas, nuevas):
    salida = [f for f in viejas if isinstance(f, dict)] if isinstance(viejas, list) else []
    vistas = {(f.get("perfil"), f.get("tipo"), f.get("id")) for f in salida}
    for f in nuevas:
        clave = (f["perfil"], f["tipo"], f["id"])
        if clave not in vistas:
            salida.append(f)
            vistas.add(clave)
    return salida


def _caducada(texto):
    t = (texto or "").lower()
    return any(x in t for x in ("auth_required", "not logged in", "session expired",
                                "sesión", "login required", "cookies"))


def _llamar(ejecutar, orden):
    """(dato, error). Sin login ni reintentos: el fallo se devuelve, no se insiste."""
    try:
        r = ejecutar(orden, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=TIMEOUT)
    except FileNotFoundError:
        return None, "el CLI notebooklm no está en este nodo (solo la Mac)"
    except subprocess.TimeoutExpired:
        return None, "el CLI notebooklm no respondió en %s s" % TIMEOUT
    except Exception as e:
        return None, "no se pudo ejecutar notebooklm: %s" % e
    if r.returncode != 0:
        salida = "%s\n%s" % (r.stdout or "", r.stderr or "")
        if _caducada(salida):
            return None, "sesión"
        return None, "el CLI devolvió error: %s" % (salida.strip()[:200] or r.returncode)
    return _json(r.stdout or ""), None


def _lista(dato, clave):
    if isinstance(dato, list):
        return [x for x in dato if isinstance(x, dict)]
    return [x for x in (dato if isinstance(dato, dict) else {}).get(clave) or [] if isinstance(x, dict)]


def _ficha(perfil, nb, tipo, item, fecha):
    """Ficha privada de una fuente o nota; `privado: True` siempre."""
    nb_id = str(nb.get("id") or "")
    enlace = item.get("url") if tipo == "fuente" else None
    return {"fuente": "notebooklm", "perfil": perfil, "cuenta": CORREOS.get(perfil, ""),
            "cuaderno": {"id": nb_id, "titulo": nb.get("title") or nb_id}, "tipo": tipo,
            "id": str(item.get("id") or ""),
            "titulo": str(item.get("title") or item.get("preview") or item.get("id") or ""),
            "enlace": enlace or "https://notebooklm.google.com/notebook/%s" % nb_id,
            "fecha": str(fecha or datetime.now().astimezone().isoformat()),
            "texto": str(item.get("preview") or item.get("url") or "")[:1500], "privado": True}


def _leer_cuaderno(ejecutar, ruta, perfil, nb_id):
    """(fuentes, notas, errores, sesión). Un cuaderno que falla no tumba a los demás."""
    datos, errores = {}, []
    for tipo, clave, orden in (("fuente", "sources", "source"), ("nota", "notes", "note")):
        dato, err = _llamar(ejecutar, [ruta, "-p", perfil, orden, "list", "-n", nb_id, "--json"])
        if err == "sesión":
            return None, None, errores, True
        if err:
            errores.append({"perfil": perfil, "cuaderno": nb_id, "tipo": tipo, "motivo": err})
            datos[tipo] = None
        else:
            datos[tipo] = _lista(dato, clave)
    return datos["fuente"], datos["nota"], errores, False


def recolectar(ejecutar=None, existe=None, ahora=None, home=None, ruta=None):
    """Fichas nuevas de los dos perfiles. `ejecutar` y `existe` son las costuras de prueba."""
    ejecutar = ejecutar or subprocess.run
    existe = existe or (lambda r: os.access(r, os.X_OK))
    ruta = ruta or shutil.which("notebooklm") or (
        RUTA_MAC if os.access(RUTA_MAC, os.X_OK) else "notebooklm")
    if not existe(ruta):
        return {"ok": False, "motivo": "el CLI notebooklm no está en este nodo (solo la Mac)"}
    home = home or os.path.expanduser("~")
    hoy = (ahora or datetime.now().astimezone()).date().isoformat()
    estado_ruta = os.path.join(home, REL_ESTADO)
    estado, fichas, errores, cuadernos = _leer(estado_ruta, {}), [], [], 0
    for perfil in PERFILES:
        dato, err = _llamar(ejecutar, [ruta, "-p", perfil, "list", "--json"])
        if err:
            if err == "sesión":
                return {"ok": False, "motivo": "la sesión del perfil %s ha caducado: entra una vez "
                        "con `notebooklm -p %s login`" % (perfil, perfil)}
            return {"ok": False, "motivo": err}
        vistos = estado.setdefault(perfil, {})
        for nb in _lista(dato, "notebooks"):
            nb_id = str(nb.get("id") or "")
            if not nb_id:
                continue
            cuadernos += 1
            marca = vistos.setdefault(nb_id, {"fuentes": [], "notas": []})
            fuentes, notas, fallos, sesion = _leer_cuaderno(ejecutar, ruta, perfil, nb_id)
            errores += fallos
            if sesion:
                return {"ok": False, "motivo": "la sesión del perfil %s ha caducado: entra una vez "
                        "con `notebooklm -p %s login`" % (perfil, perfil)}
            for tipo, items in (("fuente", fuentes), ("nota", notas)):
                if items is None:
                    continue
                previos = {str(x) for x in marca.get(tipo + "s") or []}
                nuevas = [x for x in items if str(x.get("id")) not in previos]
                fichas += [_ficha(perfil, nb, tipo, x, x.get("created_at")) for x in nuevas]
                marca[tipo + "s"] = [str(x.get("id")) for x in items if x.get("id")]
    fichero = os.path.join(home, REL_FICHAS, "%s-notebooklm.json" % hoy)
    _escribir(fichero, _fusionar(_leer(fichero, []), fichas))
    _escribir(estado_ruta, estado)
    return {"ok": True, "perfiles": len(PERFILES), "cuadernos": cuadernos, "nuevas": len(fichas),
            "fichas": fichas, "errores": errores, "fichero": fichero}
