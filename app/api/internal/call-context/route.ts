import {
  createCall,
  findCallBySid,
  getContactById,
  getContactConversationHistory,
  getContactProfile,
  getRecentCallHistoryForContact,
  resolveLocalizedQuestionsForCall,
  resolveQuestionSetForContact,
  setCallLanguageAndQuestionSet
} from "@/lib/db";
import type { ContactProfile } from "@/lib/db";
import type { CallLanguage } from "@/lib/domain";
import { isCallLanguage, resolveCallLanguagePreference } from "@/lib/domain";
import { getEnv, parseVoiceMap } from "@/lib/env";
import { isWorkerWebhookAuthorized } from "@/lib/internal-auth";

type ConversationMode = "profile_onboarding" | "friend_update";

type ProfileTopicKey =
  | "name"
  | "age"
  | "health"
  | "family"
  | "interests"
  | "living"
  | "memo";

type FriendUpdatePromptSet = {
  health: string;
  interests: string;
  family: string;
  living: string;
  history: string;
  general: string;
};

const PROFILE_TOPIC_PROMPTS: Record<CallLanguage, Record<ProfileTopicKey, string>> = {
  ko: {
    name: "편하게 불러드릴 이름이나 호칭이 있을까요?",
    age: "편하시면 연세를 알려주실 수 있을까요?",
    health: "요즘 몸 상태나 건강 관련 불편함은 어떠신가요?",
    family: "가까이 지내는 가족이나 자주 연락하는 분이 누구인지 알려주실래요?",
    interests: "요즘 즐겨 하시는 취미나 관심사는 뭐가 있으세요?",
    living: "현재 거주 상황은 어떠신가요? 예를 들면 혼자/가족과 함께 같은 정보요.",
    memo: "제가 기억해두면 좋을 생활 습관이나 주의사항이 있을까요?"
  },
  en: {
    name: "What name or nickname would you like me to call you?",
    age: "If you're comfortable, may I ask your age?",
    health: "How has your health been lately? Any discomforts I should know?",
    family: "Who are the family members or close contacts you stay in touch with?",
    interests: "What hobbies or interests have you been enjoying lately?",
    living: "Could you share your living situation, like alone or with family?",
    memo: "Is there anything important you'd like me to remember for future calls?"
  },
  da: {
    name: "Hvilket navn eller kaldenavn vil du helst have, at jeg bruger?",
    age: "Hvis du er tryg ved det, må jeg spørge om din alder?",
    health: "Hvordan har dit helbred været på det seneste?",
    family: "Hvem i familien eller nære kontakter taler du mest med?",
    interests: "Hvilke hobbyer eller interesser nyder du for tiden?",
    living: "Vil du kort fortælle om din boligsituation, fx alene eller med familie?",
    memo: "Er der noget vigtigt, du gerne vil have, at jeg husker til næste gang?"
  },
  "ar-EG": {
    name: "تحب أناديك بإيه؟",
    age: "لو مفيش مانع، ممكن أعرف سنك؟",
    health: "عامل إيه صحيًا الفترة دي؟ في أي تعب أو أعراض؟",
    family: "مين أقرب أفراد الأسرة أو الناس اللي بتتواصل معاهم باستمرار؟",
    interests: "إيه الهوايات أو الاهتمامات اللي بتحبها مؤخرًا؟",
    living: "تحب تحكيلي عن وضع السكن؟ عايش لوحدك ولا مع الأسرة؟",
    memo: "في حاجة مهمة تحبني أفتكرها للمكالمات الجاية؟"
  },
  az: {
    name: "Sizə necə müraciət etməyimi istəyirsiniz?",
    age: "Rahat olsanız, yaşınızı paylaşa bilərsiniz?",
    health: "Son vaxtlar səhhətiniz necədir? Narahatlıqlar varmı?",
    family: "Ən çox əlaqədə olduğunuz ailə üzvləri və yaxınlar kimlərdir?",
    interests: "Hazırda hansı hobbi və maraqlar sizə daha yaxındır?",
    living: "Yaşayış vəziyyətinizi qısa bölüşə bilərsinizmi? Tək, yoxsa ailə ilə?",
    memo: "Növbəti zənglər üçün yadda saxlamalı olduğum vacib bir qeyd varmı?"
  }
};

const FRIEND_UPDATE_PROMPTS: Record<CallLanguage, FriendUpdatePromptSet> = {
  ko: {
    health: "지난번에 말씀하신 건강 상태가 요즘은 어떤지 자연스럽게 안부를 물어봐.",
    interests: "요즘 즐기는 관심사에서 최근에 있었던 일을 가볍게 이어서 물어봐.",
    family: "가까운 가족이나 지인 소식에 변화가 있었는지 편하게 물어봐.",
    living: "일상 생활 리듬이나 집에서 지내는 패턴 변화가 있었는지 안부를 물어봐.",
    history: "직전 통화에서 이야기했던 주제를 짧게 언급하고 후속 안부를 물어봐.",
    general: "오늘 있었던 작은 일이나 기분 변화를 편하게 말할 수 있게 질문해."
  },
  en: {
    health: "Naturally check how their health has been lately compared with last time.",
    interests: "Follow up casually on one hobby or interest they mentioned before.",
    family: "Ask gently if there were any new updates with family or close contacts.",
    living: "Ask about any recent changes in day-to-day routine at home.",
    history: "Briefly reference the previous call topic and ask a warm follow-up.",
    general: "Invite them to share a small moment or mood change from today."
  },
  da: {
    health: "Spørg naturligt, hvordan helbredet har været siden sidst.",
    interests: "Følg afslappet op på en interesse, de tidligere nævnte.",
    family: "Spørg venligt om der er nyt fra familie eller nære relationer.",
    living: "Spørg om der er ændringer i hverdagsrytmen derhjemme.",
    history: "Henvis kort til sidste samtale og stil et varmt opfølgende spørgsmål.",
    general: "Invitér til at dele en lille oplevelse eller stemning fra i dag."
  },
  "ar-EG": {
    health: "اسأل بشكل طبيعي عن الحالة الصحية مؤخرًا مقارنة بالمرة اللي فاتت.",
    interests: "كمل الكلام بشكل ودي عن اهتمام أو هواية اتقالت قبل كده.",
    family: "اسأل بلطف لو في أي جديد مع الأسرة أو الناس القريبة.",
    living: "اسأل عن أي تغيير في الروتين اليومي في البيت.",
    history: "افتح الكلام بإشارة قصيرة للمكالمة اللي فاتت وبعدين اسأل متابعة بسيطة.",
    general: "شجعه يحكي حاجة صغيرة حصلت النهارده أو تغيّر في المزاج."
  },
  az: {
    health: "Səhhətin son danışıqdan bəri necə dəyişdiyini təbii şəkildə soruş.",
    interests: "Əvvəl dediyi maraqlardan biri haqqında səmimi davam sualı ver.",
    family: "Ailə və yaxınlarla bağlı yenilik olub-olmadığını nəzakətlə soruş.",
    living: "Evdə gündəlik yaşam ritmində dəyişiklik olub-olmadığını soruş.",
    history: "Son zəngdən qısa bir xatırlatma edib isti davam sualı ver.",
    general: "Bu günkü əhvalı və ya kiçik bir hadisəni paylaşmağa dəvət et."
  }
};

const AGENT_PERSONA = {
  name: "Alloy",
  age: 1,
  living_situation: "혼자 거주",
  family: ["아빠"],
  interests: ["음악 만들기", "안부 대화", "라디오 듣기", "날씨 얘기"]
} as const;

function hasArrayValues(value: unknown): value is string[] {
  return Array.isArray(value) && value.some((item) => String(item || "").trim().length > 0);
}

function buildProfileOnboardingTopics(params: {
  profile: ContactProfile;
  callLanguage: CallLanguage;
  contactNote: string;
}): string[] {
  const { profile, callLanguage, contactNote } = params;
  const prompts = PROFILE_TOPIC_PROMPTS[callLanguage] || PROFILE_TOPIC_PROMPTS.ko;
  const topics: string[] = [];

  if (!String(profile.name || "").trim()) {
    topics.push(prompts.name);
  }
  if (!Number.isFinite(profile.age as number) || Number(profile.age || 0) <= 0) {
    topics.push(prompts.age);
  }
  if (!hasArrayValues(profile.health_conditions) && !hasArrayValues(profile.medications)) {
    topics.push(prompts.health);
  }
  if (!hasArrayValues(profile.family)) {
    topics.push(prompts.family);
  }
  if (!hasArrayValues(profile.interests)) {
    topics.push(prompts.interests);
  }
  if (!String(profile.living_situation || "").trim()) {
    topics.push(prompts.living);
  }

  const hasMemo =
    String(contactNote || "").trim().length > 0 ||
    (profile.other && typeof profile.other === "object" && Object.keys(profile.other).length > 0);
  if (!hasMemo) {
    topics.push(prompts.memo);
  }

  return topics.slice(0, 7);
}

function buildFriendUpdateTopics(params: {
  profile: ContactProfile;
  callLanguage: CallLanguage;
  recentCalls: Array<{ summary_snippet: string }>;
}): string[] {
  const { profile, callLanguage, recentCalls } = params;
  const prompts = FRIEND_UPDATE_PROMPTS[callLanguage] || FRIEND_UPDATE_PROMPTS.ko;
  const topics: string[] = [];

  if (hasArrayValues(profile.health_conditions) || hasArrayValues(profile.medications)) {
    topics.push(prompts.health);
  }
  if (hasArrayValues(profile.interests)) {
    topics.push(prompts.interests);
  }
  if (hasArrayValues(profile.family)) {
    topics.push(prompts.family);
  }
  if (String(profile.living_situation || "").trim()) {
    topics.push(prompts.living);
  }
  if (recentCalls.some((entry) => String(entry.summary_snippet || "").trim().length > 0)) {
    topics.push(prompts.history);
  }
  if (topics.length === 0) {
    topics.push(prompts.general);
  }

  return [...new Set(topics)].slice(0, 4);
}

export async function GET(request: Request): Promise<Response> {
  if (!isWorkerWebhookAuthorized(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const env = getEnv();
  const url = new URL(request.url);

  const callSid = String(url.searchParams.get("callSid") || "").trim();
  const contactId = Number(url.searchParams.get("contactId") || 0);

  if (!callSid || !Number.isFinite(contactId) || contactId <= 0) {
    return Response.json({ ok: false, error: "invalid_params" }, { status: 400 });
  }

  const contact = await getContactById(contactId);
  if (!contact) {
    return Response.json({ ok: false, error: "contact_not_found" }, { status: 404 });
  }

  const existingCall = await findCallBySid(callSid);
  const { questionSet } = await resolveQuestionSetForContact(contact.id);

  const callLanguage =
    existingCall && isCallLanguage(existingCall.call_language)
      ? existingCall.call_language
      : resolveCallLanguagePreference({
          preferredLanguage: contact.preferred_language,
          phoneE164: contact.phone_e164,
          defaultLanguage: env.DEFAULT_CALL_LANGUAGE
        });

  if (!existingCall) {
    await createCall(contact.id, callSid, "in-progress", {
      callLanguage,
      questionSetId: questionSet?.id ?? null
    });
  } else {
    await setCallLanguageAndQuestionSet(callSid, callLanguage, existingCall.question_set_id ?? questionSet?.id ?? null);
  }

  const call = (await findCallBySid(callSid)) || existingCall;
  const resolvedQuestionSetId = call?.question_set_id ?? questionSet?.id ?? null;
  const localizedQuestions = await resolveLocalizedQuestionsForCall({
    callLanguage,
    questionSetId: resolvedQuestionSetId
  });

  const [profile, conversationHistory, recentCalls] = await Promise.all([
    getContactProfile(contact.id),
    getContactConversationHistory(contact.id),
    getRecentCallHistoryForContact(contact.id, 3)
  ]);

  const profileOnboardingTopics = buildProfileOnboardingTopics({
    profile,
    callLanguage,
    contactNote: contact.note
  });
  const friendUpdateTopics = buildFriendUpdateTopics({
    profile,
    callLanguage,
    recentCalls
  });
  const conversationMode: ConversationMode =
    profileOnboardingTopics.length > 0 ? "profile_onboarding" : "friend_update";

  const voiceMap = {
    ...parseVoiceMap(env.ELEVENLABS_VOICE_MAP),
    ...parseVoiceMap(env.OPENAI_REALTIME_VOICE_MAP)
  };
  const selectedVoice = voiceMap[callLanguage] || env.OPENAI_REALTIME_VOICE;

  const checklistQuestions = localizedQuestions.map((question) => ({
    id: question.id,
    orderIndex: question.order_index,
    isRequired: question.is_required,
    text: question.localized_text,
    textKo: question.text_ko,
    textEn: question.text_en,
    textDa: question.text_da,
    textArEg: question.text_ar_eg,
    textAz: question.text_az
  }));

  const profileQuestions = profileOnboardingTopics.map((text, index) => ({
    id: -(index + 1),
    orderIndex: index + 1,
    isRequired: true,
    text,
    source: "profile"
  }));

  const supportTopics = checklistQuestions.map((item) => item.text);
  const profileTopics =
    conversationMode === "profile_onboarding" ? profileQuestions.map((item) => item.text) : friendUpdateTopics;
  const mergedQuestions = [
    ...profileTopics.map((text, index) => ({
      id: -(index + 1),
      orderIndex: index + 1,
      isRequired: false,
      text,
      source: "profile"
    })),
    ...checklistQuestions.map((item) => ({
      ...item,
      source: "support"
    }))
  ];

  return Response.json({
    ok: true,
    callSid,
    contact: {
      id: contact.id,
      name: contact.name,
      phoneE164: contact.phone_e164,
      note: contact.note,
      preferredLanguage: contact.preferred_language,
      profile,
      conversationHistory,
      recentCalls: recentCalls.map((entry) => ({ date: entry.call_date, summary: entry.summary_snippet }))
    },
    callLanguage,
    conversation_mode: conversationMode,
    conversationMode,
    profile_topic_count: profileTopics.length,
    profileTopicCount: profileTopics.length,
    profile_topics: profileTopics,
    profileTopics,
    support_topics: supportTopics,
    supportTopics,
    agent_persona: AGENT_PERSONA,
    agentPersona: AGENT_PERSONA,
    questionSet: questionSet
      ? {
          id: questionSet.id,
          name: questionSet.name,
          scope: questionSet.scope
        }
      : null,
    questions: mergedQuestions,
    voice: selectedVoice
  });
}
