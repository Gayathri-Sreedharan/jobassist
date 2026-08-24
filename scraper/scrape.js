const https = require("https");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID;
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY;

// India
const COUNTRY = "in";

// Jobs returned per Adzuna page
const RESULTS_PER_PAGE = 50;

// Keep this conservative initially.
// We can increase this after the first successful run.
const MAX_PAGES_PER_CATEGORY = 2;

// Delay between requests
const REQUEST_DELAY_MS = 2000;

// Retry settings for temporary Adzuna errors
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;


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

              await sleep(RETRY_DELAY_MS * attempt);

              try {

                const result =
                  await fetchJson(url, attempt + 1);

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

            resolve(JSON.parse(data));

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

        await sleep(RETRY_DELAY_MS * attempt);

        try {

          const result =
            await fetchJson(url, attempt + 1);

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

function buildAdzunaUrl(page, params = {}) {

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
    "content-type",
    "application/json"
  );


  for (const [key, value] of Object.entries(params)) {

    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {

      url.searchParams.set(
        key,
        value
      );

    }

  }


  return url.toString();
}


// ============================================================
// GET ADZUNA CATEGORIES
// ============================================================

async function getCategories() {

  const url =
    `https://api.adzuna.com/v1/api/jobs/${COUNTRY}/categories` +
    `?app_id=${encodeURIComponent(ADZUNA_APP_ID)}` +
    `&app_key=${encodeURIComponent(ADZUNA_APP_KEY)}` +
    `&content-type=application/json`;


  const data =
    await fetchJson(url);


  return data.results || [];
}


// ============================================================
// CONVERT ADZUNA JOB INTO OUR SUPABASE FORMAT
// ============================================================

function normalizeJob(job, category) {

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
   * This is our deduplication key.
   *
   * Same company + same title + same location
   * = treated as the same job.
   */
  const uniqueKey =
    `${company}|${job.title || ""}|${location}`
      .toLowerCase()
      .trim();


  return {

    company:
      company,

    title:
      job.title || "Untitled",

    location:
      location,

    job_url:
      job.redirect_url || null,

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
    `✓ Saved ${jobs.length} jobs`
  );

}


// ============================================================
// MAIN
// ============================================================

async function main() {

  // ----------------------------------------------------------
  // CHECK REQUIRED ENVIRONMENT VARIABLES
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
  console.log("======================================");
  console.log("JobAssist — India Job Sourcing");
  console.log("======================================");
  console.log("");


  // ----------------------------------------------------------
  // GET CATEGORIES
  // ----------------------------------------------------------

  console.log(
    "Getting Adzuna categories..."
  );


  let categories;


  try {

    categories =
      await getCategories();

  } catch (error) {

    console.error(
      "Could not retrieve Adzuna categories."
    );

    console.error(
      error.message
    );

    throw error;

  }


  console.log(
    `Found ${categories.length} categories`
  );


  // ----------------------------------------------------------
  // PROCESS CATEGORIES
  // ----------------------------------------------------------

  let totalJobs =
    0;


  for (const category of categories) {

    console.log("");
    console.log(
      `Category: ${category.label}`
    );


    for (
      let page = 1;
      page <= MAX_PAGES_PER_CATEGORY;
      page++
    ) {

      console.log(
        `Fetching page ${page}...`
      );


      try {

        const url =
          buildAdzunaUrl(
            page,
            {
              category:
                category.tag
            }
          );


        const data =
          await fetchJson(url);


        const results =
          data.results || [];


        if (!results.length) {

          console.log(
            "No more jobs in this category."
          );

          break;

        }


        const jobs =
          results.map(
            job =>
              normalizeJob(
                job,
                category
              )
          );


        await saveJobs(
          jobs
        );


        totalJobs +=
          jobs.length;


        await sleep(
          REQUEST_DELAY_MS
        );

      } catch (error) {

        console.error(
          `Failed page ${page} of ${category.label}:`
        );

        console.error(
          error.message
        );

        /*
         * Don't stop the entire scraper because
         * one category/page failed.
         */
        continue;

      }

    }

  }


  // ----------------------------------------------------------
  // COMPLETION
  // ----------------------------------------------------------

  console.log("");
  console.log("======================================");

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