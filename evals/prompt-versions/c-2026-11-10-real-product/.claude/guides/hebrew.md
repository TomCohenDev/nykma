# Hebrew

Read this for any ad in Hebrew, from the first idea on.

## The words

- Think up the idea, the jokes and the copy in Hebrew from the start. A translated English ad reads as one: the joke doesn't land and the register is off.
- Once the copy is written, read it once more only as a Hebrew editor would: natural register for the audience (not translated-American slang), gender and number agreement, idiom, and how each line breaks. Fix what you find before the pitch. The README's "Hebrew copy reads natively" box is still the user's to tick.
- Set `lang: "he"` in the registry.

## The text on screen

Direction is the code's job, not the words', and a prompt can't fix broken bidi, so get it right in the build and check it on stills:

- Write Hebrew in logical order, and let the browser lay it out right to left (`dir="rtl"`). Never reverse a string to make it look right.
- Isolate English names, numbers, prices and maths inside Hebrew with `<bdi>` (or `dir="ltr"` on the span) so they stay in place, and check where the punctuation lands next to them.
- Anything that implies reading order runs right to left unless the idea says otherwise: a sequence, an arrow, a progress bar, a swipe.
- Product UI appears the way the app really looks, even where that's left to right.
- Use the Hebrew fonts from the brand kit. `validate` fails a letter that falls back to a font outside it.

## The voice

Use the `eleven_v4` or `eleven_v3` families with language code `he` (`mv.py` refuses others before spending credits), and generate one test line with `mv.py build <slug> --test-line` before the rest. `mv.py words <audio> --lang he` times it. Hebrew sung lyrics are unconfirmed, so test them before promising them.
