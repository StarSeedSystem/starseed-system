"""Mantiene despierta la neurona (pantalla o sistema) según pantalla.json; usa keepalive, caffeinate o systemd-inhibit y guarda despierto.json."""

import argparse, json, os, platform, shutil, signal, subprocess, sys, time

from pantalla_orden import (
    ARCHIVO_ESTADO,
    construir_orden,
    elegir_herramienta,
    escribir_estado,
    estado_despierto,
    leer_ajuste,
    leer_modo,
    que_hacer,
)

ARCHIVO_AJUSTE = os.path.expanduser("~/.starseed/pantalla.json")
INTERVALO_BUCLE_S = 10


class ServicioPantalla:
    def __init__(self, lanzador_popen=None, lanzador_run=None, ahora=None, plataforma=None, en_path=None, ruta_estado=ARCHIVO_ESTADO, escritor=None):
        self._popen = lanzador_popen or subprocess.Popen
        self._run = lanzador_run or subprocess.run
        self._ahora = ahora or time.monotonic
        self._sistema = plataforma or platform.system()
        self._en_path = en_path or shutil.which
        self._ruta_estado, self._escribir = ruta_estado, escritor or escribir_estado
        self._desde, self._ultimo_u = int(time.time()), 0.0
        self.hijo, self._modo_actual = None, None

    def herramienta(self):
        rutas = [self._en_path(n) for n in ("keepalive", "caffeinate", "systemd-inhibit")]
        return elegir_herramienta(self._sistema, *rutas)

    def hijo_vivo(self):
        return self.hijo is not None and self.hijo.poll() is None

    def parar(self, modo=None, activo=False):
        if self.hijo is None:
            return
        herramienta, hijo = self.herramienta(), self.hijo
        self.hijo = None
        try:
            hijo.terminate(); hijo.wait(timeout=5)
        except Exception: pass
        if modo is not None:
            self._guardar(activo, modo, herramienta)

    def lanzar(self, modo):
        self.parar()
        herramienta = self.herramienta()
        if herramienta is None: return
        self.hijo = self._popen(
            construir_orden(herramienta, modo, os.getpid()),
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        self._guardar(True, modo, herramienta)
        self._modo_actual = modo

    def declarar_usuario(self):
        caffeinate = self._en_path("caffeinate")
        if caffeinate:
            try:
                self._run([caffeinate, "-u", "-t", "60"], timeout=10)
            except Exception: pass
        self._ultimo_u = self._ahora()

    def _guardar(self, activo, modo, herramienta):
        nombre = os.path.basename(herramienta) if herramienta else None
        datos = estado_despierto(modo, nombre, os.getpid(), self._desde, activo)
        self._escribir(datos, self._ruta_estado)

    def ciclo(self, texto_ajuste):
        modo, herramienta = leer_modo(texto_ajuste), self.herramienta()
        if self.hijo_vivo() and modo != self._modo_actual:
            self.parar()
        renovar = modo == "pantalla" and (herramienta or "").endswith("caffeinate")
        acciones = que_hacer(leer_ajuste(texto_ajuste), self.hijo_vivo(),
                             self._ahora() - self._ultimo_u, renovar)
        for accion in acciones:
            if accion == "lanzar_dim":
                self.lanzar(modo)
            elif accion == "parar_dim":
                self.parar(modo, False)
            elif accion == "declarar_usuario":
                self.declarar_usuario()
        return acciones


def main():
    parser = argparse.ArgumentParser(description="Mantiene despierta la neurona.")
    parser.add_argument("--una-vez", action="store_true", help="Un ciclo y sale.")
    args, servicio = parser.parse_args(), ServicioPantalla()
    if servicio.herramienta() is None:
        print("mantener_pantalla: sin keepalive, caffeinate ni systemd-inhibit; nada que hacer.")
        return 0
    seguir = {"valor": True}

    def _terminar(_signum, _frame):
        seguir["valor"] = False

    signal.signal(signal.SIGTERM, _terminar); signal.signal(signal.SIGINT, _terminar)
    try:
        while seguir["valor"]:
            try:
                with open(ARCHIVO_AJUSTE, "r", encoding="utf-8") as f:
                    texto = f.read()
            except OSError:
                texto = ""
            servicio.ciclo(texto)
            if args.una_vez:
                break
            time.sleep(INTERVALO_BUCLE_S)
    finally:
        servicio.parar()
    return 0


if __name__ == "__main__":
    sys.exit(main())
