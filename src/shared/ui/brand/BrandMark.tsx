import SvgIcon from '@mui/material/SvgIcon';
import { brand } from '../../brand';

type ResponsiveBrandSize = number | { xs?: number; sm?: number; md?: number };

export function BrandMark({ tone = 'default', size }: { tone?: 'default' | 'inverse'; size?: ResponsiveBrandSize }) {
  return (
    <SvgIcon
      viewBox={brand.mark.viewBox}
      sx={{
        color: tone === 'inverse' ? 'common.white' : 'primary.main',
        ...(size === undefined ? {} : { fontSize: size }),
      }}
      aria-hidden="true"
      focusable="false"
    >
      {brand.mark.paths.map((path) => (
        <path key={path} d={path} />
      ))}
    </SvgIcon>
  );
}
