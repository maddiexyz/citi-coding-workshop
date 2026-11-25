import { apiRequest } from './api';

/**
 * An AI briefing of a project, in two steps:
 * 1. the projects service (next to the database) returns the project's facts,
 *    signed for this user for two minutes;
 * 2. the ai service (outside the VPC, where it can reach the model API) checks
 *    the signature, asks Gemini and keeps only the points that cite those facts.
 * @param {number|string} projectId
 * @returns {Promise<{status: string, headline: string, points: Array<{text: string, sources: string[]}>,
 *   actions: Array<{text: string, sources: string[]}>, facts: Array<{id: string, label: string, text: string}>,
 *   model: string, generated_at: string}>}
 */
export async function generateBriefing(projectId) {
  const signed = await apiRequest(`/projects/${projectId}/briefing-facts`, { method: 'POST' });
  return apiRequest('/ai/briefing', { method: 'POST', body: signed });
}

/**
 * The briefing as plain text, for pasting into an email or chat.
 * @param {{headline: string, points: Array<{text: string}>, actions: Array<{text: string}>}} briefing
 * @param {string} projectName
 * @returns {string}
 */
export function briefingText(briefing, projectName) {
  const lines = [`${projectName}: ${briefing.headline}`, '', ...briefing.points.map((p) => `- ${p.text}`)];
  if (briefing.actions.length) {
    lines.push('', 'Next steps:', ...briefing.actions.map((a, i) => `${i + 1}. ${a.text}`));
  }
  lines.push('', '(AI-generated from the project tracker; check before sharing.)');
  return lines.join('\n');
}
