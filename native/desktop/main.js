// やすみタイム デスクトップ版（Windows / Mac）
// ・アプリ本体(app/)を自分のパソコンの中だけで配信して表示します（ブラウザは使いません）
// ・休憩ロック中は、全画面・最前面で表示し、閉じられないようにします
// ・Googleログインは、ふつうのブラウザで行い、結果をこのアプリに受け取ります
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const BASE_PORT = 47831;
const ROOT = path.join(__dirname, 'app');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css; charset=utf-8', '.ico': 'image/x-icon' };

let win = null, port = BASE_PORT, server = null;
let locked = false, busy = false, sessionEnding = false, guardTimer = null, rendererReady = false, pendingToken = null;

const CALLBACK_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>やすみタイム</title>
<body style="font-family:sans-serif;text-align:center;padding:60px 20px;color:#22304a"><h2>⏱️ やすみタイム</h2><p id="m">ログイン情報を受け取っています…</p>
<script>
(function(){var h=new URLSearchParams(location.hash.slice(1));var id=h.get('id'),at=h.get('at')||'';
if(!id){document.getElementById('m').textContent='ログイン情報が見つかりませんでした。アプリからやり直してください。';return;}
fetch('/auth-token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:id,at:at})})
.then(function(r){document.getElementById('m').textContent=r.ok?'ログインできました。このページを閉じて、アプリにもどってください。':'うまくいきませんでした。アプリからやり直してください。';history.replaceState(null,'',location.pathname);})
.catch(function(){document.getElementById('m').textContent='アプリに届きませんでした。アプリを開いたままやり直してください。';});})();
</script></body>`;

function deliverToken(t) {
  if (win && rendererReady) { win.webContents.send('auth-token', t); win.show(); win.focus(); }
  else pendingToken = t;
}

function handler(req, res) {
  try {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && u.pathname === '/auth-callback') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(CALLBACK_HTML);
    }
    if (req.method === 'POST' && u.pathname === '/auth-token') {
      let body = ''; req.on('data', d => { body += d; if (body.length > 20000) req.destroy(); });
      req.on('end', () => {
        try { const t = JSON.parse(body); if (!t.id) throw new Error('no id'); deliverToken({ id: String(t.id), at: String(t.at || '') }); res.writeHead(200); res.end('ok'); }
        catch (e) { res.writeHead(400); res.end('bad'); }
      });
      return;
    }
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    const f = path.normalize(path.join(ROOT, p));
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(data);
    });
  } catch (e) { res.writeHead(500); res.end(); }
}

function startServer() {
  return new Promise(resolve => {
    server = http.createServer(handler);
    let tries = 0;
    const listen = p => {
      server.once('error', e => { if (e.code === 'EADDRINUSE' && tries++ < 20) listen(p + 1); else resolve(false); });
      server.listen(p, '127.0.0.1', () => { port = p; resolve(true); });
    };
    listen(BASE_PORT);
  });
}

/* ---- 画面の電源を切る（ロック中だけ。マウスを動かすと点くが、ロック画面は残る） ---- */
function displayOff() {
  try {
    if (process.platform === 'win32') {
      const ps = "Add-Type -Name N -Namespace W -MemberDefinition '[DllImport(\"user32.dll\")] public static extern int SendMessage(int hWnd,int hMsg,int wParam,int lParam);'; [W.N]::SendMessage(-1,0x0112,0xF170,2)";
      exec('powershell -NoProfile -WindowStyle Hidden -EncodedCommand ' + Buffer.from(ps, 'utf16le').toString('base64'), () => {});
    } else if (process.platform === 'darwin') exec('pmset displaysleepnow', () => {});
  } catch (e) {}
}

function startGuard() {
  stopGuard();
  guardTimer = setInterval(() => {
    if (!win || !locked) return;
    try {
      if (win.isMinimized()) win.restore();
      win.setAlwaysOnTop(true, 'screen-saver');
      if (!win.isFullScreen()) win.setFullScreen(true);
      if (!win.isFocused()) { win.show(); win.focus(); }
      win.moveTop();
    } catch (e) {}
  }, 800);
}
function stopGuard() { if (guardTimer) { clearInterval(guardTimer); guardTimer = null; } }

function applyLock(on, opts) {
  if (!win) return;
  if (on === locked) return;
  locked = on;
  if (on) {
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setFullScreen(true);
    try { win.setKiosk(true); } catch (e) {}
    win.show(); win.focus();
    startGuard();
    if (opts && opts.displayOff) setTimeout(displayOff, 1500);
  } else {
    stopGuard();
    try { win.setKiosk(false); } catch (e) {}
    win.setFullScreen(false);
    win.setAlwaysOnTop(false);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1040, height: 820, minWidth: 380, minHeight: 600, show: false,
    title: 'やすみタイム', backgroundColor: '#f2f6fd', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: !app.isPackaged }
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL(`http://127.0.0.1:${port}/index.html`);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(`http://127.0.0.1:${port}/`)) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  win.on('minimize', e => { if (locked) { e.preventDefault(); win.restore(); } });
  win.on('close', e => {
    if (sessionEnding) return;
    if (locked) { e.preventDefault(); return; }
    if (busy) { e.preventDefault(); win.minimize(); }       // タイマー動作中は、閉じても終了しない
  });
  win.on('session-end', () => { sessionEnding = true; });
  win.on('closed', () => { win = null; rendererReady = false; });
}

ipcMain.on('get-port', e => { e.returnValue = port; });
ipcMain.on('renderer-ready', () => { rendererReady = true; if (pendingToken) { const t = pendingToken; pendingToken = null; deliverToken(t); } });
ipcMain.on('lock', (_e, on, opts) => applyLock(!!on, opts || {}));
ipcMain.on('busy', (_e, b) => { busy = !!b; });
ipcMain.on('open-external', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  app.on('before-quit', e => { if ((locked || busy) && !sessionEnding) e.preventDefault(); });
  app.on('window-all-closed', () => { if (!locked && !busy) app.quit(); });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    await startServer();
    if (app.isPackaged) { try { app.setLoginItemSettings({ openAtLogin: true }); } catch (e) {} }  // ログイン時に自動で起動
    createWindow();
    app.on('activate', () => { if (!win) createWindow(); });
  });
}
