"""DIR1121D: la simulación con la que el director de la nube decide lanzar usa «--ceder», igual que el reparto real."""
import importlib.util
import os

_ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "director-nube.py")
_spec = importlib.util.spec_from_file_location("director_nube_dir1121d", _ruta)
mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mod)


def test_la_simulacion_del_atraso_cede_la_tanda_de_la_mac(monkeypatch):
    visto = {}

    def falso_sh(argv, *a, **k):
        visto["argv"] = list(argv)
        return ("[reparto] tanda viva de la Mac: 120 tarea(s); cedibles 8; cedidas a la nube 0 (ninguna)\n"
                "[reparto] Reparto a la nube 20261121: 3 tareas (A, B, C) (simulación)\n")

    monkeypatch.setattr(mod, "_sh", falso_sh)
    assert mod.atraso() == 3
    assert "--ceder" in visto["argv"] and "--simular" in visto["argv"]
    assert "--publicar" not in visto["argv"]


def test_sin_tareas_cedibles_el_atraso_sigue_siendo_cero(monkeypatch):
    monkeypatch.setattr(mod, "_sh", lambda argv, *a, **k: "[reparto] Reparto a la nube 20261121: 0 tareas (ninguna) (simulación)\n")
    assert mod.atraso() == 0
    lanzar, motivo = mod.decidir_lanzamiento(mod.atraso(), 0, 0)
    assert lanzar is False and "atraso" in motivo
