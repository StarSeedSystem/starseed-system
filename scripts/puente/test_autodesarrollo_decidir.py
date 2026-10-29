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
import director_autodesarrollo as DIR

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
        # Ola 1025S: Astraura ya la decide el automático (Ola1025STest); los directores siguen siendo de Alex.
        p = decidida(fuente="directores", archivos=[])
        self.assertEqual(D.automatica(p, ajustes(), existe), dict(D.destino(p, True, existe), notas=""))

    def test_ambito_y_tipo(self):
        self.assertEqual(D.automatica(decidida(ambito="personal"), ajustes(), existe)["destino"], "nueva")
        # Ola 1025S: cualquier tipo se reimagina solo (antes, un contenido quedaba en «pregunta»).
        contenido = decidida(tipo="contenido", archivos=["src/fantasma.ts"])
        self.assertEqual(D.automatica(contenido, ajustes(), existe)["destino"], "reimaginando")
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

# ─────────────── Ola 1025S · IMG1025A: todas las fuentes y tipos, sin duplicadas ───────────────
import json as _json

ESQUEMA = _json.dumps({"agent": "Hephaestus-NEON", "capabilities": ["ARM64_Vectorization", "BitNet_158b_Inference"],
                       "allocated_cores": 3, "target_brain": "brain_hephaestus"}, indent=2)
ESQUELETO = ("// Auto-generado por Proceso Onírico\n// Asignación de recursos M1: 40%\n"
             "inline void compute_ternary_fast(const int8_t* w, const float* x, float* y) {\n    // acumulador\n}")
RICO = ("## Qué propone\nUna guía de tono para las publicaciones de la comunidad, con ejemplos reales.\n\n"
        "## Por qué\n" + "La comunidad pide textos claros y cercanos que expliquen cada función sin jerga técnica. " * 12 + "\n\n"
        "- Principio uno: claridad antes que brillo.\n- Principio dos: cada texto dice qué, por qué y cómo.\n"
        "- Principio tres: accesible para todas las personas.\n\n"
        "Referencias: https://www.w3.org/WAI/standards-guidelines/ y https://material.io/design/communication/writing\n")


def astraura(cuerpo=ESQUEMA, nivel="medium", **extra):
    o = {"fecha": "2026-10-24", "tipo": "creacion", "id": "creation_1", "importance_level": nivel,
         "requires_user_approval": True, "status": "pending_approval"}
    o.update(extra.pop("origen", {}))
    p = {"id": "astraura:" + o["id"], "fuente": "astraura", "titulo": "Esquema de Agente Mutado: Hephaestus-NEON",
         "cuerpo": cuerpo, "archivos": [], "cita": "astraura:creacion/" + o["id"], "verificacion": "sin_verificar", "origen": o}
    p.update(extra)
    p["utilidad"], p["motivo"] = D.utilidad_propuesta(p, existe)
    return p


def libre(cuerpo=RICO, tipo="contenido", **extra):
    p = {"id": "agentes:a--guia", "fuente": "agentes", "agente": "a", "tipo": tipo, "titulo": "Guía de tono de la comunidad",
         "cuerpo": cuerpo, "archivos": [], "referencias": [], "verificacion": "sin dato", "version": 1,
         "origen": {"fecha": "2026-10-24"}}
    p.update(extra)
    p["utilidad"], p["motivo"] = D.utilidad_propuesta(p, existe)
    return p


class Ola1025STest(unittest.TestCase):
    def test_fuentes_astraura_si_directores_no(self):
        self.assertIn("astraura", D.FUENTES_AUTO)
        self.assertNotIn("directores", D.FUENTES_AUTO)

    def test_utilidad_de_astraura_por_su_json(self):
        self.assertEqual(D.utilidad_astraura(astraura())[0], 0.9)  # nombre y capacidades
        campos = _json.dumps({"allocated_cores": 3, "target_brain": "brain_x", "modo": "vectorial"})
        self.assertEqual(D.utilidad_astraura(astraura(campos))[0], 0.8)  # ≥ 3 campos sustanciales
        self.assertEqual(D.utilidad_astraura(astraura(_json.dumps({"agent": "Hephaestus"})))[0], 0.4)
        self.assertEqual(D.utilidad_astraura(astraura("{}"))[0], 0.05)
        self.assertEqual(D.utilidad_astraura(astraura(_json.dumps({"agent": "", "x": None, "y": "..."})))[0], 0.05)
        roto = D.utilidad_astraura(astraura('{"agent": "X", '))
        self.assertEqual(roto[0], 0.1); self.assertIn("roto", roto[1])
        vacia = D.utilidad_astraura(astraura("Esquema de Agente Mutado: Hephaestus-NEON"))  # cuerpo = título
        self.assertEqual(vacia[0], 0.05)
        self.assertLess(D.utilidad_astraura(astraura(ESQUELETO))[0], 0.2)  # función vacía: no es sustancia

    def test_utilidad_libre_por_sustancia_pura_y_determinista(self):
        rica = D.utilidad_libre(libre())
        self.assertGreaterEqual(rica[0], 0.75); self.assertIn("2 referencia(s) https", rica[1])
        self.assertEqual(rica, D.utilidad_libre(libre()))
        delgada = D.utilidad_libre(libre("Una idea suelta sin desarrollar."))
        self.assertLess(delgada[0], 0.2)
        self.assertEqual(D.utilidad_libre(libre("Guía de tono de la comunidad"))[0], 0.0)  # solo el título
        con_refs = libre("Texto corto con apoyo.", referencias=[{"titulo": "a", "url": "https://a.org"},
                                                               {"titulo": "b", "url": "https://b.org"}, {"titulo": "c", "url": "https://c.org"}])
        self.assertGreater(D.utilidad_libre(con_refs)[0], delgada[0])
        m = D.medir_sustancia(libre("# Título\n\n- uno\n- dos\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nver http://inseguro.org"))
        self.assertEqual((m["estructura"] >= 5, m["referencias"]), (True, 0))  # http no cuenta

    def test_jev_solo_frena_lo_que_no_es_codigo(self):
        p = libre()
        base = D.utilidad_libre(p)[0]
        self.assertEqual(D.utilidad_libre(p, lambda q: {"p": 0.9, "veta": True})[0], 0.0)
        self.assertEqual(D.utilidad_libre(p, lambda q: {"p": 0.79, "veta": True})[0], base)
        self.assertAlmostEqual(D.utilidad_libre(p, lambda q: {"p": 0.9, "prioridad": "bajar"})[0], round(base - 0.1, 4))
        self.assertEqual(D.utilidad_libre(p, lambda q: {"p": 1.0, "prioridad": "subir"})[0], base)
        self.assertEqual(D.utilidad_astraura(astraura(), lambda q: 1 / 0)[0], 0.9)  # Jev calla: manda la regla

    def test_utilidad_propuesta_por_su_via(self):
        self.assertEqual(D.via(propuesta(), existe), "codigo")
        self.assertEqual(D.utilidad_propuesta(propuesta(), existe), D.utilidad(propuesta(), existe))
        self.assertEqual(D.via(astraura(), existe), "astraura")
        self.assertEqual(D.via(libre(), existe), "entregable")
        self.assertEqual(D.via(libre(tipo="codigo"), existe), "codigo")  # código no accionable: se reimagina, no es un ensayo
        clave = astraura(titulo="Optimización ARM NEON para r2_credentials.local.json")
        self.assertEqual(clave["utilidad"], 0.0); self.assertIn("credenciales", clave["motivo"])
        self.assertEqual(libre(cuerpo=RICO + "\nHay que pagar la suscripción.")["utilidad"], 0.0)

    def test_importancia_que_declara_astraura(self):
        self.assertEqual(D.importancia(astraura(nivel="critical_security")), "critica")
        self.assertEqual(D.importancia(astraura(nivel="high")), "alta")
        self.assertEqual(D.importancia(astraura(nivel="medium")), "media")
        self.assertEqual(D.importancia(astraura(nivel="low")), "baja")
        self.assertEqual(D.importancia(dict(libre(), origen={"importance_level": "critical"})), "baja")  # solo la de Astraura

    def test_integra_lo_que_no_es_codigo_por_su_via(self):
        r = D.automatica(astraura(), ajustes(), existe)
        self.assertEqual(r["destino"], "aprobada"); self.assertIn("se aplica en Astraura", r["motivo"])
        r = D.automatica(libre(), ajustes(), existe)
        self.assertEqual(r["destino"], "aprobada"); self.assertIn("entregable", r["motivo"])
        self.assertEqual(D.automatica(libre(), ajustes(), existe, lambda q: {"p": 0.9, "veta": True})["destino"], "nueva")
        # sin «aprobar», lo que llega espera el visto bueno; el «automático» viejo no toca lo que no es código
        self.assertEqual(D.automatica(libre(), ajustes(aprobar=False), existe)["destino"], "esperando-aprobacion")
        viejo = ajustes(automatico=True, aprobar=False, reimaginar=False)
        for p in (libre(), astraura()):
            self.assertEqual(D.automatica(p, viejo, existe), dict(D.destino(p, True, existe), notas=""))

    def test_lo_que_no_llega_se_reimagina_salvo_astraura(self):
        r = D.automatica(libre("Una idea suelta."), ajustes(), existe)
        self.assertEqual(r["destino"], "reimaginando"); self.assertIn("Desarróllala", r["notas"])
        self.assertIn("referencias https", r["notas"]); self.assertNotIn("accionable por el enjambre", r["notas"])
        self.assertEqual(D.automatica(libre("Una idea suelta.", version=3), ajustes(), existe)["destino"], "nueva")
        floja = D.automatica(astraura(ESQUELETO), ajustes(), existe)
        self.assertEqual(floja["destino"], "nueva"); self.assertIn("Astraura", floja["motivo"])

    def test_alta_critica_y_lo_de_alex_nunca_solas(self):
        importantes = [astraura(nivel="critical_security"), astraura(nivel="high"), libre(importancia_declarada="alta"),
                       libre("Una idea suelta.", importancia_declarada="critica")]
        jevs = [None, lambda p: {"p": 1.0, "prioridad": "subir"}, lambda p: 1 / 0]
        for p in importantes:
            for auto, apr, rei, umbral, maximo, jev in itertools.product((True, False), (True, False), (True, False),
                                                                          (0.6, 0.75, 1.0), (0, 2, 10), jevs):
                r = D.automatica(p, ajustes(auto, apr, rei, umbral, maximo), existe, jev)
                self.assertNotIn(r["destino"], ("autodesarrollo", "aprobada", "reimaginando", "descartada"), p["id"])
        r = D.automatica(astraura(nivel="critical_security"), ajustes(), existe)
        self.assertEqual(r["destino"], "esperando-aprobacion"); self.assertIn("critical_security", r["motivo"])
        alex = D.automatica(astraura(titulo="Optimización para vercel.backup.json"), ajustes(), existe)
        self.assertEqual(alex["destino"], "pregunta"); self.assertIn("vercel", alex["motivo"])

    def test_astraura_ya_autorizada_no_espera_nada(self):
        viva = astraura(nivel="high", origen={"tipo": "rama", "id": "bgauth_1_athena", "requires_user_approval": False, "status": "running"},
                        titulo="⚡ [AUTORIZADO] ✅ Permiso Concedido: Mutación Sináptica")
        self.assertTrue(D.ya_autorizada_por_astraura(viva))
        r = D.automatica(viva, ajustes(), existe)
        self.assertEqual(r["destino"], "descartada"); self.assertIn("ya la autorizó", r["motivo"])
        self.assertFalse(D.ya_autorizada_por_astraura(astraura()))  # pide aprobación
        sin_clave = astraura(); sin_clave["origen"].pop("requires_user_approval")
        self.assertFalse(D.ya_autorizada_por_astraura(sin_clave))
        self.assertEqual(D.automatica(viva, ajustes(automatico=False, aprobar=False, reimaginar=False), existe)["destino"], "esperando-aprobacion")

    def test_duplicadas_se_queda_la_mas_reciente(self):
        a = astraura(origen={"id": "creation_1792891927"}, estado="pregunta")
        b = astraura(origen={"id": "creation_1792892530"}, estado="pregunta", titulo="esquema de agente mutado — hephaestus neon!")
        c = astraura(origen={"id": "creation_1792890000"}, estado="aprobada")  # decidida: no cuenta
        otra_fuente = dict(libre(), titulo=a["titulo"], estado="nueva")
        otro_ambito = dict(libre(), id="agentes:b", titulo=a["titulo"], estado="nueva", ambito="personal")
        dir1 = {"id": "directores:T1", "fuente": "directores", "titulo": "X", "estado": "pregunta"}
        dir2 = {"id": "directores:T2", "fuente": "directores", "titulo": "X", "estado": "pregunta"}
        fuera = D.duplicadas([a, b, c, otra_fuente, otro_ambito, dir1, dir2])
        self.assertEqual([(p["id"], queda) for p, queda in fuera], [(a["id"], b["id"])])
        hoy = dict(libre(), id="agentes:z--1", estado="nueva", origen={"fecha": "2026-10-25"})
        ayer = dict(libre(), id="agentes:z--9", estado="pregunta", origen={"fecha": "2026-10-24"})
        self.assertEqual([(p["id"], q) for p, q in D.duplicadas([hoy, ayer])], [(ayer["id"], hoy["id"])])

    def test_orden_por_importancia_y_luego_lo_mas_reciente(self):
        vieja = dict(libre(), id="agentes:x--1", origen={"fecha": "2026-10-20"})
        nueva = dict(libre(), id="agentes:x--2", origen={"fecha": "2026-10-25"})
        media = dict(libre(), id="agentes:x--0", origen={"fecha": "2026-10-01"}, importancia_declarada="media")
        self.assertEqual([p["id"] for p in D.orden_reimaginar([vieja, nueva, media])], ["agentes:x--0", "agentes:x--2", "agentes:x--1"])

    def test_la_firma_lleva_la_version_de_las_reglas(self):
        self.assertTrue(D.firma(ajustes()).startswith(D.REGLAS + "|"))
        self.assertNotEqual(D.firma(ajustes()), "1|1|1|0,75|2")  # la de la Ola 1024I: lo firmado con ella se revisa


class FamiliaYVariantesTest(unittest.TestCase):
    """Ola 1028I · IMG1028B: la misma idea repetida por archivo se decide una sola vez."""
    TITULOS = [
        "Optimización ARM NEON para Dockerfile", "Optimización ARM NEON para IDEA.md",
        "Optimización ARM NEON para setup_autostart.sh", "Optimización ARM NEON para tunnel_monitor.sh",
        "Optimización ARM NEON para tunnel_watchdog.sh", "Optimización ARM NEON para install_and_run.sh",
    ]

    def test_familia_sin_el_archivo_final(self):
        familias = {D.familia({"titulo": t}) for t in self.TITULOS}
        self.assertEqual(familias, {"optimizacion arm neon para"})
        self.assertNotEqual(D.familia({"titulo": self.TITULOS[0]}),
                            D.familia({"titulo": "Optimización de memoria ARM para Dockerfile"}))

    def test_agrupa_la_misma_fuente_y_familia_y_nada_mas(self):
        a = {"id": "a", "fuente": "astraura", "titulo": self.TITULOS[0], "estado": "esperando-aprobacion"}
        b = {"id": "b", "fuente": "astraura", "titulo": self.TITULOS[1], "estado": "pregunta"}
        otra_fuente = {"id": "c", "fuente": "diaria", "titulo": self.TITULOS[2], "estado": "nueva"}
        otra_familia = {"id": "d", "fuente": "astraura", "titulo": "Arreglar otra cosa", "estado": "nueva"}
        self.assertEqual([(p["id"], prim["id"]) for p, prim in D.agrupar([a, b, otra_fuente, otra_familia])],
                         [("b", "a")])

    def test_una_descartada_nunca_lleva_un_motivo_de_pregunta(self):
        vieja = {"id": "x", "fuente": "astraura", "titulo": "X", "estado": "descartada",
                 "motivo": "ninguno de los archivos citados existe hoy → pregunta"}
        vieja.update(D.arreglo_de_estado(vieja))
        self.assertEqual(vieja["estado"], "pregunta")
        duplicada = dict(vieja, estado="descartada", motivo="sin verbo de acción → pregunta",
                         duplicada_de="astraura:b")
        duplicada.update(D.arreglo_de_estado(duplicada))
        self.assertEqual((duplicada["estado"], duplicada["motivo"]), ("descartada", "duplicada de astraura:b"))

    def test_la_descartada_con_motivo_propio_ya_dicho_no_se_toca(self):
        """Rescate de IMG1028B: lo que ya dice por qué, no se reescribe ni vuelve a «pregunta»."""
        self.assertEqual(D.arreglo_de_estado({}), {})
        self.assertEqual(D.arreglo_de_estado({"estado": "descartada", "motivo": "duplicada de x7"}), {})
        con_destino = {"id": "x", "estado": "descartada",
                       "motivo": "ninguno de los archivos citados existe hoy → pregunta",
                       "motivo_destino": "sin verbo de acción: lo decide Alex"}
        self.assertEqual(D.arreglo_de_estado(con_destino),
                         {"motivo": "sin verbo de acción: lo decide Alex"})
        self.assertEqual(con_destino["estado"], "descartada")  # el estado no se cambia, solo el motivo

    def test_tope_de_20_variantes_y_nada_se_borra(self):
        """Rescate de IMG1028B: 23 variantes de la misma familia; se anotan las MAX_VARIANTES primeras
        y TODAS quedan «agrupada» (nada se borra ni se suelta, aunque no quepa la anotación)."""
        iso = "2026-10-28T12:00:00"
        ps = [{"id": "a%d" % i, "fuente": "astraura", "ambito": "metagenesis", "estado": "esperando-aprobacion",
               "titulo": "Optimización ARM NEON para modulo_%d.sh" % i, "archivos": ["modulo_%d.sh" % i]}
              for i in range(23)]
        self.assertEqual(len(D.agrupar(ps)), 22)
        self.assertEqual(DIR._agrupar_familias(ps, iso), 22)
        prim = ps[0]  # la primera es la primaria (así lo definen hoy las reglas)
        self.assertEqual(prim["n_variantes"], D.MAX_VARIANTES)
        self.assertEqual({v["id"] for v in prim["variantes"]}, {"a%d" % i for i in range(1, 1 + D.MAX_VARIANTES)})
        self.assertEqual(set(prim["variantes"][0]), {"id", "titulo", "archivos"})
        self.assertTrue(all(p["estado"] == "agrupada" for p in ps[1:]), [p["id"] for p in ps[1:]])


class TokenSoloComoCredencial(unittest.TestCase):
    """Ola 1025S: «token» a secas marcaba «de Alex» una tarea de seguridad del sueño diario («quitar ese
    token» del sandbox del iframe). Solo cuenta como credencial con su contexto."""

    def test_token_que_no_es_credencial(self):
        for t in ("Endurecer el sandbox: quitar ese token allow-popups", "Reducir los tokens del modelo por turno"):
            self.assertEqual(D.es_de_alex({"titulo": t, "cuerpo": ""}), "", t)

    def test_token_que_si_es_credencial(self):
        for t in ("Rotar el token de acceso de GitHub", "Mover GITHUB_TOKEN al servidor", "Usar un API token nuevo",
                  "Cabecera Bearer en la sonda", "Guardar la clave en el entorno", "r2_credentials.local.json"):
            self.assertTrue(D.es_de_alex({"titulo": t, "cuerpo": ""}), t)


if __name__ == "__main__":
    unittest.main()
