# -*- coding: utf-8 -*-
"""AUT1116A: la fábrica se mantiene sola. Lógica pura con reloj, archivos y procesos inyectados."""
import ast
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import autocuracion_mando as AC  # noqa: E402
import buscar_capacidad as BC  # noqa: E402
import orquestador_al_dia as OD  # noqa: E402
import repartir_nube as RN  # noqa: E402
import urgencia_tarea as U  # noqa: E402
import vigia_medidores as VM  # noqa: E402
import vigia_runs_nube as VR  # noqa: E402
from vigilante_logica import seleccionar_pendientes  # noqa: E402

_ruta = os.path.join(AQUI, "director-nube.py")
_spec = importlib.util.spec_from_file_location("director_nube_aut", _ruta)
DN = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(DN)

AHORA = 1_800_000_000.0


def _escribir(ruta, datos):
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f)


def _leer(ruta):
    with open(ruta, encoding="utf-8") as f:
        return json.load(f)


def _texto(ruta):
    with open(ruta, encoding="utf-8") as f:
        return f.read()


def fecha(ts):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts))


# ── A · el orquestador parado se reinicia solo ─────────────────────────────────────────────────────────
class OrquestadorParado(unittest.TestCase):
    def setUp(self):
        self.avisos = []

    def llamar(self, estado, cura, **kw):
        llamadas = []
        linea = AC.curar_orquestador_parado(
            estado, AHORA, curar_fn=lambda ahora: llamadas.append(ahora) or cura,
            avisar_fn=self.avisos.append, despertar_fn=kw.pop("despertar_fn", lambda: True), **kw)
        return linea, llamadas

    def test_umbral_y_intervalo_son_los_propuestos(self):
        self.assertEqual(AC.ORQ_PARADO_S, 600)
        self.assertEqual(AC.ORQ_PARADO_REINICIO_MINIMO_S, 1800)

    def test_reiniciado_queda_en_el_estado_y_se_avisa(self):
        est = {}
        linea, _ = self.llamar(est, {"accion": "reiniciado", "motivo": "orquestador vivo sin ninguna tarea en marcha y con 44 lista(s)"})
        self.assertIn("44 lista(s)", linea)
        self.assertIn("lo reinicio", linea)
        self.assertEqual(est["ultimo_reinicio_orq_parado"], AHORA)
        self.assertEqual(len(self.avisos), 1)

    def test_no_reinicia_dos_veces_dentro_del_intervalo(self):
        est = {"ultimo_reinicio_orq_parado": AHORA - 20 * 60}
        linea, llamadas = self.llamar(est, {"accion": "reiniciado", "motivo": "x"})
        self.assertEqual((linea, llamadas, self.avisos), ("", [], []))  # ni siquiera lo mira
        est = {"ultimo_reinicio_orq_parado": AHORA - 31 * 60}
        _, llamadas = self.llamar(est, {"accion": "trabajando", "motivo": "ok"})
        self.assertEqual(len(llamadas), 1)

    def test_vigilando_lo_dice_sin_reiniciar(self):
        est = {}
        linea, _ = self.llamar(est, {"accion": "vigilando", "motivo": "m", "desde_s": 130})
        self.assertIn("130 s", linea)
        self.assertNotIn("ultimo_reinicio_orq_parado", est)
        self.assertEqual(self.avisos, [])

    def test_trabajando_no_dice_nada(self):
        self.assertEqual(self.llamar({}, {"accion": "trabajando", "motivo": "trabaja en X"})[0], "")

    def test_sin_orquestador_despierta_al_vigilante_una_vez_cada_10_min(self):
        est = {}
        linea, _ = self.llamar(est, {"accion": "sin_orquestador", "motivo": "no hay"})
        self.assertIn("despierto al vigilante", linea)
        linea, _ = self.llamar(est, {"accion": "sin_orquestador", "motivo": "no hay"})
        self.assertEqual(linea, "")
        est["ultimo_despertar_orq"] = AHORA - 11 * 60
        self.assertIn("despierto", self.llamar(est, {"accion": "sin_orquestador", "motivo": "no hay"})[0])

    def test_sin_poder_despertarlo_lo_dice_sin_avisar(self):
        linea, _ = self.llamar({}, {"accion": "sin_orquestador", "motivo": "no hay"}, despertar_fn=lambda: False)
        self.assertIn("no pude despertar", linea)
        self.assertEqual(self.avisos, [])

    def test_forzar_salta_el_intervalo(self):
        est = {"ultimo_reinicio_orq_parado": AHORA - 60}
        _, llamadas = self.llamar(est, {"accion": "trabajando", "motivo": "ok"}, forzar=True)
        self.assertEqual(len(llamadas), 1)

    def test_la_pasada_de_la_autocuracion_lo_llama_y_lo_registra(self):
        d = tempfile.mkdtemp()
        antes = AC.ESTADO
        AC.ESTADO = os.path.join(d, "a.json")
        try:
            e = AC.revisar(ahora=AHORA, sondear_fn=lambda: True, limpiar_fn=lambda ids: {}, libre_fn=lambda: 50.0,
                           avisar_fn=lambda t: None, dormir=lambda s: None, asignar_fn=lambda: ({}, lambda: []),
                           buscar_fn=lambda: {}, traer_fn=lambda: None, servicios_fn=lambda: {}, medidores_fn=lambda a: [],
                           curar_fn=lambda *a: "", lider_fn=lambda: {"yo": True}, estatico_fn=lambda: True,
                           parado_fn=lambda est, ahora, forzar: "orquestador parado: simulado")
        finally:
            AC.ESTADO = antes
        self.assertIn("orquestador parado: simulado", e["hechos"])

    def test_el_vigia_pide_a_la_nube_con_cesion(self):
        # El 16-11 a las 19:59 la simulación sin `--ceder` dejaba en la Mac las 44 listas de su tanda y decía
        # «0 tareas»: «no hay atraso que la nube pueda coger».
        self.assertIn("--ceder", VM.orden_repartir_nube(simular=True))
        self.assertIn("--simular", VM.orden_repartir_nube(simular=True))
        self.assertNotIn("--simular", VM.orden_repartir_nube(simular=False))
        self.assertIn("--ceder", VM.orden_lanzar_nube())

    def test_sin_cesion_la_tanda_de_la_mac_se_lo_queda_todo_y_con_cesion_no(self):
        tareas = [{"id": "T%02d" % i, "titulo": "t", "archivos": ["a.ts"]} for i in range(44)]
        colas = [("cola-auto-1.json", tareas)]
        tanda = {t["id"] for t in tareas}
        self.assertEqual(RN.elegir(RN.sin_lo_de_la_mac(colas, tanda), {}, [], None, tope=8), [])
        estado_mac = {"listas": [t["id"] for t in tareas], "tope": 3}
        cedibles, lote = RN.cedibles_y_lote(tanda, estado_mac, colas, {})
        self.assertEqual(len(RN.elegir(RN.sin_lo_de_la_mac(colas, tanda, cedibles), {}, [], None, tope=8, mismo_lote=lote)), 8)


# ── B · lo urgente no se aparca ────────────────────────────────────────────────────────────────────────
def _funciones_del_orquestador():
    """La regla PRI01 tal cual está en el orquestador, sin importarlo (10 000 líneas y efectos al cargar)."""
    ruta = os.path.join(AQUI, "..", "enjambre", "starseed-enjambre.py")
    arbol = ast.parse(_texto(ruta))
    nodos = [n for n in arbol.body if isinstance(n, ast.FunctionDef) and n.name in ("prioridad_de_tarea", "ordenar_pendientes")]
    espacio = {}
    exec(compile(ast.Module(nodos, []), ruta, "exec"), espacio)  # noqa: S102
    return espacio["prioridad_de_tarea"], espacio["ordenar_pendientes"]


class Urgencia(unittest.TestCase):
    CASOS = [{"id": "A"}, {"id": "B", "titulo": "URGENTE: x"}, {"id": "C", "urgente": True}, {"id": "D", "prioridad": 7},
             {"id": "E", "prioridad": True}, {"id": "F", "titulo": " urgente arreglo"}, {"id": "G", "prioridad": -3},
             {"id": "H", "urgente": "sí"}, {"id": "I", "titulo": None}]

    def test_misma_regla_que_el_orquestador(self):
        prio, orden = _funciones_del_orquestador()
        for t in self.CASOS:
            self.assertEqual(U.prioridad_de_tarea(t), prio(t), t)
        self.assertEqual([t["id"] for t in U.ordenar_primero(self.CASOS)], [t["id"] for t in orden(self.CASOS)])

    def test_nunca_lanza(self):
        self.assertEqual(U.prioridad_de_tarea(None), 0.0)
        self.assertEqual(U.prioridad_de_tarea("x"), 0.0)

    def test_retiene_la_mac_solo_lo_prioritario_sin_empezar_y_reciente(self):
        urg = {"id": "VOZ01", "titulo": "URGENTE · voz"}
        self.assertTrue(U.retiene_la_mac(urg, None, AHORA))
        self.assertTrue(U.retiene_la_mac(urg, {"estado": "pendiente", "t": fecha(AHORA - 30 * 60)}, AHORA))
        self.assertFalse(U.retiene_la_mac(urg, {"estado": "pendiente", "t": fecha(AHORA - 91 * 60)}, AHORA))  # la Mac no pudo
        self.assertFalse(U.retiene_la_mac(urg, {"estado": "sin_cambios", "t": fecha(AHORA)}, AHORA))  # no se repite sola
        self.assertFalse(U.retiene_la_mac({"id": "X"}, None, AHORA))
        self.assertTrue(U.retiene_la_mac({"id": "P", "prioridad": 5}, {}, AHORA))

    def test_el_reparto_no_cede_lo_urgente_pero_si_lo_demas(self):
        colas = [("cola-1116-a.json", [{"id": "VOZ01", "titulo": "URGENTE · voz", "archivos": ["a.ts"]}]),
                 ("cola-1116-b.json", [{"id": "OTRA", "titulo": "normal", "archivos": ["b.ts"]}])]
        elegidas = [t["id"] for t in RN.elegir(colas, {}, [], None, tope=20, ahora=AHORA)]
        self.assertEqual(elegidas, ["OTRA"])
        self.assertEqual(RN.clasificar(colas, {}, [], None, ahora=AHORA)["urgente"], ["VOZ01"])
        self.assertIn("urgente", [k for k, _t in RN.MOTIVOS_FUERA])

    def test_si_la_mac_no_la_coge_en_hora_y_media_pasa_a_la_nube_la_primera(self):
        colas = [("cola-a.json", [{"id": "N1", "archivos": ["a.ts"]}, {"id": "N2", "archivos": ["a.ts"]},
                                  {"id": "VOZ01", "titulo": "URGENTE", "archivos": ["a.ts", "b.ts"]}])]
        prog = {"VOZ01": {"estado": "pendiente", "t": fecha(AHORA - 2 * 3600)}}
        elegidas = [t["id"] for t in RN.elegir(colas, prog, [], None, tope=2, ahora=AHORA)]
        self.assertEqual(elegidas[0], "VOZ01")  # primera aunque tenga más archivos
        self.assertEqual(len(elegidas), 2)

    def test_el_vigilante_ofrece_lo_urgente_primero_sin_mover_el_resto(self):
        import datetime

        colas = [("cola-1.json", [{"id": "A"}, {"id": "B"}, {"id": "VOZ01", "titulo": "URGENTE"}, {"id": "C"}])]
        sal = [t["id"] for t in seleccionar_pendientes(colas, {}, [], ahora=datetime.datetime(2026, 11, 16, 12, 0))]
        self.assertEqual(sal[0], "VOZ01")
        self.assertEqual(sorted(sal), ["A", "B", "C", "VOZ01"])

    def test_el_botón_ordena_lo_urgente_como_capacidad(self):
        colas = [("c.json", [{"id": "A"}, {"id": "VOZ01", "titulo": "URGENTE"}])]
        dep, cap = BC.dependientes_y_capacidad(colas)
        self.assertEqual(BC.ordenar_por_prioridad(["A", "VOZ01"], dep, cap), ["VOZ01", "A"])


# ── C · lo que vuelve de la nube aterriza ──────────────────────────────────────────────────────────────
class VuelveDeLaNube(unittest.TestCase):
    def reasignada(self, **extra):
        return dict({"estado": "reasignada", "medio": "nube", "nota": "reasignada a la nube 20261116"}, **extra)

    def test_marcar_guarda_la_hora_exacta_y_ultimo_cambio_la_usa(self):
        p = RN.marcar({"VOZ01": {"estado": "pendiente"}}, ["VOZ01"], "20261116", ahora=AHORA)
        self.assertEqual(p["VOZ01"]["t_reasignada"], AHORA)
        self.assertEqual(VR.ultimo_cambio(p["VOZ01"]), AHORA)
        # sin la hora exacta, el final del día de la nota: la cuenta antigua (hasta 48 h)
        self.assertEqual(VR.ultimo_cambio(self.reasignada()), time.mktime(time.strptime("20261116", "%Y%m%d")) + 86400)

    def test_sin_run_en_la_nota_vuelve_a_los_75_min_de_su_cola_si_ningun_run_la_lleva(self):
        prog = {"VOZ01": self.reasignada(t_reasignada=AHORA - 5 * 3600), "FRN01": self.reasignada(t_reasignada=AHORA - 5 * 3600)}
        colas = {"VOZ01": AHORA - 76 * 60, "FRN01": AHORA - 30 * 60}
        r = VR.varadas_tras_su_run(prog, {}, set(), AHORA, set(), colas_nube=colas, colas_completas=True)
        self.assertEqual([x[0] for x in r], ["VOZ01"])  # FRN01 es de hace 30 min: su run quizá aún no aparece
        self.assertEqual(VR.COLA_NUBE_VIDA_S, 75 * 60)

    def test_si_no_se_sabe_que_lleva_cada_run_vivo_no_se_aplica(self):
        prog = {"VOZ01": self.reasignada(t_reasignada=AHORA - 3600)}
        colas = {"VOZ01": AHORA - 4 * 3600}
        self.assertEqual(VR.varadas_tras_su_run(prog, {}, set(), AHORA, set(), colas_nube=colas, colas_completas=False), [])
        self.assertEqual(VR.varadas_tras_su_run(prog, {}, set(), AHORA, {"VOZ01"}, colas_nube=colas, colas_completas=True), [])

    def test_commits_olvidados(self):
        nota = "devuelta de la nube: su run terminó · la nube dijo «commit»"
        prog = {"LAT01": {"estado": "pendiente", "nota": nota, "t": fecha(AHORA - 8 * 3600)},
                "RECIENTE": {"estado": "pendiente", "nota": nota, "t": fecha(AHORA - 600)},
                "EN_TANDA": {"estado": "pendiente", "nota": nota, "t": fecha(AHORA - 8 * 3600)},
                "SIN_CAMBIOS": {"estado": "pendiente", "nota": "devuelta de la nube: su run terminó · la nube dijo «sin_cambios»",
                                "t": fecha(AHORA - 8 * 3600)},
                "CORRIENDO": {"estado": "en_curso", "nota": nota, "t": fecha(AHORA - 8 * 3600)}}
        self.assertEqual(VR.commits_olvidados(prog, AHORA, en_tanda={"EN_TANDA"}), ["LAT01"])

    def test_el_orden_de_reabrir_se_salta_lo_que_la_nube_integro(self):
        # `ordenar_reapertura_en_colas_vivas` no llega a mirar colas si no queda ningún id: sin NM, sin disco.
        import types

        miradas = []
        falso = types.ModuleType("nodo_metagenesis_medio")
        falso.colas_vivas = lambda: miradas.append(1) or []
        previo = sys.modules.get("nodo_metagenesis_medio")
        sys.modules["nodo_metagenesis_medio"] = falso
        try:
            DN.ordenar_reapertura_en_colas_vivas(["LAT01"], {"LAT01": ("commit", "", "123")})
            self.assertEqual(miradas, [])  # no queda nada que reabrir: ni mira las colas
            DN.ordenar_reapertura_en_colas_vivas(["X1"], {"X1": ("sin_cambios", "", "123")})
            self.assertEqual(miradas, [1])  # lo no integrado sigue su camino de siempre
        finally:
            if previo is None:
                sys.modules.pop("nodo_metagenesis_medio", None)
            else:
                sys.modules["nodo_metagenesis_medio"] = previo

    def test_devolver_varadas_de_punta_a_punta(self):
        raiz = tempfile.mkdtemp()
        olas = os.path.join(raiz, "starseed_memory_root", "olas")
        colas = os.path.join(raiz, "enjambre", "colas")
        os.makedirs(olas)
        os.makedirs(colas)
        prog = {"VOZ01": self.reasignada(t_reasignada=AHORA - 5 * 3600),
                "FRN01": self.reasignada(t_reasignada=AHORA - 5 * 3600),
                "LAT01": {"estado": "pendiente", "nota": "devuelta de la nube: su run terminó · la nube dijo «commit»",
                          "t": fecha(AHORA - 8 * 3600)}}
        _escribir(os.path.join(olas, "progreso.json"), prog)
        for nombre, ids in (("cola-nube-20261116-1450.json", ["VOZ01", "FRN01"]),):
            ruta = os.path.join(colas, nombre)
            _escribir(ruta, {"tareas": [{"id": i} for i in ids]})
            os.utime(ruta, (AHORA - 5 * 3600, AHORA - 5 * 3600))
        cache = os.path.join(raiz, "veredictos")
        os.makedirs(cache)
        _escribir(os.path.join(cache, "999.json"), {"FRN01": ["commit", "ok"]})
        # Parches: ni ~/.starseed, ni ps, ni el chat.
        guardados = (VR.VEREDICTOS_CACHE, VR._ps_args, VR._avisar, RN.REAPERTURAS_NUBE)
        VR.VEREDICTOS_CACHE, VR._ps_args, VR._avisar = cache, (lambda: ""), (lambda t: None)
        RN.REAPERTURAS_NUBE = os.path.join(raiz, "reaperturas.json")
        try:
            texto = VR.devolver_varadas({"runs": []}, raiz, ahora=AHORA, estado_run=lambda r: None)
        finally:
            VR.VEREDICTOS_CACHE, VR._ps_args, VR._avisar, RN.REAPERTURAS_NUBE = guardados
        sal = _leer(os.path.join(olas, "progreso.json"))
        self.assertEqual(sal["VOZ01"]["estado"], "pendiente")           # volvió a la Mac, con su hora
        self.assertEqual(sal["VOZ01"]["t"], fecha(AHORA))
        self.assertEqual(sal["FRN01"]["estado"], "integrada")           # la nube dijo «commit»: la trae traer_nube
        self.assertEqual(sal["FRN01"]["medio"], "nube")
        self.assertEqual(sal["LAT01"]["estado"], "integrada")           # el caso de LAT01
        self.assertIn("«commit»", texto)


# ── D · la copia instalada no se queda atrás en silencio ──────────────────────────────────────────────
class InstaladoAlDia(unittest.TestCase):
    CALIENTE = [("starseed-enjambre.py", 100.0, 200.0)]
    VIEJO = [("analista.py", 200.0, 100.0)]

    def test_sin_diferencias_no_hay_aviso_ni_cuenta(self):
        self.assertEqual(OD.decidir_aviso_atraso([], 5.0, AHORA), ("", None))

    def test_no_avisa_antes_de_dos_horas(self):
        aviso, desde = OD.decidir_aviso_atraso(self.CALIENTE, AHORA - 3600, AHORA)
        self.assertEqual((aviso, desde), ("", AHORA - 3600))
        self.assertEqual(OD.decidir_aviso_atraso(self.CALIENTE, None, AHORA)[1], AHORA)

    def test_avisa_con_el_comando_exacto_y_no_repite_antes_de_seis_horas(self):
        aviso, _ = OD.decidir_aviso_atraso(self.CALIENTE, AHORA - 3 * 3600, AHORA)
        self.assertIn("instalar.sh --traer", aviso)
        self.assertIn("MÁS NUEVO", aviso)
        self.assertEqual(OD.decidir_aviso_atraso(self.CALIENTE, AHORA - 9 * 3600, AHORA, AHORA - 3600)[0], "")
        self.assertNotEqual(OD.decidir_aviso_atraso(self.CALIENTE, AHORA - 9 * 3600, AHORA, AHORA - 7 * 3600)[0], "")
        self.assertIn("instalar.sh`", OD.decidir_aviso_atraso(self.VIEJO, AHORA - 3 * 3600, AHORA)[0])

    def test_la_pasada_avisa_alto_y_guarda_desde_cuando(self):
        avisos, guardado = [], []
        est = {"atraso_desde": AHORA - 3 * 3600}
        r = OD.revisar(aplicar=True, ahora=AHORA, difs_fn=lambda: self.CALIENTE, instalar_fn=lambda: (True, ""),
                       ps_fn=lambda: "", detener_fn=lambda p: {}, estado=est, guardar=guardado.append,
                       avisar_fn=avisos.append)
        self.assertEqual(len(avisos), 1)
        self.assertEqual(est["atraso_ultimo_aviso"], AHORA)
        self.assertTrue(guardado)
        self.assertTrue(any("instalar.sh" in h for h in r["hechos"]))

    def test_si_se_instala_bien_se_borra_la_cuenta(self):
        est = {"atraso_desde": AHORA - 3 * 3600}
        OD.revisar(aplicar=True, ahora=AHORA, difs_fn=lambda: [("analista.py", 200.0, 100.0)], instalar_fn=lambda: (True, ""),
                   ps_fn=lambda: "", detener_fn=lambda p: {}, estado=est, guardar=lambda e: None, avisar_fn=lambda t: None)
        self.assertNotIn("atraso_desde", est)

    def test_la_instalacion_es_atomica(self):
        texto = _texto(os.path.join(AQUI, "..", "enjambre", "instalar.sh"))
        self.assertIn('mv -f "$tmp" "$2"', texto)


# ── E · un worktree viejo bloqueado en «initializing» se quita; uno nuevo no ───────────────────────────
class WorktreeBloqueado(unittest.TestCase):
    ERR = "fatal: cannot remove a locked working tree, lock reason: initializing\nuse 'unlock' first"

    def test_edad_menor_de_las_conocidas(self):
        self.assertEqual(AC.edad_para_desbloquear(100, 5000), 100)
        self.assertEqual(AC.edad_para_desbloquear(None, 5000), 5000)
        self.assertIsNone(AC.edad_para_desbloquear(None, None))

    def test_solo_pasado_un_dia(self):
        self.assertTrue(AC.bloqueo_de_alta_viejo(self.ERR, 25 * 3600, minimo_s=AC.BLOQUEO_INICIALIZANDO_S))
        self.assertFalse(AC.bloqueo_de_alta_viejo(self.ERR, 23 * 3600, minimo_s=AC.BLOQUEO_INICIALIZANDO_S))

    def _repo_con_worktree(self, nombre):
        base = tempfile.mkdtemp()
        repo = os.path.join(base, "repo")
        wt = os.path.join(base, nombre)

        def g(*a):
            return subprocess.run(["git", "-C", repo, *a], capture_output=True, text=True, check=True)

        os.makedirs(repo)
        subprocess.run(["git", "init", "-q", repo], check=True)
        g("-c", "user.email=a@b", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "x")
        g("worktree", "add", "-q", "-b", "rama-" + nombre, wt)
        g("worktree", "lock", "--reason", "initializing", wt)
        return repo, wt

    def _con_edad(self, wt, repo, horas):
        t = time.time() - horas * 3600
        admin = AC._dir_admin(wt)
        for ruta in (os.path.join(admin, "locked"), os.path.join(wt, ".git"), wt):
            os.utime(ruta, (t, t))

    def test_de_punta_a_punta_con_git_de_verdad(self):
        raiz_antes = AC.RAIZ
        try:
            repo, viejo = self._repo_con_worktree("VZF1015T")
            AC.RAIZ = repo
            self.assertTrue(os.path.isdir(AC._dir_admin(viejo)))
            self._con_edad(viejo, repo, 30)
            self.assertEqual(AC._git_wt(viejo, "worktree remove", viejo), 0)
            self.assertFalse(os.path.exists(viejo))
            # uno de hace 2 h con el mismo bloqueo: se deja en paz y se dice por qué
            repo, nuevo = self._repo_con_worktree("RECIENTE")
            AC.RAIZ = repo
            self._con_edad(nuevo, repo, 2)
            with self.assertRaises(RuntimeError):
                AC._git_wt(nuevo, "worktree remove", nuevo)
            self.assertTrue(os.path.isdir(nuevo))
        finally:
            AC.RAIZ = raiz_antes


if __name__ == "__main__":
    unittest.main()
