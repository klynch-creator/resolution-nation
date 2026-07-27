import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedReportCard } from "@/types";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { requireTeacherOfStudent } from "@/lib/authz";

const SYSTEM_PROMPT = `You are analyzing a student report card. Extract all subjects, grades/scores (and the grading scale), standard codes if present, and any teacher notes or comments. Return ONLY valid JSON in exactly this format, no other text:
{
  "student_name": "string or null",
  "grade_level": "string or null",
  "subjects": [
    {
      "name": "string",
      "score": "string or number",
      "scale": "string (e.g. '1-4', 'A-F', '0-100')",
      "standard": "string or null",
      "notes": "string or null"
    }
  ],
  "overall_notes": "string or null"
}`;

export async function POST(request: Request) {
  const rl = checkRateLimit(request, { routeKey: "extract-report-card", limit: 10, windowSec: 60 });
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const { fileUrl, fileType, studentId } = await request.json();

    if (!fileUrl || !fileType || !studentId) {
      return NextResponse.json(
        { error: "Missing required fields: fileUrl, fileType, studentId." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    // Security review 2026-07-26 (L3): assert the teacher-student relationship
    // before reading a report card and sending its contents to Anthropic.
    const authz = await requireTeacherOfStudent(user.id, studentId);
    if (!authz.ok) {
      return NextResponse.json({ error: authz.error }, { status: authz.status });
    }

    // Download file from Supabase Storage
    const { data: blob, error: downloadError } = await supabase.storage
      .from("report-cards")
      .download(fileUrl);

    if (downloadError || !blob) {
      return NextResponse.json(
        { error: "Could not download file from storage." },
        { status: 500 }
      );
    }

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract raw text from the file
    let rawText = "";

    if (fileType === "pdf") {
      try {
        const pdfParse = (await import("pdf-parse")).default;
        const pdfData = await pdfParse(buffer);
        rawText = pdfData.text;
      } catch (pdfErr) {
        console.error("PDF parse error:", pdfErr);
        return NextResponse.json(
          { error: "Could not read PDF. Make sure the file is not encrypted." },
          { status: 422 }
        );
      }
    } else if (fileType === "csv") {
      rawText = buffer.toString("utf-8");
    } else {
      return NextResponse.json({ error: "Unsupported file type." }, { status: 400 });
    }

    if (!rawText.trim()) {
      return NextResponse.json(
        { error: "No text could be extracted from the file." },
        { status: 422 }
      );
    }

    // Security review 2026-07-26 (L4): this used to be labelled as PII
    // stripping. It is not, and the comment was misleading in a way that could
    // become a misstatement on a district security questionnaire.
    //
    // The regex matches one literal label format and a single whitespace-
    // delimited token. It does not catch "Name:", a name in a page header, a
    // first-and-last name, or a student ID — and the full report-card text is
    // sent to Anthropic regardless, with the system prompt explicitly asking
    // for `student_name` back.
    //
    // Sending it is fine: report-card processing is a legitimate purpose and
    // Anthropic is a subprocessor under the DPA. What matters is that the
    // privacy documentation says so plainly. The substitution is kept only as
    // best-effort noise reduction — do not describe it as anonymization.
    const bestEffortRedacted = rawText.replace(
      /student(?:\s+name)?:\s*\S+/gi,
      "student: [REDACTED]"
    );

    // Call Claude API
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: bestEffortRedacted }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json(
        { error: "Unexpected response format from AI." },
        { status: 500 }
      );
    }

    // Parse JSON — strip markdown code fences if present
    let extractedData: ExtractedReportCard;
    try {
      const cleaned = content.text
        .replace(/^```(?:json)?\n?/m, "")
        .replace(/\n?```$/m, "")
        .trim();
      extractedData = JSON.parse(cleaned);
    } catch {
      console.error("JSON parse error. Raw response:", content.text);
      return NextResponse.json(
        { error: "AI returned invalid data. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ extractedData });
  } catch (err) {
    console.error("Extract report card error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
