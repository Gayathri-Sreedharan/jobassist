/**
 * JOBASSIST SCRAPER
 * Pulls jobs from official, free, terms-of-service-friendly sources:
 *   - Adzuna (broad search API)
 *   - Greenhouse (per-company public job boards)
 *   - Ashby (per-company public job boards)
 *   - Lever (per-company public job boards)
 *
 * Deliberately does NOT scrape LinkedIn/Naukri directly — those require
 * browser automation against sites whose terms forbid it, which makes them
 * unreliable to maintain solo. Use the manual check step in the guide
 * instead for those two.
 *
 * Run with: node scrape.js
 * Requires environment variables (set in GitHub Actions secrets):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY, ADZUNA_APP_ID, ADZUNA_APP_KEY
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID;
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ---- EDIT THESE TWO LISTS TO CUSTOMIZE WHAT GETS TRACKED -------------------
const ADZUNA_KEYWORDS = [
  'Data Scientist',
  'GenAI Engineer',
  'Machine Learning Engineer',
];

const GREENHOUSE_SLUGS = [
  // 'stripe', 'notion', 'razorpay'  <- add company slugs here
];

const ASHBY_SLUGS = [
  // 'cursor', 'linear'  <- add company slugs here
];

const LEVER_SLUGS = [
  // 'companyname'  <- add company slugs here
];
// -----------------------------------------------------------------------------

function makeKey(company, title, location) {
  return `${company}|${title}|${location}`.toLowerCase().trim();
}

async function fetchAdzuna(keyword) {
  const url = `https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_APP_KEY}&what=${encodeURIComponent(keyword)}&results_per_page=50&content-type=application/json`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.results) return [];
    return data.results.map(job => ({
      company: job.company?.display_name || 'Unknown',
      title: job.title || '',
      location: job.location?.display_name || '',
      job_url: job.redirect_url || '',
      posted_date: job.created ? job.created.substring(0, 10) : null,
      source: 'adzuna',
      experience: null,
      key_skills: null,
      employment_type: job.contract_time || null,
      description: (job.description || '').substring(0, 1000),
    }));
  } catch (e) {
    console.error(`Adzuna error for "${keyword}":`, e.message);
    return [];
  }
}

async function fetchGreenhouse(slug) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.jobs) return [];
    return data.jobs.map(job => ({
      company: slug,
      title: job.title || '',
      location: job.location?.name || '',
      job_url: job.absolute_url || '',
      posted_date: job.updated_at ? job.updated_at.substring(0, 10) : null,
      source: 'greenhouse',
      experience: null,
      key_skills: null,
      employment_type: null,
      description: (job.content || '').replace(/<[^>]*>/g, '').substring(0, 1000),
    }));
  } catch (e) {
    console.error(`Greenhouse error for "${slug}":`, e.message);
    return [];
  }
}

async function fetchAshby(slug) {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.jobs) return [];
    return data.jobs.map(job => ({
      company: slug,
      title: job.title || '',
      location: job.location || '',
      job_url: job.jobUrl || '',
      posted_date: job.publishedAt ? job.publishedAt.substring(0, 10) : null,
      source: 'ashby',
      experience: null,
      key_skills: null,
      employment_type: job.employmentType || null,
      description: (job.descriptionPlain || '').substring(0, 1000),
    }));
  } catch (e) {
    console.error(`Ashby error for "${slug}":`, e.message);
    return [];
  }
}

async function fetchLever(slug) {
  const url = `https://api.lever.co/v0/postings/${slug}?mode=json`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map(job => ({
      company: slug,
      title: job.text || '',
      location: job.categories?.location || '',
      job_url: job.hostedUrl || '',
      posted_date: job.createdAt ? new Date(job.createdAt).toISOString().substring(0, 10) : null,
      source: 'lever',
      experience: null,
      key_skills: null,
      employment_type: job.categories?.commitment || null,
      description: (job.descriptionPlain || '').substring(0, 1000),
    }));
  } catch (e) {
    console.error(`Lever error for "${slug}":`, e.message);
    return [];
  }
}

async function main() {
  console.log('Starting scrape...');
  let allJobs = [];

  for (const kw of ADZUNA_KEYWORDS) {
    allJobs = allJobs.concat(await fetchAdzuna(kw));
  }
  for (const slug of GREENHOUSE_SLUGS) {
    allJobs = allJobs.concat(await fetchGreenhouse(slug));
  }
  for (const slug of ASHBY_SLUGS) {
    allJobs = allJobs.concat(await fetchAshby(slug));
  }
  for (const slug of LEVER_SLUGS) {
    allJobs = allJobs.concat(await fetchLever(slug));
  }

  console.log(`Fetched ${allJobs.length} raw postings. Deduplicating and saving...`);

  // Add unique_key and dedupe within this batch
  const seen = new Set();
  const rows = [];
  for (const job of allJobs) {
    const key = makeKey(job.company, job.title, job.location);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ ...job, unique_key: key });
  }

  // Upsert: insert new jobs, skip ones that already exist (matched by unique_key)
  const { error, count } = await supabase
    .from('jobs')
    .upsert(rows, { onConflict: 'unique_key', ignoreDuplicates: true, count: 'exact' });

  if (error) {
    console.error('Error saving to database:', error.message);
    process.exit(1);
  }

  console.log(`Done. ${rows.length} unique postings processed.`);
}

main();
