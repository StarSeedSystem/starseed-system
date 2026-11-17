"""Pruebas de modelo_privado_a1.py con JSON inyectado."""

import unittest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import modelo_privado_a1 as M


class TestPuedeCargar(unittest.TestCase):
    AHORA = "2026-11-16T10:00:00Z"
    ETIQUETA = "huihui_ai/qwen3.5-abliterated:4b"

    def test_vivo_version_y_etiqueta_ok(self):
        version_json = '{"version": "0.1.0"}'
        tags_json = '{"models": [{"name": "huihui_ai/qwen3.5-abliterated:4b"}]}'
        r = M.estado_del_servicio(version_json, tags_json, self.ETIQUETA, self.AHORA)
        self.assertTrue(r["vivo"])
        self.assertEqual(r["etiqueta"], self.ETIQUETA)
        self.assertTrue(r["instalado"])
        self.assertEqual(r["desde"], self.AHORA)
        self.assertEqual(r["motivo"], "ok")

    def test_version_ok_pero_etiqueta_falta(self):
        version_json = '{"version": "0.1.0"}'
        tags_json = '{"models": [{"name": "otro/modelo:4b"}]}'
        r = M.estado_del_servicio(version_json, tags_json, self.ETIQUETA, self.AHORA)
        self.assertFalse(r["vivo"])
        self.assertEqual(r["etiqueta"], self.ETIQUETA)
        self.assertFalse(r["instalado"])
        self.assertIsNone(r["desde"])
        self.assertEqual(r["motivo"], "etiqueta_no_instalada")

    def test_servicio_caido_version_falla(self):
        version_json = '{}'
        tags_json = '{"models": [{"name": "huihui_ai/qwen3.5-abliterated:4b"}]}'
        r = M.estado_del_servicio(version_json, tags_json, self.ETIQUETA, self.AHORA)
        self.assertFalse(r["vivo"])
        self.assertEqual(r["motivo"], "version_caida")

    def test_ambos_fallan(self):
        version_json = '{}'
        tags_json = '{"models": []}'
        r = M.estado_del_servicio(version_json, tags_json, self.ETIQUETA, self.AHORA)
        self.assertFalse(r["vivo"])
        self.assertEqual(r["motivo"], "version_caida_y_etiqueta_falta")

    def test_entradas_como_dict_tambien_funcionan(self):
        version_json = {"version": "0.1.0"}
        tags_json = {"models": [{"name": "huihui_ai/qwen3.5-abliterated:4b"}]}
        r = M.estado_del_servicio(version_json, tags_json, self.ETIQUETA, self.AHORA)
        self.assertTrue(r["vivo"])
        self.assertEqual(r["motivo"], "ok")


class TestDeclaracionPasarela(unittest.TestCase):
    def test_declaracion_none_si_no_vivo(self):
        estado = {"vivo": False, "etiqueta": "x", "instalado": False, "desde": None, "motivo": "version_caida"}
        self.assertIsNone(M.declaracion_pasarela(estado))

    def test_declaracion_con_valores_por_defecto(self):
        estado = {"vivo": True, "etiqueta": "huihui_ai/qwen3.5-abliterated:4b", "instalado": True, "desde": "2026-11-16T10:00:00Z", "motivo": "ok"}
        r = M.declaracion_pasarela(estado)
        self.assertIsNotNone(r)
        if r is not None:
            self.assertEqual(r["STARSEED_PASARELA_PRIVADO_URL"], "http://127.0.0.1:11434/v1")
            self.assertEqual(r["STARSEED_PASARELA_PRIVADO_KEY"], "sin-clave")
            self.assertEqual(r["STARSEED_PASARELA_PRIVADO_MODELOS"], "huihui_ai/qwen3.5-abliterated:4b")
            self.assertEqual(r["STARSEED_PASARELA_PRIVADO_RPM"], "2")
            self.assertEqual(r["STARSEED_PASARELA_PRIVADO_SOLO_REVISOR"], "1")

    def test_declaracion_con_base_y_rpm_personalizados(self):
        estado = {"vivo": True, "etiqueta": "modelo:test", "instalado": True, "desde": "2026-11-16T10:00:00Z", "motivo": "ok"}
        r = M.declaracion_pasarela(estado, base="http://10.0.0.1:11434/v1", rpm=5)
        self.assertIsNotNone(r)
        if r is not None:
            self.assertEqual(r["STARSEED_PASARELA_PRIVADO_URL"], "http://10.0.0.1:11434/v1")
            self.assertEqual(r["STARSEED_PASARELA_PRIVADO_RPM"], "5")


class TestTokensPorSegundoEsperados(unittest.TestCase):
    def test_base_4b_1500_tokens(self):
        # 4b = 3.3 GB, ctx=1500 → 4.8 * (3.3/3.3) = 4.8
        tps = M.tokens_por_segundo_esperados(3.3, 1500)
        self.assertAlmostEqual(tps, 4.8, places=1)

    def test_9b_1500_tokens_mitad_tps(self):
        # 9b = 6.6 GB, ctx=1500 → 4.8 * (3.3/6.6) = 2.4
        tps = M.tokens_por_segundo_esperados(6.6, 1500)
        self.assertAlmostEqual(tps, 2.4, places=1)

    def test_4b_11000_tokens_mitad_por_contexto(self):
        # 4b = 3.3 GB, ctx=11000 → 4.8 * 0.5 = 2.4
        tps = M.tokens_por_segundo_esperados(3.3, 11000)
        self.assertAlmostEqual(tps, 2.4, places=1)

    def test_9b_11000_tokens_cuarto(self):
        # 9b = 6.6 GB, ctx=11000 → 4.8 * (3.3/6.6) * 0.5 = 1.2
        tps = M.tokens_por_segundo_esperados(6.6, 11000)
        self.assertAlmostEqual(tps, 1.2, places=1)


class TestPlazoEstimado(unittest.TestCase):
    def test_plazo_estimado_9b_1500_entrada_300_salida_pasa_5_min(self):
        # 9b = 6.6 GB, entrada=1500, salida=300
        # escritura_tps = 2.4, lectura_tps = 7.2
        # t_lectura = 1500/7.2 ≈ 208s, t_escritura = 300/2.4 = 125s → total ≈ 333s > 300s
        s = M.plazo_estimado_s(6.6, 1500, 300)
        self.assertGreater(s, 300.0)  # más de 5 minutos

    def test_plazo_estimado_4b_mismo_tamano_mas_rapido(self):
        # 4b = 3.3 GB, entrada=1500, salida=300
        # escritura_tps = 4.8, lectura_tps = 14.4
        # t_lectura = 1500/14.4 ≈ 104s, t_escritura = 300/4.8 = 62.5s → total ≈ 166s
        s = M.plazo_estimado_s(3.3, 1500, 300)
        self.assertLess(s, 200.0)

def test_lectura_tres_veces_escritura(self):
        # Verificar que la lectura es ~3x la escritura en el cálculo
        s = M.plazo_estimado_s(3.3, 3000, 0)  # solo lectura
        s2 = M.plazo_estimado_s(3.3, 0, 1000)  # solo escritura (misma cantidad de tokens efectiva)
        # 3000 tokens lectura a 3x velocidad = 1000 tokens escritura a 1x
        # Deberían ser aproximadamente iguales
        self.assertAlmostEqual(s, s2, delta=1.0)


class TestPuedeCargar(unittest.TestCase):
    def test_caso_medido_falla(self):
        r = M.puede_cargar(1024, 112, True)
        self.assertFalse(r[0])
        self.assertIn("memoria disponible", r[1])
        self.assertIn("intercambio libre", r[1])
        self.assertIn("el nodo está compilando", r[1])

    def test_suficiente_memoria_y_intercambio_sin_compilar(self):
        r = M.puede_cargar(8000, 1800, False)
        self.assertTrue(r[0])
        self.assertEqual(r[1], "ok")

    def test_memoria_exacta_limite(self):
        r = M.puede_cargar(5200, 1024, False)
        self.assertTrue(r[0])
        self.assertEqual(r[1], "ok")

    def test_memoria_limite_falla(self):
        r = M.puede_cargar(5199, 1024, False)
        self.assertFalse(r[0])
        self.assertIn("memoria disponible", r[1])

    def test_intercambio_limite_falla(self):
        r = M.puede_cargar(5200, 1023, False)
        self.assertFalse(r[0])
        self.assertIn("intercambio libre", r[1])

    def test_solo_compilando_falla(self):
        r = M.puede_cargar(8000, 1800, True)
        self.assertFalse(r[0])
        self.assertIn("el nodo está compilando", r[1])

    def test_datos_none_memoria(self):
        r = M.puede_cargar(None, 1024, False)
        self.assertFalse(r[0])
        self.assertIn("no se pudo leer la memoria", r[1])

    def test_datos_none_intercambio(self):
        r = M.puede_cargar(8000, None, False)
        self.assertFalse(r[0])
        self.assertIn("no se pudo leer el intercambio libre", r[1])


class TestLeerMemoria(unittest.TestCase):
    def test_leer_meminfo_ejemplo(self):
        texto = """MemTotal:       16284284 kB
MemFree:         1234567 kB
MemAvailable:    10000000 kB
SwapTotal:       4096000 kB
SwapFree:        2000000 kB
"""
        mem_avail, swap_free = M.leer_memoria(texto)
        self.assertEqual(mem_avail, 9765)
        self.assertEqual(swap_free, 1953)

    def test_leer_meminfo_vacio(self):
        mem_avail, swap_free = M.leer_memoria("")
        self.assertIsNone(mem_avail)
        self.assertIsNone(swap_free)

    def test_leer_meminfo_sin_campos(self):
        texto = "Linea sin MemAvailable o SwapFree"
        mem_avail, swap_free = M.leer_memoria(texto)
        self.assertIsNone(mem_avail)
        self.assertIsNone(swap_free)


class TestEstaCompilando(unittest.TestCase):
    def test_lineas_de_procesos_next_build(self):
        lineas = ["node", "atscript.py", "next", "build"]
        self.assertTrue(M.esta_compilando(lineas))

    def test_lineas_de_procesos_tsc(self):
        lineas = ["tsc", "--noEmit"]
        self.assertTrue(M.esta_compilando(lineas))

    def test_lineas_de_procesos_vitest(self):
        lineas = ["npx", "vitest", "run"]
        self.assertTrue(M.esta_compilando(lineas))

    def test_lineas_de_procesos_python_script(self):
        lineas = ["python3", "ascript.py"]
        self.assertFalse(M.esta_compilando(lineas))

    def test_lineas_de_procesos_vacio(self):
        self.assertFalse(M.esta_compilando([]))

    def test_lineas_de_procesos_contenido_no_compilacion(self):
        lineas = ["node", "server.js"]
        self.assertFalse(M.esta_compilando(lineas))


if __name__ == "__main__":
    unittest.main()