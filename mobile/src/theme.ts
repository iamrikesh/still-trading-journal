export const palettes = {
  light: { background: '#F7F6F0', surface: '#FFFFFF', ink: '#25372C', muted: '#58695D', accent: '#365B39', soft: '#E5EDDA', line: '#DDE3D8', error: '#9B362C' },
  dark: { background: '#141C18', surface: '#202B24', ink: '#F0F2E9', muted: '#B0C0B2', accent: '#C0D5A4', soft: '#304132', line: '#3D4E40', error: '#FFB3A7' },
};
export type Appearance = 'system' | 'light' | 'dark';

export type Palette = typeof palettes.light;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, section: 32 } as const;
export const radius = { control: 12, surface: 16 } as const;
export const typography = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: '600' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 18 },
} as const;
