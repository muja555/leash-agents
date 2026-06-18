import { Markup, Telegraf, type Context } from "telegraf";
import type { AgentEvent } from "../agent/events.js";
import { runM1 } from "../agent/m1.js";
import { config } from "../config.js";
import { startMerchant } from "../server/merchant.js";
import { disconnect } from "../xrpl/client.js";
import { txExplorerUrl } from "../xrpl/explorer.js";

interface BotEnv {
  merchantPort: number;
  merchantPayTo: string;
}

interface UserState {
  halted: boolean;
  activeRun: boolean;
}

const users = new Map<number, UserState>();

function getUserState(id: number): UserState {
  let s = users.get(id);
  if (!s) {
    s = { halted: false, activeRun: false };
    users.set(id, s);
  }
  return s;
}

function escapeMd(s: string): string {
  // Telegram "Markdown" (legacy) mode — escape just the active characters
  return s.replace(/([_*`\[\]])/g, "\\$1");
}

const dropsToXrp = (d: number) => (d / 1_000_000).toFixed(6);
const dropsToXrpShort = (d: number) => (d / 1_000_000).toFixed(3);

function buildBot(env: BotEnv, token: string): Telegraf {
  const bot = new Telegraf(token);

  bot.start(async (ctx) => {
    await ctx.reply(
      `🐕 *Welcome to Leash.*

I'm a control-tower for an AI agent that pays per use on the XRP Ledger *testnet*. You give it a task and a budget; I run it through the policy engine and let you watch every cent move on-chain.

*Demo task type:* research (canned data behind an x402-style paywall).

*Defaults (M2):*
• Allowance:   *${dropsToXrpShort(config.policy.totalBudgetDrops)} XRP*
• Per-tx cap:  *${dropsToXrpShort(config.policy.perTxCapDrops)} XRP*
• Approve ≥:   *${dropsToXrpShort(config.policy.approvalThresholdDrops)} XRP*

*Try it:*
  /task lithium supply chain risks 2026

*Other commands:*
  /budget — show the policy
  /halt — kill switch (toggle)
  /forget — wipe your session state
  /explorer \`<hash>\` — open any tx in the testnet explorer`,
      { parse_mode: "Markdown" },
    );
  });

  bot.command("budget", async (ctx) => {
    const state = getUserState(ctx.from.id);
    await ctx.reply(
      `📊 *Policy*

• Total budget:    *${dropsToXrp(config.policy.totalBudgetDrops)} XRP*
• Per-tx cap:      *${dropsToXrp(config.policy.perTxCapDrops)} XRP*
• Daily cap:       *${dropsToXrp(config.policy.dailyCapDrops)} XRP*
• Approval ≥:      *${dropsToXrp(config.policy.approvalThresholdDrops)} XRP*

*Halted:* ${state.halted ? "🔴 yes" : "🟢 no"}
*Merchant payTo:* \`${env.merchantPayTo}\``,
      { parse_mode: "Markdown" },
    );
  });

  bot.command("halt", async (ctx) => {
    const state = getUserState(ctx.from.id);
    state.halted = !state.halted;
    await ctx.reply(
      state.halted
        ? "🛑 *Halted.* Policy engine will refuse every signature until you /halt again to resume."
        : "🟢 *Resumed.* New tasks will proceed through the policy gates as normal.",
      { parse_mode: "Markdown" },
    );
  });

  bot.command("forget", async (ctx) => {
    users.delete(ctx.from.id);
    await ctx.reply("🧹 Your session state has been cleared.");
  });

  bot.command("explorer", async (ctx) => {
    const parts = ctx.message.text.split(/\s+/);
    const hash = parts[1];
    if (!hash) {
      await ctx.reply("Usage: `/explorer <tx hash>`", { parse_mode: "Markdown" });
      return;
    }
    await ctx.reply(`Open on testnet explorer:\n${txExplorerUrl(hash)}`);
  });

  bot.command("task", async (ctx) => {
    const state = getUserState(ctx.from.id);
    if (state.halted) {
      await ctx.reply("🛑 You're halted — `/halt` to resume first.", { parse_mode: "Markdown" });
      return;
    }
    if (state.activeRun) {
      await ctx.reply("⏳ A task is already running. Wait for it to complete before starting another.");
      return;
    }
    const text = ctx.message.text.replace(/^\/task(\s+|$)/, "").trim();
    const query = text || config.agent.query;

    state.activeRun = true;
    try {
      await runTaskWithTelegramSink(ctx, env, query);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.reply(`✗ *Task failed:* ${escapeMd(msg)}`, { parse_mode: "Markdown" });
    } finally {
      state.activeRun = false;
    }
  });

  bot.catch((err, ctx) => {
    console.error(`[bot] error in handler for update ${ctx.updateType}:`, err);
  });

  return bot;
}

async function runTaskWithTelegramSink(
  ctx: Context,
  env: BotEnv,
  query: string,
): Promise<void> {
  const sink = async (e: AgentEvent): Promise<void> => {
    switch (e.type) {
      case "started":
        await ctx.reply(`🚀 *Starting agent run*\nQuery: _${escapeMd(e.query)}_`, { parse_mode: "Markdown" });
        break;
      case "probing":
        await ctx.reply(`→ probing the merchant for a paid resource…`);
        break;
      case "challenge":
        await ctx.reply(
          `💰 *402 challenge*\n• ${e.amountDrops} drops (${dropsToXrp(e.amountDrops)} XRP)\n• → \`${e.destination}\`\n• memo: \`${e.memo}\``,
          { parse_mode: "Markdown" },
        );
        break;
      case "policy_decision": {
        const reason = "reason" in e.decision ? ` — ${e.decision.reason}` : "";
        const emoji = e.decision.kind === "allow" ? "✓" : e.decision.kind === "ask_human" ? "🟡" : "🛑";
        await ctx.reply(
          `${emoji} *policy:* ${e.decision.kind}${escapeMd(reason)}`,
          { parse_mode: "Markdown" },
        );
        break;
      }
      case "wallet_loaded":
        await ctx.reply(`👛 agent wallet: \`${e.address}\``, { parse_mode: "Markdown" });
        break;
      case "signing":
        await ctx.reply(`✍️ signing + broadcasting Payment on testnet…`);
        break;
      case "settled":
        await ctx.reply(
          `✅ *TX SETTLED*\n• ledger: ${e.ledgerIndex}\n• hash: \`${e.hash}\``,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              Markup.button.url("View on Explorer ↗", e.explorer),
            ]),
          },
        );
        break;
      case "unlocked": {
        const lines = e.results.map((r, i) => `${i + 1}. ${escapeMd(r)}`).join("\n\n");
        await ctx.reply(
          `📊 *Got ${e.results.length} results for "${escapeMd(e.query)}"*\n\n${lines}`,
          { parse_mode: "Markdown" },
        );
        break;
      }
      case "complete":
        await ctx.reply(`✓ Task complete.`);
        break;
      case "error":
        await ctx.reply(`✗ ${e.message}`);
        break;
    }
  };

  await runM1({
    merchantPort: env.merchantPort,
    merchantPayTo: env.merchantPayTo,
    query,
    onEvent: sink,
  });
}

export async function startBot(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error(
      "✗ TELEGRAM_BOT_TOKEN is not set.\n" +
        "  1. Open Telegram, message @BotFather, run /newbot, save the token.\n" +
        "  2. Add TELEGRAM_BOT_TOKEN=<your-token> to .env\n" +
        "  3. Re-run `npm run bot`.",
    );
    process.exit(1);
  }

  console.log("=".repeat(64));
  console.log("LEASH · M2 Telegram bot — chat-driven agent on XRPL testnet");
  console.log("=".repeat(64));

  const { payTo, port } = await startMerchant();
  const bot = buildBot({ merchantPort: port, merchantPayTo: payTo }, token);

  console.log("[bot] launching Telegram polling…");
  // bot.launch() resolves when polling stops; don't await — let it run.
  bot.launch().catch((err) => {
    console.error("[bot] launch error:", err);
    process.exit(1);
  });
  console.log("[bot] ready. Open Telegram, find your bot, and send /start.");

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[bot] ${signal} received, shutting down…`);
    bot.stop(signal);
    await disconnect();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

const isMain = process.argv[1]?.endsWith("telegram.ts");
if (isMain) {
  startBot().catch((err) => {
    console.error("[bot] fatal:", err);
    process.exit(1);
  });
}
