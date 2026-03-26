/**
 * 类型安全工具
 * 提供安全的类型断言和属性访问
 */

/**
 * 安全获取对象的属性
 */
export type SafeAccess<T, K extends keyof T> = T extends null | undefined 
  ? undefined 
  : T[K];

/**
 * 安全的属性访问器
 * 避免使用 @ts-ignore，提供类型安全的属性访问
 */
export class TypeSafe {
  /**
   * 安全获取对象属性
   * @param obj 目标对象
   * @param key 属性名
   * @returns 属性值或 undefined
   */
  public static getProperty<T, K extends string>(
    obj: T,
    key: K
  ): T extends Record<string, any> ? T[K] : unknown {
    if (obj && typeof obj === 'object' && key in obj) {
      return (obj as Record<string, any>)[key];
    }
    return undefined as any;
  }

  /**
   * 安全检查对象是否有某个属性
   * @param obj 目标对象
   * @param key 属性名
   */
  public static hasProperty<T>(obj: T, key: string): boolean {
    return obj !== null && obj !== undefined && typeof obj === 'object' && key in obj;
  }

  /**
   * 安全获取 WorkspaceLeaf 的 id
   */
  public static getLeafId(leaf: any): string | undefined {
    return TypeSafe.getProperty(leaf, 'id');
  }

  /**
   * 安全获取 WorkspaceLeaf 的 parent
   */
  public static getLeafParent(leaf: any): any {
    return TypeSafe.getProperty(leaf, 'parent');
  }

  /**
   * 安全获取 parent 的 type
   */
  public static getParentType(parent: any): string | undefined {
    return TypeSafe.getProperty(parent, 'type');
  }

  /**
   * 安全获取 parent 的 children
   */
  public static getParentChildren(parent: any): any[] | undefined {
    return TypeSafe.getProperty(parent, 'children');
  }

  /**
   * 安全获取 containerEl
   */
  public static getContainerEl(obj: any): HTMLElement | undefined {
    return TypeSafe.getProperty(obj, 'containerEl');
  }

  /**
   * 安全获取 parentElement
   */
  public static getParentElement(element: HTMLElement | undefined): HTMLElement | null | undefined {
    if (!element) return undefined;
    return element.parentElement;
  }

  /**
   * 安全获取 view 的 file
   */
  public static getViewFile(view: any): any {
    return TypeSafe.getProperty(view, 'file');
  }

  /**
   * 安全获取 view 的 navigation
   */
  public static getViewNavigation(view: any): boolean | undefined {
    return TypeSafe.getProperty(view, 'navigation');
  }

  /**
   * 安全获取 PDF viewer 的页码
   */
  public static getPDFPageNumber(view: any): number | undefined {
    const viewer = TypeSafe.getProperty(view, 'viewer');
    const child = TypeSafe.getProperty(viewer, 'child');
    const pdfViewer = TypeSafe.getProperty(child, 'pdfViewer');
    return TypeSafe.getProperty(pdfViewer, 'page');
  }

  /**
   * 类型守卫：检查是否为 WorkspaceLeaf
   */
  public static isWorkspaceLeaf(obj: any): obj is { id?: string; view?: any; parent?: any } {
    return obj !== null && 
           obj !== undefined && 
           typeof obj === 'object' &&
           ('view' in obj || 'id' in obj);
  }

  /**
   * 类型守卫：检查是否为 TFile
   */
  public static isTFile(obj: any): obj is { path: string; extension: string; basename: string } {
    return obj !== null && 
           obj !== undefined && 
           typeof obj === 'object' &&
           'path' in obj &&
           'extension' in obj;
  }

  /**
   * 类型守卫：检查是否为 TFolder
   */
  public static isTFolder(obj: any): obj is { path: string; name: string; children: any[] } {
    return obj !== null && 
           obj !== undefined && 
           typeof obj === 'object' &&
           'path' in obj &&
           'children' in obj;
  }

  /**
   * 安全的数组访问
   */
  public static arrayGet<T>(arr: T[] | undefined, index: number): T | undefined {
    if (!arr || index < 0 || index >= arr.length) {
      return undefined;
    }
    return arr[index];
  }

  /**
   * 安全的数组长度
   */
  public static arrayLength(arr: any[] | undefined): number {
    return arr?.length ?? 0;
  }

  /**
   * 安全调用函数
   */
  public static safeCall<T>(
    fn: (() => T) | undefined,
    fallback?: T
  ): T | undefined {
    if (typeof fn !== 'function') {
      return fallback;
    }
    try {
      return fn();
    } catch {
      return fallback;
    }
  }

  /**
   * 安全的异步调用
   */
  public static async safeCallAsync<T>(
    fn: (() => Promise<T>) | undefined,
    fallback?: T
  ): Promise<T | undefined> {
    if (typeof fn !== 'function') {
      return fallback;
    }
    try {
      return await fn();
    } catch {
      return fallback;
    }
  }

  /**
   * 断言类型（仅用于编译时，运行时无操作）
   */
  public static assertType<T>(value: unknown): T {
    return value as T;
  }

  /**
   * 创建带默认值的对象
   */
  public static withDefaults<T extends object>(obj: Partial<T> | undefined, defaults: T): T {
    return { ...defaults, ...obj };
  }
}

/**
 * 便捷导出
 */
export const getLeafId = TypeSafe.getLeafId;
export const getLeafParent = TypeSafe.getLeafParent;
export const getViewFile = TypeSafe.getViewFile;
export const getContainerEl = TypeSafe.getContainerEl;