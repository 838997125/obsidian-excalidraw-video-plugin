/**
 * Obsidian 类型扩展
 * 为 Obsidian API 中未完全定义的类型添加声明
 */

import 'obsidian';
import type { WorkspaceLeaf, TFile, TFolder, MetadataCache, Vault, App } from 'obsidian';

declare module 'obsidian' {
  /**
   * WorkspaceLeaf 扩展属性
   */
  interface WorkspaceLeaf {
    /** Leaf ID */
    id?: string;
    /** Whether the leaf is pinned */
    pinned?: boolean;
    /** Tab group this leaf belongs to */
    tabGroup?: any;
    /** View state */
    viewState?: ViewState;
  }

  /**
   * Workspace 扩展方法
   */
  interface Workspace {
    /** Get active file */
    getActiveFile?: () => TFile | null;
    /** Get layout */
    getLayout?: () => any;
    /** Open popout leaf */
    openPopoutLeaf?: () => WorkspaceLeaf;
  }

  /**
   * App 扩展属性
   */
  interface App {
    /** Internal plugin instances */
    internalPlugins?: {
      plugins: Record<string, { instance: any; enabled: boolean }>;
    };
    /** Custom CSS */
    customCss?: {
      getTheme: () => string;
      setTheme: (theme: string) => void;
      themes: Record<string, any>;
    };
    /** Keymap */
    keymap?: {
      pushScope: (scope: any) => void;
      popScope: (scope: any) => void;
    };
  }

  /**
   * TFile 扩展属性
   */
  interface TFile {
    /** File extension without dot */
    extension: string;
    /** File basename without extension */
    basename: string;
  }

  /**
   * TFolder 扩展属性
   */
  interface TFolder {
    /** Folder name */
    name: string;
    /** Parent folder */
    parent: TFolder | null;
  }

  /**
   * ViewState interface
   */
  interface ViewState {
    type: string;
    state?: Record<string, any>;
    active?: boolean;
    pinned?: boolean;
    group?: string;
  }

  /**
   * MetadataCache 扩展
   */
  interface MetadataCache {
    /** Get file cache */
    getFileCache?: (file: TFile) => any;
    /** Get frontmatter */
    getFrontmatter?: (file: TFile) => any;
    /** Get links */
    getLinks?: () => Record<string, any>;
    /** Get backlinks for file */
    getBacklinksForFile?: (file: TFile) => Map<string, any>;
  }

  /**
   * Vault 扩展
   */
  interface Vault {
    /** Get abstract file by path */
    getAbstractFileByPath: (path: string) => TFile | TFolder | null;
    /** Get folder by path */
    getFolderByPath: (path: string) => TFolder | null;
    /** Check if file exists */
    exists: (file: TAbstractFile) => Promise<boolean>;
    /** Get all loaded files */
    getAllLoadedFiles: () => TAbstractFile[];
  }

  /**
   * Setting extension for custom rendering
   */
  interface Setting {
    /** Custom control element */
    custom?: (cb: (el: HTMLElement) => void) => Setting;
  }
}

export {};