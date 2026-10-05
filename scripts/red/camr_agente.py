#!/usr/bin/env python3
"""Agente local CAMR (Enrutamiento Cognitivo Multiespectro) de StarSeed OS.

Servidor HTTP con la biblioteca estándar que escucha SOLO en 127.0.0.1:4480.
Detecta RNS/Meshtastic/iw/batctl/babeld/yggdrasilctl, mide, aplica (en seco por
defecto) y envía. Librerías de radio con importación perezosa.

Endpoints:
  GET  /estado      → tecnologías disponibles y motivo de las ausentes
  GET  /mediciones  → métricas por tecnología detectada
  POST /aplicar     → {"seco": true} devuelve comandos; en real, solo lista blanca
  POST /enviar      → envía un paquete por la tecnología pedida (seco por defecto)

Aviso legal (§5 del contrato): la radio real solo se usa respetando el perfil
regional (potencia, PIRE, ciclo de trabajo); las bandas de radioaficionado
requieren indicativo y NO llevan tráfico cifrado. Este agente no decide la
legalidad: la decide el motor CAMR del OS; aquí se ejecuta en seco por defecto.
"""
import json
import shutil
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer

PUERTO = 4480
HOST = "127.0.0.1"  # jamás exponer fuera del equipo

# Lista blanca de ejecutables permitidos en modo real (sin shell, argumentos validados)
EJECUTABLES_PERMITIDOS = frozenset({
    "iw", "batctl", "ip", "yggdrasilctl", "rnsd", "rnstatus",
})
# Subcomandos jamás permitidos (destructivos o fuera de alcance)
ARGUMENTOS_PROHIBIDOS = frozenset({"del", "destroy", "flush", "down", "--force"})

TECNOLOGIAS = ("rns", "meshtastic", "80211s", "batman", "babel", "yggdrasil")


def ejecutor_real(argv, tiempo_limite=8):
    """Ejecuta argv SIN shell. argv es una lista ya validada."""
    proc = subprocess.run(argv, capture_output=True, text=True, timeout=tiempo_limite)
    return {"codigo": proc.returncode, "salida": proc.stdout, "error": proc.stderr}


def _existe(binario, localizador=shutil.which):
    return localizador(binario) is not None


def detectar_tecnologias(localizador=shutil.which, importador=None):
    """Devuelve {tec: {"disponible": bool, "motivo": str}} para cada tecnología."""
    def _importa(nombre):
        if importador is not None:
            return importador(nombre)
        try:
            __import__(nombre)
            return True
        except ImportError:
            return None

    estado = {}
    if _importa("RNS"):
        estado["rns"] = {"disponible": True, "motivo": "librería RNS importable"}
    elif _existe("rnsd", localizador):
        estado["rns"] = {"disponible": True, "motivo": "demonio rnsd instalado (sin librería Python)"}
    else:
        estado["rns"] = {"disponible": False, "motivo": "sin librería RNS ni rnsd: pip install rns"}
    if _importa("meshtastic"):
        estado["meshtastic"] = {"disponible": True, "motivo": "librería meshtastic importable"}
    else:
        estado["meshtastic"] = {"disponible": False, "motivo": "pip install meshtastic y enchufa la radio"}
    if _existe("iw", localizador):
        estado["80211s"] = {"disponible": True, "motivo": "iw presente (malla 802.11s)"}
    else:
        estado["80211s"] = {"disponible": False, "motivo": "falta iw (paquete iw / wireless-tools)"}
    if _existe("batctl", localizador):
        estado["batman"] = {"disponible": True, "motivo": "batctl presente (B.A.T.M.A.N.-adv)"}
    else:
        estado["batman"] = {"disponible": False, "motivo": "falta batctl o el módulo batman-adv"}
    if _existe("babeld", localizador):
        estado["babel"] = {"disponible": True, "motivo": "babeld instalado"}
    else:
        estado["babel"] = {"disponible": False, "motivo": "falta babeld"}
    if _existe("yggdrasilctl", localizador):
        estado["yggdrasil"] = {"disponible": True, "motivo": "yggdrasilctl presente"}
    else:
        estado["yggdrasil"] = {"disponible": False, "motivo": "falta yggdrasilctl"}
    return estado


def medicion_rns():
    """Interfaces y estadísticas vía la librería RNS (importación perezosa)."""
    try:
        import RNS  # noqa: PLC0415 (perezosa a propósito)
    except ImportError:
        return {"disponible": False, "motivo": "librería RNS no instalada"}
    interfaces = []
    try:
        for interfaz in RNS.Transport.interfaces:
            interfaces.append({
                "nombre": getattr(interfaz, "name", str(interfaz)),
                "en_linea": bool(getattr(interfaz, "online", False)),
                "rxb": getattr(interfaz, "rxb", 0),
                "txb": getattr(interfaz, "txb", 0),
            })
    except Exception as fallo:  # la librería puede fallar si el demonio no corre
        return {"disponible": False, "motivo": f"RNS sin transporte activo: {fallo}"}
    return {"disponible": True, "interfaces": interfaces,
            "rutas": getattr(RNS.Transport, "path_table", {}) and len(RNS.Transport.path_table) or 0}


def medicion_meshtastic():
    """Parámetros de la RNode/LoRa vía meshtastic (importación perezosa)."""
    try:
        import meshtastic.serial_interface  # noqa: PLC0415
    except ImportError:
        return {"disponible": False, "motivo": "librería meshtastic no instalada"}
    try:
        cara = meshtastic.serial_interface.SerialInterface()
        nodo = cara.getMyNodeInfo() or {}
        modem = cara.localNode.localConfig.lora
        cara.close()
        return {"disponible": True, "nodo": nodo.get("user", {}).get("longName", ""),
                "frecuencia": getattr(modem, "override_frequency", 0),
                "ancho_banda": getattr(modem, "bandwidth", 0),
                "factor_dispersion": getattr(modem, "spread_factor", 0),
                "tasa_codificacion": getattr(modem, "coding_rate", 0),
                "txpower": getattr(modem, "tx_power", 0),
                "region": getattr(modem, "region", 0)}
    except Exception as fallo:
        return {"disponible": False, "motivo": f"sin radio Meshtastic accesible: {fallo}"}


def _corre(ejecutor, argv):
    """Corre un comando de solo consulta; devuelve salida o motivo de fallo."""
    try:
        res = ejecutor(argv)
    except (OSError, subprocess.TimeoutExpired) as fallo:
        return {"disponible": False, "motivo": str(fallo)}
    if res.get("codigo", 1) != 0:
        return {"disponible": False, "motivo": (res.get("error") or "error").strip()[:200]}
    return {"disponible": True, "salida": res.get("salida", "").strip()}


def obtener_mediciones(ejecutor=ejecutor_real, estado=None, importador=None):
    """Reúne mediciones de cada tecnología disponible. Sin red en las pruebas:
    basta inyectar un ejecutor falso y un detectado parcial."""
    estado = estado or detectar_tecnologias(importador=importador)
    medidas = {}
    if estado.get("rns", {}).get("disponible"):
        medidas["rns"] = medicion_rns()
    if estado.get("meshtastic", {}).get("disponible"):
        medidas["meshtastic"] = medicion_meshtastic()
    if estado.get("80211s", {}).get("disponible"):
        medidas["80211s"] = {
            "estaciones": _corre(ejecutor, ["iw", "dev", "wlan0", "station", "dump"]),
            "barrido": _corre(ejecutor, ["iw", "dev", "wlan0", "survey", "dump"]),
        }
    if estado.get("batman", {}).get("disponible"):
        medidas["batman"] = {"origenadores": _corre(ejecutor, ["batctl", "o"]),
                             "vecinos": _corre(ejecutor, ["batctl", "n"])}
    if estado.get("babel", {}).get("disponible"):
        medidas["babel"] = {"estado": _corre(ejecutor, ["babeld", "--version"])}
    if estado.get("yggdrasil", {}).get("disponible"):
        medidas["yggdrasil"] = {"pares": _corre(ejecutor, ["yggdrasilctl", "getPeers"])}
    return medidas


def validar_aplicacion(cuerpo):
    """Valida una petición /aplicar. Devuelve (comandos, error)."""
    tecnologia = cuerpo.get("tecnologia", "")
    if tecnologia not in TECNOLOGIAS:
        return None, f"tecnología desconocida: {tecnologia!r}"
    comandos = cuerpo.get("comandos")
    if not isinstance(comandos, list) or not comandos:
        return None, "faltan 'comandos' (lista de listas de argumentos)"
    for argv in comandos:
        if not isinstance(argv, list) or not argv or not all(isinstance(a, str) for a in argv):
            return None, "cada comando debe ser una lista de cadenas"
        if argv[0] not in EJECUTABLES_PERMITIDOS:
            return None, f"ejecutable fuera de la lista blanca: {argv[0]!r}"
        if any(a in ARGUMENTOS_PROHIBIDOS for a in argv[1:]):
            return None, f"argumento prohibido en: {argv!r}"
        if any(_es_peligroso(a) for a in argv[1:]):
            return None, f"argumento peligroso en: {argv!r}"
    return comandos, None


def _es_peligroso(arg):
    return any(c in arg for c in (";", "&", "|", "`", "$", ">", "<", "\n"))


def aplicar(cuerpo, ejecutor=ejecutor_real):
    """Aplica parámetros. Por defecto en SECO: devuelve los comandos sin ejecutar."""
    comandos, error = validar_aplicacion(cuerpo)
    if error:
        return {"ok": False, "error": error}
    seco = cuerpo.get("seco", True)
    if seco:
        return {"ok": True, "seco": True, "ejecutaria": comandos,
                "aviso": "modo seco: nada se ejecutó. Recuerda §5: perfil legal e indicativo."}
    resultados = []
    for argv in comandos:
        try:
            resultados.append({"comando": argv, **ejecutor(argv)})
        except (OSError, subprocess.TimeoutExpired) as fallo:
            resultados.append({"comando": argv, "codigo": -1, "error": str(fallo)})
    return {"ok": all(r.get("codigo") == 0 for r in resultados),
            "seco": False, "resultados": resultados}


def enviar(cuerpo, ejecutor=ejecutor_real):
    """Envía un paquete. En seco por defecto. Envío real solo vía RNS/Meshtastic."""
    destino = cuerpo.get("destino", "")
    datos = cuerpo.get("datos", "")
    tecnologia = cuerpo.get("tecnologia", "rns")
    if not destino or not isinstance(datos, str):
        return {"ok": False, "error": "faltan 'destino' o 'datos'"}
    if len(datos.encode("utf-8")) > 256 * 1024:
        return {"ok": False, "error": "paquete demasiado grande (> 256 KiB)"}
    if cuerpo.get("seco", True):
        return {"ok": True, "seco": True,
                "ejecutaria": {"tecnologia": tecnologia, "destino": destino,
                               "octetos": len(datos.encode("utf-8"))}}
    if tecnologia != "rns":
        return {"ok": False, "error": "envío real solo implementado vía RNS por ahora"}
    try:
        import RNS  # noqa: PLC0415
    except ImportError:
        return {"ok": False, "error": "librería RNS no instalada"}
    try:  # noqa: SIM105
        identidad = RNS.Identity.recall(bytes.fromhex(destino))
        if identidad is None:
            return {"ok": False, "error": "destino no conocido en la tabla de rutas RNS"}
        destino_rns = RNS.Destination(identidad, RNS.Destination.OUT,
                                      RNS.Destination.SINGLE, "starseed", "camr")
        RNS.Packet(destino_rns, datos.encode("utf-8")).send()
        return {"ok": True, "seco": False, "enviado": len(datos.encode("utf-8"))}
    except Exception as fallo:
        return {"ok": False, "error": f"fallo al enviar por RNS: {fallo}"}


class ManejadorCamr(BaseHTTPRequestHandler):
    """Sirve la API solo en local. Sin registro de datos sensibles."""
    ejecutor = ejecutor_real

    def _responder(self, codigo, carga):
        cuerpo = json.dumps(carga, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def _cuerpo_json(self):
        largo = int(self.headers.get("Content-Length", 0) or 0)
        if largo > 1024 * 1024:
            return None
        try:
            datos = json.loads(self.rfile.read(largo) or b"{}")
            return datos if isinstance(datos, dict) else None
        except (ValueError, json.JSONDecodeError):
            return None

    def do_GET(self):  # noqa: N802 (nombre impuesto por la stdlib)
        if self.path == "/estado":
            self._responder(200, {"tecnologias": detectar_tecnologias(),
                                  "escucha": f"{HOST}:{PUERTO}"})
        elif self.path == "/mediciones":
            self._responder(200, obtener_mediciones(ejecutor=self.ejecutor))
        else:
            self._responder(404, {"error": "ruta desconocida"})

    def do_POST(self):  # noqa: N802
        cuerpo = self._cuerpo_json()
        if cuerpo is None:
            self._responder(400, {"error": "cuerpo JSON inválido o demasiado grande"})
            return
        if self.path == "/aplicar":
            resultado = aplicar(cuerpo, ejecutor=self.ejecutor)
            self._responder(200 if resultado.get("ok") else 400, resultado)
        elif self.path == "/enviar":
            resultado = enviar(cuerpo)
            self._responder(200 if resultado.get("ok") else 400, resultado)
        else:
            self._responder(404, {"error": "ruta desconocida"})

    def log_message(self, formato, *args):  # silencio en el registro por defecto
        return


def crear_servidor(ejecutor=ejecutor_real, host=HOST, puerto=PUERTO):
    if host != "127.0.0.1":
        raise ValueError("el agente CAMR solo escucha en 127.0.0.1")
    manejador = type("Manejador", (ManejadorCamr,), {"ejecutor": staticmethod(ejecutor)})
    return HTTPServer((host, puerto), manejador)


if __name__ == "__main__":
    servidor = crear_servidor()
    print(f"Agente CAMR escuchando en http://{HOST}:{PUERTO} (Ctrl-C para salir)")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        servidor.shutdown()
