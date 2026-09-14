#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests de las sugerencias del director. Módulo puro sin I/O."""

import unittest
import sugerencias_director
from sugerencias_director import sugerencias


def estado(**cambios):
    """Estado base sano + cambios por test. Estado base no debe sugerir nada."""
    base = {
        "disco_gb": 42,
        "bloqueantes": [],
        "ejecutables": 3,
        "orquestador_vivo": True,
        "sin_publicar": 0,
        "minutos_quieto": 2,
    }
    base.update(cambios)
    return base


class TestSugerenciasDirector(unittest.TestCase):
    """Puntos de la bandeja curada."""

    def test_estado_sano_no_sugiere_nada(self):
        """Un enjambre sano no llena la bandeja de ruido."""
        self.assertEqual(sugerencias(estado(), "2026-09-14 15:39:56"), [])

    def test_disco_bajo_sugiere_alta(self):
        """Disco por debajo de 5 GB produce una sugerencia de limpiar."""
        res = sugerencias(estado(disco_gb=4), "2026-09-14 15:40:00")
        self.assertTrue(any(s["clave"] == "disco_bajo" for s in res))
        disco = next(s for s in res if s["clave"] == "disco_bajo")
        self.assertEqual(disco["importancia"], "alta")
        self.assertIn("worktree", disco["accion"])
        self.assertIn("quedan 4.0 GB", disco["titulo"])

    def test_bloqueantes_sin_ejecutables_critica(self):
        """Bloqueantes con 0 ejecutables es lo más urgente y lista los ids."""
        res = sugerencias(
            estado(bloqueantes=["p100A", "p100B"], ejecutables=0),
            "2026-09-14 15:40:00",
        )
        self.assertTrue(any(s["clave"] == "bloqueantes_sin_ejecutables" for s in res))
        blq = next(s for s in res if s["clave"] == "bloqueantes_sin_ejecutables")
        self.assertEqual(blq["importancia"], "critica")
        self.assertIn("p100A", blq["contexto"])
        self.assertIn("p100B", blq["contexto"])

    def test_bloqueantes_con_ejecutables_no_es_critica(self):
        """Si hay ejecutables, los bloqueantes no piden persona ya mismo."""
        res = sugerencias(estado(bloqueantes=["p100A"], ejecutables=2), "t")
        self.assertFalse(any(s["clave"] == "bloqueantes_sin_ejecutables" for s in res))

    def test_sin_publicar_con_orquestador_apagado_normal(self):
        """Trabajo hecho sin publicar y orquestador apagado: aviso normal."""
        res = sugerencias(
            estado(sin_publicar=5, orquestador_vivo=False),
            "t",
        )
        self.assertTrue(
            any(s["clave"] == "sin_publicar_orquestador_apagado" for s in res)
        )
        sp = next(s for s in res if s["clave"] == "sin_publicar_orquestador_apagado")
        self.assertEqual(sp["importancia"], "normal")
        self.assertIn("5", sp["titulo"])

    def test_sin_publicar_con_orquestador_vivo_no_sugiere(self):
        """Si el orquestador está vivo, el sin publicar no es nuestra tarea."""
        res = sugerencias(estado(sin_publicar=5), "t")
        self.assertFalse(
            any(s["clave"] == "sin_publicar_orquestador_apagado" for s in res)
        )

    def test_orquestador_quieto_alta(self):
        """Orquestador vivo pero quieto más de 20 min: alta."""
        res = sugerencias(estado(minutos_quieto=25), "t")
        self.assertTrue(any(s["clave"] == "orquestador_quieto" for s in res))
        q = next(s for s in res if s["clave"] == "orquestador_quieto")
        self.assertEqual(q["importancia"], "alta")

    def test_orquestador_quieto_por_debajo_no_sugiere(self):
        """Quietud por debajo del umbral no merece aviso."""
        res = sugerencias(estado(minutos_quieto=20), "t")
        self.assertFalse(any(s["clave"] == "orquestador_quieto" for s in res))

    def test_varias_simultaneas_ordenadas_por_importancia(self):
        """Con varias condiciones a la vez se ordena crítica → alta → normal."""
        res = sugerencias(
            estado(
                disco_gb=2,
                bloqueantes=["p1"],
                ejecutables=0,
                orquestador_vivo=False,
                sin_publicar=3,
                minutos_quieto=30,
            ),
            "t",
        )
        claves = [s["clave"] for s in res]
        self.assertEqual(claves[0], "bloqueantes_sin_ejecutables")
        self.assertIn("disco_bajo", claves)
        self.assertIn("sin_publicar_orquestador_apagado", claves)

    def test_grados_ordenados_no_solo_por_posicion(self):
        """Alta (disco) va antes de alta (quieto) si el orden interno lo dicta."""
        res = sugerencias(estado(disco_gb=3, minutos_quieto=30), "t")
        # Ambas son 'alta'; con el sort estable se conserva el orden de inserción.
        self.assertEqual(
            [s["clave"] for s in res], ["disco_bajo", "orquestador_quieto"]
        )

    def test_misma_clave_mismo_mensaje(self):
        """Dos pasadas con el mismo estado producen exactamente lo mismo."""
        e = estado(
            disco_gb=2,
            bloqueantes=["p1"],
            ejecutables=0,
            orquestador_vivo=True,
            sin_publicar=0,
            minutos_quieto=30,
        )
        a = sugerencias(e, "2026-09-14 15:00:00")
        b = sugerencias(e, "2026-09-14 15:01:00")
        self.assertEqual(a, b)

    def test_misma_clave_mismo_mensaje_aun_con_hora_distinta(self):
        """La hora no entra en el texto: mismo estado = mismo output, siempre."""
        a = sugerencias(estado(disco_gb=1), "2026-09-14 12:00:00")
        b = sugerencias(estado(disco_gb=1), "2026-09-15 09:30:00")
        self.assertEqual(a, b)

    def test_claves_estables_para_deduplicar(self):
        """Cada clave es estable: permite deduplicar al consumirlas."""
        res1 = sugerencias(estado(disco_gb=4), "t")
        res2 = sugerencias(estado(disco_gb=4), "t")
        self.assertEqual([s["clave"] for s in res1], [s["clave"] for s in res2])

    def test_estado_none_no_rompe(self):
        """Sin estado se comporta como un estado vacío: sin sugerencias falsas."""
        self.assertEqual(sugerencias(None, "t"), [])

    def test_campos_requeridos_en_cada_sugerencia(self):
        """Toda sugerencia trae las cinco claves del contrato."""
        for s in sugerencias(
            estado(disco_gb=2, bloqueantes=["p1"], ejecutables=0), "t"
        ):
            for campo in ("clave", "titulo", "contexto", "importancia", "accion"):
                self.assertIn(campo, s)


if __name__ == "__main__":
    unittest.main()
