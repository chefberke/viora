import { TodayScreen } from '@/features/logging';

// TEMPORARY: the composing layout is static UI with no way to reach it by typing.
// Delete this route once the composer drives the state from input focus.
export default function ComposingPreviewRoute() {
  return <TodayScreen state="composing" />;
}
