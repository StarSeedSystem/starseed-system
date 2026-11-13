#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas sin red de genesis_chats_logica.py (GEN1113B). Fixtures inventadas; reloj fijo."""
import importlib.util
import os
import sys
import unittest

CARPETA = os.path.dirname(os.path.abspath(__file__))
if CARPETA not in sys.path:
    sys.path.insert(0, CARPETA)

import genesis_chats_logica as L  # noqa: E402

_spec = importlib.util.spec_from_file_location("telegram_puente_prueba_logica", os.path.join(CARPETA, "telegram-puente.py"))
TG = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(TG)

DUENO = "11111111-2222-4333-8444-555555555555"
DESA = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
OTRO = "99999999-8888-4777-8666-555555555555"
CUENTAS = {"duenos": [DUENO], "desarrolladores": [DESA]}
AHORA = 1_800_000_000.0


def entrada(**kw):
    e = {"v": 1, "id": 7, "nonce": "N" * 24, "t": "2027-01-15T08:00:00Z", "fuente": "puente:hermes-avisos",
         "accion": "orden", "orden": {"nombre": "aprobar", "args": ["T1"]}, "cuenta": DUENO, "rol": "dueño",
         "destino": "mac", "recibido": L.iso_utc(AHORA - 60)}
    e.update(kw)
    return e


class Cuentas(unittest.TestCase):
    def test_sin_lista_no_se_ejecuta_nada(self):
        self.assertEqual(L.validar_entrada(entrada(), None, AHORA, {}), (False, L.SIN_LISTA))
        self.assertEqual(L.validar_entrada(entrada(), {"duenos": "x"}, AHORA, {}), (False, L.SIN_LISTA))

    def test_dueno_en_la_puerta_fuera_de_la_lista_es_solo_lector(self):
        e = entrada(cuenta=OTRO)
        self.assertEqual(L.validar_entrada(e, CUENTAS, AHORA, {}), (False, L.FUERA_DE_LISTA))
        e = entrada(cuenta=OTRO, fuente="direccion", accion="decir", texto="hola", canales=["mando"])
        self.assertEqual(L.validar_entrada(e, CUENTAS, AHORA, {}), (False, L.FUERA_DE_LISTA))

    def test_rol_efectivo_es_el_menor(self):
        self.assertEqual(L.rol_efectivo(entrada(), CUENTAS), "dueño")
        self.assertEqual(L.rol_efectivo(entrada(rol="desarrollador"), CUENTAS), "desarrollador")
        self.assertEqual(L.rol_efectivo(entrada(cuenta=DESA), CUENTAS), "desarrollador")
        self.assertIsNone(L.rol_efectivo(entrada(cuenta=OTRO), CUENTAS))
        self.assertIsNone(L.rol_efectivo(entrada(rol="admin"), CUENTAS))

    def test_cuentas_validas_descarta_lo_que_no_es_uuid(self):
        c = L.cuentas_validas({"duenos": [DUENO.upper(), "nadie"], "desarrolladores": [DUENO, DESA]})
        self.assertEqual(c, {"duenos": [DUENO], "desarrolladores": [DESA]})


class Ordenes(unittest.TestCase):
    def test_desarrollador_con_aprobar_rechazado(self):
        e = entrada(cuenta=DESA, rol="desarrollador")
        self.assertEqual(L.validar_entrada(e, CUENTAS, AHORA, {}), (False, L.SOLO_DUENO))
        # Aunque la puerta diga «dueño», la lista local manda.
        self.assertEqual(L.validar_entrada(entrada(cuenta=DESA), CUENTAS, AHORA, {}), (False, L.SOLO_DUENO))

    def test_dueno_con_aprobar_va_a_puente_orden_con_quien(self):
        e = entrada(orden={"nombre": "aprobar", "args": ["T1", "T2"]})
        self.assertEqual(L.validar_entrada(e, CUENTAS, AHORA, {}), (True, "ok"))
        p = L.plan_de_entrada(dict(e, rol=L.rol_efectivo(e, CUENTAS)))
        self.assertEqual(p, {"tipo": "puente-orden", "accion": "aprobar", "ids": ["T1", "T2"],
                             "extra": None, "quien": "genesis-web-11111111"})

    def test_soltar_y_reasignar(self):
        p = L.plan_de_entrada(entrada(orden={"nombre": "soltar", "args": ["T9"]}))
        self.assertEqual(p["extra"], {"donde": "agentes-ia"})
        e = entrada(orden={"nombre": "reasignar", "args": ["T9", "nim/qwen-3"]})
        self.assertTrue(L.validar_entrada(e, CUENTAS, AHORA, {})[0])
        self.assertEqual(L.plan_de_entrada(e)["extra"], {"modelo": "nim/qwen-3"})

    def test_ids_y_modelos_fuera_de_forma(self):
        for args in (["T 1"], ["x"], ["T1;rm"], []):
            e = entrada(orden={"nombre": "aprobar", "args": args})
            self.assertEqual(L.validar_entrada(e, CUENTAS, AHORA, {}), (False, L.NO_PERMITIDA), args)
        e = entrada(orden={"nombre": "reasignar", "args": ["T1", "Modelo Malo"]})
        self.assertEqual(L.validar_entrada(e, CUENTAS, AHORA, {})[1], L.NO_PERMITIDA)
        e = entrada(orden={"nombre": "borrar", "args": []})
        self.assertEqual(L.validar_entrada(e, CUENTAS, AHORA, {})[1], L.NO_PERMITIDA)

    def test_orden_de_31_min_caduca(self):
        e = entrada(recibido=L.iso_utc(AHORA - 31 * 60))
        self.assertEqual(L.validar_entrada(e, CUENTAS, AHORA, {}), (False, L.CADUCADA))
        self.assertEqual(L.resultado_de_motivo(L.CADUCADA), "caducado")
        # A los 29 min todavía vale; un mensaje de texto no caduca nunca.
        self.assertTrue(L.validar_entrada(entrada(recibido=L.iso_utc(AHORA - 29 * 60)), CUENTAS, AHORA, {})[0])
        e = entrada(accion="texto", orden=None, texto="hola Hermes", recibido=L.iso_utc(AHORA - 5 * 3600))
        self.assertEqual(L.validar_entrada(e, CUENTAS, AHORA, {}), (True, "ok"))

    def test_nonce_visto(self):
        e = entrada()
        vistos = {L.clave_nonce(e): {"t": AHORA, "id": 7, "estado": "hecho"}}
        self.assertEqual(L.validar_entrada(e, CUENTAS, AHORA, vistos), (False, L.REPETIDO))
        # El mismo nonce de OTRA cuenta no choca (el nonce es único por cuenta).
        self.assertTrue(L.validar_entrada(entrada(), CUENTAS, AHORA, {"x:" + "N" * 24: {"t": AHORA}})[0])

    def test_podar_vistos_a_7_dias(self):
        v = {"a": {"t": AHORA - 8 * 86400}, "b": {"t": AHORA - 86400}, "c": "basura"}
        self.assertEqual(list(L.podar_vistos(v, AHORA)), ["b"])

    def test_texto_suelto_va_a_hermes(self):
        e = entrada(accion="texto", orden=None, texto="  revisa el pulso  ")
        self.assertEqual(L.plan_de_entrada(e), {
            "tipo": "http-local", "metodo": "POST", "ruta": "/api/mando/director-chat",
            "cuerpo": {"accion": "decir", "texto": "revisa el pulso", "modelo": "hermes/predeterminado",
                       "canales": ["hermes"]}})

    def test_texto_con_barra_se_analiza_con_parsear_orden(self):
        e = L.normalizar_entrada(entrada(accion="texto", orden=None, texto="/aprobar zN4 zN5"), TG.parsear_orden)
        self.assertEqual(e["orden"], {"nombre": "aprobar", "args": ["zN4", "zN5"]})
        e = L.normalizar_entrada(entrada(accion="texto", orden=None, texto="/a Claude mira esto"), TG.parsear_orden)
        self.assertEqual(L.plan_de_entrada(e)["quien"], "genesis-web-11111111|Claude")
        e = L.normalizar_entrada(entrada(accion="texto", orden=None, texto="/xyz"), TG.parsear_orden)
        self.assertEqual(L.validar_entrada(e, CUENTAS, AHORA, {}), (False, L.NO_PERMITIDA))
        # Sin el analizador, un texto que empieza por «/» nunca pasa como texto suelto.
        e = entrada(accion="texto", orden=None, texto="/aprobar T1")
        self.assertEqual(L.validar_entrada(e, CUENTAS, AHORA, {}), (False, L.NO_PERMITIDA))

    def test_lecturas_y_decir(self):
        p = L.plan_de_entrada(entrada(orden={"nombre": "estado", "args": []}))
        self.assertEqual((p["tipo"], p["metodo"], p["ruta"]), ("http-local", "GET", "/api/mando/estado"))
        p = L.plan_de_entrada(entrada(orden={"nombre": "decir", "args": ["hola", "a", "todos"]}))
        self.assertEqual(p, {"tipo": "puente-decir", "texto": "hola a todos", "quien": "genesis-web-11111111"})
        self.assertIn("/aprobar", L.respuesta_lectura("ayuda", [], None))
        est = {"cuentas": {"ola": "1113", "integradas": 3, "enCurso": 2, "esperandoAprobacion": 1, "pendientes": 4}}
        self.assertEqual(L.respuesta_lectura("estado", [], est),
                         "OLA 1113 · integradas 3 · en curso 2 · aprobación 1 · pendientes 4")
        self.assertEqual(L.respuesta_lectura("estado", [], {"_error": True}), "Genesis no responde en la Mac.")

    def test_puente_b_y_c_no_son_de_la_mac(self):
        for fuente in ("puente:peticiones", "puente:avisos-directores"):
            e = entrada(fuente=fuente, accion="texto", orden=None, texto="hola")
            self.assertEqual(L.validar_entrada(e, CUENTAS, AHORA, {}), (False, L.DESTINO))
        self.assertEqual(L.validar_entrada(entrada(destino="a1"), CUENTAS, AHORA, {}), (False, L.DESTINO))

    def test_forma(self):
        for mal in ({"nonce": "corto"}, {"cuenta": "no-uuid"}, {"v": 2}, {"id": "7"}, {"recibido": "ayer"},
                    {"texto": "x" * 8001}):
            self.assertEqual(L.validar_entrada(entrada(**mal), CUENTAS, AHORA, {}), (False, L.FORMA), mal)
        self.assertEqual(L.validar_entrada("nada", CUENTAS, AHORA, {}), (False, L.FORMA))


def dir_(**kw):
    base = dict(fuente="direccion", accion="decir", orden=None, texto="Prueba de dirección", canales=["mando"])
    base.update(kw)
    return entrada(**base)


class Direccion(unittest.TestCase):
    def test_desarrollador_solo_escribe_al_hilo(self):
        e = dir_(cuenta=DESA, rol="desarrollador")
        self.assertEqual(L.validar_entrada(e, CUENTAS, AHORA, {}), (True, "ok"))
        p = L.plan_de_entrada(dict(e, rol=L.rol_efectivo(e, CUENTAS)))
        self.assertEqual(p["tipo"], "chat-hilo")
        self.assertEqual(p["rol"], "agente")
        # Con un modelo, el desarrollador sigue yendo SOLO al hilo: nunca despierta a un motor.
        e = dir_(cuenta=DESA, rol="desarrollador", modelo="director-presidente/auto")
        self.assertEqual(L.plan_de_entrada(dict(e, rol="desarrollador"))["tipo"], "chat-hilo")

    def test_desarrollador_no_despierta_motores(self):
        for kw in ({"canales": ["hermes"]}, {"canales": ["mando", "claude-mac"]},
                   {"accion": "responder", "respondeA": "md-1731500000000-abcd", "texto": None},
                   {"accion": "reenviar", "reenviar": "md-1731500000000-abcd", "canales": ["hermes"], "texto": None}):
            e = dir_(cuenta=DESA, rol="desarrollador", **kw)
            self.assertEqual(L.validar_entrada(e, CUENTAS, AHORA, {}), (False, L.SOLO_DUENO), kw)

    def test_dueno_con_motor_va_por_la_ruta_local_y_caduca(self):
        e = dir_(modelo="director-presidente/auto", canales=[])
        self.assertEqual(L.validar_entrada(e, CUENTAS, AHORA, {}), (True, "ok"))
        p = L.plan_de_entrada(dict(e, rol="dueño"))
        self.assertEqual(p, {"tipo": "http-local", "metodo": "POST", "ruta": "/api/mando/director-chat",
                             "cuerpo": {"accion": "decir", "texto": "Prueba de dirección", "canales": [],
                                        "modelo": "director-presidente/auto"}})
        viejo = dir_(modelo="director-presidente/auto", recibido=L.iso_utc(AHORA - 3600))
        self.assertEqual(L.validar_entrada(viejo, CUENTAS, AHORA, {}), (False, L.CADUCADA))
        # Escribir solo al hilo no caduca.
        self.assertTrue(L.validar_entrada(dir_(recibido=L.iso_utc(AHORA - 3600)), CUENTAS, AHORA, {})[0])

    def test_responder_y_reenviar_del_dueno(self):
        e = dir_(accion="responder", respondeA="md-1731500000000-abcd", texto=None, modelo="hermes/predeterminado")
        self.assertTrue(L.validar_entrada(e, CUENTAS, AHORA, {})[0])
        self.assertEqual(L.plan_de_entrada(e)["cuerpo"],
                         {"accion": "responder", "respondeA": "md-1731500000000-abcd", "modelo": "hermes/predeterminado"})
        e = dir_(accion="reenviar", reenviar="md-1731500000000-abcd", canales=["hermes", "antigravity"], texto=None)
        self.assertTrue(L.validar_entrada(e, CUENTAS, AHORA, {})[0])
        self.assertEqual(L.plan_de_entrada(e)["cuerpo"]["canales"], ["hermes", "antigravity"])

    def test_forma_de_direccion(self):
        for kw in ({"canales": ["nadie"]}, {"modelo": "Con Espacios"}, {"texto": "   "},
                   {"accion": "responder", "respondeA": "md-1"}, {"accion": "orden"}):
            self.assertEqual(L.validar_entrada(dir_(**kw), CUENTAS, AHORA, {})[1], L.NO_PERMITIDA, kw)


class Espejo(unittest.TestCase):
    def test_fuentes_de_un_registro(self):
        canal = {"id": "cn-1-vigilante", "t": "2026-11-13 10:00:00", "de": "vigilante", "rol": "director",
                 "tipo": "aviso", "texto": "repito la cola", "canal": "mando"}
        self.assertEqual(L.fuente_de_registro(canal, lambda f: True),
                         ["direccion", "puente:hermes-avisos", "puente:avisos-directores"])
        self.assertEqual(L.fuente_de_registro(canal, lambda f: False), ["direccion", "puente:avisos-directores"])
        tg = dict(canal, id="cn-2-telegram-1", de="telegram-1")
        self.assertEqual(L.fuente_de_registro(tg, lambda f: True), ["direccion"])
        chat = {"id": "md-1731500000000-abcd", "de": "alex", "tipo": "mensaje", "texto": "hola"}
        self.assertEqual(L.fuente_de_registro(chat), ["direccion"])
        self.assertEqual(L.fuente_de_registro({"id": 3}), [])

    def test_importa_recibe_la_fila_del_canal(self):
        visto = []
        L.fuente_de_registro({"id": "cn-1-x", "t": "2026-11-13 10:00:00", "de": "x", "tipo": "informe",
                              "texto": "t", "tarea": "T1"}, lambda f: visto.append(f) or True)
        self.assertEqual(visto[0]["tipo"], "hecho")
        self.assertEqual(visto[0]["quien"], "x")
        self.assertEqual(visto[0]["tarea"], "T1")

    def test_tachar_registro_recorre_todo(self):
        import director_chat
        r = {"texto": "clave sk-abcdefghijklmnop y eyJhbGciOi.eyJzdWIiOiJ4In0.firmafirma",
             "entregas": {"hermes": {"detalle": "Bearer abcdefghijkl"}}, "n": 3}
        t = L.tachar_registro(r, director_chat.tachar)
        self.assertNotIn("sk-abcdefghijklmnop", t["texto"])
        self.assertNotIn("eyJhbGciOi", t["texto"])
        self.assertNotIn("abcdefghijkl", t["entregas"]["hermes"]["detalle"])
        self.assertEqual(t["n"], 3)

    def test_lotes_de_200(self):
        self.assertEqual([len(x) for x in L.lotes(list(range(450)))], [200, 200, 50])

    def test_epoch_de(self):
        self.assertEqual(L.epoch_de("2026-11-13T10:00:00Z"), 1794564000.0)
        self.assertGreater(L.epoch_de("2026-11-13 10:00:00"), 0)
        self.assertEqual(L.epoch_de("ayer"), 0.0)


class Registro(unittest.TestCase):
    def test_linea_sin_texto_ni_argumentos(self):
        e = L.normalizar_entrada(entrada(accion="texto", orden=None, texto="/decir SECRETO-TEXTO"), TG.parsear_orden)
        fila = L.linea_registro(e, "hecho", "ok", "2026-11-13T10:00:00Z")
        self.assertEqual(set(fila), {"t", "id", "cuenta8", "rol", "fuente", "accion", "orden", "resultado", "motivo"})
        self.assertEqual((fila["orden"], fila["cuenta8"], fila["resultado"]), ("decir", "11111111", "hecho"))
        self.assertNotIn("SECRETO", repr(fila))
        fila = L.linea_registro(entrada(orden={"nombre": "inventada SECRETO", "args": ["SECRETO"]}), "rechazado",
                                L.NO_PERMITIDA, "t")
        self.assertEqual(fila["orden"], "desconocida")
        self.assertNotIn("SECRETO", repr(fila))
        fila = L.linea_registro(dir_(texto="SECRETO-DIR"), "hecho", "ok", "t")
        self.assertNotIn("SECRETO", repr(fila))
        self.assertEqual(L.linea_registro("basura", "raro", "x", "t")["resultado"], "fallo")

    def test_detalle_sin_rutas(self):
        d = L.limpiar_detalle("fallo en /Users/alex/x.json y https://ejemplo.invalid/a desde 10.0.0.1" + "x" * 400)
        self.assertNotIn("/Users", d)
        self.assertNotIn("https://", d)
        self.assertNotIn("10.0.0.1", d)
        self.assertLessEqual(len(d), 300)


if __name__ == "__main__":
    unittest.main()
