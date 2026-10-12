import type { ComponentType } from 'react';
import type { SvgIconProps } from '@mui/material';
import BalanceOutlined from '@mui/icons-material/BalanceOutlined';
import BiotechOutlined from '@mui/icons-material/BiotechOutlined';
import ChildCareOutlined from '@mui/icons-material/ChildCareOutlined';
import CoronavirusOutlined from '@mui/icons-material/CoronavirusOutlined';
import DeviceHubOutlined from '@mui/icons-material/DeviceHubOutlined';
import FavoriteBorderOutlined from '@mui/icons-material/FavoriteBorderOutlined';
import GridViewOutlined from '@mui/icons-material/GridViewOutlined';
import HealthAndSafetyOutlined from '@mui/icons-material/HealthAndSafetyOutlined';
import MonitorHeartOutlined from '@mui/icons-material/MonitorHeartOutlined';
import { BoneIcon } from './BoneIcon';
import { CapsuleIcon } from './CapsuleIcon';
import { ScalpelIcon } from './ScalpelIcon';
import { UterusIcon } from './UterusIcon';

const iconsBySubjectId: Record<string, { component: ComponentType<SvgIconProps>; name: string }> = {
  s1: { component: BoneIcon, name: 'bone' },
  s2: { component: DeviceHubOutlined, name: 'DeviceHubOutlined' },
  s3: { component: BalanceOutlined, name: 'BalanceOutlined' },
  s4: { component: FavoriteBorderOutlined, name: 'FavoriteBorderOutlined' },
  s5: { component: CoronavirusOutlined, name: 'CoronavirusOutlined' },
  s6: { component: UterusIcon, name: 'uterus' },
  s7: { component: BiotechOutlined, name: 'BiotechOutlined' },
  s8: { component: ChildCareOutlined, name: 'ChildCareOutlined' },
  s9: { component: CapsuleIcon, name: 'capsule' },
  s10: { component: MonitorHeartOutlined, name: 'MonitorHeartOutlined' },
  s11: { component: HealthAndSafetyOutlined, name: 'HealthAndSafetyOutlined' },
  s12: { component: ScalpelIcon, name: 'scalpel' },
  s13: { component: GridViewOutlined, name: 'GridViewOutlined' },
};

export function SubjectIcon({ subjectId, ...props }: SvgIconProps & { subjectId: string }) {
  const { component: Icon, name } = iconsBySubjectId[subjectId] ?? {
    component: GridViewOutlined,
    name: 'GridViewOutlined',
  };
  return (
    <Icon
      {...props}
      data-subject-icon={subjectId}
      data-icon-name={name}
      aria-hidden="true"
      focusable="false"
      titleAccess={undefined}
    />
  );
}
