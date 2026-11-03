"""1103 · U: «Potenciar» los medios que reparten su crédito o su cupo del mes, y la pregunta que lo ofrece."""
import importlib.util
import os
import sys
import tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import alta_capacidad_nube_logica as L  # noqa: E402
import buscar_capacidad as B  # noqa: E402
import cloudroom_lanzar as CR  # noqa: E402
import potenciar_capacidad as PC  # noqa: E402

AHORA = 1793690000.0
H = 3600.0


# ── el archivo de preguntas y decisiones ─────────────────────────────────────

def test_pregunta_vigente_y_contestada():
    d = PC.con_pregunta({}, "cloudroom", "sin cupo hoy: ya van 2 hoy", "hasta 3 hilos", AHORA)
    vig = PC.preguntas_vigentes(d, AHORA + 60)
    assert [p["servicio"] for p in vig] == ["cloudroom"]
    assert vig[0]["nombre"] == "Cloudroom"
    assert PC.preguntas_vigentes(d, AHORA + PC.PREGUNTA_VALE_S + 1) == []  # vieja: ya no se pregunta
    pot = PC.con_decision(d, "cloudroom", True, AHORA + 60)
    assert PC.preguntas_vigentes(pot, AHORA + 120) == []
    assert PC.activo("cloudroom", AHORA + 120, pot, env={})
    assert not PC.activo("cloudroom", AHORA + 60 + PC.HORAS_POR_DEFECTO * H + 1, pot, env={})


def test_mantener_el_ritmo_calla_la_pregunta():
    d = PC.con_decision(PC.con_pregunta({}, "claude-nube", "x", "y", AHORA), "claude-nube", False, AHORA)
    assert not PC.activo("claude-nube", AHORA + 1, d, env={})
    assert PC.con_pregunta(d, "claude-nube", "x", "y", AHORA + H)["preguntas"] == {}
    assert PC.con_pregunta(d, "claude-nube", "x", "y", AHORA + PC.HORAS_SIN_PREGUNTAR * H + 1)["preguntas"]


def test_potenciado_no_vuelve_a_preguntar_y_horas_acotadas():
    d = PC.con_decision({}, "nube-gh", True, AHORA, horas=1000)
    assert d["activos"]["nube-gh"]["hasta"] == AHORA + 24 * 7 * H
    assert PC.con_pregunta(d, "nube-gh", "x", "y", AHORA + 1)["preguntas"] == {}
    assert PC.con_pregunta({}, "inventado", "x", "y", AHORA)["preguntas"] == {}


def test_entorno_potencia_sin_preguntar():
    assert PC.activo("cloudroom", AHORA, {}, env={"STARSEED_POTENCIAR": "todo"})
    assert PC.activo("claude-nube", AHORA, {}, env={"STARSEED_POTENCIAR": "claude-nube,cloudroom"})
    assert not PC.activo("nube-gh", AHORA, {}, env={"STARSEED_POTENCIAR": "claude-nube"})


def test_archivo_roto_no_tumba_y_cli(tmp_path=None):
    carpeta = tempfile.mkdtemp()
    ruta = os.path.join(carpeta, "p.json")
    open(ruta, "w").write("{roto")
    assert PC.leer(ruta) == {"activos": {}, "mantener": {}, "preguntas": {}}
    PC.anotar_pregunta("cloudroom", "sin cupo hoy", "hasta 3", AHORA, ruta=ruta)
    assert "cloudroom" in PC.leer(ruta)["preguntas"]
    d = PC.decidir("cloudroom", True, ahora=AHORA, ruta=ruta)
    assert "potenciado hasta" in PC.texto_decision(d, "cloudroom", AHORA)
    assert "Potenciar" in PC.texto_preguntas([{"nombre": "Cloudroom", "detalle": "a", "gasto": "b"}])
    assert PC.texto_preguntas([]) == ""


# ── Claude en la nube ────────────────────────────────────────────────────────

def test_cupo_potenciado_vale_todo_hoy():
    credito = {"restante_usd": 23, "vence": "2026-11-20T00:00:00+00:00"}
    _ok, _m, normal = L.cupo_nube(credito, AHORA, 0, max_vivas=4)
    ok, _m, pot = L.cupo_nube(credito, AHORA, 0, max_vivas=4, potenciado=True)
    assert ok and pot == 13.0 and normal < pot  # la reserva (10 $) se respeta igual


def test_pregunta_ritmo_del_carril():
    # se gastó lo de hoy y quedan 11 $ por encima de la reserva: se pregunta
    assert L.pregunta_ritmo(5, 1, 4, 9.6, 9.0, 3, 6, 11.0)
    # tope de lanzamientos del día con dinero: también
    assert L.pregunta_ritmo(5, 1, 4, 9.6, 2.0, 6, 6, 11.0)
    # sin tareas, sin hueco a la vez o sin crédito por encima de la reserva: no
    assert L.pregunta_ritmo(0, 1, 4, 9.6, 9.0, 3, 6, 11.0) is None
    assert L.pregunta_ritmo(5, 4, 4, 9.6, 9.0, 3, 6, 11.0) is None
    assert L.pregunta_ritmo(5, 1, 4, 9.6, 9.0, 3, 6, 0.5) is None
    # aún queda presupuesto de hoy y lanzamientos: no frena el ritmo
    assert L.pregunta_ritmo(5, 1, 4, 9.6, 2.0, 2, 6, 11.0) is None


# ── Cloudroom ────────────────────────────────────────────────────────────────

def _registro(n_hoy, ahora):
    return [{"tarea": "T%d" % i, "hilo": "h%d" % i, "t": ahora - 60 * (i + 1), "final": "traida"} for i in range(n_hoy)]


def test_ritmo_potenciado_usa_el_ciclo_sin_reparto_por_dia():
    reg = _registro(2, AHORA)
    normal = CR.ritmo(reg, AHORA, total=40, usados_cuenta=0, tope_dia=2)
    pot = CR.ritmo(reg, AHORA, total=40, usados_cuenta=0, tope_dia=2, potenciado=True)
    assert pot["potenciado"] and pot["hoy"] == CR.MAX_VIVOS and pot["hoy"] >= normal["hoy"]
    assert CR.frena_el_ritmo(10, normal) == (normal["hoy"] < 10 and normal["quedan"] > normal["hoy"])
    assert not CR.frena_el_ritmo(10, pot)
    assert not CR.frena_el_ritmo(0, normal)
    assert not CR.frena_el_ritmo(10, {"hoy": 0, "quedan": 30, "motivo": "sin cupo ahora: 3 hilos abiertos (tope 3)"})
    assert not CR.frena_el_ritmo(10, {"hoy": 0, "quedan": 0, "motivo": "sin cupo: 100 de 100"})
    assert CR.frena_el_ritmo(10, {"hoy": 0, "quedan": 33, "motivo": "sin cupo hoy: ya van 2 hoy"})


# ── GitHub Actions ───────────────────────────────────────────────────────────

def test_plan_nube_potenciado_reabre_las_agotadas_del_tope():
    cuatro = [AHORA - 10 * H, AHORA - 8 * H, AHORA - 6 * H, AHORA - 4 * H]
    reap = {"X": cuatro, "Y": cuatro}
    notas = {"X": "devuelta de la nube: su run terminó · la nube dijo «sin_cambios»", "Y": ""}
    normal = B.plan_nube([], ["X", "Y"], 0, None, reap, AHORA, listas_mac=20, tope_mac=2, tope_runs=4, notas=notas)
    assert normal["reabrir"] == []
    pot = B.plan_nube([], ["X", "Y"], 0, None, reap, AHORA, listas_mac=20, tope_mac=2, tope_runs=4, notas=notas,
                      potenciado=True)
    assert pot["reabrir"] == ["X", "Y"] and pot["lanzar"] == 1


def test_pregunta_nube_gh():
    cuatro = [AHORA - 10 * H, AHORA - 8 * H, AHORA - 6 * H, AHORA - 4 * H]
    q = B.pregunta_nube_gh(["X", "Y"], [], {"X": cuatro, "Y": cuatro}, AHORA, 5)
    assert q and "2 tarea(s)" in q[0] and "no gasta créditos" in q[1]
    assert B.pregunta_nube_gh(["X"], ["X"], {}, AHORA, 5) is None  # ya se reabre sin potenciar
    assert B.pregunta_nube_gh(["X"], [], {"X": cuatro}, AHORA, 0) is None  # sin sitio en GitHub
    recien = cuatro[:-1] + [AHORA - 60]
    assert B.pregunta_nube_gh(["X"], [], {"X": recien}, AHORA, 5) is None  # la última hace menos de una hora


def test_carril_importa_y_expone_los_topes():
    spec = importlib.util.spec_from_file_location("alta_nube_1103u", os.path.join(AQUI, "alta-capacidad-nube.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    assert callable(m._potenciado) and callable(m._preguntar)
    assert L.MAX_VIVAS_POTENCIADO >= 4 and L.MAX_DIA_POTENCIADO > L.MAX_LANZAMIENTOS_DIA
