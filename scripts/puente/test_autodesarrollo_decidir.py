#!/usr/bin/env python3
"""Pruebas de autodesarrollo_decidir: cada regla de §5.3–§5.6, sin red ni disco."""
import unittest
import autodesarrollo_decidir as D
EXISTEN = {
    "src/lib/algo.ts", "src/lib/otro.ts", "docs/x.md", "src/ai/astraura/router.ts",
    "src/lib/nucleo/x.ts", "supabase/migrations/1.sql", "src/lib/identidad.ts",
    "src/lib/sharing/access.ts", ".github/workflows/x.yml", "scripts/puente/publicar.py",
}

def existe(ruta):
    return ruta in EXISTEN

def propuesta(**cambios):
    base = {
        "id": "P1", "titulo": "Arreglar el lector de archivos", "cuerpo": "",
        "archivos": ["src/lib/algo.ts"], "verificacion": "verificado",
    }
    base.update(cambios)
    return base

class UtilidadTest(unittest.TestCase):
    def test_accionable_verificada_vale_uno(self):
        valor, motivo = D.utilidad(propuesta(), existe)
        self.assertEqual(valor, 1.0)
        self.assertIn("accionable", motivo)
    def test_sin_archivo_que_exista_vale_cero(self):
        valor, motivo = D.utilidad(propuesta(archivos=["src/no-existe.ts"]), existe)
        self.assertEqual(valor, 0.0)
        self.assertIn("ninguno", motivo)
    def test_sin_verbo_de_accion_vale_cero(self):
        valor, motivo = D.utilidad(propuesta(titulo="El lector de archivos"), existe)
        self.assertEqual(valor, 0.0)
        self.assertIn("verbo", motivo)
    def test_publicar_comprar_cuentas_claves_o_alex_son_pregunta(self):
        for titulo in (
            "Publicar el paquete", "Comprar un dominio", "Crear cuentas nuevas",
            "Cambiar la clave de API", "Que Alex decida el diseño",
        ):
            valor, motivo = D.utilidad(propuesta(titulo=titulo), existe)
            self.assertEqual(valor, 0.0, titulo)
            self.assertIn("pregunta", motivo, titulo)
        self.assertGreater(D.utilidad(propuesta(titulo="Arreglar el apagado del servidor"), existe)[0], 0)
    def test_impacto_entre_esfuerzo(self):
        valor, motivo = D.utilidad(propuesta(impacto=4, esfuerzo=8), existe)
        self.assertAlmostEqual(valor, 0.5)
        self.assertIn("impacto/esfuerzo 4/8", motivo)
    def test_multiplicadores_de_verificacion(self):
        casos = {"ajustado": 0.8, "sin verificar": 0.4, "sin dato": 0.6, None: 0.6}
        for dato, esperado in casos.items():
            self.assertAlmostEqual(D.utilidad(propuesta(verificacion=dato), existe)[0], esperado)
    def test_cita_que_ya_no_esta_no_aplica(self):
        valor, motivo = D.utilidad(propuesta(cita="src/viejo.ts"), existe)
        self.assertEqual(valor, 0.0)
        self.assertIn("ya no aplica", motivo)
        self.assertEqual(D.utilidad(propuesta(cita="src/lib/algo.ts"), existe)[0], 1.0)
    def test_jev_solo_veta_o_ajusta_con_p_alto(self):
        veta = lambda p: {"p": 0.9, "veta": True}
        baja = lambda p: {"p": 0.79, "veta": True}
        sube = lambda p: {"p": 0.9, "prioridad": "subir"}
        self.assertEqual(D.utilidad(propuesta(), existe, veta)[0], 0.0)
        self.assertEqual(D.utilidad(propuesta(), existe, baja)[0], 1.0)
        self.assertAlmostEqual(D.utilidad(propuesta(verificacion="ajustado"), existe, sube)[0], 0.9)

class CuantasTest(unittest.TestCase):
    def test_umbral_orden_y_corte_sin_rellenar_el_minimo(self):
        utiles = [
            {"id": "a", "utilidad": 0.5}, {"id": "b", "utilidad": 0.9},
            {"id": "c", "utilidad": 0.7}, {"id": "d", "utilidad": 0.6},
        ]
        salida = D.cuantas(utiles, {"min": 4, "max": 2})
        self.assertEqual([p["id"] for p in salida["elegidas"]], ["b", "c"])
        self.assertIn("no se rellena", salida["motivo"])
    def test_sin_utiles_no_encarga_nada(self):
        salida = D.cuantas([{"id": "a", "utilidad": 0.59}], {"min": 1, "max": 10})
        self.assertEqual(salida["elegidas"], [])
        self.assertIn("ninguna", salida["motivo"])

class ImportanciaTest(unittest.TestCase):
    def test_critica_por_rutas_intocables(self):
        for archivo in (
            "src/lib/nucleo/x.ts", "supabase/migrations/1.sql", ".github/workflows/x.yml",
            "scripts/puente/publicar.py", "src/lib/identidad.ts", "src/lib/sharing/access.ts",
        ):
            self.assertEqual(D.importancia(propuesta(archivos=[archivo])), "critica", archivo)
    def test_alta(self):
        self.assertEqual(D.importancia(propuesta(archivos=["a", "b", "c", "d"])), "alta")
        self.assertEqual(D.importancia(propuesta(titulo="Eliminar el lector viejo")), "alta")
        self.assertEqual(D.importancia(propuesta(archivos=["src/ai/astraura/router.ts"])), "alta")
        self.assertEqual(
            D.importancia(propuesta(titulo="Cambiar los valores por defecto de todas las cuentas")),
            "alta",
        )
    def test_media_y_baja(self):
        self.assertEqual(
            D.importancia(propuesta(archivos=["src/lib/algo.ts", "src/lib/otro.ts"])), "media"
        )
        self.assertEqual(D.importancia(propuesta(archivos=["docs/x.md"])), "baja")

class DestinoTest(unittest.TestCase):
    def test_automatico_por_importancia(self):
        self.assertEqual(D.destino(propuesta(), True)["destino"], "autodesarrollo")
        alta = D.destino(propuesta(archivos=["a", "b", "c", "d"]), True)
        self.assertEqual(alta["destino"], "esperando-aprobacion")
        self.assertFalse(alta["aprobacion_diff"])
        critica = D.destino(propuesta(archivos=["src/lib/nucleo/x.ts"]), True)
        self.assertEqual(critica["destino"], "esperando-aprobacion")
        self.assertTrue(critica["aprobacion_diff"])
    def test_no_codigo_es_pregunta(self):
        self.assertEqual(D.destino(propuesta(es_codigo=False), True)["destino"], "pregunta")
        publicado = propuesta(titulo="Publicar el paquete")
        self.assertEqual(D.destino(publicado, True)["destino"], "pregunta")
    def test_automatico_apagado_todo_espera(self):
        for p in (propuesta(), propuesta(archivos=["docs/x.md"]), propuesta(es_codigo=False)):
            self.assertEqual(D.destino(p, False)["destino"], "esperando-aprobacion")
        critica = D.destino(propuesta(archivos=["src/lib/nucleo/x.ts"]), False)
        self.assertTrue(critica["aprobacion_diff"])

if __name__ == "__main__":
    unittest.main()
