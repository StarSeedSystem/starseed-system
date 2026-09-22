#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""La clave unificada de FreeLLMAPI se coge sola de su base de datos.

Alex (2026-09-22): «¿no se supone que la api de freellmapi se consigue automáticamente?».
Sí, y se podía desde el principio: FreeLLMAPI genera su clave unificada al arrancar y la
guarda en `settings.unified_api_key` de su propia base de datos, en el disco de Alex.
Nadie la copiaba a `~/.starseed/env`, así que `FREELLMAPI_KEY` estaba vacía o vieja, la
pasarela contestaba 401 a todo, el renovador la daba por caída y el Puente le pedía a Alex
«renovar la clave» de un servicio que se la había generado él solo.

Esto lo cierra: se lee de SU base de datos y se escribe en el archivo de entorno, con el
mismo guion que ya usamos para todo lo demás (`guardar-clave.sh` entrecomilla y reemplaza
en vez de duplicar). Nunca se imprime el valor: solo su huella sha256, que sirve para
comprobar que cambió sin enseñar lo que es.

Por qué esto SÍ lo puede hacer el sistema y una clave de proveedor NO: esta no es la
credencial de un tercero ni la cuenta de nadie. Es el secreto que un servicio LOCAL —que
corre en esta máquina, que instalamos nosotros— se generó a sí mismo para hablar consigo
mismo. Moverla del archivo donde nace al archivo donde se lee no es tomar una decisión de
Alex: es acabar una instalación a medias.

  python3 scripts/puente/freellmapi_clave.py            # sincroniza y dice la huella
  python3 scripts/puente/freellmapi_clave.py --mirar    # solo mira, no escribe
"""
from __future__ import annotations

import hashlib
import os
import sqlite3
import sys

BASE = os.path.expanduser("~/.starseed/herramientas/freellmapi/server/data/freeapi.db")
ENTORNO = os.path.expanduser("~/.starseed/env")
VARIABLE = "FREELLMAPI_KEY"


def huella(valor: str) -> str:
    """Los doce primeros de su sha256. Nunca el valor."""
    return hashlib.sha256((valor or "").encode("utf-8")).hexdigest()[:12] if valor else "(vacía)"


def clave_de_la_base(ruta=BASE):
    """La clave unificada que FreeLLMAPI se generó, o None si aún no existe."""
    if not os.path.exists(ruta):
        return None
    try:
        # Solo lectura: si el servicio está escribiendo, se espera en vez de romper nada.
        con = sqlite3.connect("file:%s?mode=ro" % ruta, uri=True, timeout=10)
        fila = con.execute("select value from settings where key = 'unified_api_key'").fetchone()
        con.close()
        return (fila[0] or "").strip() or None if fila else None
    except sqlite3.Error:
        return None


def clave_del_entorno(ruta=ENTORNO, variable=VARIABLE):
    """Lo que hay ahora en el archivo de entorno, o None."""
    try:
        with open(ruta, encoding="utf-8") as f:
            for linea in f:
                l = linea.strip()
                if l.startswith("export "):
                    l = l[len("export "):]
                if l.startswith(variable + "="):
                    return l.split("=", 1)[1].strip().strip("\"'") or None
    except OSError:
        pass
    return None


def hay_que_escribir(en_base, en_entorno) -> bool:
    """PURA: solo se escribe si la base tiene clave y difiere de la del entorno."""
    return bool(en_base) and en_base != en_entorno


def escribir(valor: str, ruta=ENTORNO, variable=VARIABLE) -> bool:
    """Reemplaza la línea de la variable (o la añade), entrecomillada y sin duplicar."""
    linea = '%s="%s"\n' % (variable, valor)
    try:
        try:
            with open(ruta, encoding="utf-8") as f:
                lineas = f.readlines()
        except FileNotFoundError:
            lineas = []
        fuera, puesta = [], False
        for l in lineas:
            desnuda = l.strip()[len("export "):] if l.strip().startswith("export ") else l.strip()
            if desnuda.startswith(variable + "="):
                if not puesta:
                    fuera.append(linea)
                    puesta = True
                continue
            fuera.append(l)
        if not puesta:
            fuera.append(linea)
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        tmp = ruta + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.writelines(fuera)
        os.chmod(tmp, 0o600)
        os.replace(tmp, ruta)
        return True
    except OSError as e:
        print("no pude escribir %s: %s" % (ruta, e), file=sys.stderr)
        return False


def main() -> int:
    en_base = clave_de_la_base()
    en_entorno = clave_del_entorno()
    if not en_base:
        print("FreeLLMAPI todavía no ha generado su clave unificada "
              "(¿arrancó ya el servicio com.starseed.freellmapi?)")
        return 1
    if not hay_que_escribir(en_base, en_entorno):
        print("%s ya está al día · huella %s" % (VARIABLE, huella(en_base)))
        return 0
    if "--mirar" in sys.argv:
        print("%s DIFIERE: entorno %s · base %s (no escribo, --mirar)"
              % (VARIABLE, huella(en_entorno), huella(en_base)))
        return 0
    if escribir(en_base):
        print("%s sincronizada desde la base de FreeLLMAPI · huella %s (antes %s)"
              % (VARIABLE, huella(en_base), huella(en_entorno)))
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
