#!/usr/bin/env python3
"""Pruebas unitarias para la función pura veredictos_de en comprobar_medidor.py."""

from __future__ import annotations

import unittest
# La descubre `python3 -m unittest discover -s scripts/puente`, que mete ese directorio
# en el path: importar por `scripts.puente...` hacía que el módulo no se encontrara y la
# prueba entera se saltaba con un ImportError. (2026-09-22)
from comprobar_medidor import veredictos_de


class TestComprobarMedidor(unittest.TestCase):
    """Casos de prueba para cada medidor y escenarios de fallo."""

    def test_listas_y_bloqueadas(self) -> None:
        """Prueba medidores listas y bloqueadas con procesos vivos y muertos."""
        procesos_vivos = {
            "orquestador": [1234],
            "vigilante": [5678],
        }
        veredictos, resumen = veredictos_de("listas", procesos_vivos, {})
        self.assertEqual(len(veredictos), 2)
        self.assertEqual(veredictos[0]["estado"], "vivo")
        self.assertEqual(veredictos[1]["estado"], "vivo")
        self.assertIn("todos vivos", resumen)

        procesos_muertos = {
            "orquestador": [],
            "vigilante": [],
        }
        veredictos_m, resumen_m = veredictos_de("bloqueadas", procesos_muertos, {})
        self.assertEqual(veredictos_m[0]["estado"], "muerto")
        self.assertEqual(veredictos_m[1]["estado"], "muerto")
        self.assertIn("todo muerto", resumen_m)

    def test_agentes(self) -> None:
        """Prueba agentes opencode y codex."""
        procesos = {"opencode": [101], "codex": [202]}
        veredictos, resumen = veredictos_de("agentes", procesos, {})
        self.assertEqual(len(veredictos), 2)
        self.assertEqual(veredictos[0]["estado"], "vivo")
        self.assertEqual(veredictos[1]["estado"], "vivo")
        self.assertIn("todos vivos", resumen)

    def test_disco(self) -> None:
        """Prueba medidor de disco con espacio suficiente, bajo y crítico."""
        ver_ok, _ = veredictos_de("disco", {}, {"disco_libre_gb": 10.0})
        self.assertEqual(ver_ok[0]["estado"], "vivo")

        ver_low, _ = veredictos_de("disco", {}, {"disco_libre_gb": 2.5})
        self.assertEqual(ver_low[0]["estado"], "colgado")

        ver_crit, _ = veredictos_de("disco", {}, {"disco_libre_gb": 0.5})
        self.assertEqual(ver_crit[0]["estado"], "muerto")

    def test_memoria(self) -> None:
        """Prueba RAM y Swap libre reales y swap agotado."""
        hechos_ok = {"memoria_libre_mb": 1200.0, "swap_libre_mb": 500.0}
        ver_ok, _ = veredictos_de("memoria", {}, hechos_ok)
        self.assertEqual(ver_ok[0]["estado"], "vivo")
        self.assertEqual(ver_ok[1]["estado"], "vivo")

        hechos_swap_0 = {"memoria_libre_mb": 800.0, "swap_libre_mb": 0.0}
        ver_swap, _ = veredictos_de("memoria", {}, hechos_swap_0)
        self.assertEqual(ver_swap[0]["estado"], "vivo")
        self.assertEqual(ver_swap[1]["estado"], "muerto")

    def test_proveedores(self) -> None:
        """Prueba proveedores activos y pasarelas."""
        hechos = {"proveedores_activos": 3, "pasarelas_ok": True}
        ver, resumen = veredictos_de("proveedores", {}, hechos)
        self.assertEqual(ver[0]["estado"], "vivo")
        self.assertEqual(ver[1]["estado"], "vivo")
        self.assertIn("todos vivos", resumen)

    def test_sin_publicar(self) -> None:
        """Prueba commits sin publicar (0 pendientes vs N pendientes)."""
        ver_0, _ = veredictos_de("sin-publicar", {}, {"sin_publicar": 0})
        self.assertEqual(ver_0[0]["estado"], "vivo")

        ver_3, _ = veredictos_de("sin-publicar", {}, {"sin_publicar": 3})
        self.assertEqual(ver_3[0]["estado"], "colgado")

    def test_fallo_y_datos_desconocidos(self) -> None:
        """Prueba hechos vacíos o None resultando en estado desconocido."""
        ver_none, resumen = veredictos_de(
            "memoria", {}, {"memoria_libre_mb": None, "swap_libre_mb": None}
        )
        self.assertEqual(ver_none[0]["estado"], "desconocido")
        self.assertEqual(ver_none[1]["estado"], "desconocido")

        ver_inv, _ = veredictos_de("medidor_inexistente", {}, {})
        self.assertEqual(ver_inv[0]["estado"], "desconocido")


if __name__ == "__main__":
    unittest.main()



import comprobar_medidor as C


class ElBotonComprobarCotejaDeVerdad(unittest.TestCase):
    """(2026-09-23) Alex: «no funciona la autoverificación». Para «en-curso», «ola-activa»,
    «tokens» o «integradas» el botón decía «Medidor no reconocido»; y «agentes» solo miraba
    la Mac, así que con cuatro agentes en la nube decía «muerto». Ahora se vuelve a medir
    por otro camino y se compara con lo que dice el medidor."""

    def test_agentes_de_la_nube_solo_cuenta_runs_vivos(self):
        datos = {"runs": [{"estado": "in_progress", "agentes": 4},
                          {"estado": "completed", "agentes": 9},
                          {"estado": "queued", "agentes": "x"}]}
        self.assertEqual(C.agentes_en_la_nube(datos), 4)
        self.assertEqual(C.agentes_en_la_nube(None), 0)

    def test_integradas_en_main_solo_ids_conocidos_y_sin_repetir(self):
        asuntos = ["Ola 237 · x · DEDUPE: no subir dos veces",
                   "salvavidas · DEDUPE: trabajo del agente",
                   "mando: esto no es una tarea",
                   "363 · RM2: estado PAIR"]
        self.assertEqual(C.integradas_en_main(asuntos, {"DEDUPE", "RM2"}), 2)

    def test_lee_cuantos_agentes_dice_cada_medidor(self):
        self.assertEqual(C.agentes_que_dice("en-curso", {"resumen": "1 en marcha · 4 agente(s) sobre ellas"}), 4)
        self.assertEqual(C.agentes_que_dice("agentes", {"resumen": "4 escribiendo · 4 en total · 1 medio(s)"}), 4)
        olas = {"filas": [{"id": "ola:a", "quien": "4 agente(s) · nube-gh"},
                          {"id": "T1", "quien": "groq · mac"},
                          {"id": "ola:b", "quien": "2 agente(s) · mac"}]}
        self.assertEqual(C.agentes_que_dice("ola-activa", olas), 6)

    def _estados(self, vs):
        return {v["proceso"]: v["estado"] for v in vs}

    def test_si_coincide_con_lo_medido_esta_vivo(self):
        vs = C.cotejar("en-curso", {"resumen": "1 en marcha · 4 agente(s)"},
                       {"procesos": {"opencode": []}, "agentes_nube": 4})
        self.assertEqual(self._estados(vs)["Agentes medidos"], "vivo")

    def test_si_no_coincide_lo_dice(self):
        vs = C.cotejar("en-curso", {"resumen": "0 en marcha · 0 agente(s)"},
                       {"procesos": {"opencode": [11, 12]}, "agentes_nube": 4})
        v = [x for x in vs if x["proceso"] == "Agentes medidos"][0]
        self.assertEqual(v["estado"], "colgado")
        self.assertIn("NO COINCIDEN", v["detalle"])
        self.assertIn("2 en la Mac + 4 en la nube = 6", v["detalle"])

    def test_sin_respuesta_del_mando_el_medidor_esta_muerto(self):
        self.assertEqual(self._estados(C.cotejar("tokens", None, {}))["Medidor"], "muerto")

    def test_tokens_coteja_frescura_y_agentes_ciegos(self):
        detalle = {"resumen": "0 tok/s", "filas": [
            {"estado": "trabajando sin contador", "etapa": "4 agente(s)"}]}
        e = self._estados(C.cotejar("tokens", detalle, {"tokens_edad_s": 3, "agentes_nube": 4}))
        self.assertEqual((e["Servicio de tokens"], e["Agentes sin contador"]), ("vivo", "vivo"))
        e = self._estados(C.cotejar("tokens", detalle, {"tokens_edad_s": 300, "agentes_nube": 6}))
        self.assertEqual((e["Servicio de tokens"], e["Agentes sin contador"]), ("colgado", "colgado"))

    def test_integradas_coteja_con_git(self):
        e = self._estados(C.cotejar("integradas", {"resumen": "416 tareas integradas en main"},
                                    {"integradas_main": 416}))
        self.assertEqual(e["Integradas en main"], "vivo")

    def test_los_problemas_del_vigia_de_ese_medidor_salen_en_la_comprobacion(self):
        vs = C.cotejar("tokens", {"resumen": "x", "filas": []},
                       {"vigia": [{"clave": "tokens", "tipo": "tokens_ciegos", "porque": "falta una fuente"},
                                  {"clave": "listas", "tipo": "cadena_rota", "porque": "otra cosa"}]})
        nombres = [v["proceso"] for v in vs]
        self.assertIn("Vigía: tokens_ciegos", nombres)
        self.assertNotIn("Vigía: cadena_rota", nombres)

    def test_ya_no_hay_medidores_del_pulso_sin_reconocer(self):
        for clave in ("en-curso", "ola-activa", "tokens", "integradas", "contenedores"):
            vs, _ = C.veredictos_de(clave, {}, {"detalle": {"resumen": "algo", "filas": []}})
            self.assertNotIn("no reconocido", " ".join(v["detalle"] for v in vs), clave)


# ---------------------------------------------------------------------------------------------
# (2026-10-08) La comprobación de «Agentes» mentía: con tres `opencode run` escribiendo decía
# «Sin procesos de opencode activos», «Agente codex: Sin procesos de codex activos» (en rojo,
# aunque nadie usa codex) y «el medidor dice 3; medido ahora: 0 en la Mac + 0 en la nube = 0 ·
# NO COINCIDEN». Causa: se descartaba toda línea cuyos argumentos COMPLETOS contuvieran «grep»,
# «vim», «nano» o «cat», y el prompt de `opencode run` (en español: «catálogo», «indicate»,
# «grep»…) los llevaba. Estas pruebas usan las líneas reales de `ps` de esa Mac.

WRITER_1 = ("14675 13:11 /Users/alex/.opencode/bin/opencode run RAIZ DEL REPOSITORIO: "
            "`/Users/alex/Documents/starseed-wt/CAMR1005Dc`. Es la unica carpeta donde puedes "
            "escribir. Usa grep para buscar el catálogo y indicate qué cambió; no abras vim ni nano.")
WRITER_2 = ("14702 12:50 /Users/alex/.opencode/bin/opencode run RAIZ DEL REPOSITORIO: "
            "`/Users/alex/Documents/starseed-wt/CPA1007Kb`. Añade el catálogo de tests.")
WRITER_3 = ("14733 05:02 /Users/alex/.opencode/bin/opencode run RAIZ DEL REPOSITORIO: "
            "`/Users/alex/Documents/starseed-wt/PT1009Cb`. cat de los ficheros y grep de usos.")
AYUDANTE = ("32563 07:49 /Users/alex/.opencode/bin/opencode "
            "/Users/alex/.local/share/opencode/bin/vscode-eslint/server/out/eslintServer.js --stdio")
ORQUESTADOR = ("70038 25:07 /opt/homebrew/Cellar/python@3.14/3.14.0/Frameworks/Python.framework/Versions/"
               "3.14/Resources/Python.app/Contents/MacOS/Python -u /Users/alex/.local/bin/starseed-enjambre.py "
               "starseed_memory_root/olas/cola-auto-1008-163740.json --workers 3")
PS_REAL = "\n".join([WRITER_1, WRITER_2, WRITER_3, AYUDANTE, ORQUESTADOR,
                     "99001 00:01 grep opencode run", "99002 00:02 /usr/bin/vim notas-opencode.md"])


def _sin_pid(linea):
    return linea.split(None, 1)[1]


class LosProcesosSeClasificanPorEjecutable(unittest.TestCase):
    def test_un_prompt_con_catalogo_y_grep_sigue_contando(self):
        for linea in (WRITER_1, WRITER_2, WRITER_3):
            tipo, _ = C.clasificar_proceso(_sin_pid(linea))
            self.assertEqual(tipo, "opencode", linea[:60])

    def test_el_ayudante_de_eslint_no_es_un_escritor(self):
        self.assertEqual(C.clasificar_proceso(_sin_pid(AYUDANTE)), (None, None))

    def test_extrae_la_tarea_del_worktree(self):
        self.assertEqual(C.clasificar_proceso(_sin_pid(WRITER_1)), ("opencode", "CAMR1005Dc"))
        self.assertEqual(C.clasificar_proceso("/x/opencode run mira starseed-wt/AB1."),
                         ("opencode", "AB1"))
        self.assertEqual(C.clasificar_proceso("/x/opencode run sin ruta de tarea"), ("opencode", None))

    def test_orquestador_y_vigilante_por_su_script(self):
        self.assertEqual(C.clasificar_proceso(_sin_pid(ORQUESTADOR))[0], "orquestador")
        self.assertEqual(C.clasificar_proceso("python3 -u /x/vigilante-enjambre.py")[0], "vigilante")
        # El lanzador de launchd NO es el orquestador aunque lleve su nombre entre los argumentos.
        self.assertEqual(
            C.clasificar_proceso("python3 /x/lanzador-tcc.py /bin/zsh -c starseed-enjambre.py cola.json"),
            (None, None))

    def test_solo_cuenta_opencode_run_y_codex_exec(self):
        self.assertEqual(C.clasificar_proceso("/x/bin/codex exec haz algo en starseed-wt/CX1")[0], "codex")
        self.assertEqual(C.clasificar_proceso("node /opt/bin/codex exec haz algo")[0], "codex")
        self.assertEqual(C.clasificar_proceso("/x/bin/codex login"), (None, None))
        self.assertEqual(C.clasificar_proceso("/x/bin/opencode"), (None, None))
        self.assertEqual(C.clasificar_proceso("/x/bin/opencode serve --port 4096"), (None, None))
        # Un programa cualquiera que mencione «codex exec» o «opencode run» no es un escritor.
        self.assertEqual(C.clasificar_proceso("python3 /x/informe.py codex exec opencode run"), (None, None))

    def test_la_lista_de_ignorados_es_solo_del_ejecutable(self):
        for linea in ("grep opencode run", "/usr/bin/vim opencode run x", "cat /tmp/opencode run",
                      "tail -f opencode run", "python3 /x/scripts/puente/comprobar_medidor.py agentes"):
            self.assertEqual(C.clasificar_proceso(linea), (None, None), linea)

    def test_medir_procesos_con_las_lineas_reales(self):
        from unittest import mock
        with mock.patch.object(C, "_salida", return_value=PS_REAL):
            p = C.medir_procesos()
        self.assertEqual(p["opencode"], [14675, 14702, 14733])
        self.assertEqual(p["orquestador"], [70038])
        self.assertEqual(p["vigilante"], [])
        self.assertEqual(p["codex"], [])
        self.assertEqual(p["escritores_por_tarea"],
                         {"CAMR1005Dc": 14675, "CPA1007Kb": 14702, "PT1009Cb": 14733})


def _fila_agente(tarea, estado="escribiendo", donde="mac", porque="12 KB", etapa=None):
    return {"id": "xkiro · qwen3-coder-plus", "titulo": "xkiro · qwen3-coder-plus en %s" % donde,
            "estado": estado, "etapa": etapa or "trabaja en %s" % tarea, "quien": "cola cola-auto-1008",
            "desde": "5 min", "porque": porque}


def _hechos(filas, escritores=None, nube=0, fases=None, opencode=None, codex=None, resumen=None):
    escritores = escritores or {}
    opencode = list(escritores.values()) if opencode is None else opencode
    return {"procesos": {"opencode": opencode, "codex": codex or [], "escritores_por_tarea": escritores},
            "agentes_nube": nube, "fases": fases or {},
            "detalle": {"resumen": resumen or "%d en total" % len(filas), "filas": filas}}


class LaComprobacionDeAgentesEsHonrada(unittest.TestCase):
    def _agentes_medidos(self, hechos, clave="agentes"):
        vs = C.cotejar(clave, hechos["detalle"], hechos)
        return [v for v in vs if v["proceso"] == "Agentes medidos"][0]

    def test_una_escribiendo_con_proceso_y_otra_esperando_pasarela_coinciden(self):
        filas = [_fila_agente("CAMR1005Dc"),
                 _fila_agente("CPA1007Kb", estado="esperando pasarela", porque="NO está escribiendo")]
        v = self._agentes_medidos(_hechos(filas, {"CAMR1005Dc": 14675}))
        self.assertEqual(v["estado"], "vivo")
        self.assertNotIn("NO COINCIDEN", v["detalle"])
        self.assertIn("1 agente escribiendo con proceso vivo", v["detalle"])
        self.assertIn("1 esperando modelo (sin proceso, normal)", v["detalle"])
        self.assertIn("0 comprobando (tsc/tests/revisión)", v["detalle"])

    def test_una_fila_escribiendo_sin_proceso_se_acusa_por_su_id(self):
        filas = [_fila_agente("CAMR1005Dc"), _fila_agente("CPA1007Kb")]
        v = self._agentes_medidos(_hechos(filas, {"CAMR1005Dc": 14675}))
        self.assertEqual(v["estado"], "colgado")
        self.assertIn("NO COINCIDEN", v["detalle"])
        self.assertIn("CPA1007Kb", v["detalle"])
        self.assertNotIn("a CAMR1005Dc", v["detalle"])

    def test_las_que_pasan_tsc_tests_o_revision_no_tienen_escritor_por_diseno(self):
        filas = [_fila_agente("A1", estado="comprobando"),
                 _fila_agente("A2", estado="escribiendo", etapa="verificando con tsc (3 min)"),
                 _fila_agente("A3", estado="escribiendo", porque="en revisión"),
                 _fila_agente("A4", estado="verificando"),
                 _fila_agente("A5", estado="esperando modelo")]
        v = self._agentes_medidos(_hechos(filas, {}))
        self.assertEqual(v["estado"], "vivo", v["detalle"])
        self.assertIn("0 agentes escribiendo con proceso vivo", v["detalle"])
        self.assertIn("4 comprobando", v["detalle"])
        self.assertIn("1 esperando modelo", v["detalle"])

    def test_la_fase_real_del_latido_manda_si_el_medidor_dice_escribiendo_para_todas(self):
        # El medidor de Agentes pinta «escribiendo» a toda tarea con latido, también en `tsc`.
        filas = [_fila_agente("T1"), _fila_agente("T2"), _fila_agente("T3")]
        v = self._agentes_medidos(_hechos(filas, {"T1": 11}, fases={"T1": "escribiendo", "T2": "tsc",
                                                                     "T3": "esperando proveedor"}))
        self.assertEqual(v["estado"], "vivo", v["detalle"])
        self.assertIn("1 agente escribiendo con proceso vivo", v["detalle"])
        self.assertIn("1 comprobando", v["detalle"])
        self.assertIn("1 esperando modelo", v["detalle"])

    def test_los_agentes_de_la_nube_no_necesitan_proceso_en_la_mac(self):
        filas = [_fila_agente("N1", donde="nube-gh"), _fila_agente("N2", donde="nube-gh")]
        v = self._agentes_medidos(_hechos(filas, {}, nube=2))
        self.assertEqual(v["estado"], "vivo", v["detalle"])
        self.assertIn("2 escribiendo en la nube", v["detalle"])
        # Pero el medidor no puede inventar más agentes en la nube de los que cuenta GitHub.
        v = self._agentes_medidos(_hechos(filas, {}, nube=1))
        self.assertEqual(v["estado"], "colgado")

    def test_un_proceso_sin_fila_se_dice_pero_no_acusa(self):
        filas = [_fila_agente("CAMR1005Dc")]
        v = self._agentes_medidos(_hechos(filas, {"CAMR1005Dc": 1, "ZZ9": 2}))
        self.assertEqual(v["estado"], "vivo")
        self.assertIn("procesos sin fila en el medidor: ZZ9", v["detalle"])

    def test_si_no_se_puede_mapear_se_cae_a_contar(self):
        # Procesos sin `starseed-wt/<ID>` en sus argumentos: se cuentan, no se acusa a nadie.
        filas = [dict(_fila_agente("X"), etapa="escribiendo"), dict(_fila_agente("Y"), etapa="escribiendo")]
        v = self._agentes_medidos(_hechos(filas, {}, opencode=[1, 2]))
        self.assertEqual(v["estado"], "vivo", v["detalle"])
        v = self._agentes_medidos(_hechos(filas, {}, opencode=[1]))
        self.assertEqual(v["estado"], "colgado")

    def test_en_curso_lee_el_id_de_la_fila_y_su_fase(self):
        filas = [{"id": "T1", "titulo": "t", "estado": "escribiendo", "etapa": "escribiendo (3 min)",
                  "quien": "Ola 9 · 2 agentes · xkiro · qwen en mac"},
                 {"id": "T2", "titulo": "t", "estado": "tsc", "etapa": "verificando con tsc (2 min)",
                  "quien": "Ola 9 · xkiro · qwen en mac"}]
        h = _hechos(filas, {"T1": 11}, resumen="2 en marcha · 3 agente(s) sobre ellas")
        v = self._agentes_medidos(h, "en-curso")
        self.assertEqual(v["estado"], "vivo", v["detalle"])
        self.assertIn("2 agentes escribiendo con proceso vivo", v["detalle"])
        self.assertIn("1 comprobando", v["detalle"])

    def test_sin_filas_clasificables_cae_a_los_numeros_de_siempre(self):
        h = _hechos([], {}, nube=0, resumen="ningún agente escribiendo")
        self.assertEqual(self._agentes_medidos(h)["estado"], "vivo")  # «ningún» es un 0
        h = _hechos([], {}, nube=0, opencode=[7], resumen="ningún agente escribiendo")
        v = self._agentes_medidos(h)
        self.assertEqual(v["estado"], "colgado")  # procesos vivos que el medidor no ve
        self.assertIn("1 en la Mac + 0 en la nube = 1", v["detalle"])

    def test_el_veredicto_de_agentes_dice_n_escritores_con_sus_pids(self):
        filas = [_fila_agente("CAMR1005Dc"), _fila_agente("CPA1007Kb")]
        h = _hechos(filas, {"CAMR1005Dc": 14675, "CPA1007Kb": 14702})
        vs, resumen = C.veredictos_de("agentes", h["procesos"], h)
        por = {v["proceso"]: v for v in vs}
        self.assertEqual(por["Agente opencode"]["estado"], "vivo")
        self.assertIn("2 escritores (PIDs: 14675, 14702)", por["Agente opencode"]["detalle"])
        self.assertIn("CAMR1005Dc", por["Agente opencode"]["detalle"])
        self.assertNotIn("Agente codex", por)
        self.assertIn("todos vivos", resumen)

    def test_cero_escritores_sin_nadie_escribiendo_es_normal_y_no_nombra_codex(self):
        filas = [_fila_agente("W1", estado="esperando pasarela"), _fila_agente("W2", estado="comprobando")]
        h = _hechos(filas, {})
        vs, resumen = C.veredictos_de("agentes", h["procesos"], h)
        por = {v["proceso"]: v for v in vs}
        self.assertEqual(por["Agente opencode"]["estado"], "vivo")
        self.assertIn("0 escritores (normal)", por["Agente opencode"]["detalle"])
        self.assertNotIn("Agente codex", por)
        self.assertNotIn("muerto", " ".join(v["estado"] for v in vs))

    def test_cero_escritores_con_filas_escribiendo_en_la_mac_si_es_muerto(self):
        h = _hechos([_fila_agente("W1")], {})
        vs, _ = C.veredictos_de("agentes", h["procesos"], h)
        por = {v["proceso"]: v for v in vs}
        self.assertEqual(por["Agente opencode"]["estado"], "muerto")
        self.assertIn("W1", por["Agente opencode"]["detalle"])

    def test_codex_solo_sale_si_hay_procesos_o_filas_de_codex(self):
        h = _hechos([_fila_agente("W1")], {"W1": 5}, codex=[9])
        vs, _ = C.veredictos_de("agentes", h["procesos"], h)
        por = {v["proceso"]: v for v in vs}
        self.assertIn("1 escritor (PIDs: 9)", por["Agente codex"]["detalle"])
        fila_codex = dict(_fila_agente("W2"), id="openai · codex-mini")
        h = _hechos([fila_codex], {}, opencode=[])
        vs, _ = C.veredictos_de("agentes", h["procesos"], h)
        por = {v["proceso"]: v for v in vs}
        self.assertEqual(por["Agente codex"]["estado"], "muerto")

    def test_sin_detalle_del_medidor_no_se_inventa_ni_vivo_ni_muerto(self):
        vs, _ = C.veredictos_de("agentes", {"opencode": [], "codex": []}, {})
        self.assertEqual(vs[0]["estado"], "desconocido")
        self.assertEqual(len(vs), 1)

    def test_leer_fases_de_los_latidos(self):
        import json
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "latidos-cola-a.json").write_text(
                json.dumps({"tareas": {"T1": {"fase": "tsc"}, "T2": {"fase": "escribiendo"}, "T3": {}}}),
                encoding="utf-8")
            (Path(d) / "latidos-cola-rota.json").write_text("{no es json", encoding="utf-8")
            self.assertEqual(C.leer_fases_latidos(Path(d)), {"T1": "tsc", "T2": "escribiendo"})
        self.assertEqual(C.leer_fases_latidos(Path("/no/existe/nunca")), {})


class EstadosNuevosDelMedidor(unittest.TestCase):
    """(2026-10-09) «sin escribir» y «corrigiendo» son escritores: deben tener proceso."""

    def test_sin_escribir_y_corrigiendo_cuentan_como_escritores(self):
        from comprobar_medidor import _clase_de_texto
        self.assertEqual(_clase_de_texto("sin escribir", "lleva 9 min sin escribir"), "escribiendo")
        self.assertEqual(_clase_de_texto("corrigiendo", "el modelo corrige lo que falló en tsc"), "escribiendo")
        self.assertEqual(_clase_de_texto("comprobando", "el orquestador pasa los tipos (tsc)"), "comprobando")
        self.assertEqual(_clase_de_texto("esperando modelo", "ningún modelo con cupo"), "esperando")

