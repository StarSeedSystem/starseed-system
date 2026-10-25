#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigía de modelos: MetaGenesis busca, evalúa y deja fichas (Ola 1016M · VGM1016D).

Director diario del contrato architecture/vigia-modelos.md §2-§6: por cada área de
`config/vigia-areas.json` llama a `descubrir` (Hugging Face + GitHub) y a `evaluar`
(`vigia_evaluar`); escribe `starseed_memory_root/vigia/novedades-<fecha>.json` de forma
atómica (aceptados y descartados con su motivo, clase de licencia, archivo por medio y
SHA según `lfs.oid`), publica UN resumen en el Chat Director (`director_chat.publicar`,
quien «vigia-modelos») y, para los mejores (≤ 5 al día, sin repetir lo que ya está en
catálogo, en una cola o en el estado), crea `starseed_memory_root/olas/cola-vigia-<fecha>.json`
con una tarea por ficha (≤ 3 archivos: el catálogo del área y su prueba), cuyo prompt lleva
los datos verificados y la regla de licencia. Estado en `~/.starseed/vigia-modelos.json`
(última pasada e ids vistos). Órdenes: `--seco` (no escribe colas ni avisa) y `--area X`.
Pruebas con todo inyectado: `test_vigia_modelos.py`. Las claves nunca salen del proceso:
solo el NOMBRE `HF_TOKEN` entra como cabecera de la API pública.
"""
from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import director_chat
import vigia_areas
import vigia_evaluar
from capas_renovar import _sha256_lfs as sha_lfs

RAIZ_REPO = Path(__file__).resolve().parents[2]
ESTADO = Path(os.path.expanduser("~/.starseed/vigia-modelos.json"))
HF = "https://huggingface.co/api"
GH = "https://api.github.com/repos"
MAX_FICHAS_DIA = 5
TOPE_VISTOS = 2000
TOPE_MEDIO_GB = {"navegador": 1.0, "pwa": 1.0, "mac": 4.5, "a1": 8.0}  # §3: tamaño por medio
EXT_PESOS = (".gguf", ".onnx", ".safetensors", ".cact")
PROHIBIDAS = ("uncensored", "abliterated", "nsfw", "lewd")  # §3: seguridad
_GENERICA = re.compile(r"gguf|onnx|mlx|mlmodel|quantiz|cuantiz|tokenizer|encodec|emb|bin|\dbit")


def _get(url, getter=None):
    """Una petición JSON a la API pública; `getter(url)` inyectable para las pruebas sin red."""
    if getter is not None:
        return getter(url)
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": "starseed-vigia-1016M"})
    token = os.environ.get("HF_TOKEN")  # solo el NOMBRE; el valor jamás se imprime ni viaja
    if token:
        req.add_header("Authorization", "Bearer %s" % token)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def _licencia_de(raw):
    """La etiqueta `license:<nombre>` de Hugging Face del candidato, o cadena vacía."""
    for t in raw.get("tags") or []:
        if str(t).lower().startswith("license:"):
            return str(t).split(":", 1)[1].lower()
    return ""


def _ya_esta(idm, texto):
    """Pura: ¿el id ya está (entre comillas) en el texto de catálogos y colas?

    Entre comillas y no a secas: `Qwen/Qwen-Image-2.1` es prefijo de
    `Qwen/Qwen-Image-2.1-Turbo` y un substring a secas confundiría el Turbo
    con la versión que ya tenemos (§3 · duplicados).
    """
    bajo = str(idm).casefold()
    texto = str(texto).casefold()
    return ('"%s"' % bajo) in texto or ("'%s'" % bajo) in texto


def descubrir_hf(area, getter=None):
    """Los candidatos de un área en la API pública de Hugging Face (§2): tendencia por
    etiqueta de pipeline (NUNCA solo `sort=likes`), repos nuevos de los autores vigilados
    y cuantizados de los cuantizadores conocidos. Una consulta sin red no tumba el resto."""
    crudos, urls = {}, []
    for t in area.get("pipeline_tags") or []:
        urls.append("%s/models?pipeline_tag=%s&sort=trendingScore&limit=30" % (HF, t))
    for autor in (area.get("autores") or []) + (area.get("cuantizadores") or []):
        urls.append("%s/models?author=%s&sort=createdAt&limit=20" % (HF, autor))
    for url in urls:
        try:
            datos = _get(url, getter)
        except Exception:
            continue  # sin red en esa ronda: sigue; el fallo no deja el área vacía por culpa de una
        for m in datos if isinstance(datos, list) else []:
            if isinstance(m, dict) and m.get("id"):
                crudos[m["id"]] = m
    return list(crudos.values())


def descubrir_repos(area, getter=None):
    """La última publicación de cada repo de GitHub del área (§2: motores y versiones)."""
    salidas = []
    for repo in area.get("repos_github") or []:
        try:
            datos = _get("%s/%s/releases/latest" % (GH, repo), getter)
        except Exception:
            continue
        if isinstance(datos, dict) and datos.get("tag_name"):
            salidas.append({"id": "gh:%s" % repo, "repo": repo, "etiqueta": str(datos["tag_name"])})
    return salidas


def pesos_del_arbol(arbol):
    """Pura: los pesos comprensibles de un árbol de Hugging Face, con su SHA real según
    `lfs.oid` (§6: si no se obtiene, no entra), su tamaño y ordenados del grande al pequeño."""
    pesos = []
    for e in arbol if isinstance(arbol, list) else []:
        if not isinstance(e, dict):
            continue
        ruta = str(e.get("path") or "")
        baja = ruta.casefold()
        if not baja.endswith(EXT_PESOS) or "mmproj" in baja:
            continue  # solo pesos; mmproj es el proyector multimodal, no el modelo
        lfs = e.get("lfs") if isinstance(e.get("lfs"), dict) else {}
        pesos.append({"archivo": ruta, "sha256": sha_lfs(e),
                      "bytes": int(e.get("size") or lfs.get("size") or 0)})
    return sorted(pesos, key=lambda p: -p["bytes"])


def archivos_por_medio(pesos):
    """Pura (§3): por medio, el archivo MÁS grande que cabe en su tope — la mejor calidad
    que cabe; si ninguno cabe, `None` y esa neurona usa el modelo de la malla (§5)."""
    salidas = {}
    for medio, tope in TOPE_MEDIO_GB.items():
        elegido = next((p for p in pesos if p["bytes"] <= int(tope * 1e9)), None)
        salidas[medio] = dict(elegido) if elegido else None
    return salidas


def clasificar_candidato(raw, area):
    """Pura (§3): ficha básica del candidato, o (None, motivo) por seguridad, licencia o filtros."""
    idm = str(raw.get("id") or "")
    tags = [str(t) for t in raw.get("tags") or []]
    baja = idm.casefold()
    mala = next((p for p in PROHIBIDAS if p in baja or any(p in t.casefold() for t in tags)), None)
    if mala:
        return None, "seguridad: contiene «%s» (fuera por defecto, §3)" % mala
    etiqueta = _licencia_de(raw)
    clase = vigia_evaluar.clase_licencia(etiqueta, tags, area["licencias_conocidas"])
    if clase == "desconocida":
        return None, "licencia «%s» sin clase conocida (no entra, §3)" % (etiqueta or "sin datos")
    etiq = [e.casefold() for e in (area["filtros"].get("etiquetas") or [])]
    if etiq and not any(t.casefold() in etiq for t in tags):
        return None, "no lleva ninguna de las etiquetas que pide el área"
    total = raw.get("safetensors", {}).get("total") if isinstance(raw.get("safetensors"), dict) else None
    tope_b = area["filtros"].get("max_parametros_b")
    if tope_b and isinstance(total, (int, float)) and total / 1e9 > tope_b:
        return None, "%.1f B de parámetros > tope del área (≤ %s B)" % (total / 1e9, tope_b)
    return {"id": idm, "autor": idm.split("/")[0], "creado": str(raw.get("createdAt") or ""),
            "licencia": etiqueta, "clase": clase, "archivos": {}, "motor": "",
            "puntuacion": 0, "motivo": ""}, ""


def completar_ficha(ficha, getter=None):
    """Junta la ficha con lo que la API de HF dice del repo: archivo por medio, SHA (`lfs.oid`,
    §6: sin él la ficha NO va a cola) y motor según la extensión del archivo elegido."""
    try:
        pesos = pesos_del_arbol(_get("%s/models/%s/tree/main" % (HF, ficha["id"]), getter))
    except Exception:
        pesos = []
    if pesos:
        ficha["archivos"] = archivos_por_medio(pesos)
        elegido = ficha["archivos"].get("mac") or ficha["archivos"].get("navegador") or pesos[0]
        if elegido:
            ficha["motor"] = vigia_evaluar.motor_para(elegido["archivo"])
            ficha["bytes_mac"] = elegido["bytes"]
        sin_sha = [p["archivo"] for p in pesos if not p["sha256"]]
        if sin_sha:
            ficha["pesos_sin_sha"] = sin_sha[:3]
    ficha["puntuacion"] = vigia_evaluar.puntuar({"id": ficha["id"],
                                                "tamanio_gb": ficha.get("bytes_mac", 0) / 1e9})[0]
    ficha["motivo"] = "clase %s · motor %s · %s" % (
        ficha["clase"], ficha["motor"] or "s/d", ficha["puntuacion"])
    return ficha


def _palabras(texto):
    """El texto como conjunto de palabras alfanuméricas, sin piezas genéricas de cuantización."""
    return {w for w in re.findall(r"[a-z0-9]+", str(texto).casefold()) if not _GENERICA.search(w)}


def _tramo(idm):
    """El nombre del repo sine el autor (`unsloth/Q##-GGUF` → `Q##-GGUF`): el autor de un
    cuantizador no es familia de nadie."""
    return str(idm).split("/", 1)[-1]


def _cuantiza(id_cuantizador, ids_base):
    """Pura: ¿un repo de un cuantizador comparte familia con alguna base ya aceptada?
    (El Turbo-GGUF de unsloth comparte con Qwen-Image-2.1; un re-subido ajeno, no, §3.)"""
    palabras_q = _palabras(_tramo(id_cuantizador))
    return any(palabras_q & _palabras(_tramo(base)) for base in ids_base)


def evaluar_area(area, crudos, getter=None):
    """El rango del §3 sobre los candidatos crudos de un área: (aceptados, descartados).

    · Los re-subidos con palabras prohibidas, licencia desconocida o filtros que no pasan,
      al `descartados` con su motivo.
    · Los originales de autores vigilados entran; los cuantizadores de la lista solo si
      cuantizan una base YA aceptada de esta pasada; cualquier otro autor es un tercero y no entra.
    · Las publicaciones de GitHub van a `descartados` como aviso: la licencia del motor
      no consta en la tabla común y se repasa a mano.
    """
    autores = {a.casefold() for a in area.get("autores") or []}
    cuantizadores = {c.casefold() for c in area.get("cuantizadores") or []}
    aceptados, descartados = [], []
    for raw in crudos:
        if not isinstance(raw, dict) or not raw.get("id"):
            continue
        if raw.get("repo"):  # publicaciones de GitHub (descubrir_repos)
            descartados.append({"id": raw["id"], "etiqueta": raw.get("etiqueta", ""),
                                "motivo": "publicación de %s: repásala a mano (§2 motores; licencia sin clase)" % raw["repo"]})
            continue
        ficha, motivo = clasificar_candidato(raw, area)
        autor = str(raw.get("id", "")).split("/")[0].casefold()
        if ficha is None:
            descartados.append({"id": raw["id"], "motivo": motivo})
        elif autor in autores:
            aceptados.append(completar_ficha(ficha, getter))
        elif autor in cuantizadores:
            if _cuantiza(ficha["id"], [a["id"] for a in aceptados]):
                aceptados.append(completar_ficha(ficha, getter))
            else:
                descartados.append({"id": ficha["id"],
                                    "motivo": "re-subida de un tercero que no cuantiza nada ya aceptado (§3)"})
        else:
            descartados.append({"id": ficha["id"], "motivo": "autor fuera de la lista vigilada (tercero, §3)"})
    return aceptados, descartados


# ── disco: estado, lectura de catálogos/colas y escritura atómica ───────────


def _leer_estado(ruta=ESTADO):
    """El estado previo (última pasada e ids vistos) o un diccionario limpio si no hay."""
    try:
        with open(ruta, encoding="utf-8") as f:
            datos = json.load(f)
    except (OSError, ValueError):
        datos = {}
    datos = datos if isinstance(datos, dict) else {}
    vistos = datos.get("vistos") if isinstance(datos.get("vistos"), dict) else {}
    return datos, {str(k) for k in vistos}


def _escribir_atomico(ruta, datos):
    """Escribe de una pieza (archivo temporal + `os.replace`): una lectura a medias nunca ve basura."""
    ruta = Path(ruta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    tmp = ruta.with_suffix(ruta.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)
    os.replace(tmp, ruta)


def _texto_catalogos(areas, raiz):
    """El texto de los catálogos de las áreas (relativos al repo); el que aún no existe, no influye."""
    partes = []
    for a in areas:
        try:
            partes.append((Path(raiz) / a["catalogo"]).read_text(encoding="utf-8"))
        except OSError:
            continue
    return " ".join(partes)


def _texto_colas(olas):
    """El texto de las colas vivas: lo encolado no vuelve a avisar ni a colarse (§6)."""
    partes = []
    if Path(olas).is_dir():
        for c in sorted(Path(olas).glob("cola-*.json")):
            try:
                partes.append(c.read_text(encoding="utf-8"))
            except OSError:
                continue
    return " ".join(partes)


def _tareas_de_cola(ruta):
    """Las tareas ya en una cola existente (para continuar sus ids sin pisarlas)."""
    try:
        datos = json.loads(Path(ruta).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    lista = datos if isinstance(datos, list) else datos.get("tareas") if isinstance(datos, dict) else []
    return [t for t in lista if isinstance(t, dict) and t.get("id")]


def archivos_de_tarea(catalogo):
    """Pura: los archivos de una ficha, ≤ 3 — el catálogo del área y su prueba `__tests__/<base>.test.ts`."""
    ruta = Path(catalogo)
    return [catalogo, str(ruta.parent / "__tests__" / ("%s.test.ts" % ruta.stem))]


def prompt_de_ficha(f):
    """Pura: el prompt de la tarea lleva los datos VERIFICADOS y la regla de licencia (nada se improvisa)."""
    medios = []
    for medio, a in (f.get("archivos") or {}).items():
        if a:
            sha = "sha256 %s" % a["sha256"][:12] if a.get("sha256") else "SIN SHA (no se fija, §6)"
            medios.append("· %s: %s (%s GB · %s)" % (
                medio, a["archivo"], round(a["bytes"] / 1e9, 2), sha))
    nota_sin_sha = ""
    if f.get("pesos_sin_sha"):
        nota_sin_sha = "\n· Pesos sin SHA en LFS (no se pincha el catálogo con ellos): %s" % ", ".join(f["pesos_sin_sha"])
    return (
        "FICHA VERIFICADA por el vigía de modelos (Ola 1016M, %s en adelante): añádela al catálogo «%s»\n"
        "· id: %s · área: %s · creado: %s\n"
        "· clase de licencia: %s (%s)\n"
        "· motor sugerido: %s · %s\n"
        % (
            f["fecha"], f["catalogo"], f["id"], f["area"],
            f.get("creado") or "s/d", f["clase"], f.get("licencia") or "sin datos",
            f.get("motor") or "s/d", "; ".join(medios) or "sin pesos elegibles",
        )
        + nota_sin_sha
        + "\n\nRegla de licencia (§4): una clase «%s» es no comercial — como mucho opción PERSONAL"
          " con etiqueta visible, nunca por defecto del sistema ni en usos comerciales; solo"
          " «libre» se deja por defecto para toda neurona. Verifica el mismo id en Hugging Face"
          " (lfs.oid) antes de escribir el SHA. Sin claves: la variable solo por su nombre, HF_TOKEN."
          "\n\nREGLAS: raíz del repo como sola carpeta, tokens puros, ≤ 3 archivos y ≤ 120 líneas por escritura."
          " Prueba junto al catálogo (__tests__). cero `any`. Español con acentos.\n\n"
        % f["clase"]
    )


def a_tareas(fichas, fecha, usados=(), maximo=MAX_FICHAS_DIA):
    """Pura (§6): fichas verificadas → tareas de `cola-vigia-<fecha>.json`.

    ids `VGM<MMDD>-<n>` continuando tras los `usados` (ningún id se repite contra el
    histórico de esta cola) y como mucho `maximo` proyectos al día.
    """
    compacto = str(fecha).replace("-", "")
    mmdd = compacto[4:8] if len(compacto) >= 8 else compacto  # «1025», como los ids OPZ
    usados = set(usados)
    salidas, n = [], 0
    for f in fichas:
        if len(salidas) >= maximo:
            break
        while True:
            n += 1
            idm = "VGM%s-%d" % (mmdd, n)
            if idm not in usados:
                break
        usados.add(idm)
        f2 = dict(f, fecha=fecha)
        salidas.append({"id": idm, "ola": "Vigía %s" % fecha, "estado": "pendiente",
                        "origen": "vigia-modelos", "area": f["area"],
                        "titulo": "Ficha de %s al catálogo del área" % f["id"],
                        "archivos": archivos_de_tarea(f["catalogo"]),
                        "prompt": prompt_de_ficha(f2)})
    return salidas


# ── UNA pasada del vigía (§6) ───────────────────────────────────────────────


def pasada(areas, getter=None, hoy=None, seco=False, solo_area=None,
           raiz=RAIZ_REPO, estado=ESTADO, chat_raiz=None, maximo=MAX_FICHAS_DIA):
    """Orquesta la pasada diaria: descubre, evalúa, escribe novedades atómicas, deja
    el estado y, si `seco` es falso, la cola de fichas y UN aviso al Chat Director.

    Devuelve el resumen (dict inyectable a pruebas): fechas, área a área, fichas a
    cola (o no si `--seco`) e id del aviso publicado.
    """
    hoy = hoy or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    olas = Path(raiz) / "starseed_memory_root" / "olas"
    vigia = Path(raiz) / "starseed_memory_root" / "vigia"
    previo, vistos = _leer_estado(estado)
    conocido = (_texto_catalogos(areas, raiz) + " " + _texto_colas(olas)).casefold()
    novedades, fichas, lineas, evaluados = {"fecha": hoy, "areas": []}, [], [], set()
    for area in areas:
        if solo_area and area["id"] != solo_area:
            continue
        crudos = [m for m in (descubrir_hf(area, getter) + descubrir_repos(area, getter))
                  if str(m.get("id") or "") not in vistos and not _ya_esta(m.get("id"), conocido)]
        evaluados.update(str(m.get("id") or "") for m in crudos)
        aceptados, descartados = evaluar_area(area, crudos, getter)
        for f in aceptados:
            f["area"] = area["id"]
            f["catalogo"] = area["catalogo"]
        novedades["areas"].append({"id": area["id"], "nombre": area["nombre"],
                                   "catalogo": area["catalogo"], "aceptados": aceptados,
                                   "descartados": descartados})
        if aceptados:
            lineas.append("· %s: %s" % (area["nombre"],
                          ", ".join("%s (%s)" % (f["id"], f["clase"]) for f in aceptados)))
        fichas.extend(aceptados)
    # Para la cola solo fichas con archivo ELEGIDO CON SHA REAL (§6: si no se obtiene, no entra).
    fichas_cola = [f for f in fichas
                   if (f["archivos"].get("mac") or {}).get("sha256")
                   or (f["archivos"].get("navegador") or {}).get("sha256")]
    fichas_cola.sort(key=lambda f: (-f.get("puntuacion", 0), f["id"]))
    fichas_cola = fichas_cola[:maximo]
    _escribir_atomico(vigia / ("novedades-%s.json" % hoy), novedades)
    ahora = {"ultima_pasada": datetime.now(timezone.utc).isoformat()}
    previo.update(ahora)
    previo.update({"vistos": {**{k: hoy for k in evaluados},
                              **(previo.get("vistos") or {}),  # lo de atrás no se tira (§6)
                              **{f["id"]: hoy for f in fichas}}})
    previo["vistos"] = dict(list(previo["vistos"].items())[-TOPE_VISTOS:])  # podar el histórico
    _escribir_atomico(estado, previo)
    resumen = {"hoy": hoy, "seco": seco, "novedades": None, "fichas": [], "aviso": None,
               "areas": [{"id": a["id"], "aceptados": len(a["aceptados"]),
                          "descartados": len(a["descartados"])}
                         for a in novedades["areas"]]}
    if not seco:
        ruta_cola = olas / ("cola-vigia-%s.json" % hoy)
        tareas = a_tareas(fichas_cola, hoy, usados=[t["id"] for t in _tareas_de_cola(ruta_cola)])
        if tareas:
            _escribir_atomico(ruta_cola, tareas)
            resumen["fichas"] = [t["id"] for t in tareas]
            lineas.append("· %d ficha(s) a cola-vigia-%s.json: %s" % (
                len(tareas), hoy, ", ".join(resumen["fichas"])))
        texto = ("Vigía de modelos · %s\n%s" % (hoy, "\n".join(lineas))) \
            if lineas else "Vigía de modelos · %s: sin novedades nuevas" % hoy
        aviso = director_chat.publicar(texto, de="vigia-modelos", rol="director",
                                       tipo="informe", raiz=chat_raiz)
        resumen["aviso"] = aviso["id"]
        resumen["novedades"] = texto
    return resumen


def _principal(argv=None):
    p = argparse.ArgumentParser(prog="vigia_modelos",
                                description="Vigía de modelos: MetaGenesis busca, prueba e integra")
    p.add_argument("--seco", action="store_true",
                   help="corre la pasada sin crear colas ni avisar al Chat Director")
    p.add_argument("--area", default=None, help="limita la pasada a UN área del archivo de áreas")
    args = p.parse_args(argv)
    try:
        areas = vigia_areas.cargar_areas()
    except vigia_areas.AreasInvalidas as e:
        print("config de áreas no válida: no hay pasada (arreglar config/vigia-areas.json):\n%s" % e,
              file=__import__("sys").stderr)
        raise SystemExit(1)
    if args.area and args.area not in [a["id"] for a in areas]:
        p.error("--area no existe en config/vigia-areas.json")
    resumen = pasada(areas, seco=args.seco, solo_area=args.area)
    print(json.dumps(resumen, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    _principal()
