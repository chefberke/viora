import { GREETINGS } from './constants';
import type { TimeOfDay } from './types';

/** Hour each part of the day starts at, on a 24-hour clock. */
const MORNING_START = 5;
const AFTERNOON_START = 12;
const EVENING_START = 18;

/**
 * Evening runs from 18:00 until morning. "Good night" is a farewell in English, so the
 * small hours keep the evening greeting rather than getting one of their own.
 */
export function getTimeOfDay(date: Date): TimeOfDay {
  const hour = date.getHours();

  if (hour >= EVENING_START || hour < MORNING_START) {
    return 'evening';
  }

  if (hour >= AFTERNOON_START) {
    return 'afternoon';
  }

  return 'morning';
}

/** Only the first word: a full name is too long for the line and reads as formal. */
function getFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

/**
 * "Good evening, Berke!", or "Good evening!" while the session has no name yet — the
 * cached session can resolve a frame later, and a dangling comma would show until it did.
 */
export function formatGreeting(timeOfDay: TimeOfDay, name = ''): string {
  const { salutation } = GREETINGS[timeOfDay];
  const firstName = getFirstName(name);

  return firstName ? `${salutation}, ${firstName}!` : `${salutation}!`;
}

/**
 * How far back a day sits: "Yesterday", or "5 days ago". Only ever asked about a past day,
 * because there is no way to reach one that has not happened.
 */
export function formatDaysAgo(daysBack: number): string {
  return daysBack === 1 ? 'Yesterday' : `${daysBack} days ago`;
}

/**
 * "Tuesday, Aug 18". The locale is fixed to en-US because the copy around it is English:
 * following the device would put a Turkish date next to an English greeting.
 */
export function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}
