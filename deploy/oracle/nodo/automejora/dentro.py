"""Lo que corre DENTRO de la caja Docker de la automejora Meta^n (MTN1027F).

Sin red: solo el reenviador 127.0.0.1:8080 (1) → socket /run/llm.sock.
Meta^n PROPONE; el juez de StarSeed decide FUERA (automejora §3). Todo
stdlib: meta_n se importa perezoso, solo al aplicar los pre_process."""
import json
import re
import socket
import subprocess
import sys
import threading
from pathlib import Path

RUTA_SOCKET = "/run/llm.sock"
PUERTO_REENVIO = 8080
ARCHIVE = Path("/work/salida/noche/archive")
APARTADAS = Path("/work/apartadas-sin-etiqueta.json")
PAUTAS = Path("/work/pautas.json")
MEJOR = Path("/work/mejor.json")

def _bombeo(origen: socket.socket, destino: socket.socket) -> None:
    """Vuelca lo que entra por un socket al otro, hasta que lo cierran."""
    try:
        while True:
            datos = origen.recv(65536)
            if not datos:
                break
            destino.sendall(datos)
    except OSError:
        pass
    try:
        destino.shutdown(socket.SHUT_WR)
    except OSError:
        pass

def atender(cliente: socket.socket, socket_ruta: str = RUTA_SOCKET) -> None:
    """Pone un cliente TCP a hablar con el socket UNIX de la pasarela."""
    al_unix = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        al_unix.connect(socket_ruta)
    except OSError:
        cliente.close()
        return
    hilo = threading.Thread(target=_bombeo, args=(cliente, al_unix), daemon=True)
    hilo.start()
    _bombeo(al_unix, cliente)
    hilo.join(); al_unix.close(); cliente.close()

def abrir_reenvio(puerto: int = PUERTO_REENVIO) -> socket.socket:
    """(1) Oye en 127.0.0.1:<puerto>; cada conexión la despacha `atender`."""
    servidor = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    servidor.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    servidor.bind(("127.0.0.1", puerto))
    servidor.listen(16)
    return servidor

def reenviar(servidor: socket.socket, socket_ruta: str = RUTA_SOCKET) -> None:
    """(1) en bucle: acepta conexiones sin fin y las manda a la pasarela."""
    while True:
        try:
            cliente, _ = servidor.accept()
        except OSError:  # cierro del servidor: fin del turno
            return
        threading.Thread(target=atender, args=(cliente, socket_ruta), daemon=True).start()

def construir_orden(args: dict) -> list[str]:
    """La orden (2) de meta-n: por la pasarela, sin dinero, en fila."""
    return [
        "meta-n", "--tasks", "/work/tareas.json", "--use-archive",
        "--base-url", "http://127.0.0.1:8080/v1", "--api-key", "caja", "--model", args["modelo"],
        "--max-iterations", str(args["iteraciones"]), "--patience", str(args["paciencia"]),
        "--parallel", "1", "--daily-budget-usd", "0",
        "--output-dir", "/work/salida", "--exp-name", "noche",
    ]

def _sin_prompts(capa: dict) -> dict:
    """Lo (3): la capa sin los prompts crudos de Ω, que se quedan dentro."""
    return {k: v for k, v in capa.items() if k not in ("raw_omega_prompt", "raw_omega_response")}

def leer_cadena(id_candidato: str) -> list[dict]:
    """Las capas del candidato, ordenadas por profundidad (d2 antes que d3)."""
    profundidades = []
    for ruta in (ARCHIVE / id_candidato).glob("injected_code_d*.json"):
        ajuste = re.fullmatch(r"injected_code_d(\d+)\.json", ruta.name)
        profundidades.append((int(ajuste.group(1)) if ajuste else 0, ruta))
    return [json.loads(r.read_text(encoding="utf-8")) for _, r in sorted(profundidades)]

def pauta_para(cadena: list[dict], tarea: dict) -> str:
    """Los pre_process de la cadena aplicados a una tarea apartada."""
    from meta_n.core.meta_layer import InjectedCode, TaskDescription, run_pre_process
    capas = [InjectedCode.model_validate(capa) for capa in cadena]
    return run_pre_process(capas, TaskDescription.model_validate(tarea))[1]

def recoger_la_muestra() -> None:
    """Escribe /work/pautas.json ({task_id: texto}) y /work/mejor.json."""
    indice = json.loads((ARCHIVE / "index.json").read_text(encoding="utf-8"))
    id_candidato = str(indice.get("best_candidate_id") or "")
    if not id_candidato:
        raise SystemExit("meta-n no dejó mejor candidato; sin pautas ni mejor")
    cadena = leer_cadena(id_candidato)
    apartadas = json.loads(APARTADAS.read_text(encoding="utf-8"))
    pautas = {str(t.get("task_id") or ""): pauta_para(cadena, t) for t in apartadas}
    PAUTAS.write_text(json.dumps(pautas, indent=2, ensure_ascii=False), encoding="utf-8")
    mejor = {"id": id_candidato, "mean_score": indice.get("best_mean_score", 0.0),
             "capas": [_sin_prompts(capa) for capa in cadena]}
    MEJOR.write_text(json.dumps(mejor, indent=2, ensure_ascii=False), encoding="utf-8")

def main() -> None:
    """(1) reenviador a la escucha, (2) noche de meta-n, (3) pautas al juez."""
    servidor = abrir_reenvio()
    threading.Thread(target=reenviar, args=(servidor,), daemon=True).start()
    paso = {"modelo": sys.argv[1] if len(sys.argv) > 1 else "",
            "iteraciones": int(sys.argv[2]) if len(sys.argv) > 2 else 6,
            "paciencia": int(sys.argv[3]) if len(sys.argv) > 3 else 2}
    subprocess.run(construir_orden(paso), check=True)
    recoger_la_muestra()

if __name__ == "__main__":
    main()
