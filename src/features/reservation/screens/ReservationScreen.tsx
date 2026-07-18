import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { EmptyState } from '../../../components/EmptyState';
import { TabHeader } from '../../../components/TabHeader';

export function ReservationScreen(_props: BottomTabScreenProps<any>) {
  return (
    <ScreenGradient>
      <TabHeader title="예약" />
      <EmptyState emoji="🏟️" title="구장 예약 기능은 준비 중이에요" subtitle={'조금만 기다려주세요!'} />
    </ScreenGradient>
  );
}
