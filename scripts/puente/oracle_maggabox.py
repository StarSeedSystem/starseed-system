#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Oracle de la Maggabox — lado Mac del préstamo a la Maggabox (ALM1125B).

Decisiones PURAS, sin efectos (ni ssh ni git). Es el espejo de
`scripts/puente/oracle_nodo.py` para el nodo de la Maggabox
(`maggasukha@starseed-nodo-1.local`, ~/.ssh/starseed_nodo1). Véase
architecture/almacenamiento-distribuido.md, «Maggabox como medio de trabajo».
"""
from __future__ import annotations

import calendar
import os
import re
import time

HOME = os.path.expanduser("~")
#: Mismo SSH_BASE que sonda_maggabox.py (DIR1125O: IPv4, known_hosts expandido, sin entrada estándar).
SSH_BASE = [
    "ssh",
    "-i", os.path.expanduser("~/.ssh/starseed_nodo1"),
    "-o", "AddressFamily=inet",
    "-n",
    "-o", "IdentitiesOnly=yes",
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=8",
    "-o", "UserKnownHostsFile=" + os.path.expanduser("~/.ssh/known_hosts_starseed_nodo"),
    "maggasukha@starseed-nodo-1.local",
]

PREFIJO_COLA = "colas/maggabox-"
PREFIJO_ENTREGA = "nube/mg-"
USUARIO_SSH = "maggasukha"
#: Cuánto debe llevar una cola sin tomar antes de no volver a lanzar.
ESPERA_ENTRE_LANZAMIENTOS_S = 20 * 60
#: Un latido de menos de esto se considera nodo vivo.
LATIDO_VIVO_S = 600
#: Gracia (s) para devolver una cola del A1/Maggabox que nunca terminó.
GRACIA_S = 3 * 3600
#: Disco libre mínimo de la Maggabox para aceptar un trabajador.
DISCO_MAGGABOX_MIN_GB = 30
#: RAM libre mínima por trabajador en la Maggabox.
RAM_MIN_TRABAJADOR_MB = 1536


def nodo_vivo(estado, ahora, max_s=LATIDO_VIVO_S):
    """PURA. ¿Late la Maggabox? (su latido tiene menos de max_s segundos)."""
    try:
        return ahora - float((estado or {}).get("latido") or 0) < max_s
    except (TypeError, ValueError):
        return False


def decidir_lanzar_maggabox(estado, ahora, ultimo_lanzamiento, colas_sin_tomar):
    """PURA. (lanzar, motivo). Solo con la Maggabox viva, sin cola en marcha,
    sin una cola suya esperando a que la tome y sin otro lanzamiento hace menos de 20 min."""
    if not nodo_vivo(estado, ahora):
        return False, "la Maggabox no late"
    if (estado or {}).get("fase") == "cola":
        return False, "la Maggabox ya trabaja una cola (%s)" % ((estado or {}).get("cola") or "?")
    if colas_sin_tomar:
        return False, "la Maggabox aún no ha tomado %s" % ", ".join(colas_sin_tomar)
    if ultimo_lanzamiento and ahora - float(ultimo_lanzamiento) < ESPERA_ENTRE_LANZAMIENTOS_S:
        return False, "lanzado hace %d min" % int((ahora - float(ultimo_lanzamiento)) / 60)
    return True, "Maggabox libre"


def rama_de_cola(ts):
    """PURA. Rama de la cola que se deja en GitHub: colas/maggabox-<YYYYMMDD-HHMMSS>."""
    if isinstance(ts, (int, float)):
        stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime(ts))
    else:
        stamp = str(ts)
    return "%s%s" % (PREFIJO_COLA, stamp)


def devolver_de_maggabox(progreso, lanzamientos, colas_mg, vivo, ahora, colas_vivas=(),
                         gracia_s=GRACIA_S):
    """PURA. Los ids `reasignada · maggabox` que vuelven a la cola de la Mac.
    Préstamo, no traspaso (como devolver_de_oracle). `lanzamientos`: [{rama, ids, t}];
    `colas_mg`: {rama: historial} de las que la Maggabox ya terminó;
    `colas_vivas`: las que el nodo tiene EN CURSO ahora."""
    terminadas = set(colas_mg or {})
    vivas = set(colas_vivas or ())
    vuelven = set()
    for l in lanzamientos or []:
        rama = l.get("rama")
        if rama in terminadas or (not vivo and ahora - float(l.get("t") or 0) > gracia_s):
            vuelven |= set(l.get("ids") or [])
    for tid, entrada in (progreso or {}).items():
        if not isinstance(entrada, dict) or entrada.get("estado") != "reasignada" \
                or (entrada.get("medio") or "") != "maggabox" or tid in vuelven:
            continue
        for rama in re.findall(r"colas/maggabox-\d{8}-\d{6}", str(entrada.get("nota") or "")):
            if rama in vivas:
                continue
            if rama in terminadas:
                vuelven.add(tid)
                break
            try:
                nacida = calendar.timegm(time.strptime(rama[len(PREFIJO_COLA):], "%Y%m%d-%H%M%S"))
            except ValueError:
                continue
            if ahora - nacida > GRACIA_S:
                vuelven.add(tid)
                break
    return sorted(tid for tid in vuelven
                  if isinstance((progreso or {}).get(tid), dict)
                  and progreso[tid].get("estado") == "reasignada"
                  and (progreso[tid].get("medio") or "") == "maggabox")


def debe_prestar(nivel_disco, estado_mg, ahora):
    """PURA. (sí, no, motivo). ¿Esta neurona (Mac) presta tareas a la Maggabox?
    Solo cuando el disco de la Mac está bajo (sin_tareas / sin_pesados) y la
    Maggabox está viva con disco y RAM para un trabajador."""
    if nivel_disco not in ("sin_tareas", "sin_pesados"):
        return False, "disco de esta neurona %s: no hay que prestar" % nivel_disco
    m = estado_mg or {}
    if (m or {}).get("fase") == "cola":
        return False, "la Maggabox ya trabaja una cola"
    try:
        disco = float(m.get("disco_libre_gb") or 0)
    except (TypeError, ValueError):
        disco = 0.0
    if disco < DISCO_MAGGABOX_MIN_GB:
        return False, "la Maggabox tiene %.1f GB libres (< %d): no cabe" % (disco, DISCO_MAGGABOX_MIN_GB)
    try:
        ram = float(m.get("ram_libre_mb") or 0)
    except (TypeError, ValueError):
        ram = 0.0
    if ram < RAM_MIN_TRABAJADOR_MB:
        return False, "la Maggabox tiene %d MB libres (< %d): no cabe un trabajador" % (ram, RAM_MIN_TRABAJADOR_MB)
    return True, "Mac %s y Maggabox con %.1f GB / %d MB: se presta" % (nivel_disco, disco, int(ram))
