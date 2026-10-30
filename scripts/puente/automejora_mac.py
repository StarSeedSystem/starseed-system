#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""(MTN1027H2) La Mac manda las experiencias a la noche de Meta^n y trae lo que salió.

`enviar()` junta ~/.starseed/experiencias.jsonl y las de las neuronas que «aportan»
(~/.starseed/automejora.json) y lo sube con la config a /var/lib/starseed/automejora/
entrada/ vía oracle_nodo._ssh_bytes. `traer()` lee la salida más nueva del A1 y guarda
directivas, propuestas y el resumen. Decisiones puras probadas sin ssh."""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
if AQUI not in sys.path:
    sys.path.insert(0, AQUI)
import automejora_logica as AL  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(AQUI))
_HOME = os.path.expanduser("~")
EXPERIENCIAS = os.path.join(_HOME, ".starseed", "experiencias.jsonl")
CONFIG = os.path.join(_HOME, ".starseed", "automejora.json")
ESTADO = os.path.join(_HOME, ".starseed", "automejora-estado.json")
BASE_A1 = "/var/lib/starseed/automejora"


def capas_encendidas(config):
    """Las capas encendidas de la config: {"capas": {...}} o capas al mismo nivel."""
    capas = (config or {}).get("capas", config or {})
    if isinstance(capas, dict):
        return [c for c, v in capas.items()
                if v is True or (isinstance(v, dict) and v.get("encendida"))]
    return [c for c in capas or [] if isinstance(c, str)]


def filtrar_archivos(nombres, neuronas):
    """PURA. Los hosts <host>.jsonl que aportan. `neuronas` None o vacío = todas."""
    si = None if not isinstance(neuronas, dict) or not neuronas else {
        h for h, v in neuronas.items()
        if v is True or (isinstance(v, dict) and v.get("aportar"))}
    if si is None:
        return sorted(n[:-6] for n in nombres if n.endswith(".jsonl"))
    return sorted(n[:-6] for n in nombres if n.endswith(".jsonl") and n[:-6] in si)


def seleccionar_lineas(textos):
    """PURA. Une los JSONL quitando repetidas por su `id` (o la línea entera)."""
    vistas, lista = set(), []
    for texto in (textos or {}).values():
        for linea in (texto or "").splitlines():
            if not linea.strip():
                continue
            try:
                fila = json.loads(linea)
            except ValueError:
                continue
            clave = fila.get("id", linea) if isinstance(fila, dict) else None
            if clave in vistas:
                continue
            vistas.add(clave)
            lista.append(linea)
    return "\n".join(lista) + ("\n" if lista else "")


def elegir_salida(listado):
    """PURA. Ruta más nueva en `ls -1t`: la primera línea que acabe en .json."""
    for linea in (listado or "").splitlines():
        if linea.strip().endswith(".json"):
            return linea.strip()
    return None


def toca(estado, ahora, orden):
    """PURA. ¿Toca esa acción? `enviar` tras las 02:00 UTC y `traer` tras las 06:00, al día."""
    momento = datetime.fromtimestamp(ahora, timezone.utc)
    if (estado or {}).get(("%s_dia" % orden)) == momento.strftime("%Y-%m-%d"):
        return False
    return momento.hour >= (2 if orden == "enviar" else 6)


def version_directivas(archivo, capa, directivas, fecha, preguntar=False):
    """PURA. El archivo de directivas de esa capa tras aplicar lo del informe (saneado).
    Un texto igual al último del historial no se vuelve a registrar: es el mismo."""
    dato: dict = dict(archivo or {"v": 1, "capa": capa, "historial": []})
    for d in directivas or []:
        sana = AL.sanear_pauta(str(d.get("texto") or ""))
        if not sana.get("ok"):
            continue
        historial: list = dato.get("historial") or []
        if historial and historial[-1].get("texto") == sana["texto"]:
            continue
        dato = AL.nueva_version(dato, {"texto": sana["texto"]}, float(d.get("acierto") or 0.0),
                                float(d.get("base") or 0.0), int(d.get("n") or 0), fecha,
                                "meta-n", preguntar)
    return dato


def nuevas_propuestas(actuales, informadas):
    """PURA. Las propuestas del informe que aún no están guardadas (por su task_id)."""
    vistas = {p.get("task_id") for p in actuales or () if isinstance(p, dict)}
    return [p for p in informadas or () if isinstance(p, dict) and p.get("task_id")
            and p.get("task_id") not in vistas]


def _leer_json(ruta, defecto=None):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir_json(ruta, datos, modo=0o644):
    os.makedirs(os.path.dirname(os.path.abspath(ruta)), exist_ok=True)
    provisional = ruta + ".tmp"
    with open(provisional, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.chmod(provisional, modo)
    os.replace(provisional, ruta)


def textos_experiencias(config=None, raiz=None):
    """{clave: texto}: la local (~/.starseed/experiencias.jsonl) y las <host>.jsonl que aportan."""
    raiz = raiz or RAIZ
    config = _leer_json(CONFIG, {}) if config is None else config
    textos = {}
    try:
        with open(EXPERIENCIAS, encoding="utf-8") as f:
            textos["local"] = f.read()
    except OSError:
        pass
    carpeta = os.path.join(raiz, "starseed_memory_root", "aprendizaje", "experiencias")
    try:
        nombres = os.listdir(carpeta)
    except OSError:
        nombres = []
    for host in filtrar_archivos(nombres, (config or {}).get("neuronas")):
        try:
            with open(os.path.join(carpeta, host + ".jsonl"), encoding="utf-8") as f:
                textos[host] = f.read()
        except OSError:
            continue
    return textos


def guardar_directivas(directivas, fecha, preguntar=False, raiz=None):
    """Escribe cada directiva del informe en aprendizaje/directivas/<capa>.json."""
    raiz = raiz or RAIZ
    hechas = []
    for d in directivas or []:
        capa = str(d.get("capa") or "")
        if not capa:
            continue
        ruta = os.path.join(raiz, "starseed_memory_root", "aprendizaje", "directivas", capa + ".json")
        viejo = _leer_json(ruta)
        nuevo = version_directivas(viejo, capa, [d], fecha, preguntar)
        viejas = (viejo or {}).get("historial") or []
        if not (nuevo.get("historial") or []) or nuevo.get("historial") == viejas:
            continue  # sana la rechazó o ya estaba: no se toca
        _escribir_json(ruta, nuevo)
        hechas.append(capa)
    return hechas


def guardar_propuestas(informadas, fecha, raiz=None):
    """Anota las propuestas en olas/propuestas-automejora/<fecha>.json (NO en olas/)."""
    raiz = raiz or RAIZ
    ruta = os.path.join(raiz, "starseed_memory_root", "olas", "propuestas-automejora",
                        fecha + ".json")
    guardadas = (_leer_json(ruta, {}) or {}).get("tareas") or []
    nuevas = nuevas_propuestas(guardadas, informadas)
    if not nuevas:
        return 0
    _escribir_json(ruta, {"fecha": fecha, "medio": "meta-n", "tareas": guardadas + nuevas})
    return len(nuevas)


def _subir(orden, datos):
    import oracle_nodo  # noqa: PLC0415 — perezoso: evita el círculo al importar

    return oracle_nodo._ssh_bytes(orden, datos)


def _bajar(orden):
    import oracle_nodo  # noqa: PLC0415

    return oracle_nodo.ssh(orden)


def enviar(subir=None, config=None, textos=None):
    """Sube al A1 las experiencias (y la config) de las capas encendidas."""
    subir = subir or _subir
    config = _leer_json(CONFIG, {}) if config is None else config
    if not capas_encendidas(config):
        return {"ok": True, "no": "automejora apagada: no se manda nada"}
    lineas = seleccionar_lineas(textos if textos is not None else textos_experiencias(config))
    if not lineas.strip():
        return {"ok": True, "no": "sin experiencias que mandar"}
    entrada = BASE_A1 + "/entrada/"
    rc, salida = subir(
        "sudo install -d -o starseed -g starseed %s && sudo -u starseed sh -c "
        "'cat > %sexperiencias.tmp && mv -f %sexperiencias.tmp %sexperiencias.jsonl'"
        % (entrada, entrada, entrada, entrada), lineas.encode())
    if rc != 0:
        return {"ok": False, "motivo": (salida or "").strip()[-200:]}
    rc2, salida2 = subir("sudo install -o starseed -g starseed -m 644 /dev/stdin %sconfig.json"
                         % entrada, json.dumps(config, ensure_ascii=False, indent=1).encode())
    if rc2 != 0:
        return {"ok": False, "motivo": "experiencias sí, config no (%s)" % (salida2 or "").strip()[-120:]}
    return {"ok": True, "lineas": lineas.count("\n"), "capas": capas_encendidas(config)}


def traer(bajar=None, raiz=None):
    """Lee la salida más nueva del A1 y la guarda: directivas, propuestas y resumen."""
    bajar = bajar or _bajar
    raiz = raiz or RAIZ
    rc, listado = bajar("sudo ls -1t %s/salida/*.json 2>/dev/null" % BASE_A1)
    nuevo = elegir_salida(listado)
    if not nuevo:
        return {"ok": True, "no": "sin salidas en el A1"}
    rc, texto = bajar("sudo cat %s/salida/%s" % (BASE_A1, os.path.basename(nuevo)))
    if rc != 0:
        return {"ok": False, "motivo": (texto or "").strip()[-200:]}
    try:
        informe = json.loads(texto)
    except ValueError:
        return {"ok": False, "motivo": "la salida no es JSON válida"}
    fecha = os.path.basename(nuevo)[:-5]
    config = _leer_json(CONFIG, {}) or {}
    hechas = guardar_directivas(informe.get("directivas"), fecha,
                                bool(config.get("preguntarme")), raiz)
    propuestas = guardar_propuestas(informe.get("propuestas"), fecha, raiz)
    _escribir_json(os.path.join(raiz, "starseed_memory_root", "aprendizaje", "automejora",
                                "ultima-noche.json"),
                   dict(informe, guardadas=hechas, propuestas_nuevas=propuestas,
                        traida=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")))
    return {"ok": True, "fecha": fecha, "directivas": hechas, "propuestas": propuestas,
            "motivo": informe.get("motivo")}


def autopiloto(ahora=None, subir=None, bajar=None, ruta_estado=None):
    """Lo que el ciclo llama una vez al día: enviar tras 02:00 UTC y traer tras 06:00 UTC."""
    ahora = time.time() if ahora is None else ahora
    ruta_estado = ruta_estado or ESTADO
    estado = _leer_json(ruta_estado, {}) or {}
    res = {}
    for orden in ("enviar", "traer"):
        if not toca(estado, ahora, orden):
            continue
        resultado = enviar(subir) if orden == "enviar" else traer(bajar)
        res[orden] = resultado
        if resultado.get("ok"):
            estado["%s_dia" % orden] = datetime.fromtimestamp(ahora, timezone.utc).strftime("%Y-%m-%d")
            _escribir_json(ruta_estado, estado)
    return res
