declare module '../lib/webrtc.js' {
  export interface StreamConfig {
    codec: string;
    fps: number;
    width: number;
    height: number;
    bitrate: string;
    preset: string;
    audio: boolean;
  }

  export function startSession(
    server: string,
    config: StreamConfig,
    logger: (msg: string) => void,
    videoElement: HTMLVideoElement
  ): Promise<void>;
}