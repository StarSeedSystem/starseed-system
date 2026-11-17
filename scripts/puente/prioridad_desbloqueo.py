#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prioridad de desbloqueo (DSB1116A · DSB01): convierte un bloqueo de compilación o de publicación
en una tarea URGENTE de la cola, sin interrumpir los procesos en marcha. Módulo PURO: sin red, sin
reloj, sin disco; todo se inyecta. Si hay los dos bloqueos a la vez, gana la compilación.
Nunca imprime ni guarda secretos: lo que parezca una clave se tacha con «clave».
"""
import hashlib
import re

#: Tope de caracteres de la evidencia que acompaña al motivo.
TOPE_EVIDENCIA = 1200

#: Colores ANSI de terminal: se quitan antes de guardar o recortar la evidencia.
_RE_ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")

#: Formas de clave que no deben salir jamás del bloqueo, ni en pruebas ni en prompts.
_RE_CLAVE = re.compile(
    r"(sk-[A-Za-z0-9_\-]{4,}|ak_[A-Za-z0-9_\-]{4,}|ghp_[A-Za-z0-9_\-]{4,}|[0-9a-fA-F]{32,})")
TACHON = "«clave»"


def limpiar(texto, tope=TOPE_EVIDENCIA):
    """Texto listo para la evidencia: sin colores ANSI, claves tachadas y como mucho `tope` caracteres."""
    limpio = _RE_ANSI.sub("", str(texto or ""))
    return _RE_CLAVE.sub(TACHON, limpio)[:tope]


def _texto_de_prueba(prueba):
    """La salida del fallo de la compilación, si la hay: `fallo` puede ser un dict con `paso`
    (como escribe el director de pruebas) o directamente un texto."""
    f = (prueba or {}).get("fallo")
    if isinstance(f, dict):
        return str(f.get("paso") or f.get("detalle") or "")
    return str(f or "")


def _texto_de_publicacion(publicacion):
    """La salida de la puerta que frenó la publicación: `evidencia.texto` si está, y si no el detalle."""
    p = publicacion or {}
    ev = p.get("evidencia")
    if isinstance(ev, dict) and ev.get("texto"):
        return str(ev.get("texto"))
    return str(p.get("detalle") or "")


def _resumen_de(clase, prueba, publicacion):
    """Una frase corta con lo que pasó, sin inventar nada que no venga en los datos."""
    if clase == "compilacion":
        numero = (prueba or {}).get("numero")
        detalle = _texto_de_prueba(prueba)
        base = "La compilación de la prueba %s falló" % numero if numero else "La compilación falló"
        return "%s: %s" % (base, detalle[:160]) if detalle else base
    detalle = str((publicacion or {}).get("detalle") or "").strip()
    base = "La publicación está bloqueada"
    return "%s: %s" % (base, detalle[:160]) if detalle else base


def _clave_de(clase, sha):
    """Clase + los 9 primeros caracteres del sha: la misma situación da la misma clave."""
    return "%s-%s" % (clase, str(sha or "")[:9])


def motivo_de_bloqueo(prueba, publicacion):
    """PURA. None si nada está bloqueado; si no, un dict {clase, clave, resumen, evidencia}.
    `prueba` es el dict `en_curso` del director de pruebas y `publicacion` el contenido de
    `autopublicar-estado.json`. Si hay bloqueo de compilación Y de publicación, gana la compilación."""
    p, pub = prueba or {}, publicacion or {}
    if p.get("estado") == "fallo":
        clase, sha, texto = "compilacion", p.get("sha"), _texto_de_prueba(p)
    elif pub.get("fase") == "bloqueado":
        clase, sha, texto = "publicacion", pub.get("sha"), _texto_de_publicacion(pub)
    else:
        return None
    return {
        "clase": clase,
        "clave": _clave_de(clase, sha),
        "resumen": _resumen_de(clase, p, pub),
        "evidencia": limpiar(texto),
    }


OLA_DESBLOQUEO = "Directores · desbloqueo urgente"


def tarea_de_arreglo(motivo):
    """PURA. La cola con UNA tarea urgente que arregla lo que bloqueó. El mismo motivo (misma
    clave) da el mismo id, para que dejarla dos veces no la duplique."""
    m = motivo or {}
    clave = str(m.get("clave") or "")
    clase = str(m.get("clase") or "bloqueo")
    id_de_cola = "DSB" + hashlib.sha256(clave.encode("utf-8")).hexdigest()[:5]
    resumen = limpiar(m.get("resumen"), 200) or "Algo del sistema está bloqueado"
    evidencia = limpiar(m.get("evidencia"))
    tarea = {
        "id": id_de_cola,
        "ola": OLA_DESBLOQUEO,
        "titulo": "URGENTE · %s" % resumen[:110],
        "urgente": True,
        "archivos": [],
        "depende": [],
        "clave_desbloqueo": clave,
        "prompt": (
            "TAREA URGENTE DE DESBLOQUEO (%s): %s. Esta es la evidencia del bloqueo:\n```\n%s\n```\n"
            "Encuentra la causa en el archivo que nombra la evidencia (si nombra varios, empieza por el "
            "primero) y arregla SOLO eso: el arreglo mínimo para que compile y publique de nuevo. No toques "
            "los frenos de la publicación ni las pruebas ajenas, no relajes comprobaciones y no cambies "
            "ningún archivo que la evidencia no mencione. Si en la evidencia no hay archivo que nombrar, "
            "dilo en tu informe en vez de inventar la causa." % (clase, resumen, evidencia)),
    }
    return {"ola": OLA_DESBLOQUEO, "tareas": [tarea]}


def ya_pedida(clave, nombres_de_colas):
    """PURA. True si entre los nombres de las colas vivas hay uno que contiene la clave:
    el desbloqueo ya está pedido y no hace falta repetirlo."""
    c = str(clave or "")
    return bool(c) and any(c in str(n or "") for n in (nombres_de_colas or []))
