#!/usr/bin/env python3
"""Commit del director en `main` SIN chocar con el enjambre (2026-09-20).

Dos veces hoy un commit mío coincidió con el `git commit`/`merge --ff-only` de una
tarea y una de las dos partes murió con «index.lock … another git process» (JV4 a las
06:05, MD1b a las 14:35). Este script: (1) espera a que ninguna tarea viva esté en una
fase que toque git en main (commit, integración; desde el 2026-10-10 ya no espera a tsc,
pruebas ni revisión, que corren en el worktree de cada tarea), (2) toma el mismo cerrojo
`integrar` que usa el orquestador y espera hasta 90 s a que se suelte un index.lock breve,
(3) commitea. (2026-11-22) Añade: comprobación de recursos de la Mac y ejecución obligatoria
de pruebas nativas si el cambio toca native/capabilities/permisos.

(SUP1125A, 2026-11-25) Sin «delegación a remoto»: con la Mac saturada (casi siempre con
8 GB) el commit se iba a «GitHub»: `git checkout -b director/commit-…` EN EL MAIN VIVO,
commit, `git push` de esa rama y un flujo `integrar-remoto.yml` que no existe. El main vivo
se quedó 17 h en esas ramas (nueve, una por commit), `main` atrás, y traer_nube no pudo
avanzar main ni traer nada de la nube («Not possible to fast-forward»). La del A1 commiteaba
los archivos del A1, no los de aquí. Un commit no pesa: se hace aquí, en `main`, y publicar
es de la autopublicación. Si el árbol no está en `main`, no commitea.

    python3 scripts/puente/commit-seguro.py -m "mensaje" [--] archivos…
"""
import fcntl
import glob
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from typing import Optional

# Importar lógica de guardia_recursos para comprobación de recursos
try:
    from guardia_recursos import (
        CalcularAjuste,
        EstadoRecursos,
        AjusteAgentes,
        Umbrales,
        LeerRecursos,
    )
except ImportError:
    # Fallback si guardia_recursos no está disponible
    @dataclass
    class EstadoRecursos:
        memoria_libre_mb: float
        intercambio_mb: float
        disco_libre_gb: float
        cpu_percent: float

    @dataclass
    class AjusteAgentes:
        tipo: str
        agentes: int
        razon: str
        umbrales_violados: list = None

    class CalcularAjuste:
        @staticmethod
        def estado_actual() -> EstadoRecursos:
            return EstadoRecursos(500, 100, 20, 10)

        @staticmethod
        def ajuste(estado: EstadoRecursos, umbrales=None) -> AjusteAgentes:
            return AjusteAgentes("mantener", 3, "ok", [])

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.expanduser("~/Documents/starseed-os-main")
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
CERROJO = os.path.expanduser("~/.starseed/cerrojos/integrar.lock")
FASES_GIT = ("commit", "integrando", "integracion", "integración", "completando")
INDEX_LOCK_ESPERA_S = 90
# Umbrales para considerar la Mac saturada
MEMORIA_LIBRE_MIN_MB = 200
DISCO_LIBRE_MIN_GB = 10
INTERCAMBIO_MAX_MB = 5120
#: La rama en la que commitea el director (SUP1125A): en otra no commitea.
RAMA_MAIN = "main"


def rama_actual() -> str:
    """La rama en la que está el árbol de RAIZ ('' con la cabeza suelta o si git falla)."""
    try:
        r = subprocess.run(
            ["git", "symbolic-ref", "--short", "-q", "HEAD"],
            cwd=RAIZ,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except Exception:
        return ""
    return r.stdout.strip() if r.returncode == 0 else ""


def fases_vivas():
    """{tid: fase} de los latidos frescos (< 3 min) de la cola viva."""
    salida = {}
    for f in glob.glob(os.path.join(OLAS, "latidos-cola-auto-*.json")):
        if time.time() - os.path.getmtime(f) > 180:
            continue
        try:
            d = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
        for tid, v in (d.get("tareas") or {}).items():
            if isinstance(v, dict) and v.get("fase") not in (None, "hecho"):
                salida[tid] = str(v.get("fase"))
    return salida


def esperar_momento_seguro(tope_s=900):
    """Espera hasta que no haya tareas en fases de git en main."""
    t0 = time.time()
    while time.time() - t0 < tope_s:
        ocupadas = {t: f for t, f in fases_vivas().items() if f.lower().startswith(FASES_GIT)}
        if not ocupadas:
            return True
        print("esperando: %s" % ", ".join("%s(%s)" % kv for kv in ocupadas.items()), flush=True)
        time.sleep(15)
    return False


def tiene_recursos_suficientes() -> bool:
    """Comprueba si la Mac tiene recursos para commitear localmente."""
    try:
        estado = CalcularAjuste.estado_actual()
        umbrales = Umbrales(
            intercambio_max_gb=INTERCAMBIO_MAX_MB / 1024,
            disco_min_gb=DISCO_LIBRE_MIN_GB,
            memoria_libre_mb_min=MEMORIA_LIBRE_MIN_MB,
        )
        ajuste = CalcularAjuste.ajuste(estado, umbrales)
        return ajuste.tipo == "mantener"
    except Exception:
        # Si falla la comprobación, asumimos que hay recursos (comportamiento legacy)
        return True


def es_cambio_nativo(archivos: list[str]) -> bool:
    """True si algún archivo toca native/, capabilities/ o permisos."""
    for arch in archivos:
        if arch.startswith("native/") or arch.startswith("native\\"):
            return True
        if "capabilities" in arch and arch.endswith(".json"):
            return True
        if "permisos-y-control-del-dispositivo" in arch:
            return True
    return False


def ejecutar_pruebas_nativas() -> tuple[bool, str]:
    """Ejecuta inventario-nativo.test.ts y contrato-rust.test.ts. Retorna (ok, detalle)."""
    pruebas = [
        "src/lib/nativa/__tests__/inventario-nativo.test.ts",
        "src/lib/nativa/__tests__/contrato-rust.test.ts",
    ]
    for prueba in pruebas:
        ruta = os.path.join(RAIZ, prueba)
        if not os.path.exists(ruta):
            return False, "No existe %s" % prueba
    try:
        r = subprocess.run(
            ["npx", "vitest", "run", *pruebas],
            cwd=RAIZ,
            capture_output=True,
            text=True,
            timeout=300,
        )
        if r.returncode == 0:
            return True, ""
        return False, (r.stdout or "") + (r.stderr or "")
    except subprocess.TimeoutExpired:
        return False, "TIMEOUT en pruebas nativas"
    except Exception as e:
        return False, "%s: %s" % (type(e).__name__, e)



def main():
    args = sys.argv[1:]
    if "-m" not in args:
        print(__doc__)
        return 2
    i = args.index("-m")
    mensaje = args[i + 1]
    resto = args[:i] + args[i + 2:]
    if resto and resto[0] == "--":
        resto = resto[1:]

    # 1. Esperar momento seguro (sin tareas en fases git en main)
    if not esperar_momento_seguro():
        print("no hubo momento seguro en 15 min; no commiteo")
        return 1

    # 2. Si hay archivos, comprobar si tocan native/capabilities/permisos
    if resto and es_cambio_nativo(resto):
        print("Cambio detectado en native/capabilities/permisos: ejecutando pruebas obligatorias...")
        ok, detalle = ejecutar_pruebas_nativas()
        if not ok:
            print("Pruebas nativas FALLARON: %s" % detalle[-500:])
            return 1
        print("Pruebas nativas en verde")

    # 3. Recursos de la Mac: solo se avisa. Un commit no pesa y no se puede hacer en otra máquina
    #    (los cambios están en este árbol). SUP1125A: la «delegación» dejaba el main vivo en otra
    #    rama, la subía a GitHub y traer_nube no podía avanzar main (ver el docstring).
    if not tiene_recursos_suficientes():
        print("Mac saturada (memoria/disco/intercambio): commiteo aquí igualmente (un commit no pesa)")

    # 4. Commit local con cerrojo integrar
    os.makedirs(os.path.dirname(CERROJO), exist_ok=True)
    f = open(CERROJO, "w")
    fcntl.flock(f, fcntl.LOCK_EX)
    try:
        candado = os.path.join(RAIZ, ".git", "index.lock")
        t0 = time.time()
        while os.path.exists(candado) and time.time() - t0 < INDEX_LOCK_ESPERA_S:
            time.sleep(3)
        if os.path.exists(candado):
            print("index.lock presente %d s; no commiteo" % INDEX_LOCK_ESPERA_S)
            return 1
        rama = rama_actual()
        if rama != RAMA_MAIN:
            print(
                "el árbol de %s está en %s, no en %s: no commiteo (vuelve a %s antes; "
                "un commit fuera de %s no lo ven traer_nube ni el orquestador)"
                % (RAIZ, rama or "una cabeza suelta", RAMA_MAIN, RAMA_MAIN, RAMA_MAIN)
            )
            return 1
        if resto:
            subprocess.run(["git", "add", "--"] + resto, cwd=RAIZ, check=True)
        r = subprocess.run(
            ["git", "-c", "core.hooksPath=/dev/null", "commit", "-q", "-m", mensaje],
            cwd=RAIZ,
        )
        if r.returncode == 0:
            print(
                subprocess.run(
                    ["git", "log", "--oneline", "-1"], cwd=RAIZ, capture_output=True, text=True
                ).stdout.strip()
            )
        return r.returncode
    finally:
        fcntl.flock(f, fcntl.LOCK_UN)
        f.close()


if __name__ == "__main__":
    sys.exit(main())