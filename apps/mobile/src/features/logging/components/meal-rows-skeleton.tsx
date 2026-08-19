import { View } from 'react-native';

import { SkeletonBar, useSkeletonPulse } from '@/shared/ui';
import { ROW_LINE_HEIGHT } from '../constants';

/**
 * How wide each standing-in row runs, as a share of the writing area. They are uneven on
 * purpose: a column of bars all the same length reads as a table, and what is coming is
 * writing.
 */
const ROW_WIDTHS = ['76%', '52%', '88%', '44%'] as const;

const BAR_HEIGHT = 16;

/**
 * The log while the day is still being fetched: the shape of the rows, with the calorie
 * label standing beside each one. It takes the composer's own spacing, so the first frame
 * of the real day lands exactly where the placeholder was.
 */
export function MealRowsSkeleton() {
  const opacity = useSkeletonPulse();

  return (
    // Nothing here is readable, so it is kept out of the accessibility tree.
    <View className="flex-1 gap-6 px-5 pt-7" aria-hidden>
      {ROW_WIDTHS.map((width, index) => (
        <View
          key={width}
          className="flex-row items-center gap-3"
          // One written line, so nothing moves when the real rows land on top.
          style={{ height: ROW_LINE_HEIGHT }}
        >
          <View className="flex-1">
            <SkeletonBar width={width} height={BAR_HEIGHT} opacity={opacity} />
          </View>

          {/* The row's result sits on the right, and the shorter rows carry no label yet. */}
          {index % 2 === 0 ? (
            <SkeletonBar width={54} height={BAR_HEIGHT} opacity={opacity} />
          ) : null}
        </View>
      ))}
    </View>
  );
}
