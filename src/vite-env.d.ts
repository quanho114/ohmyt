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
    documents?: {
      pick: (args: {scope:string;mode?:"file"|"folder"}) => Promise<{id:string;name:string;path:string;entry?:{name:string;path:string;directory:boolean}}|null>;
      list: (args: {scope:string;id:string;path:string}) => Promise<{name:string;path:string;directory:boolean}[]>;
      read: (args: {scope:string;id:string;path:string}) => Promise<{data:Uint8Array;version:string;bytes:number}>;
      save: (args: {scope:string;id:string;path:string;content:string;version:string}) => Promise<{data:Uint8Array;version:string;bytes:number}>;
      saveCopy: (args: {scope:string;id:string;path:string;name:string;content:string}) => Promise<{entry:{name:string;path:string;directory:boolean};file:{data:Uint8Array;version:string;bytes:number}}>;
      search: (args: {scope:string;id:string;query:string}) => Promise<{entries:{name:string;path:string;directory:boolean}[];truncated:boolean}>;
      mutate: (args: {scope:string;id:string;path:string;action:'createFile'|'createFolder'|'rename'|'delete';name?:string}) => Promise<void>;
      reveal: (args: {scope:string;id:string;path:string}) => Promise<void>;
    };
    isElectron?: boolean;
  };
}
