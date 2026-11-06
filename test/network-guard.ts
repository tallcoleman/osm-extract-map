// Blocks real network access in every test: any request without a matching
// MockAgent interceptor fails. Tests add interceptors via getMockAgent().
import { MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach } from "vitest";
import { getMockAgent, setMockAgent } from "./mock-agent.ts";

beforeEach(() => {
  const agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  setMockAgent(agent);
});

afterEach(async () => {
  const agent = getMockAgent();
  setMockAgent(null);
  agent.assertNoPendingInterceptors();
  await agent.close();
});
