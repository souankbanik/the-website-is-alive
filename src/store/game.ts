import { create } from 'zustand';

export type Stage =
  | 'intro'
  | 'page'
  | 'transform'
  | 'typeattack'
  | 'navboss'
  | 'crash'
  | 'peace'
  | 'descent'
  | 'eye'
  | 'boss'
  | 'final'
  | 'ending'
  | 'credits';

export type CaptionKind = 'serif' | 'serif-red' | 'mono' | 'mono-red' | 'tiny' | 'giant' | 'giant-red';
export type CaptionPos = 'center' | 'low' | 'high';
export interface Caption {
  id: number;
  text: string;
  kind: CaptionKind;
  pos: CaptionPos;
}
export interface LogLine {
  id: number;
  who: string;
  text: string;
}
export type CursorMode = 'normal' | 'lag' | 'hidden' | 'game';
export type Overlay = null | 'crash' | 'peace' | 'choice' | 'ending' | 'credits';

interface GameState {
  stage: Stage;
  overlay: Overlay;
  sound: boolean;
  audioReady: boolean;
  caption: Caption | null;
  lines: LogLine[];
  cursorMode: CursorMode;
  hud: boolean;
  bossHud: boolean;
  bossLabel: string;
  headerVisible: boolean;
  navDetached: boolean;
  chaseDone: boolean;
  scrollLocked: boolean;
  blackout: number;
  ending: null | 'delete' | 'live' | 'observer';
  observerUnlocked: boolean;
  setStage: (s: Stage) => void;
  setOverlay: (o: Overlay) => void;
  toggleSound: () => void;
  setAudioReady: () => void;
  say: (who: string, text: string) => void;
  clearLog: () => void;
  show: (text: string, kind?: CaptionKind, pos?: CaptionPos) => void;
  hide: () => void;
  set: (p: Partial<GameState>) => void;
}

let uid = 1;

export const useGame = create<GameState>((set) => ({
  stage: 'intro',
  overlay: null,
  sound: true,
  audioReady: false,
  caption: null,
  lines: [],
  cursorMode: 'normal',
  hud: false,
  bossHud: false,
  bossLabel: '',
  headerVisible: false,
  navDetached: false,
  chaseDone: false,
  scrollLocked: false,
  blackout: 0,
  ending: null,
  observerUnlocked: false,
  setStage: (stage) => set({ stage }),
  setOverlay: (overlay) => set({ overlay }),
  toggleSound: () => set((s) => ({ sound: !s.sound })),
  setAudioReady: () => set({ audioReady: true }),
  say: (who, text) =>
    set((s) => ({ lines: [...s.lines.slice(-3), { id: uid++, who, text }] })),
  clearLog: () => set({ lines: [] }),
  show: (text, kind = 'serif', pos = 'center') => set({ caption: { id: uid++, text, kind, pos } }),
  hide: () => set({ caption: null }),
  set: (p) => set(p),
}));

/** imperative access outside React */
export const game = () => useGame.getState();
