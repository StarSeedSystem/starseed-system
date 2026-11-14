# -*- coding: utf-8 -*-
"""Director de pruebas: la lógica PURA (PRB1111W · contrato centro-versiones-1105.md §11).

Nada de aquí toca el disco, la red, el reloj ni un shell. `director_pruebas.py` reúne los hechos y actúa.
Petición = un archivo pequeño que escribe Genesis o la orden `pedir`; todo lo que llega se valida con un
conjunto cerrado de acciones y ningún texto de una petición llega jamás a un shell.
"""
import re
from datetime import datetime, timezone

import lanzamientos_logica as LL

ACCIONES = ("compilar", "cancelar", "reintentar", "republicar", "pedir-arreglo", "app-abrir",
            "ronda-iniciar", "ronda-terminar")      # RON1112C: la «ronda de aparatos» (ronda.py)
ACCIONES_RONDA = ("ronda-iniciar", "ronda-terminar")
# BAN1114C: «banco-serie» lanza la serie de llamadas automáticas (banco_llamadas.py; architecture/ronda-automatica-llamadas.md §1.2)
ACCIONES = ACCIONES + ("banco-serie",)
ESCENARIOS_BANCO = ("ble-video-2min",)       # fase 1: solo c2 y c3 (el resto de escenarios del contrato llega en las fases 2 y 3)
REP_BANCO_MAX = 10
PLATAFORMAS = ("mac", "windows", "linux", "android", "tablet", "telefono")
QUIENES_CONOCIDOS = ("alex", "claude", "hermes", "genesis", "director")
ESPERA_MAX_S = 4 * 3600          # «cuando el commit X esté publicado»: hasta 4 h, como el lanzador de a mano
ESPERA_FETCH_S = 120             # mientras espera, mira origin cada 2 min
GRACIA_MANIFIESTO_S = 360        # tras terminar el run, 6 min antes de publicar los manifiestos nosotros
LANZAMIENTO_MAX_S = 600          # una orden de lanzar sin run visible tras 10 min = no apareció
ARREGLO_REPETIDO_S = 300
NOTA_MAX = 500
MAX_PETICIONES_ESTADO = 12
MAX_ULTIMAS = 8
MAX_PASADA = 20                  # peticiones que se atienden como mucho en una pasada
CADA_S = 60
TERMINALES = ("publicada", "fallo", "cancelada")
VIVAS = ("en-cola", "compilando", "publicando")

_ID = re.compile(r"^[a-z0-9][a-z0-9-]{2,39}$")
_QUIEN = re.compile(r"^[a-z0-9][a-z0-9_.-]{0,39}$")
_SHA = re.compile(r"^[0-9a-f]{40}$")
_CID = re.compile(r"^c\d{1,3}$")
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


def a_iso(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if epoch is not None else None


def de_iso(texto):
    try:
        return datetime.strptime(str(texto)[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc).timestamp()
    except (ValueError, TypeError):
        return None


def _entero(v, minimo=1, maximo=10**9):
    if isinstance(v, bool):
        return None
    if isinstance(v, int) and minimo <= v <= maximo:
        return v
    return None


# ── peticiones ──────────────────────────────────────────────────────────────────────────────────────────────────

def validar_peticion(crudo, nombre_archivo=None, ahora=None):
    """PURA. Lo leído de un archivo → (petición normalizada, None) o (None, motivo legible).
    Conjunto cerrado de acciones; commit de 40 hex; enteros de verdad; la nota, solo texto de ≤ 500."""
    if not isinstance(crudo, dict):
        return None, "la petición no es un objeto JSON"
    if crudo.get("formato", 1) != 1:
        return None, "formato %r no soportado (se espera 1)" % (crudo.get("formato"),)
    pid = crudo.get("id")
    if not isinstance(pid, str) or not _ID.match(pid):
        return None, "id no válido (letras minúsculas, cifras y guiones, de 3 a 40)"
    if nombre_archivo is not None and nombre_archivo != pid + ".json":
        return None, "el nombre del archivo no coincide con el id de la petición"
    accion = crudo.get("accion")
    if accion not in ACCIONES:
        return None, "acción no permitida: %s" % (str(accion)[:30] if isinstance(accion, str) else "no es texto")
    quien = crudo.get("quien")
    if not isinstance(quien, str) or not _QUIEN.match(quien.lower()):
        return None, "falta quién la pide (alex, claude, hermes, genesis…)"
    t = crudo.get("t")
    if t is not None and (not isinstance(t, str) or de_iso(t) is None):
        return None, "hora no válida (se espera 2026-11-12T01:10:00Z)"
    p = {"formato": 1, "id": pid, "accion": accion, "quien": quien.lower(), "t": t or a_iso(ahora),
         "sha": None, "numero": None, "prueba": None, "comprobacion": None, "plataforma": None, "nota": None,
         "minutos": None}
    sha = crudo.get("sha")
    if sha is not None:
        if accion != "compilar":
            return None, "«sha» solo vale para compilar"
        if not isinstance(sha, str) or not _SHA.match(sha.lower()):
            return None, "el commit debe ser de 40 caracteres hexadecimales"
        p["sha"] = sha.lower()
    if crudo.get("numero") is not None:
        n = _entero(crudo["numero"], 1, 999999)
        if n is None or accion not in ("cancelar", "reintentar", "republicar"):
            return None, "«numero» no válido (entero de 1 a 999999 y solo para cancelar, reintentar o republicar)"
        p["numero"] = n
    if accion == "pedir-arreglo":
        pr = _entero(crudo.get("prueba"), 1, 99999)
        if pr is None:
            return None, "pedir arreglo necesita la prueba (entero)"
        p["prueba"] = pr
        cid, plat = crudo.get("comprobacion"), crudo.get("plataforma")
        if cid is not None and (not isinstance(cid, str) or not _CID.match(cid)):
            return None, "comprobación no válida (c1, c2…)"
        if plat is not None and plat not in PLATAFORMAS:
            return None, "plataforma no válida (%s)" % ", ".join(PLATAFORMAS)
        if cid is None and plat is None:
            return None, "pedir arreglo necesita una comprobación o una plataforma"
        p["comprobacion"], p["plataforma"] = cid, plat
    elif any(crudo.get(k) is not None for k in ("prueba", "comprobacion", "plataforma")):
        return None, "«prueba», «comprobacion» y «plataforma» solo valen para pedir arreglo"
    # RON1112C: `minutos` (1 a 90) solo vale para iniciar una ronda; el motivo de la ronda viaja en `nota` (≤ 200).
    if crudo.get("minutos") is not None:
        mi = _entero(crudo["minutos"], 1, 90)
        if mi is None or accion != "ronda-iniciar":
            return None, "«minutos» no válido (entero de 1 a 90 y solo para iniciar una ronda)"
        p["minutos"] = mi
    if accion == "ronda-iniciar":
        mot = " ".join(str(crudo.get("nota") or "").split()) if isinstance(crudo.get("nota"), (str, type(None))) else ""
        if not mot:
            return None, "la ronda necesita un motivo (en «nota»: qué se va a probar)"
        if len(mot) > 200:
            return None, "el motivo de la ronda pasa de 200 caracteres (tiene %d)" % len(mot)
    # BAN1114C: `esc` (escenario) y `rep` (repeticiones, 1 a 10) solo valen para «banco-serie», y ahí son obligatorios
    if accion == "banco-serie":
        if crudo.get("esc") not in ESCENARIOS_BANCO:
            return None, "«esc» no válido (%s)" % ", ".join(ESCENARIOS_BANCO)
        rp = _entero(crudo.get("rep"), 1, REP_BANCO_MAX)
        if rp is None:
            return None, "«rep» no válido (entero de 1 a %d)" % REP_BANCO_MAX
        p["esc"], p["rep"] = crudo["esc"], rp
    elif crudo.get("esc") is not None or crudo.get("rep") is not None:
        return None, "«esc» y «rep» solo valen para banco-serie"
    nota = crudo.get("nota")
    if nota is not None:
        if not isinstance(nota, str):
            return None, "la nota debe ser texto"
        if len(nota) > NOTA_MAX:
            return None, "la nota pasa de %d caracteres (tiene %d)" % (NOTA_MAX, len(nota))
        p["nota"] = _CONTROL.sub(" ", nota).strip() or None
    return p, None


# ── estado ──────────────────────────────────────────────────────────────────────────────────────────────────────

def estado_vacio():
    return {"formato": 1, "t": None, "cada_s": CADA_S, "pasada": 0, "pausado": False, "pausa_motivo": None,
            "en_curso": None, "esperando": None, "ultimas": [], "peticiones": [], "avisos": []}


def normalizar_estado(d):
    """PURA. Lo leído del disco → estado válido; lo que no encaja se descarta (nunca rompe)."""
    e = estado_vacio()
    if not isinstance(d, dict):
        return e
    for k in ("t", "pausa_motivo"):
        if isinstance(d.get(k), str):
            e[k] = d[k][:200]
    if isinstance(d.get("pasada"), int) and not isinstance(d.get("pasada"), bool):
        e["pasada"] = d["pasada"]
    ec = d.get("en_curso")
    if isinstance(ec, dict) and (_entero(ec.get("numero")) or ec.get("lanzando")):
        e["en_curso"] = ec
    es = d.get("esperando")
    if isinstance(es, dict) and isinstance(es.get("peticion_id"), str):
        e["esperando"] = es
    for k, tope in (("ultimas", MAX_ULTIMAS), ("peticiones", MAX_PETICIONES_ESTADO)):
        if isinstance(d.get(k), list):
            e[k] = [x for x in d[k] if isinstance(x, dict)][:tope]
    if isinstance(d.get("avisos"), list):
        e["avisos"] = [str(x)[:200] for x in d["avisos"]][:6]
    return e


def anotar_peticion(estado, pet, resultado_estado, texto, ahora):
    """PURA. Pone (o actualiza) la petición en el estado, la más reciente primero."""
    fila = {"id": pet["id"], "accion": pet["accion"], "quien": pet["quien"], "t": pet["t"],
            "estado": resultado_estado, "resultado": texto[:300], "t_fin": a_iso(ahora) if resultado_estado != "pendiente" else None}
    resto = [x for x in estado["peticiones"] if x.get("id") != pet["id"]]
    estado["peticiones"] = ([fila] + resto)[:MAX_PETICIONES_ESTADO]
    return fila


def vivo(en_curso):
    return bool(en_curso) and (bool(en_curso.get("lanzando")) or en_curso.get("estado") in VIVAS)


# ── versiones y runs ────────────────────────────────────────────────────────────────────────────────────────────

def version_de_prueba(base, numero):
    """'0.5.0' + 39 → '0.5.1-prueba.39' (oficial + 1 parche, como el workflow)."""
    m = re.match(r"^(\d+)\.(\d+)\.(\d+)", str(base or ""))
    if not m:
        return None
    return "%s.%s.%d-prueba.%d" % (m.group(1), m.group(2), int(m.group(3)) + 1, numero)


def es_run_de_pruebas(jobs):
    """El run es del canal de pruebas si tiene el job «canal de pruebas · versión y prerelease» sin omitir."""
    for j in jobs or []:
        n = (j.get("name") or "").lower()
        if "canal de pruebas" in n and "versi" in n and (j.get("conclusion") or "") != "skipped":
            return True
    return False


def plataformas_de_jobs(jobs):
    """Jobs de `gh run view` → [{id, estado, detalle}] de macos/windows/linux/android."""
    fuera = {}
    for p in LL.pasos_de_jobs(jobs):
        medio = p["medio"]
        if medio not in ("macos", "windows", "linux", "android"):
            continue
        estado = {"en-curso": "compilando", "en-cola": "en-cola", "ok": "compilada", "omitido": "omitida",
                  "cancelado": "cancelada", "fallo": "fallo"}[p["estado"]]
        fuera[medio] = {"id": medio, "estado": estado, "detalle": p["job"] if estado == "fallo" else None}
    return [fuera[k] for k in ("macos", "windows", "linux", "android") if k in fuera]


def _publicando(jobs):
    for j in jobs or []:
        n = (j.get("name") or "").lower()
        if "canal de pruebas" in n and "limpieza" in n and j.get("status") == "in_progress":
            return True
    return False


def evaluar_run(run, jobs, manifiestos, version, ahora, publicado_por_director):
    """PURA. Estado de un run → {estado, plataformas, fallo, hacer} con hacer = None | 'publicar-manifiestos'.
    `manifiestos` = {'escritorio': versión|None, 'android': versión|None}."""
    plataformas = plataformas_de_jobs(jobs)
    fallidos = [p for p in plataformas if p["estado"] == "fallo"]
    fallo = {"job": fallidos[0]["detalle"], "paso": None} if fallidos else None
    status, concl = run.get("status"), run.get("conclusion") or ""
    if status != "completed":
        if status == "queued" or all(p["estado"] == "en-cola" for p in plataformas):
            est = "en-cola"
        else:
            est = "publicando" if _publicando(jobs) else "compilando"
        if fallo and est != "publicando":
            pass  # un job ya rojo con otros corriendo: sigue compilando; se dirá al terminar
        return {"estado": est, "plataformas": plataformas, "fallo": fallo, "hacer": None}
    if concl == "cancelled":
        return {"estado": "cancelada", "plataformas": plataformas, "fallo": None, "hacer": None}
    ok_esc = manifiestos.get("escritorio") == version
    ok_and = manifiestos.get("android") == version
    algun_escritorio = any(p["estado"] in ("compilada", "publicada") for p in plataformas if p["id"] != "android")
    terminado_t = de_iso(run.get("updatedAt"))
    if not ok_esc and algun_escritorio and not publicado_por_director and terminado_t is not None \
            and ahora - terminado_t >= GRACIA_MANIFIESTO_S:
        return {"estado": "publicando", "plataformas": plataformas, "fallo": fallo, "hacer": "publicar-manifiestos"}
    if concl == "success" and ok_esc and ok_and:
        for p in plataformas:
            if p["estado"] == "compilada":
                p["estado"] = "publicada"
        return {"estado": "publicada", "plataformas": plataformas, "fallo": None, "hacer": None}
    if concl == "success" and not (ok_esc and ok_and):
        # terminó bien pero los manifiestos aún no son de esta versión: si no hay nada más que hacer, es un fallo
        if (not algun_escritorio or publicado_por_director) and (terminado_t is None or ahora - terminado_t >= GRACIA_MANIFIESTO_S):
            faltan = [n for n, ok in (("latest-prueba.json", ok_esc), ("latest-prueba-android.json", ok_and)) if not ok]
            return {"estado": "fallo", "plataformas": plataformas,
                    "fallo": {"job": None, "paso": "el run terminó bien pero %s no sirve %s" % (" y ".join(faltan), version)}, "hacer": None}
        return {"estado": "publicando", "plataformas": plataformas, "fallo": None, "hacer": None}
    return {"estado": "fallo", "plataformas": plataformas,
            "fallo": fallo or {"job": None, "paso": "el run terminó con «%s»" % (concl or "sin resultado")}, "hacer": None}


# ── decisiones sobre «compilar» ─────────────────────────────────────────────────────────────────────────────────

def decidir_compilar(estado, pet, hechos, ahora):
    """PURA. hechos = {head: 40hex|None, sha_en_main: bool|None, run_vivo: texto|None}.
    → ('lanzar'|'esperar'|'rechazar', motivo, extra). Una sola prueba compila a la vez; solo se construye la última."""
    if vivo(estado["en_curso"]):
        n = estado["en_curso"].get("numero")
        return "rechazar", "ya está compilando la prueba %s; espera a que acabe y vuelve a pedirla" % (n if n else "anterior"), None
    if hechos.get("run_vivo"):
        return "rechazar", "hay otra compilación de native-build en marcha (%s); espera a que acabe" % hechos["run_vivo"], None
    if pet["sha"] is None:
        if not hechos.get("head"):
            return "rechazar", "no pude leer la cabeza de main en origin; no lanzo nada a ciegas", None
        return "lanzar", "cabeza de main %s" % hechos["head"][:10], {"sha": hechos["head"]}
    if hechos.get("sha_en_main"):
        return "lanzar", "el commit %s ya está en main (cabeza %s)" % (pet["sha"][:10], (hechos.get("head") or "?")[:10]), {"sha": pet["sha"]}
    return "esperar", "main aún no contiene %s" % pet["sha"][:10], {"hasta": a_iso(ahora + ESPERA_MAX_S)}


def espera_vencida(esperando, ahora):
    h = de_iso((esperando or {}).get("hasta"))
    return h is not None and ahora >= h


def cierre_en_ultimas(estado, en_curso, aviso, ahora):
    fila = {"numero": en_curso.get("numero"), "version": en_curso.get("version"), "run_id": en_curso.get("run_id"),
            "estado": en_curso.get("estado"), "fin": a_iso(ahora), "sha": en_curso.get("sha"), "aviso": aviso}
    resto = [x for x in estado["ultimas"] if x.get("numero") != fila["numero"]]
    estado["ultimas"] = ([fila] + resto)[:MAX_ULTIMAS]


# ── textos para el chat (neutros, sin rutas, sin «Mando») ───────────────────────────────────────────────────────

def texto_aviso(en_curso):
    v = en_curso.get("version") or "la prueba"
    url = en_curso.get("url")
    if en_curso["estado"] == "publicada":
        plat = ", ".join(p["id"] for p in en_curso.get("plataformas", []) if p["estado"] == "publicada") or "todas"
        return ("La versión %s está publicada en el canal de pruebas (%s). Las apps de prueba la encuentran en «Buscar actualización».%s"
                % (v, plat, (" Run: %s" % url) if url else ""))
    if en_curso["estado"] == "cancelada":
        return "La compilación de %s se canceló.%s" % (v, (" Run: %s" % url) if url else "")
    f = en_curso.get("fallo") or {}
    donde = ("el trabajo «%s»" % f["job"]) if f.get("job") else (f.get("paso") or "un paso sin identificar")
    man = en_curso.get("manifiestos") or {}
    return ("La compilación de %s falló en %s. Manifiestos servidos: escritorio %s, Android %s.%s La dirección lo revisa en su siguiente pasada."
            % (v, donde, man.get("escritorio") or "—", man.get("android") or "—", (" Run: %s" % url) if url else ""))


def texto_arreglo(p, version, comprobacion, resumen_banco):
    partes = ["Petición de arreglo de %s para la versión %s." % (p["quien"], version or "prueba.%d" % p["prueba"])]
    if comprobacion:
        partes.append("Comprobación %s: %s" % (comprobacion["id"], comprobacion["texto"]))
        if comprobacion.get("estado") != "pendiente":
            partes.append("Estado marcado: %s%s" % (comprobacion["estado"], (" · " + comprobacion["nota"]) if comprobacion.get("nota") else ""))
    if p.get("plataforma"):
        partes.append("Plataforma: %s" % p["plataforma"])
    if p.get("nota"):
        partes.append("Nota: %s" % p["nota"])
    partes.append("Evidencia de los aparatos:\n%s" % resumen_banco)
    partes.append("Responde en este chat con el arreglo propuesto; no se lanza ninguna compilación sola.")
    return "\n".join(partes)
