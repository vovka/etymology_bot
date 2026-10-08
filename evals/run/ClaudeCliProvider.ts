import { spawn } from "node:child_process";
import os from "node:os";
import type { AssistantReply, ChatRequest, Provider } from "../../src/providers/Provider.js";

/**
 * Runs `claude -p` so a judge can use the Claude subscription instead of an API key. Text in, text out:
 * no tools, no temperature. Settings, hooks and CLAUDE.md are left out, and it runs from the temp dir,
 * so nothing from the local Claude Code setup reaches the judge.
 */
export class ClaudeCliProvider implements Provider {
  async chat({ model, messages, timeoutMs }: ChatRequest): Promise<AssistantReply> {
    const system = messages.filter((message) => message.role === "system").map((message) => message.content);
    const prompt = messages.filter((message) => message.role !== "system").map((message) => message.content);
    const content = await runClaude(model, system.join("\n\n"), prompt.join("\n\n"), timeoutMs);
    return { content, toolCalls: [], message: { role: "assistant", content } };
  }
}

function runClaude(model: string, system: string, prompt: string, timeoutMs: number): Promise<string> {
  const args = ["-p", "--model", model, "--output-format", "json", "--no-session-persistence"];
  args.push("--setting-sources", "", "--tools", "", "--system-prompt", system || "Follow the instructions.");
  const child = spawn("claude", args, { cwd: os.tmpdir(), timeout: timeoutMs });
  child.stdin.end(prompt);
  let stdout = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      const result = stdout ? JSON.parse(stdout) : null;
      if (code === 0 && result && !result.is_error) resolve(result.result);
      else reject(new Error(`claude -p failed (exit ${code}): ${result?.result ?? "no output"}`));
    });
  });
}
