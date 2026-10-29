import { useId } from 'react';
import { SubjectIcon } from './icons/SubjectIcon';

// Subjects with a photographic hero in public/assets/illustrations; the rest use the drawn stack.
const heroBySubjectId: Record<string, string> = { s7: 'patho-hero' };

export function StudyCardIllustration({ subjectId }: { subjectId: string }) {
  const id = useId().replace(/:/g, '');
  const hero = heroBySubjectId[subjectId];

  if (hero) {
    const src = `/assets/illustrations/${hero}`;
    return (
      <img
        src={`${src}-600.webp`}
        srcSet={`${src}-600.webp 600w, ${src}-1192.webp 1192w`}
        sizes="(min-width: 1200px) 560px, 45vw"
        alt=""
        decoding="async"
        loading="lazy"
        style={{
          maskImage: 'linear-gradient(to right, transparent, #000 45%)',
          objectFit: 'cover',
          objectPosition: 'right 55%',
        }}
      />
    );
  }

  const paper = `${id}-paper`;
  const orange = `${id}-orange`;
  const edge = `${id}-edge`;
  const glow = `${id}-glow`;
  const shadow = `${id}-shadow`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 360 270"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      style={{ clipPath: 'inset(0)', contain: 'paint', display: 'block', overflow: 'clip' }}
    >
      <defs>
        <linearGradient id={paper} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fffdfa" />
          <stop offset="0.62" stopColor="#fff6ed" />
          <stop offset="1" stopColor="#ffe8d5" />
        </linearGradient>
        <linearGradient id={orange} x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#f58b4d" />
          <stop offset="0.52" stopColor="#e3652d" />
          <stop offset="1" stopColor="#bc431a" />
        </linearGradient>
        <linearGradient id={edge} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffdfbf" />
          <stop offset="1" stopColor="#efa375" />
        </linearGradient>
        <radialGradient id={glow}>
          <stop offset="0" stopColor="#f6aa74" stopOpacity=".52" />
          <stop offset="1" stopColor="#f6aa74" stopOpacity="0" />
        </radialGradient>
        <filter id={shadow} x="-40%" y="-35%" width="190%" height="200%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="13" stdDeviation="10" floodColor="#ad4b23" floodOpacity=".22" />
        </filter>
      </defs>

      <ellipse cx="174" cy="199" rx="180" ry="110" fill={`url(#${glow})`} />
      <path d="M159 -18 H378 V291 H137 L115 160 Z" fill={`url(#${orange})`} />
      <path d="M176 36 Q180 27 189 31" fill="none" stroke="#ffb270" strokeWidth="3" opacity=".65" />

      {/* Cropped rear study sheet. */}
      <g transform="translate(185 23) rotate(19)">
        <rect x="0" y="8" width="158" height="228" rx="15" fill="#ebc5ac" />
        <rect width="158" height="228" rx="15" fill={`url(#${paper})`} />
        <rect x="22" y="35" width="83" height="7" rx="3.5" fill="#82604c" opacity=".48" />
        <rect x="22" y="59" width="102" height="9" rx="3" fill="#dfcfc2" />
        <rect x="22" y="78" width="77" height="6" rx="3" fill="#e7d8cc" />
        <rect x="22" y="133" width="113" height="8" rx="3" fill="#dfcfc2" />
        <rect x="22" y="154" width="103" height="8" rx="3" fill="#e7d8cc" />
        <rect x="22" y="175" width="116" height="8" rx="3" fill="#dfcfc2" />
      </g>

      {/* The front stack tilts counterclockwise as one rigid object. */}
      <g transform="translate(18 62) rotate(-24 106 102)">
        <rect x="-8" y="32" width="208" height="213" rx="19" fill={`url(#${orange})`} />
        <rect x="-4" y="23" width="208" height="213" rx="18" fill="#ffc994" />
        <rect x="0" y="13" width="208" height="213" rx="17" fill={`url(#${edge})`} />
        <path d="M12 216 H194" stroke="#fff1de" strokeWidth="3" strokeLinecap="round" opacity=".7" />
        <rect width="208" height="213" rx="17" fill={`url(#${paper})`} filter={`url(#${shadow})`} />
        <rect x="1" y="1" width="206" height="211" rx="16" fill="none" stroke="#fffaf4" />
        <g transform="translate(58 56) scale(3.8)" color="#dd6b38">
          <SubjectIcon
            subjectId={subjectId}
            x={0}
            y={0}
            width={24}
            height={24}
            sx={{ width: 24, height: 24, color: 'inherit' }}
          />
        </g>
      </g>
    </svg>
  );
}
