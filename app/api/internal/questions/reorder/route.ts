import { z } from "zod";
import { reorderQuestions } from "@/lib/db";

const payloadSchema = z.object({
  questionSetId: z.number().int().positive(),
  orderedQuestionIds: z.array(z.number().int().positive()).min(1)
});

export async function POST(request: Request): Promise<Response> {
  let payload: z.infer<typeof payloadSchema>;

  try {
    payload = payloadSchema.parse(await request.json());
  } catch {
    return Response.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const uniqueQuestionIds = new Set(payload.orderedQuestionIds);
  if (uniqueQuestionIds.size !== payload.orderedQuestionIds.length) {
    return Response.json({ ok: false, error: "orderedQuestionIds must be unique" }, { status: 400 });
  }

  try {
    await reorderQuestions(payload.questionSetId, payload.orderedQuestionIds);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reorder questions.";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
