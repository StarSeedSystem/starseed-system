#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de director_autodesarrollo (IMN1021Db): sin red, carpetas temporales, lanzadores inyectados."""
import json, os, sys, tempfile, unittest
from datetime import datetime, timedelta
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import director_autodesarrollo as D

NOCHE = datetime(2026, 10, 23, 3, 0)
CAP = {"huecos_mac": 2, "huecos_a1": 0, "huecos_nube": 0, "proveedores_con_cupo": 2, "presion_mac": 0}
MD = "## Mejoras detectadas\n1. **Arreglar el lector** — corregir el error de lectura en `scripts/puente/suenos.py:10`, impacto 3 esfuerzo 1\n"


class DirectorTest(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory(); self.home = os.path.join(self.t.name, "h"); self.raiz = os.path.join(self.t.name, "r")
        os.makedirs(self.home); os.makedirs(self.raiz)
        self.llamadas = []

    def tearDown(self):
        self.t.cleanup()

    def correr(self, **kw):
        args = dict(ahora=NOCHE, capacidad=CAP, home=self.home, raiz=self.raiz, existe_ruta=lambda r: True,
                    lanzador_diario=lambda: self.llamadas.append("diaria") or True,
                    lanzador_profundo=lambda *a: self.llamadas.append(a) or True,
                    agente_referencias=lambda raiz, ahora: None,  # sin el agente real (red) en las pruebas
                    datos={"diaria": MD, "profunda": {}, "astraura": {}, "directores": {}})
        args.update(kw); return D.ciclo(**args)

    def leer(self, *ruta):
        return json.load(open(os.path.join(*ruta), encoding="utf-8"))

    def test_seco_no_lanza_ni_escribe(self):
        r = self.correr(seco=True)
        self.assertTrue(r["toca_ejecutar"]); self.assertEqual(self.llamadas, [])
        self.assertFalse(os.path.exists(os.path.join(self.raiz, "starseed_memory_root")))

    def test_lanza_diaria_y_profunda_una_vez(self):
        r = self.correr(); self.assertEqual(r["lanzado"], ["diaria", "profunda"])
        self.correr(); self.assertEqual(self.llamadas.count("diaria"), 1)  # no repite el mismo día
        self.assertEqual(self.llamadas.count(("lanzar",)), 1)
        self.correr(); self.assertIn(("consolidar", "--sin-telegram"), self.llamadas)

    def test_sin_capacidad_en_inteligente_no_ejecuta(self):
        r = self.correr(capacidad=None); self.assertFalse(r["toca_ejecutar"]); self.assertIn("sin dato", r["motivo_toca"])
        self.assertEqual(self.llamadas, [])

    def test_escribe_cola_y_propuestas_y_no_repite(self):
        r = self.correr(); self.assertEqual(r["autodesarrolladas"], 1)
        cola = self.leer(self.raiz, "starseed_memory_root", "olas", r["cola"])
        self.assertTrue(cola[0]["prompt"].startswith("Comprueba si sigue haciendo falta; si ya está hecho, responde NO APLICA"))
        self.assertLessEqual(len(cola[0]["archivos"]), 3)
        props = self.leer(self.raiz, "starseed_memory_root", "imaginacion", "propuestas.json")["propuestas"]
        self.assertEqual(props[0]["estado"], "encargada")
        self.assertTrue(os.path.isfile(os.path.join(self.home, "dream-encargado.json")))
        self.assertEqual(self.correr(ahora=datetime(2026, 10, 23, 3, 15))["autodesarrolladas"], 0)

    def test_conserva_estado_de_alex_y_encarga_lo_aprobado(self):
        self.correr(capacidad=None)  # registra la propuesta sin encargarla
        ruta = os.path.join(self.raiz, "starseed_memory_root", "imaginacion", "propuestas.json")
        d = self.leer(ruta); d["propuestas"][0]["estado"] = "aprobada"; d["propuestas"][0]["aprobacion_diff"] = True
        json.dump(d, open(ruta, "w", encoding="utf-8"))
        r = self.correr(); cola = self.leer(self.raiz, "starseed_memory_root", "olas", r["cola"])
        self.assertTrue(cola[0]["aprobacion"])

    def test_automatico_apagado_todo_espera_y_avisa(self):
        json.dump({"automatico": False}, open(os.path.join(self.home, "autodesarrollo.json"), "w"))
        avisos = []; r = self.correr(avisar=lambda t, tg: avisos.append((t, tg)))
        self.assertEqual(r["autodesarrolladas"], 0); self.assertEqual(r["esperando_aprobacion"], 1)
        self.assertTrue(avisos[0][1])

    def test_cerrojo_ocupado(self):
        with D.cerrojo(os.path.join(self.home, "cerrojos", "autodesarrollo.lock")) as uno:
            self.assertTrue(uno); r = self.correr()
        self.assertEqual(r["motivo_toca"], "otro ciclo en marcha")

    def test_medir_capacidad_sin_dato(self):
        self.assertIsNone(D.medir_capacidad(self.home))
        json.dump({"maximo": 3, "presion": 1}, open(os.path.join(self.home, "gobernador.json"), "w"))
        json.dump({"nim": {}, "xkiro": {"caido": True}}, open(os.path.join(self.home, "salud-proveedores.json"), "w"))
        self.assertEqual(D.medir_capacidad(self.home), {"huecos_mac": 3, "huecos_a1": 0, "huecos_nube": 0, "proveedores_con_cupo": 1, "presion_mac": 1})


class Imaginacion1024Test(unittest.TestCase):
    """Ola 1024I · IMG1024C: fuente «agentes», automático, reimaginación y agente de referencias."""
    EXISTEN = {"src/lib/a.ts", "src/lib/b.ts", "src/lib/c.ts", "src/lib/d.ts", "src/lib/nucleo/x.ts"}

    def setUp(self):
        self.t = tempfile.TemporaryDirectory(); self.home = os.path.join(self.t.name, "h"); self.raiz = os.path.join(self.t.name, "r")
        self.mem = os.path.join(self.raiz, "starseed_memory_root"); os.makedirs(self.home); os.makedirs(self.raiz)
        self.referencias = []

    def tearDown(self):
        self.t.cleanup()

    def ajustes(self, **auto):
        d = {"aprobar": True, "reimaginar": True, "umbral": 0.75, "max_reimaginaciones": 1}; d.update(auto)
        json.dump({"auto": d}, open(os.path.join(self.home, "autodesarrollo.json"), "w"))

    def agentes(self, nombre, contenido):
        carpeta = os.path.join(self.mem, "imaginacion", "agentes"); os.makedirs(carpeta, exist_ok=True)
        json.dump(contenido, open(os.path.join(carpeta, nombre), "w", encoding="utf-8"), ensure_ascii=False)

    def correr(self, **kw):
        args = dict(ahora=NOCHE, capacidad=CAP, home=self.home, raiz=self.raiz, existe_ruta=lambda r: r in self.EXISTEN,
                    lanzador_diario=lambda: True, lanzador_profundo=lambda *a: True,
                    agente_referencias=lambda raiz, ahora: self.referencias.append((raiz, ahora)) or {"ok": True},
                    datos={"diaria": "", "profunda": {}, "astraura": {}, "directores": {}})
        args.update(kw); return D.ciclo(**args)

    def props(self):
        return {p["id"]: p for p in json.load(open(os.path.join(self.mem, "imaginacion", "propuestas.json"), encoding="utf-8"))["propuestas"]}

    def test_recoge_las_propuestas_libres_y_la_fuente_se_apaga(self):
        self.agentes("referencias-diseno.json", [{"titulo": "Mejorar la paleta", "tipo": "diseño", "cuerpo": "Libre",
                                                   "referencias": ["https://ref.org"], "archivos": ["src/lib/a.ts"]}])
        self.correr(); p = self.props()["agentes:referencias-diseno--mejorar-la-paleta"]
        self.assertEqual((p["fuente"], p["agente"], p["tipo"], p["referencias"][0]["url"]), ("agentes", "referencias-diseno", "diseno", "https://ref.org"))
        self.assertEqual(self.correr()["propuestas"], 1)  # no se repite
        json.dump({"fuentes": {"agentes": False}}, open(os.path.join(self.home, "autodesarrollo.json"), "w"))
        os.remove(os.path.join(self.mem, "imaginacion", "propuestas.json"))
        self.assertEqual(self.correr()["propuestas"], 0)

    def test_integra_lo_que_llega_reimagina_lo_que_no_y_cierra_la_cadena(self):
        self.ajustes()
        self.agentes("vigia.json", [{"titulo": "Arreglar el lector", "archivos": ["src/lib/a.ts"], "verificacion": "verificado"},
                                    {"titulo": "Mejorar la caché", "archivos": ["src/lib/a.ts", "src/fantasma.ts"]}])
        r = self.correr()
        self.assertEqual(r["autodesarrolladas"], 1)
        self.assertEqual(r["reimaginaciones_encargadas"], 1)
        self.assertEqual(r["cola_reimaginar"], "cola-suenos-reimaginar-2026-10-23.json")
        props = self.props(); vieja = props["agentes:vigia--mejorar-la-cache"]
        self.assertEqual(props["agentes:vigia--arreglar-el-lector"]["estado"], "encargada")
        self.assertEqual((vieja["estado"], vieja["reimaginacion"]["por"]), ("reimaginando", "automatica"))
        self.assertIn("src/fantasma.ts", vieja["reimaginacion"]["notas"])
        cola = json.load(open(os.path.join(self.mem, "olas", r["cola_reimaginar"]), encoding="utf-8"))
        self.assertEqual((cola[0]["tipo"], cola[0]["modo"], cola[0]["salida"]), ("analisis", "reimaginar", vieja["reimaginacion"]["salida"]))
        self.assertEqual(self.correr(ahora=NOCHE.replace(minute=15))["reimaginaciones_encargadas"], 0)  # ya encargada
        # llega la versión nueva (formato libre, sin version_de: la pone el director)
        json.dump([{"titulo": "Mejorar la caché del lector", "archivos": ["src/lib/a.ts"]}],
                  open(os.path.join(self.raiz, vieja["reimaginacion"]["salida"]), "w", encoding="utf-8"))
        self.correr(ahora=NOCHE.replace(minute=30)); props = self.props()
        nueva = next(p for p in props.values() if p.get("version_de") == vieja["id"])
        self.assertEqual(props[vieja["id"]]["estado"], "reimaginada")
        self.assertEqual(nueva["version"], 2)
        self.assertEqual(nueva["estado"], "nueva")  # 0,6 < 0,75 y la cadena ya gastó su reimaginación
        self.assertIn("sin reimaginaciones libres", nueva["motivo_destino"])

    def test_alta_y_critica_nunca_se_integran_solas_en_el_director(self):
        self.ajustes(umbral=0.6, max_reimaginaciones=5)
        self.agentes("a.json", [{"titulo": "Arreglar todo", "archivos": ["src/lib/a.ts", "src/lib/b.ts", "src/lib/c.ts", "src/lib/d.ts"], "verificacion": "verificado"},
                                {"titulo": "Arreglar el núcleo", "archivos": ["src/lib/nucleo/x.ts"], "verificacion": "verificado"},
                                {"titulo": "Arreglar poco", "archivos": ["src/lib/a.ts"], "verificacion": "verificado", "importancia": "alta"}])
        r = self.correr(consejo=lambda p: {"p": 1.0, "prioridad": "subir"})
        self.assertEqual((r["autodesarrolladas"], r["reimaginaciones_encargadas"], r["esperando_aprobacion"]), (0, 0, 3))
        props = self.props()
        self.assertEqual(props["agentes:a--arreglar-el-nucleo"]["importancia"], "crítica")  # como lo lee Genesis
        self.assertTrue(props["agentes:a--arreglar-el-nucleo"]["aprobacion_diff"])
        self.assertFalse(os.path.isdir(os.path.join(self.mem, "olas")))

    def test_jev_veta_y_no_se_le_vuelve_a_preguntar(self):
        self.ajustes(); preguntas = []
        self.agentes("a.json", [{"titulo": "Arreglar el lector", "archivos": ["src/lib/a.ts"], "verificacion": "verificado"}])
        veto = lambda p: preguntas.append(p["id"]) or {"p": 0.9, "veta": True}
        self.assertEqual(self.correr(consejo=veto)["autodesarrolladas"], 0)
        self.assertEqual(self.props()["agentes:a--arreglar-el-lector"]["estado"], "nueva")
        self.correr(consejo=veto, ahora=NOCHE.replace(minute=15))
        self.assertEqual(len(preguntas), 1)

    def test_encender_el_boton_decide_lo_que_esperaba(self):
        json.dump({"automatico": False}, open(os.path.join(self.home, "autodesarrollo.json"), "w"))
        self.agentes("a.json", [{"titulo": "Arreglar el lector", "archivos": ["src/lib/a.ts"], "verificacion": "verificado"}])
        self.assertEqual(self.correr()["esperando_aprobacion"], 1)
        json.dump({"automatico": False, "auto": {"aprobar": True}}, open(os.path.join(self.home, "autodesarrollo.json"), "w"))
        r = self.correr(ahora=NOCHE.replace(minute=15))
        self.assertEqual((r["autodesarrolladas"], r["esperando_aprobacion"]), (1, 0))

    def test_lo_que_pide_alex_se_encarga_aunque_el_tope_sea_cero(self):
        self.ajustes(max_reimaginaciones=0)
        os.makedirs(os.path.join(self.mem, "imaginacion"))
        lista = [{"id": "diaria:x", "fuente": "diaria", "titulo": "X", "estado": "reimaginando", "version": 4,
                  "reimaginacion": {"notas": "más corta", "referencias": [], "pedida": NOCHE.isoformat(), "por": "alex"}},
                 {"id": "diaria:y", "fuente": "diaria", "titulo": "Y", "estado": "reimaginando", "version": 2,
                  "reimaginacion": {"notas": "", "por": "automatica", "antes": "pregunta"}}]
        json.dump(lista, open(os.path.join(self.mem, "imaginacion", "propuestas.json"), "w"))  # forma de lista
        r = self.correr()
        self.assertEqual(r["reimaginaciones_encargadas"], 1)
        guardado = json.load(open(os.path.join(self.mem, "imaginacion", "propuestas.json"), encoding="utf-8"))
        self.assertIsInstance(guardado, list)  # se respeta la forma que había
        por_id = {p["id"]: p for p in guardado}
        self.assertRegex(por_id["diaria:x"]["reimaginacion"]["tarea"], r"^RIM-diaria-x-[0-9a-f]{6}-v5$")
        self.assertEqual(por_id["diaria:y"]["estado"], "pregunta")

    def test_reimaginacion_que_no_llega_vuelve_a_la_lista(self):
        os.makedirs(os.path.join(self.mem, "imaginacion"))
        hace = (NOCHE - timedelta(days=4)).isoformat()
        p = {"id": "diaria:x", "fuente": "diaria", "titulo": "X", "estado": "reimaginando",
             "reimaginacion": {"por": "alex", "antes": "esperando-aprobacion", "tarea": "RIM-x", "encolada": hace,
                               "salida": "starseed_memory_root/imaginacion/agentes/reimaginada-diaria-x-v1.json"}}
        json.dump({"propuestas": [p]}, open(os.path.join(self.mem, "imaginacion", "propuestas.json"), "w"))
        self.correr()
        q = self.props()["diaria:x"]
        self.assertEqual(q["estado"], "esperando-aprobacion")
        self.assertIn("no llegó", q["motivo_destino"])

    def test_sin_capacidad_no_encarga_reimaginaciones(self):
        self.ajustes()
        self.agentes("a.json", [{"titulo": "Mejorar la caché", "archivos": ["src/lib/a.ts"]}])
        r = self.correr(capacidad=None)
        self.assertEqual((r["reimaginando"], r["reimaginaciones_encargadas"]), (1, 0))
        self.assertNotIn("tarea", self.props()["agentes:a--mejorar-la-cache"]["reimaginacion"])

    def test_agente_de_referencias_solo_cuando_toca_imaginar(self):
        r = self.correr()
        self.assertEqual(self.referencias, [(self.raiz, NOCHE)])
        self.assertIn("referencias-diseno", r["lanzado"])
        self.correr(seco=True); self.correr(capacidad=None)
        self.assertEqual(len(self.referencias), 1)
        r = self.correr(agente_referencias=lambda raiz, ahora: 1 / 0, ahora=NOCHE.replace(minute=15))
        self.assertIn("referencias-diseno", r["lanzado"])  # su fallo no tumba el ciclo

    def test_modulo_del_agente_protegido(self):
        import types
        llamadas, previo = [], sys.modules.get("agente_referencias_diseno")
        try:
            sys.modules["agente_referencias_diseno"] = None  # no existe: import falla → nada
            self.assertIsNone(D._agente_referencias(self.raiz, NOCHE))
            m = types.ModuleType("agente_referencias_diseno"); sys.modules["agente_referencias_diseno"] = m
            self.assertIsNone(D._agente_referencias(self.raiz, NOCHE))  # sin `ciclo`
            m.ciclo = lambda raiz, ahora: llamadas.append((raiz, ahora))
            self.assertEqual(D._agente_referencias(self.raiz, NOCHE), {"ok": True})
            self.assertEqual(llamadas, [(self.raiz, NOCHE)])
            m.ciclo = lambda raiz, ahora: 1 / 0
            r = self.correr(agente_referencias=None)
            self.assertIn("referencias-diseno", r["lanzado"])
        finally:
            if previo is None: sys.modules.pop("agente_referencias_diseno", None)
            else: sys.modules["agente_referencias_diseno"] = previo

    def test_consejo_jev_por_la_puerta_comun(self):
        import decidir
        previo = decidir.consultar
        try:
            decidir.consultar = lambda *a, **k: {"medio": "regla", "p": None, "respuesta": "sí"}
            self.assertIsNone(D._consejo_jev({"titulo": "x"}))  # Jev calla: manda la regla
            decidir.consultar = lambda *a, **k: {"medio": "local", "p": 0.1, "respuesta": "no"}
            self.assertEqual(D._consejo_jev({"titulo": "x"}), {"p": 0.9, "veta": True})
            decidir.consultar = lambda *a, **k: {"medio": "local", "p": 0.95, "respuesta": "sí"}
            self.assertEqual(D._consejo_jev({"titulo": "x"}), {"p": 0.95})
            decidir.consultar = lambda *a, **k: 1 / 0
            self.assertIsNone(D._consejo_jev({"titulo": "x"}))
        finally:
            decidir.consultar = previo


if __name__ == "__main__":
    unittest.main()
