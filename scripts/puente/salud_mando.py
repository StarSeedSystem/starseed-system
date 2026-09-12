# -*- coding: utf-8 -*-
"""Salud del Puente de Mando: módulo puro (sin IO), cada medidor con veredicto y remedio."""

try:
    from scripts.puente.identidad_tarea import esta_integrada
except ImportError:  # ejecución desde scripts/puente
    from identidad_tarea import esta_integrada

_FRESCO_S = 600
_APROBACION_MAX_S = 30 * 60
_DISCO_MIN_GB = 5.0


def _frescos(latidos, ahora):
    """Cuántos latidos tienen sello más joven que _FRESCO_S segundos."""
    n = 0
    for lat in (latidos or {}).values():
        try:
            n += 1 if ahora - float(lat.get("ts", 0)) < _FRESCO_S else 0
        except (TypeError, ValueError, AttributeError):
            continue
    return n


def _m(nombre, ok, valor, esperado, remedio):
    return {
        "medidor": nombre,
        "ok": ok,
        "valor": valor,
        "esperado": esperado,
        "remedio": remedio,
    }


def medidores(estado, latidos, progreso, servicios, disco_gb, ahora):
    """Lista de {medidor, ok, valor, esperado, remedio} por cada medidor."""
    frescos = _frescos(latidos, ahora)
    tareas = estado.get("pendientes_detalle") or []
    reales = [
        t for t in tareas if not esta_integrada(t, estado.get("asuntos_main") or [])
    ]
    pend_cab = int(estado.get("pendientes", len(reales)))
    n_reales = len(reales)

    en_curso = int(estado.get("en_curso", 0))
    m1 = _m(
        "en_curso_honesto",
        en_curso == frescos,
        en_curso,
        frescos,
        "corregir la cabecera con los latidos frescos",
    )
    m2 = _m(
        "pendientes_reales",
        pend_cab == n_reales,
        pend_cab,
        n_reales,
        "descontar las ya integradas en main (id u «ola · id»)",
    )

    orq_ok = frescos > 0
    remedio = (
        ""
        if orq_ok
        else ("vigilante debe relanzar" if n_reales > 0 else "sin pendientes: normal")
    )
    m3 = _m(
        "orquestador",
        orq_ok or n_reales == 0,
        "vivo" if orq_ok else "caído",
        "latido fresco",
        remedio,
    )

    servicios = servicios or []
    caidos = [n for (n, _p, s) in servicios if s != "ok"]
    m4 = _m(
        "servicios_launchd",
        not caidos,
        f"{len(servicios) - len(caidos)}/{len(servicios)}",
        "todos com.starseed.* con pid",
        "bash scripts/puente/instalar-servicios.sh" if caidos else "",
    )

    m5 = _m(
        "disco",
        disco_gb > _DISCO_MIN_GB,
        f"{disco_gb:g} GB",
        f">{_DISCO_MIN_GB:g} GB",
        "liberar espacio en el volumen del repo",
    )

    quietas = [
        t
        for t in (progreso.get("esperando_aprobacion") or [])
        if ahora - float(t.get("desde", ahora)) > _APROBACION_MAX_S
    ]
    m6 = _m(
        "esperando_aprobacion_quietas",
        not quietas,
        len(quietas),
        0,
        "starseed-puente aprobar/rechazar para desatascar",
    )
    return [m1, m2, m3, m4, m5, m6]


def resumen(lista):
    """Una línea para el canal: «SALUD · 5/6 ok · falla: disco (3 GB)»."""
    ok = sum(1 for m in lista if m.get("ok"))
    fallas = ", ".join(
        f"{m['medidor']} ({m['valor']})" for m in lista if not m.get("ok")
    )
    return f"SALUD · {ok}/{len(lista)} ok" + (f" · falla: {fallas}" if fallas else "")
