// 画面（index.html）から使える「アプリ専用の機能」だけを、安全な形で公開します。
const { contextBridge, ipcRenderer } = require('electron');
const port = ipcRenderer.sendSync('get-port');
contextBridge.exposeInMainWorld('YasumiNative', {
  platform: process.platform,
  redirectUri: `http://127.0.0.1:${port}/auth-callback`,
  setLock: (on, opts) => ipcRenderer.send('lock', !!on, opts && typeof opts === 'object' ? { displayOff: !!opts.displayOff } : {}),
  setBusy: b => ipcRenderer.send('busy', !!b),
  openExternal: url => ipcRenderer.send('open-external', String(url)),
  onAuthToken: cb => { ipcRenderer.on('auth-token', (_e, t) => { try { cb(t); } catch (e) {} }); ipcRenderer.send('renderer-ready'); }
});
