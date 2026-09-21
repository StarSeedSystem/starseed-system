# -*- coding: utf-8 -*-
"""¿Cada cambio publicado está de verdad INTEGRADO y APLICADO?

Módulo puro: no toca git, ni disco, ni red. Recibe los hechos ya recogidos y
emite un veredicto por cambio, en lenguaje llano. Así se puede probar entero.

LA DISTINCIÓN QUE IMPORTA, y que este proyecto ha pagado cara varias veces:

  · INTEGRADO = el commit está dentro de `origin/main`. Es lo único que el
    «git push» garantiza.
  · APLICADO  = además se está usando de verdad. Un módulo nuevo que nadie
    importa está integrado y no sirve para nada; y un cambio de interfaz que
    está en main pero NO en la build que sirve el Mando ahora mismo no se ve
    en pantalla por mucho que el commit exista. Las dos veces el informe decía
    «publicado» y Alex, delante de la pantalla, veía que no.

Por eso un cambio solo se declara aplicado cuando pasa las cuatro:
archivos presentes, cableados, cubiertos por pruebas cuando toca, y servidos
por la build viva.
"""

#: Rutas que viven por sí solas: Next las sirve por su sitio en el árbol, así
#: que nadie tiene que importarlas para que estén cableadas.
SUFIJOS_RUTA = ("/route.ts", "/route.tsx", "/page.tsx", "/layout.tsx")

#: Un archivo de prueba no necesita que nadie lo importe: lo ejecuta el runner.
MARCAS_PRUEBA = ("__tests__/", ".test.", ".spec.", "/test_", "test_")

#: Estos no son código de la app; se dan por aplicados en cuanto están en main.
SUFIJOS_NO_CODIGO = (".md", ".json", ".txt", ".yml", ".yaml", ".sql", ".css", ".sh")

#: Lo único que `next build` empaqueta. Un script de Python o del puente corre
#: directo del repo: preguntarle a la build si ya lo sirve no significa nada, y
#: preguntarlo igualmente hacía que cambios de `scripts/` salieran como «aún no
#: se ve en pantalla» cuando estaban funcionando desde el segundo cero.
PREFIJOS_BUILD = ("src/", "public/", "supabase/")
ARCHIVOS_BUILD = (
    "next.config.ts",
    "next.config.js",
    "package.json",
    "tailwind.config.ts",
    "tsconfig.json",
)


def sirve_la_build(ruta):
    """¿`next build` empaqueta este archivo, o corre suelto desde el repo?"""
    return ruta.startswith(PREFIJOS_BUILD) or ruta in ARCHIVOS_BUILD


def es_ruta_viva(ruta):
    """¿Next sirve este archivo por su sitio en el árbol, sin que nadie lo importe?"""
    return ruta.endswith(SUFIJOS_RUTA)


def es_prueba(ruta):
    """¿Es un archivo de pruebas? Lo ejecuta el runner; nadie lo importa."""
    return any(m in ruta for m in MARCAS_PRUEBA)


def es_codigo_de_app(ruta):
    """¿Es código que alguien tiene que usar para que sirva de algo?"""
    if ruta.endswith(SUFIJOS_NO_CODIGO):
        return False
    return ruta.endswith((".ts", ".tsx", ".js", ".jsx", ".py"))


def cableado_de(ruta, importadores, ejecutable=False):
    """(bool, motivo) — ¿lo usa alguien, o está escrito y huérfano?

    `importadores` es la lista de archivos que mencionan a este. Se excluye el
    propio archivo: un módulo que solo se menciona a sí mismo no está cableado.

    `ejecutable` lo decide quien mira el archivo por fuera (tiene shebang o un
    `if __name__ == "__main__"`). Un script que se lanza por su nombre no lo
    importa nadie y no por eso está huérfano: `publicar.py` salía como «escrito
    y huérfano» justo mientras publicaba.
    """
    otros = [i for i in (importadores or []) if i != ruta]
    if ejecutable:
        return True, "es un ejecutable: se lanza por su nombre, nadie lo importa"
    if es_ruta_viva(ruta):
        return True, "es una ruta: Next la sirve por su sitio en el árbol"
    if es_prueba(ruta):
        return True, "es una prueba: la ejecuta el runner"
    if not es_codigo_de_app(ruta):
        return True, "no es código de la app"
    if otros:
        cuantos = len(otros)
        return True, "lo usa %d archivo%s (%s)" % (
            cuantos,
            "" if cuantos == 1 else "s",
            ", ".join(otros[:3]) + ("…" if cuantos > 3 else ""),
        )
    return False, "escrito pero HUÉRFANO: ningún archivo lo importa todavía"


def verificar_cambio(cambio, build_ts=None):
    """Veredicto de UN commit publicado.

    `cambio` es un dict con lo que se pudo averiguar fuera:
        sha, titulo, ts (epoch del commit), en_origin (bool),
        archivos: [{ruta, presente, borrado, importadores: [...]}],
        pruebas_verdes (bool|None)

    Devuelve un dict con `integrado`, `aplicado`, `porque` y el detalle por
    archivo, para que quien lo lea sepa POR QUÉ, no solo si sí o no.
    """
    # (2026-09-21) Un sha que no existe en el repo no se puede juzgar, y contarlo
    # como «no aplicado» convierte el informe en una falsa alarma. Se dice lo que
    # es —no se reconoce ese commit— y se queda fuera de la cuenta de pendientes.
    if cambio.get("existe") is False:
        return {
            "sha": cambio.get("sha", ""),
            "titulo": cambio.get("titulo", ""),
            "integrado": False,
            "aplicado": False,
            "desconocido": True,
            "porque": "no se reconoce ese commit en el repositorio: no es un cambio sin publicar",
            "archivos": [],
        }
    archivos = cambio.get("archivos") or []
    detalle, faltan, huerfanos = [], [], []
    for a in archivos:
        ruta = a.get("ruta", "")
        if a.get("borrado"):
            detalle.append({"ruta": ruta, "ok": True, "porque": "borrado a propósito"})
            continue
        if not a.get("presente"):
            faltan.append(ruta)
            detalle.append(
                {"ruta": ruta, "ok": False, "porque": "no está en el árbol publicado"}
            )
            continue
        ok, motivo = cableado_de(ruta, a.get("importadores"), a.get("ejecutable", False))
        if not ok:
            huerfanos.append(ruta)
        detalle.append({"ruta": ruta, "ok": ok, "porque": motivo})

    integrado = bool(cambio.get("en_origin"))
    # «Servido»: la build viva tiene que ser POSTERIOR al CONTENIDO de este
    # cambio. Se compara contra la fecha de los archivos en disco, no contra la
    # del commit: es muy normal construir, verificar y commitear después, y en
    # ese orden el commit es más nuevo que la build aunque la build se hiciera
    # con exactamente este código. Comparar contra el commit daba «no se ve en
    # pantalla» a cambios que sí se estaban viendo.
    ts = cambio.get("ts_contenido")
    if ts is None:
        ts = cambio.get("ts")
    empaquetados = [
        a for a in archivos if sirve_la_build(a.get("ruta", "")) and not a.get("borrado")
    ]
    if not empaquetados:
        servido, motivo_servido = (
            None,
            "la build no empaqueta estos archivos: corren directo del repo",
        )
    elif build_ts is None or ts is None:
        servido, motivo_servido = None, "no se pudo saber qué build está sirviendo"
    elif build_ts >= ts:
        servido, motivo_servido = True, "la build viva es posterior a este código"
    else:
        servido, motivo_servido = False, "la build viva es ANTERIOR: hace falta reconstruir y reiniciar"

    pruebas = cambio.get("pruebas_verdes")
    aplicado = (
        integrado
        and not faltan
        and not huerfanos
        and servido is not False
        and pruebas is not False
    )

    if not integrado:
        porque = "no llegó a origin/main"
    elif faltan:
        porque = "falta%s en el árbol: %s" % (
            "n" if len(faltan) > 1 else "",
            ", ".join(faltan),
        )
    elif huerfanos:
        porque = "está en main pero nadie lo usa: %s" % ", ".join(huerfanos)
    elif pruebas is False:
        porque = "las pruebas no pasaron: lo publicado no está respaldado"
    elif servido is False:
        porque = "está en main pero la build viva es anterior: aún no se ve en pantalla"
    else:
        porque = (
            "integrado en origin/main, cableado y servido por la build viva"
            if servido
            else "integrado en origin/main y cableado (%s)" % motivo_servido
        )

    return {
        "sha": cambio.get("sha", ""),
        "titulo": cambio.get("titulo", ""),
        "integrado": integrado,
        "aplicado": aplicado,
        "servido": servido,
        "porque": porque,
        "motivo_servido": motivo_servido,
        "archivos": detalle,
    }


def resumen(verificaciones):
    """Una línea para el final del proceso: qué se publicó y qué no cuajó."""
    total = len(verificaciones)
    if total == 0:
        return "no había nada que publicar"
    desconocidos = [v for v in verificaciones if v.get("desconocido")]
    verificaciones = [v for v in verificaciones if not v.get("desconocido")]
    total = len(verificaciones)
    cola = (
        " (y %d sha%s que este repositorio no reconoce)"
        % (len(desconocidos), "" if len(desconocidos) == 1 else "s")
        if desconocidos
        else ""
    )
    if total == 0:
        return "no había nada que publicar" + cola
    aplicados = [v for v in verificaciones if v["aplicado"]]
    if len(aplicados) == total:
        return (
            "%d cambio%s publicado%s, verificado%s uno a uno: integrado%s y aplicado%s"
            % (
                total,
                "" if total == 1 else "s",
                "" if total == 1 else "s",
                "" if total == 1 else "s",
                "" if total == 1 else "s",
                "" if total == 1 else "s",
            )
            + cola
        )
    pendientes = [v for v in verificaciones if not v["aplicado"]]
    return "%d de %d verificados; %s no está%s aplicado%s todavía: %s" % (
        len(aplicados),
        total,
        ", ".join(v["sha"] for v in pendientes[:4]),
        "" if len(pendientes) == 1 else "n",
        "" if len(pendientes) == 1 else "s",
        pendientes[0]["porque"],
    )
