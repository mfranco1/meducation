import { Button } from '@mui/material';
import { brand } from '../../brand';
import {
  BrandGraphic,
  type BrandColorMode,
  type BrandLayout,
  type BrandOpticalSize,
  type BrandSize,
  type BrandTheme,
  type BrandVariant,
} from './BrandGraphic';

export type {
  BrandColorMode,
  BrandLayout,
  BrandOpticalSize,
  BrandSize,
  BrandTheme,
  BrandVariant,
} from './BrandGraphic';

type AppBrandProps = {
  variant?: BrandVariant;
  layout?: BrandLayout;
  size?: BrandSize;
  className?: string;
  theme?: BrandTheme;
  colorMode?: BrandColorMode;
  opticalSize?: BrandOpticalSize;
  decorative?: boolean;
  onClick?: () => void;
  actionLabel?: string;
};

export function AppBrand({
  onClick,
  actionLabel,
  variant = 'full',
  layout = 'horizontal',
  size,
  className,
  theme,
  colorMode,
  opticalSize,
  decorative,
}: AppBrandProps) {
  if (onClick && !actionLabel) throw new Error('A clickable AppBrand requires an actionLabel.');

  const graphic = (
    <BrandGraphic
      variant={variant}
      layout={layout}
      size={size}
      className={onClick ? undefined : className}
      theme={theme}
      colorMode={colorMode}
      opticalSize={opticalSize}
      decorative={onClick ? true : decorative}
    />
  );

  return onClick ? (
    <Button
      disableRipple
      aria-label={`${brand.name}, ${actionLabel}`}
      onClick={onClick}
      className={className}
      sx={{
        minWidth: 0,
        width: '100%',
        height: 48,
        boxSizing: 'border-box',
        p: 1,
        borderRadius: '10px',
        justifyContent: variant === 'icon' ? 'center' : 'flex-start',
        color: 'text.primary',
        bgcolor: 'transparent',
        '&:hover, &:active': { bgcolor: 'transparent' },
        '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    >
      {graphic}
    </Button>
  ) : (
    graphic
  );
}
