#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Puerta de las dos automatizaciones que actúan SIN NADIE DELANTE.

Las dos decidían por un valor que no significaba lo que el código creía:

  1. `director-orquestacion.py` integraba en `main` una rama retenida en la puerta de visto
     bueno si la `nota` de `progreso.json` contenía «revisión ok». Pero el orquestador
     escribía ese «ok» con solo que el revisor **hubiese contestado algo**
     (`"ok" if rev else "sin revisor"`), y `debe_pedir_visto_bueno()` levanta la puerta
     también por **alcance incompleto**: esa rama traía «revisión ok» y se aprobaba sola a
     los diez minutos. La puerta de la Ola 261 se abría por la razón equivocada.
  2. `guardia-memoria.py` reanudaba (SIGCONT) un `llama-server` con solo que existiera el
     archivo de marca, sin comprobar que el pid marcado fuera ese proceso. BitNet cambia de
     pid al reiniciarse (segfalla en `dequantize_row_i2_s`), así que con una marca vieja en
     /tmp se reanudaba un motor que el dueño hubiera parado él mismo — lo contrario de lo
     que promete la cabecera del módulo. Y `libres_mb()` devolvía 99999 ante un fallo de
     `vm_stat`: prudente para congelar, pero eso **cumple** `libres > REANUDAR_SOBRE_MB`, de
     modo que «ante la duda, no tocar nada» reanudaba.

Corre con pytest y con `python3` a secas (en el contenedor no hay pytest).
"""
import os
import sys

DIR = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(DIR))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

from aprobacion_logica import MOTIVO_RUTINA, porque_no_verde, revision_ok

ORQUESTADOR = os.path.join(RAIZ, "scripts", "enjambre", "starseed-enjambre.py")
GUARDIA = os.path.join(DIR, "guardia-memoria.py")
DIRECTOR = os.path.join(DIR, "director-orquestacion.py")
LOGICA = os.path.join(DIR, "aprobacion_logica.py")

# La `nota` exacta que escribía el orquestador cuando el revisor había contestado algo.
NOTA_LEGADO = "rama ola/Q1 (a1b2c3d) lista · revisión ok"


def _leer(ruta):
    with open(ruta, encoding="utf-8") as f:
        return f.read()


# ── 1. La decisión de abrir la puerta ────────────────────────────────────────────────

def test_alcance_incompleto_no_se_aprueba_solo():
    """El caso medido: bloqueante=False, revisor contestó, pero faltaba alcance."""
    e = {"estado": "esperando_aprobacion", "revisor": "respondio",
         "faltan": ["src/lib/nucleo/ui-spec.ts"],
         "motivo_vb": "alcance incompleto: faltan src/lib/nucleo/ui-spec.ts",
         "nota": NOTA_LEGADO}
    assert not revision_ok(e)
    assert "alcance incompleto" in porque_no_verde(e)


def test_revision_bloqueante_no_se_aprueba_sola():
    e = {"revisor": "bloqueante", "motivo_vb": "revisión bloqueante confirmada"}
    assert not revision_ok(e)
    assert "bloqueante" in porque_no_verde(e)


def test_la_nota_de_legado_ya_no_abre_la_puerta():
    """La subcadena que bastaba para integrar en `main` ya no decide nada.

    Una entrada anterior a este cambio no trae campos: se queda para una persona.
    """
    e = {"estado": "esperando_aprobacion", "nota": NOTA_LEGADO}
    assert not revision_ok(e)
    assert "sin veredicto" in porque_no_verde(e)


def test_sin_revisor_no_se_aprueba_solo():
    e = {"revisor": "sin_revisor", "motivo_vb": "pedido por la cola (--aprobacion)"}
    assert not revision_ok(e)
    assert "no hubo revisor" in porque_no_verde(e)


def test_puerta_de_politica_con_revisor_si_se_aprueba_sola():
    """Lo que el director SÍ debe seguir haciendo: su razón de existir."""
    e = {"revisor": "respondio", "faltan": [],
         "motivo_vb": "pedido por la cola (--aprobacion / STARSEED_APROBACION / aprobacion en la tarea)"}
    assert revision_ok(e), porque_no_verde(e)
    assert porque_no_verde(e) == ""


def test_motivo_desconocido_no_se_aprueba_solo():
    """Un motivo nuevo que nadie ha revisado aún se queda cerrado, no abierto."""
    e = {"revisor": "respondio", "motivo_vb": "motivo que se invente una ola futura"}
    assert not revision_ok(e)


def test_entrada_ilegible_no_se_aprueba_sola():
    assert not revision_ok(None)
    assert not revision_ok("revisión ok")


# ── 2. Que el veredicto viaje: el orquestador tiene que escribir los campos ──────────

def test_orquestador_escribe_veredicto_motivo_y_faltan():
    src = _leer(ORQUESTADOR)
    i = src.find('estado="esperando_aprobacion"')
    assert i > 0, "no se encuentra la escritura de `esperando_aprobacion`: la puerta dejó de ver el árbol"
    bloque = src[i - 700:i + 700]
    for campo in ("revisor=", "motivo_vb=", "faltan="):
        assert campo in bloque, (
            "`%s` no viaja con la puerta. El motivo que la levanta tiene que llegar a quien "
            "decide abrirla; si no, la abre por la razón equivocada." % campo)


def test_el_decisor_no_mira_la_prosa_de_nota():
    """Quien decide no puede volver a decidir por subcadena."""
    src = _leer(LOGICA)
    cuerpo = src[src.find("def porque_no_verde"):]
    assert 'entrada.get("nota")' not in cuerpo, (
        "la decisión volvió a leer `nota`: es prosa, y su «ok» solo dice que hubo revisor")
    assert "revisión ok" not in cuerpo


def test_el_director_delega_en_el_modulo_puro():
    src = _leer(DIRECTOR)
    assert "from aprobacion_logica import" in src
    assert 'nota = (entrada.get("nota")' not in src, "volvió la decisión por prosa al director"


# ── 3. El guardia: identidad del pid y duda en los DOS sentidos ──────────────────────

def test_el_guardia_compara_el_pid_marcado():
    src = _leer(GUARDIA)
    assert "def pid_marcado" in src, "la marca volvió a ser un sí/no en vez de una identidad"
    assert "marcado == pid" in src, (
        "reanudar ya no comprueba que el pid marcado sea ESE proceso: con una marca vieja se "
        "reanuda un motor que paró el dueño")
    assert "nuestro = os.path.exists(MARCA)" not in src


def test_el_guardia_marca_antes_de_congelar():
    """Si muere entre la marca y la señal, sobra una marca; al revés, el motor no vuelve."""
    src = _leer(GUARDIA)
    i_marca = src.find("marcar(pid)")
    i_stop = src.find("signal.SIGSTOP")
    assert i_marca > 0 and i_stop > 0, "la puerta dejó de ver el bloque de congelado"
    assert i_marca < i_stop, "se congela antes de marcar: un fallo ahí deja el motor parado para siempre"


def test_sin_medida_de_memoria_no_se_toca_nada():
    src = _leer(GUARDIA)
    assert "return None" in src and "return 99999" not in src, (
        "un centinela alto solo es prudente para congelar: también cumple el umbral de reanudar")
    assert "if libres is None:" in src, "falta la guarda: sin medida no se congela NI se reanuda"


# ── 4. Que la puerta no mienta en verde ─────────────────────────────────────────────

def test_la_puerta_ve_los_cuatro_archivos():
    """Una puerta que mide por patrón miente en verde cuando deja de ver el árbol."""
    for ruta in (ORQUESTADOR, GUARDIA, DIRECTOR, LOGICA):
        assert os.path.exists(ruta), "no se ve %s" % ruta
        assert len(_leer(ruta)) > 500
    assert MOTIVO_RUTINA == "pedido por la cola"


if __name__ == "__main__":
    fallos = 0
    pruebas = [(n, f) for n, f in sorted(globals().items())
               if n.startswith("test_") and callable(f)]
    for nombre, funcion in pruebas:
        try:
            funcion()
            print("  ok   %s" % nombre)
        except AssertionError as e:
            fallos += 1
            print("  ROJO %s: %s" % (nombre, e))
        except Exception as e:
            fallos += 1
            print("  ROJO %s: %s: %s" % (nombre, type(e).__name__, e))
    print("%s %d/%d" % ("ROJO" if fallos else "VERDE", len(pruebas) - fallos, len(pruebas)))
    sys.exit(1 if fallos else 0)
