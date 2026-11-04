# -*- coding: utf-8 -*-
"""Pruebas de las unidades de la pasada nocturna de LEANN (LNN1028D3).

No ejecutan systemd: leen los dos archivos del paquete y comprueban el contrato del A1
(architecture/leann-recuerdo-semantico.md §3 y §4): trabajo oneshot de starseed, sin red
pública, con la ruta del checkout para reconstruir `repo-starseed`, y un temporizador
posterior a Meta^n (03:40) que no se pierde al reinstalar.
"""
import os
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SYSTEMD = os.path.join(RAIZ, "deploy", "oracle", "nodo", "systemd")
SERVICIO = os.path.join(SYSTEMD, "starseed-leann-noche.service")
TEMPORIZADOR = os.path.join(SYSTEMD, "starseed-leann-noche.timer")


def leer(ruta):
    with open(ruta, encoding="utf-8") as fichero:
        return fichero.read()


class Servicio(unittest.TestCase):

    def test_oneshot_de_starseed_con_el_venv_y_la_pasada(self):
        texto = leer(SERVICIO)
        self.assertIn("Type=oneshot", texto)
        self.assertIn("User=starseed", texto)
        self.assertIn("Group=starseed", texto)
        self.assertIn(
            "ExecStart=/opt/starseed/leann/.venv/bin/python "
            "/opt/starseed/nodo/leann/leann_indices.py noche", texto)
        self.assertIn("# requiere: /opt/starseed/leann/.venv/bin/python", texto)
        self.assertIn("# temporizado", texto)
        self.assertIn("OLLAMA_HOST=http://127.0.0.1:11434", texto)
        self.assertIn("STARSEED_REPO_RAIZ=/home/starseed/starseed-system", texto)
        self.assertNotIn("0.0.0.0", texto)

    def test_techo_y_prioridad_bajos(self):
        texto = leer(SERVICIO)
        self.assertIn("MemoryMax=1500M", texto)
        self.assertIn("Nice=15", texto)
        self.assertIn("TimeoutStartSec=5400", texto)


class Temporizador(unittest.TestCase):

    def test_despues_de_metan_y_persistente(self):
        texto = leer(TEMPORIZADOR)
        self.assertIn("OnCalendar=*-*-* 04:30:00", texto)
        self.assertIn("RandomizedDelaySec=10min", texto)
        self.assertIn("Persistent=true", texto)
        self.assertIn("WantedBy=timers.target", texto)
        self.assertIn("# requiere: /opt/starseed/nodo/leann/leann_indices.py", texto)


if __name__ == "__main__":
    unittest.main()
