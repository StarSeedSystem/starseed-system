"""Pruebas de autodesarrollo_decidir (IMN1021B): utilidad, cuántas, importancia y destino."""
import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autodesarrollo_decidir as D
VIVOS = {"src/lib/a.ts", "src/lib/b.ts", "src/lib/c.ts", "src/lib/d.ts", "docs/x.md", "src/lib/identidad.ts", "src/lib/cuentas/x.ts", "src/lib/permisos.ts",
         "src/lib/sharing.ts", "src/lib/gobernanza/voto.ts", "src/lib/claves.ts", "supabase/migrations/2026.sql", ".github/workflows/ci.yml",
         "scripts/puente/autopublicar.py", "scripts/puente/publicar.py", "scripts/puente/instalar-servicios.py"}
def existe(ruta):
    return ruta in VIVOS
def prop(**kw):
    p = {"titulo": "Arreglar el lector", "detalle": "corregir la carga",
         "archivos": ["src/lib/a.ts"], "verificacion": "verificado"}
    p.update(kw)
    return p
class TestUtilidad(unittest.TestCase):
    def test_pesos_de_verificacion(self):
        self.assertEqual(float(D.utilidad(prop(), existe)), 1.0)
        self.assertAlmostEqual(float(D.utilidad(prop(verificacion="ajustado"), existe)), 0.8)
        self.assertAlmostEqual(float(D.utilidad(prop(verificacion="sin verificar"), existe)), 0.4)
        self.assertAlmostEqual(float(D.utilidad(prop(verificacion=""), existe)), 0.6)

    def test_impacto_sobre_esfuerzo(self):
        self.assertAlmostEqual(float(D.utilidad(prop(impacto=2, esfuerzo=4), existe)), 0.5)
        self.assertEqual(float(D.utilidad(prop(impacto=9, esfuerzo=1), existe)), 1.0)

    def test_lo_que_decide_una_persona_no_es_tarea(self):
        for titulo in ("Publicar en producción", "Comprar el dominio", "Crear una cuenta",
                       "Rotar la clave de Stripe", "Decisión de Alex sobre el rumbo"):
            u = D.utilidad(prop(titulo=titulo), existe)
            self.assertEqual(float(u), 0.0, titulo)
            self.assertEqual(u.destino, "pregunta", titulo)

    def test_sin_verbo_o_sin_archivos_no_es_accionable(self):
        self.assertEqual(float(D.utilidad(prop(titulo="El lector", detalle="algo"), existe)), 0.0)
        self.assertEqual(float(D.utilidad(prop(archivos=[]), existe)), 0.0)

    def test_cita_que_ya_no_esta(self):
        u = D.utilidad(prop(archivos=["src/lib/no-existe.ts"]), existe)
        self.assertEqual(float(u), 0.0)
        self.assertIn("ya no aplica", u.motivo)
        self.assertEqual(float(D.utilidad(prop(archivos=["src/lib/a.ts"], cita="src/lib/no.ts:3"), existe)), 0.0)
        u = D.utilidad(prop(vigente=False), existe)
        self.assertEqual(float(u), 0.0)
        self.assertIn("ya no aplica", u.motivo)

    def test_jev_solo_veta_con_p_alta(self):
        veto = lambda p: {"veto": True, "p": 0.9}
        self.assertEqual(float(D.utilidad(prop(), existe, veto)), 0.0)
        blando = lambda p: {"veto": True, "p": 0.5}
        self.assertEqual(float(D.utilidad(prop(), existe, blando)), 1.0)


class TestCuantas(unittest.TestCase):
    def test_filtra_ordena_y_corta(self):
        elegidas = D.cuantas([{"utilidad": 0.5}, {"utilidad": 0.9}, {"utilidad": 0.7},
                              {"utilidad": 0.95}], {"min": 0, "max": 2})
        self.assertEqual([float(u["utilidad"]) for u in elegidas], [0.95, 0.9])
        self.assertIn("2 de 3", elegidas.motivo)

    def test_el_minimo_no_se_rellena(self):
        elegidas = D.cuantas([{"utilidad": 0.9}], {"min": 5, "max": 10})
        self.assertEqual(len(elegidas), 1)
        self.assertIn("por debajo del mínimo", elegidas.motivo)

    def test_cero_utiles_y_maximo_cero(self):
        self.assertEqual(len(D.cuantas([{"utilidad": 0.2}], {"min": 0, "max": 10})), 0)
        self.assertIn("ninguna propuesta", D.cuantas([{"utilidad": 0.2}], {"min": 0, "max": 10}).motivo)
        self.assertEqual(len(D.cuantas([{"utilidad": 0.9}], {"min": 0, "max": 0})), 0)


class TestImportancia(unittest.TestCase):
    def test_criticas(self):
        for ruta in ("src/lib/nucleo/x.ts", "src/lib/identidad.ts", "src/lib/cuentas/x.ts",
                     "src/lib/permisos.ts", "src/lib/sharing.ts", "src/lib/gobernanza/voto.ts",
                     "src/lib/claves.ts", "supabase/migrations/2026.sql", ".github/workflows/ci.yml",
                     "scripts/puente/autopublicar.py", "scripts/puente/publicar.py",
                     "scripts/puente/instalar-servicios.py"):
            self.assertEqual(D.importancia(prop(archivos=[ruta])), "critica", ruta)

    def test_alta(self):
        self.assertEqual(D.importancia(prop(archivos=["src/lib/a.ts", "src/lib/b.ts", "src/lib/c.ts", "src/lib/d.ts"])), "alta")
        self.assertEqual(D.importancia(prop(titulo="Eliminar el lector viejo")), "alta")
        self.assertEqual(D.importancia(prop(titulo="Cambiar valores por defecto de todas las cuentas")), "alta")
        self.assertEqual(D.importancia(prop(titulo="Cambiar el enrutador de IA")), "alta")

    def test_media_y_baja(self):
        self.assertEqual(D.importancia(prop()), "media")
        self.assertEqual(D.importancia(prop(archivos=["docs/x.md"])), "baja")


class TestDestino(unittest.TestCase):
    def test_automatico(self):
        self.assertEqual(D.destino(prop()), "autodesarrollo")
        self.assertEqual(D.destino(prop(archivos=["docs/x.md"])), "autodesarrollo")

    def test_alta_y_critica_esperan(self):
        alta = D.destino(prop(archivos=["src/lib/a.ts", "src/lib/b.ts", "src/lib/c.ts", "src/lib/d.ts"]))
        self.assertEqual(alta, "esperando-aprobacion")
        critica = D.destino(prop(archivos=["src/lib/nucleo/x.ts"]))
        self.assertEqual(critica, "esperando-aprobacion")
        self.assertTrue(critica.aprobacion_diff)

    def test_no_codigo_y_automatico_apagado(self):
        self.assertEqual(D.destino(prop(titulo="Comprar el dominio")), "pregunta")
        self.assertEqual(D.destino(prop(), automatico=False), "esperando-aprobacion")
        self.assertEqual(D.destino(prop(archivos=["docs/x.md"]), automatico=False), "esperando-aprobacion")

    def test_jev_afina_prioridad(self):
        media = prop()
        sube = lambda p: {"prioridad": "alta", "p": 0.9}
        self.assertEqual(D.destino(media, consejo=sube).importancia, "alta")
        cuatro = prop(archivos=["src/lib/a.ts", "src/lib/b.ts", "src/lib/c.ts", "src/lib/d.ts"])
        baja = lambda p: {"prioridad": "baja", "p": 0.9}
        self.assertEqual(D.destino(cuatro, consejo=baja), "autodesarrollo")
        flojo = lambda p: {"prioridad": "alta", "p": 0.5}
        self.assertEqual(D.destino(media, consejo=flojo).importancia, "media")


if __name__ == "__main__":
    unittest.main()
