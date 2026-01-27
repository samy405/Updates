export type UpdateCategory =
  | "Pharmacy"
  | "Billing"
  | "Labs"
  | "Operations"
  | "Internal Tools / Systems"
  | "Contractor / Staffing"
  | "Compliance / Clinical"
  | "Miscellaneous";

export type UpdateStatus = "active" | "superseded";

export interface Update {
  id: string;
  datePosted: string; // ISO date string
  author: string;
  category: UpdateCategory;
  title: string;
  body: string; // Clean summary + key steps
  sourceExcerpt: string; // Short excerpt from Slack paste
  supersedesIds: string[]; // IDs of updates this replaces
  supersededById: string | null; // ID of update that supersedes this
  status: UpdateStatus;
  needsAnswer: boolean;
}

export interface UpdatesData {
  updates: Update[];
  lastIngestedDate: string | null; // ISO date string of last processed date heading
}
