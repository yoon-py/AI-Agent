import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import QuestionList from "./QuestionList";
import {
  addQuestion,
  createQuestionSet,
  deleteQuestion,
  ensureDefaultQuestionSet,
  listContacts,
  listQuestionSets,
  listQuestionsForSet,
  setQuestionSetActive
} from "@/lib/db";

export const dynamic = "force-dynamic";

type SearchParamsValue = string | string[] | undefined;
type SearchParamsObject = Record<string, SearchParamsValue>;

function getParam(params: unknown, key: string): string {
  if (!params || typeof params !== "object") {
    return "";
  }
  if (params instanceof URLSearchParams) {
    return params.get(key) ?? "";
  }
  const value = (params as SearchParamsObject)[key];
  return typeof value === "string" ? value : "";
}

function scopeLabel(scope: "global" | "contact"): string {
  return scope === "global" ? "전체 공통" : "연락처 전용";
}

function normalizeLegacyState(state: string, message: string): { state: string; message: string } {
  if (state) {
    return { state, message };
  }
  return { state: "", message: "" };
}

function stateMessage(state: string, message: string): string {
  const map: Record<string, string> = {
    question_set_saved: "질문 세트를 저장했습니다.",
    question_set_toggled: "질문 세트 상태를 변경했습니다.",
    question_saved: "질문을 추가했습니다.",
    question_deleted: "질문을 삭제했습니다."
  };

  if (state === "error") {
    return `오류: ${message || "알 수 없는 문제가 발생했습니다."}`;
  }

  return map[state] || (message ? `${state} (${message})` : state);
}

async function createQuestionSetAction(formData: FormData): Promise<void> {
  "use server";

  const name = String(formData.get("name") || "").trim();
  const scope = String(formData.get("scope") || "global").trim();
  const contactId = Number(formData.get("contactId") || 0);

  if (!name) {
    redirect("/questions?state=error&message=질문 세트 이름을 입력해주세요.");
  }

  try {
    await createQuestionSet({
      name,
      scope: scope === "contact" ? "contact" : "global",
      contactId: scope === "contact" && Number.isFinite(contactId) && contactId > 0 ? contactId : null,
      isActive: true
    });
    revalidatePath("/questions");
    redirect("/questions?state=question_set_saved");
  } catch (error) {
    const message = error instanceof Error ? error.message : "질문 세트 저장에 실패했습니다.";
    redirect(`/questions?state=error&message=${encodeURIComponent(message)}`);
  }
}

async function activateQuestionSetAction(formData: FormData): Promise<void> {
  "use server";

  const questionSetId = Number(formData.get("questionSetId") || 0);
  const isActive = String(formData.get("isActive") || "") === "1";

  if (!Number.isFinite(questionSetId) || questionSetId <= 0) {
    redirect("/questions?state=error&message=유효하지 않은 질문 세트입니다.");
  }

  await setQuestionSetActive(questionSetId, isActive);
  revalidatePath("/questions");
  redirect("/questions?state=question_set_toggled");
}

async function addQuestionAction(formData: FormData): Promise<void> {
  "use server";

  const questionSetId = Number(formData.get("questionSetId") || 0);
  const textKo = String(formData.get("textKo") || "").trim();

  if (!Number.isFinite(questionSetId) || questionSetId <= 0) {
    redirect("/questions?state=error&message=유효하지 않은 질문 세트입니다.");
  }
  if (!textKo) {
    redirect("/questions?state=error&message=한국어 질문은 필수입니다.");
  }

  await addQuestion({
    questionSetId,
    orderIndex: 0,
    isRequired: String(formData.get("isRequired") || "") === "on",
    isActive: true,
    textKo,
    textEn: textKo,
    textDa: "",
    textArEg: "",
    textAz: ""
  });

  revalidatePath("/questions");
  redirect("/questions?state=question_saved");
}

async function deleteQuestionAction(formData: FormData): Promise<void> {
  "use server";

  const questionId = Number(formData.get("questionId") || 0);
  if (!Number.isFinite(questionId) || questionId <= 0) {
    redirect("/questions?state=error&message=유효하지 않은 질문입니다.");
  }

  await deleteQuestion(questionId);
  revalidatePath("/questions");
  redirect("/questions?state=question_deleted");
}

export default async function QuestionsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParamsObject | undefined>;
}) {
  await ensureDefaultQuestionSet();

  const params = searchParams ? await searchParams : undefined;
  const rawState = getParam(params, "state");
  const rawMessage = getParam(params, "message");
  const { state, message } = normalizeLegacyState(rawState, rawMessage);

  const [contacts, questionSets] = await Promise.all([
    listContacts(),
    listQuestionSets({ includeInactive: true })
  ]);

  const questionEntries = await Promise.all(
    questionSets.map(async (set) => ({
      setId: set.id,
      questions: await listQuestionsForSet(set.id, false)
    }))
  );

  const questionsBySet = new Map<number, (typeof questionEntries)[number]["questions"]>();
  for (const entry of questionEntries) {
    questionsBySet.set(entry.setId, entry.questions);
  }

  const contactNameById = new Map<number, string>(contacts.map((contact) => [contact.id, contact.name]));

  return (
    <>
      <div className="page-header">
        <h3 className="page-title">
          <span className="page-title-icon bg-gradient-info">❓</span>
          질문 템플릿
        </h3>
        <nav>
          <ul className="breadcrumb">
            <li>홈</li>
            <li className="active">질문 템플릿</li>
          </ul>
        </nav>
      </div>

      {state ? (
        <div className="notice" data-tone={state === "error" ? "error" : "ok"}>
          {stateMessage(state, message)}
        </div>
      ) : null}

      <div className="row row-1">
        <div className="grid-gap">
          <div className="card">
            <div className="card-body">
              <h4 className="card-title">질문 세트 생성</h4>
              <p className="card-description">기본 체크리스트는 자동 생성됩니다. 필요하면 세트를 추가하세요.</p>

              <form action={createQuestionSetAction} className="form-grid form-grid-4">
                <div className="form-group mb-0">
                  <label htmlFor="qsName">세트 이름</label>
                  <input id="qsName" name="name" className="form-control" placeholder="예: 주간 안부 체크" required />
                </div>
                <div className="form-group mb-0">
                  <label htmlFor="qsScope">적용 범위</label>
                  <select id="qsScope" name="scope" className="form-control" defaultValue="global">
                    <option value="global">전체 공통</option>
                    <option value="contact">연락처 전용</option>
                  </select>
                </div>
                <div className="form-group mb-0">
                  <label htmlFor="qsContactId">연락처(전용일 때)</label>
                  <select id="qsContactId" name="contactId" className="form-control" defaultValue="0">
                    <option value="0">선택 안 함</option>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={String(contact.id)}>
                        {contact.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group mb-0" style={{ display: "flex", alignItems: "flex-end" }}>
                  <button className="btn btn-gradient-primary btn-block" type="submit">
                    세트 만들기
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h4 className="card-title">질문 세트 목록</h4>
              <p className="card-description">드래그 앤 드롭으로 질문 순서를 바꿀 수 있습니다.</p>

              <div className="set-list mt-3">
                {questionSets.length === 0 ? (
                  <p className="empty">질문 세트가 없습니다.</p>
                ) : (
                  questionSets.map((set) => {
                    const setQuestions = questionsBySet.get(set.id) || [];
                    const contactName = set.contact_id ? contactNameById.get(set.contact_id) : null;
                    return (
                      <section key={set.id} className="set-card">
                        <div className="set-head">
                          <div>
                            <h3>{set.name}</h3>
                            <p>
                              {scopeLabel(set.scope)}
                              {set.scope === "contact"
                                ? ` · ${contactName ? `${contactName} (ID ${set.contact_id})` : `연락처 ID ${set.contact_id}`}`
                                : ""}
                            </p>
                          </div>
                          <span className={`chip ${set.is_active ? "chip-active" : "chip-muted"}`}>
                            {set.is_active ? "활성" : "비활성"}
                          </span>
                        </div>

                        <div className="d-flex gap-2 flex-wrap mb-2">
                          <form action={activateQuestionSetAction}>
                            <input type="hidden" name="questionSetId" value={String(set.id)} />
                            <input type="hidden" name="isActive" value={set.is_active ? "0" : "1"} />
                            <button className="btn btn-outline-primary btn-sm" type="submit">
                              {set.is_active ? "비활성화" : "활성화"}
                            </button>
                          </form>
                        </div>

                        <hr className="separator" />

                        <form action={addQuestionAction} className="form-grid form-grid-2">
                          <input type="hidden" name="questionSetId" value={String(set.id)} />

                          <div className="form-group form-full mb-0">
                            <label>한국어 질문 (필수)</label>
                            <input name="textKo" className="form-control" placeholder="예: 오늘 식사하셨어요?" required />
                          </div>

                          <div className="form-group mb-0">
                            <label className="form-inline-check">
                              <input type="checkbox" name="isRequired" /> 필수 질문
                            </label>
                          </div>

                          <div className="form-full">
                            <button className="btn btn-outline-primary btn-sm" type="submit">
                              질문 추가
                            </button>
                          </div>
                        </form>

                        <QuestionList
                          questionSetId={set.id}
                          initialQuestions={setQuestions}
                          deleteQuestionAction={deleteQuestionAction}
                        />
                      </section>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
