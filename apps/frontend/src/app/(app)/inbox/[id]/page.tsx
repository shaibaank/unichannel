"use client";
import { use } from "react";
import { Thread } from "@/components/Thread";

export default function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <Thread id={id} />;
}
