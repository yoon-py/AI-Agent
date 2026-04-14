import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { startOutboundCall } from "@/lib/calls";
import {
  createContact,
  deleteContact,
  getContactProfile,
  listContacts,
  setContactProfile,
  updateContact
} from "@/lib/db";
import type { ContactProfile } from "@/lib/db";
import {
  COUNTRIES,
  LANGUAGES,
  getCountryConfig,
  isCallLanguage,
  isSupportedCountry
} from "@/lib/domain";
import { formatPhoneWithFlag, normalizePhoneInput } from "@/lib/phone";

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

function safeMessage(input: string): string {
  return input.replace(/[^a-zA-Z0-9_\-:. ]/g, " ").trim().slice(0, 120);
}

function normalizeLegacyState(state: string, message: string): { state: string; message: string } {
  if (state) {
    return { state, message };
  }
  return { state: "", message: "" };
}

function stateMessage(state: string, message: string): string {
  const map: Record<string, string> = {
    contact_saved: "연락처가 저장되었습니다.",
    contact_deleted: "연락처가 삭제되었습니다.",
    call_started: "통화를 시작했습니다.",
    language_saved: "통화 언어가 저장되었습니다."
  };

  if (state === "error") {
    return `오류: ${message || "알 수 없는 문제가 발생했습니다."}`;
  }

  return map[state] || (message ? `${state} (${message})` : state);
}

function formatDate(value: string): string {
  const date = new Date(value.includes("T") ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function parseCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

async function addContactAction(formData: FormData): Promise<void> {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const countryIso2Raw = String(formData.get("country_iso2") ?? "").trim().toUpperCase();
  const preferredLanguageRaw = String(formData.get("preferred_language") ?? "").trim();

  if (!name || !phoneRaw) {
    redirect("/contacts?state=error&message=이름과 전화번호를 입력해주세요.");
  }

  try {
    const countryIso2 = isSupportedCountry(countryIso2Raw) ? countryIso2Raw : "KR";
    const normalized = normalizePhoneInput({
      countryIso2,
      phoneRaw
    });
    const autoLanguage = getCountryConfig(normalized.countryIso2).defaultLanguage;
    const preferredLanguage = isCallLanguage(preferredLanguageRaw)
      ? preferredLanguageRaw
      : autoLanguage;

    const contactId = await createContact({
      name,
      phone: normalized.phoneE164,
      phoneRaw: normalized.phoneRawDigits,
      countryIso2: normalized.countryIso2,
      dialCode: normalized.dialCode,
      preferredLanguage,
      note
    });

    const ageRaw = String(formData.get("age") ?? "").trim();
    const age = ageRaw ? Number(ageRaw) : undefined;
    const healthConditions = parseCommaSeparated(String(formData.get("health_conditions") ?? ""));
    const medications = parseCommaSeparated(String(formData.get("medications") ?? ""));
    const family = parseCommaSeparated(String(formData.get("family") ?? ""));
    const interests = parseCommaSeparated(String(formData.get("interests") ?? ""));
    const livingSituation = String(formData.get("living_situation") ?? "").trim();

    const profile: ContactProfile = {};
    if (age && Number.isFinite(age) && age > 0) {
      profile.age = age;
    }
    if (healthConditions.length > 0) {
      profile.health_conditions = healthConditions;
    }
    if (medications.length > 0) {
      profile.medications = medications;
    }
    if (family.length > 0) {
      profile.family = family;
    }
    if (interests.length > 0) {
      profile.interests = interests;
    }
    if (livingSituation) {
      profile.living_situation = livingSituation;
    }

    if (Object.keys(profile).length > 0) {
      await setContactProfile(contactId, profile);
    }

    revalidatePath("/");
    revalidatePath("/contacts");
    revalidatePath("/calls");
    revalidatePath("/summaries");
    redirect("/contacts?state=contact_saved");
  } catch (error) {
    const message = error instanceof Error ? error.message : "연락처 저장에 실패했습니다.";
    redirect(`/contacts?state=error&message=${encodeURIComponent(message)}`);
  }
}

async function deleteContactAction(formData: FormData): Promise<void> {
  "use server";

  const contactId = Number(formData.get("contactId"));
  if (!Number.isFinite(contactId) || contactId <= 0) {
    redirect("/contacts?state=error&message=유효하지 않은 연락처입니다.");
  }

  await deleteContact(contactId);
  revalidatePath("/");
  revalidatePath("/contacts");
  revalidatePath("/calls");
  revalidatePath("/summaries");
  redirect("/contacts?state=contact_deleted");
}

async function startCallAction(formData: FormData): Promise<void> {
  "use server";

  const contactId = Number(formData.get("contactId"));

  if (!Number.isFinite(contactId) || contactId <= 0) {
    redirect("/contacts?state=error&message=유효하지 않은 연락처입니다.");
  }

  const result = await startOutboundCall(contactId);

  if (!result.ok) {
    redirect(`/contacts?state=error&message=${encodeURIComponent(safeMessage(result.error))}`);
  }

  revalidatePath("/");
  revalidatePath("/contacts");
  revalidatePath("/calls");
  redirect("/contacts?state=call_started");
}

async function saveLanguageAction(formData: FormData): Promise<void> {
  "use server";

  const contactId = Number(formData.get("contactId"));
  const preferredLanguage = String(formData.get("preferredLanguage") ?? "").trim();

  if (!Number.isFinite(contactId) || contactId <= 0) {
    redirect("/contacts?state=error&message=유효하지 않은 연락처입니다.");
  }
  if (!isCallLanguage(preferredLanguage)) {
    redirect("/contacts?state=error&message=유효하지 않은 언어 코드입니다.");
  }

  await updateContact({
    id: contactId,
    preferredLanguage
  });

  revalidatePath("/");
  revalidatePath("/contacts");
  revalidatePath("/calls");
  revalidatePath("/summaries");
  redirect("/contacts?state=language_saved");
}

export default async function ContactsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParamsObject | undefined>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const rawState = getParam(params, "state");
  const rawMessage = getParam(params, "message");
  const { state, message } = normalizeLegacyState(rawState, rawMessage);

  const contacts = await listContacts();
  const contactProfiles = await Promise.all(
    contacts.map(async (contact) => {
      const profile = await getContactProfile(contact.id);
      return { contactId: contact.id, profile };
    })
  );
  const profileMap = new Map(contactProfiles.map((item) => [item.contactId, item.profile]));

  return (
    <>
      <div className="page-header">
        <h3 className="page-title">
          <span className="page-title-icon bg-gradient-danger">👤</span>
          연락처 관리
        </h3>
        <nav>
          <ul className="breadcrumb">
            <li>홈</li>
            <li className="active">연락처 관리</li>
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
              <h4 className="card-title">연락처 등록</h4>
              <p className="card-description">
                국가/전화번호 기반으로 언어가 자동 추천됩니다. 필요하면 수동 언어를 선택할 수 있고, 비워둔 프로필 항목은 통화 중 Alloy가 자연스럽게 대화 속에서 파악합니다.
              </p>

              <form action={addContactAction} className="form-grid form-grid-2">
                <div className="form-group mb-0">
                  <label htmlFor="name">이름</label>
                  <input id="name" name="name" className="form-control" placeholder="예: 김윤환" required />
                </div>

                <div className="form-group mb-0">
                  <label htmlFor="phone">전화번호</label>
                  <input id="phone" name="phone" className="form-control" placeholder="예: 01012345678 또는 +12674407862" required />
                </div>

                <div className="form-group mb-0">
                  <label htmlFor="country_iso2">국가 (국내번호 입력 시 기준)</label>
                  <select id="country_iso2" name="country_iso2" className="form-control" defaultValue="KR">
                    {COUNTRIES.map((country) => (
                      <option key={country.iso2} value={country.iso2}>
                        {country.iso2} ({country.dialCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group mb-0">
                  <label htmlFor="preferred_language">통화 언어 (선택)</label>
                  <select id="preferred_language" name="preferred_language" className="form-control" defaultValue="">
                    <option value="">자동 (전화번호 국가코드 기준)</option>
                    {LANGUAGES.map((language) => (
                      <option key={language.code} value={language.code}>
                        {language.code} ({language.nameEn})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group mb-0">
                  <label htmlFor="age">나이</label>
                  <input id="age" name="age" type="number" min="1" max="150" className="form-control" placeholder="예: 78" />
                </div>

                <div className="form-group mb-0">
                  <label htmlFor="living_situation">거주 상황</label>
                  <input id="living_situation" name="living_situation" className="form-control" placeholder="예: 혼자 거주, 배우자와 동거" />
                </div>

                <div className="form-group mb-0">
                  <label htmlFor="health_conditions">건강 상태</label>
                  <input id="health_conditions" name="health_conditions" className="form-control" placeholder="쉼표 구분. 예: 무릎통증, 당뇨" />
                </div>

                <div className="form-group mb-0">
                  <label htmlFor="medications">복용 약물</label>
                  <input id="medications" name="medications" className="form-control" placeholder="쉼표 구분. 예: 혈압약, 당뇨약" />
                </div>

                <div className="form-group mb-0">
                  <label htmlFor="family">가족 관계</label>
                  <input id="family" name="family" className="form-control" placeholder="쉼표 구분. 예: 서울 딸, 5살 손자" />
                </div>

                <div className="form-group mb-0">
                  <label htmlFor="interests">관심사</label>
                  <input id="interests" name="interests" className="form-control" placeholder="쉼표 구분. 예: 정원가꾸기, 바둑" />
                </div>

                <div className="form-group form-full mb-0">
                  <label htmlFor="note">메모 (선택)</label>
                  <textarea id="note" name="note" className="form-control" placeholder="예: 통화 선호 시간, 주의사항" />
                </div>

                <div className="form-full">
                  <button className="btn btn-gradient-primary" type="submit">
                    연락처 저장
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h4 className="card-title">연락처 목록</h4>
              <p className="card-description">삭제 시 실제 제거되며, 통화 버튼으로 즉시 발신할 수 있습니다.</p>

              {contacts.length === 0 ? (
                <p className="empty">등록된 연락처가 없습니다.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table-hover">
                    <thead>
                      <tr>
                        <th>이름</th>
                        <th>전화번호</th>
                        <th>통화 언어</th>
                        <th>프로필</th>
                        <th>메모</th>
                        <th>등록일</th>
                        <th>작업</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((contact) => {
                        const phoneDisplay = formatPhoneWithFlag(contact.phone_e164);
                        const profile = profileMap.get(contact.id);
                        const profileParts: string[] = [];
                        if (profile?.age) {
                          profileParts.push(`${profile.age}세`);
                        }
                        if (profile?.living_situation) {
                          profileParts.push(profile.living_situation);
                        }
                        if (profile?.health_conditions && profile.health_conditions.length > 0) {
                          profileParts.push(profile.health_conditions.join(", "));
                        }
                        if (profile?.interests && profile.interests.length > 0) {
                          profileParts.push(profile.interests.join(", "));
                        }
                        const profileSummary = profileParts.join(" / ") || "-";

                        return (
                          <tr key={contact.id}>
                            <td><strong>{contact.name}</strong></td>
                            <td className="text-small">
                              <span className="phone-with-flag">
                                <span className="phone-flag">{phoneDisplay.flag}</span>
                                <span>{phoneDisplay.number}</span>
                              </span>
                            </td>
                            <td className="text-small">
                              <form action={saveLanguageAction} className="d-flex gap-2 flex-wrap align-items-center">
                                <input type="hidden" name="contactId" value={String(contact.id)} />
                                <select
                                  name="preferredLanguage"
                                  className="form-control form-control-sm"
                                  defaultValue={contact.preferred_language}
                                >
                                  {LANGUAGES.map((language) => (
                                    <option key={language.code} value={language.code}>
                                      {language.code}
                                    </option>
                                  ))}
                                </select>
                                <button className="btn btn-outline-primary btn-xs" type="submit">
                                  저장
                                </button>
                              </form>
                            </td>
                            <td className="text-small">{profileSummary}</td>
                            <td className="text-small">{contact.note || "-"}</td>
                            <td className="text-small">{formatDate(contact.created_at)}</td>
                            <td>
                              <div className="d-flex gap-2 flex-wrap">
                                <form action={startCallAction}>
                                  <input type="hidden" name="contactId" value={String(contact.id)} />
                                  <button className="btn btn-gradient-success btn-xs" type="submit">
                                    통화
                                  </button>
                                </form>
                                <form action={deleteContactAction}>
                                  <input type="hidden" name="contactId" value={String(contact.id)} />
                                  <button className="btn btn-outline-danger btn-xs" type="submit">
                                    삭제
                                  </button>
                                </form>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
