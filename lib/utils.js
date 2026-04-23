const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

function cloneValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function expandUserProfile(value) {
  if (typeof value !== 'string') {
    return value;
  }

  const userProfile = process.env.USERPROFILE || os.homedir();
  return value.replace(/%USERPROFILE%/gi, userProfile);
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
  return dirPath;
}

async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return cloneValue(fallbackValue);
    }
    throw error;
  }
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function csvEscape(value) {
  const normalized = String(value ?? '');
  if (/[",\r\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

async function appendCsvRows(filePath, headers, rows) {
  await ensureDir(path.dirname(filePath));
  const exists = await pathExists(filePath);
  let output = '';

  if (!exists) {
    output += `${headers.map(csvEscape).join(',')}\n`;
  }

  for (const row of rows) {
    output += `${headers.map((header) => csvEscape(row[header])).join(',')}\n`;
  }

  await fsp.appendFile(filePath, output, 'utf8');
}

function sanitizeFileName(name) {
  const normalized = String(name ?? '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  return normalized || 'untitled';
}

function buildFileNameFromTemplate(template, fields) {
  const rendered = String(template ?? '').replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return fields[key] ?? '';
  });
  return sanitizeFileName(rendered);
}

function uniqueBy(items, keySelector) {
  const seen = new Set();
  const results = [];

  for (const item of items) {
    const key = keySelector(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push(item);
  }

  return results;
}

function isPathInside(parentPath, childPath) {
  const normalizedParent = path.resolve(parentPath);
  const normalizedChild = path.resolve(childPath);
  const relative = path.relative(normalizedParent, normalizedChild);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function toIsoTimestamp(date = new Date()) {
  return date.toISOString();
}

function formatDateForRanking(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

function sortByModifiedDesc(items) {
  return [...items].sort((left, right) => {
    return (right.modifiedAtTs ?? 0) - (left.modifiedAtTs ?? 0);
  });
}

function firstLine(value) {
  return String(value ?? '').split(/\r?\n/, 1)[0];
}

module.exports = {
  appendCsvRows,
  buildFileNameFromTemplate,
  cloneValue,
  csvEscape,
  ensureDir,
  expandUserProfile,
  firstLine,
  formatDateForRanking,
  isPathInside,
  pathExists,
  readJson,
  sanitizeFileName,
  sortByModifiedDesc,
  toIsoTimestamp,
  uniqueBy,
  writeJson
};
