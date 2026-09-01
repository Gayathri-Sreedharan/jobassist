# JobAssist – Phase 1

## India-Wide Automated Job Sourcing

JobAssist Phase 1 is an automated job sourcing system that collects job postings from Adzuna and stores them in a central Supabase database.

The purpose of this phase is to reduce the manual effort involved in searching for jobs every day.

---

# 1. What does JobAssist do?

In simple terms:

> JobAssist automatically searches for jobs across India, collects the job details, and stores them in a database.

The system searches using multiple job keywords such as:

- Data Scientist
- Data Analyst
- Data Engineer
- Software Engineer
- Software Developer
- Python Developer
- Machine Learning
- Artificial Intelligence
- AI Engineer
- Business Analyst
- DevOps
- Cloud Engineer

---

# 2. How does it work?

The system works like this:

Adzuna
↓
JobAssist Scraper
↓
GitHub Actions
↓
Supabase
↓
Jobs Database

### Adzuna

Provides the job postings.

### Scraper

The scraper is the program that collects the jobs from Adzuna.

### GitHub

Stores the project code.

### GitHub Actions

Runs the scraper automatically without requiring the local computer to be running.

### Supabase

Stores all the collected job information in a database.

---

# 3. Project Structure

The project has the following structure:

jobassist-phase1/

├── .github/
│   └── workflows/
│       └── scrape.yml
│
├── scraper/
│   ├── package.json
│   └── scrape.js
│
├── supabase/
│   └── migrations/
│       └── 001_schema.sql
│
├── .gitignore
└── README.md

---

# 4. What each file does

| File | Purpose |
|---|---|
| `scraper/scrape.js` | Main job scraping program |
| `scraper/package.json` | Defines the Node.js project and dependencies |
| `.github/workflows/scrape.yml` | Tells GitHub Actions how to run the scraper |
| `supabase/migrations/001_schema.sql` | Database structure |
| `.gitignore` | Prevents unnecessary/private files from being uploaded |
| `README.md` | Project documentation |

---

# 5. Technologies Used

| Technology | Purpose |
|---|---|
| Adzuna API | Job source |
| Node.js | Runs the scraper |
| GitHub | Stores the code |
| GitHub Actions | Runs the scraper automatically |
| Supabase | Stores job data |
| PostgreSQL | Database used by Supabase |

---

# 6. Requirements

You need:

1. A GitHub account
2. A Supabase account/project
3. An Adzuna developer account
4. Adzuna API credentials
5. Supabase API credentials

Node.js does not need to be installed on the local computer for the GitHub Actions workflow.

GitHub Actions provides the Node.js environment needed to run the scraper.

---

# 7. Supabase Setup

Create a Supabase project.

Go to:

Supabase → Project Settings → API

You need the following:

### Supabase URL

Use the base API URL.

Example:

https://xxxxxxxxxxxx.supabase.co

Do not add:

/rest/v1

The scraper adds the required API path itself.

### Supabase Service Key

Use the `service_role` key.

This key allows the scraper to insert and update jobs in the database.

Do not expose this key publicly.

---

# 8. Database

The main table used by Phase 1 is:

`jobs`

The table stores information such as:

| Field | Description |
|---|---|
| `id` | Internal database ID |
| `external_id` | Job ID from the source |
| `company` | Company name |
| `title` | Job title |
| `location` | Job location |
| `job_url` | Link to the job |
| `posted_date` | Date the job was posted |
| `source` | Source of the job |
| `experience` | Experience information |
| `key_skills` | Key skills |
| `employment_type` | Full-time, contract, etc. |
| `description` | Job description |
| `unique_key` | Used to prevent duplicates |
| `created_at` | Time the record was created |

---

# 9. Adzuna Setup

Create an application in Adzuna.

You will receive:

- Application ID
- Application Key

These values are required by the scraper.

Do not put these credentials directly inside the source code.

They should be stored as GitHub Secrets.

---

# 10. GitHub Secrets

Go to:

GitHub Repository
→ Settings
→ Secrets and variables
→ Actions

Create the following four secrets:

| Secret | Value |
|---|---|
| `SUPABASE_URL` | Supabase API URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `ADZUNA_APP_ID` | Adzuna Application ID |
| `ADZUNA_APP_KEY` | Adzuna Application Key |

These values are kept hidden by GitHub.

---

# 11. Job Search Configuration

The scraper searches across India.

The country code is:

`in`

The scraper currently uses:

- 12 search keywords
- 50 results per page
- 2 pages per keyword

This means the theoretical maximum number of results is:

12 keywords × 2 pages × 50 jobs

= 1,200 results per run

This does not mean 1,200 unique jobs will always be stored because the same job may appear under multiple keywords.

Duplicate prevention is built into the database.

---

# 12. Duplicate Prevention

The scraper creates a `unique_key` for each job.

The key is based on information such as:

Company + Job Title + Location

The database has a unique constraint on this field.

This prevents the same job from being stored multiple times.

---

# 13. External Job ID

Every job received from Adzuna has an external job ID.

The scraper stores this value in:

`external_id`

This allows JobAssist to retain the original job identifier from the source.

---

# 14. Running the Scraper

The scraper can be run through GitHub Actions.

Go to:

GitHub Repository
→ Actions
→ Scrape Jobs
→ Run workflow

GitHub will then:

1. Start the Node.js environment
2. Install the required dependencies
3. Run `scrape.js`
4. Connect to Adzuna
5. Collect jobs
6. Send the jobs to Supabase

---

# 15. Example Run

A successful run will look similar to:

======================================
JobAssist — India Job Sourcing
======================================

Search keywords: 12

Pages per keyword: 2

Keyword: data scientist

Page: 1

Adzuna returned: 50 jobs

✓ Supabase saved 50 jobs

The scraper then continues with the remaining keywords.

---

# 16. Checking the Database

After the workflow completes, open:

Supabase → SQL Editor

Run:

```sql
SELECT COUNT(*) AS total_jobs
FROM jobs;