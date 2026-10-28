# -*- coding: utf-8 -*-
"""Pruebas del vigía de RESULTADOS del nodo de MetaGenesis (OPA1011b, 2026-10-10 tarde).

Alex: «de nuevo hay muchas bloqueadas, fallidas y sin publicar que no se procesaron automáticamente».
El líder decía «nada que hacer» porque solo miraba si los directores estaban vivos. Aquí se prueba que
ahora mide si el trabajo AVANZA y actúa: presta trabajo al medio ocioso sin duplicarlo, convierte una
puerta de publicación en rojo en una tarea de reparación con su salida exacta y avisa una sola vez.
Sin red ni ~/.starseed: el mismo Supabase simulado y el mismo medio falso que test_nodo_metagenesis.
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

import nodo_metagenesis as N  # noqa: E402
import nodo_metagenesis_logica as L  # noqa: E402
import nodo_metagenesis_medio as M  # noqa: E402
from test_nodo_metagenesis import (  # noqa: E402
    ENV, SECRETO, T0, MedioFalso, Reloj, SupabaseSimulado, medida, nodo)

CLAVE_FALSA = "sk-" + "p" * 24  # se monta en tiempo de ejecución (protección de secretos de GitHub)


def hora(t):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t))


#: La salida REAL de las pruebas del puente que vetó 17cf6a67 a las 14:28 (recortada).
SALIDA_1428 = """ERROR: test_un_fallo_no_tumba_el_ciclo (test_oracle_nodo.MedidorEnElCiclo.test_un_fallo_no_tumba_el_ciclo)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/Users/alex/Documents/starseed-os-main/scripts/puente/test_oracle_nodo.py", line 236, in test_un_fallo_no_tumba_el_ciclo
    self.assertIn("error", N.medir_oracle(Roto))
AttributeError: module 'oracle_nodo' has no attribute 'medir_oracle'. Did you mean: 'marcar_oracle'?
----------------------------------------------------------------------
Ran 2451 tests in 44.336s

FAILED (errors=3, skipped=1)
"""

SALIDA_CI = """src/lib/protomolecula/orbe-bus.ts(41,7): error TS2322: Type 'string' is not assignable to type 'number'.
 FAIL  src/lib/protomolecula/__tests__/orbe-bus.test.ts > emite la posición
"""


def tarea(tid, archivos=("src/a.ts",), prompt="haz algo", **mas):
    return dict({"id": tid, "titulo": "t " + tid, "archivos": list(archivos), "prompt": prompt, "depende": []}, **mas)


def pub(activa=True, fase="bloqueado", detalle="pruebas del puente en rojo · espero a que llegue un commit nuevo",
        sin_publicar=8, evidencia=SALIDA_1428, desde=None):
    p = {"activa": activa, "fase": fase, "detalle": detalle, "sha": "17cf6a67c1ec", "sin_publicar": sin_publicar,
         "evidencia": ({"sha": "17cf6a67c1ec", "motivo": "pruebas del puente en rojo", "texto": evidencia}
                       if evidencia else None)}
    if desde is not None:
        p["desde"] = desde
    return p


# ─── lógica pura ─────────────────────────────────────────────────────────────────────────


class TestCadenasYFallidas(unittest.TestCase):
    def test_base_de_tarea(self):
        self.assertEqual(L.base_de_tarea("CPA1007Kb-d1b"), "CPA1007K")
        self.assertEqual(L.base_de_tarea("S1010-TU-LL1c"), "S1010-TU-LL1")
        self.assertEqual(L.base_de_tarea("OPO1011T1"), "OPO1011T1")
        self.assertEqual(L.base_de_tarea("MGP1010-7F3A2C"), "MGP1010-7F3A2C")

    def test_fallidas_que_nadie_retoma(self):
        ahora = T0
        prog = {
            "A1": {"estado": "fallo_tsc", "t": hora(ahora - 3 * 3600)},          # nadie la retoma
            "B1": {"estado": "fallo", "t": hora(ahora - 3600)},
            "B1b": {"estado": "pendiente", "t": hora(ahora - 600)},              # su sucesora sigue viva
            "C1": {"estado": "fallo_tests", "t": hora(ahora - 3600)},
            "C1b": {"estado": "rechazada", "t": hora(ahora - 600)},              # una rechazada no la retoma
            "D1": {"estado": "fallo", "t": hora(ahora - 3600)},                  # ya en main
            "E1": {"estado": "fallo", "t": hora(ahora - 3600), "sustituida_por": "E2"},
            "F1": {"estado": "fallo", "t": hora(ahora - 5 * 86400)},             # fuera de la ventana
            "G1": {"estado": "commit", "t": hora(ahora - 60)},
        }
        f = L.fallidas_sin_resolver(prog, ["Ola 1 · D1: hecha"], ahora)
        self.assertEqual([x["id"] for x in f], ["A1", "C1"])  # la más vieja primero
        self.assertEqual(f[0]["hace_s"], 3 * 3600)

    def test_visto_bueno_e_integraciones(self):
        prog = {"V1": {"estado": "pendiente_aprobacion", "t": hora(T0 - 4 * 3600)},
                "V2": {"estado": "esperando_aprobacion", "t": hora(T0 - 600)},
                # Lo que medimos el 10-10: una copia vieja con su sucesora ya en marcha y otra ya en main.
                "CNS1010Mb": {"estado": "pendiente_aprobacion", "t": hora(T0 - 6 * 3600)},
                "CNS1010Mc": {"estado": "pendiente", "t": hora(T0 - 3600)},
                "S1010-TU-LL1c": {"estado": "pendiente_aprobacion", "t": hora(T0 - 3600)}}
        asuntos = ["Ola 1010S · Transporte · S1010-TU-LL1c: Canal de señalización"]
        self.assertEqual([x["id"] for x in L.esperando_visto_bueno(prog, T0, asuntos)], ["V1", "V2"])
        self.assertTrue(L.es_integracion("Ola 1010S · Transporte · S1010-TU-LL1c: Canal de señalización"))
        self.assertFalse(L.es_integracion("salvavidas · S1010-TU-LL1c: trabajo del agente"))
        self.assertFalse(L.es_integracion("Nodo de MetaGenesis: algo (OPA1011)"))


class TestPublicacion(unittest.TestCase):
    def test_motivo_y_firma_sin_sha_ni_coletilla(self):
        a = {"fase": "bloqueado", "detalle": "pruebas del puente en rojo"}
        b = {"fase": "bloqueado", "detalle": "pruebas del puente en rojo · espero a que llegue un commit nuevo"}
        self.assertEqual(L.firma_publicacion(a), L.firma_publicacion(b))
        self.assertEqual(L.motivo_publicacion("Vetado (17cf6a67c1) desde Genesis"), "Vetado () desde Genesis")

    def test_clase_de_publicacion(self):
        self.assertEqual(L.clase_publicacion(pub()), "reparar")
        self.assertEqual(L.clase_publicacion(pub(evidencia=None)), "avisar")
        self.assertEqual(L.clase_publicacion(pub(detalle="análisis: posible secreto (sk) en x.py")), "avisar")
        self.assertEqual(L.clase_publicacion(pub(detalle="Jev frenó el lote (seguro al 97 %)")), "avisar")
        self.assertIsNone(L.clase_publicacion(pub(detalle="Vetado desde Genesis: espero un commit nuevo.")))
        self.assertIsNone(L.clase_publicacion(pub(activa=False)), "apagada: decisión de Alex")
        self.assertIsNone(L.clase_publicacion(pub(sin_publicar=0)))
        self.assertIsNone(L.clase_publicacion(pub(fase="ci")))

    def test_rutas_de_la_salida_real(self):
        self.assertEqual(L.rutas_de_evidencia(SALIDA_1428), ["scripts/puente/test_oracle_nodo.py"])
        self.assertEqual(L.rutas_de_evidencia(SALIDA_CI),
                         ["src/lib/protomolecula/orbe-bus.ts", "src/lib/protomolecula/__tests__/orbe-bus.test.ts"])
        self.assertEqual(L.rutas_de_evidencia("nada que ver"), [])
        guardia = (" FAIL  src/lib/astraura-bots/__tests__/pureza.test.ts > núcleo puro de los bots de Astraura > "
                   "sincronia-bots.ts: solo importa del propio núcleo y del núcleo del OS\n"
                   "AssertionError: expected '@/utils/supabase/client' to match /^(\\.\\/)/\n")
        self.assertEqual(L.rutas_de_evidencia(guardia),  # (2026-10-14) el culpable, no solo la guardia
                         ["src/lib/astraura-bots/sincronia-bots.ts", "src/lib/astraura-bots/__tests__/pureza.test.ts"])

    def test_tarea_de_reparacion(self):
        p = pub(evidencia=SALIDA_1428 + "\nclave filtrada: " + CLAVE_FALSA)
        t = L.tarea_de_reparacion(p, ["scripts/puente/test_oracle_nodo.py", "scripts/puente/oracle_nodo.py"], T0)
        self.assertRegex(t["id"], r"^MGP\d{4}-[0-9A-F]{6}$")
        self.assertEqual(t["archivos"], ["scripts/puente/test_oracle_nodo.py", "scripts/puente/oracle_nodo.py"])
        self.assertEqual(t["origen"], "metagenesis")
        self.assertIn("medir_oracle", t["prompt"])                       # la salida EXACTA va en el prompt
        self.assertIn("python3 -m unittest scripts/puente/test_oracle_nodo.py", t["prompt"])
        self.assertNotIn(CLAVE_FALSA, t["prompt"])                        # nunca una clave al enjambre
        self.assertIn("No toques autopublicar.py", t["prompt"])
        # Misma puerta, mismo commit, mismos archivos → mismo id (no se repite).
        self.assertEqual(t["id"], L.tarea_de_reparacion(p, t["archivos"], T0)["id"])
        self.assertIsNone(L.tarea_de_reparacion(p, [], T0))
        self.assertIsNone(L.tarea_de_reparacion(pub(evidencia=None), ["a.py"], T0))


class TestReparto(unittest.TestCase):
    def test_presta_el_final_del_orden_y_las_de_metagenesis_primero(self):
        cands = [tarea("R1"), tarea("R2"), tarea("R3"), tarea("R4"), tarea("R5"),
                 tarea("MGP1010-AAAAAA", origen="metagenesis")]
        self.assertEqual([t["id"] for t in L.elegir_reparto(cands, set(), 3)], ["MGP1010-AAAAAA", "R5", "R4"])
        self.assertEqual([t["id"] for t in L.elegir_reparto(cands, {"R5", "MGP1010-AAAAAA"}, 2)], ["R4", "R3"])

    def test_una_sola_tarea_por_cadena_y_la_mas_reciente(self):
        cands = [tarea("RTOPO1011T1b"), tarea("RTOPO1011T1"), tarea("S1010-EV-WIDGET")]
        self.assertEqual([t["id"] for t in L.elegir_reparto(cands, set(), 4)], ["S1010-EV-WIDGET", "RTOPO1011T1b"])
        # Si un eslabón de la cadena ya está prestado, no va otro.
        self.assertEqual([t["id"] for t in L.elegir_reparto(cands, {"RTOPO1011T1"}, 4)], ["S1010-EV-WIDGET"])

    def test_solo_lo_que_otro_medio_puede_hacer(self):
        self.assertFalse(L.prestable(tarea("X", archivos=("a", "b", "c", "d"))))
        self.assertFalse(L.prestable(tarea("X", archivos=())))
        self.assertFalse(L.prestable(tarea("X", aprobacion=True)))
        self.assertFalse(L.prestable(tarea("X", medio="mac")))
        self.assertFalse(L.prestable(tarea("X", prompt="abre el navegador de la fundación")))
        self.assertFalse(L.prestable(tarea("X", prompt="instala el servicio de launchd")))
        self.assertFalse(L.prestable(tarea("X", prompt="  ")))
        self.assertTrue(L.prestable(tarea("X")))

    def test_medio_ocioso(self):
        a1 = {"modo": "real", "secreto": True, "salud": dict(medida(medio="oracle-a1", autoritativo=False)["salud"],
                                                            a1={"fase": "espera", "cola": "", "orquestador_vivo": False})}
        self.assertEqual(L.medio_ocioso("oracle-a1-bbbbbb", a1), (True, ""))
        ocupado = json.loads(json.dumps(a1))
        ocupado["salud"]["a1"]["fase"] = "cola"
        self.assertFalse(L.medio_ocioso("x", ocupado)[0])
        guardian = json.loads(json.dumps(a1))
        guardian["salud"]["a1"]["fase"] = "guardian"
        self.assertTrue(L.medio_ocioso("x", guardian)[0], "el guardián cede la máquina a una cola")
        sin_secreto = dict(a1, secreto=False)
        self.assertFalse(L.medio_ocioso("x", sin_secreto)[0])
        mac = {"modo": "real", "secreto": True, "salud": medida()["salud"]}
        self.assertFalse(L.medio_ocioso("mac-aaaaaa", mac)[0], "la Mac no se presta a sí misma")
        seco = dict(a1, modo="seco")
        self.assertFalse(L.medio_ocioso("x", seco)[0])

    def test_orden_repartir_valida(self):
        self.assertIsNone(L.args_validos("repartir", {"destino": "oracle-a1-bbbbbb", "tope": 4}))
        self.assertEqual(L.args_validos("repartir", {"destino": "Oracle A1!"}), "valor no admitido en destino")
        self.assertEqual(L.args_validos("repartir", {"destino": "oracle-a1-bbbbbb", "tope": 50}), "tope fuera de 1–8")


class TestPlanResultados(unittest.TestCase):
    def mundo(self, listas=10, resultados=None, a1_fase="espera", **salud):
        mac = medida(listas=listas, orqs=["cola-auto-1009"], **salud)["salud"]
        mac["resultados"] = resultados or {}
        a1 = dict(medida(medio="oracle-a1", autoritativo=False)["salud"], a1={"fase": a1_fase, "cola": ""})
        return {"nodos": {"mac-aaaaaa": {"nodo": "mac-aaaaaa", "modo": "real", "puntos": 1500, "ts": T0, "secreto": True,
                                         "salud": mac},
                          "oracle-a1-bbbbbb": {"nodo": "oracle-a1-bbbbbb", "modo": "real", "puntos": 1290, "ts": T0,
                                               "secreto": True, "salud": a1}},
                "yo": "mac-aaaaaa", "autonomia": True}

    def acciones(self, m, memoria=None, ahora=T0):
        return [(a["accion"], a["nodo"], a["args"].get("destino")) for a in L.planificar(m, memoria or {"hecho": {}}, ahora)]

    def test_presta_al_a1_ocioso_con_muchas_listas(self):
        self.assertEqual(self.acciones(self.mundo()), [("repartir", "mac-aaaaaa", "oracle-a1-bbbbbb")])
        self.assertEqual(self.acciones(self.mundo(listas=3)), [], "pocas listas: la Mac llega sola")
        self.assertEqual(self.acciones(self.mundo(a1_fase="cola")), [], "el A1 ya trabaja una cola")
        m = self.mundo()
        m["nodos"]["mac-aaaaaa"]["salud"]["nube_pausada"] = True
        self.assertEqual(self.acciones(m), [], "Alex pausó la nube")
        m = self.mundo()
        m["nodos"]["mac-aaaaaa"]["salud"]["pausado"] = True
        self.assertEqual(self.acciones(m), [], "Alex pausó a los directores")
        # Enfriamiento de 30 min.
        plan = L.planificar(self.mundo(), {"hecho": {}}, T0)
        self.assertEqual(L.planificar(self.mundo(), {"hecho": {plan[0]["clave"]: T0}}, T0 + 600), [])

    def test_publicacion_roja_una_hora_se_repara_si_hay_salida(self):
        r = {"publicacion": pub(desde=T0 - 1800)}
        self.assertEqual(self.acciones(self.mundo(listas=0, resultados=r)), [], "aún no lleva una hora")
        r = {"publicacion": pub(desde=T0 - 3700)}
        self.assertEqual(self.acciones(self.mundo(listas=0, resultados=r)),
                         [("reparar_publicacion", "mac-aaaaaa", "oracle-a1-bbbbbb")])
        r = {"publicacion": pub(desde=T0 - 3700, detalle="análisis: posible secreto (variable-entorno) en x.ts")}
        acc = L.planificar(self.mundo(listas=0, resultados=r), {"hecho": {}}, T0)
        self.assertEqual([a["accion"] for a in acc], ["avisar"])
        self.assertIn("falso positivo del escáner", acc[0]["args"]["texto"])
        r = {"publicacion": pub(desde=T0 - 9999, detalle="Vetado desde Genesis: espero un commit nuevo.")}
        self.assertEqual(self.acciones(self.mundo(listas=0, resultados=r)), [], "un veto de Alex no se toca")

    def test_fallidas_y_visto_bueno_que_llevan_horas(self):
        r = {"fallidas": [{"id": "A1", "estado": "fallo_tsc", "hace_s": 3 * 3600}, {"id": "B1", "estado": "fallo", "hace_s": 60}],
             "n_fallidas": 2, "visto_bueno": [{"id": "V1", "hace_s": 4 * 3600}], "n_visto_bueno": 1}
        acc = L.planificar(self.mundo(listas=0, resultados=r), {"hecho": {}}, T0)
        self.assertEqual([a["accion"] for a in acc], ["avisar", "avisar"])
        self.assertIn("A1 (fallo_tsc, hace 3 h 00 min)", acc[0]["args"]["texto"])
        self.assertNotIn("B1", acc[0]["args"]["texto"])
        self.assertIn("V1", acc[1]["args"]["texto"])
        # El revisor parado con fallidas (sin bloqueadas) también se despierta.
        r2 = {"fallidas": [{"id": "B1", "estado": "fallo", "hace_s": 60}], "n_fallidas": 1}
        m = self.mundo(listas=0, resultados=r2, revisor_vivo=False, revisor_hace_s=3600)
        self.assertEqual([a["accion"] for a in L.planificar(m, {"hecho": {}}, T0)], ["revisar_bloqueadas"])

    def test_pastillas_de_la_foto(self):
        r = {"fallidas": [{"id": "A1", "hace_s": 7200}], "n_fallidas": 1, "integradas_2h": 3,
             "publicacion": pub(), "visto_bueno": []}
        m = L.medidores_de_resultados(r, [{"ids": ["R5", "R4"], "destino": "oracle-a1-bbbbbb", "ts": T0 - 60}], T0)
        self.assertEqual(m["fallidas"], "1 sin resolver · la más vieja hace 2 h 00 min")
        self.assertEqual(m["integradas"], "3 en las últimas 2 h")
        self.assertEqual(m["sin-publicar"], "8 commit(s) · autopublicación: bloqueado (pruebas del puente en rojo)")
        self.assertEqual(m["prestadas"], "2 en oracle-a1-bbbbbb")
        self.assertNotIn("visto-bueno", m)
        self.assertEqual(L.medidores_de_resultados({}, [], T0)["fallidas"], "ninguna sin resolver en 3 días")


# ─── vigía de modelos (VGM1016F) ─────────────────────────────────────────────────────────


def latido_vigia(nid, medio, modo="real", carga=None, fase=None, ultima=None, red=None, orqs=()):
    """Latido mínimo para las reglas del vigía: carga, A1 y «última pasada» puestos a mano."""
    s = {"repo": True, "orquestador": True, "orquestadores": list(orqs), "disco_gb": 50.0, "ram_libre_mb": 2048}
    if carga is not None:
        s["carga"] = carga
    if medio == "oracle-a1" or fase is not None:
        s["a1"] = {"fase": fase or "espera", "cola": "", "orquestador_vivo": False}
    if ultima is not None:
        s["vigia_modelos"] = {"ultima": ultima}
    if red is not None:
        s["red"] = red
    return {"nodo": nid, "medio": medio, "modo": modo, "ts": T0, "salud": s}


def mundo_vigia(*latidos, foto_ultima=None):
    """El mundo del líder con los latidos dados y, si toca, el dato de la foto."""
    m = {"nodos": {l["nodo"]: l for l in latidos}, "yo": latidos[0]["nodo"] if latidos else "x", "autonomia": True}
    if foto_ultima is not None:
        m["vigia_modelos"] = {"ultima": foto_ultima}
    return m


class TestVigiaModelos(unittest.TestCase):
    def acciones(self, m, memoria=None, ahora=T0):
        return [(a["accion"], a["nodo"]) for a in L.planificar(m, memoria or {"hecho": {}}, ahora)]

    def test_toca_con_la_ultima_pasada_vieja_y_elige_al_a1_libre(self):
        a1 = latido_vigia("oracle-a1-bbbbbb", "oracle-a1", carga=0.1, ultima=T0 - 21 * 3600)
        mac = latido_vigia("mac-aaaaaa", "mac", carga=3.5, ultima=T0 - 21 * 3600)
        self.assertEqual(self.acciones(mundo_vigia(mac, a1)), [("vigia_modelos", "oracle-a1-bbbbbb")])
        plan = L.planificar(mundo_vigia(mac, a1), {"hecho": {}}, T0)
        self.assertIn("hace 21 h 00 min", plan[0]["motivo"])
        self.assertIn("el A1, que está libre", plan[0]["motivo"])
        self.assertEqual(plan[0]["clave"], "vigia_modelos")
        self.assertEqual(plan[0]["espera_s"], L.VIGIA_REINTENTO_S)

    def test_no_toca_con_la_ultima_reciente_o_sin_dato(self):
        a1 = latido_vigia("oracle-a1-bbbbbb", "oracle-a1", ultima=T0 - 2 * 3600)
        self.assertEqual(self.acciones(mundo_vigia(a1)), [], "reciente: aún no toca")
        borde = latido_vigia("oracle-a1-bbbbbb", "oracle-a1", ultima=T0 - L.VIGIA_ESPERA_S)
        self.assertEqual(len(self.acciones(mundo_vigia(borde))), 1, "exactamente 20 h: toca")
        self.assertEqual(self.acciones(mundo_vigia(latido_vigia("mac-aaaaaa", "mac"))), [],
                         "sin dato en la foto ni en los nodos: el líder no inventa")

    def test_la_mas_reciente_de_foto_y_nodos_manda(self):
        a1 = latido_vigia("oracle-a1-bbbbbb", "oracle-a1", ultima=T0 - 21 * 3600)
        self.assertEqual(self.acciones(mundo_vigia(a1, foto_ultima=T0 - 3600)), [],
                         "la foto sabe de una pasada de hace 1 h: no toca")
        self.assertEqual(self.acciones(mundo_vigia(a1, foto_ultima=T0 - 30 * 3600)),
                         [("vigia_modelos", "oracle-a1-bbbbbb")], "la foto es aún más vieja: toca")
        iso = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(T0 - 21 * 3600))
        self.assertEqual(L.ultima_pasada_vigia(mundo_vigia(a1, foto_ultima=iso)), T0 - 21 * 3600)
        self.assertIsNone(L.ultima_pasada_vigia({}))

    def test_a_quien(self):
        mac = latido_vigia("mac-aaaaaa", "mac", carga=0.0)
        # El A1 libre gana aunque otro esté aún más parado (§6: el A1, 24/7, primero).
        a1 = latido_vigia("oracle-a1-bbbbbb", "oracle-a1", carga=1.0)
        self.assertEqual(L.medio_para_vigia({"mac-aaaaaa": mac, "oracle-a1-bbbbbb": a1}), "oracle-a1-bbbbbb")
        # A1 ocupado (su medio del enjambre en cola): la Mac libre.
        a1_ocupado = latido_vigia("oracle-a1-bbbbbb", "oracle-a1", carga=0.0, fase="cola")
        self.assertEqual(L.medio_para_vigia({"mac-aaaaaa": mac, "oracle-a1-bbbbbb": a1_ocupado}), "mac-aaaaaa")
        # Nadie libre: el de menos carga con red (la pasada es ligera, pero el criterio es ése).
        mac_ocupada = latido_vigia("mac-aaaaaa", "mac", carga=4.0, orqs=[{"pid": 1, "cola": "cola-x"}])
        self.assertEqual(L.medio_para_vigia({"mac-aaaaaa": mac_ocupada, "oracle-a1-bbbbbb": a1_ocupado}),
                         "oracle-a1-bbbbbb")
        # Un nodo seco o que declara «sin red» no se la lleva nunca.
        seco = latido_vigia("nube-cccccc", "nube-cowork", modo="seco", carga=0.0)
        sin_red = latido_vigia("mac-aaaaaa", "mac", carga=0.0, red=False)
        self.assertIsNone(L.medio_para_vigia({"mac-aaaaaa": sin_red, "nube-cccccc": seco}))
        self.assertIsNone(L.medio_para_vigia({}))

    def test_una_sola_clave_de_enfriamiento_nunca_dos_a_la_vez(self):
        a1 = latido_vigia("oracle-a1-bbbbbb", "oracle-a1", ultima=T0 - 21 * 3600)
        m = mundo_vigia(a1)
        self.assertEqual(self.acciones(m, {"hecho": {"vigia_modelos": T0}}), [], "encargada hace un rato")
        # Aunque el destino cambie entre vueltas, la MISMA clave sigue enfriando.
        self.assertEqual(self.acciones(m, {"hecho": {"vigia_modelos": T0 - 3600}}), [])
        self.assertEqual(self.acciones(m, {"hecho": {"vigia_modelos": T0 - 3 * 3600}}),
                         [("vigia_modelos", "oracle-a1-bbbbbb")], "pasado el enfriamiento, se vuelve a pedir")

    def test_la_orden_al_destino_pasa_la_validacion(self):
        self.assertIsNone(L.args_validos("vigia_modelos", {}))
        o = {"v": "1", "accion": "vigia_modelos", "para": "oracle-a1-bbbbbb",
             "t": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(T0)), "nonce": "nonce-vigia-000001",
             "por": "lider:mac-aaaaaa", "args": {}}
        o["firma"] = L.firmar(o, SECRETO)
        ok, motivo = L.validar_orden(o, SECRETO, T0, {})
        self.assertTrue(ok, motivo)
        self.assertTrue(L.es_para_mi(o, "oracle-a1-bbbbbb", "oracle-a1", soy_lider=False))


# ─── el nodo en el bus ───────────────────────────────────────────────────────────────────


class MedioConResultados(MedioFalso):
    def __init__(self, resultados=None, a1=None, **kw):
        super().__init__(**kw)
        self.resultados = resultados
        self.a1 = a1

    def medir(self, modo, t):
        m = super().medir(modo, t)
        if self.resultados is not None:
            m["salud"]["resultados"] = json.loads(json.dumps(self.resultados))
        if self.a1 is not None:
            m["salud"]["a1"] = dict(self.a1)
        return m


class TestNodoResultados(unittest.TestCase):
    def setUp(self):
        self.reloj = Reloj()
        self.sb = SupabaseSimulado(self.reloj)
        self.chat = []
        self.enlistadas = []
        self.cands = [tarea("R%d" % i) for i in range(1, 11)]
        self.mac_m = MedioConResultados(medio="mac", autoritativo=True, listas=10, orqs=["cola-auto-1009"],
                                        resultados={"fallidas": [], "n_fallidas": 0, "integradas_2h": 1})
        self.a1_m = MedioConResultados(medio="oracle-a1", autoritativo=False,
                                       a1={"fase": "espera", "cola": "", "orquestador_vivo": False})

    def nodo_mac(self, seco=False):
        n = nodo(self.sb, self.reloj, self.mac_m, "huella-mac", seco=seco, chat=self.chat.append)
        n._candidatos = lambda raiz: list(self.cands)
        n._enlistar = lambda raiz, t, delante, ahora: (self.enlistadas.append((t, delante)) or ("hecha", "enlistada"))
        n._existentes = lambda raiz, rutas: list(rutas)
        return n

    def vuelta(self, *nodos, avanzar=120):
        res = [n.vuelta() for n in nodos]
        self.reloj.t += avanzar
        return res

    def test_la_mac_presta_al_a1_ocioso_y_el_a1_lo_recibe_sin_duplicar(self):
        mac = self.nodo_mac()
        a1 = nodo(self.sb, self.reloj, self.a1_m, "huella-a1")
        for _ in range(2):
            self.vuelta(mac, a1)
        ordenes = [f["datos"] for f in self.sb.de_tipo("mg_orden")]
        self.assertEqual(len(ordenes), 1, "un solo préstamo")
        o = ordenes[0]
        self.assertEqual((o["accion"], o["para"]), ("lanzar_cola", a1.yo))
        self.assertEqual([t["id"] for t in o["tareas"]], ["R10", "R9", "R8", "R7"], "las del FINAL del orden")
        self.assertEqual(o["args"]["tareas_sha"], L.huella_tareas(o["tareas"]))
        self.assertEqual(self.sb.de_tipo("mg_asignacion")[-1]["datos"]["ids"], ["R10", "R9", "R8", "R7"])
        lanzadas = [h for h in self.a1_m.hechas if h[0] == "lanzar_cola"]
        self.assertEqual(len(lanzadas), 1, "el A1 la recibe y la deja en su bandeja")
        self.assertEqual([t["id"] for t in lanzadas[0][2]["_tareas"]], ["R10", "R9", "R8", "R7"])
        # Los dos siguen latiendo; en esa media hora no se presta nada más (enfriamiento) y, pasada,
        # con el A1 otra vez libre, el siguiente préstamo no repite ninguna.
        for _ in range(int(L.REPARTO_ESPERA_S / 120) + 1):
            self.vuelta(mac, a1)
        ordenes = [f["datos"] for f in self.sb.de_tipo("mg_orden")]
        self.assertEqual(len(ordenes), 2)
        self.assertEqual([t["id"] for t in ordenes[-1]["tareas"]], ["R6", "R5", "R4", "R3"])
        foto = self.sb.de_tipo("mg_foto")[-1]["datos"]
        self.assertEqual(foto["medidores"]["prestadas"], "8 en %s" % a1.yo)

    def test_modo_seco_dice_que_prestaria_sin_mandar_nada(self):
        mac = self.nodo_mac(seco=True)
        a1 = nodo(self.sb, self.reloj, self.a1_m, "huella-a1")
        i, _ = self.vuelta(mac, a1)
        i, _ = self.vuelta(mac, a1)
        self.assertFalse(self.sb.de_tipo("mg_orden"))
        self.assertTrue(any(a["accion"] == "lanzar_cola" and a["resultado"].startswith("seca") and "R10" in a["motivo"]
                            for a in i["acciones"]), i["acciones"])

    def test_prueba_seca_junto_al_servicio_vivo_no_escribe_nada(self):
        mac = self.nodo_mac()
        a1 = nodo(self.sb, self.reloj, self.a1_m, "huella-a1")
        self.vuelta(mac, a1)
        self.vuelta(mac, a1)
        filas = len(self.sb.filas)
        prueba = N.Nodo(seco=True, solo_leer=True, env=dict(ENV), medir=self.mac_m.medir, ejecutar=self.mac_m.ejecutar,
                        http=self.sb, reloj=self.reloj, memoria={"hecho": {}, "nonces": {}, "decisiones": [], "autonomia": True},
                        persistir=False, huella="huella-mac", chat=self.chat.append)
        prueba._candidatos = lambda raiz: list(self.cands)
        i = prueba.vuelta()
        self.assertEqual(len(self.sb.filas), filas, "ni latido, ni foto, ni órdenes")
        self.assertEqual(i["nodo"], mac.yo, "el mismo medio")
        self.assertTrue(i["soy_lider"], "se puntúa como el medio real, así que se ve dirigiendo")
        prest = [a for a in i["acciones"] if a["accion"] == "lanzar_cola"]
        self.assertTrue(prest and prest[0]["resultado"].startswith("seca"), i["acciones"])
        self.assertIn("mg_latido", prueba.enlace.no_escritas, "lo que habría escrito queda contado, no enviado")

    def test_publicacion_roja_crea_la_reparacion_y_se_la_presta_al_a1(self):
        self.mac_m.kw["listas"] = 0
        self.mac_m.resultados = {"publicacion": pub(), "fallidas": [], "n_fallidas": 0}
        mac = self.nodo_mac()
        a1 = nodo(self.sb, self.reloj, self.a1_m, "huella-a1")
        for _ in range(int(L.PUBLICACION_ROJA_S / 120) - 1):
            self.vuelta(mac, a1)
        self.assertFalse(self.enlistadas, "la primera hora solo se mide")
        for _ in range(3):
            self.vuelta(mac, a1)
        self.assertEqual(len(self.enlistadas), 1)
        t, delante = self.enlistadas[0]
        self.assertEqual(t["archivos"], ["scripts/puente/test_oracle_nodo.py"])
        self.assertFalse(delante, "hay medio ocioso: no se cuela en la tanda de la Mac")
        o = self.sb.de_tipo("mg_orden")[-1]["datos"]
        self.assertEqual([x["id"] for x in o["tareas"]], [t["id"]])
        self.assertTrue(any("He creado la tarea %s" % t["id"] in c for c in self.chat))
        # No se repite en la siguiente vuelta.
        self.vuelta(mac, a1)
        self.assertEqual(len(self.enlistadas), 1)
        # Nada de la salida de la puerta viaja en el latido (puede nombrar rutas del disco).
        latidos = json.dumps([f["datos"] for f in self.sb.de_tipo("mg_latido")], ensure_ascii=False)
        self.assertNotIn("Traceback", latidos)
        self.assertNotIn("/Users/alex", latidos)

    def test_sin_medio_ocioso_va_delante_en_la_tanda(self):
        self.mac_m.kw["listas"] = 0
        self.mac_m.resultados = {"publicacion": pub(desde=None)}
        mac = self.nodo_mac()
        self.vuelta(mac)
        self.reloj.t += L.PUBLICACION_ROJA_S
        self.vuelta(mac)
        self.assertEqual(len(self.enlistadas), 1)
        self.assertTrue(self.enlistadas[0][1], "delante en la tanda viva de la Mac")
        self.assertFalse(self.sb.de_tipo("mg_orden"))

    def test_aviso_de_fallidas_una_sola_vez(self):
        self.mac_m.kw["listas"] = 0
        self.mac_m.resultados = {"fallidas": [{"id": "A1", "estado": "fallo_tsc", "hace_s": 3 * 3600}], "n_fallidas": 1}
        mac = self.nodo_mac()
        for _ in range(4):
            self.vuelta(mac)
        avisos = [c for c in self.chat if "fallidas que nadie retoma" in c]
        self.assertEqual(len(avisos), 1)
        self.assertIn("QUÉ:", avisos[0])
        self.assertIn("CÓMO:", avisos[0])

    def test_un_lider_que_no_es_la_mac_le_pide_el_reparto_por_orden_firmada(self):
        mac = self.nodo_mac()
        mac.mem["no_liderar_hasta"] = T0 + 99999  # cedió el mando: dirige el A1
        a1 = nodo(self.sb, self.reloj, self.a1_m, "huella-a1")
        # El A1 dirige y ve a la Mac con 10 listas; como «ocioso» solo cuenta otro medio: aquí, ninguno.
        # Simulamos un tercer medio ocioso para que la regla dispare y vaya a la Mac por orden.
        otro_m = MedioConResultados(medio="neurona", autoritativo=False)
        otro = nodo(self.sb, self.reloj, otro_m, "huella-otra")
        for _ in range(3):
            self.vuelta(a1, mac, otro)
        pedidas = [f["datos"] for f in self.sb.de_tipo("mg_orden") if f["datos"]["accion"] == "repartir"]
        self.assertTrue(pedidas, "el líder se lo pide a la Mac")
        self.assertEqual(pedidas[0]["para"], mac.yo)
        prestamos = [f["datos"] for f in self.sb.de_tipo("mg_orden") if f["datos"]["accion"] == "lanzar_cola"]
        self.assertTrue(prestamos, "la Mac presta las tareas al medio ocioso")
        self.assertEqual(prestamos[0]["para"], pedidas[0]["args"]["destino"])


# ─── la máquina ──────────────────────────────────────────────────────────────────────────


class TestMedio(unittest.TestCase):
    def test_estado_de_la_publicacion_y_su_evidencia(self):
        with tempfile.TemporaryDirectory() as d:
            prod = os.path.join(d, "produccion")
            os.makedirs(prod)
            with open(os.path.join(prod, "autopublicar.json"), "w") as f:
                json.dump({"activo": True}, f)
            est = {"fase": "bloqueado", "detalle": "pruebas del puente en rojo", "sha": "a" * 40,
                   "evidencia": {"sha": "a" * 40, "motivo": "pruebas del puente en rojo", "texto": SALIDA_1428}}
            with open(os.path.join(prod, "autopublicar-estado.json"), "w") as f:
                json.dump(est, f)
            with mock.patch.object(M, "_sh", return_value=(0, "8\n")):
                p = M.estado_publicacion(d, carpeta=prod)
            self.assertTrue(p["activa"])
            self.assertEqual(p["sin_publicar"], 8)
            self.assertIn("medir_oracle", p["evidencia"]["texto"])
            # Evidencia de OTRO sha (el veto ya es de un commit nuevo): no cuenta.
            est["sha"] = "b" * 40
            with open(os.path.join(prod, "autopublicar-estado.json"), "w") as f:
                json.dump(est, f)
            with open(os.path.join(d, "produccion-pausada.json"), "w") as f:
                json.dump({"pausada": True}, f)
            with mock.patch.object(M, "_sh", return_value=(0, "8\n")):
                p = M.estado_publicacion(d, carpeta=prod)
            self.assertIsNone(p["evidencia"])
            self.assertFalse(p["activa"], "pausada desde la tarjeta Producción")

    def test_enlistar_la_reparacion_delante_en_la_tanda(self):
        with tempfile.TemporaryDirectory() as raiz:
            olas = os.path.join(raiz, "starseed_memory_root", "olas")
            os.makedirs(olas)
            with open(os.path.join(olas, "cola-auto-1009.json"), "w") as f:
                json.dump([tarea("R1"), tarea("R2")], f)
            with open(os.path.join(olas, "progreso.json"), "w") as f:
                json.dump({}, f)
            t = L.tarea_de_reparacion(pub(), ["scripts/puente/test_oracle_nodo.py"], T0)
            with mock.patch.object(M, "cola_viva", return_value="cola-auto-1009.json"):
                estado, texto = M.enlistar_reparacion(raiz, t, True, T0)
                self.assertEqual(estado, "hecha", texto)
                with open(os.path.join(olas, "cola-auto-1009.json")) as f:
                    viva = json.load(f)
                self.assertEqual([x["id"] for x in viva], [t["id"], "R1", "R2"])
                with open(os.path.join(olas, "cola-metagenesis-%s.json" % time.strftime("%Y%m%d", time.localtime(T0)))) as f:
                    fuente = json.load(f)
                self.assertEqual([x["id"] for x in fuente], [t["id"]])
                # Otra vez: ya está en una cola, no se duplica.
                self.assertEqual(M.enlistar_reparacion(raiz, t, True, T0)[0], "nada")

    def test_existentes_no_sale_del_repo(self):
        with tempfile.TemporaryDirectory() as raiz:
            os.makedirs(os.path.join(raiz, "scripts", "puente"))
            open(os.path.join(raiz, "scripts", "puente", "test_x.py"), "w").close()
            self.assertEqual(M.existentes(raiz, ["scripts/puente/test_x.py", "scripts/puente/no.py", "../../etc/passwd"]),
                             ["scripts/puente/test_x.py"])

    def test_candidatos_en_el_orden_de_la_mac_y_sin_empezadas(self):
        with tempfile.TemporaryDirectory() as raiz:
            olas = os.path.join(raiz, "starseed_memory_root", "olas")
            os.makedirs(olas)
            with open(os.path.join(olas, "cola-prueba-1010.json"), "w") as f:
                json.dump([tarea("Q1"), tarea("Q2"), tarea("Q3", depende=["Q9"]), tarea("Q4")], f)
            with open(os.path.join(olas, "progreso.json"), "w") as f:
                json.dump({"Q2": {"estado": "en_curso"}, "Q9": {"estado": "pendiente"}}, f)
            with mock.patch.object(M, "_sh", return_value=(0, "")), mock.patch.object(M, "cola_viva", return_value=None):
                ids = [t["id"] for t in M.candidatos_reparto(raiz)]
            self.assertIn("Q1", ids)
            self.assertIn("Q4", ids)
            self.assertNotIn("Q2", ids, "ya empezada en la Mac")
            self.assertNotIn("Q3", ids, "espera a una dependencia abierta")
            # Con una tanda viva, su orden manda y lo que no está en ella va al final (se presta antes).
            with open(os.path.join(olas, "cola-auto-1009.json"), "w") as f:
                json.dump([tarea("Q4"), tarea("Q1")], f)
            with open(os.path.join(olas, "cola-otra-1010.json"), "w") as f:
                json.dump([tarea("Q5")], f)
            with mock.patch.object(M, "_sh", return_value=(0, "")), \
                    mock.patch.object(M, "cola_viva", return_value="cola-auto-1009.json"):
                cands = M.candidatos_reparto(raiz)
            self.assertEqual([t["id"] for t in cands][:2], ["Q4", "Q1"])
            self.assertEqual([t["id"] for t in L.elegir_reparto(cands, set(), 2)], ["Q5", "Q1"])


if __name__ == "__main__":
    unittest.main()
