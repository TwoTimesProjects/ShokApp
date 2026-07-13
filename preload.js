const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Folder operations
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  openFolder: (p) => ipcRenderer.invoke('open-folder', p),
  scanFolder: (p) => ipcRenderer.invoke('scan-folder', p),
  getIconsBatch: (paths) => ipcRenderer.invoke('get-icons-batch', paths),
  pickImage: () => ipcRenderer.invoke('pick-image'),
  launchShortcut: (p) => ipcRenderer.invoke('launch-shortcut', p),
  createWebShortcut: (opts) => ipcRenderer.invoke('create-web-shortcut', opts),

  // Persistent store
  storeGet: (key) => ipcRenderer.invoke('store-get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store-set', key, value),
  storeDelete: (key) => ipcRenderer.invoke('store-delete', key),

  // Steam
  steamSync: (params) => ipcRenderer.invoke('steam-sync', params),
  getSteamInstalled: () => ipcRenderer.invoke('get-steam-installed'),

  // Process watcher
  registerGameExes: (map) => ipcRenderer.invoke('register-game-exes', map),
  onProcessSnapshot: (cb) => ipcRenderer.on('process-snapshot', (_, data) => cb(data)),

  // System stats
  getSystemStats: () => ipcRenderer.invoke('get-system-stats'),

  // Quit handshake — flush active sessions before window closes
  onBeforeQuit: (cb) => ipcRenderer.on('app-before-quit', cb),
  notifyQuitReady: () => ipcRenderer.send('renderer-quit-ready'),

  // License
  getMachineId: () => ipcRenderer.invoke('get-machine-id'),
  validateLicense: (key, email) => ipcRenderer.invoke('validate-license', { key, email }),
  activateLicense: (licenseKey, email) => ipcRenderer.invoke('activate-license', { licenseKey, email }),

  // Program scanner
  scanInstalledPrograms: (folderPath) => ipcRenderer.invoke('scan-installed-programs', folderPath),
  createShortcutsInFolder: (programs, destFolder) => ipcRenderer.invoke('create-shortcuts-in-folder', { programs, destFolder }),

  // Drag-and-drop shortcuts
  getPathForFile: (file) => webUtils.getPathForFile(file),
  addDroppedShortcuts: (paths, destFolder) => ipcRenderer.invoke('add-dropped-shortcuts', { paths, destFolder }),

  // Auto-updater
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, version) => cb(version)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', () => cb()),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // Launch on boot
  getLaunchOnBoot: () => ipcRenderer.invoke('get-launch-on-boot'),
  setLaunchOnBoot: (enable) => ipcRenderer.invoke('set-launch-on-boot', enable),
});
