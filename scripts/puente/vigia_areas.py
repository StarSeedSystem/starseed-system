#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigía de modelos · las áreas como dato (Ola 1016M · VGM1016A; contrato architecture/vigia-modelos.md §2-§3).
`config/vigia-areas.json` dice QUÉ vigila cada especialista, DÓNDE propone lo que encuentra (`catalogo`, relativo al
repo y que exista) y con QUÉ tabla clasifica las licencias. `cargar_areas(ruta)` devuelve las áreas resueltas (con
sus cuantizadores y la tabla de licencias) o lanza `AreasInvalidas` con TODOS los problemas a la vez. Sin red."""
import json
import os
import re

RAIZ_REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RUTA_AREAS = os.path.join(RAIZ_REPO, "config", "vigia-areas.json")
CLASES = ("libre", "personal", "condicionada", "desconocida")
OBLIGATORIOS = ("id", "nombre", "pipeline_tags", "autores", "catalogo")
OPCIONALES = ("cuantizadores", "repos_github", "alias_github", "filtros", "nota")
FILTROS = ("max_parametros_b", "etiquetas")
_ID = re.compile(r"^[a-z0-9][a-z0-9-]*$")
_CUENTA = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
_REPO = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9_.-]+$")
_NO_COMERCIAL = re.compile(r"(^|-)nc(-|$)|non-?commercial|research")  # nunca «libre» (§3: como mucho «personal»)


class AreasInvalidas(ValueError):
    """El archivo de áreas no sirve; `errores` trae cada problema por separado, con dónde arreglarlo."""
    def __init__(self, origen, errores):
        self.errores = list(errores)
        super().__init__(f"{origen} no es válido:\n" + "\n".join(f"  · {e}" for e in self.errores))


def _si(errores, falla, mensaje):
    if falla:
        errores.append(mensaje)


def _lista(valor, donde, patron, errores, vistos=None):
    """Textos sin repetir, sin distinguir mayúsculas (HF y GitHub tampoco); `vistos` compartido = entre áreas."""
    if not isinstance(valor, list) or not all(isinstance(v, str) for v in valor):
        errores.append(f"{donde}: tiene que ser una lista de textos")
        return []
    vistos = set() if vistos is None else vistos
    for v in valor:
        _si(errores, not patron.match(v), f"{donde}: «{v}» no tiene un formato válido")
        _si(errores, v.casefold() in vistos, f"{donde}: «{v}» está repetido")
        vistos.add(v.casefold())
    return list(valor)


def _licencias(valor, errores):
    if not isinstance(valor, dict):
        errores.append("«licencias_conocidas» tiene que ser un objeto {licencia: clase}")
        return {}
    for k, v in valor.items():
        _si(errores, not k or k != k.strip().lower(), f"licencia «{k}»: en minúsculas, como la da Hugging Face")
        _si(errores, v not in CLASES, f"licencia «{k}»: la clase «{v}» no existe; valen {', '.join(CLASES)}")
        _si(errores, v == "libre" and bool(_NO_COMERCIAL.search(k)), f"licencia «{k}»: no comercial, como mucho «personal»")
    return dict(valor)


def _area(a, donde, base, errores, existe, repos_vistos):
    errores += [f"{donde}: falta el campo «{c}»" for c in OBLIGATORIOS if c not in a]
    errores += [f"{donde}: campo desconocido «{c}» (¿una errata?)" for c in a if c not in OBLIGATORIOS + OPCIONALES]
    cat = a.get("catalogo", "")
    if "catalogo" in a and (not isinstance(cat, str) or re.match(r"^([/~\\]|[A-Za-z]:)", cat) or "\\" in cat
                            or any(p in ("", ".", "..") for p in cat.split("/"))):
        errores.append(f"{donde}: «catalogo» tiene que ser relativa al repo (p. ej. src/lib/imagenes/modelos.ts)")  # sin repetirla
    elif "catalogo" in a and existe is not None:
        _si(errores, not existe(cat), f"{donde}: el catálogo «{cat}» no existe en el repo")
    alias, filtros = a.get("alias_github", {}), a.get("filtros", {})
    r = {"id": a.get("id"), "nombre": a.get("nombre"), "catalogo": cat, "nota": a.get("nota", ""),
         "licencias_conocidas": dict(base["licencias"]), "alias_github": dict(alias if isinstance(alias, dict) else {})}
    for campo, patron in (("pipeline_tags", _ID), ("autores", _CUENTA)):
        r[campo] = _lista(a.get(campo, []), f"{donde} · {campo}", patron, errores)
    r["repos_github"] = _lista(a.get("repos_github", []), f"{donde} · repos_github", _REPO, errores, set())
    r["cuantizadores"] = _lista(a.get("cuantizadores", base["cuantizadores"]), f"{donde} · cuantizadores", _CUENTA, errores)
    errores += [f"{donde} · cuantizadores: «{c}» no está en la lista común" for c in r["cuantizadores"] if c not in base["cuantizadores"]]
    _si(errores, not (r["pipeline_tags"] or r["autores"] or r["repos_github"]), f"{donde}: no vigila nada (sin etiquetas, autores ni repos)")
    _si(errores, not isinstance(alias, dict) or any(v not in r["repos_github"] for v in alias.values()),
        f"{donde} · alias_github: tiene que ser {{viejo: actual}} con el actual en «repos_github»")
    _si(errores, not isinstance(filtros, dict) or any(k not in FILTROS for k in filtros), f"{donde} · filtros: solo valen {', '.join(FILTROS)}")
    filtros = filtros if isinstance(filtros, dict) else {}
    tope = filtros.get("max_parametros_b", 1)
    _si(errores, isinstance(tope, bool) or not isinstance(tope, (int, float)) or tope <= 0, f"{donde} · «max_parametros_b» tiene que ser > 0")
    r["filtros"] = {**filtros, "etiquetas": _lista(filtros.get("etiquetas", []), f"{donde} · etiquetas", _ID, errores)}
    return r


def validar_areas(datos, existe=None, origen="config/vigia-areas.json"):
    """PURA: valida el dato ya leído y devuelve las áreas resueltas. `existe(ruta_relativa)`: None = no mirar."""
    if not isinstance(datos, dict):
        raise AreasInvalidas(origen, ["tiene que ser un objeto JSON con «areas»"])
    errores = [f"falta «{c}» arriba del todo" for c in ("cuantizadores", "licencias_conocidas", "areas") if c not in datos]
    base = {"cuantizadores": _lista(datos.get("cuantizadores", []), "«cuantizadores»", _CUENTA, errores),
            "licencias": _licencias(datos.get("licencias_conocidas", {}), errores)}
    areas, resueltas, ids, repos = datos.get("areas", []), [], set(), set()
    _si(errores, not isinstance(areas, list) or ("areas" in datos and not areas), "«areas»: hace falta al menos una")
    for i, a in enumerate(areas if isinstance(areas, list) else []):
        if not isinstance(a, dict):
            errores.append(f"área #{i + 1}: tiene que ser un objeto")
            continue
        donde = f"área «{a['id']}»" if isinstance(a.get("id"), str) else f"área #{i + 1}"
        _lista([a["id"]] if "id" in a else [], f"{donde} · id (minúsculas, sin acentos ni espacios)", _ID, errores, ids)
        resueltas.append(_area(a, donde, base, errores, existe, repos))
    if errores:
        raise AreasInvalidas(origen, errores)
    return resueltas


def cargar_areas(ruta=RUTA_AREAS, raiz=RAIZ_REPO):
    """Lee y valida el archivo; los mensajes lo nombran relativo al repo (o por su nombre), nunca con la ruta absoluta."""
    rel = os.path.relpath(os.path.abspath(ruta), os.path.abspath(raiz)).replace(os.sep, "/") if raiz else ".."
    origen = os.path.basename(ruta) if rel.startswith("..") else rel
    try:
        with open(ruta, encoding="utf-8") as f:
            datos = json.load(f)
    except (OSError, ValueError) as e:  # JSONDecodeError y UnicodeDecodeError son ValueError
        motivo = ("no existe el archivo" if isinstance(e, FileNotFoundError) else
                  f"JSON roto en la línea {e.lineno}, columna {e.colno}: {e.msg}" if isinstance(e, json.JSONDecodeError)
                  else f"no se puede leer ({type(e).__name__})")
        raise AreasInvalidas(origen, [motivo]) from None
    return validar_areas(datos, None if raiz is None else (lambda r: os.path.isfile(os.path.join(raiz, r))), origen)
