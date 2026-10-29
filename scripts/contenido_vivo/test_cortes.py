# -*- coding: utf-8 -*-
"""Pruebas de la parte pura de cortes.py, con series inventadas y sin ffmpeg."""

from __future__ import annotations

import cortes
from cortes import (
    etiquetas,
    mediana_local,
    posiciones_corte,
    veredicto,
)

def es_suave(valores, nivel):
    return [nivel + (paso % 5) * 0.02 for paso, _ in enumerate(valores)]

def test_movimiento_rapido_pasa_aun_con_ssim_baja():
    """La SSIM baja de un arrastre rápido vale: el par se mide contra SU mediana local."""
    pares = es_suave(range(12), 0.52)
    assert etiquetas(pares) == ["ok"] * 12
    aprobado, motivo = veredicto(etiquetas(pares), len(pares))
    assert aprobado
    assert "12" in motivo


def test_un_desplome_local_apunta_corte_y_falla():
    pares = es_suave(range(10), 0.60)
    pares[5] = 0.12
    rótulos = etiquetas(pares)
    assert rótulos[5] == "corte"
    aprobado, motivo = veredicto(rótulos, len(pares))
    assert not aprobado
    assert "corte" in motivo


def test_tres_congelados_fallan_y_dos_no():
    congelados = es_suave(range(12), 0.90)
    for punto in (3, 6, 9):
        congelados[punto] = 0.999
    assert etiquetas(congelados).count("congelado") == 3
    assert veredicto(etiquetas(congelados), len(congelados))[0] is False
    casi = es_suave(range(10), 0.90)
    casi[2] = 0.996
    casi[7] = 0.998
    assert veredicto(etiquetas(casi), len(casi))[0] is True


def test_con_menos_de_tres_pares_nadie_pasa():
    assert veredicto(["ok"], 1) == (False, "solo 1 pares medidos, hacen falta 3")
    assert veredicto(["ok", "ok"], 2)[0] is False
    assert veredicto([], 0)[0] is False
    aprobado, _ = veredicto(["ok", "ok", "ok"], 3)
    assert aprobado

def test_la_mediana_local_mira_una_ventana_de_tres_a_cada_lado():
    serie = [3, 1, 4, 1, 5, 9, 2, 6]
    # En la orilla la ventana se recorta: solo los cuatro primeros valores.
    assert mediana_local(serie, 0) == 2.0
    # Dentro: del par 4 se ven los pares 1 a 7, y su mediana es 4.
    assert mediana_local(serie, 4) == 4.0
    # Con ventana 1 del par 3 se ven los pares 2 a 4, y su mediana es 4.
    assert mediana_local(serie, 3, ventana=1) == 4.0
    # El valor propio cuenta: del par 5 con ventana 1, la mediana de 5, 9 y 2 es 5.
    assert mediana_local(serie, 5, ventana=1) == 5.0


def test_cortes_de_un_clip_contra_la_mediana_de_toda_la_obra():
    """Muy por debajo de la mediana del clip entero, no de un umbral fijo."""
    clip = [0.90, 0.91, 0.89, 0.05, 0.90, 0.92]
    assert posiciones_corte(clip) == [(3, 0.05)]
    # Un clip todo bajo y parecido no halla cortes aunque la SSIM sea baja.
    assert posiciones_corte(es_suave(range(8), 0.50)) == []
    assert posiciones_corte([]) == []
    serie = [0.999, 0.999, 0.2, 0.999, 0.999, 0.999]
    # El 0,2 está bajo la mediana del clip: en continuidad el corte manda sobre lo congelado.
    assert etiquetas(serie)[2] == "corte"
    # cortes.py importa limpio en un módulo puro: la parte de ffmpeg queda solo para el chequeo real.
    assert cortes.MINIMO_PARES == 3


def test_movimiento_rapido_y_suave_pasa():
    serie = [0.42, 0.39, 0.41, 0.38, 0.40, 0.37, 0.41, 0.39]
    rótulos = etiquetas(serie)
    assert all(r == "ok" for r in rótulos)
    aprobado, _ = veredicto(rótulos, len(serie))
    assert aprobado
    assert rótulos.count("corte") == 0


def test_mas_de_dos_congelados_falla():
    serie = [0.999] * 6
    rótulos = etiquetas(serie)
    assert rótulos.count("congelado") > 2
    aprobado, _ = veredicto(rótulos, len(serie))
    assert not aprobado


def test_corte_contra_mediana_del_clip():
    serie = [0.90, 0.91, 0.10, 0.90, 0.89]
    cortes = posiciones_corte(serie)
    assert [i for i, _ in cortes] == [2]
    rótulos = etiquetas(serie)
    aprobado, _ = veredicto(rótulos, len(serie))
    assert not aprobado


def test_clip_estable_pasa():
    serie = [0.80, 0.81, 0.79, 0.80]
    assert posiciones_corte(serie) == []
    rótulos = etiquetas(serie)
    aprobado, _ = veredicto(rótulos, len(serie))
    assert aprobado


def test_clip_corto_no_pasa():
    serie = [0.9, 0.9]
    aprobado, _ = veredicto(etiquetas(serie), len(serie))
    assert not aprobado
