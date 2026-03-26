/**
 * 锁管理器
 * 用于协调并发操作，防止竞态条件
 */

/**
 * 锁状态
 */
interface LockState {
  promise: Promise<void>;
  resolve: () => void;
  acquiredAt: number;
  holder?: string;
}

/**
 * 锁管理器配置
 */
export interface LockManagerOptions {
  /** 锁超时时间（毫秒），默认 30000 */
  timeout?: number;
  /** 是否启用调试日志 */
  debug?: boolean;
}

/**
 * 锁管理器
 * 提供基于 Promise 的锁机制
 */
export class LockManager {
  private locks = new Map<string, LockState>();
  private timeout: number;
  private debug: boolean;

  constructor(options: LockManagerOptions = {}) {
    this.timeout = options.timeout || 30000;
    this.debug = options.debug || false;
  }

  /**
   * 获取锁
   * @param key 锁的唯一标识
   * @param holder 持有者标识（用于调试）
   * @returns 释放锁的函数
   */
  async acquire(key: string, holder?: string): Promise<() => void> {
    // 等待现有锁释放
    while (this.locks.has(key)) {
      const existingLock = this.locks.get(key)!;
      
      // 检查锁是否超时
      if (Date.now() - existingLock.acquiredAt > this.timeout) {
        this.log(`Lock "${key}" timed out, force releasing`);
        this.forceRelease(key);
        break;
      }
      
      await existingLock.promise;
    }

    // 创建新锁
    let resolve!: () => void;
    const promise = new Promise<void>(r => { resolve = r; });
    
    this.locks.set(key, {
      promise,
      resolve,
      acquiredAt: Date.now(),
      holder,
    });

    this.log(`Lock "${key}" acquired by ${holder || 'unknown'}`);

    // 返回释放函数
    return () => this.release(key);
  }

  /**
   * 释放锁
   * @param key 锁的唯一标识
   */
  release(key: string): void {
    const lock = this.locks.get(key);
    if (lock) {
      this.locks.delete(key);
      lock.resolve();
      this.log(`Lock "${key}" released`);
    }
  }

  /**
   * 强制释放锁（用于超时或错误恢复）
   * @param key 锁的唯一标识
   */
  forceRelease(key: string): void {
    const lock = this.locks.get(key);
    if (lock) {
      this.locks.delete(key);
      lock.resolve();
      this.log(`Lock "${key}" force released`);
    }
  }

  /**
   * 检查锁是否存在
   * @param key 锁的唯一标识
   */
  isLocked(key: string): boolean {
    return this.locks.has(key);
  }

  /**
   * 获取所有活跃锁
   */
  getActiveLocks(): Array<{ key: string; holder?: string; acquiredAt: number }> {
    return Array.from(this.locks.entries()).map(([key, state]) => ({
      key,
      holder: state.holder,
      acquiredAt: state.acquiredAt,
    }));
  }

  /**
   * 使用锁执行操作
   * @param key 锁的唯一标识
   * @param fn 要执行的函数
   * @param holder 持有者标识
   */
  async withLock<T>(key: string, fn: () => Promise<T>, holder?: string): Promise<T> {
    const release = await this.acquire(key, holder);
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * 清理所有锁
   */
  clearAll(): void {
    for (const [key, lock] of this.locks) {
      lock.resolve();
    }
    this.locks.clear();
    this.log('All locks cleared');
  }

  /**
   * 获取锁数量
   */
  get size(): number {
    return this.locks.size;
  }

  /**
   * 调试日志
   */
  private log(message: string): void {
    if (this.debug) {
      console.log(`[LockManager] ${message}`);
    }
  }
}

/**
 * 全局锁管理器实例
 */
export const globalLockManager = new LockManager();

/**
 * 便捷函数：使用锁执行操作
 * @param key 锁的唯一标识
 * @param fn 要执行的函数
 * @param holder 持有者标识
 */
export const withLock = <T>(
  key: string,
  fn: () => Promise<T>,
  holder?: string
): Promise<T> => globalLockManager.withLock(key, fn, holder);

/**
 * 文件操作锁管理器（专门用于文件操作）
 */
export const fileLockManager = new LockManager({
  timeout: 60000, // 文件操作可能需要更长时间
});

/**
 * 网络请求锁管理器（专门用于网络请求）
 */
export const networkLockManager = new LockManager({
  timeout: 30000,
});