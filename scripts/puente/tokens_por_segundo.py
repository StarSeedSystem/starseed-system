#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tokens por segundo de TODO el Puente, medidos — y lo que no se puede medir, dicho.

(2026-09-22) Alex: «agrega un medidor de tokens por segundo en total sumando los de todos
los procesos de cada api de todo el puente de mando en tiempo real».

Antes de escribir nada se fue a ver QUIÉN publica tokens de verdad:

  · Jev            → sí. `~/.starseed/jev-uso.json` lleva un acumulado que sale del
                     `usage` que devuelve la propia API (input_tokens + output_tokens).
  · Las pasarelas  → NO. `por_medio` guarda llamadas, coste y milisegundos; tokens no.
  · Los agentes    → NO. opencode y codex no publican `usage`; por eso el medidor de
                     agentes mide bytes escritos y tiempo, no tokens.

Así que el número que se puede dar es el de las fuentes que llevan contador, y lo demás
se NOMBRA en vez de repartirse a ojo. Inventar un tokens/s para un motor que no dice sus
tokens sería exactamente la clase de cifra que llevamos toda la sesión quitando.

Cómo se mide sin estorbar a nadie: esto NO pregunta a ninguna API ni toca ningún proceso.
Lee archivos que ya están escritos en el disco, cada INTERVALO_S, y guarda un anillo con
las últimas muestras. La tasa es la diferencia entre dos muestras dividida por el tiempo
entre ellas, que es lo único que un contador acumulado puede decir honestamente.

  python3 scripts/puente/tokens_por_segundo.py            # servicio
  python3 scripts/puente/tokens_por_segundo.py --una-vez  # una muestra y a la calle
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
SALIDA = os.path.join(RAIZ, "starseed_memory_root", "mando", "tokens-por-segundo.json")
#: Cada 5 s: suficiente para que se vea vivo y lo bastante barato para no notarse.
INTERVALO_S = int(os.environ.get("STARSEED_TOKENS_S", "5"))
#: Diez minutos de historia. Más no sirve para una tasa «ahora mismo».
MAX_MUESTRAS = 120

#: Quién lleva contador de tokens. Añadir una fuente es añadir una línea aquí.
#:
#: (2026-09-22, segunda pasada) La primera versión decía que opencode «no publica tokens»,
#: y era verdad de su LOG —por eso el medidor de agentes mide bytes— pero no de su base de
#: datos: `~/.local/share/opencode/opencode.db` tiene `session.tokens_input`,
#: `tokens_output` y `tokens_reasoning`. Medido: 125.377.185 tokens acumulados en 4.055
#: sesiones. Ahí está el grueso del gasto del enjambre, así que ahí hay que mirar. Se abre
#: en modo SOLO LECTURA (`mode=ro`) y con dos segundos de espera máxima: no se le pone la
#: mano encima a la base de nadie.
FUENTES = (
    {"id": "jev", "nombre": "Jev (consejero)", "tipo": "json",
     "ruta": os.path.expanduser("~/.starseed/jev-uso.json"), "camino": ("tokens",)},
    {"id": "opencode", "nombre": "agentes opencode", "tipo": "sqlite",
     "ruta": os.path.expanduser("~/.local/share/opencode/opencode.db"),
     "consulta": ("select coalesce(sum(tokens_input),0) + coalesce(sum(tokens_output),0)"
                  " + coalesce(sum(tokens_reasoning),0) from session")},
)

#: Procesos que SÍ gastan tokens pero cuyo motor no los publica. Se nombran, no se estiman.
SIN_CONTADOR = (
    {"id": "codex", "nombre": "agentes codex",
     "porque": "su motor no publica `usage` en ningún sitio que se pueda leer"},
    {"id": "pasarelas", "nombre": "pasarelas del enjambre",
     "porque": "guardan llamadas, coste y milisegundos, pero no tokens"},
)


def _hondo(datos, camino):
    """El valor al final del camino, o None si no está."""
    actual = datos
    for paso in camino:
        if not isinstance(actual, dict) or paso not in actual:
            return None
        actual = actual[paso]
    return actual if isinstance(actual, (int, float)) else None


def _de_sqlite(ruta, consulta):
    """Una suma de una base sqlite, SOLO LECTURA. None si no se puede leer.

    `mode=ro` y `timeout=2`: si opencode está escribiendo, esto espera dos segundos y se
    rinde. Nunca bloquea al que trabaja — esa era la condición de Alex: «sin que
    interrumpa los procesos».
    """
    try:
        con = sqlite3.connect("file:%s?mode=ro" % ruta, uri=True, timeout=2)
        try:
            fila = con.execute(consulta).fetchone()
        finally:
            con.close()
        return fila[0] if fila and isinstance(fila[0], (int, float)) else None
    except Exception:
        return None


def leer_totales(fuentes=FUENTES):
    """Los acumulados de cada fuente AHORA. Una fuente ilegible no es un cero: es None."""
    salida = {}
    for f in fuentes:
        if f.get("tipo") == "sqlite":
            salida[f["id"]] = _de_sqlite(f["ruta"], f["consulta"])
            continue
        try:
            with open(f["ruta"], encoding="utf-8") as fh:
                salida[f["id"]] = _hondo(json.load(fh), f["camino"])
        except (OSError, ValueError):
            salida[f["id"]] = None
    return salida


def tasa(antes, ahora):
    """PURA: tokens/s por fuente entre dos muestras, y el total.

    Devuelve {fuentes: {id: tok/s}, total: tok/s, segundos: float} o None si no se puede
    calcular. Casos que NO son una tasa y por eso devuelven None o se saltan:
      · una sola muestra (no hay diferencia que dividir);
      · Δt <= 0 (el reloj no avanzó: dividir ahí da infinito, no información);
      · un contador que baja (el archivo se reinició): no es consumo negativo.
    """
    if not isinstance(antes, dict) or not isinstance(ahora, dict):
        return None
    dt = float(ahora.get("t") or 0) - float(antes.get("t") or 0)
    if dt <= 0:
        return None
    a, b = antes.get("totales") or {}, ahora.get("totales") or {}
    por_fuente, total = {}, 0.0
    for fid, valor in b.items():
        previo = a.get(fid)
        if valor is None or previo is None or valor < previo:
            continue
        v = (valor - previo) / dt
        por_fuente[fid] = v
        total += v
    return {"fuentes": por_fuente, "total": total, "segundos": dt}


def promedio(muestras, ventana_s):
    """PURA: tokens/s medios en los últimos `ventana_s`. None si no hay con qué.

    Se toma la muestra más antigua DENTRO de la ventana y la última: entre esas dos, la
    diferencia partida por el tiempo. Es la media real del tramo, no la media de tasas
    (que pesaría igual un hueco de 5 s que uno de 60).
    """
    if not muestras or len(muestras) < 2 or ventana_s <= 0:
        return None
    fin = muestras[-1]
    corte = float(fin.get("t") or 0) - ventana_s
    dentro = [m for m in muestras if float(m.get("t") or 0) >= corte]
    if len(dentro) < 2:
        return None
    return tasa(dentro[0], fin)


def _cifra(v):
    return ("%.1f" % v) if v < 100 else "%d" % round(v)


def resumir(ritmo, sin_contador=SIN_CONTADOR, media=None):
    """PURA: la frase del medidor. Dice lo que mide Y lo que no.

    (2026-09-22, segunda pasada) Manda la MEDIA DEL MINUTO, igual que en la pantalla. Antes
    esta frase salía solo del instantáneo y el archivo decía «0 tok/s ahora mismo» mientras
    el medidor del Puente decía «44,2 tok/s de media en 1 min»: el mismo dato contado de
    dos maneras en dos sitios, que es la avería que llevamos toda la sesión persiguiendo.
    El gasto va a ráfagas, así que el instantáneo es cero casi siempre y no puede ser la
    frase principal de nada.
    """
    cuantas = len(sin_contador)
    cola = " · %d proceso(s) no publican tokens" % cuantas if cuantas else ""
    if ritmo is None and media is None:
        return "aún no hay dos muestras: la tasa necesita dos" + cola
    inst = (ritmo or {}).get("total")
    prom = (media or {}).get("total")
    if prom is None:
        return "%s tok/s en los últimos segundos · aún sin minuto entero" % _cifra(inst or 0.0) + cola
    detras = " · %s tok/s en los últimos segundos" % _cifra(inst) if inst is not None else ""
    return "%s tok/s de media en 1 min%s" % (_cifra(prom), detras) + cola


def _leer_anillo():
    try:
        with open(SALIDA, encoding="utf-8") as f:
            d = json.load(f)
        return d.get("muestras") or []
    except (OSError, ValueError):
        return []


def una_pasada():
    muestras = _leer_anillo()
    muestras.append({"t": time.time(), "totales": leer_totales()})
    muestras = muestras[-MAX_MUESTRAS:]
    ahora = tasa(muestras[-2], muestras[-1]) if len(muestras) >= 2 else None
    datos = {
        "generado": time.strftime("%Y-%m-%d %H:%M:%S"),
        "intervalo_s": INTERVALO_S,
        "ahora": ahora,
        "un_minuto": promedio(muestras, 60),
        "diez_minutos": promedio(muestras, 600),
        "fuentes": [{"id": f["id"], "nombre": f["nombre"]} for f in FUENTES],
        "sin_contador": list(SIN_CONTADOR),
        "resumen": resumir(ahora, media=promedio(muestras, 60)),
        "muestras": muestras,
    }
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    tmp = SALIDA + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False)
    os.replace(tmp, SALIDA)
    return datos


def main() -> int:
    if "--una-vez" in sys.argv:
        d = una_pasada()
        print(json.dumps({k: v for k, v in d.items() if k != "muestras"},
                         ensure_ascii=False, indent=1))
        return 0
    print("Tokens por segundo · cada %d s · %s" % (INTERVALO_S, SALIDA), flush=True)
    while True:
        try:
            una_pasada()
        except Exception as e:
            print("tokens-por-segundo: %s: %s" % (type(e).__name__, e), flush=True)
        time.sleep(INTERVALO_S)


if __name__ == "__main__":
    sys.exit(main() or 0)
