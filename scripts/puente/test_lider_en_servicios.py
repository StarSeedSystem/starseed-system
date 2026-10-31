# -*- coding: utf-8 -*-
"""Pruebas del líder en los servicios (IND1029Cb; y el rescate RTGUI1021K2-d3).

La Mac, el A1 y otras neuronas corren la misma autocuración y la misma autopublicación. Con el
arriendo de dirección (`lider_direccion`, IND1029B) solo leído, `autocuracion_mando.decidir_lider`
(PURA) dice si actúan: se espera SOLO si otra neurona tiene el arriendo vigente; sin puerta, sin
arriendo o con él caducado, como hoy. El líder va siempre inyectado: nada pregunta a la puerta real.
"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autocuracion_mando as A  # noqa: E402
import autopublicar as P  # noqa: E402
import lider_direccion as LD  # noqa: E402

T0, A1, MAC = 1_800_000_000.0, "oracle-a1-prueba", "mac-prueba"


def arriendo(dueno, caduca):
    return {"dueno": dueno, "caduca": caduca, "version": 3, "tomado": caduca - LD.CADUCA_S}


def otro_dirige(ahora=T0):
    return {"soy": False, "motivo": "dueño: %s" % A1, "arriendo": arriendo(A1, ahora + 120)}


class PuertaFalsa(object):
    """Lo mínimo que `lider_direccion.soy_lider` usa de la puerta, sin red."""
    def __init__(self, datos):
        self.datos = datos

    def configurada(self):
        return True

    disponible = configurada

    def _pedir(self, metodo, ruta, cuerpo=None, timeout=8):
        return 200, {"latidos": [] if self.datos is None else [{"id": LD.ID, "datos": self.datos}]}


class DecidirLider(unittest.TestCase):
    def test_sin_saber_quien_dirige_actua_como_hoy(self):
        for lider in (None, "roto", {}, {"soy": True, "motivo": "sin puerta o sin red: líder en local"}):
            self.assertTrue(A.decidir_lider(lider, T0)[0], lider)

    def test_otra_neurona_con_arriendo_vigente_espera_y_dice_quien(self):
        self.assertEqual(A.decidir_lider(otro_dirige(), T0), (False, "espera: dirige %s" % A1))

    def test_arriendo_caducado_vacio_o_ilegible_no_deja_a_nadie_parado(self):
        for a in (arriendo(A1, T0 - 1), None, {"dueno": "", "caduca": T0 + 60}, {"dueno": A1, "caduca": "x"}):
            actua, porque = A.decidir_lider({"soy": False, "motivo": "tomado: libre", "arriendo": a}, T0)
            self.assertTrue(actua, a)
            self.assertIn("sigo en local", porque)

    def test_con_la_eleccion_real_de_ind1029b(self):
        decide = lambda yo, datos: A.decidir_lider(LD.soy_lider(yo, T0, PuertaFalsa(datos)), T0)[0]
        self.assertFalse(decide(MAC, arriendo(A1, T0 + 100)))  # dirige el A1: la Mac mira
        self.assertTrue(decide(A1, arriendo(A1, T0 + 100)))    # el A1 lee su propio arriendo
        self.assertTrue(decide(MAC, arriendo(A1, T0 - 30)))    # el A1 cayó: la Mac no se queda parada
        self.assertTrue(decide(MAC, None))                     # nadie lo tomó nunca: como hoy


class PasadaCompleta(unittest.TestCase):
    """La pasada de autocuración no se salta ningún trabajo cuando toca hacerlo."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="lider-servicios-")
        self.addCleanup(self.tmp.cleanup)
        self._estado, self._publicacion = A.ESTADO, A.PUBLICACION
        A.ESTADO = os.path.join(self.tmp.name, "autocuracion.json")
        A.PUBLICACION = os.path.join(self.tmp.name, "publicacion.json")
        self.hecho = {}
        self.addCleanup(setattr, A, "_lider", A._lider)

    def tearDown(self):
        A.ESTADO, A.PUBLICACION = self._estado, self._publicacion

    def _apunta(self, clave, valor):
        def fn(*_args, **_kwargs):
            self.hecho[clave] = self.hecho.get(clave, 0) + 1
            return valor
        return fn

    def _revisar(self, sondas=True, libre=20.0, **mas):
        return A.revisar(
            ahora=100_000,
            sondear_fn=lambda: sondas,
            reiniciar_fn=self._apunta("reiniciar", None),
            limpiar_fn=lambda ids: (self._apunta("limpiar", {"ok": True, "limpiados": list(ids)})()),
            libre_fn=lambda: libre,
            avisar_fn=lambda _texto: None,
            dormir=lambda _s: None,
            asignar_fn=self._apunta("asignar", ({"puede": False}, lambda: [])),
            buscar_fn=self._apunta("buscar", {}),
            traer_fn=self._apunta("traer", True),
            curar_fn=self._apunta("curar", ""),
            medidores_fn=self._apunta("medidores", []),
            worktrees_fn=self._apunta("worktrees", {}),
            reparar_fn=self._apunta("reparar", None),
            explabs_fn=self._apunta("explabs", None),
            relevo_fn=self._apunta("relevo", {}),
            a1_fn=self._apunta("a1", None),
            forzar=True, **mas)

    def test_una_pasada_completa_hace_cada_trabajo(self):
        A._lider = lambda: self.fail("con medios inyectados no se pregunta a la puerta real")
        estado = self._revisar()
        for clave in ("asignar", "curar", "buscar", "traer", "a1", "reparar", "relevo", "explabs"):
            self.assertEqual(self.hecho.get(clave), 1, clave)
        self.assertTrue(estado["dirijo"])
        self.assertIn("hechos", estado)

    def test_si_dirige_otra_neurona_solo_cuida_esta_maquina_y_lo_dice(self):
        estado = self._revisar(libre=4.0, lider_fn=otro_dirige)
        for clave in ("asignar", "buscar", "traer", "curar", "reparar", "relevo", "a1"):
            self.assertNotIn(clave, self.hecho, clave)
        for clave in ("limpiar", "worktrees", "medidores", "explabs"):  # lo de esta máquina, sí
            self.assertIn(clave, self.hecho, clave)
        self.assertFalse(estado["dirijo"])
        self.assertIn("espera: dirige %s: solo cuido esta máquina" % A1, estado["hechos"])
        self._revisar(sondas=False, lider_fn=otro_dirige)  # su propio Genesis caído sí lo reinicia
        self.assertEqual(self.hecho.get("reiniciar"), 1)


class Doble(object):
    """Medios de la autopublicación: registra git y gh; el líder va inyectado."""
    def __init__(self, lider):
        self.lider, self.gits, self.ghs = (lambda _ahora: lider), [], []
        self.interruptor, self.publicando_a_mano = (lambda: True), (lambda: False)

    def git(self, args, timeout=None):
        self.gits.append(args[0])
        return 0, ("0" if args[0] == "rev-list" else "a" * 40), ""

    def gh(self, ruta):
        return self.ghs.append(ruta) or []


class Autopublicacion(unittest.TestCase):
    def test_sin_ser_lider_no_publica_ni_sube_candidatos_y_dice_quien_dirige(self):
        m = Doble((False, "espera: dirige %s" % A1))
        e = P.pasada(m, {"fase": "ci", "sha": "a" * 40}, T0)
        self.assertEqual((e["fase"], e["detalle"], m.gits, m.ghs), ("esperando", "espera: dirige %s." % A1, [], []))

    def test_lo_ya_empujado_lo_termina_de_verificar_aunque_no_dirija(self):
        m = Doble((False, "espera: dirige %s" % A1))
        self.assertEqual(P.pasada(m, {"fase": "verificando", "sha": "a" * 40, "desde": T0}, T0 + 60)["fase"], "verificando")
        self.assertNotIn("push", m.gits)
        self.assertTrue(m.ghs)

    def test_el_lider_sigue_como_hoy(self):
        m = Doble((True, "líder vigente"))
        self.assertEqual(P.pasada(m, {}, T0)["fase"], "al-dia")
        self.assertIn("fetch", m.gits)

    def test_los_medios_reales_leen_el_arriendo_y_ante_un_fallo_siguen_en_local(self):
        self.addCleanup(setattr, LD, "soy_lider", LD.soy_lider)
        LD.soy_lider = otro_dirige
        self.assertEqual(P.Medios().lider(T0), (False, "espera: dirige %s" % A1))
        LD.soy_lider = lambda: 1 / 0
        actua, porque = P.Medios().lider(T0)
        self.assertTrue(actua)
        self.assertIn("ZeroDivisionError", porque)


if __name__ == "__main__":
    unittest.main()
