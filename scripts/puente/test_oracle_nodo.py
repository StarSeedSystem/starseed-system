# -*- coding: utf-8 -*-
"""Pruebas de las decisiones puras del lado de la neurona (oracle_nodo.py, OPO1011)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import oracle_nodo as N  # noqa: E402


def _clave(*partes):
    """Claves de prueba montadas en tiempo de ejecución (la protección de secretos de GitHub)."""
    return "".join(partes)


class Tachar(unittest.TestCase):
    def test_ip_del_a1_su_host_y_cualquier_otra(self):
        t = N.tachar("a 140.1.2.3 b bitnet.140-1-2-3.sslip.io c 10.0.0.5 ocid1.instance.oc1.mx.zz", ip="140.1.2.3")
        for prohibido in ("140.1.2.3", "140-1-2-3", "10.0.0.5", "ocid1."):
            self.assertNotIn(prohibido, t)


class Entorno(unittest.TestCase):
    def test_leer_env_con_export_comillas_y_comentarios(self):
        env = N.leer_env("# x\nexport A_KEY='uno'\nB=\"dos\"\nminus=no\nC=tres=cuatro\n")
        self.assertEqual(env, {"A_KEY": "uno", "B": "dos", "C": "tres=cuatro"})

    def test_solo_viaja_la_lista_blanca_y_nada_de_pago(self):
        env = {"XKIRO_API_KEY": "x1", "ANTHROPIC_API_KEY": "no", "OPENAI_API_KEY": "no",
               "NEXT_PUBLIC_SUPABASE_URL": "https://p.supabase.co", "GROQ_API_KEY": "",
               "TOKEN_DE_OTRA_COSA": "no"}
        van, faltan = N.variables_para_a1(env)
        self.assertEqual(set(van), {"XKIRO_API_KEY", "NEXT_PUBLIC_SUPABASE_URL"})
        self.assertIn("GROQ_API_KEY", faltan)
        self.assertNotIn("ANTHROPIC_API_KEY", van)

    def test_pasarela_local_no_viaja(self):
        env = {"STARSEED_PASARELA_GROQ_URL": "http://127.0.0.1:3001/v1", "STARSEED_PASARELA_GROQ_KEY": "k"}
        van, _ = N.variables_para_a1(env)
        self.assertEqual(van, {})

    def test_freellmapi_viaja_porque_el_a1_tiene_el_suyo_en_local(self):
        # (2026-10-13) a1_freellmapi.py: mismo puerto local y misma clave unificada que la Mac.
        env = {"FREELLMAPI_KEY": "k", "STARSEED_PASARELA_FREELLMAPI_URL": "http://127.0.0.1:3001/v1",
               "STARSEED_PASARELA_FREELLMAPI_KEY": "k", "STARSEED_PASARELA_FREELLMAPI_MODELOS": "auto",
               "HF_TOKEN": "h"}
        van, _ = N.variables_para_a1(env)
        self.assertEqual(set(van), set(env))

    def test_contenido_env_cita_lo_raro(self):
        texto = N.contenido_env({"A": "abc-123_./:", "B": "con espacio", "C": "it's"})
        self.assertIn("A=abc-123_./:\n", texto)
        self.assertIn("B='con espacio'", texto)
        self.assertEqual(N.leer_env("A=1\n").get("A"), "1")

    def test_con_variable_sustituye_sin_duplicar(self):
        texto = N.con_variable("X=1\nSTARSEED_ORACLE_BITNET_KEY=viejo\nexport Y=2\n", "STARSEED_ORACLE_BITNET_KEY", "nuevo")
        self.assertEqual(texto.count("STARSEED_ORACLE_BITNET_KEY="), 1)
        self.assertEqual(N.leer_env(texto)["STARSEED_ORACLE_BITNET_KEY"], "nuevo")
        self.assertEqual(N.leer_env(texto)["Y"], "2")


class Relevo(unittest.TestCase):
    def test_solo_entregas_nuevas_o_reescritas(self):
        en_a1 = {"nube/a1-1": "a", "nube/a1-2": "b", "nube/a1-3": "c", "nube/otra": "d"}
        self.assertEqual(N.ramas_por_relevar(en_a1, {"nube/a1-1": "a", "nube/a1-2": "x"}), ["nube/a1-2", "nube/a1-3"])


class Lanzar(unittest.TestCase):
    VIVO = {"latido": 1000.0, "fase": "espera"}

    def test_lanza_con_el_nodo_libre(self):
        self.assertEqual(N.decidir_lanzar(self.VIVO, 1100, {}, None, []), (True, "A1 libre"))

    def test_no_sin_latido(self):
        ok, motivo = N.decidir_lanzar({"latido": 0}, 5000, {}, None, [])
        self.assertFalse(ok)
        self.assertIn("no late", motivo)

    def test_freno_de_gasto_manda(self):
        ok, motivo = N.decidir_lanzar(self.VIVO, 1100, {"freno": {"activo": True, "motivo": "gasto 3 MXN"}}, None, [])
        self.assertFalse(ok)
        self.assertIn("freno", motivo)

    def test_no_con_cola_en_marcha_ni_sin_tomar_ni_seguido(self):
        self.assertFalse(N.decidir_lanzar(dict(self.VIVO, fase="cola", cola="c"), 1100, {}, None, [])[0])
        self.assertFalse(N.decidir_lanzar(self.VIVO, 1100, {}, None, ["colas/oracle-1"])[0])
        self.assertFalse(N.decidir_lanzar(self.VIVO, 1100, {}, 1000, [])[0])
        vivo_luego = dict(self.VIVO, latido=2300.0)
        self.assertTrue(N.decidir_lanzar(vivo_luego, 2300, {}, 1000, [])[0])


class Prestamo(unittest.TestCase):
    def test_marcar_y_devolver(self):
        p = N.marcar_oracle({"T1": {"estado": "pendiente"}, "T3": {"estado": "pendiente"}}, ["T1", "T2"], "20261010", "colas/oracle-1")
        self.assertEqual(p["T1"]["estado"], "reasignada")
        self.assertEqual(p["T1"]["medio"], "oracle")
        self.assertEqual(p["T2"]["medio"], "oracle")
        self.assertEqual(p["T3"]["estado"], "pendiente")
        lanz = [{"rama": "colas/oracle-1", "ids": ["T1", "T2"], "t": 0}]
        # Mientras el A1 no la termina y late, nada vuelve.
        self.assertEqual(N.devolver_de_oracle(p, lanz, {}, True, 100), [])
        # Terminada: vuelven las que siguen prestadas (no las que ya decidió otro).
        p["T2"]["estado"] = "commit"
        self.assertEqual(N.devolver_de_oracle(p, lanz, {"colas/oracle-1": {}}, True, 100), ["T1"])
        # Nodo muerto más allá de la gracia: vuelven aunque no conste terminada.
        self.assertEqual(N.devolver_de_oracle(p, lanz, {}, False, 4 * 3600, gracia_s=3 * 3600), ["T1"])

    def test_no_toca_lo_prestado_a_la_nube_de_github(self):
        p = {"T": {"estado": "reasignada", "medio": "nube"}}
        self.assertEqual(N.devolver_de_oracle(p, [{"rama": "r", "ids": ["T"], "t": 0}], {"r": {}}, True, 1), [])

    def test_movida_desde_genesis_vuelve_sin_estar_en_lanzamientos(self):
        """(2026-10-21) La reasignación de Genesis no apunta en `lanzamientos`: la rama que cita la
        nota manda. Rama de 20261018-231246, A1 sin ella y pasadas más de las 3 h de gracia."""
        import calendar
        nacida = calendar.timegm((2026, 10, 18, 23, 12, 46, 0, 0, 0))
        p = {"T": {"estado": "reasignada", "medio": "oracle",
                   "nota": "movida a oracle (colas/oracle-20261018-231246) desde Genesis"}}
        self.assertEqual(N.devolver_de_oracle(p, [], {}, True, nacida + 3 * 3600 + 60), ["T"])

    def test_movida_desde_genesis_no_vuelve_si_la_cola_vive_o_dentro_de_gracia(self):
        import calendar
        nacida = calendar.timegm((2026, 10, 18, 23, 12, 46, 0, 0, 0))
        p = {"T": {"estado": "reasignada", "medio": "oracle",
                   "nota": "movida a oracle (colas/oracle-20261018-231246) desde Genesis"}}
        # El nodo la tiene en curso: no se le pisa el trabajo.
        self.assertEqual(N.devolver_de_oracle(p, [], {}, True, nacida + 3 * 3600 + 60,
                                              colas_vivas=("colas/oracle-20261018-231246",)), [])
        # Dentro de la gracia encima: tampoco.
        self.assertEqual(N.devolver_de_oracle(p, [], {}, True, nacida + 3600), [])
        # Si el A1 la terminó, vuelve aunque la gracia no pase.
        self.assertEqual(N.devolver_de_oracle(p, [], {"colas/oracle-20261018-231246": {}}, True, nacida + 60), ["T"])
        # Nota sin rama citada, y lo que no es «reasignada · oracle»: nada.
        p2 = {"U": {"estado": "reasignada", "medio": "oracle", "nota": "sin rama"},
              "V": {"estado": "commit", "medio": "oracle",
                    "nota": "movida a oracle (colas/oracle-20261018-231246) desde Genesis"}}
        self.assertEqual(N.devolver_de_oracle(p2, [], {}, True, nacida + 3 * 3600 + 60), [])

    def test_nota_sin_rama_y_lo_que_no_es_prestamo_de_oracle(self):
        """Nota sin rama, tarea ya terminada, reasignada a otro medio y valores basura: nada vuelve."""
        import calendar
        nacida = calendar.timegm((2026, 10, 18, 23, 12, 46, 0, 0, 0))
        rama = "colas/oracle-20261018-231246"
        p = {"U": {"estado": "reasignada", "medio": "oracle", "nota": "sin rama"},
             "V": {"estado": "commit", "medio": "oracle",
                   "nota": "movida a oracle (%s) desde Genesis" % rama},
             "W": {"estado": "reasignada", "medio": "nube",
                   "nota": "movida a oracle (%s) desde Genesis" % rama},
             "X": "basura"}
        self.assertEqual(N.devolver_de_oracle(p, [], {}, True, nacida + 3 * 3600 + 60), [])


class Resumen(unittest.TestCase):
    def test_sin_urls_ni_ips_y_con_la_sonda_publica(self):
        e = {"latido": 1000, "t": "2026-10-10T10:00:00Z", "fase": "guardian",
             "servicios": [{"nombre": "caddy", "ok": True, "activo": "active", "ms": 30,
                            "detalle": "https://bitnet.140-1-2-3.sslip.io 200"}],
             "guardian": {"t": 900, "sha": "abc", "ok": True, "pasos": [], "minutos": 30, "otro": "x"},
             "carga": {"cpu_1h": 40.0, "mem_ahora": 25.0, "cpu_p95_7d": 55.0, "horas": [{"h": "x"}] * 30}}
        nodo, servicios = N.resumen_para_oracle_json(e, {"ok": True, "codigo": "200", "ms": 120}, 1100)
        self.assertTrue(nodo["vivo"])
        self.assertEqual(len(nodo["horas"]), 24)
        self.assertNotIn("otro", nodo["guardian"])
        self.assertEqual([s["nombre"] for s in servicios], ["caddy", "bitnet-publico"])
        self.assertNotIn("140-1-2-3", str(servicios))

    def test_lleva_desde_cuando_trabaja_su_cola(self):
        """(CAP1026O) El medidor «Agentes» de Genesis dice cuánto lleva la cola de los trabajadores del A1."""
        e = {"latido": 1000, "fase": "cola", "fase_desde": 400, "cola": "cola-nube-x.json",
             "orquestador": {"vivo": True, "cola": "cola-nube-x.json", "trabajadores": 3}}
        nodo, _ = N.resumen_para_oracle_json(e, None, 1100)
        self.assertEqual((nodo["fase_desde"], nodo["orquestador"]["trabajadores"]), (400, 3))

    def test_avisa_solo_cuando_cambia(self):
        verde = {"vivo": True, "guardian": {"t": 1, "ok": True, "sha": "a", "pasos": []}}
        rojo = {"vivo": True, "guardian": {"t": 2, "ok": False, "sha": "b", "asunto": "x",
                                           "pasos": [{"paso": "tsc", "ok": False}]}}
        self.assertIsNone(N.aviso_de_cambio(verde, verde))
        self.assertIn("ROJO", N.aviso_de_cambio(verde, rojo))
        self.assertIn("tsc", N.aviso_de_cambio(verde, rojo))
        self.assertIn("dejado de latir", N.aviso_de_cambio(verde, {"vivo": False}))
        self.assertIsNone(N.aviso_de_cambio(None, {"vivo": False}))


class Integracion(unittest.TestCase):
    """Los dos archivos compartidos que leen el nodo: medios y la comprobación de la cuenta."""

    def test_medios_ve_el_nodo_vivo_como_listo(self):
        import medios_disponibles as M

        datos = {"vinculada": True, "region": "mx-queretaro-1",
                 "instancias": [{"nombre": "starseed-a1", "forma": "VM.Standard.A1.Flex", "estado": "RUNNING"}],
                 "nodo": {"vivo": True, "latido": 1_000_000.0, "fase": "guardian",
                          "guardian": {"t": 999_000.0, "ok": True}}}
        d = M.clasificar_oracle(datos, {"medios": {}}, 1_000_000.0 + 1200)
        self.assertEqual(d["estado"], "listo")
        self.assertIn("nodo de MetaGenesis vivo", d["detalle"])
        self.assertIn("verde", d["detalle"])
        # Un latido de hace más de 45 min ya no vale.
        self.assertEqual(M.clasificar_oracle(datos, {"medios": {}}, 1_000_000.0 + 3000)["estado"], "usable")

    def test_comprobar_la_cuenta_no_borra_el_nodo(self):
        import oracle_nube as O

        doc = O._publico({"vinculada": True, "instancias": [], "nodo": {"vivo": True, "latido": 1},
                          "servicios": [{"nombre": "bitnet", "ok": True, "activo": "active", "ms": 3, "t": "x",
                                         "titulo": "BitNet", "detalle": "salud 200"}]})
        self.assertEqual(doc["nodo"], {"vivo": True, "latido": 1})
        self.assertEqual(doc["servicios"][0]["activo"], "active")
        self.assertNotIn("url", doc["servicios"][0])


class Borradores(unittest.TestCase):
    def test_solo_los_nuevos_para_aprobar_y_con_huella(self):
        import json
        mac = [json.dumps({"huella": "a", "estado": "para_aprobar"}), "no-json"]
        a1 = [json.dumps({"huella": "a", "estado": "para_aprobar"}),
              json.dumps({"huella": "b", "estado": "para_aprobar", "sitio_id": "goteo"}),
              json.dumps({"huella": "c", "estado": "aprobado"}),
              json.dumps({"sin": "huella"}), "roto", json.dumps({"huella": "b"})]
        nuevas = [json.loads(x) for x in N.borradores_nuevos(mac, a1)]
        self.assertEqual([x["huella"] for x in nuevas], ["b"])
        self.assertEqual(nuevas[0]["medio"], "oracle_a1")


class SinIpEnPantalla(unittest.TestCase):
    def test_oracle_nube_no_imprime_la_ip(self):
        import oracle_nube as O

        estado = {"vinculada": True, "perfil": "DEFAULT", "region": "mx", "limites": {},
                  "instancias": [{"nombre": "starseed-a1", "forma": "A1", "ocpus": 2, "gb": 12,
                                  "estado": "RUNNING", "ip_publica": "203.0.113.8"}], "servicios": []}
        texto = "\n".join(O._lineas(estado))
        self.assertNotIn("203.0.113.8", texto)
        self.assertIn("con IP pública", texto)


class MainVivo(unittest.TestCase):
    """`enviar-main`: el guardián del A1 comprueba el main que de verdad se escribe."""

    def test_cuando_se_envia(self):
        a, b, c = "a" * 40, "b" * 40, "c" * 40
        self.assertEqual(N.main_por_enviar("", a, "", None, 1000)[0], False)
        self.assertEqual(N.main_por_enviar(a, a, "", None, 1000), (False, "main ya publicado: el A1 lo ve en origin/main"))
        self.assertEqual(N.main_por_enviar(b, a, b, None, 1000), (False, "el A1 ya tiene este main"))
        self.assertEqual(N.main_por_enviar(b, a, c, None, 1000), (True, "main nuevo"))

    def test_no_reenvia_hasta_dar_margen_al_a1(self):
        a, b = "a" * 40, "b" * 40
        enviado = {"sha": b, "t": 1000}
        self.assertFalse(N.main_por_enviar(b, a, "", enviado, 1000 + 60)[0])
        self.assertTrue(N.main_por_enviar(b, a, "", enviado, 1000 + N.REINTENTO_MAIN_S + 1)[0])
        # Otro main distinto sale al momento aunque el anterior sea reciente.
        self.assertTrue(N.main_por_enviar("c" * 40, a, "", enviado, 1000 + 60)[0])

    def test_el_secreto_del_bus_viaja_y_nada_de_pago(self):
        self.assertIn("STARSEED_LANZADOR_SECRETO", N.CLAVES_A1)
        for pago in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "DEEPSEEK_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"):
            self.assertNotIn(pago, N.CLAVES_A1)


class MedidorEnElCiclo(unittest.TestCase):
    """El riesgo de reclamación que ve Alex no puede quedarse con una lectura de hace horas."""

    def test_sin_sesion_no_mide(self):
        class Sin:
            @staticmethod
            def disponible():
                return False
        self.assertIn("no", N.medir_oracle(Sin))

    def test_resume_lo_medido(self):
        class Con:
            @staticmethod
            def disponible():
                return True

            @staticmethod
            def medir_si_toca():
                return {"leido": "2026-10-10T20:16:00Z", "reclamacion": {"riesgo": False, "maquinas": [
                    {"nombre": "starseed-a1", "cpu_p95": 23.41, "mem_p95": 23.33}]}}
        self.assertEqual(N.medir_oracle(Con), {"leido": "2026-10-10T20:16:00Z", "riesgo": False,
                                               "cpu_p95": 23.41, "mem_p95": 23.33})

    def test_un_fallo_no_tumba_el_ciclo(self):
        class Roto:
            @staticmethod
            def disponible():
                raise RuntimeError("oci colgado")
        self.assertIn("error", N.medir_oracle(Roto))



class ModulosDelNodo(unittest.TestCase):
    """(2026-10-14) Reinstalar el nodo del A1 lo tumbó: importaba `colmena_logica` al arrancar y
    no viajaba en el paquete. Todo import de nivel superior de los nodo_metagenesis* que no sea de
    la biblioteca estándar tiene que viajar con ellos."""

    def test_lo_que_el_nodo_importa_al_arrancar_viaja_con_el(self):
        import re
        dir_ = os.path.dirname(os.path.abspath(__file__))
        propios = {f[:-3] for f in os.listdir(dir_) if f.endswith(".py")}
        viajan = {f[:-3] for f in os.listdir(dir_) if f.startswith("nodo_metagenesis") and f.endswith(".py")
                  and not f.startswith("test_")} | {m[:-3] for m in N.MODULOS_DEL_NODO}
        for nombre in sorted(viajan):
            with open(os.path.join(dir_, nombre + ".py"), encoding="utf-8") as f:
                for linea in f:
                    m = re.match(r"(?:import|from) ([A-Za-z_][A-Za-z0-9_]*)", linea)  # solo nivel superior
                    if m and m.group(1) in propios:
                        self.assertIn(m.group(1), viajan, "%s importa %s al arrancar" % (nombre, m.group(1)))


class Leann(unittest.TestCase):
    """(LNN1028C) El recuerdo semántico (LEANN) en el A1: plan y paquete, sin ssh."""

    @classmethod
    def setUpClass(cls):
        """El corredor puede poner STARSEED_ROOT fuera de este árbol (aquí apunta a otro
        checkout viejo, que ni siquiera tiene leann_servidor.py): el módulo se recoloca a la
        raíz que sale de su propio __file__, y con ella las rutas LEANN y el FUENTE."""
        raiz = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        N.RAIZ = N.FUENTE = raiz
        N.LEANN_INSTALADOR = os.path.join(raiz, "deploy", "oracle", "nodo", "leann-a1.sh")
        N.LEANN_UNIDAD = os.path.join(raiz, "deploy", "oracle", "nodo", "systemd", "starseed-leann.service")

    def test_plan_fijado_licencia_unidad(self):
        import json

        texto = json.dumps(N.plan_leann(), ensure_ascii=False)
        self.assertIn("leann==0.3.8", texto)
        self.assertIn("qwen3-embedding:0.6b", texto)
        self.assertIn("Apache", texto)  # licencia comprobada antes de darlo por bueno
        self.assertIn("OLLAMA_KEEP_ALIVE=2m", texto)
        self.assertIn("enable --now starseed-leann", texto)
        self.assertNotIn("0.0.0.0", texto)

    def test_la_unidad_exige_el_venv_y_es_del_usuario_del_servicio(self):
        with open(N.LEANN_UNIDAD, encoding="utf-8") as f:
            unidad = f.read()
        self.assertIn("# requiere: /opt/starseed/leann/.venv/bin/python", unidad)
        self.assertIn("User=starseed", unidad)
        self.assertIn("MemoryMax=1500M", unidad)
        self.assertIn("Nice=10", unidad)
        self.assertIn("Restart=on-failure", unidad)
        self.assertIn("OLLAMA_HOST=http://127.0.0.1:11434", unidad)
        self.assertNotIn("0.0.0.0", unidad)

    def test_el_paquete_lleva_servidor_hermanos_e_instalador(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            incluido = N._paquete(tmp)
            for rel in ("leann/leann_servidor.py", "leann/leann_indices.py", "leann/fusion_recuerdos.py",
                        "leann-a1.sh"):
                self.assertIn(rel, incluido)
                self.assertTrue(os.path.exists(os.path.join(tmp, rel)), rel)


class CuentasAlA1(unittest.TestCase):
    """(SDP1111O) Los cuatro nombres nuevos de la síntesis y la actividad de Google viajan en la
    lista blanca, y las fichas de cuentas Google (`~/.starseed/cuentas/*.json`, tokens de
    refresco) viajan al A1 empaquetadas con 0600 en origen y destino, sin leer ni imprimir valores."""

    def test_los_cuatro_nombres_nuevos_estan_en_la_lista(self):
        for nombre in ("TELEGRAM_SINTESIS_BOT_TOKEN", "TELEGRAM_SINTESIS_CHAT_ID",
                       "GOOGLE_ACTIVIDAD_CLIENT_ID", "GOOGLE_ACTIVIDAD_CLIENT_SECRET"):
            self.assertIn(nombre, N.CLAVES_A1)

    def test_los_nombres_nuevos_viajan_cuando_tienen_valor(self):
        env = {"TELEGRAM_SINTESIS_BOT_TOKEN": "t", "TELEGRAM_SINTESIS_CHAT_ID": "c",
               "GOOGLE_ACTIVIDAD_CLIENT_ID": "i", "GOOGLE_ACTIVIDAD_CLIENT_SECRET": "s"}
        van, faltan = N.variables_para_a1(env)
        self.assertEqual(set(van), set(env))
        self.assertNotIn("TELEGRAM_SINTESIS_BOT_TOKEN", faltan)

    def test_empaquetado_solo_json_y_con_modo_0600(self):
        import tarfile
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            ficha = os.path.join(tmp, "alex.json")
            with open(ficha, "w", encoding="utf-8") as f:
                f.write('{"refresh_token": "valor-que-nadie-lee"}')
            os.chmod(ficha, 0o600)
            with open(os.path.join(tmp, "notas.txt"), "w", encoding="utf-8") as f:
                f.write("x")
            with open(os.path.join(tmp, "alex.json.tmp"), "w", encoding="utf-8") as f:
                f.write("x")
            tgz = os.path.join(tmp, "cuentas.tgz")
            nombres, ruta = N.empaquetar_cuentas(tmp, tgz)
            self.assertEqual(nombres, ["alex.json"])
            self.assertEqual(ruta, tgz)
            with tarfile.open(tgz) as t:
                miembros = t.getmembers()
            self.assertEqual([m.name for m in miembros], ["alex.json"])
            self.assertEqual(miembros[0].mode & 0o777, 0o600)

    def test_sin_carpeta_o_vacia_no_es_error_ni_empaqueta(self):
        import tempfile

        self.assertEqual(N.empaquetar_cuentas("/no-existe-sdp1111o", None), ([], None))
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(N.empaquetar_cuentas(tmp, os.path.join(tmp, "c.tgz")), ([], None))

    def test_el_destino_en_el_a1_queda_0600_y_sin_eco_de_nombres(self):
        guion = N.guion_cuentas()
        self.assertIn("install -d -o starseed -g starseed -m 700", guion)
        self.assertIn("chmod 600", guion)
        self.assertIn("cuentas-ok", guion)
        self.assertIn("2>/dev/null", guion)  # tar y find callados: ningún nombre en el registro
        self.assertNotIn("ls ", guion)
        self.assertNotIn("cat ", guion)

    def test_sin_carpeta_de_cuentas_no_llama_a_ssh(self):
        llamadas = []
        original = N._ssh_bytes
        N._ssh_bytes = lambda *a, **k: llamadas.append(a) or (0, "")
        try:
            r = N._cuentas_al_a1(carpeta="/no-existe-sdp1111o")
        finally:
            N._ssh_bytes = original
        self.assertEqual((r.get("ok"), r.get("enviados"), len(llamadas)), (True, 0, 0))

    def test_guion_cuentas_incluye_chown_de_archivos_a_starseed(self):
        """(PET1112C) Los archivos extraídos deben quedar con dueño starseed:starseed, no 501:staff."""
        guion = N.guion_cuentas()
        self.assertIn("chown -R starseed:starseed", guion)
        self.assertIn("install -d -o starseed -g starseed -m 700", guion)
        self.assertIn("chmod 600", guion)


class NotebookLMAlA1(unittest.TestCase):
    """(PET1112C) El A1 es el único dueño de la sesión de NotebookLM."""

    def _ssh_mock(self, respuestas):
        """Crea un mock de ssh que devuelve respuestas en secuencia."""
        self._ssh_llamadas = []
        def mock_ssh(orden, entrada=None, timeout=120):
            self._ssh_llamadas.append({"orden": orden, "entrada": entrada})
            if not respuestas:
                return 0, ""
            return respuestas.pop(0)
        return mock_ssh

    def _ssh_bytes_mock(self, respuestas):
        """Crea un mock de _ssh_bytes que devuelve respuestas en secuencia."""
        self._ssh_bytes_llamadas = []
        def mock_ssh_bytes(orden, datos, timeout=300):
            self._ssh_bytes_llamadas.append({"orden": orden, "datos": datos})
            if not respuestas:
                return 0, ""
            return respuestas.pop(0)
        return mock_ssh_bytes

    def test_si_a1_tiene_sesion_viva_no_copia_y_avisa(self):
        """Si `notebooklm auth check` en el A1 dice que la sesión está viva, no se copia nada."""
        original_ssh = N.ssh
        original_ssh_bytes = N._ssh_bytes
        # 1ª llamada: notebooklm auth check -> ok (sesión viva)
        # 2ª llamada: guion_notebooklm (no debería llamarse)
        N.ssh = self._ssh_mock([(0, "ok")])
        N._ssh_bytes = self._ssh_bytes_mock([])
        try:
            # Crear una sesión falsa en la Mac
            import tempfile, os
            with tempfile.TemporaryDirectory() as tmp:
                origen = os.path.join(tmp, "storage_state.json")
                with open(origen, "w") as f:
                    f.write('{"cookies": []}')
                r = N._notebooklm_al_a1(origen=origen)
            self.assertTrue(r["ok"])
            self.assertFalse(r["enviado"])
            self.assertEqual(r["motivo"], "el A1 es el dueño y está viva")
            # Verificar que solo se llamó auth check, no el guion de copia
            ordenes = [c["orden"] for c in self._ssh_llamadas]
            self.assertTrue(any("auth check" in o for o in ordenes))
            self.assertFalse(any("notebooklm-ok" in o for o in ordenes))
        finally:
            N.ssh = original_ssh
            N._ssh_bytes = original_ssh_bytes

    def test_si_a1_no_tiene_sesion_copia_y_avisa_que_mac_deja_de_usarse(self):
        """Si `notebooklm auth check` en el A1 falla (sin sesión o caducada), copia y avisa."""
        original_ssh = N.ssh
        original_ssh_bytes = N._ssh_bytes
        # 1ª llamada: notebooklm auth check -> falla (sesión no válida)
        # 2ª llamada: _ssh_bytes para enviar el archivo
        # 3ª llamada: guion_notebooklm para desplegar
        N.ssh = self._ssh_mock([
            (1, "session expired"),  # auth check falla
            (0, "notebooklm-ok"),    # guion_notebooklm ok
        ])
        N._ssh_bytes = self._ssh_bytes_mock([(0, "")])  # envío del archivo ok
        try:
            import tempfile, os
            with tempfile.TemporaryDirectory() as tmp:
                origen = os.path.join(tmp, "storage_state.json")
                with open(origen, "w") as f:
                    f.write('{"cookies": [{"name": "test"}]}')
                r = N._notebooklm_al_a1(origen=origen)
            self.assertTrue(r["ok"])
            self.assertTrue(r["enviado"])
            self.assertIn("la Mac deja de usarse", r["motivo"])
            # Verificar que se llamó auth check y luego el guion de copia
            ordenes = [c["orden"] for c in self._ssh_llamadas]
            self.assertTrue(any("auth check" in o for o in ordenes))
            self.assertTrue(any("notebooklm-ok" in o for o in ordenes))
        finally:
            N.ssh = original_ssh
            N._ssh_bytes = original_ssh_bytes

    def test_si_a1_auth_check_falla_por_otro_motivo_tambien_copia(self):
        """Si auth check falla por cualquier motivo (CLI no instalado, error), se copia."""
        original_ssh = N.ssh
        original_ssh_bytes = N._ssh_bytes
        N.ssh = self._ssh_mock([
            (1, "command not found: notebooklm"),  # auth check falla
            (0, "notebooklm-ok"),
        ])
        N._ssh_bytes = self._ssh_bytes_mock([(0, "")])
        try:
            import tempfile, os
            with tempfile.TemporaryDirectory() as tmp:
                origen = os.path.join(tmp, "storage_state.json")
                with open(origen, "w") as f:
                    f.write('{"cookies": []}')
                r = N._notebooklm_al_a1(origen=origen)
            self.assertTrue(r["ok"])
            self.assertTrue(r["enviado"])
        finally:
            N.ssh = original_ssh
            N._ssh_bytes = original_ssh_bytes

    def test_sin_sesion_en_mac_no_falla_devuelve_motivo(self):
        """Si no hay archivo de sesión en la Mac, no falla; devuelve ok con enviado=False."""
        r = N._notebooklm_al_a1(origen="/no-existe-pet1112c")
        self.assertTrue(r["ok"])
        self.assertFalse(r["enviado"])
        self.assertEqual(r["motivo"], "sin sesión de NotebookLM en este nodo")


class PeticionesAlA1(unittest.TestCase):
    """(PET1112B) La orden `peticiones`: unidades systemd al A1, la nueva activa antes de retirar
    la herramienta vieja y el offset conservado. Guion puro, sin red."""

    def test_guion_copia_modulo_las_tres_unidades_y_luego_systemd(self):
        pasos = N.guion_peticiones(True, "20261113")
        self.assertEqual([p["que"] for p in pasos],
                         ["copiar-modulo", "copiar-unidad", "copiar-unidad", "copiar-unidad",
                          "systemd", "retirar-vieja"])
        self.assertEqual([p["nombre"] for p in pasos[1:4]], list(N.UNIDADES_PETICIONES))
        self.assertIn("peticiones_telegram.py", pasos[0]["destino"])

    def test_systemd_recarga_habilita_reinicia_la_nueva_y_arranca_el_path(self):
        orden = next(p for p in N.guion_peticiones(True, "x") if p["que"] == "systemd")["orden"]
        self.assertIn("daemon-reload", orden)
        self.assertIn("enable starseed-peticiones-telegram.service starseed-cuentas-dueno.path "
                      "starseed-cuentas-dueno.service", orden)
        self.assertIn("restart starseed-peticiones-telegram.service", orden)
        self.assertIn("start starseed-cuentas-dueno.path", orden)

    def test_la_vieja_solo_aparece_con_la_nueva_activa(self):
        self.assertNotIn("retirar-vieja", [p["que"] for p in N.guion_peticiones(False, "x")])
        retirada = next(p for p in N.guion_peticiones(True, "x") if p["que"] == "retirar-vieja")
        self.assertIn(N.HERRAMIENTA_VIEJA_PETICIONES, retirada["orden"])
        self.assertEqual(retirada["orden"], N.orden_retirada_vieja("x"))

    def test_retirada_para_aparca_y_comprueba_el_offset_sin_borrarlo(self):
        orden = N.orden_retirada_vieja("20261113")
        self.assertIn("pkill -f", orden)
        self.assertIn("mv", orden)
        self.assertIn("retirada-20261113", orden)
        self.assertIn("test -f", orden)
        self.assertEqual(orden.count("estado.json"), 1)  # solo el `test -f`: el offset no se borra
        self.assertNotIn("rm ", orden)

    def test_guion_y_plan_sin_ips_ni_claves(self):
        import json
        import re
        texto = json.dumps(N.guion_peticiones(True, "x")) + json.dumps(N.plan_peticiones())
        self.assertIsNone(re.search(r"\b\d{1,3}(?:\.\d{1,3}){3}\b", texto))

    def test_sin_aplicar_ensena_el_plan_y_no_toca_ssh(self):
        llamadas = []
        originales = (N.ssh, N._poner_en_a1)
        N.ssh = lambda *a, **k: llamadas.append(a) or (0, "")
        N._poner_en_a1 = lambda *a, **k: llamadas.append(a) or (0, "")
        try:
            r = N.peticiones(aplicar=False)
        finally:
            N.ssh, N._poner_en_a1 = originales
        self.assertEqual((r["ok"], r["aplicado"]), (True, False))
        self.assertEqual(llamadas, [])

    def _unidades_en(self, tmp):
        for nombre in N.UNIDADES_PETICIONES:
            with open(os.path.join(tmp, nombre), "w", encoding="utf-8") as f:
                f.write("[Unit]\n")

    def test_falta_una_unidad_no_arranca_nada(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:  # sin ninguna unidad dentro
            llamadas = []
            originales = (N.ssh, N._poner_en_a1)
            N.ssh = lambda *a, **k: llamadas.append(a) or (0, "")
            N._poner_en_a1 = lambda *a, **k: llamadas.append(a) or (0, "")
            try:
                r = N.peticiones(aplicar=True, carpeta_unidades=tmp)
            finally:
                N.ssh, N._poner_en_a1 = originales
        self.assertFalse(r["ok"])
        self.assertEqual(llamadas, [])

    def test_aplica_en_orden_y_sin_la_nueva_activa_la_vieja_sigue(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            self._unidades_en(tmp)
            llamadas = []

            def ssh_falso(orden, entrada=None, timeout=120):
                llamadas.append(orden)
                return (1, "inactive") if "is-active" in orden else (0, "")

            originales = (N.ssh, N._poner_en_a1)
            N.ssh = ssh_falso
            N._poner_en_a1 = lambda contenido, destino, modo=0o644, dueno="root": (
                llamadas.append("instalar %s" % destino) or (0, ""))
            try:
                r = dict(N.peticiones(aplicar=True, carpeta_unidades=tmp))
            finally:
                N.ssh, N._poner_en_a1 = originales
        self.assertTrue(r["ok"])
        import json
        hechos = json.loads(json.dumps(r.get("hecho") or []))
        self.assertEqual([h["que"] for h in hechos[:5]],
                         ["copiar-modulo", "copiar-unidad", "copiar-unidad", "copiar-unidad", "systemd"])
        self.assertEqual(hechos[0]["ok"], True)
        self.assertIn("/starseed-system/scripts/puente/peticiones_telegram.py", llamadas[0])
        self.assertIn("/etc/systemd/system/starseed-peticiones-telegram.service", llamadas[1])
        self.assertIn("la nueva no quedó activa", str(r["hecho"][-1]))
        self.assertEqual([l for l in llamadas if "retirada-" in l], [])  # la vieja sigue en marcha

    def test_con_la_nueva_activa_retira_la_vieja_y_conserva_el_offset(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            self._unidades_en(tmp)
            llamadas = []

            def ssh_falso(orden, entrada=None, timeout=120):
                llamadas.append(orden)
                return (0, "active") if "is-active" in orden else (0, "")

            originales = (N.ssh, N._poner_en_a1)
            N.ssh = ssh_falso
            N._poner_en_a1 = lambda contenido, destino, modo=0o644, dueno="root": (
                llamadas.append("instalar %s" % destino) or (0, ""))
            try:
                r = N.peticiones(aplicar=True, carpeta_unidades=tmp)
            finally:
                N.ssh, N._poner_en_a1 = originales
        self.assertTrue(r["ok"])
        retirada = next(l for l in llamadas if "retirada-" in l)
        self.assertLess(llamadas.index(next(l for l in llamadas if "is-active" in l)),
                        llamadas.index(retirada))  # solo se retira tras comprobar la nueva
        self.assertIn(N.HERRAMIENTA_VIEJA_PETICIONES, retirada)
        self.assertIn(".starseed/peticiones/estado.json", retirada)


if __name__ == "__main__":
    unittest.main()
