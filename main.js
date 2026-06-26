const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { execSync, exec } = require('child_process');
const DiscordRPC = require('discord-rpc');

// ===== Discord Rich Presence =====
const DISCORD_CLIENT_ID = '1519435174729875537';
DiscordRPC.register(DISCORD_CLIENT_ID);
const rpc = new DiscordRPC.Client({ transport: 'ipc' });

function setDiscordPresence() {
  rpc.setActivity({
    details: 'Organizing their library',
    state: 'Using Shok',
    startTimestamp: new Date(),
    largeImageKey: 'shok_logo',
    largeImageText: 'Shok App Launcher',
    instance: false,
  }).catch(() => {});
}

rpc.on('ready', setDiscordPresence);

app.on('will-quit', () => {
  rpc.destroy().catch(() => {});
});

rpc.login({ clientId: DISCORD_CLIENT_ID }).catch(() => {});

// ===== Auto-updater =====
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('update-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('update-available', info.version);
});
autoUpdater.on('update-downloaded', () => {
  if (mainWindow) mainWindow.webContents.send('update-downloaded');
});
autoUpdater.on('error', (err) => {
  console.error('Auto-updater error:', err.message);
});

function netlifyValidate(licenseKey, email) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ key: licenseKey, email });
    const req = https.request({
      hostname: 'getshokapp.com',
      port: 443,
      path: '/.netlify/functions/validate-key',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve({ valid: false }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timed out')); });
    req.write(data);
    req.end();
  });
}

let store;
let mainWindow;
let flushingForQuit = false;

async function initStore() {
  const { default: Store } = await import('electron-store');
  store = new Store();

  // One-time migration: copy data from the old "Game Launcher" userData directory
  const newPath = path.join(app.getPath('userData'), 'config.json');
  const oldPath = path.join(app.getPath('appData'), 'Game Launcher', 'config.json');
  if (!fs.existsSync(newPath) && fs.existsSync(oldPath)) {
    try {
      fs.copyFileSync(oldPath, newPath);
      store.store = JSON.parse(fs.readFileSync(newPath, 'utf8'));
    } catch (e) {
      console.error('Data migration failed:', e.message);
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    icon: path.join(__dirname, 'GameLaucher.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#1a1a2e',
    show: false
  });

  mainWindow.loadFile('renderer/index.html');
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    startProcessWatcher();
    if (app.isPackaged) {
      setTimeout(() => autoUpdater.checkForUpdates(), 3000);
    }
  });

  mainWindow.on('close', (event) => {
    if (!flushingForQuit) {
      event.preventDefault();
      flushingForQuit = true;
      mainWindow.webContents.send('app-before-quit');
      setTimeout(() => mainWindow.close(), 1500);
    }
  });
}

ipcMain.on('renderer-quit-ready', () => {
  mainWindow.close();
});

ipcMain.handle('install-update', () => autoUpdater.quitAndInstall());

app.whenReady().then(async () => {
  await initStore();
  if (!store.get('bootDefaultApplied')) {
    app.setLoginItemSettings({ openAtLogin: true });
    store.set('bootDefaultApplied', true);
  }
  createWindow();
  if (!store.get('installTracked')) {
    store.set('installTracked', true);
    const { version } = require('./package.json');
    const data = JSON.stringify({ version });
    const req = https.request({
      hostname: 'getshokapp.com',
      port: 443,
      path: '/.netlify/functions/track-install',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    });
    req.on('error', () => {});
    req.write(data);
    req.end();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Window controls
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.close());

// Pick folder
ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

// Open folder in Explorer
ipcMain.handle('open-folder', (event, folderPath) => shell.openPath(folderPath));

// Scan folder — returns shortcuts immediately; icons fetched separately
ipcMain.handle('scan-folder', async (event, folderPath) => {
  if (!folderPath || !fs.existsSync(folderPath)) return [];
  try {
    return await scanForShortcuts(folderPath);
  } catch (e) {
    console.error('Scan error:', e);
    return [];
  }
});

// Batch icon extraction — ONE PowerShell process for all paths
ipcMain.handle('get-icons-batch', async (event, iconPaths) => {
  if (!iconPaths || iconPaths.length === 0) return {};

  const validPaths = iconPaths.filter(p => p && fs.existsSync(p));
  if (validPaths.length === 0) return {};

  const tmpId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const pathsFile = path.join(os.tmpdir(), `gl_paths_${tmpId}.txt`);
  const scriptFile = path.join(os.tmpdir(), `gl_icons_${tmpId}.ps1`);

  const script = `
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class JumboIcon {
    private const uint SHGFI_SYSICONINDEX = 0x4000;
    private const int SHIL_JUMBO = 0x4;
    private const int ILD_TRANSPARENT = 1;

    [StructLayout(LayoutKind.Sequential)]
    private struct SHFILEINFO {
        public IntPtr hIcon;
        public int iIcon;
        public uint dwAttributes;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szDisplayName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]
        public string szTypeName;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr SHGetFileInfo(string pszPath, uint dwFileAttributes, ref SHFILEINFO psfi, uint cbFileInfo, uint uFlags);

    [DllImport("shell32.dll")]
    private static extern int SHGetImageList(int iImageList, ref Guid riid, out IImageList ppv);

    [ComImport]
    [Guid("46EB5926-582E-4017-9FDF-E8998DAA0950")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IImageList {
        [PreserveSig] int Add(IntPtr hbmImage, IntPtr hbmMask, ref int pi);
        [PreserveSig] int ReplaceIcon(int i, IntPtr hicon, ref int pi);
        [PreserveSig] int SetOverlayImage(int iImage, int iOverlay);
        [PreserveSig] int Replace(int i, IntPtr hbmImage, IntPtr hbmMask);
        [PreserveSig] int AddMasked(IntPtr hbmImage, int crMask, ref int pi);
        [PreserveSig] int Draw(IntPtr pimldp);
        [PreserveSig] int Remove(int i);
        [PreserveSig] int GetIcon(int i, int flags, out IntPtr picon);
    }

    public static Bitmap Get(string path) {
        SHFILEINFO shfi = new SHFILEINFO();
        SHGetFileInfo(path, 0, ref shfi, (uint)Marshal.SizeOf(typeof(SHFILEINFO)), SHGFI_SYSICONINDEX);
        Guid iid = new Guid("46EB5926-582E-4017-9FDF-E8998DAA0950");
        IImageList iml;
        SHGetImageList(SHIL_JUMBO, ref iid, out iml);
        if (iml == null) return null;
        IntPtr hIcon;
        iml.GetIcon(shfi.iIcon, ILD_TRANSPARENT, out hIcon);
        if (hIcon == IntPtr.Zero) return null;
        using (Icon icon = Icon.FromHandle(hIcon)) {
            Bitmap bmp = icon.ToBitmap();
            return Trim(bmp);
        }
    }

    private static Bitmap Trim(Bitmap source) {
        int width = source.Width, height = source.Height;
        BitmapData data = source.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        int stride = data.Stride;
        byte[] buffer = new byte[stride * height];
        Marshal.Copy(data.Scan0, buffer, 0, buffer.Length);
        source.UnlockBits(data);

        int minX = width, minY = height, maxX = -1, maxY = -1;
        for (int y = 0; y < height; y++) {
            int rowOffset = y * stride;
            for (int x = 0; x < width; x++) {
                byte a = buffer[rowOffset + x * 4 + 3];
                if (a > 10) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < 0) return source;
        Rectangle rect = new Rectangle(minX, minY, maxX - minX + 1, maxY - minY + 1);
        return source.Clone(rect, source.PixelFormat);
    }
}
"@
$paths = Get-Content -LiteralPath '${pathsFile.replace(/'/g, "''")}' -Encoding UTF8
$out = [ordered]@{}
foreach ($p in $paths) {
  $p = $p.Trim()
  if (-not $p -or -not (Test-Path -LiteralPath $p)) { $out[$p] = ''; continue }
  try {
    $bmp = $null
    try { $bmp = [JumboIcon]::Get($p) } catch {}
    if (-not $bmp) {
      $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($p)
      $bmp = $icon.ToBitmap()
    }
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $out[$p] = [Convert]::ToBase64String($ms.ToArray())
    $ms.Dispose(); $bmp.Dispose()
  } catch { $out[$p] = '' }
}
$out | ConvertTo-Json -Compress -Depth 1
`.trim();

  fs.writeFileSync(pathsFile, validPaths.join('\n'), 'utf8');
  fs.writeFileSync(scriptFile, script, 'utf8');

  let result = {};
  try {
    const output = execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptFile}"`,
      { timeout: 30000, encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 }
    ).trim();
    if (output) {
      const raw = JSON.parse(output);
      for (const [p, b64] of Object.entries(raw)) {
        if (b64) result[p] = `data:image/png;base64,${b64}`;
      }
    }
  } catch (e) {
    console.error('Batch icon error:', e.message);
  } finally {
    try { fs.unlinkSync(pathsFile); } catch (_) {}
    try { fs.unlinkSync(scriptFile); } catch (_) {}
  }
  return result;
});

// Pick an image file and return as base64 data URL
ipcMain.handle('pick-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg','jpeg','png','gif','webp','bmp','ico'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  try {
    const filePath = result.filePaths[0];
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mimes = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp', bmp:'image/bmp', ico:'image/x-icon' };
    return `data:${mimes[ext] || 'image/png'};base64,${data.toString('base64')}`;
  } catch (e) { return null; }
});

// Launch a shortcut — handle steam://, shell: (Store apps), and regular paths
ipcMain.handle('launch-shortcut', (event, shortcutPath) => {
  if (shortcutPath.startsWith('steam://')) shell.openExternal(shortcutPath);
  else if (shortcutPath.startsWith('shell:')) exec(`explorer "${shortcutPath}"`, { windowsHide: true });
  else shell.openPath(shortcutPath);
  return true;
});

// Write a .url file to the shortcuts folder for a web shortcut
ipcMain.handle('create-web-shortcut', async (event, { name, url, folderPath }) => {
  if (!folderPath || !fs.existsSync(folderPath)) return { error: 'No folder selected' };
  const safeName = name.replace(/[<>:"/\\|?*\r\n]/g, '_').trim() || 'Web Shortcut';
  const destPath = path.join(folderPath, `${safeName}.url`);
  const content  = `[InternetShortcut]\r\nURL=${url}\r\n`;
  try {
    fs.writeFileSync(destPath, content, 'utf8');
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
});

// ===== Steam Integration =====

// Fetch owned games from Steam Web API
ipcMain.handle('steam-sync', async (event, { apiKey, steamId }) => {
  return new Promise((resolve, reject) => {
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(apiKey)}&steamid=${encodeURIComponent(steamId)}&include_appinfo=1&include_played_free_games=1&format=json`;
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data).response || {}); }
        catch { reject(new Error('Invalid response from Steam API')); }
      });
    });
    req.on('error', e => reject(e));
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timed out')); });
  });
});

// Scan steamapps folders to find installed app IDs
ipcMain.handle('get-steam-installed', async () => {
  const installed = new Set();
  let steamPath = null;

  try {
    const reg = execSync('reg query "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v InstallPath', { encoding: 'utf8', timeout: 5000 });
    const m = reg.match(/InstallPath\s+REG_SZ\s+(.+)/);
    if (m) steamPath = m[1].trim();
  } catch {}

  if (!steamPath) {
    for (const p of ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam']) {
      if (fs.existsSync(p)) { steamPath = p; break; }
    }
  }
  if (!steamPath) return [];

  const libraryPaths = [steamPath];
  try {
    const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
    if (fs.existsSync(vdfPath)) {
      const vdf = fs.readFileSync(vdfPath, 'utf8');
      // New format: "path" "D:\\SteamLibrary"
      for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/gi)) {
        const p = m[1].replace(/\\\\/g, '\\');
        if (!libraryPaths.includes(p)) libraryPaths.push(p);
      }
      // Old format: "1" "D:\\SteamLibrary"
      for (const m of vdf.matchAll(/"(\d+)"\s+"([A-Za-z]:[^"]+)"/g)) {
        const p = m[2].replace(/\\\\/g, '\\');
        if (!libraryPaths.includes(p)) libraryPaths.push(p);
      }
    }
  } catch {}

  for (const libPath of libraryPaths) {
    const dir = path.join(libPath, 'steamapps');
    try {
      for (const file of fs.readdirSync(dir)) {
        if (file.startsWith('appmanifest_') && file.endsWith('.acf')) {
          const id = parseInt(file.slice(12, -4));
          if (!isNaN(id)) installed.add(id);
        }
      }
    } catch {}
  }

  return [...installed];
});

// ===== Process Watcher =====

let gameExeMap = {}; // exeNameLower → scId[]

ipcMain.handle('register-game-exes', (event, map) => { gameExeMap = map; });

function startProcessWatcher() {
  setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (Object.keys(gameExeMap).length === 0) return;
    try {
      const output = execSync('tasklist /FO CSV /NH', { timeout: 5000, encoding: 'utf8', windowsHide: true });
      const runningExes = output.trim().split('\n').map(line => {
        const end = line.indexOf('"', 1);
        return end > 1 ? line.slice(1, end).toLowerCase() : null;
      }).filter(Boolean);
      mainWindow.webContents.send('process-snapshot', runningExes);
    } catch {}
  }, 8000);
}

// Store operations
ipcMain.handle('store-get', (event, key) => store.get(key));
ipcMain.handle('store-set', (event, key, value) => { store.set(key, value); });
ipcMain.handle('store-delete', (event, key) => { store.delete(key); });

// License
ipcMain.handle('get-machine-id', async () => {
  let machineId = store.get('machineId');
  if (!machineId) {
    const { randomUUID } = require('crypto');
    machineId = randomUUID();
    store.set('machineId', machineId);
  }
  return machineId;
});

ipcMain.handle('validate-license', async (event, { key, email }) => {
  try {
    return await netlifyValidate(key, email);
  } catch (e) {
    return { valid: false, error: e.message };
  }
});

ipcMain.handle('activate-license', async (event, { licenseKey, email }) => {
  try {
    const result = await netlifyValidate(licenseKey, email);
    return { activated: result.valid, error: result.error };
  } catch (e) {
    return { activated: false, error: e.message };
  }
});

// Launch on boot
ipcMain.handle('get-launch-on-boot', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('set-launch-on-boot', (event, enable) => {
  app.setLoginItemSettings({ openAtLogin: !!enable });
});

// System stats
ipcMain.handle('get-system-stats', () => {
  const ramTotal = os.totalmem();
  const ramUsed  = ramTotal - os.freemem();
  const cpus     = os.cpus();
  const cpuName  = cpus[0]?.model?.replace(/\s+/g, ' ').trim() || '';
  const cpuCores = cpus.length;

  let cpuPct = 0;
  try {
    const out = execSync('wmic cpu get loadpercentage /value', { timeout: 3000, encoding: 'utf8', windowsHide: true });
    const m = out.match(/LoadPercentage=(\d+)/);
    if (m) cpuPct = parseInt(m[1]);
  } catch {}

  // CPU temperature via WMI thermal zones (tenths of Kelvin → Celsius)
  let cpuTemp = null;
  try {
    const out = execSync(
      'wmic /namespace:\\\\root\\wmi PATH MSAcpi_ThermalZoneTemperature get CurrentTemperature /value',
      { timeout: 3000, encoding: 'utf8', windowsHide: true }
    );
    const matches = [...out.matchAll(/CurrentTemperature=(\d+)/g)];
    if (matches.length > 0) {
      const valid = matches
        .map(m => Math.round(parseInt(m[1]) / 10 - 273.15))
        .filter(t => t > 0 && t < 120);
      if (valid.length > 0) cpuTemp = Math.max(...valid);
    }
  } catch {}

  let gpuName = '', gpuUtil = null, gpuVram = null, gpuVramUsed = null, gpuTemp = null;

  // NVIDIA path — nvidia-smi gives utilization + VRAM + temperature
  try {
    const out = execSync(
      'nvidia-smi --query-gpu=name,utilization.gpu,memory.total,memory.used,temperature.gpu --format=csv,noheader,nounits',
      { timeout: 3000, encoding: 'utf8', windowsHide: true }
    );
    const [name, util, vramMb, usedMb, temp] = out.trim().split(',').map(s => s.trim());
    gpuName     = name;
    gpuUtil     = parseInt(util)   || 0;
    gpuVram     = parseInt(vramMb) * 1024 * 1024;
    gpuVramUsed = parseInt(usedMb) * 1024 * 1024;
    const t = parseInt(temp);
    if (!isNaN(t) && t > 0) gpuTemp = t;
  } catch {}

  // AMD / Intel fallback — CIM + GPU Engine counter + thermal counter
  if (!gpuName) {
    const scriptFile = path.join(os.tmpdir(), `gl_gpu_${Date.now()}.ps1`);
    const script = `
$vc   = Get-CimInstance -ClassName Win32_VideoController | Sort-Object AdapterRAM -Descending | Select-Object -First 1
$vram = $vc.AdapterRAM
$util = -1
$temp = -1
try {
  $s    = (Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage' -ErrorAction Stop).CounterSamples | Where-Object { $_.CookedValue -ge 0 }
  $max  = ($s | Measure-Object -Property CookedValue -Maximum).Maximum
  if ($max -ne $null) { $util = [Math]::Round($max) }
} catch {}
try {
  $ts   = (Get-Counter '\\GPU Thermal(*)\\Temperature' -ErrorAction Stop).CounterSamples
  $tmax = ($ts | Measure-Object -Property CookedValue -Maximum).Maximum
  if ($tmax -ne $null) { $temp = [Math]::Round($tmax) }
} catch {}
Write-Output ($vc.Name + '|' + $vram + '|' + $util + '|' + $temp)
`.trim();
    try {
      fs.writeFileSync(scriptFile, script, 'utf8');
      const out = execSync(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptFile}"`,
        { timeout: 5000, encoding: 'utf8', windowsHide: true }
      );
      const parts = out.trim().split('|');
      if (parts.length === 4) {
        gpuName = (parts[0] || '').trim();
        const v = parseInt(parts[1]);
        if (v > 0) gpuVram = v;
        const u = parseInt(parts[2]);
        if (u >= 0) gpuUtil = u;
        const t = parseInt(parts[3]);
        if (t > 0 && t < 120) gpuTemp = t;
      }
    } catch {} finally {
      try { fs.unlinkSync(scriptFile); } catch {}
    }
  }

  return { cpuPct, cpuName, cpuCores, cpuTemp, ramTotal, ramUsed, gpuName, gpuUtil, gpuVram, gpuVramUsed, gpuTemp };
});

// ===== Installed Program Scanner =====

ipcMain.handle('scan-installed-programs', async (event, currentFolderPath) => {
  const startMenuRoots = [
    'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs',
    path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ];
  const desktopRoots = [
    path.join(os.homedir(), 'Desktop'),
    'C:\\Users\\Public\\Desktop',
  ];

  const allLnkFiles = [];

  function scanDir(dir, depth) {
    if (depth > 4) return;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) scanDir(full, depth + 1);
        else if (entry.isFile() && entry.name.toLowerCase().endsWith('.lnk')) allLnkFiles.push(full);
      }
    } catch {}
  }

  for (const root of [...startMenuRoots, ...desktopRoots]) {
    if (fs.existsSync(root)) scanDir(root, 0);
  }

  if (allLnkFiles.length === 0) return [];

  const existingNames = new Set();
  if (currentFolderPath && fs.existsSync(currentFolderPath)) {
    try {
      for (const f of fs.readdirSync(currentFolderPath)) {
        existingNames.add(path.basename(f, path.extname(f)).toLowerCase());
      }
    } catch {}
  }

  const resolved = await batchResolveLnk(allLnkFiles);

  const JUNK = /uninstall|uninst|setup|\bremove\b|help\b|readme|\bmanual\b|documentation|release.?note|changelog|what'?s.?new|\blicense\b|\beula\b|crash.?report|bug.?report/i;

  const results = [];
  for (const lnkPath of allLnkFiles) {
    const info   = resolved[lnkPath] || {};
    const name   = path.basename(lnkPath, '.lnk');
    const target = (info.target || '').trim();

    if (JUNK.test(name)) continue;
    if (!target) continue;
    if (!target.toLowerCase().endsWith('.exe')) continue;
    if (JUNK.test(path.basename(target, '.exe'))) continue;
    if (!fs.existsSync(target)) continue;
    if (existingNames.has(name.toLowerCase())) continue;

    let iconPath = null;
    if (info.icon && !info.icon.startsWith(',')) {
      const candidate = expandEnvVars(info.icon.replace(/,[^,]*$/, '').trim());
      if (candidate && fs.existsSync(candidate)) iconPath = candidate;
    }
    if (!iconPath && fs.existsSync(target)) iconPath = target;

    results.push({
      id:         Buffer.from(lnkPath).toString('base64'),
      name,
      sourcePath: lnkPath,
      targetPath: target,
      iconPath:   iconPath || lnkPath,
    });
  }

  const storeApps = await getStoreApps(existingNames);
  const nameSet = new Set(results.map(r => r.name.toLowerCase()));
  for (const sa of storeApps) {
    if (!nameSet.has(sa.name.toLowerCase())) {
      results.push(sa);
      nameSet.add(sa.name.toLowerCase());
    }
  }

  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
});

ipcMain.handle('create-shortcuts-in-folder', async (event, { programs, destFolder }) => {
  if (!destFolder || !fs.existsSync(destFolder)) return { created: [], errors: [] };
  const created = [], errors = [];
  for (const prog of programs) {
    try {
      if (prog.isStoreApp) {
        const dest = path.join(destFolder, `${prog.name}.url`);
        fs.writeFileSync(dest, `[InternetShortcut]\r\nURL=shell:AppsFolder\\${prog.appUserModelId}\r\n`, 'utf8');
        created.push(`${prog.name}.url`);
      } else {
        const dest = path.join(destFolder, path.basename(prog.sourcePath));
        fs.copyFileSync(prog.sourcePath, dest);
        created.push(path.basename(prog.sourcePath));
      }
    } catch {
      errors.push(prog.name);
    }
  }
  return { created, errors };
});

// ===== Scanning =====

async function getStoreApps(existingNames) {
  const tmpId     = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const scriptFile = path.join(os.tmpdir(), `gl_store_${tmpId}.ps1`);
  const script    = `
$apps = @(Get-StartApps | Where-Object { $_.AppID -match '!' } | Select-Object Name, AppID)
if ($apps.Count -eq 0) { Write-Output '[]'; exit }
$apps | ConvertTo-Json -Compress -Depth 2
`.trim();

  let raw = [];
  try {
    fs.writeFileSync(scriptFile, script, 'utf8');
    const output = execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptFile}"`,
      { timeout: 10000, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }
    ).trim();
    if (output) {
      const parsed = JSON.parse(output);
      raw = Array.isArray(parsed) ? parsed : [parsed];
    }
  } catch { return []; }
  finally { try { fs.unlinkSync(scriptFile); } catch {} }

  const JUNK_NAME   = /uninstall|uninst|setup|\bremove\b|help\b|readme|\bmanual\b/i;
  const JUNK_FAMILY = /^(microsoft\.ui\.|microsoft\.net\.|microsoft\.vclibs\.|microsoft\.windowsappruntime\.|microsoft\.services\.|microsoftwindows\.|windows\.|microsoft\.desktopappinstaller_|microsoft\.storepurchaseapp_|microsoft\.mixedreality\.|microsoft\.oneconnect_|microsoft\.advertising\.|microsoft\.windowsfeedback_)/i;

  const results = [];
  const seen    = new Set();
  for (const app of raw) {
    const name  = (app.Name  || '').trim();
    const appId = (app.AppID || '').trim();
    if (!name || !appId || !appId.includes('!')) continue;
    if (JUNK_NAME.test(name)) continue;
    if (JUNK_FAMILY.test(appId.split('!')[0])) continue;
    if (existingNames.has(name.toLowerCase())) continue;
    if (seen.has(appId)) continue;
    seen.add(appId);

    results.push({
      id:             Buffer.from(appId).toString('base64'),
      name,
      sourcePath:     appId,
      targetPath:     `shell:AppsFolder\\${appId}`,
      iconPath:       null,
      isStoreApp:     true,
      appUserModelId: appId,
    });
  }
  return results;
}

async function scanForShortcuts(folderPath) {
  let entries;
  try {
    entries = fs.readdirSync(folderPath, { withFileTypes: true });
  } catch (e) {
    return [];
  }

  const lnkFiles = [];
  const urlFiles = [];

  for (const e of entries) {
    if (!e.isFile()) continue;
    const lower = e.name.toLowerCase();
    const full  = path.join(folderPath, e.name);
    if (lower.endsWith('.lnk'))      lnkFiles.push(full);
    else if (lower.endsWith('.url')) urlFiles.push(full);
  }

  // Batch-resolve all .lnk files in ONE PowerShell call
  const lnkResolved = lnkFiles.length > 0 ? await batchResolveLnk(lnkFiles) : {};

  const results = [];

  for (const lnkPath of lnkFiles) {
    const info       = lnkResolved[lnkPath] || {};
    const name       = path.basename(lnkPath, '.lnk');
    const targetPath = info.target || lnkPath;

    let iconPath = null;
    if (info.icon && !info.icon.startsWith(',')) {
      const candidate = expandEnvVars(info.icon.replace(/,[^,]*$/, '').trim());
      if (candidate && fs.existsSync(candidate)) iconPath = candidate;
    }
    if (!iconPath && targetPath && targetPath !== lnkPath && fs.existsSync(targetPath)) {
      iconPath = targetPath;
    }

    results.push({
      id: Buffer.from(lnkPath).toString('base64'),
      name,
      path: lnkPath,
      targetPath,
      iconPath: iconPath || targetPath || lnkPath,
      isUrl: false,
      isFile: false
    });
  }

  for (const urlPath of urlFiles) {
    results.push(resolveUrlShortcut(urlPath));
  }

  return results;
}

async function batchResolveLnk(lnkPaths) {
  const tmpId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const pathsFile = path.join(os.tmpdir(), `gl_lnk_paths_${tmpId}.txt`);
  const scriptFile = path.join(os.tmpdir(), `gl_lnk_${tmpId}.ps1`);

  const script = `
$shell = New-Object -ComObject WScript.Shell
$paths = Get-Content -LiteralPath '${pathsFile.replace(/'/g, "''")}' -Encoding UTF8
$out = [ordered]@{}
foreach ($lnk in $paths) {
  $lnk = $lnk.Trim()
  if (-not $lnk) { continue }
  try {
    $s = $shell.CreateShortcut($lnk)
    $out[$lnk] = @{ target = $s.TargetPath; icon = $s.IconLocation }
  } catch {
    $out[$lnk] = @{ target = ''; icon = '' }
  }
}
$out | ConvertTo-Json -Compress -Depth 3
`.trim();

  fs.writeFileSync(pathsFile, lnkPaths.join('\n'), 'utf8');
  fs.writeFileSync(scriptFile, script, 'utf8');

  let result = {};
  try {
    const output = execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptFile}"`,
      { timeout: 15000, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    ).trim();
    if (output) {
      const raw = JSON.parse(output);
      // PS ConvertTo-Json wraps single items differently — normalise
      for (const [k, v] of Object.entries(raw)) {
        result[k] = { target: v?.target || '', icon: v?.icon || '' };
      }
    }
  } catch (e) {
    console.error('Batch lnk resolve error:', e.message);
  } finally {
    try { fs.unlinkSync(pathsFile); } catch (_) {}
    try { fs.unlinkSync(scriptFile); } catch (_) {}
  }
  return result;
}

function resolveUrlShortcut(urlFilePath) {
  const name = path.basename(urlFilePath, '.url');
  let url = null;
  let iconPath = null;

  try {
    const content = fs.readFileSync(urlFilePath, 'utf8');
    const urlMatch = content.match(/^URL=(.+)$/mi);
    if (urlMatch) url = urlMatch[1].trim();

    const iconMatch = content.match(/^IconFile=(.+)$/mi);
    if (iconMatch) {
      const candidate = expandEnvVars(iconMatch[1].trim());
      if (candidate && fs.existsSync(candidate)) iconPath = candidate;
    }
  } catch (e) { /* ignore */ }

  return {
    id: Buffer.from(urlFilePath).toString('base64'),
    name,
    path: urlFilePath,
    targetPath: url || urlFilePath,
    iconPath: iconPath || null,
    isUrl: true,
    url: url || null
  };
}

function expandEnvVars(str) {
  if (!str) return str;
  return str.replace(/%([^%]+)%/g, (match, name) => process.env[name] || match);
}
