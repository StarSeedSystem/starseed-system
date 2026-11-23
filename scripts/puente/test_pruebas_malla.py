#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PRU1118A · Pruebas de la lógica pura del conductor de pruebas de la malla.

Cubiertas las costuras acordadas con el director: lectura de ventanas de tiempo,
evaluación de criterios `debe`/`no_debe`, formato del informe, filtrado de la
batería y las líneas del registro. Todo se prueba con registros de ejemplo:
ninguna prueba lee logs reales, abre red ni ejecuta un aparato.
"""
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pruebas_malla as PM  # noqa: E402

UTC = timezone.utc

# Registro del enlace: una línea por hito, con la fecha ISO al principio.
ENLACES = [
    "2026-11-18T10:00:00.000Z ble l2cap-kbps enlace=b1 neurona=aaa · kbps=100",
    "2026-11-18T10:00:01.000Z web 2026-11-18T10:00:00.500Z · llamada · b1 · neurona aaa · senal-recibida app",
    "2026-11-18T10:00:02.000Z web · control-sesion · inicio de=00112233 nivel=controlar alcance=total",
    "2026-11-18T10:00:03.000Z web · control-sesion · orden leer-estado de=00112233 resultado=autorizada",
    "2026-11-18T10:00:04.000Z web · control-sesion · fin de=00112233 motivo=la-persona-desde-el-indicador",
    "2026-11-18T10:00:05.000Z ble l2cap-kbps enlace=b1 neurona=aaa · kbps=50",
]

# Control entre neuronas: una línea JSON por evento, con la fecha en el campo «t».
CONTROL = [
    '{"t":"2026-11-18T10:00:00.000Z","ev":"sesion-abierta","detalle":"de=00112233 nivel=controlar alcance=total","ant":"inicio","h":"h1"}',
    '{"t":"2026-11-18T10:00:01.000Z","ev":"orden","detalle":"leer-estado de=00112233 resultado=autorizada","ant":"h1","h":"h2"}',
    '{"t":"2026-11-18T10:00:02.000Z","ev":"sesion-parada","detalle":"de=00112233 motivo=la-persona-desde-el-indicador","ant":"h2","h":"h3"}',
]


def dt(hora, minuto=0, segundo=0, micro=0):
    """Fecha UTC cómoda para escribir las ventanas de las pruebas."""
    return datetime(2026, 11, 18, hora, minuto, segundo, micro, tzinfo=UTC)


class TestVentana:
    """Recorte de líneas a la ventana en que transcurrió la prueba."""

    def test_inicio_y_fin_son_incluyentes(self):
        lineas = PM.recortar_ventana(ENLACES, dt(10, 0, 1), dt(10, 0, 3))
        assert len(lineas) == 3
        assert "10:00:01" in lineas[0]
        assert "10:00:03" in lineas[-1]

    def test_solo_inicio_deja_el_presente_abierto(self):
        lineas = PM.recortar_ventana(ENLACES, dt(10, 0, 3), None)
        assert len(lineas) == 3
        assert "10:00:03" in lineas[0]
        assert "10:00:05" in lineas[-1]

    def test_solo_fin_conserva_lo_anterior(self):
        lineas = PM.recortar_ventana(ENLACES, None, dt(10, 0, 2))
        assert len(lineas) == 3
        assert "10:00:00" in lineas[0]
        assert "10:00:02" in lineas[-1]

    def test_ventana_fuera_de_rango_no_queda_nada(self):
        assert PM.recortar_ventana(ENLACES, dt(11), None) == []

    def test_sin_limites_devuelve_todas_las_lineas(self):
        assert PM.recortar_ventana(ENLACES, None, None) == ENLACES

    def test_lineas_sin_fecha_se_descartan(self):
        lineas = ENLACES[:1] + ["línea suelta sin fecha"] + ENLACES[1:2]
        recortadas = PM.recortar_ventana(lineas, dt(9), dt(11))
        assert len(recortadas) == 2
        assert all("sin fecha" not in linea for linea in recortadas)

    def test_lee_la_fecha_del_campo_t_del_control(self):
        lineas = PM.recortar_ventana(CONTROL, dt(10, 0, 0), dt(10, 0, 1))
        assert len(lineas) == 2
        assert all(linea.startswith("{") for linea in lineas)
        assert json.loads(lineas[0])["ev"] == "sesion-abierta"

    def test_lista_vacia_no_falla(self):
        assert PM.recortar_ventana([], dt(10), dt(11)) == []


class TestPatrones:
    """Criterios por aparato: lo que la prueba exige (`debe`) y lo que prohíbe (`no_debe`)."""

    def test_todos_los_debe_presentes_da_ok(self):
        criterios = {
            "debe": [
                r"control-sesion.*inicio de=\S+ nivel=controlar",
                r"control-sesion.*orden.*resultado=autorizada",
                r"control-sesion.*fin de=\S+ motivo=la-persona-desde-el-indicador",
            ],
            "no_debe": [r"motivo=sin-indicador-nativo"],
        }
        res = PM.evaluar_patrones(ENLACES, criterios)
        assert res["ok"] is True
        assert res["debe_cumplidos"] == 3
        assert res["debe_faltantes"] == []
        assert res["no_debe_violados"] == []

    def test_un_debe_que_falta_no_da_ok(self):
        criterios = {
            "debe": [
                r"control-sesion.*inicio de=",
                r"resultado=rechazo:pausa-local",
            ],
            "no_debe": [],
        }
        res = PM.evaluar_patrones(ENLACES, criterios)
        assert res["ok"] is False
        assert res["debe_cumplidos"] == 1
        assert res["debe_faltantes"] == [r"resultado=rechazo:pausa-local"]

    def test_un_no_debe_presente_no_da_ok(self):
        lineas = ENLACES + [
            "2026-11-18T10:00:06.000Z web · control-sesion · orden gesto de=00112233 resultado=rechazo:sin-indicador-nativo",
        ]
        criterios = {
            "debe": [r"control-sesion.*inicio de="],
            "no_debe": [r"sin-indicador-nativo"],
        }
        res = PM.evaluar_patrones(lineas, criterios)
        assert res["ok"] is False
        assert res["no_debe_cumplidos"] == 0
        assert res["no_debe_violados"] == [r"sin-indicador-nativo"]

    def test_los_patrones_no_distinguen_mayusculas(self):
        criterios = {"debe": [r"CONTROL-SESION.*INICIO DE="], "no_debe": []}
        assert PM.evaluar_patrones(ENLACES, criterios)["ok"] is True

    def test_evidencias_guardan_las_lineas_que_cumplen(self):
        criterios = {"debe": [r"l2cap-kbps"], "no_debe": []}
        res = PM.evaluar_patrones(ENLACES, criterios)
        assert len(res["evidencias"][r"l2cap-kbps"]) == 2
        assert all("l2cap-kbps" in linea for linea in res["evidencias"][r"l2cap-kbps"])

    def test_las_evidencias_no_crecen_sin_limite(self):
        lineas = [f"2026-11-18T10:00:0{i}.000Z repetido" for i in range(9)]
        res = PM.evaluar_patrones(lineas, {"debe": ["repetido"], "no_debe": []})
        assert len(res["evidencias"]["repetido"]) <= 5

    def test_lee_criterios_de_la_tableta_en_json(self):
        criterios = {
            "debe": [
                r'"ev":"sesion-abierta".*nivel=controlar alcance=total',
                r'"ev":"orden".*resultado=autorizada',
            ],
            "no_debe": [r'"ev":"sesion-rechazada"'],
        }
        res = PM.evaluar_patrones(CONTROL, criterios)
        assert res["ok"] is True
        assert res["debe_cumplidos"] == 2

    def test_sin_criterios_da_ok(self):
        res = PM.evaluar_patrones(ENLACES, {})
        assert res["ok"] is True
        assert res["debe_cumplidos"] == 0
        assert res["no_debe_cumplidos"] == 0


class TestPatronesRelevo:
    """Patrones de registro para relevo (enlaces.log)."""

    def test_web_relevo_tabla(self):
        lineas = [
            "2026-11-18T10:00:00.000Z web 2026-11-18T10:00:00.000Z web relevo - - tabla Maggaboard releva alcanza=b1",
        ]
        criterios = {
            "debe": [r"web relevo - - tabla"],
            "no_debe": [],
        }
        res = PM.evaluar_patrones(lineas, criterios)
        assert res["ok"] is True

    def test_web_relevo_entregado(self):
        lineas = [
            "2026-11-18T10:00:00.000Z web · relevo - - entregado destino=tableta",
        ]
        criterios = {
            "debe": [r"entregado destino="],
            "no_debe": [],
        }
        res = PM.evaluar_patrones(lineas, criterios)
        assert res["ok"] is True

    def test_web_relevo_sin_ruta_no_debe(self):
        lineas = [
            "2026-11-18T10:00:00.000Z web · relevo - - sin-ruta destino=tableta",
        ]
        criterios = {
            "debe": [],
            "no_debe": [r"sin-ruta"],
        }
        res = PM.evaluar_patrones(lineas, criterios)
        assert res["ok"] is False


class TestPatronesMensajeMalla:
    """Patrones de registro para mensaje-malla (enlaces.log y control-neuronas.log)."""

    def test_mensaje_malla_enviado_bluetooth(self):
        lineas = [
            "2026-11-18T10:00:00.000Z web · mensaje-malla · b1 · neurona aaa · enviado via=bluetooth",
            "2026-11-18T10:00:01.000Z web · mensaje-malla · b1 · neurona aaa · entregado via=bluetooth",
        ]
        criterios = {
            "debe": [r"mensaje-malla.*enviado via=bluetooth"],
            "no_debe": [],
        }
        res = PM.evaluar_patrones(lineas, criterios)
        assert res["ok"] is True

    def test_mensaje_malla_malla(self):
        lineas = [
            "2026-11-18T10:00:00.000Z web · mensaje-malla · b1 · neurona aaa · enviado via=rele",
            "2026-11-18T10:00:01.000Z web · mensaje-malla · b1 · neurona aaa · entregado via=turn",
        ]
        criterios = {
            "debe": [r"mensaje-malla.*enviado via=(?:rele|turn|p2p-internet)"],
            "no_debe": [],
        }
        res = PM.evaluar_patrones(lineas, criterios)
        assert res["ok"] is True


class TestInforme:
    """Tabla breve que se publica en el Chat Director."""

    def _filas(self):
        return [
            {"id": "B1-MT-A1", "titulo": "Apertura de sesión", "resultado": "ok", "aparatos": ["mac", "tableta"]},
            {"id": "B2-MT-A1", "titulo": "Pausa local", "resultado": "parcial", "aparatos": ["mac", "tableta"]},
            {"id": "B3-MT-A1", "titulo": "Caducidad", "resultado": "fallo", "aparatos": ["mac", "tableta"]},
        ]

    def test_cabecera_y_ronda(self):
        md = PM.formatear_informe(self._filas(), ronda=1)
        assert "Ronda 1" in md
        assert "| ID | Título | Resultado | Aparatos |" in md

    def test_cada_fila_lleva_su_resultado(self):
        md = PM.formatear_informe(self._filas(), ronda=1)
        assert "B1-MT-A1" in md and "✅ ok" in md
        assert "B2-MT-A1" in md and "⚠️ parcial" in md
        assert "B3-MT-A1" in md and "❌ fallo" in md

    def test_informe_sin_ronda(self):
        md = PM.formatear_informe(self._filas())
        assert "Informe de pruebas" in md
        assert "Ronda" not in md

    def test_informe_vacio_lo_dice(self):
        md = PM.formatear_informe([], ronda=2)
        assert "Ronda 2" in md
        assert "Sin pruebas" in md

    def test_las_notas_acompanan_a_la_fila(self):
        filas = [{
            "id": "B1-MT-A1",
            "titulo": "Apertura",
            "resultado": "parcial",
            "aparatos": ["mac"],
            "nota": "Falta la línea de fin en la tableta",
        }]
        md = PM.formatear_informe(filas, ronda=1)
        assert "Falta la línea de fin en la tableta" in md


class TestBateria:
    """Filtrado de la batería por bloque y por ronda, sin tocar disco."""

    def _bateria(self):
        return {
            "bateria": "1118",
            "pruebas": [
                {"id": "B1-MT-A1", "titulo": "Uno", "bloque": "B1", "ronda": 1, "aparatos": ["mac"], "antena": "ble"},
                {"id": "B1-MT-A2", "titulo": "Dos", "bloque": "B1", "ronda": 2, "aparatos": ["tableta"], "antena": "wifi"},
                {"id": "B4-MT-A1", "titulo": "Cuatro", "bloque": "B4", "ronda": 1, "aparatos": ["mac"], "antena": "malla"},
            ],
        }

    def test_sin_filtros_estan_todas(self):
        assert len(PM.filtrar_bateria(self._bateria())) == 3

    def test_filtra_por_bloque(self):
        res = PM.filtrar_bateria(self._bateria(), bloque="B1")
        assert [p["id"] for p in res] == ["B1-MT-A1", "B1-MT-A2"]

    def test_un_bloque_no_arrastra_a_sus_vecinos(self):
        bateria = {"pruebas": [{"id": "B40-MT-A1"}, {"id": "B4-MT-A1"}]}
        assert [p["id"] for p in PM.filtrar_bateria(bateria, bloque="B4")] == ["B4-MT-A1"]

    def test_filtra_por_ronda(self):
        res = PM.filtrar_bateria(self._bateria(), ronda=1)
        assert [p["id"] for p in res] == ["B1-MT-A1", "B4-MT-A1"]

    def test_filtra_por_bloque_y_ronda(self):
        res = PM.filtrar_bateria(self._bateria(), bloque="B1", ronda=1)
        assert [p["id"] for p in res] == ["B1-MT-A1"]

    def test_bateria_sin_pruebas(self):
        assert PM.filtrar_bateria({}) == []


class TestRegistro:
    """Líneas de pruebas/registro.jsonl: una por inicio y una por cierre."""

    def test_linea_de_inicio_es_json_de_una_sola_linea(self):
        linea = PM.linea_registro_inicio("B4-MT-A1", "2026-11-18T10:00:00Z")
        assert "\n" not in linea
        datos = json.loads(linea)
        assert datos["tipo"] == "inicio"
        assert datos["id"] == "B4-MT-A1"
        assert datos["inicio"] == "2026-11-18T10:00:00Z"

    def test_linea_de_fin_lleva_resultado_y_nota(self):
        datos = json.loads(PM.linea_registro_fin("B4-MT-A1", "ok", "todo correcto"))
        assert datos == {"tipo": "fin", "id": "B4-MT-A1", "resultado": "ok", "nota": "todo correcto"}

    def test_linea_de_fin_sin_nota_no_la_inventa(self):
        datos = json.loads(PM.linea_registro_fin("B4-MT-A1", "fallo"))
        assert datos == {"tipo": "fin", "id": "B4-MT-A1", "resultado": "fallo"}