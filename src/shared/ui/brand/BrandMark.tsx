import {
  BrandGraphic,
  type BrandOpticalSize,
  type BrandSize,
  type BrandTheme,
  type BrandColorMode,
} from './BrandGraphic';

export function BrandMark({
  size,
  className,
  theme,
  colorMode,
  opticalSize,
  decorative = false,
}: {
  size?: BrandSize;
  className?: string;
  theme?: BrandTheme;
  colorMode?: BrandColorMode;
  opticalSize?: BrandOpticalSize;
  decorative?: boolean;
}) {
  return (
    <BrandGraphic
      variant="icon"
      size={size}
      className={className}
      theme={theme}
      colorMode={colorMode}
      opticalSize={opticalSize}
      decorative={decorative}
    />
  );
}
