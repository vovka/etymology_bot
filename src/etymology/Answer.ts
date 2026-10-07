export interface Answer {
  text: string;
  sources: { name: string; url: string }[];
}

export type Stage = "researching" | "writing";
export type OnStage = (stage: Stage) => Promise<void>;
