#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del director de flujo (AUT1121B).

`diagnosticar` es pura y se testa directamente. `turno` se testa inyectando
`leer`, `correr` y `decir` para no tocar disco ni red.
"""
import io
import json
import os
import sys
import tempfile
import time
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import director_flujo as DF


def foto_base(**cambios):
    f = {
        "ahora": time.time(),
        "listas": [],
        "en_curso": [],
        "en_curso_con_latido": 0,
        "fantasmas": 0,
        "inicios_30": 0,
        "inicios_120": 0,
        "commits_30": 0,
        "commits_120": 0,
        "agentes_libres": {"mac": 0, "a1": 0, "actions": 0, "cloudroom": 0, "agy": 0},
        "causa_no_arranco": None,
        "disco_libre_gb": 50.0,
        "disco_frenado": False,
        "guardia": "libre",
        "tope_memoria": 3,
        "motivo_memoria": "",
        "runs_vivos": 1,
        "elegibles": 0,
        "agotadas": 0,
        "nube_pausada": False,
        "escriben": 2,
        "caidos": 0,
        "colgados": 0,
        "todos_caidos": False,
        "ci_rojo": False,
        "orq_vivo": True,
        "orq_latido_fresco": True,
        "orq_pid": 123,
        "espera_alex": 0,
        "cola_vacia": False,
        "progreso": {},
        "salud": {},
    }
    f.update(cambios)
    return f


class _Aislado:
    """setUp que aísla LIBRO y ESTADO_LIBRO en archivos temporales."""

    def setUp(self):
        self._tmpdir = tempfile.mkdtemp(prefix="director-flujo-pruebas-")
        DF.LIBRO = os.path.join(self._tmpdir, "flujo-libro.jsonl")
        DF.ESTADO_LIBRO = os.path.join(self._tmpdir, "flujo-estado.json")

    def tearDown(self):
        import shutil as _sh

        _sh.rmtree(self._tmpdir, ignore_errors=True)


class TestDiagnosticar(_Aislado, unittest.TestCase):

    def foto(self, **cambios):
        f = foto_base()
        f.update(cambios)
        return f

    def test_sistema_en_marcha(self):
        causa, remedio, motivo = DF.diagnosticar(self.foto(listas=["T1"], en_curso=["T2"]))
        self.assertIsNone(causa)
        self.assertEqual(remedio, DF.REMEDIO_NINGUNO)
        self.assertIn("sistema en marcha", motivo)

    def test_disco_frena(self):
        f = self.foto(disco_frenado=True, disco_libre_gb=0.5, guardia="sin_tareas")
        causa, remedio, motivo = DF.diagnosticar(f)
        self.assertEqual(causa, DF.CAUSA_DISCO)
        self.assertEqual(remedio, DF.REMEDIO_ALIVIO)
        self.assertIn("disco", motivo)

    def test_disco_por_libre_bajo(self):
        f = self.foto(disco_frenado=False, disco_libre_gb=3.0, guardia="libre")
        causa, _r, _m = DF.diagnosticar(f)
        self.assertEqual(causa, DF.CAUSA_DISCO)

    def test_prioridad_disco_sobre_memoria(self):
        f = self.foto(disco_frenado=True, tope_memoria=2, listas=["T1"], en_curso=["T2", "T3"])
        causa, remedio, _m = DF.diagnosticar(f)
        self.assertEqual(causa, DF.CAUSA_DISCO)
        self.assertEqual(remedio, DF.REMEDIO_ALIVIO)

    def test_memoria_tope_con_listas(self):
        f = self.foto(tope_memoria=2, en_curso=["T1", "T2"], listas=["T3", "T4"])
        causa, remedio, motivo = DF.diagnosticar(f)
        self.assertEqual(causa, DF.CAUSA_MEMORIA)
        self.assertEqual(remedio, DF.REMEDIO_ALIVIO)
        self.assertIn("tope de memoria", motivo)

    def test_memoria_sin_listas_no_es_causa(self):
        f = self.foto(tope_memoria=2, en_curso=["T1", "T2"], listas=[])
        causa, _r, _m = DF.diagnosticar(f)
        self.assertNotEqual(causa, DF.CAUSA_MEMORIA)

    def test_nube_atraso_cero_runs_con_elegibles(self):
        f = self.foto(runs_vivos=0, elegibles=3, agotadas=0, nube_pausada=False)
        causa, remedio, motivo = DF.diagnosticar(f)
        self.assertEqual(causa, DF.CAUSA_NUBE_ATRASO)
        self.assertEqual(remedio, DF.REMEDIO_BUSCAR)
        self.assertIn("nube sin runs", motivo)

    def test_nube_atraso_con_agotadas(self):
        f = self.foto(runs_vivos=0, elegibles=0, agotadas=5, nube_pausada=False)
        causa, _r, _m = DF.diagnosticar(f)
        self.assertEqual(causa, DF.CAUSA_NUBE_ATRASO)

    def test_nube_pausada_no_es_atraso(self):
        f = self.foto(runs_vivos=0, elegibles=3, nube_pausada=True)
        causa, _r, _m = DF.diagnosticar(f)
        self.assertNotEqual(causa, DF.CAUSA_NUBE_ATRASO)

    def test_fantasma_en_curso_sin_latido(self):
        f = self.foto(fantasmas=2, en_curso=["T1", "T2"], en_curso_con_latido=0)
        causa, remedio, motivo = DF.diagnosticar(f)
        self.assertEqual(causa, DF.CAUSA_FANTASMA)
        self.assertEqual(remedio, DF.REMEDIO_FANTASMA)
        self.assertIn("sin latido vivo", motivo)

    def test_todos_modelos_caidos(self):
        f = self.foto(escriben=0, caidos=3, colgados=1, todos_caidos=True)
        causa, remedio, motivo = DF.diagnosticar(f)
        self.assertEqual(causa, DF.CAUSA_MODELOS_CAIDOS)
        self.assertEqual(remedio, DF.REMEDIO_CUARENTENA)
        self.assertIn("caídos", motivo)

    def test_ci_rojo(self):
        f = self.foto(ci_rojo=True)
        causa, remedio, motivo = DF.diagnosticar(f)
        self.assertEqual(causa, DF.CAUSA_CI_ROJO)
        self.assertEqual(remedio, DF.REMEDIO_PUBLICAR)
        self.assertIn("despliegue", motivo)

    def test_orquestador_no_vivo(self):
        f = self.foto(orq_vivo=False, orq_latido_fresco=False)
        causa, remedio, _m = DF.diagnosticar(f)
        self.assertEqual(causa, DF.CAUSA_ORQ_SIN_LATIDO)
        self.assertEqual(remedio, DF.REMEDIO_ORQ)

    def test_orquestador_sin_latido_fresco(self):
        f = self.foto(orq_vivo=True, orq_latido_fresco=False)
        causa, _r, _m = DF.diagnosticar(f)
        self.assertEqual(causa, DF.CAUSA_ORQ_SIN_LATIDO)

    def test_espera_alex_sin_listas(self):
        f = self.foto(espera_alex=3, listas=[])
        causa, remedio, motivo = DF.diagnosticar(f)
        self.assertEqual(causa, DF.CAUSA_ESPERA_ALEX)
        self.assertEqual(remedio, DF.REMEDIO_ALEX)
        self.assertIn("decisión de Maggasukha", motivo)

    def test_espera_alex_con_listas_no_es_causa(self):
        f = self.foto(espera_alex=3, listas=["T1"])
        causa, _r, _m = DF.diagnosticar(f)
        self.assertNotEqual(causa, DF.CAUSA_ESPERA_ALEX)

    def test_cola_vacia(self):
        f = self.foto(listas=[], en_curso=[], cola_vacia=True)
        causa, remedio, _m = DF.diagnosticar(f)
        self.assertEqual(causa, DF.CAUSA_COLA_VACIA)
        self.assertEqual(remedio, DF.REMEDIO_NINGUNO)


class TestLeerFotoEspera(_Aislado, unittest.TestCase):
    """La espera de decisión cuenta el texto viejo («Alex») y el nuevo («Maggasukha»)."""

    def _foto_con_notas(self, *notas):
        progreso = {("T%d" % i): {"estado": "en_curso", "nota": n} for i, n in enumerate(notas, 1)}
        datos = {
            "progreso": progreso, "colas": {}, "medios": {}, "gobernador": {},
            "salud": {}, "nube_pausada": {}, "eventos": [], "latidos": {},
        }

        def leer(nombre):
            return datos.get(nombre, {})

        return DF.leer_foto(leer=leer)

    def test_nota_con_texto_viejo_cuenta(self):
        foto = self._foto_con_notas("esperando decisión de Alex")
        self.assertEqual(foto["espera_alex"], 1)

    def test_nota_con_texto_nuevo_cuenta(self):
        foto = self._foto_con_notas("esperando decisión de Maggasukha")
        self.assertEqual(foto["espera_alex"], 1)


class TestOrdenarRemedios(_Aislado, unittest.TestCase):

    def test_sin_historial_devuelve_defecto(self):
        # Libro vacío: orden por defecto.
        orden = DF.ordenar_remedios(DF.CAUSA_NUBE_ATRASO)
        self.assertEqual(orden[0], DF.REMEDIO_BUSCAR)

    def test_historial_ordena_por_tasa(self):
        DF.LIBRO = os.path.join(tempfile.mkdtemp(), "flujo-libro.jsonl")
        DF.registrar(DF.CAUSA_NUBE_ATRASO, DF.REMEDIO_NUBE_CEDER, "funciona", "x")
        DF.registrar(DF.CAUSA_NUBE_ATRASO, DF.REMEDIO_NUBE_CEDER, "funciona", "x")
        DF.registrar(DF.CAUSA_NUBE_ATRASO, DF.REMEDIO_BUSCAR, "no_funciona", "x")
        orden = DF.ordenar_remedios(DF.CAUSA_NUBE_ATRASO)
        self.assertEqual(orden[0], DF.REMEDIO_NUBE_CEDER)  # tasa 1.0 > 0.0


class TestTurno(_Aislado, unittest.TestCase):

    def _captor(self):
        dichas = []

        def decir(texto, quien=None, tipo="mensaje"):
            dichas.append((texto, quien, tipo))

        return dichas, decir

    def test_sin_causa_no_hace_nada(self):
        foto = foto_base()
        dichas, decir = self._captor()
        res = DF.turno(aplicar=True, decir=decir, leer=lambda: foto)
        self.assertIsNone(res["causa"])
        self.assertEqual(res["resultado"], "no_aplicable")
        self.assertEqual(dichas, [])

    def test_nube_atraso_aplica_buscar(self):
        foto = foto_base(runs_vivos=0, elegibles=4, nube_pausada=False)
        dichas, decir = self._captor()
        llamadas = []

        def correr(cmd, segundos=30):
            llamadas.append(cmd)
            import subprocess

            class R:
                returncode = 0
                stdout = '{"ok": true, "resumen": "nube ok", "sumados": 2, "hechas": [], "lineas": []}'
                stderr = ""

            return R()

        res = DF.turno(aplicar=True, decir=decir, correr=correr, leer=lambda: foto)
        self.assertEqual(res["causa"], DF.CAUSA_NUBE_ATRASO)
        self.assertEqual(res["remedio"], DF.REMEDIO_BUSCAR)
        self.assertTrue(
            any(
                "--aplicar" in c and any("buscar_capacidad.py" in x for x in c)
                for c in llamadas
            )
        )
        self.assertTrue(any("hecho" == t[2] for t in dichas))

    def test_fantasma_reabre(self):
        foto = foto_base(
            fantasmas=1,
            en_curso=["T1"],
            en_curso_con_latido=0,
            listas=[],
            progreso={"T1": {"estado": "en_curso"}},
        )
        dichas, decir = self._captor()
        res = DF.turno(aplicar=True, decir=decir, correr=lambda *a, **k: None, leer=lambda: foto)
        self.assertEqual(res["causa"], DF.CAUSA_FANTASMA)
        self.assertEqual(res["remedio"], DF.REMEDIO_FANTASMA)
        self.assertTrue(any(t[2] == "hecho" for t in dichas))

    def test_espera_alex_solo_avisa(self):
        foto = foto_base(espera_alex=2, listas=[])
        dichas, decir = self._captor()
        llamadas = []
        res = DF.turno(aplicar=True, decir=decir, correr=lambda *a, **k: llamadas.append(1), leer=lambda: foto)
        self.assertEqual(res["causa"], DF.CAUSA_ESPERA_ALEX)
        self.assertEqual(res["resultado"], "espera_alex")
        self.assertEqual(llamadas, [])  # no aplica remedio automático
        self.assertTrue(any(t[2] == "aviso" for t in dichas))

    def test_cola_vacia_no_actua(self):
        foto = foto_base(listas=[], en_curso=[], cola_vacia=True)
        dichas, decir = self._captor()
        res = DF.turno(aplicar=True, decir=decir, correr=lambda *a, **k: None, leer=lambda: foto)
        self.assertEqual(res["causa"], DF.CAUSA_COLA_VACIA)
        self.assertEqual(dichas, [])

    def test_resumen_turno(self):
        r = {"causa": "disco", "remedio": "alivio_temporales", "resultado": "funciona",
             "motivo": "poco disco"}
        s = DF.resumen_turno(r)
        self.assertIn("causa=disco", s)
        self.assertIn("remedio=alivio_temporales", s)
        self.assertIn("resultado=funciona", s)
        self.assertIn("poco disco", s)


class TestRegistrarLibro(unittest.TestCase):

    def test_registra_entrada(self):
        tmpdir = tempfile.mkdtemp()
        libro = os.path.join(tmpdir, "flujo-libro.jsonl")
        DF.LIBRO = libro
        entrada = DF.registrar("disco", "alivio_temporales", "funciona", "liberados 400 MB")
        self.assertEqual(entrada["causa"], "disco")
        self.assertEqual(entrada["remedio"], "alivio_temporales")
        self.assertEqual(entrada["resultado"], "funciona")
        with io.open(libro, encoding="utf-8") as f:
            linea = f.readline()
        datos = json.loads(linea)
        self.assertEqual(datos["causa"], "disco")


if __name__ == "__main__":
    import io
    unittest.main()
