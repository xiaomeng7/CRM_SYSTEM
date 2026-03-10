/**
 * Quick test for pushing ServiceM8 job link to Inspection internal endpoint.
 *
 * Usage:
 *   INSPECTION_BASE_URL=https://inspection.example.com \
 *   INTERNAL_API_KEY=xxxx \
 *   npx ts-node scripts/test-inspection-link-push.ts
 */

const baseUrl = process.env.INSPECTION_BASE_URL || "";
const apiKey = process.env.INTERNAL_API_KEY || "";
const jobUuid = process.env.TEST_JOB_UUID || "00000000-0000-0000-0000-000000000000";
const jobNumber = process.env.TEST_JOB_NUMBER || "12345";

async function main() {
  if (!baseUrl || !apiKey) {
    console.error("Missing INSPECTION_BASE_URL or INTERNAL_API_KEY");
    process.exit(1);
  }

  const url = baseUrl.replace(/\/$/, "") + "/api/internal/service-job-link";
  const payload = { job_uuid: jobUuid, job_number: jobNumber, source: "snapshot" };

  console.log("POST", url);
  console.log("Payload:", payload);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text().catch(() => "");
  console.log("Status:", res.status);
  console.log("Body:", text);

  if (!res.ok) process.exit(2);
}

main().catch((err) => {
  console.error("Request failed:", err);
  process.exit(2);
});
