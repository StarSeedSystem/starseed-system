# -*- coding: utf-8 -*-
"""Cliente de la puerta de datos del A1 para Python (enjambre, directores, nodos, Astraura).

Mismo contrato que el adaptador del OS (`src/lib/datos/puerta-a1.ts`) y que la puerta
(`servicios/puerta-datos`, architecture/puerta-datos-a1.md):

    from puerta_datos_cliente import Puerta
    p = Puerta.desde_entorno(rol="enjambre")          # PUERTA_DATOS_URL + PUERTA_DATOS_FICHA_ENJAMBRE
    p.publicar_evento("enjambre", "integrada", "T1 integrada", tarea="T1",
                      respaldo=lambda ev: publicar_en_supabase(ev))   # → {"via": "puerta"|"supabase"|"cola", ...}

Elección automática: si la puerta responde (salud cada ≥ 30 s; tras un fallo, espera creciente
hasta 10 min) se usa; si no, la misma operación va por `respaldo` (Supabase, como hasta hoy); si
tampoco, se guarda en `~/.starseed/puerta-datos-cola.jsonl` (2.000 como mucho) y se manda sola
la próxima vez que algo funcione. Nunca se pierde una escritura y nunca se imprime la URL ni la
ficha (los errores salen tachados). Solo biblioteca estándar.
"""
import json
import os
import re
import time
import urllib.error
import urllib.request

HOME = os.path.expanduser("~")
ENV_STARSEED = os.path.join(HOME, ".starseed", "env")
COLA = os.path.join(HOME, ".starseed", "puerta-datos-cola.jsonl")
COLA_MAX = 2000
SALUD_OK_S = 30
ESPERAS_S = (60, 120, 300, 600)
AGENTE = "starseed-puerta-cliente/1"


def leer_env(ruta=ENV_STARSEED):
    """{NOMBRE: valor} de un archivo de entorno (`export X=…`, comillas, comentarios)."""
    datos = {}
    try:
        with open(ruta, encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if not linea or linea.startswith("#") or "=" not in linea:
                    continue
                if linea.startswith("export "):
                    linea = linea[7:]
                k, v = linea.split("=", 1)
                datos[k.strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    return datos


def tachar(texto):
    t = str(texto or "")
    t = re.sub(r"https?://[^\s\"']+", "<url>", t)
    t = re.sub(r"pd_[A-Za-z0-9_-]{20,}", "<ficha>", t)
    t = re.sub(r"\b\d{1,3}(?:\.\d{1,3}){3}\b", "<ip>", t)
    return t[:300]


def _http(metodo, url, cabeceras, cuerpo=None, timeout=8):
    datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None
    req = urllib.request.Request(url, data=datos, method=metodo, headers=dict(cabeceras, **{"User-Agent": AGENTE}))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            texto = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(texto) if texto else None)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8", "replace") or "null")
        except ValueError:
            return e.code, None


class Puerta:
    def __init__(self, url="", ficha="", http=None, ahora=time.time, cola=COLA):
        self.url = (url or "").rstrip("/")
        self.ficha = ficha or ""
        self.http = http or _http
        self.ahora = ahora
        self.cola = cola
        self._salud = None  # (ok, cuando)
        self._fallos = 0
        self._espera_hasta = 0.0

    @classmethod
    def desde_entorno(cls, rol="enjambre", **kw):
        env = dict(leer_env())
        env.update({k: v for k, v in os.environ.items() if k.startswith("PUERTA_DATOS_")})
        url = env.get("PUERTA_DATOS_URL", "")
        ficha = env.get("PUERTA_DATOS_FICHA_%s" % rol.upper().replace("-", "_"), "") or env.get("PUERTA_DATOS_FICHA", "")
        if url and not (url.startswith("https://") or url.startswith("http://127.0.0.1") or url.startswith("http://localhost")):
            url = ""  # solo https (o local)
        return cls(url=url, ficha=ficha, **kw)

    # ── elección automática ──
    def configurada(self):
        return bool(self.url and self.ficha)

    def disponible(self):
        # Los nodos de MetaGenesis entran con su llave, sin ficha: basta la URL para la salud.
        if not self.url:
            return False
        t = self.ahora()
        if t < self._espera_hasta:
            return False
        if self._salud and self._salud[0] and t - self._salud[1] < SALUD_OK_S:
            return True
        try:
            estado, j = self.http("GET", self.url + "/salud", {}, timeout=4)
            ok = estado == 200 and isinstance(j, dict) and j.get("ok") is True
        except Exception:  # noqa: BLE001
            ok = False
        self._anotar(ok)
        return ok

    def _anotar(self, ok):
        t = self.ahora()
        self._salud = (ok, t)
        if ok:
            self._fallos = 0
            self._espera_hasta = 0.0
        else:
            self._fallos += 1
            self._espera_hasta = t + ESPERAS_S[min(len(ESPERAS_S) - 1, self._fallos - 1)]

    def _pedir(self, metodo, ruta, cuerpo=None, timeout=8):
        cab = {"Accept": "application/json"}
        if self.ficha:
            cab["Authorization"] = "Bearer " + self.ficha
        if cuerpo is not None:
            cab["Content-Type"] = "application/json"
        try:
            estado, j = self.http(metodo, self.url + ruta, cab, cuerpo, timeout=timeout)
        except Exception as e:  # noqa: BLE001
            self._anotar(False)
            return None, {"error": tachar("%s: %s" % (type(e).__name__, e))}
        if estado >= 500 or estado == 0:
            self._anotar(False)
        return estado, j

    # ── escrituras con respaldo y cola ──
    def _escribir(self, operacion, metodo, ruta, cuerpo, respaldo):
        if self.configurada() and self.disponible():
            estado, j = self._pedir(metodo, ruta, cuerpo)
            if estado and 200 <= estado < 300:
                self.vaciar_cola()
                return dict(j or {}, via="puerta")
            if estado in (400, 401, 403, 404, 413, 415):
                # Un «no» de la puerta (permiso o datos) no se salta yendo a Supabase.
                return {"via": "puerta", "error": (j or {}).get("error", "HTTP %s" % estado), "estado": estado}
        if respaldo is not None:
            try:
                r = respaldo(cuerpo)
                return {"via": "supabase", "resultado": r}
            except Exception as e:  # noqa: BLE001
                motivo = tachar("%s: %s" % (type(e).__name__, e))
        else:
            motivo = "sin respaldo"
        self._encolar(operacion, metodo, ruta, cuerpo)
        return {"via": "cola", "motivo": motivo}

    def _encolar(self, operacion, metodo, ruta, cuerpo):
        os.makedirs(os.path.dirname(self.cola), exist_ok=True)
        lineas = []
        try:
            with open(self.cola, encoding="utf-8") as f:
                lineas = f.read().splitlines()
        except OSError:
            pass
        lineas.append(json.dumps({"op": operacion, "m": metodo, "r": ruta, "c": cuerpo, "t": self.ahora()}, ensure_ascii=False))
        lineas = lineas[-COLA_MAX:]
        tmp = self.cola + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write("\n".join(lineas) + "\n")
        os.chmod(tmp, 0o600)
        os.replace(tmp, self.cola)

    def vaciar_cola(self, tope=200):
        """Manda lo que esperaba en la cola. Devuelve cuántas entraron."""
        try:
            with open(self.cola, encoding="utf-8") as f:
                lineas = [l for l in f.read().splitlines() if l.strip()]
        except OSError:
            return 0
        if not lineas:
            return 0
        hechas, quedan = 0, []
        for i, l in enumerate(lineas):
            if hechas >= tope:
                quedan.extend(lineas[i:])
                break
            try:
                e = json.loads(l)
            except ValueError:
                continue
            estado, _ = self._pedir(e["m"], e["r"], e.get("c"))
            if estado and (200 <= estado < 300 or estado in (400, 404, 413)):
                hechas += 1  # entró, o la puerta dice que nunca entrará: no se reintenta en bucle
            else:
                quedan.extend(lineas[i:])
                break
        tmp = self.cola + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write("\n".join(quedan) + ("\n" if quedan else ""))
        os.replace(tmp, self.cola)
        return hechas

    # ── operaciones ──
    def publicar_evento(self, quien, tipo, texto="", tarea=None, datos=None, respaldo=None):
        ev = {"quien": quien, "tipo": tipo, "texto": texto or "", "tarea": tarea, "datos": datos}
        return self._escribir("evento", "POST", "/v1/bus/eventos", ev, respaldo)

    def leer_eventos(self, desde=0, tipos=None, esperar=0, limite=200):
        if not (self.configurada() and self.disponible()):
            return None
        q = "?desde=%d&limite=%d" % (int(desde), int(limite))
        if tipos:
            q += "&tipos=" + ",".join(tipos)
        if esperar:
            q += "&esperar=%d" % min(25, int(esperar))
        estado, j = self._pedir("GET", "/v1/bus/eventos" + q, timeout=8 + min(25, int(esperar or 0)))
        return j if estado == 200 else None

    def latido(self, clase, ident, datos=None, respaldo=None):
        return self._escribir("latido", "POST", "/v1/latidos", {"clase": clase, "id": ident, "datos": datos}, respaldo)

    def malla_registrar(self, nodo, respaldo=None):
        return self._escribir("malla", "POST", "/v1/malla/nodos", {"nodo": nodo}, respaldo)

    def malla_nodos(self, vivos_s=900):
        if not (self.configurada() and self.disponible()):
            return None
        estado, j = self._pedir("GET", "/v1/malla/nodos?vivos_s=%d" % int(vivos_s))
        return (j or {}).get("nodos") if estado == 200 else None

    def astraura_poner(self, clave, data, respaldo=None):
        return self._escribir("astraura", "PUT", "/v1/astraura/estado/%s" % clave, {"data": data}, respaldo)

    def astraura_leer(self, clave):
        if not (self.configurada() and self.disponible()):
            return None
        estado, j = self._pedir("GET", "/v1/astraura/estado/%s" % clave)
        return j if estado == 200 else None

    def freno_poner(self, activo, motivo=None, hasta=None, respaldo=None):
        return self._escribir("freno", "PUT", "/v1/freno", {"activo": bool(activo), "motivo": motivo, "hasta": hasta}, respaldo)

    def metricas(self):
        if not (self.configurada() and self.disponible()):
            return None
        estado, j = self._pedir("GET", "/v1/metricas")
        return j if estado == 200 else None

    # ── nodo de MetaGenesis (con SU llave, sin ficha): mismas reglas que metagenesis_nodo_latir ──
    def metagenesis_latir(self, nodo, llave, medio, puntos, datos=None, ttl_s=900):
        """{arriendo, nodos, ordenes} o None si la puerta no está (el nodo sigue por su camino de siempre)."""
        if not self.disponible():
            return None
        estado, j = self._pedir("POST", "/v1/metagenesis/latir",
                                {"nodo": nodo, "llave": llave, "medio": medio, "puntos": int(puntos), "datos": datos, "ttl_s": int(ttl_s)})
        return j if estado == 200 else None

    def metagenesis(self, accion, nodo, llave, **extra):
        """ceder | baja | foto (foto=…) | orden-resultado (id=…, estado=…, resultado=…). True/False/None."""
        if accion not in ("ceder", "baja", "foto", "orden-resultado") or not self.disponible():
            return None
        estado, j = self._pedir("POST", "/v1/metagenesis/%s" % accion, dict(extra, nodo=nodo, llave=llave))
        return bool((j or {}).get("ok")) if estado == 200 else None
