import {
  findCallBySid,
  getContactConversationHistory,
  getContactProfile,
  getTranscriptForCall,
  insertContactCallHistory,
  listCallQuestionAnswers,
  replaceCallQuestionAnswers,
  resolveLocalizedQuestionsForCall,
  setCallSummary,
  setCallSummaryFailure,
  setCallSummaryStatus,
  setContactConversationHistory,
  setContactProfile
} from "@/lib/db";
import type { CallMessage, ContactProfile } from "@/lib/db";
import {
  buildChecklistSummaryBlock,
  extractChecklistAnswers,
  extractContactProfile,
  generateCumulativeHistory,
  summarizeCallTranscript
} from "@/lib/openai";

function normalizeForSummary(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function hasConversationMessages(transcript: CallMessage[]): boolean {
  return transcript.some(
    (msg) => msg.role === "user" || msg.role === "assistant"
  );
}

function mergeContactProfile(existing: ContactProfile, delta: ContactProfile): ContactProfile {
  const merged = { ...existing };
  const ARRAY_FIELDS: (keyof ContactProfile)[] = [
    "health_conditions", "medications", "family", "interests", "important_dates"
  ];
  const SCALAR_FIELDS: (keyof ContactProfile)[] = [
    "name", "age", "occupation", "living_situation", "mood_tendency"
  ];

  for (const key of SCALAR_FIELDS) {
    const val = delta[key];
    if (val !== undefined && val !== null && val !== "") {
      (merged as Record<string, unknown>)[key] = val;
    }
  }

  for (const key of ARRAY_FIELDS) {
    const deltaArr = delta[key] as string[] | undefined;
    if (Array.isArray(deltaArr) && deltaArr.length > 0) {
      const existingArr = (existing[key] as string[] | undefined) ?? [];
      const combined = [...existingArr, ...deltaArr];
      (merged as Record<string, unknown>)[key] = [...new Set(combined)];
    }
  }

  if (delta.other && typeof delta.other === "object") {
    merged.other = { ...(existing.other ?? {}), ...delta.other };
  }

  return merged;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export async function runCompletedCallPipeline(callSid: string): Promise<void> {
  const call = await findCallBySid(callSid);
  if (!call) {
    return;
  }

  await setCallSummaryStatus(call.id, "pending");

  // transcript가 아직 DB에 저장되지 않았을 수 있으므로 재시도
  let transcript = await getTranscriptForCall(call.id);

  if (!hasConversationMessages(transcript)) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      await sleep(RETRY_DELAY_MS);
      transcript = await getTranscriptForCall(call.id);
      if (hasConversationMessages(transcript)) {
        break;
      }
    }
  }

  // 재시도 후에도 대화 메시지가 없으면 짧은 요약으로 마무리
  if (!hasConversationMessages(transcript)) {
    await setCallSummary(
      call.id,
      "통화가 연결되었으나 대화가 이루어지지 않았습니다. (대화 내용 없음)"
    );
    return;
  }

  const localizedQuestions = await resolveLocalizedQuestionsForCall({
    callLanguage: call.call_language,
    questionSetId: call.question_set_id
  });

  try {
    const extracted = await extractChecklistAnswers({
      callLanguage: call.call_language,
      transcript,
      questions: localizedQuestions
    });

    await replaceCallQuestionAnswers(
      call.id,
      extracted.map((item) => ({
        questionId: item.questionId,
        asked: item.asked,
        answered: item.answered,
        answerText: item.answerText,
        evidenceText: item.evidenceText,
        confidence: item.confidence,
        resolutionStatus: item.resolutionStatus
      }))
    );
  } catch {
    await replaceCallQuestionAnswers(
      call.id,
      localizedQuestions.map((question) => ({
        questionId: question.id,
        asked: false,
        answered: false,
        answerText: "",
        evidenceText: "",
        confidence: null,
        resolutionStatus: "unresolved"
      }))
    );
  }

  try {
    const answers = await listCallQuestionAnswers(call.id);
    const checklistSection = buildChecklistSummaryBlock(
      answers.map((answer) => ({
        questionText: normalizeForSummary(answer.question_text),
        answered: answer.answered,
        answerText: normalizeForSummary(answer.answer_text),
        resolutionStatus: answer.resolution_status
      }))
    );

    const summary = await summarizeCallTranscript({
      contactName: call.contact_name,
      history: transcript,
      callLanguage: call.call_language,
      checklistSection
    });

    await setCallSummary(call.id, summary);

    // --- Profile extraction & cumulative history ---
    try {
      const existingProfile = await getContactProfile(call.contact_id);
      const profileDelta = await extractContactProfile({
        contactName: call.contact_name,
        history: transcript,
        callLanguage: call.call_language,
        existingProfile
      });

      const mergedProfile = mergeContactProfile(existingProfile, profileDelta);
      await setContactProfile(call.contact_id, mergedProfile);

      const callDate = call.ended_at || call.started_at || new Date().toISOString();
      const snippetText = summary.slice(0, 500);
      await insertContactCallHistory({
        contactId: call.contact_id,
        callId: call.id,
        callDate,
        callLanguage: call.call_language,
        summarySnippet: snippetText,
        profileDeltaJson: JSON.stringify(profileDelta)
      });

      const existingHistory = await getContactConversationHistory(call.contact_id);
      const updatedHistory = await generateCumulativeHistory({
        existingHistory,
        newCallSummary: summary,
        callLanguage: call.call_language
      });
      await setContactConversationHistory(call.contact_id, updatedHistory);
    } catch (profileError) {
      console.error("[call-completion] profile/history extraction failed", profileError);
    }
  } catch {
    await setCallSummaryFailure(call.id, "요약 생성에 실패했습니다.");
  }
}
