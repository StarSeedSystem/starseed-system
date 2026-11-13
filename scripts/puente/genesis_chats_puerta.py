#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Chats de Genesis en Astraura · puente de la Mac con la puerta de datos del A1 (GEN1113B).

Contrato: architecture/astraura-chats-genesis.md §4.3.2, §4.4, §4.5, §5.2 y §7.1 (cliente con la ficha
`genesis-mac`). La Mac solo SALE hacia la puerta: nadie entra en la Mac. Hace dos cosas:

1. Espejo: cada segundo mira el mtime de los cuatro archivos del chat de dirección y SOLO si alguno
   cambió lee `GET /api/mando/director-chat?desde=` en local; sube lo nuevo, tachado otra vez con
   `director_chat.tachar`, a `POST /v1/genesis/chats/espejo` en lotes de ≤ 200. Latido cada 30 s.
2. Entradas: `GET /v1/genesis/chats/entrada?destino=mac&esperar=25` (como un getUpdates); comprueba
   (genesis_chats_logica.validar_entrada, con la lista local de cuentas), ejecuta con las MISMAS
   funciones de siempre (`puente.orden`, `puente.decir`, la ruta local del chat de dirección) y acusa
   SOLO después de ejecutar y anotar en `vistos.json` y en `registro.jsonl`.

  python3 scripts/puente/genesis_chats_puerta.py                 # el servicio (com.starseed.genesis-chats)
  python3 scripts/puente/genesis_chats_puerta.py --estado        # qué ve, sin URL, fichas ni cuentas enteras
  python3 scripts/puente/genesis_chats_puerta.py cuentas --dueno <uuid> [--desarrollador <uuid>] [--quitar <uuid>]

Variables (en ~/.starseed/env; aquí solo sus nombres): PUERTA_DATOS_URL y STARSEED_PUERTA_FICHA_GENESIS_MAC.
Sin ellas el servicio espera sin hacer nada. Sin la lista de cuentas no se ejecuta nada.
"""
import argparse
import contextlib
import importlib.util
import io
import json
import os
import random
import sys
import threading
import time
from collections import OrderedDict
from urllib.parse import quote

CARPETA = os.path.dirname(os.path.abspath(__file__))
if CARPETA not in sys.path:
    sys.path.insert(0, CARPETA)

import genesis_chats_logica as L  # noqa: E402
# GEN1114B · solo se ejecuta lo que firmó un aparato emparejado (contrato GEN1114 §3.5.2).
import genesis_firma_logica as F  # noqa: E402
# /GEN1114B

HOME = os.path.expanduser("~")
BASE = os.environ.get("STARSEED_GENESIS_CHATS_DIR") or os.path.join(HOME, ".starseed", "genesis-chats")
RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
MANDO = os.environ.get("STARSEED_MANDO_URL") or "http://127.0.0.1:9002"
VAR_FICHA = "STARSEED_PUERTA_FICHA_GENESIS_MAC"
VAR_URL = "PUERTA_DATOS_URL"
ESPERAS_S = (2, 5, 15, 60)
LATIDO_S = 30
ESPERA_LARGA_S = 25
PLIST = os.path.join(HOME, "Library", "LaunchAgents", "com.starseed.genesis-chats.plist")
#: (GEN1113INT) Lo que cambia estado de TODO el proceso (os.environ["STARSEED_IDE"], sys.stdout) se hace
#: bajo este cerrojo, y cada vuelta del espejo también lo toma: así nada de un hilo se filtra al otro.
CERROJO_PROCESO = threading.RLock()
ARCHIVOS_FEED = (
    ("chat", ("mando", "director", "chat.jsonl")),
    ("canal", ("mando", "canal.jsonl")),
    ("eventos", ("olas", "eventos.jsonl")),
    ("bitacora", ("relevo", "bitacora.jsonl")),
)


def rutas_feed(raiz=RAIZ):
    return {n: os.path.join(raiz, "starseed_memory_root", *p) for n, p in ARCHIVOS_FEED}


def _modulo(alias, archivo):
    """Importa por ruta un guion hermano (como hace telegram-puente.py con puente.py). Sin copiar nada."""
    if alias in sys.modules:
        return sys.modules[alias]
    spec = importlib.util.spec_from_file_location(alias, os.path.join(CARPETA, archivo))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    sys.modules[alias] = mod
    return mod


def modulos_reales():
    return {
        "puente": _modulo("puente", "puente.py"),
        "telegram": _modulo("telegram_puente_genesis", "telegram-puente.py"),
        "director_chat": _modulo("director_chat", "director_chat.py"),
        "cliente": _modulo("puerta_datos_cliente", "puerta_datos_cliente.py"),
    }


# ── archivos locales (todos 600, escritura atómica) ──────────────────────────

def leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def escribir_json(ruta, datos):
    os.makedirs(os.path.dirname(ruta), mode=0o700, exist_ok=True)
    tmp = "%s.tmp-%d-%d" % (ruta, os.getpid(), threading.get_ident())
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def anadir_linea(ruta, fila):
    os.makedirs(os.path.dirname(ruta), mode=0o700, exist_ok=True)
    fd = os.open(ruta, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    with os.fdopen(fd, "a", encoding="utf-8") as f:
        f.write(json.dumps(fila, ensure_ascii=False) + "\n")


def leer_cuentas(ruta):
    """(cuentas, problema). La lista solo vale si es de este usuario y nadie más puede leerla ni
    escribirla (600): una lista que otro pudo tocar no autoriza nada."""
    try:
        st = os.stat(ruta)
    except OSError:
        return None, "falta"
    if st.st_uid != os.getuid() or st.st_mode & 0o077:
        return None, "permisos abiertos (deben ser 600 y del usuario)"
    cuentas = L.cuentas_validas(leer_json(ruta, None))
    return (cuentas, None) if cuentas is not None else (None, "ilegible")


def escribir_cuentas(ruta, duenos=(), desarrolladores=(), quitar=()):
    """Lo usa SOLO Alex en la Mac (`cuentas --dueno <uuid>`). Devuelve la lista nueva o lanza ValueError."""
    for c in list(duenos) + list(desarrolladores) + list(quitar):
        if not L.RE_CUENTA.match(c.strip().lower()):
            raise ValueError("no es un identificador de cuenta (uuid en minúsculas)")
    actual = L.cuentas_validas(leer_json(ruta, None)) or {"duenos": [], "desarrolladores": []}
    fuera = {c.strip().lower() for c in quitar}
    nuevos_d = {c.strip().lower() for c in duenos}
    d = (set(actual["duenos"]) | nuevos_d) - fuera
    v = ((set(actual["desarrolladores"]) | {c.strip().lower() for c in desarrolladores}) - fuera) - d
    datos = {"duenos": sorted(d), "desarrolladores": sorted(v)}
    escribir_json(ruta, datos)
    os.chmod(ruta, 0o600)
    return datos


def leer_config(env_archivo=None, entorno=None, leer_env=None):
    """(url, ficha) de ~/.starseed/env y del entorno. Solo https (o local, para pruebas)."""
    if leer_env is None:
        leer_env = _modulo("puerta_datos_cliente", "puerta_datos_cliente.py").leer_env
    datos = dict(leer_env(env_archivo) if env_archivo else leer_env())
    entorno = os.environ if entorno is None else entorno
    for k in (VAR_URL, VAR_FICHA):
        if entorno.get(k):
            datos[k] = entorno[k]
    url = (datos.get(VAR_URL) or "").rstrip("/")
    if url and not (url.startswith("https://") or url.startswith("http://127.0.0.1") or url.startswith("http://localhost")):
        url = ""
    return url, datos.get(VAR_FICHA) or ""


class PuenteGenesis:
    """El servicio. Todo lo de fuera se puede cambiar en las pruebas: `http` (puerta y Genesis local),
    `ahora`, `stat`, `modulos` (puente, telegram, director_chat, cliente) y la carpeta `base`."""

    def __init__(self, url, ficha, base=BASE, raiz=RAIZ, mando=MANDO, http=None, ahora=time.time,
                 stat=os.stat, modulos=None, salida=None, ruta_altas=None, dueno_altas=0, llevar=None):
        # GEN1114B: `ruta_altas`/`dueno_altas` (la lista de root y su dueño) y `llevar` (copiar la lista al
        # A1) solo se cambian en las pruebas, por argumento: no hay variable ni archivo que los cambie.
        self.ruta_altas = ruta_altas or F.RUTA_ALTAS
        self.dueno_altas = dueno_altas
        self.llevar = llevar
        # /GEN1114B
        self.url, self.ficha = (url or "").rstrip("/"), ficha or ""
        self.base, self.mando = base, mando.rstrip("/")
        self.rutas = rutas_feed(raiz)
        self.mod = modulos if modulos is not None else modulos_reales()
        self.http = http or self.mod["cliente"]._http
        self.ahora, self.stat = ahora, stat
        self.salida = salida or (lambda texto: print(texto, flush=True))
        self.cerrojo = threading.Lock()
        self.cerrojo_pend = threading.Lock()
        self.estado = leer_json(self._r("estado.json"), {})
        if not isinstance(self.estado, dict):
            self.estado = {}
        self.enviados = OrderedDict()      # id → firma de sus entregas (últimos 400)
        self.cache = OrderedDict()         # id → registro tachado sin entregas (últimos 400)
        self.origen_web = OrderedDict()    # ids del chat creados desde Genesis en Astraura
        self.origen_resubir = set()        # (GEN1113INT) ids marcados después de subirlos sin la marca
        self.pendientes_espejo = []        # (fuente, registro) que no se pudieron subir aún
        self.ultimo_hermes = {}

    def _r(self, nombre):
        return os.path.join(self.base, nombre)

    def _guardar_estado(self):
        # Los dos hilos tocan `estado` (cada uno su parte); si uno lo cambia justo mientras el otro lo
        # vuelca, json lanza RuntimeError: se reintenta en vez de perder la vuelta.
        with self.cerrojo:
            for intento in range(5):
                try:
                    escribir_json(self._r("estado.json"), self.estado)
                    return
                except RuntimeError:
                    time.sleep(0.01 * (intento + 1))

    def _log(self, texto):
        """El registro del servicio: solo recuentos y estados, tachado (nunca URL, ficha ni texto)."""
        with CERROJO_PROCESO:   # (GEN1113INT) nunca a un stdout cambiado por otro hilo
            self.salida("[genesis-chats] %s" % self.mod["cliente"].tachar(texto))

    # ── HTTP ──
    def _puerta(self, metodo, ruta, cuerpo=None, timeout=10):
        cab = {"Accept": "application/json", "Authorization": "Bearer " + self.ficha}
        if cuerpo is not None:
            cab["Content-Type"] = "application/json"
        try:
            return self.http(metodo, self.url + ruta, cab, cuerpo, timeout=timeout)
        except Exception as e:  # noqa: BLE001 — red caída: se reintenta con espera
            return 0, {"error": type(e).__name__}

    def _local(self, metodo, ruta, cuerpo=None, timeout=25):
        cab = {"Accept": "application/json"}
        if cuerpo is not None:
            cab["Content-Type"] = "application/json"
        try:
            return self.http(metodo, self.mando + ruta, cab, cuerpo, timeout=timeout)
        except Exception as e:  # noqa: BLE001
            return 0, {"error": type(e).__name__}


    # ── entradas ──
    def _registrar(self, e, resultado, motivo, firma=None):
        anadir_linea(self._r("registro.jsonl"),
                     L.linea_registro(e, resultado, motivo, L.iso_utc(self.ahora()), firma=firma))

    def _vistos(self):
        return L.podar_vistos(leer_json(self._r("vistos.json"), {}), self.ahora())

    def _anotar_visto(self, vistos, clave, e, estado):
        vistos[clave] = {"t": self.ahora(), "id": e.get("id"), "estado": estado}
        escribir_json(self._r("vistos.json"), vistos)

    # GEN1114B · entradas firmadas (contrato GEN1114 §3.5.2). Todo pasa ANTES por la firma: sin una firma
    # válida de un aparato de la lista de root (y no retirado) no se ejecuta ni se publica nada, para ningún
    # rol, exista o no cuentas.json. De la fila de la puerta solo se usan id, rol y recibido (que solo
    # pueden bajar el rol o adelantar la caducidad); todo lo demás sale de la carga firmada.
    def _firma_datos(self):
        import genesis_aparatos as A
        altas, _problema = A.leer_altas(self.ruta_altas, self.dueno_altas)
        retirados = A.leer_retirados(self._r("aparatos-retirados.json"))
        canon = A.leer_canon(self._r("canon.json"))
        return altas, retirados, canon

    def _anotar_firma(self, vistos, carga, sobre, estado):
        F.anotar(vistos, carga, self.ahora())
        for clave in (F.clave_seq(carga), F.clave_nonce(carga)):
            vistos[clave].update(id=sobre.get("id"), estado=estado)
        escribir_json(self._r("vistos.json"), vistos)

    @staticmethod
    def _e_registro(sobre, carga):
        """Lo que va al registro: de la carga si la firma es buena; si no, solo id, cuenta (8) y rol."""
        if isinstance(carga, dict) and isinstance(carga.get("entrada"), dict):
            return dict(carga["entrada"], id=sobre.get("id"), cuenta=carga.get("cuenta"), rol=sobre.get("rol"))
        return {"id": sobre.get("id"), "cuenta": sobre.get("cuenta"), "rol": sobre.get("rol")}

    def _llevar_ahora(self):
        import genesis_aparatos as A
        llevar = self.llevar or A.llevar_a1
        try:
            return llevar(base=self.base, ruta_altas=self.ruta_altas, ahora=self.ahora)
        except Exception as error:  # noqa: BLE001 — llevar no debe parar el servicio
            A.marcar_llevar(self.base, True, self.ahora())
            return False, "no se pudo copiar (%s): queda pendiente" % type(error).__name__

    def llevar_si_toca(self):
        """Tras una retirada (o un emparejamiento cuya copia falló), reintenta llevar la lista al A1 cada 5 min."""
        import genesis_aparatos as A
        return A.llevar_si_toca(self.base, self.ahora, llevar=lambda **kw: self._llevar_ahora())

    def _retirar(self, sobre, carga, vistos, firma, altas, retirados):
        """`revocarme` / `revocar-aparato` (§3.4, §3.7): solo quitan poder. No pasan por validar_entrada."""
        import genesis_aparatos as A
        e = self._e_registro(sobre, carga)
        objetivo, motivo = F.objetivo_de_retirada(carga, altas)
        if objetivo and carga["entrada"].get("accion") == "revocar-aparato":
            cuentas, _ = leer_cuentas(self._r("cuentas.json"))
            if L.rol_efectivo({"cuenta": carga["cuenta"], "rol": sobre.get("rol")}, cuentas) != "dueño":
                objetivo, motivo = None, L.SOLO_DUENO
        if not objetivo:
            self._anotar_firma(vistos, carga, sobre, "rechazado")
            self._registrar(e, "rechazado", motivo, firma)
            return "rechazado", motivo
        self._anotar_firma(vistos, carga, sobre, "en-curso")
        filas = {f["huella"]: f for f in F.aparatos_validos(altas)["aparatos"]}
        if F.retiro_de(objetivo, retirados):
            detalle = "ese aparato ya estaba retirado"
        else:
            ahora = self.ahora()
            A.anadir_retirado(self._r("aparatos-retirados.json"), objetivo, "aparato:%s" % carga["aparato"][:8], ahora)
            quitado, desde = filas.get(objetivo) or {}, filas.get(carga["aparato"]) or {}
            A.registrar(self._r("aparatos.log"), carga["entrada"]["accion"], ahora, objetivo,
                        quitado.get("cuenta"), quitado.get("nombre"))
            self._puerta("POST", "/v1/genesis/aparatos/resultado", {"huella": objetivo, "estado": "revocado"})
            try:
                m = self.mod["director_chat"].publicar(L.aviso_retirada(quitado.get("nombre"), desde.get("nombre")),
                                                       "genesis-chats", rol="director", tipo="aviso", canal="mando")
                self._marcar_origen(m)
            except Exception as error:  # noqa: BLE001 — el aviso en el hilo no deshace la retirada
                self._log("retirada: no se pudo publicar el aviso en el hilo (%s)" % type(error).__name__)
            A.marcar_llevar(self.base, True, ahora)
            ok, _texto = self._llevar_ahora()
            detalle = ("Retirado en la Mac; en el A1 desde las %s" % A._ahora_local(self.ahora())) if ok else \
                "Retirado en la Mac; aún no en el A1: reintentando"
        self._anotar_firma(vistos, carga, sobre, "hecho")
        self._registrar(e, "hecho", "ok", firma)
        return "hecho", detalle

    def procesar(self, crudo):
        """(estado_del_acuse, detalle). Ejecuta como mucho UNA vez por carga firmada: antes de ejecutar se
        anotan `aparato:seq` y `cuenta:nonce` «en-curso»; si el proceso muere a medias, la repetición acusa
        «fallo» y no vuelve a ejecutar. (GEN1114B) Primero la firma; después, las reglas de GEN1113."""
        import genesis_aparatos as A
        sobre = crudo if isinstance(crudo, dict) else {}
        altas, retirados, canon = self._firma_datos()
        vistos = F.podar_vistos(leer_json(self._r("vistos.json"), {}), self.ahora())
        ok, motivo, carga = F.comprobar_entrada_firmada(sobre, altas, retirados, canon, vistos, self.ahora(), "mac")
        firma = {"aparato": sobre.get("aparato"), "firma": "ok" if ok else motivo,
                 "seq": carga.get("seq") if isinstance(carga, dict) else None}
        if not ok:
            if motivo in ("seq-repetido", "nonce-repetido"):
                clave = F.clave_seq(carga) if motivo == "seq-repetido" else F.clave_nonce(carga)
                previo = vistos.get(clave) or {}
                if previo.get("id") == sobre.get("id") and previo.get("estado"):
                    if previo["estado"] == "en-curso":
                        return "fallo", "se interrumpió al ejecutarse; comprueba en Genesis antes de repetirla"
                    return previo["estado"], "ya atendida"
            retiro = F.retiro_de(sobre.get("aparato"), retirados) if motivo == "aparato-revocado" else None
            resultado = "caducado" if motivo == "caducada" else "rechazado"
            # GEN1114INT: solo se anota si el rechazo sale de lo firmado; lo que depende del sobre de la puerta
            # (cuenta, hora de recepción) o es pasajero (límite por hora) no «quema» la entrada.
            if carga is not None and F.rechazo_definitivo(motivo, carga, altas):
                self._anotar_firma(vistos, carga, sobre, resultado)
            self._registrar(self._e_registro(sobre, carga), resultado, motivo, firma)
            return resultado, F.texto_de_motivo(motivo, A.fecha_retiro(retiro))
        if F.es_retirada(carga):
            return self._retirar(sobre, carga, vistos, firma, altas, retirados)
        e = L.normalizar_entrada(F.entrada_para_gen1113(sobre, carga), self.mod["telegram"].parsear_orden)
        cuentas, _problema = leer_cuentas(self._r("cuentas.json"))
        ok, motivo = L.validar_entrada(e, cuentas, self.ahora(), vistos)
        if not ok:
            resultado = L.resultado_de_motivo(motivo)
            self._anotar_firma(vistos, carga, sobre, resultado)
            self._registrar(e, resultado, motivo, firma)
            return resultado, motivo
        e = dict(e, rol=L.rol_efectivo(e, cuentas))
        plan = L.plan_de_entrada(e)
        self._anotar_firma(vistos, carga, sobre, "en-curso")
        # /GEN1114B (lo que sigue es el `procesar` de GEN1113, con `firma` en el registro)
        # (GEN1113INT) Acuse intermedio «entregado» (§5.2): la pestaña deja de decir «esperando a la Mac»
        # mientras la Mac ya la está ejecutando (un modelo de API tarda hasta 90 s). Si no llega, da igual:
        # el acuse final se manda después y es el que cuenta.
        self.acusar(e["id"], "entregado", None)
        try:
            resultado, detalle, motivo = self.ejecutar(plan, e)
        except Exception as error:  # noqa: BLE001 — lo que falle se acusa, nunca se calla
            resultado, detalle, motivo = "fallo", "error al ejecutar (%s)" % type(error).__name__, "error al ejecutar"
        self._anotar_firma(vistos, carga, sobre, resultado)     # GEN1114B
        self._registrar(e, resultado, motivo, firma)            # GEN1114B
        return resultado, L.limpiar_detalle(detalle)


    def ejecutar(self, plan, e):
        """(resultado, detalle para el acuse, motivo fijo para el registro). Mismas funciones que Telegram."""
        tipo = plan.get("tipo")
        if tipo == "puente-orden":
            p = self.mod["puente"]
            # `puente.orden` no recibe `quien`: lo toma de STARSEED_IDE (puente.py:394), y así lo anuncia
            # en canal.jsonl y lo escribe en control-<cola>.json. Se pone solo durante la llamada.
            # (GEN1113INT) El entorno y sys.stdout son de TODO el proceso y el espejo corre en otro hilo:
            # la llamada va bajo CERROJO_PROCESO, el mismo que toma cada vuelta del espejo, así que ningún
            # otro hilo de este servicio corre mientras STARSEED_IDE y stdout están cambiados.
            with CERROJO_PROCESO:
                anterior = os.environ.get("STARSEED_IDE")
                os.environ["STARSEED_IDE"] = plan["quien"]
                try:
                    with contextlib.redirect_stdout(io.StringIO()):
                        rc = p.orden(plan["accion"], list(plan["ids"]), plan.get("extra"))
                finally:
                    if anterior is None:
                        os.environ.pop("STARSEED_IDE", None)
                    else:
                        os.environ["STARSEED_IDE"] = anterior
            if rc in (None, 0):
                return "hecho", "orden «%s» escrita; el vigilante la recoge en menos de 20 s" % plan["accion"], "ok"
            return "fallo", "la orden no se escribió (sin cola viva o la tarea ya no espera decisión)", "orden no escrita"
        if tipo == "puente-decir":
            with CERROJO_PROCESO, contextlib.redirect_stdout(io.StringIO()):
                self.mod["puente"].decir(plan["texto"], quien=plan["quien"], tipo="mensaje")
            return "hecho", "dicho en el canal común", "ok"
        if tipo == "chat-hilo":
            m = self.mod["director_chat"].publicar(plan["texto"], plan["quien"], rol=plan["rol"],
                                                   tipo="mensaje", canal="mando")
            self._marcar_origen(m)
            return "hecho", "en el hilo de dirección", "ok"
        if tipo == "http-local" and plan.get("orden") in ("ayuda", "puertas"):
            texto = L.respuesta_lectura(plan["orden"], [], None)
            self._responder_puente(e, texto)
            return "hecho", texto, "ok"
        if tipo == "http-local" and plan.get("metodo") == "GET":
            estado, datos = self._local("GET", plan["ruta"], timeout=25)
            texto = L.respuesta_lectura(plan["orden"], plan.get("args") or [],
                                        datos if estado == 200 else {"_error": True})
            self._responder_puente(e, texto)
            if estado == 200:
                return "hecho", texto, "ok"
            return "fallo", texto, "genesis no responde"
        if tipo == "http-local":
            estado, datos = self._local("POST", plan["ruta"], plan["cuerpo"], timeout=120)
            if isinstance(datos, dict):
                self._marcar_origen(datos.get("mensaje"))
            if 200 <= (estado or 0) < 300:
                pendiente = isinstance(datos, dict) and datos.get("pendiente")
                return "hecho", ("entregado al chat de dirección" + (" · esperando al motor" if pendiente else "")), "ok"
            if estado == 502:
                return "fallo", "el modelo no pudo responder", "el modelo no pudo responder"
            return "fallo", "Genesis no aceptó la entrada (HTTP %s)" % (estado or "sin respuesta"), "genesis no la aceptó"
        return "fallo", "plan desconocido", "plan desconocido"

    def _marcar_origen(self, mensaje):
        """Marca un id del chat como escrito desde Genesis en Astraura («vía Genesis en Astraura»).

        (GEN1113INT) La ruta local publica el mensaje ANTES de contestar (con un modelo de API, hasta 90 s
        antes), así que el espejo puede haberlo subido ya sin la marca: entonces se apunta para subirlo
        otra vez con ella (la puerta reemplaza por id y la pestaña también)."""
        if isinstance(mensaje, dict) and isinstance(mensaje.get("id"), str):
            with self.cerrojo_pend:
                self.origen_web[mensaje["id"]] = True
                while len(self.origen_web) > 400:
                    self.origen_web.popitem(last=False)
                self.origen_resubir.add(mensaje["id"])

    def _responder_puente(self, e, texto):
        """La respuesta a una lectura del puente A va al hilo de ese puente en el espejo."""
        ahora = self.ahora()
        r = {"id": "gw-%d-%04x" % (int(ahora * 1000), random.getrandbits(16)), "t": L.iso_utc(ahora),
             "de": "genesis-chats", "rol": "sistema", "tipo": "respuesta", "texto": texto, "canal": "mando"}
        with self.cerrojo_pend:
            self.pendientes_espejo.append(("puente:hermes-avisos", r))

    def acusar(self, ident, estado, detalle):
        cuerpo = {"id": ident, "estado": estado}
        if detalle:
            cuerpo["detalle"] = L.limpiar_detalle(detalle)
        codigo, _ = self._puerta("POST", "/v1/genesis/chats/acuse", cuerpo)
        return codigo


    def ciclo_entradas(self, esperar=ESPERA_LARGA_S):
        """Una vuelta de espera larga. True si la puerta respondió (aunque no hubiera nada)."""
        cursor = int(self.estado.get("cursor_entradas") or 0)
        ruta = "/v1/genesis/chats/entrada?destino=mac&desde=%d&esperar=%d" % (cursor, esperar)
        codigo, datos = self._puerta("GET", ruta, timeout=esperar + 15)
        if codigo != 200 or not isinstance(datos, dict):
            self._log("entradas: la puerta no respondió bien (%s)" % (codigo or "sin red"))
            return False
        entradas = [x for x in (datos.get("entradas") or []) if isinstance(x, dict)]
        entradas.sort(key=lambda x: x.get("id") if isinstance(x.get("id"), int) else 0)
        info = self.estado.setdefault("entradas", {})
        info.update(ultima_consulta=self.ahora(), pendientes=len(entradas))
        for e in entradas:
            ident = e.get("id")
            if not isinstance(ident, int) or ident <= cursor:
                continue
            resultado, detalle = self.procesar(e)
            codigo = self.acusar(ident, resultado, detalle)
            if codigo in (0, 401, 403, 429) or codigo >= 500:
                # Sin acuse no se avanza: la entrada vuelve, su nonce ya está visto y solo se repite el acuse.
                self._log("acuse de %s sin confirmar (%s); se repite en la próxima vuelta" % (ident, codigo or "sin red"))
                self._guardar_estado()
                return False
            cursor = ident
            self.estado["cursor_entradas"] = cursor
            info.update(ultima={"t": self.ahora(), "id": ident, "resultado": resultado},
                        pendientes=max(0, info.get("pendientes", 1) - 1))
            self._guardar_estado()
            self._log("entrada %s → %s" % (ident, resultado))
        self._guardar_estado()
        # GEN1114B · si una retirada (o un emparejamiento) no llegó al A1, se reintenta cada 5 min.
        try:
            if self.llevar_si_toca():
                self._log("lista de aparatos: intento de llevarla al A1")
        except Exception as error:  # noqa: BLE001
            self._log("lista de aparatos: error al llevarla (%s)" % type(error).__name__)
        # /GEN1114B
        return True

    # ── espejo ──
    def _firma_archivos(self):
        firma = {}
        for nombre, ruta in self.rutas.items():
            try:
                firma[nombre] = self.stat(ruta).st_mtime_ns
            except OSError:
                firma[nombre] = None
        return firma

    def _subir(self, fuente, registros, latido=False):
        # (GEN1113INT) Lotes por número Y por tamaño (la puerta corta el cuerpo en 64 KB y el registro en
        # 48 KB): sin esto, un informe largo dejaba el espejo parado para siempre con 413/400.
        for lote in (L.lotes(registros) or [[]]):
            cuerpo = {"fuente": fuente, "registros": lote}
            if latido:
                cuerpo["latido"] = True
            codigo, _ = self._puerta("POST", "/v1/genesis/chats/espejo", cuerpo, timeout=20)
            if codigo in (400, 413):
                # La puerta no aceptará NUNCA este lote tal cual: se salta (y se dice) en vez de parar el espejo.
                self._log("espejo: la puerta rechazó un lote de %d de %s (%s); se salta" % (len(lote), fuente, codigo))
                esp = self.estado.setdefault("espejo", {})
                esp["saltados"] = esp.get("saltados", 0) + len(lote)
                continue
            if not (200 <= (codigo or 0) < 300):
                self._log("espejo: la puerta no aceptó un lote de %s (%s)" % (fuente, codigo or "sin red"))
                return False
        return True

    def _entregas_de(self, ident, entregas, detalles):
        mapa = {}
        for canal, est in ((entregas or {}).get(ident) or {}).items():
            mapa[canal] = {"estado": est}
            det = ((detalles or {}).get(ident) or {}).get(canal)
            if det:
                mapa[canal]["detalle"] = det
        return mapa


    def _resubir_con_origen(self):
        """(GEN1113INT) Sube otra vez, con `origen: "genesis-web"` y sus entregas, los mensajes que se
        marcaron como escritos desde Genesis después de haberlos subido sin la marca."""
        with self.cerrojo_pend:
            ids = [i for i in self.origen_resubir if i in self.enviados and i in self.cache]
            self.origen_resubir.difference_update(ids)
            self.origen_resubir.intersection_update(set(self.origen_web))
        if not ids:
            return True
        tachar = self.mod["director_chat"].tachar
        registros = []
        for ident in ids:
            if self.cache[ident].get("origen") == "genesis-web":
                continue
            try:
                entregas = json.loads(self.enviados[ident])
            except ValueError:
                entregas = {}
            r = dict(self.cache[ident], origen="genesis-web", fuente="direccion")
            if entregas:
                r["entregas"] = L.tachar_registro(entregas, tachar)
            registros.append(r)
        if registros and not self._subir("direccion", registros):
            with self.cerrojo_pend:
                self.origen_resubir.update(ids)
            return False
        for r in registros:
            self.cache[r["id"]] = dict(self.cache[r["id"]], origen="genesis-web")
        return True

    def tick_espejo(self):
        """Una vuelta del espejo: «sin-cambios», «subido» o «fallo». Lee Genesis local SOLO si cambió
        el mtime de alguno de los cuatro archivos (o hay respuestas del puente A esperando)."""
        esp = self.estado.setdefault("espejo", {})
        ok = True
        with self.cerrojo_pend:
            pendientes, self.pendientes_espejo = self.pendientes_espejo, []
        for fuente, r in pendientes:
            if not self._subir(fuente, [dict(L.tachar_registro(r, self.mod["director_chat"].tachar), fuente=fuente)]):
                with self.cerrojo_pend:
                    self.pendientes_espejo.append((fuente, r))
                ok = False
        if not self._resubir_con_origen():
            ok = False
        firma = self._firma_archivos()
        if firma == esp.get("mtimes"):
            return self._latir(esp, "sin-cambios" if ok else "fallo")
        desde = esp.get("desde_epoch")
        ruta = "/api/mando/director-chat?limite=%d" % (500 if desde else 200)
        if desde:
            ruta += "&desde=" + quote(L.iso_utc(desde - 2))
        codigo, datos = self._local("GET", ruta, timeout=25)
        if codigo != 200 or not isinstance(datos, dict):
            self._log("espejo: Genesis local no respondió (%s)" % (codigo or "sin red"))
            return "fallo"
        entregas, detalles = datos.get("entregas"), datos.get("detalles")
        # (GEN1113INT) `_importa` y compañía son código de otros guiones (pueden leer el entorno o
        # escribir en stdout): corren bajo el mismo cerrojo que `puente.orden` en el hilo de entradas.
        with CERROJO_PROCESO:
            por_fuente, nuevos, maximo, cambiados = self._clasificar(datos, desde, entregas, detalles)
        for fuente in L.FUENTES:
            if por_fuente.get(fuente) and not self._subir(fuente, por_fuente[fuente]):
                return "fallo"   # ni mtimes ni cursor avanzan: la próxima vuelta lo intenta otra vez
        for ident in nuevos:
            self.enviados[ident] = json.dumps(self._entregas_de(ident, entregas, detalles), sort_keys=True)
        self.enviados.update(cambiados)
        for od in (self.enviados, self.cache):
            while len(od) > 400:
                od.popitem(last=False)
        n = sum(len(v) for v in por_fuente.values())
        esp.update(mtimes=firma, desde_epoch=maximo or desde, lecturas=esp.get("lecturas", 0) + 1)
        if n:
            esp.update(ultimo_envio=self.ahora(), subidos=esp.get("subidos", 0) + n)
        self._guardar_estado()
        return self._latir(esp, "subido" if ok else "fallo")

    def _clasificar(self, datos, desde, entregas, detalles):
        """(por_fuente, nuevos, maximo, cambiados) de una lectura del feed local, sin red."""
        por_fuente, nuevos, maximo = {}, [], desde or 0
        importa = getattr(self.mod["telegram"], "_importa", None)
        for m in datos.get("mensajes") or []:
            if not isinstance(m, dict) or not isinstance(m.get("id"), str):
                continue
            ident = m["id"]
            maximo = max(maximo, L.epoch_de(m.get("t")))
            if ident in self.enviados:
                continue
            fuentes = L.fuente_de_registro(m, importa)
            if "puente:hermes-avisos" in fuentes:
                fila = L.linea_canal(m)
                if self.mod["telegram"].es_repetido(fila, self.ultimo_hermes):
                    fuentes.remove("puente:hermes-avisos")
                else:
                    self.ultimo_hermes = fila
            base = L.tachar_registro(m, self.mod["director_chat"].tachar)
            if ident in self.origen_web:
                base["origen"] = "genesis-web"
            self.cache[ident] = base
            nuevos.append(ident)
            for fuente in fuentes:
                r = dict(base, fuente=fuente)
                if fuente == "direccion":
                    r["entregas"] = L.tachar_registro(self._entregas_de(ident, entregas, detalles),
                                                      self.mod["director_chat"].tachar)
                por_fuente.setdefault(fuente, []).append(r)
        # Mensajes ya subidos cuyo estado de entrega cambió (pendiente → respondido): se suben otra vez.
        cambiados = {}
        for ident, firma_prev in list(self.enviados.items()):
            actual = json.dumps(self._entregas_de(ident, entregas, detalles), sort_keys=True)
            if ident in self.cache and actual != firma_prev and self._entregas_de(ident, entregas, detalles):
                r = dict(self.cache[ident], fuente="direccion")
                r["entregas"] = L.tachar_registro(self._entregas_de(ident, entregas, detalles),
                                                  self.mod["director_chat"].tachar)
                por_fuente.setdefault("direccion", []).append(r)
                cambiados[ident] = actual
        return por_fuente, nuevos, maximo, cambiados

    def _latir(self, esp, resultado):
        if self.ahora() - (esp.get("ultimo_latido") or 0) >= LATIDO_S:
            if self._subir("direccion", [], latido=True):
                esp["ultimo_latido"] = self.ahora()
                self._guardar_estado()
            else:
                return "fallo"
        return resultado


    # ── bucles ──
    def _bucle(self, vuelta, pausa_ok, parar, dormir):
        fallos = 0
        while not parar.is_set():
            try:
                bien = vuelta() not in (False, "fallo")
            except Exception as error:  # noqa: BLE001 — el servicio no muere por una vuelta
                self._log("vuelta con error: %s" % type(error).__name__)
                bien = False
            fallos = 0 if bien else fallos + 1
            dormir(pausa_ok if bien else ESPERAS_S[min(fallos, len(ESPERAS_S)) - 1])

    def correr(self, parar=None, dormir=None):
        parar = parar or threading.Event()
        dormir = dormir or parar.wait
        hilos = [
            threading.Thread(target=self._bucle, args=(self.tick_espejo, 1, parar, dormir), daemon=True),
            threading.Thread(target=self._bucle, args=(self.ciclo_entradas, 1, parar, dormir), daemon=True),
        ]
        for h in hilos:
            h.start()
        self._log("en marcha: espejo cada 1 s y entradas con espera larga")
        try:
            while any(h.is_alive() for h in hilos):
                for h in hilos:
                    h.join(1)
        except KeyboardInterrupt:
            parar.set()
        return 0


# ── línea de órdenes ─────────────────────────────────────────────────────────

def _hace(ahora, t):
    if not isinstance(t, (int, float)) or not t:
        return "nunca"
    s = int(ahora - t)
    return "hace %d s" % s if s < 120 else ("hace %d min" % (s // 60) if s < 7200 else "hace %d h" % (s // 3600))


def estado_texto(base=BASE, raiz=RAIZ, env_archivo=None, entorno=None, ahora=None, leer_env=None, plist=PLIST,
                 ruta_altas=None, dueno_altas=0):
    """Qué ve el puente, en frases. Nunca imprime la URL, la ficha ni una cuenta entera (8 caracteres)."""
    ahora = time.time() if ahora is None else ahora
    url, ficha = leer_config(env_archivo, entorno, leer_env)
    lineas = ["Puente de chats de Genesis (GEN1113B)"]
    lineas.append("· Puerta del A1 (%s): %s" % (VAR_URL, "configurada" if url else "falta o no es https"))
    lineas.append("· Ficha de la Mac (%s): %s" % (VAR_FICHA, "configurada" if ficha else "falta"))
    cuentas, problema = leer_cuentas(os.path.join(base, "cuentas.json"))
    if cuentas is None:
        lineas.append("· Lista de cuentas: %s → no se ejecuta nada" % problema)
    else:
        corto = lambda xs: ", ".join("%s…" % c[:8] for c in xs) or "ninguno"
        lineas.append("· Lista de cuentas (600): dueños %s · desarrolladores %s"
                      % (corto(cuentas["duenos"]), corto(cuentas["desarrolladores"])))
    # GEN1114B
    import genesis_aparatos as A
    altas, prob_altas = A.leer_altas(ruta_altas or F.RUTA_ALTAS, dueno_altas)
    lineas.append("· Firma (GEN1114B): solo se ejecuta lo firmado por un aparato emparejado · lista de aparatos: %s"
                  % (prob_altas + " → no se ejecuta nada" if prob_altas else "%d aparato(s)" % len(altas["aparatos"])))
    # /GEN1114B
    lineas.append("· Servicio launchd: %s" % ("plist instalado" if os.path.exists(plist) else "sin instalar"))
    est = leer_json(os.path.join(base, "estado.json"), {})
    est = est if isinstance(est, dict) else {}
    esp, ent = est.get("espejo") or {}, est.get("entradas") or {}
    lineas.append("· Espejo: último envío %s · último latido %s · %d registros subidos"
                  % (_hace(ahora, esp.get("ultimo_envio")), _hace(ahora, esp.get("ultimo_latido")), esp.get("subidos", 0)))
    ult = ent.get("ultima") or {}
    lineas.append("· Entradas: última consulta %s · pendientes en esa consulta %s · última entrega %s%s"
                  % (_hace(ahora, ent.get("ultima_consulta")), ent.get("pendientes", 0), _hace(ahora, ult.get("t")),
                     (" (%s)" % ult.get("resultado")) if ult.get("resultado") else ""))
    try:
        with open(os.path.join(base, "registro.jsonl"), encoding="utf-8") as f:
            filas = f.read().splitlines()
        ultima = json.loads(filas[-1]) if filas else {}
        lineas.append("· Registro: %d líneas · la última: %s %s" % (len(filas), ultima.get("resultado", "—"),
                                                                   ultima.get("orden") or ultima.get("accion") or ""))
    except (OSError, ValueError):
        lineas.append("· Registro: vacío")
    for nombre, ruta in rutas_feed(raiz).items():
        try:
            lineas.append("· Archivo del chat «%s»: cambiado %s" % (nombre, _hace(ahora, os.stat(ruta).st_mtime)))
        except OSError:
            lineas.append("· Archivo del chat «%s»: no está" % nombre)
    return "\n".join(lineas)


def _servicio(base=BASE):
    import fcntl
    os.makedirs(base, mode=0o700, exist_ok=True)
    cerrojo = open(os.path.join(base, "servicio.lock"), "a")
    try:
        fcntl.flock(cerrojo, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        print("[genesis-chats] ya hay otra instancia en marcha; salgo", flush=True)
        return 0
    avisado = False
    while True:
        url, ficha = leer_config()
        if url and ficha:
            break
        if not avisado:
            print("[genesis-chats] faltan %s o %s en ~/.starseed/env: espero sin hacer nada" % (VAR_URL, VAR_FICHA), flush=True)
            avisado = True
        time.sleep(60)
    return PuenteGenesis(url, ficha, base=base).correr()


def main(argv=None):
    ap = argparse.ArgumentParser(description="Puente de la Mac para los chats de Genesis (GEN1113B)")
    ap.add_argument("--estado", action="store_true", help="dice qué ve, sin URL, fichas ni cuentas enteras")
    sub = ap.add_subparsers(dest="orden")
    c = sub.add_parser("cuentas", help="escribe la lista local de cuentas (solo Alex, en la Mac)")
    c.add_argument("--dueno", action="append", default=[])
    c.add_argument("--desarrollador", action="append", default=[])
    c.add_argument("--quitar", action="append", default=[])
    a = ap.parse_args(argv)
    if a.estado:
        print(estado_texto())
        return 0
    if a.orden == "cuentas":
        if not (a.dueno or a.desarrollador or a.quitar):
            print("uso: cuentas --dueno <uuid> [--desarrollador <uuid>] [--quitar <uuid>]")
            return 1
        try:
            datos = escribir_cuentas(os.path.join(BASE, "cuentas.json"), a.dueno, a.desarrollador, a.quitar)
        except ValueError as e:
            print("No escribo la lista: %s." % e)
            return 1
        print("Lista de cuentas escrita (600): %d dueño(s), %d desarrollador(es)."
              % (len(datos["duenos"]), len(datos["desarrolladores"])))
        return 0
    return _servicio()


if __name__ == "__main__":
    sys.exit(main() or 0)
