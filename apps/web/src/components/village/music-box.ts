/**
 * A tiny music box. The tunes are traditional carols in the public domain, written out as
 * [note, beats] pairs; the synth is a few inharmonic sine partials with a soft room reverb.
 * Nothing makes a sound until start() is called from a user gesture.
 */

type Step = readonly [note: string | null, beats: number];

export type Tune = { title: string; subtitle: string; tempo: number; steps: readonly Step[] };

export const TUNES: readonly Tune[] = [
  {
    title: 'Jingle Bells',
    subtitle: 'J. Pierpont, 1857',
    tempo: 138,
    steps: [
      ['E5', 1], ['E5', 1], ['E5', 2],
      ['E5', 1], ['E5', 1], ['E5', 2],
      ['E5', 1], ['G5', 1], ['C5', 1.5], ['D5', 0.5], ['E5', 4],
      ['F5', 1], ['F5', 1], ['F5', 1.5], ['F5', 0.5],
      ['F5', 1], ['E5', 1], ['E5', 1], ['E5', 0.5], ['E5', 0.5],
      ['E5', 1], ['D5', 1], ['D5', 1], ['E5', 1],
      ['D5', 2], ['G5', 2],
      [null, 2],
    ],
  },
  {
    title: 'We Wish You a Merry Christmas',
    subtitle: 'Traditional English carol',
    tempo: 156,
    steps: [
      ['D5', 1],
      ['G5', 1], ['G5', 0.5], ['A5', 0.5], ['G5', 0.5], ['F#5', 0.5],
      ['E5', 1], ['E5', 1], ['E5', 1],
      ['A5', 1], ['A5', 0.5], ['B5', 0.5], ['A5', 0.5], ['G5', 0.5],
      ['F#5', 1], ['D5', 1], ['D5', 1],
      ['B5', 1], ['B5', 0.5], ['C6', 0.5], ['B5', 0.5], ['A5', 0.5],
      ['G5', 1], ['E5', 1], ['D5', 0.5], ['D5', 0.5],
      ['E5', 1], ['A5', 1], ['F#5', 1],
      ['G5', 3],
      [null, 2],
    ],
  },
  {
    title: 'Deck the Halls',
    subtitle: 'Welsh melody, 16th century',
    tempo: 126,
    steps: [
      ['G5', 1.5], ['F5', 0.5], ['E5', 1], ['D5', 1],
      ['C5', 1], ['D5', 1], ['E5', 1], ['C5', 1],
      ['D5', 0.5], ['E5', 0.5], ['F5', 0.5], ['D5', 0.5], ['E5', 1.5], ['D5', 0.5],
      ['C5', 1], ['B4', 1], ['C5', 2],
      [null, 2],
    ],
  },
];

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function midi(note: string): number {
  const match = /^([A-G])(#|b)?(\d)$/.exec(note);
  if (!match) return 60;
  const base = SEMITONES[match[1] ?? 'C'] ?? 0;
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  return 12 * (Number(match[3]) + 1) + base + accidental;
}

const frequency = (note: string) => 440 * 2 ** ((midi(note) - 69) / 12);

export type MusicState = { playing: boolean; tune: number };

export class MusicBox {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timer = 0;
  private cursor = 0;
  private nextTime = 0;
  private state: MusicState = { playing: false, tune: 0 };
  private readonly listeners = new Set<(state: MusicState) => void>();

  subscribe(listener: (state: MusicState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.state));
  }

  private ensure(): AudioContext | null {
    if (this.context) return this.context;
    const Constructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) return null;
    const context = new Constructor();
    const master = context.createGain();
    master.gain.value = 0.9;
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    master.connect(analyser);
    master.connect(context.destination);
    this.analyser = analyser;
    const convolver = context.createConvolver();
    const length = Math.floor(context.sampleRate * 2.4);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let index = 0; index < length; index += 1) {
        data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 2.6;
      }
    }
    convolver.buffer = impulse;
    const wet = context.createGain();
    wet.gain.value = 0.34;
    convolver.connect(wet).connect(master);
    this.context = context;
    this.master = master;
    this.convolver = convolver;
    return context;
  }

  private convolver: ConvolverNode | null = null;

  /** Current output loudness (RMS, 0 to 1). Handy for tests and for a future visualiser. */
  level(): number {
    if (!this.analyser) return 0;
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (const sample of data) sum += sample * sample;
    return Math.sqrt(sum / data.length);
  }

  /** A single music-box note: a bright strike with two inharmonic partials and a long, soft tail. */
  private note(time: number, hz: number, level = 0.3, tail = 1.7): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    for (const [ratio, gainScale, decay] of [
      [1, 1, tail],
      [2.76, 0.28, tail * 0.45],
      [5.4, 0.1, tail * 0.2],
    ] as const) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = hz * ratio;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(level * gainScale, time + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
      oscillator.connect(gain);
      gain.connect(master);
      if (this.convolver) gain.connect(this.convolver);
      oscillator.start(time);
      oscillator.stop(time + decay + 0.05);
    }
  }

  /** A short rising chime for interface feedback. Starts the audio context if it is not running. */
  chime(semitone = 0): void {
    const context = this.ensure();
    if (!context) return;
    void context.resume();
    const base = 523.25 * 2 ** (semitone / 12);
    this.note(context.currentTime + 0.01, base, 0.22, 1.4);
    this.note(context.currentTime + 0.09, base * 1.5, 0.16, 1.2);
  }

  private schedule = (): void => {
    const context = this.context;
    if (!context || !this.state.playing) return;
    const tune = TUNES[this.state.tune] ?? TUNES[0];
    if (!tune) return;
    const beat = 60 / tune.tempo;
    while (this.nextTime < context.currentTime + 0.4) {
      const step = tune.steps[this.cursor];
      if (!step) {
        this.advance();
        return;
      }
      const [note, beats] = step;
      if (note) this.note(this.nextTime, frequency(note), 0.28, 1.9);
      this.nextTime += beats * beat;
      this.cursor += 1;
    }
    this.timer = window.setTimeout(this.schedule, 120);
  };

  private advance(): void {
    this.cursor = 0;
    this.state = { ...this.state, tune: (this.state.tune + 1) % TUNES.length };
    this.nextTime += 0.8;
    this.emit();
    this.timer = window.setTimeout(this.schedule, 60);
  }

  async play(): Promise<void> {
    const context = this.ensure();
    if (!context) return;
    await context.resume();
    if (this.state.playing) return;
    this.state = { ...this.state, playing: true };
    this.nextTime = context.currentTime + 0.15;
    this.emit();
    this.schedule();
  }

  pause(): void {
    window.clearTimeout(this.timer);
    this.state = { ...this.state, playing: false };
    this.emit();
  }

  toggle(): void {
    if (this.state.playing) this.pause();
    else void this.play();
  }

  next(): void {
    window.clearTimeout(this.timer);
    this.cursor = 0;
    this.state = { ...this.state, tune: (this.state.tune + 1) % TUNES.length };
    if (this.context) this.nextTime = this.context.currentTime + 0.2;
    this.emit();
    if (this.state.playing) this.schedule();
  }

  dispose(): void {
    window.clearTimeout(this.timer);
    this.state = { ...this.state, playing: false };
    void this.context?.close();
    this.context = null;
    this.listeners.clear();
  }
}
