import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// POST /api/send-parent-message — teacher sends a message to a parent
export async function POST(request: Request) {
  try {
    const { parentId, studentId, title, bodyEnglish, bodySpanish } =
      await request.json();

    if (!parentId || !studentId || !title || !bodyEnglish) {
      return NextResponse.json(
        {
          error:
            "parentId, studentId, title, and bodyEnglish are required.",
        },
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

    // Verify caller is a teacher
    const { data: teacherProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!teacherProfile || teacherProfile.role !== "teacher") {
      return NextResponse.json(
        { error: "Only teachers can send parent messages." },
        { status: 403 }
      );
    }

    // Verify the parent has an approved link to this student (sanity check)
    const { data: link } = await supabase
      .from("parent_student_links")
      .select("id")
      .eq("parent_id", parentId)
      .eq("student_id", studentId)
      .eq("status", "approved")
      .single();

    if (!link) {
      return NextResponse.json(
        {
          error:
            "No approved parent-student link found. Approve the link first.",
        },
        { status: 400 }
      );
    }

    // Insert the message
    const { data: message, error: insertError } = await supabase
      .from("parent_messages")
      .insert({
        teacher_id: user.id,
        parent_id: parentId,
        student_id: studentId,
        title: title.trim(),
        body_english: bodyEnglish.trim(),
        body_spanish: bodySpanish?.trim() ?? null,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message });
  } catch (err) {
    console.error("send-parent-message error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
