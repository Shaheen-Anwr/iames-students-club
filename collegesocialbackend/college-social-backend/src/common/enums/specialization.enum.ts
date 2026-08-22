import { Department } from './department.enum';

// IEAMS's real program catalog (mirrored on the frontend at src/lib/specializations.ts -- keep
// both in sync).
export enum Specialization {
  // Engineering
  ARCHITECTURE = 'architecture',
  CIVIL_ENGINEERING = 'civil_engineering',
  ELECTRICAL_POWER_ENGINEERING = 'electrical_power_engineering',
  COMMUNICATIONS_ENGINEERING = 'communications_engineering',
  COMPUTER_ENGINEERING = 'computer_engineering',
  // Business Administration
  MEDIA_INSTITUTIONS_MANAGEMENT = 'media_institutions_management',
  ACCOUNTING_FINANCE = 'accounting_finance',
  MARKETING_ADVERTISING = 'marketing_advertising',
  // Media Science
  RADIO_TV_PRODUCTION = 'radio_tv_production',
  FILM_PRODUCTION = 'film_production',
  ADVERTISING_PRODUCTION = 'advertising_production',
  MULTIMEDIA_INTERNET = 'multimedia_internet',
  // General (catch-all, one per department)
  GENERAL_ENGINEERING = 'general_engineering',
  GENERAL_BUSINESS_ADMINISTRATION = 'general_business_administration',
  GENERAL_MEDIA_SCIENCE = 'general_media_science',
}

export const SPECIALIZATIONS_BY_DEPARTMENT: Record<Department, Specialization[]> = {
  [Department.ENGINEERING]: [
    Specialization.ARCHITECTURE,
    Specialization.CIVIL_ENGINEERING,
    Specialization.ELECTRICAL_POWER_ENGINEERING,
    Specialization.COMMUNICATIONS_ENGINEERING,
    Specialization.COMPUTER_ENGINEERING,
    Specialization.GENERAL_ENGINEERING,
  ],
  [Department.BUSINESS_ADMINISTRATION]: [
    Specialization.MEDIA_INSTITUTIONS_MANAGEMENT,
    Specialization.ACCOUNTING_FINANCE,
    Specialization.MARKETING_ADVERTISING,
    Specialization.GENERAL_BUSINESS_ADMINISTRATION,
  ],
  [Department.MEDIA_SCIENCE]: [
    Specialization.RADIO_TV_PRODUCTION,
    Specialization.FILM_PRODUCTION,
    Specialization.ADVERTISING_PRODUCTION,
    Specialization.MULTIMEDIA_INTERNET,
    Specialization.GENERAL_MEDIA_SCIENCE,
  ],
};

export const SPECIALIZATIONS = Object.values(Specialization);
