import { retrieve, knowledgeBaseSize } from "../services/rag.js";

async function main() {
  console.log("KB size:", await knowledgeBaseSize());
  for (const q of [
    "How long do refunds take?",
    "Do you ship internationally and who pays customs?",
    "How long does the Nimbus One battery last?",
    "Can I pay with cash on delivery?",
  ]) {
    const chunks = await retrieve(q, 3);
    console.log(`\nQ: ${q}`);
    for (const c of chunks) {
      console.log(`  - ${c.title} (${c.score.toFixed(3)})`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", (e as Error).message);
  process.exit(1);
});
