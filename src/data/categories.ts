export type CategoryIcon =
  | 'category-layout'
  | 'category-palette'
  | 'category-diamonds'
  | 'category-stack'
  | 'category-browsers';

export interface CategoryConfig {
  label: string;
  bgVar: string;
  icon: CategoryIcon;
}

const categories: Record<string, CategoryConfig> = {
  product:       { label: 'Product Design', bgVar: 'var(--color-blue-accent)',   icon: 'category-layout' },
  productdesign: { label: 'Product Design', bgVar: 'var(--color-blue-accent)',   icon: 'category-layout' },
  design:        { label: 'Design',         bgVar: 'var(--color-blue-accent)',   icon: 'category-layout' },
  designsystem:  { label: 'Design System',  bgVar: 'var(--color-teal-accent)',   icon: 'category-diamonds' },
  branding:      { label: 'Branding',       bgVar: 'var(--color-purple-accent)', icon: 'category-palette' },
  fullstack:     { label: 'Full Stack',     bgVar: 'var(--color-orange-accent)', icon: 'category-stack' },
  webdesign:     { label: 'Web Design',     bgVar: 'var(--color-green-accent)',  icon: 'category-browsers' },
  achievement:   { label: 'Achievement',    bgVar: 'var(--color-text-secondary)', icon: 'category-layout' },
};

const normalizeCategory = (category: string) =>
  category.toLowerCase().replace(/[^a-z0-9]/g, '');

export function getCategoryConfig(category?: string): CategoryConfig | null {
  if (!category) return null;
  return categories[normalizeCategory(category)] ?? {
    label: category,
    bgVar: 'var(--color-text-secondary)',
    icon: 'category-layout',
  };
}
