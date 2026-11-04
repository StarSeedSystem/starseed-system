"""1103 · V: el A1 se reinstala solo cuando corre otra versión del paquete que esta neurona."""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import oracle_nodo as N  # noqa: E402

AHORA = 1793690000.0


def test_huella_estable_y_sensible():
    d = tempfile.mkdtemp()
    os.makedirs(os.path.join(d, "enjambre"))
    open(os.path.join(d, "enjambre", "a.py"), "w").write("uno")
    open(os.path.join(d, "b.sh"), "w").write("dos")
    h1 = N.huella_de_carpeta(d)
    open(os.path.join(d, N.HUELLA_PAQUETE), "w").write("lo que sea")
    assert N.huella_de_carpeta(d) == h1  # la huella no se cuenta a sí misma
    open(os.path.join(d, "enjambre", "a.py"), "w").write("uno cambiado")
    assert N.huella_de_carpeta(d) != h1 and len(h1) == 16


def test_decidir_reinstalar():
    assert N.decidir_reinstalar("abc", "abc", "espera", None, AHORA)[0] is False
    ok, motivo = N.decidir_reinstalar("abc", "", "guardian", None, AHORA)
    assert ok and "no dice" in motivo
    assert N.decidir_reinstalar("abc", "xyz", "espera", None, AHORA)[0]
    assert N.decidir_reinstalar("abc", "xyz", "cola", None, AHORA)[0] is False
    assert N.decidir_reinstalar("abc", "xyz", "espera", AHORA - 600, AHORA)[0] is False
    assert N.decidir_reinstalar("abc", "xyz", "espera", AHORA - 7 * 3600, AHORA)[0]
    assert N.decidir_reinstalar("", "xyz", "espera", None, AHORA)[0] is False
    # (1103 · W) con una build, un vitest, un tsc o un npm ci en marcha en el A1, se espera
    ok, motivo = N.decidir_reinstalar("abc", "xyz", "espera", None, AHORA, ocupado="proceso 4242")
    assert not ok and "compilando" in motivo


def test_decidir_poda_de_la_cache_del_a1():
    assert N.decidir_poda(5.0, "")[0]
    assert not N.decidir_poda(12.0, "")[0]
    assert not N.decidir_poda(5.0, "1234")[0]
    assert not N.decidir_poda(None, "")[0]


def test_preparar_deja_la_huella():
    raiz = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
    texto = open(os.path.join(raiz, "deploy", "oracle", "nodo", "preparar-a1.sh"), encoding="utf-8").read()
    assert 'cp "$PAQ/huella-paquete.txt" "$ESTADO/huella-paquete.txt"' in texto
