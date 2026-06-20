import { chatComplete, chatStream, activeProviders } from "../lib/llm.js";

const SAMPLE = [
  { role: "system" as const, content: "You are a classifier. Reply ONLY with JSON {\"sentiment\":..,\"intent\":..,\"urgency\":..}." },
  { role: "user" as const, content: "Customer: Hi, my order still hasn't arrived and I'm getting frustrated!" },
];

async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 8): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = (err as Error).message ?? String(err);
      console.log(`[${label}] attempt ${i}/${tries} failed: ${msg.slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, 6000));
    }
  }
  throw lastErr;
}

async function main() {
  console.log("Active LLM providers (in order):", activeProviders.join(" -> "));

  console.log("\n=== classify (JSON) ===");
  const cls = await withRetry("classify", () =>
    chatComplete({ temperature: 0, response_format: { type: "json_object" }, messages: SAMPLE }),
  );
  console.log("RESULT:", cls);

  console.log("\n=== draft (streaming) ===");
  await withRetry("draft", async () => {
    const stream = await chatStream({
      temperature: 0.6,
      messages: [
        { role: "system", content: "You are a friendly support agent. Be concise." },
        { role: "user", content: "Draft a reply to a customer whose order is late and who is frustrated." },
      ],
    });
    let out = "";
    process.stdout.write("STREAM: ");
    for await (const tok of stream) {
      out += tok;
      process.stdout.write(tok);
    }
    process.stdout.write("\n");
    if (!out.trim()) throw new Error("empty stream");
    return out;
  });

  console.log("\nLLM VERIFICATION OK");
  process.exit(0);
}

main().catch((err) => {
  console.error("LLM VERIFICATION FAILED:", (err as Error).message);
  process.exit(1);
});
