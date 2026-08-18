import { Text } from 'react-native';

import type { ComposerStatus } from '../types';

const STATUS_LABEL: Record<ComposerStatus, string | null> = {
  idle: null,
  reading: 'Reading',
};

/** Renders nothing while idle, so the composer keeps its full width. */
export function ComposerStatusLabel({ status }: { status: ComposerStatus }) {
  const label = STATUS_LABEL[status];

  if (!label) {
    return null;
  }

  return <Text className="text-lg text-foreground-muted">{label}</Text>;
}
