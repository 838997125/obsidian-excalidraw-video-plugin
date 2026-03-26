import { Notice } from "obsidian";
import { debug, DEBUGGING } from "./debugHelper";

/**
 * Error severity levels
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Error log entry
 */
export interface ErrorLogEntry {
  error: Error;
  context: string;
  timestamp: number;
  severity: ErrorSeverity;
  handled: boolean;
  userMessage?: string;
}

/**
 * Centralized error handling for the Excalidraw plugin
 */
export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorLog: ErrorLogEntry[] = [];
  private errorNoticeTimeout: number = 10000; // 10 seconds
  private maxLogEntries: number = 100;
  private globalHandlersInitialized: boolean = false;
  private onErrorHandler: ((error: Error, context: string) => void) | null = null;
  
  private constructor() {}
  
  /**
   * Get singleton instance of ErrorHandler
   */
  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Handles errors consistently across the plugin
   * @param error The error object
   * @param context Context information about where the error occurred
   * @param showNotice Whether to show a user-facing notice
   * @param timeout How long to show the notice (in ms)
   */
  public handleError(
    error: Error | string, 
    context: string, 
    showNotice = true,
    timeout?: number
  ): void {
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    
    // Log to console with better formatting
    console.error(`[Excalidraw Error] in ${context}:`, errorObj);
    
    // Add to error log with timestamp
    this.errorLog.push({
      error: errorObj,
      context,
      timestamp: Date.now(),
      severity: 'medium',
      handled: false,
    });
    
    // Trim log if it gets too large
    if (this.errorLog.length > this.maxLogEntries) {
      this.errorLog = this.errorLog.slice(this.errorLog.length - this.maxLogEntries);
    }
    
    // Show notice to user if required
    if (showNotice) {
      const formattedError = this.formatErrorForUser(errorObj, context);
      new Notice(formattedError, timeout || this.errorNoticeTimeout);
    }

    // Debug output if debugging is enabled
    if ((process.env.NODE_ENV === 'development') && DEBUGGING) {
      debug(this.handleError, `ErrorHandler.handleError: ${context}`, errorObj);
    }
  }

  /**
   * Safely evaluates code with error handling
   * @param code The code to evaluate
   * @param context The context where evaluation is happening
   * @param win The window object for evaluation context
   * @param fallback Optional fallback value if evaluation fails
   */
  public safeEval<T>(code: string, context: string, win: Window, fallback?: T): T {
    try {
      return win.eval.call(win, code) as T;
    } catch (error) {
      this.handleError(error, `SafeEval in ${context}`);
      if (fallback !== undefined) {
        return fallback;
      }
      throw error; // Re-throw if no fallback provided
    }
  }

  /**
   * Wraps a function with try/catch and error handling
   * @param fn Function to wrap
   * @param context Context for error reporting
   * @param fallback Optional fallback value if function fails
   */
  public wrapWithTryCatch<T>(fn: () => T, context: string, fallback?: T): T {
    try {
      return fn();
    } catch (error) {
      this.handleError(error, context);
      if (fallback !== undefined) return fallback;
      throw error; // Re-throw if no fallback provided
    }
  }

  /**
   * Format error message for user-facing notifications
   */
  private formatErrorForUser(error: Error, context: string): string {
    // Shorten and simplify the message for users
    let message = error.message;
    
    // Special handling for common error types
    if (message.includes("Cannot read properties of undefined")) {
      message = "A required object was not available. This might be due to a plugin loading issue.";
    } else if (message.includes("is not a function")) {
      message = "A required function was not available. This might be due to a plugin version mismatch.";
    } else if (message.length > 100) {
      // Truncate very long messages
      message = message.substring(0, 100) + "...";
    }
    
    return `Excalidraw Error: ${message} (in ${context})`;
  }

  /**
   * Get recent errors for debugging
   */
  public getErrorLog(): Array<{error: Error, context: string, timestamp: number}> {
    return [...this.errorLog];
  }

  /**
   * Clear error log
   */
  public clearErrorLog(): void {
    this.errorLog = [];
  }

  /**
   * Initialize global error handlers
   * Captures unhandled promise rejections and global errors
   */
  public initGlobalHandlers(): void {
    if (this.globalHandlersInitialized) {
      return;
    }

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason instanceof Error 
        ? event.reason 
        : new Error(String(event.reason));
      
      this.handleErrorWithSeverity(
        error,
        'Unhandled Promise Rejection',
        true,
        15000,
        'high'
      );
      
      // Prevent default browser error logging
      event.preventDefault();
    });

    // Capture global errors
    window.addEventListener('error', (event) => {
      // Ignore errors from other scripts (e.g., browser extensions)
      if (event.filename && !event.filename.includes('excalidraw')) {
        return;
      }

      const error = event.error || new Error(event.message);
      
      this.handleErrorWithSeverity(
        error,
        `Global Error at ${event.filename}:${event.lineno}`,
        true,
        15000,
        'high'
      );
      
      event.preventDefault();
    });

    this.globalHandlersInitialized = true;
  }

  /**
   * Set a custom error handler callback
   * @param handler Function to call on each error
   */
  public setOnErrorHandler(handler: (error: Error, context: string) => void): void {
    this.onErrorHandler = handler;
  }

  /**
   * Handle error with severity level
   * @param error The error object
   * @param context Context information
   * @param showNotice Whether to show user notice
   * @param timeout Notice timeout
   * @param severity Error severity level
   */
  public handleErrorWithSeverity(
    error: Error | string,
    context: string,
    showNotice: boolean = true,
    timeout?: number,
    severity: ErrorSeverity = 'medium'
  ): void {
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    
    // Log to console with severity indicator
    const logMethod = severity === 'critical' || severity === 'high' 
      ? console.error 
      : severity === 'medium' 
        ? console.warn 
        : console.log;
    
    logMethod(`[Excalidraw ${severity.toUpperCase()}] in ${context}:`, errorObj);
    
    // Add to error log
    this.errorLog.push({
      error: errorObj,
      context,
      timestamp: Date.now(),
      severity,
      handled: false,
    });
    
    // Trim log
    if (this.errorLog.length > this.maxLogEntries) {
      this.errorLog = this.errorLog.slice(-this.maxLogEntries);
    }
    
    // Show notice for high severity
    if (showNotice && (severity === 'high' || severity === 'critical')) {
      const formattedError = this.formatErrorForUser(errorObj, context);
      new Notice(formattedError, timeout || this.errorNoticeTimeout);
    }

    // Call custom handler if set
    if (this.onErrorHandler) {
      this.onErrorHandler(errorObj, context);
    }

    // Debug output
    if ((process.env.NODE_ENV === 'development') && DEBUGGING) {
      debug(this.handleErrorWithSeverity, `ErrorHandler.handleErrorWithSeverity: ${context}`, errorObj);
    }
  }

  /**
   * Mark an error as handled
   * @param index Error log index
   */
  public markAsHandled(index: number): void {
    if (index >= 0 && index < this.errorLog.length) {
      this.errorLog[index].handled = true;
    }
  }

  /**
   * Get errors by severity
   * @param severity Minimum severity level
   * @returns Filtered error log
   */
  public getErrorsBySeverity(severity: ErrorSeverity): ErrorLogEntry[] {
    const severityOrder: ErrorSeverity[] = ['low', 'medium', 'high', 'critical'];
    const minIndex = severityOrder.indexOf(severity);
    
    return this.errorLog.filter(entry => {
      const entryIndex = severityOrder.indexOf(entry.severity);
      return entryIndex >= minIndex;
    });
  }

  /**
   * Get unhandled errors
   * @returns Unhandled error entries
   */
  public getUnhandledErrors(): ErrorLogEntry[] {
    return this.errorLog.filter(entry => !entry.handled);
  }

  /**
   * Export error log as JSON
   * @returns JSON string of error log
   */
  public exportErrorLog(): string {
    return JSON.stringify(this.errorLog.map(entry => ({
      message: entry.error.message,
      stack: entry.error.stack,
      context: entry.context,
      timestamp: new Date(entry.timestamp).toISOString(),
      severity: entry.severity,
      handled: entry.handled,
    })), null, 2);
  }

  /**
   * Cleanup global handlers (for plugin unload)
   */
  public cleanup(): void {
    this.globalHandlersInitialized = false;
    this.errorLog = [];
    this.onErrorHandler = null;
  }
}

export const errorHandler = ErrorHandler.getInstance();
