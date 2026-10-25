#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cloudroom como contenedor en la nube de MetaGenesis: lanza tareas a hilos y sigue lo que entregan
(Ola 1024C, CRM1024E/Eb · contrato `architecture/cloudroom-servidor-agentes.md` §3–§5).

  cloudroom_lanzar.py lanzar --ids A,B [--seco] [--json]
  cloudroom_lanzar.py seguir [--seco] [--json]

`lanzar` abre por tarea un hilo de la nube (`room-cli thread spawn --machine cloud`) con el brief y
las puertas del enjambre, y deja la tarea `reasignada · cloudroom (<harness>/<modelo>)` (préstamo, no
traspaso). Los modelos (CRM1024J, `cloudroom_modelos`): solo los que la cuenta tiene EN LA NUBE
(`cloud status --json`, nunca uno inventado), repartidos en rueda entre opencode/pi gratis, Codex
(< 80 % de su cuota, la del enjambre) y Claude Code sonnet/haiku (semana < 30 %); si un spawn falla
por el modelo, la tarea prueba el siguiente sin gastarse. Ritmo (CAP1025C): lo que QUEDA del ciclo de 30 días
(100 hilos en el plan gratis) entre los días que faltan, hacia arriba y con `TOPE_DIA`
(`STARSEED_CLOUDROOM_TOPE_DIA`), un hilo cada 24 h ÷ ritmo y `MAX_VIVOS` hilos abiertos.
`seguir` no se queda esperando (`thread list`, no `thread wait`): si el agente EMPUJÓ su rama
`nube/cr-<fecha>/ola/<ID>`, la tarea vuelve a `pendiente` y se lanza `traer_nube`, que la trae con sus
puertas (tsc, pruebas, revisión); si el hilo terminó sin rama, `environment diff-patch` se convierte
en un commit sobre la base del hilo y se sube como esa misma rama. Un hilo cuyo sandbox no tenía el
repo vuelve a `pendiente` como fallo del MEDIO (no gasta la tarea). Nunca integra en main.
El registro `~/.starseed/cloudroom-hilos.json` no se poda: de él salen el consumo y lo que no se
relanza. Decisiones PURAS probadas en `test_cloudroom_lanzar.py` (sin room-cli, sin red).
"""
from __future__ import annotations

import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unicodedata
from datetime import datetime, timezone

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import alta_capacidad_nube_logica as L  # noqa: E402  (brief y bloqueo por historial)
import cloudroom_modelos as CM  # noqa: E402  (qué modelos de la nube caben y su rueda)
import prioridad_logica as P  # noqa: E402
import repartir_nube as RN  # noqa: E402
import traer_nube  # noqa: E402

MEDIO = "cloudroom"
REGISTRO = os.path.expanduser("~/.starseed/cloudroom-hilos.json")
CICLO_DIAS, DIA_S = 30, 86400
#: Hilos de la nube abiertos a la vez, como el carril de Claude en la nube.
MAX_VIVOS = 3
#: Una tarea no se relanza en 24 h ni más de 2 veces (la lección del carril de Claude, 23-10).
REPETIR_TRAS_H, MAX_POR_TAREA = 24, 2
#: Sin rama ni hilo terminado en 12 h, la tarea vuelve al enjambre.
GRACIA_H = 12
#: Un hilo «terminado» recién abierto puede no haber empezado: el diff-patch espera 10 min.
MIN_PARCHE_S = 600
#: El agente trabaja solo en su sandbox: tiene que correr npm, tsc, pruebas y `git push` sin pedir permiso.
PERMISOS = "full"
TRABAJANDO = frozenset({"running", "working", "busy", "queued", "starting", "pending", "in_progress",
                        "active", "thinking", "streaming"})
#: Final de un hilo cuyo sandbox no tenía el repo: cuenta para el cupo de la cuenta (el hilo se abrió)
#: pero no para la tarea (ni las 24 h ni `MAX_POR_TAREA`).
FALLO_MEDIO = "medio"
#: Dos fallos del medio seguidos paran los lanzamientos este tiempo: relanzar quemaría cupo en balde.
PAUSA_MEDIO_H = 12
#: El agente dice que su sandbox no tiene el proyecto (o git lo dice por él). Sin acentos ni mayúsculas.
SIN_REPO = re.compile(
    r"no es un repositorio( de)? git|not a git repository|"
    r"no hay (una |ninguna )?copia del (proyecto|repo|repositorio)|"
    r"(sandbox|entorno|carpeta|directorio)[^.\n]{0,40}\b(no tiene|no contiene|sin) (el |ningun |un )?(repo|repositorio|proyecto)\b|"
    r"no hay (ningun |un )?(repo|repositorio|proyecto) en (el|este) (sandbox|entorno)|"
    r"(does not|doesn't) (contain|have) (the|a) (repo|repository|project)")
#: Campos de `thread list --json` donde puede venir lo último que dijo el hilo («preview» no: puede ser el prompt).
CLAVES_FINAL = ("lastMessage", "last_message", "lastAssistantMessage", "last_assistant_message", "finalMessage",
                "final_message", "lastResponse", "result", "summary", "output", "error", "statusMessage", "status_message")
TERMINADO = frozenset({"idle", "completed", "complete", "done", "finished", "stopped", "succeeded",
                       "success", "failed", "error", "errored", "cancelled", "canceled", "archived", "exited"})

PLANTILLA = """Eres un agente de StarSeed OS en un hilo de la nube de Cloudroom: un sandbox con una COPIA del repo, no la Mac de Alex (aquí no hay Genesis, ni ~/.starseed, ni orquestador). Haces UNA tarea de la cola del enjambre, solo y sin preguntar: nadie contestará hasta que termines.

## Reglas
- Lee CLAUDE.md y AGENTS.md (lo que afecta a escribir código y pruebas) y el contrato que nombre la tarea.
- Solo los archivos declarados ({ARCHIVOS}); si de verdad hace falta otro, lo mínimo, y lo dices.
- `npm ci` está permitido; NO añadas dependencias ni cambies package.json / package-lock.json.
- Puertas: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck -p .` antes (línea base) y al final (cero errores nuevos), y tus pruebas en verde (`npx vitest run <pruebas>` o `python3 -m pytest -q <pruebas>`). Si una prueba falla se arregla el código, no la prueba.
- Si main ya lo cubre, no lo dupliques: `NO APLICA: <motivo>` sin commit.
- Prohibido: push a main, desplegar, tocar secretos, vercel.json, .github/ o la CI, abrir pull requests y subir datos privados.

## Al terminar
1. Un solo commit con el asunto exacto `Ola {OLA} · Cloudroom · {ID}: {TITULO}`.
2. `git push origin HEAD:refs/heads/nube/cr-{FECHA}/ola/{ID}` (si no puedes empujar, deja el commit en tu entorno y no insistas: la dirección lo recoge).
3. La última línea es UNA de estas: `INTEGRABLE · rama <nombre> · tsc y pruebas en verde (<n>)` · `PENDIENTE-DE: <qué>` · `NO APLICA: <motivo>`.

## La tarea {ID}
Título: {TITULO}

{PROMPT}
"""


# ── decisiones (puras) ──────────────────────────────────────────────────────────────────────────

def _filas(registro):
    return [x for x in (registro or []) if isinstance(x, dict) and x.get("tarea") and x.get("hilo")]


def _t(x):
    try:
        return float(x.get("t") or 0)
    except (TypeError, ValueError):
        return 0.0


def _lista(valor):
    return [valor] if isinstance(valor, str) else list(valor or [])


def abiertos(registro):
    """Los hilos del registro sin estado final («traida», «parche», «devuelta», «olvidada»)."""
    return [x for x in _filas(registro) if not x.get("final")]


#: (2026-10-25, CAP1025C) Tope de hilos de la nube por día (dos tandas de `MAX_VIVOS`), por si quedan muchos y
#: pocos días: nunca más de esto aunque el reparto dé más.
TOPE_DIA = int(os.environ.get("STARSEED_CLOUDROOM_TOPE_DIA") or 6)


def medianoche(ahora):
    """PURA salvo la zona horaria: el inicio del día local de `ahora` (el día del ritmo)."""
    t = time.localtime(ahora)
    return time.mktime((t.tm_year, t.tm_mon, t.tm_mday, 0, 0, 0, 0, 0, -1))


def ritmo(registro, ahora, total=100, usados_cuenta=0, max_vivos=MAX_VIVOS, tope_dia=TOPE_DIA):
    """PURA. {"hoy", "quedan", "motivo", "por_dia"}: cuántos hilos caben AHORA sin agotar el ciclo.

    Cada hilo cuenta 30 días (ventana móvil); lo usado es lo mayor entre el registro y lo que diga la
    cuenta.

    (2026-10-25, CAP1025C) El cupo de HOY (el día local) = lo que quedaba al empezar el día ÷ días hasta que
    el hilo más viejo salga del ciclo (30 sin ninguno), hacia ARRIBA y con `tope_dia`, menos lo lanzado
    hoy. Antes: hacia abajo y restando las últimas 24 h, y el motivo enseñaba el ritmo del ciclo entero:
    con 47 hilos abiertos el 24-10 entre las 13 y las 19 h, el 25-10 a las 12:10 decía «sin cupo hoy: ya
    van 47 (ritmo 3,4 al día)» con 53 por usar, y después daba 1 al día (1,8 hacia abajo). Ahora: 53 en 29
    días → 2 al día desde hoy, y una ráfaga de ayer no deja parado el día de hoy. Con menos de uno al día,
    uno cada 1/ritmo días desde el último."""
    ventana = sorted(_t(x) for x in _filas(registro) if ahora - _t(x) < CICLO_DIAS * DIA_S)
    usados = max(len(ventana), int(usados_cuenta or 0))
    quedan = max(0, int(total) - usados)
    if quedan <= 0:
        return {"hoy": 0, "quedan": 0, "por_dia": 0.0,
                "motivo": "sin cupo: %d de %d hilos de la nube usados en %d días" % (usados, total, CICLO_DIAS)}
    vivos = len(abiertos(registro))
    hoy_ya = sum(1 for t in ventana if t >= medianoche(ahora))
    dias = max(1.0, (ventana[0] + CICLO_DIAS * DIA_S - ahora) / DIA_S) if ventana else float(CICLO_DIAS)
    crudo = (quedan + hoy_ya) / dias
    por_dia = float(min(int(tope_dia), int(math.ceil(crudo)))) if crudo >= 1 else crudo
    reparto = "quedan %d para %.0f día(s): %s, tope %d" % (
        quedan, dias, ("%d al día" % por_dia) if por_dia >= 1 else ("1 cada %.0f días" % (1 / por_dia)), int(tope_dia))
    if vivos >= max_vivos:
        return {"hoy": 0, "quedan": quedan, "por_dia": por_dia,
                "motivo": "sin cupo ahora: %d hilos abiertos (tope %d)" % (vivos, max_vivos)}
    if por_dia >= 1:
        hoy = int(por_dia) - hoy_ya
    else:
        hoy = 1 if not hoy_ya and (not ventana or ahora - ventana[-1] >= DIA_S / por_dia) else 0
    hoy = max(0, min(hoy, quedan, max_vivos - vivos))
    motivo = ("caben %d (%s)" % (hoy, reparto)) if hoy else ("sin cupo hoy: ya van %d hoy (%s)" % (hoy_ya, reparto))
    return {"hoy": hoy, "quedan": quedan, "por_dia": por_dia, "motivo": motivo}


def no_relanzar(registro, ahora):
    """PURA: tareas con hilo abierto, lanzadas hace menos de 24 h o ya `MAX_POR_TAREA` veces. Un hilo
    que acabó por fallo del medio (`FALLO_MEDIO`) no cuenta: la tarea no tuvo su oportunidad."""
    contadas = [x for x in _filas(registro) if x.get("final") != FALLO_MEDIO]
    return (L.bloqueadas_por_historial(contadas, ahora, REPETIR_TRAS_H, MAX_POR_TAREA)
            | {str(x["tarea"]) for x in abiertos(registro)})


def pausa_por_medio(registro, ahora, horas=PAUSA_MEDIO_H):
    """PURA: por qué no se lanza nada ahora ("" si se lanza): los dos últimos hilos cerrados acabaron
    sin el repo en su sandbox hace menos de `horas`. Sin esta pausa, devolver sin gastar la tarea
    haría que la siguiente pasada la relanzara una y otra vez contra el mismo medio roto."""
    def t_final(x):
        try:
            return float(x.get("t_final") or x.get("t") or 0)
        except (TypeError, ValueError):
            return 0.0
    ultimas = sorted((x for x in _filas(registro) if x.get("final")), key=t_final)[-2:]
    if len(ultimas) < 2 or any(x.get("final") != FALLO_MEDIO for x in ultimas) or ahora - t_final(ultimas[-1]) >= horas * 3600:
        return ""
    return ("pausa: los 2 últimos hilos acabaron sin el repo en su sandbox (revisa el proyecto conectado en la app "
            "Cloudroom); vuelve a probar a las %s" % time.strftime("%H:%M", time.localtime(t_final(ultimas[-1]) + horas * 3600)))


def por_prioridad(ids, tareas, progreso, ahora):
    """PURA: `ids` en el orden de `prioridad_logica.ordenar` (lo que pidió Alex, la capacidad, lo que
    desbloquea…); las que esperan una dependencia sin cerrar, fuera: un hilo solo ve main."""
    lista = [tareas[i] for i in dict.fromkeys(str(x) for x in ids or ()) if isinstance(tareas.get(i), dict)]
    listas, _ = P.ordenar(lista, progreso if isinstance(progreso, dict) else {}, datetime.fromtimestamp(ahora))
    return [str(t["id"]) for t, _p, _r in listas]


def seleccionar(ids, tareas, progreso, registro, ahora, cupo):
    """PURA. Las tareas de `ids` (en su orden, hasta `cupo`) que se lanzan: el reparto las daría
    (estado repartible), no son privadas, sus dependencias están cerradas y no se relanzan."""
    progreso = progreso if isinstance(progreso, dict) else {}
    fuera, salida = no_relanzar(registro, ahora), []
    for tid in dict.fromkeys(str(i) for i in ids or ()):
        t = tareas.get(tid)
        e = progreso.get(tid) if isinstance(progreso.get(tid), dict) else {}
        if (len(salida) >= cupo or not isinstance(t, dict) or tid in fuera or t.get("privada") or RN.es_privada(t)
                or e.get("estado") not in RN.ESTADOS_REPARTIBLES
                or not all(P.dependencia_cerrada(d, progreso) for d in _lista(t.get("depende") or t.get("depende_de")))):
            continue
        salida.append(t)
    return salida


def sin_ola(valor):
    """PURA: «1019A · ADN…» de «Ola 1019A · ADN…»: la plantilla ya pone «Ola» delante (el asunto salía
    «Ola Ola 1019A …», medido en main el 2026-10-24)."""
    return re.sub(r"^\s*ola\s+", "", str(valor or ""), flags=re.I).strip()


def marca(modelo, ahora, harness=""):
    """Los campos de progreso de una tarea prestada a un hilo de Cloudroom (la nota dice harness y modelo)."""
    etiqueta = "%s/%s" % (harness, modelo) if harness else modelo
    return {"estado": "reasignada", "medio": MEDIO, "nota": "reasignada · cloudroom (%s)" % etiqueta, "t": ahora}


def motivo_medio(medio):
    """PURA: por qué no se puede usar el medio (vacío si se puede), en las palabras del parte."""
    medio = medio if isinstance(medio, dict) else {}
    estado, detalle = medio.get("estado"), str(medio.get("detalle") or "")
    if estado in ("usable", "listo"):
        return ""
    if estado == "requiere_alex":
        return "sin sesión (%s)" % (medio.get("siguiente_paso") or detalle or "inicia sesión en la app Cloudroom")
    return "app sin instalar" if "sin instalar" in detalle or not detalle else "no disponible (%s)" % detalle


def modelos_nube(estado):
    """PURA: [(harness, modelo)] de `cloud status --json` (harnesses[].models[].model), en su orden."""
    return [(h, m) for h, _d, modelos in CM.harnesses_nube(estado) for m in modelos]


def elegir_modelo(estado, preferido=""):
    """PURA: (harness, modelo) de los que la cuenta tiene EN LA NUBE; el `preferido`, solo si está.
    (`lanzar` ya no elige uno para todas: reparte con `cloudroom_modelos`.)"""
    pares = modelos_nube(estado)
    return CM.modelo_fijado(estado, preferido) or (pares[0] if pares else ("", ""))


def uso_cuenta(estado, ahora):
    """PURA: (total, usados) del ciclo según `cloud status` (el lector del medidor de créditos)."""
    import medidor_cloudroom as M

    ventanas = M.interpretar(estado or {}, {}, [], datetime.fromtimestamp(ahora, timezone.utc))["ventanas"]
    v = next((x for x in ventanas if x.get("id") == "cloudroom_30d"), {})
    return int(v.get("total") or M.CUPO_GRATIS), int(v.get("usado") or 0)


def rama_pedida(tid, fecha):
    return "nube/cr-%s/ola/%s" % (fecha, tid)


def brief(tarea, fecha):
    """PURA: el encargo del hilo: la plantilla con su asunto y su rama, y el prompt de la tarea."""
    return L.brief(PLANTILLA.replace("{OLA}", sin_ola(tarea.get("ola")) or fecha), tarea, fecha)


def orden_spawn(cli, tarea, texto, harness, modelo, peticion, proyecto=""):
    """PURA: `room-cli thread spawn` con sus flags reales (verificados en la Mac el 2026-10-24).
    `--request-id` hace idempotente un reintento: el mismo id no abre dos hilos."""
    if not harness or not modelo:
        raise ValueError("sin modelo de la nube")
    titulo = ("%s · %s" % (tarea.get("id"), tarea.get("titulo") or "")).strip(" ·")[:90]
    # (2026-10-24) Sin «--new-environment»: pide un valor (personal|worktree) y, suelto, room-cli tomaba el
    # siguiente argumento como posicional («too many arguments for 'spawn'»). En la nube el sandbox ya es nuevo.
    orden = [cli, "thread", "spawn", "--machine", "cloud", "--base-branch", "main",
             "--provider", harness, "--model", modelo, "--permission-mode", PERMISOS, "--title", titulo,
             "--request-id", peticion, "--json"]
    # (2026-10-24) Los modelos propios de Pi (NIM, xKiro) solo admiten el razonamiento «none» («supported: off»).
    if harness == "pi" and modelo in CM.pi_declarados():
        orden += ["--reasoning-level", "none"]
    return orden + (["--project", proyecto] if proyecto else []) + ["--prompt", texto]


def _campo(datos, claves, anidado):
    if not isinstance(datos, dict):
        return ""
    datos = datos.get("data", datos) if isinstance(datos.get("data"), dict) else datos
    sub = datos.get(anidado) if isinstance(datos.get(anidado), dict) else {}
    return str(next((datos[k] for k in claves if datos.get(k)), "") or sub.get("id") or "")


def id_hilo(datos):
    return _campo(datos, ("id", "threadId", "thread_id"), "thread")


def entorno_de(datos):
    return _campo(datos, ("environmentId", "environment_id"), "environment")


def hilos_por_id(datos):
    """PURA: {id: hilo} de `thread list --json` (lista, o {"threads"|"data": lista})."""
    if isinstance(datos, dict):
        datos = datos.get("data", datos)
    if isinstance(datos, dict):
        datos = datos.get("threads") or []
    return {id_hilo(h): h for h in datos if isinstance(h, dict) and id_hilo(h)} if isinstance(datos, list) else {}


def estado_hilo(hilo):
    """PURA: «trabajando» | «terminado» | «desconocido» (lo desconocido se trata como trabajando)."""
    if not isinstance(hilo, dict):
        return "desconocido"
    s = str(hilo.get("status") or hilo.get("state") or "").strip().lower().replace("-", "_").replace(" ", "_")
    if s in TERMINADO or hilo.get("archived") is True:
        return "terminado"
    return "trabajando" if s in TRABAJANDO else "desconocido"


def _normal(texto):
    """Minúsculas y sin acentos, para buscar frases del agente sin depender de cómo las escribió."""
    return "".join(c for c in unicodedata.normalize("NFKD", str(texto or "")) if not unicodedata.combining(c)).lower()


def sin_repo(texto):
    """PURA: el texto dice que el sandbox no tenía el repo («no es un repositorio Git», «no hay una
    copia del proyecto», «fatal: not a git repository»)."""
    return bool(texto) and bool(SIN_REPO.search(_normal(texto)))


def _textos(valor, prof=0):
    if isinstance(valor, str):
        return [valor]
    if prof >= 3:
        return []
    if isinstance(valor, dict):
        return [t for k in ("text", "content", "message", "body", "summary") for t in _textos(valor.get(k), prof + 1)]
    if isinstance(valor, list):
        return [t for v in valor[-3:] for t in _textos(v, prof + 1)]
    return []


def texto_final(hilo):
    """PURA: lo último que dijo el hilo según `thread list --json` (los campos de `CLAVES_FINAL` y el
    último de `messages`), como mucho 4.000 caracteres; "" si no trae nada."""
    if not isinstance(hilo, dict):
        return ""
    partes = [t for k in CLAVES_FINAL for t in _textos(hilo.get(k))]
    if isinstance(hilo.get("messages"), list) and hilo["messages"]:
        partes += _textos(hilo["messages"][-1])
    return "\n".join(partes)[-4000:]


def _prestada(progreso, tid):
    e = progreso.get(tid) if isinstance(progreso, dict) else None
    return isinstance(e, dict) and e.get("estado") == "reasignada" and e.get("medio") == MEDIO


def decidir(fila, ramas, hilos, progreso, ahora, gracia_h=GRACIA_H):
    """PURA: qué hacer con un hilo abierto: «traer» | «parche» | «devolver» | «medio» | «esperar» | «olvidar».

    `ramas`: las `nube/cr-*` del remoto (None si no se pudieron leer: entonces solo se espera, para no
    subir un parche encima de una rama que quizá ya existe). `hilos`: {id: hilo} o None. Un hilo
    terminado que dice que su sandbox no tenía el repo va igual al diff-patch (nada se tira sin
    mirar), sin esperar los 10 min; si el diff-patch ya falló 3 veces, «medio»: vuelve sin gastarse."""
    tid = str(fila["tarea"])
    if not _prestada(progreso, tid):
        return "olvidar"
    if ramas is None:
        return "esperar"
    if fila.get("rama_pedida") in ramas or any(r.startswith("nube/cr-") and r.endswith("/ola/" + tid) for r in ramas):
        return "traer"
    edad = ahora - _t(fila)
    hilo = hilos.get(str(fila["hilo"])) if hilos is not None else None
    if hilos is not None and estado_hilo(hilo) == "terminado":
        medio_roto = sin_repo(texto_final(hilo))
        if int(fila.get("intentos_parche") or 0) >= 3:
            return FALLO_MEDIO if medio_roto else "devolver"
        if edad >= MIN_PARCHE_S or medio_roto:
            return "parche"
    return "devolver" if edad > gracia_h * 3600 else "esperar"


#: (CRM1024K, 2026-10-24) Un hilo que se paró porque el PROVEEDOR de su modelo cortó (429, saturado,
#: 5xx) o porque su modelo no existe para la cuenta (404/410, sin clave) no se da por perdido: se le
#: escribe otra vez (`thread tell`: el MISMO hilo, no gasta otro de los 100 del ciclo), con otro modelo
#: del mismo harness si hace falta. Medido: 15 hilos de Pi contra NIM a la vez → los 15 parados con 429.
MAX_REANUDAR = 3
#: Tras un corte por cupo, el mismo proveedor no se vuelve a probar en ese hilo antes de esto.
ESPERA_CUPO_S = 20 * 60
CORTE_CUPO = re.compile(r"\b429\b|too many requests|rate.?limit|overloaded|\b50[234]\b|service unavailable|quota", re.I)
CORTE_MODELO = re.compile(r"\b404\b[^\n]{0,160}\bnot found|\b410\b|end of life|model[^\n]{0,40}not found|"
                          r"no api key found|unknown model|invalid model|\b401\b", re.I)
_CABECERA_LOG = re.compile(r"^\s*── (.+?) ─*\s*$")


def secciones_log(texto):
    """PURA: [(cabecera, cuerpo)] del `thread log` en formato «minimal» («── Error ───» y lo que sigue)."""
    secciones = []
    for linea in (texto or "").splitlines():
        m = _CABECERA_LOG.match(linea)
        if m:
            secciones.append([m.group(1).strip(), []])
        elif secciones:
            secciones[-1][1].append(linea)
    return [(c, "\n".join(cuerpo).strip()) for c, cuerpo in secciones]


def corte_de(log):
    """PURA: «modelo» | «cupo» | "" según cómo ACABA el log del hilo: solo cuenta si lo último es un
    bloque de error (un 429 a mitad de un trabajo que luego siguió no es un corte)."""
    secciones = [x for x in secciones_log(log) if not x[0].lower().startswith("(showing")]
    if not secciones or "error" not in secciones[-1][0].lower():
        return ""
    cuerpo = secciones[-1][1]
    return "modelo" if CORTE_MODELO.search(cuerpo) else "cupo" if CORTE_CUPO.search(cuerpo) else ""


def instante_hilo(hilo, clave="updatedAt"):
    """PURA: segundos epoch de un campo de tiempo de `thread list` (ms, s o ISO); None sin dato."""
    v = hilo.get(clave) if isinstance(hilo, dict) else None
    if isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0:
        return v / 1000.0 if v > 1e11 else float(v)
    if isinstance(v, str) and v:
        try:
            f = datetime.fromisoformat(v.replace("Z", "+00:00"))
        except ValueError:
            return None
        return (f if f.tzinfo else f.replace(tzinfo=timezone.utc)).timestamp()
    return None


def reanudable(accion, fila, corte, ahora, gracia_h=GRACIA_H):
    """PURA: ¿se reanuda en vez de traer el parche o devolverla? Solo un hilo terminado por un corte, con
    reanudaciones libres y dentro de la gracia (pasada, se devuelve como siempre)."""
    return (accion in ("parche", "devolver") and corte in ("cupo", "modelo")
            and int(fila.get("reanudaciones") or 0) < MAX_REANUDAR and ahora - _t(fila) <= gracia_h * 3600)


def plan_reanudar(fila, corte, candidatos, ocupados, topes, ahora, parado_t=None):
    """PURA: (harness, modelo) con el que reanudar, o None si ahora no se puede (sigue abierto).
    · corte «modelo»: otro modelo del mismo harness con hueco.
    · corte «cupo»: otro PROVEEDOR del mismo harness con hueco; si no hay, el mismo modelo cuando el hilo
      lleve `ESPERA_CUPO_S` parado, su proveedor tenga hueco y siga entre los candidatos."""
    h, m = fila.get("harness"), fila.get("modelo")
    actual = CM.proveedor_fila(fila)

    def prov(c):
        return CM.proveedor_fila({"harness": c[0], "modelo": c[1]})

    con_hueco = [c for c in candidatos or [] if c[0] == h and (not prov(c) or ocupados.get(prov(c), 0) < topes.get(prov(c), CM.SIMULTANEOS_DEFECTO))]
    if corte == "modelo":
        otro = next((c for c in con_hueco if c[1] != m), None)
        return (otro[0], otro[1]) if otro else None
    if corte == "cupo":
        otro = next((c for c in con_hueco if prov(c) != actual), None)
        if otro:
            return otro[0], otro[1]
        if parado_t is not None and ahora - parado_t >= ESPERA_CUPO_S and any(c[1] == m for c in con_hueco):
            return h, m
    return None


def mensaje_reanudar(fila, corte, modelo_nuevo=""):
    """PURA: lo que se le escribe al hilo para que siga (en el idioma y con las reglas del brief)."""
    motivo = ("su modelo no estaba disponible para esta cuenta" if corte == "modelo"
              else "el proveedor de su modelo cortó por cupo (429 o saturado)")
    return ("Continúa la tarea %s donde la dejaste: te detuviste porque %s.%s Si tu trabajo sigue en el "
            "sandbox, sigue tu plan sin empezar de cero; si se reinició y no está, hazla desde el principio. "
            "Termina con las reglas de tu primer mensaje: tsc y pruebas en verde, un solo commit, `git push "
            "origin HEAD:refs/heads/%s` y la última línea INTEGRABLE · PENDIENTE-DE · NO APLICA."
            % (fila.get("tarea"), motivo, (" Ahora usas otro modelo: %s." % modelo_nuevo) if modelo_nuevo else "",
               fila.get("rama_pedida") or "nube/cr-<fecha>/ola/%s" % fila.get("tarea")))


def orden_tell(cli, hilo, mensaje, modelo=""):
    """PURA: `room-cli thread tell` (en la nube, en cola). Con `modelo`, el hilo cambia de modelo."""
    return [cli, "thread", "tell", str(hilo), mensaje, "--json"] + (["--model", modelo] if modelo else [])


def huerfanas(progreso, registro, ahora, reserva_s=MIN_PARCHE_S):
    """PURA: `reasignada · cloudroom` sin hilo abierto en el registro (y no recién reservadas): nadie
    las devolvería nunca."""
    abiertas = {str(x["tarea"]) for x in abiertos(registro)}
    return sorted(tid for tid, v in (progreso or {}).items()
                  if _prestada(progreso, tid) and tid not in abiertas and ahora - _t(v) > reserva_s)


def extraer_parche(salida):
    """PURA: el parche de `environment diff-patch` (texto tal cual, o JSON con `patch`)."""
    texto = salida if isinstance(salida, str) else ""
    datos = None
    if texto.strip() and texto.lstrip()[0] in "[{":
        try:
            datos = json.loads(texto)
        except ValueError:
            datos = None
    if isinstance(datos, dict):
        datos = datos.get("data", datos)
    if isinstance(datos, dict):
        datos = [datos]
    if isinstance(datos, list):
        partes = [str(x.get("patch") or x.get("diff") or "") for x in datos if isinstance(x, dict)]
        return "".join(p if p.endswith("\n") else p + "\n" for p in partes if p.strip())
    return texto if "diff --git" in texto else ""


def ramas_de(ls_remote):
    """PURA: nombres de rama de la salida de `git ls-remote`."""
    return {p[1][len("refs/heads/"):].strip() for p in (l.split("\t") for l in (ls_remote or "").splitlines())
            if len(p) == 2 and p[1].startswith("refs/heads/")}


def ids_argumento(argv):
    valor = next((a.split("=", 1)[1] for a in argv if a.startswith("--ids=")), "")
    if not valor and "--ids" in argv:
        i = argv.index("--ids")
        valor = argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith("--") else ""
    return [x.strip() for x in valor.split(",") if x.strip()]


# ── la máquina ──────────────────────────────────────────────────────────────────────────────────

def leer_registro():
    try:
        with open(REGISTRO, encoding="utf-8") as f:
            d = json.load(f)
    except (OSError, ValueError):
        return []
    return d if isinstance(d, list) else []


def _leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def pi_disponibles(run, cli):
    """(CRM1024K) Los modelos de Pi declarados cuya clave está en la nube de Cloudroom (`cloud env
    list`, solo nombres). Un modelo sin su clave abre un hilo que muere con «No API key found»."""
    lista, _err = _json_cli(run, [cli, "cloud", "env", "list", "--json"]) if cli else (None, "")
    return CM.pi_con_clave(CM.pi_declarados(), CM.claves_declaradas(), CM.nombres_env(lista))


def leer_fuentes():
    """(medidores, límites de Claude, salud de proveedores) del disco, para `cloudroom_modelos`. Lo
    que falte se lee vacío: Codex queda «sin lectura» (se usa) y Claude Code fuera (pide lectura fresca)."""
    return _leer_json(CM.MEDIDORES, {}), _leer_json(CM.LIMITES, {}), _leer_json(CM.SALUD, {})


def _registrar(cambiar):
    """Lee, cambia y guarda el registro con su cerrojo (lanzar y seguir pueden correr a la vez)."""
    with traer_nube._Cerrojo("cloudroom-hilos", 60):
        reg = leer_registro()
        cambiar(reg)
        os.makedirs(os.path.dirname(REGISTRO), exist_ok=True)
        tmp = "%s.tmp-%d" % (REGISTRO, os.getpid())
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(reg, f, ensure_ascii=False, indent=1)
        os.replace(tmp, REGISTRO)


def _devolver(cambios):
    """Aplica {tid: campos} SOLO a las que siguen prestadas a Cloudroom (otro actor pudo cogerlas)."""
    with traer_nube._Cerrojo("progreso", 60):
        p = traer_nube._progreso()
        for tid, campos in cambios.items():
            if _prestada(p, tid):
                p[tid] = dict(p[tid], **campos)
        traer_nube._escribir_json(traer_nube.PROGRESO, p)


def _json_cli(run, orden, timeout=30):
    """(JSON, error) de una orden de room-cli; nunca lanza."""
    try:
        p = run(orden, cwd=traer_nube.RAIZ, capture_output=True, text=True, timeout=timeout)
        if p.returncode:
            return None, ((p.stderr or p.stdout or "").strip().splitlines() or ["salió con %s" % p.returncode])[-1][:200]
        return json.loads(p.stdout or "null"), ""
    except (OSError, subprocess.SubprocessError, ValueError) as e:
        return None, type(e).__name__


def _log_hilo(run, cli, hilo):
    """El último turno del log del hilo (formato «minimal»); "" si no se pudo leer."""
    try:
        p = run([cli, "thread", "log", str(hilo), "--limit", "1"], cwd=traer_nube.RAIZ, capture_output=True,
                text=True, timeout=60)
        return (p.stdout or "")[-6000:] if not p.returncode else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def _reanudar(run, cli, fila, plan, mensaje):
    """(ok, error): escribe al hilo. Al cambiar de modelo la nube contesta 409 «model just changed»: el
    modelo ya cambió y el mensaje se manda otra vez, sin `--model`."""
    cambio = plan[1] if plan[1] != fila.get("modelo") else ""
    datos, err = _json_cli(run, orden_tell(cli, fila["hilo"], mensaje, cambio), timeout=90)
    if datos is None and cambio and re.search(r"409|model just changed", err or "", re.I):
        datos, err = _json_cli(run, orden_tell(cli, fila["hilo"], mensaje), timeout=90)
    return datos is not None, err


def proyecto_del_repo(proyectos, raiz):
    """PURA: id del proyecto de Cloudroom cuya fuente local es `raiz` («--project» es obligatorio en
    `thread spawn`; sin él cada lanzamiento fallaba: medido el 2026-10-24). "" si no hay ninguno."""
    lista = proyectos if isinstance(proyectos, list) else (proyectos or {}).get("projects", []) if isinstance(proyectos, dict) else []
    destino = os.path.realpath(raiz)
    for p in lista:
        if not isinstance(p, dict):
            continue
        for fuente in p.get("sources") or []:
            if isinstance(fuente, dict) and fuente.get("path") and os.path.realpath(str(fuente["path"])) == destino:
                return str(p.get("id") or "")
    return ""


def _git(run, args, timeout=120, **kw):
    p = run(["git", *args], cwd=traer_nube.RAIZ, capture_output=True, text=True, timeout=timeout, **kw)
    if p.returncode:
        raise RuntimeError("git %s: %s" % (args[0], (p.stderr or p.stdout or "?").strip()[-300:]))
    return (p.stdout or "").strip()


def lanzar(ids, seco=False, priorizar=False, medio=None, ahora=None, run=subprocess.run, cli=None):
    """Abre hilos de la nube para las tareas de `ids` que caben hoy, cada una con su modelo de la
    rueda (`cloudroom_modelos`). Nunca lanza una excepción por el medio: devuelve {"lanzadas",
    "quedan", "hoy", "motivo", "errores", "modelos": {tarea: "harness/modelo"}}. `medio` y `cli` los
    da la sonda de CRM1024D (`medio_cloudroom`) si no vienen dados."""
    ahora = time.time() if ahora is None else ahora
    res = {"lanzadas": [], "quedan": None, "hoy": 0, "motivo": "", "errores": [], "modelos": {}}
    if medio is None or cli is None:
        import medio_cloudroom

        medio = medio_cloudroom.sondear(run=run) if medio is None else medio
        cli = medio_cloudroom.cli_path() if cli is None else cli
    res["motivo"] = motivo_medio(medio)
    if res["motivo"]:
        return res
    registro = leer_registro()
    res["motivo"] = pausa_por_medio(registro, ahora)
    if res["motivo"]:
        return res
    declarados = pi_disponibles(run, cli)
    estado, err = _json_cli(run, [cli, "cloud", "status", "--json"])
    evaluado = CM.evaluar_modelos(estado, *leer_fuentes(), ahora, declarados=declarados)
    candidatos = evaluado["candidatos"]
    fijo = CM.modelo_fijado(estado, os.environ.get("STARSEED_CLOUDROOM_MODELO", ""))
    fijo = (fijo[0], fijo[1], "fijado por STARSEED_CLOUDROOM_MODELO") if fijo else None
    if not candidatos and not fijo:
        descartes = CM.texto_descartes(evaluado["descartes"])
        res["motivo"] = ("sin modelos en la nube que quepan ahora (%s)" % descartes if descartes else
                         "sin modelos en la nube para esta cuenta (%s)" % (err or "conecta un agente en la app"))
        return res
    r = ritmo(registro, ahora, *uso_cuenta(estado, ahora))
    res.update(quedan=r["quedan"], hoy=r["hoy"])
    if r["hoy"] <= 0:
        res["motivo"] = r["motivo"]
        return res
    tareas = {tid: t for tid, (_n, t) in traer_nube._colas_por_id().items()}
    with RN.CerrojoReparto():
        progreso = traer_nube._progreso()
        orden = por_prioridad(ids, tareas, progreso, ahora) if priorizar else ids
        elegidas = seleccionar(orden, tareas, progreso, registro, ahora, r["hoy"])
        if not elegidas:
            res["motivo"] = ("0 lanzadas: ninguna de las %d cedible(s) cabe (privadas, dependencias o ya "
                             "lanzadas)" % len(ids) if ids else "0 lanzadas: no hay tareas cedibles para la nube")
            return res
        # La rueda: cada tarea empieza en el candidato siguiente al anterior (también entre pasadas).
        ordenes = CM.orden_por_tarea(len(elegidas), candidatos, CM.inicio_rueda(candidatos, registro), fijo)
        # (CRM1024K) Y ningún proveedor gratuito por encima de su tope de hilos a la vez: lo que no cabe
        # espera a la próxima pasada (no se marca ni gasta cupo).
        ordenes = CM.repartir_por_tope(ordenes, CM.vivos_por_proveedor(abiertos(registro)), CM.simultaneos_declarados())
        pares = [(t, o) for t, o in zip(elegidas, ordenes) if o]
        if not pares:
            res["motivo"] = ("0 lanzadas: los proveedores gratuitos están en su tope de hilos a la vez (%s) y "
                             "no queda otro modelo" % ", ".join("%s %d" % x for x in sorted(CM.vivos_por_proveedor(abiertos(registro)).items())))
            return res
        elegidas, ordenes = [t for t, _ in pares], [o for _, o in pares]
        plan = {str(t["id"]): o[0] for t, o in zip(elegidas, ordenes)}
        res["modelos"] = {tid: "%s/%s" % (c[0], c[1]) for tid, c in plan.items()}
        if seco:
            res.update(lanzadas=list(plan), motivo="en seco · %s" % ", ".join("%s→%s" % x for x in res["modelos"].items()))
            return res
        traer_nube._actualizar_progreso({tid: marca(c[1], ahora, c[0]) for tid, c in plan.items()})
    try:
        base = _git(run, ["rev-parse", "--verify", "-q", "origin/main^{commit}"])
    except (OSError, subprocess.SubprocessError, RuntimeError):
        base = ""
    fecha = time.strftime("%Y%m%d", time.localtime(ahora))
    proyecto = os.environ.get("STARSEED_CLOUDROOM_PROYECTO", "")
    if not proyecto:
        lista, _err = _json_cli(run, [cli, "project", "list", "--json"])
        proyecto = proyecto_del_repo(lista, traer_nube.RAIZ)
    rechazados = set()  # (harness, modelo) que la nube rechazó en esta pasada: no se prueban más
    for t, intentos in zip(elegidas, ordenes):
        tid = str(t["id"])
        n = sum(1 for x in _filas(registro) if str(x["tarea"]) == tid) + 1
        texto = brief(t, fecha)
        probar = [c for c in intentos if (c[0], c[1]) not in rechazados][:CM.MAX_MODELOS_POR_TAREA]
        datos, err, hilo, usado, fallidos = None, "" if probar else "la nube rechazó todos los modelos probados", "", None, []
        for k, (h, m, _por) in enumerate(probar):
            # Cada modelo con su `--request-id`: el mismo id sigue siendo idempotente para un reintento.
            peticion = "starseed-%s-%d" % (tid, n) + ("-%d" % (k + 1) if k else "")
            datos, err = _json_cli(run, orden_spawn(cli, t, texto, h, m, peticion, proyecto), timeout=180)
            hilo = id_hilo(datos)
            if hilo:
                usado = (h, m)
                break
            if not CM.fallo_de_modelo(err):
                break  # un fallo que no es del modelo (o un tiempo agotado: quizá se abrió) no se reintenta
            rechazados.add((h, m))
            fallidos.append("%s/%s" % (h, m))
        if not hilo:
            probados = " (probados: %s)" % ", ".join(fallidos) if fallidos else ""
            _devolver({tid: {"estado": "pendiente", "medio": "", "nota": "Cloudroom no abrió el hilo: %s%s" % (err or "sin id", probados)}})
            res["errores"].append("%s: %s%s" % (tid, err or "spawn sin id de hilo", probados))
            res["modelos"].pop(tid, None)
            continue
        harness, modelo = usado
        if usado != tuple(plan[tid][:2]):
            _devolver({tid: {"nota": marca(modelo, ahora, harness)["nota"]}})
        res["modelos"][tid] = "%s/%s" % usado
        fila = {"tarea": tid, "hilo": hilo, "entorno": entorno_de(datos), "t": ahora, "rama_pedida": rama_pedida(tid, fecha),
                "base": base, "harness": harness, "modelo": modelo, "titulo": t.get("titulo") or "", "ola": t.get("ola") or fecha}
        if fallidos:
            fila["modelos_rechazados"] = fallidos
        _registrar(lambda reg, fila=fila: reg.append(fila))
        res["lanzadas"].append(tid)
    res["quedan"] = max(0, r["quedan"] - len(res["lanzadas"]))
    return res


def subir_parche(parche, base, rama, mensaje, run=subprocess.run):
    """Commit = árbol de `base` + `parche` en un índice temporal (no toca ninguna carpeta ni el índice
    de nadie) y push a `rama`, la que `traer_nube` ya sabe traer por sus puertas. Devuelve el sha."""
    carpeta = tempfile.mkdtemp(prefix="cloudroom-indice-")
    env = dict(os.environ, GIT_INDEX_FILE=os.path.join(carpeta, "index"))
    try:
        _git(run, ["read-tree", base], env=env)
        _git(run, ["apply", "--cached", "--whitespace=nowarn"], env=env, input=parche)
        sha = _git(run, ["commit-tree", _git(run, ["write-tree"], env=env), "-p", base, "-m", mensaje], env=env)
        _git(run, ["push", "-q", "origin", "%s:refs/heads/%s" % (sha, rama)], timeout=300)
        return sha
    finally:
        shutil.rmtree(carpeta, ignore_errors=True)


def _parche(fila, hilo, cli, run):
    """(«subido», sha) | («vacio», "") | («error», motivo) del diff-patch de un hilo terminado."""
    entorno = entorno_de(hilo) or fila.get("entorno") or fila["hilo"]
    try:
        p = run([cli, "environment", "diff-patch", str(entorno)], cwd=traer_nube.RAIZ, capture_output=True,
                text=True, timeout=120)
        if p.returncode:
            return "error", "diff-patch: %s" % (p.stderr or "falló").strip()[-200:]
        parche = extraer_parche(p.stdout)
        if not parche:
            return "vacio", ""
        mensaje = ("Ola %s · Cloudroom · %s: %s\n\nTraído del hilo %s con `environment diff-patch` (el agente no "
                   "empujó su rama); entra por las puertas de traer_nube." % (sin_ola(fila.get("ola")) or "cloudroom",
                   fila["tarea"], fila.get("titulo") or "", fila["hilo"]))
        return "subido", subir_parche(parche, fila.get("base") or "origin/main", fila["rama_pedida"], mensaje, run)
    except (OSError, subprocess.SubprocessError, RuntimeError) as e:
        return "error", str(e)[-200:] or type(e).__name__


def traer_en_fondo():
    """La misma pasada de traer de la autocuración (A1 primero y luego `traer_nube`), en segundo plano."""
    import autocuracion_mando

    return autocuracion_mando._traer_en_fondo()


def seguir(aplicar=True, ahora=None, run=subprocess.run, traer=traer_en_fondo, cli=None):
    """Mira los hilos abiertos y, con `aplicar`, trae, sube el diff-patch, devuelve u olvida.
    Devuelve {"acciones": {tid: acción}, "errores": [...]}."""
    ahora = time.time() if ahora is None else ahora
    registro, progreso = leer_registro(), traer_nube._progreso()
    filas, huer = abiertos(registro), huerfanas(progreso, registro, ahora)
    res = {"acciones": {}, "errores": []}
    if not filas and not huer:
        return res
    try:
        ramas = ramas_de(_git(run, ["ls-remote", "origin", "refs/heads/nube/cr-*"], timeout=120))
    except (OSError, subprocess.SubprocessError, RuntimeError) as e:
        ramas = None
        res["errores"].append("no pude leer las ramas del remoto (%s)" % type(e).__name__)
    if cli is None:
        import medio_cloudroom

        cli = medio_cloudroom.cli_path()
    datos, err = _json_cli(run, [cli, "thread", "list", "--json", "--include-archived", "--include-hidden"]) if cli else (None, "app sin instalar")
    hilos = hilos_por_id(datos) if datos is not None else None
    if hilos is None and filas:
        res["errores"].append("no pude listar los hilos (%s)" % err)
    acciones = {str(f["tarea"]): decidir(f, ramas, hilos, progreso, ahora) for f in filas}
    # (CRM1024K) Los parados por un corte del proveedor o de su modelo se reanudan, no se pierden.
    cortes = {}
    for f in filas:
        tid = str(f["tarea"])
        if hilos is not None and cli and estado_hilo(hilos.get(str(f["hilo"]))) == "terminado" and \
                reanudable(acciones[tid], f, "cupo", ahora):
            corte = corte_de(_log_hilo(run, cli, f["hilo"]))
            if reanudable(acciones[tid], f, corte, ahora):
                cortes[tid], acciones[tid] = corte, "reanudar"
    for tid in huer:
        acciones.setdefault(tid, "devolver")
    res["acciones"] = acciones
    if not aplicar:
        return res
    cambios, finales = {}, {}
    if cortes:
        declarados = pi_disponibles(run, cli)
        estado, _err = _json_cli(run, [cli, "cloud", "status", "--json"])
        candidatos = CM.evaluar_modelos(estado, *leer_fuentes(), ahora, declarados=declarados)["candidatos"]
        ocupados = CM.vivos_por_proveedor([f for f in filas if estado_hilo((hilos or {}).get(str(f["hilo"]))) != "terminado"])
        topes = CM.simultaneos_declarados()
        for f in filas:
            tid = str(f["tarea"])
            if tid not in cortes:
                continue
            plan = plan_reanudar(f, cortes[tid], candidatos, ocupados, topes, ahora,
                                 instante_hilo((hilos or {}).get(str(f["hilo"]))))
            nuevo = plan[1] if plan and plan[1] != f.get("modelo") else ""
            ok, err = _reanudar(run, cli, f, plan, mensaje_reanudar(f, cortes[tid], nuevo)) if plan else (False, "")
            if not ok:
                acciones[tid] = "esperar"  # sigue abierto: la próxima pasada lo vuelve a mirar
                if err:
                    res["errores"].append("%s: no pude reanudar el hilo (%s)" % (tid, err))
                continue
            prov = CM.proveedor_fila({"harness": plan[0], "modelo": plan[1]})
            if prov:
                ocupados[prov] = ocupados.get(prov, 0) + 1
            finales[tid] = {"reanudaciones": int(f.get("reanudaciones") or 0) + 1, "t_reanudado": ahora,
                            "intentos_parche": 0, "harness": plan[0], "modelo": plan[1]}
            if nuevo:
                finales[tid]["modelos_previos"] = list(f.get("modelos_previos") or []) + [f.get("modelo")]
                _devolver({tid: {"nota": marca(plan[1], ahora, plan[0])["nota"]}})
    for f in filas:
        tid = str(f["tarea"])
        nota_medio = ("devuelta de Cloudroom por fallo del MEDIO: el sandbox del hilo %s no tenía el repo "
                      "(no gasta la tarea)" % f["hilo"])
        if acciones[tid] == "parche":
            hilo = (hilos or {}).get(str(f["hilo"]))
            resultado, dato = _parche(f, hilo, cli, run)
            if resultado != "subido" and (sin_repo(texto_final(hilo)) or (resultado == "error" and sin_repo(dato))):
                acciones[tid], nota = FALLO_MEDIO, nota_medio  # sin parche que salvar: el medio, no la tarea
            elif resultado == "error":
                res["errores"].append("%s: %s" % (tid, dato))
                acciones[tid] = "esperar"
                finales[tid] = {"intentos_parche": int(f.get("intentos_parche") or 0) + 1}
                continue
            else:
                acciones[tid] = "parche" if resultado == "subido" else "devolver"
                nota = ("traída de Cloudroom por diff-patch (%s)" % f["rama_pedida"]) if resultado == "subido" else "el hilo de Cloudroom terminó sin cambios"
        elif acciones[tid] == FALLO_MEDIO:
            nota = nota_medio
        elif acciones[tid] == "traer":
            nota = "traída de Cloudroom: el hilo empujó %s" % f["rama_pedida"]
        elif acciones[tid] == "devolver":
            nota = "devuelta de Cloudroom: sin rama tras %d h (hilo %s)" % ((ahora - _t(f)) // 3600, f["hilo"])
        elif acciones[tid] == "olvidar":
            finales[tid] = {"final": "olvidada", "t_final": ahora}
            continue
        else:
            continue
        cambios[tid] = {"estado": "pendiente", "medio": "", "nota": nota}
        finales[tid] = {"final": {"traer": "traida", "parche": "parche", FALLO_MEDIO: FALLO_MEDIO}.get(acciones[tid], "devuelta"),
                        "t_final": ahora}
    for tid in huer:
        cambios.setdefault(tid, {"estado": "pendiente", "medio": "", "nota": "devuelta: prestada a Cloudroom sin hilo en el registro"})
    if cambios:
        _devolver(cambios)
    # (CRM1024K) Lo que se vio del hilo en esta pasada: lo lee el medidor «Agentes» de Genesis para no
    # pintar «escribiendo» un hilo parado (basta de ilusiones).
    for f in filas:
        tid = str(f["tarea"])
        if hilos is not None and "final" not in finales.get(tid, {}):
            visto = "trabajando" if acciones[tid] == "reanudar" else estado_hilo(hilos.get(str(f["hilo"])))
            finales.setdefault(tid, {})["visto"] = {"estado": visto, "t": ahora, "corte": cortes.get(tid, "") if visto == "terminado" else ""}
    if finales:
        abiertos_ids = {(str(f["tarea"]), str(f["hilo"])) for f in filas}

        def cerrar(reg):
            for x in reg:
                if isinstance(x, dict) and (str(x.get("tarea")), str(x.get("hilo"))) in abiertos_ids:
                    x.update(finales.get(str(x["tarea"]), {}))
        _registrar(cerrar)
    if any(a in ("traer", "parche") for a in acciones.values()) and traer:
        traer()
    return res


def main(argv):
    uso = "uso: cloudroom_lanzar.py lanzar --ids A,B [--seco] [--json] | seguir [--seco] [--json]"
    if argv[:1] == ["lanzar"]:
        ids = ids_argumento(argv[1:])
        if not ids:
            raise SystemExit(uso)
        r = lanzar(ids, seco="--seco" in argv)
        texto = ("lanzadas: %s · quedan %s del ciclo" % (", ".join("%s (%s)" % (t, r["modelos"].get(t, "?")) for t in r["lanzadas"]),
                                                         r["quedan"])
                 if r["lanzadas"] else r["motivo"]) + "".join("\n· " + e for e in r["errores"])
    elif argv[:1] == ["seguir"]:
        r = seguir(aplicar="--seco" not in argv)
        texto = "\n".join(["%-9s %s" % (a, t) for t, a in sorted(r["acciones"].items())] + ["· " + e for e in r["errores"]])
    else:
        raise SystemExit(uso)
    print(json.dumps(r, ensure_ascii=False) if "--json" in argv else (texto or "nada que seguir"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
