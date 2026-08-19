import { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ROW_TEXT_CLASS } from '../constants';

const WAVE_HEIGHT = 3;
const WAVE_LENGTH = 6;

/** A spellcheck-style wavy line, sized to whatever width its parent measured. */
function Wave({ width, color }: { width: number; color: string }) {
  if (width === 0) {
    return null;
  }

  const waves = Math.ceil(width / WAVE_LENGTH);
  const path = Array.from({ length: waves }, (_, index) => {
    const x = index * WAVE_LENGTH;
    const y = index % 2 === 0 ? 0 : WAVE_HEIGHT;
    const toY = index % 2 === 0 ? WAVE_HEIGHT : 0;

    return `Q ${x + WAVE_LENGTH / 2} ${y === 0 ? -WAVE_HEIGHT : WAVE_HEIGHT * 2} ${x + WAVE_LENGTH} ${toY}`;
  }).join(' ');

  return (
    <Svg
      width={width}
      height={WAVE_HEIGHT * 2}
      viewBox={`0 -${WAVE_HEIGHT} ${width} ${WAVE_HEIGHT * 3}`}
    >
      <Path d={`M 0 0 ${path}`} stroke={color} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

/**
 * The mark a row wears when the parser has something to say about it: the spellcheck wave,
 * as wide as the words above it. Both things the parser can say — this wording could be
 * better, and there is no food in this at all — wear it, so they read as one family.
 *
 * The width comes from an invisible twin of the row's text rather than from the row: the
 * row is a `TextInput` and fills its column, so it would measure the column, not the words.
 */
export function WavyUnderline({ text, color }: { text: string; color: string }) {
  const [textWidth, setTextWidth] = useState(0);

  return (
    <View className="self-start">
      <Text
        className={ROW_TEXT_CLASS}
        style={{ opacity: 0, position: 'absolute' }}
        numberOfLines={1}
        onLayout={(event) => setTextWidth(event.nativeEvent.layout.width)}
      >
        {text}
      </Text>
      <Wave width={textWidth} color={color} />
    </View>
  );
}
