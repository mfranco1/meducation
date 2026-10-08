/** Shared guards for study shortcuts. Keep native editing and widget keys untouched. */
export function canHandleStudyShortcut(event: KeyboardEvent, key: 'arrow' | 'space') {
  if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  const target = event.target;
  if (target instanceof HTMLElement) {
    if (target.isContentEditable || target.closest('[contenteditable="true"], input, textarea, select, a, [aria-modal="true"]')) return false;
    if (key === 'space' && target.closest('button, [role="button"]')) return false;
    if (key === 'arrow' && target.closest('[role="tablist"], [role="tab"], [role="slider"], [role="spinbutton"], [role="menu"], [role="menubar"], [role="menuitem"], [role="listbox"], [role="option"], [role="tree"], [role="treeitem"], [role="grid"], [role="radiogroup"], [role="radio"]')) return false;
  }
  return !Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]')).some(modal => {
    const style = window.getComputedStyle(modal);
    return style.visibility !== 'hidden' && style.display !== 'none';
  });
}
