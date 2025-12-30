import * as fs from "fs";
import * as path from "path";
import pdfParse from "pdf-parse";
import { createWorker } from "tesseract.js";
import * as dotenv from "dotenv";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { OAuthManager } from "./oauth.js";

dotenv.config();

async function scanMailAttachments(startDate?: string, endDate?: string): Promise<{ processedAttachments: number }> {
  const tempDir = process.env.ATTACHMENTS_DIR || path.join(process.cwd(), "commsec-attachments");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  const metadataPath = path.join(tempDir, "scan_metadata.csv");
  let lastScanned = "2023-02-01";

  // Track per-day stats and already scanned dates for idempotency
  const dailyStats: Record<string, { emails: number; attachments: number }> = {};
  const scannedDates = new Set<string>();
  if (fs.existsSync(metadataPath)) {
    const csvData = fs.readFileSync(metadataPath, "utf-8").trim().split("\n");
    for (const line of csvData) {
      if (line) {
        const parts = line.split(",");
        const date = parts[0];
        const emails = parts.length >= 2 ? parseInt(parts[1]) || 0 : 0;
        const attachments = parts.length >= 3 ? parseInt(parts[2]) || 0 : (parts.length === 2 ? parseInt(parts[1]) || 0 : 0);
        dailyStats[date] = { emails, attachments };
        scannedDates.add(date);
        if (date > lastScanned) lastScanned = date;
      }
    }
  }

  if (startDate) {
    lastScanned = startDate;
  }

  // OAuth 2.0 authentication setup
  const useOAuth = process.env.USE_OAUTH === "true";
  const imapUser = process.env.EMAIL_USER;
  const imapHost = process.env.EMAIL_IMAP_HOST || "imap.gmail.com";
  
  if (!imapUser) {
    throw new Error("Missing EMAIL_USER environment variable.");
  }

  let authConfig: any;
  
  if (useOAuth) {
    console.log("🔐 Using OAuth 2.0 authentication (secure session-based access)");
    const provider = imapHost.includes("yahoo") ? "yahoo" : "gmail";
    const oauthManager = new OAuthManager(provider);
    const accessToken = await oauthManager.getAccessToken();
    authConfig = oauthManager.getImapAuth(imapUser, accessToken);
  } else {
    console.log("⚠️  Using app password authentication (less secure)");
    console.log("💡 Tip: Set USE_OAUTH=true in .env for better security\n");
    const imapPass = process.env.EMAIL_APP_PASSWORD;
    if (!imapPass) {
      throw new Error("Missing EMAIL_APP_PASSWORD. Set USE_OAUTH=true to use OAuth instead.");
    }
    authConfig = { user: imapUser, pass: imapPass };
  }

  const startDateObj = new Date(lastScanned);
  if (Number.isNaN(startDateObj.getTime())) {
    throw new Error(`Invalid start date: ${lastScanned}`);
  }

  let beforeDate: Date | undefined;
  if (endDate) {
    const endObj = new Date(endDate);
    if (Number.isNaN(endObj.getTime())) {
      throw new Error(`Invalid end date: ${endDate}`);
    }
    // IMAP "before" is exclusive; move to next day to include end date
    beforeDate = new Date(endObj.getTime());
    beforeDate.setDate(beforeDate.getDate() + 1);
  }

  console.log(`Scanning mailbox via IMAP for 'CommSec' subject from ${formatDate(startDateObj)} to ${endDate ? endDate : 'open-ended'}`);

  const mailboxName = process.env.EMAIL_MAILBOX || "INBOX";

  const client = new ImapFlow({
    host: imapHost,
    port: 993,
    secure: true,
    auth: authConfig,
    logger: false,
  });

  const attachmentRecords: { path: string; date: string }[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailboxName);
    try {
      // Search anywhere in the message (subject/body) for CommSec (case-insensitive)
      const searchCriteria: any = { since: startDateObj, or: [{ text: "CommSec" }, { text: "commsec" }] };
      if (beforeDate) {
        searchCriteria.before = beforeDate;
      }
      const messageIdsRaw = await client.search(searchCriteria, { uid: true });
      const messageIds = Array.isArray(messageIdsRaw) ? messageIdsRaw : [];
      console.log(`Mailbox '${mailboxName}' -> ${messageIds.length} matching emails in range (text contains 'CommSec').`);

      let processedCount = 0;
      for (const uid of messageIds) {
        const msgMeta = await client.fetchOne(uid, { envelope: true, source: true }, { uid: true });
        if (!msgMeta || !msgMeta.source || !msgMeta.envelope) continue;

        const subject = msgMeta.envelope.subject || "(no subject)";
        const from = msgMeta.envelope.from?.map(f => f.address).join(", ") || "(unknown sender)";
        const msgDate = msgMeta.envelope.date || startDateObj;
        const dateStr = formatDate(msgDate);
        const parsed = await simpleParser(msgMeta.source as Buffer);
        const attachmentCount = parsed.attachments?.length || 0;

        if (scannedDates.has(dateStr)) {
          console.log(`[${processedCount + 1}/${messageIds.length}] ${dateStr} already scanned, skipping message`);
          processedCount++;
          continue;
        }

        console.log(`[${++processedCount}/${messageIds.length}] from: ${from} | subject: ${subject} | date: ${dateStr} | attachments: ${attachmentCount}`);

        if (!dailyStats[dateStr]) {
          dailyStats[dateStr] = { emails: 0, attachments: 0 };
        }
        dailyStats[dateStr].emails += 1;

        if (!parsed.attachments?.length) {
          console.log("  -> No attachments, skipping");
          continue;
        }

        let idx = 0;
        for (const att of parsed.attachments) {
          const filename = att.filename || `attachment-${uid}-${idx}`;
          const safeName = filename.replace(/[/\\]/g, "_");
          const outPath = uniquePath(path.join(tempDir, safeName));
          const contentBuffer = att.content as Buffer;
          fs.writeFileSync(outPath, contentBuffer);
          attachmentRecords.push({ path: outPath, date: dateStr });
          dailyStats[dateStr].attachments += 1;
          console.log(`  -> Saved attachment: ${path.basename(outPath)}`);
          idx++;
        }
      }
    } finally {
      lock.release();
    }
  } catch (error: any) {
    throw new Error(`IMAP scan failed: ${error.message}`);
  } finally {
    await client.logout().catch(() => {});
  }

  try {
    console.log(`Found ${attachmentRecords.length} total attachments to process.`);
    let processedAttachments = 0;

    for (const { path: attachmentPath, date } of attachmentRecords) {
      if (attachmentPath && fs.existsSync(attachmentPath)) {
        console.log(`Processing attachment: ${path.basename(attachmentPath)} from ${date}`);
        processedAttachments++;
        const content = fs.readFileSync(attachmentPath);
        const contentType = getContentType(attachmentPath);
        try {
          const extractedData = await extractDataFromAttachment({ content, contentType });
          if (extractedData) {
            console.log(`Extracted data: ${extractedData.join(", ")}`);
          }
        } catch (err: any) {
          console.log(`  -> Failed to extract data from ${path.basename(attachmentPath)}: ${err.message}`);
        }
      }
    }
    const csvLines = Object.keys(dailyStats)
      .sort()
      .map(date => `${date},${dailyStats[date].emails},${dailyStats[date].attachments}`);
    fs.writeFileSync(metadataPath, csvLines.join("\n") + "\n");

    console.log("Per-day stats (emails, attachments):");
    Object.keys(dailyStats)
      .sort()
      .forEach(date => {
        const stats = dailyStats[date];
        console.log(`  ${date}: emails=${stats.emails}, attachments=${stats.attachments}`);
      });

    console.log(`Scan completed. Processed ${attachmentRecords.length} attachments across ${Object.keys(dailyStats).length} tracked days (skipping previously scanned dates).`);

    return { processedAttachments };
  } catch (error: any) {
    throw new Error(`Failed to process attachments: ${error.message}`);
  }
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function uniquePath(p: string): string {
  if (!fs.existsSync(p)) return p;
  const { dir, name, ext } = path.parse(p);
  let i = 1;
  while (true) {
    const candidate = path.join(dir, `${name}-${i}${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    i++;
  }
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) return 'image/jpeg';
  return 'application/octet-stream';
}

async function extractDataFromAttachment(attachment: any) {
  const content = attachment.content;
  if (attachment.contentType === 'application/pdf') {
    const data = await pdfParse(content);
    return parseText(data.text);
  } else if (attachment.contentType.startsWith('image/')) {
    const worker = await createWorker();
    const { data: { text } } = await worker.recognize(content);
    await worker.terminate();
    return parseText(text);
  }
  // Add more attachment types as needed
  return null;
}

function parseText(text: string) {
  // Simple parsing logic - customize based on attachment format
  const lines = text.split('\n').map(line => line.trim()).filter(line => line);
  return lines.slice(0, 5); // Return first 5 lines as data
}

async function main() {
  const startDate = process.argv[2]; // Optional start date as first argument
  const endDate = process.argv[3]; // Optional end date as second argument
  console.log("Mail Attachment Downloader starting...");
  try {
    const data = await scanMailAttachments(startDate, endDate);
    console.log(`Scanned emails, processed ${data.processedAttachments} attachments. Attachments downloaded to commsec-attachments folder.`);
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
  }
}

main().catch(console.error);
