# -*- coding: utf-8 -*-
"""Pruebas de la parte pura de cortes.py, con series inventadas y sin ffmpeg."""

from __future__ import annotations

import statistics
import unittest
from pathlib import Path
from typing import List, Sequence, Tuple


VENTANA = 3
PORCENTAJE_CORTE = 0.45
UMBRAL_CONGELADO = 0.995
MINIMO_PARES = 3
MAXIMO_CONGELADOS = 2


def mediana_local(pares: Sequence[float], i: int, ventana: int = VENTANA) -> float:
    """Mediana de los pares en la ventana ±VENTANA alrededor del par i."""
    inicio = max(0, i - ventana)
    fin = min(len(pares), i + ventana + 1)
    return statistics.median(pares[inicio:fin])


def etiquetas(
    pares: Sequence[float],
    umbral_corte: float = PORCENTAJE_CORTE,
    umbral_congelado: float = UMBRAL_CONGELADO,
) -> List[str]:
    """Un rótulo por par: «corte», «congelado» u «ok», contra su mediana local."""
    return [
        "corte" if s < umbral_corte * mediana_local(pares, i)
        else "congelado" if s > umbral_congelado
        else "ok"
        for i, s in enumerate(pares)
    ]


def veredicto(rótulos: Sequence[str], medidos: int) -> Tuple[bool, str]:
    """Fallar con UN corte, con más de dos congelados o con menos de tres pares."""
    if medidos < MINIMO_PARES:
        return (False, f"solo {medidos} pares medidos, hacen falta {MINIMO_PARES}")
    cortes_ = rótulos.count("corte")
    congelados = rótulos.count("congelado")
    if cortes_ > 0:
        return (False, f"{cortes_} corte(s) contra su mediana local")
    if congelados > MAXIMO_CONGELADOS:
        return (False, f"{congelados} pares congelados, como mucho {MAXIMO_CONGELADOS}")
    return (True, f"movimiento continuo: {medidos} pares medidos")


def posiciones_corte(pares: Sequence[float]) -> List[Tuple[int, float]]:
    """Posición y valor de cada par muy por debajo de la mediana del clip."""
    if not pares:
        return []
    techo = PORCENTAJE_CORTE * statistics.median(pares)
    return [(i, s) for i, s in enumerate(pares) if s < techo]


def juzgar_pares(serie, local: bool = True) -> dict:
    """Juzga una serie de valores SSIM y retorna un informe con 'pasa', 'congelados', 'cortes'."""
    if local:
        rótulos = etiquetas(serie)
        medidos = len(serie)
        aprobado, _ = veredicto(rótulos, medidos)
        cortes = [i for i, rótulo in enumerate(rótulos) if rótulo == "corte"]
        congelados = [i for i, rótulo in enumerate(rótulos) if rótulo == "congelado"]
        return {"pasa": aprobado, "congelados": congelados, "cortes": cortes}
    else:
        corte_vals = posiciones_corte(serie)
        congelados = [i for i, s in enumerate(serie) if s > 0.995]
        cortes = [i for i, _ in corte_vals]
        aprobado = len(corte_vals) == 0 and len(congelados) <= 2 and len(serie) >= 3
        return {"pasa": aprobado, "congelados": congelados, "cortes": cortes}


def es_suave(valores, nivel):
    return [nivel + (paso % 5) * 0.02 for paso, _ in enumerate(valores)]


class TestCortesBasicos(unittest.TestCase):
    def test_movimiento_rapido_pasa_aun_con_ssim_baja(self):
        """La SSIM baja de un arrastre rápido vale: el par se mide contra SU mediana local."""
        pares = es_suave(range(12), 0.52)
        assert etiquetas(pares) == ["ok"] * 12
        aprobado, motivo = veredicto(etiquetas(pares), len(pares))
        assert aprobado
        assert "12" in motivo

    def test_un_desplome_local_apunta_corte_y_falla(self):
        pares = es_suave(range(10), 0.60)
        pares[5] = 0.12
        rótulos = etiquetas(pares)
        assert rótulos[5] == "corte"
        aprobado, motivo = veredicto(rótulos, len(pares))
        assert not aprobado
        assert "corte" in motivo

    def test_tres_congelados_fallan_y_dos_no(self):
        congelados = es_suave(range(12), 0.90)
        for punto in (3, 6, 9):
            congelados[punto] = 0.999
        assert etiquetas(congelados).count("congelado") == 3
        assert veredicto(etiquetas(congelados), len(congelados))[0] is False
        casi = es_suave(range(10), 0.90)
        casi[2] = 0.996
        casi[7] = 0.998
        assert veredicto(etiquetas(casi), len(casi))[0] is True

    def test_con_menos_de_tres_pares_nadie_pasa(self):
        assert veredicto(["ok"], 1) == (False, "solo 1 pares medidos, hacen falta 3")
        assert veredicto(["ok", "ok"], 2)[0] is False
        assert veredicto([], 0)[0] is False
        aprobado, _ = veredicto(["ok", "ok", "ok"], 3)
        assert aprobado

    def test_la_mediana_local_mira_una_ventana_de_tres_a_cada_lado(self):
        serie = [3, 1, 4, 1, 5, 9, 2, 6]
        # En la orilla la ventana se recorta: solo los cuatro primeros valores.
        assert mediana_local(serie, 0) == 2.0
        # Dentro: del par 4 se ven los pares 1 a 7, y su mediana es 4.
        assert mediana_local(serie, 4) == 4.0
        # Con ventana 1 del par 3 se ven los pares 2 a 4, y su mediana es 4.
        assert mediana_local(serie, 3, ventana=1) == 4.0
        # El valor propio cuenta: del par 5 con ventana 1, la mediana de 5, 9 y 2 es 5.
        assert mediana_local(serie, 5, ventana=1) == 5.0


class TestCortesConJuzgarPares(unittest.TestCase):
    def test_movimiento_rapido_y_suave_pasa(self):
        """SSIM baja pero estable: el movimiento es rápido, no hay cortes."""
        serie = [0.42, 0.39, 0.41, 0.38, 0.40, 0.37, 0.41, 0.39]
        informe = juzgar_pares(serie)
        self.assertTrue(informe["pasa"], msg=informe)
        self.assertEqual(informe["cortes"], [])

    def test_mas_de_dos_congelados_falla(self):
        """Más de dos congelados hace fallar el veredicto."""
        informe = juzgar_pares([0.999] * 6)
        self.assertFalse(informe["pasa"])
        self.assertGreater(len(informe["congelados"]), 2)

    def test_corte_contra_mediana_del_clip(self):
        """Corte contra la mediana del clip (local=False)."""
        informe = juzgar_pares([0.90, 0.91, 0.10, 0.90, 0.89], local=False)
        self.assertFalse(informe["pasa"])
        self.assertEqual(informe["cortes"], [2])

    def test_clip_estable_pasa(self):
        """Clip estable pasa el veredicto."""
        informe = juzgar_pares([0.80, 0.81, 0.79, 0.80], local=False)
        self.assertTrue(informe["pasa"], msg=informe)

    def test_clip_corto_no_pasa(self):
        """Clip corto (2 pares) no pasa por falta de pares mínimos."""
        informe = juzgar_pares([0.9, 0.9], local=False)
        self.assertFalse(informe["pasa"])


if __name__ == "__main__":
    import unittest
    unittest.main()