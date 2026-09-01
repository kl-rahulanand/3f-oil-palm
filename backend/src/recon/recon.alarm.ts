import { Injectable } from "@nestjs/common";

export interface ReconAlarm {
  measureId: string;
  primaryValue: number | null;
  altValue: number | null;
  diff: number | null;
  message: string;
}

export interface AlarmSink {
  raise(alarm: ReconAlarm): void;
}

@Injectable()
export class LoggerAlarmSink implements AlarmSink {
  raise(alarm: ReconAlarm): void {
    console.warn(JSON.stringify({ event: "recon_divergence", ...alarm }));
  }
}
