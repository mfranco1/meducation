import { SvgIcon, type SvgIconProps } from '@mui/material';

export function BoneIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M8.4 16.9 16.9 8.4c1.1.5 2.3.3 3-.5 1-1 .9-2.5-.1-3.4-.6-.5-1.3-.7-2-.6.1-.7-.1-1.4-.6-2-.9-1-2.4-1.1-3.4-.1-.8.7-1 1.9-.5 3L4.8 13.3c-1.1-.5-2.3-.3-3 .5-1 1-.9 2.5.1 3.4.6.5 1.3.7 2 .6-.1.7.1 1.4.6 2 .9 1 2.4 1.1 3.4.1.8-.7 1-1.9.5-3Z"
          transform="translate(1 1) scale(.92)"
        />
      </g>
    </SvgIcon>
  );
}
