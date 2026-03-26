# 安全工具使用指南

本文档介绍如何使用新增的安全工具来改进代码的健壮性和安全性。

## 目录

1. [错误处理 (ErrorHandler)](#错误处理-errorhandler)
2. [输入验证 (ValidationUtils)](#输入验证-validationutils)
3. [重试机制 (RetryUtils)](#重试机制-retryutils)
4. [锁管理器 (LockManager)](#锁管理器-lockmanager)
5. [类型安全 (TypeSafe)](#类型安全-typesafe)
6. [迁移指南](#迁移指南)

---

## 错误处理 (ErrorHandler)

### 基本使用

```typescript
import { errorHandler } from 'src/utils/ErrorHandler';

// 简单错误处理
try {
  // 可能失败的代码
  await someAsyncOperation();
} catch (error) {
  errorHandler.handleError(error, 'someAsyncOperation', true);
}
```

### 初始化全局错误处理器

在插件启动时调用：

```typescript
// src/main.ts 或 src/core/main.ts
import { errorHandler } from 'src/utils/ErrorHandler';

export default class ExcalidrawPlugin extends Plugin {
  onload() {
    // 初始化全局错误处理
    errorHandler.initGlobalHandlers();
    
    // ... 其他初始化代码
  }
  
  onunload() {
    // 清理资源
    errorHandler.cleanup();
  }
}
```

### 带严重级别的错误处理

```typescript
// 低严重性 - 仅记录日志
errorHandler.handleErrorWithSeverity(
  new Error('Minor issue'),
  'feature-x',
  false,  // 不显示通知
  0,
  'low'
);

// 高严重性 - 显示通知并记录
errorHandler.handleErrorWithSeverity(
  new Error('Critical failure'),
  'core-feature',
  true,  // 显示通知
  15000, // 15秒
  'high'
);
```

### 获取未处理的错误

```typescript
const unhandledErrors = errorHandler.getUnhandledErrors();
if (unhandledErrors.length > 0) {
  console.log('有未处理的错误:', unhandledErrors);
  // 可以在插件设置中显示给用户
}
```

---

## 输入验证 (ValidationUtils)

### 文件名验证

```typescript
import { ValidationUtils } from 'src/utils/validationUtils';

// 验证文件名
const filename = 'my-drawing.excalidraw.md';
if (ValidationUtils.isValidFilename(filename)) {
  // 文件名有效
} else {
  // 文件名无效，提示用户
}

// 清理文件名
const dirtyName = 'my<>file|"test.md';
const cleanName = ValidationUtils.sanitizeFilename(dirtyName);
// 结果: 'my_file_test.md'
```

### URL 验证

```typescript
// 验证 URL
const url = 'https://example.com/image.png';
if (ValidationUtils.isValidUrl(url)) {
  // URL 有效
}
```

### 安全 JSON 解析

```typescript
// 安全解析 JSON，带有回退值
const data = ValidationUtils.safeJsonParse(jsonString, { default: true });
```

### HTML 转义

```typescript
// 转义用户输入，防止 XSS
const userInput = '<script>alert("xss")</script>';
const safe = ValidationUtils.escapeHtml(userInput);
// 结果: '&lt;script&gt;alert("xss")&lt;/script&gt;'
```

---

## 重试机制 (RetryUtils)

### 基本使用

```typescript
import { withRetry, RetryStrategies } from 'src/utils/retryUtils';

// 使用默认重试策略
const result = await withRetry(
  async () => {
    const response = await fetch('https://api.example.com/data');
    if (!response.ok) throw new Error('Request failed');
    return response.json();
  },
  {
    maxRetries: 3,
    delay: 1000,
    backoff: true,
    context: 'fetch-api-data',
  }
);
```

### 使用预定义策略

```typescript
// 网络请求策略 - 快速重试
const networkResult = await withRetry(
  () => fetchFromNetwork(),
  RetryStrategies.network
);

// 文件操作策略 - 中等重试
const fileResult = await withRetry(
  () => saveFile(data),
  { ...RetryStrategies.fileOperation, context: 'save-drawing' }
);

// 不重试策略 - 立即失败
const noRetryResult = await withRetry(
  () => criticalOperation(),
  RetryStrategies.noRetry
);
```

### 带超时的执行

```typescript
import { RetryUtils } from 'src/utils/retryUtils';

// 5秒超时
const result = await RetryUtils.executeWithTimeout(
  async () => {
    return await longRunningOperation();
  },
  5000, // 超时时间
  {
    maxRetries: 2,
    context: 'timeout-operation',
  }
);
```

### 批量执行

```typescript
// 并发执行多个操作，失败时继续
const results = await RetryUtils.executeAllSettled(
  [
    () => fetchImage('image1.png'),
    () => fetchImage('image2.png'),
    () => fetchImage('image3.png'),
  ],
  RetryStrategies.network
);

results.forEach((result, index) => {
  if (result.success) {
    console.log(`Image ${index} loaded`);
  } else {
    console.error(`Image ${index} failed:`, result.error);
  }
});
```

---

## 锁管理器 (LockManager)

用于协调并发操作，防止竞态条件。

### 基本使用

```typescript
import { globalLockManager, withLock } from 'src/utils/lockManager';

// 使用 withLock 便捷函数
const result = await withLock(
  'file-save-lock',
  async () => {
    // 这段代码在同一时间只能有一个执行
    return await saveFile(data);
  },
  'save-operation'
);
```

### 使用锁管理器实例

```typescript
import { fileLockManager } from 'src/utils/lockManager';

// 手动获取和释放锁
const release = await fileLockManager.acquire('my-file-path', 'file-editor');
try {
  // 安全地操作文件
  await editFile();
} finally {
  release();
}
```

### 检查锁状态

```typescript
if (fileLockManager.isLocked('my-file-path')) {
  console.log('文件正在被其他操作使用');
}
```

---

## 类型安全 (TypeSafe)

替代 `@ts-ignore`，提供类型安全的属性访问。

### 替换 @ts-ignore

**旧代码:**
```typescript
//@ts-ignore
const leafId = leaf.id;
```

**新代码:**
```typescript
import { TypeSafe } from 'src/utils/typeSafe';

const leafId = TypeSafe.getLeafId(leaf);
```

### 常用方法

```typescript
import { TypeSafe } from 'src/utils/typeSafe';

// 安全获取属性
const parent = TypeSafe.getLeafParent(leaf);
const children = TypeSafe.getParentChildren(parent);

// 类型守卫
if (TypeSafe.isWorkspaceLeaf(obj)) {
  const id = obj.id;  // 类型安全
}

// 安全获取 PDF 页码
const pageNum = TypeSafe.getPDFPageNumber(pdfView);

// 安全调用函数
const result = TypeSafe.safeCall(() => someFunction(), fallbackValue);
```

---

## 迁移指南

### 替换 `eval()` 调用

**旧代码:**
```typescript
const decompressed = LZString.decompressFromBase64(data);
let x = {};
eval(decompressed);
return x;
```

**新代码:**
```typescript
import { ValidationUtils } from 'src/utils/validationUtils';

const decompressed = LZString.decompressFromBase64(data);
return ValidationUtils.safeJsonParse(decompressed, fallbackValue);
```

### 替换裸露的 try-catch

**旧代码:**
```typescript
try {
  await operation();
} catch (error) {
  console.error(error);
}
```

**新代码:**
```typescript
import { errorHandler } from 'src/utils/ErrorHandler';

try {
  await operation();
} catch (error) {
  errorHandler.handleError(error, 'operation-context', true);
}
```

### 替换 @ts-ignore

**旧代码:**
```typescript
//@ts-ignore
const leafId = leaf.id;
//@ts-ignore
const parent = leaf.parent;
```

**新代码:**
```typescript
import { TypeSafe } from 'src/utils/typeSafe';

const leafId = TypeSafe.getLeafId(leaf);
const parent = TypeSafe.getLeafParent(leaf);
```

### 添加重试逻辑

**旧代码:**
```typescript
const data = await fetchData();
```

**新代码:**
```typescript
import { withRetry, RetryStrategies } from 'src/utils/retryUtils';

const data = await withRetry(
  () => fetchData(),
  { ...RetryStrategies.network, context: 'fetch-data' }
);
```

### 添加并发保护

**旧代码:**
```typescript
const path = getNewUniqueFilepath(vault, filename, folderpath);
await vault.create(path, content);
```

**新代码:**
```typescript
import { getNewUniqueFilepathAsync, safeCreateFile } from 'src/utils/fileUtils';

const path = await getNewUniqueFilepathAsync(vault, filename, folderpath);
await safeCreateFile(vault, path, content);
```

---

## 最佳实践

1. **总是在插件启动时初始化全局错误处理器**
   ```typescript
   errorHandler.initGlobalHandlers();
   ```

2. **验证所有用户输入**
   ```typescript
   const safeFilename = ValidationUtils.sanitizeFilename(userInput);
   ```

3. **为网络请求和文件操作添加重试**
   ```typescript
   await withRetry(() => networkCall(), RetryStrategies.network);
   ```

4. **使用锁保护并发操作**
   ```typescript
   await withLock('resource-key', () => criticalOperation());
   ```

5. **使用 TypeSafe 替代 @ts-ignore**
   ```typescript
   const id = TypeSafe.getLeafId(leaf);  // 替代 @ts-ignore
   ```

6. **使用适当的错误严重级别**
   - `low`: 不影响用户操作的小问题
   - `medium`: 影响部分功能但可继续使用
   - `high`: 影响核心功能
   - `critical`: 导致插件无法使用

7. **在插件卸载时清理资源**
   ```typescript
   errorHandler.cleanup();
   globalLockManager.clearAll();
   ```

---

## 相关文件

- `src/utils/ErrorHandler.ts` - 错误处理器
- `src/utils/validationUtils.ts` - 输入验证工具
- `src/utils/retryUtils.ts` - 重试机制
- `src/utils/lockManager.ts` - 锁管理器
- `src/utils/typeSafe.ts` - 类型安全工具
- `src/lang/helpers.ts` - 更安全的语言加载
- `src/utils/safety.ts` - 统一导出
- `src/types/obsidian-extensions.d.ts` - Obsidian 类型扩展