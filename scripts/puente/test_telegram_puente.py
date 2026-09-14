#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas sin red para la lógica pura de telegram-puente."""

import importlib.util
import os
import pathlib
import sys
import tempfile


RUTA = pathlib.Path(__file__).with_name("telegram-puente.py")
SPEC = importlib.util.spec_from_file_location("telegram_puente", RUTA)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("No se pudo cargar telegram-puente.py")
PUENTE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PUENTE)

FALLAS = []
PRUEBAS = 0


def comprobar(nombre, obtenido, esperado):
    """Acumula fallas para ejecutar todos los casos en una sola pasada."""
    global PRUEBAS
    PRUEBAS += 1
    if obtenido != esperado:
        FALLAS.append(
            "FALLA %s: esperado %r, obtenido %r" % (nombre, esperado, obtenido)
        )


# Las comillas solo delimitan el argumento completo; no forman parte del mensaje.
comprobar(
    "parsear /decir con comillas",
    PUENTE.parsear_orden('/decir "zN4 en verde"'),
    ("decir", ["zN4 en verde"], None),
)
comprobar(
    "parsear mensaje suelto",
    PUENTE.parsear_orden("avisa cuando termine"),
    ("mensaje", ["avisa cuando termine"], None),
)
comprobar(
    "parsear orden personal",
    PUENTE.parsear_orden("/a Claude revisa la puerta"),
    ("personal", ["Claude", "revisa la puerta"], None),
)

mensaje = {"tipo": "mensaje", "texto": "listo", "quien": "codex"}
comprobar("es_repetido sin último → enviar", PUENTE.es_repetido(mensaje, None), False)
comprobar(
    "es_repetido murmullo → callar",
    PUENTE.es_repetido({"tipo": "murmurio"}, mensaje),
    True,
)
comprobar("es_repetido idéntico", PUENTE.es_repetido(mensaje, dict(mensaje)), True)

cuota_anterior = {
    "tipo": "aviso",
    "texto": "Proveedor sin cuota: motor-a",
    "epoch": 1000,
}
cuota_nueva = {
    "tipo": "aviso",
    "texto": "Proveedor sin cuota: motor-a",
    "epoch": 1000 + PUENTE.SIN_CREDITO_TIEMPO - 1,
}
# El aviso conserva utilidad temporal: dentro del plazo se calla; después renace.
comprobar(
    "es_repetido aviso cuota dentro del plazo",
    PUENTE.es_repetido(cuota_nueva, cuota_anterior),
    True,
)
cuota_nueva["epoch"] = 1000 + PUENTE.SIN_CREDITO_TIEMPO
comprobar(
    "es_repetido aviso cuota al vencer",
    PUENTE.es_repetido(cuota_nueva, cuota_anterior),
    False,
)
otro_asunto = dict(cuota_nueva, texto="Proveedor sin cuota: motor-b", epoch=1001)
comprobar(
    "es_repetido cuota de otro asunto",
    PUENTE.es_repetido(otro_asunto, cuota_anterior),
    False,
)

comprobar("pinta None", PUENTE._pinta_json(None), "")

# Un mensaje que nació en Telegram ya llegó a su destino y no debe volver.
comprobar(
    "no reenviar al autor de Telegram",
    PUENTE.debe_reenviar_linea({"quien": "telegram-usuario", "texto": "Hola"}),
    False,
)

# La etiqueta de la ola puede venir ya completa desde el Mando.
resumen_ola = PUENTE._mensajes_resumen(
    {
        "cuentas": {"ola": "Ola 305", "integradas": 1},
    }
)
comprobar(
    "no duplicar prefijo de ola",
    (
        PUENTE._etiqueta_ola("Ola 305"),
        PUENTE._etiqueta_ola("305", "OLA"),
        resumen_ola[0]["texto"],
    ),
    ("Ola 305", "OLA 305", "Ola 305 integrada · 1 tareas cruzadas a main"),
)

# El primer proceso toma el cerrojo y el segundo reconoce que sigue vivo.
with tempfile.TemporaryDirectory() as temporal:
    cerrojo = os.path.join(temporal, "telegram.lock")
    primero, _ = PUENTE.adquirir_cerrojo(cerrojo, pid=os.getpid())
    segundo, motivo = PUENTE.adquirir_cerrojo(cerrojo, pid=os.getpid())
    comprobar(
        "cerrojo impide dos puentes vivos",
        (primero, segundo, "PID %s" % os.getpid() in motivo),
        (True, False, True),
    )
    PUENTE.liberar_cerrojo(cerrojo, pid=os.getpid())
    descriptor = os.open(cerrojo, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.write(descriptor, b"999999\n")
    os.close(descriptor)
    recuperado, _ = PUENTE.adquirir_cerrojo(
        cerrojo, pid=os.getpid(), proceso_vivo=lambda _: False
    )
    comprobar("cerrojo huérfano se recupera", recuperado, True)
    PUENTE.liberar_cerrojo(cerrojo, pid=os.getpid())

comprobar(
    "formatear concatena argumentos",
    (
        PUENTE._formatear_orden_completa("decir", ["zN4", "en", "verde"]),
        PUENTE._formatear_orden_completa("personal", ["Claude", "revisa", "esto"]),
    ),
    ("/decir zN4 en verde", "/a Claude revisa esto"),
)

# `texto` es parte del contrato: main lo imprime para explicar por qué no arranca.
comprobar("parsear /salud", PUENTE.parsear_orden("/salud"), ("salud", [], None))
comprobar(
    "parsear /proveedores",
    PUENTE.parsear_orden("/proveedores"),
    ("proveedores", [], None),
)
comprobar(
    "parsear /xyz desconocida",
    PUENTE.parsear_orden("/xyz"),
    ("desconocida", ["/xyz"], "xyz"),
)


def _medidores_mock():
    return [
        {"nombre": "openai", "estado": "ok", "detalle": ""},
        {"nombre": "anthropic", "estado": "error", "detalle": "sin cuota"},
    ]


class FakeSaludMando:
    @staticmethod
    def medidores(estado):
        return _medidores_mock()


class FakeSaludProveedores:
    @staticmethod
    def resumen(estado):
        return [{"texto": "motor-a: 429/402 repetido"}]


_original_salud_mando = getattr(PUENTE, "salud_mando", None)
_original_salud_proveedores = getattr(PUENTE, "salud_proveedores", None)

PUENTE.salud_mando = staticmethod(lambda e: [])
PUENTE.salud_proveedores = staticmethod(lambda e: [])

comprobar("salud sin datos → vacío", PUENTE.salud_mando({}), [])
comprobar("salud con error → vacío", PUENTE.salud_mando({"_error": "timeout"}), [])
comprobar("proveedores sin datos → vacío", PUENTE.salud_proveedores({}), [])
comprobar(
    "proveedores con error → vacío", PUENTE.salud_proveedores({"_error": "timeout"}), []
)

if _original_salud_mando:
    PUENTE.salud_mando = _original_salud_mando
if _original_salud_proveedores:
    PUENTE.salud_proveedores = _original_salud_proveedores

comprobar(
    "arranque sin variables",
    PUENTE.arranque_completo(env={}),
    {
        "ok": False,
        "token": False,
        "chat": False,
        "faltan": ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"],
        "texto": (
            "Telegram-Puente parado: hacen falta TELEGRAM_BOT_TOKEN, "
            "TELEGRAM_CHAT_ID como variables de entorno."
        ),
    },
)

if FALLAS:
    print("\n".join(FALLAS))
    print(
        "%d/%d pruebas en verde; %d fallaron."
        % (PRUEBAS - len(FALLAS), PRUEBAS, len(FALLAS))
    )
    sys.exit(1)

print("%d/%d pruebas en verde." % (PRUEBAS, PRUEBAS))
