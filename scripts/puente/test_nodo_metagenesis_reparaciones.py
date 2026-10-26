import unittest
import re
from typing import Dict, Any, List

# Simulación de las funciones base_de_tarea y base necesarias para el test
def base_de_tarea(tid: Any) -> str:
    tid = str(tid or "")
    # Simplificación basada en el contexto de que la cadena suele tener sufijos -dN, -b, -c
    m = re.match(r"^(.*?)(?:-[a-zA-Z0-9]+)*$", tid)
    return m.group(1) if m else tid

def reparaciones_superadas(tareas: List[Dict[str, Any]], progreso: Dict[str, Any], publicacion: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Devuelve las tareas de reparación no cerradas que ya no aplican porque la publicación está en verde."""
    pub_sha = publicacion.get("sha")
    pub_fase = publicacion.get("fase")
    if pub_fase in ("publicada", "ok"):
        pass # En verde
    elif pub_sha and pub_sha != publicacion.get("sha_rojo"):
        pass # Publicado un sha distinto
    else:
        return []

    res = []
    for t in tareas:
        if t.get("origen") == "metagenesis" and "Puerta de publicación en rojo" in str(t.get("titulo", "")):
            tid = str(t.get("id"))
            estado = (progreso.get(tid) or {}).get("estado") if isinstance(progreso.get(tid), dict) else ""
            if estado not in ("hecho", "integrada", "sustituida", "rechazada", "descartada", "obsoleta"):
                res.append((tid, "NO APLICA: la puerta de publicación volvió a verde (publicado %s)" % pub_sha))
    return res

class TestReparaciones(unittest.TestCase):
    def test_reparaciones_superadas(self):
        tareas = [
            {"id": "T1", "origen": "metagenesis", "titulo": "Puerta de publicación en rojo 1"},
            {"id": "T2", "origen": "metagenesis", "titulo": "Otra tarea"},
            {"id": "T3", "origen": "usuario", "titulo": "Puerta de publicación en rojo 3"},
        ]
        progreso = {"T1": {"estado": "pendiente"}}
        
        # Test 1: Publicación en verde (fase ok)
        pub_verde = {"fase": "ok", "sha": "sha_nuevo", "sha_rojo": "sha_rojo"}
        res = reparaciones_superadas(tareas, progreso, pub_verde)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0][0], "T1")

        # Test 2: Publicación aún roja
        pub_roja = {"fase": "bloqueado", "sha": "sha_rojo", "sha_rojo": "sha_rojo"}
        res = reparaciones_superadas(tareas, progreso, pub_roja)
        self.assertEqual(len(res), 0)

        # Test 3: Tarea ya cerrada
        progreso_cerrado = {"T1": {"estado": "hecho"}}
        res = reparaciones_superadas(tareas, progreso_cerrado, pub_verde)
        self.assertEqual(len(res), 0)

if __name__ == "__main__":
    unittest.main()
