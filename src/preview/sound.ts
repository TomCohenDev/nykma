import { asset } from "../engine/asset";
import { cueSpan } from "../engine/cue";
import type { Video } from "../engine/ad";

/** Plays a video's cue list with Web Audio. Its clock also drives the picture, so the two stay together. */
export class Sound {
  private context: AudioContext | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private playing: AudioBufferSourceNode[] = [];

  private load(context: AudioContext, src: string) {
    let buffer = this.buffers.get(src);
    if (!buffer) {
      buffer = fetch(asset(src))
        .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(response.statusText))))
        .then((data) => context.decodeAudioData(data))
        .catch((error) => {
          console.warn(`sound ${src}: ${error.message}`);
          return null;
        });
      this.buffers.set(src, buffer);
    }
    return buffer;
  }

  /** Starts the cues from a frame. Resolves to the clock time at which that frame is on air. */
  async play(video: Video, from: number) {
    this.context ??= new AudioContext();
    const context = this.context;
    await context.resume();
    const buffers = await Promise.all(video.cues.map((cue) => this.load(context, cue.src)));
    const origin = context.currentTime + 0.05;
    const skip = from / video.fps;

    video.cues.forEach((cue, i) => {
      const buffer = buffers[i];
      const span = buffer && cueSpan(cue, video.fps, video.frames, buffer.duration);
      if (!span || span.start + span.length <= skip) return;

      const late = Math.max(0, skip - span.start); // How far into the cue the playhead already is.
      const cueStart = origin + span.start - skip;
      const cueEnd = cueStart + span.length;
      const begin = cueStart + late;
      const level = (t: number) =>
        span.volume * Math.min(1, span.fadeIn ? (t - cueStart) / span.fadeIn : 1, span.fadeOut ? (cueEnd - t) / span.fadeOut : 1);

      const gain = context.createGain();
      gain.gain.setValueAtTime(level(begin), begin);
      for (const t of [cueStart + span.fadeIn, cueEnd - span.fadeOut, cueEnd]) {
        if (t > begin) gain.gain.linearRampToValueAtTime(level(t), t);
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(gain).connect(context.destination);
      source.start(begin, span.offset + late, span.length - late);
      this.playing.push(source);
    });
    return origin;
  }

  now() {
    return this.context?.currentTime ?? 0;
  }

  stop() {
    for (const source of this.playing) source.stop();
    this.playing = [];
  }
}
