# -*- coding: utf-8 -*-
"""Pruebas de presupuesto_claude.py (PRE1113D) con series de lecturas escritas a mano; no tocan ~/.starseed."""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import presupuesto_claude as P  # noqa: E402

Z = timezone.utc
AHORA = datetime(2026, 11, 13, 17, 10, tzinfo=Z)
REINICIO_SEM = datetime(2026, 11, 14, 4, 0, tzinfo=Z)
REINICIO_SES = datetime(2026, 11, 13, 21, 30, tzinfo=Z)


def lec(t, sem, ses=10, mod=None, rs=REINICIO_SEM, rses=REINICIO_SES):
    d = {"t": t.isoformat(), "fuente": "prueba", "sesion_pct": ses, "sesion_reinicio": rses.isoformat(),
         "semana_pct": sem, "semana_reinicio": rs.isoformat(), "modelo_nombre": "Fable"}
    if mod is not None:
        d.update(modelo_pct=mod, modelo_reinicio=rs.isoformat())
    return d


def h(dia, hora, minuto=0):
    return datetime(2026, 11, dia, hora, minuto, tzinfo=Z)


class Series(unittest.TestCase):
    def test_una_caida_es_un_comienzo_nuevo_nunca_uso_negativo(self):
        ls = [lec(h(12, 21, 33), 94), lec(h(12, 21, 54), 46), lec(h(12, 22, 14), 48)]
        tr = P.tramos(ls, "semana")
        self.assertEqual([x[2] for x in tr], [0.0, 2.0])
        self.assertEqual(P.usado_entre(tr, h(12, 21), h(12, 23)), 2.0)

    def test_cambio_de_reinicio_aunque_suba_es_comienzo_nuevo(self):
        a = lec(h(14, 3, 50), 90)
        b = lec(h(14, 4, 10), 3, rs=REINICIO_SEM + timedelta(days=7))
        self.assertEqual(P.tramos([a, b], "semana")[0][3], False)

    def test_hueco_de_noche_cuenta_puntos_pero_no_horas_de_trabajo(self):
        ls = [lec(h(12, 22), 50), lec(h(13, 8), 52), lec(h(13, 8, 20), 53), lec(h(13, 8, 40), 54)]
        tr = P.tramos(ls, "semana")
        r = P.ritmo(tr, P.umbrales({}))
        self.assertAlmostEqual(r["horas_medidas"], 0.67, places=2)
        self.assertEqual(r["por_hora"], 3.0)
        self.assertEqual(P.usado_entre(tr, h(12, 22), h(13, 9)), 4.0)

    def test_hoy_solo_desde_medianoche_prorrateando(self):
        ls = [lec(h(12, 23), 50), lec(h(13, 1), 60)]  # 10 puntos en 2 h, la mitad cae hoy
        self.assertAlmostEqual(P.usado_entre(P.tramos(ls, "semana"), h(13, 0), h(13, 2)), 5.0)

    def test_ritmo_sin_horas_suficientes_no_se_inventa(self):
        ls = [lec(h(13, 17), 50), lec(h(13, 17, 10), 51)]
        self.assertIsNone(P.ritmo(P.tramos(ls, "semana"), P.umbrales({}))["por_hora"])


class Veredictos(unittest.TestCase):
    def test_holgado_con_semana_larga_y_ritmo_bajo(self):
        rs = AHORA + timedelta(days=3)
        ls = [lec(h(13, 17) - timedelta(minutes=20 * (7 - i)), 20 + 0.5 * i / 3, mod=10, rs=rs) for i in range(8)]
        r = P.calcular(ls, AHORA, None, P.umbrales({}))
        self.assertEqual(r["veredicto"], "holgado", r["razon"])
        self.assertEqual(r["nivel_permitido"], P.FUERTE)
        self.assertEqual(r["semana"]["dias_hasta_reinicio"], 3)

    def test_justo_si_se_agota_antes_del_reinicio(self):
        # 3 puntos/h con 10 puntos de semana y 10,8 h hasta el reinicio: se acaba antes
        ls = [lec(h(13, 17) - timedelta(minutes=20 * (7 - i)), 80 + i, mod=40) for i in range(8)]  # 3/h, acaba en 87
        r = P.calcular(ls, AHORA, None, P.umbrales({}))
        self.assertTrue(r["semana"]["se_agota_antes_del_reinicio"])
        self.assertEqual(r["veredicto"], "justo", r["razon"])
        self.assertEqual(r["permite"], "el modelo por defecto")

    def test_corto_si_quedan_pocos_puntos(self):
        ls = [lec(h(13, 16) + timedelta(minutes=20 * i), 94 + i * 0.5, mod=40) for i in range(3)]
        r = P.calcular(ls, AHORA, None, P.umbrales({}))
        self.assertEqual(r["veredicto"], "corto")
        self.assertEqual(r["nivel_permitido"], P.LIBRE)

    def test_corto_si_la_cuota_de_hoy_esta_gastada(self):
        rs = AHORA + timedelta(days=2)  # 2 días: cuota = (queda + hoy) / 2
        ls = [lec(h(13, 1), 30, rs=rs), lec(h(13, 9), 70, rs=rs), lec(h(13, 17), 71, rs=rs)]
        r = P.calcular(ls, AHORA, None, P.umbrales({}))
        self.assertLessEqual(r["semana"]["queda_hoy"], 0)
        self.assertEqual(r["veredicto"], "corto")

    def test_el_modelo_de_arriba_puede_empeorar_el_veredicto(self):
        rs = AHORA + timedelta(days=3)
        ls = [lec(h(13, 17) - timedelta(minutes=20 * (7 - i)), 20, mod=94 + i * 0.5, rs=rs) for i in range(8)]
        self.assertEqual(P.calcular(ls, AHORA, None, P.umbrales({}))["veredicto"], "corto")

    def test_lecturas_viejas_se_dicen_con_su_edad_y_no_hay_veredicto(self):
        ls = [lec(h(13, 11), 50), lec(h(13, 12), 52)]
        r = P.calcular(ls, AHORA, None, P.umbrales({}))
        self.assertEqual(r["semana"]["estado"], "vieja")
        self.assertEqual(r["semana"]["edad_min"], 310)
        self.assertEqual(r["veredicto"], "desconocido")
        self.assertIsNone(r["nivel_permitido"])
        self.assertIsNone(r["sesion"]["oleada_cabe"])

    def test_archivo_vacio(self):
        r = P.calcular([], AHORA, None, P.umbrales({}))
        self.assertEqual(r["veredicto"], "desconocido")
        self.assertEqual(r["semana"]["estado"], "sin lecturas")
        self.assertIn("desconocido".upper(), P.linea(r))

    def test_umbral_por_entorno(self):
        u = P.umbrales({"STARSEED_PRESUPUESTO_SESION_OLEADA_PCT": "50", "STARSEED_PRESUPUESTO_HORAS_DIA": "x"})
        self.assertEqual(u["sesion_oleada_pct"], 50.0)
        self.assertEqual(u["horas_dia"], 16.0)


class Sesion(unittest.TestCase):
    def test_oleada_cabe_hasta_70_y_no_por_encima(self):
        for pct, cabe in ((70, True), (71, False)):
            r = P.calcular([lec(h(13, 17), 50, ses=pct)], AHORA, None, P.umbrales({}))
            self.assertEqual(r["sesion"]["oleada_cabe"], cabe)
            if not cabe:
                self.assertEqual(r["sesion"]["oleada_a_las"], REINICIO_SES.isoformat())
                self.assertIn("no hasta las", P.linea(r))

    def test_ventana_ya_reiniciada(self):
        r = P.calcular([lec(h(13, 17), 50, ses=90)], h(13, 21, 40), None, P.umbrales({"STARSEED_PRESUPUESTO_FRESCURA_MIN": "999"}))
        self.assertTrue(r["sesion"]["oleada_cabe"])


class Anulacion(unittest.TestCase):
    def base(self):
        return [lec(h(13, 16) + timedelta(minutes=20 * i), 94 + i * 0.5, mod=40) for i in range(3)]

    def test_levanta_el_veredicto_y_lo_dice(self):
        a = {"modo": "gastar-hasta-el-reinicio", "hasta": REINICIO_SEM.isoformat()}
        r = P.calcular(self.base(), AHORA, a, P.umbrales({}))
        self.assertEqual(r["veredicto"], "holgado")
        self.assertEqual(r["veredicto_sin_anulacion"], "corto")
        self.assertIn("levantó", r["razon"])

    def test_caduca_sola_en_el_reinicio(self):
        a = {"hasta": REINICIO_SEM.isoformat()}
        despues = REINICIO_SEM + timedelta(minutes=5)
        self.assertIsNone(P.anulacion_vigente(a, despues, None))

    def test_no_vale_para_la_semana_siguiente(self):
        a = {"hasta": REINICIO_SEM.isoformat()}
        self.assertIsNone(P.anulacion_vigente(a, AHORA, REINICIO_SEM + timedelta(days=7)))

    def test_archivo_ilegible_o_sin_fecha_no_vale(self):
        self.assertIsNone(P.anulacion_vigente({"hasta": "basura"}, AHORA, None))
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "a.json")
            self.assertIsNone(P.leer_anulacion(ruta))
            with open(ruta, "w") as f:
                json.dump({"hasta": REINICIO_SEM.isoformat()}, f)
            self.assertEqual(P.leer_anulacion(ruta)["hasta"], REINICIO_SEM.isoformat())


class Aviso(unittest.TestCase):
    def test_avisa_si_el_modelo_es_mas_fuerte_que_el_veredicto(self):
        ls = [lec(h(13, 16) + timedelta(minutes=20 * i), 94 + i * 0.5, mod=40) for i in range(3)]
        self.assertIn("AVISO", P.aviso_para_modelo("claude-sonnet", ls, AHORA, None))
        self.assertIn("AVISO", P.aviso_para_modelo("Fable", ls, AHORA, None))
        self.assertIsNone(P.aviso_para_modelo("ollama/qwen", ls, AHORA, None))
        self.assertIsNone(P.aviso_para_modelo("sin declarar", ls, AHORA, None))
        self.assertIsNone(P.aviso_para_modelo(None, ls, AHORA, None))

    def test_sin_datos_no_avisa(self):
        self.assertIsNone(P.aviso_para_modelo("Fable", [], AHORA, None))


if __name__ == "__main__":
    unittest.main()
