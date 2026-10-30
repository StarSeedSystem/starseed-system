#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""La noche de automejora Meta^n en el A1 (MTN1027G · contrato §3–§4).

Meta^n PROPONE dentro de la caja Docker sin red ni claves; este nodo arranca la
Pasarela, corre la caja y JUZGA fuera con los `/v1/systemone` locales: cada caso
apartado con y sin `pautas_astraura`, comparado con su etiqueta. Sin extremo que
conteste no se activa nada. Escribe `salida/<fecha>.json` con directivas y
propuestas. PURO salvo `main noche`: todo lo demás son funciones sin efectos."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import threading
import time
from datetime import datetime

AQUI = os.path.dirname(os.path.abspath(__file__))
if AQUI not in sys.path:
    sys.path.insert(0, AQUI)

import automejora_logica as AL  # noqa: E402
import automejora_pasarela as AP  # noqa: E402

BASE = os.environ.get("STARSEED_AUTOMEJORA_BASE", "/var/lib/starseed/automejora")
IMAGEN = "starseed-automejora:b7081843d3c7"
DOCKERFILE = "/opt/starseed/nodo/automejora"
FRESCURA_S = 48 * 3600
MEM_MIN_KB = 1_500_000
TOPE_CAJA_S = 90 * 60
LOCALES = "http://127.0.0.1:4470/v1/systemone,http://127.0.0.1:4480/v1/systemone"


def _texto(ruta):
    try:
        with open(ruta, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def _leer(ruta, defecto=None):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _jsonl(ruta):
    salida = []
    for linea in _texto(ruta).splitlines():
        try:
            salida.append(json.loads(linea))
        except ValueError:
            continue
    return salida


def _escribir(ruta, datos):
    os.makedirs(os.path.dirname(os.path.abspath(ruta)), exist_ok=True)
    temporal = ruta + ".tmp"
    with open(temporal, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(temporal, ruta)


def frescos(rutas, ahora=None, tope=FRESCURA_S):
    """True si todas existen y ninguna tiene más de `tope` segundos."""
    ahora = time.time() if ahora is None else ahora
    try:
        return all(0 <= ahora - os.path.getmtime(r) <= tope for r in rutas)
    except OSError:
        return False


def mem_available_kb(texto):
    """MemAvailable de /proc/meminfo en kB; 0 si no está."""
    for linea in (texto or "").splitlines():
        if linea.startswith("MemAvailable:"):
            try:
                return int(linea.split()[1])
            except (IndexError, ValueError):
                return 0
    return 0


def capas_encendidas(config):
    """[capas] encendidas; admite {"capas": {x: true}} y {x: {"encendida": true}}."""
    capas = (config or {}).get("capas", config or {})
    if isinstance(capas, dict):
        return [c for c, v in capas.items()
                if v is True or (isinstance(v, dict) and v.get("encendida"))]
    return [c for c in capas or [] if isinstance(c, str)]


def pauta_de(pautas):
    """El texto fijo de `pautas.json` ({task_id: texto}) ya saneado, o None."""
    if not isinstance(pautas, dict) or not pautas:
        return None
    fija = AL.pauta_fija([str(v) for v in pautas.values()])
    if not fija:
        return None
    saneada = AL.sanear_pauta(fija)
    return saneada.get("texto") if saneada.get("ok") else None


def sha256(texto):
    return hashlib.sha256((texto or "").encode()).hexdigest()


def etiqueta(caso):
    """La verdad del caso apartado: `verification_script` {"ok": bool} o `resultado`."""
    try:
        return bool(json.loads(caso.get("verification_script") or "").get("ok"))
    except (ValueError, AttributeError, TypeError):
        return caso.get("resultado", caso.get("etiqueta"))


def estado_del_caso(caso, pauta=None):
    estado = {"entrada": caso.get("description", ""), "capa": caso.get("capa", "")}
    if pauta:
        estado["pautas_astraura"] = pauta
    return estado


def preguntas_del_caso(caso):
    return {"respuesta": {"type": "si_no", "question": caso.get("description", "")}}


def es_si(respuestas):
    """bool de una respuesta de /v1/systemone; None si no se entiende."""
    if not isinstance(respuestas, dict):
        return None
    if isinstance(respuestas.get("answers"), dict):
        respuestas = respuestas["answers"]
    valor = respuestas.get("respuesta", respuestas.get("acierto"))
    if valor is None:
        valor = next(iter(respuestas.values()), None)
    if isinstance(valor, bool):
        return valor
    if isinstance(valor, dict):
        if "noul" in valor:
            try:
                return float(valor["noul"]) >= 0.5
            except (TypeError, ValueError):
                return None
        valor = valor.get("value", valor.get("answer", valor.get("label")))
    if isinstance(valor, (int, float)) and not isinstance(valor, bool):
        return bool(valor)
    if isinstance(valor, str):
        return valor.strip().lower() in ("si", "sí", "yes", "true", "1", "correcto")
    return None


def con_etiquetas(casos, experiencias):
    """Repone la etiqueta de los apartados desde su experiencia (D la pierde)."""
    por_id = {e.get("id"): e for e in experiencias if e.get("resultado") is not None}
    return [{**caso, "resultado": por_id[caso["task_id"]]["resultado"]}
            for caso in casos if caso.get("task_id") in por_id]


def juzgar(casos, consultar, pauta):
    """Capa de verdad con y sin pauta contra la etiqueta. Sin respuesta: sin juez."""
    base = con = n = 0
    for caso in casos:
        esperado = etiqueta(caso)
        if esperado is None:
            continue
        sin = es_si(consultar(estado_del_caso(caso), preguntas_del_caso(caso)))
        con_pauta = es_si(consultar(estado_del_caso(caso, pauta),
                                    preguntas_del_caso(caso)))
        if sin is None or con_pauta is None:
            return {"sin_juez": True, "base": 0.0, "acierto": 0.0, "n": 0}
        n += 1
        base += int(sin == esperado)
        con += int(con_pauta == esperado)
    return {"sin_juez": n == 0, "base": base / n if n else 0.0,
            "acierto": con / n if n else 0.0, "n": n}


def endpoints_locales():
    lista = os.environ.get("STARSEED_SYSTEMONE_LOCALES") or LOCALES
    return [u.strip() for u in lista.split(",") if u.strip()]


def _post(url, cuerpo):
    import urllib.request
    peticion = urllib.request.Request(
        url, data=cuerpo, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(peticion, timeout=3) as respuesta:
        return respuesta.status, respuesta.read().decode("utf-8", "replace")


def consultar_local(estado, preguntas, urls=None, transporte=None):
    """El primer /v1/systemone vivo, como jev.py; None si ninguno contesta."""
    cuerpo = json.dumps({"state": estado, "questions": preguntas},
                        ensure_ascii=False).encode("utf-8")
    transporte = transporte or _post
    for url in urls or endpoints_locales():
        try:
            codigo, texto = transporte(url, cuerpo)
            if codigo != 200:
                continue
            datos = json.loads(texto)
        except Exception:
            continue
        if isinstance(datos, dict):
            return datos.get("answers") if isinstance(datos.get("answers"), dict) else datos
    return None


def orden_docker(carpeta, socket, modelo="auto", iteraciones=6, paciencia=2):
    """La orden de la caja, SIEMPRE como lista y sin red ni claves."""
    return ["docker", "run", "--rm", "--network", "none", "--read-only",
            "--tmpfs", "/tmp", "--memory", "1g", "--cpus", "1",
            "--pids-limit", "256", "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges", "-e", "HOME=/tmp",
            "-v", "%s:/work" % carpeta, "-v", "%s:/run/llm.sock" % socket,
            IMAGEN, "--modelo", modelo, "--iteraciones", str(iteraciones),
            "--paciencia", str(paciencia)]


def _correr(orden, tope):
    """Ejecuta una orden como lista con tope; nunca lanza."""
    try:
        r = subprocess.run(orden, capture_output=True, text=True, timeout=tope)
        return {"codigo": r.returncode, "salida": (r.stdout or "")[-4000:],
                "error": (r.stderr or "")[-2000:]}
    except subprocess.TimeoutExpired:
        return {"codigo": 124, "salida": "", "error": "tiempo agotado"}
    except OSError as error:
        return {"codigo": 127, "salida": "", "error": str(error)}


def _admitir(capa):
    """D no incluía «juicio» (ni capas futuras): la noche las admite aquí."""
    if capa not in AL.CAPAS_VALIDAS:
        AL.CAPAS_VALIDAS = tuple(AL.CAPAS_VALIDAS) + (capa,)
    return capa


def _modelos():
    """Modelos que la pasarela deja pasar; None = el defecto de la pasarela."""
    return [m for m in os.environ.get("STARSEED_AUTOMEJORA_MODELOS", "").split(",") if m] or None


def _imagen(correr):
    """La imagen fijada, o se construye la del paquete del nodo si falta."""
    if correr(["docker", "image", "inspect", IMAGEN], 60)["codigo"] == 0:
        return True
    return correr(["docker", "build", "-t", IMAGEN, DOCKERFILE], 3600)["codigo"] == 0


def noche(base=None, ahora=None, correr=None, consultar=None, mem=None):
    """Una noche completa; devuelve el informe que deja en `salida/<fecha>.json`."""
    base = base or BASE
    ahora = time.time() if ahora is None else ahora
    correr = correr or _correr
    consultar = consultar or consultar_local
    fecha = datetime.fromtimestamp(ahora).strftime("%Y-%m-%d")
    entrada = os.path.join(base, "entrada")
    trabajo = os.path.join(base, "trabajo", fecha)
    informe = {"ultima_noche": fecha, "directivas": [], "propuestas": [], "motivo": ""}

    def cerrar(motivo):
        informe["motivo"] = motivo
        _escribir(os.path.join(base, "salida", fecha + ".json"), informe)
        return informe

    config_ruta = os.path.join(entrada, "config.json")
    exp_ruta = os.path.join(entrada, "experiencias.jsonl")
    if not frescos([config_ruta, exp_ruta], ahora):
        return cerrar("sin entrada fresca (faltan o pasan de 48 h): no se hace nada")
    mem = mem_available_kb(_texto("/proc/meminfo")) if mem is None else mem
    if mem < MEM_MIN_KB:
        return cerrar("sin sitio: MemAvailable %.2f GB < 1,5 GB" % (mem / 1024 / 1024))
    if correr(["docker", "version"], 30)["codigo"] != 0:
        return cerrar("sin Docker: no se ejecuta la caja")
    if not _imagen(correr):
        return cerrar("no se pudo construir la imagen %s" % IMAGEN)
    experiencias = _jsonl(exp_ruta)
    for capa in capas_encendidas(_leer(config_ruta, {})):
        capa = _admitir(capa)
        carpeta = os.path.join(trabajo, capa)
        os.makedirs(carpeta, exist_ok=True)
        try:
            tareas = AL.tareas_desde_experiencias(experiencias, capa)
        except ValueError as error:
            informe.setdefault("errores", []).append(
                {"capa": capa, "motivo": str(error)})
            continue
        _escribir(os.path.join(carpeta, "tareas.json"), tareas["entrenamiento"])
        _escribir(os.path.join(carpeta, "apartadas-sin-etiqueta.json"),
                  tareas["apartadas"]["sin_script"])
        socket = os.path.join(trabajo, "llm.sock")
        try:
            servidor = AP.montar(socket, None, _modelos())
            threading.Thread(target=servidor.serve_forever, daemon=True).start()
            try:
                resultado = correr(orden_docker(carpeta, socket), TOPE_CAJA_S)
            finally:
                servidor.shutdown()
                servidor.server_close()
        except Exception as error:  # la pasarela o el hilo no pueden tumbar la noche
            informe.setdefault("errores", []).append(
                {"capa": capa, "motivo": str(error)})
            continue
        if resultado["codigo"] != 0:
            informe.setdefault("errores", []).append(
                {"capa": capa, "motivo": resultado.get("error") or "la caja falló"})
            continue
        pauta = pauta_de(_leer(os.path.join(carpeta, "pautas.json"), {}))
        if pauta:
            casos = con_etiquetas(tareas["apartadas"]["con_etiqueta"], experiencias)
            juicio = juzgar(casos, consultar, pauta)
            if juicio["sin_juez"]:
                informe.setdefault("sin_juez", []).append(
                    {"capa": capa, "motivo": "sin juez"})
            elif AL.veredicto(juicio["base"], juicio["acierto"], juicio["n"])["aprueba"]:
                informe["directivas"].append({
                    "capa": capa, "texto": pauta, "sha256": sha256(pauta),
                    "acierto": round(juicio["acierto"], 4),
                    "base": round(juicio["base"], 4), "n": juicio["n"]})
        mejor = _leer(os.path.join(carpeta, "mejor.json"), {})
        informe["propuestas"].extend(
            AL.propuestas_de_ayuda(mejor.get("capas", []), capa, fecha))
    return cerrar("hecho")


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv[:1] != ["noche"]:
        print("uso: automejora_nodo.py noche")
        return 2
    print(json.dumps(noche(), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
