// Holds the MockAgent installed by test/network-guard.ts for the current test.
import type { MockAgent } from "undici";

let current: MockAgent | null = null;

export function setMockAgent(agent: MockAgent | null): void {
  current = agent;
}

export function getMockAgent(): MockAgent {
  if (!current) throw new Error("No MockAgent installed");
  return current;
}
