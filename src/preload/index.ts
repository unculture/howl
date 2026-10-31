import { contextBridge, ipcRenderer } from 'electron';
import type { HowlApi } from '../shared/api';

const api: HowlApi = {
  files: {
    list: () => ipcRenderer.invoke('files:list'),
    load: (id) => ipcRenderer.invoke('files:load', id),
    save: (request) => ipcRenderer.invoke('files:save', request),
    delete: (id) => ipcRenderer.invoke('files:delete', id),
    showFile: (id) => ipcRenderer.invoke('files:showFile', id),
    showFolder: () => ipcRenderer.invoke('files:showFolder'),
    folder: () => ipcRenderer.invoke('files:folder'),
    import: () => ipcRenderer.invoke('files:import'),
    onChanged: (listener) => {
      const wrapped = () => listener();
      ipcRenderer.on('files:changed', wrapped);
      return () => ipcRenderer.removeListener('files:changed', wrapped);
    }
  },
  system: {
    platform: process.platform,
    version: ipcRenderer.sendSync('system:version') as string,
    micStatus: () => ipcRenderer.invoke('system:micStatus'),
    askMic: () => ipcRenderer.invoke('system:askMic'),
    openMicSettings: () => ipcRenderer.invoke('system:openMicSettings'),
    onFlush: (listener) => {
      ipcRenderer.on('app:flush', () => {
        void listener().finally(() => ipcRenderer.send('app:flushed'));
      });
    }
  }
};

contextBridge.exposeInMainWorld('howl', api);
