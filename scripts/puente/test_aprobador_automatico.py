"""Pruebas de la parte que APLICA del aprobador automático (DSB1010), sin red ni git reales."""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import aprobador_automatico as A  # noqa: E402


def decision(tid, accion, estado="esperando_aprobacion", **extra):
    c = {"tid": tid, "sucesora": extra.pop("sucesora", None), "objecion": extra.pop("objecion", ""),
         "_rama": {"rama": "ola/%s" % tid, "sha": "a" * 40}, "_tarea": {"id": tid, "titulo": "T"}}
    d = {"tid": tid, "accion": accion, "estado": estado, "motivo": extra.pop("motivo", "m"), "contexto": c}
    d.update(extra)
    return d


class Aplicar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        A._configurar(self.tmp.name)
        os.makedirs(A.OLAS)
        self.addCleanup(self.tmp.cleanup)
        self.parche = mock.patch.object(A, "_cola_de", return_value="cola-prueba")
        self.parche.start()
        self.addCleanup(self.parche.stop)

    def _control(self):
        with open(os.path.join(A.OLAS, "control-cola-prueba.json"), encoding="utf-8") as f:
            return json.load(f)

    def test_rama_viva_aprobada_va_por_el_archivo_de_control_una_sola_vez(self):
        frases = A.aplicar([decision("X1", "aprobar")])
        self.assertEqual(self._control()["X1"]["accion"], "aprobar")
        self.assertEqual(self._control()["X1"]["quien"], "aprobador")
        self.assertEqual(len(frases), 1)
        # La pasada siguiente (3 min después) no repite la orden ni el aviso.
        self.assertEqual(A.aplicar([decision("X1", "aprobar")]), [])

    def test_liberar_suelta_el_trabajador_y_deja_la_copia_sustituida(self):
        A.aplicar([decision("X2b", "liberar", sucesora="X2c")])
        self.assertEqual(self._control()["X2b"]["accion"], "rechazar")
        with open(os.path.join(A.OLAS, "progreso-correcciones.json"), encoding="utf-8") as f:
            corr = json.load(f)
        self.assertEqual(corr["X2b"]["estado"], "sustituida")
        self.assertEqual(corr["X2b"]["por"], "X2c")

    def test_reservada_se_avisa_una_vez(self):
        d = decision("M1", "reservar_alex", motivo="la decide Alex: trae una migración")
        self.assertEqual(len(A.aplicar([d])), 1)
        self.assertEqual(A.aplicar([d]), [])
        self.assertFalse(os.path.exists(os.path.join(A.OLAS, "control-cola-prueba.json")))

    def test_suelta_con_seguimiento_integra_y_encola_la_objecion(self):
        d = decision("L1c", "aprobar_con_seguimiento", estado="pendiente_aprobacion", objecion="falta X")
        with mock.patch.object(A, "_integrar_suelta", return_value=(True, "en verde")), \
                mock.patch.object(A, "_git", return_value=(0, "abcd1234\n")):
            frases = A.aplicar([d])
        self.assertIn("L1cobj", frases[0])
        with open(os.path.join(A.OLAS, "cola-seguimientos.json"), encoding="utf-8") as f:
            seg = json.load(f)
        self.assertEqual([t["id"] for t in seg], ["L1cobj"])
        with open(os.path.join(A.OLAS, "progreso-correcciones.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["L1c"]["estado"], "commit")

    def test_main_ocupado_se_reintenta_callado(self):
        d = decision("L2c", "aprobar", estado="pendiente_aprobacion")
        with mock.patch.object(A, "_integrar_suelta", return_value=(False, "main ocupado (otra integración)")):
            self.assertEqual(A.aplicar([d]), [])
        self.assertFalse(os.path.exists(os.path.join(A.OLAS, "progreso-correcciones.json")))

    def test_rechazo_de_rama_suelta_queda_como_correccion(self):
        A.aplicar([decision("R1c", "rechazar", estado="pendiente_aprobacion", motivo="Jev veta")])
        with open(os.path.join(A.OLAS, "progreso-correcciones.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["R1c"]["estado"], "rechazada")


if __name__ == "__main__":
    unittest.main()
