export interface Answer {
  text: string;
  /** Only the sources the text cites, numbered as cited. */
  sources: { number: number; name: string; url: string }[];
}

export type Progress =
  | { stage: "researching" }
  | { stage: "exploring"; detail?: string }
  | { stage: "writing" };
export type OnProgress = (progress: Progress) => Promise<void>;
