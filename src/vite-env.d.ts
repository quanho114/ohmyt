/// <reference types="vite/client" />

declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}

interface Window {
  electronAPI?: {
    openHtmlPreview?: (content: string, chatId?: string | null) => Promise<void>;
    writeClipboard?: (text: string) => Promise<void>;
    onBrowserPaneExpand?: (callback: (expanded: boolean) => void) => () => void;
    onBrowserPaneClose: (callback: () => void) => () => void;
    onBrowserPaneOpen?: (callback: (chatId: string) => void) => () => void;
    setBrowserChat?: (chatId:string|null) => Promise<void>;
    setBrowserFeatures?: (features: {enabled:boolean;installed:boolean;canFiles:boolean}) => Promise<void>;
    onBrowserFiles?: (callback: () => void) => () => void;
    openBrowserUrl: (url: string) => Promise<number>;
    setBrowserBounds: (bounds: {x:number;y:number;width:number;height:number} | null, paneOpen?: boolean) => Promise<void>;
    openBrowser: () => Promise<void>;
    selectProjectDirectory: () => Promise<string | null>;
    openProjectDirectory: (directory: string) => Promise<void>;
    minimize: () => void;
    restart?: () => void;
    maximize: () => void;
    beginBrowserResize?: (width: number) => Promise<boolean>;
    finishBrowserResize?: () => Promise<void>;
    isMaximized?: () => Promise<boolean>;
    onMaximizedChanged?: (callback: (maximized: boolean) => void) => () => void;
    close: () => void;
    isElectron?: boolean;
  };
}
