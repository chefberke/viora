import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { SheetHeader } from './sheet-header';

export interface SheetScreenProps {
  title: string;
  /** Sits beside the close button. A bookmark, in both screens that use it. */
  headerAccessory?: ReactNode;
  children: ReactNode;
}

/**
 * A scrolling sheet: the header, then the body, in the padding every sheet uses.
 *
 * The wrapper below was three verbatim copies — same classes, same spacing, same order —
 * sitting immediately above three copies of the header. Since the pair always travelled
 * together, they are one component rather than two nested by hand at each site.
 *
 * The day-summary sheet uses `SheetHeader` on its own: it is short enough not to scroll and
 * pads itself against the home indicator instead, which is a different layout and not a
 * variant of this one.
 */
export function SheetScreen({ title, headerAccessory, children }: SheetScreenProps) {
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 px-5 pb-10 pt-4">
      <SheetHeader title={title}>{headerAccessory}</SheetHeader>
      {children}
    </ScrollView>
  );
}
