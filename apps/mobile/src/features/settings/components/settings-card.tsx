import { Children, Fragment, type ReactNode } from 'react';
import { View } from 'react-native';

/** The rounded card every group of rows sits on. */
export function SettingsCard({ children }: { children: ReactNode }) {
  // `toArray` drops nulls, so a hidden row cannot leave a divider above nothing.
  const rows = Children.toArray(children);

  return (
    <View className="overflow-hidden rounded-2xl bg-surface">
      {rows.map((row, index) => (
        <Fragment key={index}>
          {/* Inset so the line starts under the labels, not the glyphs. */}
          {index > 0 ? <View className="ml-4 h-px bg-border" /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}
