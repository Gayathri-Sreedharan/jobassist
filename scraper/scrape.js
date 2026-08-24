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
  "cloud engineer"
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

          // Temporary errors
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


          // Other HTTP errors
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


          // Parse JSON
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
   * Used by Supabase to prevent duplicates.
   */
  const uniqueKey =
    `${company}|${job.title || ""}|${location}`
      .toLowerCase()
      .trim();


  return {

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
// SAVE JOBS TO SUPABASE
// ============================================================

async function saveJobs(jobs) {

  if (!jobs.length) {

    console.log(
      "No jobs to save."
    );

    return;

  }


  const response =
    await fetch(
      `${SUPABASE_URL}/rest/v1/jobs?on_conflict=unique_key`,
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
          JSON.stringify(jobs)

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
    `✓ Supabase saved ${jobs.length} jobs`
  );

}


// ============================================================
// SEARCH ONE KEYWORD
// ============================================================

async function searchKeyword(
  keyword
) {

  let keywordJobs =
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

      const url =
        buildAdzunaUrl(
          page,
          keyword
        );


      const data =
        await fetchJson(
          url
        );


      const results =
        data.results || [];


      console.log(
        `Adzuna returned: ${results.length} jobs`
      );


      /*
       * If Adzuna returns zero jobs,
       * don't request another page.
       */
      if (!results.length) {

        console.log(
          `No more results for "${keyword}".`
        );

        break;

      }


      const jobs =
        results.map(
          normalizeJob
        );


      await saveJobs(
        jobs
      );


      keywordJobs +=
        jobs.length;


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

      /*
       * Continue with the next keyword.
       */
      break;

    }

  }


  return keywordJobs;
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


  let totalJobs =
    0;


  // ----------------------------------------------------------
  // SEARCH ALL KEYWORDS
  // ----------------------------------------------------------

  for (
    const keyword of SEARCH_KEYWORDS
  ) {

    const count =
      await searchKeyword(
        keyword
      );


    totalJobs +=
      count;


    console.log("");
    console.log(
      `Completed "${keyword}" — ${count} jobs processed`
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
    `Collection completed. Jobs processed: ${totalJobs}`
  );

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