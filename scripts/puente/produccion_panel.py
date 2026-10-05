# -*- coding: utf-8 -*-
"""produccion_panel · §9 del contrato director-produccion: panel de respaldo (CrewAI).

Cuando Jev no responde en la puerta 3, decide un equipo de cuatro roles, cada uno con
un modelo gratuito DISTINTO de la flota (patrón CrewAI, sin dependencia nueva):
lanzamiento (propósito y coherencia), qa (pruebas y regresión), seguridad (secretos,
datos y permisos, con VETO) y sre (medios y reversión).

`decidir_panel(candidata, llamar=…)` → {publicar, votos, motivos}: mayoría de los que
respondan (mínimo MINIMO_RESPUESTAS); si seguridad dice no, no se publica. Tope total
de 60 s y un rol que no responde no cuenta. La red solo la toca `llamar` (inyectable;
por defecto `optimizador_panel.llamar_modelo_real`).
"""

import concurrent.futures
import json
import time

TIEMPO_TOTAL_MAX = 60
MINIMO_RESPUESTAS = 3

ROLES = {
    "lanzamiento": "Responsable de lanzamiento. Juzga propósito y coherencia.",
    "qa": "QA. Juzga pruebas y riesgo de regresión.",
    "seguridad": "Seguridad. Juzga secretos, datos y permisos.",
    "sre": "SRE. Juzga medios afectados y plan de reversión.",
}

_SI = ("si", "sí", "s", "yes", "true", "1")


def prompt_rol(rol, candidata):
    """Una sola pregunta tipada (publicar sí/no, con motivo de una línea)."""
    paquete = json.dumps(candidata or {}, ensure_ascii=False, default=str)[:4000]
    return (
        "Eres el rol «" + rol + "» del panel de respaldo del director de producción "
        "de StarSeed OS. " + ROLES[rol] + " Sobre este paquete de contexto de la "
        "candidata, responde SOLO con un JSON: "
        '{\"publicar\": \"si\"|\"no\", \"motivo\": \"una línea\"}.\n\n'
        "Paquete:\n" + paquete
    )


def parsear_respuesta(texto):
    """{publicar: bool, motivo: str} del JSON de salida del rol, o None si no vale."""
    if not isinstance(texto, str) or "{" not in texto:
        return None
    principio, fin = texto.find("{"), texto.rfind("}")
    if fin <= principio:
        return None
    try:
        datos = json.loads(texto[principio:fin + 1])
    except ValueError:
        return None
    if not isinstance(datos, dict) or "publicar" not in datos:
        return None
    crudo = datos.get("publicar")
    publicar = crudo if isinstance(crudo, bool) else str(crudo).strip().lower() in _SI
    motivo = str(datos.get("motivo") or "").strip().splitlines()
    return {"publicar": publicar, "motivo": (motivo[0] if motivo else "")[:200]}


def _preguntar_rol(rol, modelo, candidata, llamar, tope):
    """Una llamada; (rol, modelo, respuesta) con respuesta None si el rol no vale."""
    limite = tope - time.monotonic()
    if limite <= 0 or llamar is None:
        return rol, modelo, None
    try:
        texto = llamar(modelo, prompt_rol(rol, candidata))
    except Exception:
        texto = None
    return rol, modelo, parsear_respuesta(texto)


def _decidir_con_votos(votos):
    """Mayoría de los que respondieron, con veto de seguridad. PURA."""
    voto_seg = votos.get("seguridad")
    if voto_seg is not None and not voto_seg["publicar"]:
        return False
    si = sum(1 for v in votos.values() if v["publicar"])
    return si * 2 > len(votos)
def decidir_panel(candidata, llamar=None, modelos=None, segundos=None):
    """Cuatro roles con modelos distintos. `modelos`: dict rol→modelo o lista de
    modelos (se asignan en orden). Devuelve {publicar, votos, motivos, modelos}."""
    import optimizador_panel  # elegir_panel / llamar_modelo_real ya existen (§9)
    if llamar is None:
        llamar = optimizador_panel.llamar_modelo_real
    nombres = list(ROLES)
    if isinstance(modelos, dict):
        asignacion = {r: str(modelos.get(r) or "") for r in nombres}
    else:
        utiles = list(modelos) if modelos else optimizador_panel.elegir_panel(
            {}, [], k=len(nombres))
        asignacion = dict(zip(nombres, utiles + [""] * (len(nombres) - len(utiles))))
    tope = time.monotonic() + float(segundos or TIEMPO_TOTAL_MAX)
    votos, motivos = {}, {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(nombres)) as pool:
        futuros = [pool.submit(_preguntar_rol, r, asignacion[r], candidata,
                               llamar, tope) for r in nombres if asignacion[r]]
        restante = max(0.0, tope - time.monotonic())
        pendientes = []
        try:
            for futuro in concurrent.futures.as_completed(futuros, timeout=restante):
                pendientes.append(futuro)
        except concurrent.futures.TimeoutError:  # rol colgado: no cuenta
            pass
        for futuro in futuros:
            futuro.cancel()
        for futuro in pendientes:
            rol, modelo, respuesta = futuro.result()
            if respuesta is not None:
                votos[rol] = respuesta
                motivos[rol] = respuesta["motivo"]
    publicar = len(votos) >= MINIMO_RESPUESTAS and _decidir_con_votos(votos)
    return {
        "publicar": publicar,
        "votos": {r: v["publicar"] for r, v in votos.items()},
        "motivos": motivos,
        "modelos": asignacion,
    }
