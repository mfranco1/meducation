import type { ReactNode } from 'react';
import { SvgIcon, type SvgIconProps } from '@mui/material';

// Duotone line icons on a 24-unit grid: a 1.5 stroke plus a soft tint or solid accent.
type Icon = { name: string; art: ReactNode };

const tone = { fill: 'currentColor', fillOpacity: 0.16 };
const solid = { fill: 'currentColor', stroke: 'none' };

// Shown for subjects that have no icon yet.
const fallback: Icon = {
  name: 'study-set',
  art: (
    <>
      <path d="M7 4h10" opacity={0.5} />
      <path d="M5 7h14" opacity={0.75} />
      <rect {...tone} x="3" y="10" width="18" height="10.5" rx="2" />
      <path d="M6.5 14h7M6.5 17h4.5" />
    </>
  ),
};

const iconsBySubjectId: Record<string, Icon> = {
  s1: {
    name: 'bone',
    art: (
      <path
        {...tone}
        transform="rotate(-45 12 12)"
        d="M7.2 10.6H16.8A2.5 2.5 0 1 1 19.6 12 2.5 2.5 0 1 1 16.8 13.4H7.2A2.5 2.5 0 1 1 4.4 12 2.5 2.5 0 1 1 7.2 10.6Z"
      />
    ),
  },
  s2: {
    name: 'molecule',
    art: (
      <>
        <path {...tone} d="M10 8.5 14.3 11v5L10 18.5 5.7 16v-5Z" />
        <path d="M13.2 12.2v2.6M9.4 16.85l-2-1.15M7.4 11.3l2-1.15" opacity={0.75} />
        <path d="M14.3 11l3-1.8M10 8.5V5.6" />
        <circle {...solid} cx="18.6" cy="8.4" r="1.9" />
        <circle cx="10" cy="4.2" r="1.4" />
      </>
    ),
  },
  s3: {
    name: 'scales',
    art: (
      <>
        <path d="M12 5.2v14.3M8 20h8M4.5 7.5h15" />
        <circle cx="12" cy="4.2" r="1" />
        <path d="M5 7.5 2.6 13.5M5 7.5l2.4 6M19 7.5l-2.4 6M19 7.5l2.4 6" />
        <path {...tone} d="M2.4 13.5h5.2a2.6 2.6 0 0 1-5.2 0ZM16.4 13.5h5.2a2.6 2.6 0 0 1-5.2 0Z" />
      </>
    ),
  },
  s4: {
    name: 'stethoscope',
    art: (
      <>
        <path d="M5 3.5h2M13 3.5h2M6 3.5v4.8a4 4 0 0 0 8 0V3.5M10 12.3v2.2a4.5 4.5 0 0 0 9 0v-1.6" />
        <circle {...tone} cx="19" cy="10.4" r="2.4" />
        <circle {...solid} cx="19" cy="10.4" r=".9" />
      </>
    ),
  },
  s5: {
    name: 'virus',
    art: (
      <>
        <circle {...tone} cx="12" cy="12" r="5.4" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <g key={angle} transform={`rotate(${angle} 12 12)`}>
            <path d="M12 6.6V4.4" />
            <circle {...solid} cx="12" cy="3.3" r="1.3" />
          </g>
        ))}
        <circle {...solid} cx="10.4" cy="11" r="1" />
        <circle {...solid} cx="13.6" cy="12.4" r=".8" />
        <circle {...solid} cx="11.4" cy="14" r=".6" />
      </>
    ),
  },
  s6: {
    name: 'uterus',
    art: (
      <>
        <path
          {...tone}
          d="M8 6.4C8 5 9 4.4 10.3 4.4h3.4C15 4.4 16 5 16 6.4c0 3-1.3 5.3-2.7 6.8V16h-2.6v-2.8C9.3 11.7 8 9.4 8 6.4Z"
        />
        <path d="M10.7 16v2.6a1.3 1.3 0 0 0 2.6 0V16M8.2 5.6C6.6 4.3 4.4 4.3 3.6 5.8 3 7 3.4 8 4.2 8.6M15.8 5.6c1.6-1.3 3.8-1.3 4.6.2.6 1.2.2 2.2-.6 2.8" />
        <ellipse {...solid} cx="4.6" cy="10.6" rx="1.3" ry="1.7" />
        <ellipse {...solid} cx="19.4" cy="10.6" rx="1.3" ry="1.7" />
        <path d="M10.6 7.2h2.8L12 10.8Z" opacity={0.7} />
      </>
    ),
  },
  s7: {
    name: 'microscope',
    art: (
      <>
        <rect {...tone} x="4" y="19" width="16" height="2" rx="1" />
        <path {...tone} d="M7 19v-5.5c0-3.2 2-5.9 5-6.9v3c-1.3.7-2 2.2-2 4V19Z" />
        <rect {...tone} x="12" y="5" width="4" height="4.8" rx=".8" />
        <g transform="rotate(-30 14 5)">
          <rect x="12.8" y="2.2" width="2.4" height="2.8" rx=".5" />
          <path d="M12.3 2.2h3.4" />
        </g>
        <rect {...tone} x="13.3" y="9.8" width="1.4" height="2.2" rx=".4" />
        <path d="M10 14.6h9.5" strokeWidth={1.8} />
        <circle {...solid} cx="8.5" cy="13.2" r="1.3" />
      </>
    ),
  },
  s8: {
    name: 'infant',
    art: (
      <>
        <circle {...tone} cx="12" cy="13" r="7.3" />
        <path d="M12 5.7c-.4-1.6.6-2.8 2-2.6M10 15.6a2.6 2.6 0 0 0 4 0" />
        <circle {...solid} cx="9.4" cy="12.6" r=".95" />
        <circle {...solid} cx="14.6" cy="12.6" r=".95" />
        <circle {...solid} cx="7.6" cy="15" r="1" fillOpacity={0.3} />
        <circle {...solid} cx="16.4" cy="15" r="1" fillOpacity={0.3} />
      </>
    ),
  },
  s9: {
    name: 'pills',
    art: (
      <>
        <g transform="rotate(-45 9.5 10)">
          <rect x="3" y="7" width="13" height="6" rx="3" />
          <path {...solid} fillOpacity={0.85} d="M9.5 7H6a3 3 0 0 0 0 6h3.5Z" />
        </g>
        <path {...tone} d="M13 16v1.6a4 2.4 0 0 0 8 0V16" />
        <ellipse {...tone} cx="17" cy="16" rx="4" ry="2.4" />
        <path d="M15.4 14.2l3.2 3.6" opacity={0.75} />
      </>
    ),
  },
  s10: {
    name: 'heart-rhythm',
    art: (
      <>
        <path
          {...tone}
          d="M12 20.3s-8.5-4.9-8.5-10.9A4.6 4.6 0 0 1 12 6.8a4.6 4.6 0 0 1 8.5 2.6c0 6-8.5 10.9-8.5 10.9Z"
        />
        {/* Normal sinus beat: P wave, QRS complex, T wave. */}
        <path
          strokeWidth={1.6}
          d="M2 13.5h2.2c.4-1.5 1.8-1.5 2.2 0h1.2l.5 1 1.1-7.2 1.1 8.7.6-2.5h1.7c.5-2.6 2.9-2.6 3.4 0H22"
        />
      </>
    ),
  },
  s11: {
    name: 'shield',
    art: (
      <>
        <path {...tone} d="M12 3 19.5 5.8v5.6c0 4.6-3.1 8.1-7.5 9.6-4.4-1.5-7.5-5-7.5-9.6V5.8Z" />
        <path d="M12 8.5v6M9 11.5h6" strokeWidth={1.8} />
      </>
    ),
  },
  s12: {
    name: 'scalpel',
    art: (
      <>
        <path d="M2 20.5h20" />
        <g transform="translate(.3 1.9) rotate(35 12 11)">
          <rect {...tone} x="1.6" y="9.6" width="11" height="3.4" rx="1.7" />
          <path d="M5 11.3h4.6" opacity={0.6} />
          <path {...tone} d="M12.6 9.8h3.8c3 0 5.4 1.2 6 3.2-2.9.3-7.4.2-9.8-.2Z" />
        </g>
      </>
    ),
  },
};

export function SubjectIcon({ subjectId, ...props }: SvgIconProps & { subjectId: string }) {
  const { name, art } = iconsBySubjectId[subjectId] ?? fallback;
  return (
    <SvgIcon
      {...props}
      viewBox="0 0 24 24"
      data-subject-icon={subjectId}
      data-icon-name={name}
      aria-hidden="true"
      focusable="false"
      titleAccess={undefined}
    >
      <g fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        {art}
      </g>
    </SvgIcon>
  );
}
