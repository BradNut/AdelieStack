export const Locales = {
  EN_US: 'en-US',
  EN_GB: 'en-GB',
  FR_FR: 'fr-FR',
  DE_DE: 'de-DE',
  ES_ES: 'es-ES',
  IT_IT: 'it-IT',
  JA_JP: 'ja-JP',
  ZH_CN: 'zh-CN',
  ZH_TW: 'zh-TW',
  RU_RU: 'ru-RU',
  PT_PT: 'pt-PT',
} as const;

export type Locales = (typeof Locales)[keyof typeof Locales];
