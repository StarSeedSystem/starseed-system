#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Commitea, pasa las puertas, empuja y VERIFICA cada cambio uno a uno.

    python3 scripts/puente/publicar.py "nota opcional"

Por qué es un script y no una ruta HTTP: las puertas tardan entre cinco y quince
minutos. Una petición se muere antes por tiempo de espera, y entonces nadie sabe
si publicó o no. Aquí el proceso corre suelto y va dejando su estado en

    starseed_memory_root/mando/publicacion-estado.json

paso a paso, de modo que el Mando lo puede seguir en vivo y, si se cierra el
navegador, al volver sigue ahí.

ORDEN INAMOVIBLE: primero se commitea, después se pasan las puertas, y solo si
las CUATRO están en verde se empuja. Nunca al revés: empujar y arreglar después
es lo que deja main roto para todos los demás.
"""

import json
import os
import subprocess
import sys
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import atexit

import reventon as RV
import turno_pesado as TP
import verificacion_cambios as VC
import verificar_publicado as VP

#: EL TURNO DE LA MÁQUINA (2026-09-16).
#: Las cuatro puertas y la build piden entre 1,5 y 4 GB cada una, y la Mac
#: tiene 8. El enjambre ya hacía cola consigo mismo; publicar NO. Resultado
#: medido hoy: swap al 93 %, memoria libre al 25 % y un `tsc` de 54 segundos
#: tardando 26 MINUTOS por paginar. Ahora publicar pide el mismo turno que los
#: agentes, así que o compila el enjambre o compila la publicación, nunca los
#: dos. Se espera; esperar cinco minutos es infinitamente más barato que
#: pelearse por la RAM durante una hora.
_TURNO = {"cm": None}


def tomar_turno(diario):
    """Hace cola por la máquina antes de las puertas. Avisa cada minuto."""

    def avisar(segundos):
        diario.marcar(
            "tsc", "corriendo",
            "esperando turno de máquina (%d s): el enjambre está compilando" % segundos,
        )

    cm = TP.turno(avisar=avisar)
    cm.__enter__()
    _TURNO["cm"] = cm
    atexit.register(soltar_turno)


def soltar_turno():
    """Suelta el turno una sola vez, venga de donde venga la salida."""
    cm = _TURNO.get("cm")
    if cm is None:
        return
    _TURNO["cm"] = None
    try:
        cm.__exit__(None, None, None)
    except Exception:
        pass

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
ESTADO = os.path.join(RAIZ, "starseed_memory_root", "mando", "publicacion-estado.json")

#: El repo declara `engines: 22.x`; el primer node del PATH de la Mac es un 20.17
#: que rompe jsdom y deja nueve archivos de prueba sin cargar SIN avisar. La
#: puerta de pruebas estuvo cinco días en falso verde por esto.
def bin_node():
    base = os.path.expanduser("~/.nvm/versions/node")
    try:
        versiones = sorted(d for d in os.listdir(base) if d.startswith("v22."))
    except OSError:
        return None
    return os.path.join(base, versiones[-1], "bin") if versiones else None


#: Variables que CAMBIAN EL COMPORTAMIENTO de la app y que este proceso hereda
#: del servidor del Mando, porque el botón lo lanza ese servidor. Si no se
#: quitan, las puertas no juzgan el código: juzgan la máquina donde corren. La
#: primera vez que se pulsó el botón, `STARSEED_LOCAL=1` (que el Mando necesita
#: para servirse a sí mismo) hizo que `esDespliegueLocal` devolviera cierto para
#: un dominio de Vercel y dos pruebas se pusieron en rojo sin que nadie hubiera
#: tocado ese código. Un rojo falso es peor que ninguna puerta: enseña a
#: ignorarla.
VARIABLES_QUE_ENSUCIAN = (
    "STARSEED_LOCAL",
    "STARSEED_MANDO",
    "VERCEL",
    "VERCEL_ENV",
    "CI",
    # `NODE_ENV=production` en su shell hace que `npm` pode las devDependencies;
    # forzarlo a «development» tampoco vale, porque hay código que mira este
    # valor. Se quita y cada herramienta pone el suyo (vitest pone «test»).
    "NODE_ENV",
)


def entorno_de_puertas(base, bin_extra=None):
    """El entorno limpio con el que se corren las puertas. Puro y probado."""
    env = dict(base)
    for clave in VARIABLES_QUE_ENSUCIAN:
        env.pop(clave, None)
    if bin_extra:
        env["PATH"] = bin_extra + os.pathsep + env.get("PATH", "")
    return env


def entorno():
    return entorno_de_puertas(os.environ, bin_node())


def correr(orden, timeout=1800, env=None):
    """Devuelve (codigo, salida recortada). Nunca lanza: un fallo es un dato."""
    try:
        r = subprocess.run(
            orden,
            cwd=RAIZ,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env or entorno(),
        )
        return r.returncode, ((r.stdout or "") + (r.stderr or ""))[-4000:]
    except subprocess.TimeoutExpired:
        return 124, "se pasó de %d s sin terminar" % timeout
    except Exception as e:  # noqa: BLE001 — cualquier fallo es «no pasó la puerta»
        return 1, "%s: %s" % (type(e).__name__, e)


def git(args, timeout=120):
    return correr(["git"] + args, timeout=timeout)


# ── estado en disco ─────────────────────────────────────────────────────────
PASOS = [
    ("rama", "Comprobar la rama y el remoto"),
    ("commit", "Commitear lo que haya sin commitear"),
    ("tsc", "Tipos (tsc --noEmit)"),
    ("vitest", "Pruebas del OS (vitest)"),
    ("python", "Pruebas del puente (unittest)"),
    ("build", "Construir (next build)"),
    ("push", "Publicar en origin/main"),
    ("verificacion", "Verificar cada cambio: integrado y aplicado"),
]


class Diario(object):
    """El estado que el Mando lee. Se escribe entero en cada cambio, con un
    `.tmp` + rename: el panel lee este archivo a la vez y un volcado a medias lo
    dejaría ilegible justo cuando más se está mirando."""

    def __init__(self, nota):
        self.datos = {
            "id": time.strftime("%Y%m%d-%H%M%S"),
            "estado": "corriendo",
            "nota": nota,
            "empezado": time.strftime("%Y-%m-%d %H:%M:%S"),
            "terminado": None,
            "pasos": [
                {"clave": c, "titulo": t, "estado": "pendiente", "detalle": "", "segundos": 0}
                for c, t in PASOS
            ],
            "verificacion": [],
            "resumen": "",
        }
        self.volcar()

    def paso(self, clave):
        for p in self.datos["pasos"]:
            if p["clave"] == clave:
                return p
        raise KeyError(clave)

    def marcar(self, clave, estado, detalle="", segundos=None):
        p = self.paso(clave)
        p["estado"] = estado
        if detalle:
            p["detalle"] = detalle[-1200:]
        if segundos is not None:
            p["segundos"] = int(segundos)
        self.volcar()

    def cerrar(self, estado, resumen):
        self.datos["estado"] = estado
        self.datos["resumen"] = resumen
        self.datos["terminado"] = time.strftime("%Y-%m-%d %H:%M:%S")
        # Lo que quede pendiente cuando algo falla no se deja en «pendiente»:
        # eso parecería que sigue corriendo para siempre.
        if estado != "hecho":
            for p in self.datos["pasos"]:
                if p["estado"] in ("pendiente", "corriendo"):
                    p["estado"] = "omitido"
                    p["detalle"] = p["detalle"] or "no se llegó a hacer: algo falló antes"
        self.volcar()

    def volcar(self):
        os.makedirs(os.path.dirname(ESTADO), exist_ok=True)
        tmp = ESTADO + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.datos, f, ensure_ascii=False, indent=1)
        os.replace(tmp, ESTADO)


#: Techo de memoria para las puertas de node. La build ya lo tenía; tsc y vitest
#: no, y arrancaban con el techo por defecto — que en una Mac con el swap lleno
#: no alcanza ni para el arranque de node.
HEAP_PUERTAS = "--max-old-space-size=4096"
#: Lo que se espera antes de reintentar una puerta que reventó. No es magia: es
#: el tiempo que tarda el sistema en soltar lo que el proceso muerto tenía.
RESPIRO_S = 45


def puerta(diario, clave, orden, timeout=1800, intentos=2):
    """Corre una puerta cronometrada. Devuelve True si pasó.

    Si el proceso REVIENTA (se queda sin memoria, lo matan) en vez de dar un
    veredicto, espera y lo intenta una segunda vez, y lo cuenta como lo que es.
    Hoy el Mando dijo «los tipos no compilan» cuando lo que había pasado es que
    node murió antes de arrancar: media hora buscando un error inexistente.
    Un fallo DE VERDAD no se reintenta nunca — eso sería taparlo.
    """
    env = entorno()
    previo = env.get("NODE_OPTIONS", "")
    if "max-old-space-size" not in previo:
        env["NODE_OPTIONS"] = (previo + " " + HEAP_PUERTAS).strip()

    for intento in range(1, intentos + 1):
        t0 = time.time()
        diario.marcar(clave, "corriendo", "" if intento == 1 else "segundo intento tras quedarse sin memoria")
        rc, salida = correr(orden, timeout=timeout, env=env)
        tardo = time.time() - t0
        if rc == 0:
            diario.marcar(clave, "ok", resumen_salida(clave, salida), tardo)
            return True
        if RV.hay_que_reintentar(rc, salida, intento=intento, tope=intentos):
            diario.marcar(clave, "corriendo",
                          "el proceso murió sin memoria; esperando %d s y repitiendo" % RESPIRO_S,
                          tardo)
            time.sleep(RESPIRO_S)
            continue
        _ULTIMO[clave] = (rc, salida)
        diario.marcar(clave, "falla", salida, tardo)
        return False
    return False


#: Lo último que devolvió cada puerta, para poder explicar el fallo con verdad.
_ULTIMO = {}


def motivo_de(clave):
    """«No se publicó porque…», dicho con lo que de verdad pasó."""
    rc, salida = _ULTIMO.get(clave, (1, ""))
    return "no se publicó: " + RV.motivo(clave, rc, salida)


def resumen_salida(clave, salida):
    """De la parrafada de una puerta, la línea que de verdad dice cómo fue."""
    for linea in reversed((salida or "").splitlines()):
        l = linea.strip()
        if clave == "vitest" and l.startswith("Tests "):
            return l
        if clave == "python" and l.startswith("Ran "):
            return l
        if clave == "build" and "Compiled successfully" in l:
            return l
    return "en verde"


# ── el proceso ──────────────────────────────────────────────────────────────
def _reiniciar_mando(diario=None):
    """Tras una build, REINICIAR el Mando. No es un detalle: es obligatorio.

    (2026-09-16, medido) `next build` reemplaza `.next` entero. El servidor que ya estaba
    corriendo sigue sirviendo el HTML de su build anterior, con referencias a unos chunks
    que acaban de desaparecer del disco:

        GET /_next/static/chunks/webpack-8c7b75d0218cd13e.js → 400
        ls .next/static/chunks/webpack-8c7b75d0218cd13e.js   → no existe

    El HTML llega con un 200 impecable y la página no carga nunca. Desde fuera parece que
    el Mando está bien: responde. Por eso hay que reiniciarlo aquí y no fiarse del 200.

    (2026-09-22) Peor todavía: mientras la build corría, el directorio servido no existía
    y Alex veía «Internal Server Error» durante los cuatro minutos enteros. Desde hoy la
    puerta compila en `.next-build` (STARSEED_DIST) y es `reconstruir_mando` quien cambia
    el build de sitio con el servidor parado. El parón pasa de minutos a segundos.
    """
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import reconstruir_mando as _rm
        _rm.reiniciar_mando()
        return True
    except Exception:
        pass
    try:
        uid = os.getuid()
        r = subprocess.run(
            ["launchctl", "kickstart", "-k", "gui/%d/com.starseed.mando" % uid],
            capture_output=True, text=True, timeout=60,
        )
        ok = r.returncode == 0
    except Exception:
        ok = False
    if diario is not None and not ok:
        # Solo se dice cuando FALLA: un Mando sin reiniciar tras la build responde 200 y
        # no carga, y eso hay que verlo en el diario de la publicación.
        try:
            diario.marcar("build", "ok",
                          "AVISO: no pude reiniciar el Mando — reinícialo o servirá chunks muertos")
        except Exception:
            pass
    return ok


def necesita_build(base="origin/main"):
    """¿Cambió algo que la build sirva? Si solo se tocó Python o documentación,
    reconstruir son doce minutos tirados: `next build` no mira `scripts/`."""
    _, salida = git(["diff", "--name-only", "%s...HEAD" % base])
    rutas = [l.strip() for l in (salida or "").splitlines() if l.strip()]
    if not rutas:
        return False, "no hay nada nuevo respecto a origin/main"
    servidas = [
        r
        for r in rutas
        if r.startswith(("src/", "public/", "supabase/"))
        or r in ("next.config.ts", "next.config.js", "package.json", "tailwind.config.ts", "tsconfig.json")
    ]
    if servidas:
        return True, "%d archivo(s) que la build sirve" % len(servidas)
    return False, "solo se tocó lo que la build no mira (%s)" % ", ".join(sorted({r.split("/")[0] for r in rutas})[:4])


def hay_sin_commitear():
    _, salida = git(["status", "--porcelain"])
    return [l for l in (salida or "").splitlines() if l.strip()]


def main():
    nota = " ".join(sys.argv[1:]).strip()
    diario = Diario(nota)

    # 1 · rama y remoto. Publicar desde una rama que no es main, o con un rebase
    # a medias, es la forma más rápida de dejar el repo hecho un nudo.
    diario.marcar("rama", "corriendo")
    _, rama = git(["rev-parse", "--abbrev-ref", "HEAD"])
    rama = (rama or "").strip()
    if rama != "main":
        diario.marcar("rama", "falla", "estás en «%s», no en main: no publico desde aquí" % rama)
        diario.cerrar("fallo", "no se publicó: la rama activa es «%s», no main" % rama)
        return 1
    for marca, aviso in (("rebase-merge", "un rebase"), ("rebase-apply", "un rebase"), ("MERGE_HEAD", "una fusión")):
        if os.path.exists(os.path.join(RAIZ, ".git", marca)):
            diario.marcar("rama", "falla", "hay %s a medias: termínala antes de publicar" % aviso)
            diario.cerrar("fallo", "no se publicó: hay %s sin terminar" % aviso)
            return 1
    rc, _ = git(["fetch", "origin", "main"], timeout=180)
    if rc != 0:
        diario.marcar("rama", "falla", "no se pudo hablar con origin: ¿hay red?")
        diario.cerrar("fallo", "no se publicó: no se pudo contactar con origin")
        return 1
    diario.marcar("rama", "ok", "main, sin fusiones a medias y con origin al alcance")

    # 2 · commit de lo que haya suelto.
    sueltos = hay_sin_commitear()
    if not sueltos:
        diario.marcar("commit", "omitido", "no había nada sin commitear")
    else:
        diario.marcar("commit", "corriendo")
        rc, salida = git(["add", "-A"])
        if rc != 0:
            diario.marcar("commit", "falla", salida)
            diario.cerrar("fallo", "no se publicó: `git add` falló")
            return 1
        mensaje = nota or "Cambios del Puente de Mando"
        if "\n" not in mensaje:
            mensaje += "\n\nCommiteado desde el Puente de Mando tras pasar las cuatro puertas."
        rc, salida = git(["-c", "core.hooksPath=/dev/null", "commit", "-q", "-m", mensaje])
        if rc != 0:
            diario.marcar("commit", "falla", salida)
            diario.cerrar("fallo", "no se publicó: el commit falló")
            return 1
        diario.marcar("commit", "ok", "%d archivo(s) commiteado(s)" % len(sueltos))

    # 3-6 · las cuatro puertas. Ninguna se salta por ir con prisa, y ninguna
    # empieza hasta que la máquina esté libre: ver `tomar_turno`.
    tomar_turno(diario)
    if not puerta(diario, "tsc", ["npx", "tsc", "--noEmit"], timeout=1800):
        diario.cerrar("fallo", motivo_de("tsc"))
        return 1
    if not puerta(diario, "vitest", ["npx", "vitest", "run"], timeout=2400):
        diario.cerrar("fallo", motivo_de("vitest"))
        return 1
    if not puerta(
        diario,
        "python",
        [sys.executable, "-m", "unittest", "discover", "-s", "scripts/puente", "-p", "test_*.py"],
        timeout=900,
    ):
        diario.cerrar("fallo", motivo_de("python"))
        return 1

    hace_falta, porque = necesita_build()
    if not hace_falta:
        diario.marcar("build", "omitido", porque)
    else:
        env = entorno()
        env["NODE_OPTIONS"] = "--max-old-space-size=4096"  # con 3072 se queda sin memoria
        # NO SE COMPILA ENCIMA DE LO QUE SE ESTÁ SIRVIENDO. Ver `_reiniciar_mando`.
        env["STARSEED_DIST"] = ".next-build"
        try:
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            import reconstruir_mando as _rm
            libre = _rm.espacio_libre_gb()
            if not _rm.hay_sitio_para_compilar(libre):
                aviso = ("no se publicó: quedan %.1f GB libres y la build necesita %.1f"
                         % (libre, _rm.MINIMO_LIBRE_GB))
                diario.marcar("build", "falla", aviso)
                diario.cerrar("fallo", aviso)
                return 1
            _rm.preparar_dist_de_build()  # limpia y clona la caché (APFS): build rápida y sin coste
        except ImportError:
            pass
        t0 = time.time()
        diario.marcar("build", "corriendo", porque)
        rc, salida = correr(["npx", "next", "build"], timeout=3600, env=env)
        if rc != 0:
            diario.marcar("build", "falla", salida, time.time() - t0)
            diario.cerrar("fallo", "no se publicó: la build falló")
            return 1
        diario.marcar("build", "ok", resumen_salida("build", salida), time.time() - t0)
        try:
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            import reconstruir_mando as _rm
            _rm.marcar_listo()
        except Exception:
            pass
        _reiniciar_mando(diario)

    # Las puertas terminaron: el enjambre puede volver a compilar mientras
    # nosotros hablamos con la red. El `atexit` lo soltaría igual, pero esperar
    # al final del script le regalaría al enjambre un push entero de parón.
    soltar_turno()

    # 7 · push. Solo aquí, y solo con las cuatro en verde.
    _, pendientes = git(["log", "--format=%H", "origin/main..HEAD"])
    shas = [l.strip() for l in (pendientes or "").splitlines() if l.strip()]
    if not shas:
        diario.marcar("push", "omitido", "no había commits que origin no tuviera")
    else:
        diario.marcar("push", "corriendo", "%d commit(s)" % len(shas))
        rc, salida = git(["push", "origin", "main"], timeout=600)
        if rc != 0:
            diario.marcar("push", "falla", salida)
            diario.cerrar("fallo", "no se publicó: el push fue rechazado")
            return 1
        diario.marcar("push", "ok", "%d commit(s) en origin/main" % len(shas))

    # 8 · el verificador mira cambio por cambio y lo dice por su nombre.
    diario.marcar("verificacion", "corriendo")
    git(["fetch", "origin", "main"], timeout=180)
    veredictos, resumen_linea = VP.verificar(RAIZ, shas, pruebas_verdes=True)
    diario.datos["verificacion"] = veredictos
    informe = VP.en_texto(veredictos, resumen_linea)
    carpeta = os.path.join(RAIZ, "starseed_memory_root", "mando", "verificaciones")
    os.makedirs(carpeta, exist_ok=True)
    ruta = os.path.join(carpeta, "publicacion-%s.md" % diario.datos["id"])
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(informe)
    diario.datos["informe"] = os.path.relpath(ruta, RAIZ)
    fallidos = [v for v in veredictos if not v["aplicado"]]
    diario.marcar(
        "verificacion",
        "ok" if not fallidos else "falla",
        resumen_linea,
    )
    diario.cerrar("hecho" if not fallidos else "con_avisos", resumen_linea)

    # Que quede dicho también fuera del panel: en el bus lo ven los directores.
    try:
        import importlib.util

        spec = importlib.util.spec_from_file_location("puente", os.path.join(DIRECTORIO, "puente.py"))
        p = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(p)
        p.decir(informe[:1500], "publicador", "hecho" if not fallidos else "aviso")
    except Exception:
        pass  # el aviso es un extra: nunca puede tumbar una publicación buena
    print(resumen_linea)
    return 0


if __name__ == "__main__":
    sys.exit(main())
