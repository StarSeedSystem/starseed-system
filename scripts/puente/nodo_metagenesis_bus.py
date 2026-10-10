# -*- coding: utf-8 -*-
"""Nodo de MetaGenesis · el enlace con Supabase (OPA1011, 2026-10-10).

Tres modos, el mismo contrato para el bucle (`nodo_metagenesis.py`) — el tercero, **puerta**
(PDA1011), lleva el arriendo a la puerta de datos del A1 y deja el bus para lo que lee el OS:

  · **bus** (funciona YA): la tabla pública `relevo_eventos` (migración 20260903200000), con
    tipos `mg_*`. Latidos, reclamos de mando, bajas, órdenes FIRMADAS (HMAC con
    `STARSEED_LANZADOR_SECRETO`), resultados, decisiones, foto y colas portables. Cualquiera con
    la clave anónima lee y escribe esa tabla: por eso una orden sin firma válida no se ejecuta
    nunca, y en el bus no va nada privado (ni nombres de máquina, ni IPs, ni prompts salvo las
    colas portables, que ya viajan así en el evento `arranque` del orquestador).
  · **tablas** (cuando Alex aplique `20261011100000_metagenesis_nodos.sql`): tablas con RLS solo
    para miembros de MetaGenesis y UNA llamada por vuelta (`metagenesis_nodo_latir`: late, toma
    o renueva el arriendo de líder de forma atómica y recoge las órdenes para este nodo). El nodo
    se identifica con su LLAVE (secreto propio, solo su huella sha256 vive en la base): nada de
    la clave de servicio en máquinas expuestas.

Solo biblioteca estándar (el A1 no tiene el venv de la Mac). La red entra por `http` para que
las pruebas usen un Supabase simulado. Nunca se imprime una clave: se leen por NOMBRE.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Dict, List, Optional, Tuple

import nodo_metagenesis_logica as L

AGENTE = "starseed-nodo-metagenesis/%s" % L.VERSION
Http = Callable[[str, str, Dict[str, str], Optional[bytes], float], Tuple[int, str]]


def http_urllib(metodo: str, url: str, cabeceras: Dict[str, str], cuerpo: Optional[bytes], tope: float) -> Tuple[int, str]:
    """La red de verdad. (estado, texto); estado 0 = sin respuesta."""
    req = urllib.request.Request(url, data=cuerpo, method=metodo, headers=dict(cabeceras, **{"User-Agent": AGENTE}))
    try:
        with urllib.request.urlopen(req, timeout=tope) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        try:
            return e.code, e.read().decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            return e.code, ""
    except Exception as e:  # noqa: BLE001
        return 0, type(e).__name__


def iso(ts: float) -> str:
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Rest:
    """PostgREST mínimo: la clave va en las cabeceras y jamás en un texto de salida."""

    def __init__(self, url: str, clave: str, http: Http = http_urllib, tope: float = 15.0):
        self.url = (url or "").rstrip("/")
        self._clave = clave or ""
        self.http = http
        self.tope = tope
        self.peticiones = 0

    def pedir(self, metodo: str, ruta: str, cuerpo: Any = None, prefer: Optional[str] = None) -> Tuple[int, Any]:
        cab = {"apikey": self._clave, "Authorization": "Bearer " + self._clave, "Accept": "application/json"}
        datos = None
        if cuerpo is not None:
            cab["Content-Type"] = "application/json"
            datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
        if prefer:
            cab["Prefer"] = prefer
        self.peticiones += 1
        estado, texto = self.http(metodo, self.url + ruta, cab, datos, self.tope)
        try:
            return estado, (json.loads(texto) if texto else None)
        except ValueError:
            return estado, texto


def _ts_de_fila(fila: Dict[str, Any]) -> float:
    d = fila.get("datos") or {}
    ts = d.get("ts") if isinstance(d, dict) else None
    if isinstance(ts, (int, float)):
        return float(ts)
    t = L.epoch_de_iso(str(fila.get("t") or "").replace(" ", "T")[:19] + "Z") if fila.get("t") else None
    return t or 0.0


class EnlaceBus:
    """Modo bus (`relevo_eventos`). Guarda en memoria la ventana que hace falta para elegir líder."""

    modo = "bus"
    TABLA = "/rest/v1/relevo_eventos"

    def __init__(self, rest: Rest, yo: str, ttl: int = L.TTL_LIDER_S):
        self.rest = rest
        self.yo = yo
        self.ttl = ttl
        self.ultimo_id = 0
        self.latidos: List[Dict[str, Any]] = []
        self.reclamos: List[Dict[str, Any]] = []
        self.bajas: List[Dict[str, Any]] = []
        self.ordenes: List[Dict[str, Any]] = []
        self.asignaciones: List[Dict[str, Any]] = []
        self.error = ""

    # ── escritura ──
    def _insertar(self, tipo: str, texto: str, datos: Dict[str, Any], tarea: str = "") -> bool:
        fila = {"quien": ("nodo:" + self.yo)[:40], "tipo": tipo, "tarea": tarea[:60] or None,
                "texto": L.tachar(texto)[:600], "datos": datos}
        estado, cuerpo = self.rest.pedir("POST", self.TABLA, fila, prefer="return=minimal")
        if 200 <= estado < 300:
            self.error = ""
            return True
        self.error = "bus %s: %s" % (estado or "sin red", str(cuerpo)[:120])
        return False

    def latir(self, latido: Dict[str, Any]) -> bool:
        texto = "%s late · %s · líder visto: %s" % (latido.get("nodo"), latido.get("modo"), latido.get("lider_visto") or "—")
        return self._insertar(L.T_LATIDO, texto, latido)

    def reclamar(self, termino: int, puntos: int, motivo: str, ts: float) -> bool:
        datos = {"v": L.VERSION, "nodo": self.yo, "termino": termino, "puntos": puntos, "motivo": motivo[:200], "ts": ts}
        ok = self._insertar(L.T_LIDER, "%s toma el mando (término %d): %s" % (self.yo, termino, motivo), datos)
        if ok:
            self.reclamos.append(datos)
        return ok

    def baja(self, ts: float) -> bool:
        return self._insertar(L.T_BAJA, "%s se despide" % self.yo, {"v": L.VERSION, "nodo": self.yo, "ts": ts})

    def foto(self, f: Dict[str, Any]) -> bool:
        return self._insertar(L.T_FOTO, L.texto_foto(f), f)

    def colas(self, tareas: List[Dict[str, Any]], ts: float) -> bool:
        datos = {"v": L.VERSION, "nodo": self.yo, "ts": ts, "tareas": tareas}
        return self._insertar(L.T_COLAS, "%s publica %d tarea(s) listas para otros medios" % (self.yo, len(tareas)), datos)

    def asignar(self, ids: List[str], nodo: str, ts: float) -> bool:
        datos = {"v": L.VERSION, "nodo": nodo, "por": self.yo, "ids": ids[:40], "ts": ts}
        ok = self._insertar(L.T_ASIGNACION, "%d tarea(s) siguen en %s" % (len(ids), nodo), datos)
        if ok:
            self.asignaciones.append(datos)
        return ok

    def resultado(self, orden: Dict[str, Any], estado: str, texto: str, ts: float) -> bool:
        datos = {"v": L.VERSION, "nonce": orden.get("nonce"), "nodo": self.yo, "estado": estado,
                 "resultado": L.tachar(texto)[:300], "accion": orden.get("accion"), "ts": ts}
        return self._insertar(L.T_ORDEN_HECHA, "%s · %s: %s" % (orden.get("accion"), estado, texto), datos)

    def decision(self, d: Dict[str, Any]) -> bool:
        datos = {k: d.get(k) for k in ("ts", "accion", "nodo", "motivo", "resultado", "seco", "termino")}
        datos["lider"] = self.yo
        return self._insertar(L.T_DECISION, "%s → %s: %s" % (d.get("accion"), d.get("nodo"), d.get("motivo")), datos)

    def orden(self, o: Dict[str, Any]) -> bool:
        """Publica una orden ya FIRMADA (la CLI del nodo o el líder repartiendo trabajo)."""
        return self._insertar(L.T_ORDEN, "orden %s para %s" % (o.get("accion"), o.get("para")), o)

    # ── lectura ──
    def novedades(self, ahora: float) -> Dict[str, Any]:
        """Lee lo nuevo del bus (UNA petición por vuelta) y devuelve la ventana viva."""
        tipos = ",".join(L.TIPOS_NODO)
        q = "select=id,t,tipo,datos&tipo=in.(%s)&order=id.asc&limit=500" % tipos
        if self.ultimo_id:
            q += "&id=gt.%d" % self.ultimo_id
        else:
            desde = iso(ahora - max(2 * self.ttl, L.GRACIA_ASIGNACION_S))
            q += "&t=gte.%s" % urllib.parse.quote(desde)
        estado, filas = self.rest.pedir("GET", self.TABLA + "?" + q)
        if not (200 <= estado < 300) or not isinstance(filas, list):
            self.error = "bus %s al leer" % (estado or "sin red")
            return self.ventana(ahora)
        self.error = ""
        for f in filas:
            try:
                self.ultimo_id = max(self.ultimo_id, int(f.get("id") or 0))
            except (TypeError, ValueError):
                continue
            d = f.get("datos")
            if not isinstance(d, dict):
                continue
            d = dict(d)
            d.setdefault("ts", _ts_de_fila(f))
            tipo = f.get("tipo")
            if tipo == L.T_LATIDO:
                self.latidos.append(d)
            elif tipo == L.T_LIDER:
                self.reclamos.append(d)
            elif tipo == L.T_BAJA:
                self.bajas.append(d)
            elif tipo == L.T_ORDEN:
                self.ordenes.append(d)
            elif tipo == L.T_ASIGNACION:
                self.asignaciones.append(d)
        return self.ventana(ahora)

    def ventana(self, ahora: float) -> Dict[str, Any]:
        corte = ahora - 2 * self.ttl
        self.latidos = [x for x in self.latidos if float(x.get("ts") or 0) >= corte][-400:]
        self.bajas = [x for x in self.bajas if float(x.get("ts") or 0) >= corte][-100:]
        self.reclamos = self.reclamos[-50:]
        self.ordenes = [x for x in self.ordenes if float(x.get("ts") or 0) >= ahora - 2 * L.ORDEN_CADUCA_S][-100:]
        self.asignaciones = [x for x in self.asignaciones if float(x.get("ts") or 0) >= ahora - L.GRACIA_ASIGNACION_S][-50:]
        return {"latidos": list(self.latidos), "reclamos": list(self.reclamos), "bajas": list(self.bajas),
                "ordenes": list(self.ordenes), "asignaciones": list(self.asignaciones)}

    def ultimas_colas(self) -> List[Dict[str, Any]]:
        estado, filas = self.rest.pedir("GET", self.TABLA + "?select=datos&tipo=eq.%s&order=id.desc&limit=1" % L.T_COLAS)
        if 200 <= estado < 300 and isinstance(filas, list) and filas:
            d = filas[0].get("datos") or {}
            return [t for t in d.get("tareas") or [] if isinstance(t, dict)]
        return []


class EnlaceSoloLectura(EnlaceBus):
    """El bus para una prueba SECA en un medio vivo (OPA1011b): lee lo mismo que el nodo de verdad y no
    escribe NADA (ni latido, ni mando, ni foto, ni órdenes): el servicio que ya corre con el mismo id
    sigue siendo el único que habla por este medio."""

    def __init__(self, rest: Rest, yo: str, ttl: int = L.TTL_LIDER_S):
        super().__init__(rest, yo, ttl)
        self.no_escritas: List[str] = []

    def _insertar(self, tipo: str, texto: str, datos: Dict[str, Any], tarea: str = "") -> bool:
        self.no_escritas.append(tipo)
        return True


class EnlaceTablas:
    """Modo tablas (migración 20261011100000): una llamada por vuelta, arriendo atómico en Postgres."""

    modo = "tablas"

    def __init__(self, rest: Rest, yo: str, llave: str, medio: str, ttl: int = L.TTL_LIDER_S):
        self.rest = rest
        self.yo = yo
        self._llave = llave
        self.medio = medio
        self.ttl = ttl
        self.error = ""
        self.arriendo: Dict[str, Any] = {}
        self.nodos: List[Dict[str, Any]] = []
        self.pendientes: List[Dict[str, Any]] = []

    def _rpc(self, nombre: str, args: Dict[str, Any]) -> Tuple[int, Any]:
        cuerpo = dict(args, _nodo=self.yo, _llave=self._llave)
        estado, datos = self.rest.pedir("POST", "/rest/v1/rpc/%s" % nombre, cuerpo)
        self.error = "" if 200 <= estado < 300 else "tablas %s: %s" % (estado or "sin red", str(datos)[:120])
        return estado, datos

    def probar(self) -> Tuple[bool, str]:
        """¿Existen las tablas y esta llave está dada de alta? (lo decide el propio Postgres)."""
        estado, datos = self._rpc("metagenesis_nodo_hola", {})
        if 200 <= estado < 300:
            return True, ""
        cuerpo = datos if isinstance(datos, dict) else {}
        if estado == 404 or cuerpo.get("code") in ("PGRST202", "42883"):
            return False, "la base aún no tiene las tablas de nodos (migración 20261011100000 sin aplicar)"
        if cuerpo.get("code") == "42501":
            return False, "la llave de este nodo no está dada de alta (nodo_metagenesis.py llave)"
        return False, "no se pudo comprobar el modo tablas (%s)" % (estado or "sin red")

    def latir(self, latido: Dict[str, Any], puntos: int, estable: bool) -> Optional[Dict[str, Any]]:
        estado, datos = self._rpc("metagenesis_nodo_latir", {
            "_medio": self.medio, "_datos": latido, "_puntos": puntos, "_ttl_s": self.ttl, "_estable": estable})
        if not (200 <= estado < 300) or not isinstance(datos, dict):
            return None
        self.arriendo = datos.get("arriendo") or {}
        self.nodos = [n for n in datos.get("nodos") or [] if isinstance(n, dict)]
        self.pendientes = [o for o in datos.get("ordenes") or [] if isinstance(o, dict)]
        return datos

    def ceder(self) -> bool:
        estado, _ = self._rpc("metagenesis_nodo_ceder", {})
        return 200 <= estado < 300

    def baja(self, ts: float) -> bool:
        estado, _ = self._rpc("metagenesis_nodo_baja", {})
        return 200 <= estado < 300

    def foto(self, f: Dict[str, Any]) -> bool:
        estado, _ = self._rpc("metagenesis_nodo_foto", {"_foto": f})
        return 200 <= estado < 300

    def colas(self, tareas: List[Dict[str, Any]], ts: float) -> bool:
        estado, _ = self._rpc("metagenesis_nodo_colas", {"_tareas": tareas})
        return 200 <= estado < 300

    def ultimas_colas(self) -> List[Dict[str, Any]]:
        estado, datos = self._rpc("metagenesis_nodo_leer_colas", {})
        return [t for t in (datos or []) if isinstance(t, dict)] if 200 <= estado < 300 and isinstance(datos, list) else []

    def asignar(self, ids: List[str], nodo: str, ts: float) -> bool:
        estado, _ = self._rpc("metagenesis_nodo_bitacora", {
            "_tipo": "asignacion", "_texto": "%d tarea(s) siguen en %s" % (len(ids), nodo),
            "_datos": {"nodo": nodo, "ids": ids[:40], "ts": ts}})
        return 200 <= estado < 300

    def resultado(self, orden: Dict[str, Any], estado_orden: str, texto: str, ts: float) -> bool:
        oid = str(orden.get("nonce") or "").replace("tabla-", "")
        if not oid.isdigit():
            return False
        estado, _ = self._rpc("metagenesis_nodo_orden_resultado", {
            "_id": int(oid), "_estado": estado_orden, "_resultado": L.tachar(texto)[:300]})
        return 200 <= estado < 300

    def decision(self, d: Dict[str, Any]) -> bool:
        datos = {k: d.get(k) for k in ("ts", "accion", "nodo", "motivo", "resultado", "seco", "termino")}
        estado, _ = self._rpc("metagenesis_nodo_bitacora", {
            "_tipo": "decision", "_texto": "%s → %s: %s" % (d.get("accion"), d.get("nodo"), d.get("motivo")),
            "_datos": datos})
        return 200 <= estado < 300

    def orden(self, o: Dict[str, Any]) -> bool:  # en tablas las órdenes las crean las personas (RLS)
        return False

    def ordenes_de_tabla(self) -> List[Dict[str, Any]]:
        """Las órdenes recogidas en el último latido, con la forma de las del bus."""
        salida = []
        for o in self.pendientes:
            salida.append({"accion": o.get("accion"), "args": o.get("args") or {}, "para": o.get("para") or "lider",
                           "t": o.get("t"), "nonce": "tabla-%08d" % int(o.get("id") or 0), "por": o.get("por")})
        return salida



class EnlacePuerta(EnlaceBus):
    """(PDA1011) El arriendo de líder en la PUERTA DE DATOS del A1 (`/v1/metagenesis/latir`, mismas
    reglas que `metagenesis_nodo_latir`: toma libre o caducado, renueva el líder, relevo ordenado
    ≥ 100 puntos con racha ≥ 600 s), sin una sola petición a Supabase por vuelta.

    El bus de Supabase sigue para lo que hoy leen el OS y los demás medios: el latido como ESPEJO
    cada `espejo_s` (la vista de MetaGenesis da por vivo un nodo 15 min), las órdenes FIRMADAS y las
    asignaciones leídas cada `ordenes_s` (caducan a los 15 min) y la foto, las decisiones, las colas y
    los resultados como siempre. Si la puerta no responde, `latir_puerta` devuelve None y el nodo
    sigue por el bus esa misma vuelta (architecture/puerta-datos-a1.md §10.1).

    La puerta vive en el A1: si el A1 cae, caen a la vez la puerta y su nodo, y la Mac vuelve sola al
    bus; por eso no hay dos líderes a la vez salvo un corte de la puerta que solo vea un medio."""

    modo = "puerta"

    def __init__(self, rest: Rest, yo: str, puerta: Any, llave: str, medio: str, ttl: int = L.TTL_LIDER_S,
                 espejo_s: int = 600, ordenes_s: int = 600):
        super().__init__(rest, yo, ttl)
        self.puerta = puerta
        self._llave = llave
        self.medio = medio
        self.espejo_s = espejo_s
        self.ordenes_s = ordenes_s
        self.arriendo: Dict[str, Any] = {}
        self.nodos: List[Dict[str, Any]] = []
        self.pendientes: List[Dict[str, Any]] = []
        self._ultimo_espejo = 0.0
        self._ultimas_ordenes = 0.0
        self.peticiones_puerta = 0

    def latir_puerta(self, latido: Dict[str, Any], puntos: int) -> Optional[Dict[str, Any]]:
        self.peticiones_puerta += 1
        r = self.puerta.metagenesis_latir(self.yo, self._llave, self.medio, int(puntos), datos=latido, ttl_s=self.ttl)
        if not isinstance(r, dict):
            return None
        self.arriendo = r.get("arriendo") or {}
        self.nodos = [n for n in r.get("nodos") or [] if isinstance(n, dict)]
        self.pendientes = [o for o in r.get("ordenes") or [] if isinstance(o, dict)]
        return r

    def espejo(self, latido: Dict[str, Any], ahora: float) -> bool:
        """El latido al bus como mucho cada `espejo_s` (lo lee la vista de MetaGenesis del OS)."""
        if ahora - self._ultimo_espejo < self.espejo_s:
            return False
        if self.latir(latido):
            self._ultimo_espejo = ahora
            return True
        return False

    def ordenes_del_bus(self, ahora: float) -> List[Dict[str, Any]]:
        """Órdenes firmadas y asignaciones del bus, UNA lectura como mucho cada `ordenes_s`."""
        if ahora - self._ultimas_ordenes < self.ordenes_s:
            return []
        self._ultimas_ordenes = ahora
        q = "select=id,t,tipo,datos&tipo=in.(%s,%s)&order=id.asc&limit=300" % (L.T_ORDEN, L.T_ASIGNACION)
        if self.ultimo_id:
            q += "&id=gt.%d" % self.ultimo_id
        else:
            q += "&t=gte.%s" % urllib.parse.quote(iso(ahora - max(L.ORDEN_CADUCA_S, L.GRACIA_ASIGNACION_S)))
        estado, filas = self.rest.pedir("GET", self.TABLA + "?" + q)
        if not (200 <= estado < 300) or not isinstance(filas, list):
            self.error = "bus %s al leer órdenes" % (estado or "sin red")
            return []
        nuevas = []
        for f in filas:
            try:
                self.ultimo_id = max(self.ultimo_id, int(f.get("id") or 0))
            except (TypeError, ValueError):
                continue
            d = f.get("datos")
            if not isinstance(d, dict):
                continue
            d = dict(d)
            d.setdefault("ts", _ts_de_fila(f))
            if f.get("tipo") == L.T_ORDEN:
                nuevas.append(d)
            else:
                self.asignaciones.append(d)
        self.asignaciones = [x for x in self.asignaciones if float(x.get("ts") or 0) >= ahora - L.GRACIA_ASIGNACION_S][-50:]
        return nuevas

    def ordenes_de_puerta(self) -> List[Dict[str, Any]]:
        """Las órdenes recogidas en el último latido de la puerta (de miembros con sesión), con la forma de las del bus."""
        salida = []
        for o in self.pendientes:
            try:
                oid = int(o.get("id") or 0)
            except (TypeError, ValueError):
                continue
            salida.append({"accion": o.get("accion"), "args": o.get("args") or {}, "para": o.get("para") or "lider",
                           "t": o.get("t"), "nonce": "puerta-%08d" % oid, "por": o.get("por")})
        return salida

    def exige_firma(self, o: Dict[str, Any]) -> bool:
        """Las del bus van firmadas; las de la puerta las autorizó la puerta (sesión de miembro, 30/h)."""
        return not str((o or {}).get("nonce") or "").startswith("puerta-")

    def resultado(self, orden: Dict[str, Any], estado: str, texto: str, ts: float) -> bool:
        nonce = str(orden.get("nonce") or "")
        if nonce.startswith("puerta-") and nonce[7:].isdigit():
            r = self.puerta.metagenesis("orden-resultado", self.yo, self._llave, id=int(nonce[7:]),
                                        estado=estado, resultado=L.tachar(texto)[:300])
            if r:
                return True
        return super().resultado(orden, estado, texto, ts)

    def foto(self, f: Dict[str, Any]) -> bool:
        self.puerta.metagenesis("foto", self.yo, self._llave, foto=f)
        return super().foto(f)

    def ceder(self) -> bool:
        return bool(self.puerta.metagenesis("ceder", self.yo, self._llave))

    def baja(self, ts: float) -> bool:
        self.puerta.metagenesis("baja", self.yo, self._llave)
        return super().baja(ts)

# ─── entorno ────────────────────────────────────────────────────────────────────────────


def leer_entorno(rutas: Optional[List[str]] = None) -> Dict[str, str]:
    """Variables de los archivos de entorno de la máquina (por NOMBRE; nunca se imprimen).

    Orden: el entorno del proceso manda; luego `~/.starseed/env`, el `.env.local` del repo y
    `/etc/starseed/env` (A1)."""
    raiz = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    rutas = rutas or [os.path.expanduser("~/.starseed/env"), os.path.join(raiz, ".env.local"), "/etc/starseed/env"]
    env: Dict[str, str] = {}
    for ruta in rutas:
        try:
            with open(ruta, encoding="utf-8") as f:
                for linea in f:
                    linea = linea.strip()
                    if not linea or linea.startswith("#") or "=" not in linea:
                        continue
                    k, v = linea.split("=", 1)
                    k = k.strip().replace("export ", "")
                    if k and k not in env:
                        env[k] = v.strip().strip('"').strip("'")
        except OSError:
            continue
    for k in ("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "STARSEED_LANZADOR_SECRETO",
              "STARSEED_NODO_LLAVE"):
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env
