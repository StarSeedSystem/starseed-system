#!/usr/bin/env python3
"""Pruebas de autodesarrollo_fuentes (sin red ni disco)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autodesarrollo_fuentes as F
DIARIA = """# Imaginación diaria
## Riesgos
1. **Añadir tiempo límite al fetch** — `src/lib/feed/a.ts:40` · impacto 4 · esfuerzo 1.
## Recomendaciones para las próximas olas
1. **Unificar los clientes de voz** — tocar `src/lib/voz/cliente.ts` e `src/lib/voz/otro.ts`.
2. **Estado del enjambre** — load average 15.67, sin novedad.
## Ideas nuevas
1. **Convertir el árbol en grafo** — sin más.
"""
TOP = {"top": [
    {"titulo": "Añadir límite", "archivo": "src/lib/x.ts", "linea": 12, "impacto": 4,
     "esfuerzo": 2, "confianza": 0.9, "verificacion": "verificado", "detalle": "detalle",
     "propuesta": {"archivos": ["src/lib/x.ts"]}},
    {"titulo": "Cita explícita", "cita": "src/lib/y.ts:7", "impacto": "3", "esfuerzo": "2",
     "confianza": 0.7, "verificacion": "ajustado"},
    {"titulo": "Ya encargada", "ya_encargada": True},
    {"titulo": "No accionable", "accionable": False},
]}
ASTRAURA = {
    "creations": [
        {"id": "c1", "title": "Creación pendiente", "content": "contenido", "importance_level": "high",
         "requires_user_approval": True, "status": "pending_approval"},
        {"id": "c2", "title": "Ya aplicada", "status": "applied"},
    ],
    "branches": [
        {"id": "b1", "theme": "Rama viva", "hypothesis": "hipótesis", "importance_level": "low",
         "requires_user_approval": True, "status": "pending_approval",
         "verification": {"is_verified": True}},
        {"id": "b2", "theme": "Descartada", "status": "discarded"},
        {"id": "b3", "theme": "Aplicada por Alex", "status": "pending_approval", "applied_by": "alex"},
    ],
}
REVISOR = {"necesitan_alex": {
    "T1": {"titulo": "Elegir destino", "pregunta": "¿A qué nube?", "motivo": "hay dos",
           "opciones": ["A", "B"], "desde": "2026-10-21"},
    "T2": {"pregunta": "¿Publicamos ya?"},
}}

class Diaria(unittest.TestCase):
    def test_normaliza_y_lee_todas_las_secciones(self):
        p = F.de_diaria(DIARIA, "2026-10-21")
        self.assertEqual([x["titulo"] for x in p],
                         ["Añadir tiempo límite al fetch", "Unificar los clientes de voz",
                          "Convertir el árbol en grafo"])
        self.assertEqual(set(p[0]), {"id", "fuente", "titulo", "cuerpo", "archivos", "cita",
                                     "verificacion", "impacto", "esfuerzo", "origen"})
        self.assertEqual(p[0]["fuente"], "diaria")
        self.assertEqual(p[0]["archivos"], ["src/lib/feed/a.ts"])
        self.assertEqual(p[0]["cita"], "src/lib/feed/a.ts:40")
        self.assertEqual((p[0]["impacto"], p[0]["esfuerzo"]), (4, 1))
        self.assertEqual(p[0]["verificacion"], "sin_verificar")
        self.assertEqual(p[0]["origen"]["seccion"], "riesgos")
    def test_id_estable_y_quita_lo_encargado(self):
        a = F.de_diaria(DIARIA, "2026-10-21")
        b = F.de_diaria(DIARIA, "2026-11-01")
        self.assertEqual([x["id"] for x in a], [x["id"] for x in b])
        clave = F.D.clave("Añadir tiempo límite al fetch")
        quedan = F.de_diaria(DIARIA, "2026-10-21", ya_encargadas=[clave])
        self.assertNotIn("diaria:%s" % clave, [x["id"] for x in quedan])
    def test_informe_vacio(self):
        self.assertEqual(F.de_diaria("", "2026-10-21"), [])
        self.assertEqual(F.de_diaria(None, "2026-10-21"), [])

class Profunda(unittest.TestCase):
    def test_toma_top_con_cita_y_confianza(self):
        p = F.de_profunda(TOP, "2026-10-21")
        self.assertEqual([x["titulo"] for x in p], ["Añadir límite", "Cita explícita"])
        self.assertEqual(p[0]["cita"], "src/lib/x.ts:12")
        self.assertEqual(p[0]["verificacion"], "verificado")
        self.assertEqual(p[0]["origen"]["confianza"], 0.9)
        self.assertEqual(p[1]["cita"], "src/lib/y.ts:7")
        self.assertEqual(p[1]["archivos"], ["src/lib/y.ts"])
        self.assertEqual((p[1]["impacto"], p[1]["esfuerzo"]), (3, 2))
    def test_acepta_lista_y_quita_encargadas(self):
        self.assertEqual(len(F.de_profunda(TOP["top"], "2026-10-21")), 2)
        clave = F.D.clave("Añadir límite")
        self.assertEqual([x["titulo"] for x in F.de_profunda(TOP, "2026-10-21", [clave])],
                         ["Cita explícita"])
        self.assertEqual(F.de_profunda(None, "2026-10-21"), [])

class Astraura(unittest.TestCase):
    def test_solo_no_aplicadas_y_normaliza(self):
        p = F.de_astraura(ASTRAURA, "2026-10-21")
        self.assertEqual([x["id"] for x in p], ["astraura:c1", "astraura:b1"])
        self.assertEqual(p[0]["fuente"], "astraura")
        self.assertEqual(p[0]["impacto"], 4)
        self.assertTrue(p[0]["origen"]["requires_user_approval"])
        self.assertEqual(p[1]["cita"], "astraura:rama/b1")
        self.assertEqual(p[1]["verificacion"], "verificado")
        self.assertEqual(p[1]["origen"]["tipo"], "rama")
    def test_estado_vacio_y_encargadas(self):
        self.assertEqual(F.de_astraura(None), [])
        self.assertEqual(F.de_astraura({"creations": "no es lista"}), [])
        self.assertEqual([x["id"] for x in F.de_astraura(ASTRAURA, ya_encargadas=["c1"])],
                         ["astraura:b1"])

class AstrauraAutorizada(unittest.TestCase):
    """Ola 1025S: lo que el orquestador de Astraura ya autorizó y ejecuta no es una propuesta para Alex."""
    def test_solo_lo_que_pide_aprobacion(self):
        status = {"branches": [
            {"id": "bgauth_1_athena", "theme": "⚡ [AUTORIZADO] Permiso Concedido", "requires_user_approval": False, "status": "running"},
            {"id": "b2", "theme": "Pendiente sin clave", "status": "running"},
            {"id": "b3", "theme": "Pendiente explícita", "requires_user_approval": False, "status": "pending_approval"},
        ]}
        self.assertEqual([x["id"] for x in F.de_astraura(status)], ["astraura:b2", "astraura:b3"])
        self.assertTrue(F.no_pide_aprobacion(status["branches"][0]))
        self.assertFalse(F.no_pide_aprobacion(status["branches"][1]))

class Directores(unittest.TestCase):
    def test_preguntas_a_alex(self):
        p = F.de_directores(REVISOR, "2026-10-21")
        self.assertEqual([x["id"] for x in p], ["directores:T1", "directores:T2"])
        self.assertEqual(p[0]["titulo"], "Elegir destino")
        self.assertIn("Opciones: A · B", p[0]["cuerpo"])
        self.assertEqual(p[0]["origen"]["opciones"], ["A", "B"])
        self.assertEqual(p[1]["titulo"], "¿Publicamos ya?")
        self.assertEqual(p[0]["archivos"], [])
    def test_vacio_y_encargadas(self):
        self.assertEqual(F.de_directores(None), [])
        self.assertEqual(F.de_directores({"necesitan_alex": {"T1": {}}}, ya_encargadas=["T1"]), [])


class Agentes(unittest.TestCase):
    """Fuente «agentes» (Ola 1024I · IMG1024C): propuestas libres de los agentes imaginativos."""
    LIBRE = {"referencias-diseno-2026-10-24.json": [
        {"id": "Paleta Solar", "tipo": "Diseño", "ambito": "Página:Cafe-1", "titulo": "Mejorar la paleta solarpunk",
         "cuerpo": "Ver https://x.com/datos.json y `src/styles/tokens.css`.", "importancia": "Crítica",
         "referencias": ["https://dribbble.com/x", {"titulo": "inseguro", "url": "http://a.b"},
                         {"url": "https://dribbble.com/x"}, {"titulo": "con espacio", "url": "https://a b"}],
         "verificacion": "sin_verificar", "impacto": 4, "esfuerzo": 2, "utilidad": 3},
        {"titulo": ""}, "no es un objeto", {"cuerpo": "sin título"},
        {"titulo": "Arreglar el lector", "archivos": ["/etc/passwd", "../fuera.ts", "~/x.ts", "C:/win.ts",
                                                       "./src/lib/a.ts", "src/lib/a.ts", "https://x.y/z.ts"]},
    ]}

    def test_normaliza_formato_libre(self):
        p = F.de_agentes(self.LIBRE, "2026-10-24")
        self.assertEqual(len(p), 2)
        a = p[0]
        self.assertEqual(a["id"], "agentes:referencias-diseno--paleta-solar")
        self.assertEqual((a["fuente"], a["agente"], a["tipo"], a["ambito"]), ("agentes", "referencias-diseno", "diseno", "pagina:Cafe-1"))
        self.assertEqual(a["referencias"], [{"titulo": "dribbble.com/x", "url": "https://dribbble.com/x"}])
        self.assertEqual(a["archivos"], ["src/styles/tokens.css"])  # del texto, sin la URL
        self.assertEqual(a["importancia_declarada"], "critica")
        self.assertEqual(a["verificacion"], "sin verificar")
        self.assertEqual((a["impacto"], a["esfuerzo"], a["version"]), (4, 2, 1))
        self.assertEqual(a["origen"]["utilidad_agente"], 1.0)
        self.assertEqual(p[1]["archivos"], ["src/lib/a.ts"])
        self.assertEqual((p[1]["tipo"], p[1]["ambito"], p[1]["verificacion"]), ("codigo", "metagenesis", "sin dato"))

    def test_topes_del_contrato(self):
        refs = ["https://r.org/%d" % i for i in range(30)]
        p = F.de_agentes({"a.json": [{"titulo": "t" * 300, "cuerpo": "c" * 9000, "referencias": refs,
                                      "archivos": ["src/%d.ts" % i for i in range(30)]}]})[0]
        self.assertEqual((len(p["titulo"]), len(p["cuerpo"]), len(p["referencias"]), len(p["archivos"])), (200, 8000, 20, 20))

    def test_tipos_y_ambitos(self):
        self.assertEqual([F.tipo(t) for t in ("Código", "investigación", "contenido", "otro", "raro", None)],
                         ["codigo", "investigacion", "contenido", "otro", "codigo", "codigo"])
        self.assertEqual([F.ambito(a) for a in ("personal", "grupo:G-1", "grupo:", "pagina:a b", "raro", None)],
                         ["personal", "grupo:G-1", "metagenesis", "metagenesis", "metagenesis", "metagenesis"])

    def test_forma_dict_ids_estables_y_no_repite(self):
        d = {"x-2026-10-24.json": {"agente": "Vigía", "propuestas": [{"titulo": "Añadir caché"}, {"titulo": "Añadir caché"}]}}
        a, b = F.de_agentes(d, "2026-10-24"), F.de_agentes(d, "2026-11-01")
        self.assertEqual([x["id"] for x in a], ["agentes:vigia--anadir-cache"])
        self.assertEqual([x["id"] for x in a], [x["id"] for x in b])
        self.assertEqual(F.de_agentes(d, ya_encargadas=["vigia--anadir-cache"]), [])
        self.assertEqual(F.de_agentes({"y.json": {"titulo": "Suelta"}})[0]["agente"], "y")
        self.assertEqual(F.de_agentes(None), [])
        self.assertEqual(F.de_agentes({"z.json": None, "w.json": "texto"}), [])

    def test_reimaginada_toma_la_primera_y_su_cadena(self):
        nombre = "reimaginada-diaria-x-v1.json"
        d = {nombre: [{"titulo": ""}, {"titulo": "Versión nueva", "version_de": "otra"}, {"titulo": "Segunda"}]}
        p = F.de_agentes(d, esperadas={nombre: {"id": "diaria:x", "version": 1}})
        self.assertEqual(len(p), 1)
        self.assertEqual((p[0]["titulo"], p[0]["version_de"], p[0]["version"], p[0]["agente"]),
                         ("Versión nueva", "diaria:x", 2, "reimaginacion"))
        self.assertEqual(p[0]["id"], "agentes:reimaginada-diaria-x-v1")
        sin_esperar = F.de_agentes(d)[0]
        self.assertEqual((sin_esperar["version_de"], sin_esperar["version"]), ("otra", 1))
        self.assertEqual(F.de_agentes(d, ya_encargadas=["reimaginada-diaria-x-v1"]), [])

    def test_un_entregable_no_es_una_propuesta(self):
        d = {"entregable-agentes-x-abc123-v1.json": {"propuestas": [{"titulo": "Guía terminada", "cuerpo": "…"}]},
             "vigia.json": [{"titulo": "Añadir caché"}]}
        self.assertEqual([x["id"] for x in F.de_agentes(d)], ["agentes:vigia--anadir-cache"])

    def test_id_seguro_sin_choques(self):
        largo = "diaria:" + "añadir tiempo límite " * 6
        a, b = F.id_seguro(largo, 40), F.id_seguro(largo + "!", 40)
        self.assertLessEqual(len(a), 40)
        self.assertNotEqual(a, b)
        self.assertRegex(a, r"^[a-z0-9-]+$")
        self.assertEqual(F.id_seguro("diaria:Añadir caché"), "diaria-anadir-cache")


if __name__ == "__main__":
    unittest.main()
