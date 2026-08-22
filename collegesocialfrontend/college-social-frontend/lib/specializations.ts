import type { Department } from './departments';

// IEAMS's real program catalog (mirrored on the backend at src/common/enums/specialization.enum.ts
// -- keep both in sync).
export type Specialization =
  | 'architecture'
  | 'civil_engineering'
  | 'electrical_power_engineering'
  | 'communications_engineering'
  | 'computer_engineering'
  | 'media_institutions_management'
  | 'accounting_finance'
  | 'marketing_advertising'
  | 'radio_tv_production'
  | 'film_production'
  | 'advertising_production'
  | 'multimedia_internet'
  | 'general_engineering'
  | 'general_business_administration'
  | 'general_media_science';

export const SPECIALIZATION_LABELS: Record<Specialization, string> = {
  architecture: 'الهندسة المعمارية',
  civil_engineering: 'الهندسة المدنية',
  electrical_power_engineering: 'هندسة القوى والآلات الكهربية',
  communications_engineering: 'هندسة الاتصالات',
  computer_engineering: 'هندسة الحاسبات',
  media_institutions_management: 'إدارة المؤسسات الإعلامية',
  accounting_finance: 'المحاسبة والتمويل',
  marketing_advertising: 'التسويق والإعلان',
  radio_tv_production: 'الإنتاج الإذاعي والتليفزيوني',
  film_production: 'الإنتاج السينمائي',
  advertising_production: 'الإنتاج الإعلاني',
  multimedia_internet: 'الوسائط المتعددة والإنترنت',
  general_engineering: 'عام',
  general_business_administration: 'عام',
  general_media_science: 'عام',
};

export const SPECIALIZATIONS_BY_DEPARTMENT: Record<Department, Specialization[]> = {
  engineering: ['architecture', 'civil_engineering', 'electrical_power_engineering', 'communications_engineering', 'computer_engineering', 'general_engineering'],
  business_administration: ['media_institutions_management', 'accounting_finance', 'marketing_advertising', 'general_business_administration'],
  media_science: ['radio_tv_production', 'film_production', 'advertising_production', 'multimedia_internet', 'general_media_science'],
};

export const SPECIALIZATIONS = Object.keys(SPECIALIZATION_LABELS) as Specialization[];
