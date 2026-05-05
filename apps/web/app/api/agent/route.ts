import { createInitialState, runAtheneGraph } from "@/lib/langgraph/graph";
import { requireIdentity } from "@/lib/api/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sse(event: unknown) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { identity, access } = await requireIdentity(req);
        const body = await req.json();
        const prompt = String(body.prompt || body.message || "").trim();
        if (!prompt) throw new Error("Prompt is required");
        const state = createInitialState({ prompt, threadId: body.thread_id, identity, access });
        for await (const event of runAtheneGraph(state)) controller.enqueue(encoder.encode(sse(event)));
      } catch (error) {
        controller.enqueue(encoder.encode(sse({ type: "error", message: error instanceof Error ? error.message : "Unexpected error" })));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
