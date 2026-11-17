# -*- coding: utf-8 -*-
"""Pruebas de los opcionales MOD1116 del analista: al final y nunca revisándose a sí mismos."""
import json
import os
import sys
import tempfile
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIRECTORIO)
sys.path.insert(0, os.path.join(os.path.dirname(DIRECTORIO), "puente"))

import analista as A  # noqa: E402

AHORA = "2026-11-16T10:00:00"
PRIVADO = ("privado", "huihui_ai/qwen3.5-abliterated:4b")


def base():
    return {"mapa": list(A.MAP_RAPIDOS), "sintesis": list(A.REDUCE_CAPACES),
            "contraste": list(A.CONTRASTE)}


class SinVariables(unittest.TestCase):
    def test_sin_variables_ni_archivos_no_cambia_nada(self):
        fuera = A.flota_con_opcionales(base(), entorno={}, leer=lambda r: None, ahora_iso=AHORA,
                                       estado_abliteration={"permitido": False},
                                       estado_privado={"vivo": False})
        self.assertEqual(fuera, base())
        fija = A.flota_fija(entorno={}, leer=lambda r: None, ahora_iso=AHORA,
                            estado_abliteration={"permitido": False},
                            estado_privado={"vivo": False})
        self.assertEqual(fija["mapa"], A._sin_repetir(A.MAP_RAPIDOS, A.CONTRASTE, A.REDUCE_CAPACES))
        self.assertEqual(fija["sintesis"], A._sin_repetir(A.REDUCE_CAPACES, A.CONTRASTE, A.MAP_RAPIDOS))
        self.assertEqual(fija["contraste"], A._sin_repetir(A.CONTRASTE, A.REDUCE_CAPACES, A.MAP_RAPIDOS))


class Opcionales(unittest.TestCase):
    def test_privado_vivo_entra_al_final(self):
        fuera = A.flota_con_opcionales(base(), entorno={}, leer=lambda r: None, ahora_iso=AHORA,
                                       estado_abliteration={"permitido": False},
                                       estado_privado={"vivo": True, "etiqueta": PRIVADO[1],
                                                       "ultima_lectura": "2026-11-16T09:55:00"})
        for rol in ("mapa", "sintesis", "contraste"):
            self.assertEqual(fuera[rol][:-1], base()[rol])
            self.assertEqual(fuera[rol][-1], PRIVADO)

    def test_abliteration_con_entorno_y_permiso(self):
        fuera = A.flota_con_opcionales(base(), entorno={"STARSEED_ABLITERATION": "1"},
                                       leer=lambda r: None, ahora_iso=AHORA,
                                       estado_abliteration={"permitido": True},
                                       estado_privado={"vivo": False})
        for rol in ("mapa", "sintesis", "contraste"):
            self.assertEqual(fuera[rol][-1], ("abliteration", "abliterated-model"))

    def test_lee_sus_dos_estados_de_rutas_inyectadas(self):
        with tempfile.TemporaryDirectory() as d:
            ablit, a1 = os.path.join(d, "abliteration-uso.json"), os.path.join(d, "oracle.json")
            with open(ablit, "w", encoding="utf-8") as f:
                json.dump({"permitido": True}, f)
            with open(a1, "w", encoding="utf-8") as f:
                json.dump({"leido": "2026-11-16T09:58:00",
                           "modelo_privado": {"vivo": True, "etiqueta": PRIVADO[1]}}, f)
            fuera = A.flota_con_opcionales(base(), entorno={"STARSEED_ABLITERATION": "1"},
                                           ahora_iso=AHORA, ruta_abliteration=ablit, ruta_a1=a1)
        self.assertEqual(fuera["mapa"][-2:], [("abliteration", "abliterated-model"), PRIVADO])


class Contraste(unittest.TestCase):
    def test_el_privado_no_revisa_lo_que_escribio(self):
        llamadas = []

        def llamar(p, m, prompt, **kw):
            llamadas.append(p)
            if "sintetizador" in prompt:
                return json.dumps({"resumen": "x", "hallazgos": []})
            return json.dumps({"veredictos": []})

        flota = lambda: {"sintesis": [PRIVADO], "contraste": [PRIVADO]}  # noqa: E731
        ll = A.Llamador({"id": "MQB3"}, llamar, dormir=lambda s: None, flota=flota)
        validar = lambda txt: A.leer_sintesis(txt, {})  # noqa: E731
        _, modelo = ll.llamar("síntesis", "sintesis", "Eres el sintetizador", validar, max_tokens=10)
        self.assertEqual(modelo, "privado/%s" % PRIVADO[1])
        with self.assertRaises(A.SinProveedor):
            ll.llamar("contraste", "contraste", "Eres el VERIFICADOR",
                      lambda txt: A.extraer_json(txt, "veredictos"), excluir={"privado"},
                      espera_max=1)
        self.assertEqual(llamadas, ["privado"])

    def test_un_fallo_del_privado_rota_al_siguiente(self):
        llamadas = []

        def llamar(p, m, prompt, **kw):
            llamadas.append(p)
            if p == "privado":
                raise RuntimeError("HTTP Error 503: unavailable")
            return '{"ok": 1}'

        flota = lambda: {"mapa": [PRIVADO, ("llm7", "gpt-oss")]}  # noqa: E731
        ll = A.Llamador({"id": "MQB3"}, llamar, dormir=lambda s: None, flota=flota, rotar=False)
        _, modelo = ll.llamar("lectura", "mapa", "p", A.extraer_json)
        self.assertEqual(modelo, "llm7/gpt-oss")
        self.assertEqual(llamadas, ["privado", "llm7"])

    def test_el_privado_lento_recibe_mas_plazo(self):
        tiempos = []

        def llamar(p, m, prompt, timeout=120, **kw):
            tiempos.append(timeout)
            return '{"ok": 1}'

        flota = lambda: {"mapa": [PRIVADO]}  # noqa: E731
        ll = A.Llamador({"id": "MQB3"}, llamar, dormir=lambda s: None, flota=flota, rotar=False)
        ll.llamar("lectura", "mapa", "x" * 300, A.extraer_json, timeout=180, max_tokens=3000)
        self.assertGreater(tiempos[0], 180)


if __name__ == "__main__":
    unittest.main()
