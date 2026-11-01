import { promptVariants } from "./fix-prompts";
import { reviewContent } from "./content-review";
import { database, readScan, updateScan } from "./store";
import { addPaidModelCost } from "./free-tier";

export async function enhancePaidPrompt(scanId: string) {
  const scan = await readScan(scanId);
  const model = process.env.LLM_MODEL_PAID || "gpt-4.1";
  if (!scan || scan.status !== "complete" || !scan.paidPayload || !model || !process.env.OPENAI_API_KEY) return false;
  if (scan.paidPayload.available && scan.paidPayload.paidModelReady) {
    if (scan.paidPayload.paidPromptUsage) await addPaidModelCost({ scanId, ...scan.paidPayload.paidPromptUsage, model });
    return true;
  }
  const findings = scan.findings ?? [];
  const pageText = [scan.title, scan.description, ...findings.map((item) => item.evidence)].filter(Boolean).join("\n");
  const review = await reviewContent({ title: scan.title ?? "", description: scan.description ?? "", pageText, findings, desktopImage: scan.desktopImage ?? "", mobileImage: scan.mobileImage ?? "" }, model);
  if (!review.usage || review.copyDrafts.headlines.length !== 3) return false;
  const prompts = promptVariants({ url: scan.finalUrl ?? scan.url, title: scan.title ?? "", stack: scan.stackHints ?? [], findings, copyDrafts: review.copyDrafts });
  const paidPromptUsage = { inputTokens: review.usage.inputTokens, outputTokens: review.usage.outputTokens };
  const updated = await updateScan(scanId, (current) => ({ ...current, paidPayload: { available: true, paidModelReady: true, findings: current.paidPayload?.findings ?? findings, ...current.paidPayload, copyDrafts: review.copyDrafts, prompts, model, paidPromptUsage }, updatedAt: new Date().toISOString() }), scan.leaseToken);
  if (!updated) return false;
  await addPaidModelCost({ scanId, ...paidPromptUsage, model });
  return true;
}

export async function enqueuePaidPrompt(scanId: string) {
  const sql = database(); if (!sql) return;
  await sql`INSERT INTO paid_prompt_jobs (scan_id,status,attempts,next_attempt_at,updated_at) VALUES (${scanId},'pending',0,now(),now())
    ON CONFLICT (scan_id) DO NOTHING`;
}

export async function processPaidPromptJob() {
  const sql = database(); if (!sql) return false;
  const job = await sql.begin(async (tx) => {
    const rows = await tx<{ scan_id: string }[]>`WITH candidate AS (
      SELECT scan_id FROM paid_prompt_jobs WHERE (status='pending' AND next_attempt_at<=now()) OR (status='running' AND updated_at<now()-interval '2 minutes')
      ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE paid_prompt_jobs SET status='running',attempts=attempts+1,updated_at=now() FROM candidate WHERE paid_prompt_jobs.scan_id=candidate.scan_id RETURNING paid_prompt_jobs.scan_id`;
    return rows[0]?.scan_id;
  });
  if (!job) return false;
  try {
    const finished = await enhancePaidPrompt(job);
    await sql`UPDATE paid_prompt_jobs SET status=${finished ? "complete" : "pending"},next_attempt_at=now()+CASE WHEN ${finished} THEN interval '100 years' ELSE interval '5 minutes' END,updated_at=now() WHERE scan_id=${job}`;
  } catch (error) {
    console.warn("Paid prompt enhancement failed", { scanId: job, errorName: error instanceof Error ? error.name : "UnknownError" });
    await sql`UPDATE paid_prompt_jobs SET status='pending',next_attempt_at=now()+make_interval(secs=>LEAST(3600,30*power(2,LEAST(attempts,7))::int)),updated_at=now() WHERE scan_id=${job}`;
  }
  return true;
}
