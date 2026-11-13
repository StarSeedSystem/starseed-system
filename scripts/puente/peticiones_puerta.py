#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GEN1113F · Puente B por la puerta de datos del A1: las peticiones de Alex sin Telegram.

Contrato: architecture/astraura-chats-genesis.md §4.3 (punto 3), §4.4 (fila B), §5.2 y §7.1.
Con la variable STARSEED_PUERTA_FICHA_GENESIS_A1 (la ficha de la puerta, jamás impresa) el bot de
`peticiones_telegram.py` recoge además las entradas `destino=a1` de la puerta, las comprueba como las
comprueba la Mac (lista local de cuentas, forma, caducidad, nonce), las mete en SU cola durable con
`origen: "genesis"` y sube sus respuestas al espejo `puente:peticiones` en vez de mandarlas a Telegram.
Sin la variable no se engancha nada. No toca el offset de Telegram. Solo biblioteca estándar.

GEN1114D (contrato astraura-chats-identidad-firma.md §3.5.3, §3.6, §3.7 y §8.2): solo se atienden entradas
`v:2` firmadas por un aparato emparejado en la Mac. Se verifican con `genesis_firma_logica` (GEN1114B, el mismo
checkout; necesita `cryptography`) contra `aparatos.json`, `aparatos-retirados.json`, `chat-a1.json` y
`vistos.json` de esta carpeta (los tres primeros los lleva la Mac por ssh; todos 600 y de este usuario). Sin
lista de aparatos no se ejecuta nada. No hay ninguna opción para aceptar `v:1`.
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

# GEN1114D · la verificación es la de la Mac (GEN1114B), importada del mismo checkout, nunca copiada. Si falta
# (o falta `cryptography`), el bot sigue con Telegram y el puente rechaza todo lo que llega por la puerta.
try:
    import genesis_firma_logica as firma
except ImportError:
    firma = None

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

    # ── GEN1114D · entradas firmadas por el aparato (§3.5.3) ──
    def _privado_o(self, nombre, si_falta):
        """El JSON de un archivo 600 de este usuario; `si_falta` si no existe; None si existe y no vale."""
        ruta = self._ruta(nombre)
        if not os.path.lexists(ruta):
            return si_falta
        d = self.mod.leer_privado(ruta)
        return d if isinstance(d, dict) else None

    def _guardar_vistos(self, vistos, ahora):
        for k in [k for k, v in vistos.items()
                  if not (isinstance(v, dict) and isinstance(v.get("t"), (int, float))) or ahora - v["t"] > firma.VISTOS_S]:
            del vistos[k]
        ruta = self._ruta("vistos.json")
        tmp = ruta + ".tmp"
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(vistos, f)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, 0o600)
        os.replace(tmp, ruta)

    def procesar(self, e):
        """(estado, detalle, ejecutar) · primero la firma, como en la Mac (§3.5, pasos 1-7, con destino "a1");
        después las comprobaciones de GEN1113 sobre el objeto del paso 8, sacado SOLO de la carga firmada. Los
        `aparato:seq` y nonces se anotan antes de ejecutar (paso 9). Nada corre si falla una."""
        self.firma_info = {"firma": "sin-comprobar", "aparato8": str(e.get("aparato") or "")[:8], "seq": None}
        if firma is None:
            return "rechazado", "falta la verificación de firmas en el A1 (genesis_firma_logica o cryptography)", None
        altas = self._privado_o("aparatos.json", None)
        if altas is None:
            return "rechazado", "falta la lista de aparatos en el A1 (o no tiene permisos 600)", None
        retirados = self._privado_o("aparatos-retirados.json", {"v": 1, "retirados": []})
        vistos = self._privado_o("vistos.json", {})
        if retirados is None or vistos is None:
            return "rechazado", "aparatos-retirados.json o vistos.json ilegibles o sin permisos 600", None
        chat = self.mod.chat_a1()   # lo lleva la Mac (llevar-a1); nunca el catálogo de la puerta
        canon = None if chat is None else {"v": 2, "chats": [dict(chat, v=2, tipo="puente-telegram", fuente=FUENTE)]}
        ahora = self.ahora()
        ok, motivo, carga = firma.comprobar_entrada_firmada(e, firma.aparatos_validos(altas), retirados, canon,
                                                            vistos, ahora, "a1")
        self.firma_info.update(firma="ok" if ok else motivo, seq=(carga or {}).get("seq"))
        if not ok:
            # GEN1114INT: el mismo detalle que acusa la Mac («[motivo] texto», §3.9), para que la web lo traduzca igual.
            retiro = firma.retiro_de(e.get("aparato"), retirados) if motivo == "aparato-revocado" else None
            fecha = None
            if retiro:
                t = firma.epoch_de(retiro.get("t"))
                fecha = time.strftime("el %d-%m a las %H:%M", time.localtime(t)) if t else None
            return ("caducado" if motivo == "caducada" else "rechazado"), firma.texto_de_motivo(motivo, fecha), None
        estado, detalle, accion = self._procesar_gen1113(firma.entrada_para_gen1113(e, carga))
        if accion:
            firma.anotar(vistos, carga, ahora)
            self._guardar_vistos(vistos, ahora)
        return estado, detalle, accion

    # ── una entrada ──
    def _procesar_gen1113(self, e):
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
        if nombre in CAMBIAN or nombre is None:   # GEN1114D: una petición en texto también es «alto» (§3.6): 30 min
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
            self.subir_espejo(m.texto_ayuda())   # GEN1114D: con «Este chat: …» de chat-a1.json
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
        # GEN1114D: la v2 no trae nonce fuera de la carga. Aquí solo se recuerda el acuse de una entrega repetida
        # del MISMO id (p. ej. si falló el acuse); lo que impide repetir una carga, con este id o con otro, es
        # `vistos.json` (seq-repetido / nonce-repetido).
        vistos, clave = self._vistos(), "id:%d" % e["id"]
        if clave in vistos:
            return self._cerrar(e, vistos[clave][1], "ya recibida")
        self.acusar(e["id"], "entregado")
        estado, detalle, accion = self.procesar(e)
        if accion:
            try:
                self.ejecutar(e, *accion)
            except Exception as ex:  # noqa: BLE001
                estado, detalle = "fallo", type(ex).__name__
        vistos[clave] = [self.ahora(), estado]
        self._guardar()
        info = getattr(self, "firma_info", {})   # GEN1114D §3.10: aparato8, firma y seq; nunca carga ni texto
        self.mod.log("genesis", str(e.get("cuenta", ""))[:8], "aparato8=%s" % info.get("aparato8", ""),
                     "seq=%s" % info.get("seq"), "firma=%s" % info.get("firma"), estado)
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
