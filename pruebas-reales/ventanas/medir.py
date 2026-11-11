import json, sys, os
from playwright.sync_api import sync_playwright
BASE=os.environ.get("VEN_BASE","/home/claude/ven1111d")
SIZES=[(320,568),(360,640),(390,844),(640,360),(768,1024)]
WINS=["dialog-largo","dialog-corto","alert-dialog","sheet-bottom","sheet-top","sheet-right","popover","dropdown","select","tabs","mano","permisos"]
MODES=["standard","primary"]
JS = """
() => {
  const vw=innerWidth, vh=innerHeight, r=[];
  const q=(s)=>document.querySelector(s);
  const win = q('[role=alertdialog]')||q('[role=dialog]')||q('[role=menu]')||q('[role=listbox]')||q('[role=tablist]')||q('[data-radix-popper-content-wrapper]');
  if(!win) return {err:'sin ventana'};
  let box = win.closest('[data-radix-popper-content-wrapper]')||win;
  const b=box.getBoundingClientRect();
  const fuera=[]; if(b.top<-1)fuera.push('arriba '+Math.round(-b.top)); if(b.left<-1)fuera.push('izq '+Math.round(-b.left));
  if(b.bottom>vh+1)fuera.push('abajo '+Math.round(b.bottom-vh)); if(b.right>vw+1)fuera.push('der '+Math.round(b.right-vw));
  // acciones
  const sel='[data-accion],button,[role=menuitem],[role=option],[role=tab],input';
  let acts=[...win.querySelectorAll(sel)].filter(e=>!e.disabled && e.getClientRects().length);
  const inalc=[];
  for(const a of acts){
    a.scrollIntoView({block:'nearest',inline:'nearest'});
    const x=a.getBoundingClientRect(); const cx=x.left+x.width/2, cy=x.top+x.height/2;
    const dentro = x.left>=-1 && x.right<=vw+1 && x.top>=-1 && x.bottom<=vh+1;
    const el=document.elementFromPoint(Math.min(Math.max(cx,0),vw-1),Math.min(Math.max(cy,0),vh-1));
    const ok = dentro && el && (a===el||a.contains(el)||el.contains(a));
    if(!ok) inalc.push((a.textContent||a.placeholder||a.tagName).trim().slice(0,24));
  }
  // texto recortado
  const rec=[];
  for(const e of win.querySelectorAll('*')){
    const cs=getComputedStyle(e);
    if((cs.overflowX==='hidden'||cs.overflowX==='clip')&&e.scrollWidth>e.clientWidth+1&&e.clientWidth>0&&e.children.length+ (e.textContent||'').trim().length>0) rec.push((e.tagName+'.'+String(e.className).slice(0,30)));
  }
  const hs = win.scrollWidth>win.clientWidth+1 && getComputedStyle(win).overflowX!=='auto' && getComputedStyle(win).overflowX!=='scroll';
  win.scrollTop=0;
  return {fuera, inalc, rec:rec.slice(0,4), hscroll:hs, rect:[Math.round(b.left),Math.round(b.top),Math.round(b.width),Math.round(b.height)]};
}
"""
res=[]
with sync_playwright() as p:
    br=p.chromium.launch()
    for v in ["antes","despues"]:
        for w in WINS:
            for m in MODES:
                for (W,H) in SIZES:
                    pg=br.new_page(viewport={'width':W,'height':H}, device_scale_factor=1)
                    pg.goto(f"file://{BASE}/out/{v}/index.html?w={w}&mode={m}")
                    pg.wait_for_timeout(900)
                    if w=="permisos":
                        pass
                    try: r=pg.evaluate(JS)
                    except Exception as e: r={'err':str(e)[:80]}
                    os.makedirs(f"{BASE}/out/cap/{v}",exist_ok=True)
                    pg.evaluate("()=>{document.querySelectorAll('*').forEach(e=>{})}")
                    pg.screenshot(path=f"{BASE}/out/cap/{v}/{w}-{m}-{W}x{H}.png")
                    bad = bool(r.get('err')) or bool(r.get('fuera')) or bool(r.get('inalc')) or bool(r.get('rec')) or r.get('hscroll')
                    res.append(dict(v=v,w=w,m=m,size=f"{W}x{H}",bad=bad,**r))
                    pg.close()
    br.close()
json.dump(res,open(f"{BASE}/out/resultados.json","w"),ensure_ascii=False,indent=1)
for v in ["antes","despues"]:
    print("==",v)
    for w in WINS:
        row=[]
        for (W,H) in SIZES:
            rs=[x for x in res if x['v']==v and x['w']==w and x['size']==f"{W}x{H}"]
            row.append(f"{W}x{H}:{sum(x['bad'] for x in rs)}/{len(rs)}")
        print(f"{w:14}", "  ".join(row))
