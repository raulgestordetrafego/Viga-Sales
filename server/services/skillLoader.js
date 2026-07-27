/**
 * Skill Loader — carrega arquivos de skill do brain/skills/
 * Uso: import { loadSkills } from './skillLoader.js'
 *      const skills = loadSkills('chief');
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
    let content = fs.readFileSync(path.join(dir, f), 'utf-8');
    content = content.replace(/^---[\s\S]*?---\n*/m, '').trim();
    return `\n[SKILL: ${f.replace('.md', '')}]\n${content}`;
  }).join('\n');

  cache[agent] = skills;
  return skills;
}

export function loadSkillNames(agent) {
  const dir = path.join(SKILLS_DIR, agent);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
}
