import { SvgIcon, type SvgIconProps } from '@mui/material';

export function UterusIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 7c1-2 2.4-2.5 4-2.5S15 5 16 7c.7 2-.2 4-1.6 5.5-.9 1-1.4 2.1-1.4 3.5v4h-2v-4c0-1.4-.5-2.5-1.4-3.5C8.2 11 7.3 9 8 7Z" />
        <path d="M8 7C6 4 2 4.5 2 7.5 2 9 3 10 4.5 10M16 7c2-3 6-2.5 6 .5 0 1.5-1 2.5-2.5 2.5" />
        <ellipse cx="5" cy="11" rx="1.3" ry="2" />
        <ellipse cx="19" cy="11" rx="1.3" ry="2" />
      </g>
    </SvgIcon>
  );
}
