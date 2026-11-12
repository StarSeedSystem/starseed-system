#!/usr/bin/env python3
"""Pruebas de actividad_notebooklm sin el CLI: `ejecutar` va inyectado (SDP1111J)."""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import actividad_notebooklm as A  # noqa: E402

CUADERNOS = {"notebooks": [{"id": "nb1", "title": "Cuaderno 1"}]}
FUENTES = {"sources": [{"id": "s1", "title": "Fuente A", "url": "https://ejemplo.org/a",
                         "created_at": "2026-11-10T10:00:00"}]}
NOTAS = {"notes": [{"id": "n1", "title": "Nota A"}]}


def cli_falso(llamadas, cuadernos=CUADERNOS, fuentes=FUENTES, notas=NOTAS, error=None):
    """Un `ejecutar` de mentira: responde por orden y deja constancia de lo que le pidieron."""
    def ejecutar(args):
        llamadas.append(list(args))
        orden = " ".join(args)
        if error is not None and " source " not in orden and " note " not in orden:
            return error
        if " source list" in orden:
            return {"codigo": 0, "stdout": json.dumps(fuentes), "stderr": ""}
        if " note list" in orden:
            return {"codigo": 0, "stdout": json.dumps(notas), "stderr": ""}
        return {"codigo": 0, "stdout": json.dumps(cuadernos), "stderr": ""}
    return ejecutar


def test_sin_cli_no_falla_y_dice_el_motivo():
    resultado = A.leer(buscar=lambda: None)
    assert resultado["ok"] is True
    assert resultado["fichas"] == []
    assert "CLI" in resultado["motivo"]


def test_lista_los_cuadernos_de_los_dos_perfiles():
    llamadas = []
    resultado = A.leer(ejecutar=cli_falso(llamadas))
    assert resultado["ok"] is True
    assert [c["perfil"] for c in resultado["cuadernos"]] == ["default", "fundacion"]
    assert resultado["cuadernos"][0]["cuenta"] == "alexbordongarrigos@gmail.com"
    assert resultado["cuadernos"][1]["cuenta"] == "fundacionstarseed@gmail.com"
    assert llamadas[0][:3] == ["-p", "default", "list"]


def test_las_fichas_son_privadas_y_de_cada_cuenta():
    llamadas = []
    resultado = A.leer(ejecutar=cli_falso(llamadas))
    assert len(resultado["fichas"]) == 4
    assert all(f["privado"] is True for f in resultado["fichas"])
    assert sorted({f["cuenta"] for f in resultado["fichas"]}) == ["alexbordongarrigos@gmail.com",
                                                                  "fundacionstarseed@gmail.com"]
    assert sorted({f["tipo"] for f in resultado["fichas"]}) == ["fuente", "nota"]
    fuente = [f for f in resultado["fichas"] if f["tipo"] == "fuente"][0]
    assert fuente["titulo"] == "Fuente A" and fuente["enlace"] == "https://ejemplo.org/a"
    assert fuente["fecha"] == "2026-11-10T10:00:00"


def test_la_sesion_caducada_no_reintenta_el_login():
    llamadas = []
    caducada = {"codigo": 1, "stdout": "",
                "stderr": "Unauthorized: session expired. Run 'notebooklm login'"}
    resultado = A.leer(ejecutar=cli_falso(llamadas, error=caducada))
    assert resultado["ok"] is True
    assert resultado["fichas"] == []
    assert "sesión" in resultado["motivo"].lower() or "no válida" in resultado["motivo"].lower()
    assert not any("login" in " ".join(c) for c in llamadas)


def test_las_ordenes_llevan_el_perfil_y_el_cuaderno():
    llamadas = []
    A.leer(ejecutar=cli_falso(llamadas))
    assert ["-p", "default", "list", "--json"] in llamadas
    assert ["-p", "default", "source", "list", "-n", "nb1", "--json"] in llamadas
    assert ["-p", "fundacion", "note", "list", "-n", "nb1", "--json"] in llamadas


def test_la_segunda_pasada_en_el_nodo_no_repite_y_deja_las_fichas(tmp_path):
    llamadas = []
    primera = A.leer(ejecutar=cli_falso(llamadas), dir_actividad=str(tmp_path))
    assert primera["ok"] is True and len(primera["fichas"]) == 4
    segunda = A.leer(ejecutar=cli_falso(llamadas), dir_actividad=str(tmp_path))
    assert segunda["fichas"] == []
    assert len(os.listdir(str(tmp_path / "fichas"))) == 2
    assert os.path.exists(str(tmp_path / "notebooklm-estado.json"))


def test_solo_sale_lo_nuevo_desde_la_ultima_pasada():
    llamadas = []
    primera = A.leer(ejecutar=cli_falso(llamadas))
    assert len(primera["fichas"]) == 4
    segunda = A.leer(ejecutar=cli_falso(llamadas), estado=primera["estado"])
    assert segunda["fichas"] == []
    nuevas = {"sources": [{"id": "s2", "title": "Fuente B"}]}
    tercera = A.leer(ejecutar=cli_falso(llamadas, fuentes=nuevas), estado=segunda["estado"])
    assert [f["titulo"] for f in tercera["fichas"]] == ["Fuente B", "Fuente B"]


def test_guarda_las_fichas_y_el_estado_en_el_nodo(tmp_path):
    llamadas = []
    resultado = A.leer(ejecutar=cli_falso(llamadas))
    guardado = A.guardar(resultado["estado"], resultado["fichas"], "default", "2026-11-11",
                         dir_actividad=str(tmp_path))
    assert os.path.exists(guardado["fichas"]) and os.path.exists(guardado["estado"])
    volcado = json.load(open(guardado["fichas"], encoding="utf-8"))
    assert volcado["privado"] is True and volcado["fichas"]
    assert A.leer_estado(guardado["estado"]) == resultado["estado"]


def test_los_perfiles_son_las_cuentas_de_alex():
    assert A.PERFILES["default"] == "alexbordongarrigos@gmail.com"
    assert A.PERFILES["fundacion"] == "fundacionstarseed@gmail.com"


def test_filas_acepta_lista_suelta_y_envoltorio():
    assert A.filas({"sources": [{"id": "s1"}]}, "sources") == [{"id": "s1"}]
    assert A.filas([{"id": "n1"}], "notes") == [{"id": "n1"}]
    assert A.filas({}, "notes") == []


def test_sin_sesion_en_mac_devuelve_cero_fichas_con_motivo():
    """(PET1112C) En la Mac, si el CLI existe pero la sesión está caducada, no falla;
    devuelve ok=True con cero fichas y motivo explicativo."""
    llamadas = []
    caducada = {"codigo": 1, "stdout": "",
                "stderr": "Unauthorized: session expired. Run 'notebooklm login'"}
    resultado = A.leer(ejecutar=cli_falso(llamadas, error=caducada))
    assert resultado["ok"] is True
    assert resultado["fichas"] == []
    assert "sesión" in resultado["motivo"].lower() or "no válida" in resultado["motivo"].lower()


def test_sin_cli_en_mac_devuelve_cero_fichas_con_motivo():
    """(PET1112C) En la Mac, si no hay CLI, no falla; devuelve ok=True con cero fichas."""
    resultado = A.leer(buscar=lambda: None)
    assert resultado["ok"] is True
    assert resultado["fichas"] == []
    assert "CLI" in resultado["motivo"] or "cli" in resultado["motivo"].lower()
