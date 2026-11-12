#!/usr/bin/env python3
"""(PRB1111W) El director de pruebas con gh, git, el reloj y el chat FALSOS, en una carpeta temporal. Nada real."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import comprobaciones_prueba as C  # noqa: E402
import director_pruebas as DP  # noqa: E402
import director_pruebas_logica as D  # noqa: E402

SHA = "a" * 40
SHA2 = "b" * 40
T0 = 1_794_450_000.0


class Corte(BaseException):
    """Simula que matan al proceso en mitad de la pasada."""


def jobs(mac="completed/success", win="completed/success", lin="completed/success", andr="completed/success", publicar="completed/success"):
    def j(nombre, v):
        st, _, co = v.partition("/")
        return {"name": nombre, "status": st, "conclusion": co or None}
    return [j("canal de pruebas · versión y prerelease", "completed/success"), j("os · macos-latest", mac), j("os · windows-latest", win),
            j("os · ubuntu-24.04", lin), j("os · android", andr), j("canal de pruebas · latest-prueba.json y limpieza", publicar)]


class Falso(DP.Medios):
    def __init__(self, tmp, estado_previo=None):
        super().__init__(dir_estado=tmp, raiz="/no/existe")
        self.t = T0
        self.red = 0
        self.lista = []                 # lo que devuelve gh run list
        self.vistas = {}                # run_id -> dict de gh run view
        self.manif = {"escritorio": None, "android": None}
        self.cabeza = SHA
        self.en_main = {SHA}
        self.lanzados, self.cancelados, self.reintentados, self.publicados, self.mensajes, self.abiertas = [], [], [], [], [], []
        self.abierta = False
        self.lanzar_ok = True
        self.cae_al_lanzar = False
        self.banco_pasadas = 0

    def ahora(self):
        return self.t

    def sh(self, args, **k):
        raise AssertionError("ninguna orden real: %r" % (args,))

    def runs(self):
        self.red += 1
        return list(self.lista)

    def run(self, run_id):
        self.red += 1
        return self.vistas.get(run_id)

    def manifiestos(self):
        self.red += 1
        return dict(self.manif)

    def git_fetch(self):
        self.red += 1
        return True

    def git_cabeza(self):
        return self.cabeza

    def git_en_main(self, sha):
        return sha in self.en_main

    def version_base(self, sha):
        return "0.5.0"

    def lanzar(self):
        self.red += 1
        if self.cae_al_lanzar:
            raise Corte()
        self.lanzados.append(self.t)
        return self.lanzar_ok, "" if self.lanzar_ok else "HTTP 422"

    def cancelar_run(self, rid):
        self.red += 1
        self.cancelados.append(rid)
        return True, ""

    def reintentar_run(self, rid):
        self.red += 1
        self.reintentados.append(rid)
        return True, ""

    def publicar_manifiestos(self, rid, version, esc, andr):
        self.red += 1
        self.publicados.append((rid, version, esc, andr))
        return True, "ok"

    def abrir_app(self):
        self.abiertas.append(1)
        return True, ""

    def app_abierta(self):
        return self.abierta

    def chat(self, texto, canales, tipo, tarea=None):
        self.mensajes.append({"texto": texto, "canales": canales, "tipo": tipo, "tarea": tarea})

    def pasada_banco(self):
        self.banco_pasadas += 1

    # ayudas de la prueba
    def run_de(self, rid, numero, status="in_progress", concl=None, jb=None, sha=SHA, creado=None, actualizado=None):
        r = {"databaseId": rid, "number": numero, "status": status, "conclusion": concl, "headSha": sha, "event": "workflow_dispatch",
             "headBranch": "main", "createdAt": creado or D.a_iso(self.t - 5), "updatedAt": actualizado or D.a_iso(self.t),
             "url": "https://github.com/StarSeedSystem/starseed-system/actions/runs/%d" % rid, "jobs": jb if jb is not None else jobs()}
        self.vistas[rid] = r
        self.lista = [{k: v for k, v in r.items() if k not in ("jobs", "url")}] + [x for x in self.lista if x["databaseId"] != rid]
        return r


class Base(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = self._tmp.name
        self.m = Falso(self.tmp)

    def tearDown(self):
        self._tmp.cleanup()

    def pedir(self, accion, quien="alex", **campos):
        self.m.t += 1
        return DP.escribir_peticion(self.tmp, accion, quien, self.m.t, **campos)

    def paso(self, seg=60):
        self.m.t += seg
        return DP.pasada(self.m)

    def hecha(self, pid):
        with open(os.path.join(self.tmp, "pruebas-peticiones", "hechas", pid + ".json")) as f:
            return json.load(f)

    def pendientes(self):
        d = os.path.join(self.tmp, "pruebas-peticiones")
        return [n for n in os.listdir(d) if n.endswith(".json")] if os.path.isdir(d) else []


class Peticiones(Base):
    def test_validacion_cerrada(self):
        v = lambda **c: D.validar_peticion(dict({"id": "pet-1-abcd", "accion": "compilar", "quien": "alex"}, **c))
        self.assertIsNone(v()[1])
        for malo in ({"accion": "rm"}, {"accion": "compilar; ls"}, {"quien": ""}, {"sha": "abc"}, {"sha": "G" * 40}, {"numero": True},
                     {"numero": "3"}, {"nota": "x" * 501}, {"id": "../x"}, {"formato": 2}, {"prueba": 3}, {"t": "ayer"}):
            self.assertIsNotNone(v(**malo)[1], malo)
        self.assertIsNotNone(D.validar_peticion({"id": "pet-1-abcd", "accion": "pedir-arreglo", "quien": "a", "prueba": 39})[1])
        self.assertIsNotNone(D.validar_peticion({"id": "pet-1-abcd", "accion": "pedir-arreglo", "quien": "a", "prueba": 39, "plataforma": "ps5"})[1])
        self.assertIsNone(D.validar_peticion({"id": "pet-1-abcd", "accion": "pedir-arreglo", "quien": "a", "prueba": 39, "comprobacion": "c7"})[1])
        self.assertIsNotNone(D.validar_peticion({"id": "pet-1-abcd", "accion": "compilar", "quien": "a"}, "otro.json")[1])

    def test_malformadas_acaban_rechazadas_con_motivo(self):
        d = os.path.join(self.tmp, "pruebas-peticiones")
        os.makedirs(d)
        open(os.path.join(d, "pet-9-aaaa.json"), "w").write("{no json")
        json.dump({"id": "pet-9-bbbb", "accion": "borrar-todo", "quien": "x"}, open(os.path.join(d, "pet-9-bbbb.json"), "w"))
        est = self.paso()
        self.assertEqual(self.pendientes(), [])
        self.assertEqual(self.hecha("pet-9-aaaa")["estado"], "rechazada")
        self.assertIn("no es JSON", self.hecha("pet-9-aaaa")["resultado"])
        self.assertIn("acción no permitida", self.hecha("pet-9-bbbb")["resultado"])
        self.assertEqual(len(est["peticiones"]), 2)
        self.assertEqual(self.m.red, 0)

    def test_texto_de_la_nota_nunca_llega_a_un_shell(self):
        c, _ = C.registrar(None, 39, ["Algo"], version="0.5.1-prueba.39")
        C.escribir(c, os.path.join(self.tmp, C.NOMBRE))
        pid = self.pedir("pedir-arreglo", prueba=39, comprobacion="c1", nota="$(rm -rf ~); `id` && curl x | sh")
        self.paso()   # Falso.sh revienta ante cualquier orden real: no hubo ninguna
        self.assertEqual(self.hecha(pid)["estado"], "hecha")
        self.assertIn("rm -rf", self.m.mensajes[0]["texto"])   # es solo texto del mensaje


class Compilar(Base):
    def test_pasada_ociosa_no_hace_red(self):
        for _ in range(3):
            est = self.paso()
        self.assertEqual(self.m.red, 0)
        self.assertIsNone(est["en_curso"])
        self.assertEqual(est["pasada"], 3)
        self.assertEqual(self.m.banco_pasadas, 3)

    def test_ciclo_completo_hasta_publicada_con_un_solo_aviso(self):
        pid = self.pedir("compilar")
        est = self.paso()
        self.assertEqual(self.hecha(pid)["estado"], "hecha")
        self.assertEqual(len(self.m.lanzados), 1)
        self.assertTrue(est["en_curso"]["lanzando"])
        # el run aparece: en marcha
        self.m.run_de(500, 39, jb=jobs(mac="in_progress/", win="in_progress/", lin="queued/", andr="in_progress/", publicar="queued/"))
        est = self.paso()
        ec = est["en_curso"]
        self.assertEqual((ec["numero"], ec["version"], ec["estado"]), (39, "0.5.1-prueba.39", "compilando"))
        self.assertEqual(ec["origen"], "peticion")
        self.assertEqual(self.m.mensajes, [])
        # entrada de comprobaciones
        self.assertIn("39", C.leer(os.path.join(self.tmp, C.NOMBRE))["pruebas"])
        # termina y los manifiestos ya son de la 39
        self.m.run_de(500, 39, "completed", "success")
        self.m.manif = {"escritorio": "0.5.1-prueba.39", "android": "0.5.1-prueba.39"}
        est = self.paso()
        self.assertEqual(est["en_curso"]["estado"], "publicada")
        self.assertEqual(len(self.m.mensajes), 1)
        self.assertIn("publicada", self.m.mensajes[0]["texto"])
        self.assertEqual(self.m.mensajes[0]["canales"], ["telegram"])
        self.assertEqual(est["ultimas"][0]["numero"], 39)
        # más pasadas: ni red ni avisos
        red = self.m.red
        self.paso(); self.paso()
        self.assertEqual(self.m.red, red)
        self.assertEqual(len(self.m.mensajes), 1)
        self.assertEqual(self.m.publicados, [])

    def test_solo_una_en_marcha_y_el_motivo(self):
        self.pedir("compilar"); self.paso()
        p2 = self.pedir("compilar")
        self.paso()
        h = self.hecha(p2)
        self.assertEqual(h["estado"], "rechazada")
        self.assertIn("compilando", h["resultado"])
        self.assertEqual(len(self.m.lanzados), 1)

    def test_no_lanza_si_otro_run_vivo_y_lo_adopta(self):
        self.m.run_de(77, 40, jb=jobs(mac="in_progress/"))
        pid = self.pedir("compilar")
        est = self.paso()
        self.assertEqual(self.m.lanzados, [])
        self.assertEqual(est["en_curso"]["numero"], 40)
        self.assertEqual(est["en_curso"]["origen"], "encontrada")
        self.assertIn("40", self.hecha(pid)["resultado"])

    def test_cuando_el_commit_este_publicado_espera_y_lanza(self):
        pid = self.pedir("compilar", sha=SHA2)
        est = self.paso()
        self.assertEqual(self.pendientes(), [pid + ".json"])
        self.assertEqual(est["esperando"]["sha"], SHA2)
        red = self.m.red
        self.paso(30)                       # dentro de los 2 min: sin red
        self.assertEqual(self.m.red, red)
        self.m.en_main.add(SHA2)
        est = self.paso(120)
        self.assertEqual(len(self.m.lanzados), 1)
        self.assertIsNone(est["esperando"])
        self.assertEqual(self.hecha(pid)["estado"], "hecha")

    def test_la_espera_caduca_a_las_4_horas(self):
        pid = self.pedir("compilar", sha=SHA2)
        self.paso()
        est = self.paso(4 * 3600 + 10)
        self.assertEqual(self.hecha(pid)["estado"], "rechazada")
        self.assertIn("espera", self.hecha(pid)["resultado"])
        self.assertIsNone(est["esperando"])

    def test_la_ultima_sustituye_a_la_que_espera(self):
        a = self.pedir("compilar", sha=SHA2)
        self.paso()
        b = self.pedir("compilar", sha="c" * 40)
        est = self.paso()
        self.assertEqual(self.hecha(a)["estado"], "rechazada")
        self.assertIn(b, self.hecha(a)["resultado"])
        self.assertEqual(est["esperando"]["peticion_id"], b)
        self.assertEqual(self.pendientes(), [b + ".json"])

    def test_dos_compilar_en_la_misma_pasada_solo_la_ultima(self):
        a = self.pedir("compilar"); b = self.pedir("compilar")
        self.paso()
        self.assertEqual(self.hecha(a)["estado"], "rechazada")
        self.assertEqual(self.hecha(b)["estado"], "hecha")
        self.assertEqual(len(self.m.lanzados), 1)

    def test_github_rechaza_la_orden(self):
        self.m.lanzar_ok = False
        pid = self.pedir("compilar")
        est = self.paso()
        self.assertEqual(self.hecha(pid)["estado"], "rechazada")
        self.assertIn("HTTP 422", self.hecha(pid)["resultado"])
        self.assertIsNone(est["en_curso"])

    def test_corte_justo_al_lanzar_no_lanza_dos_veces(self):
        pid = self.pedir("compilar")
        self.m.cae_al_lanzar = True
        with self.assertRaises(Corte):
            self.paso()
        # reinicio: otro proceso, mismo disco. La intención ya estaba escrita: lo que hay en marcha se sigue, no se relanza.
        m2 = Falso(self.tmp)
        m2.t = self.m.t + 60
        m2.run_de(501, 41, creado=D.a_iso(self.m.t - 1), jb=jobs(mac="in_progress/"))
        est = DP.pasada(m2)
        self.assertEqual(m2.lanzados, [])
        self.assertEqual(est["en_curso"]["numero"], 41)
        self.assertEqual(self.pendientes(), [])      # la petición también acaba (rechazada: ya compilaba)

    def test_orden_de_lanzar_sin_rastro_acaba_en_fallo_avisado_una_vez(self):
        self.pedir("compilar"); self.paso()
        est = self.paso(D.LANZAMIENTO_MAX_S + 30)
        self.assertEqual(est["en_curso"]["estado"], "fallo")
        self.assertEqual(len(self.m.mensajes), 1)
        self.paso()
        self.assertEqual(len(self.m.mensajes), 1)


class Seguimiento(Base):
    def lanzada(self):
        self.pedir("compilar"); self.paso()
        self.m.run_de(500, 39, jb=jobs(mac="in_progress/", publicar="queued/"))
        self.paso()

    def test_fallo_nombra_el_trabajo(self):
        self.lanzada()
        self.m.run_de(500, 39, "completed", "failure", jb=jobs(lin="completed/failure"))
        self.m.manif = {"escritorio": "0.5.1-prueba.39", "android": "0.5.1-prueba.39"}
        est = self.paso()
        self.assertEqual(est["en_curso"]["estado"], "fallo")
        self.assertIn("os · ubuntu-24.04", self.m.mensajes[0]["texto"])
        self.assertEqual(est["ultimas"][0]["aviso"], "fallo")
        self.paso(); self.assertEqual(len(self.m.mensajes), 1)

    def test_publica_los_manifiestos_si_el_run_no_lo_hizo_una_sola_vez(self):
        self.lanzada()
        self.m.run_de(500, 39, "completed", "success", actualizado=D.a_iso(self.m.t))
        self.m.manif = {"escritorio": "0.5.1-prueba.38", "android": "0.5.1-prueba.39"}
        est = self.paso(60)                  # aún dentro de los 6 min de gracia
        self.assertEqual(self.m.publicados, [])
        self.assertEqual(est["en_curso"]["estado"], "publicando")
        self.paso(400)
        self.assertEqual(len(self.m.publicados), 1)
        self.assertEqual(self.m.publicados[0][1], "0.5.1-prueba.39")
        self.paso(); self.paso()
        self.assertEqual(len(self.m.publicados), 1)

    def test_si_tras_publicar_sigue_sin_estar_es_fallo(self):
        self.lanzada()
        self.m.run_de(500, 39, "completed", "success", actualizado=D.a_iso(self.m.t))
        self.m.manif = {"escritorio": "0.5.1-prueba.38", "android": "0.5.1-prueba.38"}
        self.paso(400)
        est = self.paso(60)
        self.assertEqual(est["en_curso"]["estado"], "fallo")
        self.assertIn("latest-prueba", self.m.mensajes[-1]["texto"])

    def test_reinicio_a_mitad_de_compilacion_sigue_donde_estaba(self):
        self.lanzada()
        m2 = Falso(self.tmp)
        m2.t = self.m.t + 60
        m2.run_de(500, 39, "completed", "success")
        m2.manif = {"escritorio": "0.5.1-prueba.39", "android": "0.5.1-prueba.39"}
        est = DP.pasada(m2)
        self.assertEqual(est["en_curso"]["estado"], "publicada")
        self.assertEqual(len(m2.mensajes), 1)
        self.assertEqual(m2.lanzados, [])

    def test_cancelar_un_run_en_marcha(self):
        self.lanzada()
        c = self.pedir("cancelar"); self.paso()
        self.assertEqual(self.m.cancelados, [500]); self.assertEqual(self.hecha(c)["estado"], "hecha")
        self.m.run_de(500, 39, "completed", "cancelled")
        est = self.paso()
        self.assertEqual(est["en_curso"]["estado"], "cancelada")
        self.assertIn("canceló", self.m.mensajes[-1]["texto"])
        r = self.pedir("reintentar"); self.paso()
        self.assertEqual(self.hecha(r)["estado"], "rechazada")          # se canceló, no falló

    def test_reintentar_solo_los_fallidos_y_volver_a_seguir(self):
        self.lanzada()
        self.m.run_de(500, 39, "completed", "failure", jb=jobs(win="completed/failure"))
        self.m.manif = {"escritorio": "0.5.1-prueba.38", "android": "0.5.1-prueba.39"}
        est = self.paso(10)
        self.assertEqual(est["en_curso"]["estado"], "fallo")
        # mientras otra compila no se reintenta
        r = self.pedir("reintentar"); est = self.paso()
        self.assertEqual(self.m.reintentados, [500]); self.assertEqual(self.hecha(r)["estado"], "hecha")
        self.assertEqual(est["en_curso"]["estado"], "en-cola"); self.assertFalse(est["en_curso"]["avisado"])
        # y mientras compila ni se reintenta ni se republica
        r3 = self.pedir("reintentar"); r4 = self.pedir("republicar"); self.m.run_de(500, 39, jb=jobs(win="in_progress/")); self.paso(100)
        self.assertEqual(self.hecha(r3)["estado"], "rechazada"); self.assertEqual(self.hecha(r4)["estado"], "rechazada")
        # termina bien: se vuelve a avisar (es otro final)
        self.m.run_de(500, 39, "completed", "success"); self.m.manif = {"escritorio": "0.5.1-prueba.39", "android": "0.5.1-prueba.39"}
        est = self.paso()
        self.assertEqual(est["en_curso"]["estado"], "publicada"); self.assertEqual(len(self.m.mensajes), 2)

    def test_republicar_una_terminada(self):
        self.lanzada()
        self.m.run_de(500, 39, "completed", "success")
        self.m.manif = {"escritorio": "0.5.1-prueba.38", "android": "0.5.1-prueba.39"}
        self.paso(10)
        r = self.pedir("republicar", numero=39); self.paso(10)
        self.assertEqual(self.hecha(r)["estado"], "hecha")
        self.assertEqual(self.m.publicados[0][:2], (500, "0.5.1-prueba.39"))

    def test_cancelar_sin_nada_en_marcha(self):
        c = self.pedir("cancelar"); self.paso()
        self.assertEqual(self.hecha(c)["estado"], "rechazada")
        self.assertEqual(self.m.red, 0)


class Pausa(Base):
    def test_en_pausa_solo_mira(self):
        self.pedir("compilar")
        open(os.path.join(self.tmp, DP.PAUSA), "w").write("revisando el workflow\n")
        est = self.paso()
        self.assertTrue(est["pausado"]); self.assertEqual(est["pausa_motivo"], "revisando el workflow")
        self.assertEqual(self.m.lanzados, []); self.assertEqual(self.m.red, 0)
        self.assertEqual(len(self.pendientes()), 1)
        os.unlink(os.path.join(self.tmp, DP.PAUSA))
        est = self.paso()
        self.assertFalse(est["pausado"]); self.assertEqual(len(self.m.lanzados), 1)

    def test_en_pausa_tampoco_sigue_ni_avisa(self):
        self.pedir("compilar"); self.paso()
        self.m.run_de(500, 39, "completed", "success")
        open(os.path.join(self.tmp, DP.PAUSA), "w").write("x\n")
        self.paso()
        self.assertEqual(self.m.mensajes, [])


class Arreglo(Base):
    def setUp(self):
        super().setUp()
        c, _ = C.registrar(None, 39, ["Videollamada solo por Bluetooth", "Otra"], aparato="Mac y tablet", version="0.5.1-prueba.39", sha=SHA)
        C.escribir(c, os.path.join(self.tmp, C.NOMBRE))

    def test_publica_una_vez_y_anota_la_comprobacion(self):
        p1 = self.pedir("pedir-arreglo", quien="alex", prueba=39, comprobacion="c1", nota="el vídeo sale negro")
        self.paso()
        self.assertEqual(len(self.m.mensajes), 1)
        msg = self.m.mensajes[0]
        self.assertEqual(msg["canales"], ["claude-cowork", "hermes"])
        self.assertIn("0.5.1-prueba.39", msg["texto"]); self.assertIn("c1", msg["texto"]); self.assertIn("el vídeo sale negro", msg["texto"])
        self.assertIn("Evidencia", msg["texto"])
        ar = C.leer(os.path.join(self.tmp, C.NOMBRE))["pruebas"]["39"]["comprobaciones"][0]["arreglo"]
        self.assertEqual((ar["quien"], ar["peticion"]), ("alex", p1))
        # otra vez enseguida: nada nuevo
        p2 = self.pedir("pedir-arreglo", prueba=39, comprobacion="c1"); self.paso(30)
        self.assertEqual(len(self.m.mensajes), 1); self.assertIn("no repito", self.hecha(p2)["resultado"])
        # pasados 6 min sí
        self.pedir("pedir-arreglo", prueba=39, comprobacion="c1"); self.paso(400)
        self.assertEqual(len(self.m.mensajes), 2)

    def test_por_plataforma_y_sin_repetir(self):
        self.pedir("pedir-arreglo", prueba=39, plataforma="android", nota="no instala"); self.paso()
        self.pedir("pedir-arreglo", prueba=39, plataforma="android"); self.paso(10)
        self.assertEqual(len(self.m.mensajes), 1)

    def test_comprobacion_inexistente(self):
        p = self.pedir("pedir-arreglo", prueba=39, comprobacion="c9"); self.paso()
        self.assertEqual(self.hecha(p)["estado"], "rechazada"); self.assertEqual(self.m.mensajes, [])


class App(Base):
    def test_abre_si_esta_cerrada(self):
        p = self.pedir("app-abrir"); self.paso()
        self.assertEqual(self.m.abiertas, [1]); self.assertIn("25 s", self.hecha(p)["resultado"])

    def test_si_esta_abierta_no_la_toca_y_dice_que_no_se_puede_pedir_busqueda(self):
        self.m.abierta = True
        p = self.pedir("app-abrir"); self.paso()
        self.assertEqual(self.m.abiertas, []); self.assertIn("no es posible", self.hecha(p)["resultado"])


class DosVeces(Base):
    def test_doble_pasada_y_cerrojo(self):
        self.pedir("compilar")
        a = self.paso(1); b = self.paso(1)
        self.assertEqual(len(self.m.lanzados), 1)
        self.assertEqual(a["peticiones"][0]["estado"], "hecha")
        self.assertEqual(len([f for f in b["peticiones"] if f["accion"] == "compilar"]), 1)

    def test_corte_entre_atender_y_cerrar_el_archivo(self):
        pid = self.pedir("compilar")
        self.paso()
        # el archivo vuelve a estar pendiente (se mató antes de borrarlo): no se lanza otra vez
        pet = json.load(open(os.path.join(self.tmp, "pruebas-peticiones", "hechas", pid + ".json")))
        os.makedirs(os.path.join(self.tmp, "pruebas-peticiones"), exist_ok=True)
        json.dump({k: v for k, v in pet.items() if k in ("formato", "id", "accion", "quien", "t")}, open(os.path.join(self.tmp, "pruebas-peticiones", pid + ".json"), "w"))
        self.paso()
        self.assertEqual(len(self.m.lanzados), 1); self.assertEqual(self.pendientes(), [])

    def test_estado_para_genesis(self):
        self.pedir("compilar", sha=SHA2)
        est = self.paso()
        s = json.load(open(os.path.join(self.tmp, DP.ESTADO)))
        for k in ("formato", "t", "cada_s", "pasada", "pausado", "en_curso", "esperando", "ultimas", "peticiones", "avisos"):
            self.assertIn(k, s)
        self.assertEqual(s["cada_s"], 60)
        self.assertEqual(s["peticiones"][0]["estado"], "pendiente")
        self.assertNotIn(self.tmp, json.dumps(s))     # nada de rutas del disco

    def test_estado_ilegible_no_rompe(self):
        open(os.path.join(self.tmp, DP.ESTADO), "w").write("{rota")
        est = self.paso()
        self.assertEqual(est["pasada"], 1)


class Comprobaciones(unittest.TestCase):
    def test_heredar_copia_las_pendientes_con_su_senal(self):
        d, _ = C.registrar(None, 38, ["Videollamada solo por Bluetooth, 2 minutos", "otra"], aparato="Mac", version="0.5.1-prueba.38")
        d, _ = C.asignar_senales(d, 38)
        d, _ = C.marcar(d, 38, "c1", "bien", t="T"), None
        d, ids = C.heredar(d, 39, version="0.5.1-prueba.39", sha=SHA)
        p = d["pruebas"]["39"]
        self.assertEqual(ids, ["c1", "c2"]); self.assertTrue(all(c["estado"] == "pendiente" for c in p["comprobaciones"]))
        self.assertEqual(p["comprobaciones"][0].get("senal"), "video-fps-ble")
        d2, ids2 = C.heredar(d, 39)
        self.assertEqual(ids2, [])

    def test_archivo_viejo_sin_campos_nuevos_no_cambia(self):
        d, _ = C.registrar(None, 36, ["x"], aparato="Mac")
        self.assertNotIn("senal", d["pruebas"]["36"]["comprobaciones"][0])
        self.assertNotIn("arreglo", d["pruebas"]["36"]["comprobaciones"][0])

    def test_senales_de_los_textos_reales_de_38_y_39(self):
        textos = {
            "Dejar los dos en el mismo Wi-Fi una hora: en Puertos el enlace Bluetooth sigue ligado todo el tiempo": "enlace-ble-hora",
            "En plena llamada, apagar el Wi-Fi de la tablet: la voz sigue en unos 2 segundos sin colgar": "voz-sin-corte",
            "Llamar a la tablet con su Wi-Fi apagado desde antes: sale por Bluetooth": "llamada-ble",
            "Videollamada solo por Bluetooth, 2 minutos, con las dos cámaras": "video-fps-ble",
            "En esa misma llamada, silenciar los dos micrófonos 30 segundos: el vídeo sigue sin pausarse": "video-sin-pausa-mudo",
            "Solo Bluetooth, alejando los aparatos: sale «Vídeo en pausa: la señal solo alcanza para la voz»": "video-pausa-ancho",
            "Solo Bluetooth, alejando más: la voz sigue limpia más lejos que antes": "voz-limpia-lejos",
            "Al activar el vídeo, la Mac abre su propia cámara (FaceTime HD) sin elegir nada": "camara-abre",
            "Ventana de permisos al abrir tras actualizar: se ve entera": None,
        }
        for t, s in textos.items():
            self.assertEqual(C.senal_de_texto(t), s, t)


class AvisoDelBanco(Base):
    def test_el_aviso_lleva_el_mensaje_y_el_sitio_no_solo_el_tipo(self):
        m = self.m

        def roto():
            return {}["clave-que-no-esta"]
        m.pasada_banco = roto
        est = DP.pasada(m)
        self.assertEqual(len(est["avisos"]), 1)
        self.assertIn("KeyError", est["avisos"][0]); self.assertIn("clave-que-no-esta", est["avisos"][0])
        self.assertIn("test_director_pruebas.py", est["avisos"][0])
        self.assertNotIn("/home", est["avisos"][0])
        m.t += 60
        self.assertEqual(len(DP.pasada(m)["avisos"]), 1)          # el mismo aviso no se repite pasada tras pasada


if __name__ == "__main__":
    unittest.main()
