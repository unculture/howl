export interface SystemApi {
  platform: string;
  version: string;
}

export interface HowlApi {
  system: SystemApi;
}

declare global {
  interface Window {
    howl: HowlApi;
  }
}
