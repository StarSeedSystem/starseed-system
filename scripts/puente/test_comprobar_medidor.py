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
