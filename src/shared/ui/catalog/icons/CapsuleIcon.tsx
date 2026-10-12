import { SvgIcon, type SvgIconProps } from '@mui/material';

export function CapsuleIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.2 3.8a4.25 4.25 0 0 1 6 6L9.8 20.2a4.25 4.25 0 0 1-6-6Z" />
        <path d="m8.8 9.2 6 6" />
      </g>
    </SvgIcon>
  );
}
