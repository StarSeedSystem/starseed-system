"""1103 · S: reserva al vencer y vuelta de la nube con su veredicto."""
import importlib.util
import os
import sys
from datetime import datetime, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import alta_capacidad_nube_logica as L  # noqa: E402
import buscar_capacidad as B  # noqa: E402

_spec = importlib.util.spec_from_file_location("director_nube_1103s", os.path.join(AQUI, "director-nube.py"))
D = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(D)

AHORA = datetime(2026, 11, 3, 6, 0, tzinfo=timezone.utc).timestamp()
DIA = 86400.0


def _vence(dias):
    return datetime.fromtimestamp(AHORA + dias * DIA, timezone.utc).isoformat()


def test_a_dos_dias_de_vencer_la_reserva_es_tres():
    ok, _, hoy = L.cupo_nube({"restante_usd": 23, "vence": _vence(2)}, AHORA, 0, max_vivas=4)
    assert ok
    assert abs(hoy - 10.0) < 0.01


def test_lejos_del_vencimiento_la_reserva_sigue_en_diez():
    ok, _, hoy = L.cupo_nube({"restante_usd": 23, "vence": _vence(10)}, AHORA, 0, max_vivas=4)
    assert ok
    assert abs(hoy - 1.3) < 0.01


def test_al_vencer_con_poco_saldo():
    assert L.cupo_nube({"restante_usd": 5, "vence": _vence(2)}, AHORA, 0)[0]
    ok, motivo, _ = L.cupo_nube({"restante_usd": 2, "vence": _vence(2)}, AHORA, 0)
    assert not ok and "reserva" in motivo


def test_motivo_de_vuelta_lleva_el_veredicto():
    assert D.motivo_de_vuelta(None) == "devuelta de la nube: su run terminó"
    assert D.motivo_de_vuelta(("", "", "1")) == "devuelta de la nube: su run terminó"
    assert "«sin_cambios»" in D.motivo_de_vuelta(("sin_cambios", "", "41582354643"))


def test_sin_intento_lee_el_veredicto():
    assert B.sin_intento(D.motivo_de_vuelta(None))
    assert not B.sin_intento(D.motivo_de_vuelta(("sin_cambios", "", "1")))
    assert not B.sin_intento(D.motivo_de_vuelta(("fallo_tests", "", "1")))
    # «pendiente» o «pendiente_aprobacion» no prueban que alguien la intentara
    assert B.sin_intento("devuelta de la nube 20261103: no quedaba ningún run (envío 1 de 3) · la nube dijo «pendiente»")
    assert not B.sin_intento("devuelta de la nube 20261103: no quedaba ningún run (envío 2 de 3) · la nube dijo «sin_cambios»")
    assert not B.sin_intento("fallo tsc")
