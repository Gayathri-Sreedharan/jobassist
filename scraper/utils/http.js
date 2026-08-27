const https = require("https");

function getJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "JobAssist/1.0",
          ...headers
        }
      },
      (response) => {
        let body = "";

        response.on("data", (chunk) => {
          body += chunk;
        });

        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(
              new Error(
                `HTTP ${response.statusCode}: ${body.substring(0, 500)}`
              )
            );
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(
              new Error(`Invalid JSON response: ${body.substring(0, 500)}`)
            );
          }
        });
      }
    );

    request.on("error", reject);
  });
}

module.exports = {
  getJson
};