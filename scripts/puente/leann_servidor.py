# -*- coding: utf-8 -*-
"""Servidor de recuerdo semántico LEANN, en el A1 (contrato: architecture/leann-recuerdo-semantico.md §3).
Escucha en 127.0.0.1 con token (`~/.starseed/leann.token`); sin el servidor, el recuerdo sigue con
Memvid y nada falla. Pruebas: scripts/puente/test_leann_servidor.py."""
import hmac, json, os, re, threading
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PATRON = re.compile(r"^[a-z0-9-]+$")
TOKEN_DEFECTO = os.path.expanduser("~/.starseed/leann.token")
DIR_DEFECTO = "/var/lib/starseed/leann"
CERROJOS: dict = {}
_GUARDIA = threading.Lock()


def cargar_token(ruta=TOKEN_DEFECTO):
    """Lee el token; si no existe lo crea (32 bytes de os.urandom en hex, permisos 0600)."""
    if not os.path.exists(ruta):
        os.makedirs(os.path.dirname(ruta) or ".", exist_ok=True)
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(os.urandom(32).hex())
        os.chmod(ruta, 0o600)
    with open(ruta, "r", encoding="utf-8") as f:
        return f.read().strip()


def nombre_valido(nombre):
    return bool(nombre and PATRON.fullmatch(nombre))


def ruta_indice(dir_indices, nombre):
    return os.path.join(dir_indices, nombre, "documents.leann")


def listar_indices(dir_indices):
    """Nombres de índices que existen (carpetas con nombre válido)."""
    if not os.path.isdir(dir_indices):
        return []
    return sorted(
        n for n in os.listdir(dir_indices)
        if os.path.isdir(os.path.join(dir_indices, n)) and nombre_valido(n)
    )


def cerrojo_de(nombre):
    """Un cerrojo por índice al escribir, como pide el contrato §3."""
    with _GUARDIA:
        return CERROJOS.setdefault(nombre, threading.Lock())


class CacheBuscadores:
    """Caché LRU de 4 LeannSearcher, como pide el contrato §3."""
    LIMITE = 4

    def __init__(self):
        self._datos: OrderedDict = OrderedDict()

    def obtener(self, ruta, fabrica):
        if ruta in self._datos:
            self._datos.move_to_end(ruta)
            return self._datos[ruta]
        buscador = fabrica(ruta)
        self._datos[ruta] = buscador
        while len(self._datos) > self.LIMITE:
            self._datos.popitem(last=False)
        return buscador


def fabrica_buscador(ruta):
    """LeannSearcher real; las pruebas inyectan uno falso en sys.modules["leann"]."""
    from leann import LeannSearcher
    return LeannSearcher(ruta)


def poner_textos(dir_indices, nombre, textos):
    """Crea el índice (Ollama, qwen3-embedding:0.6b) o añade con update_index. LEANN se importa dentro."""
    from leann import LeannBuilder
    ruta = ruta_indice(dir_indices, nombre)
    constructor = LeannBuilder(
        backend_name="hnsw", embedding_model="qwen3-embedding:0.6b", embedding_mode="ollama"
    )
    for t in textos:
        constructor.add_text(t["texto"], metadata=t["metadatos"])
    if os.path.exists(ruta):
        constructor.update_index(ruta)
    else:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        constructor.build_index(ruta)


class Manejador(BaseHTTPRequestHandler):
    """Respuestas JSON; 403 sin token correcto, con Host fuera de 127.0.0.1 o con Origin."""

    def log_message(self, format, *args):  # noqa: A002 # firma igual que la base, silencio
        pass

    def _json(self, estado, datos):
        cuerpo = json.dumps(datos).encode("utf-8")
        self.send_response(estado)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def _autorizado(self):
        host = self.headers.get("Host", "")
        if not (host == "127.0.0.1" or host.startswith("127.0.0.1:")) or self.headers.get("Origin"):
            return False
        pedido = self.headers.get("X-StarSeed-Token", "")
        esperado = getattr(self.server, "token", "")
        return hmac.compare_digest(pedido.encode("utf-8"), esperado.encode("utf-8"))

    def _cuerpo(self):
        largo = int(self.headers.get("Content-Length", "0") or 0)
        datos = json.loads(self.rfile.read(largo).decode("utf-8")) if largo else {}
        if not isinstance(datos, dict):
            raise ValueError("el cuerpo debe ser un objeto JSON")
        return datos

    def do_GET(self):
        if not self._autorizado():
            return self._json(403, {"error": "no autorizado"})
        if self.path == "/salud":
            return self._json(200, {"estado": "ok"})
        if self.path == "/indices":
            return self._json(200, {"indices": listar_indices(getattr(self.server, "dir_indices"))})
        return self._json(404, {"error": "ruta desconocida"})

    def do_POST(self):
        if not self._autorizado():
            return self._json(403, {"error": "no autorizado"})
        partes = self.path.split("/")
        if len(partes) != 4 or partes[0] != "" or partes[1] != "indices":
            return self._json(404, {"error": "ruta desconocida"})
        nombre, accion = partes[2], partes[3]
        if not nombre_valido(nombre):
            return self._json(400, {"error": "nombre de índice inválido"})
        metodo = getattr(self, "_de_" + accion, None)
        if metodo is None:
            return self._json(404, {"error": "ruta desconocida"})
        try:
            return metodo(nombre, self._cuerpo())
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            return self._json(400, {"error": "petición inválida"})

    def _de_buscar(self, nombre, cuerpo):
        consulta = cuerpo.get("consulta")
        if not isinstance(consulta, str) or not consulta.strip():
            return self._json(400, {"error": "falta la consulta"})
        ruta = ruta_indice(getattr(self.server, "dir_indices"), nombre)
        if not os.path.exists(ruta):
            return self._json(404, {"error": "índice inexistente"})
        buscador = getattr(self.server, "cache").obtener(ruta, getattr(self.server, "fabrica"))
        argumentos = {"top_k": int(cuerpo.get("k", 5)), "metadata_filters": cuerpo.get("filtros")}
        if "peso_vector" in cuerpo:
            argumentos["vector_weight"] = cuerpo["peso_vector"]
        salida = [
            {"id": r.id, "puntuacion": r.score, "texto": r.text,
             "metadatos": dict(getattr(r, "metadata", {}) or {})}
            for r in buscador.search(consulta, **argumentos)
        ]
        return self._json(200, salida)

    def _de_poner(self, nombre, cuerpo):
        textos = cuerpo.get("textos")
        if not isinstance(textos, list) or not textos or any(
            not isinstance(t, dict) or "alcance" not in (t.get("metadatos") or {}) for t in textos
        ):
            return self._json(400, {"error": "petición inválida"})
        with cerrojo_de(nombre):
            poner_textos(getattr(self.server, "dir_indices"), nombre, textos)
        return self._json(200, {"estado": "ok"})


class Servidor(ThreadingHTTPServer):
    """ThreadingHTTPServer en 127.0.0.1 con token, índices, caché y fábrica configurados."""

    def __init__(self, dir_indices, token, puerto=0, fabrica=fabrica_buscador):
        super().__init__(("127.0.0.1", puerto), Manejador)
        self.dir_indices = dir_indices
        self.token = token
        self.cache = CacheBuscadores()
        self.fabrica = fabrica


def main():
    puerto = int(os.environ.get("STARSEED_LEANN_PUERTO", "4495"))
    dir_indices = os.environ.get("STARSEED_LEANN_DIR", DIR_DEFECTO)
    Servidor(dir_indices=dir_indices, token=cargar_token(), puerto=puerto).serve_forever()


if __name__ == "__main__":
    main()
