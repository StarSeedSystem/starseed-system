# -*- coding: utf-8 -*-
"""Pruebas del nodo de MetaGenesis (OPA1011): un líder, relevo solo, órdenes firmadas, continuidad.

Nada toca la red ni ~/.starseed: Supabase es un PostgREST simulado en memoria (la tabla pública
`relevo_eventos` con sus filtros y, para el modo tablas, las RPC de la migración 20261011100000),
la máquina es un medio falso y el reloj se mueve a mano.
"""
import json
import os
import sys
import tempfile
import time
import types
import unittest
import urllib.parse

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import nodo_metagenesis as N  # noqa: E402
import nodo_metagenesis_bus as B  # noqa: E402
import nodo_metagenesis_logica as L  # noqa: E402

T0 = 1_791_640_000.0  # 2026-10-10 ~11:46 UTC
SECRETO = "s" * 48  # secreto de PRUEBA


class Reloj:
    def __init__(self, t=T0):
        self.t = t

    def __call__(self):
        return self.t


class SupabaseSimulado:
    """PostgREST mínimo: `relevo_eventos` (insert/select con los filtros que usa el nodo) y RPC."""

    def __init__(self, reloj, tablas=False):
        self.reloj = reloj
        self.filas = []
        self.caido = False
        self.tablas = tablas
        self.rpc = {}
        self.llamadas = []

    def __call__(self, metodo, url, cab, cuerpo, tope):
        self.llamadas.append((metodo, url))
        if self.caido:
            return 0, "URLError"
        assert cab.get("apikey"), "toda petición lleva la clave en la cabecera"
        u = urllib.parse.urlparse(url)
        if u.path.startswith("/rest/v1/rpc/"):
            nombre = u.path.rsplit("/", 1)[-1]
            if not self.tablas or nombre not in self.rpc:
                return 404, json.dumps({"code": "PGRST202", "message": "función no encontrada"})
            estado, datos = self.rpc[nombre](json.loads(cuerpo or b"{}"))
            return estado, json.dumps(datos)
        assert u.path == "/rest/v1/relevo_eventos", u.path
        if metodo == "POST":
            fila = json.loads(cuerpo)
            if len(fila.get("texto") or "") > 4000 or len(fila.get("quien") or "") > 40 or len(fila.get("tipo") or "") > 40:
                return 403, json.dumps({"code": "42501", "message": "violates row-level security policy"})
            fila["id"] = len(self.filas) + 1
            fila["t"] = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(self.reloj()))
            self.filas.append(fila)
            return 201, ""
        q = urllib.parse.parse_qs(u.query)
        filas = list(self.filas)
        for clave, valores in q.items():
            v = valores[0]
            if clave == "tipo":
                if v.startswith("in.("):
                    tipos = v[4:-1].split(",")
                    filas = [f for f in filas if f["tipo"] in tipos]
                elif v.startswith("eq."):
                    filas = [f for f in filas if f["tipo"] == v[3:]]
            elif clave == "id" and v.startswith("gt."):
                filas = [f for f in filas if f["id"] > int(v[3:])]
            elif clave == "t" and v.startswith("gte."):
                corte = L.epoch_de_iso(v[4:])
                filas = [f for f in filas if L.epoch_de_iso(f["t"][:19] + "Z") >= corte]
        orden = (q.get("order") or ["id.asc"])[0]
        filas.sort(key=lambda f: f["id"], reverse=orden.endswith(".desc"))
        filas = filas[: int((q.get("limit") or ["1000"])[0])]
        return 200, json.dumps(filas)

    def de_tipo(self, tipo):
        return [f for f in self.filas if f["tipo"] == tipo]


def medida(medio="mac", autoritativo=True, listas=0, en_curso=0, bloqueadas=0, orqs=(), caidos=(), guardianes=(),
           repo=True, orquestador=True, revisor_vivo=True, revisor_hace_s=60, disco=50.0, modo="real", raiz="/no/existe"):
    salud = {"repo": repo, "orquestador": orquestador, "autoritativo": autoritativo,
             "orquestadores": [{"pid": 100 + i, "cola": c} for i, c in enumerate(orqs)],
             "disco_gb": disco, "ram_libre_mb": 2048, "servicios_caidos": list(caidos), "guardianes_caidos": list(guardianes)}
    if autoritativo:
        salud.update(trabajo={"listas": listas, "en_curso": en_curso, "agentes": 0, "bloqueadas": bloqueadas},
                     medidores={"listas": "%d se pueden coger ya" % listas, "bloqueadas": "%d esperando" % bloqueadas},
                     revisor_vivo=revisor_vivo, revisor_hace_s=revisor_hace_s)
    cap = {"medio": medio, "modo": modo, "repo": repo, "orquestador": orquestador, "autoritativo": autoritativo,
           "ram_libre_mb": 2048, "disco_gb": disco}
    return {"medio": medio, "raiz": raiz, "salud": salud, "cap": cap}


class MedioFalso:
    """La máquina: lo que mide se cambia a mano y cada acción queda anotada."""

    def __init__(self, **kw):
        self.kw = kw
        self.hechas = []

    def medir(self, modo, t):
        return medida(modo=modo, **self.kw)

    def ejecutar(self, a, medio, raiz, seco, rescate=None):
        self.hechas.append((a["accion"], seco, a.get("args") or {}))
        if seco:
            return "seca", "modo seco"
        if a["accion"] == "buscar_trabajo" and rescate:
            return rescate()
        return "hecha", "ok"


ENV = {"NEXT_PUBLIC_SUPABASE_URL": "https://prueba.supabase.co", "NEXT_PUBLIC_SUPABASE_ANON_KEY": "anon-de-prueba",
       "STARSEED_LANZADOR_SECRETO": SECRETO}


def nodo(sb, reloj, medio_falso, huella, seco=False, env=ENV, chat=None):
    return N.Nodo(seco=seco, env=dict(env), medir=medio_falso.medir, ejecutar=medio_falso.ejecutar, http=sb,
                  reloj=reloj, memoria={"hecho": {}, "nonces": {}, "decisiones": [], "autonomia": True},
                  persistir=False, huella=huella, chat=chat or (lambda texto: None))


def orden_firmada(accion, para="lider", t=T0, args=None, nonce="nonce-prueba-0001", secreto=SECRETO):
    o = {"v": "1", "accion": accion, "para": para, "t": B.iso(t), "nonce": nonce, "por": "prueba", "args": args or {}}
    o["firma"] = L.firmar(o, secreto)
    return o


def publicar_orden(sb, o):
    sb.filas.append({"id": len(sb.filas) + 1, "t": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(sb.reloj())),
                     "quien": "prueba", "tipo": L.T_ORDEN, "tarea": None, "texto": "orden", "datos": o})


# ─── lógica pura ─────────────────────────────────────────────────────────────────────────


class TestIdentidadYPuntos(unittest.TestCase):
    def test_id_estable_y_sin_nombre_de_maquina(self):
        a = L.id_de_nodo("mac", "MacBook-de-Alex")
        self.assertEqual(a, L.id_de_nodo("mac", "MacBook-de-Alex"))
        self.assertNotIn("Alex", a)
        self.assertTrue(L.id_valido(a))
        self.assertTrue(L.id_de_nodo("raro", "x").startswith("neurona-"))

    def test_real_gana_a_seco_y_el_disco_con_colas_al_siempre_encendido(self):
        mac_real = L.puntos_nodo({"medio": "mac", "modo": "real", "autoritativo": True, "repo": True, "orquestador": True})
        a1_real = L.puntos_nodo({"medio": "oracle-a1", "modo": "real", "repo": True, "orquestador": True})
        mac_seco = L.puntos_nodo({"medio": "mac", "modo": "seco", "autoritativo": True, "repo": True, "orquestador": True})
        nube = L.puntos_nodo({"medio": "nube-cowork", "modo": "real", "repo": True, "orquestador": True})
        self.assertGreater(mac_real, a1_real)
        self.assertGreater(a1_real, mac_seco)
        self.assertGreater(a1_real, nube)
        self.assertGreaterEqual(mac_real - a1_real, L.MARGEN_RELEVO)

    def test_disco_lleno_resta(self):
        sano = L.puntos_nodo({"medio": "oracle-a1", "modo": "real", "repo": True, "orquestador": True, "disco_gb": 40})
        lleno = L.puntos_nodo({"medio": "oracle-a1", "modo": "real", "repo": True, "orquestador": True, "disco_gb": 1})
        self.assertGreater(sano, lleno)


class TestEleccion(unittest.TestCase):
    def lat(self, nodo, ts, puntos, **kw):
        return dict({"nodo": nodo, "ts": ts, "puntos": puntos}, **kw)

    def test_sin_lider_reclama_el_mejor_y_todos_coinciden(self):
        lats = [self.lat("mac-aaaaaa", T0, 1500), self.lat("oracle-a1-bbbbbb", T0, 1250)]
        vivos = L.nodos_vivos(lats, [], T0 + 10)
        a = L.elegir_lider("mac-aaaaaa", 1500, vivos, [], lats, T0 + 10)
        b = L.elegir_lider("oracle-a1-bbbbbb", 1250, vivos, [], lats, T0 + 10)
        self.assertEqual(a["lider"], b["lider"])
        self.assertEqual(a["lider"], "mac-aaaaaa")
        self.assertTrue(a["reclamar"])
        self.assertFalse(b["reclamar"])
        self.assertEqual(a["termino"], 1)

    def test_lider_vivo_sigue_y_caido_releva_con_termino_mas_uno(self):
        reclamos = [{"nodo": "oracle-a1-bbbbbb", "termino": 4, "puntos": 1250}]
        lats = [self.lat("oracle-a1-bbbbbb", T0, 1250), self.lat("nube-cowork-cccccc", T0, 1080)]
        vivos = L.nodos_vivos(lats, [], T0 + 60)
        d = L.elegir_lider("nube-cowork-cccccc", 1080, vivos, reclamos, lats, T0 + 60)
        self.assertEqual((d["lider"], d["termino"], d["reclamar"]), ("oracle-a1-bbbbbb", 4, False))
        # El A1 deja de latir: pasado el TTL, la nube toma el mando con término 5.
        lats2 = [self.lat("oracle-a1-bbbbbb", T0, 1250), self.lat("nube-cowork-cccccc", T0 + L.TTL_LIDER_S, 1080)]
        t = T0 + L.TTL_LIDER_S + 30
        vivos2 = L.nodos_vivos(lats2, [], t)
        d2 = L.elegir_lider("nube-cowork-cccccc", 1080, vivos2, reclamos, lats2, t)
        self.assertEqual((d2["lider"], d2["termino"], d2["reclamar"]), ("nube-cowork-cccccc", 5, True))
        self.assertIn("dejó de latir", d2["motivo"])

    def test_baja_cuenta_como_muerto_al_momento(self):
        lats = [self.lat("mac-aaaaaa", T0, 1500)]
        self.assertEqual(L.nodos_vivos(lats, [{"nodo": "mac-aaaaaa", "ts": T0 + 1}], T0 + 2), {})

    def test_relevo_ordenado_solo_con_margen_y_estable(self):
        reclamos = [{"nodo": "oracle-a1-bbbbbb", "termino": 7, "puntos": 1250}]
        # La Mac acaba de volver: aún no es estable → el A1 sigue.
        lats = [self.lat("oracle-a1-bbbbbb", T0, 1250), self.lat("mac-aaaaaa", T0, 1500)]
        d = L.elegir_lider("mac-aaaaaa", 1500, L.nodos_vivos(lats, [], T0 + 5), reclamos, lats, T0 + 5)
        self.assertEqual(d["lider"], "oracle-a1-bbbbbb")
        # Dos latidos después, la Mac real (más de 100 puntos por encima) toma el relevo.
        t = T0 + L.ESTABLE_S + 5
        lats.append(self.lat("mac-aaaaaa", t - 1, 1500))
        lats.append(self.lat("oracle-a1-bbbbbb", t - 1, 1250))
        d = L.elegir_lider("mac-aaaaaa", 1500, L.nodos_vivos(lats, [], t), reclamos, lats, t)
        self.assertEqual((d["lider"], d["termino"], d["reclamar"]), ("mac-aaaaaa", 8, True))
        # Con poco margen no hay baile de líderes.
        lats3 = [self.lat("oracle-a1-bbbbbb", T0, 1250), self.lat("neurona-dddddd", T0 - 2000, 1300),
                 self.lat("neurona-dddddd", t - 1, 1300)]
        d3 = L.elegir_lider("neurona-dddddd", 1300, L.nodos_vivos(lats3, [], t), reclamos, lats3, t)
        self.assertEqual(d3["lider"], "oracle-a1-bbbbbb")

    def test_dos_reclamos_del_mismo_termino_convergen(self):
        reclamos = [{"nodo": "nube-cowork-cccccc", "termino": 3, "puntos": 1080},
                    {"nodo": "oracle-a1-bbbbbb", "termino": 3, "puntos": 1250}]
        self.assertEqual(L.lider_vigente(reclamos, [])[0], "oracle-a1-bbbbbb")
        self.assertEqual(L.lider_vigente(list(reversed(reclamos)), [])[0], "oracle-a1-bbbbbb")
        # Igualdad total → el id menor, siempre.
        iguales = [{"nodo": "neurona-zzzzzz", "termino": 3, "puntos": 9}, {"nodo": "neurona-aaaaaa", "termino": 3, "puntos": 9}]
        self.assertEqual(L.lider_vigente(iguales, [])[0], "neurona-aaaaaa")

    def test_el_latido_trae_el_lider_que_vio_cada_nodo(self):
        lats = [self.lat("mac-aaaaaa", T0, 1500, lider_visto="mac-aaaaaa", termino_visto=12, puntos_lider=1500)]
        self.assertEqual(L.lider_vigente([], lats), ("mac-aaaaaa", 12, 1500))


class TestOrdenes(unittest.TestCase):
    def test_vector_compartido_con_typescript(self):
        # El MISMO vector está en src/lib/metagenesis/__tests__/remoto-nodos.test.ts.
        o = {"accion": "lanzar_cola", "para": "lider", "t": "2026-10-10T12:00:00Z", "nonce": "abcdefgh12345678",
             "args": {"trabajadores": 2, "cola": "cola-prueba-1"}}
        self.assertEqual(L.texto_a_firmar(o),
                         'lanzar_cola|lider|2026-10-10T12:00:00Z|abcdefgh12345678|{"cola":"cola-prueba-1","trabajadores":2}')
        self.assertEqual(L.firmar(o, "secreto-de-prueba"),
                         "77e5031665d516eb5e29d65393e4cbe6c28e8c2f2b4e2472737bffa5b083f203")
        o2 = {"accion": "revisar_bloqueadas", "para": "mac", "t": "2026-10-10T12:00:00Z", "nonce": "zyxwvuts98765432", "args": {}}
        self.assertEqual(L.firmar(o2, "secreto-de-prueba"),
                         "20ceb56f9646f44bcbb4821cc20482baecb95482916318b819996806b0fb422a")

    def test_valida_firma_caducidad_repeticion_y_lista_blanca(self):
        o = orden_firmada("revisar_bloqueadas")
        self.assertEqual(L.validar_orden(o, SECRETO, T0 + 5, {}), (True, ""))
        self.assertEqual(L.validar_orden(o, SECRETO, T0 + 5, {"nonce-prueba-0001": T0})[1], "orden repetida")
        self.assertIn("caducada", L.validar_orden(o, SECRETO, T0 + 16 * 60, {})[1])
        mala = dict(o, firma="0" * 64)
        self.assertEqual(L.validar_orden(mala, SECRETO, T0, {})[1], "firma inválida")
        cambiada = dict(o, para="todos")
        self.assertEqual(L.validar_orden(cambiada, SECRETO, T0, {})[1], "firma inválida")
        self.assertEqual(L.validar_orden(orden_firmada("borrar_todo"), SECRETO, T0, {})[1], "acción no admitida")
        self.assertIn("secreto", L.validar_orden(o, "", T0, {})[1])
        # De la tabla con RLS no hace falta firma.
        self.assertEqual(L.validar_orden(dict(o, firma=None), "", T0, {}, firmada=False), (True, ""))

    def test_argumentos(self):
        self.assertIsNone(L.args_validos("lanzar_cola", {"cola": "cola-1010s", "trabajadores": 2}))
        self.assertEqual(L.args_validos("lanzar_cola", {"cola": "../etc"}), "nombre de cola no válido")
        self.assertEqual(L.args_validos("lanzar_cola", {"cola": "cola-x", "trabajadores": 9}), "trabajadores fuera de 1–4")
        self.assertEqual(L.args_validos("revisar_bloqueadas", {"rm": "-rf"}), "argumento no admitido: rm")
        self.assertIn("valor", L.args_validos("lanzar_cola", {"cola": "cola-x", "tareas_sha": "a;b`c"}))

    def test_fecha_en_utc(self):
        o = orden_firmada("pausar")
        o["t"] = o["t"].replace("Z", "+00:00")
        o["firma"] = L.firmar(o, SECRETO)
        self.assertIn("UTC", L.validar_orden(o, SECRETO, T0, {})[1])


class TestPlan(unittest.TestCase):
    def mundo(self, **salud):
        base = medida(**salud)["salud"]
        return {"nodos": {"mac-aaaaaa": {"nodo": "mac-aaaaaa", "modo": "real", "puntos": 1500, "ts": T0, "salud": base}},
                "yo": "mac-aaaaaa", "autonomia": True}

    def test_guardian_caido_reactiva_una_vez_con_enfriamiento(self):
        m = self.mundo(guardianes=["vigilante"], caidos=["vigilante"])
        plan = L.planificar(m, {"hecho": {}}, T0)
        self.assertEqual([a["accion"] for a in plan], ["reactivar"])
        self.assertEqual(L.planificar(m, {"hecho": {plan[0]["clave"]: T0}}, T0 + 60), [])
        self.assertEqual(len(L.planificar(m, {"hecho": {plan[0]["clave"]: T0}}, T0 + 1801)), 1)

    def test_listas_sin_orquestador_diez_minutos_continua(self):
        m = self.mundo(listas=5)
        m["nodos"]["mac-aaaaaa"]["salud"]["sin_orquestador_desde"] = T0 - 300
        self.assertEqual(L.planificar(m, {"hecho": {}}, T0), [])
        m["nodos"]["mac-aaaaaa"]["salud"]["sin_orquestador_desde"] = T0 - 601
        self.assertEqual([a["accion"] for a in L.planificar(m, {"hecho": {}}, T0)], ["continuar"])

    def test_bloqueadas_al_revisor_si_no_pasa(self):
        m = self.mundo(bloqueadas=80, orqs=["cola-1010s"], revisor_vivo=False, revisor_hace_s=3600)
        self.assertEqual([a["accion"] for a in L.planificar(m, {"hecho": {}}, T0)], ["revisar_bloqueadas"])
        m2 = self.mundo(bloqueadas=80, orqs=["cola-1010s"], revisor_vivo=True, revisor_hace_s=3600)
        self.assertEqual(L.planificar(m2, {"hecho": {}}, T0), [])

    def test_sin_nada_que_hacer_quince_minutos_busca_trabajo(self):
        m = self.mundo(listas=0, en_curso=0)
        m["nodos"]["mac-aaaaaa"]["salud"]["tranquilo_desde"] = T0 - 901
        self.assertEqual([a["accion"] for a in L.planificar(m, {"hecho": {}}, T0)], ["buscar_trabajo"])
        m["nodos"]["mac-aaaaaa"]["salud"]["orquestadores"] = [{"cola": "cola-x"}]
        self.assertEqual(L.planificar(m, {"hecho": {}}, T0), [])

    def test_pausa_de_genesis_no_relanza_ni_rescata(self):
        m = self.mundo(listas=5)
        s = m["nodos"]["mac-aaaaaa"]["salud"]
        s.update(sin_orquestador_desde=T0 - 3600, pausado=True)
        self.assertEqual(L.planificar(m, {"hecho": {}}, T0), [])
        m2 = self.mundo(listas=0, en_curso=0)
        m2["nodos"]["mac-aaaaaa"]["salud"].update(tranquilo_desde=T0 - 3600, pausado=True)
        self.assertEqual(L.planificar(m2, {"hecho": {}}, T0), [])

    def test_autonomia_en_pausa_no_decide(self):
        m = self.mundo(guardianes=["vigia"], caidos=["vigia"])
        m["autonomia"] = False
        self.assertEqual(L.planificar(m, {"hecho": {}}, T0), [])

    def test_relevo_de_medio_cuando_la_mac_calla(self):
        a1 = medida(medio="oracle-a1", autoritativo=False)["salud"]
        m = {"nodos": {"oracle-a1-bbbbbb": {"nodo": "oracle-a1-bbbbbb", "modo": "real", "puntos": 1250, "ts": T0, "salud": a1}},
             "yo": "oracle-a1-bbbbbb", "autonomia": True, "ultimo_autoritativo_ts": T0 - L.RELEVO_MEDIO_S - 1,
             "colas_portables": [{"id": "X1", "archivos": ["a.ts"], "prompt": "p"}, {"id": "X2", "archivos": ["b.ts"], "prompt": "p"}],
             "asignaciones": [{"ids": ["X1"], "ts": T0 - 60}]}
        plan = L.planificar(m, {"hecho": {}}, T0)
        self.assertEqual(len(plan), 1)
        self.assertEqual((plan[0]["accion"], plan[0]["nodo"]), ("lanzar_cola", "oracle-a1-bbbbbb"))
        self.assertEqual([t["id"] for t in plan[0]["args"]["_tareas"]], ["X2"])  # X1 ya está en otro medio
        # Sin un medio real libre (el A1 ya tiene orquestador) no se reparte nada.
        a1["orquestadores"] = [{"cola": "cola-oracle"}]
        self.assertEqual(L.planificar(m, {"hecho": {}}, T0), [])

    def test_autocurar_cada_nodo(self):
        s = medida(medio="oracle-a1", autoritativo=False, caidos=["starseed-medio.service"], disco=1.5)["salud"]
        acciones = [a["accion"] for a in L.autocurar(s, {"hecho": {}}, T0)]
        self.assertEqual(acciones, ["revivir_servicios", "liberar_disco"])
        s_mac = medida(disco=1.5)["salud"]
        self.assertEqual(L.autocurar(s_mac, {"hecho": {}}, T0), [])  # la Mac la limpia la autocuración de Genesis


class TestRescate(unittest.TestCase):
    def test_solo_lo_que_nadie_cerro(self):
        def T(tid, **kw):
            return dict({"id": tid, "titulo": tid, "archivos": ["src/a.ts"], "prompt": "haz " + tid}, **kw)
        fuente = [
            ("cola-vieja.json", T0 - 30 * 86400, [T("V1")]),                         # demasiado vieja
            ("cola-auto-1009.json", T0 - 3600, [T("A1")]),                            # copia
            ("cola-suenos-ola1.json", T0 - 3600, [T("S1")]),                          # sueños
            ("cola-buena.json", T0 - 3600, [T("B1"), T("B2"), T("B3", aprobacion=True), T("B4", archivos=[]),
                                            T("B5"), T("B6"), T("B7")]),
            ("cola-anterior.json", T0 - 7200, [T("B6", titulo="definición vieja"), T("B8")]),
        ]
        progreso = {"B2": {"estado": "commit"}, "B5": {"estado": "fallo_tsc"}, "B7b": {"estado": "commit"}}
        cands = L.candidatos_rescate(fuente, {"B6"}, progreso, ["Ola 9 · B8: ya integrada"], T0)
        self.assertEqual([c["id"] for c in cands], ["B1"])
        self.assertEqual(cands[0]["origen_rescate"], "cola-buena.json")


class TestFotoYTachado(unittest.TestCase):
    def test_huella_no_cambia_con_el_reloj(self):
        n = {"mac-aaaaaa": {"nodo": "mac-aaaaaa", "medio": "mac", "modo": "real", "ts": T0, "salud": {}}}
        a = L.foto("mac-aaaaaa", 3, n, [], {"listas": "3"}, True, "real", T0 + 10)
        b = L.foto("mac-aaaaaa", 3, n, [], {"listas": "3"}, True, "real", T0 + 500)
        self.assertEqual(L.huella_foto(a), L.huella_foto(b))
        # La hora dentro del texto de un medidor no cuenta como cambio; la cifra sí.
        d = L.foto("mac-aaaaaa", 3, n, [], {"listas": "3", "contenedores": "4 trabajando · medido 2026-10-10 05:58:44"}, True, "real", T0)
        e = L.foto("mac-aaaaaa", 3, n, [], {"listas": "3", "contenedores": "4 trabajando · medido 2026-10-10 06:00:44"}, True, "real", T0)
        self.assertEqual(L.huella_foto(d), L.huella_foto(e))
        self.assertNotEqual(L.huella_foto(a), L.huella_foto(L.foto("mac-aaaaaa", 3, n, [], {"listas": "4"}, True, "real", T0)))
        c = L.foto("mac-aaaaaa", 4, n, [], {"listas": "3"}, True, "real", T0 + 500)
        self.assertNotEqual(L.huella_foto(a), L.huella_foto(c))
        self.assertIn("líder mac-aaaaaa", L.texto_foto(a))

    def test_tachar(self):
        clave = "".join(["sk", "-", "abcdef1234567890XYZ"])
        t = L.tachar("clave %s túnel https://abc-def.trycloudflare.com/x ip 8.8.4.4 local 127.0.0.1" % clave)
        self.assertNotIn(clave, t)
        self.assertNotIn("trycloudflare", t)
        self.assertNotIn("8.8.4.4", t)
        self.assertIn("127.0.0.1", t)

    def test_numero_de_medidor(self):
        self.assertEqual(L.trabajo_de_medidores({"listas": "32 se pueden coger ya", "en-curso": "Ninguna en marcha",
                                                 "bloqueadas": "80 esperando"}),
                         {"listas": 32, "en_curso": 0, "agentes": None, "bloqueadas": 80})


# ─── el nodo entero contra el Supabase simulado ─────────────────────────────────────────


class TestNodoEnElBus(unittest.TestCase):
    def setUp(self):
        self.reloj = Reloj()
        self.sb = SupabaseSimulado(self.reloj)
        self.mac_m = MedioFalso(medio="mac", autoritativo=True, listas=3, orqs=["cola-enjambre-1010s"])
        self.a1_m = MedioFalso(medio="oracle-a1", autoritativo=False)
        self.mac = nodo(self.sb, self.reloj, self.mac_m, "huella-mac")
        self.a1 = nodo(self.sb, self.reloj, self.a1_m, "huella-a1")

    def vuelta(self, *nodos, avanzar=60):
        res = [n.vuelta() for n in nodos]
        self.reloj.t += avanzar
        return res

    def test_un_solo_lider_y_todos_lo_ven(self):
        i_mac, i_a1 = self.vuelta(self.mac, self.a1)
        i_mac, i_a1 = self.vuelta(self.mac, self.a1)
        self.assertEqual(i_mac["lider"], self.mac.yo)
        self.assertEqual(i_a1["lider"], self.mac.yo)
        self.assertTrue(i_mac["soy_lider"])
        self.assertFalse(i_a1["soy_lider"])
        self.assertEqual(len(self.sb.de_tipo(L.T_LIDER)), 1, "un solo reclamo de mando")
        self.assertTrue(self.sb.de_tipo(L.T_FOTO), "el líder publica la foto")
        f = self.sb.de_tipo(L.T_FOTO)[-1]["datos"]
        self.assertEqual(f["lider"], self.mac.yo)
        self.assertEqual({n["nodo"] for n in f["nodos"]}, {self.mac.yo, self.a1.yo})
        # Nada privado en el bus: ni rutas del disco ni el nombre de la máquina.
        todo = json.dumps(self.sb.filas, ensure_ascii=False)
        self.assertNotIn("/no/existe", todo)
        self.assertNotIn("huella-mac", todo)
        self.assertNotIn(SECRETO, todo)

    def test_relevo_automatico_si_el_lider_deja_de_latir_y_vuelta_ordenada(self):
        for _ in range(2):
            self.vuelta(self.mac, self.a1)
        # La Mac se apaga sin despedirse: el A1 sigue latiendo.
        for _ in range(int(L.TTL_LIDER_S / 300) + 2):
            i_a1, = self.vuelta(self.a1, avanzar=300)
        self.assertEqual(i_a1["lider"], self.a1.yo)
        self.assertTrue(i_a1["soy_lider"])
        terminos = [f["datos"]["termino"] for f in self.sb.de_tipo(L.T_LIDER)]
        self.assertEqual(terminos, [1, 2])
        # La Mac vuelve: primero no quita el mando (no es estable); luego, relevo ordenado.
        self.mac.mem["ultimo_latido"] = 0
        i_mac, i_a1 = self.vuelta(self.mac, self.a1, avanzar=300)
        self.assertEqual(i_mac["lider"], self.a1.yo)
        for _ in range(3):
            i_mac, i_a1 = self.vuelta(self.mac, self.a1, avanzar=300)
        self.assertEqual(i_mac["lider"], self.mac.yo)
        self.assertEqual(i_a1["lider"], self.mac.yo)
        self.assertEqual([f["datos"]["termino"] for f in self.sb.de_tipo(L.T_LIDER)], [1, 2, 3])

    def test_despedida_releva_sin_esperar_al_ttl(self):
        self.vuelta(self.mac, self.a1)
        self.vuelta(self.mac, self.a1)
        self.mac.despedirse()
        i_a1, = self.vuelta(self.a1)
        self.assertTrue(i_a1["soy_lider"])

    def test_orden_firmada_la_ejecuta_el_lider_y_contesta(self):
        self.vuelta(self.mac, self.a1)
        o = orden_firmada("revisar_bloqueadas", t=self.reloj.t)
        publicar_orden(self.sb, o)
        i_mac, i_a1 = self.vuelta(self.mac, self.a1)
        self.assertEqual([r["estado"] for r in i_mac["ordenes"]], ["hecha"])
        self.assertEqual(i_a1["ordenes"], [])  # no era para el A1
        self.assertIn(("revisar_bloqueadas", False, {}), self.mac_m.hechas)
        hechas = self.sb.de_tipo(L.T_ORDEN_HECHA)
        self.assertEqual(hechas[-1]["datos"]["nonce"], o["nonce"])
        # Repetida: no se vuelve a ejecutar.
        n_antes = len(self.mac_m.hechas)
        self.vuelta(self.mac, self.a1)
        self.assertEqual(len(self.mac_m.hechas), n_antes)

    def test_orden_falsificada_se_rechaza_y_se_dice(self):
        self.vuelta(self.mac, self.a1)
        publicar_orden(self.sb, orden_firmada("lanzar_cola", t=self.reloj.t, args={"cola": "cola-mala"},
                                              nonce="falsificada-0001", secreto="otro-secreto"))
        i_mac, _ = self.vuelta(self.mac, self.a1)
        self.assertEqual(i_mac["ordenes"][0]["estado"], "rechazada")
        self.assertEqual(i_mac["ordenes"][0]["resultado"], "firma inválida")
        self.assertFalse([h for h in self.mac_m.hechas if h[0] == "lanzar_cola"])

    def test_tareas_cambiadas_tras_firmar_se_rechazan(self):
        self.vuelta(self.mac, self.a1)
        tareas = [{"id": "Z1", "archivos": ["a.ts"], "prompt": "p"}]
        o = orden_firmada("lanzar_cola", para=self.a1.yo, t=self.reloj.t, nonce="tareas-0000001",
                          args={"cola": "cola-relevo-x", "tareas_sha": L.huella_tareas(tareas)})
        o["tareas"] = [{"id": "Z1", "archivos": ["a.ts"], "prompt": "rm -rf"}]
        publicar_orden(self.sb, o)
        _, i_a1 = self.vuelta(self.mac, self.a1)
        self.assertEqual(i_a1["ordenes"][0]["resultado"], "las tareas no coinciden con su huella firmada")

    def test_pausar_y_reanudar_la_autonomia(self):
        self.mac_m.kw.update(guardianes=["vigia"], caidos=["vigia"])
        self.vuelta(self.mac, self.a1)
        publicar_orden(self.sb, orden_firmada("pausar", t=self.reloj.t, nonce="pausa-00000001"))
        self.vuelta(self.mac)
        self.assertFalse(self.mac.mem["autonomia"])
        n = len([h for h in self.mac_m.hechas if h[0] == "reactivar"])
        self.mac.mem["hecho"] = {}
        self.vuelta(self.mac)
        self.assertEqual(len([h for h in self.mac_m.hechas if h[0] == "reactivar"]), n, "en pausa no decide")
        publicar_orden(self.sb, orden_firmada("reanudar", t=self.reloj.t, nonce="reanuda-0000001"))
        self.vuelta(self.mac)
        self.assertTrue(self.mac.mem["autonomia"])

    def test_modo_seco_decide_pero_no_lanza(self):
        seco_m = MedioFalso(medio="mac", autoritativo=True, guardianes=["vigilante"], caidos=["vigilante"])
        seco = nodo(self.sb, self.reloj, seco_m, "huella-seca", seco=True)
        i = seco.vuelta()
        self.assertTrue(i["soy_lider"])
        self.assertTrue(i["acciones"])
        self.assertTrue(all(h[1] for h in seco_m.hechas), "todo se pide con seco=True")
        self.assertTrue(all(a["resultado"].startswith("seca") for a in i["acciones"]))

    def test_frugal_con_supabase(self):
        self.vuelta(self.mac, self.a1)
        self.sb.llamadas.clear()
        i_a1, = self.vuelta(self.a1, avanzar=60)
        self.assertLessEqual(len(self.sb.llamadas), 2)  # leer + (como mucho) latir
        self.sb.llamadas.clear()
        _, = self.vuelta(self.a1, avanzar=60)
        self.assertEqual(len(self.sb.llamadas), 1, "sin latido nuevo antes de LATIDO_S: solo una lectura")

    def test_sin_red_sigue_curandose_solo(self):
        self.sb.caido = True
        m = MedioFalso(medio="oracle-a1", autoritativo=False, caidos=["starseed-medio.service"])
        n = nodo(self.sb, self.reloj, m, "huella-x")
        i = n.vuelta()
        self.assertEqual([h[0] for h in m.hechas], ["revivir_servicios"])
        self.assertTrue(i["avisos"])

    def test_relevo_de_medio_el_a1_sigue_las_colas_portables(self):
        self.vuelta(self.mac, self.a1)
        # La Mac publicó sus colas portables (lo simulamos como su evento en el bus).
        tareas = [{"id": "P1", "archivos": ["a.ts"], "prompt": "p"}, {"id": "P2", "archivos": ["b.ts"], "prompt": "p"}]
        self.sb.filas.append({"id": len(self.sb.filas) + 1, "t": "2026-10-10T11:50:00+00:00", "quien": "nodo:mac",
                              "tipo": L.T_COLAS, "tarea": None, "texto": "colas", "datos": {"tareas": tareas}})
        for _ in range(int((L.TTL_LIDER_S + L.RELEVO_MEDIO_S) / 300) + 3):
            i_a1, = self.vuelta(self.a1, avanzar=300)
        lanzadas = [h for h in self.a1_m.hechas if h[0] == "lanzar_cola"]
        self.assertEqual(len(lanzadas), 1)
        self.assertEqual([t["id"] for t in lanzadas[0][2]["_tareas"]], ["P1", "P2"])
        asign = self.sb.de_tipo(L.T_ASIGNACION)
        self.assertEqual(asign[-1]["datos"]["ids"], ["P1", "P2"])

    def test_buscar_trabajo_rescata_de_colas_fuente_a_una_cola_viva(self):
        with tempfile.TemporaryDirectory() as raiz:
            olas = os.path.join(raiz, "starseed_memory_root", "olas")
            fuente = os.path.join(raiz, "starseed_memory_root", "colas-fuente")
            os.makedirs(olas)
            os.makedirs(fuente)
            with open(os.path.join(fuente, "cola-olvidada.json"), "w") as f:
                json.dump([{"id": "R1", "titulo": "olvidada", "archivos": ["src/x.ts"], "prompt": "haz x"}], f)
            with open(os.path.join(olas, "progreso.json"), "w") as f:
                json.dump({}, f)
            sys.modules["decidir"] = types.SimpleNamespace(
                consultar=lambda *a, **k: {"medio": "regla", "respuesta": "si", "p": None})
            try:
                m = MedioFalso(medio="mac", autoritativo=True, listas=0, en_curso=0, raiz=raiz)
                n = nodo(self.sb, self.reloj, m, "huella-rescate")
                n.reloj.t = time.time()
                n.vuelta()
                n.reloj.t += 901
                i = n.vuelta()
            finally:
                sys.modules.pop("decidir", None)
            self.assertIn("buscar_trabajo", [a["accion"] for a in i["acciones"]])
            nuevas = [x for x in os.listdir(olas) if x.startswith("cola-rescate-")]
            self.assertEqual(len(nuevas), 1)
            with open(os.path.join(olas, nuevas[0])) as f:
                self.assertEqual([t["id"] for t in json.load(f)], ["R1"])


class TestModoTablas(unittest.TestCase):
    def test_una_llamada_por_vuelta_arriendo_y_ordenes_de_la_tabla(self):
        reloj = Reloj()
        sb = SupabaseSimulado(reloj, tablas=True)
        arriendo = {"lider": None, "termino": 0, "expira": 0}
        ordenes = [{"id": 7, "accion": "buscar_capacidad", "args": {}, "para": "lider", "t": B.iso(T0), "por": "cuenta"}]
        resultados = []

        def hola(c):
            return (200, True) if c.get("_llave") == "llave-de-prueba" else (403, {"code": "42501"})

        def latir(c):
            if arriendo["lider"] in (None, c["_nodo"]) or arriendo["expira"] < reloj():
                if arriendo["lider"] != c["_nodo"]:
                    arriendo["termino"] += 1
                arriendo.update(lider=c["_nodo"], expira=reloj() + c["_ttl_s"])
            mias = [o for o in ordenes if arriendo["lider"] == c["_nodo"]]
            ordenes.clear()
            return 200, {"arriendo": {"lider": arriendo["lider"], "termino": arriendo["termino"]},
                         "nodos": [{"nodo": c["_nodo"], "ts": reloj(), "datos": c["_datos"]}], "ordenes": mias}

        sb.rpc.update(metagenesis_nodo_hola=hola, metagenesis_nodo_latir=latir,
                      metagenesis_nodo_orden_resultado=lambda c: (resultados.append(c) or (200, True)),
                      metagenesis_nodo_foto=lambda c: (200, True), metagenesis_nodo_bitacora=lambda c: (200, True))
        m = MedioFalso(medio="oracle-a1", autoritativo=False)
        env = dict(ENV, STARSEED_NODO_LLAVE="llave-de-prueba")
        os.environ["STARSEED_NODO_LLAVE"] = "llave-de-prueba"
        try:
            n = nodo(sb, reloj, m, "huella-tablas", env=env)
            i = n.vuelta()
        finally:
            os.environ.pop("STARSEED_NODO_LLAVE", None)
        self.assertEqual(i["enlace"], "tablas")
        self.assertTrue(i["soy_lider"])
        self.assertEqual([r["estado"] for r in i["ordenes"]], ["hecha"])
        self.assertEqual(resultados[0]["_id"], 7)
        self.assertNotIn("llave-de-prueba", json.dumps(i))
        sb.llamadas.clear()
        reloj.t += 120
        n.vuelta()
        latidos = [u for _, u in sb.llamadas if u.endswith("metagenesis_nodo_latir")]
        self.assertEqual(len(latidos), 1)

    def test_sin_tablas_cae_al_bus(self):
        reloj = Reloj()
        sb = SupabaseSimulado(reloj, tablas=False)
        os.environ["STARSEED_NODO_LLAVE"] = "llave-de-prueba"
        try:
            n = nodo(sb, reloj, MedioFalso(medio="oracle-a1", autoritativo=False), "huella-b")
            i = n.vuelta()
        finally:
            os.environ.pop("STARSEED_NODO_LLAVE", None)
        self.assertEqual(i["enlace"], "bus")
        self.assertIn("migración", n.mem.get("tablas_motivo", ""))


if __name__ == "__main__":
    unittest.main()
