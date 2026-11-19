# py: audio and Blender

Audio first, picture second. ElevenLabs makes the music, voice and sound effects, or you bring your own. The pipeline turns it all into `gen/timeline.json` and `gen/mix.wav`, and the ad reads those, so animation is a function of the frame number.

```
spec.json ──gen──▶ ElevenLabs SDK: music · stems · speech · forced alignment · sfx (cached)
          ──timeline──▶ librosa analysis + placement ──▶ gen/timeline.json
          ──mix──▶ ffmpeg: music ducked under voice, -14 LUFS, exact length ──▶ gen/mix.wav
```

## Setup

```bash
py -3.13 -m venv .venv && .venv/Scripts/python -m pip install -r py/requirements.txt
npx -y @elevenlabs/cli@latest onboard init   # writes the key to .env.local (gitignored), or copy .env.example there and paste it in
```

ffmpeg has to be on PATH. Blender is found through `BLENDER=` (environment, then `.env.local`, then `.env`), PATH, `C:\Program Files\Blender Foundation\Blender *`, then `%LOCALAPPDATA%\Programs\blender-*`.

## Commands

```bash
py=.venv/Scripts/python
$py py/mv.py voices                        # voice ids for spec.json
$py py/mv.py build <slug> --estimate       # credits it would use; calls nothing paid, needs no key
$py py/mv.py build <slug> --test-line [id] # one line of one voice, to hear it first
$py py/mv.py build <slug>                  # gen + timeline + mix (only changed items cost credits)
$py py/mv.py gen <slug> --force music      # re-roll one thing: music, stems, or a voice/sfx id
$py py/mv.py blender <slug> --scene src/ads/<slug>/scene.py --preview --frames 1,300   # quick stills, out/<slug>/blender/
$py py/mv.py blender <slug> --scene <file> --layer    # PNG plates, gen/blender/<scene>/, prints the <Plate> line
$py py/mv.py blender <slug> --scene <file> --video    # standalone mp4 with mix.wav, out/<slug>/blender/<scene>.mp4
$py py/test_mv.py                          # tests; the real SDK against a fake server, no credits
```

`--frames` counts Blender frames, from 1 (a page frame + 1). `--preview` is half size with fewer samples. `--ratio 1x1|9x16` renders that shape instead of 16x9, into its own folder. `--test-line` on a one-line voice is the real item, so the build won't pay for it twice.

## spec.json (`public/ads/<slug>/spec.json`)

| Key | What it does |
|---|---|
| `fps` | Frame rate. Energy curves are sampled at this rate. Default 30. |
| `lang` | `he` sends language code `he` to the voice model. Hebrew text with no `lang` counts as Hebrew too. |
| `music.prompt` | **Free composition.** The model decides the structure, length, vocals and lyrics, and the sections it chose land in the timeline. Optional: `length_s`, `model_id` (default `music_v2_5`), `instrumental`. |
| `music.script` + `music.file` | Music made in code. The command runs from the repo root when it or a file it names changes, e.g. `"script": "node scripts/audio/py-demo-track.mjs"`. |
| `music.file` | Your own track, relative to the ad's folder. Add `sections` to name them, or they're detected as Part 1, Part 2, ... |
| `music.grid` | `{ "bpm": 120, "offset": 0.05, "beats_per_bar": 4 }`: an exact beat grid instead of detected beats. |
| `music.stems` | Separates stems through ElevenLabs. Each gets its own energy curve, and beats come from the drums. |
| `voices[]` with `text` | Speech with character timing, which becomes words and lines (split on `\n`). Audio tags like `[whispers]` are performed and never become words. Optional: `voice_id` (default George), `model_id` (default `eleven_v4`), `language_code`, `voice_settings`, `seed`, `previous_text`, `next_text`. |
| `voices[]` with `file` + `text` | **A real human reading.** Whisper gives word times on this machine, for free: the script's own words, laid on what it heard. `"align": "eleven"` uses ElevenLabs' forced alignment instead, which is closer (see below). Optional: `whisper_model`. |
| `voices[]` with `file` only | **Speech you don't have a script for**, like a clip's `audio.wav`. Whisper transcribes it, and its segments become the lines. Add `"mix": false` if the clip plays its own sound. |
| `sfx[]` | Just `text`: the model picks the length. Optional: `duration` (0.1-30 s), `prompt_influence`, `loop`, `model_id`. Or `file` for your own sound. `"mix": false` leaves it out of `mix.wav`, for a sound the ad plays at its own cues. |
| `markers[]` | `{ "name": "reveal", "at": ... }`: named cue points for `marker()`. |
| `at` | Seconds, or `section:Chorus`, `beat:17`, `bar:5`, `marker:reveal`, `word:<voice id>:<word>[#n]`, each with an optional `+0.25` or `-1`. Beats and bars count from 1. Words ignore case, punctuation and niqqud. |
| `gain_db` | Per item, in dB. |
| `mix.duck_db`, `mix.lufs`, `mix.fade_out` | Duck depth (default 8), loudness target (default -14), seconds of fade at the very end. |
| `duration` / `tail` | Total length in seconds, or room after the last sound. |
| `output_format` | Voice, sfx and stems (default `mp3_44100_128`). `music.output_format` sets music. Higher bitrates and PCM need a higher ElevenLabs tier, and music needs a paid plan. |

## timeline.json

`fps`, `frames`, `duration`, `bpm`, `sections[]{name,start,end}`, `beats[]`, `downbeats[]`, `markers[]{name,t}`, `onsets{all,low,high,<stem>,<clip id>}`, `energy{rms,low,mid,high,<stem>,<clip id>}` (one 0..1 value per frame), `words[]` and `lines[]` (`{text,start,end,track}`, where `track` is `lyrics` or a voice id), `clips[]{id,kind,file,start,end,gain_db}`, and `mix` (the file to cue). Times are seconds, and `frames / fps` is the exact length of `mix.wav`.

The helpers have the same names in `src/parts/timeline.ts` and `py/blender/tl.py`: `said`, `marker`, `beatPhase`, `pulse`, `energy`, `section`.

## Hebrew

Voices go to `eleven_v4` with language code `he`. The API silently ignores a language code it doesn't support, so any model outside `eleven.HEBREW_MODELS` stops the build. Generate one line with `--test-line` and listen before making the rest. Sung Hebrew lyrics aren't confirmed, so a build with a vocal music prompt prints a warning: use `instrumental` or your own track until you've heard them work.

## Rules that keep it smooth

- **Every value is a function of the frame.** Anything that accumulates is integrated once over all frames up front.
- **Blender: bake one key per frame** (`tl.bake`) from smooth functions. Motion blur then sees the real path.
- **A scene renders its own slice.** A plate's file number is the ad's frame + 1, so a slice starting at frame 96 is `<Sequence from={96}><Plate first={97} ...>`. `--video` starts the sound there too.
- **Plates go over the page with `kit.setup(..., transparent=args.layer)`.** Bloom adds colour with no alpha, so glow only survives in opaque renders.
- **Plates can be big.** Builds don't copy `public/` and the render reads plates in place, so a heavy `gen/blender/` doesn't slow other ads. `--preview --layer` is half size, and a full 1080p render of a few seconds runs to hundreds of MB, so use `--preview` while the ad is still changing.
- **Look before rendering it all.** Render `--preview --frames` at section changes first.
- **Beats:** a track that holds one tempo gets an exact grid over its whole length. If the tempo really moves, you get the tracker's beats. Downbeats are a 4/4 guess from the low end, so if bar one is wrong, set `music.grid`.
- **Whisper vs forced alignment.** Whisper's starts land within 2 frames for 78-86% of words and within 3 for 83-90% (109 Hebrew words, measured against ElevenLabs' own timing). That's fine for captions. Use `"align": "eleven"` when a cut has to hit a word on the frame. If Whisper hears under 80% of the script word for word, the build warns, and the rest are timed between their neighbours. `py/whisper.py` has the details.
- **`mv.py words <audio> [--lang he] [--text "..."]`** writes `words.json` beside any recording without a spec, such as a clip's sound.
- **`--estimate` is a guide.** The rates in `py/eleven.py` come from ElevenLabs' public pages, and forced alignment has no published rate, so it's listed outside the total.
