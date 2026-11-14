# -*- coding: utf-8 -*-
"""Traer la nube (2026-10-05): traer lo integrado, reparar lo que quedó a medias y preguntar
antes de borrar lo que repararlo sería contraproducente."""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import traer_nube as T  # noqa: E402


def c(tipo, nuevo=True, vacio=False):
    return {"tipo": tipo, "nuevo": nuevo, "vacio": vacio}


class TidDeAsunto(unittest.TestCase):
    def test_salvavidas(self):
        self.assertEqual(T.tid_de_asunto("salvavidas · LC1004B: trabajo del agente antes de las puertas (tsc / vitest)"),
                         ("salvavidas", "LC1004B"))

    def test_ola_salta_el_titulo_sin_digitos(self):
        a = "Ola 1005H · Producción: habilidades (Temporal, MCP) · PRD1005L: herramientas MCP del director"
        self.assertEqual(T.tid_de_asunto(a), ("ola", "PRD1005L"))
        b = "Ola 1005Z · Bloqueadas: una sola sección · BLQ1005D: medidor"
        self.assertEqual(T.tid_de_asunto(b), ("ola", "BLQ1005D"))

    def test_ids_con_guion_y_olas_numericas(self):
        self.assertEqual(T.tid_de_asunto("Ola Dream 2026-10-05 · lo que encontró · DR1005-1: Acotar"), ("ola", "DR1005-1"))
        self.assertEqual(T.tid_de_asunto("345 · NE3-1: algo"), ("ola", "NE3-1"))

    def test_reparto_y_otros(self):
        self.assertEqual(T.tid_de_asunto("enjambre: reparto a la nube (GitHub Actions) · cola-nube-1.json")[0], "reparto")
        self.assertEqual(T.tid_de_asunto("SP092916 · Fallo de cupo = sin cupo, con registro"), ("otro", None))


class Decidir(unittest.TestCase):
    def test_en_main_es_superada(self):
        self.assertEqual(T.decidir("X", [c("salvavidas")], True, "fallo", "cola-a.json")[0], "superada")

    def test_decidida_por_otro_camino_es_superada(self):
        for estado in ("sustituida", "descartada", "commit"):
            accion, motivo = T.decidir("X", [c("salvavidas")], False, estado, "cola-a.json")
            self.assertEqual(accion, "superada")
            self.assertIn(estado, motivo)

    def test_commit_que_main_no_tiene_se_trae_y_no_se_archiva(self):
        # (2026-10-12) COL1012B: «commit» anotado con main a medio comprobar; su rama del A1 trae la
        # integración y el trabajo. Antes: «superada» → archivada y borrada del remoto.
        commits = [c("salvavidas"), c("ola", nuevo=False, vacio=True)]
        accion, motivo = T.decidir("COL1012B", commits, False, "commit", "cola-colmena-1012.json")
        self.assertEqual(accion, "traer")
        self.assertIn("main no la tiene", motivo)
        # Sin trabajo nuevo, o sin integración de la nube, sigue siendo superada.
        self.assertEqual(T.decidir("X", [c("salvavidas", nuevo=False), c("ola", nuevo=False, vacio=True)], False,
                                   "commit", "cola-a.json")[0], "superada")
        self.assertEqual(T.decidir("X", [c("salvavidas")], False, "sustituida", "cola-a.json")[0], "superada")

    def test_propuesta_de_suenos_espera_a_una_persona(self):
        accion, motivo = T.decidir("SP092912", [c("salvavidas")], False, "bloqueada", "cola-suenos-2026-09-29.json")
        self.assertEqual(accion, "superada")
        self.assertIn("persona", motivo)

    def test_en_la_tanda_viva_solo_es_sueno_lo_que_es_de_los_suenos(self):
        # (SUP0111O) La tanda viva de la Mac se llama cola-suenos-…: el nombre de la cola no basta.
        cola = "cola-suenos-2026-10-31.json"
        normal = {"id": "SUP0111H", "ola": "0111 · Seguimiento de la supervisión"}
        accion, motivo = T.decidir("SUP0111H", [c("salvavidas")], False, "pendiente", cola, tarea=normal)
        self.assertNotIn("sueños", motivo)
        self.assertEqual(accion, "reparar")
        for tid, t in (("SA10311", {"ola": "Sueños profundos 2026-10-31", "tipo": "analisis"}),
                       ("SP092916", {"ola": "Imaginación profunda 2026-09-29"}),
                       ("X1", {"ola": "Sueños profundos 2026-10-31"})):
            accion, motivo = T.decidir(tid, [c("salvavidas")], False, "pendiente", cola, tarea=dict(t, id=tid))
            self.assertEqual((accion, "persona" in motivo), ("superada", True), tid)
        # Fuera de una cola de los sueños, ni la ola la vuelve propuesta (como antes).
        self.assertFalse(T.es_propuesta_de_suenos("SP1", "cola-reparar-nube.json", {"ola": "Imaginación profunda"}))

    def test_integrada_en_la_nube_se_trae(self):
        # Medido: nube/37361406630, PRD1005L con su salvavidas y su commit «Ola …» (vacío).
        commits = [c("salvavidas"), c("ola", nuevo=False, vacio=True)]
        self.assertEqual(T.decidir("PRD1005L", commits, False, "pendiente", "cola-p.json")[0], "traer")

    def test_a_medias_se_repara(self):
        for estado in ("fallo_tests", "bloqueada", "pendiente", None, "sin_cambios", "rechazada"):
            self.assertEqual(T.decidir("LC1004B", [c("salvavidas")], False, estado, "cola-l.json")[0], "reparar")

    def test_no_pisa_lo_que_se_esta_haciendo(self):
        for estado in ("en_curso", "reasignada"):
            self.assertEqual(T.decidir("X", [c("salvavidas")], False, estado, "cola-a.json")[0], "esperar")

    def test_sin_nada_nuevo_es_superada(self):
        self.assertEqual(T.decidir("X", [c("salvavidas", nuevo=False)], False, "fallo", "cola-a.json")[0], "superada")


class ElegirPorTarea(unittest.TestCase):
    def test_una_sola_rama_por_tarea_la_integrada_y_la_mas_nueva(self):
        e = [
            {"rama": "nube/1/ola/LC1004B", "tid": "LC1004B", "accion": "reparar", "motivo": "", "fecha": "2026-10-04 23:57"},
            {"rama": "nube/3/ola/LC1004B", "tid": "LC1004B", "accion": "reparar", "motivo": "", "fecha": "2026-10-05 00:29"},
            {"rama": "nube/2", "tid": "PRD1005L", "accion": "reparar", "motivo": "", "fecha": "2026-10-05 05:49"},
            {"rama": "nube/4", "tid": "PRD1005L", "accion": "traer", "motivo": "", "fecha": "2026-10-05 01:00"},
            {"rama": "nube/5", "tid": "BLQ1005D", "accion": "superada", "motivo": "ya está en main", "fecha": ""},
        ]
        r = {(x["rama"], x["tid"]): x["accion"] for x in T.elegir_por_tarea(e)}
        self.assertEqual(r[("nube/3/ola/LC1004B", "LC1004B")], "reparar")
        self.assertEqual(r[("nube/1/ola/LC1004B", "LC1004B")], "superada")
        self.assertEqual(r[("nube/4", "PRD1005L")], "traer")
        self.assertEqual(r[("nube/2", "PRD1005L")], "superada")
        self.assertEqual(r[("nube/5", "BLQ1005D")], "superada")


class Sucesor(unittest.TestCase):
    def test_base_y_siguiente(self):
        self.assertEqual(T.base_de("LC1004Bc"), "LC1004B")
        self.assertEqual(T.base_de("LC1004B"), "LC1004B")
        self.assertEqual(T.siguiente_id("LC1004B", {"LC1004B"}), "LC1004Bb")
        self.assertEqual(T.siguiente_id("LC1004B", {"LC1004B", "LC1004Bb", "LC1004Bc"}), "LC1004Bd")
        self.assertEqual(T.siguiente_id("SB1004A", {"SB1004A", "SB1004Ab", "OTRA"}), "SB1004Ac")

    def test_base_de_con_sufijo_rescate_y_derivacion(self):
        # Casos del issue RESC1031D: distingue sufijo -d1/-d2b de la letra sucesora
        self.assertEqual(T.base_de("SGO1031B-d1"), "SGO1031B")
        self.assertEqual(T.base_de("RTESP1011B-d1"), "RTESP1011B")
        self.assertEqual(T.base_de("MC1013TCc-d1"), "MC1013TC")
        self.assertEqual(T.base_de("CPA1007Kb-d1b"), "CPA1007K")
        # Casos sin -d pero con letra sucesora
        self.assertEqual(T.base_de("RTESP1011Bb"), "RTESP1011B")
        self.assertEqual(T.base_de("S1010-TU-LL1c"), "S1010-TU-LL1")
        self.assertEqual(T.base_de("CAMR1005Db"), "CAMR1005D")
        # Casos sin sufijo ni sucesora
        self.assertEqual(T.base_de("PRD1005L"), "PRD1005L")
        self.assertEqual(T.base_de("MGP1010-7F3A2C"), "MGP1010-7F3A2C")
        # La sucesora va dentro de la parte derivada: se corta el -d2b y después la letra.
        self.assertEqual(T.base_de("RTESP1011Bd-d2b"), "RTESP1011B")
        # Un id que YA acaba en minúscula es la base de su sucesora, no una sucesora.
        self.assertEqual(T.base_de("S1010-EV-ORACLE-1a"), "S1010-EV-ORACLE-1a")
        # Sin id no hay cadena que cortar.
        self.assertEqual(T.base_de(""), "")
        self.assertEqual(T.base_de(None), "")
        # Casos adicionales de la rama nube/41579697472 (RESC1031D)
        self.assertEqual(T.base_de("MC1013TCc"), "MC1013TC")
        self.assertEqual(T.base_de("X-d1"), "X")
        self.assertEqual(T.base_de("Xb-d2b"), "X")
        self.assertEqual(T.base_de("RTGN1010A-d3d-d3b"), "RTGN1010A-d3")
        self.assertEqual(T.base_de("RTESP1011Bd"), "RTESP1011B")
        self.assertEqual(T.base_de("RTESP1011Bd-d2c"), "RTESP1011B")
        self.assertEqual(T.base_de("MC1013TC"), "MC1013TC")
        self.assertEqual(T.base_de("OPT1004C"), "OPT1004C")

    def test_un_id_que_ya_acababa_en_minuscula_pierde_solo_la_letra_nueva(self):
        """Un id que YA acaba en minúscula es la base de su sucesora, no una sucesora."""
        # Este test verifica que `base_de` reconoce que `S1010-EV-ORACLE-1ab` no es
        # una sucesora reconocible para `S1010-EV-ORACLE-1a` (porque la regla solo
        # corta `-dN` y no IDs que terminan en minúscula con parte derivada).
        self.assertEqual(T.base_de("S1010-EV-ORACLE-1ab"), "S1010-EV-ORACLE-1ab")

    @unittest.expectedFailure
    def test_la_derivacion_anidada_se_corta_de_una_pieza(self):
        """FALLO REAL en main: solo se quita el último tramo `-dN`; `RTGN1010A-d3d-d3b` se
        queda en `RTGN1010A-d3` (un id que no existe) en vez de volver a su raíz."""
        self.assertEqual(T.base_de("RTGN1010A-d3d-d3b"), "RTGN1010A")

    @unittest.expectedFailure
    def test_el_siguiente_de_un_derivado_sigue_su_nodo(self):
        """FALLO REAL en main: `siguiente_id` toma la base de `SGO1031B-d1` (`SGO1031B`) y crea
        `SGO1031Bb`; la parte derivada tiene su propia tanda, así que debe nacer `SGO1031B-d1b`
        (y `RTESP1011Bd-d2b` → `RTESP1011Bd-d2e`)."""
        self.assertEqual(T.siguiente_id("SGO1031B-d1", {"SGO1031B"}), "SGO1031B-d1b")
        self.assertEqual(T.siguiente_id("RTESP1011Bd-d2b",
                                        {"RTESP1011Bd-d2b", "RTESP1011Bd-d2d"}), "RTESP1011Bd-d2e")

    @unittest.expectedFailure
    def test_los_sucesores_de_un_derivado_no_se_mezclan_con_la_raiz(self):
        """FALLO REAL en main: `sucesores_en_cadena` mide con `base_de`, que borra `-d2c`;
        los hermanos derivados nunca cuentan y el tope de reparaciones no los ve."""
        self.assertEqual(T.sucesores_en_cadena("RTESP1011Bd-d2c",
                                               {"RTESP1011Bd-d2b": {}, "RTESP1011Bd-d2d": {}}),
                         ["RTESP1011Bd-d2b", "RTESP1011Bd-d2d"])

    def test_toda_la_cadena_de_una_tarea_converge_en_su_raiz(self):
        """Todos los variantes de una tarea (sucesoras y derivadas) convergen en su raíz."""
        for k in ("RTESP1011Bb", "RTESP1011Bd", "RTESP1011Bd-d1", "RTESP1011Bd-d2b", "RTESP1011Bd-d2d"):
            self.assertEqual(T.base_de(k), "RTESP1011B", k)

    def test_lo_que_no_se_puede_saber_no_se_corta(self):
        """Los IDs que no podemos saber cómo cortar (porque son indistinguibles) se dejan enteros."""
        self.assertEqual(T.base_de("MC1013TC"), "MC1013TC")
        self.assertEqual(T.base_de("OPT1004C"), "OPT1004C")
        self.assertEqual(T.base_de("S1010-EV-ORACLE-1a"), "S1010-EV-ORACLE-1a")
        self.assertEqual(T.base_de("S1010-EV-ORACLE-1ab"), "S1010-EV-ORACLE-1ab")
        self.assertEqual(T.base_de(""), "")
        self.assertEqual(T.base_de(None), "")

    def test_tarea_reparacion_continua_desde_la_rama(self):
        original = {"id": "LC1004B", "ola": "Ola 1004L", "titulo": "Límites", "archivos": ["a.ts"],
                    "depende": ["LC1004A"], "prompt": "Haz X.", "estado": "fallo_tests", "modelo": "nim/kimi"}
        t = T.tarea_reparacion(original, "LC1004Bd", "nube/3/ola/LC1004B", ["abc123"], ["a.ts", "b.ts"], "no pasó")
        self.assertEqual(t["id"], "LC1004Bd")
        self.assertEqual(t["depende"], ["LC1004A"])
        self.assertNotIn("estado", t)
        self.assertNotIn("modelo", t)
        self.assertTrue(t["prompt"].startswith("Haz X."))
        self.assertIn("## CONTINÚA DESDE LA NUBE", t["prompt"])
        self.assertIn("git cherry-pick --no-commit abc123", t["prompt"])
        self.assertIn("refs/heads/nube/3/ola/LC1004B", t["prompt"])
        self.assertIn("PROPÓSITO", t["prompt"])
        # (20:35) LC1004Bd chocó con «add/add» y resolvió con `checkout --theirs -- .`: la
        # instrucción dice cómo combinar a mano y deja el índice limpio.
        self.assertIn("add/add", t["prompt"])
        self.assertIn("git show <sha>:<archivo>", t["prompt"])
        self.assertIn("Nunca `git checkout --theirs -- .`", t["prompt"])
        # Repararla otra vez no apila dos bloques de continuación.
        t2 = T.tarea_reparacion(t, "LC1004Be", "nube/4", ["def"], [], "otra vez")
        self.assertEqual(t2["prompt"].count("## CONTINÚA DESDE LA NUBE"), 1)

    def test_reparar_un_rescate_deja_la_salida_no_aplica(self):
        # RTOPO1011T1b/c/d: la sucesora de un rescate pedía «pruebas nuevas» aunque lo correcto era
        # NO APLICA (los casos ya estaban en main) y la cadena acababa «bloqueada».
        rescate = {"id": "RTOPO1011T1", "titulo": "Rescate de pruebas", "archivos": ["a.py", "test_a.py"],
                   "prompt": "4. Si ningún caso aporta, responde `NO APLICA: <motivo>` y para."}
        t = T.tarea_reparacion(rescate, "RTOPO1011T1b", "nube/9", ["abc123"], ["a.py", "otra_tarea.py"], "no pasó")
        cierre = t["prompt"].split("## CONTINÚA DESDE LA NUBE")[1]
        self.assertIn("`NO APLICA: <motivo>`", cierre)
        self.assertIn("no inventes trabajo", t["prompt"])
        self.assertNotIn("con pruebas nuevas para lo que arregles", t["prompt"])
        # lo demás de la continuación no cambia (traer la rama, combinar a mano, propósito)
        self.assertIn("git cherry-pick --no-commit abc123", t["prompt"])
        self.assertIn("PROPÓSITO", t["prompt"])
        # una tarea normal conserva su cierre, y no admite NO APLICA en la continuación
        normal = T.tarea_reparacion({"id": "LC1004B", "prompt": "Haz X."}, "LC1004Bb", "nube/9", ["abc"], [], "no pasó")
        self.assertIn("con pruebas nuevas para lo que arregles", normal["prompt"])
        self.assertNotIn("NO APLICA", normal["prompt"])

    def test_un_no_aplica_vuelve_a_main_para_que_cuente_como_sin_cambios(self):
        # El orquestador da «sin cambios» SOLO con `git status --porcelain` vacío Y `main..HEAD` = 0
        # (starseed-enjambre.py: con commits por delante y diff «salto a las puertas»). Y el vigilante
        # (COL1012D) commitea el cherry-pick --no-commit del paso 1 en segundos, así que `reset --hard
        # HEAD` no deshacía nada: había que volver a `main`.
        rescate = {"id": "RTOPO1011T1", "archivos": ["a.py", "test_a.py"], "prompt": "Rescata."}
        t = T.tarea_reparacion(rescate, "RTOPO1011T1b", "nube/9", ["abc123"], ["a.py", "otra_tarea.py"], "no pasó")
        cierre = t["prompt"].split("## CONTINÚA DESDE LA NUBE")[1]
        self.assertIn("`git reset -q --hard main`", cierre)
        self.assertIn("`git status --porcelain`", cierre)
        self.assertIn("`git rev-list --count main..HEAD`", cierre)
        self.assertIn("da 0", cierre)
        # el literal erróneo (el que no quita los puntos de control) ya no es la orden: solo se nombra para
        # decir que no basta
        self.assertNotIn("`git reset -q --hard HEAD`", cierre)
        self.assertIn("`reset --hard HEAD` no basta", cierre)
        # la orden de deshacer va ANTES de decir NO APLICA y el paso 1 que la hace necesaria sigue ahí
        self.assertIn("ANTES de responderlo", cierre)
        self.assertLess(cierre.index("git cherry-pick --no-commit"), cierre.index("git reset -q --hard main"))
        self.assertLess(cierre.index("git reset -q --hard main"), cierre.index("git rev-list --count main..HEAD"))
        # solo se queda con los archivos propios de la tarea (no los de otra que trajo el cherry-pick)
        self.assertIn("(a.py, test_a.py)", cierre)
        self.assertIn("devuélvelos a como estaban en main", cierre)
        # los archivos ajenos que ya existían vuelven a la versión de MAIN, no a la de HEAD (que tras el
        # punto de control ya lleva la de la nube)
        self.assertIn("`git checkout main -- <ruta>`", cierre)
        self.assertNotIn("git checkout HEAD -- <ruta>", cierre)
        # una tarea normal no recibe nada de esto
        normal = T.tarea_reparacion({"id": "LC1004B", "archivos": ["x.py"], "prompt": "Haz X."},
                                    "LC1004Bb", "nube/9", ["abc"], [], "no pasó")
        for texto in ("git reset -q --hard", "git status --porcelain", "git rev-list --count", "ANTES de responderlo"):
            self.assertNotIn(texto, normal["prompt"])

    @unittest.skipUnless(shutil.which("git"), "hace falta git")
    def test_la_receta_del_cierre_deja_la_rama_en_main_con_git_real(self):
        # Reproduce lo que pasa de verdad: el paso 1 deja el trabajo de la nube preparado
        # (`cherry-pick --no-commit`), el vigilante lo commitea como punto de control y entonces
        # `reset --hard HEAD` NO deja la rama como main (porcelain vacío, pero `main..HEAD` = 1), mientras
        # que la receta del cierre (`reset --hard main`) sí: porcelain vacío Y `main..HEAD` = 0.
        def git(cwd, *a):
            r = subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false",
                                "-c", "init.defaultBranch=main", *a], cwd=cwd, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            return r.stdout.strip()

        def escenario():
            d = tempfile.mkdtemp()
            self.addCleanup(shutil.rmtree, d, True)
            git(d, "init", "-q")
            for nombre in ("a.py", "otra.py"):
                with open(os.path.join(d, nombre), "w") as f:
                    f.write("main\n")
            git(d, "add", "-A")
            git(d, "commit", "-qm", "main")
            git(d, "checkout", "-qb", "nube")
            with open(os.path.join(d, "a.py"), "w") as f:
                f.write("nube\n")
            with open(os.path.join(d, "otra.py"), "w") as f:
                f.write("nube\n")
            with open(os.path.join(d, "nuevo.py"), "w") as f:
                f.write("nube\n")
            git(d, "add", "-A")
            git(d, "commit", "-qm", "trabajo de la nube")
            sha = git(d, "rev-parse", "HEAD")
            git(d, "checkout", "-qb", "ola/RT1", "main")
            git(d, "cherry-pick", "--no-commit", sha)                       # paso 1
            git(d, "add", "-A")                                             # punto de control (COL1012D)
            git(d, "commit", "-qm", "salvavidas")
            self.assertEqual(git(d, "rev-list", "--count", "main..HEAD"), "1")
            return d

        # lo que decía el cierre antes: no deshace el commit del punto de control
        d = escenario()
        git(d, "reset", "-q", "--hard", "HEAD")
        self.assertEqual(git(d, "status", "--porcelain"), "")
        self.assertEqual(git(d, "rev-list", "--count", "main..HEAD"), "1")
        # la receta de ahora
        d = escenario()
        git(d, "reset", "-q", "--hard", "main")
        self.assertEqual(git(d, "status", "--porcelain"), "")
        self.assertEqual(git(d, "rev-list", "--count", "main..HEAD"), "0")
        self.assertFalse(os.path.exists(os.path.join(d, "nuevo.py")))
        # y el otro camino: quedarse con una sola tarea, devolviendo los ajenos a MAIN (no a HEAD)
        d = escenario()
        git(d, "rm", "-rqf", "--ignore-unmatch", "--", "nuevo.py")
        git(d, "checkout", "main", "--", "otra.py")
        with open(os.path.join(d, "otra.py")) as f:
            self.assertEqual(f.read(), "main\n")
        # el siguiente punto de control quitará de la rama lo ajeno (nuevo.py y la versión de la nube de otra.py)
        self.assertEqual(sorted(git(d, "diff", "--cached", "--name-only").splitlines()), ["nuevo.py", "otra.py"])

    def test_es_rescate_por_el_prefijo_rt(self):
        self.assertTrue(T.es_rescate("RTOPO1011T1b"))
        self.assertTrue(T.es_rescate("RTRTX1"))
        self.assertFalse(T.es_rescate("LC1004B"))
        self.assertFalse(T.es_rescate(None))


class SucesoraViva(unittest.TestCase):
    """TRN1106A: detectar si una tarea tiene sucesora viva para archivar en lugar de reparar."""

    def test_sustituida_con_nota_continua_como(self):
        progreso = {
            "VER1105Fb-d2": {"estado": "sustituida", "nota": "continúa como VER1105Fc desde la rama nube/123/ola/VER1105Fb-d2 (traer_nube)"},
            "VER1105Fc": {"estado": "commit"},
        }
        self.assertEqual(T.sucesora_viva("VER1105Fb-d2", progreso), "VER1105Fc")

    def test_sustituida_con_nota_dividida_en(self):
        progreso = {
            "TASK1": {"estado": "sustituida", "nota": "dividida en TASK1a, TASK1b"},
            "TASK1a": {"estado": "pendiente"},
        }
        self.assertEqual(T.sucesora_viva("TASK1", progreso), "TASK1a")

    def test_pendiente_pero_tiene_sucesora_en_progreso(self):
        # El estado volvió a "pendiente" pero la cadena sigue viva en progreso
        progreso = {
            "VER1105Gb-d2": {"estado": "pendiente", "nota": ""},
            "VER1105Gc": {"estado": "en_curso"},
        }
        self.assertEqual(T.sucesora_viva("VER1105Gb-d2", progreso), "VER1105Gc")

    def test_sin_sucesora_devuelve_none(self):
        progreso = {
            "LC1004B": {"estado": "fallo_tests", "nota": ""},
        }
        self.assertIsNone(T.sucesora_viva("LC1004B", progreso))

    def test_tarea_inexistente_devuelve_none(self):
        self.assertIsNone(T.sucesora_viva("NOEXISTE", {}))

    def test_commit_con_sucesora_en_progreso(self):
        progreso = {
            "PRD1005L": {"estado": "commit", "nota": ""},
            "PRD1005Lb": {"estado": "pendiente"},
        }
        self.assertEqual(T.sucesora_viva("PRD1005L", progreso), "PRD1005Lb")

    def test_integrada_con_sucesora_en_progreso(self):
        progreso = {
            "BLQ1005D": {"estado": "integrada", "nota": ""},
            "BLQ1005Db": {"estado": "en_curso"},
        }
        self.assertEqual(T.sucesora_viva("BLQ1005D", progreso), "BLQ1005Db")

    def test_rechazada_con_sucesora_en_progreso(self):
        progreso = {
            "OPS1024E": {"estado": "rechazada", "nota": ""},
            "OPS1024Eb": {"estado": "pendiente"},
        }
        self.assertEqual(T.sucesora_viva("OPS1024E", progreso), "OPS1024Eb")

    def test_sucesora_con_sufijo_d(self):
        progreso = {
            "RTESP1011B": {"estado": "sustituida", "nota": "continúa como RTESP1011B-d1"},
            "RTESP1011B-d1": {"estado": "pendiente"},
        }
        self.assertEqual(T.sucesora_viva("RTESP1011B", progreso), "RTESP1011B-d1")

    def test_toma_la_primera_sucesora_alfabeticamente(self):
        progreso = {
            "TASK1": {"estado": "sustituida", "nota": ""},
            "TASK1c": {"estado": "pendiente"},
            "TASK1b": {"estado": "en_curso"},
        }
        self.assertEqual(T.sucesora_viva("TASK1", progreso), "TASK1b")

    def test_hermanas_de_una_division_no_se_suceden(self):
        progreso = {"IMG-x-lbsb-d1": {"estado": "integrada", "nota": ""}, "IMG-x-lbsb-d2": {"estado": "fallo_tsc"}}
        self.assertIsNone(T.sucesora_viva("IMG-x-lbsb-d1", progreso))
        self.assertTrue(T.hermanas_de_division("X1-d1", "X1-d2b"))
        self.assertFalse(T.hermanas_de_division("X1-d1", "X1-d1b"))

    def test_hermanas_de_division_con_letra_de_reintento_sup1114b(self):
        # SUP1114B (14-11): RDM1113D se dividió en d1 y d2 (d2 depende de d1); d1 siguió como d1b y d1c, y la nube
        # integró d1c. traer_nube la archivó («la cadena sigue viva en RDM1113D-d2») porque no veía hermanas a
        # d1c y d2, y d2 se quedó esperando a d1c para siempre.
        self.assertTrue(T.hermanas_de_division("X1-d1c", "X1-d2"))
        self.assertTrue(T.hermanas_de_division("X1-d2b", "X1-d1"))
        self.assertTrue(T.hermanas_de_division("X1-d1c", "X1-d2b"))
        self.assertFalse(T.hermanas_de_division("X1-d1c", "X1-d1d"))
        self.assertFalse(T.hermanas_de_division("X1b", "X1-d2"))
        progreso = {
            "RDM1113D": {"estado": "sustituida", "nota": "revisor: dividida en RDM1113D-d1, RDM1113D-d2 (tarea:otro)"},
            "RDM1113D-d1": {"estado": "sustituida", "nota": "revisor: la cadena ya sigue por su sucesora RDM1113D-d1b"},
            "RDM1113D-d1b": {"estado": "sustituida", "nota": "revisor: la integró su sucesora RDM1113D-d1c"},
            "RDM1113D-d1c": {"estado": "integrada",
                             "nota": "la nube la integró en su rama nube/43582511509 (1a6c476a3 · revisión ok)"},
            "RDM1113D-d2": {"estado": "bloqueada", "nota": "dependencia no integrada: RDM1113D-d1b (sustituida)"},
        }
        self.assertIsNone(T.sucesora_viva("RDM1113D-d1c", progreso))
        # una sucesora de verdad de la misma parte sí cuenta
        con_d1d = dict(progreso, **{"RDM1113D-d1d": {"estado": "pendiente"}})
        self.assertEqual(T.sucesora_viva("RDM1113D-d1c", con_d1d), "RDM1113D-d1d")

    def test_sucesora_de_una_parte_si_cuenta(self):
        progreso = {"X1-d1": {"estado": "rechazada", "nota": ""}, "X1-d1b": {"estado": "pendiente"},
                    "X1-d2": {"estado": "pendiente"}}
        self.assertEqual(T.sucesora_viva("X1-d1", progreso), "X1-d1b")

    def test_no_confunde_con_tareas_sin_relacion(self):
        progreso = {
            "TASK1": {"estado": "sustituida", "nota": ""},
            "OTRA": {"estado": "pendiente"},
            "TASK2": {"estado": "en_curso"},
        }
        self.assertIsNone(T.sucesora_viva("TASK1", progreso))


class Informe(unittest.TestCase):
    def test_pregunta_antes_de_borrar(self):
        t = T.texto_informe([], [], [{"rama": "nube/1/ola/RDV8", "tid": "RDV8", "motivo": "sustituida"}], [])
        self.assertIn("¿Las borro", t)
        self.assertIn("nube/1/ola/RDV8", t)

    def test_agrupa_por_tarea_y_no_repite_esperas(self):
        sup = [{"rama": "nube/%d/ola/SP092910" % i, "tid": "SP092910", "motivo": "ya figura hecha"} for i in range(3)]
        t = T.texto_informe([{"tid": "X", "rama": "nube/9"}], [], sup,
                            [{"tid": "SB1004A", "motivo": "en curso"}, {"tid": "SB1004A", "motivo": "en curso"}])
        self.assertEqual(t.count("SP092910 ·"), 1)
        self.assertIn("3 ramas", t)
        self.assertEqual(t.count("SB1004A"), 1)

    def test_nada_nuevo_nada_que_decir(self):
        self.assertEqual(T.texto_informe([], [], [], []), "")

    def test_cuenta_lo_traido_y_lo_reparado(self):
        t = T.texto_informe([{"tid": "PRD1005L", "rama": "nube/4"}],
                            [{"tid": "LC1004B", "nuevo": "LC1004Bd", "motivo": "a medias"}], [], [])
        self.assertIn("PRD1005L (nube/4)", t)
        self.assertIn("LC1004B → LC1004Bd", t)



# RON1112E: estas pruebas pasan por la puerta de la ronda de aparatos; que NUNCA lean la ronda real de ~/.starseed/produccion.
def setUpModule():
    import tempfile
    global _RON_DIR, _RON_ANTES
    _RON_DIR = tempfile.mkdtemp(prefix="ron1112e-")
    _RON_ANTES = os.environ.get("STARSEED_PRODUCCION_DIR")
    os.environ["STARSEED_PRODUCCION_DIR"] = _RON_DIR


def tearDownModule():
    import shutil
    if _RON_ANTES is None:
        os.environ.pop("STARSEED_PRODUCCION_DIR", None)
    else:
        os.environ["STARSEED_PRODUCCION_DIR"] = _RON_ANTES
    shutil.rmtree(_RON_DIR, ignore_errors=True)

if __name__ == "__main__":
    unittest.main()


class TopeDeReparaciones(unittest.TestCase):
    """(2026-10-06) RSC1006Q → Qb → Qc → Qd → Qe en doce horas: la cadena tiene tope."""

    def test_sucesores_de_la_cadena(self):
        p = {"RSC1006Q": {}, "RSC1006Qb": {}, "RSC1006Qc": {}, "RSC1006R": {}, "RSC1006Qd": {}}
        self.assertEqual(T.sucesores_en_cadena("RSC1006Qd", p), ["RSC1006Qb", "RSC1006Qc", "RSC1006Qd"])
        self.assertEqual(T.sucesores_en_cadena("RSC1006R", p), [])
        self.assertGreaterEqual(len(T.sucesores_en_cadena("RSC1006Q", p)), T.REPARACIONES_MAX)


class DuenoDeSueltos(unittest.TestCase):
    """(2026-10-12) Una rama del A1 con solo «chore(memoria): …» daba id None y traer_nube moría en
    cada pasada (74 veces): nada de la nube ni del A1 se reparaba."""

    def test_rama_por_tarea_del_a1(self):
        self.assertEqual(T.dueno_de_sueltos("nube/a1-20261012-114650-COL1012B", {}), "COL1012B")
        self.assertEqual(T.dueno_de_sueltos("nube/a1-20261011-003110-S1010-EV-ORACLE-1a", {}), "S1010-EV-ORACLE-1a")

    def test_rama_ola(self):
        self.assertEqual(T.dueno_de_sueltos("nube/123/ola/AV1011D", {}), "AV1011D")

    def test_rama_de_cola_con_tareas_y_sin_ellas(self):
        self.assertEqual(T.dueno_de_sueltos("nube/a1-20261011-220038", {"X1": []}), "X1")
        self.assertIsNone(T.dueno_de_sueltos("nube/a1-20261011-220038", {}))


def _local(texto):
    import time

    return time.mktime(time.strptime(texto, "%Y-%m-%d %H:%M:%S"))


HOY = _local("2026-10-24 12:00:00")
RAMA_CR = "nube/cr-20261024/ola/CRM1024B"


def reasignada(run=39588171249, t="2026-10-24 10:00:00", **k):
    v = {"estado": "reasignada", "medio": "nube", "nota": "movida a nube-gh (run %s) desde Genesis" % run, "t": t}
    v.update(k)
    return v


class LibreDeSuReasignacion(unittest.TestCase):
    """OPS1024E: una rama de OTRO medio no espera a un run de nube-gh que ya no lleva la tarea."""

    def test_run_de_rama(self):
        self.assertEqual(T.run_de_rama("nube/39588171249"), "39588171249")
        self.assertEqual(T.run_de_rama("nube/123/ola/X"), "123")
        self.assertIsNone(T.run_de_rama(RAMA_CR))
        self.assertIsNone(T.run_de_rama("nube/a1-20261012-114650-COL1012B"))

    def test_run_terminado_y_otro_medio_entra(self):
        motivo = T.libre_de_su_reasignacion(RAMA_CR, reasignada(), False, HOY)
        self.assertIn("39588171249", motivo)
        self.assertIn("ya terminó", motivo)

    def test_otro_medio_con_el_run_vivo_espera(self):
        self.assertIsNone(T.libre_de_su_reasignacion(RAMA_CR, reasignada(t="2026-10-21 08:00:00"), True, HOY))

    def test_la_rama_del_mismo_run_espera_como_hoy(self):
        self.assertIsNone(T.libre_de_su_reasignacion("nube/39588171249", reasignada(), False, HOY))

    def test_sin_dato_del_run_solo_pasadas_6_h(self):
        self.assertIsNone(T.libre_de_su_reasignacion(RAMA_CR, reasignada(t="2026-10-24 08:00:00"), None, HOY))
        self.assertIn("más de 6 h", T.libre_de_su_reasignacion(RAMA_CR, reasignada(t="2026-10-24 05:00:00"), None, HOY))

    def test_sin_run_en_la_nota(self):
        vieja = {"estado": "reasignada", "medio": "nube", "nota": "reasignada a la nube 20261022"}
        self.assertIn("más de 6 h", T.libre_de_su_reasignacion(RAMA_CR, vieja, None, HOY))
        self.assertIsNone(T.libre_de_su_reasignacion("nube/555", vieja, None, HOY))  # podría ser la suya
        hoy = {"estado": "reasignada", "medio": "nube", "nota": "reasignada a la nube 20261024"}
        self.assertIsNone(T.libre_de_su_reasignacion(RAMA_CR, hoy, None, HOY))

    def test_otros_medios_y_estados_no_cambian(self):
        self.assertIsNone(T.libre_de_su_reasignacion(RAMA_CR, {"estado": "reasignada", "medio": "claude-nube"}, False, HOY))
        self.assertIsNone(T.libre_de_su_reasignacion(RAMA_CR, dict(reasignada(), estado="en_curso"), False, HOY))

    def test_decidir_con_libre(self):
        commits = [c("salvavidas"), c("ola")]
        accion, motivo = T.decidir("CRM1024B", commits, False, "reasignada", "cola-cr.json", libre="ya terminó")
        self.assertEqual(accion, "traer")
        self.assertIn("ya terminó", motivo)
        self.assertEqual(T.decidir("X", [c("salvavidas")], False, "reasignada", "c.json", libre="m")[0], "reparar")
        # `libre` solo vale para «reasignada»: lo que la Mac escribe ahora sigue esperando.
        self.assertEqual(T.decidir("X", commits, False, "en_curso", "c.json", libre="m")[0], "esperar")


class RevisarConReasignadas(unittest.TestCase):
    """OPS1024E: `revisar` (sin aplicar) con el inventario, el progreso y la API de GitHub simulados."""

    def setUp(self):
        from unittest import mock

        self.dir = tempfile.mkdtemp()
        self.preguntados = []
        self.estados = {}
        self.progreso = {}
        self.filas = []
        self.p = [
            mock.patch.object(T, "ESTADO", os.path.join(self.dir, "traer.json")),
            mock.patch.object(T, "inventario", side_effect=lambda: [dict(f) for f in self.filas]),
            mock.patch.object(T, "_progreso", side_effect=lambda: self.progreso),
            mock.patch.object(T, "_colas_por_id", return_value={}),
            mock.patch.object(T, "_git", return_value=(0, "")),
            mock.patch.object(T.VR, "estado_del_run", side_effect=self._api),
            mock.patch.object(T.time, "time", return_value=HOY),
        ]
        for x in self.p:
            x.start()

    def tearDown(self):
        for x in self.p:
            x.stop()
        shutil.rmtree(self.dir, ignore_errors=True)

    def _api(self, run, raiz):
        self.preguntados.append(run)
        return self.estados.get(run)

    def _plan(self, tid, rama, run_estado, entrada=None):
        self.filas = [{"rama": rama, "tid": tid, "commits": [c("salvavidas"), c("ola")], "fecha": "2026-10-24"}]
        self.progreso = {tid: entrada or reasignada()}
        self.estados = {"39588171249": run_estado}
        return {p["tid"]: p["accion"] for p in T.revisar(aplicar=False)["plan"]}

    def test_run_terminado_la_rama_de_cloudroom_entra(self):
        self.assertEqual(self._plan("CRM1024B", RAMA_CR, "completed"), {"CRM1024B": "traer"})
        self.assertEqual(self.preguntados, ["39588171249"])

    def test_run_vivo_espera(self):
        self.assertEqual(self._plan("CRM1024C", RAMA_CR, "in_progress"), {"CRM1024C": "esperar"})

    def test_sin_dato_y_reciente_espera(self):
        self.assertEqual(self._plan("CRM1024D", RAMA_CR, None), {"CRM1024D": "esperar"})

    def test_la_rama_del_mismo_run_espera_sin_preguntar(self):
        self.assertEqual(self._plan("VZF1015Q", "nube/39588171249", "completed"), {"VZF1015Q": "esperar"})
        self.assertEqual(self.preguntados, [])

    def test_sustituida_con_sucesora_se_archiva_sin_reparar(self):
        # Rama de tarea sustituida con sucesora en progreso → archivar, no reparar
        self.progreso = {
            "VER1105Fb-d2": {"estado": "sustituida", "nota": "continúa como VER1105Fc"},
            "VER1105Fc": {"estado": "commit"},
        }
        self.filas = [{"rama": "nube/123/ola/VER1105Fb-d2", "tid": "VER1105Fb-d2",
                       "commits": [c("salvavidas"), c("ola")], "fecha": "2026-10-24"}]
        self.estados = {}
        plan = {p["tid"]: p["accion"] for p in T.revisar(aplicar=False)["plan"]}
        self.assertEqual(plan.get("VER1105Fb-d2"), "superada")

    def test_pendiente_sin_sucesora_se_repara_como_siempre(self):
        # Rama de tarea pendiente sin sucesora → reparar como siempre
        self.progreso = {
            "LC1004B": {"estado": "fallo_tests", "nota": ""},
        }
        self.filas = [{"rama": "nube/123/ola/LC1004B", "tid": "LC1004B",
                       "commits": [c("salvavidas")], "fecha": "2026-10-24"}]
        self.estados = {}
        plan = {p["tid"]: p["accion"] for p in T.revisar(aplicar=False)["plan"]}
        self.assertEqual(plan.get("LC1004B"), "reparar")

    def test_pendiente_con_sucesora_en_progreso_se_archiva(self):
        # Estado volvió a pendiente pero tiene sucesora en progreso → archivar
        self.progreso = {
            "VER1105Gb-d2": {"estado": "pendiente", "nota": ""},
            "VER1105Gc": {"estado": "en_curso"},
        }
        self.filas = [{"rama": "nube/123/ola/VER1105Gb-d2", "tid": "VER1105Gb-d2",
                       "commits": [c("salvavidas"), c("ola")], "fecha": "2026-10-24"}]
        self.estados = {}
        plan = {p["tid"]: p["accion"] for p in T.revisar(aplicar=False)["plan"]}
        self.assertEqual(plan.get("VER1105Gb-d2"), "superada")

    def test_commit_con_sucesora_en_progreso_se_archiva(self):
        # Tarea en commit con sucesora → archivar
        self.progreso = {
            "PRD1005L": {"estado": "commit", "nota": ""},
            "PRD1005Lb": {"estado": "pendiente"},
        }
        self.filas = [{"rama": "nube/123/ola/PRD1005L", "tid": "PRD1005L",
                       "commits": [c("salvavidas"), c("ola")], "fecha": "2026-10-24"}]
        self.estados = {}
        plan = {p["tid"]: p["accion"] for p in T.revisar(aplicar=False)["plan"]}
        self.assertEqual(plan.get("PRD1005L"), "superada")
