# -*- coding: utf-8 -*-
"""Autocuración de Genesis en la Mac: se repara solo, sin que nadie lo pida.

Alex (2026-10-05, 02:15): «de nuevo no carga Genesis, eso debería el propio
puente autorrepararse sin tener que pedírtelo aquí, directo del puente debería
automáticamente repararse y funcionar».

Había vigilantes de todo menos del propio Genesis. Este módulo cubre lo que sí se puede
arreglar desde la máquina (lo de la pestaña lo arregla `src/lib/mando/autocuracion-pagina.ts`):

1. **El servidor no responde.** En cada pasada del vigía de medidores (cada 120 s) se sondea
   `/api/mando/latido` hasta tres veces. Si las tres fallan y no hay una publicación o una
   reconstrucción reiniciándolo a propósito, se reinicia con `reconstruir_mando.reiniciar_mando()`
   —el mismo camino, con su cerrojo, que usa la publicación— y como mucho una vez cada 10 min.
2. **El disco se queda corto.** Por debajo de 6 GB libres se limpia lo regenerable con la
   MISMA lista blanca de Genesis (`POST /api/mando/almacenamiento {accion: "limpiar"}`):
   cachés de npm, Playwright, registros de Drive y de olas viejas. La caché de builds de Next
   solo se toca por debajo de 3 GB, porque sin ella la siguiente compilación tarda mucho más.
   La publicación usa la misma función antes de rendirse por falta de sitio.
3. **Trabajadores parados con trabajo desatascable.** (04:05, Alex: «aún no funciona, solo hay 1
   agente».) Quedaba UN agente porque todo lo demás esperaba a dependencias rechazadas que no
   llegarán nunca, y la decisión de desatascarlas (`asignar_huecos.decidir`, el botón
   «Reintentar con cambio automático» de Genesis) estaba preparada sin que nadie la aplicara.
   Ahora, si hay huecos libres y tareas que meter, se aplica sola (como mucho cada 5 min) y se
   avisa. `decidir` ya respeta la pausa, la conversación de voz y el disco.
4. **Más capacidad fuera de la Mac.** (12:40, Alex: «de nuevo solo hay 3 activos… sin que te
   tenga que decir cada vez desde aquí».) Cada 30 min se hace lo mismo que el botón «Buscar
   más capacidad» de Genesis (`buscar_capacidad.buscar`), sin sondear los medios lentos: si la
   nube tiene sitio y trabajo que pueda coger —también el que solo agotó sus envíos con los
   proveedores saturados—, se lanza. Si suma agentes, lo dice en el Chat Director.
5. **Traer la nube.** (18:40, Alex: «trae la nube y en vez de borrar ramas que se corrijan,
   arreglen y desarrollen… se pregunta antes de borrar».) Cada 30 min, en segundo plano,
   `traer_nube.py revisar --aplicar`: lo que la nube integró entra en main tras pasar tsc y las
   pruebas relacionadas en la Mac; lo que quedó a medias se convierte en una tarea que continúa
   desde su rama; lo demás se pregunta en el Chat Director. Nunca borra una rama.

6. **Enjambre atascado esperando proveedores que ya volvieron.** (2026-10-06, 22:56, Alex:
   «los agentes y procesos están detenidos… Genesis debería autorrepararse usando
   los directores».) Un orquestador vivo desde las 18:10 tenía a sus tres trabajadores
   «esperando proveedor» 40 min con apinex, freellmapi y Google respondiendo a la sonda: sus
   vetos en memoria no caducaban y la marca «sin cupo» de Google en la salud era vieja. Ahora,
   si alguna tarea lleva más de 20 min esperando proveedor, se sondean los escritores (1 token
   cada uno; la respuesta vale 10 min); si alguno puede escribir, se levanta su marca vieja
   de «sin cupo» y se manda al orquestador la orden `refrescar_proveedores` (borra sus vetos
   sin matar la tanda). Si 10 min después sigue igual, se reinicia el orquestador (el
   vigilante lo relanza con `--reanudar`) como mucho una vez cada 45 min. Si nadie tiene cupo,
   se dice cuándo vuelve el primero y no se toca nada: esperar ahí no es un fallo.

`revisar(forzar=True)` hace todo lo de arriba YA, sin respetar los tiempos mínimos: es lo que
lanza el botón «Reactivar directores» de Genesis (`scripts/puente/reactivar_mando.py`).

Todo lo que hace queda en `~/.starseed/autocuracion-mando.json` y en el Chat Director.
Las decisiones son funciones PURAS (`decidir_reinicio`, `ids_a_limpiar`) con sus pruebas.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
import limpieza_worktrees

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
MANDO = os.environ.get("STARSEED_MANDO_URL", "http://127.0.0.1:9002")
ESTADO = os.path.expanduser("~/.starseed/autocuracion-mando.json")
PUBLICACION = os.path.join(RAIZ, "starseed_memory_root", "mando", "publicacion-estado.json")

SONDAS = 3
ESPERA_ENTRE_SONDAS_S = 5
TOPE_SONDA_S = 15
REINICIO_MINIMO_S = 10 * 60
LIMPIEZA_MINIMA_S = 60 * 60
LLENADO_MINIMO_S = 5 * 60
BUSQUEDA_MINIMA_S = 30 * 60
TRAER_MINIMO_S = 30 * 60
ATASCO_UMBRAL_S = 20 * 60
REFRESCO_MINIMO_S = 15 * 60
#: (2026-10-23) Cada cuánto los directores comprueban los medidores y reparan los que estén mal.
REPARAR_MEDIDORES_MINIMO_S = 10 * 60
#: (2026-10-23) Promociones de Experiential Labs (modelos gratis y con descuento): cada 6 h.
EXPLABS_MINIMO_S = 6 * 3600
#: Carpeta de los worktrees de los agentes (la misma que usa el orquestador).
RAIZ_WT = os.path.join(os.path.dirname(RAIZ), "starseed-wt")
REFRESCO_SIN_EFECTO_S = 10 * 60
REINICIO_ORQ_MINIMO_S = 45 * 60
SONDA_VALIDA_S = 10 * 60
SERVICIOS_MINIMO_S = 10 * 60
FASES_ESPERA = ("esperando proveedor", "esperando cupo")
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
SALUD = os.path.expanduser("~/.starseed/salud-proveedores.json")
COLGADOS = os.path.expanduser("~/.starseed/colgados.json")
CERROJOS = os.path.expanduser("~/.starseed/cerrojos")
DISCO_AVISO_GB = 6.0
DISCO_CRITICO_GB = 3.0

#: Lo regenerable que se limpia antes (ids de `candidatosRegenerables` en almacenamiento.ts).
LIMPIABLES = ("npm-cache", "playwright", "drivefs-logs", "olas-logs", "node-cache")
#: La caché de builds de Next: solo en disco crítico.
LIMPIABLES_CRITICO = ("next-cache",)

#: Pasos de una publicación en los que Genesis se para o se reinicia a propósito.
PASOS_QUE_LO_PARAN = ("build", "push", "verificar")


# ── decisiones (puras) ──────────────────────────────────────────────────────────

def decidir_reinicio(sondas_ok, ahora, ultimo_reinicio, publicacion_en_marcha=False,
                     minimo_s=REINICIO_MINIMO_S):
    """PURA. ¿Hay que reiniciar Genesis? Devuelve (sí/no, por qué).

    `sondas_ok`: lista de booleanos de esta pasada (True = respondió).
    """
    if not sondas_ok or any(sondas_ok):
        return False, "responde"
    if publicacion_en_marcha:
        return False, "no responde, pero una publicación lo está compilando o reiniciando"
    if ultimo_reinicio and ahora - ultimo_reinicio < minimo_s:
        return False, "no responde y ya lo reinicié hace %d s: espero" % int(ahora - ultimo_reinicio)
    return True, "no respondió a %d sondas seguidas" % len(sondas_ok)


def ids_a_limpiar(libre_gb, aviso_gb=DISCO_AVISO_GB, critico_gb=DISCO_CRITICO_GB):
    """PURA. Qué regenerables limpiar con `libre_gb` libres (lista vacía = nada)."""
    if libre_gb is None or libre_gb >= aviso_gb:
        return []
    ids = list(LIMPIABLES)
    if libre_gb < critico_gb:
        ids += list(LIMPIABLES_CRITICO)
    return ids


def publicacion_en_marcha(datos):
    """PURA. ¿La publicación está en un paso que para o reinicia Genesis?"""
    if not isinstance(datos, dict) or datos.get("estado") != "corriendo":
        return False
    for paso in datos.get("pasos") or []:
        if paso.get("clave") in PASOS_QUE_LO_PARAN and paso.get("estado") == "corriendo":
            return True
    return False


def decidir_llenado(decision, ahora, ultimo_llenado, minimo_s=LLENADO_MINIMO_S):
    """PURA. ¿Se aplica la decisión de `asignar_huecos.decidir`? Devuelve (sí/no, por qué)."""
    if not isinstance(decision, dict) or not decision.get("puede"):
        return False, "nada que llenar"
    meter = list(decision.get("meter") or [])
    huecos = int(decision.get("huecos") or 0)
    if not meter or huecos <= 0:
        return False, "sin huecos libres o sin tareas que meter"
    if ultimo_llenado and ahora - ultimo_llenado < minimo_s:
        return False, "ya llené los huecos hace %d s" % int(ahora - ultimo_llenado)
    return True, "%d trabajador(es) libre(s): meto %s" % (huecos, ", ".join(meter))


def decidir_busqueda(ahora, ultima_busqueda, minimo_s=BUSQUEDA_MINIMA_S):
    """PURA. ¿Toca buscar capacidad fuera de la Mac? Devuelve (sí/no, por qué)."""
    if ultima_busqueda and ahora - ultima_busqueda < minimo_s:
        return False, "busqué capacidad hace %d min" % int((ahora - ultima_busqueda) // 60)
    return True, "toca buscar más capacidad"


def diagnostico_atasco(tareas, ahora, umbral_s=ATASCO_UMBRAL_S):
    """PURA. `tareas`: {tid: {"fase", "desde"}} del latido de la tanda viva.
    → {"esperando": [(tid, s)], "trabajando": [tid], "largas": [(tid, s)], "atascada": bool}.
    «Esperando proveedor» NO es trabajar, aunque ocupe trabajador."""
    esperando, trabajando = [], []
    for tid, d in (tareas or {}).items():
        if not isinstance(d, dict):
            continue
        fase = str(d.get("fase") or "")
        if not fase or fase == "hecho":
            continue
        if fase.startswith(FASES_ESPERA):
            try:
                desde = float(d.get("desde") or ahora)
            except (TypeError, ValueError):
                desde = ahora
            esperando.append((tid, max(0.0, ahora - desde)))
        else:
            trabajando.append(tid)
    largas = [(t, seg) for t, seg in esperando if seg >= umbral_s]
    return {"esperando": esperando, "trabajando": trabajando, "largas": largas,
            "atascada": bool(largas)}


def decidir_atasco(diag, hay_escritores, estado, ahora, forzar=False):
    """PURA. Qué hacer con un enjambre que espera proveedores. → (acción, por qué) con
    acción ∈ nada | esperar | refrescar | reiniciar.

    · Sin tareas esperando de más (o, con `forzar`, sin ninguna esperando): nada.
    · Nadie con cupo según la sonda: esperar (no es un fallo; lo arregla el reinicio de cupos).
    · Si no se refrescó hace poco: refrescar (borra vetos sin matar la tanda).
    · Si se refrescó hace ≥ 10 min y sigue igual: reiniciar el orquestador, como mucho
      cada 45 min. `forzar` (el botón) baja esos tiempos a 2 y 5 min."""
    hay_espera = diag.get("atascada") or (forzar and diag.get("esperando"))
    if not hay_espera:
        return "nada", "ninguna tarea esperando proveedor de más"
    if not hay_escritores:
        return "esperar", "ningún escritor tiene cupo ahora: esperar no es un fallo"
    estado = estado or {}
    ult_ref = float(estado.get("ultimo_refresco") or 0)
    ult_rei = float(estado.get("ultimo_reinicio_orq") or 0)
    sin_efecto = 2 * 60 if forzar else REFRESCO_SIN_EFECTO_S
    min_ref = 0 if forzar else REFRESCO_MINIMO_S
    min_rei = 5 * 60 if forzar else REINICIO_ORQ_MINIMO_S
    desde_ref = ahora - ult_ref
    if ult_ref > ult_rei and sin_efecto <= desde_ref < 3 * REFRESCO_MINIMO_S:
        if ahora - ult_rei >= min_rei:
            return "reiniciar", "refresqué hace %d min y sigue esperando con escritores libres" % (desde_ref // 60)
        return "esperar", "reinicié el orquestador hace %d min: le doy tiempo" % ((ahora - ult_rei) // 60)
    if ult_ref > ult_rei and desde_ref < sin_efecto:
        return "esperar", "refresqué hace %d s: le doy tiempo" % desde_ref
    if desde_ref >= min_ref:
        return "refrescar", "hay escritores con cupo y tareas esperando proveedor"
    return "esperar", "refresqué hace %d min" % (desde_ref // 60)


def aptos_de_sonda(resultados, alias=None):
    """PURA. De `[(modelo, apto, motivo, horas)]` saca los PROVEEDORES (nombre de la salud)
    que pueden escribir. `alias`: {prefijo: nombre en la salud} (nvidia → nim)."""
    alias = alias or {"nvidia": "nim"}
    return sorted({alias.get(m.split("/", 1)[0], m.split("/", 1)[0])
                   for m, apto, _motivo, _h in (resultados or []) if apto})


# Medidores de crédito por terminal (MC1007D): `medidores_credito.py` los deja cada 10 min en
# este archivo. Si el de Codex dice que vuelve a tener cupo (p. ej. tras el reinicio semanal),
# su marca vieja de «sin cupo» en la salud ya no vale: cuenta como apto igual que la sonda.
MEDIDORES = os.path.expanduser("~/.starseed/medidores-credito.json")
MEDIDOR_VALIDO_S = 30 * 60
MEDIDOR_A_SALUD = {"codex": "codex"}  # id del medidor → nombre del proveedor en la salud


def _epoch_iso(valor):
    if not isinstance(valor, str) or not valor:
        return None
    try:
        from datetime import datetime
        return datetime.fromisoformat(valor.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def aptos_de_medidores(doc, ahora, max_edad_s=MEDIDOR_VALIDO_S, mapa=None):
    """PURA. Proveedores (nombre en la salud) cuyo medidor de crédito, con una lectura de hace
    menos de `max_edad_s`, dice que tienen cupo: `ok`, no `obsoleto`, sin `bloqueado` ni
    `uso_normal: false`, y ninguna ventana ≥ 100 % (la que ya pasó su `reinicia` cuenta como 0)."""
    meds = doc.get("medidores") if isinstance(doc, dict) else None
    if not isinstance(meds, dict):
        return []
    aptos = []
    for mid, prov in (mapa or MEDIDOR_A_SALUD).items():
        m = meds.get(mid)
        if not isinstance(m, dict) or m.get("ok") is not True or m.get("obsoleto"):
            continue
        leido = _epoch_iso(m.get("leido"))
        if leido is None or ahora - leido > max_edad_s:
            continue
        extras = m.get("extras") if isinstance(m.get("extras"), dict) else {}
        if extras.get("bloqueado") or extras.get("uso_normal") is False:
            continue
        lleno = False
        for v in m.get("ventanas") if isinstance(m.get("ventanas"), list) else []:
            pct = v.get("usado_pct") if isinstance(v, dict) else None
            if not isinstance(pct, (int, float)):
                continue
            reinicia = _epoch_iso(v.get("reinicia"))
            if reinicia is not None and reinicia <= ahora:
                continue
            if pct >= 100:
                lleno = True
                break
        if not lleno:
            aptos.append(prov)
    return sorted(aptos)


def _aptos_medidores(ahora):
    return aptos_de_medidores(_leer_json(MEDIDORES, {}), ahora)


def _levantar_por_medidores(ahora):
    """Cada pasada (solo lee un JSON): si un medidor de crédito ve cupo, su marca futura de
    «sin cupo» en la salud se levanta aunque no haya nada atascado. Sin esto, Codex reiniciado
    se quedaba fuera hasta que caducara una marca vieja (2026-10-07: 20 h desperdiciadas)."""
    aptos = _aptos_medidores(ahora)
    if not aptos:
        return []
    ahora_txt = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ahora))
    levantados = []

    def salud():
        nonlocal levantados
        nueva, levantados = levantar_marcas(_leer_json(SALUD, {}), aptos, ahora_txt,
                                            motivo="el medidor de crédito lo ve con cupo (autocuración)")
        if levantados:
            _escribir_json(SALUD, nueva)

    _con_cerrojo("salud", salud)
    return levantados


def levantar_marcas(salud, aptos, ahora_txt, motivo="la sonda lo vio escribir (autocuración)"):
    """PURA. Quita `sin_cupo_hasta` futuras de los proveedores que la sonda acaba de ver
    escribir (la sonda manda sobre una marca vieja). Devuelve (salud_nueva, levantados)."""
    nueva = dict(salud or {})
    levantados = []
    for prov in aptos or []:
        e = nueva.get(prov)
        if isinstance(e, dict) and str(e.get("sin_cupo_hasta") or "") > ahora_txt:
            e = dict(e)
            e.pop("sin_cupo_hasta", None)
            e["motivo"] = motivo
            nueva[prov] = e
            levantados.append(prov)
    return nueva, levantados


def perdonar_colgados(colgados, aptos):
    """PURA. Rompe las rachas de cuelgue de los modelos de proveedores que responden, para
    que un reinicio del orquestador no los vuelva a vetar al arrancar."""
    nuevo = dict(colgados or {})
    perdonados = []
    for m, e in list(nuevo.items()):
        prov = m.split("/", 1)[0]
        prov = {"nvidia": "nim"}.get(prov, prov)
        if prov in (aptos or []) and isinstance(e, dict) and int(e.get("seguidos") or 0) > 0:
            nuevo[m] = dict(e, seguidos=0)
            perdonados.append(m)
    return nuevo, perdonados


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


def sondear(url=None, tope_s=TOPE_SONDA_S):
    """True si Genesis contesta 2xx a una lectura ligera."""
    try:
        with urllib.request.urlopen(url or (MANDO + "/api/mando/latido"), timeout=tope_s) as r:
            return 200 <= r.status < 300
    except (urllib.error.URLError, OSError, ValueError):
        return False


def espacio_libre_gb(raiz=RAIZ):
    try:
        e = os.statvfs(raiz)
        return (e.f_bavail * e.f_frsize) / (1024 ** 3)
    except (OSError, AttributeError):
        return None


def limpiar(ids, tope_s=120):
    """Pide a Genesis que limpie esos regenerables con SU lista blanca. Devuelve su respuesta."""
    if not ids:
        return {"ok": True, "limpiados": [], "detalle": "nada que limpiar"}
    cuerpo = json.dumps({"accion": "limpiar", "ids": list(ids)}).encode("utf-8")
    req = urllib.request.Request(MANDO + "/api/mando/almacenamiento", data=cuerpo, method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=tope_s) as r:
            return json.loads(r.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, ValueError) as e:
        return {"ok": False, "limpiados": [], "detalle": "Genesis no pudo limpiar: %s" % e}


def liberar_disco(minimo_gb, raiz=RAIZ):
    """Para quien necesita sitio YA (la publicación): limpia lo regenerable hasta llegar a
    `minimo_gb` si se puede. Devuelve (libres_después, lo_que_se_hizo)."""
    libre = espacio_libre_gb(raiz)
    if libre is None or libre >= minimo_gb:
        return libre, []
    hecho = []
    r = limpiar(LIMPIABLES)
    hecho.append("limpiado %s" % (", ".join(r.get("limpiados") or []) or r.get("detalle") or "nada"))
    libre = espacio_libre_gb(raiz)
    if libre is not None and libre < minimo_gb:
        r = limpiar(LIMPIABLES_CRITICO)
        hecho.append("limpiado %s" % (", ".join(r.get("limpiados") or []) or r.get("detalle") or "nada"))
        libre = espacio_libre_gb(raiz)
    return libre, hecho


def _avisar(texto):
    """Una línea al Chat Director (si no se puede, se queda en el estado)."""
    try:
        if DIRECTORIO not in sys.path:
            sys.path.insert(0, DIRECTORIO)
        import director_chat
        director_chat.publicar(texto, de="director-autocuracion", rol="director", tipo="aviso")
    except Exception:
        pass


def _reiniciar():
    if DIRECTORIO not in sys.path:
        sys.path.insert(0, DIRECTORIO)
    import reconstruir_mando
    reconstruir_mando.reiniciar_mando()


def _asignar():
    """(decisión, aplicar) de `asignar_huecos`: la misma lógica que el botón de Genesis."""
    if DIRECTORIO not in sys.path:
        sys.path.insert(0, DIRECTORIO)
    import asignar_huecos
    estado = asignar_huecos.reunir()
    decision = asignar_huecos.decidir(estado)
    return decision, (lambda: asignar_huecos.aplicar(estado, decision))


def _traer_en_fondo():
    """`traer_nube.py revisar --aplicar` suelto: puede esperar el turno de tsc varios minutos y
    el vigía no se puede quedar parado mientras. Una sola pasada a la vez (su propio cerrojo)."""
    import subprocess

    with open("/tmp/starseed-traer-nube.log", "a", encoding="utf-8") as log:
        # (OPO1011) Primero el A1 de Oracle (nodo siempre encendido): `oracle_nodo.py ciclo` lee su
        # estado, sube a GitHub sus ramas `nube/a1-*` y le manda trabajo si está libre; después
        # `traer_nube` las pasa por las puertas de main en la misma pasada. Sin A1, no hace nada.
        if os.path.exists(os.path.join(DIRECTORIO, "oracle_nodo.py")):
            subprocess.Popen([sys.executable, os.path.join(DIRECTORIO, "oracle_nodo.py"), "ciclo", "--y-traer-nube"],
                             cwd=RAIZ, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                             start_new_session=True)
            return True
        subprocess.Popen([sys.executable, os.path.join(DIRECTORIO, "traer_nube.py"), "revisar", "--aplicar"],
                         cwd=RAIZ, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                         start_new_session=True)
    return True


BLOQUEO_VIEJO_S = 30 * 60


def bloqueo_de_alta_viejo(error, edad_s, minimo_s=BLOQUEO_VIEJO_S):
    """PURA: ¿el fallo es un bloqueo «initializing» de un `worktree add` que ya no está en marcha?"""
    texto = str(error or "")
    return "locked working tree" in texto and "initializing" in texto and edad_s is not None and edad_s >= minimo_s


def _edad_bloqueo(ruta):
    """Segundos desde que se bloqueó el worktree (`.git/worktrees/<nombre>/locked`); None si no se sabe."""
    marca = os.path.join(RAIZ, ".git", "worktrees", os.path.basename(str(ruta).rstrip("/")), "locked")
    try:
        return time.time() - os.path.getmtime(marca)
    except OSError:
        return None


def _git_wt(ruta, comando, *args):
    """El `git_fn` que espera `limpieza_worktrees`: la SALIDA para «status --porcelain», el
    CÓDIGO para «merge-base --is-ancestor …» y «worktree remove <ruta>» desde el repo principal."""
    import subprocess

    if comando == "worktree remove":
        r = subprocess.run(["git", "-C", RAIZ, "worktree", "remove", *args],
                           capture_output=True, text=True, timeout=120)
        error = (r.stderr or r.stdout or "").strip()
        # (2026-10-23) Un `git worktree add` interrumpido deja el worktree bloqueado con motivo
        # «initializing» y la limpieza fallaba en cada pasada. Solo se suelta si el bloqueo lleva
        # más de 30 min (no es uno que se esté creando ahora); el plan ya excluye tareas vivas.
        if r.returncode != 0 and args and bloqueo_de_alta_viejo(error, _edad_bloqueo(args[-1])):
            subprocess.run(["git", "-C", RAIZ, "worktree", "unlock", args[-1]],
                           capture_output=True, text=True, timeout=60)
            r = subprocess.run(["git", "-C", RAIZ, "worktree", "remove", *args],
                               capture_output=True, text=True, timeout=120)
            error = (r.stderr or r.stdout or "").strip()
        if r.returncode != 0:
            raise RuntimeError((error or "git worktree remove falló")[:200])
        return 0
    r = subprocess.run(["git", "-C", ruta] + comando.split(), capture_output=True, text=True, timeout=60)
    if comando.startswith("status"):
        # Sin estado legible no se sabe si está limpio: se dice «sucio» y no se toca.
        return r.stdout if r.returncode == 0 else "?"
    return r.returncode


def _tareas_vivas():
    """(progreso, ids que no se tocan): pendientes, en curso o prestadas, y las que laten ahora."""
    import glob as _glob

    progreso = _leer_json(os.path.join(OLAS, "progreso.json"), {})
    vivas = {t for t, v in progreso.items()
             if isinstance(v, dict) and v.get("estado") in ("pendiente", "en_curso", "reasignada", "por_traer")}
    for ruta in _glob.glob(os.path.join(OLAS, "latidos-*.json")):
        try:
            if time.time() - os.path.getmtime(ruta) > 86400:
                continue
            vivas |= set(((_leer_json(ruta, {}) or {}).get("tareas") or {}).keys())
        except OSError:
            continue
    return progreso, sorted(vivas)


def limpiar_worktrees(raiz_wt=None):
    """Quita los worktrees limpios de tareas cerradas y los node_modules propios (no enlazados)
    de los que no trabajan. Las ramas `ola/<ID>` se quedan: `git worktree remove` no las toca."""
    import shutil

    raiz_wt = raiz_wt or RAIZ_WT
    if not os.path.isdir(raiz_wt):
        return {"quitados": [], "nm_borrados": [], "errores": []}
    progreso, vivas = _tareas_vivas()
    w = [x for x in limpieza_worktrees.recoger(raiz_wt, RAIZ, _git_wt)
         if not os.path.basename(x["ruta"]).startswith("_")]  # `_traer` es de traer_nube
    plan = limpieza_worktrees.plan(w, progreso, vivas)
    return limpieza_worktrees.aplicar(plan, RAIZ, _git_wt, shutil.rmtree)


def _reparar_medidores_en_fondo(forzar=False):
    """`reparar_medidor.py --todos` suelto: comprueba medidores (GitHub, procesos, API) y eso
    tarda minutos; el vigía no se puede quedar parado. Una sola pasada a la vez (su cerrojo)."""
    import subprocess

    orden = [sys.executable, os.path.join(DIRECTORIO, "reparar_medidor.py"), "--todos", "--origen", "directores"]
    if forzar:
        orden.append("--forzar")
    with open("/tmp/starseed-reparar-medidores.log", "a", encoding="utf-8") as log:
        subprocess.Popen(orden, cwd=RAIZ, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                         start_new_session=True)
    return True


def _explabs_en_fondo():
    """`explabs_promos.py actualizar` suelto (una petición de ~2 MB a la pasarela)."""
    import subprocess

    with open("/tmp/starseed-explabs.log", "a", encoding="utf-8") as log:
        subprocess.Popen([sys.executable, os.path.join(DIRECTORIO, "explabs_promos.py"), "actualizar"], cwd=RAIZ,
                         stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, start_new_session=True)
    return True


def _a1_en_fondo():
    """(CAP1026J) `a1_autocuracion.py` suelto: sonda del A1 (SSH + servicios) y, si está colgado, reinicio por la
    API de Oracle. Se limita solo (una sonda cada 5 min, su propio cerrojo)."""
    import subprocess

    with open("/tmp/starseed-a1-autocuracion.log", "a", encoding="utf-8") as log:
        subprocess.Popen([sys.executable, os.path.join(DIRECTORIO, "a1_autocuracion.py")], cwd=RAIZ,
                         stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, start_new_session=True)
    return True


def _buscar():
    """El botón «Buscar más capacidad» sin los sondeos lentos ni la Mac (de ella ya se ocupa
    el llenado de arriba). Avisa él mismo en el Chat Director si suma agentes."""
    if DIRECTORIO not in sys.path:
        sys.path.insert(0, DIRECTORIO)
    import buscar_capacidad
    return buscar_capacidad.buscar(aplicar=True, sondear_medios=False, mac=False, origen="autocuracion")


_PATRON_ORQ = r"^[^ ]*[Pp]ython[0-9.]* +-u +.*starseed-enjambre\.py"


def _procesos_orquestador():
    """[(pid, args)] de los orquestadores vivos (orden que EMPIEZA por python -u)."""
    import re
    import subprocess

    try:
        salida = subprocess.run(["ps", "-axo", "pid=,args="], capture_output=True, text=True,
                                timeout=20).stdout
    except Exception:
        return []
    vivos = []
    for linea in salida.splitlines():
        trozos = linea.strip().split(None, 1)
        if len(trozos) == 2 and trozos[0].isdigit() and re.match(_PATRON_ORQ, trozos[1]):
            vivos.append((int(trozos[0]), trozos[1]))
    return vivos


def _cola_viva():
    """Nombre del archivo de la cola que corre ahora (de los argumentos del orquestador)."""
    for _pid, args in _procesos_orquestador():
        for trozo in args.split():
            base = os.path.basename(trozo)
            if base.startswith("cola-") and base.endswith(".json"):
                return base
    return None


def _latido_tareas(cola, frescura_s=300):
    """{tid: {fase, desde}} del latido de la tanda viva, si es reciente."""
    if not cola:
        return {}
    ruta = os.path.join(OLAS, "latidos-" + cola)
    try:
        if time.time() - os.path.getmtime(ruta) > frescura_s:
            return {}
    except OSError:
        return {}
    d = _leer_json(ruta, {})
    tareas = d.get("tareas") if isinstance(d, dict) else None
    return tareas if isinstance(tareas, dict) else {}


def _sondear_escritores():
    """[(modelo, apto, motivo, horas)] con la misma sonda que el botón de capacidad."""
    if DIRECTORIO not in sys.path:
        sys.path.insert(0, DIRECTORIO)
    import buscar_capacidad
    return buscar_capacidad._sondear_escritores()


def _con_cerrojo(nombre, fn):
    """Ejecuta `fn()` con el mismo flock que usa el orquestador (~/.starseed/cerrojos)."""
    import fcntl

    os.makedirs(CERROJOS, exist_ok=True)
    with open(os.path.join(CERROJOS, nombre + ".lock"), "a+") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            return fn()
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def _escribir_json(ruta, datos):
    tmp = ruta + ".tmp-autocuracion"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def _ordenar_refresco(cola):
    """Deja la orden `refrescar_proveedores` en el archivo de control de la tanda viva."""
    ruta = os.path.join(OLAS, "control-" + cola)

    def poner():
        ordenes = _leer_json(ruta, {})
        if not isinstance(ordenes, dict):
            ordenes = {}
        ordenes["_flota"] = {"accion": "refrescar_proveedores", "quien": "director-autocuracion",
                             "t": time.strftime("%Y-%m-%d %H:%M:%S")}
        _escribir_json(ruta, ordenes)

    _con_cerrojo("control-control-" + cola, poner)


def _levantar_y_perdonar(aptos):
    """Quita marcas viejas de «sin cupo» y rachas de cuelgue de quien responde a la sonda."""
    ahora_txt = time.strftime("%Y-%m-%d %H:%M:%S")
    levantados, perdonados = [], []

    def salud():
        nonlocal levantados
        nueva, levantados = levantar_marcas(_leer_json(SALUD, {}), aptos, ahora_txt)
        if levantados:
            _escribir_json(SALUD, nueva)

    def colgados():
        nonlocal perdonados
        nuevo, perdonados = perdonar_colgados(_leer_json(COLGADOS, {}), aptos)
        if perdonados:
            _escribir_json(COLGADOS, nuevo)

    try:
        _con_cerrojo("salud", salud)
    except Exception:
        pass
    try:
        colgados()
    except Exception:
        pass
    return levantados, perdonados


def _reiniciar_orquestador():
    """SIGTERM al orquestador: el vigilante lo relanza en ≤ 90 s con `--reanudar`."""
    import signal

    pids = [pid for pid, _ in _procesos_orquestador()]
    for pid in pids:
        os.kill(pid, signal.SIGTERM)
    return pids


def _servicios():
    """Los servicios com.starseed.* que deben estar siempre vivos (paso 1 del reactivador)."""
    import reactivar_mando
    return reactivar_mando.paso_servicios()


def curar_enjambre(estado, ahora, forzar=False, latido_fn=None, sondear_fn=_sondear_escritores,
                   ordenar_fn=_ordenar_refresco, reiniciar_fn=_reiniciar_orquestador,
                   levantar_fn=_levantar_y_perdonar, avisar_fn=None, cola_fn=_cola_viva,
                   medidores_fn=None):
    """Punto 6 del docstring. Modifica `estado` y devuelve una línea de lo que hizo (o "")."""
    avisar_fn = avisar_fn or _avisar
    cola = cola_fn()
    if not cola:
        return ""
    tareas = (latido_fn or _latido_tareas)(cola)
    diag = diagnostico_atasco(tareas, ahora)
    estado["enjambre"] = {"esperando": len(diag["esperando"]), "trabajando": len(diag["trabajando"]),
                          "largas": [t for t, _ in diag["largas"]]}
    if not (diag["atascada"] or (forzar and diag["esperando"])):
        return ""
    sonda = estado.get("sonda") or {}
    if forzar or ahora - float(sonda.get("t") or 0) >= SONDA_VALIDA_S:
        resultados = sondear_fn() or []
        sonda = {"t": ahora, "aptos": aptos_de_sonda(resultados),
                 "no": sorted({m.split("/", 1)[0] for m, a, _, _ in resultados if not a})}
        estado["sonda"] = sonda
    aptos = list(sonda.get("aptos") or [])
    if medidores_fn:
        # El medidor de crédito por terminal es tan buena prueba como la sonda (y gratis).
        try:
            aptos = sorted(set(aptos) | set(medidores_fn(ahora) or []))
        except Exception:
            pass
    accion, porque = decidir_atasco(diag, bool(aptos), estado, ahora, forzar)
    largas = ", ".join("%s (%d min)" % (t, s // 60) for t, s in diag["largas"][:4]) or \
        ", ".join(t for t, _ in diag["esperando"][:4])
    if accion == "refrescar":
        levantados, perdonados = levantar_fn(aptos)
        ordenar_fn(cola)
        estado["ultimo_refresco"] = ahora
        linea = ("enjambre: %s esperaba(n) proveedor con %s pudiendo escribir → orden de refrescar "
                 "proveedores%s%s" % (largas, ", ".join(aptos),
                                       "; marca vieja de «sin cupo» levantada: %s" % ", ".join(levantados) if levantados else "",
                                       "; rachas de cuelgue perdonadas: %d" % len(perdonados) if perdonados else ""))
        avisar_fn("Autocuración: " + linea + ".")
        return linea
    if accion == "reiniciar":
        levantar_fn(aptos)
        pids = reiniciar_fn()
        estado["ultimo_reinicio_orq"] = ahora
        linea = "enjambre: %s; reinicio el orquestador (%s) y el vigilante lo relanza" % (
            porque, ", ".join(str(p) for p in pids) or "no encontré su proceso")
        avisar_fn("Autocuración: " + linea + ".")
        return linea
    if accion == "esperar" and not aptos:
        # Una vez por hora como mucho: esperar sin cupo no es un fallo, pero se dice.
        if forzar or ahora - float(estado.get("ultimo_aviso_sin_cupo") or 0) >= 3600:
            estado["ultimo_aviso_sin_cupo"] = ahora
            linea = "enjambre: %s espera(n) proveedor y la sonda no ve ningún escritor con cupo (%s); no toco nada" % (
                largas, ", ".join(sonda.get("no") or []) or "sin datos")
            avisar_fn("Autocuración: " + linea + ".")
            return linea
    return "enjambre: %s" % porque if forzar else ""


def _relevo_claude() -> dict:
    """Relevo del carril de Claude (REL1026A): ver `relevo_carril_claude.py`."""
    import relevo_carril_claude
    return relevo_carril_claude.revisar()


def liderazgo():
    """El arriendo de dirección (`lider_direccion.soy_lider`). Sin puerta o sin red: líder en
    local, como hoy; un fallo al leerlo no deja a la autocuración sin director."""
    try:
        import lider_direccion as LD
        return LD.soy_lider()
    except Exception as e:  # noqa: BLE001 — sin líder de dirección, sigue en local
        return {"soy": True, "motivo": "sin líder de dirección: %s" % type(e).__name__}


def quien_dirige(r):
    """PURA. El dueño del arriendo (o el motivo) para «espera: dirige <neurona>»."""
    a = (r or {}).get("arriendo") or {}
    return a.get("dueno") or (r or {}).get("motivo") or "otra neurona"


def revisar(ahora=None, sondear_fn=sondear, reiniciar_fn=_reiniciar, limpiar_fn=limpiar,
            libre_fn=espacio_libre_gb, avisar_fn=_avisar, dormir=time.sleep, asignar_fn=_asignar,
            buscar_fn=_buscar, traer_fn=_traer_en_fondo, forzar=False, curar_fn=None,
            servicios_fn=_servicios, medidores_fn=_levantar_por_medidores, worktrees_fn=None,
            reparar_fn=None, explabs_fn=None, relevo_fn=None, a1_fn=None, lider_fn=None):
    """Una pasada completa. Devuelve lo que vio y lo que hizo (también queda en ESTADO).
    `forzar` (el botón «Reactivar directores»): todo ya, sin los tiempos mínimos."""
    ahora = ahora if ahora is not None else time.time()
    estado = _leer_json(ESTADO, {}) if ESTADO else {}
    hechos = []

    # IND1029C: el líder de dirección decide lo compartido (colmena, nube, medidores, relevos y
    # el A1); quien no lo es solo repara ESTA máquina (reiniciar Genesis y limpiar su disco).
    # Sin red o sin puerta, `lider_direccion` da líder en local, como hoy.
    comprobar = lider_fn or (liderazgo if limpiar_fn is limpiar else None)
    es_lider, espera = True, ""
    if comprobar:
        r = comprobar() or {}
        if not r.get("soy", True):
            es_lider, espera = False, "espera: dirige %s" % quien_dirige(r)
            hechos.append(espera)

    sondas = []
    for i in range(SONDAS):
        ok = sondear_fn()
        sondas.append(ok)
        if ok:
            break
        if i < SONDAS - 1:
            dormir(ESPERA_ENTRE_SONDAS_S)
    reiniciar, porque = decidir_reinicio(
        sondas, ahora, estado.get("ultimo_reinicio"),
        publicacion_en_marcha(_leer_json(PUBLICACION, {})))
    if reiniciar:
        try:
            reiniciar_fn()
            estado["ultimo_reinicio"] = ahora
            hechos.append("Genesis reiniciado: %s" % porque)
            avisar_fn("Autocuración: Genesis %s y lo he reiniciado solo." % porque)
        except Exception as e:
            hechos.append("no pude reiniciar Genesis: %s" % e)

    libre = libre_fn()
    ids = ids_a_limpiar(libre)
    # Limpieza de worktrees y node_modules.
    # (2026-10-23, medido) Este paso NUNCA corría: leía `estado["raiz_wt"]`, `estado["repo"]` y
    # `estado["git_fn"]` del JSON de estado, que no los tiene, y cada pasada acababa en
    # KeyError('raiz_wt') (era lo único que decía `hechos`). Resultado: 52 worktrees y 5,3 GB en
    # starseed-wt, uno de ellos con node_modules propio de 1,5 GB, y la Mac con 3,6 GB libres.
    # Ahora usa las rutas reales; con una `limpiar_fn` inyectada (pruebas) no toca el disco real.
    wt_fn = worktrees_fn or (limpiar_worktrees if limpiar_fn is limpiar else None)
    if wt_fn and (libre is None or libre < 2 * DISCO_AVISO_GB or forzar
                  or ahora - float(estado.get("ultima_limpieza_wt") or 0) > 86400):
        try:
            r = wt_fn() or {}
            estado["ultima_limpieza_wt"] = ahora
            if r.get("quitados") or r.get("nm_borrados"):
                linea = "quité %d worktree(s) cerrado(s) y %d node_modules duplicado(s)" % (
                    len(r.get("quitados") or []), len(r.get("nm_borrados") or []))
                hechos.append("worktrees: " + linea)
                avisar_fn("Autocuración: " + linea + ".")
            if r.get("errores"):
                hechos.append("worktrees: %d error(es): %s" % (len(r["errores"]), r["errores"][0][:160]))
        except Exception as e:
            hechos.append("no pude limpiar los worktrees: %s: %s" % (type(e).__name__, e))
    if ids and (forzar or ahora - (estado.get("ultima_limpieza") or 0) >= LIMPIEZA_MINIMA_S):
        r = limpiar_fn(ids)
        estado["ultima_limpieza"] = ahora
        limpiados = r.get("limpiados") or []
        hechos.append("disco con %.1f GB: limpiado %s" % (libre, ", ".join(limpiados) or (r.get("detalle") or "nada")))
        if limpiados:
            avisar_fn("Autocuración: quedaban %.1f GB libres y limpié lo regenerable (%s)." % (libre, ", ".join(limpiados)))
        try:  # y lo que su lista blanca no ve; con una limpiar_fn inyectada (pruebas) no se toca el disco real
            import limpieza_caches as LC
            hecho = LC.aplicar(LC.plan(**LC.recoger(libre_fn())), LC.borrar, LC.recortar) if limpiar_fn is limpiar else []
            if hecho:
                hechos.append("disco con %.1f GB: %s" % (libre, LC.resumen(hecho)))
                avisar_fn("Autocuración: %s." % LC.resumen(hecho))
        except Exception as e:
            hechos.append("no pude limpiar las cachés fuera de la lista blanca: %s: %s" % (type(e).__name__, e))

    # Trabajadores parados con trabajo que se puede desatascar: se llenan solos.
    if es_lider and any(sondas):
        try:
            decision, aplicar = asignar_fn()
            llenar, porque_ll = decidir_llenado(decision, ahora,
                                                None if forzar else estado.get("ultimo_llenado"))
            if llenar:
                hechas = aplicar() or []
                estado["ultimo_llenado"] = ahora
                hechos.append("capacidad: %s" % porque_ll)
                avisar_fn("Autocuración: %s (%s)." % (porque_ll, "; ".join(hechas)[:400]))
        except Exception as e:
            hechos.append("no pude llenar los huecos: %s: %s" % (type(e).__name__, e))

    # Más capacidad fuera de la Mac (la nube), como el botón de Genesis, cada 30 min.
    if es_lider and any(sondas):
        toca, _porque_b = decidir_busqueda(ahora, None if forzar else estado.get("ultima_busqueda"))
        if toca:
            estado["ultima_busqueda"] = ahora
            try:
                r = buscar_fn() or {}
                if r.get("sumados"):
                    hechos.append("capacidad fuera de la Mac: %s" % "; ".join(r.get("hechas") or [])[:300])
            except Exception as e:
                hechos.append("no pude buscar capacidad: %s: %s" % (type(e).__name__, e))

    # Traer a main lo que hizo la nube y reparar lo que dejó a medias (en segundo plano).
    if es_lider and any(sondas):
        toca, _porque_t = decidir_busqueda(ahora, None if forzar else estado.get("ultimo_traer"),
                                           TRAER_MINIMO_S)
        if toca:
            estado["ultimo_traer"] = ahora
            try:
                traer_fn()
                hechos.append("traer la nube: pasada lanzada en segundo plano")
            except Exception as e:
                hechos.append("no pude lanzar traer la nube: %s: %s" % (type(e).__name__, e))

    # Servicios caídos (cada 10 min; con `forzar` los revisa el propio reactivador).
    if not forzar and ahora - float(estado.get("ultimos_servicios") or 0) >= SERVICIOS_MINIMO_S:
        estado["ultimos_servicios"] = ahora
        try:
            r = servicios_fn() or {}
            if r.get("estado") in ("reparado", "fallo"):
                hechos.append("servicios: %s" % r.get("detalle"))
                avisar_fn("Autocuración: servicios de Genesis — %s." % r.get("detalle"))
        except Exception as e:
            hechos.append("no pude revisar los servicios: %s: %s" % (type(e).__name__, e))

    # Marcas viejas de «sin cupo» que el medidor de crédito desmiente (cada pasada; gratis).
    try:
        levantados = (medidores_fn(ahora) if es_lider else None) or []
        if levantados:
            linea = "medidores: %s vuelve(n) a tener cupo según su medidor; levanto su marca vieja de «sin cupo»" % (
                ", ".join(levantados))
            hechos.append(linea)
            avisar_fn("Autocuración: " + linea + ".")
    except Exception as e:
        hechos.append("no pude leer los medidores de crédito: %s: %s" % (type(e).__name__, e))

    # Enjambre atascado esperando proveedores que ya volvieron (punto 6).
    try:
        linea = ((curar_fn(estado, ahora, forzar) if curar_fn
                  else curar_enjambre(estado, ahora, forzar, medidores_fn=_aptos_medidores))
                 if es_lider else "")
        if linea:
            hechos.append(linea)
    except Exception as e:
        hechos.append("no pude revisar el enjambre: %s: %s" % (type(e).__name__, e))

    # 7 · Medidores en rojo (2026-10-23). Alex: «debería funcionar automáticamente por la
    # supervisión de los directores… actualmente no se repara solo». La comprobación de cada
    # medidor existía, pero nadie actuaba sobre lo que encontraba. Cada 10 min (o ya, con
    # «Reactivar directores») se lanza en segundo plano `reparar_medidor.py --todos`: comprueba
    # cada medidor y repara lo que tenga reparación conocida (el mismo camino que el botón
    # «Reparar» de Genesis), con su propio cerrojo y sus tiempos mínimos por medidor.
    rep_fn = reparar_fn or (_reparar_medidores_en_fondo if limpiar_fn is limpiar else None)
    if es_lider and rep_fn and any(sondas) and (forzar or ahora - float(estado.get("ultima_reparacion_medidores") or 0)
                                   >= REPARAR_MEDIDORES_MINIMO_S):
        estado["ultima_reparacion_medidores"] = ahora
        try:
            rep_fn(forzar)
            hechos.append("medidores: comprobación y reparación lanzadas en segundo plano")
        except Exception as e:
            hechos.append("no pude lanzar la reparación de medidores: %s: %s" % (type(e).__name__, e))

    # 8. Promociones de Experiential Labs: Jev gratis y revisores en promoción se actualizan solos.
    exp_fn = explabs_fn or (_explabs_en_fondo if limpiar_fn is limpiar else None)
    if es_lider and exp_fn and (forzar or ahora - float(estado.get("ultima_explabs") or 0) >= EXPLABS_MINIMO_S):
        estado["ultima_explabs"] = ahora
        try:
            exp_fn()
        except Exception as e:
            hechos.append("no pude actualizar las promociones de Experiential Labs: %s" % type(e).__name__)

    # 9 · Relevo del carril de Claude (REL1026A, 2026-10-26). Alex: «los directores y agentes dejaron de funcionar
    # cuando terminó tu crédito… arréglalo para que pueda funcionar y autorrepararse autónomamente». Lo que Claude
    # reparte a sus agentes queda anotado en el carril; si Claude calla o se agota su límite, aquí (cero créditos)
    # pasa a una cola de MetaGenesis que el enjambre gratuito toma solo. Cada pasada; no hace nada si no toca.
    rel_fn = relevo_fn or (_relevo_claude if limpiar_fn is limpiar else None)
    if es_lider and rel_fn:
        try:
            r = rel_fn() or {}
            if r.get("relevado"):
                linea = "carril de Claude relevado (%s): %s" % (
                    r.get("motivo"), ("%d tarea(s) a %s" % (r.get("tareas") or 0, r.get("cola"))) if r.get("cola")
                    else "lo abierto ya estaba en main")
                hechos.append(linea)
                avisar_fn("Autocuración: " + linea + ". El enjambre gratuito sigue con ello; Claude no lo repetirá al volver.")
        except Exception as e:
            hechos.append("no pude revisar el carril de Claude: %s: %s" % (type(e).__name__, e))

    # 10 · El A1 de Oracle (CAP1026J, 2026-10-26). Alex: «¿Quieres que el A1 se reinicie solo cuando deje de
    # responder? sí, es obvio que si te pido que se repare automáticamente también considere eso y más». Medido ese
    # día: ~6,6 h colgado (Oracle «RUNNING», SSH sin saludo) sin que nadie lo viera. `a1_autocuracion.py` lo sondea,
    # reinicia sus servicios caídos y, si la máquina está colgada o parada, la reinicia o la arranca por Oracle.
    a1 = a1_fn or (_a1_en_fondo if limpiar_fn is limpiar else None)
    if es_lider and a1:
        try:
            a1()
        except Exception as e:
            hechos.append("no pude lanzar la autocuración del A1: %s" % type(e).__name__)

    if espera:
        estado["espera"] = espera
    else:
        estado.pop("espera", None)
    estado.update({"visto": time.strftime("%Y-%m-%d %H:%M:%S"), "responde": any(sondas), "es_lider": es_lider,
                   "por_que": porque, "libre_gb": None if libre is None else round(libre, 1),
                   "hechos": hechos})
    _guardar(estado)
    return estado


if __name__ == "__main__":
    print(json.dumps(revisar(), ensure_ascii=False, indent=1))
