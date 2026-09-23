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
import re
import subprocess
import sys
import time
import urllib.request

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.expanduser("~/Documents/starseed-os-main")
ESTADO = os.path.join(RAIZ, "starseed_memory_root", "mando", "reconstruccion.json")
#: Lo que escribe `publicar.py` paso a paso. Se lee para no compilar a la vez que él.
PUBLICACION = os.path.join(RAIZ, "starseed_memory_root", "mando", "publicacion-estado.json")
INTERVALO_S = int(os.environ.get("STARSEED_RECONSTRUIR_S", "180"))
ESPERA_TRAS_FALLO_S = int(os.environ.get("STARSEED_RECONSTRUIR_ESPERA_FALLO_S", "3600"))
SERVICIO = "com.starseed.mando"
#: Dónde compila quien no quiere tirar lo que se está sirviendo. Ver `next.config.ts`.
DIST_BUILD = os.environ.get("STARSEED_DIST_BUILD", ".next-build")
DIST_SERVIDO = ".next"
#: La escribe quien compiló, y solo si el compilador salió con 0. Ver `build_terminado`.
MARCA_LISTO = ".listo"
#: Por debajo de esto no se compila: `next build` muere con ENOSPC a mitad y deja basura.
MINIMO_LIBRE_GB = 4.5
#: (2026-09-23) Y DURANTE la build: si el disco baja de aquí, se para. Lo servido no se toca
#: —se compila aparte—, así que parar solo cuesta esa build; seguir podía costar la máquina.
#: Hoy hubo que pararla a mano DOS veces, con 124 MB libres, y el servicio de tokens ya se
#: había caído por ENOSPC. Con este vigilante, el umbral de entrada pudo bajar de 6,0 a 4,5:
#: la caché ya no se duplica (se mueve) y un fallo de cálculo ya no llena el disco.
MINIMO_DURANTE_GB = float(os.environ.get("STARSEED_MINIMO_DURANTE_GB", "1.5"))
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
    """El instante del build MÁS RECIENTE que hay en disco, servido o recién compilado.

    (2026-09-22) Desde que se compila aparte hay dos sitios: `.next` (lo que la pantalla
    está sirviendo) y `.next-build` (lo que acaba de salir del compilador y todavía no se
    ha puesto en su sitio). Mirar solo el servido haría recompilar una y otra vez lo que ya
    está hecho y esperando el cambio.
    """
    tiempos = []
    candidatos = ((DIST_SERVIDO, ("BUILD_ID", "build-manifest.json")),
                  # Del que aún no se sirve solo vale la marca: un `next build` a medias
                  # también tiene BUILD_ID, y contarlo daría «al día» con nada hecho.
                  (DIST_BUILD, (MARCA_LISTO,)))
    for dist, nombres in candidatos:
        for nombre in nombres:
            try:
                tiempos.append(os.stat(os.path.join(raiz, dist, nombre)).st_mtime_ns)
                break
            except OSError:
                continue
    return max(tiempos) if tiempos else None


def hay_sitio_para_compilar(libre_gb, minimo_gb=MINIMO_LIBRE_GB) -> bool:
    """PURA. (2026-09-22, medido) El disco de Alex estaba al 99 % y la build murió así:

        [Error: ENOSPC: no space left on device, open '.next-build/diagnostics/…']

    Compilar aparte cuesta un directorio más. Mejor decirlo antes que fallar a mitad.
    """
    if libre_gb is None:
        return True  # si no se puede medir, no se bloquea el trabajo
    return libre_gb >= minimo_gb


def compilar_vigilando_disco(orden, env=None, cwd=RAIZ, timeout=3600,
                             minimo_gb=None, cada_s=3.0, medir=None):
    """Corre la build y la PARA si el disco baja de `minimo_gb`.

    Devuelve (rc, salida_recortada, parada_por_disco). Se mata el GRUPO entero: `npx` lanza
    `next build` y este sus trabajadores, y matar solo al primero dejaba vivo al que llena
    el disco (visto hoy: un `next build` de 4,2 GB sobrevivió al kill de su padre).
    """
    import signal
    import tempfile
    minimo = MINIMO_DURANTE_GB if minimo_gb is None else minimo_gb
    medir = medir or (lambda: espacio_libre_gb(cwd))
    parada = None
    with tempfile.TemporaryFile(mode="w+", encoding="utf-8") as log:
        p = subprocess.Popen(orden, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT,
                             start_new_session=True)
        empezo = time.time()
        while p.poll() is None:
            libre = medir()
            if libre is not None and libre < minimo:
                parada = "disco"
                break
            if time.time() - empezo > timeout:
                parada = "tiempo"
                break
            time.sleep(cada_s)
        if parada:
            try:
                os.killpg(p.pid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError, OSError):
                pass
            p.wait()
        log.seek(0)
        salida = log.read()[-4000:]
    if parada == "disco":
        return 1, (salida + "\nPARADA: el disco bajó de %.1f GB libres en plena build; "
                   "se paró antes de llenarlo y lo que se sirve no se tocó" % minimo), True
    if parada == "tiempo":
        return 124, salida + "\nse pasó de %d s sin terminar" % timeout, False
    return p.returncode, salida, False


def liberar_lo_propio(raiz=RAIZ):
    """Tira lo que la compilación misma dejó y ya no sirve. Devuelve qué quitó.

    (2026-09-22) La publicación se paró con «quedan 4,0 GB libres y la build necesita 6,0»
    mientras en el disco había un `.next-anterior` de 532 MB y restos de `.next-build`: el
    guardia decía que no sin haber recogido primero lo suyo. Negarse es correcto; negarse
    sin mirar lo que uno mismo dejó tirado, no. La caché de webpack NO se toca aquí: es de
    quien está sirviendo y borrarla hace la siguiente compilación mucho más lenta.
    """
    quitados = []
    # (2026-09-23) La caché de webpack ahora viaja DENTRO de `.next-build` mientras se
    # compila. Si una build se quedó a medias, se devuelve antes de tirar los restos.
    if devolver_cache(raiz):
        quitados.append("(caché devuelta a %s)" % DIST_SERVIDO)
    for nombre in (".next-anterior", DIST_BUILD):
        ruta = os.path.join(raiz, nombre)
        if os.path.exists(ruta):
            subprocess.run(["rm", "-rf", ruta], check=False)
            quitados.append(nombre)
    return quitados


def espacio_libre_gb(raiz=RAIZ):
    """Gigas libres donde vive el repo, o None si no se puede medir."""
    try:
        e = os.statvfs(raiz)
        return (e.f_bavail * e.f_frsize) / (1024 ** 3)
    except (OSError, AttributeError):
        return None


def _webpack(raiz, dist):
    return os.path.join(raiz, dist, "cache", "webpack")


def devolver_cache(raiz=RAIZ) -> bool:
    """Si una build a medias se quedó con la caché de webpack, la devuelve al build servido.

    Devuelve True si movió algo. Se llama antes de limpiar `.next-build`: la caché es una
    sola y no se puede tirar con los restos de una compilación fallida.
    """
    en_build = _webpack(raiz, DIST_BUILD)
    servida = _webpack(raiz, DIST_SERVIDO)
    if not os.path.isdir(en_build) or os.path.isdir(servida):
        return False
    try:
        os.makedirs(os.path.dirname(servida), exist_ok=True)
        os.rename(en_build, servida)
        return True
    except OSError:
        return False


def preparar_dist_de_build(raiz=RAIZ) -> None:
    """Deja `.next-build` limpio y con la caché de webpack MOVIDA dentro (no copiada).

    (2026-09-23) Antes se CLONABA con `cp -Rc`: en APFS el clon es gratis… hasta que webpack
    reescribe sus paquetes, y los reescribe casi todos. Medido hoy: `.next-build` llegó a
    3,7 GB con la caché servida intacta al lado, el disco pasó de 6,6 GB libres a 124 MB en
    cuatro minutos y hubo que parar la build a mano antes de que el disco lleno tumbara
    todos los servicios (el de tokens ya se había caído así esta mañana).

    `next start` no lee `cache/webpack`: esa caché solo la usa `next build`. Así que se MUEVE
    —`rename` en el mismo disco: instantáneo y sin copiar un byte— y webpack, al reescribir
    un paquete, borra el viejo en vez de dejarlo duplicado. La caché de imágenes
    (`cache/images`) sí la usa el servidor, y esa no se toca.
    """
    devolver_cache(raiz)
    nuevo = os.path.join(raiz, DIST_BUILD)
    subprocess.run(["rm", "-rf", nuevo], check=False)
    servida = _webpack(raiz, DIST_SERVIDO)
    if not os.path.isdir(servida):
        return
    try:
        os.makedirs(os.path.join(nuevo, "cache"), exist_ok=True)
        os.rename(servida, _webpack(raiz, DIST_BUILD))
    except OSError as e:
        print("sin caché movida (%s): la build será más lenta" % type(e).__name__, flush=True)


def marcar_listo(raiz=RAIZ, dist=DIST_BUILD, inicio=None) -> None:
    """Deja constancia de que ese build terminó entero.

    (2026-09-23) `inicio` = cuándo EMPEZÓ la compilación. Las marcas del build (BUILD_ID,
    build-manifest.json y `.listo`) se fechan ahí, no al acabar: `next build` lee las
    fuentes al principio, así que lo que se edite DURANTE los 6-9 minutos de compilación
    no está dentro. Fechadas al final, esas ediciones quedaban «más viejas que el build» y
    el reconstructor decía «la pantalla está al día» para siempre (pasó con engine.ts:
    editado a las 21:53 de una build que empezó a las 21:49).
    """
    try:
        with open(os.path.join(raiz, dist, MARCA_LISTO), "w", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S"))
    except OSError:
        pass
    if inicio is None:
        return
    for nombre in (MARCA_LISTO, "BUILD_ID", "build-manifest.json"):
        try:
            os.utime(os.path.join(raiz, dist, nombre), (inicio, inicio))
        except OSError:
            pass


def build_terminado(raiz=RAIZ, dist=DIST_BUILD) -> bool:
    """¿Hay ahí un build ENTERO? Un `next build` a medias también tiene BUILD_ID.

    (2026-09-22) El reconstructor mira cada 180 s y `publicar.py` compila por su cuenta:
    sin esta marca los dos pueden cruzarse y poner en la pantalla un build a medio
    escribir —que es la misma enfermedad que veníamos a curar, con otro disfraz.
    """
    return (os.path.exists(os.path.join(raiz, dist, MARCA_LISTO))
            and os.path.exists(os.path.join(raiz, dist, "BUILD_ID")))


def id_del_build(raiz=RAIZ, dist=DIST_SERVIDO):
    """El identificador del build que hay en `dist/BUILD_ID`, o None si no hay."""
    try:
        with open(os.path.join(raiz, dist, "BUILD_ID"), encoding="utf-8") as f:
            return f.read().strip() or None
    except OSError:
        return None


def normalizar_dist(texto, de=DIST_BUILD, a=DIST_SERVIDO) -> str:
    """PURA: deja el manifiesto del build hablando del directorio donde acabó.

    `next start` lee su configuración de `next.config.ts`, no del manifiesto, así que esto
    no cambia cómo se sirve; pero un `required-server-files.json` que sigue diciendo
    `.next-build` después del cambio es una mentira escrita en disco, y de esas ya hemos
    tenido bastantes.
    """
    return texto.replace('"%s/' % de, '"%s/' % a).replace('"%s"' % de, '"%s"' % a)


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
    # SE COMPILA APARTE. `next start` lee de `.next` en caliente, así que compilar encima
    # del directorio servido daba «Internal Server Error» durante toda la compilación
    # (ENOENT: required-server-files.json). Aquí se construye en `.next-build` y el
    # servidor sigue con el `.next` de siempre hasta el cambio. (2026-09-22)
    entorno["STARSEED_DIST"] = DIST_BUILD
    preparar_dist_de_build()
    try:
        rc, salida, por_disco = compilar_vigilando_disco(
            [sys.executable, os.path.join(RAIZ, "scripts", "puente", "con-turno.py"),
             "--", "npx", "next", "build"],
            env=entorno, timeout=60 * 40,
        )
        ok = rc == 0
        if por_disco:
            liberar_lo_propio()
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
        marcar_listo(inicio=empezo)
        reiniciar_mando()
    return datos


def intercambiar_build() -> bool:
    """Pone el build recién hecho en el sitio del servido. Solo si hay uno nuevo.

    (2026-09-22) El cambio se hace con el servidor PARADO —entre el `bootout` y el
    `bootstrap` del reinicio— porque `next start` lee de `.next` en caliente: cambiarlo
    debajo de un servidor vivo es exactamente el «Internal Server Error» que esto viene a
    quitar. La carpeta vieja se guarda como `.next-anterior` hasta el siguiente cambio:
    si el build nuevo estuviera roto, ahí está el que funcionaba.
    """
    nuevo = os.path.join(RAIZ, DIST_BUILD)
    servido = os.path.join(RAIZ, DIST_SERVIDO)
    anterior = os.path.join(RAIZ, ".next-anterior")
    if not build_terminado():
        return False
    try:
        if os.path.exists(anterior):
            subprocess.run(["rm", "-rf", anterior], check=False)
        if os.path.exists(servido):
            os.rename(servido, anterior)
        os.rename(nuevo, servido)
    except OSError as e:
        print("no pude cambiar el build de sitio: %s" % e, flush=True)
        return False
    # El anterior se guarda por si el nuevo sale roto, pero SIN su caché: son 4 GB que no
    # hacen falta para volver atrás y el disco de Alex no los tiene.
    subprocess.run(["rm", "-rf", os.path.join(anterior, "cache")], check=False)
    try:
        manifiesto = os.path.join(servido, "required-server-files.json")
        with open(manifiesto, encoding="utf-8") as f:
            texto = f.read()
        arreglado = normalizar_dist(texto)
        if arreglado != texto:
            with open(manifiesto, "w", encoding="utf-8") as f:
                f.write(arreglado)
    except OSError:
        pass
    return True


def chunk_del_html(html):
    """PURA: el chunk de arranque que pide una página servida, o None.

    Es la huella de QUÉ build tiene el servidor EN MEMORIA, que no siempre es el que hay
    en el disco. Ver `sirve_lo_que_hay_en_disco`.
    """
    m = re.search(r"webpack-[0-9a-f]+\.js", html or "")
    return m.group(0) if m else None


def sirve_lo_que_hay_en_disco(html, raiz=RAIZ):
    """PURA-ish: ¿el servidor sirve el build que está en el disco?

    (2026-09-22, MEDIDO) Aquí se coló la misma enfermedad con otro disfraz. El plist del
    Mando tiene `KeepAlive`, así que `launchctl kill SIGTERM` no para nada: launchd
    relanza el servidor EN EL ACTO, antes de que dé tiempo a cambiar los directorios de
    sitio. El Mando volvía a levantar el build VIEJO y, un segundo después, ese build se
    iba del disco. Resultado en la pantalla de Alex:

        HTML servido pide  webpack-68ad2f16eee5d4c9.js
        en el disco había  webpack-d2bbf8601d41ad89.js
        consola → Refused to execute script … MIME type ('text/html') is not executable

    La página se quedaba en «Midiendo el pulso del trabajo…» para siempre, con un 200
    impecable. Por eso esto no se supone: se comprueba.
    """
    chunk = chunk_del_html(html)
    if not chunk:
        return True  # sin pista no se acusa a nadie
    return os.path.exists(os.path.join(raiz, DIST_SERVIDO, "static", "chunks", chunk))


def _html_del_mando(url="http://localhost:9002/mando", timeout=20):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.read().decode("utf-8", "replace")
    except Exception:
        return ""


def servicio_cargado(etiqueta) -> bool:
    """¿launchd tiene ese servicio? Arrancar no es haber arrancado."""
    r = subprocess.run(["launchctl", "print", etiqueta], capture_output=True, text=True)
    return r.returncode == 0


#: Un solo reinicio a la vez. `publicar.py` y el reconstructor llaman los dos aquí.
CERROJO_REINICIO = os.path.expanduser("~/.starseed/cerrojos/reinicio-mando.lock")


def _tomar_cerrojo(ruta=CERROJO_REINICIO, espera_s=180, caduca_s=600):
    """Directorio atómico: o lo creas tú, o ya lo tiene otro. Devuelve si es tuyo.

    (2026-09-22, MEDIDO) El Mando se quedó APAGADO dos veces —ni en `launchctl list`, ni
    proceso, ni nada en el 9002— y las dos con el mismo patrón: `publicar.py` y el
    reconstructor reiniciándolo a la vez. Uno hacía `bootout` justo entre el `bootstrap`
    y la comprobación del otro, así que el segundo veía el servicio cargado, decía «Mando
    reiniciado» y se iba tan tranquilo mientras el primero lo acababa de tirar.

    Dos procesos parando y arrancando el mismo servicio a la vez no es una carrera rara:
    es lo normal aquí, y por eso se serializa.
    """
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    limite = time.time() + espera_s
    while True:
        try:
            os.mkdir(ruta)
            return True
        except FileExistsError:
            # Cuánto se espera y cuándo un cerrojo se da por abandonado son dos cosas
            # distintas: con un solo número, esperar poco convertía en basura un cerrojo
            # recién puesto por alguien que estaba trabajando.
            try:
                if time.time() - os.stat(ruta).st_mtime > caduca_s:
                    subprocess.run(["rm", "-rf", ruta], check=False)
                    continue
            except OSError:
                pass
            if time.time() >= limite:
                return False
            time.sleep(2)


def _soltar_cerrojo(ruta=CERROJO_REINICIO):
    subprocess.run(["rm", "-rf", ruta], check=False)


def reiniciar_mando() -> None:
    """Para el Mando DE VERDAD, cambia el build de sitio y lo vuelve a arrancar."""
    if not _tomar_cerrojo():
        print("otro proceso está reiniciando el Mando; no me meto", flush=True)
        return
    try:
        _reiniciar_mando_sin_cerrojo()
    finally:
        _soltar_cerrojo()


def _reiniciar_mando_sin_cerrojo() -> None:
    uid = os.getuid()
    etiqueta = "gui/%d/%s" % (uid, SERVICIO)
    plist = os.path.expanduser("~/Library/LaunchAgents/%s.plist" % SERVICIO)
    # `kill SIGTERM` NO basta: con `KeepAlive` launchd lo relanza antes del cambio y el
    # Mando levanta el build viejo. `bootout` lo descarga; nadie lo relanza a mitad.
    subprocess.run(["launchctl", "bootout", etiqueta], capture_output=True, text=True)
    time.sleep(1)
    if intercambiar_build():
        print("build nuevo puesto en su sitio (el anterior queda en .next-anterior)", flush=True)
    # (2026-09-22, MEDIDO) `bootstrap` justo después de `bootout` FALLA a veces —launchd
    # todavía está desmontando el servicio— y entonces el Mando se queda APAGADO: ni en
    # `launchctl list`, ni proceso, ni nada escuchando en el 9002. Me pasó hoy y lo tuve
    # que levantar a mano. Parar de verdad era lo correcto; darlo por arrancado sin mirar,
    # no. Se reintenta y se COMPRUEBA que el servicio existe.
    for intento in range(5):
        subprocess.run(["launchctl", "bootstrap", "gui/%d" % uid, plist],
                       capture_output=True, text=True)
        subprocess.run(["launchctl", "kickstart", etiqueta], capture_output=True, text=True)
        if servicio_cargado(etiqueta):
            break
        print("el Mando no arrancó al intento %d; reintento" % (intento + 1), flush=True)
        time.sleep(2)
    else:
        print("NO PUDE ARRANCAR EL MANDO tras 5 intentos: la pantalla se queda apagada",
              flush=True)
    # Y se vuelve a mirar unos segundos después: «cargado» justo tras `bootstrap` no
    # significa «sigue vivo». Las dos veces que se apagó, el servicio desapareció DESPUÉS
    # de que alguien dijera «Mando reiniciado».
    time.sleep(6)
    if not servicio_cargado(etiqueta):
        print("el Mando se cayó después de arrancar: lo levanto otra vez", flush=True)
        subprocess.run(["launchctl", "bootstrap", "gui/%d" % uid, plist],
                       capture_output=True, text=True)
    # Y ahora se COMPRUEBA que sirve lo que hay en el disco, en vez de darlo por hecho.
    time.sleep(8)
    if not sirve_lo_que_hay_en_disco(_html_del_mando()):
        print("el Mando servía un build que ya no está en el disco: lo reinicio otra vez",
              flush=True)
        subprocess.run(["launchctl", "kickstart", "-k", etiqueta], capture_output=True, text=True)
        time.sleep(8)
    servido = id_del_build()
    # `estado` se cierra aquí a propósito: solo se reinicia tras un build bueno o para
    # servir uno ajeno que ya está en el disco, así que en los dos casos la pantalla queda
    # al día. Si no, un intento interrumpido dejaba «reconstruyendo» puesto para siempre.
    _guardar(dict(_leer_estado(), build_servido=servido, estado="al-dia", ok=True,
                  error=None, visto=time.strftime("%Y-%m-%d %H:%M:%S")))
    print("Mando reiniciado: la pantalla ya sirve el código nuevo (%s)" % (servido or "?"),
          flush=True)


def conversando(ruta=os.path.expanduser("~/.starseed/conversacion.json")) -> bool:
    """¿Hay una conversación en curso con Astraura (concesión de `voz_rt.py`)?"""
    try:
        with open(ruta, encoding="utf-8") as f:
            return float(json.load(f).get("hasta") or 0) > time.time()
    except (OSError, ValueError, TypeError):
        return False


def una_pasada() -> bool:
    entradas = list(_entradas())
    actual = huella_de(entradas)
    estado = _leer_estado()
    hazlo, motivo = decidir(actual, estado, time.time(),
                            mas_nuevas=cuantas_mas_nuevas(mtime_del_build(), entradas))
    if hazlo and conversando():
        # (2026-09-22) Una build se come 3-4 GB de RAM en esta Mac: en plena conversación
        # con Astraura dejaría a la voz y a BitNet sin memoria. Se espera a que acabe.
        print("[%s] espero: %s, pero Alex está hablando con Astraura" % (time.strftime("%H:%M"), motivo),
              flush=True)
        return False
    if hazlo and publicacion_va_a_compilar(_leer_estado(PUBLICACION)):
        print("[%s] espero: %s, pero la publicación en marcha va a compilar: su build sirve"
              % (time.strftime("%H:%M"), motivo), flush=True)
        return False
    libre = espacio_libre_gb()
    if hazlo and not hay_sitio_para_compilar(libre):
        # Antes de decir que no, se recoge lo que dejó la compilación anterior.
        quitados = liberar_lo_propio()
        if quitados:
            libre = espacio_libre_gb()
            print("[%s] recojo lo mío antes de rendirme (%s): quedan %.1f GB"
                  % (time.strftime("%H:%M"), ", ".join(quitados), libre), flush=True)
    if hazlo and not hay_sitio_para_compilar(libre):
        aviso = ("no compilo: quedan %.1f GB libres y hacen falta %.1f (ya tiré lo mío; "
                 "esto es disco del Mac, no del Puente)" % (libre, MINIMO_LIBRE_GB))
        print("[%s] %s" % (time.strftime("%H:%M"), aviso), flush=True)
        _guardar(dict(_leer_estado(), estado="sin-sitio", ok=False, error=aviso,
                      visto=time.strftime("%Y-%m-%d %H:%M:%S")))
        return False
    if hazlo:
        print("[%s] RECONSTRUYO: %s" % (time.strftime("%H:%M"), motivo), flush=True)
        reconstruir(actual)
        return True

    # Compilar no es servir: si otro compiló (publicar.py), basta con reiniciar.
    pendiente = id_del_build(dist=DIST_BUILD) if build_terminado() else None
    reinicia, porque = decidir_reinicio(pendiente or id_del_build(),
                                        estado.get("build_servido"))
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
