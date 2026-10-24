#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigía de modelos (VGM1016D): director diario de MetaGenesis (architecture/vigia-modelos.md §2-§3, §6).

Una pasada al día: por cada área de `config/vigia-areas.json` (la carga `vigia_areas.cargar_areas`)
llama a `descubrir` y a `evaluar`, y escribe al vuelo `starseed_memory_root/vigia/novedades-<fecha>.json`
ATÓMICO (por área: candidatos aceptados y descartados con su motivo, clase de licencia, archivo
elegido por medio y SHA si lo hay). Publica UN resumen en el Chat Director (quien «vigia-modelos»)
con lo nuevo de verdad, y para lo mejor (≤ 5 al día, sin repetir catálogo ni cola) deja
`starseed_memory_root/olas/cola-vigia-<fecha>.json`: una tarea por ficha (≤ 3 archivos, el catálogo
del área y su prueba) cuyo prompt lleva los datos verificados y la regla de licencia. Estado en
`~/.starseed/vigia-modelos.json` (última pasada e ids vistos).
Las pruebas no tocan la red (cliente HTTP inyectable, respuestas de ejemplo dentro de la prueba) y
de las claves solo se nombra `HF_TOKEN`, jamás su valor. Nada no comercial como opción por defecto
ni en uso comercial:
    python3 scripts/puente/vigia_modelos.py [--seco] [--area imagen]
"""
import argparse
import json
import os
import tempfile
import urllib.request
from datetime import date

try:  # importado como paquete (las pruebas) o como script (`python3 scripts/puente/…`)
    from scripts.puente import director_chat, vigia_areas, vigia_evaluar
except ImportError:
    import director_chat, vigia_areas, vigia_evaluar  # type: ignore

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MEMORIA = os.path.expanduser("~/.starseed/vigia-modelos.json")
VIGIA = os.path.join(RAIZ, "starseed_memory_root", "vigia")
COLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
HF_API = "https://huggingface.co/api/models"
GH_API = "https://api.github.com/repos/%s"
#: §3 «tamaño por medio»: pesos activos que caben por medio (la app nativa se mide en % del disco).
TOPES_GB = {"navegador": 1.0, "pwa": 1.0, "mac": 4.5, "a1": 8.0}
#: §4: la regla que lleva al prompt de cada ficha según su clase de licencia.
REGLA = {"libre": "sin restricción de uso comercial",
         "personal": "OPCIÓN PERSONAL: NUNCA por defecto del sistema ni en uso comercial (§4)",
         "condicionada": "solo si el usuario cumple la condición de la licencia; nunca por defecto (§4)"}


def _leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):  # sin archivo o JSON roto: se empieza de cero
        return defecto


def _escribir_json(ruta, datos):
    """Escritura atómica: candidata en la misma carpeta y `os.replace`; nunca un JSON a medias."""
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    fd, temporal = tempfile.mkstemp(dir=os.path.dirname(ruta), suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=2)
        os.replace(temporal, ruta)
    except BaseException:
        if os.path.exists(temporal):
            os.remove(temporal)
        raise


def _http_json(url, getter=None):
    """Cliente HTTP inyectable. En vivo: la API pública sin clave; si existe `HF_TOKEN`, cabecera (solo su nombre)."""
    if getter is not None:
        return getter(url)
    cabecera = {"User-Agent": "starseed-vigia-modelos/1.0"}
    if os.environ.get("HF_TOKEN"):
        cabecera["Authorization"] = "Bearer %s" % os.environ["HF_TOKEN"]
    with urllib.request.urlopen(urllib.request.Request(url, headers=cabecera), timeout=30) as respuesta:
        return json.load(respuesta)


def _candidato(item, origen):
    """Candidato normalizado: id, licencia (de las etiquetas HF), creación, peso mínimo y hermanos con tamaño."""
    licencia = next((t.split(":", 1)[1] for t in item.get("tags", []) if t.startswith("license:")), "other")
    hermanos = [{"nombre": s.get("rfilename", ""), "tamano_gb": (s.get("size") or 0) / 1e9}
                for s in item.get("siblings", []) if s.get("size")]
    return {"id": item["id"], "licencia": licencia, "etiquetas": list(item.get("tags", [])),
            "creado": item.get("createdAt", ""), "origen": origen,
            "quantizacion": item["id"].split("/", 1)[-1],  # el nombre del repo, para `es_seguro` (§3)
            "sha": "", "tamanio_gb": min((h["tamano_gb"] for h in hermanos), default=0.0),
            "hermanos": hermanos}


def _releases(repo, getter):
    """§2 «motores» y habilidades: última release de GitHub (fecha, SHA y licencia SPDX del repo)."""
    try:
        version = _http_json(GH_API % repo + "/releases/latest", getter)
        dato = _http_json(GH_API % repo, getter)
    except (OSError, ValueError):
        return None  # sin respuesta: hoy nada de ese repo, sin detener la pasada
    licencia = dato.get("license") or {}
    return {"id": repo, "repo_github": repo, "licencia": (licencia.get("spdx_id") or "other").lower(),
            "etiquetas": [], "creado": version.get("published_at", ""), "origen": "github",
            "quantizacion": "", "sha": version.get("target_commitish", ""), "tamanio_gb": 0.0, "hermanos": []}


def descubrir(area, getter=None, cuenta=30):
    """§2: candidatos del área — tendencia (`sort=trendingScore`, NUNCA solo `sort=likes`), familia
    vigilada por autor (`sort=createdAt`) y releases de `repos_github`. Deduplicado por id."""
    hallados = {}
    for tag in area["pipeline_tags"]:
        url = "%s?pipeline_tag=%s&sort=trendingScore&limit=%d" % (HF_API, tag, cuenta)
        for item in _http_json(url, getter) or []:
            hallados.setdefault(item["id"], _candidato(item, "tendencia"))
    for autor in area["autores"]:
        url = "%s?author=%s&sort=createdAt&limit=%d" % (HF_API, autor, cuenta)
        for item in _http_json(url, getter) or []:
            hallados.setdefault(item["id"], _candidato(item, "familia"))
    for repo in area.get("repos_github", []):
        ficha = _releases(repo, getter)
        if ficha:
            hallados.setdefault(ficha["id"], ficha)
    return list(hallados.values())


def evaluar(candidatos, area, vistos, base_aceptada, mejor_actual=None):
    """§3, PURA: clase de licencia, seguridad, novedad y mejora. Devuelve (aceptados, descartados).

    Fuera: los ya vistos en otra pasada, la licencia «desconocida» («no entra», §3), el tercero
    (re-subido o cuantizador) sin un modelo ya aceptado detrás y —si se sabe el mejor actual del
    área— lo que no lo supere en algo medible. `personal` y `condicionada` sí se aceptan COMO
    OPCIÓN con su regla escrita: nunca como opción por defecto ni fuera de uso comercial.
    `base_aceptada` son los ids ya pasados por el filtro, esta pasada incluida (se aumenta aquí).
    """
    aceptados, descartados = [], []
    for c in candidatos:
        c["clase"] = vigia_evaluar.clase_licencia(c["licencia"], c["etiquetas"], area["licencias_conocidas"])
        c["motivo"] = ("ya visto en otra pasada" if c["id"] in vistos else
                       "licencia desconocida: no entra (§3)" if c["clase"] == "desconocida" else
                       "tercero sin modelo base aceptado" if c["origen"] != "github" and
                       c["id"].split("/", 1)[0] in area["cuantizadores"] and
                       not vigia_evaluar.es_seguro(c, base_aceptada) else
                       "no supera al mejor actual" if mejor_actual and
                       not vigia_evaluar.es_mejora(c, mejor_actual) else "")
        if c["motivo"]:
            descartados.append(c)
        else:
            c.pop("motivo", None)
            aceptados.append(c)
            base_aceptada.append(c["id"])  # habilita a sus cuantizadores e hijos
    return aceptados, descartados


def archivo_por_medio(candidato):
    """§3: por medio, el MAYOR de los archivos con tamaño que cabe en su tope."""
    con_tamano = [a for a in candidato.get("hermanos", []) if a.get("tamano_gb", 0) > 0]
    elegido = {}
    for medio, tope in TOPES_GB.items():
        dentro = [a for a in con_tamano if a["tamano_gb"] <= tope]
        if dentro:
            mayor = max(dentro, key=lambda a: a["tamano_gb"])
            elegido[medio] = {"nombre": mayor["nombre"], "gb": round(mayor["tamano_gb"], 2)}
    return elegido


def _en_catalogo(id_candidato, area):
    """Duplicados (§3): los catálogos se comparan por id completo… o por su tronco de familia."""
    try:
        with open(os.path.join(RAIZ, area["catalogo"]), encoding="utf-8") as f:
            texto = f.read()
    except OSError:
        return False
    tronco = id_candidato.split("/", 1)[-1]
    return id_candidato in texto or (len(tronco) > 8 and tronco in texto)


def _en_cola(id_candidato, fecha):
    """True si una cola del vigía ANTERIOR ya nombra al candidato (la de hoy aún no cuenta)."""
    try:
        nombres = os.listdir(COLAS)
    except OSError:
        return False
    for nombre in sorted(nombres):
        if not (nombre.startswith("cola-vigia-") and nombre != "cola-vigia-%s.json" % fecha):
            continue
        try:
            with open(os.path.join(COLAS, nombre), encoding="utf-8") as f:
                if id_candidato in f.read():
                    return True
        except OSError:
            continue
    return False


def _prueba_del_catalogo(catalogo, id_area):
    """La prueba que acompaña a la ficha (≤ 3 archivos): junto al catálogo TS, o con las del puente."""
    if catalogo.endswith(".json"):  # catálogo de configuración: la prueba va con las del puente
        return os.path.join("scripts", "puente", "test_vigia_ficha_%s.py" % id_area)
    carpeta, base = catalogo.rsplit("/", 1) if "/" in catalogo else ("", catalogo)
    return os.path.join(carpeta, "__tests__", base.rsplit(".", 1)[0] + ".test.ts").replace("./", "")


def _tarea(c, fecha, area, numero):
    """Ficha → tarea de la cola del enjambre: datos verificados + regla de licencia en el prompt."""
    id_norm = fecha.replace("-", "")
    motor = vigia_evaluar.motor_para(c["hermanos"][0]["nombre"]) if c["hermanos"] else ""
    return {"id": "vg%s-%s-%d" % (id_norm, area["id"], numero),  # único: fecha + área + orden de hoy
            "ola": "vigia-%s" % fecha,
            "titulo": "Ficha del vigía: %s (%s)" % (c["id"], area["nombre"]),
            "archivos": [area["catalogo"], _prueba_del_catalogo(area["catalogo"], area["id"])],
            "depende": [], "aprobacion": False,
            "prompt": ("Lee AGENTS.md. Ficha VERIFICADA por el vigía de modelos (%s · architecture/vigia-modelos.md"
                       " §3): añade «%s» (origen %s, creado %s, licencia «%s» → clase «%s»: %s) al catálogo"
                       " «%s» y su prueba con los datos de ejemplo.\nMotor: %s. Archivo elegido por medio: %s."
                       "%s\n≤ 3 archivos (el catálogo del área y su prueba), ≤ 120 líneas; pruebas sin red; sin"
                       " `any`; español con acentos; `cursor-pointer` en lo clicable; no toques archivos fuera de"
                       " la lista.") % (
                fecha, c["id"], c["origen"], c["creado"] or "?", c["licencia"], c["clase"],
                REGLA.get(c["clase"], REGLA["condicionada"]), area["catalogo"], motor,
                json.dumps(archivo_por_medio(c), ensure_ascii=False),
                " SHA %s." % c["sha"] if c.get("sha") else "")}


def pasada(areas, getter=None, fecha=None, vistos=None):
    """Una pasada entera, solo en memoria (escribir es de `main`): por área `descubrir`+`evaluar`,
    novedades listas y las fichas de cola (las mejores, ≤ 5 al día, sin repetir catálogo ni cola)."""
    fecha = fecha or date.today().isoformat()
    vistos = set(vistos or ())
    por_area, base_aceptada, fichas = {}, [], []
    for area in areas:
        aceptados, descartados = evaluar(descubrir(area, getter), area, vistos, base_aceptada)
        por_area[area["id"]] = {"nombre": area["nombre"], "catalogo": area["catalogo"],
                                "aceptados": aceptados, "descartados": descartados}
    for area in areas:
        nuevos = [c for c in por_area[area["id"]]["aceptados"]
                  if not _en_catalogo(c["id"], area) and not _en_cola(c["id"], fecha)]
        nuevos.sort(key=lambda c: vigia_evaluar.puntuar(c, {})[0], reverse=True)  # lo mejor primero
        fichas += [(vigia_evaluar.puntuar(c, {})[0], area, c) for c in nuevos]
    fichas.sort(key=lambda t: (-t[0], t[2]["id"]))
    cola = [_tarea(c, fecha, area, i + 1) for i, (_, area, c) in enumerate(fichas[:5])]
    return {"fecha": fecha, "esquema": 1, "areas": por_area,
            "nota": "«aceptados» entra como OPCIÓN: nada por defecto ni comercial salvo licencia «libre»"}, cola


def _resumen(novedades, fichas):
    """El texto del único aviso del día: lo nuevo de verificación por área y las fichas encoladas."""
    filas = ["Vigía de modelos · pasada %s" % novedades["fecha"]]
    for id_area, datos in sorted(novedades["areas"].items()):
        if not (datos["aceptados"] or datos["descartados"]):
            continue  # sin candidatos, sin ruido
        filas.append("· %s: nuevos %d [%s] · descartados %d (p. ej. %s: %s)" % (
            datos["nombre"], len(datos["aceptados"]),
            ", ".join(c["id"] for c in datos["aceptados"][:3]) or "—", len(datos["descartados"]),
            next(iter(datos["descartados"]) or {}, {}).get("id", "—"),
            next(iter(datos["descartados"]) or {}, {}).get("motivo", "—")))
    if fichas:
        filas.append("Encoladas %d: %s" % (len(fichas), "; ".join(t["id"] + " " + t["titulo"] for t in fichas[:3])))
    return "\n".join(filas)


def main(argv=None, getter=None, areas=None):
    """Dirige la pasada del día. `--seco` no escribe colas ni avisa (sí deja novedades y estado);
    `--area X` vigila solo esa área. Deja también el estado (última pasada e ids vistos)."""
    parser = argparse.ArgumentParser(description="Vigía de modelos: una pasada diaria de MetaGenesis (§6).")
    parser.add_argument("--seco", action="store_true", help="no escribe colas ni avisa en el Chat Director")
    parser.add_argument("--area", help="vigilar solo esta área (id de config/vigia-areas.json)")
    args = parser.parse_args(argv)
    areas = vigia_areas.cargar_areas() if areas is None else areas
    if args.area:
        areas = [a for a in areas if a["id"] == args.area] or parser.error("No hay área «%s»" % args.area)
    estado = _leer_json(MEMORIA, {})
    novedades, fichas = pasada(areas, getter, fecha=date.today().isoformat(), vistos=estado.get("vistos") or [])
    _escribir_json(os.path.join(VIGIA, "novedades-%s.json" % novedades["fecha"]), novedades)
    estado = {"ultima_pasada": novedades["fecha"], "anunciado": estado.get("anunciado"),
              "vistos": sorted(set(list(estado.get("vistos") or []) +
                                   [c["id"] for datos in novedades["areas"].values() for c in datos["aceptados"]]))}
    if not args.seco:  # UN resumen al día (§6): si ya avisó hoy, no repite
        if estado["anunciado"] != novedades["fecha"]:
            mensaje = director_chat.publicar(_resumen(novedades, fichas), de="vigia-modelos",
                                             rol="director", tipo="informe")
            estado["anunciado"], estado["ultimo_aviso"] = novedades["fecha"], mensaje["id"]
        if fichas:
            _escribir_json(os.path.join(COLAS, "cola-vigia-%s.json" % novedades["fecha"]),
                           {"ola": "vigia-%s" % novedades["fecha"], "tareas": fichas})
    _escribir_json(MEMORIA, estado)
    print(_resumen(novedades, fichas))
    return novedades, fichas


if __name__ == "__main__":
    main()
