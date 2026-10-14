"""Pruebas de nodo_metagenesis_medio.py para el latido (COL1012C)."""

import json
import os
import tempfile
import time
from unittest.mock import patch

import sys
# We will import nodo_metagenesis_medio inside the test function after setting env vars


def test_latido_incluye_nuevos_campos():
    # Crear un directorio temporal para simular el entorno
    with tempfile.TemporaryDirectory() as tmpdir:
        # Estructurar el directorio como el repo
        repo_root = os.path.join(tmpdir, "repo")
        os.makedirs(repo_root)
        os.makedirs(os.path.join(repo_root, ".git"))
        os.makedirs(os.path.join(repo_root, "starseed_memory_root", "olas"))
        os.makedirs(os.path.join(repo_root, "starseed_memory_root", "mando"))
        # Directorio del nodo
        nodo_dir = os.path.join(tmpdir, "nodo")
        os.makedirs(nodo_dir)
        # Establecer variables de entorno
        os.environ["STARSEED_NODO_DIR"] = nodo_dir
        os.environ["STARSEED_ROOT"] = repo_root

        # Ahora importar el módulo (después de establecer las variables de entorno)
        import nodo_metagenesis_medio as N
        from colmena_logica import FASES_CON_TRABAJO

        # Mockear gobernador_recursos.memoria_mb para devolver valores fijos
        def mock_memoria_mb():
            return {
                "ram_total_mb": 8192,
                "ram_libre_mb": 4096,
                # Los otros campos no son usados por capacidad_contenedor en este caso
            }
        with patch("nodo_metagenesis_medio.GR.memoria_mb", mock_memoria_mb):
            # Simular que estamos en una Mac (para que autoritativo sea True)
            with patch("nodo_metagenesis_medio.detectar_medio", return_value="mac"):
                # Simular que no hay orquestador avanzado (sabe_orquestar devuelve False)
                with patch("nodo_metagenesis_medio.sabe_orquestar", return_value=False):
                    # Simular que no hay servicios caídos
                    with patch("nodo_metagenesis_medio.servicios_mac", return_value=([], [])):
                        # Simular que no hay disco libre gb (usaremos un valor fijo)
                        with patch("nodo_metagenesis_medio.disco_libre_gb", return_value=100.0):
                            # Simular que no hay carga
                            with patch("nodo_metagenesis_medio.os.getloadavg", return_value=(0.0, 0.0, 0.0)):
                                # Mockear os.cpu_count para devolver un valor fijo
                                with patch("nodo_metagenesis_medio.os.cpu_count", return_value=8):
                                    # Crear un progreso.json con algunas tareas en curso
                                    progreso = {
                                        "tarea1": {"fase": "escribiendo", "punto": {"rama": "rama1", "sha": "sha1", "t": 1000.0}},
                                        "tarea2": {"fase": "reparando", "punto": {"rama": "rama2", "sha": "sha2", "t": 2000.0}},
                                        "tarea3": {"fase": "corrigiendo", "punto": {"rama": "rama3", "sha": "sha3", "t": 3000.0}},
                                        "tarea4": {"fase": "espero", "punto": {"rama": "rama4", "sha": "sha4", "t": 4000.0}},  # no en FASES_CON_TRABAJO
                                        "tarea5": {"fase": "escribiendo"},  # sin punto
                                    }
                                    progreso_path = os.path.join(repo_root, "starseed_memory_root", "olas", "progreso.json")
                                    with open(progreso_path, "w", encoding="utf-8") as f:
                                        json.dump(progreso, f)

                                    # Crear un puntos-control.json con algunos puntos
                                    puntos_control = {
                                        "tarea1": {"rama": "rama1", "sha": "sha1_new", "t": 1500.0},
                                        "tarea2": {"rama": "rama2", "sha": "sha2_new", "t": 2500.0},
                                        # tarea3 no está en puntos-control, así que se usará la del progreso
                                    }
                                    puntos_control_path = os.path.join(repo_root, "starseed_memory_root", "olas", "puntos-control.json")
                                    with open(puntos_control_path, "w", encoding="utf-8") as f:
                                        json.dump(puntos_control, f)

                                    # Llamar a la función medir
                                    ahora = 5000.0
                                    latido = N.medir(modo="real", ahora=ahora)

                                    # Verificar que los nuevos campos están presentes
                                    assert "en_curso" in latido
                                    assert "contenedor" in latido
                                    assert "periodo_s" in latido

                                    # Verificar en_curso: debe tener hasta 8 entries, ordenado por punto.t descendente
                                    en_curso = latido["en_curso"]
                                    assert isinstance(en_curso, list)
                                    assert len(en_curso) == 3  # tarea1, tarea2, tarea3 (tarea4 no está en FASES_CON_TRABAJO, tarea5 sin punto)
                                    # tarea3 debe ser la primera (punto más reciente: 3000.0)
                                    assert en_curso[0]["id"] == "tarea3"
                                    assert en_curso[0]["fase"] == "corrigiendo"
                                    assert en_curso[0]["punto"]["rama"] == "rama3"
                                    assert en_curso[0]["punto"]["sha"] == "sha3"
                                    assert en_curso[0]["punto"]["t"] == 3000.0
                                    # tarea2
                                    assert en_curso[1]["id"] == "tarea2"
                                    assert en_curso[1]["fase"] == "reparando"
                                    assert en_curso[1]["punto"]["rama"] == "rama2"
                                    assert en_curso[1]["punto"]["sha"] == "sha2_new"
                                    assert en_curso[1]["punto"]["t"] == 2500.0
                                    # tarea1
                                    assert en_curso[2]["id"] == "tarea1"
                                    assert en_curso[2]["fase"] == "escribiendo"
                                    assert en_curso[2]["punto"]["rama"] == "rama1"
                                    assert en_curso[2]["punto"]["sha"] == "sha1_new"
                                    assert en_curso[2]["punto"]["t"] == 1500.0

                                    # Verificar contenedor
                                    contenedor = latido["contenedor"]
                                    assert isinstance(contenedor, dict)
                                    assert "activo" in contenedor
                                    assert "agentes" in contenedor
                                    assert "apto" in contenedor
                                    assert "motivo" in contenedor
                                    # Como estamos en una Mac y por defecto activo es True, y no hemos cambiado el archivo contenedor.json
                                    assert contenedor["activo"] is True
                                    # agentes: basado en la memoria mock (8192 MB total -> 4 agentes por ram, pero limitada por nucleos? мы не мокируем nucleos)
                                    # Vamos a mockear os.cpu_count para devolver un valor fijo
                                    # Pero dejamos que el test falle si no es lo esperado? Mejor mockear.
                                    # Vamos a mockear os.cpu_count para devolver 8 (como arriba)
                                    # Entonces, agentes = min(4, (8192/1024 - 2)//2, 8) = min(4, (8-2)//2, 8) = min(4, 3, 8) = 3
                                    assert contenedor["agentes"] == 3
                                    # apto: debe ser True porque tenemos suficientes recursos
                                    assert contenedor["apto"] is True
                                    # motivo: una cadena
                                    assert isinstance(contenedor["motivo"], str)
                                    assert len(contenedor["motivo"]) > 0

                                    # Verificar periodo_s: como es la primera llamada, no hay ultimo latido, so periodo_s debería ser None?
                                    # Pero nosotros guardamos el latido en la primera llamada, so en la primera llamada, ultimo es None -> periodo_s = None
                                    assert latido["periodo_s"] is None

                                    # Segunda llamada para verificar que periodo_s es un número
                                    latido2 = N.medir(modo="real", ahora=ahora + 100.0)
                                    assert latido2["periodo_s"] == 100.0


if __name__ == "__main__":
    test_latido_incluye_nuevos_campos()
    print("Todas las pruebas pasaron.")