import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('aegisFiles', { save: (bytes: Uint8Array) => ipcRenderer.invoke('aegis:save', bytes), load: () => ipcRenderer.invoke('aegis:load') });
