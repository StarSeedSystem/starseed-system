#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Director de la nube: mantiene encendido el medio de GitHub Actions sin que nadie lo pida.

Alex (2026-09-20): «sincroniza la mayor cantidad posible de agentes simultáneos que los
directores puedan manejar y que los servicios gratuitos nos ofrezcan». El medio de la nube
existía desde el día 20 y NUNCA se encendió solo: había que lanzarlo a mano con
`nube-gh.py lanzar`, y como nadie lo lanzaba, tres agentes gratuitos de 4 vCPU / 16 GB
estuvieron apagados mientras la Mac iba al límite con tres.

Alex (2026-09-21): «aun no veo que suba el numero de agentes, son las capacidades de los
contenedores en la nube de todos los proveedores». Tenía razón y la culpa estaba AQUÍ, en
dos topes que no medían nada real:

  · `runs_en_marcha > 0` cortaba en seco. El comentario decía «un job por vez basta: el
    tope real son las pasarelas, no las máquinas». Medido el día 21: el grupo de
    concurrencia del workflow va por cola, así que DOS runs de colas distintas corrieron a
    la vez y entregaron 4 ramas `nube/*` — 9 agentes en total. El tope de un job era una
    creencia, no una medida.
  · `TOPE_DIA = 8` se agotaba a media tarde (log del 21: «tope del día alcanzado» desde las
    16:40 hasta las 20:21, cuatro horas sin nube con atraso en la cola).

Ahora el tope es el único que sí es real: **cuántos agentes simultáneos aguantan las
pasarelas gratuitas**, `TOPE_AGENTES`. Los jobs se lanzan en paralelo mientras quepan
agentes, y el número de agentes se MIDE de los runs vivos (no se supone) con
`agentes_nube.resumir`, el mismo lector que alimenta el medidor del Puente.

Lo que NO hace, a propósito:
  · No toca `main` con código: `nube-gh.py lanzar` solo publica el commit de la cola.
  · No lanza un run a medias: si el atraso no llena otro job, espera. Un agente sin tarea
    no es capacidad, es ruido.
  · No interrumpe nada de la Mac: la nube trabaja sobre tareas marcadas «reasignada · nube».

  python3 scripts/puente/director-nube.py
"""
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import repartir_nube as RN  # noqa: E402  (lógica pura del reparto: elegir, marcar, reclamar)

RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
INTERVALO_S = int(os.environ.get("STARSEED_NUBE_S", "240"))
#: Backstop, no política: con repo público los minutos de Actions son gratis, así que el
#: tope del día solo existe para no ensuciar el historial si algo se vuelve loco.
TOPE_DIA = int(os.environ.get("STARSEED_NUBE_TOPE_DIA", "30"))
#: 4 y no 3: el runner es de 4 vCPU / 16 GB. El 3 de la Mac es su límite de RAM (8 GB),
#: no una propiedad del enjambre; en la nube no hay gobernador que recorte, así que
#: `--workers 4` es un trabajador por vCPU.
TRABAJADORES = os.environ.get("STARSEED_NUBE_TRABAJADORES", "4")
#: El tope que SÍ mide algo: agentes simultáneos que aguantan las pasarelas gratuitas.
#: 12 = 3 jobs de 4. Si las pasarelas empiezan a devolver 429, este es el número a bajar.
TOPE_AGENTES = int(os.environ.get("STARSEED_NUBE_TOPE_AGENTES", "12"))
#: 45 y no 300: los logs de un job EN MARCHA no se pueden descargar, asi que el tope
#: es tambien el tiempo que tardamos en poder diagnosticar un cuelgue. (2026-09-20)
MINUTOS = os.environ.get("STARSEED_NUBE_MINUTOS", "45")
CUENTA = os.path.expanduser("~/.starseed/nube-lanzamientos.json")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def decidir_lanzamiento(atraso, runs_en_marcha, lanzados_hoy, tope_dia=TOPE_DIA,
                        hay_claves=True, agentes_en_marcha=0, trabajadores=None,
                        tope_agentes=TOPE_AGENTES):
    """Función PURA: (lanzar: bool, motivo: str). Aquí vive toda la política.

    Se lanza si el medio PUEDE trabajar (tiene las claves de proveedor en los secretos del
    repo), hay trabajo que la Mac no está tocando, CABEN más agentes bajo el tope de las
    pasarelas y el atraso llena el job que se va a lanzar. El orden de las comprobaciones
    es el orden en que importan.

    Lo de las claves es lo primero por una razón medida (2026-09-20): sin ellas el workflow
    arranca, instala todo y muere en el paso de claves. Lanzar cada pocos minutos un job que
    ya sabemos que va a morir no es insistir, es ensuciar el historial.

    `runs_en_marcha` ya no corta: solo decide si exigimos que el atraso llene el job (el
    primer run se lanza aunque solo haya una tarea; el segundo, no).
    """
    n = int(trabajadores or TRABAJADORES)
    if not hay_claves:
        return False, "sin claves de proveedor en los secretos del repo (las sube Alex: nube-gh.py secretos)"
    if lanzados_hoy >= tope_dia:
        return False, "tope del día alcanzado (%d)" % tope_dia
    if atraso <= 0:
        return False, "no hay atraso que repartir"
    libres = tope_agentes - max(0, agentes_en_marcha)
    if libres < n:
        return False, "%d agente(s) de nube ya en marcha: no caben %d más (tope %d)" % (
            agentes_en_marcha, n, tope_agentes)
    if runs_en_marcha > 0 and atraso < n:
        return False, "%d tarea(s) de atraso no llenan otro job de %d agentes" % (atraso, n)
    return True, "%d tarea(s) de atraso y sitio para %d agente(s) más (%d/%d en marcha)" % (
        atraso, n, agentes_en_marcha, tope_agentes)


def _sh(orden, timeout=120):
    try:
        r = subprocess.run(orden, cwd=RAIZ, capture_output=True, text=True, timeout=timeout)
        return r.stdout or ""
    except Exception:
        return ""


def _sh_rc(orden, timeout=120):
    """(returncode, stdout+stderr). `_sh` se come stderr y el código de salida, y por eso
    un lanzamiento abortado se contaba como lanzamiento hecho."""
    try:
        r = subprocess.run(orden, cwd=RAIZ, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except Exception as e:
        return 1, "%s: %s" % (type(e).__name__, e)


def atraso():
    """Cuántas tareas repartiría el reparto AHORA (simulación, no toca nada)."""
    salida = _sh([sys.executable, os.path.join(RAIZ, "scripts", "puente", "repartir-a-nube.py"),
                  "--tope", "6", "--simular"])
    for trozo in salida.split():
        if trozo.isdigit():
            return int(trozo)
    return 0


#: Los nombres que lee el paso de claves del workflow. Solo NOMBRES, jamás un valor.
CLAVES_DEL_ENJAMBRE = {
    "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "NVIDIA_API_KEY", "NVIDIA_SHARED_KEY",
    "OPENROUTER_API_KEY", "XKIRO_API_KEY", "AIHUBMIX_API_KEY", "TOKENROUTER_API_KEY",
    "GROQ_API_KEY", "STARSEED_PASARELA_GROQ_KEY",
}


def hay_claves():
    salida = _sh(["gh", "secret", "list", "--json", "name", "--jq", ".[].name"])
    return any(l.strip() in CLAVES_DEL_ENJAMBRE for l in salida.splitlines())


def medir_nube():
    """(runs_en_marcha, agentes_en_marcha), medido de GitHub y ESCRITO en el bus.

    Es el mismo lector del medidor del Puente (`agentes_nube`), a propósito: si el director
    y el medidor contaran por su cuenta volveríamos a la enfermedad de dos sitios que
    calculan el mismo número de forma distinta. Aquí se mide una vez y se escribe una vez.
    """
    try:
        import agentes_nube as AN

        # `AN.escribir` es el único escritor del bus, y no por elegancia: escribir aquí la
        # salida cruda de `resumir()` borraba los lanzamientos anotados y hacía que un run
        # de 4 agentes se contase como 1. (2026-09-22)
        resumen = AN.escribir(AN.resumir(AN._runs_de_github(), time.time()))
        return len(resumen.get("runs") or []), int(resumen.get("agentes") or 0)
    except Exception as e:
        print("director-nube: no pude medir la nube: %s: %s" % (type(e).__name__, e), flush=True)
        return 0, 0


def elegir_contenedor(contenedores):
    """PURA: en qué contenedor desplegar ahora, o None si en ninguno cabe nada.

    (2026-09-22) Alex: «que los directores de los agentes también usen esa información
    para enrutar procesos a agentes en todos los contenedores y siempre se aproveche la
    mayor cantidad disponible». Esto es ese enrutado: se elige el contenedor desplegable
    con más sitio libre. El inventario ya viene ordenado por estado y sitio, así que aquí
    no se vuelve a ordenar — un solo criterio, en un solo lugar.
    """
    for c in contenedores or []:
        if isinstance(c, dict) and c.get("desplegable") and int(c.get("agentes_libres") or 0) > 0:
            return c
    return None


def inventario_de_contenedores():
    """El inventario medido (y escrito) de los contenedores de nube.

    Los topes salen de aquí y no de constantes del director: antes `TOPE_AGENTES = 12` y
    `TRABAJADORES = 4` eran suposiciones escritas a mano que no tenían por qué coincidir
    con lo que el Puente enseñaba en pantalla. Ahora la pantalla y la decisión leen el
    mismo archivo.
    """
    try:
        import contenedores_nube as CN

        return CN.escribir(CN.inventario())
    except Exception as e:
        print("director-nube: no pude inventariar contenedores: %s: %s"
              % (type(e).__name__, e), flush=True)
        return {"contenedores": [], "resumen": {}}


def reclamar_varadas_de_la_nube(runs_vivos):
    """Devuelve a `pendiente` lo que se prestó a la nube y allí ya no lo hace nadie.

    (2026-09-22) Ver `repartir_nube.reclamar_varadas`. Esto es la mitad impura: leer el
    progreso, aplicar la regla y escribirlo. Se hace en cada pasada del director porque
    justo esto —una cadena colgando de dos tareas varadas— es lo que Alex ve como «5
    listas y ningún agente», y arreglarlo a mano cada vez no es un sistema.
    """
    ruta = os.path.join(RAIZ, "starseed_memory_root", "olas", "progreso.json")
    try:
        with open(ruta, encoding="utf-8") as f:
            progreso = json.load(f)
    except (OSError, ValueError):
        return []
    tareas = progreso.get("tareas") if isinstance(progreso, dict) and "tareas" in progreso else progreso
    if not isinstance(tareas, dict):
        return []
    ids = RN.reclamar_varadas(tareas, runs_vivos)
    if not ids:
        return []
    # (2026-09-24) Con cuántas veces se mandó y con lo que dijo la nube: si ya van tres,
    # a «Bloqueadas» con el motivo, no otra vez a «pendiente» (y otra vez a la nube).
    envios = RN.envios_por_tarea(RN.leer_colas_nube(os.path.join(RAIZ, "enjambre", "colas"), time.time()))
    nuevas = RN.devolver_a_pendiente(tareas, ids, time.strftime("%Y%m%d"),
                                     envios=envios, veredictos=veredictos_del_ultimo_run(ids))
    if isinstance(progreso, dict) and "tareas" in progreso:
        progreso["tareas"] = nuevas
        salida = progreso
    else:
        salida = nuevas
    tmp = ruta + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(salida, f, ensure_ascii=False, indent=1)
        os.replace(tmp, ruta)
    except OSError:
        return []
    return ids


def veredictos_del_ultimo_run(ids, timeout=90):
    """{id: (estado, nota)} de lo que dijo la nube sobre esas tareas en su último run
    terminado, leído del artefacto que sube el workflow (progreso.json). Nunca lanza: si no
    se puede leer, {} y se devuelven sin motivo, como antes."""
    import shutil
    import tempfile

    carpeta = tempfile.mkdtemp(prefix="nube-veredictos-")
    try:
        salida = _sh(["gh", "run", "list", "--workflow", "enjambre-nube.yml", "--status", "completed",
                      "-L", "1", "--json", "databaseId", "--jq", ".[0].databaseId"], timeout=60).strip()
        if not salida.isdigit():
            return {}
        _sh(["gh", "run", "download", salida, "-D", carpeta], timeout=timeout)
        fuera = {}
        for raiz, _dirs, archivos in os.walk(carpeta):
            if "progreso.json" in archivos:
                try:
                    with open(os.path.join(raiz, "progreso.json"), encoding="utf-8") as f:
                        prog = json.load(f)
                except (OSError, ValueError):
                    continue
                for tid in ids:
                    e = prog.get(tid) if isinstance(prog, dict) else None
                    if isinstance(e, dict) and e.get("estado"):
                        fuera[tid] = (str(e.get("estado")), str(e.get("nota") or ""))
        return fuera
    except Exception:
        return {}
    finally:
        shutil.rmtree(carpeta, ignore_errors=True)


def _cuenta_hoy():
    hoy = time.strftime("%Y-%m-%d")
    try:
        d = json.load(open(CUENTA, encoding="utf-8"))
    except Exception:
        d = {}
    return hoy, int(d.get(hoy, 0)), d


def _anotar():
    hoy, n, d = _cuenta_hoy()
    d[hoy] = n + 1
    os.makedirs(os.path.dirname(CUENTA), exist_ok=True)
    json.dump({k: v for k, v in sorted(d.items())[-14:]}, open(CUENTA, "w"))


def main():
    print("Director de la nube · cada %d s · %s agentes por job · tope %d agentes / %d lanzamientos al día"
          % (INTERVALO_S, TRABAJADORES, TOPE_AGENTES, TOPE_DIA), flush=True)
    while True:
        try:
            _, hoy_n, _ = _cuenta_hoy()
            runs_vivos, agentes_vivos = medir_nube()
            devueltas = reclamar_varadas_de_la_nube(runs_vivos)
            if devueltas:
                print("[%s] devueltas de la nube a pendiente (allí no quedaba nadie): %s"
                      % (time.strftime("%H:%M"), ", ".join(devueltas)), flush=True)
            # El inventario MIDE la capacidad; el director ya no la supone. Si mañana se
            # abre Colab o Cloud Run, el tope sube solo y sin tocar este archivo.
            inv = inventario_de_contenedores()
            destino = elegir_contenedor(inv.get("contenedores"))
            res = inv.get("resumen") or {}
            trabajadores = str(destino["agentes_por_job"]) if destino else TRABAJADORES
            lanzar, motivo = decidir_lanzamiento(
                atraso(), runs_vivos, hoy_n, hay_claves=hay_claves(),
                agentes_en_marcha=int(res.get("agentes_ahora") or agentes_vivos),
                trabajadores=trabajadores,
                tope_agentes=int(res.get("agentes_tope") or TOPE_AGENTES))
            if lanzar and not destino:
                lanzar, motivo = False, "ningún contenedor con sitio libre (%d usable(s) de %d)" % (
                    res.get("usables", 0), res.get("contenedores", 0))
            print("[%s] %s: %s%s" % (time.strftime("%H:%M"), "LANZO" if lanzar else "espero",
                                     motivo, (" → %s" % destino["servicio"]) if lanzar and destino else ""),
                  flush=True)
            if lanzar:
                # `_sh` se comía stderr y el código de salida, así que un lanzamiento que
                # abortaba se contaba como hecho: el 21 a las 22:05, 22:09 y 22:13 dijo
                # «LANZO» y GitHub no recibió un solo run. Ahora se mira el resultado, se
                # enseña el motivo y no se anota un lanzamiento que no lanzó nada.
                rc, salida = _sh_rc(
                    [sys.executable, os.path.join(RAIZ, "scripts", "puente", "nube-gh.py"),
                     "lanzar", "--tope", str(2 * int(trabajadores)),
                     "--trabajadores", trabajadores, "--minutos", MINUTOS], timeout=300)
                print(salida.strip()[-500:], flush=True)
                if rc != 0:
                    print("[%s] el lanzamiento FALLÓ (rc=%d): no lo cuento como lanzado"
                          % (time.strftime("%H:%M"), rc), flush=True)
                else:
                    _anotar()
                    medir_nube()
        except Exception as e:
            print("director-nube: %s: %s" % (type(e).__name__, e), flush=True)
        time.sleep(INTERVALO_S)


if __name__ == "__main__":
    sys.exit(main() or 0)
