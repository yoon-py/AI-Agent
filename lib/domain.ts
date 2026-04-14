export type SupportedCountry = "KR" | "US" | "DK" | "AZ" | "EG";
export type CallLanguage = "ko" | "en" | "da" | "ar-EG" | "az";

export type CountryConfig = {
  iso2: SupportedCountry;
  nameEn: string;
  dialCode: string;
  defaultLanguage: CallLanguage;
};

export type LanguageConfig = {
  code: CallLanguage;
  nameEn: string;
  promptLabel: string;
  twilioSpeechLanguage: string;
  twilioSayLanguage: string;
};

export const COUNTRIES: CountryConfig[] = [
  { iso2: "KR", nameEn: "South Korea", dialCode: "+82", defaultLanguage: "ko" },
  { iso2: "US", nameEn: "United States", dialCode: "+1", defaultLanguage: "en" },
  { iso2: "DK", nameEn: "Denmark", dialCode: "+45", defaultLanguage: "da" },
  { iso2: "AZ", nameEn: "Azerbaijan", dialCode: "+994", defaultLanguage: "az" },
  { iso2: "EG", nameEn: "Egypt", dialCode: "+20", defaultLanguage: "ar-EG" }
];

export const LANGUAGES: LanguageConfig[] = [
  {
    code: "ko",
    nameEn: "Korean",
    promptLabel: "Korean",
    twilioSpeechLanguage: "ko-KR",
    twilioSayLanguage: "ko-KR"
  },
  {
    code: "en",
    nameEn: "English",
    promptLabel: "English",
    twilioSpeechLanguage: "en-US",
    twilioSayLanguage: "en-US"
  },
  {
    code: "da",
    nameEn: "Danish",
    promptLabel: "Danish",
    twilioSpeechLanguage: "da-DK",
    twilioSayLanguage: "da-DK"
  },
  {
    code: "ar-EG",
    nameEn: "Arabic (Egypt)",
    promptLabel: "Arabic (Egypt)",
    twilioSpeechLanguage: "ar-EG",
    twilioSayLanguage: "ar-EG"
  },
  {
    code: "az",
    nameEn: "Azerbaijani",
    promptLabel: "Azerbaijani",
    twilioSpeechLanguage: "az-AZ",
    twilioSayLanguage: "az-AZ"
  }
];

export function isSupportedCountry(value: string): value is SupportedCountry {
  return COUNTRIES.some((item) => item.iso2 === value);
}

export function isCallLanguage(value: string): value is CallLanguage {
  return LANGUAGES.some((item) => item.code === value);
}

export function getCountryConfig(countryIso2: SupportedCountry): CountryConfig {
  const found = COUNTRIES.find((item) => item.iso2 === countryIso2);
  if (!found) {
    throw new Error(`Unsupported country: ${countryIso2}`);
  }
  return found;
}

export function getLanguageConfig(code: CallLanguage): LanguageConfig {
  const found = LANGUAGES.find((item) => item.code === code);
  if (!found) {
    throw new Error(`Unsupported language: ${code}`);
  }
  return found;
}

function normalizePhoneE164(phoneE164: string): string {
  return phoneE164.trim();
}

export function inferCountryFromPhoneE164(phoneE164: string): SupportedCountry | null {
  const normalized = normalizePhoneE164(phoneE164);
  if (!normalized.startsWith("+")) {
    return null;
  }

  const ordered = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);
  for (const country of ordered) {
    if (normalized.startsWith(country.dialCode)) {
      return country.iso2;
    }
  }

  return null;
}

export function inferLanguageFromPhoneE164(phoneE164: string): CallLanguage | null {
  const countryIso2 = inferCountryFromPhoneE164(phoneE164);
  if (!countryIso2) {
    return null;
  }
  return getCountryConfig(countryIso2).defaultLanguage;
}

export function inferPhoneDefaultsFromE164(phoneE164: string): {
  countryIso2: SupportedCountry;
  dialCode: string;
  preferredLanguage: CallLanguage;
} {
  const countryIso2 = inferCountryFromPhoneE164(phoneE164) || "KR";
  const country = getCountryConfig(countryIso2);
  return {
    countryIso2,
    dialCode: country.dialCode,
    preferredLanguage: country.defaultLanguage
  };
}

export function resolveCallLanguagePreference(params: {
  preferredLanguage?: string | null;
  phoneE164?: string | null;
  defaultLanguage?: string | null;
}): CallLanguage {
  const preferredLanguage = String(params.preferredLanguage || "").trim();
  if (preferredLanguage && isCallLanguage(preferredLanguage)) {
    return preferredLanguage;
  }

  const inferred = inferLanguageFromPhoneE164(String(params.phoneE164 || ""));
  if (inferred) {
    return inferred;
  }

  const fallback = String(params.defaultLanguage || "").trim();
  if (fallback && isCallLanguage(fallback)) {
    return fallback;
  }

  return "ko";
}
