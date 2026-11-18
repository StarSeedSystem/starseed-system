# -*- coding: utf-8 -*-
"""Ritmo y contrapresión del Maggabit (MAG1117): un trabajo a la vez.

Decisión PURA: `siguiente(...)` elige el trabajo más atrasado o renuncia con un
motivo claro. La E/S (reloj, subprocess, disco) vive fuera, inyectada por quien
llama. Regla aprendida el 17-11: tres copias a la vez con la Mac paginando
dejaron el disco a 1 MB/s; aquí nunca hay más de una copia y se frena con
`limite_kbps` cuando hay presión.
"""
from typing import Optional

# Segundos de silencio entre copias, por familia.
RITMOS_S = {
    "repos-locales": 300,
    "memoria": 300,
    "repos-github": 900,
    "codigo": 900,
    "desarrollo": 1800,
    "estado": 1800,
    "drive": 1800,
    "instaladores": 3600,
    "boveda": 3600,
    "versiones": 86400,
    "verificar": 86400,
}

# Freno del --bwlimit de rsync según presión del disco interno (kbps).
LIMITES_KBPS = {1: 20000}


def limite_kbps(presion: int) -> Optional[int]:
    """Freno para el --bwlimit de rsync: None sin presión, 20000 kb/s con una."""
    return LIMITES_KBPS.get(presion)


def _renuncia(motivo: str) -> dict:
    return {"trabajo": None, "motivo": motivo}


def siguiente(
    ahora: float,
    medio: dict,
    interno_libre_gb: float,
    presion: int,
    ultimas: dict,
    en_marcha: Optional[str],
) -> dict:
    """Elige el trabajo más atrasado, o renuncia con un motivo en claro."""
    if medio.get("estado") != "listo":
        return _renuncia("disco %s: sin trabajo" % medio.get("estado", "desconocido"))
    if en_marcha:
        return _renuncia("trabajo en marcha: %s" % en_marcha)
    if interno_libre_gb < 3:
        return _renuncia(
            "disco interno con %.1f GB libres (< 3): copia detenida" % interno_libre_gb
        )
    if presion >= 2:
        return _renuncia("presión %d sobre el disco interno: copia detenida" % presion)

    candidatos = [
        trabajo
        for trabajo in RITMOS_S
        if trabajo != "boveda" or medio.get("boveda") == "abierta"
    ]
    atrasados = [
        (trabajo, (ahora - float(ultimas.get(trabajo, 0.0))) / RITMOS_S[trabajo])
        for trabajo in candidatos
        if (ahora - float(ultimas.get(trabajo, 0.0))) >= RITMOS_S[trabajo]
    ]
    if not atrasados:
        return _renuncia("todo al día: nada supera su ritmo")
    trabajo, atraso = max(atrasados, key=lambda par: (par[1], -RITMOS_S[par[0]]))
    return {
        "trabajo": trabajo,
        "motivo": "%s atrasado %d s (ritmo %d s)"
        % (trabajo, int(atraso * RITMOS_S[trabajo]), RITMOS_S[trabajo]),
    }
