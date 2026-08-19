import { useEffect, useState } from 'react';

import { PARSE_LEAD, PARSE_LEAD_MS, PARSE_WORDS, PARSE_WORD_MS } from './constants';

/**
 * What a parsing row shows right now: the opening beat, and then its phase's words stepped
 * along on a timer.
 *
 * The words are walked in a circle, so a parse that runs long keeps saying something new
 * rather than holding one word until it lands. The beat is only the first step and is not
 * part of that circle. A phase change starts the whole thing again from the beat: the
 * first word names what has just begun.
 */
export function useParseWord(phase: 'reading' | 'calculating') {
  const words = PARSE_WORDS[phase];
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);

    let cycle: ReturnType<typeof setInterval> | undefined;

    const lead = setTimeout(() => {
      setStep(1);
      cycle = setInterval(() => setStep((current) => current + 1), PARSE_WORD_MS);
    }, PARSE_LEAD_MS);

    return () => {
      clearTimeout(lead);

      if (cycle) {
        clearInterval(cycle);
      }
    };
  }, [words]);

  if (step === 0) {
    return PARSE_LEAD;
  }

  return words[(step - 1) % words.length] ?? '';
}
