#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Director de diseño — §1, §5 y §8 del contrato `architecture/director-diseno.md`.

Tres momentos por tarea de interfaz: brief al entrar (§1.1), verificación al
integrar (§1.2/§4, vía `diseno_verificar.mjs` por subproceso con tope de 300 s más
`diseno_reglas.puntuar`) y aprendizaje (§5). Cada lunes encola la tarea de
tendencias `DIST<AAMMDD>` (§2, como mucho una por semana) y cada hora publica el
informe en el Chat Director. Latido `director-diseno` en cada ciclo.

  python3 scripts/puente/director-diseno.py [--una-vez] [--seco] [--intervalo 120]

`--seco` no escribe nada ni publica: solo imprime el resumen del ciclo. Todas las
dependencias son inyectables en `ciclo(ahora, deps)`; las de por defecto tocan
disco y procesos de verdad. Nunca toca claves, git push ni Supabase.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(
    0,
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "enjambre"),
)

import config_director as CD
import director_chat as DC
import diseno_brief as DB
import diseno_reglas as DR
import mensajes_agente as MA
import puente as PU

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
BASE_LOCAL = os.environ.get("STARSEED_MANDO_URL") or "http://127.0.0.1:9002"
DIR_DISENO = os.path.expanduser("~/.starseed/diseno")
ESTADO = os.path.join(DIR_DISENO, "estado.json")
PESOS_MODELOS = os.path.join(DIR_DISENO, "pesos-modelos.json")
ROTACION = os.path.join(DIR_DISENO, "recomendacion-rotacion.json")
APRENDIZAJES = os.path.join(RAIZ, "memory", "diseno", "aprendizajes.md")
TENDENCIAS_MD = os.path.join(RAIZ, "memory", "diseno", "tendencias.md")
COLA_TENDENCIAS = os.path.join(OLAS, "cola-diseno.json")
CAPTURAS = os.path.join(RAIZ, "starseed_memory_root", "diseno", "capturas")
LATIDO = os.path.join(OLAS, "latidos-externo-director-diseno.json")
TOPE_VERIFICACION_S = 300
P_SEP = os.sep

# Prefijos de archivo de la tarea -> ruta que sirve Genesis. Sin deducción no se
# inventa nada: se dice y se registra (§4).
RUTAS_POR_CARPETA = {
    "src/components/mando/": "/genesis",
    "src/components/genesis/": "/genesis",
    "src/app/(app)/genesis/": "/genesis",
    "src/components/audiomorphic/": "/audiomorphic",
    "src/app/(app)/audiomorphic/": "/audiomorphic",
    "src/components/escritorios/": "/escritorios",
    "src/app/globals.css": "/genesis",
    "tailwind.config.ts": "/genesis",
}


def rutas_de(archivos):
    """Rutas a verificar a partir de los archivos de la tarea.

    Primero la tabla RUTAS_POR_CARPETA; luego la regla genérica de App Router
    (src/app/<segmentos>/page.tsx -> /<segmentos>, ignorando grupos «(x)»).
    Sin duplicados; vacío si no se deduce nada.
    """
    rutas = []
    for ruta in archivos or []:
        ruta = str(ruta).replace("\\", "/")
        for prefijo, destino in RUTAS_POR_CARPETA.items():
            if ruta.startswith(prefijo) or ruta == prefijo:
                if destino not in rutas:
                    rutas.append(destino)
                break
        else:
            if not ruta.startswith("src/app/"):
                continue
            partes = [
                p
                for p in ruta[len("src/app/"):].split("/")[:-1]
                if p and not (p.startswith("(") and p.endswith(")"))
            ]
            if partes:
                destino = "/" + "/".join(partes)
                if destino not in rutas:
                    rutas.append(destino)
    return rutas


def _leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as fh:
            datos = json.load(fh)
        return datos if isinstance(datos, type(defecto)) else defecto
    except Exception:
        return defecto


def _escribir_json(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(datos, fh, ensure_ascii=False, indent=2)
    os.replace(tmp, ruta)


def _leer_progreso():
    return _leer_json(os.path.join(OLAS, "progreso.json"), {})


def _leer_colas():
    """Tareas de todas las colas JSON de olas/ (las de control y latidos, fuera)."""
    tareas = []
    try:
        for nombre in sorted(os.listdir(OLAS)):
            if not nombre.endswith(".json"):
                continue
            if nombre.startswith(("control-", "latidos-")):
                continue
            datos = _leer_json(os.path.join(OLAS, nombre), {})
            lista = datos.get("tareas") if isinstance(datos, dict) else None
            if isinstance(lista, list):
                tareas.extend(t for t in lista if isinstance(t, dict) and t.get("id"))
    except OSError:
        pass
    return tareas


def _verificar_real(tid, rutas):
    """Lanza diseno_verificar.mjs con tope de 300 s y devuelve la lista de informes."""
    salida = os.path.join(CAPTURAS, tid)
    cmd = [
        "node",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "diseno_verificar.mjs"),
        "--base", BASE_LOCAL,
        "--rutas", ",".join(rutas),
        "--salida", salida,
    ]
    try:
        proc = subprocess.run(
            cmd, cwd=RAIZ, capture_output=True, text=True, timeout=TOPE_VERIFICACION_S
        )
        datos = json.loads(proc.stdout.strip() or "[]")
        return datos if isinstance(datos, list) else [datos]
    except Exception as e:  # subproceso muerto, tope cumplido o JSON roto
        return [{
            "ruta": ",".join(rutas),
            "tamano": "?",
            "errores_consola": ["verificación rota: %s: %s" % (type(e).__name__, e)],
        }]


def _encolar_real(tarea):
    """Encola la tarea de tendencias en cola-diseno.json (una por semana, viaja §2)."""
    datos = _leer_json(COLA_TENDENCIAS, {"ola": "diseno", "tareas": []})
    datos.setdefault("ola", "diseno")
    datos.setdefault("tareas", [])
    if any(t.get("id") == tarea["id"] for t in datos["tareas"] if isinstance(t, dict)):
        return
    datos["tareas"].append(tarea)
    _escribir_json(COLA_TENDENCIAS, datos)


def _latido_real(ahora):
    _escribir_json(LATIDO, {
        "cola": "externo-director-diseno",
        "donde": "director-diseno",
        "escrito": ahora,
        "tareas": {},
    })


def deps_por_defecto():
    """Las dependencias reales del servicio; en pruebas se inyectan falsas."""
    return {
        "leer_progreso": _leer_progreso,
        "leer_colas": _leer_colas,
        "cargar_memoria": lambda: DB.cargar_memoria(RAIZ),
        "cargar_config": lambda: CD.cargar()[0].get("diseno", {}),
        "anotar": lambda tid, texto: MA.anotar(OLAS, tid, texto, de="director-diseno"),
        "verificar": _verificar_real,
        "diff_de": lambda tid: "",
        "juez": lambda tid, rutas: None,  # juez visual opcional (§4): None = no opina
        "publicar": lambda texto, tipo="informe": DC.publicar(
            texto, de="director-diseno", tipo=tipo),
        "decir": lambda texto, tipo="hecho": PU.decir(
            texto, quien="director-diseno", tipo=tipo),
        "encolar": _encolar_real,
        "latido": _latido_real,
        "guardar_estado": lambda est: _escribir_json(ESTADO, est),
        "leer_estado": lambda: _leer_json(ESTADO, {}),
        "guardar_pesos": lambda p: _escribir_json(PESOS_MODELOS, p),
        "leer_pesos": lambda: _leer_json(PESOS_MODELOS, {}),
        "guardar_rotacion": lambda r: _escribir_json(ROTACION, r),
        "aprender_linea": lambda linea: _anexar(APRENDIZAJES, linea),
    }


def _anexar(ruta, linea):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "a", encoding="utf-8") as fh:
        fh.write(linea + "\n")


def _aprender(deps, tid, modelo, nota, tipos, ahora):
    """§5: línea en aprendizajes.md, nota media por modelo y recomendación
    de rotación para el optimizador (no se le toca: él la lee)."""
    deps["aprender_linea"](
        "- %s · %s · nota %d · modelo %s · fallos: %s"
        % (time.strftime("%Y-%m-%d", time.localtime(ahora)), tid, nota,
           modelo or "?", ", ".join(tipos) or "ninguno")
    )
    pesos = deps["leer_pesos"]()
    clave = modelo or "desconocido"
    entrada = pesos.get(clave) or {"suma": 0, "n": 0}
    entrada["suma"] += nota
    entrada["n"] += 1
    pesos[clave] = entrada
    deps["guardar_pesos"](pesos)
    orden = sorted(
        pesos,
        key=lambda m: -(pesos[m]["suma"] / max(1, pesos[m]["n"])),
    )
    deps["guardar_rotacion"]({
        "orden": orden,
        "medias": {
            m: round(pesos[m]["suma"] / max(1, pesos[m]["n"]), 1) for m in pesos
        },
        "actualizado": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(ahora)),
    })


def _fase_briefs(deps, tareas, progreso, estado, memoria, cfg, resumen, seco):
    """§1.1: brief UNA vez por tarea de interfaz al pasar a `en_curso`."""
    hechos = estado.setdefault("briefs", {})
    for tarea in tareas:
        tid = tarea.get("id")
        if not tid or tid in hechos:
            continue
        if (progreso.get(tid) or {}).get("estado") != "en_curso":
            continue
        if not DB.es_de_interfaz(tarea):
            continue
        texto = DB.brief(tarea, memoria, max_chars=cfg.get("max_brief_chars", 2500))
        if seco:
            resumen["seco"].append("brief %s (%d chars)" % (tid, len(texto)))
        else:
            deps["anotar"](tid, texto)
        hechos[tid] = True
        resumen["briefs"] += 1


def _fallos_y_nota(informes, diff, umbral):
    """Puntúa cada informe con las reglas mecánicas; la nota de la tarea es la
    peor pantalla (la matriz aprueba entera o no aprueba)."""
    resultados = []
    for informe in informes:
        resultado = DR.puntuar(informe, diff, umbral)
        resultados.append(resultado)
    if not resultados:
        return 0, [], False
    nota = min(r["nota"] for r in resultados)
    fallos = []
    for r in resultados:
        fallos.extend(r.get("fallos") or [])
    return nota, fallos, all(r.get("aprobado") for r in resultados)


def _fase_verificacion(deps, tareas, progreso, estado, cfg, resumen, seco, ahora):
    """§1.2: al `commit` de una tarea de interfaz, verificar sus rutas. Con nota
    baja, los arreglos concretos llegan al agente y al revisor (mismo buzón:
    `mensajes_agente.anotar`) y hay aviso en el Chat Director y en el canal."""
    umbral = int(cfg.get("umbral", DR.UMBRAL_DEFECTO))
    hechas = estado.setdefault("verificadas", {})
    for tarea in tareas:
        tid = tarea.get("id")
        if not tid or tid in hechas:
            continue
        if (progreso.get(tid) or {}).get("estado") != "commit":
            continue
        if not DB.es_de_interfaz(tarea):
            continue
        rutas = rutas_de(tarea.get("archivos") or [])
        if not rutas:
            resumen["avisos"].append("%s: interfaz sin rutas deducibles; nada que capturar" % tid)
            hechas[tid] = {"sin_rutas": True}
            continue
        if seco:
            resumen["seco"].append("verificaría %s en %s" % (tid, ", ".join(rutas)))
            hechas[tid] = {"seco": True}
            resumen["verificadas"] += 1
            continue
        informes = deps["verificar"](tid, rutas)
        nota, fallos, aprobado = _fallos_y_nota(informes, deps["diff_de"](tid), umbral)
        nota_juez = deps["juez"](tid, rutas) if cfg.get("juez_visual") else None
        if isinstance(nota_juez, (int, float)) and nota_juez < umbral and aprobado:
            # §4: el juez nunca baja un aprobado mecánico a suspenso; frena y avisa.
            resumen["avisos"].append(
                "%s: el juez visual puntúa %d pero la nota mecánica aprueba; queda anotado"
                % (tid, nota_juez)
            )
        hechas[tid] = {"nota": nota, "aprobado": aprobado, "rutas": rutas}
        resumen["verificadas"] += 1
        estado.setdefault("notas", []).append({
            "tid": tid,
            "nota": nota,
            "modelo": (progreso.get(tid) or {}).get("modelo", ""),
            "tipos": sorted({f.get("tipo", "?") for f in fallos}),
        })
        estado["notas"] = estado["notas"][-200:]
        _aprender(deps, tid, estado["notas"][-1]["modelo"], nota,
                  estado["notas"][-1]["tipos"], ahora)
        if not aprobado:
            arreglos = "\n".join("- %s" % f.get("arreglo", f.get("tipo", "?"))
                                 for f in fallos[:10])
            deps["anotar"](
                tid,
                "Diseño (%s): nota %d/100 con umbral %d. Arreglos concretos:\n%s"
                % (", ".join(rutas), nota, umbral, arreglos or "- sin detalle"),
            )
            aviso = "Diseño: %s no llega al umbral (%d/%d, umbral %d). Arreglos anotados al agente y al revisor." % (
                tid, nota, 100, umbral)
            deps["publicar"](aviso, tipo="aviso")
            deps["decir"](aviso, tipo="aviso")


def _fase_tendencias(deps, estado, resumen, seco, ahora):
    """§2: cada lunes, una tarea DIST<AAMMDD> de tendencias; como mucho una por
    semana, aunque el servicio se reinicie el martes."""
    tm = time.localtime(ahora)
    if tm.tm_wday != 0:
        return
    semana = time.strftime("%Y-%W", tm)
    if estado.get("ultima_tendencia") == semana:
        return
    tid = "DIST" + time.strftime("%y%m%d", tm)
    tarea = {
        "id": tid,
        "titulo": "Tendencias de diseño — semana %s" % semana,
        "prompt": (
            "Revisa las galerías de memory/diseno/referencias.md y anota de 5 a 10 "
            "tendencias en memory/diseno/tendencias.md, cada una con su enlace y cómo "
            "encaja (o no) en cada identidad de identidades.md."
        ),
        "archivos": ["memory/diseno/tendencias.md"],
        "area": "diseno",
    }
    if seco:
        resumen["seco"].append("encolaría %s" % tid)
    else:
        deps["encolar"](tarea)
    estado["ultima_tendencia"] = semana
    resumen["tendencias"] = tid


def _fase_informe(deps, estado, resumen, seco, ahora):
    """§8: informe cada hora al Chat Director con notas, fallos repetidos,
    modelos mejor y peor en interfaz y tendencias nuevas."""
    if ahora - float(estado.get("ultimo_informe", 0) or 0) < 3600:
        return
    notas = estado.get("notas") or []
    lineas = ["Informe de diseño (director-diseno)"]
    if notas:
        medias = {}
        for n in notas:
            medias.setdefault(n.get("modelo") or "?", []).append(n.get("nota", 0))
        orden = sorted(medias, key=lambda m: -(sum(medias[m]) / len(medias[m])))
        lineas.append("Notas recientes: " + "; ".join(
            "%s %d" % (n.get("tid"), n.get("nota", 0)) for n in notas[-8:]))
        lineas.append("Mejor escritor en interfaz: %s · peor: %s" % (orden[0], orden[-1]))
        repetidos = {}
        for n in notas:
            for tipo in n.get("tipos", []):
                repetidos[tipo] = repetidos.get(tipo, 0) + 1
        comunes = [t for t, c in repetidos.items() if c >= 3]
        if comunes:
            lineas.append("Fallos repetidos (candidatos a regla §6): " + ", ".join(comunes))
    else:
        lineas.append("Sin tareas de interfaz verificadas todavía.")
    if estado.get("ultima_tendencia"):
        lineas.append("Tendencias al día: semana %s." % estado["ultima_tendencia"])
    texto = "\n".join(lineas)
    if seco:
        resumen["seco"].append("informe: %d líneas" % len(lineas))
    else:
        deps["publicar"](texto, tipo="informe")
        deps["decir"]("Informe de diseño publicado en el Chat Director", tipo="hecho")
    estado["ultimo_informe"] = ahora
    resumen["informe"] = True


def ciclo(ahora, deps):
    """Un ciclo completo del director. `deps` lleva todas las dependencias
    inyectables (ver `deps_por_defecto`); `deps["seco"]` imprime sin escribir.
    Devuelve el resumen del ciclo."""
    seco = bool(deps.get("seco"))
    resumen = {"briefs": 0, "verificadas": 0, "avisos": [], "seco": [],
               "informe": False, "tendencias": None, "activo": True}
    try:
        if not seco:
            deps["latido"](ahora)
    except Exception:
        pass  # un latido roto nunca para el ciclo
    cfg = deps["cargar_config"]() or {}
    if not cfg.get("activo", True):
        resumen["activo"] = False
        return resumen
    estado = deps["leer_estado"]() if not seco else dict(deps["leer_estado"]() or {})
    progreso = deps["leer_progreso"]()
    tareas = deps["leer_colas"]()
    memoria = deps["cargar_memoria"]()
    _fase_briefs(deps, tareas, progreso, estado, memoria, cfg, resumen, seco)
    _fase_verificacion(deps, tareas, progreso, estado, cfg, resumen, seco, ahora)
    _fase_tendencias(deps, estado, resumen, seco, ahora)
    _fase_informe(deps, estado, resumen, seco, ahora)
    if not seco:
        deps["guardar_estado"](estado)
    return resumen


def main(argv=None):
    parser = argparse.ArgumentParser(description="Director de diseño")
    parser.add_argument("--una-vez", action="store_true", help="Un solo ciclo y termina")
    parser.add_argument("--seco", action="store_true",
                        help="No escribe ni publica: imprime el resumen")
    parser.add_argument("--intervalo", type=int, default=None,
                        help="Segundos entre ciclos (defecto: diseno.intervalo_s)")
    args = parser.parse_args(argv)
    deps = deps_por_defecto()
    deps["seco"] = args.seco
    intervalo = args.intervalo
    if intervalo is None:
        try:
            intervalo = int(deps["cargar_config"]().get("intervalo_s", 120))
        except Exception:
            intervalo = 120

    def una_pasada():
        try:
            resumen = ciclo(time.time(), deps)
        except Exception as e:  # un ciclo roto no tumba al servicio
            print("[%s] ciclo roto: %s: %s" % (
                time.strftime("%H:%M"), type(e).__name__, e), flush=True)
            return
        if args.seco or args.una_vez:
            print(json.dumps(resumen, ensure_ascii=False), flush=True)

    if args.una_vez:
        una_pasada()
        return 0
    while True:
        una_pasada()
        time.sleep(intervalo)


if __name__ == "__main__":
    raise SystemExit(main())
