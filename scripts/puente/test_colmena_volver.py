# -*- coding: utf-8 -*-
"""Pruebas del «al volver» (COL1012H): al arrancar o al recuperar la conexión, el aparato suelta lo
que otro siguió mientras estuvo fuera — el punto de control va a su sucesor y la orden «soltar» al
`control-<cola>.json` de este disco.

Nada toca la red ni los cerrojos reales: el disco es una carpeta temporal, el bus es el Supabase
simulado de `test_nodo_metagenesis`, y las DOS salidas de fuera (escribir el soltar, mandar los
puntos) van inyectadas — salvo UNA prueba del disco real, en la que la carpeta de cerrojos del
módulo se parchea a la temporal."""
import json
import os
import shutil
import sys
import tempfile
import types
import unittest
import unittest.mock

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import nodo_metagenesis as NM  # noqa: E402
import nodo_metagenesis_bus as B  # noqa: E402
import nodo_metagenesis_logica as L  # noqa: E402
from test_nodo_metagenesis import ENV, T0, SECRETO, MedioFalso, Reloj, SupabaseSimulado, medida  # noqa: E402

AHORA = T0


def escribe(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False)


class SoltarFalso:
    """El «soltar» de fuera inyectado: guarda sus llamadas; `fallo=True` simula un disco que se negó."""

    def __init__(self, fallo=False):
        self.llamadas = []
        self.fallo = fallo

    def __call__(self, ordenes, raiz):
        self.llamadas.append(dict(ordenes))
        if self.fallo:
            return []
        return [tid for por in ordenes.values() for tid in por]


class PuntosFalso:
    """El envío de puntos inyectado: guarda lo mandado y confirma el éxito."""

    def __init__(self):
        self.llamadas = []

    def __call__(self, *a, **k):
        self.llamadas.append(list(a))
        return True


class TestAyudantesPuros(unittest.TestCase):
    """`cola_de_tareas` y `puntos_finales`: sin disco ya que es temporal, sin red, sin nodo."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="colmena-volver-")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.raiz = os.path.join(self.tmp, "raiz")

    def test_cola_de_tareas_mapea_solo_las_vivas_y_la_primera_cola_manda(self):
        olas = os.path.join(self.raiz, "starseed_memory_root", "olas")
        escribe(os.path.join(olas, "latidos-cola-a.json"),
                {"tareas": {"T1": {"fase": "escribiendo"}, "T2": {"fase": "hecho"}}})
        escribe(os.path.join(olas, "latidos-cola-b.json"),
                {"tareas": {"T1": {"fase": "tsc"}, "T3": {"fase": "tsc"}}})
        self.assertEqual(NM.cola_de_tareas(self.raiz, ["cola-a", "cola-b"]),
                         {"T1": "cola-a.json", "T3": "cola-b.json"},
                         "T2 está hecho: no lo suelta nadie; T1 ya tenía cola: la primera manda")

    def test_cola_de_tareas_salta_el_latidos_roto_y_acepta_nombre_con_json(self):
        olas = os.path.join(self.raiz, "starseed_memory_root", "olas")
        escribe(os.path.join(olas, "latidos-cola-rota.json"), "esto no es un diccionario")
        escribe(os.path.join(olas, "latidos-cola-viva.json"), {"tareas": {"T1": {"fase": "tsc"}}})
        self.assertEqual(NM.cola_de_tareas(self.raiz, ["cola-rota.json", "cola-viva.json"]),
                         {"T1": "cola-viva.json"}, "el latidos roto no aporta y no tumba el resto")
        self.assertEqual(NM.cola_de_tareas(self.raiz, []), {})
        self.assertEqual(NM.cola_de_tareas(self.raiz, ["cola-que-no-existe"]), {})

    def test_puntos_finales_trae_solo_los_con_sha_y_solo_lo_pedido(self):
        en_curso = [{"id": "T1", "fase": "escribiendo", "punto": {"rama": "relevo/mac/T1", "sha": "p1", "t": 5.0}},
                    {"id": "T2", "fase": "tsc", "punto": None},
                    {"id": "T3", "fase": "tsc", "punto": {"rama": "ola/T3", "sha": "", "t": 9.0}},
                    {"id": "T4", "fase": "tsc", "punto": {"rama": "ola/T4", "sha": "p4", "t": 3.0}},
                    "esto no es una entrada"]
        self.assertEqual(NM.puntos_finales(en_curso, ["T1", "T2", "T4"]),
                         {"T1": {"rama": "relevo/mac/T1", "sha": "p1", "t": 5.0},
                          "T4": {"rama": "ola/T4", "sha": "p4", "t": 3.0}},
                         "sin sha aún no es un punto y no se manda; T3 no lo pidió nadie")


class TestAlVolverNodo(unittest.TestCase):
    """El método del nodo en directo: disco temporal, salidas de fuera inyectadas, def `_al_volver`."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="colmena-volver-")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.raiz = os.path.join(self.tmp, "raiz")
        self.olas = os.path.join(self.raiz, "starseed_memory_root", "olas")
        os.makedirs(self.olas, exist_ok=True)
        self.control = os.path.join(self.olas, "control-cola-x.json")
        self.en_curso = [{"id": "T1", "fase": "escribiendo",
                          "punto": {"rama": "relevo/mac-1/T1", "sha": "p1", "t": AHORA - 100}},
                         {"id": "T2", "fase": "tsc", "punto": None}]
        self.salud = {"medio": "mac", "periodo_s": 300.0,
                      "orquestadores": [{"pid": 7, "cola": "cola-x"}], "en_curso": self.en_curso}
        self.latidos_tareas({"T1": "escribiendo", "T2": "tsc", "T9": "hecho"})

    def latidos_tareas(self, fases, cola="cola-x"):
        escribe(os.path.join(self.olas, "latidos-%s.json" % cola),
                {"tareas": {tid: {"fase": f} for tid, f in fases.items()}})

    def nodo(self, soltar=None, puntos=None, seco=False, memoria=None):
        mem = {"hecho": {}, "nonces": {}, "decisiones": [], "autonomia": True}
        mem.update(memoria or {})
        n = NM.Nodo(seco=seco, sin_red=True, env={"STARSEED_LANZADOR_SECRETO": SECRETO},
                    medir=lambda modo, t: {"medio": "mac", "raiz": self.raiz, "salud": self.salud, "cap": {}},
                    ejecutar=lambda *a, **k: ("hecha", ""), reloj=lambda: AHORA, memoria=mem,
                    persistir=False, huella="huella-volver", soltar_ordenes=soltar, enviar_puntos=puntos)
        n.yo = "mac-1"
        return n

    def nov(self, *asignaciones):
        return {"latidos": [], "reclamos": [], "bajas": [], "ordenes": [], "asignaciones": list(asignaciones)}

    def test_suelta_lo_que_otro_sigio_mandando_el_punto_y_escribiendo_la_orden(self):
        s, p, informe = SoltarFalso(), PuntosFalso(), {"acciones": []}
        n = self.nodo(soltar=s, puntos=p)
        n._al_volver(self.salud, self.nov({"nodo": "a1", "ids": ["T1", "T2"], "ts": AHORA - 60}),
                     self.raiz, informe, AHORA, AHORA - 3600)
        self.assertEqual(informe["al_volver"]["soltar"], ["T1", "T2"])
        self.assertEqual(informe["al_volver"]["seguir"], [])
        self.assertEqual(p.llamadas, [[{"T1": {"rama": "relevo/mac-1/T1", "sha": "p1", "t": AHORA - 100}}]],
                         "T2 no tiene punto: no se manda ninguno inventado")
        self.assertEqual(list(s.llamadas[0]), ["cola-x.json"])
        self.assertEqual({tid: o["donde"] for tid, o in s.llamadas[0]["cola-x.json"].items()},
                         {"T1": "a1", "T2": "a1"})
        self.assertEqual(s.llamadas[0]["cola-x.json"]["T1"]["accion"], "soltar")
        self.assertIsNone(n.mem.get("al_volver_pendientes"))
        self.assertEqual([d["accion"] for d in n.mem["decisiones"]], ["al_volver"])

    def test_dentro_del_silencio_normal_no_toca_nada(self):
        s, p, informe = SoltarFalso(), PuntosFalso(), {"acciones": []}
        n = self.nodo(soltar=s, puntos=p)
        n._al_volver(self.salud, self.nov({"nodo": "a1", "ids": ["T1", "T2"], "ts": AHORA - 60}),
                     self.raiz, informe, AHORA, AHORA - 100)
        self.assertNotIn("al_volver", informe, "17 min normales de vida: ni se avisa")
        self.assertEqual(s.llamadas, [])
        self.assertEqual(p.llamadas, [])

    def test_arranque_sin_latido_previo_tambien_dispara(self):
        s, p, informe = SoltarFalso(), PuntosFalso(), {"acciones": []}
        n = self.nodo(soltar=s, puntos=p)
        n._al_volver(self.salud, self.nov({"nodo": "a1", "ids": ["T1"], "ts": AHORA - 60}),
                     self.raiz, informe, AHORA, 0)
        self.assertEqual(informe["al_volver"]["soltar"], ["T1"],
                         "sin latido previo ningún medio puede darme por vivo: todo lo asignado ya es de otro")

    def test_lo_que_yo_tengo_recien_asignado_se_sigue_y_lo_del_otro_se_suelta(self):
        informe = {"acciones": []}
        nov = self.nov({"nodo": "mac-1", "ids": ["T2"], "ts": AHORA},
                       {"nodo": "a1", "ids": ["T1"], "ts": AHORA - 60})
        self.nodo(soltar=SoltarFalso(), puntos=PuntosFalso())._al_volver(
            self.salud, nov, self.raiz, informe, AHORA, AHORA - 3600)
        self.assertEqual(informe["al_volver"]["soltar"], ["T1"])
        self.assertEqual(informe["al_volver"]["seguir"], ["T2"], "recién me la asignó el líder: la sigo yo")

    def test_asignacion_previa_a_mi_ultimo_latido_no_se_suelta(self):
        informe = {"acciones": []}
        nov = self.nov({"nodo": "a1", "ids": ["T1"], "ts": AHORA - 7200})
        s = SoltarFalso()
        self.nodo(soltar=s)._al_volver(self.salud, nov, self.raiz, informe, AHORA, AHORA - 3600)
        self.assertEqual(informe["al_volver"]["soltar"], [],
                         "la asignación es ANTERIOR a mi último latido: ese sucesor ya la llevaba entonces")
        self.assertEqual(s.llamadas, [])

    def test_seco_dice_lo_que_haria_y_no_toca_nada(self):
        s, p, informe = SoltarFalso(), PuntosFalso(), {"acciones": []}
        n = self.nodo(soltar=s, puntos=p, seco=True)
        n._al_volver(self.salud, self.nov({"nodo": "a1", "ids": ["T1", "T2"], "ts": AHORA - 60}),
                     self.raiz, informe, AHORA, AHORA - 3600)
        self.assertEqual(informe["al_volver"]["soltar"], ["T1", "T2"])
        self.assertTrue(informe["al_volver"]["resultado"].startswith("seca"))
        self.assertEqual(s.llamadas, [])
        self.assertEqual(p.llamadas, [])

    def test_el_envio_fallido_no_impide_el_soltar(self):
        s, informe = SoltarFalso(), {"acciones": []}
        n = self.nodo(soltar=s, puntos=lambda p: False)
        n._al_volver(self.salud, self.nov({"nodo": "a1", "ids": ["T1", "T2"], "ts": AHORA - 60}),
                     self.raiz, informe, AHORA, AHORA - 3600)
        self.assertEqual(len(s.llamadas), 1, "el soltar va aunque el envío no salga")
        self.assertIn("no salió el envío de puntos", informe["al_volver"]["resultado"], "y se dice")

    def test_sin_punto_todavia_se_suelta_y_lo_dice(self):
        self.en_curso = [{"id": "T1", "fase": "escribiendo", "punto": None},
                         {"id": "T2", "fase": "tsc", "punto": {"rama": "ola/T2", "sha": "", "t": 9.0}}]
        self.salud["en_curso"] = self.en_curso
        s, informe = SoltarFalso(), {"acciones": []}
        n = self.nodo(soltar=s)
        n._al_volver(self.salud, self.nov({"nodo": "a1", "ids": ["T1", "T2"], "ts": AHORA - 60}),
                     self.raiz, informe, AHORA, AHORA - 3600)
        self.assertEqual(len(s.llamadas), 1, "sin punto la tarea va igual: volver a la cola tal cual")
        self.assertIn("sin punto de control", informe["al_volver"]["resultado"], "y se dice honesto")

    def test_sin_cola_conocida_no_dice_hecho_y_queda_de_pendiente(self):
        self.salud["orquestadores"] = []
        s, p = SoltarFalso(), PuntosFalso()
        informe = {"acciones": []}
        n = self.nodo(soltar=s, puntos=p)
        n._al_volver(self.salud, self.nov({"nodo": "a1", "ids": ["T1", "T2"], "ts": AHORA - 60}),
                     self.raiz, informe, AHORA, AHORA - 3600)
        self.assertEqual(s.llamadas, [], "sin cola no se inventa un control")
        self.assertEqual(n.mem["al_volver_pendientes"], ["T1", "T2"])
        self.assertIn("pendiente", informe["al_volver"]["resultado"])

    def test_el_pendiente_se_reintenta_aunque_la_vuelta_este_fresca_y_baja_al_salir(self):
        s, p = SoltarFalso(fallo=True), PuntosFalso()
        n = self.nodo(soltar=s, puntos=p)
        n._al_volver(self.salud, self.nov({"nodo": "a1", "ids": ["T1", "T2"], "ts": AHORA - 60}),
                     self.raiz, {"acciones": []}, AHORA, AHORA - 3600)
        self.assertEqual(n.mem["al_volver_pendientes"], ["T1", "T2"], "no quedó escrito: pendiente")
        s.fallo = False
        informe2 = {"acciones": []}
        # La vuelta es FRESCA (se latió recién): lo que dispara ahora es el pendiente, no el silencio.
        n._al_volver(self.salud, self.nov({"nodo": "a1", "ids": ["T1", "T2"], "ts": AHORA - 60}),
                     self.raiz, informe2, AHORA, AHORA - 100)
        self.assertEqual(len(s.llamadas), 2)
        self.assertIsNone(n.mem.get("al_volver_pendientes"))
        self.assertIn("soltar escrito", informe2["al_volver"]["resultado"])
        self.assertEqual(len([d for d in n.mem["decisiones"] if d.get("accion") == "al_volver"]), 1,
                         "mismo soltar: una decisión, no dos aviso duplicados")

    def test_el_pendiente_que_ya_no_esta_en_curso_se_descarta(self):
        n = self.nodo(soltar=SoltarFalso(), memoria={"al_volver_pendientes": ["T-viejo"]})
        n._al_volver(self.salud, self.nov({"nodo": "a1", "ids": ["T1"], "ts": AHORA - 60}),
                     self.raiz, {"acciones": []}, AHORA, AHORA - 3600)
        self.assertNotIn("T-viejo", n.mem.get("al_volver_pendientes") or [],
                         "ya no está en mi curso: no hay nada que soltar de ella")

    def test_dos_vueltas_iguales_repiten_la_orden_pero_no_la_decision(self):
        s, p = SoltarFalso(), PuntosFalso()
        nov = self.nov({"nodo": "a1", "ids": ["T1", "T2"], "ts": AHORA - 60})
        n = self.nodo(soltar=s, puntos=p)
        n._al_volver(self.salud, nov, self.raiz, {"acciones": []}, AHORA, AHORA - 3600)
        n._al_volver(self.salud, nov, self.raiz, {"acciones": []}, AHORA, AHORA - 3600)
        self.assertEqual(len(s.llamadas), 2, "la orden se reescribe por su ventana: mismo contenido")
        self.assertEqual(len([d for d in n.mem["decisiones"] if d.get("accion") == "al_volver"]), 1)

    def test_el_soltar_real_escribe_el_control_de_cola_en_el_disco(self):
        p, informe = PuntosFalso(), {"acciones": []}
        n = self.nodo(puntos=p)  # sin inyectar el soltar: va la vía real, con cerrojos parcheados
        with unittest.mock.patch.object(NM, "CERROJOS_NODO", os.path.join(self.tmp, "cerrojos")):
            n._al_volver(self.salud, self.nov({"nodo": "a1", "ids": ["T1", "T2"], "ts": AHORA - 60}),
                         self.raiz, informe, AHORA, AHORA - 3600)
        with open(self.control, encoding="utf-8") as f:
            datos = json.load(f)
        self.assertEqual(set(datos), {"T1", "T2"})
        self.assertEqual(datos["T1"]["accion"], "soltar")
        self.assertEqual(datos["T1"]["donde"], "a1")
        self.assertEqual(datos["T2"]["donde"], "a1")
        self.assertEqual(datos["T1"]["quien"], "mac-1")
        self.assertTrue(datos["T1"].get("t"), "la orden lleva su marca de tiempo")

    def test_el_envio_acepta_las_dos_firmas_de_enviar_puntos(self):
        vistos = []

        def fn(*a):
            if len(a) == 1:
                raise TypeError("me faltó el nodo")
            vistos.append(list(a))
            return True

        n = self.nodo(puntos=fn)
        self.assertTrue(n._enviar_puntos_fuera({"T1": {"rama": "r", "sha": "s", "t": 1.0}}))
        self.assertEqual(vistos, [["mac-1", {"T1": {"rama": "r", "sha": "s", "t": 1.0}}]])

    def test_sin_funcion_de_envio_aplicada_responde_false_honesto(self):
        with unittest.mock.patch.dict(sys.modules, {"oracle_nodo": types.SimpleNamespace()}):
            self.assertFalse(self.nodo()._enviar_puntos_fuera({"T1": {"rama": "r", "sha": "s", "t": 1.0}}),
                             "COL1012E aún no está: False, y el soltar sigue por su cuenta")


class TestVueltaEntera(unittest.TestCase):
    """La vuelta completa contra el Supabase simulado: el soltar sale por la vía REAL (disco temporal)."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="colmena-volver-")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.raiz = os.path.join(self.tmp, "raiz")
        self.olas = os.path.join(self.raiz, "starseed_memory_root", "olas")
        os.makedirs(self.olas, exist_ok=True)
        self.reloj = Reloj()
        self.reloj.t = AHORA
        self.sb = SupabaseSimulado(self.reloj)
        self.mf = MedioFalso(medio="mac", autoritativo=True, orqs=["cola-volver-x"])
        self.en_curso = [{"id": "T1", "fase": "escribiendo",
                          "punto": {"rama": "ola/T1", "sha": "p1", "t": AHORA - 100}},
                         {"id": "T2", "fase": "tsc", "punto": None}]

        def medir(modo, t):
            m = self.mf.medir(modo, t)
            m["raiz"] = self.raiz
            m["salud"]["en_curso"] = self.en_curso
            return m

        escribe(os.path.join(self.olas, "latidos-cola-volver-x.json"),
                {"tareas": {"T1": {"fase": "escribiendo"}, "T2": {"fase": "tsc"}}})
        escribe(os.path.join(self.olas, "puntos-control.json"),
                {"T1": {"rama": "ola/T1", "sha": "p1", "t": AHORA - 100}})
        self.puntos = PuntosFalso()
        self.n = NM.Nodo(seco=False, sin_red=False, env=dict(ENV), medir=medir, ejecutar=self.mf.ejecutar,
                         http=self.sb, reloj=self.reloj,
                         memoria={"hecho": {}, "nonces": {}, "decisiones": [], "autonomia": True,
                                  "ultimo_latido": AHORA - 7200},
                         persistir=False, huella="huella-volver", llave="",
                         enviar_puntos=self.puntos)

    def test_al_volver_en_la_vuelta_media_deja_la_orden_en_el_disco(self):
        # El líder del bus asignó mi maka a un sucesor mientras este aparato ya no latía: eso leo al llegar.
        self.sb.filas.append({"id": 1, "t": B.iso(AHORA - 60), "quien": "prueba", "tipo": L.T_ASIGNACION,
                              "tarea": None, "texto": "asignada",
                              "datos": {"v": L.VERSION, "nodo": "a1-otro", "por": "prueba",
                                        "ids": ["T1", "T2"], "ts": AHORA - 60}})
        with unittest.mock.patch.object(NM, "CERROJOS_NODO", os.path.join(self.tmp, "cerrojos")):
            informe = self.n.vuelta()
        al = informe["al_volver"]
        self.assertEqual(al["soltar"], ["T1", "T2"])
        self.assertEqual(self.puntos.llamadas, [[{"T1": {"rama": "ola/T1", "sha": "p1", "t": AHORA - 100}}]])
        with open(os.path.join(self.olas, "control-cola-volver-x.json"), encoding="utf-8") as f:
            control = json.load(f)
        self.assertEqual({tid: o["donde"] for tid, o in control.items()}, {"T1": "a1-otro", "T2": "a1-otro"})
        self.assertEqual(control["T1"]["accion"], "soltar")
        # La vuelta fresca (60 s más tarde, bien dentro del silencio) no repite nada: no sale pendiente.
        self.reloj.t += 60
        with unittest.mock.patch.object(NM, "CERROJOS_NODO", os.path.join(self.tmp, "cerrojos")):
            informe2 = self.n.vuelta()
        self.assertNotIn("al_volver", informe2)
        self.assertEqual(len([d for d in self.n.mem["decisiones"] if d.get("accion") == "al_volver"]), 1)


if __name__ == "__main__":
    unittest.main()
