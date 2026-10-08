"""Conector sin dependencias entre un motor de enjambre y Genesis."""
import json, os, re, time, urllib.error, urllib.request
from pathlib import Path
MAX_PENDIENTE = 5 * 1024 * 1024; PATRONES = tuple(map(re.compile, (
    r"sk-[A-Za-z0-9_-]{15,}", r"ghp_[A-Za-z0-9_-]{20,}", r"github_pat_[A-Za-z0-9_-]{20,}",
    r"AKIA[0-9A-Z]{16}", r"xox[abp]-[A-Za-z0-9_-]{10,}",
    r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
    r"-----BEGIN .*?PRIVATE KEY-----[\s\S]*?-----END .*?PRIVATE KEY-----",
    r"[A-Z_][A-Z0-9_]*_(KEY|TOKEN|SECRET)\s*=\s*[^ \t\r\n;]+")))
def _ocultar(valor):
    if isinstance(valor, str):
        for patron in PATRONES:
            valor = patron.sub("[clave oculta]", valor)
        return valor
    if isinstance(valor, list): return [_ocultar(elemento) for elemento in valor]
    if isinstance(valor, dict): return {str(k): _ocultar(v) for k, v in valor.items()}
    return valor
def _entorno_local():
    entorno = {}
    try:
        for linea in Path(os.path.expanduser("~/.starseed/env")).read_text(encoding="utf-8").splitlines():
            if "=" in linea and not linea.lstrip().startswith("#"):
                k, v = linea.removeprefix("export ").split("=", 1)
                entorno[k.strip()] = v.strip().strip("'\"")
    except OSError: pass
    entorno.update(os.environ); return entorno
class Conector:
    def __init__(self, url_supabase, clave_publica, token,
                 ruta_pendiente="~/.starseed/motor/pendiente.jsonl",
                 enviar=None, ahora=time.time):
        self.url, self.clave, self.token = url_supabase.rstrip("/"), clave_publica, token
        self.ruta = Path(os.path.expanduser(ruta_pendiente))
        self.enviar, self.ahora, self.activo, self.frenado = enviar, ahora, bool(token), False
        self.eventos, self.progreso, self.latido, self.medidores = [], {}, None, None
        self.cadencia_s, self.proximo_envio, self.fallos = 60.0, 0.0, 0
    @classmethod
    def desde_entorno(cls, ruta_pendiente="~/.starseed/motor/pendiente.jsonl",
                      enviar=None, ahora=time.time):
        entorno = _entorno_local()
        url = entorno.get("NEXT_PUBLIC_SUPABASE_URL", entorno.get("SUPABASE_URL", ""))
        clave = entorno.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", entorno.get("SUPABASE_ANON_KEY", ""))
        return cls(url, clave, entorno.get("STARSEED_MOTOR_TOKEN", ""), ruta_pendiente, enviar, ahora)
    def anotar_evento(self, evento):
        if self.activo: self.eventos.append(_ocultar(dict(evento)))
    def anotar_progreso(self, tarea_id, estado, avance=None):
        if self.activo:
            dato = {"estado": estado}
            if avance is not None: dato["avance"] = avance
            self.progreso[str(tarea_id)] = dato
    def anotar_latido(self, latido):
        if self.activo: self.latido = _ocultar(dict(latido))
    def anotar_medidores(self, documento):
        if self.activo: self.medidores = _ocultar(documento)
    def _lote(self):
        lote = {"version": 1, "motor_id": "", "ambito_id": "",
                "eventos": self.eventos[:200], "progreso": dict(self.progreso)}
        if self.latido is not None: lote["latido"] = self.latido
        if self.medidores is not None: lote["medidores"] = self.medidores
        return _ocultar(lote)
    def _leer_pendientes(self):
        try:
            return [json.loads(x) for x in self.ruta.read_text(encoding="utf-8").splitlines() if x]
        except (OSError, ValueError): return []
    def _escribir_pendientes(self, lotes):
        lineas = [json.dumps(x, ensure_ascii=False, separators=(",", ":")) + "\n" for x in lotes]
        while sum(len(x.encode("utf-8")) for x in lineas) > MAX_PENDIENTE and lineas:
            lineas.pop(0)
        self.ruta.parent.mkdir(parents=True, exist_ok=True)
        self.ruta.write_text("".join(lineas), encoding="utf-8")
    def _post(self, rpc, lote=None):
        url = "%s/rest/v1/rpc/%s" % (self.url, rpc)
        cab = {"apikey": self.clave, "Authorization": "Bearer " + self.clave,
               "Content-Type": "application/json"}
        cuerpo = {"p_token": self.token}
        if lote is not None: cuerpo["p_lote"] = lote
        if self.enviar: salida = self.enviar(url, cab, cuerpo)
        else:
            req = urllib.request.Request(url, json.dumps(cuerpo).encode(), cab, method="POST")
            try:
                respuesta = urllib.request.urlopen(req, timeout=15)
                salida = (respuesta.status, respuesta.read())
            except urllib.error.HTTPError as error:
                if error.code >= 500: raise OSError("respuesta 5xx") from error
                return {}
        if isinstance(salida, tuple):
            estado, salida = salida
            if estado >= 500: raise OSError("respuesta 5xx")
        if isinstance(salida, bytes): salida = salida.decode("utf-8")
        if isinstance(salida, str): salida = json.loads(salida or "{}")
        return salida if isinstance(salida, dict) else {}
    def tal_vez_enviar(self):
        ahora = float(self.ahora())
        if not self.activo or self.frenado or ahora < self.proximo_envio: return False
        lote, pendientes = self._lote(), self._leer_pendientes(); restantes = pendientes
        try:
            for indice, viejo in enumerate(pendientes):
                respuesta = self._post("mando_motor_reportar", viejo)
                if respuesta.get("freno"): self.frenado = True; raise OSError("freno")
                if respuesta.get("ok") is False: raise OSError("lote no aceptado")
                restantes = pendientes[indice + 1:]
            respuesta = self._post("mando_motor_reportar", lote)
            if respuesta.get("ok") is False and not respuesta.get("freno"): raise OSError("lote no aceptado")
        except (OSError, TimeoutError, ValueError):
            self._escribir_pendientes(restantes + [lote])
            self.fallos += 1; self.proximo_envio = ahora + min(900, 30 * self.fallos); respuesta = None
        self.eventos, self.progreso, self.latido, self.medidores = self.eventos[200:], {}, None, None
        if respuesta is None: return False
        self._escribir_pendientes([])
        self.fallos, self.frenado = 0, bool(respuesta.get("freno"))
        cadencia = respuesta.get("cadencia_s", self.cadencia_s)
        if isinstance(cadencia, (int, float)) and not isinstance(cadencia, bool): self.cadencia_s = max(30.0, float(cadencia))
        self.proximo_envio = ahora + self.cadencia_s
        return True
    def recoger_tareas(self):
        if not self.activo or self.frenado: return []
        try:
            respuesta = self._post("mando_motor_pendiente")
        except (OSError, TimeoutError, ValueError): return []
        self.frenado = bool(respuesta.get("freno")); tareas = respuesta.get("tareas", [])
        return tareas if isinstance(tareas, list) else []
