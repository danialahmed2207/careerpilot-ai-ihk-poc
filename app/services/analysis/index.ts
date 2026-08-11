import { buildBedrockAnalysis } from "./bedrock";
import { buildRuleBasedAnalysis } from "./rules";
import type { AnalysisInput, AnalysisResult } from "./types";

export type { AnalysisInput, AnalysisResult } from "./types";

export async function analyzeApplication(input: AnalysisInput): Promise<AnalysisResult> {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase() || "rules";
  if (provider === "rules") return buildRuleBasedAnalysis(input);
  if (provider !== "bedrock" && provider !== "bedrock-claude" && provider !== "bedrock-nova") {
    throw new Error(`Unbekannter AI_PROVIDER: ${provider}`);
  }

  try {
    return await buildBedrockAnalysis(input);
  } catch (cause) {
    if (process.env.AI_STRICT_MODE === "true") throw cause;
    console.warn("Bedrock-Modell nicht verfügbar; Regel-Fallback wird verwendet.");
    return buildRuleBasedAnalysis(input, true);
  }
}
