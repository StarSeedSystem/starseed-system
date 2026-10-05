# -*- coding: utf-8 -*-
"""Autocuración del Puente de Mando en la Mac: se repara solo, sin que nadie lo pida.

Alex (2026-10-05, 02:15): «de nuevo no carga el puente de mando, eso debería el propio
puente autorrepararse sin tener que pedírtelo aquí, directo del puente debería
automáticamente repararse y funcionar».

Había vigilantes de todo menos del propio Mando. Este módulo cubre lo que sí se puede
arreglar desde la máquina (lo de la pestaña lo arregla `src/lib/mando/autocuracion-pagina.ts`):

1. **El servidor no responde.** En cada pasada del vigía de medidores (cada 120 s) se sondea
   `/api/mando/latido` hasta tres veces. Si las tres fallan y no hay una publicación o una
   reconstrucción reiniciándolo a propósito, se reinicia con `reconstruir_mando.reiniciar_mando()`
   —el mismo camino, con su cerrojo, que usa la publicación— y como mucho una vez cada 10 min.
2. **El disco se queda corto.** Por debajo de 6 GB libres se limpia lo regenerable con la
   MISMA lista blanca del Mando (`POST /api/mando/almacenamiento {accion: "limpiar"}`):
   cachés de npm, Playwright, registros de Drive y de olas viejas. La caché de builds de Next
   solo se toca por debajo de 3 GB, porque sin ella la siguiente compilación tarda mucho más.
   La publicación usa la misma función antes de rendirse por falta de sitio.

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
DISCO_AVISO_GB = 6.0
DISCO_CRITICO_GB = 3.0

#: Lo regenerable que se limpia antes (ids de `candidatosRegenerables` en almacenamiento.ts).
LIMPIABLES = ("npm-cache", "playwright", "drivefs-logs", "olas-logs", "node-cache")
#: La caché de builds de Next: solo en disco crítico.
LIMPIABLES_CRITICO = ("next-cache",)

#: Pasos de una publicación en los que el Mando se para o se reinicia a propósito.
PASOS_QUE_LO_PARAN = ("build", "push", "verificar")


# ── decisiones (puras) ──────────────────────────────────────────────────────────

def decidir_reinicio(sondas_ok, ahora, ultimo_reinicio, publicacion_en_marcha=False,
                     minimo_s=REINICIO_MINIMO_S):
    """PURA. ¿Hay que reiniciar el Mando? Devuelve (sí/no, por qué).

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
    """PURA. ¿La publicación está en un paso que para o reinicia el Mando?"""
    if not isinstance(datos, dict) or datos.get("estado") != "corriendo":
        return False
    for paso in datos.get("pasos") or []:
        if paso.get("clave") in PASOS_QUE_LO_PARAN and paso.get("estado") == "corriendo":
            return True
    return False


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
    """True si el Mando contesta 2xx a una lectura ligera."""
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
    """Pide al Mando que limpie esos regenerables con SU lista blanca. Devuelve su respuesta."""
    if not ids:
        return {"ok": True, "limpiados": [], "detalle": "nada que limpiar"}
    cuerpo = json.dumps({"accion": "limpiar", "ids": list(ids)}).encode("utf-8")
    req = urllib.request.Request(MANDO + "/api/mando/almacenamiento", data=cuerpo, method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=tope_s) as r:
            return json.loads(r.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, ValueError) as e:
        return {"ok": False, "limpiados": [], "detalle": "el Mando no pudo limpiar: %s" % e}


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


def revisar(ahora=None, sondear_fn=sondear, reiniciar_fn=_reiniciar, limpiar_fn=limpiar,
            libre_fn=espacio_libre_gb, avisar_fn=_avisar, dormir=time.sleep):
    """Una pasada completa. Devuelve lo que vio y lo que hizo (también queda en ESTADO)."""
    ahora = ahora if ahora is not None else time.time()
    estado = _leer_json(ESTADO, {}) if ESTADO else {}
    hechos = []

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
            hechos.append("Mando reiniciado: %s" % porque)
            avisar_fn("Autocuración: el Mando %s y lo he reiniciado solo." % porque)
        except Exception as e:
            hechos.append("no pude reiniciar el Mando: %s" % e)

    libre = libre_fn()
    ids = ids_a_limpiar(libre)
    if ids and ahora - (estado.get("ultima_limpieza") or 0) >= LIMPIEZA_MINIMA_S:
        r = limpiar_fn(ids)
        estado["ultima_limpieza"] = ahora
        limpiados = r.get("limpiados") or []
        hechos.append("disco con %.1f GB: limpiado %s" % (libre, ", ".join(limpiados) or (r.get("detalle") or "nada")))
        if limpiados:
            avisar_fn("Autocuración: quedaban %.1f GB libres y limpié lo regenerable (%s)." % (libre, ", ".join(limpiados)))

    estado.update({"visto": time.strftime("%Y-%m-%d %H:%M:%S"), "responde": any(sondas),
                   "por_que": porque, "libre_gb": None if libre is None else round(libre, 1),
                   "hechos": hechos})
    _guardar(estado)
    return estado


if __name__ == "__main__":
    print(json.dumps(revisar(), ensure_ascii=False, indent=1))
