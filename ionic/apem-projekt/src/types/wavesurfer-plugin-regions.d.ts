import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions';

declare module 'wavesurfer.js' {
  // Rozszerzamy opcje, żeby TS wiedział o plugins
  interface WaveSurferOptions {
    plugins?: any[];
  }
  // Rozszerzamy instancję o metody pluginu Regions
  interface WaveSurfer {
    addRegion?(params: {
      start: number;
      end: number;
      color?: string;
      [key: string]: any;
    }): any;
    clearRegions?(): any;
    on(event: 'region-update-end' | 'region-created' | string, fn: (...args: any[]) => void): any;
  }
}

// Dodatkowo deklarujemy moduł pluginu, żeby TS go odnajdywał
declare module 'wavesurfer.js/dist/plugins/regions' {
  export default class RegionsPlugin {
    static create(options?: {
      dragSelection?: boolean;
      [key: string]: any;
    }): any;
  }
}
