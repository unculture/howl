import { app, BrowserWindow, ipcMain, net, protocol, screen, session } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_ORIGIN = 'howl://app';
const devUrl = process.env['ELECTRON_RENDERER_URL'];

app.setName('howl');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

protocol.registerSchemesAsPrivileged([
  { scheme: 'howl', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } }
]);

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function resolveAsset(pathname: string): string | null {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '');
  const inModels = clean.startsWith(`models${sep}`);
  const root = inModels
    ? join(app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources'), 'models')
    : join(__dirname, '../renderer');
  const file = join(root, inModels ? clean.slice('models'.length + 1) : clean || 'index.html');
  return file.startsWith(root) ? file : null;
}

function registerAppProtocol(): void {
  protocol.handle('howl', async (request) => {
    const file = resolveAsset(new URL(request.url).pathname);
    if (!file || !existsSync(file)) return new Response('Not found', { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    return new Response(res.body, {
      status: res.status,
      headers: {
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'same-origin'
      }
    });
  });
}

function lockDownSession(): void {
  const ses = session.defaultSession;
  // No network at runtime: anything that is not the app itself (or the dev server) is refused.
  ses.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url;
    const allowed =
      url.startsWith('howl:') || url.startsWith('file:') || url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('devtools:') ||
      (devUrl !== undefined && (url.startsWith('http://localhost') || url.startsWith('ws://localhost')));
    if (!allowed) console.warn(`Blocked network request: ${url}`);
    callback({ cancel: !allowed });
  });
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'media'));
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'media');
}

interface Bounds { x?: number; y?: number; width: number; height: number; }
const boundsFile = () => join(app.getPath('userData'), 'window.json');

function loadBounds(): Bounds {
  const area = screen.getPrimaryDisplay().workAreaSize;
  let saved: Bounds = { width: 1280, height: 800 };
  try {
    saved = JSON.parse(readFileSync(boundsFile(), 'utf8')) as Bounds;
  } catch {
    // First run: use the default size.
  }
  return { ...saved, width: Math.min(saved.width, area.width), height: Math.min(saved.height, area.height) };
}

function createWindow(): void {
  const area = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    ...loadBounds(),
    // A small or high-scale touch screen can have less than the 700px minimum available.
    minWidth: Math.min(1024, area.width),
    minHeight: Math.min(700, area.height),
    title: 'howl',
    backgroundColor: '#07090D',
    show: false,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const }
      : { titleBarStyle: 'hidden' as const, titleBarOverlay: { color: '#07090D', symbolColor: '#B9BFC9', height: 40 } }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });
  win.setMenuBarVisibility(false);
  win.webContents.setVisualZoomLevelLimits(1, 1);
  win.once('ready-to-show', () => win.show());
  win.on('close', () => {
    try {
      writeFileSync(boundsFile(), JSON.stringify(win.getNormalBounds()));
    } catch {
      // Remembering the window size is a nicety; never block quitting on it.
    }
  });
  void win.loadURL(devUrl ?? `${APP_ORIGIN}/index.html`);
}

ipcMain.on('system:version', (event) => {
  event.returnValue = app.getVersion();
});

void app.whenReady().then(() => {
  registerAppProtocol();
  lockDownSession();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
