#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigía de modelos · director diario (Ola 1016M · VGM1016Db · architecture/vigia-modelos.md §2-§6).

Una pasada al día: por cada área de `config/vigia-areas.json` llama a `descubrir` y `evaluar`,
deja `starseed_memory_root/vigia/novedades-<AAAA-MM-DD>.json` de forma atómica, publica UN
resumen en el Chat Director y encola como mucho 5 fichas del día. Estado en
`~/.starseed/vigia-modelos.json`. Todo es inyectable: las pruebas no tocan red ni disco real.

  python3 scripts/puente/vigia_modelos.py [--seco] [--area imagen]

`--seco` no escribe nada (ni novedades, ni colas, ni estado) ni avisa: solo resume.
Nada no comercial (`personal`) entra como opción por defecto ni en uso comercial.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import director_chat as DC  # noqa: E402
import vigia_areas as VA  # noqa: E402
import vigia_descubrir as VD  # noqa: E402
import vigia_evaluar as VE  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REL_NOVEDADES = "starseed_memory_root/vigia"
REL_OLAS = "starseed_memory_root/olas"
ESTADO = os.path.expanduser("~/.starseed/vigia-modelos.json")
QUIEN = "vigia-modelos"
TOPE_FICHAS = 5
MEDIOS = (("navegador", 1.0), ("pwa", 1.0), ("mac", 4.5), ("a1", 8.0))
MARCAS_FUERA = ("uncensored", "abliterated", "nsfw", "lewd")
_RE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{1,}/[A-Za-z0-9][A-Za-z0-9_.-]{1,}")


def _leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _texto(ruta):
    try:
        with open(ruta, encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


def _escribir_json(ruta, datos):
    """Escritura atómica: temporal en la misma carpeta y os.replace (nunca medio JSON)."""
    carpeta = os.path.dirname(ruta) or "."
    os.makedirs(carpeta, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".vigia-", suffix=".json", dir=carpeta)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(datos, f, indent=2, ensure_ascii=False, sort_keys=True)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, ruta)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def cargar_estado(ruta=ESTADO):
    d = _leer_json(ruta, {})
    d = d if isinstance(d, dict) else {}
    d.setdefault("esquema", 1)
    d.setdefault("ultima_pasada", None)
    d.setdefault("ids_vistos", {})
    d.setdefault("fichas_por_fecha", {})
    return d


def guardar_estado(estado, ruta=ESTADO):
    _escribir_json(ruta, estado)
    return estado


def http_get(url, headers=None, timeout=30):
    """Cliente HTTP real, inyectable; solo reenvía cabeceras (aquí no se lee ninguna clave)."""
    req = urllib.request.Request(url, headers=dict(headers or {}))
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def ruta_novedades(fecha, raiz=RAIZ):
    return os.path.join(raiz, REL_NOVEDADES, "novedades-%s.json" % fecha)


def ruta_cola(fecha, raiz=RAIZ):
    return os.path.join(raiz, REL_OLAS, "cola-vigia-%s.json" % fecha)


def ids_catalogo(texto, area):
    """Ids de HF citados en el catálogo, solo de autores/cuantizadores del área (evita rutas del repo)."""
    orgs = {a.casefold() for a in (area.get("autores") or []) + (area.get("cuantizadores") or [])}
    return sorted({m.group(0).rstrip(".,;:") for m in _RE_ID.finditer(texto or "")
                   if m.group(0).split("/")[0].casefold() in orgs})


def texto_colas(raiz=RAIZ):
    """Todo el texto de las colas vivas: una ficha ya encolada no se repite."""
    carpeta = os.path.join(raiz, REL_OLAS)
    try:
        return "\n".join(_texto(os.path.join(carpeta, n))
                         for n in sorted(os.listdir(carpeta)) if n.endswith(".json"))
    except OSError:
        return ""


def ya_conocido(ident, texto_catalogo="", colas=""):
    """True si el nombre del candidato ya aparece (palabra completa) en el catálogo o en una cola.

    La frontera evita el falso positivo de la familia: «Qwen-Image-2.1» está en el catálogo y
    «Qwen-Image-2.1-Turbo» es justo la novedad que hay que encontrar (§2, hermanos).
    """
    nombre = str(ident or "").rpartition("/")[2]
    if not nombre:
        return False
    patron = r"(?<![A-Za-z0-9_.-])%s(?![A-Za-z0-9_.-])" % re.escape(nombre)
    return bool(re.search(patron, (texto_catalogo or "") + "\n" + (colas or "")))


def _gb(archivo):
    return round(float(archivo.get("bytes") or 0) / 1e9, 3)


def archivo_por_medio(candidato, medio, tope):
    """El archivo más pequeño que cabe en el medio, con motor y SHA si la API lo da."""
    validos = []
    for a in candidato.get("archivos") or ():
        if not a.get("bytes"):
            continue
        prueba = {"id": candidato.get("id", ""), "tamanio_gb": _gb(a),
                  "quantizacion": a.get("nombre", ""), "formato": os.path.splitext(a.get("nombre", ""))[1]}
        if VE.cabe_en(prueba, {"tipo": medio, "espacio_gb": tope}).get("quepa"):
            validos.append(a)
    if not validos:
        return None
    a = min(validos, key=_gb)
    return {"archivo": a.get("nombre"), "bytes": a.get("bytes"), "sha256": a.get("sha256"),
            "gb": _gb(a), "motor": VE.motor_para(a.get("nombre", ""))}


def evaluar_candidato(candidato, area, catalogo_ids=()):
    """Evalúa un candidato: licencia (§3), seguridad, tamaño por medio, motor, SHA y puntuación."""
    ident = candidato.get("id") or ""
    if any(m in ident.lower() for m in MARCAS_FUERA):
        return {"aceptado": False, "id": ident,
                "motivo": "re-subida sin garantías (uncensored/abliterated/nsfw/lewd)"}
    clase = VE.clase_licencia(candidato.get("licencia_hf", ""), candidato.get("tags") or [],
                              area.get("licencias_conocidas") or VE.LICENCIAS_CONOCIDAS)
    if clase == "desconocida" and not candidato.get("licencia_hf"):
        # La lista de HF no siempre trae «license»: se infiere del id con la tabla del evaluador
        # (Qwen-Image-* → qwen-research → personal) en vez de descartar lo que sí sabemos.
        inferida = getattr(VE, "_licencia_desde_id", lambda _: "")(ident)
        clase = VE.clase_licencia(inferida, [], area.get("licencias_conocidas") or VE.LICENCIAS_CONOCIDAS)
        candidato = dict(candidato, licencia_hf=inferida or candidato.get("licencia_hf", ""))
    if clase == "desconocida":
        return {"aceptado": False, "id": ident, "clase_licencia": clase,
                "motivo": "licencia desconocida: no entra (§3)"}
    if not any(a.get("bytes") for a in candidato.get("archivos") or ()):
        return {"aceptado": False, "id": ident, "clase_licencia": clase,
                "motivo": "sin archivos verificables (tamaño/SHA): no entra"}
    medios = {m: archivo_por_medio(candidato, m, tope) for m, tope in MEDIOS}
    if not any(medios.values()):
        return {"aceptado": False, "id": ident, "clase_licencia": clase,
                "motivo": "no cabe en ningún medio (§3)"}
    principal = medios.get("mac") or next(v for v in medios.values() if v)
    if "capas-astraura.json" in (area.get("catalogo") or "") and not principal.get("sha256"):
        return {"aceptado": False, "id": ident, "clase_licencia": clase,
                "motivo": "capa sin SHA real (lfs.oid): no entra (§6)"}
    puntos, motivo = VE.puntuar(candidato, None)
    return {"aceptado": True, "id": ident, "autor": candidato.get("autor", ""),
            "creado": candidato.get("creado"), "licencia_hf": candidato.get("licencia_hf", ""),
            "clase_licencia": clase, "predeterminado": clase == "libre", "puntuacion": puntos,
            "motivo": motivo, "medios": medios, "archivo": principal.get("archivo"),
            "sha256": principal.get("sha256"), "bytes": principal.get("bytes"),
            "motor": principal.get("motor"), "likes": candidato.get("likes", 0),
            "trending": candidato.get("trending", 0), "gated": bool(candidato.get("gated", False))}


def ruta_prueba(catalogo):
    """La prueba que acompaña al catálogo: su carpeta __tests__ y el mismo nombre."""
    carpeta, base = os.path.split(catalogo)
    tallo = os.path.splitext(base)[0]
    return "%s/__tests__/%s.test.ts" % (carpeta, tallo) if carpeta else "__tests__/%s.test.ts" % tallo


def ficha(area, ev, fecha, n):
    """Tarea de cola para añadir una ficha verificada (catálogo + prueba, ≤ 3 archivos)."""
    reglas = {"libre": "puede ser opción por defecto del sistema.",
              "personal": "solo uso personal: jamás por defecto ni en uso comercial.",
              "condicionada": "solo si se cumple su condición; nunca por defecto del sistema."}
    medios = ev.get("medios") or {}
    cabidas = "; ".join("%s: %s" % (m, v.get("archivo")) for m, v in medios.items() if v) or "ninguno"
    gb = (medios.get("mac") or next((v for v in medios.values() if v), {})).get("gb", "?")
    prompt = (
        "Contexto. El vigía de modelos (architecture/vigia-modelos.md) verificó el %s: `%s` "
        "(autor %s, creado %s), licencia `%s` de clase «%s»; %s. Archivo principal: `%s` (%s GB, "
        "motor %s); SHA256 %s. Cabe en: %s. Fuente: https://huggingface.co/%s\n\n"
        "Haz: añade su ficha al catálogo `%s` con los datos verificados (no inventes SHA ni tamaños) "
        "y su prueba en `%s` (ids únicos, licencia y clase, archivo y SHA anotados). No toques nada "
        "más. Regla de licencia: %s Sin emojis; comentarios en español con acentos; ≤120 líneas."
    ) % (fecha, ev.get("id"), ev.get("autor") or "desconocido", ev.get("creado") or "sin fecha",
         ev.get("licencia_hf") or "?", ev.get("clase_licencia"), ev.get("motivo") or "",
         ev.get("archivo") or "sin archivo", gb, ev.get("motor") or "?",
         ev.get("sha256") or "sin SHA de LFS (no inventarlo)", cabidas, ev.get("id"),
         area["catalogo"], ruta_prueba(area["catalogo"]), reglas.get(ev.get("clase_licencia"), "desconocida: no entra."))
    return {"id": "VIG%s%d" % (fecha.replace("-", "")[2:], n), "ola": "Vigía de modelos · %s" % fecha,
            "titulo": "Ficha verificada: %s (%s)" % (ev.get("id"), area["nombre"]),
            "archivos": [area["catalogo"], ruta_prueba(area["catalogo"])], "depende": [],
            "importancia": "capacidad", "agente": QUIEN, "prompt": prompt}


def _publicar_por_defecto(texto, de=QUIEN, rol="director", tipo="informe", tarea=None):
    return DC.publicar(texto, de=de, rol=rol, tipo=tipo, tarea=tarea)


#: Alias públicos (las pruebas pueden inyectarlos o parchearlos en `pasada`).
descubrir = VD.descubrir
evaluar = evaluar_candidato


def pasada(ahora=None, areas=None, descubrir=None, evaluar=None, http=None,
           raiz=RAIZ, estado=None, ruta_estado=None, publicar=None,
           seco=False, area=None):
    """Una pasada completa. Todo inyectable (red, reloj, áreas, evaluador, chat, estado, raíz)."""
    descubrir = globals()["descubrir"] if descubrir is None else descubrir
    evaluar = globals()["evaluar"] if evaluar is None else evaluar
    http = http_get if http is None else http
    publicar = _publicar_por_defecto if publicar is None else publicar
    momento = ahora or datetime.now(timezone.utc)
    fecha = momento.date().isoformat()
    todas = VA.cargar_areas() if areas is None else list(areas)
    if area:
        todas = [a for a in todas if a["id"] == area]
        if not todas:
            return {"ok": False, "motivo": "área desconocida: %s" % area, "areas": []}
    if ruta_estado is None:
        ruta_estado = ESTADO if os.path.abspath(raiz) == os.path.abspath(RAIZ) \
            else os.path.join(raiz, ".starseed", "vigia-modelos.json")
    estado = estado if isinstance(estado, dict) else cargar_estado(ruta_estado)
    visto = estado.get("ids_vistos")
    if not isinstance(visto, dict):
        visto = {}
    colas = texto_colas(raiz)
    doc = {"esquema": 1, "fecha": fecha, "generado": momento.astimezone().isoformat(), "areas": {}}
    if not seco:
        previo = _leer_json(ruta_novedades(fecha, raiz), {})
        if isinstance(previo, dict) and isinstance(previo.get("areas"), dict):
            doc["areas"] = previo["areas"]  # --area no borra lo que ya dijo de otras áreas
    nuevos, total, vistos = [], 0, set()
    for a in todas:
        cat = _texto(os.path.join(raiz, a["catalogo"]))
        ids = ids_catalogo(cat, a)
        aceptados, descartados, evaluados = [], [], set()
        try:
            try:
                candidatos = descubrir(a, ids, http, ahora=momento)
            except TypeError:  # un descubridor inyectado puede no aceptar `ahora`
                candidatos = descubrir(a, ids, http)
        except Exception as e:  # noqa: BLE001 — una fuente caída no tumba la pasada
            candidatos = []
            descartados.append({"id": "", "motivo": "descubrir falló: %s" % type(e).__name__})
        for c in candidatos or ():
            ident = c.get("id") or ""
            if not ident:
                continue
            vistos.add(ident)
            if ya_conocido(ident, cat, colas):
                descartados.append({"id": ident, "motivo": "ya está en el catálogo o en una cola"})
                continue
            try:
                try:
                    ev = evaluar(c, a, ids) or {"aceptado": False, "id": ident, "motivo": "evaluación vacía"}
                except TypeError:  # un evaluador inyectado puede tener dos parámetros
                    ev = evaluar(c, a) or {"aceptado": False, "id": ident, "motivo": "evaluación vacía"}
            except Exception as e:  # noqa: BLE001
                ev = {"aceptado": False, "id": ident, "motivo": "evaluación falló: %s" % type(e).__name__}
            if not isinstance(ev, dict):
                ev = {"aceptado": False, "id": ident, "motivo": "evaluación sin forma de ficha"}
            evaluados.add(ident)
            ev.setdefault("id", ident)
            ev["nuevo"] = ident not in visto
            if ev.get("aceptado"):
                aceptados.append(ev)
                if ev["nuevo"]:
                    nuevos.append((a, ev))
            else:
                descartados.append(ev)
        total += len(aceptados)
        previa = doc["areas"].get(a["id"]) if isinstance(doc["areas"].get(a["id"]), dict) else {}
        tocados = evaluados
        # Lo aceptado antes en el día no se pierde al repetir la pasada (ya estará en la cola).
        aceptados += [p for p in previa.get("aceptados") or [] if p.get("id") not in tocados]
        doc["areas"][a["id"]] = {"nombre": a["nombre"], "catalogo": a["catalogo"],
                                 "aceptados": aceptados, "descartados": descartados}
    previas = _leer_json(ruta_cola(fecha, raiz), [])
    previas = previas if isinstance(previas, list) else []
    cupo = max(0, TOPE_FICHAS - len(previas))
    ordenados = sorted(nuevos, key=lambda p: (-p[1].get("puntuacion", 0), -p[1].get("trending", 0),
                                              p[1].get("clase_licencia") != "libre", p[1].get("id", "")))
    elegidos, ya_elegido = [], set()
    for a, ev in ordenados:
        if len(elegidos) >= cupo:
            break
        if ev.get("id") in ya_elegido:
            continue  # el mismo modelo en dos áreas no se encola dos veces
        ya_elegido.add(ev.get("id"))
        elegidos.append((a, ev))
    fichas = [ficha(a, ev, fecha, len(previas) + i) for i, (a, ev) in enumerate(elegidos, 1)]
    if not seco:
        _escribir_json(ruta_novedades(fecha, raiz), doc)
        if fichas:
            _escribir_json(ruta_cola(fecha, raiz), previas + fichas)
        visto.update({i: fecha for i in vistos})
        estado["ids_vistos"] = visto
        por_fecha = estado.get("fichas_por_fecha")
        por_fecha = por_fecha if isinstance(por_fecha, dict) else {}
        por_fecha[fecha] = len(previas) + len(fichas)
        estado["fichas_por_fecha"] = por_fecha
        estado["ultima_pasada"] = momento.astimezone().isoformat()
        previas_areas = estado.get("areas")
        previas_areas = previas_areas if isinstance(previas_areas, list) else []
        estado["areas"] = sorted(set(previas_areas) | {a["id"] for a in todas})
        guardar_estado(estado, ruta_estado)
        avisado = False
        if nuevos:
            lineas = ["- %s: %s (%s)" % (a["nombre"], ev.get("id"), ev.get("clase_licencia"))
                      for a, ev in nuevos[:10]]
            try:
                publicar("Vigía de modelos %s · %d área(s) · %d novedad(es) · %d ficha(s) encolada(s):\n%s"
                         % (fecha, len(todas), len(nuevos), len(fichas), "\n".join(lineas)),
                         de=QUIEN, rol="director", tipo="informe", tarea="VGM1016Db")
                avisado = True
            except Exception:  # noqa: BLE001 — un chat caído no invalida la pasada
                avisado = False
    else:
        avisado = False
    return {"ok": True, "fecha": fecha, "seco": bool(seco), "areas": [a["id"] for a in todas],
            "aceptados": total, "nuevos": len(nuevos), "fichas": [f["id"] for f in fichas],
            "avisado": avisado,
            "novedades": ruta_novedades(fecha, raiz),
            "cola": None if seco or not fichas else ruta_cola(fecha, raiz),
            "mensaje": "Vigía %s: %d aceptado(s), %d nuevo(s), %d ficha(s)%s." % (
                fecha, total, len(nuevos), len(fichas), " (seco)" if seco else "")}


def main(argv=None):
    p = argparse.ArgumentParser(description="Vigía de modelos de MetaGenesis (una pasada)")
    p.add_argument("--seco", action="store_true",
                   help="no escribe novedades, colas ni estado, y no avisa")
    p.add_argument("--area", help="solo esta área de config/vigia-areas.json")
    args = p.parse_args(argv)
    r = pasada(seco=args.seco, area=args.area)
    print(r.get("mensaje") or r.get("motivo") or "")
    return 0 if r.get("ok") else 2


#: Nombre que usan otros directores de MetaGenesis para «una pasada».
ciclo = pasada


if __name__ == "__main__":
    raise SystemExit(main())
