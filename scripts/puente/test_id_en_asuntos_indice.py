"""(2026-10-19) id_en_asuntos con índice responde igual que la regex original."""
import os, re, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vigilante_logica as vl


def original(tid, asuntos):
    patron = re.compile(r"(?:^|·\s*)%s\s*:" % re.escape(tid))
    return any(patron.search(a) for a in asuntos)


class IdEnAsuntosIndice(unittest.TestCase):
    ASUNTOS = [
        "Ola 228 · V2: algo", "345 · NE3-1: otra", "salvavidas · NE3-1: más",
        "reparto a la nube (CC2, MD1)", "p318I: directo", "MetaGenesis · MGP1011-1ECCC4d: Puerta en rojo",
        "Ola 1019D · Diseño · DSN1019A : con espacio", "sin dos puntos · X1", "·  RTCOL1012Bb:pegado",
        "S1010-EV-ORACLE-1abd: guiones", "", "texto: con · Y2: doble",
    ]
    IDS = ["V2", "NE3-1", "CC2", "MD1", "p318I", "MGP1011-1ECCC4d", "DSN1019A", "X1", "RTCOL1012Bb",
           "S1010-EV-ORACLE-1abd", "Y2", "texto", "Ola 228", "NE3", "V", "", "345"]

    def test_igual_que_la_regex(self):
        for tid in self.IDS:
            for coleccion in (self.ASUNTOS, tuple(self.ASUNTOS)):
                esperado = original(tid, coleccion) if tid else False
                self.assertEqual(vl.id_en_asuntos(tid, coleccion), esperado, tid)

    def test_generador_sigue_funcionando(self):
        self.assertTrue(vl.id_en_asuntos("V2", (a for a in self.ASUNTOS)))

    def test_lista_que_crece_no_queda_vieja(self):
        lista = ["A1: uno"]
        self.assertFalse(vl.id_en_asuntos("B2", lista))
        lista.append("B2: dos")
        self.assertTrue(vl.id_en_asuntos("B2", lista))


if __name__ == "__main__":
    unittest.main()
