import type { Schema } from 'hast-util-sanitize';

declare global {
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface ImportMetaEnv {
    readonly VITE_CONTENT_IMAGE_ORIGINS?: string;
  }
}

export type RichContentField = 'stem' | 'rationale';

const richHtmlTagNames = [
  'a', 'b', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'input', 'li', 'ol', 'p', 'pre', 'section', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
] as const;

export const richHtmlTags = new Set<string>(richHtmlTagNames);

const appEnvironment = (import.meta.env as { VITE_CONTENT_IMAGE_ORIGINS?: string } | undefined)?.VITE_CONTENT_IMAGE_ORIGINS;
const scriptEnvironment = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.CONTENT_IMAGE_ORIGINS;

export const approvedImageOrigins = new Set(
  (appEnvironment ?? scriptEnvironment ?? '')
    .split(',')
    .map(origin => origin.trim().replace(/\/$/, ''))
    .filter(origin => /^https:\/\//i.test(origin)),
);

export const richContentSanitizeSchema: Schema = {
  tagNames: [...richHtmlTagNames],
  attributes: {
    code: [['className', 'language-math', 'math-inline', 'math-display']],
    a: ['href', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    input: [['type', 'checkbox'], ['disabled', true], ['checked', true]],
  },
  protocols: {
    href: ['http', 'https', 'mailto'],
    src: ['http', 'https'],
  },
};

const safeLinkUrl = /^(?:https?:|mailto:)/i;

export function isAllowedLinkUrl(url: string): boolean {
  return safeLinkUrl.test(url);
}

export function isAllowedImageUrl(url: string, allowedOrigins = approvedImageOrigins): boolean {
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && allowedOrigins.has(parsed.origin);
  } catch {
    return false;
  }
}

export function transformRichContentUrl(url: string, key: string): string {
  if (key === 'src') return isAllowedImageUrl(url) ? url : '';
  return isAllowedLinkUrl(url) ? url : '';
}

export function allowedRawHtmlAttributes(tagName: string): ReadonlySet<string> {
  switch (tagName) {
    case 'a': return new Set(['href', 'title']);
    case 'img': return new Set(['src', 'alt', 'title', 'width', 'height']);
    case 'input': return new Set(['type', 'disabled', 'checked']);
    default: return new Set();
  }
}
