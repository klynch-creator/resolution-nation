import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedReportCard, GoalPriority, GoalSubject } from "@/types";

const SYSTEM_PROMPT = `You are an expert K-12 educator creating personalized learning goals for a student. Based on the student's report card data, generate specific, achievable learning goals written in student-friendly "I can..." language. Each goal should be something a child can understand and feel motivated by.

Return ONLY valid JSON in exactly this format, no other text:
{
  "goals": [
    {
      "friendly_text": "I can find the main idea and tell the key details from what I read",
      "standard_code": "RI.3.2",
      "subject": "ELA",
      "priority": "high",
      "source": "Reading Informational: Score 2/4"
    }
  ]
}

Priority rules:
- "critical" = score is 1/4, F, below 60%, or "Beginning" level
- "high" = score is 2/4, D, 60-69%, or "Approaching" level
- "medium" = score is 3/4, C, 70-79%, or "Meeting" level
- Only generate goals for areas where the student scored 3/4 or below, or C or below
- Generate 3-8 goals maximum, focusing on the most important needs first
- Make the friendly_text inspiring and specific, not generic
- Use real Common Core or state standard codes when possible
- Subject must be one of: ELA, Math, Science, Social Studies, Writing, Other`;

interface GeneratedGoal {
  friendly_text: string;
  standard_code: string | null;
  subject: GoalSubject;
  priority: GoalPriority;
  source: string;
}

export async function POST(request: Request) {
  try {
    const { uploadId, studentId, studentGrade } = await request.json();

    if (!uploadId || !studentId) {
      return NextResponse.json(
        { error: "Missing required fields: uploadId, studentId." },
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

    // Fetch the confirmed upload record
    const { data: upload, error: uploadError } = await supabase
      .from("student_data_uploads")
      .select("extracted_data, status")
      .eq("id", uploadId)
      .eq("student_id", studentId)
      .single();

    if (uploadError || !upload) {
      return NextResponse.json(
        { error: "Upload record not found." },
        { status: 404 }
      );
    }

    if (upload.status !== "confirmed") {
      return NextResponse.json(
        { error: "Upload must be confirmed before generating goals." },
        { status: 400 }
      );
    }

    const extractedData = upload.extracted_data as ExtractedReportCard;

    if (!extractedData || !extractedData.subjects?.length) {
      return NextResponse.json(
        { error: "No extracted data found for this upload." },
        { status: 400 }
      );
    }

    const grade = studentGrade ?? extractedData.grade_level ?? "unknown";

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    const userMessage = `Student grade level: ${grade}
Report card data: ${JSON.stringify(extractedData)}

Generate personalized learning goals for this student. Do not include the student's name in your response.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json(
        { error: "Unexpected response format from AI." },
        { status: 500 }
      );
    }

    let goals: GeneratedGoal[];
    try {
      const cleaned = content.text
        .replace(/^```(?:json)?\n?/m, "")
        .replace(/\n?```$/m, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      goals = parsed.goals;
    } catch {
      console.error("JSON parse error. Raw response:", content.text);
      return NextResponse.json(
        { error: "Goal generation failed — try again." },
        { status: 500 }
      );
    }

    if (!Array.isArray(goals) || goals.length === 0) {
      return NextResponse.json(
        { error: "No goals were generated. Try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ goals });
  } catch (err) {
    console.error("Generate goals error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
