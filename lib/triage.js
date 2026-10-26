'use strict';
const { db, corporationFor } = require('./store');
const { tok, stem } = require('./search');

const agencyById = (id) => db.agencies.find((a) => a.id === id);

/** Rank civic issues for free text. Returns [{issue, agency, also, score}] */
function triage(text, limit = 3) {
  const lower = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ') + ' ';
  const toks = new Set(tok(text).map(stem));
  const out = [];
  for (const issue of db.issues) {
    let score = 0;
    for (const kw of issue.keywords) {
      if (kw.includes(' ')) { if (lower.includes(' ' + kw + ' ') || lower.includes(kw)) score += 3 + kw.split(' ').length; }
      else if (lower.includes(' ' + kw + ' ')) score += 2.5;
      else if (toks.has(stem(kw))) score += 2;
    }
    const titleToks = tok(issue.title).map(stem);
    titleToks.forEach((t) => { if (toks.has(t)) score += 0.8; });
    if (score > 0) out.push({ issue, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit).map(({ issue, score }) => ({
    score: +score.toFixed(2),
    issue,
    agency: agencyById(issue.agency),
    also: (issue.also || []).map(agencyById).filter(Boolean),
  }));
}

/** Build a ready-to-send complaint letter. */
function draftComplaint({ issueId, area, details, name, landmark, ticket }) {
  const issue = db.issues.find((i) => i.id === issueId);
  if (!issue) return null;
  const agency = agencyById(issue.agency);
  const corp = corporationFor(area);
  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const clean = (s, n = 800) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
  const lines = [];
  lines.push(`Date: ${date}`);
  lines.push('');
  lines.push('To,');
  lines.push(`The Assistant Executive Engineer / Concerned Officer`);
  lines.push(agency.id === 'gba' || agency.id === 'corp'
    ? (corp ? `${corp.corporation} City Corporation, Greater Bengaluru Authority` : 'Greater Bengaluru Authority (Concerned City Corporation / Ward Office)')
    : agency.name);
  lines.push('');
  lines.push(`Subject: Complaint regarding ${issue.title.toLowerCase()} at ${clean(area, 120) || '[area]'}${landmark ? ' (near ' + clean(landmark, 120) + ')' : ''}`);
  lines.push('');
  lines.push('Respected Sir/Madam,');
  lines.push('');
  lines.push(`I am writing to bring to your attention an issue concerning ${issue.title.toLowerCase()} in ${clean(area, 120) || 'my locality'}.`);
  lines.push('');
  lines.push(clean(details) || '[Describe what is happening, since when, and how it affects residents.]');
  lines.push('');
  if (ticket) lines.push(`Reference / ticket number of earlier complaint: ${clean(ticket, 60)}`);
  lines.push('I request you to inspect the location and take corrective action at the earliest, and to share the status of this complaint with me. Photographs and location details are attached/available on request.');
  lines.push('');
  lines.push('Thanking you,');
  lines.push(clean(name, 80) || '[Your name]');
  lines.push('[Phone number]');
  return {
    issue: issue.title,
    agency: agency.name,
    helpline: agency.helpline || null,
    corporation: corp ? corp.corporation : null,
    letter: lines.join('\n'),
    subject: `Complaint: ${issue.title} - ${clean(area, 80) || 'Bengaluru'}`,
  };
}

module.exports = { triage, draftComplaint, agencyById };
