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

# ─────────────── Ola 1024I · IMG1024C: el automático ───────────────
import itertools
import autodesarrollo_logica as L

def ajustes(automatico=True, aprobar=True, reimaginar=True, umbral=0.75, maximo=2):
    return L.validar_ajustes({"automatico": automatico, "auto": {"aprobar": aprobar, "reimaginar": reimaginar,
                                                                "umbral": umbral, "max_reimaginaciones": maximo}})

def decidida(**cambios):
    """Propuesta ya puntuada como lo hace el director (utilidad e importancia antes del destino)."""
    cambios.setdefault("fuente", "diaria")
    p = propuesta(**cambios)
    p["utilidad"], p["motivo"] = D.utilidad(p, existe)
    return p

class ImportanciaDeclaradaTest(unittest.TestCase):
    def test_solo_sube_nunca_baja(self):
        self.assertEqual(D.importancia(propuesta(importancia_declarada="critica")), "critica")
        self.assertEqual(D.importancia(propuesta(importancia_declarada="alta")), "alta")
        self.assertEqual(D.importancia(propuesta(archivos=["src/lib/nucleo/x.ts"], importancia_declarada="baja")), "critica")
        self.assertEqual(D.importancia(propuesta(importancia_declarada="rara")), D.importancia(propuesta()))
    def test_nivel_y_visible(self):
        self.assertEqual([D.nivel(x) for x in ("Crítica", "critical", "HIGH", "normal", "baja", "x")],
                         ["critica", "critica", "alta", "media", "baja", ""])
        self.assertEqual(D.importancia_visible("critica"), "crítica")
        self.assertEqual(D.importancia_visible("media"), "media")

class AutomaticaTest(unittest.TestCase):
    def test_baja_media_con_utilidad_se_integra_sola(self):
        r = D.automatica(decidida(), ajustes())
        self.assertEqual(r["destino"], "autodesarrollo")
        self.assertIn("se integra sola", r["motivo"])
        self.assertFalse(r["aprobacion_diff"])

    def test_alta_y_critica_nunca_se_integran_solas(self):
        """Ninguna combinación de interruptores, umbral, tope ni consejo de Jev las integra."""
        importantes = [
            decidida(archivos=["src/lib/algo.ts", "src/lib/otro.ts", "docs/x.md", "src/ai/astraura/router.ts"]),
            decidida(titulo="Arreglar y eliminar el lector viejo"),
            decidida(archivos=["src/ai/astraura/router.ts"]),
            decidida(archivos=["src/lib/nucleo/x.ts"]),
            decidida(archivos=["supabase/migrations/1.sql"]),
            decidida(importancia_declarada="crítica"),
            decidida(importancia_declarada="alta", fuente="agentes", tipo="diseno"),
        ]
        jevs = [None, lambda p: {"p": 1.0, "prioridad": "subir"}, lambda p: {"p": 0.99, "aprobar": True},
                lambda p: {"p": 0.99, "veta": True}, lambda p: 1 / 0]
        for p in importantes:
            self.assertIn(D.importancia(p), ("alta", "critica"))
            for auto, apr, rei, umbral, maximo, jev in itertools.product((True, False), (True, False), (True, False),
                                                                          (0.6, 0.75, 1.0), (0, 2, 10), jevs):
                r = D.automatica(p, ajustes(auto, apr, rei, umbral, maximo), existe, jev)
                self.assertNotIn(r["destino"], ("autodesarrollo", "reimaginando"), (p["titulo"], p["archivos"]))
                self.assertEqual(r["aprobacion_diff"], D.importancia(p) == "critica")

    def test_no_llega_se_reimagina_con_la_critica(self):
        p = decidida(verificacion="sin verificar", archivos=["src/lib/algo.ts", "src/no-existe.ts"])
        r = D.automatica(p, ajustes(), existe)
        self.assertEqual(r["destino"], "reimaginando")
        self.assertIn("utilidad 0,4 < umbral 0,75", r["notas"])
        self.assertIn("src/no-existe.ts", r["notas"])
        self.assertIn("le quedan 2", r["motivo"])
        sin_archivos = D.automatica(decidida(archivos=["src/fantasma.ts"]), ajustes(), existe)
        self.assertEqual(sin_archivos["destino"], "reimaginando")
        self.assertIn("ninguno de los archivos", sin_archivos["notas"])
        cita = D.automatica(decidida(cita="src/viejo.ts"), ajustes(), existe)
        self.assertIn("ya no está en el código", cita["notas"])

    def test_tope_de_la_cadena_deja_en_la_lista(self):
        p = decidida(verificacion="sin verificar", version=3)
        self.assertEqual(D.reimaginaciones_libres(p, 2), 0)
        r = D.automatica(p, ajustes(maximo=2), existe)
        self.assertEqual(r["destino"], "nueva")
        self.assertIn("sin reimaginaciones libres", r["motivo"])
        self.assertEqual(D.automatica(p, ajustes(maximo=3), existe)["destino"], "reimaginando")

    def test_jev_solo_veta_con_p_alto_y_nunca_convierte_no_en_si(self):
        p = decidida()
        self.assertEqual(D.automatica(p, ajustes(), existe, lambda q: {"p": 0.9, "veta": True})["destino"], "nueva")
        self.assertEqual(D.automatica(p, ajustes(), existe, lambda q: {"p": 0.79, "veta": True})["destino"], "autodesarrollo")
        self.assertEqual(D.automatica(p, ajustes(), existe, lambda q: 1 / 0)["destino"], "autodesarrollo")  # Jev calla
        self.assertEqual(D.automatica(p, ajustes(), existe, lambda q: None)["destino"], "autodesarrollo")
        flojo = decidida(verificacion="sin verificar")
        si = lambda q: {"p": 1.0, "prioridad": "subir", "aprobar": True}
        for aj in (ajustes(reimaginar=False), ajustes(maximo=0)):
            self.assertNotEqual(D.automatica(flojo, aj, existe, si)["destino"], "autodesarrollo")
        llamadas = []
        D.automatica(flojo, ajustes(reimaginar=False), existe, lambda q: llamadas.append(q) or {"p": 1})
        self.assertEqual(llamadas, [], "a Jev solo se le pregunta lo que la regla ya integraría")

    def test_lo_de_alex_y_otras_fuentes_no_se_tocan_solos(self):
        publicar = decidida(titulo="Publicar el paquete")
        for aj in (ajustes(), ajustes(automatico=False)):
            r = D.automatica(publicar, aj, existe)
            self.assertIn(r["destino"], ("pregunta", "esperando-aprobacion"))
            self.assertEqual(r["notas"], "")
        for fuente in ("directores", "astraura"):
            p = decidida(fuente=fuente, archivos=[])
            self.assertEqual(D.automatica(p, ajustes(), existe), dict(D.destino(p, True, existe), notas=""))

    def test_ambito_y_tipo(self):
        self.assertEqual(D.automatica(decidida(ambito="personal"), ajustes(), existe)["destino"], "nueva")
        contenido = decidida(tipo="contenido", archivos=["src/fantasma.ts"])
        self.assertEqual(D.automatica(contenido, ajustes(), existe)["destino"], "pregunta")
        diseno = decidida(tipo="diseno", archivos=["src/fantasma.ts"])
        self.assertEqual(D.automatica(diseno, ajustes(), existe)["destino"], "reimaginando")

    def test_umbral_del_automatico_o_el_de_siempre(self):
        media = decidida(verificacion="ajustado")  # 0,8
        self.assertEqual(D.automatica(media, ajustes(umbral=0.9, reimaginar=False), existe)["destino"], "nueva")
        self.assertEqual(D.automatica(media, ajustes(umbral=0.8), existe)["destino"], "autodesarrollo")
        # «aprobar» apagado: integra el Automático de siempre con su 0,6; lo que no llega ya no queda en un limbo
        self.assertEqual(D.automatica(decidida(verificacion="sin dato"), ajustes(aprobar=False, reimaginar=False), existe)["destino"], "autodesarrollo")
        self.assertEqual(D.automatica(decidida(verificacion="sin verificar"), ajustes(aprobar=False, reimaginar=False), existe)["destino"], "nueva")
        self.assertEqual(D.umbral_efectivo(ajustes(aprobar=False, umbral=0.9)), 0.6)
        self.assertEqual(D.umbral_efectivo(ajustes(umbral=0.9)), 0.9)

    def test_todo_apagado_es_el_destino_de_siempre(self):
        aj = ajustes(automatico=False, aprobar=False, reimaginar=False)
        for p in (decidida(), decidida(archivos=["docs/x.md"]), decidida(es_codigo=False), decidida(archivos=["src/lib/nucleo/x.ts"])):
            self.assertEqual(D.automatica(p, aj, existe), dict(D.destino(p, False, existe), notas=""))

    def test_solo_reimaginar_con_automatico_apagado(self):
        aj = ajustes(automatico=False, aprobar=False, reimaginar=True)
        self.assertEqual(D.automatica(decidida(), aj, existe)["destino"], "esperando-aprobacion")
        self.assertEqual(D.automatica(decidida(verificacion="sin verificar"), aj, existe)["destino"], "reimaginando")

    def test_firma_cambia_con_los_ajustes(self):
        self.assertNotEqual(D.firma(ajustes()), D.firma(ajustes(umbral=0.8)))
        self.assertNotEqual(D.firma(ajustes()), D.firma(ajustes(maximo=3)))
        self.assertEqual(D.firma(ajustes()), D.firma(ajustes()))

    def test_cuantas_con_umbral_del_automatico(self):
        utiles = [{"id": "a", "utilidad": 0.7}, {"id": "b", "utilidad": 0.9}]
        self.assertEqual([p["id"] for p in D.cuantas(utiles, {"min": 0, "max": 5}, 0.8)["elegidas"]], ["b"])
        self.assertEqual(len(D.cuantas(utiles, {"min": 0, "max": 5}, 0.1)["elegidas"]), 2)  # nunca bajo 0,6
        self.assertIn("0,95", D.cuantas(utiles, {"min": 0, "max": 5}, 0.95)["motivo"])

    def test_critica_acotada(self):
        p = decidida(cuerpo="x" * 5000, motivo="m" * 5000, archivos=["src/f%d.ts" % i for i in range(50)])
        self.assertLessEqual(len(D.critica(p, 0.75, existe)), D.MAX_NOTAS)

if __name__ == "__main__":
    unittest.main()
