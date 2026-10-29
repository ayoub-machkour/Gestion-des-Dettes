// Couleurs du logo (bleu marine + bleu), fond clair, bordures fines plutôt que grosses ombres.
export const colors = {
  bg: '#F5F6F8',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F3F6',
  primary: '#1F2E46',
  primaryDark: '#152036',
  primarySoft: '#E8EDF5',
  accent: '#2B7FE0',
  text: '#1A2233',
  textSoft: '#4B5565',
  muted: '#8A93A3',
  border: '#E2E5EA',
  danger: '#C2362B',
  dangerSoft: '#FBECEA',
  success: '#1E7A4F',
  successSoft: '#E6F3EC',
  warning: '#A86400',
  warningSoft: '#FDF1DE',
  white: '#FFFFFF',
  overlay: 'rgba(12,16,24,0.94)',
};

export const radius = { sm: 8, md: 12, lg: 14, xl: 20, round: 999 };

export const font = { xs: 13, sm: 15, md: 17, lg: 20, xl: 26, xxl: 32 };

/** Ombre très légère : les cartes se distinguent surtout par leur bordure. */
export const shadow = {
  shadowColor: '#1A2233',
  shadowOpacity: 0.04,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
};

/** Couleurs d'avatar (fond, texte), choisies selon le nom. */
export const avatarPalette: [string, string][] = [
  ['#E8EDF5', '#1F2E46'],
  ['#E5F0FC', '#1F5FA8'],
  ['#EEF0F3', '#3D4757'],
  ['#E6F3EC', '#1E6B47'],
  ['#FDF1DE', '#8A5300'],
  ['#F3E9F2', '#7A3570'],
];
