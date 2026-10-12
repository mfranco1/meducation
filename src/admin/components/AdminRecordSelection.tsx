import { useEffect, useState } from 'react';
import { Button, Stack, Typography } from '@mui/material';

/** Selection stays within one parent/query and survives page changes. */
export function useAdminRecordSelection(scope: string, availableIds: readonly string[]) {
  const [enabled, setEnabled] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => { setEnabled(false); setIds([]); }, [scope]);
  const availableKey = JSON.stringify(availableIds);
  useEffect(() => {
    const available = new Set<string>(JSON.parse(availableKey));
    setIds(previous => previous.every(id => available.has(id)) ? previous : previous.filter(id => available.has(id)));
  }, [availableKey]);
  const selectedIds = ids.filter(id => availableIds.includes(id));
  return {
    enabled,
    ids: selectedIds,
    begin: () => setEnabled(true),
    end: () => { setEnabled(false); setIds([]); },
    clear: () => setIds([]),
    toggle: (id: string) => setIds(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]),
    selectPage: (page: readonly string[]) => setIds(previous => [...new Set([...previous, ...page])]),
  };
}

export function AdminRecordSelection({ selection, pageIds, onDelete }: {
  selection: ReturnType<typeof useAdminRecordSelection>;
  pageIds: string[];
  onDelete: (ids: string[]) => void;
}) {
  if (!selection.enabled) return <Button size="small" disabled={!pageIds.length} onClick={selection.begin}>Select</Button>;
  return <Stack spacing={.5}>
    <Typography variant="caption" aria-live="polite">{selection.ids.length} selected</Typography>
    <Stack direction="row" useFlexGap flexWrap="wrap" spacing={.5}>
      <Button size="small" onClick={() => selection.selectPage(pageIds)}>Select this page</Button>
      <Button size="small" onClick={selection.clear}>Clear selection</Button>
      <Button size="small" onClick={selection.end}>Done</Button>
      <Button size="small" color="error" disabled={!selection.ids.length} onClick={() => onDelete([...selection.ids])}>Delete selected…</Button>
    </Stack>
  </Stack>;
}
