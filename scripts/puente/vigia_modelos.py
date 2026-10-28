#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigía de modelos · director diario (Ola 1016M · tarea VGM1016D).

Una pasada: por cada área de config/vigia-areas.json llama a `descubrir`
(vigia_descubrir.py) y evalúa con lo pura de vigia_evaluar.py, y deja:
  · starseed_memory_root/vigia/novedades-<AAAA-MM-DD>.json — por área: candidatos
    aceptados y descartados con su motivo, clase de licencia, archivo elegido
    por medio y SHA si Hugging Face lo trae (lfs.sha256).
  · UN resumen en el Chat Director (director_chat.publicar, quien
    «vigia-modelos»), solo si hay novedad de verdad y una vez al día.
  · Para los mejores (≤ 5 al día, sin repetir nada que ya esté en un catálogo o
    en una cola): starseed_memory_root/olas/cola-vigia-<AAAA-MM-DD>.json, una
    tarea por ficha (≤ 3 archivos: el catálogo del área y su prueba) con los
    datos verificados y la regla de licencia en el prompt.

Órdenes: --seco (no escribe colas ni avisa) y --area X (solo esa área).
Estado en ~/.starseed/vigia-modelos.json (última pasada, ids vistos).
La pasada inyectable por completo: la red, el reloj, los archivos y la
publicación van como parámetros; las pruebas (test_vigia_modelos.py) van sin
red y sin tocar el disco del repo. Licencias: nunca «no comercial» como opción
por defecto ni en uso comercial.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time
import urllib.request
from datetime import datetime, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
if AQUI not in sys.path:  # permite importarlo también como scripts.puente.vigia_modelos
    sys.path.insert(0, AQUI)

import vigia_areas as VA  # noqa: E402
import vigia_descubrir as VD  # noqa: E402
import vigia_evaluar as VE  # noqa: E402

RAIZ_REPO = VA.RAIZ_REPO
RUTA_ESTADO = os.path.join(os.path.expanduser("~"), ".starseed", "vigia-modelos.json")
MEDIOS = (("navegador", 1.0), ("mac", 4.5), ("a1", 8.0))
MAX_FICHAS = 5
_MARCAS_FUERA = ("uncensored", "abliterated", "nsfw", "lewd")
_ID_RE = re.compile(r"['\"`]([A-Za-z0-9][A-Za-z0-9_.-]{0,60}/[A-Za-z0-9][A-Za-z0-9_.-]{0,80})['\"`]")
REGLAS_LICENCIA = {
    "libre": "Licencia libre: puede entrar como opción de sistema y usarse comercialmente.",
    "personal": "Licencia NO comercial (investigación o uso personal): NUNCA como opción por defecto, nunca en uso comercial ni comunidad; con la etiqueta visible.",
    "condicionada": "Licencia condicionada: solo si los términos se aceptan explícitamente; nunca por defecto.",
}


def _leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir_atomico(ruta, datos):
    """Escribe JSON de forma atómica: tmp en el mismo directorio + replace."""
    directorio = os.path.dirname(os.path.abspath(ruta))
    os.makedirs(directorio, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=directorio, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
        os.replace(tmp, ruta)
    except BaseException:  # que no quede un tmp a medias
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


def _leer_texto(ruta_completa):
    try:
        with open(ruta_completa, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return None


def _ids_en_colas(raiz):
    """Ids `autor/modelo` que ya viajan en cualquier cola viva (olas y nube)."""
    ids = set()
    for carpeta in (os.path.join(raiz, "starseed_memory_root", "olas"),
                    os.path.join(raiz, "enjambre", "colas")):
        try:
            nombres = sorted(n for n in os.listdir(carpeta) if n.endswith(".json"))
        except OSError:
            continue
        for nombre in nombres:
            texto = _leer_texto(os.path.join(carpeta, nombre)) or ""
            ids |= set(_ID_RE.findall(texto))
    return ids


def _cola_del_dia(raiz, fecha):
    """Tareas ya encoladas hoy (lista; vacía si aún no hay cola de vigía)."""
    datos = _leer_json(os.path.join(raiz, "starseed_memory_root", "olas",
                                    "cola-vigia-%s.json" % fecha), [])
    if isinstance(datos, dict):
        datos = datos.get("tareas") or []
    return datos if isinstance(datos, list) else []


def ids_en_catalogo(ruta_rel, raiz=RAIZ_REPO, leer_texto=None):
    """Ids «autor/repo» que ya aparecen en el catálogo (para no repetir)."""
    texto = leer_texto(ruta_rel) if leer_texto else _leer_texto(os.path.join(raiz, ruta_rel))
    if texto is None:
        return None
    return set(_ID_RE.findall(texto))


def _compat(d):
    """Alias legibles para quien consuma la decisión (sin romper las claves de siempre)."""
    d["aceptado"] = d.get("decision") == "aceptado"
    d["clase_licencia"] = d.get("clase") or "desconocida"
    d["por_defecto"] = d["aceptado"] and d.get("clase") == "libre"
    return d


def evaluar_candidato(candidato, licencias=None, cuantizadores=(), ids_aceptados=(), clases_aceptados=None):
    """Clase + seguridad + mejora → decisión (puro, sin disco ni red).

    Tercero (autor en `cuantizadores`) solo si es la cuantización de un id ya
    aceptado, y hereda su clase de licencia (la mayoría de los GGUF van con
    licencia «other» en Hugging Face).
    Devuelve {"id", "decision", "motivo", "clase", "personal", "gated",
    "tamanio_gb", "archivos"}.
    """
    candidato = candidato or {}
    licencias = licencias or {}
    cid = candidato.get("id") or ""
    bajo = cid.lower()
    for marca in _MARCAS_FUERA:
        if marca in bajo:
            return _compat({"id": cid, "decision": "descartado", "motivo": f"re-subida «{marca}»: fuera",
                            "clase": "desconocida"})
    tags = [t for t in (candidato.get("licencia_hf"), candidato.get("pipeline_tag")) if t]
    clase = VE.clase_licencia(candidato.get("licencia_hf") or "", tags, licencias)
    if (candidato.get("autor") or "") in cuantizadores:
        base = _cuantiza_de(cid, ids_aceptados or ())
        if base is None:
            return _compat({"id": cid, "decision": "descartado",
                            "motivo": f"tercero que no cuantiza un modelo aceptado ({cid.rpartition('/')[2]})",
                            "clase": clase})
        d = _aceptado(candidato, (clases_aceptados or {}).get(base) or clase)
        d["motivo"] = f"cuantizado de un modelo ya aceptado ({base})"
        return d
    if clase == "desconocida":
        return _compat({"id": cid, "decision": "descartado", "motivo": "licencia desconocida: no entra",
                        "clase": clase})
    return _compat(_aceptado(candidato, clase))


_PALABRAS_CUANT = {"gguf", "onnx", "mlx", "mlmodel", "coreml", "int8", "int4",
                   "f16", "bf16", "q2", "q3", "q4", "q8", "k", "s", "m", "l", "uf"}


def _cuantiza_de(id_cand, ids_aceptados):
    """El id aceptado del que probablemente es cuantización (≥ 2 piezas en común).
    Ej.: unsloth/Qwen-Image-2.1-Turbo-GGUF → Qwen/Qwen-Image-2.1-Turbo."""
    piezas = set(re.split(r"[-_.]", (id_cand.rpartition("/")[2] or "").lower())) - _PALABRAS_CUANT
    for base in ids_aceptados:
        piezas_base = set(re.split(r"[-_.]", (base.rpartition("/")[2] or "").lower()))
        if len(piezas & piezas_base) >= 2:
            return base
    return None


def _aceptado(candidato, clase):
    total = sum(a.get("bytes") or 0 for a in candidato.get("archivos") or ())
    return {"id": candidato.get("id") or "", "decision": "aceptado", "motivo": "nuevo y con licencia conocida",
            "clase": clase, "personal": clase == "personal", "gated": bool(candidato.get("gated")),
            "licencia": candidato.get("licencia_hf") or "",
            "tamanio_gb": round(total / 1e9, 2), "archivos": candidato.get("archivos") or []}


def _archivo_por_medio(archivos):
    """Por medio, el archivo cuantizado más grande que cabe (§5) o el más pequeño si ninguno."""
    con_sha = [a for a in archivos or () if a.get("sha256") and a.get("bytes")]
    elegidos = []
    for medio, limite_gb in MEDIOS:
        caben = [a for a in con_sha if a["bytes"] <= limite_gb * 1e9]
        mejor = max(caben, key=lambda a: a["bytes"], default=None) or \
            (min(con_sha, key=lambda a: a["bytes"]) if con_sha else None)
        nombre = (mejor or {}).get("nombre") or ""
        elegidos.append({"medio": medio, "cabe": bool(caben), "archivo": (mejor or {}).get("nombre"),
                         "bytes": (mejor or {}).get("bytes"), "sha256": (mejor or {}).get("sha256"),
                         "motor": VE.motor_para(nombre) if nombre else None})
    return elegidos


def _prueba_de(catalogo, raiz):
    """La prueba que ya exista junto al catálogo, o None (nunca se inventa una ruta)."""
    carpeta, nombre = os.path.split(str(catalogo or ""))
    base = os.path.splitext(nombre)[0]
    pruebas = os.path.join(raiz, carpeta, "__tests__")
    for candidata in (base + ".test.ts", os.path.basename(carpeta) + ".test.ts"):
        ruta = os.path.join(pruebas, candidata)
        if os.path.isfile(ruta):
            return os.path.join(carpeta, "__tests__", candidata).replace(os.sep, "/")
    return None


def _nueva_tarea(aceptado, area, licencia_hf, secuencia, fecha, raiz=None):
    """Ficha de cola para un candidato aceptado: datos verificados + regla de licencia."""
    sha = next((m.get("sha256") for m in (aceptado.get("medios") or [])
                if m.get("sha256")), "")
    _fecha = fecha.strftime("%Y-%m-%d") if hasattr(fecha, "strftime") else str(fecha)
    _compacta = fecha.strftime("%y%m%d") if hasattr(fecha, "strftime") else str(fecha).replace("-", "")
    prompt = (
        f"Añade la ficha verificada de `{aceptado['id']}` al catálogo `{area['catalogo']}` "
        f"(vigía de modelos, architecture/vigia-modelos.md §2-§3 y §6: una entrada con id, autor, "
        f"licencia y clase, y el motor por medio), con su prueba vitest en `__tests__` junto a la "
        f"carpeta del catálogo (≤ 3 archivos en total).\n\n"
        f"Datos verificados el {_fecha}: id `{aceptado['id']}`; área «{area['nombre']}»; licencia "
        f"«{licencia_hf or 'sin declarar'}»; clase: {aceptado['clase'].upper()} "
        f"(≈ {aceptado.get('tamanio_gb', 0)} GB en el repositorio); gated: "
        f"{'sí' if aceptado.get('gated') else 'no'}; SHA256 del archivo elegido (Hugging Face, "
        f"lfs.oid): {sha or 'sin SHA en la API'}.\n"
        f"REGLA DE LICENCIA: {REGLAS_LICENCIA[aceptado['clase']]}\n\n"
        f"Si falta algún dato (motivo, autor, SHA) no lo inventes: escríbelo como «sin dato en la "
        f"API». Nada de claves ni rutas del disco; el nombre de la variable de la clave, si una "
        f"prueba la necesita, es solo HF_TOKEN.\n\n"
        f"REGLAS COMUNES: español con acentos; TypeScript estricto sin `any`; el catálogo solo se "
        f"ensancha con lo verificado aquí. Ejecuta `npx vitest run` sobre el archivo tocado, nunca "
        f"la suite entera; no toques otros módulos ni ejecutes git.")
    return {
        "id": f"VIG{_compacta}-{secuencia}",
        "ola": f"Ola vigía {_fecha}",
        "titulo": f"Catálogo {area['id']}: ficha de {aceptado['id'].rpartition('/')[2]}",
        "area": f"vigia-{area['id']}",
        "archivos": [area["catalogo"]] + ([_prueba_de(area["catalogo"], raiz)]
                                          if raiz and _prueba_de(area["catalogo"], raiz) else []),
        "depende": [],
        "prompt": prompt,
    }


def _refinar_licencia(candidato, nivel, http_get, dormir, token_uso=None):
    """La API de listado no siempre trae la licencia: pide el detalle del repo
    (uno máximo candidato, hasta `nivel["poder"]` peticiones) y recoge el tag
    «license:…». Devuelve el nuevo valor de licencia_hf o None."""
    if nivel["poder"] <= 0:
        return None
    nivel["poder"] -= 1
    dormir(0.5)
    cab = {}
    if token_uso:
        cab["Authorization"] = "Bearer " + token_uso  # jamás el valor fuera de aquí
    try:
        datos = json.loads(http_get(
            f"https://huggingface.co/api/models/{candidato['id']}", headers=cab, timeout=30))
    except Exception:
        return None
    if not isinstance(datos, dict):
        return None
    for tag in datos.get("tags") or []:
        if isinstance(tag, str) and tag.startswith("license:"):
            return tag.split(":", 1)[1]
    return None


def pasada(areas, http_get, raiz=RAIZ_REPO, ahora=None, seco=False, solo_area=None,
           dormir=time.sleep, escribir_atomico=None, estado_ruta=RUTA_ESTADO,
           publicar=None, colas_existentes=None):
    """Una pasada completa; raíz, reloj, red, disco y Chat Director inyectables
    (las pruebas van sin red y sobre una raíz temporal). Devuelve
    {"nv": ruta, "cola": ruta | None, "fichas": n, "resumen": texto | None,
    "estado": estado final}."""
    ahora = ahora or datetime.now(timezone.utc)
    fecha = ahora.strftime("%Y-%m-%d")
    escribir = escribir_atomico or _escribir_atomico
    estado = _leer_json(estado_ruta, {"ultima": None, "aviso": None, "vistos": []})
    vistos = set(estado.get("vistos") or ())
    colas_extra = set(str(i) for i in (colas_existentes or ()))
    ya = vistos | colas_extra | _ids_en_colas(raiz)
    cola_hoy = _cola_del_dia(raiz, fecha)
    por_area, fichas = [], []

    for area in [a for a in areas if not solo_area or a["id"] == solo_area]:
        ids_cat = ids_en_catalogo(area["catalogo"], raiz) or set()
        ya |= ids_cat  # lo del catálogo no vuelve como ficha
        candidatos = VD.descubrir(area, ids_cat, http_get, ahora=ahora, dormir=dormir)

        aceptadas, descartadas = [], []
        nivel = {"poder": 30}  # detalles por área; los que no caben quedan desconocidos
        for cand in candidatos:
            d = evaluar_candidato(cand, area["licencias_conocidas"],
                                  area.get("cuantizadores") or (),
                                  [a["id"] for a in aceptadas],
                                  {a["id"]: a["clase"] for a in aceptadas})
            if d["clase"] == "desconocida":
                lic = _refinar_licencia(cand, nivel, http_get, dormir)
                if lic:
                    cand = {**cand, "licencia_hf": lic}
                    d = evaluar_candidato(cand, area["licencias_conocidas"],
                                          area.get("cuantizadores") or (),
                                          [a["id"] for a in aceptadas],
                                          {a["id"]: a["clase"] for a in aceptadas})

            if d["decision"] == "aceptado" and cand["id"] in ya:
                d = {**d, "decision": "descartado",
                     "motivo": "ya está en el catálogo, en una cola o lo vimos antes"}
                descartadas.append(d)
                continue

            if d["decision"] == "aceptado":
                ya.add(cand["id"])
                d["medios"] = _archivo_por_medio(d["archivos"])
                d.pop("archivos")
                aceptadas.append(d)
                fichas.append((area, d))
            else:
                d.pop("archivos", None)
                descartadas.append(d)

        por_area.append({"area": area["id"], "nombre": area["nombre"],
                         "catalogo": area["catalogo"],
                         "aceptados": aceptadas, "descartados": descartadas})

    escribir(os.path.join(raiz, "starseed_memory_root", "vigia", f"novedades-{fecha}.json"),
             {"fecha": fecha, "generado": ahora.isoformat(), "areas": por_area})

    # — colas y aviso: solo si hay novedad de verdad y no en --seco —
    resumen, ruta_cola = None, None
    # Los mejores primero: libre/condicionada por delante de personal (§4), y sin
    # pasar del tope diario descontando las fichas que ya se encolaron hoy.
    prioridad = {"libre": 3, "condicionada": 2, "personal": 1, "desconocida": 0}
    ordenadas = sorted(fichas, key=lambda par: prioridad.get(par[1].get("clase"), 0), reverse=True)
    cupo = max(0, MAX_FICHAS - len(cola_hoy))
    mejores = ordenadas[:cupo]
    if mejores and not seco:
        ruta_cola = os.path.join(raiz, "starseed_memory_root", "olas", f"cola-vigia-{fecha}.json")
        tareas = list(cola_hoy) + [_nueva_tarea(d, area, d.get("licencia"), sec, ahora, raiz)
                                   for sec, (area, d) in enumerate(mejores, len(cola_hoy) + 1)]
        escribir(ruta_cola, tareas)
        resumen = _resumen(por_area, mejores, fecha)
        if estado.get("aviso") != fecha:
            try:
                if publicar:
                    publicar(resumen)
            except Exception as e:  # el aviso no puede tumbar la pasada
                resumen = f"{resumen}\n(aviso no publicado: {type(e).__name__})"
            else:
                estado["aviso"] = fecha

    estado = {"ultima": ahora.isoformat(), "aviso": estado.get("aviso"),
              "vistos": sorted(ya if not seco else vistos)}
    if not seco:  # --seco no escribe colas, ni avisa, ni marca ids como vistos
        escribir(estado_ruta, estado)
    return {"novedades": None if not por_area else os.path.join(
                raiz, "starseed_memory_root", "vigia", f"novedades-{fecha}.json"),
            "cola": ruta_cola, "fichas": len(mejores) if not seco else 0,
            "resumen": resumen, "estado": estado}


def toca_pasada(estado, ahora=None, horas=20):
    """PURA: ¿la última pasada fue hace más de `horas`? Sin fecha o rota, sí toca (§6)."""
    ahora = ahora or datetime.now(timezone.utc)
    ultima = (estado or {}).get("ultima") if isinstance(estado, dict) else None
    if not ultima:
        return True
    try:
        fecha = datetime.fromisoformat(str(ultima).replace("Z", "+00:00"))
        if fecha.tzinfo is None:
            fecha = fecha.replace(tzinfo=timezone.utc)
        return (ahora - fecha).total_seconds() >= float(horas) * 3600
    except (TypeError, ValueError):
        return True


def ejecutar(areas=None, http_get=None, **kw):
    """Alias de `pasada` con las áreas del contrato cuando no se inyectan."""
    raiz = kw.get("raiz", RAIZ_REPO)
    if areas is None:
        areas = VA.cargar_areas(os.path.join(raiz, "config", "vigia-areas.json"), raiz=raiz)
    return pasada(areas, http_get or _http_get, **kw)


def _resumen(por_area, mejores, fecha):
    """El texto del Chat Director: una línea por área con lo nuevo de verdad."""
    frases = []
    for area in por_area:
        if area["aceptados"] or area["descartados"]:
            ids = ", ".join(f"`{d['id']}`" for d in area["aceptados"][:4]) or "ninguno"
            frases.append(f"· {area['nombre']}: aceptados {ids}; descartados {len(area['descartados'])}")
    fichas = ", ".join(f"`{d['id']}`" for _, d in mejores[:MAX_FICHAS]) or "ninguna"
    return (f"*Vigía de modelos · {fecha}*\n" + "\n".join(frases) +
            f"\nFichas a cola ({len(mejores)}/{MAX_FICHAS} máx.): {fichas}")


def main(argv=None, raiz=RAIZ_REPO, publicar_modulo="director_chat"):
    """CLI: python3 vigia_modelos.py [--seco] [--area X]  (cola y aviso según seco)."""
    parser = argparse.ArgumentParser(description="Vigía de modelos: una pasada al día")
    parser.add_argument("--seco", action="store_true", help="no escribe colas ni avisa")
    parser.add_argument("--area", help="solo esa área (por id de config/vigia-areas.json)")
    args = parser.parse_args(argv)
    areas = VA.cargar_areas(os.path.join(raiz, "config", "vigia-areas.json"))
    publicar = _publicador(publicar_modulo) if publicar_modulo else None
    r = pasada(areas, _http_get, raiz=raiz, seco=args.seco, solo_area=args.area,
               publicar=publicar)
    if args.seco:
        return r
    if r["resumen"]:
        print(r["resumen"])
    return r


def _publicador(modulo):
    """director_chat.publicar en modo perezoso (el módulo puede no estar aquí)."""
    def publicar(texto):
        mod = __import__(modulo)
        mod.publicar(texto, de="vigia-modelos", rol="director", tipo="informe")
    return publicar


def _http_get(url, headers=None, timeout=30):
    """Petición GET a la API pública; HF_TOKEN llega solo en la cabecera (nunca su valor)."""
    cabeceras = dict(headers or {})
    token = os.environ.get("HF_TOKEN")
    if token and "Authorization" not in cabeceras:
        cabeceras["Authorization"] = "Bearer " + token
    peticion = urllib.request.Request(url, headers=cabeceras)
    peticion.add_header("User-Agent", "starseed-vigia-modelos/1.0")
    with urllib.request.urlopen(peticion, timeout=timeout) as respuesta:
        return respuesta.read().decode("utf-8", "replace")


if __name__ == "__main__":
    resultado = main()
    sys.exit(0 if isinstance(resultado, dict) else int(resultado or 0))
