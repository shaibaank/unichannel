import { Queue } from "bullmq";
import { createRedisConnection } from "../lib/redis.js";

export const LLM_QUEUE_NAME = "llm-jobs";

export type LlmJobName = "auto-reply" | "summarize" | "classify";

export interface AutoReplyJob {
  conversationId: string;
}
export interface SummarizeJob {
  conversationId: string;
}
export interface ClassifyJob {
  conversationId: string;
  messageId: string;
}

export type LlmJobData = AutoReplyJob | SummarizeJob | ClassifyJob;

let queue: Queue<LlmJobData> | null = null;

export function getLlmQueue(): Queue<LlmJobData> {
  if (!queue) {
    queue = new Queue<LlmJobData>(LLM_QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        // Keep retries low: LLM rate-limit (429) failures should not storm.
        attempts: 2,
        backoff: { type: "exponential", delay: 15000 },
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    });
  }
  return queue;
}

export function enqueueClassify(data: ClassifyJob) {
  return getLlmQueue().add("classify", data);
}

export function enqueueAutoReply(data: AutoReplyJob) {
  return getLlmQueue().add("auto-reply", data);
}

export function enqueueSummarize(data: SummarizeJob) {
  return getLlmQueue().add("summarize", data);
}
