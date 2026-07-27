/**
 * Skill Loader — carrega skills resumidas do brain/skills/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILLS_DIR = path.join(__dirname, '..', '..', 'brain', 'skills');

const cache = {};

export function loadSkills(agent) {
  if (cache[agent]) return cache[agent];

  const dir = path.join(SKILLS_DIR, agent);
  if (!fs.existsSync(dir)) { cache[agent] = ''; return ''; }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  if (!files.length) { cache[agent] = ''; return ''; }

  const skills = files.map(f => {
    const content = fs.readFileSync(path.join(dir, f), 'utf-8');
    const clean = content.replace(/^---[\s\S]*?---\n*/m, '').trim();
    const summary = clean.substring(0, 300).replace(/\n+/g, ' — ').trim();
    return `${f.replace('.md', '')}: ${summary}`;
  }).join('\n');

  cache[agent] = `\n[SKILLS/${agent.toUpperCase()}]\n${skills}\n`;
  return cache[agent];
}

export function loadSkillNames(agent) {
  const dir = path.join(SKILLS_DIR, agent);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
}
