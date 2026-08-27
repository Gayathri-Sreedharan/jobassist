const https = require("https");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID;
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY;

const COUNTRY = "in";

const RESULTS_PER_PAGE = 50;

// Start small.
// Once this works, we can expand the keyword list and pages.
const MAX_PAGES_PER_KEYWORD = 2;

const REQUEST_DELAY_MS = 2000;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const SOURCES = require("./sources");
const { isWithinLastDays } = require("./utils/date-utils");
const { extractExperience } = require("./utils/experience");
const { extractSkills } = require("./utils/skills");
const KEYWORDS = require("./config/keywords");
const { DAYS_BACK } = require("./config/settings");

// ============================================================
// SEARCH KEYWORDS
// ============================================================

const SEARCH_KEYWORDS = [
  "data scientist",
  "data analyst",
  "data engineer",
  "software engineer",
  "software developer",
  "python developer",
  "machine learning",
  "artificial intelligence",
  "AI engineer",
  "business analyst",
  "devops",
  "cloud engineer","Power BI","Tableau",
"Cybersecurity",
"Generative AI",
"NLP",
"Cloud Architect"
];


// ============================================================
// HELPERS
// ============================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// ============================================================
// HTTP REQUEST WITH RETRIES
// ============================================================

function fetchJson(url, attempt = 1) {

  return new Promise((resolve, reject) => {

    https.get(
      url,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "JobAssist/1.0"
        }
      },

      response => {

        let data = "";

        response.on("data", chunk => {
          data += chunk;
        });

        response.on("end", async () => {

          // --------------------------------------------------
          // TEMPORARY HTTP ERRORS
          // --------------------------------------------------

          if (
            response.statusCode === 429 ||
            response.statusCode === 500 ||
            response.statusCode === 502 ||
            response.statusCode === 503 ||
            response.statusCode === 504
          ) {

            if (attempt < MAX_RETRIES) {

              console.log(
                `Temporary HTTP ${response.statusCode}. ` +
                `Retrying (${attempt}/${MAX_RETRIES})...`
              );

              await sleep(
                RETRY_DELAY_MS * attempt
              );

              try {

                const result =
                  await fetchJson(
                    url,
                    attempt + 1
                  );

                resolve(result);

              } catch (error) {

                reject(error);

              }

              return;
            }

            reject(
              new Error(
                `HTTP ${response.statusCode} after ${MAX_RETRIES} attempts`
              )
            );

            return;
          }


          // --------------------------------------------------
          // OTHER HTTP ERRORS
          // --------------------------------------------------

          if (
            response.statusCode < 200 ||
            response.statusCode >= 300
          ) {

            reject(
              new Error(
                `HTTP ${response.statusCode}: ${data.substring(0, 500)}`
              )
            );

            return;
          }


          // --------------------------------------------------
          // PARSE JSON
          // --------------------------------------------------

          try {

            resolve(
              JSON.parse(data)
            );

          } catch (error) {

            reject(
              new Error(
                `Invalid JSON response: ${data.substring(0, 300)}`
              )
            );

          }

        });

      }

    ).on("error", async error => {

      if (attempt < MAX_RETRIES) {

        console.log(
          `Network error. Retrying (${attempt}/${MAX_RETRIES})...`
        );

        await sleep(
          RETRY_DELAY_MS * attempt
        );

        try {

          const result =
            await fetchJson(
              url,
              attempt + 1
            );

          resolve(result);

        } catch (retryError) {

          reject(retryError);

        }

      } else {

        reject(error);

      }

    });

  });
}


// ============================================================
// BUILD ADZUNA SEARCH URL
// ============================================================

function buildAdzunaUrl(
  page,
  keyword
) {

  const url =
    new URL(
      `https://api.adzuna.com/v1/api/jobs/${COUNTRY}/search/${page}`
    );


  url.searchParams.set(
    "app_id",
    ADZUNA_APP_ID
  );

  url.searchParams.set(
    "app_key",
    ADZUNA_APP_KEY
  );

  url.searchParams.set(
    "results_per_page",
    RESULTS_PER_PAGE
  );

  url.searchParams.set(
    "what",
    keyword
  );

  url.searchParams.set(
    "content-type",
    "application/json"
  );


  return url.toString();
}


// ============================================================
// NORMALIZE JOB
// ============================================================

function normalizeJob(job) {

  const company =
    job.company &&
    job.company.display_name
      ? job.company.display_name
      : "Unknown";


  const location =
    job.location &&
    job.location.display_name
      ? job.location.display_name
      : "";


  const postedDate =
    job.created
      ? job.created.substring(0, 10)
      : null;


  /*
   * Kept for backward compatibility.
   *
   * IMPORTANT:
   * This is no longer used as the unique identifier.
   * Uniqueness is now based on:
   *
   * source + external_id
   */
  const uniqueKey =
    `${company}|${job.title || ""}|${location}`
      .toLowerCase()
      .trim();


  return {

    external_id:
      job.id
        ? String(job.id)
        : null,

    company:
      company,

    title:
      job.title ||
      "Untitled",

    location:
      location,

    job_url:
      job.redirect_url ||
      null,

    posted_date:
      postedDate,

    source:
      "adzuna",

    experience:
      null,

    key_skills:
      null,

    employment_type:
      job.contract_type ||
      job.contract_time ||
      null,

    description:
      job.description ||
      null,

    unique_key:
      uniqueKey

  };
}


// ============================================================
// DEDUPLICATE JOBS
// ============================================================

function deduplicateJobs(jobs) {

  const uniqueJobsMap =
    new Map();

  let duplicateCount =
    0;


  for (const job of jobs) {

    // --------------------------------------------------------
    // EXTERNAL ID IS REQUIRED
    // --------------------------------------------------------

    if (!job.external_id) {

      console.warn(
        "Skipping job because external_id is missing."
      );

      continue;

    }


    /*
     * IMPORTANT:
     *
     * Supabase uniqueness is now:
     *
     * source + external_id
     *
     * Therefore the in-memory deduplication must use
     * the exact same logical key.
     */
    const key =
      `${job.source}|${job.external_id}`;


    // --------------------------------------------------------
    // REMOVE DUPLICATES FROM SAME BATCH
    // --------------------------------------------------------

    if (
      uniqueJobsMap.has(key)
    ) {

      duplicateCount++;

      console.log(
        `Duplicate job skipped: ${key}`
      );

      continue;

    }


    uniqueJobsMap.set(
      key,
      job
    );

  }


  return {

    jobs:
      Array.from(
        uniqueJobsMap.values()
      ),

    duplicateCount:
      duplicateCount

  };

}


// ============================================================
// SAVE JOBS TO SUPABASE
// ============================================================

async function saveJobs(jobs) {

  if (!jobs.length) {

    console.log(
      "No jobs to save."
    );

    return {

      saved: 0,

      duplicates: 0

    };

  }


  // ----------------------------------------------------------
  // DEDUPLICATE BEFORE SUPABASE
  // ----------------------------------------------------------

  const {
    jobs: uniqueJobs,
    duplicateCount
  } =
    deduplicateJobs(
      jobs
    );


  console.log(
    `Jobs received: ${jobs.length}`
  );

  console.log(
    `Unique jobs to save: ${uniqueJobs.length}`
  );

  console.log(
    `Duplicates removed: ${duplicateCount}`
  );


  if (!uniqueJobs.length) {

    console.log(
      "No unique jobs available to save."
    );

    return {

      saved: 0,

      duplicates:
        duplicateCount

    };

  }


  // ----------------------------------------------------------
  // SUPABASE UPSERT
  // ----------------------------------------------------------

  /*
   * IMPORTANT:
   *
   * Supabase constraint:
   *
   * UNIQUE (source, external_id)
   *
   * Therefore on_conflict MUST match:
   *
   * source,external_id
   */
  const response =
    await fetch(
      `${SUPABASE_URL}/rest/v1/jobs?on_conflict=source,external_id`,
      {

        method: "POST",

        headers: {

          apikey:
            SUPABASE_SERVICE_KEY,

          Authorization:
            `Bearer ${SUPABASE_SERVICE_KEY}`,

          "Content-Type":
            "application/json",

          Prefer:
            "resolution=merge-duplicates"

        },

        body:
          JSON.stringify(
            uniqueJobs
          )

      }
    );


  const responseText =
    await response.text();


  if (!response.ok) {

    throw new Error(
      `Supabase error ${response.status}: ${responseText}`
    );

  }


  console.log(
    `✓ Supabase saved ${uniqueJobs.length} unique jobs`
  );


  return {

    saved:
      uniqueJobs.length,

    duplicates:
      duplicateCount

  };

}


// ============================================================
// SEARCH ONE KEYWORD
// ============================================================

async function searchKeyword(
  keyword
) {

  let jobsFetched =
    0;

  let jobsSaved =
    0;

  let jobsDuplicates =
    0;

  let jobsFailed =
    0;


  for (
    let page = 1;
    page <= MAX_PAGES_PER_KEYWORD;
    page++
  ) {

    console.log("");
    console.log(
      `Keyword: ${keyword}`
    );

    console.log(
      `Page: ${page}`
    );


    try {

      // ------------------------------------------------------
      // BUILD URL
      // ------------------------------------------------------

      const url =
        buildAdzunaUrl(
          page,
          keyword
        );


      // ------------------------------------------------------
      // FETCH ADZUNA
      // ------------------------------------------------------

      const data =
        await fetchJson(
          url
        );


      const results =
        data.results || [];


      console.log(
        `Adzuna returned: ${results.length} jobs`
      );


      // ------------------------------------------------------
      // STOP IF NO RESULTS
      // ------------------------------------------------------

      if (!results.length) {

        console.log(
          `No more results for "${keyword}".`
        );

        break;

      }


      jobsFetched +=
        results.length;


      // ------------------------------------------------------
      // NORMALIZE
      // ------------------------------------------------------

      const jobs =
        results.map(
          normalizeJob
        );


      // ------------------------------------------------------
      // SAVE TO SUPABASE
      // ------------------------------------------------------

      try {

        const saveResult =
          await saveJobs(
            jobs
          );


        jobsSaved +=
          saveResult.saved;

        jobsDuplicates +=
          saveResult.duplicates;


      } catch (supabaseError) {

        /*
         * The whole batch failed.
         *
         * Count the jobs as failed rather than pretending
         * they were successfully processed.
         */
        jobsFailed +=
          jobs.length;


        console.error(
          `Supabase save failed for "${keyword}", page ${page}:`
        );

        console.error(
          supabaseError.message
        );

      }


      // ------------------------------------------------------
      // DELAY
      // ------------------------------------------------------

      await sleep(
        REQUEST_DELAY_MS
      );


    } catch (error) {

      console.error(
        `Failed keyword "${keyword}", page ${page}:`
      );

      console.error(
        error.message
      );

      jobsFailed +=
        1;


      /*
       * Continue with the next keyword.
       */
      break;

    }

  }


  return {

    fetched:
      jobsFetched,

    saved:
      jobsSaved,

    duplicates:
      jobsDuplicates,

    failed:
      jobsFailed

  };

}


// ============================================================
// MAIN
// ============================================================

async function main() {

  // ----------------------------------------------------------
  // CHECK ENVIRONMENT VARIABLES
  // ----------------------------------------------------------

  if (!SUPABASE_URL) {

    throw new Error(
      "SUPABASE_URL is missing"
    );

  }


  if (!SUPABASE_SERVICE_KEY) {

    throw new Error(
      "SUPABASE_SERVICE_KEY is missing"
    );

  }


  if (!ADZUNA_APP_ID) {

    throw new Error(
      "ADZUNA_APP_ID is missing"
    );

  }


  if (!ADZUNA_APP_KEY) {

    throw new Error(
      "ADZUNA_APP_KEY is missing"
    );

  }


  // ----------------------------------------------------------
  // HEADER
  // ----------------------------------------------------------

  console.log("");

  console.log(
    "======================================"
  );

  console.log(
    "JobAssist — India Job Sourcing"
  );

  console.log(
    "======================================"
  );

  console.log("");


  console.log(
    `Search keywords: ${SEARCH_KEYWORDS.length}`
  );

  console.log(
    `Pages per keyword: ${MAX_PAGES_PER_KEYWORD}`
  );

  console.log("");


  // ----------------------------------------------------------
  // TOTAL COUNTERS
  // ----------------------------------------------------------

  let totalFetched =
    0;

  let totalSaved =
    0;

  let totalDuplicates =
    0;

  let totalFailed =
    0;


  // ----------------------------------------------------------
  // SEARCH ALL KEYWORDS
  // ----------------------------------------------------------

  for (
    const keyword of SEARCH_KEYWORDS
  ) {

    const result =
      await searchKeyword(
        keyword
      );


    totalFetched +=
      result.fetched;

    totalSaved +=
      result.saved;

    totalDuplicates +=
      result.duplicates;

    totalFailed +=
      result.failed;


    // --------------------------------------------------------
    // KEYWORD SUMMARY
    // --------------------------------------------------------

    console.log("");

    console.log(
      `Completed "${keyword}"`
    );

    console.log(
      `  Fetched: ${result.fetched}`
    );

    console.log(
      `  Saved: ${result.saved}`
    );

    console.log(
      `  Duplicates removed: ${result.duplicates}`
    );

    console.log(
      `  Failed: ${result.failed}`
    );

    console.log(
      "--------------------------------------"
    );

  }


  // ----------------------------------------------------------
  // FINAL RESULT
  // ----------------------------------------------------------

  console.log("");

  console.log(
    "======================================"
  );

  console.log(
    "Collection completed"
  );

  console.log(
    "======================================"
  );

  console.log("");

  console.log(
    `Total jobs fetched: ${totalFetched}`
  );

  console.log(
    `Total jobs saved: ${totalSaved}`
  );

  console.log(
    `Total duplicates removed: ${totalDuplicates}`
  );

  console.log(
    `Total failed: ${totalFailed}`
  );

  console.log("");

  console.log(
    "======================================"
  );

  console.log("");

}


// ============================================================
// START
// ============================================================

main()
  .catch(error => {

    console.error("");

    console.error(
      "JobAssist failed:"
    );

    console.error(
      error
    );

    console.error("");

    process.exit(1);

  });