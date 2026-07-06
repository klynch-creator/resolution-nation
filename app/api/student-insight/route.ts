import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const rl = checkRateLimit(request, { routeKey: "student-insight", limit: 10, windowSec: 60 });
  if (!rl.ok) return rateLimitResponse(rl);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { studentStats } = await request.json();
  if (!studentStats) {
    return NextResponse.json({ error: "Missing studentStats" }, { status: 400 });
  }

  const anthropic = new Anthropic();
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Based on this student's learning data, write 2-3 sentences summarizing their progress and suggesting what the teacher should focus on next. Be specific and encouraging. Data: ${JSON.stringify(studentStats)}`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";
  return NextResponse.json({ insight: text });
}
