#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""La Mac manda sus experiencias al A1 y trae lo que propuso la noche (MTN1027H2).

`enviar()` junta `~/.starseed/experiencias.jsonl` y las copias de las neuronas que
«aportan» (config `~/.starseed/automejora.json`; por defecto todas) y deja esas
experiencias y la config en la entrada de la automejora del A1, por el mismo SSH
de `oracle_nodo`. `traer()` lee la salida MÁS NUEVA y pasa cada directiva por
`automejora_logica.nueva_version`; las propuestas de ayuda van a
`olas/propuestas-automejora/<fecha>.json`, nunca a `olas/`. Sin claves ni rutas
ajenas en el código: solo capas y nombres de archivo. Las funciones puras se
prueban sin ssh en `test_automejora_mac.py`."""
from __future__ import annotations

import hashlib
import json
import os
import time
from datetime import datetime, timezone

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
HOME = os.path.expanduser("~")
EXPERIENCIAS = os.path.join(HOME, ".starseed", "experiencias.jsonl")
CONFIG = os.path.join(HOME, ".starseed", "automejora.json")
ENTRADA_A1 = "/var/lib/starseed/automejora/entrada"
SALIDA_A1 = "/var/lib/starseed/automejora/salida"
HORAS = {"enviar": 2, "traer": 6}
CLAVES_CONFIG = ("capas", "frecuencia", "tope_llamadas", "preguntar", "modelos")

import automejora_logica as AL  # noqa: E402


def _leer(ruta, defecto=None):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _texto(ruta):
    try:
        with open(ruta, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def _escribir(ruta, datos):
    os.makedirs(os.path.dirname(os.path.abspath(ruta)), exist_ok=True)
    temporal = ruta + ".tmp"
    with open(temporal, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(temporal, ruta)


def fecha_utc(ahora):
    return datetime.fromtimestamp(ahora, timezone.utc).strftime("%Y-%m-%d")


def toca(orden, ahora, estado):
    """PURA. ¿Toca `orden` hoy? Después de su hora UTC y sin la marca de hoy."""
    clave, hora = ("enviado", HORAS["enviar"]) if orden == "enviar" else ("traido", HORAS["traer"])
    return (datetime.fromtimestamp(ahora, timezone.utc).hour >= hora
            and str((estado or {}).get(clave) or "") != fecha_utc(ahora))


def neuronas_que_aportan(config):
    """PURA. Nombres que aportan; None = todas las de la cuenta (defecto)."""
    config = config if isinstance(config, dict) else {}
    if config.get("aportar") is False:
        return set()
    neuronas = config.get("neuronas")
    if not isinstance(neuronas, dict):
        return None
    return {str(h) for h, v in neuronas.items()
            if v is True or (isinstance(v, dict) and v.get("aportar", True))}


def fusionar(lineas):
    """PURA. Une experiencias y sus cierres (`ref`) por id; solo las cerradas."""
    por_id, orden = {}, []
    for linea in lineas:
        try:
            d = json.loads(linea)
        except (TypeError, ValueError):
            continue
        if not isinstance(d, dict):
            continue
        if d.get("ref"):
            if d["ref"] in por_id:
                por_id[d["ref"]]["resultado"] = d.get("resultado")
        elif d.get("id"):
            if d["id"] not in por_id:
                por_id[d["id"]] = dict(d)
                orden.append(d["id"])
    return [por_id[i] for i in orden if por_id[i].get("resultado") is not None]


def reunir_experiencias(propias, copias, aportan=None):
    """PURA. JSONL de las cerradas: las propias y las de las neuronas que aportan."""
    lineas = str(propias or "").splitlines()
    for host, texto in (copias or {}).items():
        if aportan is not None and host not in aportan:
            continue
        lineas.extend(str(texto or "").splitlines())
    return "".join(json.dumps(e, ensure_ascii=False) + "\n" for e in fusionar(lineas))


def config_para_a1(config):
    """PURA. Solo lo que la caja necesita: sin nombres de neuronas ni rutas de la Mac."""
    config = config if isinstance(config, dict) else {}
    salida = {k: config[k] for k in CLAVES_CONFIG if k in config}
    if not isinstance(salida.get("capas"), (dict, list)):
        salida["capas"] = {"juicio": True}
    return salida


def repartir(informe, actuales, fecha, preguntar=False):
    """PURA. Archivos de directivas nuevos (por capa) y propuestas, sin repetir lo visto."""
    informe = informe if isinstance(informe, dict) else {}
    archivos, aplicadas = {}, []
    for d in informe.get("directivas") or []:
        if not isinstance(d, dict):
            continue
        capa = str(d.get("capa") or "").strip()
        sano = AL.sanear_pauta(str(d.get("texto") or ""))
        if not capa or not sano.get("ok"):
            continue
        actual = (actuales or {}).get(capa) or {"v": 1, "capa": capa, "historial": []}
        sha = hashlib.sha256(sano["texto"].encode()).hexdigest()
        if any(str(h.get("sha256") or "") == sha[:16]
               for h in actual.get("historial") or [] if isinstance(h, dict)):
            continue
        try:
            acierto, base, n = (float(d.get("acierto") or 0), float(d.get("base") or 0),
                                int(d.get("n") or 0))
        except (TypeError, ValueError):
            continue
        nuevo = AL.nueva_version(actual, {"texto": sano["texto"]}, acierto, base, n,
                                 fecha, "meta-n", bool(preguntar))
        activas = [x for x in nuevo.get("historial") or [] if x.get("estado") == "activa"]
        nuevo["activa"] = activas[-1]["version"] if activas else None
        archivos[capa] = nuevo
        aplicadas.append({"capa": capa, "version": nuevo["historial"][-1].get("version"),
                          "estado": nuevo["historial"][-1].get("estado")})
    propuestas = [p for p in informe.get("propuestas") or [] if isinstance(p, dict)]
    return {"directivas": archivos, "aplicadas": aplicadas, "propuestas": propuestas}


def _ssh(orden, datos):
    """El SSH del nodo (importación perezosa: aquí nunca se abre una conexión al cargar)."""
    import oracle_nodo

    return oracle_nodo._ssh_bytes(orden, datos)


def _orden(nombre):
    d = ENTRADA_A1
    return ("sudo -u starseed sh -c 'mkdir -p {d} && cat > {d}/{n}.tmp && "
            "mv -f {d}/{n}.tmp {d}/{n}'").format(d=d, n=nombre)


def _copias(carpeta):
    salida = {}
    try:
        nombres = os.listdir(carpeta)
    except OSError:
        return salida
    for nombre in nombres:
        if nombre.endswith(".jsonl"):
            salida[nombre[:-6]] = _texto(os.path.join(carpeta, nombre))
    return salida


def enviar(ahora=None, ssh=None, raiz=None, experiencias=None, config_ruta=None):
    """Manda las experiencias cerradas y la config a la entrada de la automejora del A1."""
    ssh, raiz = ssh or _ssh, raiz or RAIZ
    config = _leer(config_ruta or CONFIG, {}) or {}
    if config.get("aportar") is False:
        return {"ok": True, "no": "la cuenta no aporta experiencias"}
    copias = _copias(os.path.join(raiz, "starseed_memory_root", "aprendizaje", "experiencias"))
    texto = reunir_experiencias(_texto(experiencias or EXPERIENCIAS), copias,
                                neuronas_que_aportan(config))
    if not texto.strip():
        return {"ok": True, "no": "sin experiencias cerradas que mandar"}
    config_texto = json.dumps(config_para_a1(config), ensure_ascii=False)
    for nombre, cuerpo in (("experiencias.jsonl", texto), ("config.json", config_texto)):
        rc, salida = ssh(_orden(nombre), cuerpo.encode("utf-8"))
        if rc != 0:
            return {"ok": False, "motivo": salida[-200:]}
    return {"ok": True, "experiencias": len(texto.splitlines()),
            "kb": len(texto.encode("utf-8")) // 1024}


def _propuestas_nuevas(carpeta, fecha, propuestas):
    ruta = os.path.join(carpeta, fecha + ".json")
    previas = _leer(ruta, {}) or {}
    guardadas = previas.get("propuestas")
    lista = guardadas if isinstance(guardadas, list) else []
    vistas = {json.dumps(p, sort_keys=True, ensure_ascii=False) for p in lista}
    nuevas = [p for p in propuestas
              if json.dumps(p, sort_keys=True, ensure_ascii=False) not in vistas]
    if nuevas:
        _escribir(ruta, {"fecha": fecha, "origen": "meta-n",
                         "propuestas": lista + nuevas})
    return nuevas


def traer(ahora=None, ssh=None, raiz=None, config_ruta=None):
    """Lee la salida más nueva del A1 y deja directivas, propuestas y el resumen."""
    ssh, raiz, ahora = ssh or _ssh, raiz or RAIZ, time.time() if ahora is None else ahora
    orden = ("sudo -u starseed sh -c 'f=$(ls -1t %s/*.json 2>/dev/null | head -1); "
             "[ -n \"$f\" ] && cat \"$f\" || true'" % SALIDA_A1)
    rc, salida = ssh(orden, None)
    if rc != 0:
        return {"ok": False, "motivo": salida[-200:]}
    if not salida.strip():
        return {"ok": True, "no": "la noche aún no dejó salida"}
    try:
        informe = json.loads(salida)
    except ValueError as error:
        return {"ok": False, "motivo": "salida ilegible: %s" % error}
    if not isinstance(informe, dict):
        return {"ok": False, "motivo": "la salida no es un objeto"}
    fecha = str(informe.get("ultima_noche") or fecha_utc(ahora))
    preguntar = bool((_leer(config_ruta or CONFIG, {}) or {}).get("preguntar"))
    base = os.path.join(raiz, "starseed_memory_root")
    dir_directivas = os.path.join(base, "aprendizaje", "directivas")
    capas = {str(d.get("capa")) for d in informe.get("directivas") or [] if isinstance(d, dict)}
    actuales = {c: _leer(os.path.join(dir_directivas, c + ".json"), {}) or {} for c in capas}
    r = repartir(informe, actuales, fecha, preguntar)
    for capa, archivo in r["directivas"].items():
        _escribir(os.path.join(dir_directivas, capa + ".json"), archivo)
    nuevas = _propuestas_nuevas(os.path.join(base, "olas", "propuestas-automejora"),
                                fecha, r["propuestas"])
    _escribir(os.path.join(base, "aprendizaje", "automejora", "ultima-noche.json"),
              dict(informe, fecha=fecha, traido=ahora, aplicadas=r["aplicadas"]))
    return {"ok": True, "fecha": fecha, "directivas": r["aplicadas"],
            "propuestas": len(nuevas)}
