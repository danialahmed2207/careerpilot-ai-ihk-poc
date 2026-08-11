export type AnalysisInput = {
  candidateName: string;
  targetRole: string;
  company: string;
  jobLink?: string;
  jobText: string;
  resumeText: string;
  attachments?: Array<{
    name: string;
    mediaType: "image/png" | "image/jpeg";
    bytes: Uint8Array;
  }>;
  sourceSummary?: string[];
};

export type AnalysisProvider = "rules" | "bedrock-claude" | "bedrock-nova";

export type AnalysisResult = {
  score: number;
  matches: string[];
  gaps: string[];
  profileHighlights: string[];
  cvSuggestions: string[];
  coverLetter: string;
  interviewQuestions: string[];
  sourceSummary: string[];
  disclaimer: string;
  provider: AnalysisProvider;
  model: string;
  fallbackUsed: boolean;
};
