"""DIR1126A · avisos de sistema de Hermes en español en los canales de la dirección."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import sincronizador_direccion as S  # noqa: E402


def test_aviso_de_turno_cortado_en_espanol():
    t = S.traducir_aviso_hermes(
        "This turn did not complete. Some actions may already have run; verify their effects before resending."
    )
    assert t.startswith("Hermes no terminó ese turno")


def test_lo_demas_no_cambia():
    assert S.traducir_aviso_hermes("Canal Audiovisual y diseño listo.") == "Canal Audiovisual y diseño listo."
    assert S.traducir_aviso_hermes("") == ""
