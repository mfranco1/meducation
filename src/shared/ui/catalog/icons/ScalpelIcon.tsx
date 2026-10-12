import { SvgIcon, type SvgIconProps } from '@mui/material';

export function ScalpelIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="m9 12 9-9a1.8 1.8 0 0 1 2.5 2.5l-9 9Z" />
        <path d="m9 12-5 5-1 4 4-1 4.5-5.5M3 21h18M13 9l2 2" />
      </g>
    </SvgIcon>
  );
}
