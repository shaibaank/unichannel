import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { embed, cosineSimilarity } from "../lib/embeddings.js";

/**
 * Mock business knowledge base for "Nimbus Audio", a fictional online
 * electronics store. In production this would be your real docs/FAQs.
 */
const MOCK_KB: { title: string; content: string }[] = [
  {
    title: "About Nimbus Audio",
    content:
      "Nimbus Audio is an online store specializing in wireless headphones, earbuds, and portable speakers. We ship across the United States and to 30+ countries.",
  },
  {
    title: "Business hours & support",
    content:
      "Our customer support team is available Monday to Friday, 9am to 6pm Eastern Time. You can reach us via WhatsApp, SMS, or email. We aim to respond within a few hours during business hours.",
  },
  {
    title: "Shipping times",
    content:
      "Standard shipping within the US takes 3 to 5 business days and is free on orders over $50. Express shipping (1 to 2 business days) costs $12. International shipping takes 7 to 14 business days.",
  },
  {
    title: "Order tracking",
    content:
      "Once your order ships you will receive a tracking number by email. You can also track your order anytime by logging into your account and opening the Orders page.",
  },
  {
    title: "Returns and refunds",
    content:
      "We offer a 30-day return policy. Items must be in original condition with all packaging. Refunds are issued to your original payment method within 5 to 7 business days after we receive the returned item.",
  },
  {
    title: "Warranty",
    content:
      "All Nimbus Audio products come with a 12-month limited warranty covering manufacturing defects. The warranty does not cover physical or water damage unless the product is rated waterproof.",
  },
  {
    title: "Damaged or defective items",
    content:
      "If your item arrives damaged or defective, contact support within 48 hours with a photo. We will ship a free replacement immediately at no cost to you.",
  },
  {
    title: "Payment methods",
    content:
      "We accept Visa, Mastercard, American Express, Apple Pay, Google Pay, and PayPal. We do not accept cash on delivery. All payments are processed securely.",
  },
  {
    title: "Discounts and promotions",
    content:
      "New customers get 10% off their first order with code WELCOME10. We run seasonal sales and offer a 15% discount when you subscribe to our newsletter.",
  },
  {
    title: "Order cancellation",
    content:
      "You can cancel an order for a full refund as long as it has not yet shipped. Once an order has shipped it cannot be cancelled, but you may return it under our 30-day return policy.",
  },
  {
    title: "Account and password",
    content:
      "To reset your password, click 'Forgot password' on the login page and follow the email link. If you don't receive the email, check your spam folder or contact support.",
  },
  {
    title: "Product range and battery life",
    content:
      "Our flagship Nimbus One headphones offer 40 hours of battery life and active noise cancellation. The Nimbus Buds earbuds offer 8 hours per charge and 24 hours with the case.",
  },
  {
    title: "International shipping and customs",
    content:
      "International orders may be subject to import duties and taxes determined by your local customs office. These fees are the responsibility of the customer and are not included at checkout.",
  },
  {
    title: "Contact information",
    content:
      "You can email us at support@nimbusaudio.example, message us on WhatsApp, or send an SMS. For warranty claims, please include your order number.",
  },
];

/** Re-seeds the knowledge base, embedding each chunk with the current embedder. */
export async function seedKnowledgeBase(log: (m: string) => void = console.log) {
  await prisma.knowledgeChunk.deleteMany({});
  for (const chunk of MOCK_KB) {
    const vector = await embed(`${chunk.title}. ${chunk.content}`, log);
    await prisma.knowledgeChunk.create({
      data: {
        title: chunk.title,
        content: chunk.content,
        embedding: vector as unknown as Prisma.InputJsonValue,
      },
    });
  }
  log(`[rag] knowledge base seeded with ${MOCK_KB.length} chunks`);
}

export interface RetrievedChunk {
  title: string;
  content: string;
  score: number;
}

/** Returns the top-k most relevant KB chunks for a query (cosine similarity). */
export async function retrieve(
  query: string,
  k = 3,
): Promise<RetrievedChunk[]> {
  const qVec = await embed(query);
  const rows = await prisma.knowledgeChunk.findMany({
    select: { title: true, content: true, embedding: true },
  });
  return rows
    .map((r) => ({
      title: r.title,
      content: r.content,
      score: cosineSimilarity(qVec, r.embedding as unknown as number[]),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export async function knowledgeBaseSize(): Promise<number> {
  return prisma.knowledgeChunk.count();
}
