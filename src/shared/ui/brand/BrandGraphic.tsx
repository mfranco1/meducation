import { Box, useTheme } from '@mui/material';
import { brand } from '../../brand';

export type BrandVariant = 'full' | 'icon' | 'wordmark';
export type BrandLayout = 'horizontal' | 'stacked';
export type BrandColorMode = 'fullColor' | 'mono' | 'black' | 'white';
export type BrandTheme = 'auto' | 'light' | 'dark';
export type BrandOpticalSize = 'auto' | 'small' | 'standard';
export type BrandSize = number | { xs: number; sm?: number; md?: number };

type Props = {
  variant?: BrandVariant;
  layout?: BrandLayout;
  size?: BrandSize;
  className?: string;
  theme?: BrandTheme;
  colorMode?: BrandColorMode;
  opticalSize?: BrandOpticalSize;
  decorative?: boolean;
};

const viewBoxes: Record<BrandVariant, string> = {
  full: '0 0 548 112',
  icon: brand.mark.viewBox,
  wordmark: '0 0 400 88',
};

function IconArtwork({ opticalSize = 'auto' }: { opticalSize?: BrandOpticalSize }) {
  return (
    <svg className="meducation-icon" viewBox={brand.mark.viewBox} aria-hidden="true" focusable="false">
      <g className="geometry-standard">
        <path className="page-left" d={brand.mark.page} />
        <path className="rail-left" d={brand.mark.rail} />
        <g transform={brand.mark.reflection}>
          <path className="page-right" d={brand.mark.page} />
          <path className="rail-right" d={brand.mark.rail} />
        </g>
      </g>
      <g className={opticalSize === 'standard' ? 'geometry-small-hidden' : 'geometry-small'}>
        <path className="page-left" d={brand.mark.smallPage} />
        <path className="rail-left rail-small" d={brand.mark.rail} />
        <g transform={brand.mark.reflection}>
          <path className="page-right" d={brand.mark.smallPage} />
          <path className="rail-right rail-small" d={brand.mark.rail} />
        </g>
      </g>
    </svg>
  );
}

function WordmarkArtwork() {
  return (
    <svg className="meducation-wordmark" viewBox="0 0 400 88" aria-hidden="true" focusable="false">
      <text x="4" y="68" className="wordmark-text" fontSize="72" fontWeight="800" letterSpacing="-2.88">
        <tspan className="wordmark-emphasis">{brand.wordmark.emphasis}</tspan>
        <tspan className="wordmark-remainder">{brand.wordmark.remainder}</tspan>
      </text>
    </svg>
  );
}

function responsiveWidth(size: BrandSize | undefined, defaultSize: number) {
  if (typeof size === 'number') return `${size}px`;
  if (!size) return `${defaultSize}px`;
  return {
    xs: `${size.xs}px`,
    ...(size.sm === undefined ? {} : { sm: `${size.sm}px` }),
    ...(size.md === undefined ? {} : { md: `${size.md}px` }),
  };
}

export function BrandGraphic({
  variant = 'full',
  layout = 'horizontal',
  size,
  className,
  theme = 'auto',
  colorMode = 'fullColor',
  opticalSize = 'auto',
  decorative = false,
}: Props) {
  const muiTheme = useTheme();
  const resolvedTheme = theme === 'auto' ? (muiTheme.palette.mode === 'dark' ? 'dark' : 'light') : theme;
  const defaultSize = variant === 'full' ? (layout === 'stacked' ? 240 : 184) : variant === 'icon' ? 24 : 160;
  const aspectRatio =
    variant === 'full'
      ? layout === 'stacked'
        ? '400 / 260'
        : '548 / 112'
      : viewBoxes[variant].split(' ').slice(2).join(' / ');

  return (
    <Box
      component="span"
      className={className}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : brand.name}
      aria-hidden={decorative ? true : undefined}
      data-brand-variant={variant}
      data-brand-theme={resolvedTheme}
      data-brand-color={colorMode}
      data-brand-layout={layout}
      data-brand-optical={opticalSize}
      sx={{
        display: 'inline-block',
        flex: '0 0 auto',
        width: responsiveWidth(size, defaultSize),
        aspectRatio,
        lineHeight: 0,
        color: 'inherit',
        containerType: 'inline-size',
        '& svg': { display: 'block', width: '100%', height: '100%', overflow: 'visible' },
        '& .geometry-standard': { display: 'block' },
        '& .geometry-small': { display: 'none' },
        '& .geometry-small-hidden': { display: 'none' },
        '&[data-brand-optical="small"] .geometry-standard': { display: 'none' },
        '&[data-brand-optical="small"] .geometry-small': { display: 'block' },
        '&[data-brand-optical="standard"] .geometry-standard': { display: 'block' },
        '&[data-brand-optical="standard"] .geometry-small': { display: 'none' },
        '@container (max-width: 20px)': {
          '&[data-brand-optical="auto"] .geometry-standard': { display: 'none' },
          '&[data-brand-optical="auto"] .geometry-small': { display: 'block' },
        },
        '@container (max-width: 85px)': {
          '&[data-brand-variant="full"][data-brand-layout="horizontal"][data-brand-optical="auto"] .geometry-standard':
            { display: 'none' },
          '&[data-brand-variant="full"][data-brand-layout="horizontal"][data-brand-optical="auto"] .geometry-small': {
            display: 'block',
          },
        },
        '@container (max-width: 42px)': {
          '&[data-brand-variant="full"][data-brand-layout="stacked"][data-brand-optical="auto"] .geometry-standard': {
            display: 'none',
          },
          '&[data-brand-variant="full"][data-brand-layout="stacked"][data-brand-optical="auto"] .geometry-small': {
            display: 'block',
          },
        },
        '& .page-left, & .rail-left': { fill: brand.palette[resolvedTheme].left },
        '& .page-right': { fill: brand.palette[resolvedTheme].right },
        '& .rail-left, & .rail-right': {
          fill: 'none',
          strokeWidth: `${brand.mark.railWidth}px`,
          strokeLinecap: 'round',
        },
        '& .rail-left': { stroke: brand.palette[resolvedTheme].left },
        '& .rail-right': { stroke: brand.palette[resolvedTheme].right },
        '& .rail-small': { strokeWidth: `${brand.mark.smallRailWidth}px` },
        '& .wordmark-text': {
          fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontWeight: 800,
          letterSpacing: '-.04em',
        },
        '& .wordmark-emphasis': { fill: brand.palette[resolvedTheme].left },
        '& .wordmark-remainder': { fill: brand.palette[resolvedTheme].text },
        '&[data-brand-color="mono"] .page-left, &[data-brand-color="mono"] .page-right, &[data-brand-color="mono"] .wordmark-emphasis, &[data-brand-color="mono"] .wordmark-remainder':
          { fill: 'currentColor' },
        '&[data-brand-color="mono"] .rail-left, &[data-brand-color="mono"] .rail-right': { stroke: 'currentColor' },
        '&[data-brand-color="black"] .page-left, &[data-brand-color="black"] .page-right, &[data-brand-color="black"] .wordmark-emphasis, &[data-brand-color="black"] .wordmark-remainder':
          { fill: '#000' },
        '&[data-brand-color="black"] .rail-left, &[data-brand-color="black"] .rail-right': { stroke: '#000' },
        '&[data-brand-color="white"] .page-left, &[data-brand-color="white"] .page-right, &[data-brand-color="white"] .wordmark-emphasis, &[data-brand-color="white"] .wordmark-remainder':
          { fill: '#fff' },
        '&[data-brand-color="white"] .rail-left, &[data-brand-color="white"] .rail-right': { stroke: '#fff' },
      }}
    >
      {variant === 'icon' ? (
        <IconArtwork opticalSize={opticalSize} />
      ) : variant === 'wordmark' ? (
        <WordmarkArtwork />
      ) : layout === 'stacked' ? (
        <svg viewBox="0 0 400 260" aria-hidden="true" focusable="false">
          <svg x="104" y="0" width="192" height="168" viewBox={brand.mark.viewBox} preserveAspectRatio="xMidYMid meet">
            <IconArtwork opticalSize={opticalSize} />
          </svg>
          <svg x="0" y="172" width="400" height="88" viewBox="0 0 400 88" preserveAspectRatio="xMidYMid meet">
            <WordmarkArtwork />
          </svg>
        </svg>
      ) : (
        <svg viewBox={viewBoxes.full} aria-hidden="true" focusable="false">
          <svg x="0" y="0" width="128" height="112" viewBox={brand.mark.viewBox} preserveAspectRatio="xMidYMid meet">
            <IconArtwork opticalSize={opticalSize} />
          </svg>
          <svg x="148" y="12" width="400" height="88" viewBox="0 0 400 88" preserveAspectRatio="xMidYMid meet">
            <WordmarkArtwork />
          </svg>
        </svg>
      )}
    </Box>
  );
}
