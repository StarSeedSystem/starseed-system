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

Una pasada (botón «Buscar más capacidad», el ÚNICO botón general de los medidores Agentes,
Tareas en curso, Listas y Contenedores desde las 17:20 —Alex: «son demasiados botones… que
sea solo uno fusionado funcional»—, y la autocuración de Genesis cada 30 min):

1. **Mac**: llena los trabajadores libres con `asignar_huecos` (la misma decisión que
   «Buscar y asignar»). Nunca pasa del tope del gobernador: más procesos en una Mac de 8 GB
   no es más capacidad, es swap.
2. **Nube (GitHub Actions)**: cuenta los jobs en marcha, las tareas que puede coger y por
   qué no coge las demás. Si hay sitio y no bastan las elegibles, REABRE las agotadas que
   solo están fuera por los envíos (una reapertura devuelve un envío; como mucho
   `REAPERTURAS_MAX` por tarea en dos días y separadas `REABRIR_ESPERA_S`), dejando siempre
   en la Mac trabajo para su tope entero. Luego lanza los jobs en segundo plano.
3. **Los demás medios** (contenedor de Claude, Google Cloud, Hugging Face, Colab): sondeo de
   `medios_disponibles` con lo que falta para encenderlos, y con ese mismo sondeo se vuelve a
   medir el inventario de contenedores (`contenedores_nube`). Desde aquí no se encienden: o
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
SALUD = os.path.expanduser("~/.starseed/salud-proveedores.json")
LATIDOS = os.path.join(RAIZ, "starseed_memory_root", "olas")
REGISTRO = "/tmp/starseed-capacidad.log"
WORKFLOW = "enjambre-nube.yml"

#: Jobs de GitHub Actions a la vez cuando no se sabe nada más (sin sondas ni salud): el de siempre.
TOPE_RUNS_NUBE = 2
TRABAJADORES_JOB = 3
#: Tareas por job: dos por trabajador, como el despliegue de siempre.
TAREAS_POR_RUN = TRABAJADORES_JOB * 2
#: (2026-10-10, CAP1010) El tope ya NO es un 2 fijo: crece con las tareas que la nube puede
#: coger y con los escritores vivos que llegan a ella, hasta este techo. El plan gratuito de
#: GitHub deja 20 jobs a la vez en un repo público de una cuenta Free (los minutos de un repo
#: público no se cobran). (2026-10-13, Alex: «solo 2 agentes… deberían ser decenas») De 6 a 14:
#: quedan 6 libres para el CI de la publicación, que comparte esa cola. Los RPM gratuitos ya
#: los protege `RUNS_POR_ESCRITOR` (dos jobs por escritor vivo), no este techo.
MAX_RUNS_NUBE = int(os.environ.get("STARSEED_NUBE_MAX_RUNS") or 14)
#: Jobs por escritor vivo: un job son 3 agentes y un proveedor gratuito aguanta unos 6 a la vez
#: antes de los 429 (NIM: 40 RPM por clave; un agente de opencode hace 3-6 llamadas por minuto).
RUNS_POR_ESCRITOR = 2
#: Escritores cuyas claves viajan a la nube como secretos (`nube-gh.py SECRETOS`). freellmapi
#: (127.0.0.1 de la Mac) y Codex (sesión de la Mac) NO llegan allí; Groq llega, pero solo revisa.
PROVEEDORES_NUBE = ("google", "nvidia", "openrouter", "xkiro", "opencode")
#: (2026-10-22, ZEN1021B) OpenCode Zen gratis: el escritor principal de la nube desde el 21-10
#: (secreto OPENCODE_API_KEY). No se sondea por HTTP: su API da 403 FreeTierError fuera de
#: opencode. Copia de `MODELOS_ZEN_GRATIS` de starseed-enjambre.py (sin importar el orquestador).
MODELOS_ZEN_GRATIS = ("opencode/glm-5.3-flash-free", "opencode/deepseek-v4.1-flash-free",
                      "opencode/minimax-m3.1-flash-free", "opencode/big-pickle")
MOTIVO_ZEN = "sin sonda: Zen gratis solo responde dentro de opencode"


def hay_clave_zen(entorno, auth=None):
    """PURA: ¿puede opencode usar Zen aquí? Clave en el entorno o proveedor «opencode» en auth.json."""
    if str((entorno or {}).get("OPENCODE_API_KEY") or "").strip():
        return True
    return isinstance(auth, dict) and "opencode" in auth


def resultado_zen(entorno, salud, ahora_txt, auth=None):
    """PURA: la fila de Zen para los resultados de las sondas, o None (sin clave, o la salud lo
    da por caído o sin cupo de verdad). → (modelo, apto, motivo, horas, muerto)."""
    if not hay_clave_zen(entorno, auth):
        return None
    e = (salud or {}).get("opencode")
    if isinstance(e, dict) and (str(e.get("estado") or "") in ("caido", "caído")
                                or str(e.get("sin_cupo_hasta") or "") > str(ahora_txt or "")):
        return (MODELOS_ZEN_GRATIS[0], False, "Zen sin cupo según la salud compartida", 0, False)
    return (MODELOS_ZEN_GRATIS[0], True, MOTIVO_ZEN, 0, False)
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
    "claude-nube": "Claude en la nube",
    "gcloud": "Google Cloud",
    "hf": "Hugging Face",
    "colab": "Colab / Kaggle",
    "oracle": "Oracle Always Free",
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


def tope_runs_nube(tareas, escritores, maximo=MAX_RUNS_NUBE, por_run=TAREAS_POR_RUN,
                   por_escritor=RUNS_POR_ESCRITOR):
    """PURA. (tope, motivo): cuántos jobs de la nube a la vez TIENEN SENTIDO ahora.

    Tres límites y manda el más bajo, que es el que se dice: el trabajo (`tareas` que la nube
    puede coger, `por_run` por job), los modelos (`escritores` vivos con su clave en la nube,
    `por_escritor` jobs cada uno) y el techo del plan gratuito (`maximo`). Sin escritor no hay
    job: un job sin modelo que escriba es un «cero commits» de 45 minutos."""
    tareas = max(0, int(tareas or 0))
    escritores = sorted(set(escritores or ()))
    if not escritores:
        return 0, ("ningún escritor con cupo llega a la nube (freellmapi y Codex solo viven en la Mac; "
                   "Groq allí solo revisa)")
    if not tareas:
        return 0, "no hay tareas que la nube pueda coger"
    por_trabajo = int(math.ceil(tareas / float(por_run)))
    por_modelos = len(escritores) * int(por_escritor)
    tope = min(int(maximo), por_trabajo, por_modelos)
    if tope == por_trabajo:
        motivo = "%d tarea(s) para la nube dan para %d job(s) de %d" % (tareas, por_trabajo, por_run)
    elif tope == por_modelos:
        motivo = "%d escritor(es) vivo(s) en la nube (%s) × %d job(s) cada uno" % (
            len(escritores), ", ".join(escritores), por_escritor)
    else:
        motivo = "techo de %d jobs a la vez (STARSEED_NUBE_MAX_RUNS)" % int(maximo)
    return tope, motivo


def escritores_en_la_nube(resultados=None, salud=None, ahora_txt=""):
    """PURA: proveedores de escritura vivos que la nube puede usar. Con sondas (`resultados`:
    [(modelo, apto, motivo, horas)]) manda la sonda; sin ellas, la salud compartida (con cupo y
    sin «caído»). Solo cuentan los de `PROVEEDORES_NUBE` (sus claves son secretos del repo)."""
    if resultados:
        return sorted({m.split("/", 1)[0] for m, apto, _m, _h in resultados
                       if apto and m.split("/", 1)[0] in PROVEEDORES_NUBE})
    vivos = []
    for prov in PROVEEDORES_NUBE:
        e = (salud or {}).get(SALUD_DE.get(prov, prov))
        if not isinstance(e, dict):
            if prov == "opencode":  # Zen no tiene sonda: sin marca de fallo, cuenta como vivo
                vivos.append(prov)
            continue
        if str(e.get("estado") or "") in ("caido", "caído"):
            continue
        if str(e.get("sin_cupo_hasta") or "") > str(ahora_txt or ""):
            continue
        vivos.append(prov)
    return vivos


def plan_nube(elegibles, agotadas, runs_vivos, pausa, reaperturas, ahora, listas_mac=0, tope_mac=0,
              tope_runs=TOPE_RUNS_NUBE, por_run=TAREAS_POR_RUN, max_reabrir=REABRIR_POR_PASADA,
              motivo_tope=""):
    """PURA. Qué hacer con la nube: {"lanzar": n, "reabrir": [ids], "trabajadores": w, "por_que": str}.

    - En pausa o con los jobs al tope: nada, diciendo por qué es ese el tope (`motivo_tope`).
    - Las elegibles van primero. Si no llenan el sitio libre, se reabren agotadas (las que
      `puede_reabrir`), pero nunca tantas que la Mac se quede sin trabajo para su tope:
      la nube suma, no le quita a la Mac lo que la Mac ya puede hacer.
    """
    nada = {"lanzar": 0, "reabrir": [], "trabajadores": 0}
    if pausa:
        return dict(nada, por_que="la nube está en pausa (%s): no despliego" % pausa)
    libres = max(0, int(tope_runs) - int(runs_vivos))
    if libres <= 0:
        if int(tope_runs) <= 0 and motivo_tope:
            return dict(nada, por_que="no lanzo: %s" % motivo_tope)
        return dict(nada, por_que="ya hay %d job(s) en marcha, el tope a la vez%s" % (
            runs_vivos, (" (%s)" % motivo_tope) if motivo_tope else ""))
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
    # (2026-10-08) Con 0 de 3 trabajando y 0 listas decía «sin hueco: 3 es el máximo»: el hueco
    # estaba, lo que faltaba era trabajo listo. Se dice lo que pasa de verdad.
    if not listas and (tope is None or ocupados < int(tope)):
        return base + " · hay sitio, pero ninguna tarea está lista para la Mac"
    return base + " · sin hueco: %s es el máximo de esta Mac%s" % (
        tope if tope is not None else "su tope", " (gobernador: %s)" % motivo if motivo else "")


def texto_nube(clases, plan, runs_vivos, lanzados=None, aplicado=True, mac=None, tope=None):
    """PURA: la línea de la nube, con el porqué de lo que no coge. Sin `aplicado` (solo
    comprobar) dice lo que HARÍA, no lo que hizo. `mac`: {"tanda", "se_queda", "cedibles"} de
    la tanda viva de la Mac; `tope`: (tope, motivo) de `tope_runs_nube`."""
    from repartir_nube import MOTIVOS_FUERA

    clases = clases or {}
    cabeza = "%s: %d job(s) en marcha" % (NOMBRES["nube-gh"], runs_vivos)
    if tope is not None:
        cabeza += " de %d a la vez ahora (%s)" % (tope[0], tope[1])
    partes = [cabeza, "%d tarea(s) elegible(s)" % len(clases.get("elegibles") or [])]
    if mac and mac.get("tanda"):
        cede = len(mac.get("cedibles") or [])
        en_cadenas = int(mac.get("en_cadenas") or 0)
        partes.append("la tanda de la Mac tiene %d: se queda %d para sus próximas rondas y cede %d%s"
                      % (mac["tanda"], mac.get("se_queda") or 0, cede,
                         (" (%d en cadenas que viajan enteras)" % en_cadenas) if en_cadenas else " que nadie espera"))
    if mac and mac.get("prestadas"):
        partes.append("%d ya prestada(s) por MetaGenesis a otro medio (no se repiten)" % len(mac["prestadas"]))
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
                   "orquestador en su contenedor: desde Genesis no se puede encender")
    elif m.get("id") == "oracle":
        # Oracle ya no es «descartado» (OR1007B): su estado real sale de oracle.json (§9 del
        # contrato) y aquí se enseña con su capacidad (§1) delante del paso o del detalle.
        resto = m.get("siguiente_paso") or m.get("detalle") or ""
        detalle = " · ".join(p for p in (m.get("capacidad"), resto) if p)
    return "%s: %s%s" % (nombre, estado, (" · " + detalle) if detalle else "")


#: (2026-10-22, ALT1022C) Lo que tarda como mucho el lanzador de sesiones de Claude en la nube.
LANZAR_CLAUDE_S = 150


def texto_claude_nube(vivas, tope, credito, ahora, lanzado=""):
    """PURA: la línea de las sesiones de Claude Code en la nube (crédito propio, no el semanal)."""
    import contenedores_nube as CN

    if not isinstance(credito, dict) or "restante_usd" not in credito:
        cred = "sin crédito declarado"
    else:
        cred = "crédito %.0f $ (vence %s)" % (CN._usd(credito.get("restante_usd")), credito.get("vence") or "sin fecha")
    linea = "%s: %d de %d sesiones · %s · hoy caben %d" % (
        NOMBRES["claude-nube"], vivas, tope, cred, CN.caben_hoy_claude(credito, ahora))
    return linea + (" · " + lanzado if lanzado else "")


def lanzar_claude_nube(estado, hay_lanzador, correr, antes, despues):
    """Lanza sesiones si el medio está listo. `correr()` ejecuta el lanzador; `antes`/`despues`
    leen cuántas sesiones hay anotadas. Devuelve (sumadas, texto). Nunca falla."""
    if not hay_lanzador:
        return 0, "el lanzador aún no está en main"
    if estado != "listo":
        return 0, ""
    n0 = antes()
    try:
        correr()
    except Exception as e:  # noqa: BLE001
        return 0, "no pude lanzar sesiones (%s)" % type(e).__name__
    sumadas = max(0, despues() - n0)
    return sumadas, ("lanzadas %d sesión(es)" % sumadas if sumadas else "el lanzador no abrió ninguna sesión")


def _sesiones_anotadas():
    import contenedores_nube as CN

    d = CN._leer_json(CN.REGISTRO_CLAUDE, {})
    return len(d.get("sesiones") or []) if isinstance(d, dict) else 0


def _correr_lanzador_claude():
    import contenedores_nube as CN

    with open(REGISTRO, "a", encoding="utf-8") as log:
        subprocess.run([sys.executable, CN.LANZADOR_CLAUDE, "lanzar", "--auto"], cwd=RAIZ, stdout=log,
                       stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, timeout=LANZAR_CLAUDE_S, check=False)


def claude_nube(aplicar, ahora):
    """Línea y sumados del medio claude-nube; con `aplicar`, lanza por el lanzador si está listo."""
    import contenedores_nube as CN

    credito = CN._leer_json(CN.CREDITO_CLAUDE)
    hay = os.path.exists(CN.LANZADOR_CLAUDE)
    estado, _ = CN.estado_claude_nube(credito, hay, ahora)
    sumadas, lanzado = 0, ""
    if aplicar:
        sumadas, lanzado = lanzar_claude_nube(estado, hay, _correr_lanzador_claude, _sesiones_anotadas,
                                              _sesiones_anotadas)
    elif not hay:
        lanzado = "el lanzador aún no está en main"
    vivas = CN.vivas_claude_nube(CN._leer_json(CN.REGISTRO_CLAUDE, {}), CN._leer_json(CN.PROGRESO, {}))
    return sumadas, texto_claude_nube(vivas, CN.tope_claude_nube(), credito, ahora, lanzado)


#: Claves de `salud-proveedores.json` que no son proveedores.
NO_PROVEEDORES = ("claves", "ultimo_revisor_ok")


def texto_modelos(salud, ahora_txt, esperando=0):
    """PURA: la línea de los MODELOS. (2026-10-05, 13:35) Con la nube recién lanzada, los tres
    agentes de la Mac estaban «sin pasarela libre»: más huecos no suman nada si los modelos
    no contestan, y el botón tiene que decirlo en vez de contar solo sitios.
    `ahora_txt`: «AAAA-MM-DD HH:MM:SS» (se compara como texto, igual que lo escribe el
    orquestador)."""
    con_cupo, sin_cupo, caidos = [], [], []
    for nombre, v in sorted((salud or {}).items()):
        if nombre in NO_PROVEEDORES or not isinstance(v, dict):
            continue
        hasta = str(v.get("sin_cupo_hasta") or "")
        if str(v.get("estado") or "") in ("caido", "caído"):
            caidos.append(nombre)
        elif hasta and hasta > ahora_txt:
            sin_cupo.append("%s hasta las %s" % (nombre, hasta[11:16]))
        else:
            con_cupo.append(nombre)
    partes = ["Modelos: %d proveedor(es) con cupo%s" % (len(con_cupo), " (%s)" % ", ".join(con_cupo) if con_cupo else "")]
    if sin_cupo:
        partes.append("%d sin cupo (%s)" % (len(sin_cupo), ", ".join(sin_cupo)))
    if caidos:
        partes.append("%d caído(s) (%s)" % (len(caidos), ", ".join(caidos)))
    if esperando:
        partes.append("%d agente(s) de la Mac esperando pasarela: ahora el límite son los modelos, no los huecos" % esperando)
    return " · ".join(partes)


def esperando_pasarela(latidos, ahora, frescura_s=180):
    """PURA: cuántas tareas de la Mac esperan modelo. `latidos`: [(mtime, datos)] de los
    `latidos-cola-auto-*.json`; solo cuentan los frescos."""
    n = 0
    for mtime, d in latidos or []:
        if ahora - float(mtime or 0) > frescura_s or not isinstance(d, dict):
            continue
        for v in (d.get("tareas") or {}).values():
            if isinstance(v, dict) and str(v.get("fase") or "").lower().startswith("esperando"):
                n += 1
    return n


#: Proveedores de pago (por token, con la tarjeta de Alex): no se sondean como escritores.
DE_PAGO = ("xai", "deepseek", "anthropic", "openai")
#: (2026-10-10, CAP1010) Fuera de la escritura con su motivo MEDIDO hoy: el botón lo dice para
#: que nadie vuelva a meterlos a ciegas. Ni se sondean.
RETIRADOS = {
    "apinex": "sus 10M tokens gratis ya se gastaron (402) y lo demás pide suscripción",
    "tokenrouter": "sin modelo gratis: glm-5.3-free sin canal (503) y su único :free pide crédito (403)",
    "github-models": "GitHub Models se retiró el 2026-07-30: su API contesta «200 OK» a todo",
}
#: Revisores que NO escriben, con su porqué (prueba real con opencode, 2026-10-10).
SOLO_REVISAN = {
    "groq": "opencode no cabe en su tramo gratis (7.000 tokens por minuto) y gpt-oss-120b rechaza su historial",
}
#: Proveedores de opencode que no escriben código del enjambre: revisores (groq, aihubmix,
#: tokenrouter), solo Markdown (llm7) y la neurona local de 0,5B. FreeLLMAPI sí cuenta: el
#: 2026-10-06 fue el único escritor vivo (RSC1006Ks), aunque a veces su «auto» devuelve las
#: llamadas a herramientas como texto y la tarea sale «sin cambios».
#: Hugging Face responde a una sonda corta, pero con el crédito mensual agotado opencode recibe
#: 402 en las peticiones de verdad (medido el 2026-10-06): no cuenta como escritor.
NO_ESCRITORES = ("groq", "aihubmix", "tokenrouter", "llm7", "neurona", "huggingface")
#: Nombre del proveedor en la salud compartida cuando difiere del prefijo de opencode.
SALUD_DE = {"nvidia": "nim"}


#: Modelos que se prueban por proveedor como mucho: si el primero está retirado o es de pago,
#: no dice nada del proveedor (2026-10-06: el primero de nvidia, openrouter y apinex lo estaba).
MODELOS_POR_PROVEEDOR = 4


def representantes(cfg_opencode, maximo=MODELOS_POR_PROVEEDOR):
    """PURA: {proveedor: [«prov/modelo», …]} para sondear, sin los de pago ni los que no escriben."""
    salida = {}
    for prov, bloque in sorted(((cfg_opencode or {}).get("provider") or {}).items()):
        if prov in DE_PAGO or prov in NO_ESCRITORES or prov in RETIRADOS or not isinstance(bloque, dict):
            continue
        modelos = list((bloque.get("models") or {}).keys())[:maximo]
        if modelos:
            salida[prov] = ["%s/%s" % (prov, m) for m in modelos]
    return salida


#: Fallos que son del MODELO aunque no lo retiren: en NIM cada modelo es una función aparte y
#: uno saturado no dice nada de los demás (2026-10-10: kimi-k3 tardaba 45 s y el botón daba a
#: NIM entero por «no contesta en 25 s» con nemotron contestando en 0,7 s).
FALLOS_DEL_MODELO = ("no contesta", "error del proveedor")


def veredicto_proveedor(modelos, sondear):
    """PURA salvo `sondear(modelo) → (apto, motivo, horas, muerto)`: prueba en orden hasta que
    uno responde (puede) o falla por algo del PROVEEDOR (cupo del día, sin crédito, saturado);
    un modelo retirado o de pago, o uno lento o con error propio (`FALLOS_DEL_MODELO`), no decide
    por el proveedor y se pasa al siguiente. → (modelo, apto, motivo, horas, muerto)."""
    ultimo, primero_lento = None, None
    for m in modelos:
        apto, motivo, horas, muerto = sondear(m)
        ultimo = (m, apto, motivo, horas, muerto)
        if apto:
            return ultimo
        if muerto:
            continue
        if str(motivo or "").startswith(FALLOS_DEL_MODELO):
            primero_lento = primero_lento or ultimo
            continue
        return ultimo
    return primero_lento or ultimo


def texto_escritores(resultados, ahora=None):
    """PURA: (línea, alguno_puede). `resultados`: [(modelo, apto, motivo, horas)]. (2026-10-06)
    Alex: «llevan mucho tiempo sin funcionar ningún agente y Buscar más capacidad no lo
    arregla». Más huecos no sirven si ningún modelo gratuito tiene cupo: el botón lo dice, con
    cuándo vuelve cada uno, en vez de contar solo sitios."""
    ahora = time.time() if ahora is None else ahora
    pueden = sorted({m.split("/", 1)[0] for m, apto, _, _ in resultados if apto})
    no = []
    for m, apto, motivo, horas in resultados:
        if apto:
            continue
        vuelta = ahora + horas * 3600
        dia = "" if time.strftime("%Y%m%d", time.localtime(vuelta)) == time.strftime("%Y%m%d", time.localtime(ahora)) else "mañana "
        cuando = (" · vuelve %shacia las %s" % (dia, time.strftime("%H:%M", time.localtime(vuelta)))
                  if horas and horas >= 1 else "")
        no.append("%s: %s%s" % (m.split("/", 1)[0], motivo, cuando))
    if not resultados:
        return "Escritores: no pude sondearlos", True
    linea = "Escritores que pueden escribir ahora: %s" % (", ".join(pueden) if pueden else "NINGUNO")
    if no:
        linea += " · sin poder: " + "; ".join(no)
    return linea, bool(pueden)


def texto_fuera_de_escritura():
    """PURA: quién NO escribe y por qué (medido), para que nadie los vuelva a meter a ciegas."""
    partes = ["%s (solo revisa: %s)" % (p, m) for p, m in sorted(SOLO_REVISAN.items())]
    partes += ["%s (%s)" % (p, m) for p, m in sorted(RETIRADOS.items())]
    return "Fuera de la escritura: " + "; ".join(partes)


def texto_ultimo_despliegue(estado, ahora, vigencia_s=3600):
    """PURA: el último despliegue de la nube si NO salió entero y es reciente. (2026-10-10) El
    botón contaba como «en marcha» dos jobs que nunca existieron: el reparto en segundo plano
    había dicho «0 tareas» y nadie lo leía."""
    d = (estado or {}).get("ultimo_despliegue") or {}
    if not isinstance(d, dict) or ahora - float(d.get("t") or 0) > vigencia_s:
        return ""
    pedidos, lanzados = int(d.get("pedidos") or 0), int(d.get("lanzados") or 0)
    if lanzados >= pedidos or not d.get("fallo"):
        return ""
    return "Último despliegue a la nube: salieron %d de %d job(s) · %s" % (lanzados, pedidos, d.get("fallo"))


def texto_sin_trabajo(progreso):
    """PURA: por qué no hay nada listo, con nombres. (2026-10-08) Alex: «aún hay tareas listas para
    trabajar pero al seleccionar Buscar más capacidad dice que no cabe más ahora mismo»."""
    grupos = {"pendiente_aprobacion": [], "bloqueada": [], "bloqueante": []}
    for tid, v in sorted((progreso or {}).items()):
        e = (v or {}).get("estado") if isinstance(v, dict) else None
        if e in grupos:
            grupos[e].append(tid)
    partes = []
    if grupos["pendiente_aprobacion"]:
        ids = grupos["pendiente_aprobacion"]
        partes.append("%d esperan visto bueno de la dirección (%s)" % (len(ids), ", ".join(ids[:6])))
    bloq = grupos["bloqueada"] + grupos["bloqueante"]
    if bloq:
        partes.append("%d bloqueadas (%s): «Bloqueadas» → Recomprobar o Borrar" % (len(bloq), ", ".join(bloq[:6])))
    return "Sin trabajo listo: " + (" · ".join(partes) if partes else "las colas están vacías o esperan a otra tarea")


def resumen(lineas, sumados, sin_escritores=False, sin_trabajo=False):
    """PURA: el texto entero que enseña el medidor (una línea por medio)."""
    if sin_trabajo and not sumados:
        cabeza = ("Busqué en todos los medios · no hay más trabajo listo para repartir "
                  "(mira la línea «Sin trabajo listo»)")
        return "\n".join([cabeza] + ["· " + l for l in lineas if l])
    if sin_escritores:
        cabeza = ("Busqué en todos los medios · el límite NO son los huecos: ningún modelo gratuito "
                  "tiene cupo ahora mismo; los agentes esperan y retoman solos cuando vuelva alguno")
    else:
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


def reunir_nube(ahora, estado_mac=None, ceder=True):
    """Lo que la nube puede coger y por qué no coge lo demás, con las MISMAS fuentes y el MISMO
    filtro de la tanda de la Mac que el reparto (`repartir-a-nube.py --ceder`). Nunca lanza:
    si algo falla, lo dice en `error`.

    (2026-10-10, CAP1010) Antes no miraba la tanda viva de la Mac y el reparto sí: el botón
    contaba 32 elegibles y «lanzo 2 jobs», el reparto en segundo plano daba «0 tareas» y los dos
    jobs que se anotaban «en camino» nunca existieron."""
    import repartir_nube as RN

    salida = {"clases": {}, "pausa": RN.nube_pausada(), "runs": 0, "error": None, "mac": {}}
    try:
        ran = _repartidor()
        colas = ran.colas_fuente()
        progreso = _leer_json(ran.PROGRESO, {})
        asuntos = ran.asuntos_main(ran.RAIZ)
        colas = [(n, ran.aplicar_a_todas(t, progreso)) for n, t in colas]
        envios = RN.envios_vigentes(ran.DESTINO_DIR, ahora)
        try:
            procesos = subprocess.run(["ps", "-axo", "args="], capture_output=True, text=True, timeout=20).stdout
        except Exception:
            procesos = ""
        colas_mac = RN.colas_de_la_tanda_viva(procesos, ran.OLAS)
        tanda = {i for _n, ids in colas_mac for i in ids}
        ajenas = RN.leer_prestadas(ahora)
        # (2026-10-13, Alex: «de nuevo solo 2 agentes en MetaGenesis») La MISMA cesión que el
        # reparto (`repartir-a-nube.py --ceder`): sueltas + cadenas ENTERAS. Aquí solo se miraban
        # las sueltas («que nadie espera»): el botón contaba 0 elegibles, decidía 0 jobs y el
        # reparto, que sí cede cadenas, nunca llegaba a correr.
        cedibles, lote = [], set()
        if ceder and tanda and estado_mac:
            cedibles, lote = RN.cedibles_y_lote(tanda, estado_mac, colas, progreso, ajenas)
        listas_en_tanda = [t for t in (estado_mac or {}).get("listas") or [] if t in tanda and t not in ajenas]
        salida["mac"] = {"tanda": len(tanda), "cedibles": cedibles, "prestadas": sorted(ajenas),
                         "en_cadenas": len(lote),
                         "se_queda": max(0, len(listas_en_tanda) - len([t for t in cedibles if t in listas_en_tanda]))}
        colas = RN.sin_lo_de_la_mac(colas, tanda, cedibles, ajenas)
        salida["clases"] = RN.clasificar(colas, progreso, asuntos, ran.ola_actual(colas), envios, mismo_lote=lote)
    except (Exception, SystemExit) as e:  # SystemExit: el reparto aborta así si git falla
        salida["error"] = "%s: %s" % (type(e).__name__, e)
    try:
        r = subprocess.run(["gh", "run", "list", "--workflow", WORKFLOW, "--limit", "12", "--json", "status"],
                           cwd=RAIZ, capture_output=True, text=True, timeout=40)
        salida["runs"] = runs_en_marcha(json.loads(r.stdout or "[]")) if r.returncode == 0 else 0
    except Exception:
        pass
    return salida


def _leer_latidos():
    import glob

    salida = []
    for f in glob.glob(os.path.join(LATIDOS, "latidos-cola-auto-*.json")):
        try:
            salida.append((os.path.getmtime(f), _leer_json(f, {})))
        except OSError:
            continue
    return salida


def _sondear_escritores():
    """Una sonda de 1 token por proveedor de escritura (scripts/enjambre/sonda_escritor.py).
    Lo que sale sin cupo para el día se anota en la salud compartida, para que el orquestador
    no pierda 5 minutos por modelo intentándolo. Devuelve [(modelo, apto, motivo, horas)]."""
    from concurrent.futures import ThreadPoolExecutor

    ruta = os.path.join(RAIZ, "scripts", "enjambre")
    if ruta not in sys.path:
        sys.path.insert(0, ruta)
    import sonda_escritor as SE

    cfg = _leer_json(os.path.expanduser("~/.config/opencode/opencode.json"), {})
    entorno = dict(os.environ)
    for r in (os.path.join(RAIZ, ".env.local"), "~/.hermes/.env", "~/.starseed/env"):
        try:
            for l in open(os.path.expanduser(r), encoding="utf-8"):
                l = l.strip()
                if l and not l.startswith("#") and "=" in l:
                    k, v = l.split("=", 1)
                    entorno.setdefault(k.replace("export ", "").strip(), v.strip().strip('"').strip("'"))
        except OSError:
            pass
    grupos = representantes(cfg)
    with ThreadPoolExecutor(8) as ex:
        res = [r for r in ex.map(lambda ms: veredicto_proveedor(ms, lambda m: SE.sondear(m, cfg, entorno)),
                                 grupos.values()) if r]
    salud = _leer_json(SALUD, {})
    try:
        _auth = _leer_json(os.path.expanduser("~/.local/share/opencode/auth.json"), {})
    except Exception:  # noqa: BLE001 — sin auth.json se mira solo el entorno
        _auth = {}
    _zen = resultado_zen(entorno, salud, time.strftime("%Y-%m-%d %H:%M:%S"), _auth)
    if _zen:
        res.append(_zen)
    cambio = False
    for m, apto, motivo, horas, muerto in res:
        prov = SALUD_DE.get(m.split("/", 1)[0], m.split("/", 1)[0])
        e = salud.get(prov) if isinstance(salud.get(prov), dict) else {}
        if not apto and not muerto and horas >= 1:
            hasta = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(time.time() + horas * 3600))
            if str(e.get("sin_cupo_hasta") or "") < hasta:
                e.update(sin_cupo_hasta=hasta, motivo="sonda del botón: " + motivo)
                salud[prov], cambio = e, True
    if cambio:
        try:
            tmp = SALUD + ".tmp-capacidad"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(salud, f, ensure_ascii=False, indent=1)
            os.replace(tmp, SALUD)
        except OSError:
            pass
    return [(m, apto, motivo, horas) for m, apto, motivo, horas, _ in res]


def _otros_medios():
    """Sondea todos los medios UNA vez y, con lo mismo, vuelve a medir los contenedores de la
    nube (lo que hacía el botón «Buscar contenedores», fusionado aquí el 2026-10-05): así el
    medidor Contenedores y el director de la nube ven la medida nueva."""
    try:
        import medios_disponibles

        medios = medios_disponibles.sondear().get("medios") or []
    except Exception as e:
        return [{"id": "medios", "nombre": "Otros medios", "estado": "?",
                 "detalle": "no pude sondearlos (%s)" % type(e).__name__}]
    try:
        import contenedores_nube

        contenedores_nube.escribir(contenedores_nube.inventario(medios))
    except Exception:
        pass
    return [m for m in medios if m.get("id") not in ("mac", "nube-gh")]


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
        # (2026-10-08) Alex: «hay listas pendientes sin proceso activo» y el botón contestaba
        # «no cabe más». Había un orquestador VIVO sin ninguna tarea en marcha: el botón ni lo
        # miraba. Ahora, si una persona lo pulsa y el orquestador está parado con listas, se
        # reinicia en el acto (no tiene nada en marcha: no se pierde trabajo).
        if aplicar and mac:
            try:
                import atasco_orquestador

                cura = atasco_orquestador.curar(persiste_s=0 if origen == "boton" else atasco_orquestador.PERSISTE_S,
                                                # (2026-10-21) 120 s mataba orquestadores que acababan de
                                                # repartir sus primeras tareas: la misma edad para todos.
                                                edad_min_s=atasco_orquestador.EDAD_MIN_S)
                if cura.get("accion") == "reiniciado":
                    hechas.append("orquestador parado reiniciado")
                    sumados += len(cura.get("listas") or [])
                    lineas.append("%s: el orquestador estaba vivo pero PARADO (%s) → lo reinicio y el vigilante "
                                  "lanza una tanda nueva ya" % (NOMBRES["mac"], cura.get("motivo")))
            except Exception as e:  # noqa: BLE001
                lineas.append("%s: no pude mirar si el orquestador está parado (%s)" % (NOMBRES["mac"], type(e).__name__))
        try:
            import asignar_huecos

            estado_mac = asignar_huecos.reunir()
            decision = asignar_huecos.decidir(estado_mac)
            hechas_mac = asignar_huecos.aplicar(estado_mac, decision) if (aplicar and mac and decision.get("puede")) else []
            if hechas_mac:
                hechas += hechas_mac
                sumados += int(decision.get("huecos") or 0)
                # Despertar al vigilante para una tanda nueva SÍ suma agentes: antes salía
                # «no cabe más ahora mismo» justo cuando arrancaba una tanda.
                if decision.get("despertar_vigilante") and not decision.get("huecos"):
                    sumados += min(len(estado_mac.get("listas") or []), int(estado_mac.get("tope") or 3)) or 1
            lineas.append(texto_mac(estado_mac, decision, hechas_mac))
        except Exception as e:
            lineas.append("%s: no pude mirarla (%s: %s)" % (NOMBRES["mac"], type(e).__name__, e))

        # 1a · Escritores: una sonda de 1 token por proveedor (solo al pulsar el botón).
        sin_escritores = False
        sondas = []
        if origen == "boton" and sondear_medios:
            try:
                sondas = _sondear_escritores()
                linea_esc, alguno = texto_escritores(sondas, ahora)
                lineas.append(linea_esc)
                lineas.append(texto_fuera_de_escritura())
                sin_escritores = not alguno
            except Exception as e:
                lineas.append("Escritores: no pude sondearlos (%s)" % type(e).__name__)

        # 1b · Modelos: sin modelos que contesten, un hueco no es capacidad.
        try:
            lineas.append(texto_modelos(_leer_json(SALUD, {}), time.strftime("%Y-%m-%d %H:%M:%S"),
                                        esperando_pasarela(_leer_latidos(), ahora)))
        except Exception:
            pass

        # 2 · Nube
        nube = reunir_nube(ahora, estado_mac)
        vivos = nube["runs"] + en_camino(estado_prev, ahora)
        reaperturas = RN.leer_reaperturas(ahora)
        # (2026-10-10, CAP1010) El tope crece con el trabajo y con los escritores vivos que
        # llegan a la nube; ya no es un 2 fijo.
        escritores_nube = escritores_en_la_nube(sondas, _leer_json(SALUD, {}), time.strftime("%Y-%m-%d %H:%M:%S"))
        reabribles = [t for t in nube["clases"].get("agotada") or [] if puede_reabrir(reaperturas.get(t), ahora)]
        tope = tope_runs_nube(len(nube["clases"].get("elegibles") or []) + min(REABRIR_POR_PASADA, len(reabribles)),
                              escritores_nube)
        plan = plan_nube(
            nube["clases"].get("elegibles"), nube["clases"].get("agotada"), vivos, nube["pausa"],
            reaperturas, ahora, listas_mac=len(estado_mac.get("listas") or []),
            tope_mac=int(estado_mac.get("tope") or 0), tope_runs=tope[0], motivo_tope=tope[1],
        )
        lineas_previas = texto_ultimo_despliegue(estado_prev, ahora)
        if lineas_previas:
            lineas.append(lineas_previas)
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
        lineas.append(texto_nube(nube["clases"], plan, vivos, lanzados, aplicado=aplicar, mac=nube.get("mac"),
                                 tope=tope))

        # 2b · Sesiones de Claude Code en la nube (crédito propio, no el límite semanal).
        try:
            sumadas_claude, linea_claude = claude_nube(aplicar, ahora)
            if sumadas_claude:
                sumados += sumadas_claude
                hechas.append("sesiones de Claude en la nube: %d" % sumadas_claude)
            lineas.append(linea_claude)
        except Exception as e:  # noqa: BLE001
            lineas.append("%s: no pude mirarlas (%s)" % (NOMBRES["claude-nube"], type(e).__name__))

        # 3 · Los demás medios
        if futuro_medios is not None:
            lineas += [texto_medio(m) for m in futuro_medios.result()]

    sin_trabajo = (not (estado_mac.get("listas") or []) and not (nube["clases"].get("elegibles") or [])
                   and not plan.get("reabrir"))
    if sin_trabajo:
        try:
            lineas.insert(1, texto_sin_trabajo(_leer_json(os.path.join(LATIDOS, "progreso.json"), {})))
        except Exception:
            pass
    texto = resumen(lineas, sumados, sin_escritores=sin_escritores, sin_trabajo=sin_trabajo)
    estado_prev.update(visto=time.strftime("%Y-%m-%d %H:%M:%S"), origen=origen, sumados=sumados,
                       hechas=hechas, resumen=texto)
    if aplicar:
        _guardar(estado_prev)
    if aplicar and (origen == "boton" or sumados):
        _avisar(("Buscar más capacidad (%s):\n" % ("botón de Genesis" if origen == "boton" else origen)) + texto)
    return {"ok": True, "resumen": texto, "lineas": lineas, "sumados": sumados, "hechas": hechas,
            "plan_nube": plan, "runs_nube": vivos, "tope_nube": list(tope), "escritores_nube": escritores_nube,
            "mac_cede": (nube.get("mac") or {}).get("cedibles") or []}


def desplegar(runs, trabajadores):
    """Lanza `runs` jobs seguidos con `nube-gh.py lanzar` (cada uno reparte su propia cola) y
    deja el resultado en el Chat Director."""
    hechos, lanzados, fallo = [], 0, ""
    for i in range(max(0, int(runs))):
        # `--ceder` (2026-10-10, CAP1010): la tanda viva de la Mac cede lo que no alcanza pronto.
        r = subprocess.run(
            [sys.executable, os.path.join(DIRECTORIO, "nube-gh.py"), "lanzar", "--tope",
             str(int(trabajadores) * 2), "--trabajadores", str(trabajadores), "--minutos", str(MINUTOS_JOB),
             "--ceder"],
            cwd=RAIZ, capture_output=True, text=True, timeout=600,
        )
        salida = ((r.stdout or "") + (r.stderr or "")).strip()
        print(salida, flush=True)
        lanzado = [l for l in salida.splitlines() if l.startswith("lanzado:")]
        if r.returncode != 0 or not lanzado:
            fallo = (salida.splitlines() or ["?"])[-1][:200]
            hechos.append("job %d no salió: %s" % (i + 1, fallo))
            break
        lanzados += 1
        hechos.append(lanzado[-1])
    # (2026-10-10, CAP1010) Lo «en camino» pasa a ser lo que SALIÓ de verdad: antes se quedaban
    # contados como vivos los jobs pedidos aunque el reparto hubiera dicho «0 tareas».
    estado = _leer_json(ESTADO, {})
    ahora = time.time()
    estado.update(en_camino=lanzados, en_camino_hasta=(ahora + EN_CAMINO_S) if lanzados else 0,
                  ultimo_despliegue={"t": ahora, "pedidos": int(runs), "lanzados": lanzados, "fallo": fallo})
    _guardar(estado)
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
