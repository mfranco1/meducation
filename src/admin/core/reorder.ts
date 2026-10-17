/** Where a record goes to move one place up or down among its siblings; `afterId: null` means first. */
export function reorderTarget(siblings: readonly { id: string }[], id: string, direction: -1 | 1) {
  const index = siblings.findIndex((row) => row.id === id);
  if (index < 0 || !siblings[index + direction]) return undefined;
  const afterId = direction === -1 ? (siblings[index - 2]?.id ?? null) : siblings[index + 1].id;
  return { afterId };
}
