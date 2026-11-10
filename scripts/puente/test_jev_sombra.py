"""Prueba en sombra de Jev (MGM1110B): métricas, veredictos, revisión, reanudación y máquina libre.

Con peldaños de mentira y directorios temporales: nunca red, nunca ~/.starseed real, nunca un modelo.
"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jev_captura as cap  # noqa: E402
import jev_sombra as som  # noqa: E402

U = dict(som.UMBRALES)
ESTRATOS5 = ["noul:bloqueadas", "noul:aprobacion", "noul:produccion", "choice:enjambre:escritor", "choice:ramas-nube"]


def reg(i, ref, local, conf=0.9, ms=200.0, tipo="noul", estratos=None, sensible=False, peldano="laya", rss=100.0, q="q"):
    return {"id": "e%d" % i, "q": q, "peldano": peldano, "tipo": tipo, "estrato": estratos[0] if estratos else "noul:x",
            "estratos": estratos or ["noul:x"], "ref": ref, "local": local, "conf": None if local is None else conf,
            "ms": ms, "rss_mb": rss, "sensible": sensible}


class TestMetricas(unittest.TestCase):
    def setUp(self):
        # 10 decisiones: 8 respondidas (7 aciertos) y 2 sin respuesta; 5 confiables con 5 de acuerdo
        self.r = [
            reg(1, "si", "si", 0.9, 100), reg(2, "no", "no", 0.8, 200), reg(3, "si", "si", 0.95, 300),
            reg(4, "no", "no", 0.7, 400), reg(5, "si", "si", 0.99, 500),
            reg(6, "si", "si", 0.3, 600), reg(7, "no", "no", 0.4, 700), reg(8, "si", "no", 0.5, 800),
            reg(9, "si", None), reg(10, "no", None),
        ]
        self.m = som.metricas(self.r, U)

    def test_acuerdo_y_cobertura(self):
        m = self.m
        self.assertEqual((m["decisiones"], m["respondidas"], m["sin_respuesta"]), (10, 8, 2))
        self.assertEqual(m["acuerdo"], 0.875)             # 7 de 8
        self.assertEqual(m["confiables"], 5)              # confianza >= 0,7
        self.assertEqual(m["acuerdo_confiable"], 1.0)     # 5 de 5
        self.assertEqual(m["cobertura_confiable"], 0.5)   # 5 de las 10 decisiones

    def test_latencia_y_memoria(self):
        self.assertEqual(self.m["mediana_ms"], 450.0)     # 100..800 -> (400+500)/2
        self.assertEqual(self.m["p90_ms"], 800.0)         # rango más cercano de 8 valores
        self.assertEqual(self.m["rss_pico_mb"], 100.0)

    def test_el_umbral_de_confianza_incluye_exactamente_0_7(self):
        self.assertEqual(som.metricas([reg(1, "si", "si", 0.7)], U)["confiables"], 1)
        self.assertEqual(som.metricas([reg(1, "si", "si", 0.69)], U)["confiables"], 0)

    def test_frente_al_desenlace_real(self):
        # e1 acertó (proveedor bien, local igual); e3 falló (proveedor mal; local dijo lo mismo => mal); e8 falló y local discrepó => bien
        m = som.metricas(self.r, U, {"e1": True, "e3": False, "e8": False})
        d = m["desenlace"]
        self.assertEqual(d["conocidos"], 3)
        self.assertAlmostEqual(d["proveedor_acierta"], 1 / 3, places=3)
        self.assertEqual(d["comparables"], 3)
        self.assertAlmostEqual(d["local_acierta"], 2 / 3, places=3)

    def test_sin_registros_no_revienta(self):
        m = som.metricas([], U)
        self.assertEqual((m["decisiones"], m["acuerdo"], m["mediana_ms"]), (0, None, None))

    def test_normalizar(self):
        self.assertEqual(som.normalizar("noul", {"noul": 0.5})[0], "si")
        self.assertEqual(som.normalizar("noul", {"noul": 0.49})[0], "no")
        self.assertAlmostEqual(som.normalizar("noul", {"noul": 0.9})[2], 0.8)  # sin confianza: distancia al 0,5
        self.assertEqual(som.normalizar("choice", {"choice": "a", "confidence": 0.6}), ("a", None, 0.6))
        self.assertEqual(som.normalizar("score", {"score": 2.0})[0], "2")
        self.assertIsNone(som.normalizar("noul", {}))
        self.assertIsNone(som.normalizar("noul", None))


class TestVeredicto(unittest.TestCase):
    def _m(self, **cambios):
        regs = []
        # 1.000 llamadas, todos los estratos, 100 % de acuerdo, confiables, 100 ms
        for i in range(1000):
            regs.append(reg(i, "si", "si", 0.9, 100.0, estratos=ESTRATOS5))
        m = som.metricas(regs, U)
        m.update(cambios)
        return m

    def test_se_queda(self):
        self.assertEqual(som.veredicto(self._m(), U), "se queda")

    def test_se_descarta_por_acuerdo(self):
        self.assertEqual(som.veredicto(self._m(acuerdo_confiable=0.89), U), "se descarta")
        self.assertEqual(som.veredicto(self._m(acuerdo_confiable=0.90), U), "se queda")

    def test_se_descarta_por_cobertura(self):
        self.assertEqual(som.veredicto(self._m(cobertura_confiable=0.39), U), "se descarta")
        self.assertEqual(som.veredicto(self._m(cobertura_confiable=0.40), U), "se queda")

    def test_se_descarta_por_latencia(self):
        self.assertEqual(som.veredicto(self._m(mediana_ms=3001.0), U), "se descarta")
        self.assertEqual(som.veredicto(self._m(mediana_ms=3000.0), U), "se queda")

    def test_se_descarta_si_nada_es_confiable(self):
        self.assertEqual(som.veredicto(self._m(acuerdo_confiable=None), U), "se descarta")

    def test_faltan_datos_por_pocas_llamadas(self):
        self.assertEqual(som.veredicto(self._m(llamadas=999), U), "faltan datos")

    def test_faltan_datos_por_estrato(self):
        self.assertEqual(som.veredicto(self._m(estratos=ESTRATOS5[:4]), U), "faltan datos")

    def test_faltan_datos_manda_sobre_un_acuerdo_perfecto(self):
        self.assertEqual(som.veredicto(self._m(llamadas=10, acuerdo_confiable=1.0), U), "faltan datos")


class TestRevision(unittest.TestCase):
    def test_lista_solo_desacuerdos_sensibles(self):
        regs = [
            reg(1, "aprobar", "descartar", tipo="choice", sensible=True, q="p1"),   # sí
            reg(2, "descartar", "aprobar", tipo="choice", sensible=True, q="p2"),   # sí
            reg(3, "aprobar", "reintentar", tipo="choice", sensible=False),         # no sensible
            reg(4, "descartar", "descartar", tipo="choice", sensible=True),         # acuerdo
            reg(5, "descartar", None, tipo="choice", sensible=True),                # sin respuesta
        ]
        lista = som.lista_revision(regs)
        self.assertEqual([x["id"] for x in lista], ["e1", "e2"])
        self.assertEqual(lista[0], {"id": "e1", "pregunta": "p1", "peldano": "laya", "proveedor": "aprobar", "local": "descartar"})

    def test_es_sensible(self):
        self.assertTrue(som.es_sensible({}, "aprobar", "Descartar"))
        self.assertTrue(som.es_sensible({"instructions": "¿Hay que rechazar esta rama?"}, "si", "no"))
        self.assertTrue(som.es_sensible({"instructions": "¿Se debe descartar?"}, "si", "no"))
        self.assertFalse(som.es_sensible({"instructions": "¿Se aprueba?"}, "si", "no"))


class Fake(som.Peldano):
    def __init__(self, nombre, respuestas, disponible=True, ms_extra=0):
        self.llamadas = []
        self.respuestas = respuestas
        super().__init__(nombre, 0, self._c, lambda: disponible)

    def _c(self, estado, nombre, pregunta):
        self.llamadas.append(nombre)
        r = self.respuestas(len(self.llamadas), estado, nombre, pregunta)
        if isinstance(r, Exception):
            raise r
        return r


def siempre_si(n, estado, nombre, pregunta):
    return {"ans": {"noul": 0.95, "confidence": 0.9}, "rss_mb": 50.0}


class Entorno(unittest.TestCase):
    def setUp(self):
        base = tempfile.mkdtemp(prefix="sombra-")
        self.addCleanup(shutil.rmtree, base, True)
        self.cap = os.path.join(base, "captura")
        self.som = os.path.join(base, "sombra")
        self._env = dict(os.environ)
        os.environ["STARSEED_JEV_CAPTURA_DIR"] = self.cap
        self.addCleanup(lambda: (os.environ.clear(), os.environ.update(self._env)))
        cap.FALLOS = 0
        cap._rotado_dia = None
        self.addCleanup(setattr, som, "SOMBRA_DIR", som.SOMBRA_DIR)
        som.SOMBRA_DIR = self.som

    def capturar(self, n, tipo="noul", dominio="bloqueadas", p=0.9):
        for i in range(n):
            preg = {"q": {"type": tipo, "instructions": "¿?%d" % i}}
            resp = {"q": {"noul": p}} if tipo == "noul" else {"q": {"choice": "aprobar", "confidence": 0.8}}
            cap.registrar({"i": i}, preg, "quien", "explabs", "jev-latest", resp, 10, dominio=dominio)

    def ejecutar(self, peldanos, **kw):
        kw.setdefault("libre", lambda: (True, ""))
        kw.setdefault("pausa_s", 0)
        return som.ejecutar(peldanos, sombra=self.som, dir_captura=self.cap, **kw)


class TestEjecucion(Entorno):
    def test_repite_todo_y_anota_sin_textos(self):
        self.capturar(5)
        p = Fake("laya", siempre_si)
        r = self.ejecutar([p])
        self.assertEqual((r["hechas"], r["pendientes_restantes"], r["parada"]), (5, 0, "completo"))
        regs = som.cargar_progreso(self.som)
        self.assertEqual(len(regs), 5)
        self.assertEqual({(x["ref"], x["local"]) for x in regs}, {("si", "si")})
        with open(os.path.join(self.som, "progreso.jsonl"), encoding="utf-8") as f:
            crudo = f.read()
        self.assertNotIn("¿?", crudo)  # ni un texto de pregunta en el progreso

    def test_reanuda_sin_repetir(self):
        self.capturar(6)
        p = Fake("laya", siempre_si)
        r1 = self.ejecutar([p], max_unidades=4)
        self.assertEqual((r1["hechas"], r1["pendientes_restantes"], r1["parada"]), (4, 2, "tope de unidades"))
        r2 = self.ejecutar([p])
        self.assertEqual((r2["hechas"], r2["pendientes_restantes"]), (2, 0))
        self.assertEqual(len(p.llamadas), 6)
        r3 = self.ejecutar([p])
        self.assertEqual(r3["hechas"], 0)
        self.assertEqual(len(p.llamadas), 6)

    def test_captura_nueva_se_suma_al_reanudar(self):
        self.capturar(2)
        p = Fake("laya", siempre_si)
        self.ejecutar([p])
        self.capturar(3)
        self.assertEqual(self.ejecutar([p])["hechas"], 3)

    def test_peldano_no_disponible_se_salta_y_se_dice(self):
        self.capturar(3)
        a, b = Fake("laya", siempre_si), Fake("needle", siempre_si, disponible=False)
        r = self.ejecutar([a, b])
        self.assertIn("needle", r["saltados"])
        self.assertEqual(b.llamadas, [])
        self.assertEqual(r["hechas"], 3)

    def test_sin_respuesta_se_anota_y_cuenta(self):
        self.capturar(3)
        p = Fake("laya", lambda n, *a: None if n == 2 else siempre_si(n, 0, 0, 0))
        self.ejecutar([p])
        m = som.metricas(som.cargar_progreso(self.som), U)
        self.assertEqual((m["decisiones"], m["respondidas"], m["sin_respuesta"]), (3, 2, 1))

    def test_un_peldano_caido_se_aparta_y_no_se_anota(self):
        self.capturar(10)
        p = Fake("laya", lambda *a: OSError("conexión rechazada"))
        r = self.ejecutar([p])
        self.assertEqual(len(p.llamadas), som.FALLOS_SEGUIDOS_MAX)
        self.assertIn("laya", r["saltados"])
        self.assertEqual(som.cargar_progreso(self.som), [])  # se reintentará otro día
        self.assertEqual(r["pendientes_restantes"], 10)

    def test_solo_repite_tipos_soportados_con_respuesta(self):
        self.capturar(2)
        cap.registrar({}, {"q": {"type": "texto", "instructions": "x"}}, "q", "m", None, {"q": {"x": 1}}, 1)
        p = Fake("laya", siempre_si)
        self.assertEqual(self.ejecutar([p])["hechas"], 2)


class TestMaquinaLibre(Entorno):
    def test_se_detiene_cuando_la_maquina_deja_de_estar_libre(self):
        self.capturar(10)
        estados = iter([(True, "")] * 3 + [(False, "carga 9.0")] * 100)
        p = Fake("laya", siempre_si)
        r = self.ejecutar([p], libre=lambda: next(estados))
        self.assertEqual(r["hechas"], 3)
        self.assertEqual(r["parada"], "máquina ocupada: carga 9.0")
        self.assertEqual(r["pendientes_restantes"], 7)
        r2 = self.ejecutar([p])  # más tarde, libre otra vez: sigue donde se quedó
        self.assertEqual((r2["hechas"], r2["pendientes_restantes"]), (7, 0))

    def test_ocupada_desde_el_principio_no_hace_nada(self):
        self.capturar(4)
        p = Fake("laya", siempre_si)
        r = self.ejecutar([p], libre=lambda: (False, "turno de lo pesado ocupado"))
        self.assertEqual((r["hechas"], len(p.llamadas)), (0, 0))

    def test_tiempo_agotado(self):
        self.capturar(5)
        reloj = iter([0, 0, 0, 1000, 1000, 1000, 1000, 1000, 1000, 1000])
        p = Fake("laya", siempre_si)
        r = self.ejecutar([p], max_seg=10, reloj=lambda: next(reloj))
        self.assertEqual(r["parada"], "tiempo agotado")

    def test_guardia_de_carga(self):
        with mock.patch("os.getloadavg", return_value=(7.5, 5.0, 4.0)):
            ok, motivo = som.maquina_libre(U)
        self.assertFalse(ok)
        self.assertIn("carga", motivo)
        with mock.patch("os.getloadavg", return_value=(0.5, 0.5, 0.5)):
            self.assertEqual(som.maquina_libre(U, cerrojos=os.path.join(self.som, "no-hay")), (True, ""))

    def test_guardia_del_turno_pesado_no_lo_toma(self):
        import turno_pesado as tp

        cerrojos = os.path.join(self.som, "cerrojos")
        ruta = os.path.join(cerrojos, tp.NOMBRE)
        os.makedirs(ruta)
        with open(os.path.join(ruta, "dueno"), "w") as f:
            f.write(tp.texto_dueno(os.getpid(), __import__("time").time()))  # dueño vivo: este proceso
        with mock.patch("os.getloadavg", return_value=(0.1, 0.1, 0.1)):
            ok, motivo = som.maquina_libre(U, cerrojos=cerrojos)
        self.assertFalse(ok)
        self.assertIn("pesado", motivo)
        self.assertTrue(os.path.isdir(ruta))  # no lo quitó
        with open(os.path.join(ruta, "dueno"), "w") as f:
            f.write(tp.texto_dueno(999999, 1))  # dueño muerto: huérfano, no estorba
        with mock.patch("os.getloadavg", return_value=(0.1, 0.1, 0.1)):
            self.assertTrue(som.maquina_libre(U, cerrojos=cerrojos)[0])

    def test_interruptor(self):
        os.environ["STARSEED_JEV_SOMBRA"] = "0"
        self.assertFalse(som.maquina_libre(U)[0])

    def test_conversacion_en_vivo(self):
        import jev

        with mock.patch("os.getloadavg", return_value=(0.1, 0.1, 0.1)), mock.patch.object(jev, "conversando", return_value=True):
            ok, motivo = som.maquina_libre(U, cerrojos=os.path.join(self.som, "no-hay"))
        self.assertFalse(ok)
        self.assertIn("conversación", motivo)


class TestPeldanosReales(unittest.TestCase):
    """Los adaptadores de Needle y Laya con transporte falso (sin red)."""

    def setUp(self):
        self.addCleanup(setattr, som, "TRANSPORTE", som.TRANSPORTE)
        self.addCleanup(setattr, som, "rss_puerto_mb", som.rss_puerto_mb)
        som.rss_puerto_mb = lambda puerto: 42.0

    def test_laya_usa_el_contrato_de_systemone(self):
        vistos = []

        def t(url, cuerpo):
            vistos.append((url, cuerpo))
            return {"answers": {"q": {"noul": 0.2, "confidence": 0.9}}}

        som.TRANSPORTE = t
        r = som._laya({"a": 1}, "q", {"type": "noul", "instructions": "?"})
        self.assertEqual(vistos[0][1], {"state": {"a": 1}, "questions": {"q": {"type": "noul", "instructions": "?"}}})
        self.assertEqual(som.normalizar("noul", r["ans"])[0], "no")
        self.assertEqual(r["rss_mb"], 42.0)

    def test_needle_traduce_opciones_a_herramientas(self):
        mapa, esq = som.herramientas_de({"type": "choice", "criteria": {"aprobar": "Aprobar", "re-intentar": "Reintentar", "3d": "x"}})
        self.assertEqual(sorted(mapa.values()), ["3d", "aprobar", "re-intentar"])
        self.assertTrue(all(k.replace("_", "").isalnum() and not k[0].isdigit() for k in mapa))
        self.assertEqual(len(esq), 3)

        def t(url, cuerpo):
            self.assertTrue(url.endswith("/api/needle/decidir"))
            return {"ok": True, "llamadas": [{"nombre": "re_intentar", "argumentos": {}}], "confianza": 0.8, "ram_pico_mb": 120.5}

        som.TRANSPORTE = t
        r = som._needle({"a": 1}, "q", {"type": "choice", "instructions": "?", "criteria": {"aprobar": "A", "re-intentar": "R"}})
        self.assertEqual(som.normalizar("choice", r["ans"]), ("re-intentar", None, 0.8))
        self.assertEqual(r["rss_mb"], 120.5)

    def test_needle_sí_no_pasa_a_probabilidad_con_la_confianza(self):
        som.TRANSPORTE = lambda url, c: {"ok": True, "llamadas": [{"nombre": "no"}], "confianza": 0.6}
        r = som._needle({}, "q", {"type": "noul", "instructions": "?"})
        v = som.normalizar("noul", r["ans"])
        self.assertEqual(v[0], "no")
        self.assertAlmostEqual(v[1], 0.2)

    def test_disponible_solo_si_contesta_la_sonda(self):
        self.addCleanup(setattr, som, "puerto_abierto", som.puerto_abierto)
        som.puerto_abierto = lambda p, host="127.0.0.1": True
        som.TRANSPORTE = lambda url, c: {"answers": {"q": {"noul": 0.9}}}
        self.assertTrue(som._laya_disponible())

        def servidor_sin_modelo(url, c):
            raise OSError("HTTP Error 503: Service Unavailable")

        som.TRANSPORTE = servidor_sin_modelo
        self.assertFalse(som._laya_disponible())
        som.TRANSPORTE = lambda url, c: {"ok": False, "error": "404 sin pesos"}
        self.assertFalse(som._needle_disponible())
        som.puerto_abierto = lambda p, host="127.0.0.1": False
        som.TRANSPORTE = lambda url, c: {"answers": {"q": {"noul": 0.9}}}
        self.assertFalse(som._laya_disponible())

    def test_needle_sin_llamada_es_sin_respuesta(self):
        som.TRANSPORTE = lambda url, c: {"ok": True, "llamadas": [], "confianza": None}
        self.assertIsNone(som._needle({}, "q", {"type": "noul", "instructions": "?"}))


class TestSalida(Entorno):
    def test_informe_y_resultado_solo_con_metricas(self):
        self.capturar(4)
        p = Fake("laya", siempre_si)
        res, ej = som.correr(peldanos=[p], sombra=self.som, dir_captura=self.cap, libre=lambda: (True, ""), pausa_s=0)
        d = os.path.join(self.som, res["fecha"])
        with open(os.path.join(d, "informe.md"), encoding="utf-8") as f:
            informe = f.read()
        with open(os.path.join(d, "resultado.json"), encoding="utf-8") as f:
            resultado = json.load(f)
        self.assertEqual(resultado["veredictos"]["laya"], "faltan datos")
        self.assertIn("faltan datos".upper(), informe)
        self.assertIn("Ningún modelo local decide nada todavía", informe)
        self.assertNotIn("¿?", informe + json.dumps(resultado))
        with open(os.path.join(self.som, "ultimo.json")) as f:
            self.assertEqual(json.load(f)["veredictos"], {"laya": "faltan datos"})
        # el resumen de la captura enseña ese veredicto, sin textos
        self.assertIn("laya=faltan datos", cap.texto(cap.resumen(self.cap, sombra=os.path.join(self.som, "ultimo.json"))))

    def test_con_datos_suficientes_el_veredicto_sale_del_umbral(self):
        # 6 estratos mínimos con 1.000 llamadas se simulan escribiendo el progreso directamente
        for i in range(1000):
            som._anexar_progreso(reg(i, "si", "si", 0.9, 100.0, estratos=ESTRATOS5), self.som)
        r = som.analizar(sombra=self.som, dir_captura=self.cap)
        self.assertEqual(r["veredictos"]["laya"], "se queda")
        for i in range(1000, 1100):
            som._anexar_progreso(reg(i, "si", "no", 0.9, 100.0, estratos=ESTRATOS5), self.som)
        # 1.000 de 1.100 = 90,9 % >= 90 %: se queda; con más desacuerdos (1.000 de 1.300 = 76,9 %) se descarta
        self.assertEqual(som.analizar(sombra=self.som, dir_captura=self.cap)["veredictos"]["laya"], "se queda")
        for i in range(1100, 1300):
            som._anexar_progreso(reg(i, "si", "no", 0.9, 100.0, estratos=ESTRATOS5), self.som)
        self.assertEqual(som.analizar(sombra=self.som, dir_captura=self.cap)["veredictos"]["laya"], "se descarta")

    def test_la_lista_de_revision_va_a_resultado_con_ids(self):
        som._anexar_progreso(reg(1, "aprobar", "descartar", tipo="choice", sensible=True), self.som)
        r = som.analizar(sombra=self.som, dir_captura=self.cap)
        self.assertEqual(r["revision_manual"][0]["id"], "e1")
        self.assertIn("`e1`", som.informe_md(r))


class TestAuto(Entorno):
    def test_no_corre_hasta_la_meta_de_la_captura(self):
        self.capturar(3)
        self.assertEqual(som.auto(sombra=self.som, dir_captura=self.cap), "la captura aún no llegó a la meta")
        self.assertFalse(os.path.exists(os.path.join(self.som, "progreso.jsonl")))

    def test_apagado(self):
        os.environ["STARSEED_JEV_SOMBRA"] = "0"
        self.assertEqual(som.auto(sombra=self.som, dir_captura=self.cap), "apagada")

    def test_corre_si_la_meta_se_alcanzo(self):
        with mock.patch.object(cap, "resumen", return_value={"objetivo_alcanzado": True, "llamadas": 1000, "objetivo": 1000,
                                                              "estratos_presentes": 5, "estratos_faltan": [], "por_estrato": {}}):
            with mock.patch.object(som, "peldanos_por_defecto", return_value=[]):
                out = som.auto(sombra=self.som, dir_captura=self.cap, libre=lambda: (True, ""))
        self.assertIn("hechas 0", out)

    def test_un_segundo_lanzamiento_con_otro_en_marcha_se_aparta(self):
        c = som._tomar_cerrojo(self.som)
        self.assertTrue(c)
        self.assertIsNone(som._tomar_cerrojo(self.som))
        os.remove(c)
        self.assertTrue(som._tomar_cerrojo(self.som))


if __name__ == "__main__":
    unittest.main()
