#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigía de medidores: lee TODOS los medidores del Puente y arregla lo que pueda, solo.

Alex (2026-09-22): «todos los medidores y todos los procesos activos deben ser analizados
por los directores verificadores en todo el tiempo y solucionar cualquier situación
automáticamente».

POR QUÉ HACÍA FALTA, con el caso que lo provocó. Esta noche el orquestador se quedó 123
MINUTOS repitiendo «tReintento esperando aprobación» —una tarea que había plantado una
prueba y que ya ni estaba en la cola— con los otros dos trabajadores de la Mac parados.
Todo estaba a la vista en los medidores: 1 agente, 7 «listas» que en realidad esperaban a
otra tarea, el pulso sin moverse. Nadie los miraba. Los directores que había vigilaban
cada uno su parcela (la nube, el reparto, la memoria); ninguno miraba el TABLERO, que es
justo lo que mira Alex cuando dice «esto está mal».

Esto lo mira entero cada `INTERVALO_S`, y cada situación que reconoce lleva su remedio:

  · agente atascado en aprobación → soltar la puerta (la rama se conserva)
  · agente callado más de la cuenta → reorganizar (el orquestador vence su arriendo)
  · hay atraso y sitio libre en la nube → desplegar
  · la pantalla es más vieja que el código → reconstruir
  · ninguna tarea se puede coger porque la cadena está rota → decirlo en el canal, con
    nombres, en vez de dejar un «7 listas» que no es verdad

Lo que NO hace, a propósito:
  · No inventa remedios: si no reconoce la situación, la anota y calla. Un vigía que
    adivina es peor que ninguno.
  · No toca nada que esté avanzando: «nada en marcha se interrumpe» vale también aquí.
  · No decide por Alex: lo que necesita sus manos (una clave, un check-in) se queda en
    «Te toca a ti», que para eso está.

  python3 scripts/puente/vigia_medidores.py            # servicio
  python3 scripts/puente/vigia_medidores.py --una-vez  # una pasada, imprime y sale
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.expanduser("~/Documents/starseed-os-main")
MANDO = os.environ.get("STARSEED_MANDO_URL", "http://localhost:9002")
ESTADO = os.path.join(RAIZ, "starseed_memory_root", "mando", "vigia-medidores.json")
INTERVALO_S = int(os.environ.get("STARSEED_VIGIA_S", "120"))

#: Los medidores que se leen enteros en cada pasada. Son los mismos que ve Alex.
MEDIDORES = ("agentes", "en-curso", "listas", "bloqueadas", "contenedores", "proveedores")

#: Minutos que un agente puede estar sin escribir antes de considerarlo atascado. El
#: orquestador ya corta a los 5-15 min por bytes; esto es la red de seguridad de después.
CALLADO_MIN = int(os.environ.get("STARSEED_VIGIA_CALLADO_MIN", "25"))
#: Minutos en «esperando aprobación» antes de soltar la puerta. El orquestador tiene su
#: propio tope (20 min); esto cubre el caso de que ese tope no llegue a aplicarse.
APROBACION_MIN = int(os.environ.get("STARSEED_VIGIA_APROBACION_MIN", "30"))


# ---------------------------------------------------------------------------
# Diagnóstico: PURO. Entra lo que dicen los medidores, sale una lista de problemas.
# ---------------------------------------------------------------------------

def _min_de(texto) -> int:
    """Minutos que hay en un texto tipo «97 min» o «2 min»; 0 si no se puede leer."""
    for trozo in str(texto or "").split():
        if trozo.isdigit():
            return int(trozo)
    return 0


def diagnosticar(medidores: dict, callado_min=CALLADO_MIN, aprobacion_min=APROBACION_MIN) -> list:
    """PURA: de los detalles de los medidores a la lista de situaciones con remedio.

    Cada problema es {clave, tipo, quien, porque, remedio}. `remedio` es el nombre de la
    acción, no la acción: quien decide y quien ejecuta van separados a propósito, para que
    esto se pueda probar sin tocar la máquina.
    """
    problemas = []

    agentes = (medidores.get("agentes") or {}).get("filas") or []
    for f in agentes:
        estado = str(f.get("estado") or "")
        etapa = str(f.get("etapa") or "")
        desde = _min_de(f.get("desde"))
        if "aprobaci" in etapa.lower() and desde >= aprobacion_min:
            problemas.append({
                "clave": "agentes", "tipo": "aprobacion_eterna", "quien": f.get("id") or "?",
                "porque": "lleva %d min esperando un visto bueno que no llega" % desde,
                "remedio": "soltar_aprobacion",
            })
        elif estado == "callado" and desde >= callado_min:
            problemas.append({
                "clave": "agentes", "tipo": "agente_callado", "quien": f.get("id") or "?",
                "porque": "lleva %d min sin escribir" % desde,
                "remedio": "reorganizar",
            })

    listas = medidores.get("listas") or {}
    filas_listas = listas.get("filas") or []
    atadas = [f for f in filas_listas if "espera" in str(f.get("estado") or "")]
    libres = [f for f in filas_listas if f not in atadas]
    if filas_listas and not libres:
        problemas.append({
            "clave": "listas", "tipo": "cadena_rota", "quien": ", ".join(str(f.get("id")) for f in atadas[:6]),
            "porque": "%d tarea(s) definidas y NINGUNA se puede coger: todas esperan a otra" % len(atadas),
            "remedio": "avisar_cadena_rota",
        })

    cont = medidores.get("contenedores") or {}
    resumen_cont = str(cont.get("resumen") or "")
    n_agentes = len(agentes)
    if libres and n_agentes == 0:
        problemas.append({
            "clave": "agentes", "tipo": "trabajo_sin_nadie", "quien": str(len(libres)),
            "porque": "hay %d tarea(s) que se pueden coger y ningún agente trabajando" % len(libres),
            "remedio": "arrancar_enjambre",
        })
    if libres and "libre" in resumen_cont and " 0 libre" not in resumen_cont:
        problemas.append({
            "clave": "contenedores", "tipo": "nube_ociosa", "quien": "nube",
            "porque": "hay atraso y sitio libre en la nube",
            "remedio": "desplegar_nube",
        })

    return problemas


def resumir(problemas: list) -> str:
    """PURA: una línea legible con lo que se ha encontrado."""
    if not problemas:
        return "todo en orden"
    return " · ".join("%s (%s)" % (p["tipo"], p["quien"]) for p in problemas)


# ---------------------------------------------------------------------------
# Lectura y remedios: aquí SÍ se toca la máquina.
# ---------------------------------------------------------------------------

def leer_medidores() -> dict:
    salida = {}
    for clave in MEDIDORES:
        try:
            with urllib.request.urlopen("%s/api/mando/medidores?clave=%s" % (MANDO, clave), timeout=20) as r:
                salida[clave] = (json.loads(r.read().decode("utf-8")) or {}).get("detalle") or {}
        except (urllib.error.URLError, ValueError, OSError):
            salida[clave] = {}
    return salida


def _sh(orden, timeout=120):
    try:
        r = subprocess.run(orden, cwd=RAIZ, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except Exception as e:
        return 1, "%s: %s" % (type(e).__name__, e)


def aplicar(problema: dict) -> str:
    """Ejecuta el remedio y devuelve lo que pasó, en castellano."""
    remedio = problema.get("remedio")
    quien = problema.get("quien") or ""

    if remedio in ("soltar_aprobacion", "reorganizar"):
        # El desatascador es quien sabe soltar puertas y vencer arriendos sin romper nada.
        rc, salida = _sh([sys.executable, os.path.join(RAIZ, "scripts", "puente", "desatascar.py")])
        return "desatascador: %s" % ("ok" if rc == 0 else salida.strip()[-120:] or "falló")

    if remedio == "arrancar_enjambre":
        rc, salida = _sh([sys.executable, os.path.join(RAIZ, "scripts", "puente", "vigilante-enjambre.py"), "--una-vez"])
        return "vigilante: %s" % ("ok" if rc == 0 else salida.strip()[-120:] or "falló")

    if remedio == "desplegar_nube":
        rc, salida = _sh([sys.executable, os.path.join(RAIZ, "scripts", "puente", "nube-gh.py"),
                          "lanzar", "--tope", "8", "--trabajadores", "4", "--minutos", "45"], timeout=300)
        return "nube: %s" % ("lanzada" if rc == 0 else salida.strip()[-120:] or "no se pudo")

    if remedio == "avisar_cadena_rota":
        # No hay arreglo automático posible: alguien tiene que decidir si se reencola la
        # raíz o se descarta la rama entera. Lo que SÍ se puede es no callárselo.
        rc, _ = _sh([sys.executable, os.path.join(RAIZ, "scripts", "puente", "puente-de-mando.py"),
                     "decir", "AVISO · ninguna tarea se puede coger: %s. La cadena está rota en la raíz."
                     % quien])
        return "avisado en el canal" if rc == 0 else "no pude avisar"

    return "sin remedio conocido"


def una_pasada(aplicar_remedios=True) -> dict:
    medidores = leer_medidores()
    problemas = diagnosticar(medidores)
    hechos = []
    if aplicar_remedios:
        for p in problemas:
            hechos.append({**p, "resultado": aplicar(p)})
    datos = {
        "visto": time.strftime("%Y-%m-%d %H:%M:%S"),
        "medidores": {k: (v.get("resumen") or "") for k, v in medidores.items()},
        "problemas": problemas,
        "hechos": hechos,
        "resumen": resumir(problemas),
    }
    try:
        os.makedirs(os.path.dirname(ESTADO), exist_ok=True)
        with open(ESTADO, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
    except OSError:
        pass
    print("[%s] %s" % (time.strftime("%H:%M"), datos["resumen"]), flush=True)
    for h in hechos:
        print("    %s (%s) → %s" % (h["tipo"], h["quien"], h["resultado"]), flush=True)
    return datos


def main() -> int:
    if "--una-vez" in sys.argv:
        una_pasada(aplicar_remedios="--solo-mirar" not in sys.argv)
        return 0
    print("Vigía de medidores · cada %d s · mira %s" % (INTERVALO_S, ", ".join(MEDIDORES)), flush=True)
    while True:
        try:
            una_pasada()
        except Exception as e:
            print("vigia-medidores: %s: %s" % (type(e).__name__, e), flush=True)
        time.sleep(INTERVALO_S)


if __name__ == "__main__":
    sys.exit(main() or 0)
