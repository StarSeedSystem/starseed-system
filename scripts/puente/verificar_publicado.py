# -*- coding: utf-8 -*-
"""Recoge del repo los hechos que el verificador puro necesita.

Aquí sí se toca git y el disco. La decisión —¿integrado? ¿aplicado?— no se toma
en este archivo: se toma en `verificacion_cambios`, que es puro y está probado.
Esta separación es a propósito: así la regla se puede probar sin un repo delante.
"""

import os
import re
import subprocess

import verificacion_cambios as VC


def _git(raiz, args, timeout=60):
    try:
        r = subprocess.run(
            ["git"] + args, cwd=raiz, capture_output=True, text=True, timeout=timeout
        )
        return r.returncode, r.stdout
    except Exception:
        return 1, ""


def build_timestamp(raiz):
    """Cuándo se construyó lo que el Mando está sirviendo AHORA.

    `.next/BUILD_ID` se reescribe en cada build, así que su fecha es la fecha de
    la build viva. Sin esto no se puede distinguir «está en main» de «se ve en
    pantalla», que es justo la confusión que hay que quitar de en medio.
    """
    try:
        return os.path.getmtime(os.path.join(raiz, ".next", "BUILD_ID"))
    except OSError:
        return None


def importadores_de(raiz, ruta):
    """Archivos que mencionan a este módulo (sin contarlo a él mismo).

    Se busca por el nombre sin extensión, que es como se escribe en un import
    (`@/lib/mando/reportes`, `from reportes import …`). Es una aproximación
    deliberada: prefiere decir «cableado» de más antes que acusar de huérfano a
    algo que sí se usa por una vía que este grep no ve.
    """
    base = os.path.splitext(os.path.basename(ruta))[0]
    if not base or base in ("index", "route", "page", "layout"):
        return []
    try:
        r = subprocess.run(
            ["grep", "-rl", "--binary-files=without-match", base, "src", "scripts"],
            cwd=raiz,
            capture_output=True,
            text=True,
            timeout=60,
        )
    except Exception:
        return []
    fuera = os.path.normpath(ruta)
    salida = []
    for linea in (r.stdout or "").splitlines():
        l = linea.strip()
        if l and os.path.normpath(l) != fuera and "/__pycache__/" not in l:
            salida.append(l)
    return salida


#: El `if __name__` de verdad va al principio de una línea y sin sangrar. Buscar
#: la cadena suelta daba positivos absurdos: los dos módulos que EXPLICAN en su
#: comentario qué es un ejecutable salían marcados como ejecutables, y el informe
#: decía «se lanza por su nombre» de un módulo que solo se importa. Un informe
#: con motivos falsos no se vuelve a leer.
_ARRANQUE = re.compile(r'^if\s+__name__\s*==\s*[\"\']__main__[\"\']', re.M)


def es_ejecutable(raiz, ruta):
    """¿Se lanza por su nombre? Shebang o un `if __name__` de nivel superior.

    Sin esto, todo script de línea de comandos sale como «escrito y huérfano»:
    nadie lo importa porque no se importa, se ejecuta.
    """
    if not ruta.endswith((".py", ".sh", ".mjs")):
        return False
    try:
        with open(os.path.join(raiz, ruta), "r", encoding="utf-8", errors="ignore") as f:
            texto = f.read()
    except OSError:
        return False
    return texto.startswith("#!") or bool(_ARRANQUE.search(texto))


def _archivos_del_commit(raiz, sha):
    """[(estado, ruta)] del commit: A añadido, M modificado, D borrado…"""
    _, salida = _git(raiz, ["show", "--name-status", "--format=", sha])
    filas = []
    for linea in (salida or "").splitlines():
        trozos = linea.split("\t")
        if len(trozos) >= 2 and trozos[0]:
            filas.append((trozos[0][0], trozos[-1].strip()))
    return filas


def reunir_cambios(raiz, shas, rama_remota="origin/main"):
    """Convierte cada sha en el dict de hechos que espera `verificar_cambio`."""
    cambios = []
    for sha in shas:
        _, meta = _git(raiz, ["show", "--format=%H%x1f%s%x1f%ct", "--no-patch", sha])
        partes = (meta or "").strip().split("\x1f")
        titulo = partes[1] if len(partes) > 1 else ""
        try:
            ts = int(partes[2])
        except (IndexError, ValueError):
            ts = None
        rc, _ = _git(raiz, ["merge-base", "--is-ancestor", sha, rama_remota])
        archivos = []
        for estado, ruta in _archivos_del_commit(raiz, sha):
            borrado = estado == "D"
            presente = os.path.exists(os.path.join(raiz, ruta))
            archivos.append(
                {
                    "ruta": ruta,
                    "presente": presente,
                    "borrado": borrado,
                    "importadores": [] if borrado or not presente else importadores_de(raiz, ruta),
                    "ejecutable": (not borrado) and presente and es_ejecutable(raiz, ruta),
                }
            )
        # La fecha del CONTENIDO EMPAQUETADO: lo más nuevo que este commit dejó en
        # disco de lo que la build sirve. Es lo que hay que comparar con la build:
        # ni la fecha del commit ni la de un script que corre suelto dicen nada.
        fechas = []
        for a in archivos:
            if a["presente"] and VC.sirve_la_build(a["ruta"]):
                try:
                    fechas.append(os.path.getmtime(os.path.join(raiz, a["ruta"])))
                except OSError:
                    pass
        cambios.append(
            {
                "sha": sha[:8],
                "titulo": titulo,
                "ts": ts,
                "ts_contenido": max(fechas) if fechas else None,
                "en_origin": rc == 0,
                "archivos": archivos,
            }
        )
    return cambios


def verificar(raiz, shas, pruebas_verdes=None, rama_remota="origin/main"):
    """(lista de veredictos, resumen de una línea)."""
    build_ts = build_timestamp(raiz)
    cambios = reunir_cambios(raiz, shas, rama_remota)
    for c in cambios:
        c["pruebas_verdes"] = pruebas_verdes
    veredictos = [VC.verificar_cambio(c, build_ts) for c in cambios]
    return veredictos, VC.resumen(veredictos)


def en_texto(veredictos, resumen_linea):
    """El informe que se enseña al terminar. Cada cambio, nombrado, con su porqué."""
    lineas = ["# Verificación de lo publicado", "", resumen_linea, ""]
    for v in veredictos:
        marca = "✅" if v["aplicado"] else ("⚠️" if v["integrado"] else "❌")
        lineas.append("%s **%s** — %s" % (marca, v["sha"], v["titulo"]))
        lineas.append("   · %s" % v["porque"])
        for a in v["archivos"]:
            lineas.append("   %s %s — %s" % ("·" if a["ok"] else "✗", a["ruta"], a["porque"]))
        lineas.append("")
    return "\n".join(lineas)
