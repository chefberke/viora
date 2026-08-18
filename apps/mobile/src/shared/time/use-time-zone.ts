import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { getDeviceTimeZone } from './time-zone';

/**
 * The zone the app tells the time in, which is simply the device's own. There is nothing
 * to choose here: a phone already knows where it is, and a second answer in the app could
 * only disagree with the clock on the status bar.
 *
 * The device can cross a zone while the app sleeps, so the zone is re-read on the way back
 * to the foreground rather than at mount alone.
 */
export function useTimeZone(): string {
  const [timeZone, setTimeZone] = useState(getDeviceTimeZone);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setTimeZone(getDeviceTimeZone());
      }
    });

    return () => subscription.remove();
  }, []);

  return timeZone;
}
