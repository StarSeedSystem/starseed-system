#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Aparatos que pueden escribir en los chats de Genesis · emparejar, retirar y llevar la lista al A1 (GEN1114B).

Contrato: architecture/astraura-chats-identidad-firma.md §3.3, §3.7, §3.10, §5.1 y §8.2 (con las
correcciones [REV] de §13).

  python3 scripts/puente/genesis_aparatos.py emparejar            # SOLO sentado delante de la Mac
  python3 scripts/puente/genesis_aparatos.py emparejar --rechazar N
  python3 scripts/puente/genesis_aparatos.py pendientes | listar | --estado
  python3 scripts/puente/genesis_aparatos.py revocar [código | huella8 | nombre]
  python3 scripts/puente/genesis_aparatos.py llevar-a1 | acceso-escritorio

Dónde vive cada cosa:
- Lista de altas: /Library/Application Support/StarSeed/genesis-aparatos.json, de ROOT y 644. Solo la
  escribe `emparejar`, con `sudo /usr/bin/install` (pide la contraseña de administrador). Un programa que
  corra como Alex (un agente con herramientas) no puede añadir aparatos. Si no es de root, o la puede
  escribir otro, no vale: es como si estuviera vacía y no se ejecuta nada.
- Retiradas: ~/.starseed/genesis-chats/aparatos-retirados.json (600). Solo quita poder: no pide contraseña.
- Registro: ~/.starseed/genesis-chats/aparatos.log (solo añadir): t, evento, aparato8, cuenta8, nombre.

Nunca imprime una huella entera, una cuenta entera, la URL de la puerta, la ficha ni la dirección del A1.
El código que muestra el aparato NO se imprime nunca aquí: Alex lo copia de la pantalla del aparato.
"""
import argparse
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from datetime import datetime

CARPETA = os.path.dirname(os.path.abspath(__file__))
if CARPETA not in sys.path:
    sys.path.insert(0, CARPETA)

import genesis_chats_logica as L  # noqa: E402
import genesis_chats_puerta as G  # noqa: E402
import genesis_firma_logica as F  # noqa: E402

RUTA_ALTAS = F.RUTA_ALTAS
VAR_A1 = "STARSEED_A1_SSH"          # alias ssh del A1 (usuario `starseed`); se fija al integrar (§12)
RE_ALIAS = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
SUDO = "/usr/bin/sudo"
INSTALL = "/usr/bin/install"
SSH = "/usr/bin/ssh"
LAUNCHCTL = "/bin/launchctl"
TUNELES = ("com.starseed.mando.tunel", "tunel-metagenesis")
REINTENTO_A1_S = 300
LANZADORES = ("Emparejar aparato.command", "Retirar aparato.command")
AVISO_PRESENCIA = ("Empareja solo un aparato que tengas en la mano o cuya pantalla veas tú mismo: el código "
                   "prueba que la clave y la cuenta no cambiaron por el camino, no que el aparato sea de quien dice.")
PREGUNTA_NIVEL = ("¿Puede este aparato poner agentes a trabajar (Hermes, motores, aprobar tareas, peticiones)? "
                  "Quien controle la web publicada podría usarlo sin que lo notes. "
                  "Escribe «completo» para sí; Intro para solo texto: ")
SOLO_DELANTE = "Emparejar solo se hace sentado delante de la Mac, en una terminal (no por ssh ni desde un programa)."


def rutas(base=G.BASE):
    return {
        "retirados": os.path.join(base, "aparatos-retirados.json"),
        "log": os.path.join(base, "aparatos.log"),
        "canon": os.path.join(base, "canon.json"),
        "cuentas": os.path.join(base, "cuentas.json"),
        "llevar": os.path.join(base, "aparatos-llevar.json"),
    }


def _ahora_local(epoch, formato="%H:%M"):
    try:
        return datetime.fromtimestamp(epoch).strftime(formato)
    except (OverflowError, OSError, ValueError, TypeError):
        return "—"


def fecha_retiro(fila):
    """«el 13-11 a las 14:02» (hora de la Mac) de una fila de retirados, o None."""
    t = F.epoch_de((fila or {}).get("t"))
    return ("el %s a las %s" % (_ahora_local(t, "%d-%m"), _ahora_local(t))) if t else None


# ── archivos ─────────────────────────────────────────────────────────────────

def leer_altas(ruta=RUTA_ALTAS, dueno=0):
    """(altas, problema). La lista solo vale si el archivo (sin enlaces) y su carpeta son del `dueno`
    (root, uid 0, salvo en las pruebas) y nadie más puede escribirlos. Si no vale, la lista es vacía:
    no se ejecuta nada (lo mismo que hoy con la escritura parada)."""
    vacia = {"v": 1, "aparatos": []}
    try:
        st_dir = os.stat(os.path.dirname(ruta))
    except OSError:
        return vacia, "falta"
    if st_dir.st_uid != dueno or st_dir.st_mode & 0o022:
        return vacia, "su carpeta no es de root o la puede escribir otro"
    try:
        fd = os.open(ruta, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    except OSError:
        return vacia, "falta"
    with os.fdopen(fd, "rb") as f:
        st = os.fstat(f.fileno())
        if st.st_uid != dueno or st.st_mode & 0o022 or not (st.st_mode & 0o170000 == 0o100000):
            return vacia, "no es de root o la puede escribir otro"
        try:
            crudo = json.loads(f.read(256 * 1024).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return vacia, "ilegible"
    return F.aparatos_validos(crudo), None


def leer_bytes_altas(ruta=RUTA_ALTAS):
    try:
        with open(ruta, "rb") as f:
            return f.read(256 * 1024)
    except OSError:
        return None


# GEN1114INT · registro de retiradas de SOLO AÑADIR, al lado de la lista de root. `aparatos-retirados.json` es de
# Alex (600): cualquier programa que corra como él puede vaciarlo y devolver la validez a un aparato retirado
# (riesgo residual que dejó B). Este segundo registro lo crea `emparejar` con el mismo sudo del alta (sin pedir
# nada más): es de Alex (600) para que retirar siga sin pedir contraseña, pero lleva la marca de sistema `sappnd`
# (solo root la quita) y vive en la carpeta de root: Alex y sus programas pueden AÑADIR líneas, no vaciarlo,
# reescribirlo, borrarlo ni moverlo. Un aparato vale si está en la lista de root y no está en NINGUNO de los dos.
NOMBRE_RETIRADOS_SISTEMA = "genesis-aparatos-retirados.jsonl"


def ruta_retirados_sistema(ruta_altas=RUTA_ALTAS):
    return os.path.join(os.path.dirname(ruta_altas), NOMBRE_RETIRADOS_SISTEMA)


def leer_retirados_sistema(ruta):
    """(filas, problema). Las retiradas del registro de solo añadir. Sin el archivo: ([], None). Si existe y no
    se puede leer (alguien le quitó el permiso de lectura): ([], "ilegible"), y quien llama no ejecuta nada."""
    if not ruta or not os.path.lexists(ruta):
        return [], None
    try:
        with open(ruta, "rb") as f:
            crudo = f.read(8 * 1024 * 1024)
    except OSError:
        return [], "ilegible"
    filas = []
    for linea in crudo.decode("utf-8", "replace").splitlines():
        try:
            filas.append(json.loads(linea))
        except ValueError:
            continue                      # una línea rota (o basura añadida) no quita las demás
    return F.retirados_validos({"retirados": filas})["retirados"], None


def leer_retirados(ruta, sistema=None):
    """Las retiradas de `aparatos-retirados.json` MÁS las del registro de solo añadir (`sistema`): una retirada
    en cualquiera de los dos vale, así vaciar el archivo de Alex no devuelve nada."""
    actual = F.retirados_validos(G.leer_json(ruta, None))
    vistas = {f["huella"] for f in actual["retirados"]}
    for f in leer_retirados_sistema(sistema)[0]:
        if f["huella"] not in vistas:
            actual["retirados"].append(f)
            vistas.add(f["huella"])
    return actual


def anadir_retirado(ruta, huella, por, ahora, sistema=None):
    """Añade una retirada (600) y, si existe, una línea al registro de solo añadir. La lista solo crece;
    repetir no cambia nada. Devuelve la fila."""
    huella = huella.lower()
    actual = F.retirados_validos(G.leer_json(ruta, None))
    fila = F.retiro_de(huella, actual) or {"huella": huella, "t": F.iso_utc(ahora), "por": por}
    if not F.retiro_de(huella, actual):
        actual["retirados"].append(fila)
        G.escribir_json(ruta, actual)
        os.chmod(ruta, 0o600)
    if sistema and os.path.lexists(sistema) and not any(f["huella"] == huella for f in leer_retirados_sistema(sistema)[0]):
        try:
            with open(sistema, "a", encoding="utf-8") as f:      # O_APPEND: lo único que permite `sappnd`
                f.write(json.dumps(fila, ensure_ascii=False) + "\n")
                f.flush()
                os.fsync(f.fileno())
        except OSError:
            pass                                                  # queda en el archivo de Alex; --estado lo dice
    return fila


def leer_canon(ruta):
    datos = G.leer_json(ruta, None)
    return datos if isinstance(datos, dict) and isinstance(datos.get("chats"), list) else None


def registrar(ruta_log, evento, ahora, huella=None, cuenta=None, nombre=None):
    """Una línea de aparatos.log: nunca huellas ni cuentas enteras."""
    fila = {"t": F.iso_utc(ahora), "evento": evento}
    if huella:
        fila["aparato8"] = re.sub(r"[^0-9a-f]", "", str(huella).lower())[:8]
    if cuenta:
        fila["cuenta8"] = L.cuenta8(cuenta)
    if nombre is not None:
        fila["nombre"] = F.limpiar_nombre(nombre, 60)
    G.anadir_linea(ruta_log, fila)


def leer_log(ruta_log):
    try:
        with open(ruta_log, encoding="utf-8") as f:
            return [json.loads(x) for x in f.read().splitlines() if x.strip()]
    except (OSError, ValueError):
        return []


# ── la puerta (solo con la ficha de la Mac) ──────────────────────────────────

class Puerta:
    """Las rutas de aparatos de la puerta, con la ficha `genesis-chats-mac`. Nunca imprime URL ni ficha."""

    def __init__(self, url=None, ficha=None, http=None):
        if url is None or ficha is None:
            url, ficha = G.leer_config()
        self.url, self.ficha = (url or "").rstrip("/"), ficha or ""
        self.http = http or G._modulo("puerta_datos_cliente", "puerta_datos_cliente.py")._http

    def configurada(self):
        return bool(self.url and self.ficha)

    def llamar(self, metodo, ruta, cuerpo=None):
        if not self.configurada():
            return 0, None
        cab = {"Accept": "application/json", "Authorization": "Bearer " + self.ficha}
        if cuerpo is not None:
            cab["Content-Type"] = "application/json"
        try:
            return self.http(metodo, self.url + ruta, cab, cuerpo, timeout=15)
        except Exception:  # noqa: BLE001 — sin red: se dice, sin detalles
            return 0, None

    def solicitudes(self):
        codigo, datos = self.llamar("GET", "/v1/genesis/aparatos/solicitudes")
        if codigo != 200 or not isinstance(datos, dict) or not isinstance(datos.get("solicitudes"), list):
            return None
        return [s for s in datos["solicitudes"] if isinstance(s, dict)]

    def resultado(self, huella, estado, solicitud=None, nivel=None):
        cuerpo = {"huella": huella, "estado": estado}
        if solicitud is not None:
            cuerpo["solicitud"] = solicitud
        if nivel:
            cuerpo["nivel"] = nivel
        codigo, _ = self.llamar("POST", "/v1/genesis/aparatos/resultado", cuerpo)
        return 200 <= (codigo or 0) < 300


# ── emparejar (§3.3) ─────────────────────────────────────────────────────────

def preparar_solicitudes(crudas, cuentas, ahora):
    """(válidas, descartadas). La Mac no se fía de nada de la puerta: recalcula la huella desde la SPKI
    (que debe ser P-256 canónica) y el código con la cuenta de la solicitud; descarta lo caducado."""
    validas, descartadas = [], 0
    for s in crudas or []:
        try:
            ident = s.get("id")
            if not isinstance(ident, int) or isinstance(ident, bool):
                raise ValueError("id")
            cuenta = str(s.get("cuenta") or "").lower()
            if not F.RE_CUENTA.match(cuenta):
                raise ValueError("cuenta")
            huella = F.huella_de_spki(F.b64url_dec(s.get("spki")))
            caduca = F.epoch_de(s.get("caduca"))
            if caduca <= ahora:
                raise ValueError("caducada")
        except (ValueError, AttributeError):
            descartadas += 1
            continue
        validas.append({"id": ident, "cuenta": cuenta, "spki": s["spki"], "huella": huella,
                        "nombre": F.limpiar_nombre(s.get("nombre"), 60) or "sin nombre",
                        "plataforma": "app-nativa" if s.get("plataforma") == "app-nativa" else "navegador",
                        "t": F.epoch_de(s.get("t")), "caduca": caduca, "codigo": F.codigo_de(huella, cuenta),
                        "rol": L.rol_local(cuenta, cuentas)})
    return validas, descartadas


def describir_solicitud(i, s):
    rol = {"dueño": "dueño en la lista de la Mac", "desarrollador": "desarrollador en la lista de la Mac"}.get(
        s["rol"], "NO está en la lista de cuentas de la Mac")
    return "  %d. «%s» · %s · pedida a las %s (caduca a las %s) · cuenta %s… · %s" % (
        i, s["nombre"], s["plataforma"], _ahora_local(s["t"]) if s["t"] else "—", _ahora_local(s["caduca"]),
        L.cuenta8(s["cuenta"]), rol)


def en_terminal_local(entorno=None, es_tty=None):
    """True solo con entrada y salida en una terminal y sin rastro de ssh. (No prueba que haya una persona:
    por eso el alta pide además la contraseña de administrador.)"""
    entorno = os.environ if entorno is None else entorno
    if any(entorno.get(k) for k in ("SSH_CONNECTION", "SSH_TTY", "SSH_CLIENT")):
        return False
    if es_tty is None:
        es_tty = lambda: sys.stdin.isatty() and sys.stdout.isatty()  # noqa: E731
    return bool(es_tty())


def instalar_altas(datos, ruta, ejecutar):
    """Instala la lista nueva como root (644) con sudo. True si sudo e install terminaron bien. El temporal
    vive en una carpeta propia (700) y se borra siempre; tras instalar se olvida la contraseña (`sudo -k`)."""
    carpeta_tmp = tempfile.mkdtemp(prefix="genesis-aparatos-")
    tmp = os.path.join(carpeta_tmp, "genesis-aparatos.json")
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, 0o644)
        aviso = "Contraseña de administrador de la Mac (para dar de alta el aparato): "
        carpeta = os.path.dirname(ruta)
        if not os.path.isdir(carpeta):
            r = ejecutar([SUDO, "-p", aviso, INSTALL, "-d", "-o", "root", "-g", "wheel", "-m", "755", carpeta])
            if getattr(r, "returncode", 1) != 0:
                return False
        r = ejecutar([SUDO, "-p", aviso, INSTALL, "-S", "-o", "root", "-g", "wheel", "-m", "644", tmp, ruta])
        if getattr(r, "returncode", 1) != 0:
            return False
        # GEN1114INT: el registro de retiradas de solo añadir, con la misma contraseña (sudo la recuerda unos
        # minutos). Es de Alex (retirar no pide contraseña) con la marca `sappnd` (no se puede vaciar). Si falla,
        # el alta ya está hecha y vale; `--estado` lo dice.
        sistema = ruta_retirados_sistema(ruta)
        if not os.path.lexists(sistema):
            ejecutar([SUDO, "-p", aviso, INSTALL, "-o", str(os.getuid()), "-g", str(os.getgid()), "-m", "600",
                      "-f", "sappnd", "/dev/null", sistema])
        return True
    except (OSError, subprocess.SubprocessError):
        return False
    finally:
        try:
            ejecutar([SUDO, "-k"])
        except (OSError, subprocess.SubprocessError):
            pass
        shutil.rmtree(carpeta_tmp, ignore_errors=True)


def _preguntar(entrada, texto):
    try:
        return entrada(texto)
    except (EOFError, KeyboardInterrupt):
        return None


def emparejar(puerta, base=G.BASE, ruta_altas=RUTA_ALTAS, dueno_altas=0, entrada=input, salida=print,
              entorno=None, es_tty=None, ahora=time.time, ejecutar=subprocess.run, llevar=None):
    """Da de alta UN aparato. 0 si quedó emparejado; 1 si no (y entonces no se escribió nada)."""
    if not en_terminal_local(entorno, es_tty):
        salida(SOLO_DELANTE + " No se ha emparejado nada.")
        return 1
    r = rutas(base)
    altas, problema = leer_altas(ruta_altas, dueno_altas)
    if problema not in (None, "falta"):
        salida("La lista de aparatos de la Mac no vale (%s): no la toco. Avisa a la dirección." % problema)
        return 1
    retirados = leer_retirados(r["retirados"], ruta_retirados_sistema(ruta_altas))
    cuentas, prob_cuentas = G.leer_cuentas(r["cuentas"])
    if cuentas is None:
        salida("Falta la lista de cuentas de la Mac (%s): sin ella no se puede emparejar." % prob_cuentas)
        return 1
    crudas = puerta.solicitudes()
    if crudas is None:
        salida("La puerta del A1 no respondió (o falta su configuración): no se ha emparejado nada.")
        return 1
    pendientes, descartadas = preparar_solicitudes(crudas, cuentas, ahora())
    salida(AVISO_PRESENCIA)
    if descartadas:
        salida("(%d solicitud(es) descartada(s): clave que no es P-256 válida, datos rotos o caducada.)" % descartadas)
    if not pendientes:
        salida("No hay solicitudes pendientes. En el aparato: Genesis › MetaGenesis › «Emparejar este aparato».")
        return 1
    salida("Solicitudes pendientes:")
    for i, s in enumerate(pendientes, 1):
        salida(describir_solicitud(i, s))
    tecleado = _preguntar(entrada, "Escribe el código que ves en la pantalla del aparato: ")
    codigo = F.normalizar_codigo(tecleado or "")
    if codigo is None:
        salida("Código no válido (son 12 letras A–Z y cifras 2–7). No se ha emparejado nada.")
        return 1
    coinciden = [s for s in pendientes if F.codigos_iguales(codigo, s["codigo"])]
    if not coinciden:
        registrar(r["log"], "codigo-distinto", ahora())
        salida("El código no coincide con ninguna solicitud: no se ha emparejado nada. Si lo escribiste bien, "
               "alguien cambió la clave o la cuenta por el camino; no repitas, avisa.")
        return 1
    if len(coinciden) > 1:
        salida("El código coincide con más de una solicitud: no se empareja ninguna. Pide una nueva en el aparato.")
        return 1
    s = coinciden[0]
    if s["rol"] is None:
        salida("Esa cuenta no está en la lista de la Mac: no se ha emparejado nada.")
        return 1
    if F.retiro_de(s["huella"], retirados):
        salida("Esa clave ya estuvo emparejada y se retiró: no se vuelve a dar de alta. Crea una clave nueva en "
               "el aparato («Olvidar este aparato» y emparejar otra vez).")
        return 1
    if any(a["huella"] == s["huella"] for a in altas["aparatos"]):
        salida("Ese aparato ya está emparejado. No se cambia nada.")
        return 1
    salida("Coincide: «%s» · cuenta %s… · %s." % (s["nombre"], L.cuenta8(s["cuenta"]), s["rol"]))
    respuesta = _preguntar(entrada, PREGUNTA_NIVEL)
    if respuesta is None:
        salida("No se ha emparejado nada.")
        return 1
    nivel = "completo" if respuesta.strip().lower() == "completo" else "texto"
    if respuesta.strip() and nivel == "texto":
        salida("(No escribiste «completo»: queda como solo texto.)")
    fila = {"huella": s["huella"], "spki": s["spki"], "cuenta": s["cuenta"], "nombre": s["nombre"],
            "plataforma": s["plataforma"], "nivel": nivel, "alta": F.iso_utc(ahora())}
    nueva = {"v": 1, "aparatos": altas["aparatos"] + [fila]}
    salida("Ahora la Mac pide la contraseña de administrador: la lista de aparatos solo la puede cambiar root.")
    if not instalar_altas(nueva, ruta_altas, ejecutar):
        salida("No se pudo instalar la lista (sudo no aceptó la contraseña, o este usuario no es administrador). "
               "No se ha emparejado nada.")
        return 1
    despues, prob = leer_altas(ruta_altas, dueno_altas)
    if prob or not any(a["huella"] == s["huella"] and a["nivel"] == nivel for a in despues["aparatos"]):
        salida("La lista no quedó como debía (%s). Revisa con «listar» antes de usar el aparato." % (prob or "falta el alta"))
        return 1
    registrar(r["log"], "emparejado", ahora(), s["huella"], s["cuenta"], s["nombre"])
    avisada = puerta.resultado(s["huella"], "emparejado", solicitud=s["id"], nivel=nivel)
    salida("Emparejado: «%s» (%s). %s" % (s["nombre"], "completo: puede poner agentes a trabajar" if nivel == "completo"
                                         else "solo texto", "El aparato lo verá en unos segundos." if avisada else
                                         "La puerta no se enteró: el aparato no lo verá, pero la Mac ya lo acepta."))
    llevar = llevar or llevar_a1
    ok, texto = llevar(base=base, ruta_altas=ruta_altas, ahora=ahora, ejecutar=ejecutar)
    salida("Al A1: " + texto)
    return 0


def rechazar(puerta, numero, salida=print, ahora=time.time):
    """`emparejar --rechazar N`: dice a la puerta que esa solicitud no se empareja. Solo quita."""
    crudas = puerta.solicitudes()
    if crudas is None:
        salida("La puerta del A1 no respondió: no se ha rechazado nada.")
        return 1
    pendientes, _ = preparar_solicitudes(crudas, None, ahora())
    if not 1 <= numero <= len(pendientes):
        salida("No hay una solicitud con ese número (mira «pendientes»).")
        return 1
    s = pendientes[numero - 1]
    ok = puerta.resultado(s["huella"], "rechazado", solicitud=s["id"])
    salida("Solicitud «%s» rechazada." % s["nombre"] if ok else "La puerta no aceptó el rechazo.")
    return 0 if ok else 1


# ── llevar la lista al A1 (§3.3 punto 3) ─────────────────────────────────────

def alias_a1(entorno=None, env_archivo=None):
    """El alias ssh del A1 (nombre de `~/.ssh/config`), de la variable STARSEED_A1_SSH. Nunca se imprime."""
    entorno = os.environ if entorno is None else entorno
    valor = entorno.get(VAR_A1)
    if not valor:
        leer_env = G._modulo("puerta_datos_cliente", "puerta_datos_cliente.py").leer_env
        valor = (leer_env(env_archivo) if env_archivo else leer_env()).get(VAR_A1)
    return valor if valor and RE_ALIAS.match(valor) else None


def chat_a1(canon):
    """`chat-a1.json`: {v, id, nombre, alias} del chat canónico del puente B, sacado del canon.json local."""
    for c in (canon or {}).get("chats") or []:
        if isinstance(c, dict) and c.get("fuente") == "puente:peticiones" and \
                "puente:peticiones" in (c.get("alias") or []) and F.RE_ID_CHAT.match(str(c.get("id") or "")):
            return {"v": 1, "id": c["id"], "nombre": F.limpiar_nombre(c.get("nombre")),
                    "alias": [F.limpiar_nombre(a) for a in c.get("alias") or [] if isinstance(a, str)][:20]}
    return None


def marcar_llevar(base, pendiente, ahora, llegada=None):
    r = rutas(base)
    datos = G.leer_json(r["llevar"], {})
    datos = datos if isinstance(datos, dict) else {}
    datos.update(pendiente=bool(pendiente), intento=ahora)
    if llegada:
        datos["llegada"] = llegada
    G.escribir_json(r["llevar"], datos)
    return datos


def llevar_a1(base=G.BASE, ruta_altas=RUTA_ALTAS, ahora=time.time, ejecutar=subprocess.run, entorno=None,
              env_archivo=None):
    """(ok, frase). Copia por ssh al A1, en ~/.starseed/peticiones/ (600): la lista de altas tal cual,
    los retirados y chat-a1.json. No imprime la salida de ssh (podría llevar la dirección). Si falla, queda
    pendiente y el servicio de la Mac lo reintenta cada 5 min."""
    r = rutas(base)
    alias = alias_a1(entorno, env_archivo)
    if not alias:
        marcar_llevar(base, True, ahora())
        return False, "sin configurar (falta %s; es la fase 1b): queda pendiente" % VAR_A1
    archivos = []
    crudo = leer_bytes_altas(ruta_altas)
    archivos.append(("aparatos.json", crudo if crudo is not None else b'{"v": 1, "aparatos": []}'))
    archivos.append(("aparatos-retirados.json",
                     json.dumps(leer_retirados(r["retirados"], ruta_retirados_sistema(ruta_altas)),
                                ensure_ascii=False).encode("utf-8")))
    chat = chat_a1(leer_canon(r["canon"]))
    if chat:
        archivos.append(("chat-a1.json", json.dumps(chat, ensure_ascii=False).encode("utf-8")))
    for nombre, datos in archivos:
        remoto = ("umask 077 && mkdir -p .starseed/peticiones && cat > .starseed/peticiones/%s.tmp && "
                  "chmod 600 .starseed/peticiones/%s.tmp && mv -f .starseed/peticiones/%s.tmp .starseed/peticiones/%s"
                  % (nombre, nombre, nombre, nombre))
        try:
            res = ejecutar([SSH, "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "--", alias, remoto],
                           input=datos, capture_output=True, timeout=60)
            bien = getattr(res, "returncode", 1) == 0
        except (OSError, subprocess.SubprocessError):
            bien = False
        if not bien:
            marcar_llevar(base, True, ahora())
            registrar(r["log"], "llevar-a1-fallo", ahora())
            return False, "no se pudo copiar (ssh falló): queda pendiente; el servicio lo reintenta cada 5 min"
    llegada = F.iso_utc(ahora())
    marcar_llevar(base, False, ahora(), llegada)
    registrar(r["log"], "llevado-a1", ahora())
    return True, "lista llegada a las %s%s" % (_ahora_local(ahora()), "" if chat else " (sin chat-a1.json: falta canon.json)")


def llevar_si_toca(base=G.BASE, ahora=time.time, llevar=None):
    """Lo llama el servicio en cada vuelta: si hay algo pendiente y pasaron 5 min del último intento."""
    datos = G.leer_json(rutas(base)["llevar"], {})
    if not isinstance(datos, dict) or not datos.get("pendiente"):
        return None
    if ahora() - (datos.get("intento") or 0) < REINTENTO_A1_S:
        return None
    return (llevar or llevar_a1)(base=base, ahora=ahora)


# ── retirar (§3.7) ───────────────────────────────────────────────────────────

def buscar_aparato(objetivo, altas):
    """Las filas de altas que casan con un código, unos primeros hex de la huella (≥ 8) o un nombre exacto."""
    objetivo = (objetivo or "").strip()
    filas = altas["aparatos"]
    codigo = F.normalizar_codigo(objetivo)
    if codigo:
        hay = [f for f in filas if F.codigos_iguales(codigo, F.codigo_de(f["huella"], f["cuenta"]))]
        if hay:
            return hay
    hexa = objetivo.lower()
    if re.match(r"^[0-9a-f]{8,64}$", hexa):
        hay = [f for f in filas if f["huella"].startswith(hexa)]
        if hay:
            return hay
    return [f for f in filas if f["nombre"] == F.limpiar_nombre(objetivo, 60)]


def describir_aparato(i, f, retirados):
    retiro = F.retiro_de(f["huella"], retirados)
    estado = ("retirado %s" % fecha_retiro(retiro)) if retiro else "activo"
    return "  %d. «%s» · %s · %s… · cuenta %s… · %s · alta %s · %s" % (
        i, f["nombre"] or "sin nombre", F.codigo_de(f["huella"], f["cuenta"]), f["huella"][:8],
        L.cuenta8(f["cuenta"]), f["nivel"], f["alta"][:16] or "—", estado)


def revocar(objetivo, puerta, base=G.BASE, ruta_altas=RUTA_ALTAS, dueno_altas=0, entrada=input, salida=print,
            ahora=time.time, ejecutar=subprocess.run, llevar=None):
    """Retira un aparato: lo añade a aparatos-retirados.json (600). La lista de root NO se toca."""
    r = rutas(base)
    altas, problema = leer_altas(ruta_altas, dueno_altas)
    retirados = leer_retirados(r["retirados"], ruta_retirados_sistema(ruta_altas))
    activos = [f for f in altas["aparatos"] if not F.retiro_de(f["huella"], retirados)]
    if not activos:
        salida("No hay aparatos activos que retirar%s." % ((" (lista de altas: %s)" % problema) if problema else ""))
        return 1
    if objetivo:
        candidatos = [f for f in buscar_aparato(objetivo, altas) if f in activos]
    else:
        salida("Aparatos activos:")
        for i, f in enumerate(activos, 1):
            salida(describir_aparato(i, f, retirados))
        n = _preguntar(entrada, "Número del aparato que quieres retirar: ")
        candidatos = [activos[int(n) - 1]] if n and n.strip().isdigit() and 1 <= int(n) <= len(activos) else []
    if len(candidatos) != 1:
        salida("No hay un único aparato activo con eso (%d coinciden). No se ha retirado nada." % len(candidatos))
        return 1
    f = candidatos[0]
    salida("Vas a retirar «%s» (%s…, %s)." % (f["nombre"], f["huella"][:8], f["nivel"]))
    confirmacion = _preguntar(entrada, "Para confirmar, escribe su código (%s): " % F.codigo_de(f["huella"], f["cuenta"]))
    if not F.codigos_iguales(confirmacion or "", F.codigo_de(f["huella"], f["cuenta"])):
        salida("El código no coincide: no se ha retirado nada.")
        return 1
    anadir_retirado(r["retirados"], f["huella"], "mac", ahora(), ruta_retirados_sistema(ruta_altas))
    registrar(r["log"], "revocado", ahora(), f["huella"], f["cuenta"], f["nombre"])
    puerta.resultado(f["huella"], "revocado")
    ok, texto = (llevar or llevar_a1)(base=base, ruta_altas=ruta_altas, ahora=ahora, ejecutar=ejecutar)
    salida("Retirado en la Mac. En el A1: %s" % texto)
    return 0


# ── consultas ────────────────────────────────────────────────────────────────

def listar(base=G.BASE, ruta_altas=RUTA_ALTAS, dueno_altas=0, salida=print):
    altas, problema = leer_altas(ruta_altas, dueno_altas)
    retirados = leer_retirados(rutas(base)["retirados"], ruta_retirados_sistema(ruta_altas))
    if problema:
        salida("Lista de altas: %s." % problema)
    if not altas["aparatos"]:
        salida("No hay aparatos emparejados.")
        return 0
    salida("Aparatos emparejados (código · huella8 · cuenta8 · nivel · alta · estado):")
    for i, f in enumerate(altas["aparatos"], 1):
        salida(describir_aparato(i, f, retirados))
    return 0


def pendientes(puerta, base=G.BASE, salida=print, ahora=time.time):
    """Las solicitudes pendientes, SIN su código (el código se copia de la pantalla del aparato)."""
    crudas = puerta.solicitudes()
    if crudas is None:
        salida("La puerta del A1 no respondió (o falta su configuración).")
        return 1
    cuentas, _ = G.leer_cuentas(rutas(base)["cuentas"])
    lista, descartadas = preparar_solicitudes(crudas, cuentas, ahora())
    salida("Solicitudes pendientes: %d%s" % (len(lista), (" (%d descartadas)" % descartadas) if descartadas else ""))
    for i, s in enumerate(lista, 1):
        salida(describir_solicitud(i, s))
    return 0


def tuneles_cargados(ejecutar=subprocess.run):
    """Etiquetas de launchd de los túneles a la Mac que están cargadas (§3.11.11). Nunca PID ni direcciones."""
    try:
        res = ejecutar([LAUNCHCTL, "list"], capture_output=True, text=True, timeout=10)
        texto = res.stdout if getattr(res, "returncode", 1) == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return None
    etiquetas = {linea.split()[-1] for linea in (texto or "").splitlines() if linea.split()}
    return sorted(e for e in etiquetas if any(t in e for t in TUNELES))


def estado_texto(base=G.BASE, ruta_altas=RUTA_ALTAS, dueno_altas=0, ahora=None, ejecutar=subprocess.run,
                 entorno=None, env_archivo=None):
    """Qué aparatos valen, si la lista llegó al A1 y si hay un túnel que la firma no cubre."""
    ahora = time.time() if ahora is None else ahora
    r = rutas(base)
    altas, problema = leer_altas(ruta_altas, dueno_altas)
    sistema = ruta_retirados_sistema(ruta_altas)
    retirados = leer_retirados(r["retirados"], sistema)
    lineas = ["Aparatos de Genesis (GEN1114B)"]
    if problema:
        lineas.append("· Lista de altas (root, 644): %s → no se ejecuta nada que llegue por la puerta" % problema)
    else:
        lineas.append("· Lista de altas (root, 644): bien, %d aparato(s)" % len(altas["aparatos"]))
    for i, f in enumerate(altas["aparatos"], 1):
        lineas.append(describir_aparato(i, f, retirados).replace("  %d. " % i, "  · ", 1))
    lineas.append("· Retirados: %d" % len(retirados["retirados"]))
    lineas.append("· Registro de retiradas de solo añadir: %s" % estado_retirados_sistema(sistema))
    llevar = G.leer_json(r["llevar"], {})
    llevar = llevar if isinstance(llevar, dict) else {}
    lineas.append("· Al A1 (%s): %s · última llegada %s · %s" % (
        VAR_A1, "configurado" if alias_a1(entorno, env_archivo) else "sin configurar",
        G._hace(ahora, F.epoch_de(llevar.get("llegada"))) if llevar.get("llegada") else "nunca",
        "pendiente de llevar (se reintenta cada 5 min)" if llevar.get("pendiente") else "nada pendiente"))
    tuneles = tuneles_cargados(ejecutar)
    if tuneles is None:
        lineas.append("· Túneles a la Mac: no se pudo mirar launchd")
    elif tuneles:
        lineas.append("· ⚠ Hay un túnel abierto a la Mac (%s): la firma no lo cubre" % ", ".join(tuneles))
    else:
        lineas.append("· Túneles a la Mac: ninguno cargado")
    return "\n".join(lineas)


def estado_retirados_sistema(sistema, lstat=os.lstat):
    """GEN1114INT · cómo está el registro de solo añadir (una frase, sin huellas)."""
    try:
        st = lstat(sistema)
    except OSError:
        return "aún no existe (lo crea el primer emparejamiento)"
    if leer_retirados_sistema(sistema)[1]:
        return "⚠ existe pero no se puede leer → no se ejecuta nada"
    if not getattr(st, "st_flags", 0) & getattr(stat, "SF_APPEND", 0x00040000):
        return "⚠ sin la marca de solo añadir (sappnd): un programa podría vaciarlo"
    return "bien (solo añadir)"


def acceso_escritorio(raiz=None, escritorio=None, salida=print):
    """Copia los dos lanzadores al Escritorio con la raíz del repo escrita dentro (doble clic → Terminal)."""
    raiz = raiz or os.path.normpath(os.path.join(CARPETA, "..", ".."))
    escritorio = escritorio or os.path.join(os.path.expanduser("~"), "Desktop")
    if not os.path.isdir(escritorio):
        salida("No encuentro el Escritorio.")
        return 1
    for nombre in LANZADORES:
        with open(os.path.join(CARPETA, nombre), encoding="utf-8") as f:
            texto = f.read()
        texto = re.sub(r'(?m)^RAIZ_POR_DEFECTO=.*$', lambda m: 'RAIZ_POR_DEFECTO="%s"' % raiz.replace('"', ""), texto)
        destino = os.path.join(escritorio, nombre)
        with open(destino, "w", encoding="utf-8") as f:
            f.write(texto)
        os.chmod(destino, 0o755)
    salida("En el Escritorio: «Emparejar aparato» y «Retirar aparato» (doble clic).")
    return 0


def main(argv=None, puerta=None):
    ap = argparse.ArgumentParser(description="Aparatos que pueden escribir en los chats de Genesis (GEN1114B)")
    ap.add_argument("--estado", action="store_true", help="aparatos, lista al A1 y túneles (sin huellas enteras)")
    sub = ap.add_subparsers(dest="orden")
    e = sub.add_parser("emparejar", help="da de alta un aparato (sentado delante de la Mac)")
    e.add_argument("--rechazar", type=int, metavar="N")
    sub.add_parser("pendientes")
    sub.add_parser("listar")
    rv = sub.add_parser("revocar")
    rv.add_argument("objetivo", nargs="?", default="")
    sub.add_parser("llevar-a1")
    ae = sub.add_parser("acceso-escritorio", help="copia los dos lanzadores (doble clic) al Escritorio o a --carpeta")
    # GEN1114INT: otra carpeta (p. ej. ~/Applications/StarSeed) para no depender del permiso de macOS sobre el Escritorio.
    ae.add_argument("--carpeta", default=None)
    a = ap.parse_args(argv)
    if a.estado:
        print(estado_texto())
        return 0
    if a.orden == "emparejar":
        if a.rechazar is not None:
            return rechazar(puerta or Puerta(), a.rechazar)
        return emparejar(puerta or Puerta())
    if a.orden == "pendientes":
        return pendientes(puerta or Puerta())
    if a.orden == "listar":
        return listar()
    if a.orden == "revocar":
        return revocar(a.objetivo, puerta or Puerta())
    if a.orden == "llevar-a1":
        ok, texto = llevar_a1()
        print("Al A1: " + texto)
        return 0 if ok else 1
    if a.orden == "acceso-escritorio":
        return acceso_escritorio(escritorio=os.path.expanduser(a.carpeta) if a.carpeta else None)
    ap.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main() or 0)
