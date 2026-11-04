# -*- coding: utf-8 -*-
"""Qué entra —y qué NO— en la lista de acciones que solo puede hacer Alex."""
import importlib.util
import os
import unittest

_ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "acciones-de-alex.py")
_spec = importlib.util.spec_from_file_location("acciones_de_alex", _ruta)
A = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(A)

# Import cupo_codex for testing
_ruta_cupo = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cupo_codex.py")
_spec_cupo = importlib.util.spec_from_file_location("cupo_codex", _ruta_cupo)
cupo_codex = importlib.util.module_from_spec(_spec_cupo)
_spec_cupo.loader.exec_module(cupo_codex)

CATALOGO = {
    "apinex": {"nombre": "apinex", "enlace": "https://apinex.bond/airdrop?tab=quests",
               "nota": "Sus modelos gratis exigen un fichaje diario."},
    "groq": {"nombre": "Groq", "enlace": "https://console.groq.com/keys", "nota": "Cuota por minuto."},
}
TODOS = sorted(A.CLAVES_DEL_ENJAMBRE)


class QueEntraEnLaLista(unittest.TestCase):
    def test_sin_nada_pendiente_la_lista_esta_vacia(self):
        self.assertEqual([], A.construir_acciones([], TODOS, CATALOGO))

    def test_un_fichaje_diario_entra_con_su_enlace(self):
        pas = [{"clave": "apinex", "estado": "fichaje", "http": 402, "modelo": "x"}]
        a = A.construir_acciones(pas, TODOS, CATALOGO)
        self.assertEqual(1, len(a))
        self.assertIn("apinex.bond", a[0]["enlace"])
        self.assertIn("fichaje", a[0]["titulo"])

    def test_una_cuota_agotada_NO_entra(self):
        # Se repone sola: mandarle a hacer algo por esto es hacerle perder el tiempo.
        pas = [{"clave": "groq", "estado": "sin_cupo", "http": 429, "modelo": "x"}]
        self.assertEqual([], A.construir_acciones(pas, TODOS, CATALOGO))

    def test_una_clave_caducada_entra_con_la_orden_lista(self):
        pas = [{"clave": "groq", "estado": "sin_clave", "http": 401, "modelo": "x",
                "variable": "GROQ_API_KEY"}]
        a = A.construir_acciones(pas, TODOS, CATALOGO)
        self.assertIn("guardar-clave.sh GROQ_API_KEY --ambos", a[0]["comando"])

    def test_faltan_secretos_en_el_repo(self):
        a = A.construir_acciones([], ["OPENROUTER_API_KEY"], CATALOGO)
        self.assertEqual("github-secretos", a[0]["id"])
        self.assertIn("nube-gh.py secretos", a[0]["comando"])
        self.assertIn("github.com", a[0]["enlace"])
        self.assertNotIn("OPENROUTER_API_KEY", a[0]["detalle"])

    def test_repuesto_sin_valor_en_la_mac_no_se_pide(self):
        # DEC1028A: solo faltan de repuesto y la Mac no tiene valor → no hay nada que subir.
        repuesto = sorted(A.CLAVES_DEL_ENJAMBRE - A.ESENCIALES_DEL_ENJAMBRE)
        repo = sorted(A.CLAVES_DEL_ENJAMBRE - set(repuesto[:1]))
        a = A.construir_acciones([], repo, CATALOGO, entorno={})
        self.assertNotIn("github-secretos", [x["id"] for x in a])

    def test_repuesto_con_valor_en_la_mac_sigue_en_la_lista(self):
        repuesto = sorted(A.CLAVES_DEL_ENJAMBRE - A.ESENCIALES_DEL_ENJAMBRE)
        repo = sorted(A.CLAVES_DEL_ENJAMBRE - set(repuesto[:1]))
        a = [x for x in A.construir_acciones([], repo, CATALOGO, entorno={repuesto[0]: "x"}) if x["id"] == "github-secretos"]
        self.assertEqual(1, len(a))
        self.assertEqual("baja", a[0]["urgencia"])

    def test_si_falta_una_esencial_se_pide_aunque_no_haya_valor(self):
        a = [x for x in A.construir_acciones([], [], CATALOGO, entorno={}) if x["id"] == "github-secretos"]
        self.assertEqual("alta", a[0]["urgencia"])

    def test_cerebras_ya_no_se_pide(self):
        self.assertNotIn("CEREBRAS_API_KEY", A.CLAVES_DEL_ENJAMBRE)

    def test_toda_accion_trae_enlace_o_comando_nunca_solo_una_descripcion(self):
        pas = [{"clave": "apinex", "estado": "fichaje", "http": 402, "modelo": "x"},
               {"clave": "groq", "estado": "sin_clave", "http": 401, "modelo": "x",
                "variable": "GROQ_API_KEY"}]
        for accion in A.construir_acciones(pas, [], CATALOGO):
            self.assertTrue(accion["enlace"] or accion["comando"], accion["id"])
            self.assertTrue(accion["por_que_no_lo_hago_yo"], accion["id"])

    def test_lo_urgente_va_primero(self):
        pas = [{"clave": "apinex", "estado": "fichaje", "http": 402, "modelo": "x"}]
        a = A.construir_acciones(pas, [], CATALOGO)
        self.assertTrue(all(x["urgencia"] == "alta" for x in a))



class TestVerificar(unittest.TestCase):
    """El boton «verificar» de la ventana de «te toca a ti» (2026-09-21, pedido por Alex).

    Lo importante no es que devuelva algo, sino que vuelva a MEDIR. Un boton que marcara
    una casilla sin comprobar seria la misma mentira que nos costo el dia: el medidor
    llevaba 20 horas pidiendo unas claves que ya estaban puestas.
    """

    def test_si_ya_no_hace_falta_dice_hecha(self):
        todas = set(A.CLAVES_DEL_ENJAMBRE)
        # El entorno se pasa con el canal ya configurado: esta prueba habla de los
        # secretos del repo, y «no queda nada» solo es cierto si tampoco falta el canal.
        r = A.verificar("github-secretos", pasarelas=[], secretos_repo=todas,
                        entorno={"TELEGRAM_BOT_TOKEN": "x", "TELEGRAM_CHAT_ID": "y"})
        self.assertTrue(r["hecha"])
        self.assertEqual(r["quedan"], 0)
        self.assertIn("comprobado", r["detalle"])

    def test_si_sigue_faltando_dice_que_no_y_por_que(self):
        faltan = set(A.CLAVES_DEL_ENJAMBRE) - {"OPENROUTER_API_KEY"}
        r = A.verificar("github-secretos", pasarelas=[], secretos_repo=faltan)
        self.assertFalse(r["hecha"])
        self.assertIn("OPENROUTER_API_KEY", r["detalle"])

    def test_mide_de_nuevo_no_lee_lo_guardado(self):
        """Mismo id, hechos distintos -> veredictos distintos. Eso prueba que remide."""
        todas = set(A.CLAVES_DEL_ENJAMBRE)
        a = A.verificar("github-secretos", pasarelas=[], secretos_repo=todas)
        b = A.verificar("github-secretos", pasarelas=[], secretos_repo=set())
        self.assertTrue(a["hecha"])
        self.assertFalse(b["hecha"])

    def test_sin_id_informa_de_todas(self):
        r = A.verificar(None, pasarelas=[], secretos_repo=set())
        self.assertIn("acciones", r)
        self.assertGreaterEqual(r["quedan"], 1)

    def test_las_ordenes_se_pueden_pegar_desde_cualquier_carpeta(self):
        """El fallo que reporto Alex: «can't open file /Users/alex/scripts/puente/...»."""
        acciones = A.construir_acciones([], set())
        for a in acciones:
            if a.get("comando"):
                self.assertTrue(
                    a["comando"].startswith("cd /"),
                    "la orden %r es relativa: falla si no estas ya en el repo" % a["comando"],
                )

class YaLoHiceMideLaPasarelaAhora(unittest.TestCase):
    """(2026-09-23) Alex fichó en apinex y «Ya lo hice» le seguía diciendo «http 402 · modelo
    free/glm-5.3-flash»: `verificar` leía el informe de dos minutos antes. Ahora mide ESA
    pasarela en el momento (la sonda se inyecta aquí para no salir a la red)."""

    ENTORNO = {"TELEGRAM_BOT_TOKEN": "x", "TELEGRAM_CHAT_ID": "y"}

    def setUp(self):
        import json, tempfile
        self.dir = tempfile.mkdtemp()
        self.antes = A.INFORME
        A.INFORME = os.path.join(self.dir, "pasarelas-informe.json")
        json.dump({"pasarelas": [{"clave": "apinex", "estado": "fichaje", "http": 402,
                                  "modelo": "free/glm-5.3-flash",
                                  "variable": "STARSEED_PASARELA_APINEX_KEY"}]},
                  open(A.INFORME, "w"))

    def tearDown(self):
        A.INFORME = self.antes

    def test_clave_de_accion(self):
        self.assertEqual(A.clave_de_accion("pasarela-apinex-fichaje"), "apinex")
        self.assertEqual(A.clave_de_accion("pasarela-nvidia-sin_clave"), "nvidia")
        self.assertIsNone(A.clave_de_accion("github-secretos"))

    def test_si_ya_escribe_esta_hecha_y_lo_dice(self):
        medir = lambda clave: {"http": 200, "estado": "escribe", "modelo": "free/glm-5.3-flash"}
        r = A.verificar("pasarela-apinex-fichaje", secretos_repo=set(A.CLAVES_DEL_ENJAMBRE),
                        entorno=self.ENTORNO, medir=medir)
        self.assertTrue(r["hecha"])
        self.assertIn("medido ahora: http 200", r["detalle"])

    def test_si_sigue_pidiendo_el_fichaje_lo_dice_con_la_medida(self):
        medir = lambda clave: {"http": 402, "estado": "fichaje", "modelo": "free/glm-5.3-flash"}
        r = A.verificar("pasarela-apinex-fichaje", secretos_repo=set(A.CLAVES_DEL_ENJAMBRE),
                        entorno=self.ENTORNO, medir=medir)
        self.assertFalse(r["hecha"])
        self.assertIn("sigue pendiente · medido ahora: http 402", r["detalle"])

    def test_actualizar_pasarela_es_pura(self):
        antes = [{"clave": "apinex", "estado": "fichaje", "http": 402}, {"clave": "groq", "estado": "escribe"}]
        despues = A.actualizar_pasarela(antes, "apinex", {"estado": "escribe", "http": 200})
        self.assertEqual(despues[0]["estado"], "escribe")
        self.assertEqual(antes[0]["estado"], "fichaje")
        self.assertEqual(despues[1], antes[1])


if __name__ == "__main__":
    unittest.main()

class AvisarAUnArchivoNoEsAvisar(unittest.TestCase):
    """(2026-09-22) Alex: «el "te toca a ti" no me ha avisado del fichaje de la api ni de nada».

    Medido en ese momento:
        canal.jsonl                → «nueva: NVIDIA Build (NIM): renovar la clave» (10:04, 10:10)
        ~/.starseed/env            → sin TELEGRAM_BOT_TOKEN ni TELEGRAM_CHAT_ID
        /tmp/starseed-telegram.log → 0 bytes desde el 20 de septiembre
        avisados                   → ["pasarela-apinex-caida", "pasarela-nvidia-caida"]

    O sea: el aviso se escribió en un archivo que nadie lee, se marcó como entregado, y por
    eso no se repitió jamás. El sistema creía haber avisado.
    """

    def test_sin_token_ni_chat_sale_la_accion(self):
        a = A.accion_sin_canal({})
        self.assertIsNotNone(a)
        self.assertEqual(a["urgencia"], "alta")
        self.assertIn("telegram-alta.sh", a["comando"])

    def test_con_solo_el_token_sigue_faltando_canal(self):
        a = A.accion_sin_canal({"TELEGRAM_BOT_TOKEN": "x"})
        self.assertIsNotNone(a)
        self.assertIn("TELEGRAM_CHAT_ID", a["por_que"])

    def test_con_los_dos_no_estorba(self):
        self.assertIsNone(A.accion_sin_canal({"TELEGRAM_BOT_TOKEN": "x", "TELEGRAM_CHAT_ID": "y"}))

    def test_una_cadena_vacia_no_cuenta_como_configurado(self):
        self.assertIsNotNone(A.accion_sin_canal({"TELEGRAM_BOT_TOKEN": "  ", "TELEGRAM_CHAT_ID": ""}))

    def test_la_accion_encabeza_la_lista(self):
        """Si no hay forma de avisar, eso va antes que cualquier clave que renovar."""
        acciones = A.construir_acciones([], [], catalogo={}, entorno={})
        self.assertTrue(acciones)
        self.assertEqual(acciones[0]["id"], "canal-de-avisos-sin-configurar")

    def test_con_canal_configurado_no_aparece(self):
        acciones = A.construir_acciones([], [], catalogo={},
                                        entorno={"TELEGRAM_BOT_TOKEN": "x", "TELEGRAM_CHAT_ID": "y"})
        self.assertNotIn("canal-de-avisos-sin-configurar", [a["id"] for a in acciones])


class RecomprobarDiceLaVerdad(unittest.TestCase):
    """(2026-09-22) Alex: «agrega un botón de recomprobar si ya se completó».

    El botón vale exactamente lo que valga su respuesta. Con el entorno fuera de la
    reconstrucción, `--verificar canal-de-avisos-sin-configurar` contestaba «ya no hace
    falta» para algo que seguía sin arreglarse: el propio verificador no sabía mirarlo.
    """

    def test_sigue_pendiente_si_de_verdad_lo_esta(self):
        r = A.verificar("canal-de-avisos-sin-configurar", pasarelas=[], secretos_repo=[], entorno={})
        self.assertFalse(r["hecha"])
        self.assertIn("Telegram", r["titulo"])

    def test_se_da_por_hecha_cuando_ya_no_sale(self):
        r = A.verificar("canal-de-avisos-sin-configurar", pasarelas=[], secretos_repo=[],
                        entorno={"TELEGRAM_BOT_TOKEN": "x", "TELEGRAM_CHAT_ID": "y"})
        self.assertTrue(r["hecha"])
        self.assertIn("ya no hace falta", r["detalle"])

    def test_siempre_dice_cuando_se_comprobo(self):
        """Sin la hora, «hecha» es una afirmación sin fecha: no se puede contrastar."""
        r = A.verificar("lo-que-sea", pasarelas=[], secretos_repo=[], entorno={})
        self.assertTrue(r["comprobado"])


class CaidaYSaturada(unittest.TestCase):
    def test_saturada_no_entra_en_acciones(self):
        pas = [{"clave": "google", "estado": "saturada", "http": 503, "modelo": "gemini-3.5-flash-lite"}]
        a = A.construir_acciones(pas, TODOS, CATALOGO)
        self.assertEqual([], a)

    def test_caida_con_una_prueba_no_entra(self):
        pas = [{"clave": "groq", "estado": "caida", "http": 0, "modelo": "x",
                "caidas_seguidas": 1, "caida_desde": "2026-10-28 07:00"}]
        a = A.construir_acciones(pas, TODOS, CATALOGO)
        self.assertEqual([], a)

    def test_caida_con_tres_pruebas_y_7h_entra_con_mira_panel(self):
        # 7 horas antes
        pas = [{"clave": "google", "estado": "caida", "http": 503, "modelo": "gemini-3.5-flash-lite",
                "caidas_seguidas": 3, "caida_desde": "2026-10-27 23:00",
                "variable": "GEMINI_API_KEY"}]
        a = A.construir_acciones(pas, TODOS, CATALOGO)
        self.assertEqual(1, len(a))
        accion = a[0]
        self.assertIn("mira su panel", accion["titulo"])
        self.assertIn("más de 6 horas", accion["por_que"])
        self.assertIn("sin respuesta desde", accion["detalle"])
        self.assertIn("3 pruebas", accion["detalle"])

    def test_sin_clave_sigue_siendo_renovar_clave(self):
        pas = [{"clave": "groq", "estado": "sin_clave", "http": 401, "modelo": "x",
                "variable": "GROQ_API_KEY"}]
        a = A.construir_acciones(pas, TODOS, CATALOGO)
        self.assertEqual(1, len(a))
        self.assertIn("renovar la clave", a[0]["titulo"])


class RachaDeCaida(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import importlib.util, os
        ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "renovador-pasarelas.py")
        spec = importlib.util.spec_from_file_location("renovador", ruta)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        cls.R = mod

    def test_sube_con_caida_continua(self):
        anterior = {"estado": "caida", "caidas_seguidas": 2, "caida_desde": "2026-10-28 00:00"}
        nueva = {"estado": "caida"}
        r = self.R.racha_de_caida(anterior, nueva, "2026-10-28 01:00")
        self.assertEqual(r["caidas_seguidas"], 3)
        self.assertEqual(r["caida_desde"], "2026-10-28 00:00")

    def test_se_reinicia_sin_caida(self):
        anterior = {"estado": "caida", "caidas_seguidas": 5, "caida_desde": "2026-10-27 00:00"}
        nueva = {"estado": "escribe"}
        r = self.R.racha_de_caida(anterior, nueva, "2026-10-28 01:00")
        self.assertEqual(r["caidas_seguidas"], 0)
        self.assertEqual(r["caida_desde"], "")

    def test_conserva_caida_desde_al_iniciar(self):
        anterior = None
        nueva = {"estado": "caida"}
        r = self.R.racha_de_caida(anterior, nueva, "2026-10-28 01:00")
        self.assertEqual(r["caidas_seguidas"], 1)
        self.assertEqual(r["caida_desde"], "2026-10-28 01:00")


class TokenDeDespliegueDelA1(unittest.TestCase):
    """(IND1029I, 2026-10-30) Publicar sin la Mac: el líder del A1 empuja sus commits con un
    token de grano fino. Alex lo crea UNA vez; la acción sale solo si la bóveda del A1 no lo
    tiene, y la comprobación nunca lee ni imprime el valor."""

    def test_no_se_pide_si_el_a1_ya_lo_tiene(self):
        self.assertIsNone(A.accion_token_despliegue(True))

    def test_no_se_pide_a_ciegas_si_no_se_pudo_comprobar(self):
        self.assertIsNone(A.accion_token_despliegue(None))

    def test_sale_con_enlace_orden_y_permisos_si_falta(self):
        a = A.accion_token_despliegue(False)
        self.assertEqual("token-despliegue-a1", a["id"])
        self.assertEqual("media", a["urgencia"])
        self.assertEqual("STARSEED_DESPLIEGUE_GH_TOKEN", a["variable"])
        self.assertIn("personal-access-tokens/new", a["enlace"])
        self.assertIn("StarSeedSystem", a["enlace"])
        self.assertIn("contents=write", a["enlace"])
        self.assertIn("actions=read", a["enlace"])
        self.assertTrue(a["comando"].startswith("cd /"))
        self.assertIn("guardar-clave.sh STARSEED_DESPLIEGUE_GH_TOKEN --ambos", a["comando"])
        self.assertIn("oracle_claves.py starseed-a1 STARSEED_DESPLIEGUE_GH_TOKEN", a["comando"])
        self.assertTrue(a["por_que_no_lo_hago_yo"])

    def test_entra_en_la_lista_solo_si_falta(self):
        faltando = A.construir_acciones([], TODOS, CATALOGO, a1_tiene_token=False)
        self.assertIn("token-despliegue-a1", [x["id"] for x in faltando])
        self.assertNotIn("token-despliegue-a1",
                         [x["id"] for x in A.construir_acciones([], TODOS, CATALOGO, a1_tiene_token=True)])

    def test_lo_media_va_despues_de_lo_urgente(self):
        acciones = A.construir_acciones([], [], CATALOGO, entorno={}, a1_tiene_token=False)
        ids = [x["id"] for x in acciones]
        self.assertLess(ids.index("canal-de-avisos-sin-configurar"), ids.index("token-despliegue-a1"))

    def test_dice_que_esta_interpreta_la_marca(self):
        self.assertTrue(A.dice_que_esta("SI"))
        self.assertFalse(A.dice_que_esta("NO"))
        self.assertIsNone(A.dice_que_esta(""))
        self.assertIsNone(A.dice_que_esta("bash: sudo: no permitido"))
        self.assertTrue(A.dice_que_esta("aviso\nSI\n"))

    def test_comprueba_sin_leer_el_valor(self):
        visto = {}

        def ssh(orden, timeout=8):
            visto["orden"] = orden
            return 0, "SI"

        self.assertTrue(A.a1_tiene_clave("STARSEED_DESPLIEGUE_GH_TOKEN", ssh=ssh))
        self.assertIn("grep -qE", visto["orden"])
        self.assertNotIn("cat ", visto["orden"])
        self.assertNotIn("sudo cat", visto["orden"])

    def test_si_el_a1_no_responde_no_se_inventa_nada(self):
        def revienta(orden, timeout=8):
            raise OSError("sin A1")

        self.assertIsNone(A.a1_tiene_clave("STARSEED_DESPLIEGUE_GH_TOKEN", ssh=revienta))

    def test_nombre_raro_no_sale_al_shell(self):
        def no_llamar(orden, timeout=8):
            raise AssertionError("no debería llamar al A1")

        self.assertIsNone(A.a1_tiene_clave("NO; rm -rf /", ssh=no_llamar))

    def test_verificar_recomprueba_la_boveda(self):
        hecho = A.verificar("token-despliegue-a1", pasarelas=[], secretos_repo=TODOS,
                            entorno={"TELEGRAM_BOT_TOKEN": "x", "TELEGRAM_CHAT_ID": "y"},
                            a1_tiene_token=True)
        self.assertTrue(hecho["hecha"])
        falta = A.verificar("token-despliegue-a1", pasarelas=[], secretos_repo=TODOS,
                            entorno={"TELEGRAM_BOT_TOKEN": "x", "TELEGRAM_CHAT_ID": "y"},
                            a1_tiene_token=False)
        self.assertFalse(falta["hecha"])
        self.assertIn("Token de despliegue", falta["titulo"])


def test_1103_token_de_despliegue_explica_repo_y_permisos():
    import importlib.util as _u, os as _o
    _s = _u.spec_from_file_location("ada1103", _o.path.join(_o.path.dirname(__file__), "acciones-de-alex.py"))
    m = _u.module_from_spec(_s); _s.loader.exec_module(m)
    for texto in ("Only select repositories", "starseed-system", "Contents = Read and write",
                  "Workflows = Read and write", "Actions = Read-only", "No access"):
        assert texto in m.PASOS_TOKEN_DESPLIEGUE, texto
    assert "workflows=write" in m.ENLACE_TOKEN_DESPLIEGUE


def test_1103_el_token_se_busca_donde_lo_deja_oracle_claves():
    import importlib.util as _u, os as _o
    _s = _u.spec_from_file_location("ada1103l", _o.path.join(_o.path.dirname(__file__), "acciones-de-alex.py"))
    m = _u.module_from_spec(_s); _s.loader.exec_module(m)
    vistas = []
    def ssh(orden, timeout=6):
        vistas.append(orden)
        return 0, "SI\n"
    assert m.a1_tiene_clave(ssh=ssh) is True
    assert "/etc/starseed/direccion.env" in vistas[0] and "[ -e" not in vistas[0]


class CodexCuenta(unittest.TestCase):
    """La acción codex-cuenta aparece cuando la cuenta de ChatGPT no admite Codex."""

    def setUp(self):
        # Patch the _cupo module inside A (acciones_de_alex) which is what construir_acciones uses
        self.antes_ruta = A._cupo.RUTA if A._cupo else None
        import tempfile
        self.dir = tempfile.mkdtemp()
        if A._cupo:
            A._cupo.RUTA = os.path.join(self.dir, "codex-cupo.json")

    def tearDown(self):
        if A._cupo and self.antes_ruta is not None:
            A._cupo.RUTA = self.antes_ruta

    def test_sin_marca_no_sale_accion(self):
        # cupo_codex.leer() devuelve {} si no hay archivo
        a = A.construir_acciones([], TODOS, CATALOGO)
        self.assertNotIn("codex-cuenta", [x["id"] for x in a])

    def test_marca_cuota_agotada_no_sale_accion(self):
        # Motivo de cuota agotada NO dispara la acción codex-cuenta
        A._cupo.anotar("cuota agotada: You've hit your usage limit", ahora=1000000000.0, horas=3)
        a = A.construir_acciones([], TODOS, CATALOGO)
        self.assertNotIn("codex-cuenta", [x["id"] for x in a])

    def test_marca_cuenta_chatgpt_sin_codex_sale_accion(self):
        # Motivo que empieza con "cuenta de ChatGPT sin Codex" SÍ dispara la acción
        A._cupo.anotar("cuenta de ChatGPT sin Codex: The 'gpt-5.6-sol' model is not supported when using Codex with a ChatGPT account",
                       ahora=1000000000.0, horas=24)
        a = A.construir_acciones([], TODOS, CATALOGO, ahora=1000000000.0)
        codex_acciones = [x for x in a if x["id"] == "codex-cuenta"]
        self.assertEqual(1, len(codex_acciones))
        accion = codex_acciones[0]
        self.assertEqual("Codex: tu cuenta de ChatGPT ya no deja usarlo", accion["titulo"])
        self.assertEqual("media", accion["urgencia"])
        self.assertIn("desde 2001-09-08", accion["por_que"])  # 1000000000 = 2001-09-08/09 según zona horaria
        self.assertIn("model not supported when using Codex with a ChatGPT account", accion["por_que"])
        self.assertIn("el enjambre lo ha apartado y sigue con los demás", accion["por_que"])
        self.assertEqual("https://chatgpt.com/#settings/Account", accion["enlace"])
        self.assertEqual("", accion["comando"])  # comando vacío
        self.assertIn("chatgpt.com", accion["detalle"])
        self.assertIn("Ajustes › Plan", accion["detalle"])
        self.assertIn("npm i -g @openai/codex", accion["detalle"])
        self.assertIn("codex login", accion["detalle"])
        self.assertEqual("es tu cuenta y tu suscripción", accion["por_que_no_lo_hago_yo"])

    def test_marca_vencida_no_sale_accion(self):
        # Marca antigua (ya vencida) no dispara la acción
        A._cupo.anotar("cuenta de ChatGPT sin Codex: modelo no soportado",
                       ahora=1000000000.0, horas=1)  # 1 hora, ya pasó
        # Avanzar el tiempo simulado para que la marca esté vencida
        import time
        a = A.construir_acciones([], TODOS, CATALOGO, ahora=1000003600.0)  # 1 hora después
        self.assertNotIn("codex-cuenta", [x["id"] for x in a])

    def test_codex_cuenta_va_despues_de_lo_urgente(self):
        A._cupo.anotar("cuenta de ChatGPT sin Codex: modelo no soportado",
                       ahora=1000000000.0, horas=24)
        acciones = A.construir_acciones([], [], CATALOGO, entorno={}, ahora=1000000000.0)
        ids = [x["id"] for x in acciones]
        # canal-de-avisos-sin-configurar es urgencia "alta", codex-cuenta es "media"
        self.assertLess(ids.index("canal-de-avisos-sin-configurar"), ids.index("codex-cuenta"))
