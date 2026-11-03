"""1103 · Y: con la Mac ahogada de memoria, Genesis no se reinicia en bucle."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autocuracion_mando as A  # noqa: E402

AHORA = 1793744000.0
MIN = 60.0


def test_ahogada_espera_media_hora():
    ok, porque = A.decidir_reinicio([False, False, False], AHORA, None, memoria_ahogada="presión de memoria 2 del núcleo",
                                    lento_s=5 * MIN)
    assert not ok and "ahogada" in porque


def test_ahogada_tras_media_hora_reinicia_pero_espaciado():
    ok, _ = A.decidir_reinicio([False, False, False], AHORA, AHORA - 15 * MIN, memoria_ahogada="swap 7900 de 8192 MB",
                               lento_s=40 * MIN)
    assert not ok  # el último reinicio fue hace 15 min: con la Mac ahogada, como mucho uno cada 30 min
    ok, porque = A.decidir_reinicio([False, False, False], AHORA, AHORA - 45 * MIN, memoria_ahogada="swap 7900 de 8192 MB",
                                    lento_s=40 * MIN)
    assert ok and "sondas" in porque


def test_sin_ahogo_como_antes():
    assert A.decidir_reinicio([False, False, False], AHORA, None)[0]
    assert not A.decidir_reinicio([True], AHORA, None)[0]
    assert not A.decidir_reinicio([False, False, False], AHORA, AHORA - 5 * MIN)[0]
