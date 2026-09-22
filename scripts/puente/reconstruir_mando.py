#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reconstruye el Puente cuando su código cambia, sin que nadie lo pida.

POR QUÉ EXISTE (2026-09-22). Alex lleva días diciendo «pero aun no ha cambiado nada de lo
que te he pedido, todo sigue igual» delante de una pantalla que, efectivamente, seguía
igual — y no porque el arreglo no estuviera hecho, sino porque **el Mando se sirve con
`next start`, o sea de un build compilado**. Editar `src/` no cambia nada de lo que se ve:
hasta que alguien corre `next build` y reinicia el servicio, la pantalla enseña el código
de la última compilación. `arrancar-mando.sh` ya lo decía por escrito («'next start' sirve
el build compilado, así que compila primero»), y aun así nadie compilaba: el paso vivía en
la cabeza de quien editaba. Un arreglo que solo existe en el disco no está entregado.

Esto lo cierra: cada `INTERVALO_S` se mira una huella de las fuentes de la pantalla; si no
coincide con la del último build, se reconstruye CON EL TURNO DE LA MÁQUINA (para no
pelearse por la RAM con los agentes) y se reinicia el servicio del Mando.

Lo que NO hace, a propósito:
  · No reconstruye por un cambio en Python ni en las colas: solo por lo que compila el
    build (`src/`, `public/`, configuración y dependencias).
  · No insiste con un build que ya falló con las MISMAS fuentes: esperaría volver a fallar
    igual, y un bucle de builds rojos deja la Mac de rodillas. Espera a que el código
    cambie (o a que pase `ESPERA_TRAS_FALLO_S`).
  · No interrumpe a nadie: el turno de la máquina se pide, no se arrebata.

  python3 scripts/puente/reconstruir_mando.py            # servicio
  python3 scripts/puente/reconstruir_mando.py --una-vez  # una pasada y salir
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.expanduser("~/Documents/starseed-os-main")
ESTADO = os.path.join(RAIZ, "starseed_memory_root", "mando", "reconstruccion.json")
#: Lo que escribe `publicar.py` paso a paso. Se lee para no compilar a la vez que él.
PUBLICACION = os.path.join(RAIZ, "starseed_memory_root", "mando", "publicacion-estado.json")
INTERVALO_S = int(os.environ.get("STARSEED_RECONSTRUIR_S", "180"))
ESPERA_TRAS_FALLO_S = int(os.environ.get("STARSEED_RECONSTRUIR_ESPERA_FALLO_S", "3600"))
SERVICIO = "com.starseed.mando"
#: Lo que de verdad entra en el build. `scripts/` y `starseed_memory_root/` NO están:
#: cambian cada minuto por el propio enjambre y reconstruirían la pantalla sin motivo.
FUENTES = ("src", "public")
ARCHIVOS = ("package.json", "package-lock.json", "next.config.ts", "next.config.js",
            "tailwind.config.ts", "tsconfig.json", "postcss.config.mjs")
#: Ni el build ni la pantalla dependen de esto, y cambia constantemente.
IGNORADOS = (".next", "node_modules", "__pycache__", ".git", ".DS_Store")


def huella_de(entradas) -> str:
    """PURA: la huella de un conjunto de archivos, como (ruta, mtime_ns, tamaño).

    Se ordena antes de resumir para que el orden en que el disco los devuelva no cambie la
    huella: si la huella variase sola, el servicio reconstruiría en cada pasada.
    """
    h = hashlib.sha256()
    for ruta, mtime, tam in sorted(entradas):
        h.update(("%s|%s|%s\n" % (ruta, mtime, tam)).encode("utf-8"))
    return h.hexdigest()[:16]


def _entradas(raiz=RAIZ):
    for nombre in ARCHIVOS:
        p = os.path.join(raiz, nombre)
        try:
            st = os.stat(p)
        except OSError:
            continue
        yield nombre, st.st_mtime_ns, st.st_size
    for carpeta in FUENTES:
        base = os.path.join(raiz, carpeta)
        for aqui, dirs, archivos in os.walk(base):
            dirs[:] = [d for d in dirs if d not in IGNORADOS]
            for a in archivos:
                if a in IGNORADOS:
                    continue
                p = os.path.join(aqui, a)
                try:
                    st = os.stat(p)
                except OSError:
                    continue
                yield os.path.relpath(p, raiz), st.st_mtime_ns, st.st_size


def huella_viva(raiz=RAIZ) -> str:
    return huella_de(_entradas(raiz))


def cuantas_mas_nuevas(mtime_build, entradas) -> int:
    """PURA: cuántas fuentes son más nuevas que el build que se está sirviendo.

    Esta es la pregunta de verdad —«¿lo que se ve es más viejo que el código?»— y se
    responde mirando el build, no un cuaderno de huellas. La ventaja es concreta: da igual
    QUIÉN compiló. `publicar.py` pasa `next build` como puerta antes de empujar, así que un
    build suyo deja la pantalla al día y este servicio ya no repite otro build de diez
    minutos detrás. `None` en `mtime_build` (no hay build) cuenta todo como más nuevo.
    """
    if mtime_build is None:
        return sum(1 for _ in entradas)
    return sum(1 for _, mtime, _tam in entradas if mtime > mtime_build)


def mtime_del_build(raiz=RAIZ):
    """El instante del build que sirve `next start`, o None si no hay build."""
    for rel in (os.path.join(".next", "BUILD_ID"), os.path.join(".next", "build-manifest.json")):
        try:
            return os.stat(os.path.join(raiz, rel)).st_mtime_ns
        except OSError:
            continue
    return None


def id_del_build(raiz=RAIZ):
    """El identificador del build compilado (`.next/BUILD_ID`), o None si no hay."""
    try:
        with open(os.path.join(raiz, ".next", "BUILD_ID"), encoding="utf-8") as f:
            return f.read().strip() or None
    except OSError:
        return None


def decidir_reinicio(build_id, build_servido):
    """PURA: (reiniciar: bool, motivo: str). Compilar no es servir.

    (2026-09-22) `next start` lee `.next` AL ARRANCAR. Cuando el build lo hace otro —
    `publicar.py` lo pasa como puerta antes de empujar— el disco queda al día y el servidor
    sigue sirviendo el build anterior hasta que alguien lo reinicia. Mirar solo «¿hay
    fuentes más nuevas que el build?» daría «al día» con la pantalla vieja delante: por eso
    también se compara el build compilado con el que el Mando tenía cuando arrancó.
    """
    if not build_id:
        return False, "no hay build que servir"
    if build_id == build_servido:
        return False, "el Mando ya sirve este build"
    return True, "hay un build más nuevo que el que sirve el Mando (%s)" % build_id[:12]


def publicacion_va_a_compilar(publicacion) -> bool:
    """PURA: ¿hay una publicación en marcha que todavía tiene que pasar `next build`?

    (2026-09-22) `publicar.py` compila como puerta obligatoria antes de empujar. Si este
    servicio se pone a compilar a la vez, los dos se turnan la máquina y la Mac se pasa
    veinte minutos haciendo dos veces el mismo build — medido: con los dos a la vez, un
    test de tiempos de la suite falló por falta de máquina, no por el código. Así que si la
    publicación va a compilar, aquí se espera: su build sirve, y después basta un reinicio.
    """
    if not isinstance(publicacion, dict):
        return False
    if str(publicacion.get("estado")) != "corriendo":
        return False
    for paso in publicacion.get("pasos") or []:
        if isinstance(paso, dict) and paso.get("clave") == "build":
            return str(paso.get("estado")) in ("pendiente", "corriendo")
    return False


def decidir(huella_actual, estado, ahora, espera_tras_fallo_s=ESPERA_TRAS_FALLO_S,
            mas_nuevas=None):
    """PURA: (reconstruir: bool, motivo: str).

    `estado` es lo guardado del build anterior: `huella_construida`, `ok`, `t` (epoch).
    `mas_nuevas` es cuántas fuentes son más nuevas que el build servido; si se pasa, MANDA
    sobre la huella (mide el disco, no la contabilidad).
    """
    estado = estado if isinstance(estado, dict) else {}
    construida = estado.get("huella_construida")
    if mas_nuevas is not None:
        if mas_nuevas == 0:
            return False, "la pantalla está al día"
        if estado.get("ok") is False and estado.get("huella_intentada") == huella_actual:
            try:
                desde = float(ahora) - float(estado.get("t") or 0)
            except (TypeError, ValueError):
                desde = espera_tras_fallo_s + 1
            if desde < espera_tras_fallo_s:
                return False, "el build de estas mismas fuentes falló hace %d min: espero" % int(desde / 60)
        return True, "%d archivo(s) de la pantalla son más nuevos que el build servido" % mas_nuevas
    if not construida:
        return True, "no hay build registrado: la pantalla podría ser de cualquier versión"
    if construida == huella_actual:
        if estado.get("ok") is False:
            return False, "el último build falló con estas mismas fuentes: espero un cambio"
        return False, "la pantalla está al día"
    if estado.get("ok") is False and estado.get("huella_intentada") == huella_actual:
        try:
            desde = float(ahora) - float(estado.get("t") or 0)
        except (TypeError, ValueError):
            desde = espera_tras_fallo_s + 1
        if desde < espera_tras_fallo_s:
            return False, "el build de estas mismas fuentes falló hace %d min: espero" % int(desde / 60)
    return True, "las fuentes de la pantalla cambiaron desde el último build"


def _leer_estado(ruta=ESTADO) -> dict:
    try:
        with open(ruta, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def _guardar(datos, ruta=ESTADO) -> None:
    try:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
    except OSError:
        pass


def primera_linea_de_error(salida) -> str:
    """PURA: la línea que de verdad explica por qué falló el build."""
    for linea in (salida or "").splitlines():
        l = linea.strip()
        if not l:
            continue
        if l.startswith("Type error:") or l.startswith("Error:") or "error TS" in l:
            return l[:300]
    for linea in reversed((salida or "").splitlines()):
        if linea.strip():
            return linea.strip()[:300]
    return "sin salida"


def reconstruir(huella_actual) -> dict:
    """Construye con el turno de la máquina y reinicia el Mando si salió bien."""
    _guardar(dict(_leer_estado(), estado="reconstruyendo", huella_intentada=huella_actual,
                  t=time.time(), visto=time.strftime("%Y-%m-%d %H:%M:%S")))
    empezo = time.time()
    entorno = dict(os.environ)
    # 2 GB por defecto no bastan con el enjambre vivo: el build muere por memoria.
    entorno.setdefault("NODE_OPTIONS", "--max-old-space-size=5120")
    try:
        r = subprocess.run(
            [sys.executable, os.path.join(RAIZ, "scripts", "puente", "con-turno.py"),
             "--", "npx", "next", "build"],
            cwd=RAIZ, capture_output=True, text=True, timeout=60 * 40, env=entorno,
        )
        ok = r.returncode == 0
        salida = (r.stdout or "") + (r.stderr or "")
    except Exception as e:
        ok, salida = False, "%s: %s" % (type(e).__name__, e)
    segundos = int(time.time() - empezo)
    datos = {
        "estado": "al-dia" if ok else "fallo",
        "ok": ok,
        "segundos": segundos,
        "t": time.time(),
        "visto": time.strftime("%Y-%m-%d %H:%M:%S"),
        "huella_intentada": huella_actual,
        "huella_construida": huella_actual if ok else _leer_estado().get("huella_construida"),
        "error": None if ok else primera_linea_de_error(salida),
    }
    _guardar(datos)
    print("[%s] build %s en %d s%s" % (time.strftime("%H:%M"), "ok" if ok else "FALLÓ",
                                       segundos, "" if ok else ": " + (datos["error"] or "")),
          flush=True)
    if ok:
        reiniciar_mando()
    return datos


def reiniciar_mando() -> None:
    """Reinicia el servicio del Mando y anota QUÉ build queda servido."""
    subprocess.run(["launchctl", "kickstart", "-k",
                    "gui/%d/%s" % (os.getuid(), SERVICIO)],
                   capture_output=True, text=True)
    servido = id_del_build()
    # `estado` se cierra aquí a propósito: solo se reinicia tras un build bueno o para
    # servir uno ajeno que ya está en el disco, así que en los dos casos la pantalla queda
    # al día. Si no, un intento interrumpido dejaba «reconstruyendo» puesto para siempre.
    _guardar(dict(_leer_estado(), build_servido=servido, estado="al-dia", ok=True,
                  error=None, visto=time.strftime("%Y-%m-%d %H:%M:%S")))
    print("Mando reiniciado: la pantalla ya sirve el código nuevo (%s)" % (servido or "?"),
          flush=True)


def una_pasada() -> bool:
    entradas = list(_entradas())
    actual = huella_de(entradas)
    estado = _leer_estado()
    hazlo, motivo = decidir(actual, estado, time.time(),
                            mas_nuevas=cuantas_mas_nuevas(mtime_del_build(), entradas))
    if hazlo and publicacion_va_a_compilar(_leer_estado(PUBLICACION)):
        print("[%s] espero: %s, pero la publicación en marcha va a compilar: su build sirve"
              % (time.strftime("%H:%M"), motivo), flush=True)
        return False
    if hazlo:
        print("[%s] RECONSTRUYO: %s" % (time.strftime("%H:%M"), motivo), flush=True)
        reconstruir(actual)
        return True

    # Compilar no es servir: si otro compiló (publicar.py), basta con reiniciar.
    reinicia, porque = decidir_reinicio(id_del_build(), estado.get("build_servido"))
    if reinicia:
        print("[%s] REINICIO: %s" % (time.strftime("%H:%M"), porque), flush=True)
        reiniciar_mando()
        return True

    print("[%s] espero: %s" % (time.strftime("%H:%M"), motivo), flush=True)
    # Se anota igual: así el Puente puede decir «al día» con fecha, no de memoria.
    _guardar(dict(estado, visto=time.strftime("%Y-%m-%d %H:%M:%S"), huella_vista=actual))
    return False


def main() -> int:
    if "--una-vez" in sys.argv:
        una_pasada()
        return 0
    print("Reconstructor del Mando · cada %d s · el build va con el turno de la máquina"
          % INTERVALO_S, flush=True)
    while True:
        try:
            una_pasada()
        except Exception as e:
            print("reconstruir-mando: %s: %s" % (type(e).__name__, e), flush=True)
        time.sleep(INTERVALO_S)


if __name__ == "__main__":
    sys.exit(main() or 0)
