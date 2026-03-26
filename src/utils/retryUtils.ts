/**
 * 重试机制工具
 * 用于处理可能失败的操作，提供自动重试能力
 */

import { errorHandler } from './ErrorHandler';

export interface RetryOptions {
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
  /** 初始延迟时间（毫秒），默认 1000 */
  delay?: number;
  /** 是否使用指数退避，默认 true */
  backoff?: boolean;
  /** 最大退避时间（毫秒），默认 30000 */
  maxBackoffDelay?: number;
  /** 上下文描述，用于错误日志 */
  context?: string;
  /** 是否显示错误通知 */
  showNotice?: boolean;
  /** 自定义判断是否应该重试的函数 */
  shouldRetry?: (error: Error, attempt: number) => boolean;
  /** 重试前的回调 */
  onRetry?: (error: Error, attempt: number, delay: number) => void;
}

export interface RetryResult<T> {
  /** 操作结果 */
  result: T;
  /** 重试次数 */
  attempts: number;
  /** 是否成功 */
  success: boolean;
  /** 最后一次错误（如果有） */
  lastError?: Error;
}

/**
 * 带重试的异步操作执行器
 */
export class RetryUtils {
  /**
   * 执行带重试的异步操作
   * @param fn 要执行的异步函数
   * @param options 重试选项
   * @returns 操作结果
   */
  public static async execute<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      delay = 1000,
      backoff = true,
      maxBackoffDelay = 30000,
      context = 'unknown operation',
      showNotice = false,
      shouldRetry,
      onRetry,
    } = options;

    let lastError: Error;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        attempt++;

        // 检查是否应该重试
        if (attempt > maxRetries) {
          break;
        }

        // 自定义重试判断
        if (shouldRetry && !shouldRetry(lastError, attempt)) {
          break;
        }

        // 计算等待时间
        const waitTime = backoff
          ? Math.min(delay * Math.pow(2, attempt - 1), maxBackoffDelay)
          : delay;

        // 调用重试回调
        if (onRetry) {
          onRetry(lastError, attempt, waitTime);
        }

        // 等待后重试
        await RetryUtils.sleep(waitTime);
      }
    }

    // 所有重试都失败，处理错误
    errorHandler.handleError(
      lastError!,
      `RetryUtils.execute (${context}) - failed after ${attempt} attempts`,
      showNotice
    );

    throw lastError!;
  }

  /**
   * 执行带重试的异步操作，返回详细结果
   * @param fn 要执行的异步函数
   * @param options 重试选项
   * @returns 详细结果对象
   */
  public static async executeWithResult<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<RetryResult<T>> {
    const {
      maxRetries = 3,
      delay = 1000,
      backoff = true,
      maxBackoffDelay = 30000,
      context = 'unknown operation',
      shouldRetry,
      onRetry,
    } = options;

    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const result = await fn();
        return {
          result,
          attempts: attempt,
          success: true,
        };
      } catch (error) {
        lastError = error as Error;
        attempt++;

        if (attempt > maxRetries) {
          break;
        }

        if (shouldRetry && !shouldRetry(lastError, attempt)) {
          break;
        }

        const waitTime = backoff
          ? Math.min(delay * Math.pow(2, attempt - 1), maxBackoffDelay)
          : delay;

        if (onRetry) {
          onRetry(lastError, attempt, waitTime);
        }

        await RetryUtils.sleep(waitTime);
      }
    }

    return {
      result: undefined as T,
      attempts: attempt,
      success: false,
      lastError,
    };
  }

  /**
   * 带超时的执行
   * @param fn 要执行的异步函数
   * @param timeoutMs 超时时间（毫秒）
   * @param options 重试选项
   * @returns 操作结果
   */
  public static async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    options: RetryOptions = {}
  ): Promise<T> {
    return RetryUtils.execute(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const result = await Promise.race([
            fn(),
            new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
            }),
          ]);
          clearTimeout(timeoutId);
          return result;
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      },
      { ...options, context: options.context || 'timeout operation' }
    );
  }

  /**
   * 并发执行多个操作，带重试
   * @param fns 要执行的异步函数数组
   * @param options 重试选项
   * @returns 所有结果
   */
  public static async executeAll<T>(
    fns: Array<() => Promise<T>>,
    options: RetryOptions = {}
  ): Promise<T[]> {
    return Promise.all(
      fns.map((fn, index) =>
        RetryUtils.execute(fn, {
          ...options,
          context: options.context ? `${options.context}[${index}]` : `operation[${index}]`,
        })
      )
    );
  }

  /**
   * 批量执行，失败时继续
   * @param fns 要执行的异步函数数组
   * @param options 重试选项
   * @returns 所有结果（包括失败的）
   */
  public static async executeAllSettled<T>(
    fns: Array<() => Promise<T>>,
    options: RetryOptions = {}
  ): Promise<Array<{ success: boolean; result?: T; error?: Error }>> {
    const results = await Promise.allSettled(
      fns.map((fn, index) =>
        RetryUtils.execute(fn, {
          ...options,
          context: options.context ? `${options.context}[${index}]` : `operation[${index}]`,
        })
      )
    );

    return results.map(result => {
      if (result.status === 'fulfilled') {
        return { success: true, result: result.value };
      }
      return { success: false, error: result.reason };
    });
  }

  /**
   * 延迟函数
   * @param ms 延迟毫秒数
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 创建可重用的重试执行器
   * @param defaultOptions 默认选项
   * @returns 重试函数
   */
  public static createRetryExecutor(defaultOptions: RetryOptions) {
    return <T>(fn: () => Promise<T>, overrideOptions?: RetryOptions) =>
      RetryUtils.execute(fn, { ...defaultOptions, ...overrideOptions });
  }
}

/**
 * 预定义的重试策略
 */
export const RetryStrategies = {
  /**
   * 网络请求策略：快速重试，短延迟
   */
  network: {
    maxRetries: 3,
    delay: 500,
    backoff: true,
    maxBackoffDelay: 5000,
  } as RetryOptions,

  /**
   * 文件操作策略：较少重试，中等延迟
   */
  fileOperation: {
    maxRetries: 2,
    delay: 1000,
    backoff: true,
    maxBackoffDelay: 5000,
  } as RetryOptions,

  /**
   * 数据库/存储策略：多次重试，长延迟
   */
  storage: {
    maxRetries: 5,
    delay: 2000,
    backoff: true,
    maxBackoffDelay: 30000,
  } as RetryOptions,

  /**
   * 用户交互策略：不重试，直接报错
   */
  noRetry: {
    maxRetries: 0,
  } as RetryOptions,
};

/**
 * 便捷函数：带重试执行
 */
export const withRetry = RetryUtils.execute;

export const retryUtils = RetryUtils;