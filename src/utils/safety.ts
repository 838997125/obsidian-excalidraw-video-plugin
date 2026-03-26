/**
 * 安全工具模块导出
 * 提供错误处理、验证、重试、锁、类型安全等安全相关工具
 */

// 错误处理
export { ErrorHandler, errorHandler, ErrorSeverity, ErrorLogEntry } from './ErrorHandler';

// 验证工具
export { ValidationUtils, validationUtils } from './validationUtils';

// 重试工具
export { 
  RetryUtils, 
  retryUtils, 
  withRetry, 
  RetryOptions, 
  RetryResult, 
  RetryStrategies 
} from './retryUtils';

// 锁管理器
export { 
  LockManager, 
  LockManagerOptions,
  globalLockManager, 
  fileLockManager, 
  networkLockManager,
  withLock 
} from './lockManager';

// 类型安全工具
export { 
  TypeSafe, 
  getLeafId, 
  getLeafParent, 
  getViewFile, 
  getContainerEl 
} from './typeSafe';

// 文件操作（异步安全版本）
export { 
  getNewUniqueFilepathAsync, 
  safeCreateFile 
} from './fileUtils';

// 语言工具
export { 
  t, 
  hasTranslation, 
  getTranslationKeys, 
  getCurrentLocale, 
  reloadLocale 
} from '../lang/helpers';