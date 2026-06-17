import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

const LOG_PATH = "data/payments.json";

export interface PaymentLogEntry {
  ts: string;
  service: string;
  amountDrops: string;
  hash: string;
  ledgerIndex: number;
  explorer: string;
}

export async function appendPayment(entry: PaymentLogEntry): Promise<void> {
  await mkdir(dirname(LOG_PATH), { recursive: true });
  const existing = await readAllPayments();
  existing.push(entry);
  await writeFile(LOG_PATH, JSON.stringify(existing, null, 2), "utf8");
}

export async function readAllPayments(): Promise<PaymentLogEntry[]> {
  if (!existsSync(LOG_PATH)) return [];
  const raw = await readFile(LOG_PATH, "utf8");
  if (!raw.trim()) return [];
  return JSON.parse(raw) as PaymentLogEntry[];
}
