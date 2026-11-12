declare module 'electron' {
  export interface WebContents {}
  export interface IpcMainInvokeEvent {
    sender: WebContents
  }
  export interface IpcMain {
    handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void
    removeHandler(channel: string): void
  }
  export interface BrowserWindow {
    loadURL(url: string): Promise<void>
    loadFile(filePath: string): Promise<void>
    on(event: 'close', listener: (event: { preventDefault(): void }) => void): void
    show(): void
    close(): void
    webContents: { send(channel: string, ...args: unknown[]): void }
  }
  export interface BrowserWindowConstructorOptions {
    width?: number
    height?: number
    minWidth?: number
    minHeight?: number
    titleBarStyle?: 'hidden' | 'hiddenInset' | 'default'
    trafficLightPosition?: { x: number; y: number }
    backgroundColor?: string
    webPreferences?: {
      preload?: string
      contextIsolation?: boolean
      nodeIntegration?: boolean
      sandbox?: boolean
    }
  }
  export const app: {
    getPath(name: 'userData'): string
    whenReady(): Promise<void>
    on(event: 'before-quit' | 'window-all-closed', listener: () => void): void
    quit(): void
    getAppPath(): string
  }
  export const ipcMain: IpcMain
  export const BrowserWindow: {
    new (options: BrowserWindowConstructorOptions): BrowserWindow
    getAllWindows(): BrowserWindow[]
    fromWebContents(contents: WebContents): BrowserWindow | null
  }
  export interface OpenDialogOptions {
    title?: string
    properties?: string[]
    filters?: Array<{ name: string; extensions: string[] }>
  }
  export interface OpenDialogReturnValue {
    canceled: boolean
    filePaths: string[]
  }
  export const dialog: {
    showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue>
    showOpenDialog(owner: BrowserWindow, options: OpenDialogOptions): Promise<OpenDialogReturnValue>
  }
  export const protocol: {
    registerSchemesAsPrivileged(schemes: Array<{
      scheme: string
      privileges: {
        standard?: boolean
        secure?: boolean
        supportFetchAPI?: boolean
        stream?: boolean
      }
    }>): void
    handle(scheme: string, handler: (request: { url: string }) => Response | Promise<Response>): void
  }
  export const contextBridge: {
    exposeInMainWorld(key: string, api: unknown): void
  }
  export const ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>
    on(channel: string, listener: () => void): void
    removeListener(channel: string, listener: () => void): void
  }
}

