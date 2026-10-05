#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de desatascar.py — las tres paradas medidas el 2026-09-13."""

import os
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import desatascar as d


def _hace(minutos, ahora):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ahora - minutos * 60))


class TestArbolSucio(unittest.TestCase):
    def test_estorbo_sin_seguimiento(self):
        e, p, t = d.clasificar_sucio(["?? error.log", "?? x.new", "?? .DS_Store"])
        self.assertEqual(e, ["error.log", "x.new", ".DS_Store"])
        self.assertEqual(p, [])
        self.assertEqual(t, [])

    def test_trabajo_nunca_se_aparta(self):
        e, p, t = d.clasificar_sucio(
            [" M src/a.ts", "?? src/nuevo.ts", "UU src/c.ts", "A  src/d.ts"]
        )
        self.assertEqual(e, [])
        self.assertEqual(p, [])
        self.assertEqual(len(t), 4)

    def test_lineas_basura_se_ignoran(self):
        e, p, t = d.clasificar_sucio(["", "  ", None, "??"])
        self.assertEqual((e, p, t), ([], [], []))

    def test_puente_de_mando_es_propia_no_trabajo(self):
        """Lo que el enjambre regenera solo no es trabajo de nadie (2026-10-04)."""
        e, p, t = d.clasificar_sucio([" M PUENTE-DE-MANDO.md"])
        self.assertEqual(e, [])
        self.assertEqual(p, ["PUENTE-DE-MANDO.md"])
        self.assertEqual(t, [])

    def test_src_modificado_es_trabajo(self):
        e, p, t = d.clasificar_sucio([" M src/x.ts"])
        self.assertEqual((e, p), ([], []))
        self.assertEqual(t, ["src/x.ts"])

    def test_orig_sin_seguimiento_es_estorbo(self):
        e, p, t = d.clasificar_sucio(["?? foo.orig"])
        self.assertEqual(e, ["foo.orig"])
        self.assertEqual((p, t), ([], []))


class TestIntentosEnCadena(unittest.TestCase):
    def test_base_es_primer_intento(self):
        self.assertEqual(d.intentos_en_cadena("HG1001A"), 1)
        self.assertEqual(d.intentos_en_cadena("CDQ1004"), 1)

    def test_sufijos_minusculos_encadenan(self):
        self.assertEqual(d.intentos_en_cadena("HG1001Ab"), 2)
        self.assertEqual(d.intentos_en_cadena("HG1001Ac"), 3)

    def test_id_minusculo_no_es_sucesor(self):
        self.assertEqual(d.intentos_en_cadena("xkiro"), 1)


class TestPuertas(unittest.TestCase):
    def setUp(self):
        self.ahora = time.time()

    def test_bloqueante_madura_ya_no_se_rechaza_se_repara(self):
        """(2026-10-05, bloqueadas-reparacion §4) La revisión bloqueante se
        convierte en reparación automática con la objeción como cambio; rechazar
        es la excepción, no la norma."""
        p = {
            "A": {
                "estado": "esperando_aprobacion",
                "revisor": "bloqueante",
                "objecion": "falta manejar el caso vacío",
                "t": _hace(60, self.ahora),
            }
        }
        self.assertEqual(d.puertas_a_rechazar(p, self.ahora), [])
        reparar = d.puertas_a_reparar(p, self.ahora)
        self.assertEqual([x[0] for x in reparar], ["A"])
        self.assertIn("falta manejar el caso vacío", reparar[0][1])

    def test_bloqueante_tercer_intento_de_la_cadena_pasa_a_escalar(self):
        """Al tercer intento con objeción de la misma cadena se marca
        `escalar`, nunca `rechazada`."""
        p = {
            "HG1001Ac": {
                "estado": "esperando_aprobacion",
                "revisor": "bloqueante",
                "t": _hace(60, self.ahora),
            },
            "HG1001Ab": {
                "estado": "esperando_aprobacion",
                "revisor": "bloqueante",
                "t": _hace(60, self.ahora),
            },
        }
        _, _, reparar, escalar = d.clasificar_puertas(p, self.ahora, None)
        self.assertEqual([x[0] for x in escalar], ["HG1001Ac"])
        self.assertEqual([x[0] for x in reparar], ["HG1001Ab"])

    def test_alcance_incompleto_ya_no_se_rechaza_solo_por_eso(self):
        """(2026-09-21) Cambio de politica: ver test_alcance_parcial.py.

        Tirar una rama con las cuatro puertas en verde porque falta un archivo
        costo 2 h 30 min de agentes en una sola noche. Ahora se integra lo hecho
        y lo que falta sale como tarea de seguimiento.
        """
        p = {
            "C": {
                "estado": "esperando_aprobacion",
                "revisor": "respondio",
                "faltan": ["x.py"],
                "t": _hace(60, self.ahora),
            }
        }
        self.assertEqual(d.puertas_a_rechazar(p, self.ahora), [])
        _, parciales, _, _ = d.clasificar_puertas(p, self.ahora, {"C": ["x.py", "y.py"]})
        self.assertEqual([x[0] for x in parciales], ["C"])

    def test_alcance_vacio_del_todo_si_se_rechaza(self):
        """No tocar NINGUN archivo declarado es otra cosa: hizo otro trabajo."""
        p = {
            "C": {
                "estado": "esperando_aprobacion",
                "revisor": "respondio",
                "faltan": ["x.py"],
                "t": _hace(60, self.ahora),
            }
        }
        rech, _, _, _ = d.clasificar_puertas(p, self.ahora, {"C": ["x.py"]})
        self.assertEqual([x[0] for x in rech], ["C"])

    def test_puerta_en_verde_no_se_toca(self):
        p = {
            "B": {
                "estado": "esperando_aprobacion",
                "revisor": "respondio",
                "motivo_vb": "pedido por la cola",
                "t": _hace(60, self.ahora),
            }
        }
        self.assertEqual(d.puertas_a_rechazar(p, self.ahora), [])

    def test_recien_llegada_no_se_toca(self):
        p = {
            "D": {
                "estado": "esperando_aprobacion",
                "revisor": "bloqueante",
                "t": _hace(1, self.ahora),
            }
        }
        self.assertEqual(d.puertas_a_rechazar(p, self.ahora), [])

    def test_otros_estados_no_entran(self):
        p = {
            "E": {
                "estado": "pendiente",
                "revisor": "bloqueante",
                "t": _hace(60, self.ahora),
            }
        }
        self.assertEqual(d.puertas_a_rechazar(p, self.ahora), [])


class TestOrquestadorAtascado(unittest.TestCase):
    def test_vivo_con_trabajadores_no_esta_atascado(self):
        self.assertFalse(d.orquestador_atascado(True, 3, 999)[0])

    def test_vivo_sin_trabajadores_y_quieto_si(self):
        ok, razon = d.orquestador_atascado(True, 0, 58)
        self.assertTrue(ok)
        self.assertIn("58", razon)

    def test_vivo_sin_trabajadores_pero_recien_no(self):
        self.assertFalse(d.orquestador_atascado(True, 0, 5)[0])

    def test_parado_no_es_asunto_de_esta_funcion(self):
        self.assertFalse(d.orquestador_atascado(False, 0, 999)[0])


class TestColgados(unittest.TestCase):
    def test_recien_arrancado_no_se_mata(self):
        ahora = 100000.0
        self.assertEqual(
            d.colgados_a_matar([{"pid": 9, "ultimo_byte": ahora - 60}], ahora), []
        )

    def test_media_hora_sin_bytes_se_mata(self):
        ahora = 100000.0
        self.assertEqual(
            d.colgados_a_matar([{"pid": 9, "ultimo_byte": ahora - 3600}], ahora), [9]
        )

    def test_pid_invalido_y_propio_nunca(self):
        ahora = 100000.0
        procesos = [
            {"pid": 1, "ultimo_byte": 1},
            {"pid": 0, "ultimo_byte": 1},
            {"pid": 7, "ultimo_byte": 1, "propio": True},
        ]
        self.assertEqual(d.colgados_a_matar(procesos, ahora), [])

    def test_sin_ultimo_byte_cae_a_inicio(self):
        ahora = 100000.0
        self.assertEqual(
            d.colgados_a_matar(
                [{"pid": 5, "ultimo_byte": 0, "inicio": ahora - 7200}], ahora
            ),
            [5],
        )


class TestRelojDeAvance(unittest.TestCase):
    def test_cuenta_desde_que_deja_de_cambiar(self):
        import tempfile

        ruta = os.path.join(tempfile.mkdtemp(), "estado.json")
        ahora = 100000.0
        p = {"A": {"estado": "commit"}}
        self.assertEqual(d.minutos_sin_integrar(p, ahora, ruta), 0.0)
        self.assertAlmostEqual(
            d.minutos_sin_integrar(p, ahora + 600, ruta), 10.0, places=1
        )
        p["B"] = {"estado": "commit"}
        self.assertEqual(d.minutos_sin_integrar(p, ahora + 900, ruta), 0.0)


class TestAvisoTrabajoSinRuido(unittest.TestCase):
    """La frase de trabajo se dice como mucho una vez por hora (2026-10-04)."""

    def setUp(self):
        import tempfile

        self.raiz = tempfile.mkdtemp()

    def test_no_se_repite_dentro_de_la_hora(self):
        frase = "el árbol tiene trabajo sin commitear y NO lo toco: src/x.ts"
        ahora = 1_000_000.0
        self.assertTrue(d._conviene_avisar_trabajo(self.raiz, frase, ahora))
        self.assertFalse(d._conviene_avisar_trabajo(self.raiz, frase, ahora + 600))

    def test_cambia_el_conjunto_y_avisa_enseguida(self):
        ahora = 1_000_000.0
        self.assertTrue(
            d._conviene_avisar_trabajo(self.raiz, "trabajo: src/a.ts", ahora)
        )
        self.assertTrue(
            d._conviene_avisar_trabajo(self.raiz, "trabajo: src/b.ts", ahora + 60)
        )

    def test_pasada_la_hora_se_repite(self):
        frase = "trabajo: src/x.ts"
        ahora = 1_000_000.0
        d._conviene_avisar_trabajo(self.raiz, frase, ahora)
        self.assertTrue(d._conviene_avisar_trabajo(self.raiz, frase, ahora + 3700))


class TestRechazoVaAlChatDirector(unittest.TestCase):
    """(2026-10-04) El rechazo firma como desatascador y llega a claude-cowork."""

    def setUp(self):
        import unittest.mock as m

        self._run = m.patch("subprocess.run")
        self._pub = m.patch.object(d.director_chat, "publicar")
        self.run = self._run.start()
        self.pub = self._pub.start()
        self.addCleanup(self._run.stop)
        self.addCleanup(self._pub.stop)

    def test_rechazo_firma_desatascador_y_publica_en_bandeja(self):
        self.run.return_value = type("R", (), {"returncode": 0})()
        frases = d.rechazar_puertas([("HG1004A", "revisión bloqueante confirmada")])
        self.assertEqual(
            self.run.call_args.kwargs["env"]["STARSEED_IDE"], "desatascador"
        )
        self.assertEqual(self.pub.call_count, 1)
        kw = self.pub.call_args.kwargs
        self.assertEqual(kw["de"], "desatascador")
        self.assertEqual(kw["canales"], ["claude-cowork"])
        self.assertEqual(kw["tarea"], "HG1004A")
        self.assertTrue(any("rechazo HG1004A" in f for f in frases))

    def test_si_publicar_lanza_el_rechazo_se_mantiene(self):
        self.run.return_value = type("R", (), {"returncode": 0})()
        self.pub.side_effect = RuntimeError("sin chat")
        frases = d.rechazar_puertas([("CDQ1004", "motivo")])
        self.assertTrue(any("rechazo CDQ1004" in f for f in frases))

    def test_rechazo_fallido_no_publica_nada(self):
        self.run.return_value = type("R", (), {"returncode": 1})()
        d.rechazar_puertas([("X1", "motivo")])
        self.assertEqual(self.pub.call_count, 0)


class TestReparacionAutomatica(unittest.TestCase):
    """(2026-10-05, bloqueadas-reparacion §4): reparar en vez de rechazar."""

    def setUp(self):
        import tempfile
        import unittest.mock as m

        self.tmp = tempfile.mkdtemp()
        self.pendientes = os.path.join(self.tmp, "reparaciones-pendientes.jsonl")
        self.llamadas = []
        self._pub = m.patch.object(d.director_chat, "publicar")
        self.pub = self._pub.start()
        self.addCleanup(self._pub.stop)

    def _post(self, vale):
        def f(url, datos):
            self.llamadas.append((url, datos))
            return vale

        return f

    def test_primera_objecion_pide_reparacion_automatica(self):
        frases = d.reparar_puertas(
            [("HG1001A", "falta una prueba del caso vacío")],
            post=self._post(True),
            pendientes=self.pendientes,
        )
        url, datos = self.llamadas[0]
        self.assertTrue(url.endswith("/api/mando/reintentar"))
        self.assertEqual(datos["ids"], ["HG1001A"])
        self.assertTrue(datos["automatico"])
        self.assertEqual(datos["cambio"], "falta una prueba del caso vacío")
        self.assertNotIn("escalar", datos)
        self.assertTrue(any("reparación automática de HG1001A" in f for f in frases))
        self.assertIn("reparación automática de HG1001A", self.pub.call_args[0][0])
        self.assertFalse(os.path.exists(self.pendientes))

    def test_tercer_intento_se_escala_no_se_rechaza(self):
        frases = d.escalar_puertas(
            [("HG1001Ac", "otra vez lo mismo")],
            post=self._post(True),
            pendientes=self.pendientes,
        )
        _, datos = self.llamadas[0]
        self.assertTrue(datos["escalar"])
        self.assertEqual(datos["ids"], ["HG1001Ac"])
        self.assertTrue(any("escalo HG1001Ac" in f for f in frases))
        self.assertIn("tercer intento con objeción", self.pub.call_args[0][0])

    def test_mando_caido_deja_la_peticion_en_el_archivo(self):
        frases = d.reparar_puertas(
            [("BLQ1005D", "objeción")],
            post=self._post(False),
            pendientes=self.pendientes,
            ahora=1000000.0,
        )
        self.assertTrue(any("Mando caído" in f for f in frases))
        with open(self.pendientes, encoding="utf-8") as fh:
            import json as _json

            lineas = [_json.loads(l) for l in fh if l.strip()]
        self.assertEqual(len(lineas), 1)
        self.assertEqual(lineas[0]["ids"], ["BLQ1005D"])
        self.assertTrue(lineas[0]["automatico"])
        self.assertEqual(lineas[0]["cambio"], "objeción")
        self.assertEqual(lineas[0]["t"], 1000000.0)

    def test_escalado_con_mando_caido_tambien_queda_pendiente(self):
        d.escalar_puertas(
            [("Z1c", "objeción")],
            post=self._post(False),
            pendientes=self.pendientes,
        )
        with open(self.pendientes, encoding="utf-8") as fh:
            import json as _json

            lineas = [_json.loads(l) for l in fh if l.strip()]
        self.assertTrue(lineas[0]["escalar"])

    def test_mando_caido_y_sin_disco_aun_devuelve_frase(self):
        frases = d.reparar_puertas(
            [("X2", "objeción")],
            post=self._post(False),
            pendientes=os.path.join(self.tmp, "no", "existe\x00", "r.jsonl"),
        )
        self.assertTrue(any("Mando caído" in f for f in frases))

    def test_avisar_fallando_no_tumba_la_reparacion(self):
        self.pub.side_effect = RuntimeError("sin chat")
        frases = d.reparar_puertas(
            [("X3", "objeción")], post=self._post(True),
            pendientes=self.pendientes,
        )
        self.assertTrue(any("reparación automática de X3" in f for f in frases))


if __name__ == "__main__":
    unittest.main()
