import type { Landing } from '../../../content/landing-schema';
export interface HeroProps {
  content: Landing['hero'];
  layout?: Landing['layout'];
}
