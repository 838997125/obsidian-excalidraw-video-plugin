# 安全工具使用指南

本文档介绍如何使用新增的安全工具来改进代码的健壮性和安全性。

## 目录

1. [错误处理 (ErrorHandler)](#错误处理-errorhandler)
2. [输入验证 (ValidationUtils)](#输入验证-validationutils)
3. [重试机制 (RetryUtils)](#重试机制-retryutils)
4. [迁移指南](#迁移指南)

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

4. **使用适当的错误严重级别**
   - `low`: 不影响用户操作的小问题
   - `medium`: 影响部分功能但可继续使用
   - `high`: 影响核心功能
   - `critical`: 导致插件无法使用

5. **在插件卸载时清理资源**
   ```typescript
   errorHandler.cleanup();
   ```

---

## 相关文件

- `src/utils/ErrorHandler.ts` - 错误处理器
- `src/utils/validationUtils.ts` - 输入验证工具
- `src/utils/retryUtils.ts` - 重试机制
- `src/lang/helpers.ts` - 更安全的语言加载
- `src/utils/safety.ts` - 统一导出