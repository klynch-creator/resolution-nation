import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import type { CurriculumExtract } from "@/types";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are analyzing a K-12 curriculum document (a scope-and-sequence, pacing guide, or unit plan). Extract the teaching units in order, with any standards and the specific skills each unit builds.

Return ONLY valid JSON in exactly this format, no other text:
{
  "units": [
    {
      "name": "string (unit/module title)",
      "sequence_order": 1,
      "standards": ["string (e.g. RI.3.2)"],
      "skills": ["string (specific skill taught, e.g. 'identify main idea')"]
    }
  ],
  "notes": "string summary of the curriculum, or null"
}

Rules:
- sequence_order is 1-based, in the order units should be taught.
- standards and skills are arrays of short strings; use [] if none are stated.
- Infer reasonable skills from unit descriptions when not explicitly listed.
- Do not invent units that aren't in the document.`;

export async function POST(request: Request) {
  const rl = checkRateLimit(request, {
    routeKey: "curriculum-extract",
    limit: 10,
    windowSec: 60,
  });
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const { fileUrl, fileType } = await request.json();
    if (!fileUrl || !fileType) {
      return NextResponse.json(
        { error: "Missing required fields: fileUrl, fileType." },
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

    // Only teachers manage curricula.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "teacher") {
      return NextResponse.json(
        { error: "Only teachers can upload curricula." },
        { status: 403 }
      );
    }

    const { data: blob, error: downloadError } = await supabase.storage
      .from("curricula")
      .download(fileUrl);
    if (downloadError || !blob) {
      return NextResponse.json(
        { error: "Could not download file from storage." },
        { status: 500 }
      );
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    let rawText = "";

    if (fileType === "pdf") {
      try {
        const pdfParse = (await import("pdf-parse")).default;
        rawText = (await pdfParse(buffer)).text;
      } catch (pdfErr) {
        console.error("PDF parse error:", pdfErr);
        return NextResponse.json(
          { error: "Could not read PDF. Make sure the file is not encrypted." },
          { status: 422 }
        );
      }
    } else if (fileType === "csv" || fileType === "txt") {
      rawText = buffer.toString("utf-8");
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Upload a PDF, CSV, or TXT file." },
        { status: 400 }
      );
    }

    if (!rawText.trim()) {
      return NextResponse.json(
        { error: "No text could be extracted from the file." },
        { status: 422 }
      );
    }

    // Cap the text sent to the model to control cost/latency.
    const clipped = rawText.slice(0, 24000);

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: clipped }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json(
        { error: "Unexpected response format from AI." },
        { status: 500 }
      );
    }

    let extracted: CurriculumExtract;
    try {
      const cleaned = content.text
        .replace(/^```(?:json)?\n?/m, "")
        .replace(/\n?```$/m, "")
        .trim();
      extracted = JSON.parse(cleaned);
    } catch {
      console.error("JSON parse error. Raw response:", content.text);
      return NextResponse.json(
        { error: "AI returned invalid data. Please try again." },
        { status: 500 }
      );
    }

    if (!extracted.units || !Array.isArray(extracted.units)) {
      return NextResponse.json(
        { error: "AI returned unexpected structure. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ extracted });
  } catch (err) {
    console.error("Curriculum extract error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
