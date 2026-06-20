import { Worker } from "bullmq";
import { createRedisConnection } from "../lib/redis.js";
import {
  LLM_QUEUE_NAME,
  type LlmJobData,
  type AutoReplyJob,
  type SummarizeJob,
  type ClassifyJob,
} from "./index.js";
import {
  runClassifyJob,
  runAutoReplyJob,
  runSummarizeJob,
} from "../services/llm-tasks.js";

export function startWorker(log: (msg: string) => void = console.log) {
  const worker = new Worker<LlmJobData>(
    LLM_QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case "classify":
          return runClassifyJob((job.data as ClassifyJob).conversationId);
        case "auto-reply":
          return runAutoReplyJob((job.data as AutoReplyJob).conversationId);
        case "summarize":
          return runSummarizeJob((job.data as SummarizeJob).conversationId);
        default:
          throw new Error(`Unknown job type: ${job.name}`);
      }
    },
    { connection: createRedisConnection(), concurrency: 4 },
  );

  worker.on("completed", (job) => log(`[worker] ${job.name} ${job.id} done`));
  worker.on("failed", (job, err) =>
    log(`[worker] ${job?.name} ${job?.id} failed: ${err.message}`),
  );

  log("[worker] llm-jobs worker started.");
  return worker;
}
