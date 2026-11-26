# -*- coding: utf-8 -*-
"""Director presidente del Chat Director de Genesis (DIR1111G).

Alex (2026-11-11): «un canal principal, el Director presidente, que se autoenrute entre
modelos, contigo [Claude] así como con Hermes y otros medios y proveedores… el que debe
responder lo principal de los chats de dirección».

El cartero (`cartero_director.py`) llama a `atender` por cada mensaje con entrega
pendiente en el canal «director-presidente». Aquí se decide QUIÉN contesta, sin listas
nuevas de modelos: se reutiliza lo que Genesis ya tiene.

  1. Claude Opus 5.5 en la Mac (`claude -p`, el motor de «claude-mac»), solo si sus límites
     lo permiten: lectura reciente de `limites_claude.py` sin la sesión ni la semana en
     «peligro», y el tope diario de Opus del cartero sin agotar.
  2. Hermes (`hermes -z`), que ya se autoenruta por los proveedores gratuitos vivos
     (`enrutar-hermes.py` ordena su cadena con el informe de pasarelas).
  3. Antigravity (`agy`, GEM1118A), con la sesión de la cuenta de Google de Alex: cuota de
     Antigravity, sin clave de API. Si el binario no existe, se salta.
  4. ChatGPT por Codex (`codex exec`), si está instalado.

Si el primero no está o falla, se prueba el siguiente y la respuesta dice por qué. Si
nadie puede, el mensaje queda EN COLA (entrega «pendiente» con su detalle visible) y se
reintenta solo; nunca se tira ni se contesta con una frase hecha.

PET1112I: Cuando llega un encargo del A1 (tipo `mg_aviso` de `peticiones-a1`), el Director
presidente revisa el plan y puede devolver un plan mejorado (mismo esquema JSON), que el
A1 aplica a los frentes que aún no empezaron. Los entregables 2D/3D (Blender, HyperFrames)
se atienden en la Mac; sin la Mac, quedan en el panel del A1.

Todo lo que toca el mundo (ejecutar órdenes, leer límites, ver si hay CLI) se inyecta:
las pruebas usan falsos y carpetas temporales.
"""

import json
import os
import shutil
import sys
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import director_chat
import hermes_job
import motores_director
import presidente_config

# CTX1118A: tope de contexto para el presidente (importado de cartero_director)
try:
    import cartero_director
    TOPE_CONTEXTO_PRESIDENTE = cartero_director.TOPE_CONTEXTO_PRESIDENTE
except Exception:
    TOPE_CONTEXTO_PRESIDENTE = 16000

#: Mismo orden e ids que `PROVEEDORES_PRESIDENTE` de `src/lib/mando/chat-director-tipos.ts`.
PROVEEDORES = ("claude", "hermes", "agy", "chatgpt")
NOMBRES = {"claude": "Claude", "hermes": "Hermes", "agy": "Antigravity", "chatgpt": "ChatGPT"}
MODELOS = {
    "claude": "claude-mac/" + motores_director.MODELO_DIRECTOR,
    "hermes": "hermes/predeterminado",
    "agy": "agy/" + motores_director.MODELO_AGY,
    "chatgpt": "codex/gpt-5-codex",
}
CANAL = "director-presidente"
REINTENTO_COLA_S = 120  # primer reintento; los siguientes crecen (DIR1111N)
#: DIR1111N · intervalos entre reintentos de un mensaje que nadie puede contestar: crecen y se paran en
#: el techo (15 min). Una señal de que un proveedor volvió (lectura nueva de límites, una respuesta de
#: cualquier proveedor, la sesión de Hermes reabierta) adelanta el reintento y reinicia la cuenta.
INTERVALOS_COLA_S = (120, 240, 480, 900)
#: DIR1118T · timeouts crecientes para llamadas a proveedores en reintentos de cola: 120s, 300s, 600s (máx).
TIMEOUTS_REINTENTO_PROVEEDOR = (120, 300, 600)
ENFRIAMIENTO_S = 600
MAX_COLA = 200
RAIZ = Path(__file__).resolve().parent.parent.parent

#: Lo que Hermes escribe cuando NINGÚN proveedor de su cadena contestó: no es una respuesta.
_FALLOS_HERMES = motores_director._FALLOS_HERMES
#: HER1111K · tope del prompt de una sesión nueva de Hermes (caracteres) y aviso de pausa repetido a diario.
TOPE_PROMPT_FRESCO = 24000
REAVISO_PAUSA_S = 24 * 3600

# ── Tipos de evento del bus (relevo_eventos) ──────────────────────────────────────
# Deben coincidir con peticiones_direccion.py
T_AVISO = "mg_aviso"
T_PLAN_DIR = "mg_plan_direccion"
T_AVANCE_DIR = "mg_avance_direccion"
T_ENTREGABLE_2D3D = "mg_entregable_2d3d"


# ── Qué cuenta como dirección (igual que `esDireccion` de chat-director-feed.ts) ──────

def es_director_de_conversacion(de):
    q = (de or "").lower()
    return q in ("director-presidente", "hermes", "chatgpt", "codex", "antigravity") or q.startswith("claude")


def es_direccion(r, por_id=None):
    """PURA. ¿El registro es conversación de dirección (no rutina del enjambre)?"""
    if not isinstance(r, dict) or r.get("tipo") == "entrega":
        return False
    if r.get("rol") == "alex":
        return True
    if r.get("canal") == CANAL or r.get("sintesis") is True:
        return True
    if r.get("tipo") in ("uso", "actualizacion"):
        return False
    original = (por_id or {}).get(r.get("respondeA")) if r.get("respondeA") else None
    if r.get("tipo") == "respuesta" and original and original.get("rol") != "alex":
        return False
    if es_director_de_conversacion(r.get("de")):
        return True
    return r.get("tipo") == "respuesta" and r.get("rol") == "director" and bool(original) \
        and original.get("rol") == "alex"


def hilo_direccion(registros, excluir_id=None, maximo=20):
    """PURA. Los últimos `maximo` mensajes de dirección (sin el que se contesta)."""
    por_id = {r.get("id"): r for r in registros if isinstance(r, dict) and r.get("id")}
    hilo = [r for r in registros if r.get("id") != excluir_id and es_direccion(r, por_id)]
    hilo.sort(key=director_chat._epoch_de)
    return hilo[-maximo:]


#: (DIR1121E) Lo que la dirección puede HACER, dicho en su propio prompt: antes contestaba «no tengo terminal».
PUEDES_ACTUAR = (
    "Puedes actuar, no solo leer: con las herramientas `starseed-director` lees y escribes el Chat Director y vetas o "
    "pausas la publicación; y en la terminal puedes ejecutar las órdenes de MetaGenesis: "
    "`python3 scripts/puente/director_chat.py`, `sincronizador_direccion.py publicar-canal` (los tres canales), "
    "`buscar_capacidad.py`, `repartir-a-nube.py`, `nube-gh.py lanzar`, `director_pruebas.py`, "
    "`antigravity_flota.py modelos|uso|papel`, `archivar_worktrees.py`, `starseed-relevo`, `starseed-enjambre.py --cola`, "
    "`git status|log|diff|show` y `launchctl list`. Comprueba antes de afirmar (por ejemplo `claude auth status` no hace "
    "falta: si estás respondiendo con Claude, hay sesión). No editas archivos, no publicas fuera de las puertas, no "
    "tocas claves ni el A1 y no quitas una pausa de publicación. Si en este motor falta una herramienta, dilo en una "
    "línea y sigue con las que tengas."
    # (DIR1125R) Alex, 25-11: las pruebas se llevan desde este canal. Órdenes exactas para no preguntar lo comprobable.
    " PRUEBAS EN APARATOS (las conduces tú desde este canal): plan en starseed_memory_root/pruebas/plan-activo.md; "
    "estado de un arreglo: `python3 -c \"import json;p=json.load(open('starseed_memory_root/olas/progreso.json'));print(p.get('<ID>'))\"` y "
    "`git log --oneline origin/main | grep <ID>`; pedir la compilación de prueba: `python3 scripts/puente/director_pruebas.py "
    "pedir compilar --sha <sha de origin/main> --quien director-presidente --nota \"<qué arregla>\"`; conducir: "
    "`python3 scripts/puente/pruebas_malla.py listar|siguiente|empezar|recoger|evaluar|cerrar|informe`; registros de los "
    "tres aparatos de una prueba (Mac, Maggabox y tableta): `python3 scripts/puente/pruebas_malla.py recoger <id> "
    "[--captura]` (tú no usas ssh directo: está vetado); el CI: `gh run list -L 5` y `gh run view <id> --log-failed`; "
    "avisar a Alex (canal principal y Telegram a la vez, sin A1 "
    "ni otra cuenta): `python3 scripts/puente/sincronizador_direccion.py publicar-canal --canal principal --de "
    "\"Director presidente (MetaGenesis)\" --origen metagenesis --texto \"…\"`. Lo que puedas comprobar, compruébalo y di "
    "lo que viste; no preguntes si debes comprobarlo. Solo Alex enciende permisos, acepta en sus aparatos e instala."
)


#: (DIR1125R) Nombre del motor que de verdad contesta, para que el presidente no se confunda con las notas del hilo.
NOMBRES_MOTOR = {"claude": "Claude en la Mac (claude -p)", "hermes": "Hermes", "agy": "Antigravity (Gemini)",
                 "chatgpt": "ChatGPT por Codex"}


def marcar_motor(prompt, motor):
    """PURA (DIR1125R). Antepone quién está sirviendo al presidente. Las notas firmadas «Dirección presidente
    (Claude Cowork)» del hilo son de otra sesión: antes el presidente servido por Hermes decía ser Claude en Cowork."""
    nombre = NOMBRES_MOTOR.get(str(motor or ""), str(motor or "otro motor"))
    return ("Te está sirviendo ahora: %s. Las notas del hilo firmadas «Dirección presidente (Claude Cowork)» son de "
            "la sesión de Claude en Cowork, no tuyas; si te preguntan qué motor eres, di este.\n\n" % nombre) + (prompt or "")


def prompt_presidente(pregunta, hilo, contexto="", rol_texto=None):
    """PURA. El prompt del presidente: reglas, contexto del proyecto y el hilo de dirección."""
    partes = [
        rol_texto or "Eres el Director presidente de Genesis (StarSeed OS): la voz principal de la "
        "dirección. Responde en español, claro y breve, con la síntesis de lo que han dicho "
        "los demás directores cuando venga al caso.",
        "Reglas: no escribes código (lo escribe el enjambre tarea a tarea); propones olas, "
        "verificas puertas y decides rumbo. Si no sabes algo, dilo.",
        PUEDES_ACTUAR,
    ]
    if contexto:
        partes.append("Contexto del proyecto:\n" + contexto[:TOPE_CONTEXTO_PRESIDENTE])
    if hilo:
        lineas = []
        for r in hilo:
            quien = "Alex" if r.get("rol") == "alex" else (r.get("de") or "director")
            marca = " (síntesis)" if r.get("sintesis") else ""
            tipo = r.get("tipo") or "mensaje"
            lineas.append("[%s · %s%s] %s" % (quien, tipo, marca, (r.get("texto") or "")[:1500]))
        partes.append("Hilo de dirección (lo más reciente al final):\n" + "\n".join(lineas))
    partes.append("Mensaje de Alex al Director presidente: " + (pregunta or ""))
    return "\n\n".join(partes)


def prompt_sesion_fresca(pregunta, hilo, contexto="", rol_texto=None, tope=TOPE_PROMPT_FRESCO):
    """PURA. (HER1111K) Prompt para una sesión NUEVA de Hermes: no recuerda nada, así que lleva el
    mismo contexto y el mismo hilo de dirección que se le daría al presidente, acotado a `tope`
    caracteres (se descartan primero los mensajes más antiguos del hilo y luego se recorta el contexto)."""
    nota = ("Nota: esta es una sesión nueva de Hermes (la sesión de dirección está en pausa). No "
            "recuerdas la conversación: lo que sigue es el contexto y el hilo reciente.")
    hilo = list(hilo or [])
    contexto = contexto or ""
    while True:
        prompt = nota + "\n\n" + prompt_presidente(pregunta, hilo, contexto, rol_texto)
        exceso = len(prompt) - tope
        if exceso <= 0:
            return prompt
        if len(contexto) > 1500:  # primero el contexto del proyecto (el hilo vale más)
            contexto = contexto[: max(1500, len(contexto) - exceso)]
        elif hilo:
            hilo = hilo[1:]
        elif contexto:
            contexto = ""
        else:
            return prompt[:tope]


# ── Quién puede contestar ahora ──────────────────────────────────────────────────

def _hoy(ahora):
    return datetime.fromtimestamp(ahora, timezone.utc).astimezone().strftime("%Y-%m-%d")


def _horas(minutos):
    if minutos is None:
        return "?"
    if minutos >= 48 * 60:
        return "%d días" % round(minutos / 1440)
    if minutos >= 120:
        return "%d h" % round(minutos / 60)
    return "%d min" % round(minutos)


def disponibilidad_claude(datos_limites, ahora, opus_hoy, tope_opus):
    """PURA. (puede, motivo) de Claude según `limites_claude.estado` y el tope diario de Opus."""
    import limites_claude  # noqa: PLC0415 — mismo directorio

    if opus_hoy >= tope_opus:
        return False, "tope de Opus del día alcanzado (%d de %d)" % (opus_hoy, tope_opus)
    if not isinstance(datos_limites, dict) or not datos_limites.get("lecturas"):
        return False, "no hay lecturas de sus límites (limites_claude.py declarar)"
    est = limites_claude.estado(datos_limites, datetime.fromtimestamp(ahora, timezone.utc))
    if est.get("desactualizada"):
        return False, "su última lectura de límites es de hace %s; sin lectura no se arriesga" % _horas(
            est.get("lectura_hace_min"))
    for campo, nombre in (("sesion", "sesión"), ("semana", "semana")):
        v = est.get(campo) or {}
        if v.get("tono") == "peligro":
            pct = v.get("pct")
            return False, "límite de la %s al %s %%" % (nombre, "?" if pct is None else int(round(pct)))
    return True, ""


def ordenar(disponibilidad, enfriados, ahora):
    """PURA. Orden de intento y descartes.

    `disponibilidad`: {proveedor: (puede, motivo)}; `enfriados`: {proveedor: {hasta, motivo}}
    (los que fallaron hace poco). Devuelve (candidatos, [(proveedor, motivo), …]).
    """
    candidatos, descartes = [], []
    for p in PROVEEDORES:
        puede, motivo = disponibilidad.get(p, (False, "no configurado"))
        frio = (enfriados or {}).get(p) or {}
        if not puede:
            descartes.append((p, motivo or "no disponible"))
        elif float(frio.get("hasta") or 0) > ahora:
            descartes.append((p, "falló hace poco (%s)" % (frio.get("motivo") or "sin detalle")))
        else:
            candidatos.append(p)
    return candidatos, descartes


def texto_descartes(descartes):
    """PURA. «Claude: …; Hermes: …» para la respuesta o el detalle de la cola."""
    return "; ".join("%s: %s" % (NOMBRES.get(p, p), m) for p, m in descartes)


def intervalo_cola(intentos):
    """PURA. Segundos hasta el siguiente reintento tras `intentos` intentos fallidos (≥ 1)."""
    i = max(1, int(intentos or 1)) - 1
    return INTERVALOS_COLA_S[min(i, len(INTERVALOS_COLA_S) - 1)]


def _en_min(segundos):
    m = max(1, int(round(segundos / 60.0)))
    return "%d min" % m


def _timeout_reintento(intentos, timeouts=None):
    """PURA. Timeout en segundos para la llamada a proveedor en el intento `intentos` (≥ 1)."""
    serie = tuple(timeouts) if timeouts else TIMEOUTS_REINTENTO_PROVEEDOR
    i = max(1, int(intentos or 1)) - 1
    return serie[min(i, len(serie) - 1)]


def detalle_cola(descartes, intentos=1, proximo=None, ahora=None):
    """El motivo visible de «En cola»: quién no pudo y por qué, cuántos intentos y cuándo es el siguiente."""
    base = "En cola: ningún director puede contestar ahora (%s)." % (texto_descartes(descartes) or "sin proveedores")
    if proximo is None:
        return base + " Se reintenta solo."
    espera = intervalo_cola(intentos)
    timeout_prov = _timeout_reintento(intentos)
    return "%s Intento %d (reintento con %d s); el siguiente hacia las %s (en %s), cada vez más espaciado hasta %s. " \
           "Si un director vuelve antes, se contesta en cuanto se note." % (
                base, intentos, timeout_prov, _hora_corta(proximo), _en_min(espera), _en_min(INTERVALOS_COLA_S[-1]))


def _hora_corta(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).astimezone().strftime("%H:%M")


def huella_proveedores(datos_limites, sesion_hermes):
    """PURA. Lo que cambia cuando un proveedor puede haber vuelto: la última lectura de límites de Claude y
    la sesión de dirección de Hermes. Si cambia, un mensaje en cola se reintenta sin esperar."""
    lecturas = (datos_limites or {}).get("lecturas") if isinstance(datos_limites, dict) else None
    ultima = lecturas[-1].get("t") if lecturas and isinstance(lecturas[-1], dict) else None
    return "%s|%s" % (ultima or "", sesion_hermes or "")


def despertar_cola(estado, ahora=None):
    """Un proveedor contestó: los mensajes en cola se reintentan ya, sin esperar su intervalo."""
    ahora = time.time() if ahora is None else ahora
    estado.setdefault("presidente", {})["despertar"] = ahora


# ── Llamadas (con `correr` inyectado) ────────────────────────────────────────────

def _llamar_claude(prompt, correr, segundos=None):
    segundos = int(segundos or motores_director.SEGUNDOS_PROVEEDOR_PRESIDENTE)
    rc, salida = correr(
        motores_director.orden_claude(prompt, motores_director.MODELO_DIRECTOR, None),
        env=motores_director.entorno_sin_claves_api(os.environ),
        cwd=str(RAIZ),
        segundos=segundos,
    )
    if "Credit balance is too low" in (salida or ""):
        return None, "la cuenta de Claude Code no tiene saldo", {}
    lectura = motores_director.leer_claude(salida)
    if lectura.get("error") or not lectura.get("texto"):
        return None, director_chat.tachar((lectura.get("error") or salida or "sin salida")[:200]), {}
    uso = {"tokensEntrada": lectura["tokens_entrada"], "tokensSalida": lectura["tokens_salida"],
           "coste": lectura["coste"]}
    return lectura["texto"].strip(), "", uso


def _ejecutar_hermes(correr, segundos=None):
    """`ejecutar(prompt, sesion) -> (rc, salida, uso)` con el archivo de uso temporal de Hermes."""
    segundos = int(segundos or motores_director.SEGUNDOS_PROVEEDOR_PRESIDENTE)
    import json  # noqa: PLC0415

    def ejecutar(prompt, sesion):
        with tempfile.NamedTemporaryFile(mode="r", suffix=".json", delete=False, encoding="utf-8") as f:
            archivo_uso = f.name
        try:
            rc, salida = correr(motores_director.orden_hermes(prompt, None, archivo_uso, sesion), segundos=segundos)
            try:
                datos = json.loads(Path(archivo_uso).read_text(encoding="utf-8"))
            except (OSError, ValueError):
                datos = {}
        finally:
            try:
                os.unlink(archivo_uso)
            except OSError:
                pass
        return rc, salida, datos

    return ejecutar


def _llamar_hermes(prompt, correr, sesion=None, prompt_fresco=None, info=None, segundos=None):
    """(HER1111K) Con `sesion` en pausa o colgada por historial gigante, reintenta en sesión nueva con `prompt_fresco()`.
    `info` (dict) recibe {"pausa": …, "fresca": bool} para que `atender` avise y atribuya."""
    ejec = _ejecutar_hermes(correr, segundos=segundos)
    res = motores_director.hermes_con_pausa(ejec, prompt, prompt_fresco or (lambda: prompt), sesion)
    rc, datos = res["rc"], res["uso"] or {}
    texto = (res["salida"] or "").strip()
    if sesion and not res["pausa"] and ((rc != 0 and not texto) or motores_director.es_fallo_hermes(texto)):
        rc2, texto2, datos2 = ejec(prompt_fresco() if prompt_fresco else prompt, None)
        texto2_l = (texto2 or "").strip()
        if rc2 == 0 and texto2_l and not motores_director.es_fallo_hermes(texto2_l) and not motores_director.es_pausa_hermes(rc2, texto2_l):
            res = {"rc": rc2, "salida": texto2_l, "uso": datos2, "pausa": None, "fresca": True}
            rc, datos, texto = rc2, datos2 or {}, texto2_l
    if info is not None:
        info["pausa"], info["fresca"] = res["pausa"], res["fresca"]
    if res["pausa"] and not res["fresca"]:
        return None, "la sesión de dirección de Hermes está en pausa y la sesión nueva tampoco contestó", {}
    if (rc != 0 and not texto) or not texto or motores_director.es_fallo_hermes(texto):
        return None, director_chat.tachar((texto or "sin salida (rc=%s)" % rc)[:200]), {}
    uso = {"tokensEntrada": datos.get("input_tokens", 0), "tokensSalida": datos.get("output_tokens", 0),
           "coste": datos.get("cost_usd", 0.0)}
    return texto, "", uso


def _llamar_hermes_background(prompt, correr, raiz, sesion_hermes=None, modelo=None,
                               callback_aviso=None, segundos=hermes_job.SEGUNDOS_JOB_FONDO):
    """Lanza Hermes como job en background para tareas largas (>120s).

    Publica aviso "en curso" al iniciar y el resultado al terminar.
    Devuelve (job_id, hilo) para que el llamador pueda esperar si quiere.

    Args:
        prompt: Prompt para Hermes.
        correr: Función para ejecutar órdenes.
        raiz: Raíz del repo (para director_chat.publicar).
        sesion_hermes: Sesión opcional de Hermes.
        modelo: Modelo opcional para Hermes.
        callback_aviso: Callback para avisos adicionales.
        segundos: Timeout en segundos (default 600s).

    Returns:
        (job_id, hilo) del job lanzado.
    """
    estado = {"hermes_jobs": {}}
    job_id = hermes_job.crear_job(prompt, estado)

    def _callback(msg):
        director_chat.publicar(
            msg, de=CANAL, rol="director", tipo="aviso", canal=CANAL,
            modelo=f"hermes/job-{job_id[:8]}", raiz=raiz, sintesis=True,
        )
        if callback_aviso:
            try:
                callback_aviso(msg)
            except Exception:
                pass

    hilo = hermes_job.lanzar_job(
        job_id, estado, correr, modelo=modelo, sesion=sesion_hermes,
        segundos=segundos, callback_progreso=_callback,
    )

    # Esperar a que termine y publicar resultado
    def _esperar_y_publicar():
        hilo.join()
        job = hermes_job.obtener_estado(job_id, estado)
        if job and job["estado"] == "completado":
            director_chat.publicar(
                job["resultado"], de=CANAL, rol="director", tipo="respuesta",
                canal=CANAL, modelo=f"hermes/job-{job_id[:8]}", raiz=raiz,
                sintesis=True, uso={"via": "hermes-background-job"},
            )
        elif job and job["estado"] == "error":
            director_chat.publicar(
                f"Job Hermes falló: {job.get('error', 'desconocido')}",
                de=CANAL, rol="director", tipo="aviso", canal=CANAL,
                modelo=f"hermes/job-{job_id[:8]}", raiz=raiz, sintesis=True,
            )

    hilo_publicar = threading.Thread(target=_esperar_y_publicar, daemon=True)
    hilo_publicar.start()

    return job_id, hilo


def _llamar_agy(prompt, correr, plan=False, segundos=None):
    """GEM1118A. Antigravity (`agy`) con la sesión de Google de Alex.

    Sin `SIN_ENTRADA` (stdin DEVNULL) agy espera a que alguien escriba y se cuelga. El prompt
    largo o de plan usa el modelo de plan. Toda salida que no sea una respuesta (vacía, cuota,
    sesión, tiempo agotado) es un fallo: nunca se publica un error como respuesta.
    """
    modelo = motores_director.MODELO_AGY_PLAN if plan or len(prompt or "") > motores_director.TOPE_PROMPT_AGY \
        else motores_director.MODELO_AGY
    tope = int(segundos or motores_director.SEGUNDOS_AGY)
    rc, salida = correr(
        motores_director.orden_agy(prompt, modelo, segundos=tope),
        entrada=motores_director.SIN_ENTRADA,
        cwd=str(RAIZ),
        segundos=tope,
    )
    lectura = motores_director.leer_agy(salida, rc)
    if lectura.get("error") or not lectura.get("texto"):
        motivo = lectura.get("error") or salida or "sin salida (rc=%s)" % rc
        return None, director_chat.tachar(str(motivo)[:200]), {}
    uso = {"tokensEntrada": lectura["tokens_entrada"], "tokensSalida": lectura["tokens_salida"],
           "coste": 0.0, "modelo": lectura.get("modelo") or modelo}
    return lectura["texto"].strip(), "", uso


def _llamar_chatgpt(prompt, correr, segundos=None):
    tope = int(segundos or motores_director.SEGUNDOS_PROVEEDOR_PRESIDENTE)
    rc, salida = correr(motores_director.orden_codex("gpt-5-codex", str(RAIZ)), entrada=prompt,
                        segundos=tope)
    texto = (salida or "").strip()
    if rc != 0 or not texto:
        return None, director_chat.tachar((texto or "sin salida (rc=%s)" % rc)[:200]), {}
    return texto, "", {}


def _cargar_entorno_flota():
    """Lee variables de ~/.starseed/env y ~/.hermes/.env solo en memoria (sin imprimir nunca)."""
    ent = dict(os.environ)
    for ruta in ("~/.starseed/env", "~/.hermes/.env"):
        p = Path(os.path.expanduser(ruta))
        if not p.exists():
            continue
        try:
            for linea in p.read_text(encoding="utf-8").splitlines():
                l = linea.strip()
                if l.startswith("export "):
                    l = l[7:].strip()
                if not l or l.startswith("#") or "=" not in l:
                    continue
                k, v = l.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k and v and not ent.get(k):
                    ent[k] = v
        except OSError:
            pass
    return ent


def _llamar_flota_gratis(prompt, timeout=45, informe_ruta=None):
    """Respaldo HTTP rápido usando solo pasarelas gratuitas vivas de `~/.starseed/pasarelas-informe.json`."""
    import urllib.request

    ruta_inf = Path(informe_ruta or os.path.expanduser("~/.starseed/pasarelas-informe.json"))
    candidatos = []
    try:
        datos = json.loads(ruta_inf.read_text(encoding="utf-8"))
        for p in datos.get("pasarelas") or []:
            if p.get("estado") == "escribe":
                candidatos.append((str(p.get("clave") or ""), str(p.get("modelo") or "")))
    except (OSError, ValueError):
        pass
    if not candidatos:
        candidatos = [("freellmapi", "auto"), ("google", "gemini-3.5-flash-lite"), ("groq", "openai/gpt-oss-20b")]

    prioridad = {"google": 0, "groq": 1, "nvidia": 2, "freellmapi": 3, "openrouter": 4, "neurona": 9}
    candidatos.sort(key=lambda c: prioridad.get(c[0], 5))
    ent = _cargar_entorno_flota()
    tope_por_intento = max(8, min(15, int(timeout)))

    for clave, modelo in candidatos:
        try:
            t0 = time.time()
            if clave == "google":
                api_key = ent.get("GEMINI_API_KEY") or ent.get("GOOGLE_API_KEY")
                if not api_key:
                    continue
                mod = modelo or "gemini-3.5-flash-lite"
                url = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s" % (mod, api_key)
                cuerpo = json.dumps({"contents": [{"role": "user", "parts": [{"text": prompt[:24000]}]}],
                                     "generationConfig": {"temperature": 0.3, "maxOutputTokens": 1200}}).encode("utf-8")
                req = urllib.request.Request(url, data=cuerpo, headers={"Content-Type": "application/json"}, method="POST")
                with urllib.request.urlopen(req, timeout=tope_por_intento) as resp:
                    d = json.loads(resp.read().decode("utf-8"))
                partes = (((d.get("candidates") or [{}])[0].get("content") or {}).get("parts") or [])
                txt = "".join(str(x.get("text") or "") for x in partes).strip()
                if txt:
                    return txt, "", {"provider": "google", "model": mod, "via": "flota-gratis-http", "segundos": round(time.time() - t0, 1)}
                continue

            if clave == "freellmapi":
                url = (ent.get("STARSEED_PASARELA_FREELLMAPI_URL") or "http://127.0.0.1:3001/v1").rstrip("/") + "/chat/completions"
                api_key = ent.get("STARSEED_PASARELA_FREELLMAPI_KEY") or ent.get("FREELLMAPI_KEY") or "sin-clave"
                mod = modelo or "auto"
            elif clave == "groq":
                url = "https://api.groq.com/openai/v1/chat/completions"
                api_key = ent.get("GROQ_API_KEY")
                mod = modelo or "openai/gpt-oss-20b"
            elif clave == "nvidia":
                url = "https://integrate.api.nvidia.com/v1/chat/completions"
                api_key = ent.get("NVIDIA_API_KEY")
                mod = modelo or "moonshotai/kimi-k3"
            elif clave == "neurona":
                url = "http://127.0.0.1:11434/v1/chat/completions"
                api_key = "ollama"
                mod = modelo or "qwen2.5:0.5b"
            elif clave == "openrouter" and str(modelo).endswith(":free"):
                url = "https://openrouter.ai/api/v1/chat/completions"
                api_key = ent.get("OPENROUTER_API_KEY")
                mod = modelo
            else:
                continue

            if not api_key:
                continue
            payload = {
                "model": mod,
                "messages": [{"role": "user", "content": prompt[:18000]}],
                "temperature": 0.3,
                "max_tokens": 1200,
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json", "Authorization": "Bearer %s" % api_key},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=tope_por_intento) as resp:
                d = json.loads(resp.read().decode("utf-8"))
            txt = ((((d.get("choices") or [{}])[0]).get("message") or {}).get("content") or "").strip()
            if txt and not (len(txt) < 400 and "free resources" in txt.lower()):
                return txt, "", {"provider": clave, "model": mod, "via": "flota-gratis-http", "segundos": round(time.time() - t0, 1)}
        except Exception:
            continue
    return None, "ninguna pasarela HTTP gratuita respondió", {}


# ── HER1111K · avisos de la sesión de Hermes en pausa ────────────────────────────

def _hora_local(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M")


def texto_aviso_pausa(sesion, desde):
    """PURA. El aviso para Alex: qué sesión, desde cuándo, qué significa, qué hace Genesis, cómo se reabre."""
    return (
        "La sesión de dirección de Hermes (%s) está en pausa, detectada el %s. Hermes la bloqueó porque no "
        "pudo confirmar cómo terminó su último turno (suele pasar si se reinicia a mitad de turno) y no la "
        "usa hasta que una persona lo confirme; el mensaje que llegue a esa sesión no se envía. Mientras "
        "tanto Genesis sigue contestando desde sesiones nuevas de Hermes, con el hilo de dirección como "
        "contexto, y cada respuesta lo dice. Para reabrirla, en la Mac: %s (descarta ese turno perdido; "
        "no se repite). Al siguiente mensaje Genesis vuelve a ella solo y te lo dirá."
        % (sesion, _hora_local(desde), motores_director.orden_reabrir_hermes(sesion))
    )


def texto_aviso_recuperada(sesion):
    return ("La sesión de dirección de Hermes (%s) vuelve a estar abierta: Genesis ha vuelto a contestar "
            "desde ella." % sesion)


def _publicar_aviso(texto, raiz):
    director_chat.publicar(texto, de="cartero", rol="sistema", tipo="aviso", canal="mando", raiz=raiz)


def avisar_pausa_hermes(estado, pausa, raiz=None, ahora=None):
    """Avisa a Alex UNA vez por sesión en pausa (otra vez solo si pasa un día y sigue). Guarda en
    `estado["hermes_pausas"]` {sesión: {desde, avisado}}. Devuelve True si publicó el aviso."""
    ahora = time.time() if ahora is None else ahora
    sesion = (pausa or {}).get("sesion")
    if not sesion:
        return False
    pausas = estado.setdefault("hermes_pausas", {})
    reg = pausas.setdefault(sesion, {"desde": ahora, "avisado": 0})
    if reg.get("avisado") and ahora - float(reg["avisado"]) < REAVISO_PAUSA_S:
        return False
    try:
        _publicar_aviso(texto_aviso_pausa(sesion, float(reg.get("desde") or ahora)), raiz)
    except (OSError, ValueError):
        return False  # sin aviso publicado no se anota: se intenta en el siguiente mensaje
    reg["avisado"] = ahora
    return True


def hermes_reabierta(estado, sesion, raiz=None):
    """Si la sesión estaba anotada en pausa y ya contesta, lo dice UNA vez y borra la anotación."""
    pausas = (estado or {}).get("hermes_pausas")
    if not pausas or not sesion or sesion not in pausas:
        return False
    try:
        _publicar_aviso(texto_aviso_recuperada(sesion), raiz)
    except (OSError, ValueError):
        return False
    pausas.clear()  # otras anotaciones eran de sesiones que ya no son la de dirección
    return True


def descripcion_sesion_nueva(sesion_pausada):
    return "sesión nueva de Hermes: la de dirección%s está en pausa" % (
        " (%s)" % sesion_pausada if sesion_pausada else "")


def fuera_de_vista(estado, ids_vistos):
    """PURA. Mensajes en cola que ya no están en la ventana del cartero (para no perderlos)."""
    cola = ((estado or {}).get("presidente") or {}).get("cola") or {}
    vistos = set(ids_vistos or ())
    return [e["mensaje"] for i, e in cola.items()
            if i not in vistos and isinstance(e, dict) and isinstance(e.get("mensaje"), dict)]


# ── PET1112I: Manejo de encargos del A1 ──────────────────────────────────────────

def es_mensaje_encargo(mensaje: Dict[str, Any]) -> bool:
    """PURA. ¿Es un mensaje de aviso de encargo del A1 (peticiones-a1, tipo aviso)?"""
    return (mensaje.get("de") == "peticiones-a1"
            and mensaje.get("rol") == "sistema"
            and mensaje.get("tipo") == "aviso"
            and mensaje.get("canal") == CANAL)


def extraer_datos_encargo(mensaje: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """PURA. Extrae los datos del encargo del texto del mensaje (formato mg_aviso).
    
    El texto tiene formato: "Nuevo encargo ENC-1112-1430: «Título» · N frentes (F1 Nombre, F2 Nombre) · M entregables"
    """
    texto = mensaje.get("texto", "")
    if not texto.startswith("Nuevo encargo "):
        return None
    try:
        # Extraer ID del encargo
        partes = texto.split(": ", 1)
        enc_id = partes[0].replace("Nuevo encargo ", "").strip()
        resto = partes[1] if len(partes) > 1 else ""
        # Extraer título entre «»
        import re
        m_titulo = re.search(r"«([^»]+)»", resto)
        titulo = m_titulo.group(1) if m_titulo else ""
        # Extraer frentes
        m_frentes = re.search(r"· (\d+) frentes \(([^)]+)\)", resto)
        n_frentes = int(m_frentes.group(1)) if m_frentes else 0
        frentes_str = m_frentes.group(2) if m_frentes else ""
        # Extraer entregables
        m_entregables = re.search(r"· (\d+) entregables", resto)
        n_entregables = int(m_entregables.group(1)) if m_entregables else 0
        
        return {
            "encargo_id": enc_id,
            "titulo": titulo,
            "n_frentes": n_frentes,
            "frentes_str": frentes_str,
            "n_entregables": n_entregables,
            "tarea": mensaje.get("tarea", enc_id),
        }
    except (IndexError, ValueError, AttributeError):
        return None


def prompt_revisar_plan(encargo: Dict[str, Any], hilo: List[Dict[str, Any]], contexto: str = "") -> str:
    """PURA. Prompt para que el Director presidente revise y mejore el plan del encargo.
    
    El modelo debe responder SOLO con el JSON del plan mejorado (mismo esquema).
    """
    frentes_info = encargo.get("frentes_str", "")
    partes = [
        "Eres el Director presidente de Genesis (StarSeed OS).",
        "Recibes un nuevo encargo desde el A1 (Telegram) y debes revisar su plan.",
        "",
        f"Encargo: {encargo.get('encargo_id', '?')} — «{encargo.get('titulo', '?')}»",
        f"Frentes: {frentes_info or '?'}",
        f"Entregables totales: {encargo.get('n_entregables', '?')}",
        "",
        "Tu tarea: revisar el plan y devolver UN ÚNICO JSON con el plan mejorado.",
        "El JSON debe tener exactamente este esquema:",
        '{"frentes": [{"id": "F1", "nombre": "...", "destino": "fuentes|produccion",',
        ' "estado": "pendiente", "entregables": [',
        ' {"tipo": "informe|documento|video|blender|hyperframes|mind-map|audio|infographic",',
        '  "titulo": "...", "prompt": "..."}]}]}',
        "",
        "Reglas:",
        "• Solo devuelve el JSON, sin explicaciones ni markdown.",
        "• Mantén los mismos IDs de frentes si es posible.",
        "• Los entregables 2D/3D (blender, hyperframes, video, 3d) se hacen en la Mac.",
        "• No añadas frentes que no estén en el original salvo que sea claramente necesario.",
        "• Mejora prompts, añade entregables faltantes, corrige tipos.",
        "",
        "Contexto del proyecto:" + (contexto[:4000] if contexto else " (sin contexto adicional)"),
    ]
    if hilo:
        partes.append("Hilo de dirección reciente:")
        for r in hilo[-5:]:
            quien = "Alex" if r.get("rol") == "alex" else (r.get("de") or "director")
            partes.append(f"  [{quien}] {(r.get('texto') or '')[:200]}")
    partes.append("\nDevuelve SOLO el JSON del plan mejorado:")
    return "\n".join(partes)


def parsear_plan_mejorado(respuesta: str) -> Optional[Dict[str, Any]]:
    """PURA. Extrae y valida el JSON del plan mejorado de la respuesta del modelo."""
    respuesta = (respuesta or "").strip()
    # Buscar JSON entre llaves (puede venir con texto alrededor)
    inicio = respuesta.find("{")
    fin = respuesta.rfind("}")
    if inicio >= 0 and fin > inicio:
        json_str = respuesta[inicio:fin+1]
        try:
            plan = json.loads(json_str)
            if isinstance(plan, dict) and isinstance(plan.get("frentes"), list):
                return plan
        except json.JSONDecodeError:
            pass
    return None


def es_mensaje_entregable_2d3d(mensaje: Dict[str, Any]) -> bool:
    """PURA. ¿Es una solicitud de entregable 2D/3D para la Mac?"""
    return (mensaje.get("de") == "peticiones-a1"
            and mensaje.get("rol") == "sistema"
            and mensaje.get("tipo") == "aviso"
            and "Entregable 2D/3D para la Mac" in (mensaje.get("texto") or ""))


def prompt_entregable_2d3d(mensaje: Dict[str, Any], hilo: List[Dict[str, Any]], contexto: str = "") -> str:
    """PURA. Prompt para atender un entregable 2D/3D (Blender, HyperFrames) en la Mac."""
    texto = mensaje.get("texto", "")
    partes = [
        "Eres el Director presidente de Genesis (StarSeed OS) en la Mac.",
        "Recibes una solicitud de entregable 2D/3D (Blender, HyperFrames, video) para producir en esta Mac.",
        "",
        f"Solicitud: {texto}",
        "",
        "Responde confirmando que se atenderá en la Mac, o indica qué se necesita.",
        "Si necesitas más información del encargo, pídela.",
        "",
        "Contexto del proyecto:" + (contexto[:4000] if contexto else " (sin contexto adicional)"),
    ]
    if hilo:
        partes.append("Hilo de dirección reciente:")
        for r in hilo[-5:]:
            quien = "Alex" if r.get("rol") == "alex" else (r.get("de") or "director")
            partes.append(f"  [{quien}] {(r.get('texto') or '')[:200]}")
    return "\n".join(partes)


def existe_cli(nombre):
    """¿Está instalada la orden? (también en ~/.local/bin, donde vive Hermes)."""
    return bool(shutil.which(nombre)) or os.path.exists(os.path.expanduser("~/.local/bin/" + nombre))


def leer_limites():
    import limites_claude  # noqa: PLC0415

    return limites_claude.leer()


def _ordenar_con_config(disponibilidad, enfriados, ahora, orden_cfg=None, activos_cfg=None):
    """PURA. Respeta orden y activación configurados manteniendo orden único sin duplicados."""
    orden = list(orden_cfg or PROVEEDORES)
    for p in PROVEEDORES:
        if p not in orden:
            orden.append(p)
    activos = dict(activos_cfg or {})
    candidatos, descartes = [], []
    for p in orden:
        if p not in PROVEEDORES:
            continue
        if activos and not activos.get(p, True):
            descartes.append((p, "desactivado en ajustes del Director presidente"))
            continue
        puede, motivo = disponibilidad.get(p, (False, "no configurado"))
        frio = (enfriados or {}).get(p) or {}
        if not puede:
            descartes.append((p, motivo or "no disponible"))
        elif float(frio.get("hasta") or 0) > ahora:
            descartes.append((p, "falló hace poco (%s)" % (frio.get("motivo") or "sin detalle")))
        else:
            candidatos.append(p)
    return candidatos, descartes


def _sincronizar_respuesta_unificada(texto, origen, cfg):
    """Sincroniza una breve copia al canal común cuando no estamos en pruebas."""
    if director_chat.en_pruebas():
        return
    if not ((cfg or {}).get("sincronizar_canales") or {}).get("telegram", True):
        return
    try:
        import puente  # noqa: PLC0415
        resumen = " ".join((texto or "").split())[:280]
        if resumen:
            puente.decir("[%s] %s" % (origen, resumen), quien="director-presidente", tipo="hecho")
    except Exception:
        pass


def atender(mensaje, estado, raiz=None, correr=None, existe=None, limites=None,
            contexto="", tope_opus=40, ahora=None, sesion_hermes=None, registros=None,
            config=None, llamar_flota=None):
    """Contesta un mensaje al presidente o lo deja en cola.

    Devuelve «respondido», «cola» (nadie pudo: queda pendiente con su detalle) o «espera»
    (sigue en cola y aún no toca reintentar). Nunca lanza por un proveedor caído.

    PET1112I: Si el mensaje es un encargo del A1 (peticiones-a1, tipo aviso),
    el Director presidente revisa el plan y devuelve un plan mejorado (JSON).
    Si es un entregable 2D/3D, confirma que se atenderá en la Mac.
    """
    correr = correr or motores_director.correr
    existe = existe or existe_cli
    ahora = time.time() if ahora is None else ahora
    if config is not None:
        cfg = config
    elif director_chat.en_pruebas():
        cfg = json.loads(json.dumps(presidente_config.DEFAULTS))
    else:
        cfg, _ = presidente_config.cargar()
    tope_opus_real = int(cfg.get("max_opus_dia") if cfg.get("max_opus_dia") is not None else tope_opus)
    if config is None and director_chat.en_pruebas():
        tope_opus_real = tope_opus

    datos_limites = leer_limites() if limites is None else limites
    pres = estado.setdefault("presidente", {})
    cola = pres.setdefault("cola", {})
    enfriados = pres.setdefault("enfriados", {})
    respondidos = pres.setdefault("respondidos", {})
    idm = mensaje["id"]

    # DIR1124A: Cerrojo por id de mensaje - si ya se respondió a este mensaje de Alex, no volver a contestar.
    if idm in respondidos:
        return "respondido"

    previo = cola.get(idm) or {}
    huella = huella_proveedores(datos_limites, sesion_hermes)
    if previo:
        # DIR1111N: en cola, se espera el intervalo… salvo que un proveedor haya podido volver.
        volvio = (huella != previo.get("huella", huella)
                  or float(pres.get("despertar") or 0) > float(previo.get("visto") or 0))
        if float(previo.get("proximo") or 0) > ahora and not volvio:
            return "espera"
        enfriados.clear()  # el reintento espaciado manda sobre el enfriamiento de 10 min
        if volvio:
            previo = dict(previo, intentos=0)

    intento_actual = int(previo.get("intentos") or 0) + 1
    timeout_actual = _timeout_reintento(intento_actual, cfg.get("timeouts_reintento_s"))

    if estado.get("opus_fecha") != _hoy(ahora):
        estado["opus_fecha"] = _hoy(ahora)
        estado["opus_hoy"] = 0
    disponibilidad = {
        "claude": disponibilidad_claude(datos_limites, ahora, int(estado.get("opus_hoy") or 0), tope_opus_real)
        if existe("claude") else (False, "la orden claude no está instalada"),
        "hermes": (True, "") if existe("hermes") else (False, "la orden hermes no está instalada"),
        "agy": (True, "") if existe("agy") else (False, "la orden agy no está instalada"),
        "chatgpt": (True, "") if existe("codex") else (False, "la orden codex no está instalada"),
    }
    candidatos, descartes = _ordenar_con_config(
        disponibilidad, enfriados, ahora,
        orden_cfg=cfg.get("orden_proveedores"),
        activos_cfg=cfg.get("proveedores_activos"),
    )

    if registros is None:
        registros = director_chat.leer(limite=200, raiz=raiz)
    hilo = hilo_direccion(registros, idm)

    # PET1112I: Detectar tipo de mensaje especial del A1
    es_encargo = es_mensaje_encargo(mensaje)
    es_2d3d = es_mensaje_entregable_2d3d(mensaje)
    datos_encargo = extraer_datos_encargo(mensaje) if es_encargo else None

    if es_encargo and datos_encargo:
        # Mensaje de nuevo encargo: revisar plan y devolver plan mejorado (JSON)
        prompt = prompt_revisar_plan(datos_encargo, hilo, contexto)
        # Solo Claude puede responder a esto (necesita razonamiento complejo y JSON válido)
        candidatos = [p for p in candidatos if p == "claude"]
        if not candidatos:
            # Si no hay Claude, dejar en cola con detalle específico
            descartes.append(("claude", "requerido para revisar planes (JSON)"))
    elif es_2d3d:
        # Entregable 2D/3D para la Mac: confirmar que se atiende
        prompt = prompt_entregable_2d3d(mensaje, hilo, contexto)
    else:
        # Mensaje normal: prompt estándar
        prompt = prompt_presidente(mensaje.get("texto", ""), hilo, contexto)

    for p in candidatos:
        inicio = time.time()
        info = {}
        try:
            if p == "claude":
                texto, motivo, uso = _llamar_claude(marcar_motor(prompt, "claude"), correr, segundos=timeout_actual)
            elif p == "hermes":
                texto, motivo, uso = _llamar_hermes(
                    marcar_motor(prompt, "hermes"), correr, sesion_hermes,
                    lambda: marcar_motor(prompt_sesion_fresca(mensaje.get("texto", ""), hilo, contexto), "hermes"), info,
                    segundos=timeout_actual)
                # HER1111K: aviso único de la pausa / de la vuelta a la sesión de dirección.
                if info.get("pausa"):
                    avisar_pausa_hermes(estado, info["pausa"], raiz=raiz, ahora=ahora)
                elif texto and sesion_hermes:
                    hermes_reabierta(estado, sesion_hermes, raiz=raiz)
            elif p == "agy":
                prompt_agy = (
                    "Modo headless sin permisos interactivos: responde directo en español usando el contexto "
                    "proporcionado o solo lectura; no ejecutes comandos interactivos.\n\n" + marcar_motor(prompt, "agy")
                )
                texto, motivo, uso = _llamar_agy(prompt_agy, correr, plan=es_encargo, segundos=timeout_actual)
            else:
                texto, motivo, uso = _llamar_chatgpt(marcar_motor(prompt, "chatgpt"), correr, segundos=timeout_actual)
        except OSError as e:
            texto, motivo, uso = None, "no se pudo lanzar: %s" % e, {}
        if not texto:
            enfriados[p] = {"hasta": ahora + ENFRIAMIENTO_S, "motivo": motivo}
            descartes.append((p, motivo))
            continue
        if p == "claude":
            estado["opus_hoy"] = int(estado.get("opus_hoy") or 0) + 1
        enfriados.pop(p, None)
        uso = dict(uso)
        uso["segundos"] = round(time.time() - inicio, 1)
        # GEM1118A: el medidor de motores anota «agy/<modelo real>», no solo el de por defecto.
        modelo_publicado = MODELOS[p]
        if p == "agy":
            modelo_publicado = "agy/" + str(uso.pop("modelo", None) or motores_director.MODELO_AGY)
        eleccion = {"proveedor": p, "modelo": modelo_publicado}

        # PET1112I: Para encargo, la respuesta es el plan mejorado (JSON)
        if es_encargo and datos_encargo:
            plan_mejorado = parsear_plan_mejorado(texto)
            if plan_mejorado:
                # Publicar el plan mejorado como respuesta estructurada
                eleccion["plan_mejorado"] = True
                eleccion["plan"] = plan_mejorado
                n_frentes = len(plan_mejorado.get("frentes", []))
                texto = f"Plan mejorado para {datos_encargo['encargo_id']}: {n_frentes} frentes actualizados"
            else:
                enfriados[p] = {"hasta": ahora + ENFRIAMIENTO_S, "motivo": "respuesta no es JSON válido"}
                descartes.append((p, "respuesta no es JSON válido"))
                continue

        if p == "hermes" and info.get("fresca"):
            eleccion["modelo"] = "%s (%s)" % (MODELOS[p], descripcion_sesion_nueva((info["pausa"] or {}).get("sesion")))
            eleccion["sesionNueva"] = True
            uso["via"] = "hermes-sesion-nueva"
        if descartes:
            eleccion["descartes"] = [{"proveedor": d, "motivo": m} for d, m in descartes]
        director_chat.publicar(
            texto, de=CANAL, rol="director", tipo="respuesta", canal=CANAL, modelo=modelo_publicado,
            responde_a=idm, uso=uso, raiz=raiz, sintesis=True, eleccion=eleccion,
        )
        director_chat.entrega(idm, CANAL, "respondido", raiz=raiz)
        cola.pop(idm, None)
        respondidos[idm] = ahora  # DIR1124A: marcar como respondido para cerrojo
        despertar_cola(estado, ahora)
        _sincronizar_respuesta_unificada(texto, modelo_publicado, cfg)
        return "respondido"

    # Respaldo automático con Flota Gratuita HTTP (solo en ejecución real o si se inyecta `llamar_flota`, y nunca para JSON de encargo)
    puede_flota = bool(cfg.get("respaldo_flota_gratis")) and not (es_encargo and datos_encargo)
    if puede_flota and (llamar_flota is not None or (not director_chat.en_pruebas() and raiz is None)):
        inicio_f = time.time()
        fn_flota = llamar_flota or (lambda pr: _llamar_flota_gratis(pr, timeout=min(timeout_actual, 45)))
        txt_f, mot_f, uso_f = fn_flota(prompt)
        if txt_f:
            prov_f = str((uso_f or {}).get("provider") or "flota")
            mod_f = str((uso_f or {}).get("model") or "auto")
            modelo_pub = "%s/%s" % (prov_f, mod_f)
            uso_f = dict(uso_f or {})
            uso_f.setdefault("segundos", round(time.time() - inicio_f, 1))
            eleccion = {"proveedor": "flota-gratis", "modelo": modelo_pub}
            if descartes:
                eleccion["descartes"] = [{"proveedor": d, "motivo": m} for d, m in descartes]
            director_chat.publicar(
                txt_f, de=CANAL, rol="director", tipo="respuesta", canal=CANAL, modelo=modelo_pub,
                responde_a=idm, uso=uso_f, raiz=raiz, sintesis=True, eleccion=eleccion,
            )
            director_chat.entrega(idm, CANAL, "respondido", raiz=raiz)
            cola.pop(idm, None)
            respondidos[idm] = ahora  # DIR1124A: marcar como respondido para cerrojo
            despertar_cola(estado, ahora)
            _sincronizar_respuesta_unificada(txt_f, modelo_pub, cfg)
            return "respondido"
        if mot_f:
            descartes.append(("flota-gratis", mot_f))

    intentos = intento_actual
    proximo = ahora + intervalo_cola(intentos)
    detalle = detalle_cola(descartes, intentos, proximo)
    if previo.get("detalle") != detalle:
        director_chat.entrega(idm, CANAL, "pendiente", detalle=detalle, raiz=raiz)
    # Se guarda el mensaje: si el chat avanza y sale de la ventana que lee el cartero, sigue en cola.
    cola[idm] = {"proximo": proximo, "detalle": detalle, "intentos": intentos, "huella": huella,
                 "visto": ahora, "desde": previo.get("desde") or ahora,
                 "mensaje": {k: mensaje[k] for k in ("id", "t", "de", "rol", "tipo", "texto", "canal",
                                                     "canales", "modelo") if k in mensaje}}
    if len(cola) > MAX_COLA:
        for viejo in sorted(cola, key=lambda k: cola[k].get("proximo", 0))[: len(cola) - MAX_COLA]:
            cola.pop(viejo, None)
    return "cola"


# Exportar funciones públicas (incluye PET1112I)
__all__ = [
    "PROVEEDORES", "NOMBRES", "MODELOS", "CANAL",
    "REINTENTO_COLA_S", "INTERVALOS_COLA_S", "ENFRIAMIENTO_S", "MAX_COLA",
    "es_director_de_conversacion", "es_direccion", "hilo_direccion",
    "prompt_presidente", "prompt_sesion_fresca",
    "disponibilidad_claude", "ordenar", "texto_descartes",
    "intervalo_cola", "detalle_cola", "huella_proveedores", "despertar_cola",
    "_llamar_claude", "_llamar_hermes", "_llamar_agy", "_llamar_chatgpt",
    "texto_aviso_pausa", "texto_aviso_recuperada", "avisar_pausa_hermes",
    "hermes_reabierta", "descripcion_sesion_nueva", "fuera_de_vista",
    "existe_cli", "leer_limites", "atender",
    # PET1112I
    "T_AVISO", "T_PLAN_DIR", "T_AVANCE_DIR", "T_ENTREGABLE_2D3D",
    "es_mensaje_encargo", "extraer_datos_encargo", "prompt_revisar_plan",
    "parsear_plan_mejorado", "es_mensaje_entregable_2d3d", "prompt_entregable_2d3d",
]
