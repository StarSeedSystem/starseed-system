# -*- coding: utf-8 -*-
"""Pruebas del agente de síntesis (SDP1111D): tres fases, zona CDMX, cola con
prefijo `cola-suenos-`, puntuación con Jev, entrega a Telegram, escritura
atómica, una entrega al día, cerrojo. Puras: sin red, sin orquestador."""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import agente_sintesis as A
import sintesis_fuentes as SF
import sintesis_tareas as ST


AHORA_CDMX_00 = datetime(2026, 11, 11, 7, 0, tzinfo=timezone.utc)  # 01:00 CDMX
AHORA_CDMX_06 = datetime(2026, 11, 11, 12, 30, tzinfo=timezone.utc)  # 06:30 CDMX
AHORA_CDMX_07 = datetime(2026, 11, 11, 13, 54, tzinfo=timezone.utc)  # 07:54 CDMX
FECHA = "2026-11-11"


def ctx_base():
    return {"fecha": FECHA, "sintesis_previas": [], "mananas": [],
            "rotacion": {"videos": ["Vídeo 4", "Vídeo 5"], "contactos": ["Cole Hastings"],
                         "categorias": ["solarpunk"]},
            "imaginacion": [], "informes": [], "resumen_actividad": None}


class TestFaseActual(unittest.TestCase):
    def test_fase_recolectar_antes_de_0030(self):
        # 00:00 CDMX = 06:00 UTC
        ahora = datetime(2026, 11, 11, 6, 0, tzinfo=timezone.utc)
        self.assertEqual(A._fase_actual(ahora), "recolectar")

    def test_fase_redactar_entre_0030_y_0630(self):
        self.assertEqual(A._fase_actual(AHORA_CDMX_00), "redactar")
        self.assertEqual(A._fase_actual(AHORA_CDMX_06), "redactar")

    def test_fase_entregar_despues_de_0630(self):
        self.assertEqual(A._fase_actual(AHORA_CDMX_07), "entregar")


class TestFechaCDMX(unittest.TestCase):
    def test_fecha_cdmx_correcta(self):
        self.assertEqual(A._fecha_cdmx(AHORA_CDMX_00), FECHA)
        self.assertEqual(A._fecha_cdmx(AHORA_CDMX_06), FECHA)
        self.assertEqual(A._fecha_cdmx(AHORA_CDMX_07), FECHA)


class TestGenerarTareasAnalisis(unittest.TestCase):
    def test_siete_ramas_con_ids_sin_formato(self):
        ctx = ctx_base()
        tareas = ST.generar_tareas_analisis(ctx, "/tmp", ahora=A._iso(AHORA_CDMX_00))
        self.assertEqual(len(tareas), 7)
        ramas = [t["rama"] for t in tareas]
        self.assertEqual(ramas, ["contactos", "noticias", "referencias", "actividad", "ideas", "guiones", "youtube"])
        for t in tareas:
            self.assertTrue(t["id"].startswith("SIN"))
            self.assertEqual(t["tipo"], "analisis")
            self.assertEqual(t["modo"], "libre")
            self.assertEqual(t["capacidad"], "alta")
            self.assertEqual(t["agente"], "sintesis-produccion")
            self.assertEqual(t["salida"], f"starseed_memory_root/imaginacion/agentes/sintesis-{FECHA}-{t['rama']}.json")
            self.assertTrue(t["privado"] == (t["rama"] == "actividad"))


class TestCiclo(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = self._tmp.name
        self.raiz = os.path.join(self.tmp, "repo")
        os.makedirs(self.raiz)
        self.home = os.path.join(self.tmp, "home")

    def tearDown(self):
        self._tmp.cleanup()

    def test_cola_con_prefijo_de_suenos(self):
        self.assertTrue(A.NOMBRE_COLA.startswith("cola-suenos-"))

    def test_ciclo_recolectar_encola_tareas(self):
        # Usa 00:00 CDMX para fase recolectar
        ahora_recolectar = datetime(2026, 11, 11, 6, 0, tzinfo=timezone.utc)
        r = A.ciclo(self.raiz, ahora_recolectar, encargar=False, jev=False, home=self.home, seco=True)
        self.assertTrue(r["toca"])
        self.assertEqual(r["fase"], "recolectar")
        self.assertEqual(r["resultado"]["accion"], "seco")
        self.assertEqual(len(r["resultado"]["tareas"]), 0)

    def test_ciclo_redactar_espera_salidas(self):
        r = A.ciclo(self.raiz, AHORA_CDMX_06, encargar=False, jev=False, home=self.home, seco=True)
        self.assertEqual(r["fase"], "redactar")
        self.assertEqual(r["resultado"]["accion"], "esperando_salidas")

    def test_ciclo_entregar_sin_sintesis_en_seco_no_escribe(self):
        r = A.ciclo(self.raiz, AHORA_CDMX_07, encargar=False, jev=False, home=self.home, seco=True)
        self.assertEqual(r["fase"], "entregar")
        self.assertEqual(r["resultado"]["accion"], "seco")
        self.assertFalse(os.path.exists(os.path.join(self.raiz, A.REL_SINTESIS)))

    def test_entregar_con_sintesis_envia_resumen_y_completa(self):
        # Crea síntesis en disco
        os.makedirs(os.path.join(self.raiz, A.REL_SINTESIS), exist_ok=True)
        texto = "Síntesis completa con fuentes y fechas. " * 100
        ruta = os.path.join(self.raiz, A.REL_SINTESIS, f"{FECHA}.md")
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(texto)
        enviados = []

        def enviar_falso(texto, **kw):
            enviados.append(texto)
            return {"ok": True, "trozos": 1}

        r = A.ciclo(self.raiz, AHORA_CDMX_07, encargar=False, jev=False,
                    enviar=enviar_falso, home=self.home, seco=False)
        self.assertTrue(r["ok"])
        self.assertEqual(r["resultado"]["accion"], "entregada")
        self.assertEqual(len(enviados), 2)
        self.assertTrue(len(enviados[0]) >= A.RESUMEN_MIN and len(enviados[0]) <= A.RESUMEN_MAX)
        # El texto completo ahora incluye la línea de NotebookLM al final
        self.assertTrue(enviados[1].endswith("Pídeme en este chat infografía, audio, vídeo o presentación de esta síntesis"))
        self.assertTrue(enviados[1].startswith(texto))
        estado = A.cargar_estado(self.raiz)
        self.assertTrue(estado["entregada"])
        self.assertEqual(estado["sintesis_path"], ruta)

    def test_solo_una_entrega_al_dia(self):
        os.makedirs(os.path.join(self.raiz, A.REL_SINTESIS), exist_ok=True)
        ruta = os.path.join(self.raiz, A.REL_SINTESIS, f"{FECHA}.md")
        with open(ruta, "w", encoding="utf-8") as f:
            f.write("Síntesis de prueba.")
        def enviar_falso(texto, **kw):
            return {"ok": True, "trozos": 1}
        # Primera entrega
        r1 = A.ciclo(self.raiz, AHORA_CDMX_07, encargar=False, jev=False,
                     enviar=enviar_falso, home=self.home, seco=False)
        self.assertTrue(r1["ok"])
        # Segunda entrega en mismo día (forzar para saltar la puerta de 15 min)
        r2 = A.ciclo(self.raiz, AHORA_CDMX_07, encargar=False, jev=False,
                     enviar=enviar_falso, home=self.home, seco=False, forzar=True)
        self.assertEqual(r2["resultado"]["accion"], "ya_entregada")

    def test_puerta_cada_15_min(self):
        r1 = A.ciclo(self.raiz, AHORA_CDMX_00, encargar=False, jev=False, home=self.home, seco=False)
        self.assertTrue(r1["toca"])
        # Simula que pasó menos de 15 min
        estado = A.cargar_estado(self.raiz)
        estado["ultimo_ciclo"] = A._iso(AHORA_CDMX_00 - timedelta(minutes=10))
        A.guardar_estado(self.raiz, estado)
        r2 = A.ciclo(self.raiz, AHORA_CDMX_00, encargar=False, jev=False, home=self.home, seco=True)
        self.assertFalse(r2["toca"])
        self.assertIn("0.25 h", r2["motivo"])

    def test_forzar_ignora_puerta(self):
        estado = A.cargar_estado(self.raiz)
        estado["ultimo_ciclo"] = A._iso(AHORA_CDMX_00 - timedelta(minutes=10))
        A.guardar_estado(self.raiz, estado)
        r = A.ciclo(self.raiz, AHORA_CDMX_00, encargar=False, jev=False,
                    home=self.home, seco=True, forzar=True)
        self.assertTrue(r["toca"])


class TestPlan(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = self._tmp.name
        self.raiz = os.path.join(self.tmp, "repo")
        self.home = os.path.join(self.tmp, "home")
        os.makedirs(self.raiz)

    def tearDown(self):
        self._tmp.cleanup()

    def test_plan_devuelve_siete_tareas(self):
        d = A._plan(self.raiz, AHORA_CDMX_00, self.home)
        self.assertTrue(d["ok"])
        self.assertEqual(d["fase"], "redactar")
        self.assertEqual(d["tareas"], 7)
        self.assertEqual(len(d["detalle"]), 7)


class TestEstado(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = self._tmp.name
        self.raiz = os.path.join(self.tmp, "repo")
        os.makedirs(self.raiz)

    def tearDown(self):
        self._tmp.cleanup()

    def test_estado_vacio_inicial(self):
        d = A._estado(self.raiz)
        self.assertTrue(d["ok"])
        self.assertIsNone(d["fecha"])
        self.assertEqual(d["fase"], "recolectar")
        self.assertFalse(d["entregada"])


class TestEscrituraAtomica(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = self._tmp.name
        self.raiz = os.path.join(self.tmp, "repo")
        self.home = os.path.join(self.tmp, "home")
        os.makedirs(self.raiz)

    def tearDown(self):
        self._tmp.cleanup()

    def test_estado_json_atomico(self):
        A.ciclo(self.raiz, AHORA_CDMX_00, encargar=False, jev=False, home=self.home, seco=False)
        ruta = os.path.join(self.raiz, A.REL_ESTADO)
        self.assertTrue(os.path.exists(ruta))
        with open(ruta, encoding="utf-8") as f:
            json.load(f)  # no debe fallar

    def test_sintesis_md_atomico(self):
        os.makedirs(os.path.join(self.raiz, A.REL_SINTESIS), exist_ok=True)
        ruta = os.path.join(self.raiz, A.REL_SINTESIS, f"{FECHA}.md")
        A._escribir_texto(ruta, "Contenido de prueba")
        self.assertTrue(os.path.exists(ruta))
        with open(ruta, encoding="utf-8") as f:
            self.assertEqual(f.read(), "Contenido de prueba")


class TestTopesDePrompt(unittest.TestCase):
    """PET1112D: el 2026-11-12 la cola pesó 821 KB (~117 KB por prompt), por encima del tope
    de la flota (16000 del analista libre). El contexto se encoge y ningún prompt sale a tope."""

    def test_encoger_contexto_capa_los_textos(self):
        ctx = ctx_base()
        ctx["sintesis_previas"] = [{"fecha": FECHA, "ruta": "x.md", "texto": "a" * 40000}]
        ctx["informes"] = [{"ruta": "i.md", "texto": "b" * 9000}]
        ctx["imaginacion"] = [{"agente": "g", "ruta": "r.json", "datos": {"propuestas": ["x" * 5000]}}]
        fuera = A._encoger_contexto(ctx)
        self.assertLessEqual(len(fuera["sintesis_previas"][0]["texto"]), A.TOPE_PREVIA)
        self.assertLessEqual(len(fuera["informes"][0]["texto"]), A.TOPE_INFORME)
        self.assertEqual(fuera["imaginacion"][0].get("datos"), None)
        self.assertEqual(ctx["sintesis_previas"][0]["texto"], "a" * 40000)  # no muta el original

    def test_a_topes_recorta_el_prompt_largo(self):
        tareas = [{"id": "SIN00000", "prompt": "p" * 20000}]
        fuera = A._a_topes(tareas)
        self.assertLessEqual(len(fuera[0]["prompt"]), A.TOPE_PROMPT)
        self.assertIn("fuente, fecha", fuera[0]["prompt"])

    def test_generar_con_contexto_encogido_cabe_en_topes(self):
        ctx = ctx_base()
        ctx["sintesis_previas"] = [{"fecha": FECHA, "ruta": "x.md", "texto": "a" * 40000}]
        ctx["informes"] = [{"ruta": "i.md", "texto": "b" * 9000}] * 20
        tareas = ST.generar_tareas_analisis(A._encoger_contexto(ctx), "/tmp", ahora=A._iso(AHORA_CDMX_00))
        for t in A._a_topes(tareas):
            self.assertLessEqual(len(t["prompt"]), A.TOPE_PROMPT)


class TestEncargarPorFlota(unittest.TestCase):
    """PET1112D: la cola `cola-suenos-sintesis.json` no la escaneaba NADIE (`tareas_esperadas`
    solo lee `cola-suenos-reimaginar-*` y `cola-suenos-entregables-*`). El encargo va por la vía
    que SÍ funciona: fundir en la cola y, con un orquestador vivo apto, a su cola viva."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = self._tmp.name
        self.raiz = os.path.join(self.tmp, "repo")
        os.makedirs(os.path.join(self.raiz, "starseed_memory_root", "olas"))

    def tearDown(self):
        self._tmp.cleanup()

    def _tarea(self, n=1):
        return {"id": "SIN1112%d" % n, "agente": "sintesis-produccion", "creada": "2026-11-12T06:24:00Z",
                "tipo": "analisis", "modo": "libre", "prompt": "x", "salida": "y.json"}

    def test_sin_orquestador_deja_la_cola_lista(self):
        d = A.encargar_por_flota(self.raiz, [self._tarea()], vivos=[], apto=(True, 100.0), libre=(True, 100.0))
        self.assertEqual(d["accion"], "cola_lista")
        ruta = os.path.join(self.raiz, "starseed_memory_root", "olas", A.NOMBRE_COLA)
        with open(ruta, encoding="utf-8") as f:
            cola = json.load(f)
        self.assertEqual([t["id"] for t in cola], ["SIN11121"])

    def test_tanda_viva_metelas_tareas_en_la_cola_del_orquestador(self):
        viva = os.path.join(self.raiz, "starseed_memory_root", "olas", "cola-codigo.json")
        with open(viva, "w", encoding="utf-8") as f:
            json.dump([{"id": "COD1"}], f)
        vivo = {"pid": 123, "cola": "cola-codigo.json", "segundos": 3600, "solo": False}
        d = A.encargar_por_flota(self.raiz, [self._tarea()], vivos=[vivo],
                                 apto=(True, 100.0), libre=(True, 100.0))
        self.assertEqual(d["accion"], "tanda_viva")
        with open(viva, encoding="utf-8") as f:
            viva_t = json.load(f)
        self.assertEqual([t["id"] for t in viva_t], ["COD1", "SIN11121"])

    def test_poda_lo_propio_viejo(self):
        vieja = dict(self._tarea(1), creada="2026-10-01T00:00:00Z")
        A.encargar_por_flota(self.raiz, [vieja, self._tarea(2)], vivos=[], apto=(True, 100.0), libre=(True, 100.0))
        ruta = os.path.join(self.raiz, "starseed_memory_root", "olas", A.NOMBRE_COLA)
        with open(ruta, encoding="utf-8") as f:
            cola = json.load(f)
        self.assertEqual([t["id"] for t in cola], ["SIN11122"])


class TestRespaldo(unittest.TestCase):
    """PET1112D: a la hora de entregar (07:54) sin texto, la flota gratuita redacta la síntesis
    en UN paso (la prueba del 2026-11-11), se guarda, se sube a Drive y se envía. Sin red."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = self._tmp.name
        self.raiz = os.path.join(self.tmp, "repo")
        os.makedirs(self.raiz)
        self.home = os.path.join(self.tmp, "home")
        self._cuentas_dir = os.path.join(self.tmp, "cuentas")
        os.makedirs(self._cuentas_dir, exist_ok=True)
        self._patch_dir = __import__("cuentas_google_env")
        self._orig_dir = self._patch_dir.DIR_CUENTAS
        self._patch_dir.DIR_CUENTAS = self._cuentas_dir
        import cuentas_google as CG
        self._orig_cg_dir = CG.DIR_CUENTAS
        CG.DIR_CUENTAS = self._cuentas_dir

    def tearDown(self):
        self._patch_dir.DIR_CUENTAS = self._orig_dir
        import cuentas_google as CG
        CG.DIR_CUENTAS = self._orig_cg_dir
        self._tmp.cleanup()

    def test_prompt_respaldo_lleva_regla_secciones_y_salidas(self):
        ctx = A._encoger_contexto(SF.contexto(self.raiz, hoy=FECHA, ahora=AHORA_CDMX_07.timestamp(), casa=self.home))
        prompt = A._prompt_respaldo(ctx, FECHA, salidas=[{"agente": "s", "datos": "{}"}])
        self.assertIn(ST.REGLA, prompt)
        self.assertIn("Secciones:", prompt)
        self.assertIn("Salidas de análisis del día:", prompt)
        self.assertLessEqual(len(prompt), A.TOPE_PROMPT)

    def test_respaldo_redacta_guarda_y_sube(self):
        subido = []
        estado = A.estado_vacio()

        def redactar(prompt):
            return "```markdown\n" + "Síntesis de respaldo con fuentes y fechas. " * 40 + "\n```"

        def subir_drive(fecha, texto):
            subido.append((fecha, texto))
            return "doc-123"

        r = A._respaldo(self.raiz, estado, AHORA_CDMX_07, redactar=redactar, subir_drive=subir_drive)
        self.assertTrue(r["ok"])
        self.assertEqual(r["accion"], "respaldo")
        self.assertTrue(r["drive"])
        ruta = os.path.join(self.raiz, A.REL_SINTESIS, "%s.md" % FECHA)
        self.assertTrue(os.path.exists(ruta))
        with open(ruta, encoding="utf-8") as f:
            texto = f.read()
        self.assertNotIn("```", texto)
        self.assertEqual(subido[0][1], texto)
        self.assertTrue(estado["respaldo"])

    def test_respaldo_sin_texto_de_la_flota_falla_sin_escribir(self):
        estado = A.estado_vacio()
        r = A._respaldo(self.raiz, estado, AHORA_CDMX_07, redactar=lambda p: None)
        self.assertFalse(r["ok"])
        self.assertEqual(r["accion"], "sin_sintesis")
        self.assertFalse(os.path.exists(os.path.join(self.raiz, A.REL_SINTESIS)))

    def test_respaldo_drive_que_falla_no_bloquea(self):
        estado = A.estado_vacio()
        r = A._respaldo(self.raiz, estado, AHORA_CDMX_07, redactar=lambda p: "T" * 500,
                        subir_drive=lambda f, t: (_ for _ in ()).throw(OSError("sin red")))
        self.assertTrue(r["ok"])
        self.assertFalse(r["drive"])

    def test_respaldo_seco_no_redacta_nada(self):
        estado = A.estado_vacio()
        r = A._respaldo(self.raiz, estado, AHORA_CDMX_07, redactar=lambda p: (_ for _ in ()).throw(AssertionError("no")), seco=True)
        self.assertEqual(r["accion"], "seco")

    def test_entregar_sin_sintesis_lleva_al_respaldo_y_entrega(self):
        enviados = []
        os.makedirs(self.home, exist_ok=True)

        def enviar_falso(texto, **kw):
            enviados.append(texto)
            return {"ok": True, "trozos": 1}

        r = A.ciclo(self.raiz, AHORA_CDMX_07, encargar=False, jev=False, enviar=enviar_falso,
                    home=self.home, redactar=lambda p: "Síntesis de respaldo completa. " * 30,
                    subir_drive=lambda f, t: None)
        self.assertTrue(r["ok"])
        self.assertEqual(r["resultado"]["accion"], "entregada")
        self.assertEqual(len(enviados), 2)
        self.assertIn("Pídeme en este chat", enviados[1])
        estado = A.cargar_estado(self.raiz)
        self.assertTrue(estado["entregada"])
        self.assertTrue(estado["respaldo"])

    def test_antes_de_0754_sin_sintesis_espera(self):
        ahora = datetime(2026, 11, 11, 13, 0, tzinfo=timezone.utc)  # 07:00 CDMX
        r = A.ciclo(self.raiz, ahora, encargar=False, jev=False, home=self.home, seco=True)
        self.assertEqual(r["resultado"]["accion"], "esperando_redaccion")

    def test_redactar_flota_sin_clave_no_llama_a_nada(self):
        self.assertIsNone(A._redactar_flota("p", clave=None))

    def test_subir_doc_sin_token_devuelve_none(self):
        import cuentas_google as CG
        with patch.object(CG, 'token', return_value=None):
            self.assertIsNone(A._subir_doc(FECHA, "texto", pedir=lambda u, c: None))


class TestPuntuacionJev(unittest.TestCase):
    def test_jev_callado_manda_regla(self):
        res = A._puntuar({"texto": "x"}, jev=False)
        self.assertEqual(res["respuesta"], "medio")
        self.assertEqual(res["medio"], "regla")


class TestNotebookLMSource(unittest.TestCase):
    """PET1112F: tras entregar la síntesis, añadirla como fuente al cuaderno de NotebookLM
    y añadir línea al mensaje de Telegram."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = self._tmp.name
        self.raiz = os.path.join(self.tmp, "repo")
        os.makedirs(self.raiz)
        self.home = os.path.join(self.tmp, "home")
        os.makedirs(self.home, exist_ok=True)

    def tearDown(self):
        self._tmp.cleanup()

    def test_entregar_añade_fuente_notebooklm_y_linea_telegram(self):
        """Tras entregar, se llama a asegurar_fuente y se añade la línea al texto completo."""
        os.makedirs(os.path.join(self.raiz, A.REL_SINTESIS), exist_ok=True)
        ruta = os.path.join(self.raiz, A.REL_SINTESIS, f"{FECHA}.md")
        texto = "Síntesis completa con fuentes y fechas. " * 100
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(texto)

        enviados = []
        nb_calls = []

        def enviar_falso(texto, **kw):
            enviados.append(texto)
            return {"ok": True, "trozos": 1}

        def asegurar_fuente_falso(fid, titulo):
            nb_calls.append(("asegurar_fuente", fid, titulo))
            return "source-123"

        r = A.ciclo(self.raiz, AHORA_CDMX_07, encargar=False, jev=False,
                    enviar=enviar_falso, home=self.home, seco=False,
                    asegurar_fuente=asegurar_fuente_falso,
                    drive_doc_id="doc-abc-123")
        self.assertTrue(r["ok"])
        self.assertEqual(r["resultado"]["accion"], "entregada")
        self.assertEqual(len(enviados), 2)
        # El resumen no lleva la línea extra
        self.assertNotIn("Pídeme en este chat", enviados[0])
        # El texto completo sí la lleva al final
        self.assertTrue(enviados[1].endswith("Pídeme en este chat infografía, audio, vídeo o presentación de esta síntesis"))
        # Se llamó a asegurar_fuente con el doc_id
        self.assertEqual(len(nb_calls), 1)
        self.assertEqual(nb_calls[0][1], "doc-abc-123")

    def test_entregar_fallo_notebooklm_no_bloquea(self):
        """Si falla añadir la fuente, la entrega sigue adelante."""
        os.makedirs(os.path.join(self.raiz, A.REL_SINTESIS), exist_ok=True)
        ruta = os.path.join(self.raiz, A.REL_SINTESIS, f"{FECHA}.md")
        with open(ruta, "w", encoding="utf-8") as f:
            f.write("Síntesis de prueba.")

        def enviar_falso(texto, **kw):
            return {"ok": True, "trozos": 1}

        def asegurar_fuente_falso(fid, titulo):
            raise RuntimeError("NotebookLM caído")

        r = A.ciclo(self.raiz, AHORA_CDMX_07, encargar=False, jev=False,
                    enviar=enviar_falso, home=self.home, seco=False,
                    asegurar_fuente=asegurar_fuente_falso,
                    drive_doc_id="doc-xyz")
        self.assertTrue(r["ok"])
        self.assertEqual(r["resultado"]["accion"], "entregada")

    def test_entregar_sube_drive_y_luego_asegura_fuente(self):
        """PET1112F: si no hay drive_doc_id, sube a Drive primero y usa el id para NotebookLM."""
        os.makedirs(os.path.join(self.raiz, A.REL_SINTESIS), exist_ok=True)
        ruta = os.path.join(self.raiz, A.REL_SINTESIS, f"{FECHA}.md")
        texto = "Síntesis con fuentes. " * 50
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(texto)

        enviados = []
        subidos = []
        nb_calls = []

        def enviar_falso(texto, **kw):
            enviados.append(texto)
            return {"ok": True, "trozos": 1}

        def subir_drive_falso(fecha, texto):
            subidos.append((fecha, texto[:50]))
            return "drive-doc-789"

        def asegurar_fuente_falso(fid, titulo):
            nb_calls.append(("asegurar_fuente", fid, titulo))
            return "source-456"

        r = A.ciclo(self.raiz, AHORA_CDMX_07, encargar=False, jev=False,
                    enviar=enviar_falso, home=self.home, seco=False,
                    asegurar_fuente=asegurar_fuente_falso,
                    subir_drive=subir_drive_falso)
        self.assertTrue(r["ok"])
        self.assertEqual(r["resultado"]["accion"], "entregada")
        self.assertEqual(len(enviados), 2)
        self.assertEqual(len(subidos), 1)
        self.assertEqual(subidos[0][0], FECHA)
        self.assertEqual(len(nb_calls), 1)
        self.assertEqual(nb_calls[0][1], "drive-doc-789")


class TestHiggsfieldPropuestas(unittest.TestCase):
    """HGF1113C: la síntesis diaria incluye sección «Producción con Higgsfield» con
    hasta 2 propuestas al día para proyectos oficiales, registradas como pendientes,
    marcadas REQUIERE APROBACIÓN y con comando /higgsfield aprobar <id>."""

    # Usar fecha fija como el resto de tests: 2026-11-11 en UTC = 2026-11-10 en CDMX a ciertas horas
    # AHORA_CDMX_07 = 2026-11-11 13:54 UTC = 07:54 CDMX (fecha CDMX = 2026-11-11)
    FECHA_TEST = "2026-11-11"
    AHORA_TEST = datetime(2026, 11, 11, 13, 54, tzinfo=timezone.utc)  # 07:54 CDMX

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = self._tmp.name
        self.raiz = os.path.join(self.tmp, "repo")
        self.home = os.path.join(self.tmp, "home")
        os.makedirs(self.raiz)
        os.makedirs(self.home, exist_ok=True)

    def tearDown(self):
        self._tmp.cleanup()

    def test_generar_propuestas_higgsfield_max_dos_por_dia(self):
        """Genera como mucho 2 propuestas para proyectos oficiales."""
        import higgsfield_aprobado as ha

        propuestas = A._generar_propuestas_higgsfield(self.raiz, self.FECHA_TEST, ahora=self.AHORA_TEST)
        self.assertLessEqual(len(propuestas), 2)
        for p in propuestas:
            self.assertIn("id", p)
            self.assertIn("proyecto", p)
            self.assertIn("pieza", p)
            self.assertIn("modelo", p)
            self.assertIn("comando", p)
            self.assertIn("tomas", p)
            self.assertIn("creditos_estimados", p)
            self.assertIn("motivo", p)
            self.assertEqual(p.get("estado"), "pendiente")

    def test_propuestas_registradas_en_higgsfield_aprobado(self):
        """Las propuestas se guardan en propuestas.json para higgsfield_aprobado."""
        propuestas = A._generar_propuestas_higgsfield(self.raiz, self.FECHA_TEST, ahora=self.AHORA_TEST)
        ruta_propuestas = os.path.join(self.raiz, "starseed_memory_root", "produccion", "higgsfield", "propuestas.json")
        self.assertTrue(os.path.exists(ruta_propuestas))
        with open(ruta_propuestas, encoding="utf-8") as f:
            datos = json.load(f)
        guardadas = datos if isinstance(datos, list) else datos.get("propuestas", [])
        ids_guardados = {str(p["id"]) for p in guardadas}
        for p in propuestas:
            self.assertIn(str(p["id"]), ids_guardados)

    def test_seccion_sintesis_incluye_propuestas_higgsfield(self):
        """La síntesis markdown incluye la sección con propuestas y comando de aprobación."""
        propuestas = A._generar_propuestas_higgsfield(self.raiz, self.FECHA_TEST, ahora=self.AHORA_TEST)
        seccion = A._seccion_higgsfield(propuestas)
        self.assertIn("Producción con Higgsfield", seccion)
        self.assertIn("REQUIERE APROBACIÓN", seccion)
        for p in propuestas:
            self.assertIn(p["id"], seccion)
            self.assertIn("/higgsfield aprobar %s" % p["id"], seccion)
            self.assertIn(p["proyecto"], seccion)
            self.assertIn(p["pieza"], seccion)
            self.assertIn(str(p["creditos_estimados"]), seccion)

    def test_sin_propuestas_no_añade_seccion(self):
        """Si no hay propuestas, no se añade la sección."""
        seccion = A._seccion_higgsfield([])
        self.assertEqual(seccion, "")

    def test_proyectos_oficiales_validos(self):
        """Las propuestas usan solo proyectos oficiales de la lista."""
        import higgsfield_aprobado as ha
        propuestas = A._generar_propuestas_higgsfield(self.raiz, self.FECHA_TEST, ahora=self.AHORA_TEST)
        oficiales = {
            "sistema-diseno", "recorrido-os", "paz", "manifiesto",
            "fase-semilla", "videos-4-5", "personajes", "redes"
        }
        for p in propuestas:
            self.assertIn(p["proyecto"], oficiales)

    def test_fecha_distinta_no_genera_propuestas(self):
        """Si la fecha no es hoy, no genera propuestas."""
        # Usar fecha diferente a FECHA_TEST (que es 2026-11-11 en CDMX)
        fecha_otra = "2026-11-10"
        propuestas = A._generar_propuestas_higgsfield(self.raiz, fecha_otra, ahora=self.AHORA_TEST)
        self.assertEqual(propuestas, [])


if __name__ == "__main__":
    unittest.main()