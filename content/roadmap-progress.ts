import type { Landing } from './landing-schema';

export function summarizeRoadmapStage(stage: Landing['roadmap']['items'][number]) {
  const fallback = stage.status === 'available' ? 'completed' : 'not-started';
  const tasks = stage.points.map(({ label, status }) => ({ label, status: status ?? fallback }));
  const completed = tasks.filter(({ status }) => status === 'completed').length;
  const total = tasks.length;

  return { tasks, completed, total, percent: total === 0 ? 0 : Math.round(completed / total * 100) };
}
