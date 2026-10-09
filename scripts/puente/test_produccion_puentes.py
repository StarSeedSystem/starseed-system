"""Pruebas puras de produccion_puentes."""
import os, tempfile, unittest
from datetime import datetime
import produccion_puentes as pp

class TestPuentes(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.mkdtemp()
        self.path=os.path.join(self.tmp,"puentes.json")
        pp.STATE_PATH=self.path

    def test_sin_config(self):
        activos=pp.activos({})
        ids=[b["id"] for b in activos]
        self.assertIn("bandeja",ids)
        self.assertNotIn("n8n_hf",ids)

    def test_cupo_90(self):
        pp._guardar({"n8n_hf":{"usos_mes":900,"mes":"2026-10","latencia_media":1,"peso":0.5,"fallos_seguidos":0}})
        b={"id":"n8n_hf","cupo":1000}
        self.assertFalse(pp._cupo_libre(b,pp._cargar()))

    def test_falla_entra_segundo(self):
        def enviar(b,d):
            return (b["id"]=="n8n_cloud",0.1)
        entorno={"N8N_HF_URL":"u","N8N_CLOUD_URL":"u"}
        res=pp.enrutar("evento","redes",{},entorno,enviar,datetime(2026,1,1))
        self.assertEqual(res["puente"],"n8n_cloud")

    def test_todos_caen(self):
        def enviar(b,d):
            return (False,None)
        entorno={"N8N_HF_URL":"u","N8N_CLOUD_URL":"u"}
        res=pp.enrutar("evento","redes",{},entorno,enviar,datetime(2026,1,1))
        self.assertFalse(res["ok"])
        self.assertEqual(res["motivo"],"sin puentes")

    def test_latencia_actualizada(self):
        ahora=datetime(2026,2,1)
        pp.actualizar_estado("n8n_hf",True,0.5,ahora)
        st=pp._cargar()["n8n_hf"]
        self.assertAlmostEqual(st["latencia_media"],0.5)
        pp.actualizar_estado("n8n_hf",True,0.9,ahora)
        st=pp._cargar()["n8n_hf"]
        self.assertNotEqual(st["latencia_media"],0.5)
        self.assertGreater(st["latencia_media"],0.5)

    def test_reinicio_mes_y_peso(self):
        ahora=datetime(2026,2,1)
        pp.actualizar_estado("n8n_hf",True,0.2,ahora)
        st=pp._cargar()["n8n_hf"]
        self.assertEqual(st["usos_mes"],1)
        self.assertGreater(st["peso"],0.5)
        pp.actualizar_estado("n8n_hf",False,None,ahora)
        st=pp._cargar()["n8n_hf"]
        self.assertEqual(st["usos_mes"],1)

if __name__=="__main__":
    unittest.main()


class EntornoPorDefecto(unittest.TestCase):
    """(2026-10-09) Sin `entorno`, `enrutar` usa el del proceso y no un dict compartido."""

    def test_sin_entorno_usa_el_del_proceso(self):
        import produccion_puentes as pp
        from unittest import mock
        with tempfile.TemporaryDirectory() as d, mock.patch.object(pp, "STATE_PATH", os.path.join(d, "p.json")), \
                mock.patch.dict(os.environ, {"N8N_HF_URL": "u"}, clear=False):
            res = pp.enrutar("evento", "redes", {}, enviar=lambda b, datos: (b["id"] == "n8n_hf", 0.1),
                             ahora=datetime(2026, 1, 1))
        self.assertEqual(res, {"puente": "n8n_hf", "ok": True})

