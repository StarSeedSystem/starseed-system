# -*- coding: utf-8 -*-
"""Pruebas del revisor de bloqueadas (OPB1011): ninguna tarea se queda quieta.

Casos medidos el 2026-10-10 en la Mac: 35 tareas de la Protomolécula «bloqueadas» que en
realidad esperaban a cinco raíces; raíces que fallaron por un `index.lock` huérfano (merge ff)
y por tsc/worktree sin memoria; reabiertas que perdían su sitio en la cola.
"""
import json
import os
import sys
import tempfile
import time
import unittest
from unittest import mock

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import revisor_bloqueadas_logica as L  # noqa: E402

AHORA = time.mktime(time.strptime("2026-10-10 05:00:00", "%Y-%m-%d %H:%M:%S"))


def _t(minutos_antes):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(AHORA - minutos_antes * 60))


def T(tid, deps=(), archivos=("src/a.ts",), titulo=None, **extra):
    d = {"id": tid, "titulo": titulo or "tarea " + tid, "archivos": list(archivos), "depende": list(deps),
         "prompt": "haz " + tid}
    d.update(extra)
    return d


def foto(tareas, progreso=None, cola_viva=None, colas=None, fallos=None, memoria=None, asuntos=(), **extra):
    por_id = {t["id"]: t for t in tareas}
    f = {
        "tareas": por_id,
        "colas": colas if colas is not None else {"cola-x.json": list(por_id)},
        "cola_viva": cola_viva,
        "progreso": progreso or {},
        "asuntos": list(asuntos),
        "fallos": fallos or {},
        "memoria": memoria or {},
        "ahora": AHORA,
        "head": "abc1234",
    }
    f.update(extra)
    return f


def acciones_de(dec, tid=None):
    return [a for a in dec["acciones"] if tid is None or a["tid"] == tid]


class ClaseDeFallo(unittest.TestCase):
    def test_medio_antes_que_tarea(self):
        self.assertEqual(L.clase_de_fallo("merge ff falló: Unable to create '.git/index.lock'"), "medio:cerrojo")
        self.assertEqual(L.clase_de_fallo("tsc no terminó (se pasó de tiempo): la puerta…"), "medio:tiempo")
        self.assertEqual(L.clase_de_fallo("worktree: no se pudo preparar worktree; rama conservada"), "medio:worktree")
        self.assertEqual(L.clase_de_fallo("429 sin cupo del día"), "medio:proveedor")
        self.assertEqual(L.clase_de_fallo("tsc sigue con 2 errores; rama conservada"), "tarea:tsc")
        self.assertEqual(L.clase_de_fallo("ningún modelo tocó archivos"), "tarea:sin_cambios")
        self.assertEqual(L.clase_de_fallo(""), "tarea:otro")
        self.assertTrue(L.es_del_medio("medio:red"))
        self.assertFalse(L.es_del_medio("tarea:tsc"))


class Cadenas(unittest.TestCase):
    def test_espera_normal_es_en_cadena_con_su_raiz(self):
        tareas = [T("A"), T("B", ["A"]), T("C", ["B"]), T("D", ["A", "C"])]
        dec = L.decidir(foto(tareas, {"A": {"estado": "pendiente"}}))
        self.assertEqual(set(dec["en_cadena"]), {"B", "C", "D"})
        self.assertEqual(dec["en_cadena"]["C"]["raiz"], "A")
        self.assertEqual(dec["cadenas"][0]["raiz"], "A")
        self.assertEqual(dec["cadenas"][0]["n"], 3)
        self.assertFalse(acciones_de(dec, "C"))

    def test_sucesora_integrada_cumple_la_dependencia(self):
        tareas = [T("X1"), T("Y1", ["X1"])]
        prog = {"X1": {"estado": "sustituida"}, "X1b": {"estado": "commit"}}
        e, por = L.estado_de_dependencia("X1", prog, {t["id"]: t for t in tareas}, [])
        self.assertEqual(e, "cumplida")
        self.assertIn("X1b", por)

    def test_dependencia_rechazada_sin_sucesora_se_relaja(self):
        tareas = [T("Y1", ["X1"])]
        prog = {"X1": {"estado": "rechazada"}}
        dec = L.decidir(foto(tareas, prog))
        a = acciones_de(dec, "Y1")
        self.assertEqual(a[0]["accion"], "relajar")
        self.assertEqual(a[0]["datos"]["quitar"], ["X1"])
        self.assertTrue(a[0]["veto_jev"])

    def test_dependencia_fallida_sigue_viva_no_se_suelta(self):
        tareas = [T("X1"), T("Y1", ["X1"])]
        prog = {"X1": {"estado": "fallo_tsc", "nota": "tsc sigue con 2 errores"}}
        dec = L.decidir(foto(tareas, prog))
        self.assertIn("Y1", dec["en_cadena"])
        self.assertFalse([a for a in acciones_de(dec, "Y1") if a["accion"] == "relajar"])


class Fallos(unittest.TestCase):
    def test_cerrojo_huerfano_reintenta_sin_contar(self):
        tareas = [T("PM1")]
        prog = {"PM1": {"estado": "conflicto", "nota": "ff falló: Unable to create index.lock", "t": _t(30),
                        "intentos_auto": 0}}
        dec = L.decidir(foto(tareas, prog))
        a = acciones_de(dec, "PM1")[0]
        self.assertEqual(a["accion"], "reintentar")
        self.assertTrue(a["datos"]["no_cuenta"])

    def test_nota_reescrita_por_director_usa_el_evento(self):
        tareas = [T("G1")]
        prog = {"G1": {"estado": "fallo", "nota": "director: reintento gratuito 1/8", "t": _t(20)}}
        fallos = {"G1": [{"t": _t(25), "tipo": "fallo", "texto": "tsc no terminó (se pasó de tiempo)"}]}
        dec = L.decidir(foto(tareas, prog, fallos=fallos))
        self.assertEqual(acciones_de(dec, "G1")[0]["accion"], "reintentar")

    def test_primer_fallo_de_tarea_lo_lleva_la_escalera(self):
        tareas = [T("Z1")]
        prog = {"Z1": {"estado": "fallo_tsc", "nota": "tsc sigue con 2 errores", "t": _t(20)}}
        dec = L.decidir(foto(tareas, prog))
        self.assertFalse(acciones_de(dec, "Z1"))

    def test_fallo_repetido_se_reescribe_con_contexto(self):
        tareas = [T("Z1")]
        prog = {"Z1": {"estado": "fallo_tsc", "nota": "tsc sigue con 2 errores", "t": _t(20), "intentos_auto": 2}}
        fallos = {"Z1": [{"t": _t(90), "tipo": "fallo", "texto": "tsc sigue con 3 errores"},
                         {"t": _t(25), "tipo": "fallo", "texto": "tsc sigue con 2 errores"}]}
        dec = L.decidir(foto(tareas, prog, fallos=fallos))
        a = acciones_de(dec, "Z1")[0]
        self.assertEqual(a["accion"], "reescribir")
        self.assertIn("main va por abc1234", a["datos"]["mensaje"])
        self.assertIn("tsc sigue con 2 errores", a["datos"]["mensaje"])

    def test_bloqueante_con_muchos_archivos_se_divide(self):
        t = T("K1", archivos=["a.py", "b.py", "c.py", "d.py", "e.py"])
        prog = {"K1": {"estado": "bloqueante", "nota": "director: escalada agotada tras 10 intentos: requiere una persona",
                       "t": _t(60)}}
        dec = L.decidir(foto([t, T("K2", ["K1"])], prog))
        a = acciones_de(dec, "K1")[0]
        self.assertEqual(a["accion"], "dividir")
        partes = a["datos"]["tareas_nuevas"]
        self.assertEqual([p["id"] for p in partes], ["K1-d1", "K1-d2"])
        self.assertTrue(all(len(p["archivos"]) <= 3 for p in partes))
        self.assertEqual(partes[1]["depende"], ["K1-d1"])
        self.assertIn("PARTE 2 DE 2", partes[1]["prompt"])

    def test_reasigna_a_codex_si_lo_aprendido_lo_prefiere(self):
        tareas = [T("R1")]
        prog = {"R1": {"estado": "sin_cambios", "nota": "ningún modelo tocó archivos", "t": _t(20),
                       "intentos_auto": 3, "modelo": "freellmapi/auto"}}
        dec = L.decidir(foto(tareas, prog, codex_ok=True))
        a = acciones_de(dec, "R1")[0]
        self.assertEqual(a["accion"], "reasignar")
        self.assertEqual(a["datos"]["modelo_siguiente"], "codex/gpt-5.6-sol")

    def test_migraciones_son_de_alex(self):
        t = T("M1", archivos=["supabase/migrations/2026_x.sql"])
        prog = {"M1": {"estado": "fallo_tests", "nota": "pruebas en rojo", "t": _t(20), "intentos_auto": 3}}
        dec = L.decidir(foto([t], prog))
        a = acciones_de(dec, "M1")[0]
        self.assertEqual(a["accion"], "pedir_a_alex")
        self.assertIn("rehacer", a["datos"]["opciones"])

    def test_tope_de_transformaciones_pregunta_a_alex(self):
        tareas = [T("Q1")]
        prog = {"Q1": {"estado": "fallo_tsc", "nota": "tsc sigue con 1 errores", "t": _t(10), "intentos_auto": 4}}
        hist = [{"t": _t(m), "tid": "Q1", "accion": "reescribir", "clase": "tarea:tsc"} for m in (300, 200, 100)]
        dec = L.decidir(foto(tareas, prog, memoria={"historial": hist}))
        self.assertEqual(acciones_de(dec, "Q1")[0]["accion"], "pedir_a_alex")

    def test_respiro_tras_una_accion_reciente(self):
        tareas = [T("Q2")]
        prog = {"Q2": {"estado": "fallo_tsc", "nota": "tsc sigue", "t": _t(5), "intentos_auto": 4}}
        hist = [{"t": _t(10), "tid": "Q2", "accion": "reescribir", "clase": "tarea:tsc"}]
        dec = L.decidir(foto(tareas, prog, memoria={"historial": hist}))
        self.assertFalse(acciones_de(dec, "Q2"))


class Enlistar(unittest.TestCase):
    def test_solo_en_el_archivo_se_enlista(self):
        prog = {"ARCH1": {"estado": "fallo", "nota": "worktree: no se pudo preparar worktree", "t": _t(30)}}
        f = foto([], prog, definiciones={"ARCH1": T("ARCH1")})
        a = acciones_de(L.decidir(f), "ARCH1")[0]
        self.assertEqual(a["accion"], "reintentar")
        self.assertEqual(a["datos"]["enlistar"]["id"], "ARCH1")

    def test_sin_definicion_pregunta_a_alex(self):
        prog = {"FANT1": {"estado": "fallo_tsc", "nota": "tsc", "t": _t(30), "intentos_auto": 3}}
        a = acciones_de(L.decidir(foto([], prog)), "FANT1")[0]
        self.assertEqual(a["accion"], "pedir_a_alex")

    def test_en_la_tanda_viva_no_se_enlista(self):
        prog = {"V1": {"estado": "conflicto", "nota": "ff falló: index.lock", "t": _t(30)}}
        f = foto([T("V1")], prog, cola_viva="cola-auto-9.json", colas={"cola-auto-9.json": ["V1"]})
        a = acciones_de(L.decidir(f), "V1")[0]
        self.assertNotIn("enlistar", a["datos"])


class Cierre(unittest.TestCase):
    def test_ya_en_main_se_cierra(self):
        tareas = [T("H1")]
        prog = {"H1": {"estado": "fallo_tsc", "nota": "tsc", "t": _t(10)}}
        dec = L.decidir(foto(tareas, prog, asuntos=["Ola 1010 · H1: lo que fuera"]))
        a = acciones_de(dec, "H1")[0]
        self.assertEqual(a["accion"], "ya_hecha")
        self.assertTrue(a["veto_jev"])

    def test_gemela_viva_se_fusiona(self):
        a1 = T("DUP1", titulo="Lo mismo", archivos=["x.ts"])
        a2 = T("DUP2", titulo="Lo mismo", archivos=["x.ts"])
        prog = {"DUP2": {"estado": "fallo_tsc", "nota": "tsc", "t": _t(10)}}
        dec = L.decidir(foto([a1, a2], prog))
        a = acciones_de(dec, "DUP2")[0]
        self.assertEqual(a["accion"], "fusionar")
        self.assertEqual(a["datos"]["por"], "DUP1")


class Orden(unittest.TestCase):
    def test_raices_que_mas_desbloquean_primero(self):
        tareas = [T("HOJA"), T("RAIZ"), T("H1", ["RAIZ"]), T("H2", ["H1"])]
        colas = {"cola-auto-1.json": ["HOJA", "RAIZ"], "cola-p.json": ["H1", "H2"]}
        prog = {"HOJA": {"estado": "pendiente"}, "RAIZ": {"estado": "pendiente"}}
        dec = L.decidir(foto(tareas, prog, cola_viva="cola-auto-1.json", colas=colas))
        self.assertEqual(dec["orden_cola"], ["RAIZ", "HOJA"])
        pr = [a for a in dec["acciones"] if a["accion"] == "priorizar"][0]
        self.assertEqual(pr["datos"]["orden"], ["RAIZ", "HOJA"])

    def test_sin_cambios_en_el_orden_no_toca_la_cola(self):
        tareas = [T("RAIZ"), T("HOJA"), T("H1", ["RAIZ"])]
        colas = {"cola-auto-1.json": ["RAIZ", "HOJA"], "cola-p.json": ["H1"]}
        dec = L.decidir(foto(tareas, {}, cola_viva="cola-auto-1.json", colas=colas))
        self.assertIsNone(dec["orden_cola"])

    def test_reabiertas_tras_la_cola_fuerzan_reescribirla(self):
        tareas = [T("RAIZ"), T("HOJA"), T("H1", ["RAIZ"])]
        colas = {"cola-auto-1.json": ["RAIZ", "HOJA"], "cola-p.json": ["H1"]}
        dec = L.decidir(foto(tareas, {}, cola_viva="cola-auto-1.json", colas=colas, reabiertas_tras_cola=True))
        self.assertEqual(dec["orden_cola"], ["RAIZ", "HOJA"])

    def test_bloqueada_con_dependencias_en_main_vuelve(self):
        tareas = [T("A0"), T("B0", ["A0"])]
        prog = {"A0": {"estado": "commit"}, "B0": {"estado": "bloqueada", "nota": "dependencia no integrada: A0"}}
        dec = L.decidir(foto(tareas, prog, cola_viva="cola-x.json", colas={"cola-x.json": ["A0", "B0"]}))
        a = acciones_de(dec, "B0")[0]
        self.assertEqual(a["accion"], "trasladar")
        self.assertEqual(a["datos"]["estado"], "pendiente")

    def test_las_trasladadas_entran_en_el_orden_y_no_adelantan_a_las_raices(self):
        tareas = [T("RAIZ"), T("H1", ["RAIZ"]), T("H2", ["H1"]), T("NUEVA"), T("N1", ["NUEVA"])]
        colas = {"cola-auto-1.json": ["RAIZ"], "cola-xr.json": ["NUEVA", "N1"], "cola-p.json": ["H1", "H2"]}
        dec = L.decidir(foto(tareas, {}, cola_viva="cola-auto-1.json", colas=colas))
        self.assertEqual(acciones_de(dec, "NUEVA")[0]["accion"], "trasladar")
        self.assertEqual(dec["orden_cola"], ["RAIZ", "NUEVA"])

    def test_lista_fuera_de_la_tanda_se_traslada(self):
        tareas = [T("A0"), T("B0", ["A0"])]
        prog = {"A0": {"estado": "commit"}}
        colas = {"cola-auto-1.json": ["A0"], "cola-p.json": ["B0"]}
        dec = L.decidir(foto(tareas, prog, cola_viva="cola-auto-1.json", colas=colas))
        self.assertEqual(acciones_de(dec, "B0")[0]["accion"], "trasladar")


class Aprendizaje(unittest.TestCase):
    def test_acierto_y_fallo_se_anotan(self):
        mem = {"historial": [
            {"t": _t(120), "tid": "A1", "accion": "reescribir", "clase": "tarea:tsc"},
            {"t": _t(120), "tid": "B1", "accion": "reasignar", "clase": "tarea:tsc"},
        ]}
        prog = {"A1b": {"estado": "commit"}, "B1": {"estado": "fallo_tsc", "t": _t(10)}}
        nueva, frases = L.evaluar_historial(mem, prog, {}, [], AHORA)
        self.assertEqual(nueva["aprendizaje"]["tarea:tsc|reescribir"], [1, 0])
        self.assertEqual(nueva["aprendizaje"]["tarea:tsc|reasignar"], [0, 1])
        self.assertTrue(frases)

    def test_elige_lo_que_funciono(self):
        apr = {"tarea:tsc|reasignar": [5, 0], "tarea:tsc|reescribir": [0, 4]}
        self.assertEqual(L.elegir_accion("tarea:tsc", ["reescribir", "reasignar", "dividir"], apr), "reasignar")
        self.assertEqual(L.elegir_accion("tarea:tsc", ["reescribir", "reasignar"], {}, ["reescribir"]), "reasignar")


class Servicio(unittest.TestCase):
    """La capa de disco en un árbol temporal: colas, progreso, control y estado."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.olas = os.path.join(self.tmp, "starseed_memory_root", "olas")
        os.makedirs(self.olas)
        import revisor_bloqueadas as R

        self.R = R
        self.parches = [
            mock.patch.object(R, "RAIZ", self.tmp),
            mock.patch.object(R, "OLAS", self.olas),
            mock.patch.object(R, "PROGRESO", os.path.join(self.olas, "progreso.json")),
            mock.patch.object(R, "CORRECCIONES", os.path.join(self.olas, "progreso-correcciones.json")),
            mock.patch.object(R, "EVENTOS", os.path.join(self.olas, "eventos.jsonl")),
            mock.patch.object(R, "ESTADO", os.path.join(self.olas, "revisor-bloqueadas.json")),
            mock.patch.object(R, "CERROJOS", os.path.join(self.tmp, "cerrojos")),
            mock.patch.object(R, "CERROJO_PROGRESO", os.path.join(self.tmp, "cerrojos", "progreso.lock")),
            mock.patch.object(R, "_publicar_chat", lambda texto: True),
            mock.patch.object(R, "_codex_ok", lambda: False),
            mock.patch.object(R, "barrer_cerrojo_principal", lambda: None),
        ]
        for p in self.parches:
            p.start()
        self.addCleanup(lambda: [p.stop() for p in self.parches])

    def _escribir(self, nombre, datos):
        with open(os.path.join(self.olas, nombre), "w", encoding="utf-8") as f:
            json.dump(datos, f)

    def _leer(self, nombre):
        with open(os.path.join(self.olas, nombre), encoding="utf-8") as f:
            return json.load(f)

    def test_pasada_reintenta_reordena_y_guarda_estado(self):
        self._escribir("cola-auto-1.json", [T("HOJA"), T("RAIZ"), T("CAIDA")])
        self._escribir("cola-proto.json", [T("H1", ["RAIZ"]), T("H2", ["H1"])])
        self._escribir("progreso.json", {
            "HOJA": {"estado": "pendiente"}, "RAIZ": {"estado": "pendiente"},
            "CAIDA": {"estado": "conflicto", "nota": "ff falló: index.lock exists", "t": _t(30), "intentos_auto": 1},
        })
        with mock.patch.object(self.R, "_cola_viva", lambda: "cola-auto-1.json"), \
                mock.patch.object(self.R, "_sh", lambda orden, timeout=30: (0, "")):
            inf = self.R.pasada(jev=False, ahora=AHORA)
        acc = {(a["tid"], a["accion"]): a for a in inf["acciones"]}
        self.assertIn(("CAIDA", "reintentar"), acc)
        self.assertEqual(acc[("CAIDA", "reintentar")]["via"], "orden reabrir a la tanda viva")
        control = self._leer("control-cola-auto-1.json")
        self.assertEqual(control["CAIDA"]["accion"], "reabrir")
        self.assertEqual(control["CAIDA"]["intentos_auto"], 1)  # no gasta intento
        ids = [t["id"] for t in self._leer("cola-auto-1.json")]
        self.assertLess(ids.index("RAIZ"), ids.index("HOJA"))
        self.assertEqual(ids[0], "RAIZ")  # las pendientes ordenadas van delante del resto
        estado = self._leer("revisor-bloqueadas.json")
        self.assertEqual(estado["cuentas"]["en_cadena"], 2)
        self.assertEqual(estado["cadenas"][0]["raiz"], "RAIZ")
        self.assertTrue(estado["transformadas_hoy"])

    def test_seco_no_toca_nada(self):
        self._escribir("cola-a.json", [T("Y1", ["X1"])])
        self._escribir("progreso.json", {"X1": {"estado": "rechazada"}})
        with mock.patch.object(self.R, "_cola_viva", lambda: None), \
                mock.patch.object(self.R, "_sh", lambda orden, timeout=30: (0, "")):
            inf = self.R.pasada(seco=True, jev=False, ahora=AHORA)
        self.assertEqual(inf["acciones"][0]["resultado"], "seco")
        self.assertEqual(self._leer("cola-a.json")[0]["depende"], ["X1"])
        self.assertFalse(os.path.exists(os.path.join(self.olas, "revisor-bloqueadas.json")))

    def test_relajar_quita_la_dependencia_muerta_de_la_cola(self):
        self._escribir("cola-a.json", [T("Y1", ["X1", "OK1"])])
        self._escribir("progreso.json", {"X1": {"estado": "rechazada"}, "OK1": {"estado": "commit"}})
        with mock.patch.object(self.R, "_cola_viva", lambda: None), \
                mock.patch.object(self.R, "_sh", lambda orden, timeout=30: (0, "")):
            self.R.pasada(jev=False, ahora=AHORA)
        t = self._leer("cola-a.json")[0]
        self.assertEqual(t["depende"], ["OK1"])
        self.assertEqual(t["revisor_quitadas"], ["X1"])

    def test_dividir_crea_partes_y_recablea_dependientes(self):
        self._escribir("cola-a.json", [T("K1", archivos=["a", "b", "c", "d"]), T("K2", ["K1"])])
        self._escribir("progreso.json", {"K1": {"estado": "bloqueante", "nota": "director: escalada agotada",
                                                "t": _t(60)}})
        with mock.patch.object(self.R, "_cola_viva", lambda: None), \
                mock.patch.object(self.R, "_sh", lambda orden, timeout=30: (0, "")):
            self.R.pasada(jev=False, ahora=AHORA)
        nuevas = [f for f in os.listdir(self.olas) if f.startswith("cola-revisor-")]
        self.assertEqual(len(nuevas), 1)
        self.assertEqual([t["id"] for t in self._leer(nuevas[0])], ["K1-d1", "K1-d2"])
        self.assertEqual(self._leer("cola-a.json")[1]["depende"], ["K1-d2"])
        self.assertEqual(self._leer("progreso.json")["K1"]["estado"], "sustituida")

    def test_decidir_alex_descartar_y_rehacer(self):
        self._escribir("progreso.json", {"M1": {"estado": "bloqueante"}})
        self._escribir("revisor-bloqueadas.json", {"necesitan_alex": {"M1": {"pregunta": "?"}}, "memoria": {}})
        r = self.R.decidir_alex("M1", "descartar")
        self.assertTrue(r["ok"])
        self.assertEqual(self._leer("progreso.json")["M1"]["estado"], "rechazada")
        self.assertEqual(self._leer("revisor-bloqueadas.json")["necesitan_alex"], {})
        self.R.decidir_alex("M1", "rehacer")
        self.assertEqual(self._leer("progreso.json")["M1"]["estado"], "pendiente")
        self.assertFalse(self.R.decidir_alex("M1", "otra")["ok"])

    def test_instalar_en_linux_escribe_la_unidad_systemd(self):
        casa = os.path.join(self.tmp, "casa")
        with mock.patch.dict(os.environ, {"HOME": casa}), \
                mock.patch.object(self.R.platform, "system", lambda: "Linux"), \
                mock.patch.object(self.R.subprocess, "run", lambda *a, **k: mock.Mock(returncode=0)):
            r = self.R.instalar()
        self.assertTrue(r["ok"])
        with open(r["unidad"], encoding="utf-8") as f:
            unidad = f.read()
        self.assertIn("--bucle --cada", unidad)
        self.assertIn("STARSEED_ROOT=%s" % self.tmp, unidad)
        self.assertIn("Restart=always", unidad)

    def test_veto_de_jev_solo_con_certeza(self):
        falso = mock.Mock()
        falso.consultar = mock.Mock(return_value={"respuesta": "no", "p": 0.91, "medio": "jev-local"})
        with mock.patch.dict(sys.modules, {"decidir": falso}):
            vetada, nota = self.R._veto_jev({"tid": "A", "accion": "ya_hecha", "motivo": "x"}, {"tareas": {}})
        self.assertTrue(vetada)
        self.assertIn("p=0.91", nota)
        falso.consultar.return_value = {"respuesta": "no", "p": 0.6, "medio": "jev-local"}
        with mock.patch.dict(sys.modules, {"decidir": falso}):
            self.assertFalse(self.R._veto_jev({"tid": "A", "accion": "ya_hecha"}, {"tareas": {}})[0])
        falso.consultar.return_value = {"respuesta": "no", "p": 0.99, "medio": "regla"}
        with mock.patch.dict(sys.modules, {"decidir": falso}):
            self.assertFalse(self.R._veto_jev({"tid": "A", "accion": "ya_hecha"}, {"tareas": {}})[0])


if __name__ == "__main__":
    unittest.main()
