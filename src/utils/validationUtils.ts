/**
 * 输入验证工具
 * 用于验证和清理用户输入、文件名等
 */

export class ValidationUtils {
  /**
   * 禁止的文件名字符（Windows/跨平台兼容）
   */
  private static readonly INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
  
  /**
   * Windows 保留文件名
   */
  private static readonly RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  
  /**
   * 最大文件名长度
   */
  private static readonly MAX_FILENAME_LENGTH = 255;

  /**
   * 验证文件名是否安全
   * @param filename 要验证的文件名
   * @returns 是否有效
   */
  public static isValidFilename(filename: string): boolean {
    if (!filename || filename.length === 0) {
      return false;
    }
    
    if (filename.length > ValidationUtils.MAX_FILENAME_LENGTH) {
      return false;
    }
    
    if (ValidationUtils.INVALID_FILENAME_CHARS.test(filename)) {
      return false;
    }
    
    if (ValidationUtils.RESERVED_NAMES.test(filename)) {
      return false;
    }
    
    // 检查以点开头或结尾
    if (filename.startsWith('.') || filename.endsWith('.')) {
      return false;
    }
    
    return true;
  }

  /**
   * 清理文件名，移除或替换不安全字符
   * @param filename 原始文件名
   * @param replacement 替换字符，默认为下划线
   * @returns 清理后的文件名
   */
  public static sanitizeFilename(filename: string, replacement: string = '_'): string {
    if (!filename) {
      return 'unnamed';
    }
    
    let sanitized = filename
      .replace(ValidationUtils.INVALID_FILENAME_CHARS, replacement)
      .replace(ValidationUtils.RESERVED_NAMES, `${replacement}$1`)
      .slice(0, ValidationUtils.MAX_FILENAME_LENGTH);
    
    // 移除开头和结尾的点和空格
    sanitized = sanitized.replace(/^[.\s]+|[.\s]+$/g, '');
    
    // 如果清理后为空，返回默认值
    return sanitized || 'unnamed';
  }

  /**
   * 验证路径是否安全
   * @param path 路径字符串
   * @returns 是否有效
   */
  public static isValidPath(path: string): boolean {
    if (!path || path.length === 0) {
      return false;
    }
    
    // 检查路径遍历攻击
    if (path.includes('..') || path.includes('~')) {
      return false;
    }
    
    // 检查绝对路径（根据上下文可能需要调整）
    if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) {
      // 在某些场景下绝对路径可能是有效的
      return true;
    }
    
    return true;
  }

  /**
   * 验证 URL 是否安全
   * @param url URL 字符串
   * @returns 是否有效
   */
  public static isValidUrl(url: string): boolean {
    if (!url || url.length === 0) {
      return false;
    }
    
    try {
      const parsed = new URL(url);
      // 只允许 http 和 https 协议
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  /**
   * 验证电子邮件地址
   * @param email 电子邮件地址
   * @returns 是否有效
   */
  public static isValidEmail(email: string): boolean {
    if (!email) {
      return false;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * 验证颜色值（十六进制或 RGB/RGBA）
   * @param color 颜色字符串
   * @returns 是否有效
   */
  public static isValidColor(color: string): boolean {
    if (!color) {
      return false;
    }
    
    // 十六进制颜色
    const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    
    // RGB/RGBA 颜色
    const rgbPattern = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/;
    
    return hexPattern.test(color) || rgbPattern.test(color);
  }

  /**
   * 限制字符串长度
   * @param str 原始字符串
   * @param maxLength 最大长度
   * @param suffix 超出时的后缀
   * @returns 截断后的字符串
   */
  public static truncate(str: string, maxLength: number, suffix: string = '...'): string {
    if (!str || str.length <= maxLength) {
      return str;
    }
    
    return str.slice(0, maxLength - suffix.length) + suffix;
  }

  /**
   * 验证数字是否在范围内
   * @param value 数值
   * @param min 最小值
   * @param max 最大值
   * @returns 是否在范围内
   */
  public static isInRange(value: number, min: number, max: number): boolean {
    return !isNaN(value) && value >= min && value <= max;
  }

  /**
   * 安全地解析 JSON
   * @param json JSON 字符串
   * @param fallback 解析失败时的回退值
   * @returns 解析结果或回退值
   */
  public static safeJsonParse<T>(json: string, fallback: T): T {
    try {
      return JSON.parse(json) as T;
    } catch {
      return fallback;
    }
  }

  /**
   * 转义 HTML 特殊字符
   * @param str 原始字符串
   * @returns 转义后的字符串
   */
  public static escapeHtml(str: string): string {
    const htmlEntities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    
    return str.replace(/[&<>"']/g, char => htmlEntities[char]);
  }

  /**
   * 验证 Obsidian 内部链接格式
   * @param link 链接字符串
   * @returns 是否有效
   */
  public static isValidObsidianLink(link: string): boolean {
    if (!link) {
      return false;
    }
    
    // 匹配 [[filename]] 或 [[filename|alias]] 格式
    const wikilinkPattern = /^\[\[([^\]|]+)(\|[^\]]+)?\]\]$/;
    
    // 匹配 markdown 链接格式
    const markdownLinkPattern = /^\[([^\]]*)\]\(([^)]+)\)$/;
    
    return wikilinkPattern.test(link) || markdownLinkPattern.test(link);
  }
}

export const validationUtils = ValidationUtils;