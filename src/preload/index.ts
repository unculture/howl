import { contextBridge, ipcRenderer } from 'electron';
import type { HowlApi } from '../shared/api';

const api: HowlApi = {
  system: {
    platform: process.platform,
    version: ipcRenderer.sendSync('system:version') as string
  }
};

contextBridge.exposeInMainWorld('howl', api);
