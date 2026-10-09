#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de desatascar.py — las tres paradas medidas el 2026-09-13."""

import json
import os
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import desatascar as d
import desatascar as D


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


class TestPuertas(unittest.TestCase):
    def setUp(self):
        self.ahora = time.time()

    def test_bloqueante_madura_ya_no_se_rechaza(self):
        """(2026-10-05) Una bloqueante no es basura: es un cambio pedido."""
        p = {
            "A": {
                "estado": "esperando_aprobacion",
                "revisor": "bloqueante",
                "objecion": "falta manejar el caso vacío",
                "t": _hace(60, self.ahora),
            }
        }
        rech, _, bloqueantes = d.clasificar_puertas(p, self.ahora)
        self.assertEqual(rech, [])
        self.assertEqual(
            bloqueantes, [("A", "falta manejar el caso vacío")]
        )

    def test_bloqueante_sin_objecion_lleva_texto_generico(self):
        p = {
            "A": {
                "estado": "esperando_aprobacion",
                "revisor": "bloqueante",
                "t": _hace(60, self.ahora),
            }
        }
        _, _, bloqueantes = d.clasificar_puertas(p, self.ahora)
        self.assertEqual(bloqueantes, [("A", "revisión bloqueante confirmada")])

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
        _, parciales, _ = d.clasificar_puertas(p, self.ahora, {"C": ["x.py", "y.py"]})
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
        rech, _, _ = d.clasificar_puertas(p, self.ahora, {"C": ["x.py"]})
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


class TestRepararBloqueantes(unittest.TestCase):
    """(2026-10-05) Reparar primero; escalar solo al tercer intento."""

    def setUp(self):
        import tempfile
        import unittest.mock as m

        self.raiz = tempfile.mkdtemp()
        self._pub = m.patch.object(d.director_chat, "publicar")
        self.pub = self._pub.start()
        self.addCleanup(self._pub.stop)

    def test_primera_objecion_pide_reparacion(self):
        llamadas = []
        frases = d.reparar_bloqueantes(
            [("BLQ1005D", "falta manejar el caso vacío")],
            raiz=self.raiz,
            enviar=lambda tid: llamadas.append(tid) or True,
        )
        self.assertEqual(llamadas, ["BLQ1005D"])
        self.assertTrue(any("reparación automática de BLQ1005D" in f for f in frases))
        self.assertIn("objeción del revisor", frases[0])
        self.assertEqual(self.pub.call_count, 1)
        self.assertIn("Reparación automática", self.pub.call_args.args[0])

    def test_tercera_objecion_escala_sin_rechazar(self):
        d.intentos_reparacion(self.raiz, "X9", incrementar=True)
        d.intentos_reparacion(self.raiz, "X9", incrementar=True)
        llamadas = []
        frases = d.reparar_bloqueantes(
            [("X9", "misma objeción")],
            raiz=self.raiz,
            enviar=lambda tid: llamadas.append(tid) or True,
        )
        self.assertEqual(llamadas, [])
        self.assertTrue(any("escalo X9" in f for f in frases))
        self.assertIn("Escalado", self.pub.call_args.args[0])
        self.assertIn("No se rechaza", self.pub.call_args.args[0])

    def test_mando_caido_deja_peticion_en_archivo(self):
        import json as js

        frases = d.reparar_bloqueantes(
            [("BLQ1005D", "objeción X")], raiz=self.raiz, enviar=lambda tid: False
        )
        self.assertTrue(any("pendiente en archivo" in f for f in frases))
        with open(d._ruta_reparaciones_pendientes(self.raiz), encoding="utf-8") as fh:
            lineas = [js.loads(x) for x in fh if x.strip()]
        self.assertEqual(len(lineas), 1)
        self.assertEqual(lineas[0]["tarea"], "BLQ1005D")
        self.assertTrue(lineas[0]["automatico"])

    def test_mando_caido_y_disco_no_escribible_aun_devuelve_frase(self):
        """Si ni Genesis ni el archivo de pendientes responden, la frase sale
        igual: un fallo de red o de disco no puede tumbar el desatasco."""
        frases = d.reparar_bloqueantes(
            [("X2", "objeción")],
            raiz=os.path.join(self.raiz, "no", "existe\x00", "r"),
            enviar=lambda tid: False,
        )
        self.assertTrue(any("pendiente en archivo" in f for f in frases))

    def test_registrar_pendiente_con_ruta_imposible_devuelve_false(self):
        ok = d.registrar_reparacion_pendiente(
            os.path.join(self.raiz, "no", "existe\x00", "r"), "X2", "objeción"
        )
        self.assertFalse(ok)

    def test_avisar_fallando_no_tumba_la_reparacion(self):
        """Si el Chat Director está caído, la reparación sigue su curso."""
        self.pub.side_effect = RuntimeError("sin chat")
        frases = d.reparar_bloqueantes(
            [("X3", "objeción")],
            raiz=self.raiz,
            enviar=lambda tid: True,
        )
        self.assertTrue(any("reparación automática de X3" in f for f in frases))

    def test_accion_bloqueante_es_pura(self):
        self.assertEqual(d.accion_bloqueante(1), "reparar")
        self.assertEqual(d.accion_bloqueante(2), "reparar")
        self.assertEqual(d.accion_bloqueante(3), "escalar")


class TestDesatascarDirigeBloqueantes(unittest.TestCase):
    """Una puerta bloqueante va a reparación, nunca al rechazo (2026-10-05)."""

    def test_bloqueantes_a_reparacion_no_a_rechazo(self):
        import tempfile
        import unittest.mock as m

        ahora = time.time()
        p = {
            "A": {
                "estado": "esperando_aprobacion",
                "revisor": "bloqueante",
                "t": _hace(60, ahora),
            }
        }
        ruta_estado = os.path.join(tempfile.mkdtemp(), "estado.json")
        with m.patch.object(d, "trabajadores_opencode", return_value=[]), m.patch.object(
            d, "reparar_bloqueantes", return_value=["reparación automática de A"]
        ) as rep, m.patch.object(d, "rechazar_puertas") as rech:
            frases = d.desatascar("/tmp", True, 1, p, ahora=ahora,
                                  ruta_estado=ruta_estado)
        self.assertEqual(rep.call_count, 1)
        self.assertEqual(rech.call_count, 0)
        self.assertIn("reparación automática de A", frases)




class TestAprobacionesPendientes(unittest.TestCase):
    """(2026-10-08) Ramas en «pendiente_aprobacion» con revisión bloqueante: se reparan."""

    def setUp(self):
        self.ahora = 1_800_000_000.0

    def _p(self, **extra):
        e = {"estado": "pendiente_aprobacion", "revisor": "bloqueante", "motivo_vb": "revisión bloqueante confirmada",
             "t": _hace(30, self.ahora)}
        e.update(extra)
        return e

    def test_bloqueante_vieja_se_repara_y_queda_sustituida(self):
        prog = {"RM6": self._p()}
        enviados = []
        with tempfile.TemporaryDirectory() as raiz:
            os.makedirs(os.path.join(raiz, "starseed_memory_root", "olas"))
            frases = d.reparar_aprobaciones_pendientes(raiz=raiz, ahora=self.ahora, progreso=prog, tareas={},
                                                       enviar=lambda t: enviados.append(t) or "RM6b")
            with open(os.path.join(raiz, "starseed_memory_root", "olas", "progreso-correcciones.json")) as f:
                corr = json.load(f)
        self.assertEqual(enviados, ["RM6"])
        self.assertEqual(corr["RM6"]["estado"], "sustituida")
        self.assertIn("RM6b", corr["RM6"]["nota"])
        self.assertIn("reparo RM6 → RM6b", frases[0])

    def test_sin_sucesora_creada_no_se_marca_nada(self):
        with tempfile.TemporaryDirectory() as raiz:
            os.makedirs(os.path.join(raiz, "starseed_memory_root", "olas"))
            d.reparar_aprobaciones_pendientes(raiz=raiz, ahora=self.ahora, progreso={"RM6": self._p()}, tareas={},
                                              enviar=lambda t: None)
            self.assertFalse(os.path.exists(os.path.join(raiz, "starseed_memory_root", "olas",
                                                         "progreso-correcciones.json")))

    def test_en_verde_reciente_o_con_sucesora_viva_no_se_toca(self):
        prog = {"A": self._p(revisor="ok"), "B": self._p(t=_hace(1, self.ahora)),
                "C": self._p(), "Cb": {"estado": "pendiente"}}
        self.assertEqual(d.aprobaciones_pendientes_a_reparar(prog, {}, self.ahora), [])

    def test_sucesora_definida_en_cola_cuenta_aunque_no_tenga_progreso(self):
        self.assertEqual(d.sucesora_viva("PRD1005S", {"PRD1005S": self._p()}, {"PRD1005Sb": {}}), "PRD1005Sb")
        self.assertIsNone(d.sucesora_viva("RM6", {"RM6": self._p(), "RM7": {"estado": "pendiente"}}, {}))


class TestEslabonesRotos(unittest.TestCase):
    """(2026-10-08) CAMR1005F/G esperaban a CAMR1005Db en `fallo_tsc` y nadie lo reparaba."""

    def setUp(self):
        self.ahora = 1_800_000_000.0

    def test_un_fallo_con_alguien_esperando_se_repara(self):
        prog = {"CAMR1005Db": {"estado": "fallo_tsc", "t": _hace(30, self.ahora)}}
        tareas = {"CAMR1005F": {"depende": ["CAMR1005B", "CAMR1005Db"]}, "CAMR1005G": {"depende": ["CAMR1005Db"]}}
        self.assertEqual(d.eslabones_rotos(prog, tareas, self.ahora), [("CAMR1005Db", ["CAMR1005F", "CAMR1005G"])])
        pedidos = []
        frases = d.reparar_eslabones_rotos(raiz=tempfile.mkdtemp(), ahora=self.ahora, progreso=prog, tareas=tareas,
                                           enviar=lambda t: pedidos.append(t) or "CAMR1005Dc")
        self.assertEqual(pedidos, ["CAMR1005Db"])
        self.assertIn("CAMR1005Dc", frases[0])

    def test_rechazada_reciente_o_con_sucesora_no_se_toca(self):
        tareas = {"X": {"depende": ["A"]}, "Y": {"depende": ["B"]}, "Z": {"depende": ["C"]}}
        prog = {"A": {"estado": "rechazada", "t": _hace(30, self.ahora)},
                "B": {"estado": "fallo_tsc", "t": _hace(1, self.ahora)},
                "C": {"estado": "fallo_tsc", "t": _hace(30, self.ahora)}, "Cb": {"estado": "pendiente"}}
        self.assertEqual(d.eslabones_rotos(prog, tareas, self.ahora), [])

    def test_la_sucesora_de_la_cola_viva_pasa_a_una_cola_fuente(self):
        with tempfile.TemporaryDirectory() as olas:
            with open(os.path.join(olas, "cola-auto-1008-170000.json"), "w") as f:
                json.dump([{"id": "CAMR1005Dc", "titulo": "t"}], f)
            ruta = d.asegurar_en_cola_fuente(olas, "CAMR1005Dc")
            self.assertTrue(os.path.basename(ruta).startswith("cola-reintentos-"))
            self.assertIsNone(d.asegurar_en_cola_fuente(olas, "CAMR1005Dc"))  # ya tiene fuente


class TestMotivoSinSucesora(unittest.TestCase):
    """(2026-10-08) El vigía decía «caído o la cadena escala» sin saber cuál de las dos."""

    def test_escalada_dice_quien_la_retoma(self):
        d.ULTIMO_MOTIVO["X1c"] = ("escalada", "tercer intento fallido: escala al director, nunca se descarta")
        self.assertIn("escalera del director", d.motivo_sin_sucesora("X1c"))

    def test_sin_respuesta_es_genesis_que_no_respondio(self):
        d.ULTIMO_MOTIVO.pop("NADIE", None)
        self.assertEqual(d.motivo_sin_sucesora("NADIE"), "Genesis no respondió")

    def test_otra_accion_se_cita(self):
        d.ULTIMO_MOTIVO["Y"] = ("esperando", "ya existe un sucesor vivo: Yb")
        self.assertIn("ya existe un sucesor vivo", d.motivo_sin_sucesora("Y"))


if __name__ == "__main__":
    unittest.main()


class CopiasDeCadena(unittest.TestCase):
    """(2026-10-09) CAMR1005F entró en main mientras sus copias Fb (fallo tsc) y Fc (esperando
    visto bueno) seguían vivas: se retiran, y nunca una de seguimiento ni una con otro alcance."""

    ARCH = ["src/ai/astraura/mesh/camr/bucle.ts", "src/ai/astraura/mesh/decision-router.ts"]

    def tareas(self):
        return {
            "CAMR1005F": {"id": "CAMR1005F", "archivos": list(self.ARCH)},
            "CAMR1005Fb": {"id": "CAMR1005Fb", "archivos": list(reversed(self.ARCH))},
            "CAMR1005Fc": {"id": "CAMR1005Fc", "archivos": list(self.ARCH)},
            "X1": {"id": "X1", "archivos": ["a.ts"]},
            "X1b": {"id": "X1b", "archivos": ["a.ts", "b.ts"]},
            "Y1": {"id": "Y1", "archivos": ["c.ts", "d.ts"]},
            "Y1s": {"id": "Y1s", "archivos": ["c.ts", "d.ts"], "origen": "seguimiento de alcance parcial"},
        }

    def test_retira_las_copias_de_lo_integrado(self):
        progreso = {
            "CAMR1005F": {"estado": "commit", "nota": "ab6023ce · revisión ok"},
            "CAMR1005Fb": {"estado": "fallo_tsc"},
            "CAMR1005Fc": {"estado": "esperando_aprobacion", "revisor": "bloqueante"},
            "X1": {"estado": "commit"}, "X1b": {"estado": "fallo_tsc"},
            "Y1": {"estado": "commit"}, "Y1s": {"estado": "pendiente"},
        }
        r = D.redundantes_de_cadena(progreso, self.tareas())
        self.assertEqual([("CAMR1005Fb", "CAMR1005F", "fallo_tsc"),
                          ("CAMR1005Fc", "CAMR1005F", "esperando_aprobacion")], r)

    def test_sin_integrada_no_retira_nada(self):
        progreso = {"CAMR1005F": {"estado": "fallo_tsc"}, "CAMR1005Fb": {"estado": "pendiente"}}
        self.assertEqual([], D.redundantes_de_cadena(progreso, self.tareas()))

    def test_integrada_por_asunto_de_main_tambien_cuenta(self):
        progreso = {"CAMR1005F": {"estado": "sustituida"}, "CAMR1005Fb": {"estado": "fallo_tsc"}}
        asuntos = ["Ola 1005C · CAMR · CAMR1005F: bucle autónomo"]
        # Fc no tiene progreso: está pendiente en su cola y también es copia.
        self.assertEqual([("CAMR1005Fb", "CAMR1005F", "fallo_tsc"), ("CAMR1005Fc", "CAMR1005F", "pendiente")],
                         D.redundantes_de_cadena(progreso, self.tareas(), asuntos))

    def test_retirar_escribe_la_correccion_y_libera_el_trabajador(self):
        import tempfile
        raiz = tempfile.mkdtemp()
        olas = os.path.join(raiz, "starseed_memory_root", "olas")
        os.makedirs(olas)
        progreso = {
            "CAMR1005F": {"estado": "commit", "nota": "ab6023ce · revisión ok"},
            "CAMR1005Fb": {"estado": "fallo_tsc"},
            "CAMR1005Fc": {"estado": "esperando_aprobacion"},
        }
        ordenes = []
        D.director_chat.publicar = lambda *a, **k: None
        frases, ids = D.retirar_redundantes(raiz=raiz, progreso=progreso, tareas=self.tareas(), asuntos=[],
                                            correr=lambda o: ordenes.append(o))
        self.assertEqual({"CAMR1005Fb", "CAMR1005Fc"}, ids)
        self.assertEqual([["starseed-puente", "rechazar", "CAMR1005Fc"]], ordenes)
        with open(os.path.join(olas, "progreso-correcciones.json"), encoding="utf-8") as f:
            corr = json.load(f)
        self.assertEqual("sustituida", corr["CAMR1005Fb"]["estado"])
        self.assertIn("ab6023ce", corr["CAMR1005Fc"]["nota"])
        # Una segunda pasada no repite órdenes ni avisos.
        ordenes.clear()
        frases2, _ = D.retirar_redundantes(raiz=raiz, progreso=progreso, tareas=self.tareas(), asuntos=[],
                                           correr=lambda o: ordenes.append(o))
        self.assertEqual([], ordenes)
        self.assertEqual([], frases2)
