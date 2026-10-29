"""Cachés fuera de la lista blanca de Genesis (CNS1010C): sin disco ni procesos reales, todo inyectado."""
import contextlib
import fnmatch
import io
import os
import sys
import time
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autocuracion_mando as A  # noqa: E402
import limpieza_caches as L  # noqa: E402

H, NPM = "/Users/alex", "/private/tmp/npm-cache-7/"
CLON, CHROME = "/private/var/folders/ab/cd/X/com.google.Chrome.code_sign_clone/c", "/Applications/Google Chrome.app"
CV, CX = H + "/.local/share/claude/versions/", H + "/.codex/packages/standalone/releases/"
HERMES, BITNET = H + "/.hermes/logs/gateway.error.log", H + "/Documents/IA 1.58 bit/backend/bitnet-server.log"
CLAUDE, CURRENT = "~/.local/bin/claude", "~/.codex/packages/standalone/current"
C0324, C0521, C1238 = CLON + "-0324", CLON + "-0521", CLON + "-1238"  # la madrugada del 28 y el Chrome de mediodía
rutas = lambda e: [a["ruta"] for a in (L.plan(**e) if isinstance(e, dict) else e)]  # noqa: E731


def entorno(rutas, mb=None, vivos=(), enlaces=None, libre=4.0, clones=None, inicio=None):
    def existe(patron):  # una máquina de mentira (`*` no cruza «/»)
        p = patron.replace("~", H, 1)
        return sorted(r for r in rutas if r.count("/") == p.count("/") and fnmatch.fnmatchcase(r, p))
    e = {"libre_gb": libre, "existe": existe, "tamano_mb": lambda r: (mb or {}).get(r, 1400.0),
         "proceso_vivo": lambda t: any(t in v for v in vivos), "enlace_destino": (enlaces or {}).get}
    if clones is not None:
        e["clones"], e["inicio_chrome_mas_viejo"] = clones, inicio
    return e


class LimpiezaCaches(unittest.TestCase):  # plan (puro), aplicar, recortar, recoger y la autocuración
    def test_sin_chrome_se_borran_todos_los_clones(self):
        clones = [(C0324, 1000.0), (C0521, 2000.0), (C1238, 40_000.0)]
        self.assertEqual(L.clones_de_chrome_a_borrar(clones, None), [C0324, C0521, C1238])

    def test_chrome_de_las_12_38_borra_madrugada_y_conserva_el_suyo(self):
        clones = [(C0324, 1000.0), (C0521, 2000.0), (C1238, 40_000.0)]  # mtimes: 03:24, 05:21 y 12:38
        self.assertEqual(L.clones_de_chrome_a_borrar(clones, 40_000.0), [C0324, C0521])  # −60 s de margen
        (a0, a1) = L.plan(**entorno([C0324, C0521, C1238], clones=clones, inicio=40_000.0))
        self.assertEqual((a0["accion"], a0["ruta"], "Chrome" in a0["por_que"]), ("borrar", C0324, True))
        self.assertEqual((a1["accion"], a1["ruta"]), ("borrar", C0521))

    def test_el_margen_de_60_s_es_exacto_un_segundo_de_mas_se_va(self):
        """Rescate de IMG1028B: el clon del propio Chrome (a menos de 60 s de su arranque) se conserva;
        el que dista 61 s ya es un huérfano de una matanza nocturna y se va."""
        t = 40_000.0
        exacto, borde = CLON + "-1200-exacto", CLON + "-1200-borde"  # rutas absolutas: no vetadas
        self.assertEqual(L.clones_de_chrome_a_borrar([(exacto, t - 60.0)], t), [])  # justo el margen
        self.assertEqual(L.clones_de_chrome_a_borrar([(borde, t - 61.0)], t), [borde])

    def test_ruta_vetada_nunca_se_borra_y_ps_sin_salida_no_borra_nada(self):
        self.assertEqual(L.clones_de_chrome_a_borrar([("/a/.env/cls", 0.0), ("rel/cls", 0.0)], None), [])
        self.assertEqual(L.inicio_chrome_de_ps(None), (None, True))  # ps no salió: no se sabe, no se borra

    def test_ps_da_el_arranque_exacto_del_chrome_principal_y_los_ayudantes_no_llegan(self):
        ayudante = ("/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Helper "
                    "(Renderer).app/Contents/MacOS/Google Chrome Helper (Renderer)")
        ps = ("  501 Tue Oct 28 03:24:17 2026 " + L.EJECUTABLE_CHROME + "\n"
              "  502 Tue Oct 28 11:00:00 2026 " + ayudante + "\n"
              "  503 Tue Oct 28 09:00:00 2026 /Applications/Google Chrome.app/Contents/otro\n")
        self.assertEqual(L.inicio_chrome_de_ps(ps), (time.mktime((2026, 10, 28, 3, 24, 17, 0, 0, -1)), True))
        self.assertEqual(L.inicio_chrome_de_ps("  501 Tue Oct 28 09:00:00 2026 /usr/sbin/cfprefsd\n"),
                         (None, False))  # sin Chrome: se pueden borrar todos
        self.assertEqual(L._lstart_a_epoch("Tue Febrero 28 09:00:00 2026"), None)
        varios = ("  501 Tue Oct 28 12:38:00 2026 %s\n" % L.EJECUTABLE_CHROME +
                  "  502 Tue Oct 28 03:24:11 2026 %s\n" % L.EJECUTABLE_CHROME +  # este arrancó a las 3:24
                  "  503 Tue Oct 28 03:24:12 2026 /Applications/Google Chrome.app/otro\n")
        self.assertEqual(L.inicio_chrome_de_ps(varios),  # los ayudantes no cuentan: el principal más viejo
                         (time.mktime((2026, 10, 28, 3, 24, 11, 0, 0, -1)), True))

    def test_recoger_con_chrome_vivo_recoge_solo_los_anteriores_a_su_arranque(self):
        t12 = time.mktime((2026, 10, 28, 12, 38, 0, 0, 0, -1))
        ps_l = ("  501 Tue Oct 28 12:38:00 2026 %s\n" % L.EJECUTABLE_CHROME +
                "  502 Tue Oct 28 12:38:01 2026 /usr/sbin/cfprefsd\n")

        def correr_falso(o, ok=(0,)):  # el ps nuevo se distingue por su `-axo`
            return ps_l if o[:1] == ["ps"] and "-axo" in o else "otro\n"
        r = L.recoger(4.0, home=H, glob_fn=lambda p: [C0324, C0521, C1238] if "code_sign_clone" in p else [],
                      correr=correr_falso, es_enlace=lambda e: False, ruta_real=str,
                      mtime_fn={"%s-0324" % CLON: 1000.0, "%s-0521" % CLON: 2000.0, "%s-1238" % CLON: t12}.get)
        acc = L.plan(**r)  # vive desde las 12:38: de madrugada solo quedan sus dos clon huérfanos
        self.assertEqual(sorted((a["ruta"], a["accion"]) for a in acc), [(C0324, "borrar"), (C0521, "borrar")])

    def test_recoger_sin_chrome_recoge_todos_los_clones_y_con_ps_caido_ninguno(self):
        glob_fn = lambda p: [C0324, C0521] if "code_sign_clone" in p else []  # noqa: E731
        mtime_fn = {"%s-0324" % CLON: 1000.0, "%s-0521" % CLON: 2000.0}.get
        r = L.recoger(4.0, home=H, glob_fn=glob_fn, correr=lambda o, ok=(0,): "otro\n",
                      es_enlace=lambda e: False, ruta_real=str, mtime_fn=mtime_fn)
        self.assertEqual(sorted(r["clones"]), [(C0324, 1000.0), (C0521, 2000.0)])
        self.assertEqual(sorted(a["ruta"] for a in L.plan(**r)), [C0324, C0521])
        r2 = L.recoger(4.0, home=H, glob_fn=glob_fn, correr=lambda o, ok=(0,): None,
                       es_enlace=lambda e: False, ruta_real=str, mtime_fn=mtime_fn)
        self.assertEqual((r2["clones"], r2["inicio_chrome_mas_viejo"]), ([], None))

    def test_npm_solo_si_pasa_de_500_mb_y_npx_y_logs_intactos(self):
        todo = [NPM + "_cacache", NPM + "_npx", NPM + "_logs"]
        self.assertEqual(rutas(entorno(todo, mb={NPM + "_cacache": 630.0})), [NPM + "_cacache"])
        self.assertEqual(rutas(entorno(todo, mb={NPM + "_cacache": 300.0})), [])  # aunque el glob dé _npx:
        self.assertEqual(rutas(dict(entorno(todo), existe=lambda p: todo if "npm" in p else [])), [NPM + "_cacache"])
        self.assertEqual(rutas(entorno(todo, vivos=["npm install --include=dev"])), [])  # escribiendo su caché

    def test_gradle_solo_por_debajo_de_6_gb_y_sin_gradle_vivo(self):
        g = [H + "/.gradle/caches", H + "/.gradle/wrapper/dists", H + "/.gradle/daemon"]
        self.assertEqual(rutas(entorno(g, libre=4.0)), g)
        self.assertEqual(rutas(entorno(g, libre=6.0)) + rutas(entorno(g, libre=None)), [])
        self.assertEqual(rutas(entorno(g, vivos=["java org.gradle.launcher.daemon.GradleDaemon"])), [])

    def test_registros_grandes_se_recortan_no_se_borran(self):
        chico = H + "/.hermes/logs/chico.log"
        acc = L.plan(**entorno([HERMES, BITNET, chico], mb={HERMES: 200.0, BITNET: 210.0, chico: 40.0}))
        self.assertEqual([(a["accion"], a["ruta"], round(a["mb"])) for a in acc],  # menos los 3 MB que quedan
                         [("recortar", HERMES, 197), ("recortar", BITNET, 207)])

    def test_version_del_enlace_de_claude_protegida(self):
        self.assertEqual(rutas(entorno([CV + "2.1.3", CV + "2.1.5"], enlaces={CLAUDE: CV + "2.1.5"})), [CV + "2.1.3"])

    def test_version_con_proceso_vivo_protegida(self):
        e = entorno([CV + "2.1.1", CV + "2.1.3", CV + "2.1.5"], vivos=[CV + "2.1.1"], enlaces={CLAUDE: CV + "2.1.5"})
        self.assertEqual(rutas(e), [CV + "2.1.3"])

    def test_codex_respeta_current_y_sin_enlace_no_se_toca_ninguna(self):
        e = entorno([CX + "0.39.0", CX + "0.40.0"], enlaces={CURRENT: CX + "0.40.0/bin/codex"})
        self.assertEqual(rutas(e), [CX + "0.39.0"])
        self.assertEqual(rutas(entorno([CV + "2.1.3", CX + "0.39.0"])), [])
        self.assertEqual(rutas(entorno([CV + "2.1.3"], enlaces={CLAUDE: "/opt/homebrew/bin/claude"})), [])  # ¿cuál?

    def test_lista_negra_gana_siempre(self):
        malas = [NPM + ".git/_cacache", H + "/.gradle/caches/starseed_memory_root", H + "/.hermes/logs/state.db.log"]
        self.assertEqual(rutas(dict(entorno(malas, mb={r: 9999.0 for r in malas}), existe=lambda p: malas)), [])
        tocadas, env = [], [{"accion": "borrar", "ruta": H + "/.env.local", "mb": 1}]
        self.assertEqual((L.aplicar(env, tocadas.append, tocadas.append), tocadas), ([], []))
        self.assertRaises(ValueError, L.borrar, H + "/Library/CloudStorage/x")  # se niega antes de mirar el disco
        self.assertRaises(ValueError, L.recortar, H + "/.hermes/logs/.env.log")  # y recortar, igual
        self.assertEqual([L.vetada(r) for r in ("rel/x", "/a/../b", "/a/b..c", "/a/b")], [True, True, False, False])

    def test_recortar_no_borra_y_un_fallo_no_para_el_resto(self):
        borrados, recortados = [], []
        borrar = lambda r: (_ for _ in ()).throw(OSError("ocupado")) if r == "/b/x" else borrados.append(r)  # noqa
        acc = [{"accion": "borrar", "ruta": "/b/x", "mb": 5}, {"accion": "recortar", "ruta": "/r.log", "mb": 7},
               {"accion": "borrar", "ruta": "/b/ok", "mb": 3}, {"accion": "otra", "ruta": "/o", "mb": 1}]
        hecho = L.aplicar(acc, borrar, recortados.append)
        self.assertEqual((borrados, recortados, rutas(hecho)), (["/b/ok"], ["/r.log"], ["/r.log", "/b/ok"]))
        self.assertRegex(L.resumen(hecho), r"^liberados ≈10 MB .*: recorté /r\.log ≈7 MB; borré /b/ok ≈3 MB$")

    def test_recortar_se_queda_con_la_cola_en_el_mismo_archivo(self):
        largo, corto = io.BytesIO(b"viejo-" * 10 + b"ULTIMO"), io.BytesIO(b"abc")  # sin cerrar, para mirar dentro
        abrir = lambda f: lambda r, m: contextlib.nullcontext(f)  # noqa: E731
        self.assertEqual((L.recortar("/x", abrir=abrir(largo), conservar=6), largo.getvalue()), (60, b"ULTIMO"))
        self.assertEqual((L.recortar("/y", abrir=abrir(corto), conservar=6), corto.getvalue()), (0, b"abc"))

    def test_recoger_sin_ps_o_sin_lsof_protege_y_con_lsof_marca_la_version_abierta(self):
        vivo = lambda correr: L.recoger(4.0, home=H, correr=correr, ruta_real=str)["proceso_vivo"]  # noqa: E731
        sin_ps, sin_lsof = vivo(lambda o, ok=(0,): None), vivo(lambda o, ok=(0,): None if o[0] == "lsof" else "py x\n")
        self.assertEqual([sin_ps("Chrome"), sin_lsof("Chrome"), sin_lsof(CV + "2.1.3")], [True, False, True])
        salidas = {"ps": "claude\n", "lsof": "p42\nn%s2.1.3\n" % CV, "du": "2048\t/x\n"}
        r = L.recoger(4.0, home=H, glob_fn=lambda p: [p, p], correr=lambda o, ok=(0,): salidas[o[0]],
                      es_enlace=lambda e: e.endswith("/bin/claude"), ruta_real=lambda e: e.replace("/bin/claude", "/c"))
        v, d = r["proceso_vivo"], r["enlace_destino"]
        self.assertEqual([v(CV + "2.1.3"), v(CV + "2.1.4"), r["tamano_mb"]("/x")], [True, False, 2.0])
        self.assertEqual((r["existe"]("~/g"), d(CLAUDE), d("~/o")), ([H + "/g"], H + "/.local/c", None))

    def test_recoger_no_sigue_enlaces_ni_sale_de_la_carpeta_fija_del_patron(self):
        lg, g = H + "/.hermes/logs/", H + "/.gradle/"  # b.log es un enlace (a la tesis); ~/.gradle, uno a otro disco
        r = L.recoger(4.0, home=H, glob_fn=lambda p: [lg + "a.log", lg + "b.log"] if "*" in p else [p],
                      correr=lambda o, ok=(0,): "", es_enlace=lambda e: e == lg + "b.log",
                      ruta_real=lambda e: "/Volumes/otro/.gradle/caches" if e == g + "caches" else e)
        self.assertEqual([r["existe"](p) for p in (L.LOGS[0], *L.GRADLE[::2])], [[lg + "a.log"], [], [g + "daemon"]])

    def test_autocuracion_solo_con_la_limpieza_real_libera_lo_que_no_ve_y_lo_dice(self):
        sim = lambda ids: {"ok": True, "limpiados": list(ids)}  # noqa: E731
        for real, avisos in ((True, []), (False, [])):  # con una limpiar_fn simulada no se mira el disco real
            with mock.patch.multiple(A, _leer_json=lambda r, d: d, _guardar=lambda d: 0, limpiar=sim if real else A.limpiar), \
                    mock.patch.multiple(L, recoger=lambda libre: entorno([], libre=libre), borrar=lambda r: None,
                                        plan=lambda **k: [{"accion": "borrar", "ruta": CLON, "mb": 1400.0}]):
                e = A.revisar(ahora=100_000, sondear_fn=lambda: True, limpiar_fn=sim, libre_fn=lambda: 4.0, traer_fn=int,
                              avisar_fn=avisos.append, asignar_fn=lambda: ({"puede": False}, lambda: []), buscar_fn=dict,
                              curar_fn=lambda *a: "", servicios_fn=lambda: {"estado": "ok"}, medidores_fn=lambda a: [])
            dicho = [h[:24] for h in e["hechos"] + avisos if "liberados ≈1400 MB" in h and CLON in h]  # y qué ruta
            self.assertEqual(dicho, ["disco con 4.0 GB: libera", "Autocuración: liberados "] if real else [])
