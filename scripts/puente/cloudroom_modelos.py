#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Qué modelos de la nube de Cloudroom pueden abrir un hilo AHORA y en qué rueda se reparten
(Ola 1024C, CRM1024J · contrato `architecture/cloudroom-servidor-agentes.md` §4.3).

Alex (2026-10-24): «no solo está Codex para Cloudroom, tenemos una librería inmensa de catálogos de
APIs de modelos gratuitos de varios proveedores». Hasta hoy `cloudroom_lanzar` abría todos los hilos
con el primer modelo de Codex, que gasta la MISMA cuota de ChatGPT que el enjambre de la Mac.

Las reglas, en el orden en que se prueban los candidatos:
1. **opencode y pi** (sin cuota de suscripción): sus modelos del catálogo de la nube cuyo proveedor
   (el prefijo «nvidia/…», «xkiro/…»; si no hay, el `provider` del harness) ni es de pago, ni es de
   los que no escriben código del enjambre, ni está retirado, ni consta caído o sin cupo en la salud
   compartida (`~/.starseed/salud-proveedores.json`, «nvidia» se llama «nim» allí). Se intercalan por
   proveedor: dos hilos seguidos no caen en el mismo.
2. **codex** mientras su medidor (`~/.starseed/medidores-credito.json`) esté por debajo del 80 % en
   todas sus ventanas vigentes; nunca `gpt-reserve` ni `codex-auto-review`, que no escriben código.
3. **los demás harnesses** (cursor, hermes, devin…), solo si la nube les lista modelos.
4. **claude-code**: solo sonnet o haiku (uno por familia) y solo con la semana de Claude por debajo
   del 30 % y una lectura fresca (`alta_capacidad_logica.cupo_claude` sobre `limites-claude.json`):
   es el límite semanal del plan de Alex, el que usan los agentes Opus.

Nunca se inventa un id: solo lo que lista `room-cli cloud status --json` (`thread spawn --machine
cloud` rechaza con HTTP 400 lo que no esté). Todo es PURO (sin disco, sin red, sin reloj): las
lecturas las da `cloudroom_lanzar.leer_fuentes()`. Pruebas en `test_cloudroom_modelos.py`.
"""
from __future__ import annotations

import os
import re
import time
from datetime import datetime, timezone

import alta_capacidad_logica as A  # cupo_claude: la regla de la semana de Claude, una sola vez
import buscar_capacidad as B  # DE_PAGO, NO_ESCRITORES, RETIRADOS, SALUD_DE y la ruta de la salud
import limites_claude

#: Dónde se leen las tres fuentes (sus dueños las escriben; aquí solo se leen).
#: `medidores_credito.ARCHIVO_SALIDA` (no se importa: arrastra los lectores de terminal).
MEDIDORES = os.path.join(os.path.expanduser("~/.starseed"), "medidores-credito.json")
LIMITES = limites_claude.ARCHIVO
SALUD = B.SALUD

GRATIS = ("opencode", "pi")
CODEX, CLAUDE = "codex", "claude-code"
#: Codex comparte cuota con el enjambre de la Mac: a partir de aquí, sus hilos esperan.
TOPE_CODEX_PCT = 80
#: Modelos del catálogo de Codex que no son para escribir código (medido el 2026-10-24).
CODEX_NO_ESCRIBEN = frozenset({"gpt-reserve", "codex-auto-review"})
#: La semana de Claude por encima de esto es de los agentes Opus, no de los hilos de la nube.
TOPE_CLAUDE_SEMANA = 30
FAMILIAS_CLAUDE = ("sonnet", "haiku")
#: Un hilo que falla por el modelo se prueba con, como mucho, estos candidatos en total.
MAX_MODELOS_POR_TAREA = 3
#: Errores de `thread spawn` que son del MODELO o del harness (el hilo no se abrió): se puede
#: probar el siguiente candidato sin gastar la tarea. Un tiempo agotado NO: quizá se abrió.
FALLO_DE_MODELO = re.compile(r"\bmodel|modelo|cloud supports|http 400|unsupported|not supported|"
                             r"harness|provider|proveedor", re.I)


def harnesses_nube(estado):
    """PURA: [(id, harness, [modelos])] de `cloud status --json` (harnesses[].models[].model), en su
    orden, sin los que la nube da por no disponibles o no conectados."""
    d = estado.get("data", estado) if isinstance(estado, dict) else {}
    salida = []
    for h in (d.get("harnesses") if isinstance(d, dict) else None) or []:
        if not isinstance(h, dict) or h.get("available") is False or h.get("connected") is False:
            continue
        nombre = next((str(h[k]) for k in ("id", "harness", "name", "provider") if isinstance(h.get(k), str) and h[k]), "")
        modelos = []
        for m in h.get("models") or []:
            modelo = m.get("model") if isinstance(m, dict) else m
            if isinstance(modelo, str) and modelo.strip() and modelo.strip() not in modelos:
                modelos.append(modelo.strip())
        if nombre:
            salida.append((nombre, h, modelos))
    return salida


def modelo_fijado(estado, preferido):
    """PURA: (harness, modelo) del catálogo de la nube que nombra `preferido` («modelo» o
    «harness/modelo»), o None. Es la palanca de STARSEED_CLOUDROOM_MODELO."""
    if not preferido:
        return None
    for h, _d, modelos in harnesses_nube(estado):
        for m in modelos:
            if preferido in (m, "%s/%s" % (h, m)):
                return h, m
    return None


def proveedor_de(harness, modelo):
    """PURA: el proveedor del modelo en minúsculas: el prefijo de «prov/modelo» (opencode) o, si no
    lo tiene, el `provider` del harness (pi elige proveedor) cuando no es el propio harness."""
    if "/" in modelo:
        return modelo.split("/", 1)[0].strip().lower()
    prov = harness.get("provider") if isinstance(harness, dict) else None
    nombre = str(harness.get("id") or "") if isinstance(harness, dict) else ""
    return prov.strip().lower() if isinstance(prov, str) and prov.strip() and prov.strip() != nombre else ""


def _hasta(valor):
    """«AAAA-MM-DD HH:MM:SS» comparable como texto (también si viene en ISO con «T»)."""
    return str(valor or "").replace("T", " ")[:19]


def estado_proveedor(salud, prov, ahora_txt):
    """PURA: por qué la salud compartida aparta al proveedor ("" si no lo aparta). Mira su nombre en
    la salud («nvidia» → «nim») y el de opencode, igual que `buscar_capacidad`."""
    for nombre in dict.fromkeys((B.SALUD_DE.get(prov, prov), prov)):
        e = (salud or {}).get(nombre) if isinstance(salud, dict) else None
        if not isinstance(e, dict):
            continue
        if str(e.get("estado") or "") in ("caido", "caído"):
            return "%s caído según la salud compartida" % prov
        hasta = _hasta(e.get("sin_cupo_hasta"))
        if hasta and hasta > ahora_txt:
            return "%s sin cupo hasta las %s" % (prov, hasta[11:16] or hasta)
    return ""


def _epoch(valor):
    if not isinstance(valor, str) or not valor:
        return None
    try:
        f = datetime.fromisoformat(valor.replace("Z", "+00:00"))
    except ValueError:
        return None
    return (f if f.tzinfo else f.replace(tzinfo=timezone.utc)).timestamp()


def uso_codex(medidores, ahora):
    """PURA: el mayor `usado_pct` de las ventanas VIGENTES del medidor de Codex (la de 5 h y la
    semanal; una ventana cuyo reinicio ya pasó no cuenta), 100 si el medidor lo da por bloqueado,
    None sin lectura."""
    meds = medidores.get("medidores", medidores) if isinstance(medidores, dict) else {}
    m = meds.get(CODEX) if isinstance(meds, dict) else None
    if not isinstance(m, dict):
        return None
    if isinstance(m.get("extras"), dict) and m["extras"].get("bloqueado"):
        return 100.0
    usos = []
    for v in m.get("ventanas") if isinstance(m.get("ventanas"), list) else []:
        pct = v.get("usado_pct") if isinstance(v, dict) else None
        if isinstance(pct, bool) or not isinstance(pct, (int, float)):
            continue
        reinicia = _epoch(v.get("reinicia"))
        if reinicia is not None and reinicia <= ahora:
            continue
        usos.append(float(pct))
    return max(usos) if usos else None


def _lecturas(limites):
    if isinstance(limites, list):
        return [x for x in limites if isinstance(x, dict)]
    lista = limites.get("lecturas") if isinstance(limites, dict) else None
    return [x for x in lista if isinstance(x, dict)] if isinstance(lista, list) else []


def _intercalar(grupos):
    """[[a1, a2], [b1]] → [a1, b1, a2]: una vuelta por grupo, en el orden en que aparecen."""
    salida, i = [], 0
    while any(i < len(g) for g in grupos):
        salida.extend(g[i] for g in grupos if i < len(g))
        i += 1
    return salida


def evaluar_modelos(estado_cloud, medidores, limites, salud, ahora):
    """PURA. {"candidatos": [(harness, modelo, motivo)], "descartes": [(harness, motivo)]}: los
    modelos de la nube que pueden abrir un hilo ahora, en el orden de las reglas del módulo, y por
    qué se quedan fuera los demás (un motivo por harness y causa, para decirlo en el parte)."""
    ahora_txt = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ahora))
    gratis, codex, otros, claude, descartes = {}, [], [], [], []

    def descartar(h, motivo):
        if (h, motivo) not in descartes:
            descartes.append((h, motivo))

    for h, datos, modelos in harnesses_nube(estado_cloud):
        if h in GRATIS:
            for m in modelos:
                prov = proveedor_de(datos, m)
                apartado = estado_proveedor(salud, prov, ahora_txt)
                if prov in B.DE_PAGO:
                    descartar(h, "%s es de pago" % prov)
                elif prov in B.NO_ESCRITORES:
                    descartar(h, "%s no escribe código del enjambre" % prov)
                elif prov in B.RETIRADOS:
                    descartar(h, "%s retirado: %s" % (prov, B.RETIRADOS[prov]))
                elif apartado:
                    descartar(h, apartado)
                else:
                    motivo = "%s · %s, gratis y sin cuota de suscripción" % (h, prov or "proveedor sin nombre")
                    gratis.setdefault((h, prov), []).append((h, m, motivo))
        elif h == CODEX:
            uso = uso_codex(medidores, ahora)
            if uso is not None and uso >= TOPE_CODEX_PCT:
                descartar(h, "Codex al %g %% (tope %d %%; es la cuota del enjambre de la Mac)" % (uso, TOPE_CODEX_PCT))
                continue
            motivo = ("Codex al %g %% de su cuota (tope %d %%)" % (uso, TOPE_CODEX_PCT) if uso is not None
                      else "Codex sin lectura de su medidor")
            codex.extend((h, m, motivo) for m in modelos if m not in CODEX_NO_ESCRIBEN)
        elif h == CLAUDE:
            ok, texto = A.cupo_claude(_lecturas(limites), datetime.fromtimestamp(ahora, timezone.utc),
                                      tope_semana=TOPE_CLAUDE_SEMANA)
            if not ok:
                descartar(h, "%s (solo con la semana < %d %%)" % (texto, TOPE_CLAUDE_SEMANA))
                continue
            vistas = set()
            for m in modelos:
                familia = next((f for f in FAMILIAS_CLAUDE if f in m.lower()), "")
                if familia and familia not in vistas:
                    vistas.add(familia)
                    claude.append((h, m, "Claude Code %s (%s)" % (familia, texto)))
        elif modelos:
            otros.extend((h, m, "%s lista modelos en la nube" % h) for m in modelos)
    return {"candidatos": _intercalar(list(gratis.values())) + codex + otros + claude, "descartes": descartes}


def candidatos_modelo(estado_cloud, medidores, limites, salud, ahora):
    """PURA: [(harness, modelo, motivo)] que pueden abrir un hilo de la nube ahora, en orden:
    opencode/pi (intercalados por proveedor) → codex → los demás que listen modelos → claude-code."""
    return evaluar_modelos(estado_cloud, medidores, limites, salud, ahora)["candidatos"]


def texto_descartes(descartes, maximo=4):
    """PURA: «codex: Codex al 85 % …; claude-code: …» para decir por qué no hay modelo."""
    partes = ["%s: %s" % (h, m) for h, m in descartes or []]
    return "; ".join(partes[:maximo]) + (" (y %d más)" % (len(partes) - maximo) if len(partes) > maximo else "")


def inicio_rueda(candidatos, registro):
    """PURA: dónde sigue la rueda: el candidato siguiente al del último hilo del registro (los de
    un mismo lanzamiento comparten `t`: manda el último anotado). 0 si ninguno está en la lista."""
    pares = [(h, m) for h, m, _ in candidatos]
    mejor, pos = None, -1
    for x in registro or []:
        if not isinstance(x, dict) or (x.get("harness"), x.get("modelo")) not in pares:
            continue
        try:
            t = float(x.get("t") or 0)
        except (TypeError, ValueError):
            t = 0.0
        if mejor is None or t >= mejor:
            mejor, pos = t, pares.index((x["harness"], x["modelo"]))
    return (pos + 1) % len(pares) if pares and pos >= 0 else 0


def orden_por_tarea(n, candidatos, inicio=0, fijo=None):
    """PURA: para cada una de `n` tareas, los candidatos en el orden en que se prueban: la tarea i
    empieza en el puesto `inicio + i` de la rueda (no todas al mismo) y, si su modelo falla, sigue
    con los siguientes. Con `fijo` (STARSEED_CLOUDROOM_MODELO) todas empiezan por él."""
    cands = list(candidatos or [])
    if fijo:
        resto = [c for c in cands if (c[0], c[1]) != (fijo[0], fijo[1])]
        return [[tuple(fijo)] + resto for _ in range(n)]
    if not cands:
        return [[] for _ in range(n)]
    return [cands[(inicio + i) % len(cands):] + cands[:(inicio + i) % len(cands)] for i in range(n)]


def fallo_de_modelo(error):
    """PURA: el `thread spawn` falló por el modelo o el harness (HTTP 400, «Select a model…»): el
    hilo no se abrió y se puede probar el siguiente candidato sin gastar la tarea."""
    return bool(error) and bool(FALLO_DE_MODELO.search(str(error)))
