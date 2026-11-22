# -*- coding: utf-8 -*-
"""SES1122C · «Te toca a ti» agrupa las propuestas Higgsfield repetidas.

Medido el 22-11: las mismas dos piezas se proponían otra vez cada día desde el
17-11 y la lista crecía dos tarjetas por día. La identidad de una pieza es
`pieza + modelo + prompt`: dos propuestas con esa misma terna son la misma
pieza y se muestran juntas, conservando todos sus IDs para poder aprobarlas.
"""
import importlib.util
import json
import os
import tempfile

import pytest

_RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "acciones-de-alex.py")
_SPEC = importlib.util.spec_from_file_location("acciones_de_alex_ses1122c", _RUTA)
A = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(A)

TODOS = sorted(A.CLAVES_DEL_ENJAMBRE)
CATALOGO = {}
ENTORNO = {"TELEGRAM_BOT_TOKEN": "x", "TELEGRAM_CHAT_ID": "y"}


def _propuesta(pid, fecha, pieza, prompt, modelo="seedance-2.0", proyecto="sistema-diseno"):
    return {
        "id": pid,
        "proyecto": proyecto,
        "pieza": pieza,
        "modelo": modelo,
        "tomas": 1,
        "creditos_estimados": 12,
        "motivo": "Prueba visual",
        "fecha": fecha,
        "estado": "pendiente",
        "comando": ["higgsfield", "generate", "seedance_2_0", "--prompt", prompt],
    }


@pytest.fixture()
def dir_higgsfield(monkeypatch):
    """Aísla propuestas/aprobaciones y la marca de Codex de la máquina."""
    d = tempfile.mkdtemp(prefix="hf-ses1122c-")
    monkeypatch.setattr(A._hfa, "DIR", d, raising=False)
    if getattr(A, "_cupo", None) is not None:
        monkeypatch.setattr(A._cupo, "RUTA", os.path.join(d, "codex-cupo.json"), raising=False)
    return d


def _escribir(d, nombre, datos):
    with open(os.path.join(d, nombre), "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False)


def _acciones_higgsfield():
    acciones = A.construir_acciones([], TODOS, CATALOGO, entorno=ENTORNO,
                                    a1_tiene_token=True)
    return [a for a in acciones if a.get("categoria") == "higgsfield"]


class TestClaveDePieza:
    def test_misma_pieza_modelo_y_prompt_es_la_misma_clave(self):
        a = _propuesta("HGF1", "2026-11-17", "walkthrough de Nexus", "Nexus walkthrough")
        b = _propuesta("HGF2", "2026-11-18", "walkthrough de Nexus", "Nexus walkthrough")
        assert A.clave_higgsfield(a) == A.clave_higgsfield(b)

    def test_cambiar_el_prompt_es_otra_pieza(self):
        a = _propuesta("HGF1", "2026-11-17", "walkthrough de Nexus", "Nexus walkthrough")
        b = _propuesta("HGF2", "2026-11-18", "walkthrough de Nexus", "Otro recorrido")
        assert A.clave_higgsfield(a) != A.clave_higgsfield(b)

    def test_el_prompt_sale_del_comando(self):
        p = _propuesta("HGF1", "2026-11-17", "halo", "Halo dorado")
        assert A.prompt_de_propuesta(p) == "Halo dorado"


class TestAgrupar:
    def test_las_repetidas_quedan_en_una_sola_pieza(self):
        propuestas = [
            _propuesta("HGF20261117001", "2026-11-17", "walkthrough de Nexus", "Nexus"),
            _propuesta("HGF20261118001", "2026-11-18", "walkthrough de Nexus", "Nexus"),
            _propuesta("HGF20261119001", "2026-11-19", "walkthrough de Nexus", "Nexus"),
        ]
        grupos = A.agrupar_propuestas_higgsfield(propuestas)
        assert len(grupos) == 1
        grupo = grupos[0]
        assert grupo["veces"] == 3
        assert grupo["desde"] == "2026-11-17"
        assert grupo["propuesta_ids"] == [
            "HGF20261117001", "HGF20261118001", "HGF20261119001",
        ]

    def test_piezas_distintas_no_se_mezclan(self):
        propuestas = [
            _propuesta("HGF20261117001", "2026-11-17", "referencia de marca animada", "Marca"),
            _propuesta("HGF20261117002", "2026-11-17", "walkthrough de Nexus", "Nexus"),
        ]
        grupos = A.agrupar_propuestas_higgsfield(propuestas)
        assert len(grupos) == 2
        assert [g["veces"] for g in grupos] == [1, 1]

    def test_el_representante_es_el_mas_antiguo(self):
        propuestas = [
            _propuesta("HGF20261119001", "2026-11-19", "walkthrough de Nexus", "Nexus"),
            _propuesta("HGF20261117001", "2026-11-17", "walkthrough de Nexus", "Nexus"),
        ]
        grupo = A.agrupar_propuestas_higgsfield(propuestas)[0]
        assert grupo["representante"]["id"] == "HGF20261117001"


class TestListaDeAcciones:
    def test_cuatro_repetidas_se_ven_como_dos_piezas(self, dir_higgsfield):
        _escribir(dir_higgsfield, "propuestas.json", [
            _propuesta("HGF20261117001", "2026-11-17", "referencia de marca animada", "Marca"),
            _propuesta("HGF20261117002", "2026-11-17", "walkthrough de Nexus", "Nexus"),
            _propuesta("HGF20261121001", "2026-11-21", "referencia de marca animada", "Marca"),
            _propuesta("HGF20261121002", "2026-11-21", "walkthrough de Nexus", "Nexus"),
        ])
        acciones = _acciones_higgsfield()
        assert len(acciones) == 2
        assert {a["propuesta_id"] for a in acciones} == {"HGF20261117001", "HGF20261117002"}
        for accion in acciones:
            assert accion["veces"] == 2
            assert accion["desde"] == "2026-11-17"
            assert len(accion["propuesta_ids"]) == 2
            assert len(accion["ids_acciones"]) == 2
            assert "propuesta 2 veces desde 2026-11-17" in accion["por_que"]

    def test_los_ids_agrupados_conservan_el_prefijo_para_aprobar(self, dir_higgsfield):
        _escribir(dir_higgsfield, "propuestas.json", [
            _propuesta("HGF20261117001", "2026-11-17", "walkthrough de Nexus", "Nexus"),
            _propuesta("HGF20261121001", "2026-11-21", "walkthrough de Nexus", "Nexus"),
        ])
        accion = _acciones_higgsfield()[0]
        assert accion["id"] == "higgsfield-HGF20261117001"
        assert accion["ids_acciones"] == [
            "higgsfield-HGF20261117001", "higgsfield-HGF20261121001",
        ]
        assert "higgsfield-HGF20261117001" in accion["comando"]
        assert "higgsfield-HGF20261121001" in accion["ids_acciones"]

    def test_aprobar_la_pieza_agrupada_resuelve_todos_sus_ids(self, dir_higgsfield):
        _escribir(dir_higgsfield, "propuestas.json", [
            _propuesta("HGF20261117001", "2026-11-17", "walkthrough de Nexus", "Nexus"),
            _propuesta("HGF20261121001", "2026-11-21", "walkthrough de Nexus", "Nexus"),
        ])
        res = A.aprobar_accion("higgsfield-HGF20261117001", base_hf=dir_higgsfield, regenerar=False)
        assert res["ok"]
        assert res["propuesta_ids"] == ["HGF20261117001", "HGF20261121001"]
        with open(os.path.join(dir_higgsfield, "aprobaciones.json"), encoding="utf-8") as f:
            aprobadas = json.load(f)
        assert set(aprobadas) == {"HGF20261117001", "HGF20261121001"}
        assert _acciones_higgsfield() == []

    def test_una_sola_propuesta_no_lleva_la_frase_de_repeticion(self, dir_higgsfield):
        _escribir(dir_higgsfield, "propuestas.json", [
            _propuesta("HGF20261117001", "2026-11-17", "walkthrough de Nexus", "Nexus"),
        ])
        accion = _acciones_higgsfield()[0]
        assert accion["veces"] == 1
        assert accion["propuesta_ids"] == ["HGF20261117001"]
        assert "propuesta 1 vez" not in accion["por_que"]

    def test_una_ya_aprobada_no_vuelve_a_salir(self, dir_higgsfield):
        _escribir(dir_higgsfield, "propuestas.json", [
            _propuesta("HGF20261117001", "2026-11-17", "walkthrough de Nexus", "Nexus"),
        ])
        _escribir(dir_higgsfield, "aprobaciones.json", {
            "HGF20261117001": {"id": "HGF20261117001", "estado": "rechazada"},
        })
        assert _acciones_higgsfield() == []


_RUTA_SINTESIS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agente_sintesis.py")
_SPEC_SINTESIS = importlib.util.spec_from_file_location("agente_sintesis_ses1122c", _RUTA_SINTESIS)
S = importlib.util.module_from_spec(_SPEC_SINTESIS)
_SPEC_SINTESIS.loader.exec_module(S)


class TestGeneradorNoDuplica:
    """La causa: la síntesis diaria volvía a proponer las mismas piezas cada día."""

    def _raiz(self, tmp_path):
        raiz = tmp_path / "repo"
        raiz.mkdir()
        return str(raiz)

    def _generar(self, raiz, fecha):
        from datetime import datetime, timezone
        ahora = datetime.strptime(fecha + " 13:54", "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
        return S._generar_propuestas_higgsfield(raiz, fecha, ahora=ahora)

    def test_una_pieza_pendiente_no_se_vuelve_a_proponer_al_dia_siguiente(self, tmp_path):
        raiz = self._raiz(tmp_path)
        primero = self._generar(raiz, "2026-11-19")
        assert len(primero) == 2
        claves = {S._clave_pieza_higgsfield(p) for p in primero}

        segundo = self._generar(raiz, "2026-11-20")
        for p in segundo:
            assert S._clave_pieza_higgsfield(p) not in claves

    def test_el_archivo_no_acumula_la_misma_pieza(self, tmp_path):
        raiz = self._raiz(tmp_path)
        for fecha in ("2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"):
            self._generar(raiz, fecha)
        propuestas = S._leer_propuestas_higgsfield(raiz)
        claves = [S._clave_pieza_higgsfield(p) for p in propuestas]
        assert len(claves) == len(set(claves))
