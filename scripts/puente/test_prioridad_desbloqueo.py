#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AUT1116B · prioridad_desbloqueo (puro y con medios falsos) y el freno de restricciones recreadas (FRN01). Nada real."""
import json
import os
import re
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autopublicar as AP  # noqa: E402
import prioridad_desbloqueo as PD  # noqa: E402

SHA = "0123456789abcdef0123456789abcdef01234567"
T0 = 1_794_900_000.0

KOTLIN = (
    "2026-11-16T01:00:12.1234567Z \x1b[31me: file:///home/runner/work/starseed-system/starseed-system/native/src-tauri/gen/"
    "android/app/src/main/java/app/starseed/os/ProyeccionPantallaStarSeed.kt:189:14 Only safe (?.) or non-null asserted "
    "(!!.) calls are allowed on a nullable receiver of type 'MediaProjection?'\x1b[0m\n"
    "2026-11-16T01:00:12.2Z \n"
    "2026-11-16T01:00:13.0Z FAILURE: Build failed with an exception.\n"
    "2026-11-16T01:00:13.1Z * What went wrong:\n"
    "2026-11-16T01:00:13.2Z Execution failed for task ':app:compileUniversalReleaseKotlin'.\n"
    "2026-11-16T01:00:14.0Z > Task :app:compileUniversalReleaseKotlin FAILED\n")

KOTLIN_REAL = (
    "os\tandroid\t2026-11-16T01:00:12.1234567Z\te: file:///home/runner/work/starseed-system/starseed-system/native/src-tauri/gen/"
    "android/app/src/main/java/app/starseed/os/nativa/ProyeccionPantallaStarSeed.kt:189:14 Only safe (?.) or non-null asserted "
    "(!!.) calls are allowed on a nullable receiver of type 'MediaProjection?'.\n"
    "os\tandroid\t2026-11-16T01:00:13.0Z\tFAILURE: Build failed with an exception.\n"
    "os\tandroid\t2026-11-16T01:00:13.1Z\t* What went wrong:\n"
    "os\tandroid\t2026-11-16T01:00:13.2Z\tExecution failed for task ':app:compileUniversalReleaseKotlin'.\n"
    "os\tandroid\t2026-11-16T01:00:14.0Z\t> Task :app:compileUniversalReleaseKotlin FAILED\n")
RUST = (
    "   Compiling app v0.1.0\n"
    "error[E0599]: no method named `abrir_puente` found for struct `Ventana` in the current scope\n"
    "   --> src/lib.rs:88:14\n"
    "    |\n"
    "88  |     ventana.abrir_puente();\n"
    "error: could not compile `app` (lib) due to 1 previous error\n")


def fallo(run=777, numero=47, sha=SHA):
    return {"en_curso": {"estado": "fallo", "numero": numero, "sha": sha, "run_id": run,
                         "fallo": {"job": "os · android", "paso": "Compilar"}}}


def bloqueo(seguidas=2, detalle="CI en rojo · espero a que llegue un commit nuevo", texto="FAIL src/x.test.ts > a: b\nsrc/x.ts:3", sha=SHA):
    return {"fase": "bloqueado", "detalle": detalle, "sha": sha, "seguidas": seguidas,
            "evidencia": {"sha": sha, "motivo": "CI en rojo", "texto": texto}}


class Parser(unittest.TestCase):
    def test_kotlin_real(self):
        l = PD.errores_de_compilacion(KOTLIN)
        self.assertTrue(l[0].startswith("e: file:///"))
        self.assertIn("ProyeccionPantallaStarSeed.kt:189:14", l[0])
        self.assertNotIn("\x1b", l[0])
        self.assertNotIn("2026-11-16", l[0])
        self.assertTrue(any("What went wrong" in x for x in l))
        self.assertTrue(any("compileUniversalReleaseKotlin" in x for x in l))

    def test_kotlin_real_con_prefijo_github(self):
        l = PD.errores_de_compilacion(KOTLIN_REAL)
        self.assertTrue(l[0].startswith("e: file:///"))
        self.assertIn("ProyeccionPantallaStarSeed.kt:189:14", l[0])
        self.assertNotIn("\x1b", l[0])
        self.assertNotIn("os\tandroid", l[0])
        self.assertNotIn("2026-11-16", l[0])
        self.assertTrue(any("What went wrong" in x for x in l))
        self.assertTrue(any("compileUniversalReleaseKotlin" in x for x in l))
        ruta, linea = PD.archivo_de_evidencia(PD.limpiar_evidencia("\n".join(l)))
        self.assertEqual((ruta.rsplit("/", 1)[-1], linea), ("ProyeccionPantallaStarSeed.kt", 189))

    def test_rust_con_su_linea(self):
        l = PD.errores_de_compilacion(RUST)
        self.assertEqual(l[0][:16], "error[E0599]: no")
        self.assertEqual(l[1].strip(), "--> src/lib.rs:88:14")
        self.assertTrue(any("could not compile" in x for x in l))

    def test_sin_errores_y_tope(self):
        self.assertEqual(PD.errores_de_compilacion("todo bien\nlisto"), [])
        self.assertEqual(PD.errores_de_compilacion(None), [])
        muchos = "\n".join("e: a.kt:%d:1 error %d" % (i, i) for i in range(30))
        self.assertEqual(len(PD.errores_de_compilacion(muchos)), 8)

    def test_archivo_y_resolucion(self):
        ruta, linea = PD.archivo_de_evidencia(PD.limpiar_evidencia("\n".join(PD.errores_de_compilacion(KOTLIN))))
        self.assertEqual((ruta.rsplit("/", 1)[-1], linea), ("ProyeccionPantallaStarSeed.kt", 189))
        self.assertTrue(ruta.startswith("native/src-tauri/gen/android/"))   # sin el prefijo del runner
        repo = ["native/src-tauri/android/ProyeccionPantallaStarSeed.kt", "src/otro.ts"]
        self.assertEqual(PD.resolver_en_repo(ruta, repo), repo[0])
        self.assertEqual(PD.archivo_de_evidencia("error[E0599]: x\n --> src/lib.rs:88:14"), ("src/lib.rs", 88))
        self.assertEqual(PD.resolver_en_repo("src/lib.rs", ["native/src-tauri/src/lib.rs"]), "native/src-tauri/src/lib.rs")
        self.assertEqual(PD.archivo_de_evidencia("nada que ver"), (None, None))


class Limpieza(unittest.TestCase):
    def test_tope_ansi_y_claves(self):
        crudo = "\x1b[31mfallo\x1b[0m sk-abcdefghij1234 ak_ZZZZZZZZZZ ghp_abcdefghijkl " + "a1" * 20 + " " + "x" * 3000
        t = PD.limpiar_evidencia(crudo)
        self.assertLessEqual(len(t), 1200)
        self.assertNotIn("\x1b", t)
        for malo in ("sk-abc", "ak_ZZZ", "ghp_abc", "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"):
            self.assertNotIn(malo, t)
        self.assertEqual(t.count("clave"), 4)

    def test_largo_conserva_el_final(self):
        t = PD.limpiar_evidencia("\n".join("linea %d" % i for i in range(500)) + "\nCAUSA FINAL")
        self.assertTrue(t.endswith("CAUSA FINAL"))
        self.assertLessEqual(len(t), 1200)


class Motivo(unittest.TestCase):
    def test_compilacion(self):
        m = PD.motivo_de_bloqueo(fallo(), {}, errores=PD.errores_de_compilacion(KOTLIN))
        self.assertEqual((m["clase"], m["clave"]), ("compilacion", "compilacion-012345678"))
        self.assertIn("47", m["resumen"])
        self.assertIn("MediaProjection", m["evidencia"])
        self.assertLessEqual(len(m["evidencia"]), 1200)

    def test_compilacion_sin_run_o_de_lanzamiento_no(self):
        self.assertEqual(PD.motivo_de_bloqueo({"en_curso": {"estado": "fallo", "sha": SHA}}, {})["evidencia"], "")   # sin run: sin log que traer
        p = fallo()
        p["en_curso"]["fallo"] = {"job": None, "paso": "la orden de lanzar no dejó ninguna compilación visible tras 10 min"}
        self.assertIsNone(PD.motivo_de_bloqueo(p, {}))
        self.assertIsNone(PD.motivo_de_bloqueo({"en_curso": {"estado": "ok", "sha": SHA, "run_id": 1}}, {}))
        self.assertIsNone(PD.motivo_de_bloqueo(None, None))

    def test_publicacion_pide_dos_pasadas(self):
        self.assertIsNone(PD.motivo_de_bloqueo({}, bloqueo(seguidas=1)))
        m = PD.motivo_de_bloqueo({}, bloqueo(seguidas=2))
        self.assertEqual((m["clase"], m["clave"]), ("publicacion", "publicacion-012345678"))
        self.assertIsNone(PD.motivo_de_bloqueo({}, dict(bloqueo(), fase="esperando")))
        self.assertIsNone(PD.motivo_de_bloqueo({}, bloqueo(texto="")))   # sin salida que citar

    def test_decisiones_sin_tarea(self):
        for detalle in ("análisis: migración destructiva en supabase/migrations/x.sql (DROP): la decide Alex",
                        "análisis: posible secreto (token) en a.ts",
                        "Vetado desde Genesis: espero un commit nuevo.",
                        "Jev frenó el lote (seguro al 97 %) · reviso de nuevo"):
            m = PD.motivo_de_bloqueo({}, bloqueo(detalle=detalle, texto=""))
            self.assertEqual(m["clase"], "decision", detalle)
            self.assertIsNone(PD.tarea_de_arreglo(m))
        # CI en rojo con una prueba que habla de «secretos» NO es una decisión
        m = PD.motivo_de_bloqueo({}, bloqueo(texto="FAIL test_escanear_secretos"))
        self.assertEqual(m["clase"], "publicacion")

    def test_compilacion_manda_sobre_publicacion(self):
        m = PD.motivo_de_bloqueo(fallo(), bloqueo())
        self.assertEqual(m["clase"], "compilacion")

    def test_seguidas(self):
        v = None
        for esperado in (1, 2, 3):
            n = PD.contar_seguidas(v, "bloqueado", "CI en rojo · espero %d" % esperado)
            self.assertEqual(n, esperado)
            v = {"detalle": PD._norm_detalle("CI en rojo · espero %d" % esperado), "n": n}
        self.assertEqual(PD.contar_seguidas(v, "bloqueado", "otra cosa"), 1)
        self.assertEqual(PD.contar_seguidas(v, "publicado", "CI en rojo"), 0)


def valida(cola):
    """El mismo contrato que `validarCola` (src/lib/mando/colas.ts)."""
    assert isinstance(cola["tareas"], list) and len(cola["tareas"]) == 1
    t = cola["tareas"][0]
    assert re.match(r"^[A-Za-z][A-Za-z0-9]{0,8}$", t["id"]), t["id"]
    assert t["titulo"].strip() and 20 <= len(t["prompt"]) <= 12000
    for a in t["archivos"]:
        assert ".." not in a and not a.startswith("/") and not re.search(r"\s", a)
    assert re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", "a-desbloqueo-x")
    return t


class Tarea(unittest.TestCase):
    def test_compilacion(self):
        m = PD.motivo_de_bloqueo(fallo(), {}, errores=PD.errores_de_compilacion(KOTLIN))
        repo = ["native/src-tauri/android/ProyeccionPantallaStarSeed.kt"]
        cola = PD.tarea_de_arreglo(m, rutas_repo=repo)
        t = valida(cola)
        self.assertEqual(t, PD.tarea_de_arreglo(m, rutas_repo=repo)["tareas"][0])      # id estable
        self.assertTrue(t["titulo"].startswith("URGENTE · "))
        self.assertIs(t["urgente"], True)
        self.assertEqual(t["prioridad"], 120)
        self.assertEqual(t["archivos"], repo)
        p = t["prompt"]
        self.assertIn("MediaProjection", p)
        self.assertIn("ProyeccionPantallaStarSeed.kt", p)
        self.assertIn("línea 189", p)
        self.assertIn("más pequeña", p)
        for tabu in ("frenos", "pruebas guardia", "permisos"):
            self.assertIn(tabu, p)
        self.assertNotIn("\x1b", p)

    def test_publicacion_sin_archivo_lo_dice(self):
        m = PD.motivo_de_bloqueo({}, bloqueo(texto="FAIL algo raro sin ruta"))
        t = valida(PD.tarea_de_arreglo(m))
        self.assertEqual(t["archivos"], [])
        self.assertNotIn("prioridad", t)
        self.assertIn("no señala un archivo", t["prompt"])

    def test_ruta_peligrosa_no_entra(self):
        m = {"clase": "publicacion", "clave": "publicacion-abc", "resumen": "r", "evidencia": "e: /etc/../x.kt:1:1 mal"}
        self.assertEqual(PD.tarea_de_arreglo(m)["tareas"][0]["archivos"], [])

    def test_ya_pedida(self):
        self.assertTrue(PD.ya_pedida("compilacion-012345678", ["x.json", "cola-a-desbloqueo-compilacion-012345678.json"]))
        self.assertTrue(PD.ya_pedida("compilacion-012345678", ["olas/cola-a-desbloqueo-compilacion-012345678.json"]))
        self.assertFalse(PD.ya_pedida("compilacion-012345678", ["cola-a-desbloqueo-compilacion-999999999.json"]))
        self.assertFalse(PD.ya_pedida("compilacion-012345678", []))


class Falso(object):
    def __init__(self, prueba=None, log=KOTLIN, repo=None, falla_escritura=False):
        self.prueba, self.log, self.repo = prueba or {}, log, repo or []
        self.colas, self.avisos, self.pedidos_log, self.falla = {}, [], [], falla_escritura
        self.cambios = None

    def cambios_desde(self, sha):
        return self.cambios

    def estado_pruebas(self):
        return self.prueba

    def errores_de_run(self, run_id):
        self.pedidos_log.append(run_id)
        return PD.errores_de_compilacion(self.log)

    def nombres_colas(self):
        return list(self.colas)

    def archivos_repo(self):
        return self.repo

    def escribir_cola(self, nombre, datos):
        if self.falla:
            raise OSError("disco lleno")
        self.colas[nombre] = datos

    def avisar(self, texto, tipo):
        self.avisos.append((tipo, texto))


def est_bloqueado(**mas):
    e = {"fase": "bloqueado", "detalle": "CI en rojo · espero a que llegue un commit nuevo", "sha": SHA,
         "evidencia": {"sha": SHA, "motivo": "CI en rojo", "texto": "FAIL src/x.test.ts\nsrc/x.ts:3:1"}}
    e.update(mas)
    return e


class Pasada(unittest.TestCase):
    def test_compilacion_abre_una_vez(self):
        f = Falso(prueba=fallo(), repo=["native/src-tauri/android/ProyeccionPantallaStarSeed.kt"])
        est = PD.pasada_desbloqueo(f, {"fase": "publicado"}, T0)
        self.assertEqual(list(f.colas), ["cola-a-desbloqueo-compilacion-012345678.json"])
        t = f.colas["cola-a-desbloqueo-compilacion-012345678.json"]["tareas"][0]
        self.assertEqual(t["archivos"], ["native/src-tauri/android/ProyeccionPantallaStarSeed.kt"])
        self.assertEqual(f.pedidos_log, [777])
        self.assertEqual(est["desbloqueo"]["hechas"]["compilacion-012345678"]["accion"], "tarea abierta")
        self.assertEqual(len(f.avisos), 1)
        for _ in range(3):                                   # pasadas siguientes: ni cola, ni log, ni aviso
            est = PD.pasada_desbloqueo(f, est, T0 + 300)
        self.assertEqual((len(f.colas), f.pedidos_log, len(f.avisos)), (1, [777], 1))

    def test_no_repite_aunque_el_estado_se_pierda_si_la_cola_existe(self):
        f = Falso(prueba=fallo())
        PD.pasada_desbloqueo(f, {}, T0)
        PD.pasada_desbloqueo(f, {}, T0 + 300)                # estado vacío: lo salva el nombre de la cola
        self.assertEqual((len(f.colas), f.pedidos_log), (1, [777]))

    def test_log_sin_errores_no_abre_tarea_ni_reintenta(self):
        f = Falso(prueba=fallo(), log="todo bien")
        est = PD.pasada_desbloqueo(f, {}, T0)
        PD.pasada_desbloqueo(f, est, T0 + 300)
        self.assertEqual((f.colas, f.pedidos_log), ({}, [777]))
        self.assertEqual(est["desbloqueo"]["hechas"]["compilacion-012345678"]["accion"], "nada")

    def test_publicacion_a_la_segunda_pasada(self):
        f = Falso()
        est = PD.pasada_desbloqueo(f, est_bloqueado(), T0)
        self.assertEqual(f.colas, {})
        est = PD.pasada_desbloqueo(f, dict(est_bloqueado(), desbloqueo=est["desbloqueo"]), T0 + 300)
        self.assertEqual(list(f.colas), ["cola-a-desbloqueo-publicacion-012345678.json"])
        self.assertEqual(f.pedidos_log, [])                 # la evidencia ya viene en el estado: sin gh
        self.assertIn("tarea", est["desbloqueo"]["ultima"])

    def test_decision_solo_aviso_una_vez(self):
        f = Falso()
        e = est_bloqueado(detalle="análisis: migración destructiva en a.sql (DROP): la decide Alex", evidencia=None)
        est = PD.pasada_desbloqueo(f, e, T0)
        for i in range(4):
            est = PD.pasada_desbloqueo(f, dict(e, desbloqueo=est["desbloqueo"]), T0 + 300 * (i + 1))
        self.assertEqual(f.colas, {})
        self.assertEqual(len(f.avisos), 1)
        self.assertEqual(f.avisos[0][0], "aviso")
        self.assertIn("la decide Alex", f.avisos[0][1])
        self.assertEqual(est["desbloqueo"]["hechas"]["decision-012345678"]["accion"], "aviso a Alex")

    def test_fallo_de_escritura_se_anota_y_no_se_repite(self):
        f = Falso(prueba=fallo(), falla_escritura=True)
        est = PD.pasada_desbloqueo(f, {}, T0)
        self.assertIn("OSError", est["desbloqueo"]["error"])
        f.falla = False
        est = PD.pasada_desbloqueo(f, est, T0 + 300)
        self.assertEqual(f.colas, {})                     


class Integradas(unittest.TestCase):
    """Casos del módulo simple DSB1116A que se conservan."""

    def test_fallo_como_texto_y_sin_run(self):
        m = PD.motivo_de_bloqueo({"numero": 39, "estado": "fallo", "sha": SHA, "fallo": "scripts/puente/x.py: no compila"}, {})
        self.assertEqual(m["clase"], "compilacion")
        self.assertIn("x.py", m["evidencia"])

    def test_en_curso_directo_sin_envoltorio(self):
        m = PD.motivo_de_bloqueo({"numero": 39, "estado": "fallo", "sha": SHA, "fallo": {"job": "b", "paso": "no compila"}}, {})
        self.assertEqual(m["clave"], "compilacion-012345678")
        self.assertIn("39", m["resumen"])

    def test_ya_pedida_por_contenido_del_nombre_y_vacia(self):
        self.assertTrue(PD.ya_pedida("compilacion-012345678", ["cola-compilacion-012345678.json"]))
        self.assertFalse(PD.ya_pedida("", ["cola-x.json"]))

    def test_tarea_lleva_su_clave_y_mismo_id(self):
        m = PD.motivo_de_bloqueo({"estado": "fallo", "sha": SHA, "fallo": "e"}, {})
        a, b = PD.tarea_de_arreglo(m)["tareas"][0], PD.tarea_de_arreglo(m)["tareas"][0]
        self.assertEqual(a["id"], b["id"])
        self.assertEqual(a["clave_desbloqueo"], m["clave"])


class YaArreglado(unittest.TestCase):
    MOT = {"clase": "compilacion", "evidencia": "e: file:///home/runner/work/r/r/native/gen/android/app/ProyeccionPantallaStarSeed.kt:189:14 mal"}

    def test_cambio_del_mismo_archivo_en_main(self):
        self.assertEqual(PD.ya_arreglado(self.MOT, ["README.md", "native/src-tauri/android/ProyeccionPantallaStarSeed.kt"]),
                         "native/src-tauri/android/ProyeccionPantallaStarSeed.kt")

    def test_sin_cambio_o_sin_dato_no_salta(self):
        self.assertIsNone(PD.ya_arreglado(self.MOT, ["src/otro.ts"]))
        self.assertIsNone(PD.ya_arreglado(self.MOT, None))
        self.assertIsNone(PD.ya_arreglado(self.MOT, []))
        self.assertIsNone(PD.ya_arreglado({"evidencia": "sin ruta"}, ["a.kt"]))

    def test_pasada_salta_el_fallo_ya_arreglado(self):
        f = Falso(prueba=fallo(), repo=[])
        f.cambios = ["native/src-tauri/android/ProyeccionPantallaStarSeed.kt"]
        est = PD.pasada_desbloqueo(f, {}, T0)
        self.assertEqual(f.colas, {})
        h = est["desbloqueo"]["hechas"]["compilacion-012345678"]
        self.assertEqual(h["accion"], "nada")
        self.assertIn("ya cambió", h["porque"])
        self.assertEqual(f.avisos, [])
        PD.pasada_desbloqueo(f, est, T0 + 300)
        self.assertEqual(f.pedidos_log, [777])             # una sola consulta al log


class CompilacionSuperada(unittest.TestCase):
    """Pruebas para no abrir tarea cuando la compilación ya está superada."""

    def test_no_abre_si_hay_compilacion_mayor_publicada(self):
        prueba_con_historial = fallo()
        prueba_con_historial["builds"] = [
            {"numero": 47, "estado": "fallo", "sha": SHA},
            {"numero": 48, "estado": "publicada", "sha": "1" * 64},
        ]
        f = Falso(prueba=prueba_con_historial, repo=["native/src-tauri/android/ProyeccionPantallaStarSeed.kt"])
        est = PD.pasada_desbloqueo(f, {}, T0)
        self.assertEqual(f.colas, {})
        self.assertEqual(f.pedidos_log, [])

    def test_no_abre_si_hay_compilacion_mayor_compilando(self):
        prueba_con_historial = fallo()
        prueba_con_historial["builds"] = [
            {"numero": 47, "estado": "fallo", "sha": SHA},
            {"numero": 48, "estado": "compilando", "sha": "1" * 64},
        ]
        f = Falso(prueba=prueba_con_historial, repo=["native/src-tauri/android/ProyeccionPantallaStarSeed.kt"])
        est = PD.pasada_desbloqueo(f, {}, T0)
        self.assertEqual(f.colas, {})
        self.assertEqual(f.pedidos_log, [])

    def test_no_abre_si_hay_compilacion_mayor_en_marcha(self):
        prueba_con_historial = fallo()
        prueba_con_historial["builds"] = [
            {"numero": 47, "estado": "fallo", "sha": SHA},
            {"numero": 48, "estado": "en_marcha", "sha": "1" * 64},
        ]
        f = Falso(prueba=prueba_con_historial, repo=["native/src-tauri/android/ProyeccionPantallaStarSeed.kt"])
        est = PD.pasada_desbloqueo(f, {}, T0)
        self.assertEqual(f.colas, {})
        self.assertEqual(f.pedidos_log, [])

    def test_sí_abre_si_fallo_es_la_más_alta(self):
        prueba_con_historial = fallo()
        prueba_con_historial["builds"] = [
            {"numero": 46, "estado": "publicada", "sha": "0" * 64},
            {"numero": 47, "estado": "fallo", "sha": SHA},
        ]
        f = Falso(prueba=prueba_con_historial, repo=["native/src-tauri/android/ProyeccionPantallaStarSeed.kt"])
        est = PD.pasada_desbloqueo(f, {}, T0)
        self.assertEqual(list(f.colas), ["cola-a-desbloqueo-compilacion-012345678.json"])
        self.assertEqual(f.pedidos_log, [777])

    def test_sí_abre_si_no_hay_historial(self):
        f = Falso(prueba=fallo(), repo=["native/src-tauri/android/ProyeccionPantallaStarSeed.kt"])
        est = PD.pasada_desbloqueo(f, {}, T0)
        self.assertEqual(list(f.colas), ["cola-a-desbloqueo-compilacion-012345678.json"])
        self.assertEqual(f.pedidos_log, [777])


class MediosReales(unittest.TestCase):
    def test_escribe_atomico_sin_pisar(self):
        with tempfile.TemporaryDirectory() as d:
            olas = os.path.join(d, "olas")
            m = PD.MediosDesbloqueo(None, d, olas)
            m.escribir_cola("cola-a-desbloqueo-x.json", {"a": 1})
            m.escribir_cola("cola-a-desbloqueo-x.json", {"a": 2})
            self.assertEqual(json.load(open(os.path.join(olas, "cola-a-desbloqueo-x.json"), encoding="utf-8")), {"a": 1})
            self.assertEqual(m.nombres_colas(), ["cola-a-desbloqueo-x.json"])
            self.assertEqual(m.estado_pruebas(), {})
            with open(os.path.join(d, "pruebas-director-estado.json"), "w") as f:
                json.dump(fallo(), f)
            self.assertEqual(m.estado_pruebas()["en_curso"]["numero"], 47)


def lote(sql):
    return AP.analizar_lote("", {"supabase/migrations/20261116_x.sql": sql})


class FrenoComentarios(unittest.TestCase):
    """AUT1116B: la vuelta a poner solo cuenta si es SQL de verdad (el resto del freno: test_autopublicar_restriccion.py)."""
    DROP = "alter table public.t drop constraint t_chk;\n"
    ADD = "alter table public.t add constraint t_chk check (a > 0);\n"

    def test_vuelta_a_poner_en_comentario_no_vale(self):
        self.assertEqual(len(lote(self.DROP + "-- " + self.ADD)), 1)
        self.assertEqual(len(lote(self.DROP + "/* " + self.ADD + " */")), 1)
        self.assertEqual(len(lote(self.DROP + "/* varias\nlíneas\n" + self.ADD + "*/")), 1)

    def test_con_comentarios_alrededor_sigue_pasando(self):
        self.assertEqual(lote("-- recrea\n" + self.DROP + "/* nota */\n" + self.ADD + "-- fin"), [])

    def test_comillas_siguen_sin_perdonarse(self):
        self.assertEqual(len(lote('alter table t drop constraint "c";\nalter table t add constraint "c" check (a>0);')), 1)


if __name__ == "__main__":
    unittest.main()
