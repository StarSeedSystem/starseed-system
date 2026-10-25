import os
import unittest
from unittest.mock import patch
import time
from curacion_logica import colgados_a_matar, clasificar_arbol_sucio, debe_reintentar_ya


class TestCuracionLogica(unittest.TestCase):
    def test_colgados_a_matar(self):
        ahora = time.time()
        procesos = [
            {
                # Justo en el borde: 1800 s no SUPERA el tope, no se mata
                "pid": 5,
                "tarea": "tarea_borde",
                "inicio": ahora - 3600,
                "ultimo_byte": ahora - 1800,
            },
            {
                # Propio: nunca se mata aunque esté colgado
                "pid": 2,
                "tarea": "tarea2",
                "inicio": ahora - 3600,
                "ultimo_byte": ahora - 1801,
                "propio": True,
            },
            # ultimo_byte a 0: se cae a inicio (3600 s > 1800 s)
            {"pid": 3, "tarea": "tarea3", "inicio": ahora - 3600, "ultimo_byte": 0},
            # Claramente colgado: 1801 s superan el tope
            {
                "pid": 4,
                "tarea": "tarea4",
                "inicio": ahora - 3600,
                "ultimo_byte": ahora - 1801,
            },
            # Sin la clave ultimo_byte: también se cae a inicio
            {"pid": 6, "tarea": "tarea6", "inicio": ahora - 3600},
        ]
        self.assertEqual(colgados_a_matar(procesos, ahora, 1800), [3, 4, 6])

    def test_colgados_a_matar_nunca_pid_sistema(self):
        # Los pids 0 y 1 pertenecen al sistema: jamás se devuelven aunque
        # parezcan colgados, porque matarlos tumbaría la máquina
        ahora = time.time()
        procesos = [
            {"pid": 0, "tarea": "kernel", "inicio": ahora - 7200, "ultimo_byte": 0},
            {"pid": 1, "tarea": "init", "inicio": ahora - 7200, "ultimo_byte": 0},
            {"pid": 7, "tarea": "trabajador", "inicio": ahora - 7200, "ultimo_byte": 0},
        ]
        self.assertEqual(colgados_a_matar(procesos, ahora, 1800), [7])

    def test_clasificar_arbol_sucio(self):
        lineas_porcelain = [
            "?? scripts/puente/test_x.py.new",
            "?? src/lib/nuevo.ts",
            " M src/lib/algo.ts",
            "UU x",
            "?? .DS_Store",
        ]
        resultado = clasificar_arbol_sucio(lineas_porcelain)
        self.assertEqual(
            resultado["estorbo"], ["scripts/puente/test_x.py.new", ".DS_Store"]
        )
        self.assertEqual(
            resultado["trabajo"], ["src/lib/nuevo.ts", "src/lib/algo.ts", "x"]
        )

    def test_debe_reintentar_ya(self):
        self.assertTrue(debe_reintentar_ya("", True, 0))
        self.assertTrue(debe_reintentar_ya("fallo", False, 0))
        self.assertFalse(debe_reintentar_ya("fallo", True, 30))
        self.assertTrue(debe_reintentar_ya("fallo", True, 700))


if __name__ == "__main__":
    unittest.main()


class InformesSueltos(unittest.TestCase):
    """(2026-10-06) Un informe .md en la raíz no bloquea el arranque: va a `_apartado/`."""

    def test_colas_no_lanzadas_son_estorbo(self):
        """(2026-10-14) ~10 h sin orquestador en la Mac por dos `.no-lanzada` sin seguimiento."""
        g = clasificar_arbol_sucio(["?? enjambre/colas/cola-nube-20261013-2052.json.no-lanzada",
                                    "?? scripts/puente/otra.no-lanzada",
                                    " M enjambre/colas/cola-nube-20261006-2157.json.no-lanzada"])
        self.assertEqual(g["estorbo"], ["enjambre/colas/cola-nube-20261013-2052.json.no-lanzada"])
        self.assertEqual(g["trabajo"], ["scripts/puente/otra.no-lanzada",
                                        "enjambre/colas/cola-nube-20261006-2157.json.no-lanzada"])

    def test_informes_de_la_raiz_son_estorbo(self):
        g = clasificar_arbol_sucio(["?? informe_dream.md", "?? sugerencias-2026-10-06.md",
                                    "?? docs/informe.md", "?? notas.md", " M CLAUDE.md"])
        self.assertEqual(g["estorbo"], ["informe_dream.md", "sugerencias-2026-10-06.md"])
        self.assertEqual(g["trabajo"], ["docs/informe.md", "notas.md", "CLAUDE.md"])


class UnaSolaFuenteDeEstorbo(unittest.TestCase):
    """(2026-10-25, ENJ1025A) Un `informe_analisis.md` suelto paró el enjambre de la Mac ~29 h:
    el guardia decía «ajeno» y `desatascar` lo contaba como trabajo. Los tres sitios preguntan
    ahora a `curacion_logica.es_estorbo`."""

    LINEAS = [
        "?? informe_analisis.md",       # el caso real
        "?? informe_dream.md",
        "?? sugerencias-2026-10-06.md",
        "?? x.new", "?? sub/y.orig", "?? error.log", "?? a/b/.DS_Store", "?? borrador~",
        "?? enjambre/colas/cola-nube-1.json.no-lanzada",
        "?? docs/informe.md",           # informe pero NO en la raíz: es trabajo
        "?? notas.md", "?? src/lib/nuevo.ts", " M src/lib/algo.ts", "UU conflicto.ts",
        " M informe_analisis.md",        # CON seguimiento y modificado: jamás es estorbo
        "A  informe_nuevo.md",
        " M CLAUDE.md",
    ]
    ESTORBO = ["informe_analisis.md", "informe_dream.md", "sugerencias-2026-10-06.md", "x.new",
               "sub/y.orig", "error.log", "a/b/.DS_Store", "borrador~",
               "enjambre/colas/cola-nube-1.json.no-lanzada"]

    def test_es_estorbo_exige_sin_seguimiento(self):
        from curacion_logica import es_estorbo
        self.assertTrue(es_estorbo("??", "informe_analisis.md"))
        self.assertFalse(es_estorbo(" M", "informe_analisis.md"))
        self.assertFalse(es_estorbo("A ", "informe_nuevo.md"))
        self.assertFalse(es_estorbo("??", "docs/informe.md"))
        self.assertFalse(es_estorbo("??", ""))

    def test_clasificar_lineas_reparte_en_orden(self):
        from curacion_logica import clasificar_lineas
        estorbo, propias, trabajo = clasificar_lineas(self.LINEAS, propias=("CLAUDE.md",))
        self.assertEqual(estorbo, self.ESTORBO)
        self.assertEqual(propias, ["CLAUDE.md"])
        self.assertEqual(trabajo, ["docs/informe.md", "notas.md", "src/lib/nuevo.ts",
                                   "src/lib/algo.ts", "conflicto.ts", "informe_analisis.md",
                                   "informe_nuevo.md"])

    def test_lineas_vacias_o_ilegibles_se_ignoran(self):
        from curacion_logica import clasificar_lineas
        self.assertEqual(clasificar_lineas(["", "  ", None, "??", "M"]), ([], [], []))
        self.assertEqual(clasificar_lineas(None), ([], [], []))

    def test_rutas_con_espacios_y_renombrados(self):
        from curacion_logica import clasificar_lineas
        e, _, t = clasificar_lineas(['?? "informe de hoy.md"', '?? "mi copia.new"',
                                     "R  viejo.ts -> src/nuevo.ts"])
        self.assertEqual(e, ["informe de hoy.md", "mi copia.new"])  # con espacios y entrecomillado
        self.assertEqual(t, ["src/nuevo.ts"])  # el renombrado se queda con la ruta NUEVA

    def test_los_tres_clasificadores_coinciden(self):
        """vigilante (`clasificar_arbol_sucio`), director (`desatascar.clasificar_sucio`) y guardia
        del orquestador (`arbol_de_trabajo.clasificar`) dan el MISMO estorbo y el MISMO trabajo."""
        import arbol_de_trabajo
        import desatascar
        from curacion_logica import clasificar_arbol_sucio
        vig = clasificar_arbol_sucio(self.LINEAS)
        e_d, _p_d, t_d = desatascar.clasificar_sucio(self.LINEAS)
        _m, e_g, t_g = arbol_de_trabajo.clasificar("\n".join(self.LINEAS))
        self.assertEqual(vig["estorbo"], self.ESTORBO)
        self.assertEqual(e_d, self.ESTORBO)
        self.assertEqual(e_g, self.ESTORBO)
        # Con CLAUDE.md fuera de PROPIAS, el trabajo también es idéntico.
        self.assertEqual(vig["trabajo"], t_d)
        self.assertEqual(vig["trabajo"], t_g)


class ApartarEstorbo(unittest.TestCase):
    def setUp(self):
        import shutil
        import tempfile
        self.raiz = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.raiz, ignore_errors=True)

    def _escribe(self, ruta, texto="x"):
        destino = os.path.join(self.raiz, ruta)
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        with open(destino, "w", encoding="utf-8") as f:
            f.write(texto)

    def test_mueve_a_apartado_con_fecha_y_no_borra(self):
        from curacion_logica import apartar_estorbo
        self._escribe("informe_analisis.md", "hallazgos de ayer")
        ahora = time.mktime((2026, 10, 25, 9, 30, 0, 0, 0, -1))
        movidos = apartar_estorbo(self.raiz, ["informe_analisis.md"], ahora=ahora)
        destino = os.path.join(self.raiz, "starseed_memory_root", "olas", "_apartado",
                               "20261025", "informe_analisis.md")
        self.assertEqual(movidos, [("informe_analisis.md", destino)])
        self.assertFalse(os.path.exists(os.path.join(self.raiz, "informe_analisis.md")))
        with open(destino, encoding="utf-8") as f:
            self.assertEqual(f.read(), "hallazgos de ayer")

    def test_el_mismo_nombre_no_pisa_lo_ya_apartado(self):
        from curacion_logica import apartar_estorbo
        ahora = time.mktime((2026, 10, 25, 9, 30, 0, 0, 0, -1))
        self._escribe("informe_analisis.md", "primero")
        apartar_estorbo(self.raiz, ["informe_analisis.md"], ahora=ahora)
        self._escribe("informe_analisis.md", "segundo")
        self._escribe("sub/informe_analisis.md", "tercero")
        movidos = apartar_estorbo(self.raiz, ["informe_analisis.md", "sub/informe_analisis.md"],
                                  ahora=ahora)
        carpeta = os.path.join(self.raiz, "starseed_memory_root", "olas", "_apartado", "20261025")
        leidos = {}
        for n in sorted(os.listdir(carpeta)):
            with open(os.path.join(carpeta, n), encoding="utf-8") as f:
                leidos[n] = f.read()
        self.assertEqual(leidos, {"informe_analisis.md": "primero",
                                  "informe_analisis.md.1": "segundo",
                                  "informe_analisis.md.2": "tercero"})
        self.assertEqual(len(movidos), 2)

    def test_destino_base_propio(self):
        from curacion_logica import apartar_estorbo
        self._escribe("nota.new")
        base = os.path.join(self.raiz, "otro_apartado")
        apartar_estorbo(self.raiz, ["nota.new"], destino_base=base)
        self.assertTrue(os.path.exists(os.path.join(base, time.strftime("%Y%m%d"), "nota.new")))

    def test_no_toca_nada_fuera_de_la_raiz_ni_lo_que_no_existe(self):
        from curacion_logica import apartar_estorbo
        fuera = os.path.join(os.path.dirname(self.raiz), "ajeno-%d.new" % os.getpid())
        with open(fuera, "w", encoding="utf-8") as f:
            f.write("no es del repo")
        self.addCleanup(lambda: os.path.exists(fuera) and os.remove(fuera))
        movidos = apartar_estorbo(self.raiz, ["../" + os.path.basename(fuera), fuera,
                                              "no-existe.new", "", ".", "./"])
        self.assertEqual(movidos, [])
        self.assertTrue(os.path.exists(fuera))
        self.assertFalse(os.path.exists(os.path.join(self.raiz, "starseed_memory_root")))


class InformesAlSitio(unittest.TestCase):
    def setUp(self):
        import shutil
        import tempfile
        self.raiz = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.raiz, ignore_errors=True)

    def _escribe(self, ruta, texto="x"):
        with open(os.path.join(self.raiz, ruta), "w", encoding="utf-8") as f:
            f.write(texto)

    def test_ve_solo_los_informes_de_la_raiz(self):
        from curacion_logica import informes_en_la_raiz
        for n in ("informe_analisis.md", "informe_dream.md", "notas.md", "README.md", "x.txt"):
            self._escribe(n)
        os.makedirs(os.path.join(self.raiz, "informe_carpeta.md"))
        self.assertEqual(informes_en_la_raiz(self.raiz), {"informe_analisis.md", "informe_dream.md"})
        self.assertEqual(informes_en_la_raiz(os.path.join(self.raiz, "no-existe")), set())

    def test_los_informes_nuevos_van_a_starseed_memory_root_informes(self):
        from curacion_logica import informes_en_la_raiz, mover_informes
        self._escribe("informe_previo.md", "ya estaba")
        antes = informes_en_la_raiz(self.raiz)
        self._escribe("informe_analisis.md", "lo escribió el agente")
        ahora = time.mktime((2026, 10, 25, 9, 30, 0, 0, 0, -1))
        movidos = mover_informes(self.raiz, informes_en_la_raiz(self.raiz) - antes, ahora=ahora)
        destino = os.path.join(self.raiz, "starseed_memory_root", "informes",
                               "20261025-informe_analisis.md")
        self.assertEqual(movidos, [("informe_analisis.md", destino)])
        with open(destino, encoding="utf-8") as f:
            self.assertEqual(f.read(), "lo escribió el agente")
        # lo que ya estaba antes de la corrida no se toca
        self.assertTrue(os.path.exists(os.path.join(self.raiz, "informe_previo.md")))
        self.assertFalse(os.path.exists(os.path.join(self.raiz, "informe_analisis.md")))

    def test_dos_informes_el_mismo_dia_no_se_pisan(self):
        from curacion_logica import mover_informes
        ahora = time.mktime((2026, 10, 25, 9, 30, 0, 0, 0, -1))
        self._escribe("informe_analisis.md", "uno")
        mover_informes(self.raiz, ["informe_analisis.md"], ahora=ahora)
        self._escribe("informe_analisis.md", "dos")
        mover_informes(self.raiz, ["informe_analisis.md"], ahora=ahora)
        carpeta = os.path.join(self.raiz, "starseed_memory_root", "informes")
        self.assertEqual(sorted(os.listdir(carpeta)),
                         ["20261025-informe_analisis.md", "20261025-informe_analisis.md.1"])

    def test_rechaza_nombres_con_ruta(self):
        from curacion_logica import mover_informes
        self._escribe("informe_ok.md")
        self.assertEqual(mover_informes(self.raiz, ["../informe_ok.md", "a/b.md", ".oculto.md"]), [])
