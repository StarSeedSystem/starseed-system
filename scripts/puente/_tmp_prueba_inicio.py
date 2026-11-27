import tempfile
import shutil
from pathlib import Path
from datetime import datetime, timedelta, timezone
import abrir_inicio_sesion as a

h = Path(tempfile.mkdtemp())
msgs, abiertos, vig = [], [], []
t0 = datetime(2026, 11, 27, tzinfo=timezone.utc)
shutil.which = lambda n: "/usr/bin/" + n


def env(m):
    msgs.append(m)
    return {"ok": True}


def abr(g):
    abiertos.append(g)
    return True


kw = dict(home=h, plataforma="darwin", entorno={}, enviar_fn=env, abrir_fn=abr,
          vigia_fn=lambda *x: vig.append(x))
print(a.iniciar("claude", "x", ahora_fn=lambda: t0, **kw))
g = abiertos[0]
print(g.name, oct(g.stat().st_mode & 0o777))
print(g.read_text())
print(a.iniciar("claude", "x", ahora_fn=lambda: t0 + timedelta(hours=5), **kw)["via"], len(abiertos))
print(a.iniciar("claude", "x", ahora_fn=lambda: t0 + timedelta(hours=7), **kw)["via"], len(abiertos))
msgs.clear()
print(a.iniciar("gh", "x", ahora_fn=lambda: t0, **{**kw, "plataforma": "linux"}), msgs)
g5, _ = a.generar_guion("higgsfield-clave", h / "s", "darwin", h)
print(g5.read_text())
e = h / "est"
e.write_text("ok")
m = []
print(a.vigilar("gh", e, comprobar_fn=lambda c: True, enviar_fn=lambda s: m.append(s) or {}, dormir=lambda s: None), m)
print(a.vigilar("gh", h / "no", comprobar_fn=lambda c: True, enviar_fn=lambda s: m.append(s) or {},
                espera_s=20, sondeo_s=10, dormir=lambda s: None))
print(a.iniciar("zzz"))
print("vigias", len(vig))
