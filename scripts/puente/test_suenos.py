# -*- coding: utf-8 -*-
"""Pruebas de la CLI de los sueños profundos (suenos.py) sobre una carpeta temporal:
estado, por-verificar, veredicto, las decisiones de `lanzar` (un solo orquestador) y el
latido de los supervisores Claude."""

import contextlib
import io
import json
import os
import shutil
import sys
import tempfile
import time
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIRECTORIO)

import suenos as S  # noqa: E402
import latido_externo as L  # noqa: E402

SESION = "2026-09-29"


def hallazgo(titulo, impacto=3, esfuerzo=2, confianza=0.8, linea=10):
    return {
        "clave": titulo.lower(),
        "titulo": titulo,
        "seccion": "mejora",
        "archivo": "scripts/puente/x.py",
        "linea": linea,
        "impacto": impacto,
        "esfuerzo": esfuerzo,
        "confianza": confianza,
        "detalle": "d",
        "propuesta": {
            "titulo": "p",
            "archivos": ["scripts/puente/x.py"],
            "cambio": "c",
        },
    }


class Base(unittest.TestCase):
    def setUp(self):
        self.raiz = tempfile.mkdtemp(prefix="suenos-cli-")
        self.r = S.rutas(self.raiz)
        self.sesion = os.path.join(self.r["profundo"], SESION)
        os.makedirs(self.sesion)
        os.makedirs(self.r["olas"])
        os.makedirs(os.path.join(self.raiz, "scripts", "puente"))
        with open(os.path.join(self.raiz, "scripts", "puente", "x.py"), "w") as f:
            f.write("print('hola')\n" * 20)
        tareas = [
            {
                "id": "SA092967",
                "tipo": "analisis",
                "area": "mando",
                "lente": "arquitectura-deuda",
            },
            {
                "id": "SA092968",
                "tipo": "analisis",
                "area": "mando",
                "lente": "ux-accesibilidad-diseno",
            },
            {
                "id": "SA092969",
                "tipo": "analisis",
                "area": "mando",
                "lente": "rendimiento-consumo",
            },
            {
                "id": "SA092970",
                "tipo": "analisis",
                "area": "mando",
                "lente": "seguridad-privacidad",
                "privado": True,
            },
        ]
        with open(os.path.join(self.sesion, "plan.json"), "w") as f:
            json.dump({"sesion": SESION, "tareas": tareas}, f)
        for tid, lente, hs in (
            (
                "SA092967",
                "arquitectura-deuda",
                [hallazgo("Uno", 2, 4), hallazgo("Dos")],
            ),
            ("SA092968", "ux-accesibilidad-diseno", [hallazgo("Tres", 5, 1, 0.9)]),
        ):
            with open(os.path.join(self.sesion, "mando--%s.json" % lente), "w") as f:
                json.dump(
                    {
                        "id": tid,
                        "area": "mando",
                        "lente": lente,
                        "hallazgos": hs,
                        "segundos": 600,
                        "modelos": {"sintesis": "nim/moonshotai/kimi-k3"},
                        "tokens": {"entrada": 1000, "salida": 200, "llamadas": 4},
                    },
                    f,
                )
        with open(os.path.join(self.r["olas"], "progreso.json"), "w") as f:
            json.dump(
                {"SA092969": {"estado": "fallo", "nota": "sueño sin proveedores"}}, f
            )
        self.viejos = {}

    def tearDown(self):
        for nombre, valor in self.viejos.items():
            obj, attr = nombre
            setattr(obj, attr, valor)
        shutil.rmtree(self.raiz, ignore_errors=True)

    def parchear(self, obj, attr, valor):
        self.viejos.setdefault((obj, attr), getattr(obj, attr))
        setattr(obj, attr, valor)

    def correr(self, *argv):
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            codigo = S.main(["--raiz", self.raiz] + list(argv) + ["--json"])
        return codigo, json.loads(salida.getvalue())


class Estado(Base):
    def test_una_fila_por_sueno_con_su_estado(self):
        self.parchear(S, "orquestadores_vivos", lambda: [])
        codigo, d = self.correr("estado")
        self.assertEqual(codigo, 0)
        por_id = {f["id"]: f for f in d["filas"]}
        self.assertEqual(por_id["SA092967"]["estado"], "informe")
        self.assertEqual(por_id["SA092967"]["proveedor"], "nim")
        self.assertEqual(por_id["SA092967"]["tokens"], 1200)
        self.assertEqual(por_id["SA092969"]["estado"], "fallo")
        self.assertEqual(por_id["SA092970"]["estado"], "pendiente")
        self.assertTrue(por_id["SA092970"]["privado"])
        self.assertFalse(d["completa"])
        self.assertIsNone(d["orquestador"])

    def test_un_latido_fresco_es_analizando(self):
        with open(
            os.path.join(self.r["olas"], "latidos-cola-suenos-%s.json" % SESION),
            "w",
        ) as f:
            json.dump(
                {
                    "cola": "cola-suenos-%s.json" % SESION,
                    "tareas": {
                        "SA092970": {
                            "fase": "analizando",
                            "modelo": "llm7/gpt-oss",
                            "subfase": "lectura 2/5",
                            "desde": time.time() - 120,
                            "tokens": {"entrada": 50, "salida": 10, "llamadas": 1},
                        }
                    },
                },
                f,
            )
        self.parchear(S, "orquestadores_vivos", lambda: [])
        _, d = self.correr("estado")
        fila = [f for f in d["filas"] if f["id"] == "SA092970"][0]
        self.assertEqual(fila["estado"], "analizando")
        self.assertEqual(fila["modelo"], "llm7/gpt-oss")
        self.assertGreaterEqual(fila["segundos"], 100)


class Verificar(Base):
    def test_por_verificar_el_de_mas_peso_primero(self):
        _, d = self.correr("por-verificar", "--n", "5")
        ids = [c["id"] for c in d["por_verificar"]]
        self.assertEqual(ids, ["SA092968", "SA092967"])
        self.assertTrue(
            d["por_verificar"][0]["md"].endswith("mando--ux-accesibilidad-diseno.md")
        )
        self.assertEqual(
            d["por_verificar"][0]["citas"][0]["cita"], "scripts/puente/x.py:10"
        )

    def test_veredicto_se_anota_y_saca_de_la_lista(self):
        codigo, d = self.correr(
            "veredicto",
            "SA092968",
            "--estado",
            "verificado",
            "--nota",
            "visto el código",
            "--por",
            "claude-opus-5.5",
        )
        self.assertEqual(codigo, 0)
        self.assertEqual(d["veredicto"]["estado"], "verificado")
        _, d = self.correr("por-verificar")
        self.assertEqual([c["id"] for c in d["por_verificar"]], ["SA092967"])
        self.parchear(S, "orquestadores_vivos", lambda: [])
        _, e = self.correr("estado")
        fila = [f for f in e["filas"] if f["id"] == "SA092968"][0]
        self.assertEqual(
            (fila["estado"], fila["por"]), ("verificado", "claude-opus-5.5")
        )

    def test_verificar_con_correcciones_es_ajustar(self):
        codigo, d = self.correr(
            "veredicto",
            "SA092967",
            "--estado",
            "verificado",
            "--nota",
            "el esfuerzo es mayor",
            "--por",
            "claude-sonnet",
            "--hallazgo",
            "1",
            "--esfuerzo",
            "5",
            "--rechazar-hallazgos",
            "2",
        )
        self.assertEqual(codigo, 0)
        v = d["veredicto"]
        self.assertEqual(v["estado"], "ajustado")
        self.assertEqual(v["ajustes"], {"1": {"esfuerzo": 5}})
        self.assertEqual(v["rechazados"], [2])
        with open(os.path.join(self.sesion, "verificaciones.jsonl")) as f:
            lineas = f.read().splitlines()
        self.assertEqual(len(lineas), 1)

    def test_errores_no_escriben_nada(self):
        for argv in (
            [
                "SA092970",
                "--estado",
                "verificado",
                "--nota",
                "x",
                "--por",
                "claude",
            ],  # sin informe
            [
                "SA092967",
                "--estado",
                "verificado",
                "--nota",
                " ",
                "--por",
                "claude",
            ],  # sin nota
            [
                "SA092967",
                "--estado",
                "verificado",
                "--nota",
                "x",
                "--por",
                "con espacios",
            ],
            [
                "SA092967",
                "--estado",
                "ajustado",
                "--nota",
                "x",
                "--por",
                "claude",
                "--hallazgo",
                "9",
                "--impacto",
                "2",
            ],
        ):
            codigo, d = self.correr("veredicto", *argv)
            self.assertEqual(codigo, 2, argv)
            self.assertFalse(d["ok"])
        self.assertFalse(
            os.path.exists(os.path.join(self.sesion, "verificaciones.jsonl"))
        )


class Consolidar(Base):
    def test_consolida_sin_jev_y_solo_telegram_si_esta_completa(self):
        avisos = []
        self.parchear(
            S.director_suenos,
            "anunciar",
            lambda texto, telegram=False, **k: avisos.append(telegram) or {},
        )
        self.parchear(
            S.director_suenos,
            "MEMORIA_ENCARGADAS",
            os.path.join(self.raiz, "encargado.json"),
        )
        codigo, d = self.correr("consolidar", "--sin-jev")
        self.assertEqual(codigo, 0)
        self.assertFalse(d["completa"])
        self.assertEqual(avisos, [False])
        self.assertTrue(os.path.exists(os.path.join(self.sesion, "INFORME.md")))
        self.assertTrue(os.path.exists(os.path.join(self.sesion, "consolidado.json")))
        self.assertEqual(
            d["informe"], "starseed_memory_root/dream/profundo/%s/INFORME.md" % SESION
        )


class Lanzar(Base):
    def setUp(self):
        super().setUp()
        self.parchear(S.director_suenos, "anunciar", lambda *a, **k: {})
        self.lanzados = []
        self.parchear(
            S,
            "lanzar_por_mando",
            lambda nombre, w: (
                self.lanzados.append(("mando", nombre)) or {"ok": True, "pid": 11}
            ),
        )
        self.parchear(
            S,
            "lanzar_directo",
            lambda *a, **k: self.lanzados.append(("directo",)) or 22,
        )
        self.parchear(
            S,
            "orquestador_instalado_apto",
            lambda ruta=None: (True, time.time() - 3600),
        )
        self.parchear(S, "orquestadores_vivos", lambda: [])

    def cola(self, nombre=None):
        with open(os.path.join(self.r["olas"], nombre or S.nombre_cola(SESION))) as f:
            return json.load(f)

    def test_seco_no_escribe(self):
        codigo, d = self.correr(
            "lanzar", "--areas", "mando", "--fecha", SESION, "--seco"
        )
        self.assertEqual(codigo, 0)
        self.assertTrue(d["seco"])
        self.assertGreater(d["tareas"], 0)
        self.assertFalse(
            os.path.exists(os.path.join(self.r["olas"], S.nombre_cola(SESION)))
        )
        self.assertEqual(self.lanzados, [])

    def test_sin_orquestador_lo_pide_al_mando(self):
        codigo, d = self.correr(
            "lanzar",
            "--areas",
            "mando",
            "--lentes",
            "coherencia-triada",
            "--fecha",
            SESION,
        )
        self.assertEqual(codigo, 0)
        self.assertEqual(d["accion"], "mando")
        self.assertEqual(self.lanzados, [("mando", "suenos-%s" % SESION)])
        tareas = self.cola()
        self.assertTrue(all(t["tipo"] == "analisis" for t in tareas))
        with open(os.path.join(self.sesion, "plan.json")) as f:
            plan = json.load(f)
        self.assertEqual(len(plan["tareas"]), 5)  # las 4 que había + la nueva
        self.assertEqual(len(plan["lanzamientos"]), 1)

    def test_relanzar_la_sesion_reusa_sus_horas(self):
        with open(os.path.join(self.sesion, "plan.json")) as f:
            plan = json.load(f)
        plan["lanzamientos"] = [
            {"t": "2026-09-29 14:25:00", "horas": 4, "por": "mando"}
        ]
        with open(os.path.join(self.sesion, "plan.json"), "w") as f:
            json.dump(plan, f)
        codigo, d = self.correr(
            "lanzar", "--fecha", SESION, "--areas", "mando", "--seco"
        )
        self.assertEqual(codigo, 0)
        plan_nuevo = S.construir(
            self.raiz,
            S.parser().parse_args(["lanzar", "--fecha", SESION, "--areas", "mando"]),
        )
        self.assertEqual(plan_nuevo["horas"], 4.0)
        self.assertEqual(plan_nuevo["pausa_s"], 0)

    def test_si_el_mando_no_contesta_va_directo(self):
        self.parchear(S, "lanzar_por_mando", lambda nombre, w: None)
        _, d = self.correr("lanzar", "--areas", "mando", "--fecha", SESION)
        self.assertEqual(d["accion"], "directo")
        self.assertEqual(d["pid"], 22)

    def test_orquestador_viejo_instalado_no_lanza(self):
        self.parchear(S, "orquestador_instalado_apto", lambda ruta=None: (False, 0.0))
        codigo, d = self.correr("lanzar", "--areas", "mando", "--fecha", SESION)
        self.assertEqual(codigo, 3)
        self.assertEqual(d["accion"], "instalar")
        self.assertIn("instalar.sh", d["error"])
        self.assertEqual(self.lanzados, [])

    def test_un_orquestador_vivo_que_sabe_sonar_recibe_las_tareas(self):
        with open(os.path.join(self.r["olas"], "cola-auto-0929.json"), "w") as f:
            json.dump(
                [{"id": "p400A", "prompt": "código"}],
                f,
            )
        self.parchear(
            S,
            "orquestadores_vivos",
            lambda: [
                {"pid": 7, "segundos": 60, "cola": "cola-auto-0929.json", "solo": False}
            ],
        )
        codigo, d = self.correr("lanzar", "--areas", "mando", "--fecha", SESION)
        self.assertEqual((codigo, d["accion"]), (0, "tanda_viva"))
        viva = self.cola("cola-auto-0929.json")
        self.assertEqual(viva[0]["id"], "p400A")
        self.assertTrue(any(t.get("tipo") == "analisis" for t in viva))
        self.assertEqual(self.lanzados, [])

    def test_un_orquestador_vivo_viejo_no_se_duplica(self):
        self.parchear(
            S,
            "orquestadores_vivos",
            lambda: [
                {
                    "pid": 7,
                    "segundos": 99999,
                    "cola": "cola-auto-0929.json",
                    "solo": False,
                }
            ],
        )
        codigo, d = self.correr("lanzar", "--areas", "mando", "--fecha", SESION)
        self.assertEqual((codigo, d["accion"]), (4, "esperar"))
        self.assertEqual(self.lanzados, [])
        codigo, d = self.correr(
            "lanzar", "--areas", "mando", "--fecha", SESION, "--forzar"
        )
        self.assertEqual(d["accion"], "mando")

    def test_la_nube_no(self):
        codigo, d = self.correr("lanzar", "--donde", "nube")
        self.assertEqual(codigo, 2)
        self.assertIn("Mac", d["error"])


class Procesos(unittest.TestCase):
    def test_solo_cuenta_python_menos_u(self):
        lineas = [
            "123 01:02:03 /opt/homebrew/bin/python3 -u /Users/a/.local/bin/starseed-enjambre.py starseed_memory_root/olas/cola-suenos-2026-09-29.json --workers 3",
            "124 2-00:00:05 python3 -u starseed-enjambre.py olas/cola-auto-1.json --solo P1",
            "125 00:10 grep starseed-enjambre.py",
            "126 00:10 opencode run 'lee starseed-enjambre.py'",
        ]
        o = S.orquestadores_de(lineas)
        self.assertEqual([x["pid"] for x in o], [123, 124])
        self.assertEqual(o[0]["cola"], "cola-suenos-2026-09-29.json")
        self.assertEqual(o[0]["segundos"], 3723)
        self.assertEqual(o[1]["segundos"], 2 * 86400 + 5)
        self.assertTrue(o[1]["solo"])

    def test_puede_sonar_si_arranco_despues_de_instalar(self):
        ahora = 10_000.0
        self.assertTrue(S.puede_sonar({"segundos": 100, "solo": False}, 9_000.0, ahora))
        self.assertFalse(
            S.puede_sonar({"segundos": 5_000, "solo": False}, 9_000.0, ahora)
        )
        self.assertFalse(S.puede_sonar({"segundos": 100, "solo": True}, 9_000.0, ahora))


class Detener(Base):
    """Parar en caliente una sesión: solo su orquestador, con el flock del progreso tomado
    (nunca a medio escribir progreso.json) y sin SIGKILL."""

    def setUp(self):
        super().setUp()
        self.cerrojo = os.path.join(self.raiz, "progreso.lock")
        self.parchear(S, "CERROJO_PROGRESO", self.cerrojo)
        self.vivos = {40, 41}
        self.senales = []

        def matar(pid, sig):
            import fcntl

            # Mientras se manda la señal, el cerrojo del progreso está tomado por `detener`.
            with open(self.cerrojo, "a") as f:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.senales.append((pid, sig))
            self.vivos.discard(pid)

        self.matar = matar

    def test_solo_para_el_de_su_cola_con_el_cerrojo_tomado(self):
        import signal

        objetivos = [{"pid": 40, "cola": "cola-suenos-%s.json" % SESION}]
        r = S.detener_orquestadores(
            objetivos,
            matar=self.matar,
            vivo=lambda p: p in self.vivos,
            dormir=lambda s: None,
        )
        self.assertEqual(self.senales, [(40, signal.SIGTERM)])
        self.assertEqual(r, {"enviados": [40], "siguen": [], "cerrojo": True})
        self.assertIn(41, self.vivos)

    def test_cli_elige_la_cola_de_la_fecha(self):
        self.parchear(
            S,
            "orquestadores_vivos",
            lambda: [
                {
                    "pid": 40,
                    "segundos": 60,
                    "cola": "cola-suenos-%s.json" % SESION,
                    "solo": False,
                },
                {
                    "pid": 41,
                    "segundos": 60,
                    "cola": "cola-auto-0929.json",
                    "solo": False,
                },
            ],
        )
        visto = {}
        self.parchear(
            S,
            "detener_orquestadores",
            lambda objs, espera_s=30: (
                visto.update(objs=objs, espera=espera_s)
                or {"enviados": [o["pid"] for o in objs], "siguen": [], "cerrojo": True}
            ),
        )
        codigo, d = self.correr("detener", "--fecha", SESION, "--espera", "5")
        self.assertEqual(codigo, 0)
        self.assertEqual([o["pid"] for o in visto["objs"]], [40])
        self.assertEqual(visto["espera"], 5)
        self.assertTrue(d["ok"])

    def test_sin_orquestador_de_esa_sesion_no_toca_nada(self):
        self.parchear(
            S,
            "orquestadores_vivos",
            lambda: [
                {
                    "pid": 41,
                    "segundos": 60,
                    "cola": "cola-auto-0929.json",
                    "solo": False,
                }
            ],
        )
        self.parchear(
            S, "detener_orquestadores", lambda *a, **k: self.fail("no debía parar nada")
        )
        codigo, d = self.correr("detener", "--fecha", SESION)
        self.assertEqual(codigo, 1)
        self.assertFalse(d["ok"])

    def test_si_sigue_vivo_lo_dice_y_no_manda_sigkill(self):
        senales = []
        r = S.detener_orquestadores(
            [{"pid": 40}],
            matar=lambda p, s: senales.append(s),
            vivo=lambda p: True,
            dormir=lambda s: None,
            espera_s=0,
        )
        import signal

        self.assertEqual(senales, [signal.SIGTERM])
        self.assertEqual(r["siguen"], [40])


class Latido(Base):
    def test_el_supervisor_aparece_como_agente_claude(self):
        self.parchear(L, "DIR_OLAS", self.r["olas"])
        codigo, d = self.correr(
            "latido",
            "--agente",
            "claude-sup-1",
            "--fase",
            "verificando SA092967",
            "--modelo",
            "anthropic/claude-opus-5.5",
        )
        self.assertEqual(codigo, 0)
        with open(os.path.join(self.r["olas"], "latidos-externo-suenos.json")) as f:
            datos = json.load(f)
        t = datos["tareas"]["claude-sup-1"]
        self.assertEqual(
            (t["medio"], t["fase"], t["modelo"]),
            ("claude", "verificando SA092967", "anthropic/claude-opus-5.5"),
        )
        self.correr("latido", "--agente", "claude-sup-1", "--fase", "consolidando")
        with open(os.path.join(self.r["olas"], "latidos-externo-suenos.json")) as f:
            datos = json.load(f)
        self.assertEqual(
            datos["tareas"]["claude-sup-1"]["fase"],
            "consolidando",
        )
        self.correr("latido", "--agente", "claude-sup-1", "--terminar")
        with open(os.path.join(self.r["olas"], "latidos-externo-suenos.json")) as f:
            datos = json.load(f)
        self.assertNotIn(
            "claude-sup-1",
            datos["tareas"],
        )


class ConvivenciaConLosDirectores(unittest.TestCase):
    """Los directores de siempre no relanzan sueños ni lanzan la propuesta, y `informe` es un
    cierre para todos (vigilante, reconciliador)."""

    def test_el_vigilante_no_coge_colas_de_suenos_ni_informes(self):
        import vigilante_logica as V

        colas = [
            ("cola-suenos-2026-09-29.json", [{"id": "SA09291", "tipo": "analisis"}]),
            (
                "cola-suenos-propuesta-2026-09-29.json",
                [{"id": "SP09291", "aprobacion": True}],
            ),
            ("cola-400-algo.json", [{"id": "p400A"}, {"id": "p400B"}]),
        ]
        ids = [
            t["id"]
            for t in V.seleccionar_pendientes(
                colas, {"p400B": {"estado": "informe"}}, []
            )
        ]
        self.assertEqual(ids, ["p400A"])

    def test_el_reconciliador_no_toca_un_informe(self):
        import reconciliar_progreso as R

        nuevo, cambios = R.reconciliar(
            {"SA09291": {"estado": "informe"}}, [], False, ids_en_colas={"otra"}
        )
        self.assertEqual(nuevo["SA09291"]["estado"], "informe")
        self.assertEqual(cambios, [])


if __name__ == "__main__":
    unittest.main()
