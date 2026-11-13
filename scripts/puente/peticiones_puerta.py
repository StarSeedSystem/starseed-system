#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GEN1113F · Puente B por la puerta de datos del A1: las peticiones de Alex sin Telegram.

Contrato: architecture/astraura-chats-genesis.md §4.3 (punto 3), §4.4 (fila B), §5.2 y §7.1.
Con la variable STARSEED_PUERTA_FICHA_GENESIS_A1 (la ficha de la puerta, jamás impresa) el bot de
`peticiones_telegram.py` recoge además las entradas `destino=a1` de la puerta, las comprueba como las
comprueba la Mac (lista local de cuentas, forma, caducidad, nonce), las mete en SU cola durable con
`origen: "genesis"` y sube sus respuestas al espejo `puente:peticiones` en vez de mandarlas a Telegram.
Sin la variable no se engancha nada. No toca el offset de Telegram. Solo biblioteca estándar.
"""
import datetime
import json
import os
import re
import threading
import time
import uuid

from director_chat import tachar as tachar_claves
from puerta_datos_cliente import Puerta, tachar

VAR_FICHA = "STARSEED_PUERTA_FICHA_GENESIS_A1"
FUENTE = "puente:peticiones"
ORIGEN = "genesis"
CADUCA_S = 30 * 60            # §4.5: una orden que cambia algo caduca a los 30 min
VISTOS_S = 7 * 24 * 3600      # §4.3: el nonce se guarda 7 días
MAX_TEXTO = 8000
# (GEN1113INT) La puerta corta el cuerpo en 64 KB y cada registro en 48 KB, medidos en bytes de JSON: un
# trozo de 19.000 caracteres con acentos o emojis pasaba de 48 KB y un lote de varios, de 64 KB, y el espejo
# se quedaba atascado para siempre (con el latido dentro). Trozos de 8.000 caracteres (≤ 32 KB aun con
# caracteres de 4 bytes) y lotes de ≤ 56 KB.
MAX_REGISTRO = 8000
MAX_LOTE_BYTES = 56 * 1024
ESPERAS_S = (2, 5, 15, 60)    # §5.2
LATIDO_S = 30
NONCE = re.compile(r"^[A-Za-z0-9_-]{22,32}$")
ORDENES = ("estado", "ayuda", "encargos", "pausa", "sigue", "cancela")   # §4.4, fila B
CAMBIAN = ("pausa", "sigue", "cancela")
IMPLEMENTADAS = ("estado", "ayuda")   # lo que el bot del repo sabe hacer hoy (ver informe)
ALIAS = {"start": "ayuda", "help": "ayuda"}   # como en Telegram


def _epoch(iso):
    try:
        d = datetime.datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        if d.tzinfo is None:
            d = d.replace(tzinfo=datetime.timezone.utc)
        return d.timestamp()
    except ValueError:
        return None


class Puente:
    def __init__(self, mod, puerta, ahora=time.time, dormir=time.sleep):
        self.mod, self.puerta, self.ahora, self.dormir = mod, puerta, ahora, dormir
        self.salida = []            # registros del espejo que no pudieron subir
        self.cerrojo = threading.Lock()
        self.ultimo_latido = 0.0
        self.estado = self.mod.leer_json(self._ruta("puerta.json"), {})

    def _ruta(self, nombre):
        return os.path.join(self.mod.DIR, nombre)

    # ── estado propio (no toca estado.json de Telegram) ──
    def _guardar(self):
        self.mod.escribir_json(self._ruta("puerta.json"), self.estado)

    def _vistos(self):
        v = self.estado.setdefault("vistos", {})
        for n in [n for n, (t, _) in v.items() if self.ahora() - t > VISTOS_S]:
            del v[n]
        return v

    def _duenos(self):
        # (GEN1113INT) Como en la Mac: la lista solo vale si es de este usuario y nadie más puede leerla
        # ni escribirla (600). Una lista que otro pudo tocar no autoriza nada.
        ruta = self._ruta("cuentas.json")
        try:
            st = os.stat(ruta)
        except OSError:
            return None
        if st.st_uid != os.getuid() or st.st_mode & 0o077:
            return None
        d = self.mod.leer_json(ruta, None)
        if not isinstance(d, dict) or not isinstance(d.get("duenos"), list):
            return None
        return {x for x in d["duenos"] if isinstance(x, str)}

    # ── hacia la puerta ──
    def _post(self, ruta, cuerpo):
        estado, _ = self.puerta._pedir("POST", ruta, cuerpo)
        self.ultimo_estado = estado
        return bool(estado and 200 <= estado < 300)

    def acusar(self, ident, estado, detalle=""):
        cuerpo = {"id": ident, "estado": estado}
        if detalle:
            cuerpo["detalle"] = tachar(detalle)[:300]
        for i in range(3):
            if self._post("/v1/genesis/chats/acuse", cuerpo):
                return True
            self.dormir(i + 1)
        return False

    def subir_espejo(self, texto):
        """Respuesta del bot a una petición de Genesis: va al espejo, nunca a Telegram."""
        texto = tachar_claves(str(texto))
        with self.cerrojo:
            for i in range(0, max(len(texto), 1), MAX_REGISTRO):
                t = datetime.datetime.now(datetime.timezone.utc).astimezone()
                self.salida.append({
                    "id": "md-%d-%s" % (int(time.time() * 1000), uuid.uuid4().hex[:4]), "t": t.isoformat(),
                    "de": "peticiones-a1", "rol": "sistema", "tipo": "respuesta", "canal": "mando",
                    "texto": texto[i:i + MAX_REGISTRO]})
            del self.salida[:-200]
        self.vaciar()

    def vaciar(self, latido=False):
        with self.cerrojo:
            lote, peso = [], 0
            for r in self.salida[:200]:
                b = len(json.dumps(r, ensure_ascii=False).encode("utf-8")) + 2
                if lote and peso + b > MAX_LOTE_BYTES:
                    break
                lote.append(r)
                peso += b
            if not lote and not latido:
                return
            self.ultimo_estado = None
            if self._post("/v1/genesis/chats/espejo", {"fuente": FUENTE, "registros": lote, "latido": True}):
                del self.salida[:len(lote)]
                self.ultimo_latido = self.ahora()
            elif self.ultimo_estado in (400, 413) and lote:
                # (GEN1113INT) La puerta no lo aceptará nunca así: se descarta y se dice, sin atascar lo demás.
                self.mod.log("puerta de datos: el espejo rechazó %d respuesta(s) (%s); se descartan"
                             % (len(lote), self.ultimo_estado))
                del self.salida[:len(lote)]

    # ── una entrada ──
    def procesar(self, e):
        """(estado, detalle, ejecutar) · las comprobaciones de §4.3, en su orden. Nada corre si falla una."""
        if not (isinstance(e, dict) and e.get("v") == 1 and e.get("fuente") == FUENTE and e.get("destino") == "a1"
                and isinstance(e.get("id"), int) and not isinstance(e.get("id"), bool)
                and isinstance(e.get("nonce"), str) and NONCE.match(e["nonce"])
                and isinstance(e.get("cuenta"), str) and e["cuenta"] and e.get("rol") in ("dueño", "desarrollador")
                and e.get("accion") in ("orden", "texto")):
            return "rechazado", "forma no válida", None
        duenos = self._duenos()
        if duenos is None:
            return "rechazado", "falta la lista de cuentas en el A1 (o no tiene permisos 600)", None
        if e["rol"] != "dueño" or e["cuenta"] not in duenos:
            return "rechazado", "cuenta no autorizada en el A1", None
        nombre, texto = self._leer_orden(e)
        if nombre == "?":
            return "rechazado", "orden no permitida", None
        if nombre is None and not texto:
            return "rechazado", "texto vacío", None
        if nombre in CAMBIAN:
            enviada = _epoch(e.get("recibido"))
            if enviada is None or self.ahora() - enviada > CADUCA_S:
                return "caducado", "Caducó sin ejecutarse; vuelve a enviarla si aún la quieres", None
        if nombre is not None and nombre not in IMPLEMENTADAS:
            return "rechazado", "esa orden aún no existe en el bot del A1", None
        return "hecho", "", (nombre, texto)

    @staticmethod
    def _leer_orden(e):
        """(nombre, texto): nombre None = petición en texto; '?' = orden que no está en la lista."""
        if e["accion"] == "orden":
            o = e.get("orden")
            if not (isinstance(o, dict) and o.get("nombre") in ORDENES and isinstance(o.get("args"), list)
                    and len(o["args"]) <= 10 and all(isinstance(a, str) and len(a) <= 120 for a in o["args"])):
                return "?", ""
            return o["nombre"], ""
        texto = e.get("texto")
        if not isinstance(texto, str) or len(texto) > MAX_TEXTO:
            return "?", ""
        texto = texto.strip()
        if texto.startswith("/"):
            nombre = texto[1:].split(None, 1)[0].split("@")[0].lower()
            nombre = ALIAS.get(nombre, nombre)
            return (nombre, "") if nombre in ORDENES else ("?", "")
        return None, texto

    def ejecutar(self, e, nombre, texto):
        m = self.mod
        if nombre == "estado":
            with m.bloqueo:
                cola, est = m.leer_json(m.COLA, []), m.leer_json(m.ESTADO, {})
            self.subir_espejo(m.texto_estado(cola, est.get("notebooklm", {})))
        elif nombre == "ayuda":
            self.subir_espejo(m.AYUDA)
        else:
            pid = "g-%d" % e["id"]
            with m.bloqueo:
                cola = m.leer_json(m.COLA, [])
                if not any(x.get("id") == pid for x in cola):
                    cola.append({"id": pid, "texto": texto, "recibida": time.time(), "estado": "nueva",
                                 "intentos": 0, "origen": ORIGEN})
                    m.escribir_json(m.COLA, cola[-200:])
            self.subir_espejo("Recibido ✓ Lo atiende MetaGenesis en el A1, sin la Mac ni Claude.")
            m.hay_trabajo.set()

    def atender_entrada(self, e):
        """True si quedó acusada (y se puede avanzar el cursor). `e["id"]` ya es un entero."""
        vistos, nonce = self._vistos(), e.get("nonce")
        if isinstance(nonce, str) and nonce in vistos:   # §4.3: nonce repetido; no se vuelve a ejecutar
            return self._cerrar(e, vistos[nonce][1], "ya recibida")
        self.acusar(e["id"], "entregado")
        estado, detalle, accion = self.procesar(e)
        if accion:
            try:
                self.ejecutar(e, *accion)
            except Exception as ex:  # noqa: BLE001
                estado, detalle = "fallo", type(ex).__name__
        if isinstance(nonce, str) and NONCE.match(nonce):
            vistos[nonce] = [self.ahora(), estado]
        self._guardar()
        self.mod.log("genesis", str(e.get("cuenta", ""))[:8], e.get("accion"), estado)
        return self._cerrar(e, estado, detalle)

    def _cerrar(self, e, estado, detalle):
        if not self.acusar(e["id"], estado, detalle):
            return False
        self.estado["desde"] = max(self.estado.get("desde", 0), e["id"])
        self._guardar()
        return True

    def una_vuelta(self):
        t0 = self.ahora()
        estado, j = self.puerta._pedir("GET", "/v1/genesis/chats/entrada?destino=a1&desde=%d&esperar=25"
                                       % self.estado.get("desde", 0), timeout=35)
        if estado != 200 or not isinstance(j, dict):
            raise RuntimeError("la puerta contestó %s" % estado)
        entradas = [e for e in j.get("entradas") or [] if isinstance(e, dict) and type(e.get("id")) is int]
        for e in sorted(entradas, key=lambda x: x["id"]):
            if not self.atender_entrada(e):
                raise RuntimeError("no se pudo acusar una entrada")
        if not entradas and self.ahora() - t0 < 1:
            self.dormir(1)

    def bucle(self, parar=None):
        fallos = 0
        while not (parar and parar.is_set()):
            try:
                if self.ahora() - self.ultimo_latido >= LATIDO_S or self.salida:
                    self.vaciar(latido=True)
                self.una_vuelta()
                fallos = 0
            except Exception as ex:  # noqa: BLE001
                self.mod.log("puerta de datos:", tachar("%s: %s" % (type(ex).__name__, ex)))
                self.dormir(ESPERAS_S[min(fallos, len(ESPERAS_S) - 1)])
                fallos += 1


def enganchar(mod, puerta=None):
    """Engancha el puente al módulo del bot: hilo de la puerta, respuestas al espejo. None si no hay puerta."""
    ficha = os.environ.get(VAR_FICHA) or getattr(mod, "ENV", {}).get(VAR_FICHA, "")   # entorno o ~/.starseed/env
    if puerta is None:
        base = Puerta.desde_entorno(rol="genesis-a1")
        puerta = Puerta(url=base.url, ficha=ficha)
    if not (puerta.url and puerta.ficha):
        mod.log("puerta de datos: falta PUERTA_DATOS_URL; el bot sigue solo con Telegram")
        return None
    p = Puente(mod, puerta)
    ctx = threading.local()
    decir0, atender0, enviar0, main0 = mod.decir, mod.atender, mod.enviar_resultado, mod.main

    actualizar0 = getattr(mod, "actualizar", None)

    def decir(texto):
        if getattr(ctx, "retiro_genesis", False):
            # (GEN1113INT) «Retiro de la cola tras 24 h…» de una petición hecha desde Genesis: lo manda
            # `trabajar()` fuera de `atender`, justo después de marcarla «caducada». Va al espejo, no a
            # Telegram (D6), y sin el texto de la petición.
            ctx.retiro_genesis = False
            p.subir_espejo("Retirada de la cola tras 24 h: una petición hecha desde Genesis no se pudo hacer.")
            return
        p.subir_espejo(texto) if getattr(ctx, "genesis", False) else decir0(texto)

    def actualizar(pid, **cambios):
        if actualizar0 is not None:
            actualizar0(pid, **cambios)
        if cambios.get("estado") == "caducada" and isinstance(pid, str) and pid.startswith("g-"):
            ctx.retiro_genesis = True

    def atender(pet):
        ctx.genesis = pet.get("origen") == ORIGEN
        try:
            atender0(pet)
        finally:
            ctx.genesis = False

    def enviar_resultado(tipo, ruta, titulo):
        if getattr(ctx, "genesis", False):   # los archivos no viajan (§5.2): solo el aviso
            p.subir_espejo("%s listo en el A1: %s" % (mod.TIPOS[tipo][0].capitalize(), os.path.basename(ruta)))
        else:
            enviar0(tipo, ruta, titulo)

    def main():
        threading.Thread(target=p.bucle, daemon=True).start()
        main0()

    mod.decir, mod.atender, mod.enviar_resultado, mod.main = decir, atender, enviar_resultado, main
    if actualizar0 is not None:
        mod.actualizar = actualizar
    return p
