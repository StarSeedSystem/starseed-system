#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ola 1025S · IMG1025B: el análisis de la Imaginación llega a la flota aunque la Mac tenga presión de memoria.

Antes, reimaginar y preparar entregables esperaban a `toca_ejecutar` (que es falso con presión 2, casi
siempre en la Mac de 8 GB) y, encoladas, nadie lanzaba sus colas `cola-suenos-*`: la reimaginación caducaba.

Ola 1029B · IMG1029B: ninguna propuesta se queda «nueva» más de un ciclo. Una «nueva» que otro proceso
escribió en `propuestas.json` (o que quedó aplazada) con la misma firma decide a la siguiente pasada."""
import json, os, sys, tempfile, time, unittest
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autodesarrollo_logica as AL  # noqa: E402
import autodesarrollo_decidir as AD  # noqa: E402
import autodesarrollo_reimaginar as AR  # noqa: E402
import director_autodesarrollo as D  # noqa: E402

AHORA = datetime(2026, 10, 25, 13, 0)
CAP = {"huecos_mac": 0, "huecos_a1": 0, "huecos_nube": 0, "proveedores_con_cupo": 3, "presion_mac": 2}
INTELIGENTE = {"modo": "inteligente"}


class TocaAnalizar(unittest.TestCase):
    def test_presion_y_sin_huecos_no_frenan_el_analisis(self):
        self.assertFalse(AL.toca_ejecutar(AHORA, INTELIGENTE, CAP)[0])
        ok, motivo = AL.toca_analizar(AHORA, INTELIGENTE, CAP)
        self.assertTrue(ok); self.assertIn("propio tope", motivo)

    def test_sin_cupo_o_sin_dato_no(self):
        self.assertEqual(AL.toca_analizar(AHORA, INTELIGENTE, dict(CAP, proveedores_con_cupo=0)),
                         (False, "ningún proveedor tiene cupo"))
        self.assertFalse(AL.toca_analizar(AHORA, INTELIGENTE, None)[0])

    def test_respeta_las_franjas_de_alex(self):
        franjas = {"modo": "franjas", "franjas": [{"desde": "01:00", "hasta": "05:00", "dias": [0, 1, 2, 3, 4, 5, 6]}]}
        self.assertEqual(AL.toca_analizar(AHORA, franjas, CAP), (False, "fuera de las franjas elegidas"))
        self.assertTrue(AL.toca_analizar(AHORA.replace(hour=3), franjas, CAP)[0])


class Flota(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.raiz = self.t.name
        self.olas = os.path.join(self.raiz, "starseed_memory_root", "olas")
        os.makedirs(self.olas)

    def tearDown(self):
        self.t.cleanup()

    def cola(self, nombre, tareas):
        with open(os.path.join(self.olas, nombre), "w", encoding="utf-8") as f:
            json.dump(tareas, f)

    def leer(self, nombre):
        with open(os.path.join(self.olas, nombre), encoding="utf-8") as f:
            return json.load(f)

    def test_tareas_esperadas_solo_lo_reciente_y_esperado(self):
        mem = os.path.join(self.raiz, "starseed_memory_root")
        self.cola("cola-suenos-reimaginar-2026-10-25.json", [{"id": "RIM-a"}, {"id": "RIM-vuelta"}])
        self.cola("cola-suenos-entregables-2026-10-24.json", [{"id": "ENT-b"}])
        self.cola("cola-suenos-reimaginar-2026-10-01.json", [{"id": "RIM-vieja"}])
        self.cola("cola-1025-codigo.json", [{"id": "RIM-a2"}])  # una cola de código no es de la Imaginación
        ids = {"RIM-a", "ENT-b", "RIM-vieja", "RIM-a2"}
        self.assertEqual([t["id"] for t in AR.tareas_esperadas(mem, ids, AHORA)], ["ENT-b", "RIM-a"])

    def test_a_la_cola_viva_sin_repetir_ni_sustituir(self):
        self.cola("cola-auto-mac.json", [{"id": "COD-1", "titulo": "código"}, {"id": "RIM-a", "estado_propio": "x"}])
        vivos = [{"pid": 41, "cola": "cola-auto-mac.json", "segundos": 60, "solo": False}]
        instalado = time.time() - 3600  # se instaló hace una hora y el vivo arrancó hace un minuto
        r = AR.a_la_flota(self.raiz, [{"id": "RIM-a", "tipo": "analisis"}, {"id": "ENT-b", "tipo": "analisis"}],
                          vivos=vivos, apto=(True, instalado), libre=(True, instalado))
        self.assertEqual((r["accion"], r["tareas"], r["ya_estaban"], r["pid"]), ("tanda_viva", 1, 1, 41))
        viva = self.leer("cola-auto-mac.json")
        self.assertEqual([t["id"] for t in viva], ["COD-1", "RIM-a", "ENT-b"])
        self.assertEqual(viva[1], {"id": "RIM-a", "estado_propio": "x"})  # lo que ya estaba no se toca

    def test_cola_en_forma_de_diccionario(self):
        self.cola("cola-1025.json", {"ola": "1025", "tareas": [{"id": "COD-1"}]})
        vivos = [{"pid": 7, "cola": "cola-1025.json", "segundos": 5, "solo": False}]
        r = AR.a_la_flota(self.raiz, [{"id": "RIM-z"}], vivos=vivos, apto=(True, 1.0), libre=(True, 1.0))
        self.assertEqual(r["accion"], "tanda_viva")
        self.assertEqual(self.leer("cola-1025.json"), {"ola": "1025", "tareas": [{"id": "COD-1"}, {"id": "RIM-z"}]})

    def test_nunca_arranca_un_orquestador_ni_usa_uno_viejo(self):
        t = [{"id": "RIM-a"}]
        self.assertEqual(AR.a_la_flota(self.raiz, t, vivos=[], apto=(True, 1.0), libre=(True, 1.0))["accion"], "cola_lista")
        viejo = [{"pid": 9, "cola": "cola-x.json", "segundos": 10 ** 9, "solo": False}]  # arrancó antes de instalar
        self.assertEqual(AR.a_la_flota(self.raiz, t, vivos=viejo, apto=(True, time.time()), libre=(True, time.time()))["accion"],
                         "esperar")
        manual = [{"pid": 9, "cola": "cola-x.json", "segundos": 5, "solo": True}]
        self.assertEqual(AR.a_la_flota(self.raiz, t, vivos=manual, apto=(True, 1.0), libre=(True, 1.0))["accion"], "esperar")
        self.assertFalse(os.path.exists(os.path.join(self.olas, "cola-x.json")))

    def test_reinstalar_el_orquestador_no_congela_la_reimaginacion(self):
        self.cola("cola-1025.json", [])
        vivos = [{"pid": 7, "cola": "cola-1025.json", "segundos": 600, "solo": False}]  # arrancó hace 10 min
        r = AR.a_la_flota(self.raiz, [{"id": "RIM-a"}], vivos=vivos, apto=(True, time.time()),  # orquestador recién instalado
                          libre=(True, time.time() - 86400))  # el analista, de ayer
        self.assertEqual(r["accion"], "tanda_viva")

    def test_sin_analista_libre_instalado_espera_en_su_cola(self):
        vivos = [{"pid": 7, "cola": "cola-1025.json", "segundos": 5, "solo": False}]
        r = AR.a_la_flota(self.raiz, [{"id": "RIM-a"}], vivos=vivos, apto=(True, 1.0), libre=(False, 0.0))
        self.assertEqual(r["accion"], "cola_lista"); self.assertIn("instalar.sh", r["motivo"])

    def test_sin_tareas_no_hace_nada(self):
        self.assertEqual(AR.a_la_flota(self.raiz, [], vivos=[]), {"accion": "nada", "tareas": 0})


# ─────────────── Ola 1029B · IMG1029B: «nueva» no dura más de un ciclo ───────────────
AJUSTES = {"automatico": True, "auto": {"aprobar": True, "reimaginar": True, "umbral": 0.75,
                                        "max_reimaginaciones": 2}}
ISO = "2026-10-29T12:00:00"


def _ajustes(auto):
    d = {**AJUSTES, "automatico": auto, "auto": {**AJUSTES["auto"], "aprobar": auto, "reimaginar": auto}}
    return AL.validar_ajustes(d)


class NadaNuevaMasDeUnCiclo(unittest.TestCase):
    def _lote(self, previas, aj, firma):
        return D._decidir_lote(previas, [], aj, lambda r: True, None, ISO, firma)

    def test_nueva_contada_el_ciclo_pasado_redecide_con_la_misma_firma(self):
        aj = _ajustes(True)
        firma = AD.firma(aj)
        nueva = {"id": "agentes:a", "fuente": "agentes", "tipo": "codigo", "ambito": "metagenesis",
                 "titulo": "Arreglar la cache de la cola en src/lib/x.ts", "cuerpo": "ajustar src/lib/x.ts",
                 "archivos": ["src/lib/x.ts"], "cita": "", "verificacion": "verificado", "impacto": 8,
                 "esfuerzo": 8, "origen": {}, "estado": "nueva", "auto_firma": firma}
        decidida = dict(nueva, id="agentes:b", titulo="Documentar la cola de suenos",
                        cuerpo="escribir la guia", verificacion="sin verificar", impacto=1, esfuerzo=10,
                        estado="autodesarrollo")
        previas = {p["id"]: p for p in (nueva, decidida)}
        self._lote(previas, aj, firma)
        self.assertEqual(nueva["estado"], "autodesarrollo")  # la «nueva» sale con destino de una vez
        self.assertEqual(decidida["estado"], "autodesarrollo")  # lo ya decidido con esa firma no se toca

    def test_nueva_con_motivo_de_pregunta_queda_en_pregunta(self):
        aj = _ajustes(False)  # automático entero apagado: la firma es None (como el ciclo real)
        atascada = {"id": "astraura:cr-1", "fuente": "astraura", "titulo": "Instalar las credenciales de R2",
                    "cuerpo": "instalar las credenciales de R2 en el backend", "archivos": [], "cita": "",
                    "verificacion": "sin_verificar", "impacto": 3, "esfuerzo": 3,
                    "origen": {"id": "cr-1", "tipo": "creacion", "status": "pending_approval"},
                    "estado": "nueva",
                    "motivo": "no accionable por el enjambre (credenciales): es de Alex → pregunta"}
        previas = {atascada["id"]: atascada}
        reparto = self._lote(previas, aj, None)
        self.assertEqual(atascada["estado"], "pregunta")
        self.assertEqual(atascada.get("motivo") or "", "no accionable por el enjambre (credenciales): es de Alex → pregunta")
        self.assertEqual(reparto.get("pregunta"), 1)
        self.assertTrue("pregunta" in str(atascada.get("motivo_destino") or ""))


if __name__ == "__main__":
    unittest.main()
