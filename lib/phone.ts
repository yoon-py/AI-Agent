import type { CountryCode } from "libphonenumber-js";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { SupportedCountry } from "@/lib/domain";
import { getCountryConfig, inferCountryFromPhoneE164, isSupportedCountry } from "@/lib/domain";

export type NormalizedPhone = {
  countryIso2: SupportedCountry;
  dialCode: string;
  phoneRawDigits: string;
  phoneE164: string;
};

export type FlagPhoneDisplay = {
  flag: string;
  number: string;
};

const COUNTRY_FLAG_BY_ISO2: Record<SupportedCountry, string> = {
  KR: "🇰🇷",
  US: "🇺🇸",
  DK: "🇩🇰",
  AZ: "🇦🇿",
  EG: "🇪🇬"
};

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizePhoneInput(params: {
  countryIso2?: SupportedCountry;
  phoneRaw: string;
}): NormalizedPhone {
  const countryIso2 = params.countryIso2 ?? "KR";
  const phoneRaw = params.phoneRaw.trim();
  const rawDigits = digitsOnly(phoneRaw);
  if (!rawDigits) {
    throw new Error("Phone number is required.");
  }

  const useInternationalParse = phoneRaw.startsWith("+");
  const parsed = useInternationalParse
    ? parsePhoneNumberFromString(phoneRaw)
    : parsePhoneNumberFromString(rawDigits, countryIso2 as CountryCode);
  if (!parsed || !parsed.isValid()) {
    throw new Error("Invalid phone number for selected country.");
  }

  const parsedCountry = parsed.country?.toUpperCase() || "";
  const resolvedCountry = isSupportedCountry(parsedCountry)
    ? parsedCountry
    : inferCountryFromPhoneE164(parsed.number);
  if (!resolvedCountry) {
    throw new Error("Unsupported country code.");
  }

  const country = getCountryConfig(resolvedCountry);
  return {
    countryIso2: resolvedCountry,
    dialCode: country.dialCode,
    phoneRawDigits: digitsOnly(parsed.number),
    phoneE164: parsed.number
  };
}

export function formatPhoneWithFlag(phone: string): FlagPhoneDisplay {
  const normalized = phone.trim();
  if (!normalized) {
    return { flag: "🌐", number: "-" };
  }

  const parsed = parsePhoneNumberFromString(normalized);
  if (parsed && parsed.isValid()) {
    const country = parsed.country?.toUpperCase() || "";
    if (isSupportedCountry(country)) {
      return {
        flag: COUNTRY_FLAG_BY_ISO2[country],
        number: parsed.formatNational()
      };
    }
  }

  const inferredCountry = inferCountryFromPhoneE164(normalized);
  if (inferredCountry) {
    const dialCode = getCountryConfig(inferredCountry).dialCode;
    const numberWithoutCode = normalized.startsWith(dialCode)
      ? normalized.slice(dialCode.length).trim()
      : normalized;
    return {
      flag: COUNTRY_FLAG_BY_ISO2[inferredCountry],
      number: numberWithoutCode || normalized
    };
  }

  return { flag: "🌐", number: normalized };
}
