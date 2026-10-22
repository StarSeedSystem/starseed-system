#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del taller 3D (AV1011F) con subprocesos SIMULADOS: nada de Blender, GPU ni red de verdad.

Uso: python3 -m unittest servicios/taller-3d/test_taller.py   (o pytest)
"""
import base64, http.client, json, os, stat, subprocess, sys, tempfile, threading, unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import taller as T  # noqa: E402

GB = 1024 ** 3
VM_STAT = "Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 300000.\nPages inactive: 200000.\nPages speculative: 24288.\n"


class Res:
    def __init__(self, rc=0, out="", err=""):
        self.returncode, self.stdout, self.stderr = rc, out, err


class Falso:
    """Subproceso simulado: responde a las sondas y, en las órdenes de trabajo, deja el archivo de salida."""

    def __init__(self, memsize=None, nvidia_mib=None, presion="1", bateria=False, falla=None, sidecar=None):
        self.memsize, self.nvidia_mib, self.presion, self.bateria = memsize, nvidia_mib, presion, bateria
        self.falla, self.sidecar, self.ordenes = falla, sidecar, []

    def __call__(self, orden, **kw):
        self.ordenes.append(list(orden))
        exe = Path(orden[0]).name
        if orden[:2] == ["sysctl", "-n"] and orden[2] == "hw.memsize":
            return Res(0, f"{self.memsize}\n") if self.memsize else Res(1)
        if orden[:2] == ["sysctl", "-n"]:
            return Res(0, self.presion + "\n")
        if exe == "nvidia-smi":
            if self.nvidia_mib is None:
                raise FileNotFoundError(2, "No such file", "nvidia-smi")
            return Res(0, f"{self.nvidia_mib}\n")
        if exe == "vm_stat":
            return Res(0, VM_STAT)
        if exe == "pmset":
            return Res(0, "Now drawing from 'Battery Power'\n" if self.bateria else "Now drawing from 'AC Power'\n")
        if self.falla and self.falla in " ".join(orden):
            return Res(3, "", "linea 1\nCUDA out of memory\n")
        salida = self._salida(orden)
        if salida:
            Path(salida).write_bytes(b"glTF-simulado")
            if self.sidecar and salida.endswith("generar.glb"):
                Path(salida[:-4] + ".provenance.json").write_text(json.dumps(self.sidecar))
        return Res(0)

    @staticmethod
    def _salida(orden):
        if "--" in orden:  # Blender: -- modo entrada salida caras
            return orden[orden.index("--") + 3]
        for marca in ("-o", "--output"):
            if marca in orden:
                return orden[orden.index(marca) + 1]
        if len(orden) >= 4 and orden[1].endswith("_generate.py"):
            return orden[3]
        return None


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def sistema(self, falso, plataforma="Darwin", maquina="arm64", binarios=(), entorno=None, meminfo="", disco=500):
        def leer(ruta):
            if ruta == "/proc/meminfo" and meminfo:
                return meminfo
            if ruta == "/proc/pressure/memory":
                return "some avg10=0.00 avg60=0.00 avg300=0.00 total=0\n"
            raise OSError(ruta)
        return T.Sistema(raiz=self.raiz, ejecutar=falso, plataforma=plataforma, maquina=maquina, entorno=entorno or {},
                         buscar=lambda n: f"/usr/bin/{n}" if n in binarios else None, leer=leer,
                         glob=lambda _p: [], disco_libre=lambda _r: disco * GB)

    def instalar_lab(self, venvs=("", "hunyuan_mlx/shape", "vendor/trellis-space-mac", "vendor/trellis-cuda")):
        lab = self.raiz / "image-to-3dlab"
        (lab / "scripts").mkdir(parents=True)
        for s in ("pixal3d_generate.py", "hunyuan_mlx_xiong_generate.py", "trellis_space_generate.py", "trellis_cuda_generate.py"):
            (lab / "scripts" / s).write_text("# simulado")
        for v in venvs:
            py = lab / v / ".venv" / "bin" / "python" if v else lab / ".venv" / "bin" / "python"
            py.parent.mkdir(parents=True, exist_ok=True)
            py.write_text("")


def plan(*pasos):
    """Un PlanAvatar mínimo como lo da `planificar` (solo lo que el taller lee)."""
    return {"listo": True, "pasos": [{"etapa": e, "saltada": False, "motor": {"id": m, "licencia": f"lic {m}", "uso": "libre", **extra}}
                                     for e, m, extra in pasos] + [{"etapa": "animar", "saltada": False, "motor": {"id": "procedural"}}]}


def b64(datos=b"datos"):
    return base64.b64encode(datos).decode()


class Capacidades(Base):
    def test_mac_32gb_con_lab_genera_pero_no_riggea(self):
        self.instalar_lab()
        c = T.detectar(self.sistema(Falso(memsize=32 * GB), binarios=("blender",)))
        self.assertEqual(c["requisitos"], ["cpu", "blender", "apple-silicon-32gb"])
        self.assertEqual(c["hierro"], {"gpu": "apple", "ramGB": 32.0, "vramGB": None, "blender": True, "permiteEspacioHf": False, "claveExterna": False})
        self.assertTrue(c["motores"]["hunyuan3d-mlx"]["listo"])
        self.assertTrue(c["motores"]["trellis2"]["listo"])
        self.assertIn("NVIDIA", c["motores"]["pixal3d"]["motivo"])
        self.assertIn("CUDA", c["motores"]["unirig"]["motivo"])
        self.assertFalse(c["motores"]["instant-meshes"]["listo"])
        self.assertTrue(c["motores"]["quadriflow-blender"]["listo"])
        self.assertFalse(c["motores"]["stable-fast-3d"]["listo"])  # su orden no está documentada: no se inventa

    def test_mac_de_8gb_no_genera_y_lo_dice(self):
        self.instalar_lab()
        c = T.detectar(self.sistema(Falso(memsize=8 * GB)))
        self.assertNotIn("apple-silicon-32gb", c["requisitos"])
        self.assertIn("32 GB", c["motores"]["hunyuan3d-mlx"]["motivo"])

    def test_mac_32gb_sin_lab_dice_donde_falta(self):
        c = T.detectar(self.sistema(Falso(memsize=64 * GB)))
        self.assertIn("apple-silicon-32gb", c["requisitos"])
        self.assertIn("no está instalado", c["motores"]["hunyuan3d-mlx"]["motivo"])

    def test_nvidia_16gb_redondea_la_memoria_y_ve_unirig(self):
        self.instalar_lab()
        (self.raiz / "UniRig" / "launch" / "inference").mkdir(parents=True)
        (self.raiz / "UniRig" / "launch" / "inference" / "generate_skeleton.sh").write_text("")
        c = T.detectar(self.sistema(Falso(nvidia_mib=16376), plataforma="Linux", maquina="x86_64", meminfo="MemTotal: 33554432 kB\n"))
        self.assertEqual(c["requisitos"], ["cpu", "cuda-8gb", "cuda-16gb"])
        self.assertEqual(c["hierro"]["vramGB"], 16)
        self.assertTrue(c["motores"]["pixal3d"]["listo"])
        self.assertTrue(c["motores"]["unirig"]["listo"])
        self.assertFalse(c["a1"])

    def test_a1_solo_remalla(self):
        c = T.detectar(self.sistema(Falso(), plataforma="Linux", maquina="aarch64", binarios=("InstantMeshes",), meminfo="MemTotal: 25165824 kB\n"))
        self.assertTrue(c["a1"])
        self.assertTrue(c["motores"]["instant-meshes"]["listo"])
        self.assertIn("A1", c["motores"]["unirig"]["motivo"])
        self.assertIn("A1", c["motores"]["pixal3d"]["motivo"])

    def test_binario_explicito_que_no_existe_no_cuenta(self):
        s = self.sistema(Falso(memsize=8 * GB), entorno={"TALLER3D_BLENDER": "/no/existe/blender"}, binarios=("blender",))
        self.assertIsNone(T.blender_de(s))


class Gobernador(Base):
    def test_recursos_mac(self):
        r = T.recursos(self.sistema(Falso(memsize=32 * GB, presion="2", bateria=True)))
        self.assertEqual(r, {"memoria_libre_gb": 8.0, "presion": 2, "bateria": True})

    def test_recursos_linux(self):
        s = self.sistema(Falso(), plataforma="Linux", maquina="x86_64", meminfo="MemAvailable: 2097152 kB\n")
        s.glob = lambda _p: ["/sys/class/power_supply/BAT0/status"]
        leer = s.leer
        s.leer = lambda r: "Discharging\n" if r.endswith("status") else leer(r)
        self.assertEqual(T.recursos(s), {"memoria_libre_gb": 2.0, "presion": 1, "bateria": True})

    def test_reglas(self):
        bien = {"memoria_libre_gb": 20, "presion": 1, "bateria": False}
        self.assertIsNone(T.gobernador(["generar", "remallar"], bien, False))
        self.assertIn("batería", T.gobernador(["generar"], {**bien, "bateria": True}, False))
        self.assertIn("presión", T.gobernador(["riggear"], {**bien, "presion": 2}, False))
        self.assertIn("6 GB", T.gobernador(["generar"], {**bien, "memoria_libre_gb": 3}, False))
        self.assertIn("a ciegas", T.gobernador(["generar"], {**bien, "memoria_libre_gb": None}, False))
        self.assertIsNone(T.gobernador(["remallar"], {**bien, "bateria": True, "presion": 2, "memoria_libre_gb": 3}, False))
        self.assertIn("crítica", T.gobernador(["remallar"], {**bien, "presion": 4}, False))
        self.assertIn("A1", T.gobernador(["generar"], bien, True))
        self.assertIsNone(T.gobernador(["remallar"], bien, True))


class Trabajos(Base):
    def test_remallar_en_la_a1_sin_blender_deja_obj_y_su_procedencia(self):
        falso = Falso()
        s = self.sistema(falso, plataforma="Linux", maquina="aarch64", binarios=("InstantMeshes",), meminfo="MemAvailable: 8388608 kB\n")
        cod, t = T.Taller(s, sincrono=True).crear({"plan": plan(("remallar", "instant-meshes", {})), "optimizacion": {"remallado": {"caras": 10000, "modo": "organico"}},
                                                   "entrada": {"nombre": "../../mi malla.obj", "base64": b64()}})
        self.assertEqual(cod, 202)
        orden = [o for o in falso.ordenes if o[0].endswith("InstantMeshes")][0]
        self.assertEqual(orden[2:], ["-o", orden[3], "-f", "10000", "-d"])
        self.assertTrue(orden[1].endswith("/mi-malla.obj"))  # sin «../»: no sale de su carpeta
        taller = T.Taller(s, sincrono=True)
        cod, t = taller.crear({"plan": plan(("remallar", "instant-meshes", {})), "entrada": {"nombre": "m.obj", "base64": b64()}})
        t = taller.publico(t["id"])
        self.assertEqual(t["estado"], "lista")
        self.assertEqual(t["resultado"]["formato"], "obj")
        prov = json.loads((self.raiz / "trabajos" / t["id"] / "remallar.obj.provenance.json").read_text())
        self.assertEqual((prov["herramienta"], prov["etapa"], prov["ajustes"]), ("instant-meshes", "remallar", {"caras": 25000}))
        self.assertEqual(len(prov["salida_sha256"]), 64)
        self.assertEqual(t["procedencia"][0]["licencia"], "lic instant-meshes")
        self.assertTrue(taller.archivo_resultado(t["id"]).exists())

    def test_generar_y_remallar_en_mac_32gb_con_blender(self):
        self.instalar_lab()
        falso = Falso(memsize=32 * GB, sidecar={"license_classification": "commercial-restricted-region"})
        taller = T.Taller(self.sistema(falso, binarios=("blender", "InstantMeshes")), sincrono=True)
        cod, t = taller.crear({"plan": plan(("generar", "hunyuan3d-mlx", {"uso": "restringido-region", "regionesExcluidas": ["EU", "GB", "KR"]}),
                                            ("remallar", "instant-meshes", {})),
                               "entrada": {"nombre": "gato.png", "base64": b64()}})
        self.assertEqual(cod, 202, t)
        t = taller.publico(t["id"])
        self.assertEqual(t["estado"], "lista", t)
        self.assertEqual(t["resultado"]["archivo"], "remallar.glb")
        self.assertEqual([p["herramienta"] for p in t["procedencia"]], ["hunyuan3d-mlx", "instant-meshes"])
        self.assertEqual(t["procedencia"][0]["regionesExcluidas"], ["EU", "GB", "KR"])
        self.assertEqual(t["procedencia"][0]["origen"], {"license_classification": "commercial-restricted-region"})
        gen = [o for o in falso.ordenes if "hunyuan_mlx_xiong_generate.py" in " ".join(o)][0]
        self.assertTrue(gen[0].endswith("hunyuan_mlx/shape/.venv/bin/python"))
        self.assertEqual(gen[-2:], ["--model", "2.0"])
        modos = [o[o.index("--") + 1] for o in falso.ordenes if "--" in o]
        self.assertEqual(modos, ["convertir", "convertir"])  # GLB → OBJ para Instant Meshes y vuelta a GLB

    def test_riggear_con_unirig_en_tres_pasos(self):
        (self.raiz / "UniRig" / "launch" / "inference").mkdir(parents=True)
        (self.raiz / "UniRig" / "launch" / "inference" / "generate_skeleton.sh").write_text("")
        falso = Falso(nvidia_mib=8192)
        taller = T.Taller(self.sistema(falso, plataforma="Linux", maquina="x86_64", meminfo="MemAvailable: 16777216 kB\n"), sincrono=True)
        cod, t = taller.crear({"plan": plan(("riggear", "unirig", {})), "entrada": {"nombre": "x.glb", "base64": b64()}})
        self.assertEqual(taller.publico(t["id"])["estado"], "lista")
        guiones = [Path(o[1]).name for o in falso.ordenes if o[0] == "bash"]
        self.assertEqual(guiones, ["generate_skeleton.sh", "generate_skin.sh", "merge.sh"])

    def test_rechazos_con_motivo(self):
        self.instalar_lab()
        s = self.sistema(Falso(memsize=8 * GB), binarios=("blender",))
        taller = T.Taller(s, sincrono=True)
        cod, r = taller.crear({"plan": plan(("generar", "hunyuan3d-mlx", {})), "entrada": {"nombre": "a.png", "base64": b64()}})
        self.assertEqual((cod, "32 GB" in r["motivo"]), (422, True))
        cod, r = taller.crear({"plan": {"pasos": [{"etapa": "animar", "motor": {"id": "procedural"}}]}, "entrada": {}})
        self.assertEqual(cod, 422)
        cod, r = taller.crear({"plan": plan(("remallar", "smart-remesh", {})), "entrada": {}})
        self.assertIn("no ejecuta", r["motivo"])
        cod, r = taller.crear({"plan": plan(("remallar", "quadriflow-blender", {})), "entrada": {"nombre": "a.png", "base64": b64()}})
        self.assertEqual(cod, 422)
        cod, r = taller.crear({"plan": plan(("remallar", "quadriflow-blender", {})), "entrada": {"nombre": "a.glb", "base64": "no es base64!"}})
        self.assertEqual(cod, 400)
        cod, r = taller.crear("hola")
        self.assertEqual(cod, 400)

    def test_gobernador_frena_lo_pesado_con_bateria(self):
        self.instalar_lab()
        taller = T.Taller(self.sistema(Falso(memsize=32 * GB, bateria=True)), sincrono=True)
        cod, r = taller.crear({"plan": plan(("generar", "trellis2", {})), "entrada": {"nombre": "a.png", "base64": b64()}})
        self.assertEqual(cod, 503)
        self.assertIn("batería", r["motivo"])

    def test_un_fallo_del_motor_se_dice_con_su_codigo(self):
        self.instalar_lab()
        taller = T.Taller(self.sistema(Falso(memsize=32 * GB, falla="trellis_space_generate"), binarios=("blender",)), sincrono=True)
        cod, t = taller.crear({"plan": plan(("generar", "trellis2", {})), "entrada": {"nombre": "a.png", "base64": b64()}})
        t = taller.publico(t["id"])
        self.assertEqual(t["estado"], "fallida")
        self.assertIn("código 3", t["motivo"])
        self.assertIn("CUDA out of memory", t["motivo"])
        self.assertIsNone(taller.archivo_resultado(t["id"]))

    def test_tiempo_agotado(self):
        def lento(orden, **kw):
            if "--" in orden:
                raise subprocess.TimeoutExpired(orden, 1)
            return Falso(memsize=32 * GB)(orden, **kw)
        taller = T.Taller(self.sistema(lento, binarios=("blender",)), sincrono=True)
        cod, t = taller.crear({"plan": plan(("remallar", "blender-voxel", {})), "entrada": {"nombre": "a.glb", "base64": b64()}})
        self.assertIn("tiempo agotado", taller.publico(t["id"])["motivo"])


class Token(Base):
    def test_token(self):
        ruta = self.raiz / "env"
        self.assertIn("python3 taller.py token", T.leer_token(ruta)[1])
        self.assertTrue(T.crear_token(ruta))
        self.assertFalse(T.crear_token(ruta))  # no se pisa
        self.assertEqual(stat.S_IMODE(ruta.stat().st_mode), 0o600)
        token, motivo = T.leer_token(ruta)
        self.assertIsNone(motivo)
        self.assertGreaterEqual(len(token), 32)
        os.chmod(ruta, 0o644)
        self.assertIn("chmod 600", T.leer_token(ruta)[1])
        os.chmod(ruta, 0o600)
        ruta.write_text("TALLER3D_TOKEN=corto\n")
        self.assertIn("corto", T.leer_token(ruta)[1])


class Pesos(Base):
    def test_nunca_descarga_sin_si_ni_sin_espacio(self):
        self.instalar_lab()
        dichos = []
        falso = Falso(memsize=32 * GB)
        self.assertEqual(T.descargar_pesos(self.sistema(falso, disco=500), "pixal3d", False, dichos.append), 2)
        self.assertEqual(T.descargar_pesos(self.sistema(falso, disco=41), "pixal3d", True, dichos.append), 1)
        self.assertEqual(T.descargar_pesos(self.sistema(falso, disco=44), "trellis2", True, dichos.append), 1)  # 3 × 15 GB
        self.assertFalse([o for o in falso.ordenes if "bootstrap" in " ".join(o)])
        self.assertIn("No hay espacio suficiente", " ".join(dichos))
        self.assertEqual(T.descargar_pesos(self.sistema(falso, disco=42), "pixal3d", True, dichos.append), 0)
        self.assertEqual([o for o in falso.ordenes if "bootstrap" in " ".join(o)][0][1], "scripts/bootstrap_pixal3d.py")
        self.assertEqual(T.descargar_pesos(self.sistema(falso), "meshy", True, dichos.append), 2)

    def test_sin_lab_no_hay_nada_que_descargar(self):
        self.assertEqual(T.descargar_pesos(self.sistema(Falso(memsize=32 * GB)), "pixal3d", True, lambda _t: None), 1)


class Http(Base):
    def setUp(self):
        super().setUp()
        s = self.sistema(Falso(), plataforma="Linux", maquina="aarch64", binarios=("InstantMeshes",), meminfo="MemAvailable: 8388608 kB\n")
        self.token = "t" * 40
        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), T.BaseHTTPRequestHandler)
        self.puerto = self.srv.server_address[1]
        self.srv.RequestHandlerClass = T.crear_manejador(T.Taller(s, sincrono=True), self.token, self.puerto, ["http://localhost:9002"])
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.addCleanup(self.srv.server_close)
        self.addCleanup(self.srv.shutdown)

    def pedir(self, metodo, ruta, cuerpo=None, token=True, host=None, cab=None):
        c = http.client.HTTPConnection("127.0.0.1", self.puerto, timeout=10)
        h = {"Host": host or f"127.0.0.1:{self.puerto}", **(cab or {})}
        if token:
            h["Authorization"] = f"Bearer {self.token}"
        datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
        if datos:
            h["Content-Type"] = "application/json"
        c.request(metodo, ruta, body=datos, headers=h)
        r = c.getresponse()
        cuerpo = r.read()
        c.close()
        return r, cuerpo

    def test_rutas(self):
        r, b = self.pedir("GET", "/salud", token=False)
        self.assertEqual((r.status, json.loads(b)["ok"]), (200, True))
        r, _ = self.pedir("GET", "/capacidades", token=False)
        self.assertEqual(r.status, 401)
        r, _ = self.pedir("GET", "/capacidades", host="ataque.example:80")
        self.assertEqual(r.status, 421)
        r, b = self.pedir("GET", "/capacidades")
        c = json.loads(b)
        self.assertEqual((r.status, c["a1"]), (200, True))
        self.assertIn("recursos", c)
        self.assertNotIn(self.token, b.decode())
        r, b = self.pedir("POST", "/trabajos", {"plan": plan(("remallar", "instant-meshes", {})), "entrada": {"nombre": "m.obj", "base64": b64()}})
        self.assertEqual(r.status, 202)
        tid = json.loads(b)["id"]
        r, b = self.pedir("GET", f"/trabajos/{tid}")
        self.assertEqual(json.loads(b)["estado"], "lista")
        r, b = self.pedir("GET", f"/trabajos/{tid}/resultado")
        self.assertEqual((r.status, b), (200, b"glTF-simulado"))
        r, _ = self.pedir("GET", "/trabajos/" + "0" * 32)
        self.assertEqual(r.status, 404)
        r, _ = self.pedir("GET", "/trabajos/../env")
        self.assertEqual(r.status, 404)

    def test_cors_solo_para_el_os(self):
        r, _ = self.pedir("OPTIONS", "/trabajos", token=False, cab={"Origin": "http://localhost:9002"})
        self.assertEqual((r.status, r.getheader("Access-Control-Allow-Origin")), (204, "http://localhost:9002"))
        self.assertIsNone(r.getheader("Access-Control-Allow-Credentials"))
        r, _ = self.pedir("OPTIONS", "/trabajos", token=False, cab={"Origin": "https://otra.web"})
        self.assertIsNone(r.getheader("Access-Control-Allow-Origin"))


if __name__ == "__main__":
    unittest.main()
