/**
 * ClearFrame Studio - Batch Naming Pattern Engine
 * Utilities for formatting, prefixing, sequential numbering, and batch renaming image files.
 */

export type NumberPosition = 'suffix' | 'prefix' | 'replace';
export type CaseFormat = 'preserve' | 'lowercase' | 'uppercase' | 'kebab' | 'snake';

export interface NamingPatternConfig {
  prefix: string;
  suffix: string;
  baseSource: 'original' | 'custom';
  customBase: string;
  enableNumbering: boolean;
  startNumber: number;
  paddingDigits: number; // 1, 2, 3, 4
  numberPosition: NumberPosition;
  separator: string; // '_', '-', '.', ' ' or ''
  caseFormat: CaseFormat;
  preserveExtension: boolean;
}

export interface RenamePreviewItem {
  id: string;
  originalName: string;
  newName: string;
  hasChanged: boolean;
}

export interface NamingPreset {
  id: string;
  label: string;
  description: string;
  config: Partial<NamingPatternConfig>;
}

export const DEFAULT_NAMING_CONFIG: NamingPatternConfig = {
  prefix: '',
  suffix: '_cleaned',
  baseSource: 'original',
  customBase: 'Image',
  enableNumbering: false,
  startNumber: 1,
  paddingDigits: 2,
  numberPosition: 'suffix',
  separator: '_',
  caseFormat: 'preserve',
  preserveExtension: true,
};

export const NAMING_PRESETS: NamingPreset[] = [
  {
    id: 'suffix-cleaned',
    label: '[name]_cleaned',
    description: 'Append _cleaned suffix to original file name',
    config: {
      prefix: '',
      suffix: '_cleaned',
      baseSource: 'original',
      enableNumbering: false,
    },
  },
  {
    id: 'prefix-clean',
    label: 'clean_[name]',
    description: 'Prepend clean_ prefix to original file name',
    config: {
      prefix: 'clean_',
      suffix: '',
      baseSource: 'original',
      enableNumbering: false,
    },
  },
  {
    id: 'numbered-series',
    label: 'Photo_01',
    description: 'Sequential numbered series with custom base name',
    config: {
      prefix: '',
      suffix: '',
      baseSource: 'custom',
      customBase: 'Photo',
      enableNumbering: true,
      startNumber: 1,
      paddingDigits: 2,
      numberPosition: 'suffix',
      separator: '_',
    },
  },
  {
    id: 'prefix-numbered',
    label: '01_[name]',
    description: 'Sequential index number followed by original name',
    config: {
      prefix: '',
      suffix: '',
      baseSource: 'original',
      enableNumbering: true,
      startNumber: 1,
      paddingDigits: 2,
      numberPosition: 'prefix',
      separator: '_',
    },
  },
  {
    id: 'clean-slug',
    label: 'slug-cleaned-01',
    description: 'Lowercase dash-separated web-safe file slug',
    config: {
      prefix: '',
      suffix: '-cleaned',
      baseSource: 'original',
      enableNumbering: false,
      caseFormat: 'kebab',
      separator: '-',
    },
  },
];

/**
 * Sanitizes a filename to remove invalid characters across Windows/macOS/Linux.
 */
export function sanitizeFilename(name: string): string {
  // Replace illegal filename characters: / \ : * ? " < > |
  return name.replace(/[/\\:*?"<>|]/g, '_').trim();
}

/**
 * Splits a filename into base name and extension.
 */
export function splitFilename(filename: string): { base: string; ext: string } {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot > 0 && lastDot < filename.length - 1) {
    return {
      base: filename.substring(0, lastDot),
      ext: filename.substring(lastDot),
    };
  }
  return {
    base: filename,
    ext: '.png',
  };
}

/**
 * Applies case formatting to text.
 */
function applyCaseFormat(text: string, format: CaseFormat): string {
  switch (format) {
    case 'lowercase':
      return text.toLowerCase();
    case 'uppercase':
      return text.toUpperCase();
    case 'kebab':
      return text
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/--+/g, '-')
        .replace(/^-|-$/g, '');
    case 'snake':
      return text
        .toLowerCase()
        .replace(/[\s-]+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
        .replace(/__+/g, '_')
        .replace(/^_|_$/g, '');
    case 'preserve':
    default:
      return text;
  }
}

/**
 * Formats a single filename according to the given naming pattern configuration.
 */
export function formatFilename(
  originalFilename: string,
  index: number,
  config: NamingPatternConfig
): string {
  const { base: origBase, ext: origExt } = splitFilename(originalFilename);

  // 1. Determine base name
  let base = config.baseSource === 'custom'
    ? (config.customBase.trim() || 'Image')
    : origBase;

  // 2. Format sequential number string
  const numVal = config.startNumber + index;
  const numStr = String(numVal).padStart(config.paddingDigits, '0');

  // 3. Assemble components according to numbering position
  let result = base;

  if (config.enableNumbering) {
    if (config.numberPosition === 'replace') {
      result = numStr;
    } else if (config.numberPosition === 'prefix') {
      result = `${numStr}${config.separator}${base}`;
    } else {
      // suffix
      result = `${base}${config.separator}${numStr}`;
    }
  }

  // 4. Attach prefix and suffix
  if (config.prefix) {
    result = `${config.prefix}${result}`;
  }
  if (config.suffix) {
    result = `${result}${config.suffix}`;
  }

  // 5. Apply letter case transformation to the base
  result = applyCaseFormat(result, config.caseFormat);

  // 6. Sanitize characters
  result = sanitizeFilename(result);

  // Fallback if empty
  if (!result) {
    result = `image_${numStr}`;
  }

  // 7. Append extension
  const ext = config.preserveExtension ? origExt : '.png';
  return `${result}${ext}`;
}

/**
 * Computes preview list for an array of items.
 */
export function generateBatchRenamePreview(
  items: Array<{ id: string; name: string }>,
  config: NamingPatternConfig
): RenamePreviewItem[] {
  return items.map((item, index) => {
    const newName = formatFilename(item.name, index, config);
    return {
      id: item.id,
      originalName: item.name,
      newName,
      hasChanged: item.name !== newName,
    };
  });
}
