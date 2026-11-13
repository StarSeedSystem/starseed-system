# -*- coding: utf-8 -*-
"""Pruebas de la guardia del disco (GUA1113A, 2026-11-13). Todo con carpetas temporales y procesos
que lanzan las propias pruebas: no se toca el disco, el estado ni los procesos reales de la Mac.

Cubre las cuatro reglas: (1) lo desbocado se corta mientras se escribe, (2) nada grande ni generado
se commitea, (3) el freno por espacio libre en sus dos umbrales y su suelta, (4) el estado para Genesis.
"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import textwrap
import time
import unittest
from pathlib import Path
from unittest.mock import patch

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import guardia_disco as GD  # noqa: E402


def _importar_enjambre():
    spec = importlib.util.spec_from_file_location("enjambre_gua", AQUI / "starseed-enjambre.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


enjambre = _importar_enjambre()

# Un hijo que escribe sin parar al archivo que se le dé (lo que hizo el agente de ALC1113A).
DESBOCADO = textwrap.dedent("""
    import sys, time
    ruta = sys.argv[1]
    bloque = (b"x" * 1023 + b"\\n") * 256          # 256 KB
    with open(ruta, "ab") as f:
        for _ in range(100000):
            f.write(bloque); f.flush()
            time.sleep(0.01)
""")


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        self.wt = self.dir / "wt" / "TAREA1"
        self.wt.mkdir(parents=True)
        env = {
            "STARSEED_DISCO_DIR": str(self.dir / "estado"),
            "STARSEED_DISCO_ARCHIVO_MAX_MB": "1",
            "STARSEED_DISCO_ARBOL_CRECE_MB": "100",
            "STARSEED_DISCO_SONDEO_S": "0.1",
        }
        p = patch.dict(os.environ, env)
        p.start()
        self.addCleanup(p.stop)
        self.hijos = []
        self.addCleanup(self._matar_hijos)

    def _matar_hijos(self):
        for h in self.hijos:
            try:
                os.killpg(h.pid, 9)
            except Exception:
                pass
            try:
                h.wait(timeout=5)
            except Exception:
                pass

    def lanzar(self, cmd, **kw):
        p = subprocess.Popen(cmd, start_new_session=True, **kw)
        self.hijos.append(p)
        return p

    @staticmethod
    def vivo(p):
        return p.poll() is None


class TestTopeDelNucleo(Base):
    """Regla 1 (red de seguridad): RLIMIT_FSIZE lo hereda todo el árbol, escriba como escriba."""

    def test_un_hijo_que_escribe_pasado_el_tope_es_cortado_por_el_nucleo(self):
        destino = self.dir / "enorme.bin"
        codigo = "import sys\nwith open(sys.argv[1],'wb') as f:\n    f.write(b'x'*(5*1024*1024))\n"
        p = self.lanzar(GD.envolver_con_limite([sys.executable, "-c", codigo, str(destino)], tope=1024 * 1024))
        p.wait(timeout=20)
        self.assertNotEqual(p.returncode, 0)
        self.assertLessEqual(destino.stat().st_size, 1024 * 1024)

    def test_un_nieto_en_otra_sesion_hereda_el_tope(self):
        """El que `matar_grupo` no alcanza (setsid) también queda limitado: es el caso de ALC1113A."""
        destino = self.dir / "nieto.bin"
        nieto = "import sys\nwith open(sys.argv[1],'wb') as f:\n    f.write(b'y'*(5*1024*1024))\n"
        padre = textwrap.dedent("""
            import subprocess, sys
            p = subprocess.Popen([sys.executable, "-c", sys.argv[2], sys.argv[1]], start_new_session=True)
            p.wait(); sys.exit(p.returncode)
        """)
        p = self.lanzar(GD.envolver_con_limite([sys.executable, "-c", padre, str(destino), nieto], tope=1024 * 1024))
        p.wait(timeout=20)
        self.assertLessEqual(destino.stat().st_size, 1024 * 1024)

    def test_sin_tope_la_orden_no_cambia_y_el_trabajo_normal_pasa(self):
        self.assertEqual(GD.envolver_con_limite(["a", "b"], tope=0), ["a", "b"])
        ok = self.dir / "ok.txt"
        p = self.lanzar(GD.envolver_con_limite([sys.executable, "-c", "open(%r,'w').write('hola')" % str(ok)], tope=1024 * 1024))
        self.assertEqual(p.wait(timeout=20), 0)
        self.assertEqual(ok.read_text(), "hola")

    def test_orden_de_shell_en_texto(self):
        ok = self.dir / "sh.txt"
        orden = GD.envolver_con_limite("echo hola > '%s'" % ok, tope=1024 * 1024)
        self.assertEqual(self.lanzar(orden).wait(timeout=20), 0)
        self.assertEqual(ok.read_text().strip(), "hola")


class TestVigia(Base):
    """Regla 1: el vigía corta al agente mientras el archivo crece, lo borra y deja el motivo."""

    def test_archivo_desbocado_se_corta_se_borra_y_se_anota(self):
        archivo = self.wt / "scripts" / "alcance_github_temas.py"
        archivo.parent.mkdir()
        matado = []
        p = self.lanzar([sys.executable, "-c", DESBOCADO, str(archivo)])
        with GD.VigiaArbol(str(self.wt), matar=lambda: (matado.append(1), os.killpg(p.pid, 9)), tid="ALC1113A") as v:
            p.wait(timeout=30)
        self.assertFalse(self.vivo(p), "el agente debe estar muerto")
        self.assertTrue(matado)
        self.assertIsNotNone(v.disparo)
        self.assertFalse(archivo.exists(), "el archivo desbocado no se queda en el disco")
        motivo = v.disparo["motivo"]
        self.assertIn("alcance_github_temas.py", motivo)
        self.assertIn("MB", motivo)
        self.assertIn("tope", motivo)
        # La tarea no creció mucho más allá del tope: se paró «mientras se escribe».
        self.assertLess(v.disparo["bytes"], 40 * 1024 * 1024)
        # Evidencia guardada antes de borrar y última parada anotada para Genesis.
        ev = Path(v.disparo["evidencia"])
        self.assertTrue((ev / "cabeza-200KB.bin").is_file())
        self.assertTrue((ev / "datos.json").is_file())
        est = GD.leer_estado()["ultima_parada"]
        self.assertEqual(est["tarea"], "ALC1113A")
        self.assertIn("alcance_github_temas.py", est["archivo"])

    def test_crecimiento_repartido_en_muchos_archivos(self):
        os.environ["STARSEED_DISCO_ARBOL_CRECE_MB"] = "2"
        os.environ["STARSEED_DISCO_ARCHIVO_MAX_MB"] = "50"
        codigo = textwrap.dedent("""
            import sys, time, os
            d = sys.argv[1]
            for i in range(10000):
                with open(os.path.join(d, "f%d.bin" % i), "wb") as f:
                    f.write(b"z" * 400 * 1024)
                time.sleep(0.01)
        """)
        p = self.lanzar([sys.executable, "-c", codigo, str(self.wt)])
        with GD.VigiaArbol(str(self.wt), matar=lambda: os.killpg(p.pid, 9), tid="T2") as v:
            p.wait(timeout=30)
        self.assertFalse(self.vivo(p))
        self.assertIn("creció", v.disparo["motivo"])
        self.assertIn("tope", v.disparo["motivo"])

    def test_trabajo_normal_no_dispara_y_node_modules_no_cuenta(self):
        (self.wt / "src").mkdir()
        (self.wt / "src" / "a.ts").write_text("export const a = 1\n" * 1000)
        nm = self.wt / "node_modules" / "paquete"
        nm.mkdir(parents=True)
        (nm / "grande.bin").write_bytes(b"0" * (3 * 1024 * 1024))   # legítimo y fuera del vigía
        with GD.VigiaArbol(str(self.wt), tid="T3") as v:
            time.sleep(0.4)
        self.assertIsNone(v.disparo)
        self.assertTrue((nm / "grande.bin").exists())

    def test_el_ultimo_repaso_al_salir_pilla_lo_escrito_entre_sondeos(self):
        os.environ["STARSEED_DISCO_SONDEO_S"] = "60"       # el hilo no llega a mirar
        with GD.VigiaArbol(str(self.wt), tid="T4") as v:
            (self.wt / "rapido.bin").write_bytes(b"1" * (3 * 1024 * 1024))
        self.assertIsNotNone(v.disparo)
        self.assertFalse((self.wt / "rapido.bin").exists())

    def test_ruta_permitida_por_patron_no_dispara(self):
        os.environ["STARSEED_DISCO_PERMITIDOS"] = "assets/video/*.mp4"
        (self.wt / "assets" / "video").mkdir(parents=True)
        (self.wt / "assets" / "video" / "a.mp4").write_bytes(b"1" * (3 * 1024 * 1024))
        with GD.VigiaArbol(str(self.wt), tid="T5") as v:
            time.sleep(0.3)
        self.assertIsNone(v.disparo)

    def test_disco_casi_lleno_corta_al_agente(self):
        p = self.lanzar([sys.executable, "-c", "import time; time.sleep(60)"])
        with GD.VigiaArbol(str(self.wt), matar=lambda: os.killpg(p.pid, 9), tid="T6",
                           libre_fn=lambda: 500 * 1024 * 1024) as v:
            p.wait(timeout=30)
        self.assertFalse(self.vivo(p))
        self.assertIn("disco bajó", v.disparo["motivo"])


class TestOrquestador(Base):
    """El orquestador de verdad: opencode() con un agente falso desbocado → DiscoDesbocado y fallo."""

    def test_opencode_falso_desbocado_levanta_disco_desbocado(self):
        wt_base = self.dir / "wt"
        falso = self.dir / "opencode-falso.py"
        falso.write_text("#!%s\n%s\nimport sys\nsys.argv = [sys.argv[0], %r]\nexec(%r)\n" % (
            sys.executable, "", str(self.wt / "enorme.py"), DESBOCADO))
        falso.chmod(0o755)
        log = self.dir / "agente.log"
        with patch.object(enjambre, "OPENCODE", str(falso)), patch.object(enjambre, "WT_BASE", str(wt_base)), \
                patch.object(enjambre, "esperar_memoria", lambda *a, **k: True), \
                patch.object(enjambre, "latir", lambda *a, **k: None), \
                patch.object(enjambre, "evento", lambda *a, **k: None), \
                patch.object(enjambre, "_sync_opencode_clave", lambda m: {}):
            with self.assertRaises(enjambre.DiscoDesbocado) as cm:
                enjambre.opencode("haz algo", "modelo/x", str(self.wt), str(log), timeout=60, tid="TAREA1")
        self.assertIn("enorme.py", str(cm.exception))
        self.assertFalse((self.wt / "enorme.py").exists())
        self.assertNotIn("TAREA1", enjambre.PROCESOS)

    def test_ejecutar_seguro_deja_la_tarea_en_fallo_con_la_razon(self):
        estados = {}
        def ejecutar_roto(t, intento=1):
            raise enjambre.DiscoDesbocado("el agente creó x.py de 1.0 GB (el tope por archivo es 200 MB)")
        with patch.object(enjambre, "ejecutar", ejecutar_roto), \
                patch.object(enjambre, "set_estado", lambda tid, **kw: estados.setdefault(tid, {}).update(kw)), \
                patch.object(enjambre, "evento", lambda *a, **k: None), \
                patch.object(enjambre, "cerrar_arriendo", lambda *a, **k: None), \
                patch.object(enjambre, "latir", lambda *a, **k: None), \
                patch.object(enjambre, "limpiar_worktree") as limpiar:
            enjambre.ejecutar_seguro({"id": "ALC1113A"})
        self.assertEqual(estados["ALC1113A"]["estado"], "fallo")
        self.assertIn("x.py", estados["ALC1113A"]["nota"])
        limpiar.assert_not_called()   # el worktree se conserva para que una persona lo mire

    def test_sh_en_worktree_corta_una_puerta_que_se_desboca(self):
        archivo = self.wt / "salida.bin"
        with patch.object(enjambre, "WT_BASE", str(self.dir / "wt")):
            rc, out = enjambre.sh([sys.executable, "-c", DESBOCADO, str(archivo)], cwd=str(self.wt), timeout=60)
        self.assertNotEqual(rc, 0)
        self.assertIn("GUARDIA DE DISCO", out)
        self.assertFalse(archivo.exists())


def _repo(base: Path) -> Path:
    r = base / "repo"
    r.mkdir()
    def g(*a):
        return subprocess.run(["git", *a], cwd=r, check=True, capture_output=True, text=True).stdout
    g("init", "-q", "-b", "main")
    g("config", "user.name", "Prueba")
    g("config", "user.email", "p@example.invalid")
    (r / "base.txt").write_text("base\n")
    (r / "dist").mkdir()
    (r / "dist" / "ya-rastreado.js").write_text("// ya estaba en HEAD\n")
    g("add", ".")
    g("commit", "-q", "-m", "base")
    return r


def _git(r, *a):
    return subprocess.run(["git", *a], cwd=r, check=True, capture_output=True, text=True).stdout


class TestCommits(Base):
    """Regla 2: ningún `git add -A` del enjambre deja pasar lo grande ni lo generado."""

    def preparar(self):
        r = _repo(self.dir)
        (r / "src").mkdir()
        (r / "src" / "bueno.py").write_text("print('hola')\n")
        (r / "src" / "grande.py").write_bytes(b"#" * (2 * 1024 * 1024))          # > 1 MB
        for d in (".next/static", ".next-test/chunks", "node_modules/x", "build/out", "src-tauri/target/debug"):
            (r / d).mkdir(parents=True)
            for i in range(30):                                                   # «los 816 artefactos»
                (r / d / ("a%d.js" % i)).write_text("x")
        (r / "dist" / "nuevo.js").write_text("// salida de build nueva\n")
        (r / "dist" / "ya-rastreado.js").write_text("// editado por la tarea\n")  # ya en HEAD: pasa
        (r / "src" / "__pycache__").mkdir()
        (r / "src" / "__pycache__" / "m.cpython-313.pyc").write_bytes(b"\0")
        return r

    def staged(self, r):
        return set(_git(r, "diff", "--cached", "--name-only").split())

    def test_filtrar_indice_refusa_grande_y_build_y_acepta_trabajo_normal(self):
        r = self.preparar()
        _git(r, "add", "-A")
        avisos = []
        refusados = GD.filtrar_indice(GD._sh_simple, str(r), avisar=avisos.append, tid="T")
        quedan = self.staged(r)
        self.assertIn("src/bueno.py", quedan)
        self.assertIn("dist/ya-rastreado.js", quedan)          # ya estaba en HEAD: no es «salida nueva»
        self.assertNotIn("src/grande.py", quedan)
        self.assertNotIn("dist/nuevo.js", quedan)
        self.assertEqual([q for q in quedan if q.startswith((".next", "node_modules", "build/", "src-tauri"))], [])
        self.assertNotIn("src/__pycache__/m.cpython-313.pyc", quedan)
        self.assertGreaterEqual(len(refusados), 150)
        self.assertTrue(avisos and "guardia de disco" in avisos[0])
        # No se borró nada: todo sigue en el disco.
        self.assertTrue((r / "src" / "grande.py").exists())
        self.assertTrue((r / ".next" / "static" / "a0.js").exists())

    def test_permitido_por_patron_pasa(self):
        r = self.preparar()
        with patch.dict(os.environ, {"STARSEED_DISCO_PERMITIDOS": "src/grande.py"}):
            _git(r, "add", "-A")
            GD.filtrar_indice(GD._sh_simple, str(r))
        self.assertIn("src/grande.py", self.staged(r))

    def test_limite_por_variable_de_entorno(self):
        r = self.preparar()
        with patch.dict(os.environ, {"STARSEED_DISCO_ARCHIVO_MAX_MB": "10"}):
            _git(r, "add", "-A")
            GD.filtrar_indice(GD._sh_simple, str(r))
        self.assertIn("src/grande.py", self.staged(r))

    def test_salvavidas_real_no_commitea_lo_grande_ni_lo_generado(self):
        r = self.preparar()
        _git(r, "checkout", "-q", "-b", "ola/TAREA1")
        with patch.object(enjambre, "ROOT", str(r)), patch.object(enjambre, "WT_BASE", str(r)), \
                patch.object(enjambre, "evento", lambda *a, **k: None):
            sha = enjambre.commit_salvavidas("TAREA1")
        self.assertTrue(sha)
        en_commit = set(_git(r, "show", "--name-only", "--format=", "HEAD").split())
        self.assertIn("src/bueno.py", en_commit)
        self.assertNotIn("src/grande.py", en_commit)
        self.assertEqual([q for q in en_commit if ".next" in q or "node_modules" in q or q.startswith("build/")], [])

    def test_foto_del_arbol_tambien_filtra(self):
        """El árbol que se manda a GitHub/A1 (`_foto_del_arbol`) pasa por el mismo filtro."""
        r = self.preparar()
        with patch.object(enjambre, "evento", lambda *a, **k: None):
            arbol, err = enjambre._foto_del_arbol(str(r), "TAREA1")
        self.assertIsNone(err)
        nombres = set(_git(r, "ls-tree", "-r", "--name-only", arbol).split())
        self.assertIn("src/bueno.py", nombres)
        self.assertNotIn("src/grande.py", nombres)

    def test_archivar_worktrees_no_archiva_lo_grande_y_sigue_sucio(self):
        sys.path.insert(0, str(AQUI.parent / "puente"))
        import archivar_worktrees as AW
        r = self.preparar()
        ok, rama = AW.archivar(str(r), "t", "2026-11-13")
        en_rama = set(_git(r, "ls-tree", "-r", "--name-only", "HEAD").split())
        self.assertIn("src/bueno.py", en_rama)
        self.assertNotIn("src/grande.py", en_rama)
        self.assertFalse(ok, "con lo grande aún sin guardar el worktree NO se da por archivado (no se poda)")

    def test_motivos_puros(self):
        self.assertIsNone(GD.motivo_de_rechazo("src/a.ts", 1000))
        self.assertIn("MB", GD.motivo_de_rechazo("src/a.bin", 5 * 1024 * 1024))
        self.assertIn("build", GD.motivo_de_rechazo(".next/x.js", 10))
        self.assertIsNone(GD.motivo_de_rechazo(".next/x.js", 10, es_nueva=False))
        self.assertTrue(GD.es_salida_de_build("src-tauri/target/release/a"))
        self.assertFalse(GD.es_salida_de_build("src/lib/build/utils.ts"))   # `build` en medio no es salida
        self.assertFalse(GD.es_salida_de_build("scripts/puente/dist.py"))


class TestFrenoDeDisco(Base):
    """Regla 3: dos umbrales, aviso una sola vez y suelta sola."""

    class Uso:
        def __init__(self, libre_gb, total_gb=228):
            self.free, self.total, self.used = int(libre_gb * 1024 ** 3), int(total_gb * 1024 ** 3), 0

    def freno(self, libre):
        caja = {"gb": libre}
        f = GD.FrenoDisco("/")
        patcher = patch.object(GD.shutil, "disk_usage", lambda ruta: self.Uso(caja["gb"]))
        patcher.start()
        self.addCleanup(patcher.stop)
        return f, caja

    def test_umbrales_y_aviso_unico(self):
        f, caja = self.freno(40)
        avisos = []
        t = [1000.0]
        def consulta():
            t[0] += 10
            return f.consultar(avisos.append, ahora=t[0])
        self.assertEqual(consulta(), "libre")
        caja["gb"] = 9
        self.assertEqual(consulta(), "sin_tareas")
        self.assertEqual(consulta(), "sin_tareas")
        self.assertEqual(len(avisos), 1, "avisa al cambiar de nivel, no en cada vuelta")
        self.assertIn("no arranca ninguna tarea nueva", avisos[0])
        caja["gb"] = 4
        self.assertEqual(consulta(), "sin_pesados")
        self.assertIn("puerta pesada", avisos[-1])
        self.assertEqual(len(avisos), 2)

    def test_se_suelta_sola_con_histeresis(self):
        f, caja = self.freno(4)
        avisos = []
        t = [1000.0]
        def consulta():
            t[0] += 10
            return f.consultar(avisos.append, ahora=t[0])
        self.assertEqual(consulta(), "sin_pesados")
        caja["gb"] = 5.2                      # por encima de 5 pero dentro del margen de 0,5
        self.assertEqual(consulta(), "sin_tareas" if 5.2 >= 5.5 else "sin_pesados")
        caja["gb"] = 5.6
        self.assertEqual(consulta(), "sin_tareas")
        caja["gb"] = 10.2                     # sobre 10 pero dentro del margen
        self.assertEqual(consulta(), "sin_tareas")
        caja["gb"] = 10.6
        self.assertEqual(consulta(), "libre")
        self.assertIn("reanuda", avisos[-1])
        self.assertFalse(f.retiene_arranques())

    def test_umbrales_por_variable_de_entorno(self):
        with patch.dict(os.environ, {"STARSEED_DISCO_LIBRE_AVISO_GB": "50", "STARSEED_DISCO_LIBRE_CRITICO_GB": "20"}):
            self.assertEqual(GD.nivel_para(40), "sin_tareas")
            self.assertEqual(GD.nivel_para(15), "sin_pesados")
            self.assertEqual(GD.nivel_para(60), "libre")

    def test_esperar_pesado_espera_y_se_reanuda_solo(self):
        f, caja = self.freno(3)
        pasos = []
        def dormir(s):
            pasos.append(s)
            if len(pasos) == 2:
                caja["gb"] = 30                # vuelve el espacio
        esperado = f.esperar_pesado(lambda t: None, dormir=dormir, cada_s=0.01)
        self.assertEqual(len(pasos), 2)
        self.assertEqual(f.nivel, "libre")
        self.assertIsNotNone(esperado)

    def test_orquestador_usa_el_freno(self):
        f, caja = self.freno(3)
        with patch.object(GD, "FRENO", f), patch.object(enjambre, "evento", lambda *a, **k: None):
            self.assertTrue(enjambre.disco_retiene_arranques())
            caja["gb"] = 40
            f._medido = 0
            self.assertFalse(enjambre.disco_retiene_arranques())
            self.assertEqual(enjambre.esperar_disco_pesado(), 0)


class TestEstadoParaGenesis(Base):
    """Regla 4: estado legible, con lo que sabe y desde cuándo."""

    def test_estado_puro(self):
        e = GD.estado("/", libre_bytes=int(7 * 1024 ** 3), total_bytes=int(228 * 1024 ** 3), ahora=0)
        self.assertEqual(e["libre_gb"], 7.0)
        self.assertEqual(e["umbral_aviso_gb"], 10)
        self.assertEqual(e["umbral_critico_gb"], 5)
        self.assertTrue(e["retiene_arranques"])
        self.assertFalse(e["retiene_pesados"])
        self.assertIn("medido", e)

    def test_el_freno_escribe_el_archivo_y_la_parada_se_conserva(self):
        GD.registrar_parada("ALC1113A", "scripts/x.py", 14378132346, 200 * 1024 * 1024, "motivo claro", "/ev")
        with patch.object(GD.shutil, "disk_usage", lambda r: TestFrenoDeDisco.Uso(8)):
            GD.FrenoDisco("/").consultar(None, ahora=5000.0)
        d = GD.leer_estado()
        self.assertTrue(d["retiene_arranques"])
        self.assertEqual(d["ultima_parada"]["tarea"], "ALC1113A")
        self.assertEqual(d["ultima_parada"]["bytes"], 14378132346)
        self.assertIsNotNone(d["retenido_desde"])
        json.dumps(d)


if __name__ == "__main__":
    unittest.main()
