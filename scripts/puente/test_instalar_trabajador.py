#!/usr/bin/env python3
"""Pruebas de instalar_trabajador.sh (COL1012K). El script corre con un PATH FALSO (solo los programas de mentira
de aquí, que anotan cómo se les llamó) y un HOME temporal: sin red, sin tocar el disco real y sin instalar nada."""
import json, os, pathlib, shutil, subprocess, sys, tempfile, unittest
AQUI = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(AQUI, "instalar_trabajador.sh")
BASH = shutil.which("bash") or "/bin/bash"
NODE_APT = "→ curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
URL = {"STARSEED_EMPAREJAR_URL": "https://emparejar.invalid/x"}  # nunca se llama: curl es de mentira
# `git --version` y `npm prefix -g` solo leen: no se anotan. Del python3 solo se interceptan las órdenes del nodo.
FALSOS = {
    "uname": 'echo "${FALSO_UNAME:-Linux}"', "node": 'echo "${FALSO_NODE:-v22.11.0}"',
    "id": 'case "$1" in -u) echo "${FALSO_UID:-1000}" ;; *) echo persona ;; esac',
    "git": '[ "$1" = --version ] && { echo "git version 2.39.0"; exit "${FALSO_GIT_RC:-0}"; }\necho "git $* sin-preguntar='
           '${GIT_TERMINAL_PROMPT:-}" >> "$FALSO_LOG"; [ "$1" = clone ] && %s -p "$3"; exit 0' % (shutil.which("mkdir") or "/bin/mkdir"),
    "npm": '[ "$1" = prefix ] && { echo "${FALSO_NPM_PREFIX:-/no-existe}"; exit 0; }; echo "npm $*" >> "$FALSO_LOG"',
    "opencode": "exit 0", "apt-get": "exit 0", "systemctl": 'exit "${FALSO_SYSTEMD:-0}"',
    "curl": 'echo "curl $*" >> "$FALSO_LOG"; read -r d; echo "cuerpo $d" >> "$FALSO_LOG"; printf "%s" "${FALSO_HTTP:-503}"',
    "python3": ('case "$*" in *"nodo_metagenesis.py llave"*) echo "Nodo neurona-a1b2c3 · huella de su llave: 9f86d081"; exit 0;;\n'
                '*"nodo_metagenesis.py instalar"*) echo "nodo instalar $STARSEED_ROOT" >> "$FALSO_LOG"; exit 0;; esac\n'
                'exec %s "$@"' % sys.executable),
}

class TestInstalarTrabajador(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home, self.bin, self.mods, self.log = (os.path.join(self.tmp.name, n) for n in ("casa", "bin", "mods", "llamadas.log"))
        self.destino = os.path.join(self.home, "starseed-trabajador")
        self.etc_systemd = os.path.join(self.tmp.name, "etc", "systemd", "system")
        os.makedirs(self.etc_systemd)
        pathlib.Path(self.etc_systemd, "starseed-metagenesis.service").write_text(f"ExecStart=/usr/bin/python3 -u {self.destino}/scripts/puente/nodo_metagenesis.py servir\n")
        os.mkdir(self.home), os.mkdir(self.mods), self.preparar(), self.gobernador(16 * 1024)
    def preparar(self, sin=(), con=()):
        """Rehace el PATH falso: todos los programas menos `sin`, más `con` (que solo existen)."""
        shutil.rmtree(self.bin, ignore_errors=True), os.mkdir(self.bin)
        for n, cuerpo in [(n, c) for n, c in FALSOS.items() if n not in sin] + [(c, "exit 0") for c in con]:
            with open(os.open(os.path.join(self.bin, n), os.O_WRONLY | os.O_CREAT, 0o755), "w", encoding="utf-8") as f:
                f.write("#!%s\n%s\n" % (BASH, cuerpo))
    def gobernador(self, ram_mb):
        """gobernador_generico (COL1012L) de mentira: va antes que el del repo por PYTHONPATH."""
        pathlib.Path(self.mods, "gobernador_generico.py").write_text("def medir():\n    return {'so': 'linux', 'nucleos': 8, "
            "'ram_total_mb': %d, 'disco_libre_gb': 50.0, 'herramientas': {h: True for h in ('git', 'node', 'python3', 'opencode')}}\n" % ram_mb)
    def correr(self, *args, entrada=None, **env):
        """Con `entrada`, el guion llega por la entrada estándar, como con «curl … | bash -s -- …»."""
        e = dict({"PATH": self.bin, "HOME": self.home, "FALSO_LOG": self.log, "PYTHONPATH": self.mods, "PYTHONDONTWRITEBYTECODE": "1", "LANG": "C.UTF-8", "STARSEED_SYSTEMD_SYSTEM_PATH": self.etc_systemd}, **env)
        orden, kw = ([BASH, "-s", "--"], {"input": entrada}) if entrada is not None else ([BASH, SCRIPT], {"stdin": subprocess.DEVNULL})
        r = subprocess.run(orden + list(args), env=e, capture_output=True, text=True, encoding="utf-8",
                           timeout=60, start_new_session=True, cwd=self.tmp.name, **kw)
        return r.returncode, r.stdout + r.stderr
    def llamadas(self): return pathlib.Path(self.log).read_text(encoding="utf-8") if os.path.exists(self.log) else ""
    def faltan(self, textos, out): return [t for t in textos if t not in out]  # los textos esperados que no salieron
    def test_ayuda_opciones_malas_y_root(self):
        self.assertEqual([self.correr(*a)[0] for a in (["--ayuda"], ["--nada"], ["--emparejar"], ["--emparejar", 'a"b}'])], [0, 2, 2, 2])
        rc, out = self.correr("--seco", FALSO_UID="0")
        self.assertEqual((rc, "No me ejecutes como root ni con sudo" in out, "Herramientas" in out, self.llamadas()), (1, True, False, ""), out)
    def test_falta_herramienta_dice_el_comando_exacto_de_cada_sistema(self):
        mac, npm_g = {"FALSO_UNAME": "Darwin"}, "→ npm install -g opencode-ai@1.18.33"  # sin sudo delante
        casos = [({}, ("node", "opencode"), (), [NODE_APT, "→ sudo npm install -g opencode-ai@1.18.33"]),
                 ({"FALSO_NPM_PREFIX": self.tmp.name}, ("opencode",), (), [npm_g]),  # npm de nvm: es de la persona
                 ({}, ("npm",), (), ["✗ falta npm → sudo apt-get install -y npm"]),
                 ({}, ("git", "apt-get"), ("dnf",), ["sudo dnf install -y git"]),
                 (mac, ("node", "opencode"), (), ["brew install node", "Homebrew", npm_g]),
                 (dict(mac, FALSO_GIT_RC="1"), (), (), ["✗ git no funciona → xcode-select --install"]),
                 ({"PREFIX": "/data/data/com.termux/files/usr"}, ("node",), (), ["pkg install nodejs-lts"]),
                 ({"FALSO_NODE": "v20.18.1"}, (), (), ["hace falta ≥ 20.19", NODE_APT])]
        for env, sin, con, esperado in casos:
            with self.subTest(env=env, sin=sin):
                self.preparar(sin=sin, con=con)
                rc, out = self.correr("--seco", **env)
                self.assertEqual((rc, self.faltan(esperado + ["no instalo nada"], out)), (1, []), out)
        self.assertEqual((self.llamadas(), os.path.exists(self.destino)), ("", False))  # ni clona ni instala nada
    def test_seco_explica_la_capacidad_sin_tocar_nada(self):
        rc, out = self.correr("--seco", "--emparejar", "ABCD-1234")
        self.assertEqual((rc, self.faltan(["[seco] haría: git clone https://github.com/StarSeedSystem/starseed-system.git",
                                           "Capacidad (gobernador_generico): 4 agente(s)", "nunca la llave"], out)), (0, []), out)
        self.assertEqual((self.llamadas(), os.listdir(self.home)), ("", []))
        self.gobernador(4 * 1024)  # aparato pequeño: lo dice colmena_logica y no se instala el nodo
        rc, out = self.correr("--seco")
        self.assertEqual((rc, "menos de 6 GB" in out, "no instalo el nodo" in out), (1, True, True), out)
    @unittest.skipIf(os.path.exists(os.path.join(AQUI, "gobernador_generico.py")), "ya existe el gobernador real")
    def test_sin_gobernador_mide_lo_basico_y_lo_dice(self):
        os.remove(os.path.join(self.mods, "gobernador_generico.py"))
        self.assertIn("medida básica: falta gobernador_generico (COL1012L)", self.correr("--seco")[1])
    def test_instalacion_completa_y_emparejado_pendiente_por_503(self):
        rc, out = self.correr("--emparejar", "ABCD-1234", **URL)
        self.assertEqual((rc, self.faltan(["pendiente: falta la migración de nodos (§8)", "huella de su llave: 9f86d081", "git clone",
                                           "npm ci --include=dev", "sin-preguntar=0", "nodo instalar %s" % self.destino, "loginctl enable-linger persona",
                                           'cuerpo {"codigo":"ABCD-1234","nodo":"neurona-a1b2c3","huella":"9f86d081"}'], out + self.llamadas())), (0, []), out)
        curl = [l for l in self.llamadas().splitlines() if l.startswith("curl ")]
        self.assertEqual((len(curl), "ABCD" in curl[0]), (1, False))  # el código no va en la línea de órdenes de curl
        cont = json.loads(pathlib.Path(self.home, ".starseed", "nodo-metagenesis", "contenedor.json").read_text(encoding="utf-8"))
        self.assertEqual((cont["activo"], cont["trabajadores"]), (True, 4))
        for url, esperado in (("https://emparejar.invalid/x", "Emparejado"), ("http://emparejar.invalid/x", "https://…")):
            shutil.rmtree(self.destino)
            rc, out = self.correr("--emparejar", "ABCD-1234", FALSO_HTTP="201", STARSEED_EMPAREJAR_URL=url)
            self.assertEqual((rc, esperado in out), (0, True), out)
        self.assertEqual(self.llamadas().count("curl "), 2)  # sin https no se envía nada
    def test_no_pisa_una_copia_ni_un_nodo_que_ya_existen_y_sin_systemd_lo_dice(self):
        os.mkdir(self.destino)
        rc, out = self.correr()  # sin terminal, la pregunta de la copia existente es «no»
        self.assertEqual((rc, "No toco nada" in out, self.llamadas()), (0, True, ""))
        os.rmdir(self.destino)
        rc, out = self.correr(FALSO_SYSTEMD="1")
        self.assertEqual((rc, "systemd --user no responde" in out, self.llamadas()), (1, True, ""))  # lo dice antes de clonar
        unidad = pathlib.Path(self.home, ".config", "systemd", "user", "starseed-nodo-metagenesis.service")
        unidad.parent.mkdir(parents=True)
        unidad.write_text("ExecStart=/usr/bin/python3 -u /otra/copia/scripts/puente/nodo_metagenesis.py servir\n")
        rc, out = self.correr("--emparejar", "ABCD-1234", **URL)  # la Mac o el A1: se suman con «Usar como contenedor»
        self.assertEqual((rc, "ya es un nodo de MetaGenesis" in out, self.llamadas()), (1, True, ""), out)
        unidad.write_text("ExecStart=/usr/bin/python3 -u %s/scripts/puente/nodo_metagenesis.py servir\n" % self.destino)
        self.assertEqual(self.correr("--seco")[0], 0)  # el nodo de ESTA copia: repetir es seguro
    def test_por_tuberia_como_curl_bash(self):
        texto = pathlib.Path(SCRIPT).read_text(encoding="utf-8")
        rc, out = self.correr("--emparejar", "ABCD-1234", entrada=texto[: len(texto) // 2], **URL)  # descarga cortada
        self.assertEqual((rc != 0, "Herramientas" in out, self.llamadas()), (True, False, ""), out)
        os.makedirs(os.path.join(self.destino, "scripts", "puente"))
        shutil.copy(os.path.join(AQUI, "colmena_logica.py"), os.path.join(self.destino, "scripts", "puente"))
        rc, out = self.correr("--seco", entrada=texto)
        self.assertEqual((rc, "Capacidad (gobernador_generico): 4 agente(s)" in out), (0, True), out)

if __name__ == "__main__":
    unittest.main()
