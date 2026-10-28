#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import io
import json
import os
import sys
import tarfile
import tempfile
import unittest

sys.path.append(os.path.join(os.path.dirname(__file__)))
import espejo_estado
from espejo_estado import empaquetar, que_copiar

AHORA = 1_800_000_000.0
RECIENTE = AHORA - 3600  # hace una hora
VIEJO = AHORA - 30 * 24 * 3600  # hace un mes


class PruebasSeleccion(unittest.TestCase):
    """qué_copiar: contrato de qué sale de la Mac hacia el espejo."""

    def pares(self, *nombres, mtime=RECIENTE):
        return [(n, mtime) for n in nombres]

    def test_siempre_viajan_los_cuatro_fijos(self):
        sel = que_copiar(self.pares("progreso.json", "progreso.md", "medios.json",
                                    "puntos-control.json", mtime=VIEJO), AHORA)
        self.assertEqual(sel, ["medios.json", "progreso.json", "progreso.md", "puntos-control.json"])

    def test_cola_reciente_viaja_y_cola_vieja_no(self):
        sel = que_copiar(self.pares("cola-viva.json") + [("cola-muerta.json", VIEJO)], AHORA)
        self.assertEqual(sel, ["cola-viva.json"])

    def test_logs_viajan_siempre(self):
        sel = que_copiar(self.pares("ola-1012C.jsonl", "orquestador.log", mtime=VIEJO), AHORA)
        self.assertEqual(sel, ["ola-1012C.jsonl", "orquestador.log"])

    def test_descarta_secretos_y_rutas_raras(self):
        sel = que_copiar(self.pares("cola-x.json", ".env", "env.local", "claves.json",
                                    "../fuera.json", "/absoluto.json", "cola-.git.json"), AHORA)
        self.assertEqual(sel, ["cola-x.json"])

    def test_cola_justo_en_el_corte_viaja(self):
        sel = que_copiar([("cola-borde.json", AHORA - espejo_estado.COLA_VENTANA_S)], AHORA)
        self.assertEqual(sel, ["cola-borde.json"])

<<<<<<< HEAD
    def test_viajan_todas_las_colas_recientes_y_el_log_txt(self):
        """Rescatado de rama nube (RTCOL1012I): la selección no depende del nombre de la cola
        (una «antigua» tocada hace una hora viaja) y un ``log.txt`` también es un log."""
        listado = self.pares(
            "progreso.json", "progreso.md", "medios.json", "puntos-control.json",
            "cola-1.json", "cola-2.json", "cola-antigua.json",
            "evento1.jsonl", "evento2.jsonl", "log.txt",
        )
        self.assertEqual(que_copiar(listado, AHORA), sorted(n for n, _ in listado))
=======
    def test_que_copiar_selecciona_correctamente(self):
        listado = [
            ("progreso.json", VIEJO),
            ("progreso.md", VIEJO),
            ("medios.json", VIEJO),
            ("puntos-control.json", VIEJO),
            ("cola-1.json", VIEJO),
            ("cola-2.json", VIEJO),
            ("cola-antigua.json", VIEJO),
            ("evento1.jsonl", VIEJO),
            ("evento2.jsonl", VIEJO),
            ("log.txt", VIEJO),
        ]
        ahora = AHORA
        seleccion = que_copiar(listado, ahora)
        esperados = {
            "progreso.json",
            "progreso.md",
            "medios.json",
            "puntos-control.json",
            "evento1.jsonl",
            "evento2.jsonl",
            "log.txt",
        }
        self.assertEqual(set(seleccion), esperados)


>>>>>>> f9dad3392 (salvavidas · RTRTS1010-TU-LL1cobjbb: trabajo del agente antes de las puertas (tsc / vitest))


class PruebasEmpaquetar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.olas = self.tmp.name
        for nombre, lineas in (("progreso.json", 1), ("cola-a.json", 1), ("ola-x.jsonl", 300)):
            with open(os.path.join(self.olas, nombre), "w", encoding="utf-8") as f:
                if nombre.endswith(".json"):
                    json.dump({"prueba": nombre}, f)
                else:
                    f.write(("línea de %s\n" % nombre) * lineas)

    def tearDown(self):
        self.tmp.cleanup()



    def _tar(self, seleccion):
        with tempfile.TemporaryDirectory() as salida:
            ruta = empaquetar(seleccion, self.olas, salida)
            self.assertLessEqual(os.path.getsize(ruta), espejo_estado.TOPE_BYTES)
            with open(ruta, "rb") as f:
                contenido = io.BytesIO(f.read())
        return tarfile.open(fileobj=contenido, mode="r:gz")

    def test_archivos_en_la_raiz_del_tar_y_logs_recortados(self):
        with self._tar(["progreso.json", "cola-a.json", "ola-x.jsonl"]) as tar:
            self.assertEqual(sorted(tar.getnames()), ["cola-a.json", "ola-x.jsonl", "progreso.json"])
            self.assertEqual(tar.extractfile("ola-x.jsonl").read().decode().count("\n"),
                             espejo_estado.LOG_LINEAS)
            self.assertIn(b"prueba", tar.extractfile("progreso.json").read())

    def test_log_txt_y_corte_exacto_se_extraen_enteros_en_disco(self):
        """Rescatado de rama nube (RTRTRTS1010-EV-ORACLE-1abc): un log reconocido por
        nombre con extensión ``.txt`` se trata igual que ``.log``, y un log con justo
        ``LOG_LINEAS`` líneas no pierde ninguna; el paquete se extrae en disco con los
        archivos en su raíz (no en un subdirectorio)."""
        corte = espejo_estado.LOG_LINEAS
        with open(os.path.join(self.olas, "log.txt"), "w", encoding="utf-8") as f:
            f.write("\n".join("Log line %d" % i for i in range(corte)))  # sin salto final
        with open(os.path.join(self.olas, "evento1.jsonl"), "w", encoding="utf-8") as f:
            f.write("".join(json.dumps({"evento": i}) + "\n" for i in range(corte + 50)))
        with open(os.path.join(self.olas, "progreso.md"), "w", encoding="utf-8") as f:
            f.write("\n".join("Línea %d" % i for i in range(300)))
        seleccion = ["evento1.jsonl", "log.txt", "progreso.json", "progreso.md"]
        with tempfile.TemporaryDirectory() as salida:
            ruta = empaquetar(seleccion, self.olas, salida)
            self.assertLessEqual(os.path.getsize(ruta), espejo_estado.TOPE_BYTES)
            extra = os.path.join(salida, "extra")
            with tarfile.open(ruta, "r:gz") as tar:
                tar.extractall(path=extra)
            self.assertEqual(sorted(os.listdir(extra)), sorted(seleccion))
            esperadas = {"evento1.jsonl": corte, "log.txt": corte,
                         "progreso.json": 1, "progreso.md": 300}
            for nombre, esperada in esperadas.items():
                with open(os.path.join(extra, nombre), "r", encoding="utf-8") as f:
                    lineas = f.read().splitlines()
                self.assertEqual(len(lineas), esperada, nombre)
            with open(os.path.join(extra, "log.txt"), "r", encoding="utf-8") as f:
                self.assertEqual(f.read().splitlines()[-1], "Log line %d" % (corte - 1))

    def test_solo_los_logs_se_recortan_y_conservan_las_ultimas_lineas(self):
        """Rescatado de rama nube (GN1010A-d3c): el estado en Markdown viaja ENTERO aunque sea largo;
        un log por nombre (no solo ``*.jsonl``) se recorta, y se queda con lo más reciente, no con el principio."""
        largo = espejo_estado.LOG_LINEAS + 100
        with open(os.path.join(self.olas, "progreso.md"), "w", encoding="utf-8") as f:
            f.write("".join("Línea %d\n" % i for i in range(largo)))
        with open(os.path.join(self.olas, "orquestador.log"), "w", encoding="utf-8") as f:
            f.write("\n".join("registro %d" % i for i in range(largo)))  # sin salto al final
        with self._tar(["orquestador.log", "progreso.md"]) as tar:
            md = tar.extractfile("progreso.md").read().decode("utf-8").splitlines()
            self.assertEqual(len(md), largo)
            self.assertEqual(md[0], "Línea 0")
            log = tar.extractfile("orquestador.log").read().decode("utf-8").splitlines()
            self.assertEqual(len(log), espejo_estado.LOG_LINEAS)
            self.assertEqual(log[0], "registro %d" % (largo - espejo_estado.LOG_LINEAS))
            self.assertEqual(log[-1], "registro %d" % (largo - 1))


class PruebasEnviarEstado(unittest.TestCase):
    """enviar_estado con ssh falso: freno de 5 min, huella y orden de extracción atómica."""

    def setUp(self):
        import oracle_nodo
        self.on = oracle_nodo
        self.tmp = tempfile.TemporaryDirectory()
        self.olas = os.path.join(self.tmp.name, "olas")
        os.makedirs(self.olas)
        with open(os.path.join(self.olas, "progreso.json"), "w", encoding="utf-8") as f:
            json.dump({"ola": "1012C"}, f)
        self.on.OLAS = self.olas
        self.on.ESPEJO_HASH = os.path.join(self.tmp.name, "h")
        self.on.ESPEJO_TIEMPO_ULTIMO = os.path.join(self.tmp.name, "t")
        self.on.ESPEJO_DIR_A1 = "/espejo/falso"
        self.llamadas = []
        self.on._ssh_bytes = lambda orden, datos, timeout=0: (self.llamadas.append((orden, datos)), (0, ""))[1]

    def tearDown(self):
        self.tmp.cleanup()

    def test_envia_una_vez_y_luego_frena_por_huella_y_por_tiempo(self):
        r1 = self.on.enviar_estado(ahora=1000.0)
        self.assertTrue(r1["ok"] and "archivos" in r1, r1)
        self.assertEqual(len(self.llamadas), 1)
        # Misma huella: no reenvía aunque pasen los 5 min
        r2 = self.on.enviar_estado(ahora=1000.0 + self.on.ESPEJO_INTERVALO_S + 1)
        self.assertTrue(r2["ok"] and len(self.llamadas) == 1, r2)
        # Huella distinta: sí reenvía
        with open(os.path.join(self.olas, "progreso.json"), "w", encoding="utf-8") as f:
            json.dump({"ola": "1012D"}, f)
        r3 = self.on.enviar_estado(ahora=1000.0 + 2 * (self.on.ESPEJO_INTERVALO_S + 1))
        self.assertTrue(r3["ok"] and len(self.llamadas) == 2, r3)

    def test_freno_de_tiempo(self):
        self.on.enviar_estado(ahora=1000.0)
        with open(os.path.join(self.olas, "progreso.json"), "w", encoding="utf-8") as f:
            json.dump({"ola": "otra"}, f)
        r = self.on.enviar_estado(ahora=1000.0 + 60)
        self.assertTrue(r["ok"] and "no" in r and len(self.llamadas) == 1, r)

    def test_orden_remota_atomica_y_tar_valido(self):
        self.on.enviar_estado(ahora=1000.0)
        orden, datos = self.llamadas[0]
        # Extracción en carpeta nueva y cambio por rename, nunca encima de la viva
        self.assertIn(".nuevo", orden)
        self.assertIn("mv", orden)
        self.assertIn("tar xzf", orden)
        # Sin marcas de máquina: el comando solo conoce la ruta de destino
        self.assertNotIn("@", orden)
        with tarfile.open(fileobj=io.BytesIO(datos), mode="r:gz") as tar:
            self.assertEqual(tar.getnames(), ["progreso.json"])


if __name__ == "__main__":
    unittest.main()
