import fs from 'fs';
const html = fs.readFileSync('public/inject.html', 'utf8');
let v = html.replace("location.href = '/escritorios';", "location.href = 'https://starseed-os.vercel.app/escritorios';");
const cap = `window.__diag=[];const oe=console.error;console.error=function(){try{window.__diag.push(Array.from(arguments).map(a=>{try{return (a&&a.stack)||a.message||String(a)}catch{return String(a)}}).join(' ').slice(0,300));}catch(_){}return oe.apply(console,arguments);};window.addEventListener("error",function(e){try{window.__diag.push('ERR:'+((e.error&&e.error.stack)||e.message||'unknown'));}catch(_){}});window.addEventListener("unhandledrejection",function(e){try{window.__diag.push('REJ:'+((e.reason&&e.reason.stack)||String(e.reason)));}catch(_){}});`;
v = v.replace('<script>', '<script>\n' + cap);
fs.writeFileSync('public/inject-vercel.html', v);
console.log('inject-vercel.html creado con captura console.error/error/rejection');
