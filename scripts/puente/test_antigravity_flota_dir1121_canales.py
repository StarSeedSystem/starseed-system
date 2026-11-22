# -*- coding: utf-8 -*-
"""DIR1121: la flota de Antigravity no escribe a mano un nombre viejo de canal.

Los nombres visibles salen del registro único de canales; aquí solo se comprueba que
la tabla de papeles no vuelva a introducir los nombres antiguos. Las cadenas viejas se
arman por partes a propósito, para no volver a sembrarlas en el repositorio.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import antigravity_flota as F  # noqa: E402

NOMBRES_VIEJOS = tuple(
    " ".join(partes)
    for partes in (
        ("dirección", "principal"),
        ("dirección", "general"),
        ("dirección", "metagenesis"),
        ("producción", "audiovisual,", "diseño y promoción"),
        ("magga", "cortex"),
        ("puente de", "mando"),
        ("síntesis de", "producción"),
        ("genesis", "·", "starseed", "os"),
    )
)


def test_ningun_papel_repite_un_nombre_viejo_de_canal():
    texto = " ".join(p.papel + " " + p.descripcion for p in F.TABLA_PAPELES).casefold()
    encontrados = [viejo for viejo in NOMBRES_VIEJOS if viejo in texto]
    assert encontrados == [], "nombres viejos en TABLA_PAPELES: %s" % encontrados
