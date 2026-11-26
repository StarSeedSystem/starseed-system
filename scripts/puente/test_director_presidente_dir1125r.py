"""DIR1125R: el presidente sabe qué motor le sirve y tiene las órdenes exactas de las pruebas."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import director_presidente as D  # noqa: E402


def test_marcar_motor_dice_quien_sirve_y_separa_las_notas_de_cowork():
    p = D.marcar_motor("PREGUNTA", "hermes")
    assert p.startswith("Te está sirviendo ahora: Hermes.")
    assert "Claude Cowork" in p and p.endswith("PREGUNTA")


def test_marcar_motor_con_un_motor_desconocido_no_falla():
    assert "Te está sirviendo ahora: x." in D.marcar_motor("", "x")
    assert "otro motor" in D.marcar_motor(None, None)


def test_puedes_actuar_lleva_las_ordenes_de_las_pruebas():
    t = D.PUEDES_ACTUAR
    for orden in ("director_pruebas.py pedir compilar", "pruebas_malla.py", "publicar-canal --canal principal",
                  "pruebas_malla.py recoger", "gh run view", "plan-activo.md"):
        assert orden in t, orden
    assert "no preguntes si debes comprobarlo" in t
    assert "ssh -i" not in t  # (DIR1125U) ssh directo vetado


def test_el_presidente_puede_conducir_y_leer_el_ci_pero_no_ssh():
    import motores_director as M
    permitidas, vetadas = M.permisos_del_presidente()
    assert "Bash(python3 scripts/puente/pruebas_malla.py:*)" in permitidas
    assert "Bash(gh run view:*)" in permitidas and "Bash(gh run list:*)" in permitidas
    assert "Bash(ssh:*)" in vetadas and not any(p.startswith("Bash(ssh") for p in permitidas)


def test_el_prompt_del_presidente_sigue_llevando_puedes_actuar():
    assert D.PUEDES_ACTUAR in D.prompt_presidente("hola", [])
