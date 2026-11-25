#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Relevo entre medios de la dirección (RES1121A · DIR1121).

Mac, A1 de Oracle y nodo Maggabox trabajan con su especialidad y se relevan: ninguna
pieza depende de un solo medio. Este módulo reúne tres cosas y las mantiene herméticas:

  1. El registro `relevo-de-medios`: qué hace cada medio y quién lo releva.
  2. La réplica saneada de los tres canales y del estado de olas al A1 y al Maggabox.
  3. El latido y el ARRIENDO por bot: un solo lector de Telegram por canal; el A1 toma
     el relevo si el Mac calla y el Mac lo recupera al volver, con el mismo offset.

Nunca imprime ni guarda tokens, claves ni la dirección del A1. Las claves que el A1
necesite viajan SOLO por `oracle_nodo.py claves`; aquí los canales se replican sin
secretos (nombre visible y `telegram_bot`, nada más). Solo biblioteca estándar.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time

CANALES = ("principal", "general", "audiovisual")
NOMBRES_CANALES = {
    "principal": "Principal",
    "general": "General",
    "audiovisual": "Audiovisual y diseño",
}
BOTS = {
    "principal": "@starseed_neurocortex_bot",
    "general": "@starseed_puente_bot",
    "audiovisual": "@StarSeed_Design_bot",
}
#: Quién atiende cada canal de forma natural; el otro medio es su respaldo.
DUENO_NATURAL = {"principal": "mac", "general": "mac", "audiovisual": "a1"}

MINUTOS_SIN_LATIDO = float(os.environ.get("STARSEED_RELEVO_MIN") or 5)
ARRENDAMIENTO_S = float(os.environ.get("STARSEED_RELEVO_ARRIENDO_S") or 180)

#: Registro único. `cubre` dice qué especialidades puede asumir si el dueño cae.
MEDIOS = {
    "mac": {
        "especialidad": ("orquestador", "puertas", "cartero", "presidente", "bot Principal"),
        "cubre": ("siempre encendido", "bot de diseño", "guardián de main",
                  "cola de respaldo", "nube"),
        "releva": "a1",
        "canales": ("principal", "general", "audiovisual"),
        "publico": False,
        "claves": True,
        "efimero": False,
    },
    "a1": {
        "especialidad": ("siempre encendido", "bot de diseño", "guardián de main",
                         "cola de respaldo", "nube"),
        "cubre": ("orquestador", "puertas", "cartero", "presidente", "bot Principal",
                  "almacén", "espejo de GitHub cada 15 min", "versiones",
                  "respaldos cifrados"),
        "releva": "mac",
        "canales": ("principal", "general", "audiovisual"),
        "publico": False,
        "claves": True,
        "efimero": False,
    },
    "maggabox": {
        "especialidad": ("almacén", "espejo de GitHub cada 15 min", "versiones",
                         "respaldos cifrados"),
        "cubre": (),
        "releva": "a1",
        "canales": (),
        "publico": True,
        "claves": False,
        "efimero": False,
    },
    "github-actions": {
        "especialidad": ("trabajo sin secretos",),
        "cubre": ("trabajo sin secretos",),
        "releva": "a1",
        "canales": (),
        "publico": True,
        "claves": False,
        "efimero": True,
    },
    "cloudroom": {
        "especialidad": ("trabajo sin secretos",),
        "cubre": ("trabajo sin secretos",),
        "releva": "a1",
        "canales": (),
        "publico": True,
        "claves": False,
        "efimero": True,
    },
}

#: Únicos campos que salen del Mac en el registro de canales: ni tokens ni sesiones.
CAMPOS_PUBLICOS = ("nombre", "telegram_bot")


def nombre_canal(canal, canales_cfg=None):
    """PURA. Nombre visible del registro único; si falta, el canónico de respaldo."""
    entrada = (canales_cfg or {}).get(canal)
    if isinstance(entrada, dict):
        nombre = str(entrada.get("nombre") or "").strip()
        if nombre:
            return nombre
    return NOMBRES_CANALES.get(canal, canal)


def problemas_registro(registro=None):
    """PURA. Lista de dependencias únicas o políticas rotas; vacía = registro sano."""
    reg = registro if registro is not None else MEDIOS
    problemas = []
    cobertura = {}
    for medio, datos in reg.items():
        releva = datos.get("releva")
        if not releva:
            problemas.append("%s no tiene relevo" % medio)
        elif releva == medio:
            problemas.append("%s se releva a sí mismo" % medio)
        elif releva not in reg:
            problemas.append("%s releva a un medio desconocido" % medio)
        if datos.get("publico") and datos.get("claves"):
            problemas.append("%s es público y guarda claves" % medio)
        if datos.get("efimero") and not datos.get("publico"):
            problemas.append("%s es efímero y no está marcado público" % medio)
        for especialidad in datos.get("especialidad") or ():
            cobertura.setdefault(especialidad, set()).add(medio)
        for especialidad in datos.get("cubre") or ():
            cobertura.setdefault(especialidad, set()).add(medio)
    for especialidad, medios in cobertura.items():
        if len(medios) < 2:
            problemas.append("%s solo la cubre %s" % (especialidad, sorted(medios)))
    for canal in CANALES:
        capaces = [m for m, d in reg.items() if canal in (d.get("canales") or ())]
        if len(capaces) < 2:
            problemas.append("el canal %s solo lo atiende %s" % (canal, capaces))
    return problemas


def registro_publico(canales_cfg):
    """PURA. Solo lo que puede viajar sin secretos: nombre visible y bot de Telegram."""
    salida = {}
    for canal in CANALES:
        entrada = (canales_cfg or {}).get(canal) or {}
        fila = {}
        for campo in CAMPOS_PUBLICOS:
            if entrada.get(campo):
                fila[campo] = str(entrada[campo])
        fila.setdefault("nombre", nombre_canal(canal, canales_cfg))
        fila.setdefault("telegram_bot", BOTS[canal])
        salida[canal] = fila
    return salida


def plan_replica(registro=None, fuentes=None):
    """PURA. A1 y Maggabox reciben canales y olas; el Maggabox se marca sin secretos."""
    reg = registro if registro is not None else MEDIOS
    olas = list(fuentes or ("progreso.json", "progreso.md", "medios.json", "puntos-control.json"))
    plan = []
    for destino in ("a1", "maggabox"):
        datos = reg.get(destino) or {}
        if datos.get("efimero"):
            continue
        plan.append({
            "destino": destino,
            "canales": "publico",  # las claves del A1 van solo por `oracle_nodo.py claves`
            "olas": olas,
            "sin_secretos": bool(datos.get("publico")),
        })
    return plan


def _flotante(valor, defecto=0.0):
    try:
        return float(valor)
    except (TypeError, ValueError):
        return defecto


def _entero(valor, defecto=0):
    try:
        return int(valor)
    except (TypeError, ValueError):
        return defecto


def medio_vivo(latidos, medio, ahora, minutos=None):
    """PURA. Un medio late si su último latido está dentro de la ventana N."""
    tope = (MINUTOS_SIN_LATIDO if minutos is None else minutos) * 60
    ultimo = (latidos or {}).get(medio)
    if ultimo is None:
        return False
    return (float(ahora) - _flotante(ultimo, -tope * 2)) <= tope


def decidir_arriendo(latidos, arriendos=None, ahora=None, medio_local="a1",
                     minutos=None, duracion_s=None):
    """PURA. Decide, canal por canal, si el medio local adquiere, renueva, suelta o espera.

    Un solo lector por bot: solo se adquiere si no hay otro arriendo vigente. Al volver
    el dueño natural, el que tiene el arriendo lo suelta conservando el `offset` de
    Telegram, para que el otro continúe sin repetir ni perder mensajes.
    """
    momento = time.time() if ahora is None else float(ahora)
    arriendos = arriendos or {}
    duracion = ARRENDAMIENTO_S if duracion_s is None else float(duracion_s)
    decisiones = {}
    for canal in CANALES:
        natural = DUENO_NATURAL[canal]
        actual = arriendos.get(canal) or {}
        dueno = actual.get("dueno")
        vence = _flotante(actual.get("vence"))
        offset = _entero(actual.get("offset"))
        vigente = bool(dueno) and vence > momento
        natural_vivo = medio_vivo(latidos, natural, momento, minutos)
        if natural == medio_local:
            if vigente and dueno != natural:
                accion, motivo = "esperar", "otro medio tiene un arriendo vigente"
            else:
                accion = "renovar" if (vigente and dueno == natural) else "adquirir"
                motivo = "el dueño natural está vivo y toma su canal"
        elif natural_vivo:
            if vigente and dueno == medio_local:
                accion, motivo = "soltar", "volvió el dueño natural; suelto con su offset"
            else:
                accion, motivo = "esperar", "el dueño natural late"
        elif vigente:
            if dueno == medio_local:
                accion, motivo = "renovar", "sigo de relevo mientras el dueño calla"
            else:
                accion, motivo = "esperar", "otro medio ya tiene el arriendo"
        else:
            accion, motivo = "adquirir", "el dueño natural no late; tomo el relevo"
        decisiones[canal] = {
            "accion": accion,
            "dueno": natural if accion == "soltar" else (
                medio_local if accion in ("adquirir", "renovar") else (dueno or natural)
            ),
            "offset": offset,
            "vence": momento + duracion if accion in ("adquirir", "renovar") else vence,
            "motivo": motivo,
        }
    return decisiones


def aplicar_decisiones(arriendos, decisiones, ahora, duracion_s=None):
    """PURA. Copia los arriendos y aplica las decisiones sin mutar los datos recibidos."""
    momento = float(ahora)
    duracion = ARRENDAMIENTO_S if duracion_s is None else float(duracion_s)
    nuevo = {c: dict(v) for c, v in (arriendos or {}).items() if isinstance(v, dict)}
    for canal, decision in (decisiones or {}).items():
        accion = decision.get("accion")
        if accion in ("adquirir", "renovar"):
            nuevo[canal] = {
                "dueno": decision.get("dueno"),
                "vence": momento + duracion,
                "offset": _entero(decision.get("offset")),
            }
        elif accion == "soltar":
            nuevo[canal] = {
                "dueno": decision.get("dueno"),
                "vence": 0.0,
                "offset": _entero(decision.get("offset")),
            }
    return nuevo


def puede_hacer_polling(canal, arriendos, medio, ahora=None):
    """PURA. Puerta del poller: solo el dueño del arriendo vigente hace `getUpdates`."""
    actual = (arriendos or {}).get(canal) or {}
    momento = time.time() if ahora is None else float(ahora)
    return actual.get("dueno") == medio and _flotante(actual.get("vence")) > momento


def simular_relevo(latidos, ahora, minutos=None, medio_local="a1", arriendos=None):
    """PURA. Ensayo del corte: cuánto tarda el respaldo en responder tras callar el Mac."""
    tope_min = MINUTOS_SIN_LATIDO if minutos is None else float(minutos)
    momento = float(ahora)
    ultimo = (latidos or {}).get("mac")
    if ultimo is None:
        relevado_en = 0.0
    else:
        relevado_en = max(0.0, _flotante(ultimo) + tope_min * 60 - momento)
    responde_en = relevado_en + 60.0  # una vuelta de sondeo del canal
    return {
        "relevado_en_s": int(relevado_en),
        "responde_en_s": int(responde_en),
        "tope_s": int((tope_min + 2) * 60),
        "ok": responde_en <= (tope_min + 2) * 60,
        "medio": medio_local,
    }


RAIZ = os.environ.get("STARSEED_ROOT") or os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OLAS = os.environ.get("STARSEED_OLAS") or os.path.join(RAIZ, "starseed_memory_root", "olas")
ESTADO = os.environ.get("STARSEED_RELEVO_DIR") or os.path.expanduser("~/.starseed/relevo-medios")
CANALES_JSON = os.environ.get("STARSEED_CANALES") or os.path.expanduser(
    "~/.starseed/canales-direccion.json")
DESTINOS_ENV = {"a1": "STARSEED_REPLICA_A1_DIR", "maggabox": "STARSEED_REPLICA_MAGGABOX_DIR"}


def _leer_json(ruta, defecto=None):
    try:
        with open(ruta, encoding="utf-8") as f:
            datos = json.load(f)
        return datos if isinstance(datos, dict) else (defecto or {})
    except (OSError, ValueError):
        return defecto if defecto is not None else {}


def _guardar_json(ruta, datos):
    os.makedirs(os.path.dirname(ruta) or ".", exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def _ruta_latido(medio, directorio):
    return os.path.join(directorio, "latido-%s.json" % medio)


def latir(medio, ahora=None, dir_estado=None):
    """Anota el latido del medio en su propio archivo (uno por medio, sin pisarse)."""
    directorio = dir_estado or ESTADO
    _guardar_json(_ruta_latido(medio, directorio),
                  {medio: float(time.time() if ahora is None else ahora)})
    return cargar_latidos(directorio)


def cargar_latidos(dir_estado=None):
    directorio = dir_estado or ESTADO
    latidos = {}
    try:
        nombres = os.listdir(directorio)
    except OSError:
        return latidos
    for nombre in nombres:
        if not (nombre.startswith("latido-") and nombre.endswith(".json")):
            continue
        for medio, marca in _leer_json(os.path.join(directorio, nombre)).items():
            latidos[str(medio)] = _flotante(marca)
    return latidos


def cargar_arriendos(dir_estado=None):
    return _leer_json(os.path.join(dir_estado or ESTADO, "arriendos.json"))


def turno(medio="a1", ahora=None, dir_estado=None, seco=False, minutos=None, duracion_s=None):
    """Una pasada del arriendo: decide, aplica y (si no es en seco) guarda."""
    directorio = dir_estado or ESTADO
    momento = time.time() if ahora is None else float(ahora)
    latidos = cargar_latidos(directorio)
    arriendos = cargar_arriendos(directorio)
    decisiones = decidir_arriendo(latidos, arriendos, momento, medio, minutos, duracion_s)
    nuevo = aplicar_decisiones(arriendos, decisiones, momento, duracion_s)
    if not seco:
        _guardar_json(os.path.join(directorio, "arriendos.json"), nuevo)
    return {"medio": medio, "ahora": momento, "decisiones": decisiones, "arriendos": nuevo}


VENTANA_COLA_S = 7 * 24 * 3600


def seleccion_olas(olas_dir=None, ahora=None):
    """Elige el estado que viaja: fijos, logs y colas de los últimos 7 días."""
    directorio = olas_dir or OLAS
    momento = time.time() if ahora is None else float(ahora)
    fijos = {"progreso.json", "progreso.md", "medios.json", "puntos-control.json"}
    seleccion = set()
    try:
        nombres = os.listdir(directorio)
    except OSError:
        return sorted(fijos)
    for nombre in nombres:
        if nombre.startswith("/") or ".." in nombre.split("/"):
            continue
        base = nombre.lower()
        if ".env" in base or "clave" in base or "secret" in base or ".git" in base:
            continue
        if nombre in fijos or nombre.endswith(".jsonl") or "log" in base:
            seleccion.add(nombre)
        elif nombre.startswith("cola-") and nombre.endswith(".json"):
            try:
                if os.path.getmtime(os.path.join(directorio, nombre)) >= momento - VENTANA_COLA_S:
                    seleccion.add(nombre)
            except OSError:
                pass
    return sorted(seleccion)


def _copiar_a(directorio, articulo, canales, olas_dir, dir_estado):
    os.makedirs(directorio, exist_ok=True)
    publico = registro_publico(_leer_json(canales))
    _guardar_json(os.path.join(directorio, "canales.json"), publico)
    destino_olas = os.path.join(directorio, "olas")
    os.makedirs(destino_olas, exist_ok=True)
    copiadas = 0
    for nombre in articulo.get("olas") or ():
        origen = os.path.join(olas_dir, nombre)
        if os.path.isfile(origen):
            shutil.copy2(origen, os.path.join(destino_olas, os.path.basename(nombre)))
            copiadas += 1
    latidos = 0
    try:
        nombres = os.listdir(dir_estado)
    except OSError:
        nombres = []
    for nombre in nombres:
        if nombre.startswith("latido-") and nombre.endswith(".json"):
            shutil.copy2(os.path.join(dir_estado, nombre), os.path.join(directorio, nombre))
            latidos += 1
    return {"destino": articulo["destino"], "ok": True, "olas": copiadas,
            "latidos": latidos, "canales": len(publico)}


def replicar(destinos=None, canales=None, olas_dir=None, dir_estado=None, ahora=None,
             seco=False, omitir=()):
    """Copia canales saneados y estado de olas al A1 y al Maggabox (nunca las claves)."""
    directorio_olas = olas_dir or OLAS
    directorio_estado = dir_estado or ESTADO
    plan = plan_replica(fuentes=seleccion_olas(directorio_olas, ahora))
    resultados = []
    for articulo in plan:
        destino = articulo["destino"]
        if destino in (omitir or ()):
            continue
        directorio = (destinos or {}).get(destino) or os.environ.get(DESTINOS_ENV[destino], "")
        if seco:
            resultados.append({"destino": destino, "ok": True, "seco": True})
        elif not directorio:
            resultados.append({"destino": destino, "ok": False,
                               "motivo": "sin destino configurado (%s)" % DESTINOS_ENV[destino]})
        else:
            try:
                resultados.append(_copiar_a(directorio, articulo, canales or CANALES_JSON,
                                            directorio_olas, directorio_estado))
            except OSError as e:
                resultados.append({"destino": destino, "ok": False,
                                   "motivo": "%s al replicar" % type(e).__name__})
    return {"resultados": resultados, "plan": plan}


def estado(medio="a1", dir_estado=None, ahora=None):
    """Foto sin secretos: antigüedad de cada latido, arriendos y decisión del medio."""
    directorio = dir_estado or ESTADO
    momento = time.time() if ahora is None else float(ahora)
    latidos = cargar_latidos(directorio)
    arriendos = cargar_arriendos(directorio)
    return {
        "medio": medio,
        "latidos_s": {m: int(momento - t) for m, t in sorted(latidos.items())},
        "vivos": sorted(m for m in MEDIOS if medio_vivo(latidos, m, momento)),
        "arriendos": arriendos,
        "decisiones": decidir_arriendo(latidos, arriendos, momento, medio),
        "registro": problemas_registro(),
    }


def bucle(medio="a1", cada=60.0, replicar_cada=180.0, dir_estado=None):
    """Servicio: late, decide el arriendo y replica; nunca deja caer el canal por un fallo."""
    ultimo_envio = 0.0
    while True:
        try:
            latir(medio, dir_estado=dir_estado)
            turno(medio, dir_estado=dir_estado)
            if time.time() - ultimo_envio >= float(replicar_cada):
                replicar(dir_estado=dir_estado,
                         omitir=(medio,) if medio != "mac" else ())
                ultimo_envio = time.time()
        except Exception as e:  # noqa: BLE001 — el latido no se cae por un error de un medio
            print("relevo de medios: %s" % type(e).__name__, flush=True)
        time.sleep(max(5.0, float(cada)))


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="orden", required=True)
    r = sub.add_parser("registro")
    r.add_argument("--json", action="store_true")
    la = sub.add_parser("latir")
    la.add_argument("--medio", default="mac")
    t = sub.add_parser("turno")
    t.add_argument("--medio", default="a1")
    t.add_argument("--seco", action="store_true")
    t.add_argument("--json", action="store_true")
    rp = sub.add_parser("replicar")
    rp.add_argument("--seco", action="store_true")
    rp.add_argument("--json", action="store_true")
    s = sub.add_parser("simulacro")
    s.add_argument("--minutos", type=float)
    s.add_argument("--json", action="store_true")
    e = sub.add_parser("estado")
    e.add_argument("--medio", default="a1")
    e.add_argument("--json", action="store_true")
    b = sub.add_parser("bucle")
    b.add_argument("--medio", default="a1")
    b.add_argument("--cada", type=float, default=60.0)
    b.add_argument("--replicar-cada", type=float, default=180.0)
    a = p.parse_args(argv)

    if a.orden == "registro":
        salida = {
            "problemas": problemas_registro(),
            "medios": {m: {"especialidad": list(d["especialidad"]), "releva": d["releva"],
                           "canales": list(d["canales"]), "claves": d["claves"]}
                       for m, d in MEDIOS.items()},
            "canales": registro_publico(_leer_json(CANALES_JSON)),
        }
        if a.json:
            print(json.dumps(salida, ensure_ascii=False, indent=1))
        else:
            for m, d in MEDIOS.items():
                print("%-15s releva a %-10s %s" % (m, d["releva"], " · ".join(d["especialidad"])))
            print("canales: %s" % ", ".join(
                "%s → %s" % (v["nombre"], v["telegram_bot"]) for v in salida["canales"].values()))
            if salida["problemas"]:
                print("problemas: %s" % "; ".join(salida["problemas"]))
        return 0 if not salida["problemas"] else 1
    if a.orden == "latir":
        latir(a.medio)
        print("latido de %s anotado" % a.medio)
        return 0
    if a.orden == "turno":
        r = turno(a.medio, seco=a.seco)
        if a.json:
            print(json.dumps(r, ensure_ascii=False, indent=1))
        else:
            for canal in CANALES:
                d = r["decisiones"][canal]
                print("%-12s %-9s dueño=%s offset=%s (%s)" % (
                    canal, d["accion"], d["dueno"], d["offset"], d["motivo"]))
        return 0
    if a.orden == "replicar":
        r = replicar(seco=a.seco)
        print(json.dumps(r, ensure_ascii=False, indent=1) if a.json else
              " · ".join("%s:%s" % (x["destino"], "ok" if x["ok"] else x.get("motivo"))
                         for x in r["resultados"]))
        return 0 if all(x["ok"] for x in r["resultados"]) else 1
    if a.orden == "simulacro":
        sim = simular_relevo(cargar_latidos(), time.time(), a.minutos or MINUTOS_SIN_LATIDO)
        print(json.dumps(sim, ensure_ascii=False) if a.json else
              "el respaldo responde en %ss (tope %ss): %s" % (
                  sim["responde_en_s"], sim["tope_s"], "bien" if sim["ok"] else "tarde"))
        return 0 if sim["ok"] else 1
    if a.orden == "estado":
        r = estado(a.medio)
        print(json.dumps(r, ensure_ascii=False, indent=1))
        return 0
    bucle(a.medio, a.cada, a.replicar_cada)
    return 0


if __name__ == "__main__":
    sys.exit(main())
