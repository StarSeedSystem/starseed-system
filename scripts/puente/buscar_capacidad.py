# -*- coding: utf-8 -*-
"""Buscar más capacidad en TODOS los medios, de una vez (2026-10-05).

Alex (12:40): «de nuevo solo hay 3 activos, agrega un botón en el medidor de agentes y de
tareas en curso para buscar desde ahí si hay más espacios para más tareas o agentes
disponibles simultáneamente, sin que te tenga que decir cada vez desde aquí».

Había cuatro botones sueltos («Buscar y asignar», «Comprobar si cabe más», «Buscar
contenedores», «Desplegar en la nube») y ninguno contestaba a la pregunta entera: ¿dónde
cabe más trabajo AHORA y por qué no está ya corriendo? Medido a las 12:58: la Mac llena
(3 de 3: su tope por hardware con 8 GB), 12 tareas listas y la nube con CERO elegibles —16 de
ellas solo por haber agotado sus tres envíos, que no fallaron por la tarea sino porque los
proveedores gratuitos de la nube contestaban «saturado (429)»—. Nadie las reabría, así que
la nube se quedaba quieta con trabajo de sobra.

Una pasada (botón «Buscar más capacidad» de los medidores Agentes y Tareas en curso, y la
autocuración del Mando cada 30 min):

1. **Mac**: llena los trabajadores libres con `asignar_huecos` (la misma decisión que
   «Buscar y asignar»). Nunca pasa del tope del gobernador: más procesos en una Mac de 8 GB
   no es más capacidad, es swap.
2. **Nube (GitHub Actions)**: cuenta los jobs en marcha, las tareas que puede coger y por
   qué no coge las demás. Si hay sitio y no bastan las elegibles, REABRE las agotadas que
   solo están fuera por los envíos (una reapertura devuelve un envío; como mucho
   `REAPERTURAS_MAX` por tarea en dos días y separadas `REABRIR_ESPERA_S`), dejando siempre
   en la Mac trabajo para su tope entero. Luego lanza los jobs en segundo plano.
3. **Los demás medios** (contenedor de Claude, Google Cloud, Hugging Face, Colab): sondeo de
   `medios_disponibles` con lo que falta para encenderlos. Desde aquí no se encienden: o
   requieren a Alex o un medio que aún no existe, y se dice cuál.

Las decisiones son PURAS (`plan_nube`, `puede_reabrir`, `texto_mac`, `texto_nube`,
`resumen`) y tienen sus pruebas en `test_buscar_capacidad.py`.

Uso: python3 buscar_capacidad.py buscar [--aplicar] [--sin-medios] [--sin-mac] [--json]
                                         [--origen boton|autocuracion]
     python3 buscar_capacidad.py desplegar --runs N --trabajadores W   (lo lanza `buscar`)
"""
from __future__ import annotations

import json
import math
import os
import subprocess
import sys
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

ESTADO = os.path.expanduser("~/.starseed/buscar-capacidad.json")
REGISTRO = "/tmp/starseed-capacidad.log"
WORKFLOW = "enjambre-nube.yml"

#: Jobs de GitHub Actions a la vez. El repo es público y GitHub no cobra, pero los modelos
#: gratuitos se reparten entre todos los jobs: con más de dos, los 429 se comen la ganancia.
TOPE_RUNS_NUBE = 2
TRABAJADORES_JOB = 3
#: Tareas por job: dos por trabajador, como el despliegue de siempre.
TAREAS_POR_RUN = TRABAJADORES_JOB * 2
MINUTOS_JOB = 60
#: Lo que se reabre en una pasada, cuánto espera una tarea entre reaperturas y cuántas
#: lleva como mucho en la ventana de envíos (dos días).
REABRIR_POR_PASADA = 6
REABRIR_ESPERA_S = 3 * 3600
REAPERTURAS_MAX = 2
#: Un lanzamiento tarda hasta un minuto en verse en GitHub: mientras, cuenta como run vivo
#: para que dos pulsaciones seguidas no lancen el doble.
EN_CAMINO_S = 150

NOMBRES = {
    "mac": "Mac",
    "nube-gh": "Nube (GitHub Actions)",
    "claude": "Contenedor de Claude",
    "gcloud": "Google Cloud",
    "hf": "Hugging Face",
    "colab": "Colab / Kaggle",
    "oracle": "Oracle",
}
ESTADOS = {
    "listo": "trabajando",
    "usable": "disponible",
    "requiere_alex": "te necesita",
    "no_disponible": "descartado",
}


# ── decisiones (puras) ──────────────────────────────────────────────────────────

def puede_reabrir(marcas, ahora, espera_s=REABRIR_ESPERA_S, maximo=REAPERTURAS_MAX):
    """PURA. ¿Se puede reabrir una tarea con estas reaperturas vigentes (marcas de tiempo)?"""
    marcas = sorted(m for m in (marcas or []) if isinstance(m, (int, float)))
    if len(marcas) >= maximo:
        return False
    return not marcas or ahora - marcas[-1] >= espera_s


def plan_nube(elegibles, agotadas, runs_vivos, pausa, reaperturas, ahora, listas_mac=0, tope_mac=0,
              tope_runs=TOPE_RUNS_NUBE, por_run=TAREAS_POR_RUN, max_reabrir=REABRIR_POR_PASADA):
    """PURA. Qué hacer con la nube: {"lanzar": n, "reabrir": [ids], "trabajadores": w, "por_que": str}.

    - En pausa o con los jobs al tope: nada.
    - Las elegibles van primero. Si no llenan el sitio libre, se reabren agotadas (las que
      `puede_reabrir`), pero nunca tantas que la Mac se quede sin trabajo para su tope:
      la nube suma, no le quita a la Mac lo que la Mac ya puede hacer.
    """
    nada = {"lanzar": 0, "reabrir": [], "trabajadores": 0}
    if pausa:
        return dict(nada, por_que="la nube está en pausa (%s): no despliego" % pausa)
    libres = max(0, int(tope_runs) - int(runs_vivos))
    if libres <= 0:
        return dict(nada, por_que="ya hay %d job(s) en marcha, el tope a la vez" % runs_vivos)
    sitio = libres * por_run
    elegibles = list(elegibles or [])
    reabrir = []
    if len(elegibles) < sitio:
        sobra_mac = max(0, int(listas_mac) - int(tope_mac))
        cupo = min(max_reabrir, sitio - len(elegibles), sobra_mac)
        candidatas = [t for t in (agotadas or []) if puede_reabrir((reaperturas or {}).get(t), ahora)]
        reabrir = candidatas[:max(0, cupo)]
    total = len(elegibles) + len(reabrir)
    if total == 0:
        if agotadas:
            return dict(nada, por_que="las agotadas ya se reabrieron hace poco o dejarían a la Mac sin trabajo")
        return dict(nada, por_que="no hay trabajo que la nube pueda coger")
    lanzar = min(libres, int(math.ceil(total / float(por_run))))
    trabajadores = max(1, min(TRABAJADORES_JOB, int(math.ceil(total / float(lanzar)))))
    return {"lanzar": lanzar, "reabrir": reabrir, "trabajadores": trabajadores,
            "por_que": "%d tarea(s) para la nube: lanzo %d job(s) de %d agente(s)" % (total, lanzar, trabajadores)}


def runs_en_marcha(runs):
    """PURA: cuántos runs de la lista de `gh run list` siguen vivos."""
    return sum(1 for r in runs or [] if str((r or {}).get("status") or "") in
               ("queued", "in_progress", "waiting", "pending", "requested"))


def en_camino(estado, ahora):
    """PURA: jobs lanzados hace tan poco que GitHub quizá aún no los enseña."""
    estado = estado or {}
    if ahora < float(estado.get("en_camino_hasta") or 0):
        return int(estado.get("en_camino") or 0)
    return 0


def texto_mac(estado, decision, hechas):
    """PURA: la línea de la Mac."""
    estado = estado or {}
    ocupados = len(estado.get("ocupados") or [])
    tope = estado.get("tope")
    listas = len(estado.get("listas") or [])
    if hechas:
        return "%s: %s" % (NOMBRES["mac"], (decision or {}).get("resumen") or "asigné trabajo")
    base = "%s: %d de %s trabajando · %d lista(s)" % (NOMBRES["mac"], ocupados, tope if tope is not None else "?", listas)
    motivo = str(estado.get("motivo_tope") or "").strip()
    if (decision or {}).get("huecos"):
        return base + " · " + str((decision or {}).get("resumen") or "hay hueco").rstrip(".")
    return base + " · sin hueco: %s es el máximo de esta Mac%s" % (
        tope if tope is not None else "su tope", " (gobernador: %s)" % motivo if motivo else "")


def texto_nube(clases, plan, runs_vivos, lanzados=None, aplicado=True):
    """PURA: la línea de la nube, con el porqué de lo que no coge. Sin `aplicado` (solo
    comprobar) dice lo que HARÍA, no lo que hizo."""
    from repartir_nube import MOTIVOS_FUERA

    clases = clases or {}
    partes = ["%s: %d job(s) en marcha" % (NOMBRES["nube-gh"], runs_vivos),
              "%d tarea(s) elegible(s)" % len(clases.get("elegibles") or [])]
    if plan.get("reabrir"):
        partes.append("%s %d que agotaron sus envíos (%s)" % ("reabro" if aplicado else "se pueden reabrir",
                                                             len(plan["reabrir"]), ", ".join(plan["reabrir"])))
    if lanzados is not None:
        partes.append(lanzados)
    else:
        partes.append(plan.get("por_que") or "")
    fuera = ["%d %s" % (len(clases[k]), frase) for k, frase in MOTIVOS_FUERA
             if k not in ("estado", "en-main") and clases.get(k)]
    linea = " · ".join(p for p in partes if p)
    return linea + (". Fuera de la nube: %s" % "; ".join(fuera) if fuera else "")


def texto_medio(m):
    """PURA: la línea de un medio que no es la Mac ni la nube de GitHub."""
    nombre = NOMBRES.get(m.get("id"), m.get("nombre") or m.get("id") or "?")
    estado = ESTADOS.get(m.get("estado"), m.get("estado") or "?")
    detalle = m.get("siguiente_paso") or m.get("detalle") or m.get("capacidad") or ""
    if m.get("id") == "claude":
        detalle = ("2 agentes solo mientras haya una sesión de Claude abierta que arranque el "
                   "orquestador en su contenedor: desde el Mando no se puede encender")
    return "%s: %s%s" % (nombre, estado, (" · " + detalle) if detalle else "")


def resumen(lineas, sumados):
    """PURA: el texto entero que enseña el medidor (una línea por medio)."""
    cabeza = ("Busqué en todos los medios · %d agente(s) más en camino" % sumados if sumados
              else "Busqué en todos los medios · no cabe más ahora mismo")
    return "\n".join([cabeza] + ["· " + l for l in lineas if l])


# ── la máquina ──────────────────────────────────────────────────────────────────

def _leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _guardar(datos):
    try:
        os.makedirs(os.path.dirname(ESTADO), exist_ok=True)
        tmp = ESTADO + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
        os.replace(tmp, ESTADO)
    except OSError:
        pass


def _repartidor():
    """El módulo `repartir-a-nube.py` (con guion: no se importa con `import`)."""
    import importlib.util

    spec = importlib.util.spec_from_file_location("repartir_a_nube", os.path.join(DIRECTORIO, "repartir-a-nube.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def reunir_nube(ahora):
    """Lo que la nube puede coger y por qué no coge lo demás, con las MISMAS fuentes que el
    reparto. Nunca lanza: si algo falla, lo dice en `error`."""
    import repartir_nube as RN

    salida = {"clases": {}, "pausa": RN.nube_pausada(), "runs": 0, "error": None}
    try:
        ran = _repartidor()
        colas = ran.colas_fuente()
        progreso = _leer_json(ran.PROGRESO, {})
        asuntos = ran.asuntos_main(ran.RAIZ)
        colas = [(n, ran.aplicar_a_todas(t, progreso)) for n, t in colas]
        envios = RN.envios_vigentes(ran.DESTINO_DIR, ahora)
        salida["clases"] = RN.clasificar(colas, progreso, asuntos, ran.ola_actual(colas), envios)
    except (Exception, SystemExit) as e:  # SystemExit: el reparto aborta así si git falla
        salida["error"] = "%s: %s" % (type(e).__name__, e)
    try:
        r = subprocess.run(["gh", "run", "list", "--workflow", WORKFLOW, "--limit", "12", "--json", "status"],
                           cwd=RAIZ, capture_output=True, text=True, timeout=40)
        salida["runs"] = runs_en_marcha(json.loads(r.stdout or "[]")) if r.returncode == 0 else 0
    except Exception:
        pass
    return salida


def _otros_medios():
    try:
        import medios_disponibles

        return [m for m in medios_disponibles.sondear().get("medios") or []
                if m.get("id") not in ("mac", "nube-gh")]
    except Exception as e:
        return [{"id": "medios", "nombre": "Otros medios", "estado": "?",
                 "detalle": "no pude sondearlos (%s)" % type(e).__name__}]


def _avisar(texto):
    try:
        import director_chat

        director_chat.publicar(texto, de="director-capacidad", rol="director", tipo="informe")
    except Exception:
        pass


def _lanzar_en_fondo(runs, trabajadores):
    """Los jobs se lanzan en segundo plano: cada uno tarda hasta un minuto en registrarse."""
    with open(REGISTRO, "a", encoding="utf-8") as log:
        subprocess.Popen(
            [sys.executable, os.path.abspath(__file__), "desplegar", "--runs", str(runs),
             "--trabajadores", str(trabajadores)],
            cwd=RAIZ, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
            start_new_session=True,
        )


def buscar(aplicar=False, sondear_medios=True, mac=True, origen="boton", ahora=None):
    """Una pasada por todos los medios. Devuelve {resumen, lineas, sumados, hechas, nube, ...}."""
    from concurrent.futures import ThreadPoolExecutor
    import repartir_nube as RN

    ahora = time.time() if ahora is None else ahora
    estado_prev = _leer_json(ESTADO, {})
    hechas, lineas, sumados = [], [], 0

    with ThreadPoolExecutor(2) as ex:
        futuro_medios = ex.submit(_otros_medios) if sondear_medios else None

        # 1 · Mac
        estado_mac, decision = {}, {}
        try:
            import asignar_huecos

            estado_mac = asignar_huecos.reunir()
            decision = asignar_huecos.decidir(estado_mac)
            hechas_mac = asignar_huecos.aplicar(estado_mac, decision) if (aplicar and mac and decision.get("puede")) else []
            if hechas_mac:
                hechas += hechas_mac
                sumados += int(decision.get("huecos") or 0)
            lineas.append(texto_mac(estado_mac, decision, hechas_mac))
        except Exception as e:
            lineas.append("%s: no pude mirarla (%s: %s)" % (NOMBRES["mac"], type(e).__name__, e))

        # 2 · Nube
        nube = reunir_nube(ahora)
        vivos = nube["runs"] + en_camino(estado_prev, ahora)
        reaperturas = RN.leer_reaperturas(ahora)
        plan = plan_nube(
            nube["clases"].get("elegibles"), nube["clases"].get("agotada"), vivos, nube["pausa"],
            reaperturas, ahora, listas_mac=len(estado_mac.get("listas") or []),
            tope_mac=int(estado_mac.get("tope") or 0),
        )
        lanzados = None
        if nube["error"]:
            lanzados = "no pude leer el trabajo (%s)" % nube["error"][:160]
        elif aplicar and plan["lanzar"] > 0:
            if plan["reabrir"]:
                RN.anotar_reaperturas(plan["reabrir"], ahora)
                hechas.append("reabiertas a la nube: %s" % ", ".join(plan["reabrir"]))
            _lanzar_en_fondo(plan["lanzar"], plan["trabajadores"])
            estado_prev.update(en_camino=plan["lanzar"], en_camino_hasta=ahora + EN_CAMINO_S * plan["lanzar"])
            sumados += plan["lanzar"] * plan["trabajadores"]
            lanzados = "lanzando %d job(s) de %d agente(s) en segundo plano" % (plan["lanzar"], plan["trabajadores"])
            hechas.append(lanzados)
        lineas.append(texto_nube(nube["clases"], plan, vivos, lanzados, aplicado=aplicar))

        # 3 · Los demás medios
        if futuro_medios is not None:
            lineas += [texto_medio(m) for m in futuro_medios.result()]

    texto = resumen(lineas, sumados)
    estado_prev.update(visto=time.strftime("%Y-%m-%d %H:%M:%S"), origen=origen, sumados=sumados,
                       hechas=hechas, resumen=texto)
    if aplicar:
        _guardar(estado_prev)
    if aplicar and (origen == "boton" or sumados):
        _avisar(("Buscar más capacidad (%s):\n" % ("botón del Mando" if origen == "boton" else origen)) + texto)
    return {"ok": True, "resumen": texto, "lineas": lineas, "sumados": sumados, "hechas": hechas,
            "plan_nube": plan, "runs_nube": vivos}


def desplegar(runs, trabajadores):
    """Lanza `runs` jobs seguidos con `nube-gh.py lanzar` (cada uno reparte su propia cola) y
    deja el resultado en el Chat Director."""
    hechos = []
    for i in range(max(0, int(runs))):
        r = subprocess.run(
            [sys.executable, os.path.join(DIRECTORIO, "nube-gh.py"), "lanzar", "--tope",
             str(int(trabajadores) * 2), "--trabajadores", str(trabajadores), "--minutos", str(MINUTOS_JOB)],
            cwd=RAIZ, capture_output=True, text=True, timeout=600,
        )
        salida = ((r.stdout or "") + (r.stderr or "")).strip()
        print(salida, flush=True)
        lanzado = [l for l in salida.splitlines() if l.startswith("lanzado:")]
        if r.returncode != 0 or not lanzado:
            hechos.append("job %d no salió: %s" % (i + 1, (salida.splitlines() or ["?"])[-1][:200]))
            break
        hechos.append(lanzado[-1])
    _avisar("Capacidad en la nube: %s" % "; ".join(hechos or ["nada que lanzar"]))
    return hechos


def main(argv):
    orden = argv[1] if len(argv) > 1 else "buscar"
    if orden == "desplegar":
        runs = int(argv[argv.index("--runs") + 1]) if "--runs" in argv else 1
        trab = int(argv[argv.index("--trabajadores") + 1]) if "--trabajadores" in argv else TRABAJADORES_JOB
        desplegar(runs, trab)
        return 0
    origen = argv[argv.index("--origen") + 1] if "--origen" in argv else "boton"
    r = buscar(aplicar="--aplicar" in argv, sondear_medios="--sin-medios" not in argv,
               mac="--sin-mac" not in argv, origen=origen)
    print(json.dumps(r, ensure_ascii=False) if "--json" in argv else r["resumen"])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
